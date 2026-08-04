"""
chat/guide.py
────────────────────────────────────────────────────────────────────────
안내자의 말.

★ 지금은 LLM 을 쓰지 않는다.
  구절의 묵상 문장과 짧은 되물음을 조합해 답한다. LLM 이 붙으면
  reply() 안쪽만 바뀌고, 호출부(chat/views.py)는 그대로다.
  seam 을 여기 한 곳으로 모아 두는 것이 이 파일의 목적이다.

★ 톤 원칙 (프로젝트 공통)
  - 신적 권위를 대신 선포하지 않는다. 안내와 초대의 어조를 쓴다.
  - 의료·법률·위기 상황의 전문 조언을 하지 않는다.
  - 단정하지 않고 되물어 사용자가 스스로 말하게 한다.
"""

from __future__ import annotations

from scripture.intents import match_intent, theme_labels
from scripture.models import Verse

#: 주제를 알아들었을 때의 되물음. 조언이 아니라 초대다.
_PROMPTS = {
    "anxiety": "그 걱정이 가장 크게 느껴지는 순간은 언제인가요.",
    "grief": "지금 가장 자주 떠오르는 장면은 무엇인가요.",
    "loneliness": "요즘 마음을 놓고 이야기할 수 있는 자리가 있었나요.",
    "relationship": "그 사람에게 사실은 어떤 말을 듣고 싶으셨나요.",
    "career": "지금 가장 마음이 기우는 쪽은 어느 쪽인가요.",
    "fear": "그 일이 실제로 일어난다면 무엇이 가장 걱정되나요.",
    "forgiveness": "용서하고 싶은 마음과 그러기 어려운 마음, 어느 쪽이 더 크신가요.",
    "guilt": "그때의 자신에게 한마디 건넬 수 있다면 무엇이라 하시겠어요.",
    "hope": "작게라도 기다려지는 것이 하나 있다면 무엇인가요.",
    "gratitude": "오늘 그냥 지나쳤지만 다행이었던 순간이 있었나요.",
    "recovery": "지금 가장 쉬고 싶은 곳은 어디인가요.",
    "purpose": "요즘 마음이 자꾸 머무는 질문은 무엇인가요.",
}

_FALLBACK_PROMPT = "조금 더 이야기해 주시겠어요. 어떤 부분이 가장 마음에 걸리시나요."


def opening_text(verse: Verse | None, question: str) -> str:
    """대화의 첫 마디."""
    if verse is not None:
        reference = f"{verse.book_name} {verse.chapter}:{verse.verse}"
        meditation = verse.meditation or "이 구절이 어떤 대목에서 마음에 걸리셨나요."
        return f"{reference}에서 이어서 이야기해 볼게요. {meditation}"

    if question.strip():
        return f'"{question.strip()}" 라고 하셨죠. 그 이야기부터 천천히 들어 볼게요.'

    return "편하게 시작하셔도 됩니다. 요즘 마음에 남아 있는 이야기가 있을까요."


def reply(text: str, verse: Verse | None) -> tuple[str, Verse | None]:
    """
    사용자 발화 → 안내자 응답.

    반환값의 두 번째는 그 답변이 근거로 삼은 구절이다. 없으면 None 이고,
    화면은 출처 표기를 생략한다.
    """
    intent = match_intent(text)
    prompt = _PROMPTS.get(intent, _FALLBACK_PROMPT)

    if intent in ("fallback", "crisis"):
        # 위기 신호는 화면이 별도 UI 로 다룬다. 여기서는 말을 보태지 않는다.
        return _FALLBACK_PROMPT, verse

    label = theme_labels().get(intent, "")
    lead = f"{label}에 대한 이야기로 들었습니다. " if label else ""
    return f"{lead}{prompt}", verse
