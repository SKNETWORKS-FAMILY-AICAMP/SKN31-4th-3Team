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


#: 질문으로 끝내도 되는 주기. 1이면 매번, 2면 한 턴 걸러 한 번.
#:
#: ★ 매 답변이 물음표로 끝나면 상담이 아니라 설문이 된다.
#:   실제로 이렇게 나왔다 — "어떤 감정이 드시나요" → "어떻게 다루고
#:   계신가요" → "무엇이 가장 힘드신가요". 문장은 다 맞는데
#:   사용자가 계속 답안지를 채우는 자리에 놓인다.
#:
#: ★ "가끔만 물으십시오" 는 지시가 아니다.
#:   빈도는 모델이 스스로 세야 하는 것이고, 세는 일은 잘 못한다.
#:   이번 턴에 물어도 되는지 아닌지를 서버가 정해서 알려 준다.
ASK_EVERY = 2


def _may_ask(turn: int) -> bool:
    """이번 답변을 질문으로 끝내도 되는가."""
    # 첫 답변은 묻는다 — 아직 아는 것이 없다.
    return turn <= 1 or turn % ASK_EVERY == 1


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


def directive_for(turn: int, *, has_people: bool, persona_id: str = "") -> str:
    """
    이번 답변에서 재료를 어떻게 쓸지.

    ★ 시스템 프롬프트가 아니라 사용자 발화에 붙인다.
      처음에는 시스템 프롬프트 안에 넣었다. 그런데 히스토리가 10개쯤
      쌓이면 그 지시는 대화 저 앞쪽에 묻히고, 모델은 방금 들은 말에
      반응한다. 지시를 마지막 턴 가까이 두는 것만으로 지켜지는 비율이
      크게 달라진다.

    ★ 조건문을 쓰지 않는다.
      "~라면 ~하십시오" 는 모델이 조건을 스스로 판정해야 하고, 판정에
      실패하면 조용히 아무것도 안 한다.

    ★ 인물이 없어도 지시는 나간다.
      예전에는 그래프에 인물이 없으면 빈 문자열이었다. 그런데 인물이
      없는 턴이 대화의 절반이고, 그 절반이 전부 "공감 한 줄 + 일반론 +
      질문" 으로 나왔다. 말투와 질문 빈도는 그래프와 무관한 규칙이다.
    """
    blocks = []

    if has_people:
        if turn < NAME_FROM_TURN:
            blocks.append("아직 이름을 꺼내지 마십시오. 지금은 듣는 자리입니다.")
        else:
            blocks.append(
                "위 [이 감정을 지나간 사람들] 중 한 사람의 이름을 부르십시오.\n"
                "이름만 얹지 말고, 그 사람이 무엇을 지났는지 한 문장으로 말한 뒤\n"
                "사용자의 자리로 돌아오십시오.\n"
                "한 번에 한 사람입니다. 위에 없는 사실은 지어내지 마십시오."
            )

    if turn >= VERSE_FROM_TURN:
        blocks.append(
            "구절을 한 줄 꺼내십시오. 해설하지 마십시오.\n"
            "설명하는 순간 상담이 성경 공부가 됩니다.\n"
            "그 사람의 상황 옆에 조용히 놓아 두기만 하십시오.\n"
            "위 [지금 대화의 바탕]에 구절이 있으면 그것을 씁니다.\n"
            "장·절이 확실하지 않으면 장·절을 붙이지 말고 내용만 말하십시오."
        )

    if _may_ask(turn):
        blocks.append("마지막에 물어도 됩니다. 하나만, 짧게.")
    else:
        blocks.append(
            "이번 답변은 질문 없이 끝내십시오. 물음표로 끝내지 마십시오.\n"
            "받아 주고 옆에 머무는 것으로 충분합니다."
        )

    blocks.append(
        "사용자가 방금 쓴 말 중 하나를 그대로 집어 받으십시오.\n"
        "'힘든 상황', '그런 마음' 처럼 바꿔 말하지 마십시오.\n"
        "앞선 답변과 같은 모양의 문장으로 시작하지 마십시오."
    )

    out = "[이번 답변 지침]\n" + "\n\n".join(blocks)

    voice = voice_reminder(persona_id)
    # ★ 말투를 맨 뒤에 둔다.
    #   무엇을 할지(지침)를 먼저 정하고, 어떤 결로 말할지를 마지막에 둔다.
    #   모델이 마지막으로 읽은 것이 문장의 온도를 정한다.
    return f"{out}\n\n{voice}" if voice else out


def for_session(session, question: str = "", turn: int = 1) -> str | None:
    """
    세션 하나의 바탕 문맥을 만든다.

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
    text = question or getattr(session, "seed_question", "") or ""
    parts: list[str] = []

    # ★ 씨앗 구절은 초반에만 남긴다 (SEED_VERSE_TURNS 주석 참조).
    verse = _resolve_verse(session) if turn <= SEED_VERSE_TURNS else None
    if verse is not None:
        ref = f"{verse.book_code} {verse.chapter}:{verse.verse}"
        body = (verse.summary or "").strip()
        if len(body) > CONTENT_LIMIT:
            body = body[:CONTENT_LIMIT].rstrip() + "…"
        parts.append(f"{ref}\n{body}" if body else ref)

        graph_block = _graph_block(verse, text)
        if graph_block:
            parts.append(graph_block)

    witnesses = _witnesses_block(text)
    if witnesses:
        parts.append(witnesses)

    # ★ 지시는 여기 넣지 않는다.
    #   directive_for() 가 따로 만들고, 뷰가 그것을 사용자 발화 쪽에
    #   붙인다. 시스템 프롬프트에 두면 히스토리에 묻힌다.
    return "\n\n".join(parts) if parts else None


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
