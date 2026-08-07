"""
이번 답변이 무엇을 해야 하는지 모델에게 먼저 물어본다.

★ 왜 이 파일이 생겼는가
  그전까지 규칙은 전부 '몇 번째 턴인가' 로 인덱싱돼 있었다.
  2턴엔 인물, 3턴엔 질문, 4턴엔 구절. 사용자가 무슨 말을 했는지는
  정규식 몇 개로만 봤다.

  그래서 "고마워" 한마디에 아브라함과 구절과 새 질문이 쏟아졌다.
  턴 번호는 짝수였고, 규칙은 정확히 시킨 대로 했다.

  Claude 나 GPT 가 자연스러운 이유는 매 턴 "지금 이 사람에게 뭐가
  필요한가" 를 스스로 판단하기 때문이다. 우리는 그 판단을 모델에게서
  빼앗아 턴 카운터에 맡겼다. 이 파일은 그 판단을 되돌려 준다.

★ 답변은 여기서 쓰지 않는다
  이 호출은 계획만 만든다. 짧은 JSON 하나다. 답변은 지금처럼
  페르소나 체인이 쓴다. 둘을 한 호출로 합치면 계획이 답변 문체에
  섞여 나오고, 계획을 검사할 수도 없다.

★ 실패하면 규칙으로 돌아간다
  모델이 JSON 을 깨뜨리거나 응답이 늦으면 None 을 돌려준다.
  부르는 쪽은 예전 턴 규칙으로 돈다 — 그 규칙은 이미 검증돼 있다.
  플래너는 더 좋아지는 장치이지, 없으면 안 되는 장치가 아니다.

★ 안전은 여기에 맡기지 않는다
  state 에 "위기" 가 있지만, 위기 판정을 이 호출 하나에 의존하지
  않는다. context.py 의 정규식이 먼저 걸러 내고, 실제 응답은
  공통 규범의 [안전] 층이 한다. 여기서는 재료를 얹지 않게 하는
  용도로만 쓴다.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from django.conf import settings

logger = logging.getLogger(__name__)

#: 계획용 모델. 답변 모델과 따로 둔다.
#:
#: ★ 여기에 좋은 모델을 쓸 이유가 없다.
#:   분류와 한 줄 요약이다. 답변 모델만 좋은 것으로 바꾸면 된다.
DEFAULT_PLANNER_MODEL = "gpt-4o-mini"

#: 계획은 짧다. 길어지면 그건 답변을 쓰고 있다는 뜻이다.
MAX_TOKENS = 220

#: 이 시간 안에 안 오면 포기하고 규칙으로 간다.
#:
#: ★ 사용자에게는 '답이 안 나오는 시간' 이다.
#:   계획 하나 받자고 상담 첫 글자를 3초씩 늦출 수 없다.
TIMEOUT_SEC = 6.0

#: 계획에 넣을 지난 대화 수. 흐름만 보면 되므로 짧게.
HISTORY_FOR_PLAN = 6

_planner = None


SYSTEM = """\
당신은 상담 대화의 '진행 판단' 만 합니다. 답변은 쓰지 않습니다.
마지막 사용자 발화와 직전 흐름을 읽고, 이번 답변이 무엇을 해야 하는지
JSON 하나로만 답하십시오.

필드
  state: "감정" | "요청" | "마무리" | "질문" | "위기" | "잡담"
    감정   — 힘든 마음을 털어놓는 중
    요청   — 무엇을 하고 싶다, 또는 어떻게 하냐고 묻는 중
    마무리 — 고맙다, 알겠다, 인사. 더 얹을 것이 없다
    질문   — 성경이나 사실을 묻는 중
    위기   — 자해, 자살, 학대, 폭력의 신호
    잡담   — 상담과 무관한 요청
  needs_person: 성경 인물 이야기를 꺼낼 자리인가
  needs_verse: 성경 구절을 꺼낼 자리인가
  ask_question: 이번 답변을 질문으로 끝내는 것이 자연스러운가
  echo: 사용자가 방금 쓴 말 중 그대로 되받을 단어 하나. 없으면 ""
  focus: 이번 답변이 해야 할 일. 한 문장. 사용자가 실제로 한 말을 근거로.

판단 기준
- 같은 재료를 연달아 쓰지 않습니다.
  직전 답변이 인물을 꺼냈으면 이번에는 needs_person 을 false 로 두십시오.
  구절도 같습니다. 매번 꺼내면 인물 명함첩이 됩니다.
- 물음표로 끝나는 답이 이어지면 상담이 아니라 설문이 됩니다.
  직전 답변이 질문으로 끝났으면 ask_question 을 false 쪽으로 두십시오.
- "마무리" 나 "잡담" 이면 needs_person 과 needs_verse 는 모두 false 입니다.
  끝내려는 사람을 재료로 붙잡지 않습니다.
