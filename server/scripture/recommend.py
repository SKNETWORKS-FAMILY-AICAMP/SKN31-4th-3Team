"""
scripture/recommend.py
────────────────────────────────────────────────────────────────────────
주제 → 공감·묵상·추천 구절.

지금은 미리 써 둔 variant 를 고른다. LLM 은 나중에 이 함수 안쪽만
바꿔 끼우면 되고, 바깥 계약(AskResult)은 그대로 둔다.

★ attempt 를 그대로 쓴다.
  "다른 구절 보기"를 누를 때마다 1씩 오르며, variant 를 순환시킨다.
  난수를 쓰면 같은 화면을 새로고침할 때 결과가 달라져 공유가 깨진다.

★ 톤 원칙은 데이터에 있다.
  신적 권위를 대신 선포하지 않고, 의료·법률·위기 전문 조언을 하지 않는다.
  variant 문안을 고칠 때 이 원칙을 함께 본다.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .intents import FALLBACK, match_intent

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@lru_cache(maxsize=1)
def _variants() -> dict[str, list[dict]]:
    with (FIXTURES / "answers.json").open(encoding="utf-8") as fp:
        return json.load(fp)


def recommend(question: str, attempt: int = 0) -> dict:
    """
    질문 하나에 대한 응답.

    반환 형태는 프런트의 AskResult 와 1:1 이다.
    (frontend/src/data/types.ts 참조)
    """
    intent = match_intent(question)
    pool = _variants().get(intent) or _variants()[FALLBACK]
    variant = pool[attempt % len(pool)]

    return {
        "question": question,
        "intent": intent,
        "empathy": variant["empathy"],
        "reflection": variant["reflection"],
        "verse_ids": list(variant["verseIds"]),
        "follow_ups": list(variant["followUps"]),
    }
