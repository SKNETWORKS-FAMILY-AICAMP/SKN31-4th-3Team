"""
scripture/intents.py
────────────────────────────────────────────────────────────────────────
질문 → 주제 판정.

원본은 프런트의 data/intents.ts 이며, 같은 사전을 fixtures/intents.json
으로 뽑아 여기서 읽는다. 두 곳에 사전을 각각 두면 서버와 화면이 서로 다른
주제를 말하게 된다.

★ 위기 판정은 서버가 "추가"할 뿐 대체하지 않는다.
  프런트는 네트워크 요청 이전에 자체 판정을 먼저 한다. 서버가 죽거나
  연결이 끊겨도 안전 안내는 떠야 하기 때문이다. 여기 있는 판정은
  그 위에 한 겹 더 두는 것이다. (docs/mock-boundaries.md 6절)

★ LLM 이 붙으면 이 파일이 첫 교체 대상이다.
  match_intent() 의 시그니처만 지키면 내부를 임베딩 검색으로 바꿔도
  나머지 코드는 그대로다.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"

FALLBACK = "fallback"
CRISIS = "crisis"


@lru_cache(maxsize=1)
def _sources() -> dict:
    with (FIXTURES / "intents.json").open(encoding="utf-8") as fp:
        return json.load(fp)


def theme_labels() -> dict[str, str]:
    return _sources()["labels"]


def is_crisis(question: str) -> bool:
    """위기 신호가 섞여 있는가."""
    text = question.strip()
    return any(word in text for word in _sources()["crisis"])


def match_intent(question: str) -> str:
    """
    질문에서 주제를 고른다.

    부분 문자열 매칭이고, 여러 주제가 걸리면 더 많이 걸린 쪽을 고른다.
    동점이면 사전 순서(= 주제 정의 순서)가 이긴다 — 결과가 요청마다
    흔들리면 "다른 구절 보기"의 의미가 사라진다.
    """
    text = question.strip()
    if not text:
        return FALLBACK
    if is_crisis(text):
        return CRISIS

    best, best_hits = FALLBACK, 0
    for theme, words in _sources()["keywords"].items():
        hits = sum(1 for word in words if word in text)
        if hits > best_hits:
            best, best_hits = theme, hits
    return best