- "요청" 이면 되묻지 말고 함께 한 걸음을 놓아야 합니다.
  ask_question 은 대개 false 입니다.
- "위기" 면 모든 필드를 false 로 두십시오. 지금은 사람으로 응답할 자리입니다.
- 첫 답변(직전 대화가 없을 때)은 듣는 자리입니다.
  needs_person 과 needs_verse 를 false 로 두십시오.

JSON 만 출력하십시오. 설명을 붙이지 마십시오."""


@dataclass
class Plan:
    """이번 답변의 계획."""

    state: str = "감정"
    needs_person: bool = False
    needs_verse: bool = False
    ask_question: bool = True
    #: 사용자가 쓴 말 중 그대로 되받을 것
    echo: str = ""
    #: 이번 답변이 해야 할 일 한 줄
    focus: str = ""

    @property
    def closing(self) -> bool:
        return self.state in ("마무리", "잡담")

    @property
    def asked_for_action(self) -> bool:
        return self.state == "요청"

    @property
    def crisis(self) -> bool:
        return self.state == "위기"


def enabled() -> bool:
    """플래너를 쓸 수 있는가."""
    if not getattr(settings, "PLANNER_ENABLED", True):
        return False
    return bool(getattr(settings, "OPENAI_API_KEY", ""))


def _get_planner():
    """
    계획용 모델. 답변용과 따로 만든다.

    ★ 온도 0 이다.
      여기서 창의성은 손해다. 같은 상황이면 같은 계획이 나와야
      디버깅이 된다.
    """
    global _planner
    if _planner is None:
        from langchain_openai import ChatOpenAI

        _planner = ChatOpenAI(
            model=getattr(settings, "PLANNER_MODEL", DEFAULT_PLANNER_MODEL),
            temperature=0,
            max_tokens=MAX_TOKENS,
            timeout=TIMEOUT_SEC,
            max_retries=0,  # 늦느니 규칙으로 가는 편이 낫다
            api_key=settings.OPENAI_API_KEY,
        ).bind(response_format={"type": "json_object"})
    return _planner


def _transcript(history: list[dict]) -> str:
    """지난 대화를 계획용으로 짧게 옮긴다."""
    lines = []
    for m in history[-HISTORY_FOR_PLAN:]:
        content = (m.get("content") or "").strip()
        if not content:
            continue
        who = "사용자" if m.get("role") == "user" else "상담자"
        if len(content) > 200:
            content = content[:200].rstrip() + "…"
        lines.append(f"{who}: {content}")
    return "\n".join(lines)


def _as_bool(value) -> bool:
    """모델이 true/"true"/1 을 섞어 보낸다."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("true", "yes", "1", "y")
    return bool(value)


def plan(message: str, history: list[dict] | None = None) -> Plan | None:
    """
    이번 답변의 계획을 만든다. 실패하면 None.

    :return: Plan 이면 그 계획을 따르고, None 이면 부르는 쪽이 턴 규칙으로 돈다.
    """
    if not enabled() or not (message or "").strip():
        return None

    past = _transcript(history or [])
    user_block = (
        (f"[지난 대화]\n{past}\n\n" if past else "[지난 대화]\n(없음 — 첫 답변입니다)\n\n")
        + f"[이번 발화]\n{message.strip()}"
    )

    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        result = _get_planner().invoke(
            [SystemMessage(content=SYSTEM), HumanMessage(content=user_block)]
        )
        data = json.loads(getattr(result, "content", "") or "{}")
    except Exception as exc:
        # ★ 여기서 예외가 새면 상담 자체가 죽는다. 계획 하나 때문에.
        logger.warning("계획 생성 실패 — 턴 규칙으로 진행합니다: %s", exc)
        return None

    if not isinstance(data, dict):
        logger.warning("계획이 객체가 아닙니다 — 턴 규칙으로 진행합니다: %r", data)
        return None

    state = str(data.get("state") or "감정").strip()
    if state not in ("감정", "요청", "마무리", "질문", "위기", "잡담"):
        state = "감정"

    p = Plan(
        state=state,
        needs_person=_as_bool(data.get("needs_person")),
        needs_verse=_as_bool(data.get("needs_verse")),
        ask_question=_as_bool(data.get("ask_question")),
        echo=str(data.get("echo") or "").strip()[:60],
        focus=str(data.get("focus") or "").strip()[:200],
    )

    # ★ 모델이 뭐라 하든 여기서 한 번 더 조인다.
    #   "마무리인데 인물을 꺼내라" 같은 계획이 실제로 나올 수 있다.
    #   판단은 모델에게 맡기되, 우리가 아는 불변식은 코드가 지킨다.
    if p.closing or p.crisis:
        p.needs_person = False
        p.needs_verse = False
    if p.crisis:
        p.ask_question = False

    return p
