"""
상담 프롬프트에 넣을 '이 대화의 바탕' 을 만든다.

★ 왜 뷰가 아니라 여기인가
  두 뷰(한 번에 받기 / 스트리밍)가 같은 것을 필요로 한다. 뷰마다
  따로 만들면 한쪽만 고치는 날이 오고, 그러면 "스트리밍일 때만
  답이 얕다" 는 재현하기 어려운 증상이 된다.

★ 그래프는 있으면 얹고 없으면 만다
  Neo4j 가 없거나 느리면 씨앗 구절만 들어간다. 프롬프트가 조금
  짧아질 뿐 대화는 그대로 이어진다.

★ 사실만 넣고 해석은 안 넣는다
  "베드로도 두려워했으니 괜찮습니다" 같은 문장을 여기서 만들면
  그건 그래프가 아니라 우리가 한 말이 된다. 인물·감정·회복이라는
  재료만 주고, 문장은 페르소나가 고르게 둔다.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

#: 프롬프트에 넣을 구절 본문의 최대 길이. 길면 답이 본문 해설로 샌다.
CONTENT_LIMIT = 200


#: 인물을 꺼내라고 지시하기 시작하는 답변 번호.
#:
#: ★ 첫 답변은 듣는 자리다.
#:   처음부터 "다윗도 그랬습니다" 로 시작하면 가르치는 사람이 된다.
#:   한 번은 사용자의 말을 받고, 그다음부터 이야기를 꺼낸다.
NAME_FROM_TURN = 2


#: 씨앗 구절을 프롬프트에 남겨 두는 턴 수.
#:
#: ★ 대화는 움직인다.
#:   구절에서 시작했더라도 세 번쯤 주고받으면 이야기는 다른 곳에 가 있다.
#:   실제로 "친구와 절교" 대화에 창세기 44:26(막내 아우 이야기)이 6턴째까지
#:   프롬프트 맨 위에 남아 있었다. 관계없는 재료가 위에 있으면 모델은
#:   재료 전체를 신뢰하지 않는다.
SEED_VERSE_TURNS = 3


#: 구절을 꺼내라고 지시하기 시작하는 답변 번호.
#:
#: ★ 첫 답변에 구절을 꺼내면 훈수가 된다.
#:   아직 무슨 일인지도 모르면서 답을 내미는 모양이다. 한 번 듣고 나서
#:   꺼낸 구절이라야 그 사람 이야기 옆에 놓인 것으로 읽힌다.
VERSE_FROM_TURN = 2


#: 재료(인물·구절)를 꺼내는 턴과 그냥 사람으로 받는 턴을 번갈아 둔다.
#:
#: ★ 왜 번갈아인가
#:   매 턴 재료를 꺼내라고 했더니 이렇게 나왔다.
#:     2턴 "다윗도 배신으로 슬퍼했습니다 … 라는 말이 떠오르네요"
#:     3턴 "룻은 회복을 위해 노력했습니다 … 라는 말이 떠오릅니다"
#:   인물 명함첩을 넘기는 것처럼 읽힌다. 사용자가 방금 한 말은
#:   어디에도 없다.
#:
#: ★ 빈도를 모델에게 세라고 하지 않는다.
#:   "가끔만" 은 지시가 아니다. 이번 턴에 꺼낼지 말지를 서버가 정한다.
#:
#: 홀수 턴 — 재료 없이 사용자의 말만 받는다. 물어도 된다.
#: 짝수 턴 — 인물과 구절을 얹는다. 질문 없이 끝낸다.
def _material_turn(turn: int) -> bool:
    """이번 답변에 인물·구절을 얹는가."""
    return turn >= NAME_FROM_TURN and turn % 2 == 0


def _may_ask(turn: int) -> bool:
    """
    이번 답변을 질문으로 끝내도 되는가.

    ★ 매 답변이 물음표로 끝나면 상담이 아니라 설문이 된다.
      "어떤 감정이 드시나요" → "어떻게 다루고 계신가요" →
      "그 마음이 어떤 길로 이어질 수 있을까요". 문장은 다 맞는데
      사용자는 계속 답안지를 채우는 자리에 놓인다.

    ★ 재료를 얹는 턴에는 묻지 않는다.
      인물과 구절을 꺼내 놓고 질문까지 붙이면 한 답변에 세 가지를
      욱여넣게 되고, 셋 다 얕아진다.
    """
    return not _material_turn(turn)


#: 사용자가 '무엇을 하고 싶다 / 어떻게 하냐' 고 물을 때 걸리는 말.
#:
#: ★ 이걸 왜 정규식으로 잡는가
#:   "친구와 다시 친해지고 싶어" 에 대고 "그 마음이 어떤 길로 이어질 수
#:   있을까요" 라고 되물었다. 사용자는 이미 원하는 것을 말했는데
#:   그걸 다시 감정으로 되돌린 것이다.
#:
#:   프롬프트에 "요청이면 방법을 주십시오" 라고 쓰면 모델이 매 턴
#:   판정해야 하고, 판정에 실패하면 조용히 늘 하던 대로 한다.
#:   판정은 서버가 한다 — 턴 세기와 같은 이유다.
_ACTION_PATTERNS = re.compile(
    # "-고 싶다" 는 활용이 넓다. '하고/되고/가고' 만 적으면
    # '친해지고 싶어' 가 안 걸린다 — 실제로 이것 때문에 놓쳤다.
    r"(고\s*싶"
    r"|어떻게\s*(해|하|할|하죠|하나요|해야)"
    r"|어떡|뭘\s*해|무엇을\s*해|뭐부터"
    r"|방법|조언|도와\s*주|알려\s*주"
    r"|해도\s*될까|괜찮을까|할\s*수\s*있을까)"
)

#: 위기 신호. 여기 걸리면 '한 걸음' 지침을 붙이지 않는다.
#:
#: ★ 안전이 먼저다.
#:   "사라지고 싶어" 도 문법적으로는 '-고 싶다' 다. 여기에 대고
#:   "오늘 할 수 있는 일 하나" 를 붙이면 안 된다. 이 지침은 마지막
#:   발화에 실려서 가장 강하게 작동하기 때문에, 시스템 프롬프트의
#:   안전 규칙과 부딪히게 두면 안 된다.
#:
#:   여기서는 지침을 '빼기만' 한다. 위기 응답 자체는 공통 규범의
#:   [안전] 층이 한다 — 판정을 두 곳에서 하지 않는다.
_CRISIS_PATTERNS = re.compile(
    r"(죽고\s*싶|죽어\s*버리|자살|자해"
    r"|사라지고\s*싶|없어지고\s*싶|살기\s*싫|살고\s*싶지\s*않)"
)


def wants_action(text: str) -> bool:
    """사용자가 감정이 아니라 '어떻게 할지' 를 말하고 있는가."""
    if not text:
        return False
    if _CRISIS_PATTERNS.search(text):
        return False
    return bool(_ACTION_PATTERNS.search(text))


#: 감사·수긍·인사처럼 대화를 닫거나 가볍게 받는 말.
#:
#: ★ 실제로 "고마워" 에 이런 답이 나왔다.
#:     "고마워요. 아브라함은 믿음으로 가족과의 관계를 지키기 위해
#:      많은 어려움을 겪었죠. … 지금 어떤 생각이 드시나요?"
#:   필요한 답은 "저도 고마웠습니다" 한 줄이다. 그런데 '고마워' 가
#:   주제 사전에서 gratitude 로 걸리고, 그래프가 감사 인물을 주고,
#:   재료 턴이라 전부 쏟았다.
#:
#: ★ 턴 번호로는 이걸 못 잡는다.
#:   사용자가 무슨 말을 했는지를 봐야 한다. 이 규칙이 턴 규칙을 이긴다.
#: 이 말로 시작하면 뒤에 무엇이 오든 닫는 말로 본다.
_CLOSING_PREFIX = re.compile(
    r"^(고마워|고맙|감사|땡큐|thx|thanks"
    r"|알겠|알았|그렇구나|그렇군|그러네|괜찮아|괜찮네"
    r"|잘\s*자|잘\s*있|안녕히|수고|이만|나중에)"
)

#: 이것만으로 이루어진 발화일 때만 닫는 말이다.
#:
#: ★ 앞의 것과 나눠 둔 이유
#:   '어' 를 접두어로 두면 '어떻게 해' 가 걸린다. 실제로 걸렸다.
#:   짧은 맞장구는 통째로 같아야 한다.
_CLOSING_EXACT = re.compile(
    r"^(응|어|네|넵|예|웅|그래|맞아|맞네|좋아|좋네|알써"
    r"|ㅇㅇ|ㅇㅋ|오케이|오키|ok|okay|ㅋ+|ㅎ+|ㅠ+|ㅜ+)[\s.!~ㅋㅎ]*$"
)

def is_closing(text: str) -> bool:
    """
    사용자가 짧게 받거나 대화를 닫고 있는가.

    ★ 길이로 판단하지 않는다.
      처음에는 "12자 이하면 가벼운 말" 로 짰다. 그랬더니
      "불안합니다", "요즘 너무 불안합니다" 가 걸렸다. 상담에서
      가장 중요한 말이 대개 가장 짧다. 짧은 것과 가벼운 것은
      다른 이야기다.

      그래서 아는 말만 잡는다. 놓치는 쪽이 무시하는 쪽보다 낫다.

    ★ 위기 신호는 짧아도 가벼운 말이 아니다.
      "네" 한 글자여도 앞이 위기였을 수 있다. 이번 발화에 위기어가
      있으면 무조건 제외한다 — 위기 응답 자체는 [안전] 층이 한다.

    ★ 요청이 닫는 말을 이긴다.
      "어떻게 해" 는 다섯 글자지만 닫는 말이 아니다.
    """
    t = (text or "").strip()
    if not t or _CRISIS_PATTERNS.search(t) or wants_action(t):
        return False
    return bool(_CLOSING_EXACT.match(t) or _CLOSING_PREFIX.match(t))


def voice_reminder(persona_id: str | None) -> str:
    """
    이번 답변을 누구의 결로 말하는지 한 번 더.

    ★ 시스템 프롬프트에 이미 있는데 왜 또 쓰는가
      말투는 규칙이 아니라 습관이다. 대화가 열 번쯤 오가면 모델은
      맨 앞의 인물 묘사보다 방금 자기가 쓴 문장을 흉내 낸다. 그래서
      한 번 밋밋해지면 계속 밋밋하다 — 실제로 "그런 기분이 드는 것은
      자연스러운 일입니다" 가 세 턴 연속 나왔다.

      턴 규칙과 달리 말투는 두 벌이 들어가도 어긋나지 않는다.
      같은 이야기라서, 마지막에 다시 놓기만 하면 된다.
    """
    if not persona_id:
        return ""
    try:
        from llm_core.prompts import get_persona

        p = get_persona(persona_id)
        voice = (p.voice or "").strip()
        if not voice:
            return ""
        return f"[이 답변의 목소리 — {p.name}]\n{voice}"
    except Exception as exc:
        logger.warning("페르소나 말투를 못 읽었습니다 — 없이 진행합니다: %s", exc)
        return ""


def directive_for(
    turn: int,
    *,
    has_people: bool = False,
    has_verse: bool = False,
    asked_for_action: bool = False,
    closing: bool = False,
    persona_id: str = "",
    plan=None,
) -> str:
    """
    이번 답변에서 재료를 어떻게 쓸지.

    ★ 시스템 프롬프트가 아니라 사용자 발화에 붙인다.
      처음에는 시스템 프롬프트 안에 넣었다. 그런데 히스토리가 10개쯤
      쌓이면 그 지시는 대화 저 앞쪽에 묻히고, 모델은 방금 들은 말에
      반응한다. 지시를 마지막 턴 가까이 두는 것만으로 지켜지는 비율이
      크게 달라진다.

    ★ 조건문을 쓰지 않는다.
      "~라면 ~하십시오" 는 모델이 조건을 스스로 판정해야 하고, 판정에
      실패하면 조용히 아무것도 안 한다. 조건은 서버가 판정해서
      결론만 보낸다.

    ★ 인물이 없어도 지시는 나간다.
      예전에는 그래프에 인물이 없으면 빈 문자열이었다. 그런데 인물이
      없는 턴이 대화의 절반이고, 그 절반이 전부 "공감 한 줄 + 일반론 +
      질문" 으로 나왔다. 말투와 질문 빈도는 그래프와 무관한 규칙이다.

    :param has_people: 위 문맥에 인물 블록이 실렸는가.
    :param has_verse: 위 문맥에 구절이 실렸는가.
        ★ 없는데 꺼내라고 하면 모델은 기억에서 지어낸다.
          실제로 "친구와 다시 친해지고 싶어" 에 "'내가 네게 무엇을
          해 주리오?' 라는 말이 떠오릅니다" 가 나왔다. 상황과도
          안 맞고 출처도 불분명한 문장이다.
    :param asked_for_action: 사용자가 '어떻게 할지' 를 물었는가.
    """
    # ★ 계획이 있으면 계획이 이긴다.
    #   턴 규칙은 몇 번째인지만 보고, 계획은 방금 무슨 말을 했는지를 본다.
    if plan is not None:
        closing = plan.closing
        asked_for_action = plan.asked_for_action

    # ── 짧게 받은 말에는 짧게 받는다. 다른 규칙을 다 이긴다 ──
    #
    # ★ "고마워" 에 필요한 답은 "저도 고마웠습니다" 한 줄이다.
    #   여기에 인물과 구절과 질문을 얹으면, 끝내려는 사람을 붙잡는 꼴이
    #   된다. 상담사는 그러지 않는다.
    if closing:
        out = (
            "[이번 답변 지침]\n"
            "사용자가 짧게 받았습니다. 인사이거나 마무리입니다.\n"
            "한두 문장으로 받고 끝내십시오.\n\n"
            "인물도 구절도 꺼내지 마십시오. 새 질문으로 대화를 늘리지 마십시오.\n"
            "붙잡지 말고, 언제든 다시 와도 된다는 것만 알려 주면 됩니다."
        )
        voice = voice_reminder(persona_id)
        return f"{out}\n\n{voice}" if voice else out

    blocks = []
    # ★ 계획이 있으면 재료 여부는 이미 위(materials)에서 걸러졌다.
    #   실려 있다는 것 자체가 "쓰라" 는 뜻이다.
    material = True if plan is not None else _material_turn(turn)

    # ── 계획이 짚어 준 것을 맨 앞에 둔다 ──
    if plan is not None and plan.focus:
        blocks.append(f"이번 답변이 할 일: {plan.focus}")

    # ── 사용자가 원하는 것을 말했다면, 그것이 이번 답변의 중심이다 ──
    if asked_for_action:
        blocks.append(
            "사용자는 지금 원하는 것을 말했습니다. 감정으로 되돌리지 마십시오.\n"
            "'그 마음이 어떤 길로 이어질까요' 처럼 되묻는 것은 회피입니다.\n"
            "함께 한 걸음을 놓으십시오 — 오늘, 혼자서, 할 수 있는 일 하나.\n"
            "여러 개를 늘어놓지 말고 하나만. 목록으로 만들지 마십시오.\n"
            "잘 안 될 수도 있다는 것까지 같이 말해 주면 정직한 조언이 됩니다."
        )

    if has_people and material:
        blocks.append(
            "위 [이 감정을 지나간 사람들] 중 한 사람의 이름을 부르십시오.\n"
            "'충성', '회복' 같은 말은 분류표의 말입니다. 그대로 읽지 마십시오.\n"
            "그 사람이 실제로 겪은 일을 한 문장으로 말하고,\n"
            "곧바로 사용자의 자리로 돌아오십시오.\n"
            "한 번에 한 사람입니다. 위에 없는 사실은 지어내지 마십시오."
        )
    elif has_people:
        blocks.append(
            "이번 답변에는 인물을 꺼내지 마십시오.\n"
            "지금은 사용자가 방금 한 말만 받는 자리입니다."
        )

    if has_verse and material:
        blocks.append(
            "위 [지금 대화의 바탕]에 있는 구절을 한 줄 꺼내십시오. 해설하지 마십시오.\n"
            "설명하는 순간 상담이 성경 공부가 됩니다.\n"
            "그 사람의 상황 옆에 조용히 놓아 두기만 하십시오."
        )
    else:
        blocks.append(
            "이번 답변에는 성경 구절을 인용하지 마십시오.\n"
            "기억나는 문장을 끌어오면 출처가 틀리거나 상황과 어긋납니다."
        )

    may_ask = plan.ask_question if plan is not None else _may_ask(turn)
    if may_ask and not asked_for_action:
        blocks.append("마지막에 물어도 됩니다. 하나만, 짧게.")
    else:
        blocks.append(
            "이번 답변은 질문 없이 끝내십시오. 물음표로 끝내지 마십시오.\n"
            "받아 주고 옆에 머무는 것으로 충분합니다."
        )

    # ★ 되받을 말을 계획이 집어 준다.
    #   "하나를 집어 받으십시오" 는 모델이 고르게 하는 지시다.
    #   이미 골라 놨으면 고르는 일을 시킬 이유가 없다.
    echo = (plan.echo if plan is not None else "").strip()
    if echo:
        blocks.append(
            f"사용자가 쓴 말 '{echo}' 를 그대로 한 번 받으십시오.\n"
            "바꿔 말하지 마십시오.\n"
            "'…라는 말이 떠오르네요' 처럼 앞서 쓴 도입구를 또 쓰지 마십시오."
        )
    else:
        blocks.append(
            "사용자가 방금 쓴 말 중 하나를 그대로 집어 받으십시오.\n"
            "'힘든 상황', '그런 마음' 처럼 바꿔 말하지 마십시오.\n"
            "'…라는 말이 떠오르네요' 처럼 앞서 쓴 도입구를 또 쓰지 마십시오."
        )

    out = "[이번 답변 지침]\n" + "\n\n".join(blocks)

    voice = voice_reminder(persona_id)
    # ★ 말투를 맨 뒤에 둔다.
    #   무엇을 할지(지침)를 먼저 정하고, 어떤 결로 말할지를 마지막에 둔다.
    #   모델이 마지막으로 읽은 것이 문장의 온도를 정한다.
    return f"{out}\n\n{voice}" if voice else out


@dataclass
class Materials:
    """
    이번 답변에 실어 보낼 재료와, 그 재료가 무엇인지.

    ★ 지침이 재료를 알아야 한다.
      예전에는 문맥과 지침을 따로 만들었다. 그래서 구절이 없는데도
      "구절을 한 줄 꺼내십시오" 가 나갔고, 모델은 기억에서 지어냈다.
      무엇이 실렸는지를 같이 들고 다니면 그 일이 구조적으로 안 생긴다.
    """

    text: str | None = None
    has_verse: bool = False
    has_people: bool = False
    #: 사용자가 짧게 받거나 대화를 닫고 있는가.
    closing: bool = False


def materials(session, question: str = "", turn: int = 1, plan=None) -> Materials:
    """
    문맥과 '무엇이 실렸는지' 를 한 번에 만든다.

    ★ 안 쓸 재료는 넣지 않는다. 금지문으로 막지 않는다.
      예전에는 인물 블록을 늘 프롬프트에 넣어 놓고 "이번에는 꺼내지
      마십시오" 라고 적었다. 눈앞에 놓인 재료를 금지문으로 못 이긴다 —
      "고마워" 한마디에 아브라함이 나온 이유가 이것이다.

      들어 있으면 쓴다. 그러니 쓸 때만 넣는다.

    ★ 무엇을 넣을지는 계획이 정한다. 계획이 없으면 턴 규칙이 정한다.
      계획(planner.Plan)은 사용자가 방금 무슨 말을 했는지를 보고
      정하고, 턴 규칙은 몇 번째인지만 보고 정한다. 전자가 낫지만
      후자는 절대 실패하지 않는다.

    ★ 검색도 그만큼 덜 돈다.
      쓰지 않을 턴에는 임베딩도 그래프도 조회하지 않는다.
    """
    text = question or getattr(session, "seed_question", "") or ""
    parts: list[str] = []

    # ★ 위기 신호가 보이면 계획이 뭐라 하든 아무것도 얹지 않는다.
    #   플래너는 좋아지는 장치이지 안전 장치가 아니다. 안전의 바닥은
    #   모델 호출이 아니라 코드가 지킨다.
    if _CRISIS_PATTERNS.search(question or ""):
        return Materials()

    closing = plan.closing if plan is not None else is_closing(question)
    m = Materials(closing=closing)

    # ★ "고마워", "응" 같은 턴에는 아무것도 얹지 않는다.
    #   턴 번호로는 이걸 못 잡는다. 무슨 말을 했는지를 봐야 한다.
    if m.closing or (plan is not None and plan.crisis):
        return m

    want_verse = plan.needs_verse if plan is not None else _material_turn(turn)
    want_person = plan.needs_person if plan is not None else _material_turn(turn)

    # ★ 씨앗 구절은 계획과 무관하게 초반에는 남긴다.
    #   구절을 눌러서 들어온 대화다. 그 구절은 인용거리가 아니라
    #   "왜 여기 앉아 있는가" 다. 인용할지 말지는 지침이 따로 정한다.
    #   (SEED_VERSE_TURNS 주석 참조)
    verse = _resolve_verse(session) if turn <= SEED_VERSE_TURNS else None
    if verse is not None:
        parts.append(_verse_line(verse))
        m.has_verse = True

        if want_person:
            graph_block = _graph_block(verse, text)
            if graph_block:
                parts.append(graph_block)

    if verse is None and want_verse:
        # ★ 씨앗이 만료됐으면 지금 하는 이야기로 다시 찾는다.
        #   이게 없으면 3턴 이후로는 프롬프트에 구절이 하나도 없고,
        #   그런데도 상담 앱이라 모델은 구절을 꺼내려 한다. 그 결과가
        #   출처 불명의 인용이다. 근거 있는 것을 쥐여 주는 편이 낫다.
        found = _search_verse(text)
        if found:
            parts.append(found)
            m.has_verse = True

    if want_person:
        witnesses = _witnesses_block(text)
        if witnesses:
            parts.append(witnesses)
            m.has_people = True

    # ★ 지시는 여기 넣지 않는다.
    #   directive_for() 가 따로 만들고, 뷰가 그것을 사용자 발화 쪽에
    #   붙인다. 시스템 프롬프트에 두면 히스토리에 묻힌다.
    m.text = "\n\n".join(parts) if parts else None
    return m


def _verse_line(verse) -> str:
    """구절 하나를 프롬프트 한 줄로. 본문이 길면 자른다."""
    ref = f"{verse.book_code} {verse.chapter}:{verse.verse}"
    body = (verse.summary or "").strip()
    if len(body) > CONTENT_LIMIT:
        body = body[:CONTENT_LIMIT].rstrip() + "…"
    return f"{ref}\n{body}" if body else ref


def _search_verse(question: str) -> str:
    """
    지금 하는 이야기에 맞는 구절 하나를 벡터 검색으로 찾는다.

    ★ 실패는 조용하다.
      임베딩 서버가 죽었거나 벡터가 안 실렸으면 구절 없이 간다.
      그러면 지침이 "이번에는 인용하지 마십시오" 로 바뀌므로,
      없는 구절을 지어내는 쪽으로는 절대 가지 않는다.
    """
    if not question:
        return ""
    try:
        from scripture import search

        if not search.ready():
            return ""
        hits = search.search(question, k=1)
        if not hits:
            return ""
        hit = hits[0]
        body = (hit.content or "").strip()
        if len(body) > CONTENT_LIMIT:
            body = body[:CONTENT_LIMIT].rstrip() + "…"
        return f"{hit.ref}\n{body}" if body else hit.ref
    except Exception as exc:
        logger.warning("구절 검색 실패 — 구절 없이 진행합니다: %s", exc)
        return ""


def for_session(session, question: str = "", turn: int = 1) -> str | None:
    """
    세션 하나의 바탕 문맥을 만든다. (문자열만 필요할 때)

    ★ 씨앗 구절이 없어도 빈손으로 돌아가지 않는다.
      처음에는 `seed_verse` 가 없으면 바로 None 을 돌려줬다. 그런데
      홈에서 질문만 던지고 들어온 대화에는 씨앗 구절이 없다 — 그게
      가장 흔한 경로다. 결과적으로 그래프가 대화에 한 번도 안 들어갔다.

      구절이 없으면 질문의 감정으로 인물을 찾는다. 그래프가 줄 수 있는
      것은 구절만이 아니다.

    ★ 몇 번째 답변인지는 서버가 세서 알려 준다.
      프롬프트에 "두 번째 답변부터 인물을 꺼내십시오" 라고 적어 봤지만
      지켜지지 않았다. 그건 모델더러 히스토리를 보고 턴을 세라는
      뜻인데, 세는 일은 모델이 잘 못하고 우리는 이미 알고 있다.
      세는 것은 여기서 하고, 모델에는 결론만 준다.

    :param session: ChatSession
    :param question: 사용자의 이번 발화. 감정 주제를 뽑는 데 쓴다.
    :param turn: 지금 만들 답변이 몇 번째인가 (1부터).
    :return: build_system_prompt(verse_context=...) 에 넣을 문자열. 없으면 None.
    """
    return materials(session, question, turn).text


def has_people(text: str) -> bool:
    """이번 턴에 꺼낼 인물이 있는가. 지시를 붙일지 판단하는 데 쓴다."""
    return bool(_witnesses_block(text))


class _Seed:
    """두 표의 구절을 프롬프트가 쓰는 한 가지 모양으로 맞춘다."""

    def __init__(self, book_code: str, chapter: int, verse: int, summary: str):
        self.book_code = book_code
        self.chapter = chapter
        self.verse = verse
        self.summary = summary


def _resolve_verse(session):
    """
    씨앗 구절을 찾는다. 큐레이션 표를 먼저, 없으면 성경전서를.

    ★ 두 표를 다 봐야 한다.
      화면의 별 2,652개 중 큐레이션 Verse 는 702개뿐이다. 나머지
      1,950개는 BibleVerse 다. 외래키만 보면 별 넷 중 셋이 문맥 없이
      대화를 시작한다 — 오류는 안 나고 답만 얕아진다.
    """
    verse = getattr(session, "seed_verse", None)
    if verse is not None:
        return verse

    ref = (getattr(session, "seed_verse_ref", "") or "").strip()
    if not ref:
        return None

    try:
        from scripture.models import BibleVerse

        row = BibleVerse.objects.filter(pk=ref).only(
            "book_code", "chapter", "verse", "content"
        ).first()
        if row is None:
            return None
        return _Seed(row.book_code, row.chapter, row.verse, row.content or "")
    except Exception as exc:
        logger.warning("씨앗 구절을 못 읽었습니다 — 없이 진행합니다: %s", exc)
        return None


def _witnesses_block(question: str) -> str:
    """질문의 감정을 지나간 인물들. 구절이 없는 대화의 유일한 그래프 재료다."""
    if not question:
        return ""
    try:
        from scripture import graph
        from scripture.intents import match_intent

        if not graph.enabled():
            return ""

        theme = match_intent(question)
        if not theme:
            return ""
        return graph.witnesses_prompt(graph.theme_witnesses(theme))
    except Exception as exc:
        logger.warning("증인 조회 실패 — 없이 진행합니다: %s", exc)
        return ""


def _graph_block(verse, question: str) -> str:
    """
    Neo4j 에서 이 구절의 인물·감정·회복을 읽어 온다.

    ★ 실패는 조용하다.
      그래프가 없어서 빈 문자열이 오는 것과, Aura 가 죽어서 빈 문자열이
      오는 것을 부르는 쪽이 구분할 이유가 없다. 둘 다 "얹을 게 없다" 다.
    """
    try:
        from scripture import graph
        from scripture.intents import match_intent

        if not graph.enabled():
            return ""

        verse_id = f"{verse.book_code}.{verse.chapter}.{verse.verse}"
        theme = match_intent(question) if question else ""
        context = graph.verse_context(verse_id, theme or "")
        return context.as_prompt()
    except Exception as exc:
        # 여기서 예외가 새면 상담 자체가 500 이 된다. 재료 하나 때문에.
        logger.warning("그래프 맥락을 못 읽었습니다 — 없이 진행합니다: %s", exc)
        return ""
