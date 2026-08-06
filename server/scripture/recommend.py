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

from llm_core.matching import recommend as recommend_galaxy

from .intents import FALLBACK, match_intent, theme_labels
from .search import search as search_verses

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@lru_cache(maxsize=1)
def _variants() -> dict[str, list[dict]]:
    with (FIXTURES / "answers.json").open(encoding="utf-8") as fp:
        return json.load(fp)


def recommend(question: str, attempt: int = 0, *, user_mbti: str | None = None) -> dict:
    """
    질문 하나에 대한 응답.

    반환 형태는 프런트의 AskResult 와 1:1 이다.
    (frontend/src/data/types.ts 참조)

    ★ 구절과 은하를 함께 고른다.
      예전에는 구절만 돌려줬다. 그러면 답변 화면에서 "어디로 가야 하는지"
      가 없어서, 사용자는 520개 별 앞에 그대로 남겨진다.

    ★ 은하는 인물이지 정답이 아니다.
      variant(공감·묵상)는 주제로만 고른다. 여기에 MBTI 를 섞으면 같은
      고민에 대한 위로가 성격에 따라 달라지는데, 그건 상담이 아니라
      성격 검사다. MBTI 는 "누가 들어 줄 것인가"에만 쓴다.

    :param user_mbti: 로그인한 사용자의 유형. 없으면 주제만으로 고른다.
    """
    intent = match_intent(question)
    pool = _variants().get(intent) or _variants()[FALLBACK]
    variant = pool[attempt % len(pool)]

    # 구절은 벡터 검색이 고른다.
    #
    # ★ 공감·묵상 문장은 그대로 둔다.
    #   그건 사람이 쓴 위로의 말이고, 12주제에 맞춰 다듬어 둔 것이다.
    #   검색이 바꿔야 하는 것은 "어떤 구절을 보여 줄까" 하나다.
    #
    # ★ 검색이 안 되면 예전 표로 물러선다.
    #   Postgres 가 아니거나, 임베딩이 비었거나, 모델이 안 떠 있는 경우다.
    #   추천이 덜 좋은 것과 화면이 비는 것은 다른 문제다.
    #
    # ★ attempt 는 순위에서 몇 번째 묶음인가.
    #   "다른 구절 보기" 를 누를 때마다 1씩 오른다. 예전에는 손으로 쓴
    #   표를 돌렸는데, 구절이 검색에서 오게 된 뒤로는 몇 번을 눌러도
    #   같은 상위 3개가 나와서 버튼이 죽은 것처럼 보였다.
    hits = search_verses(question, k=3, offset=attempt * 3)
    verse_ids = [h.id for h in hits] if hits else list(variant["verseIds"])
    verses = [
        {"id": h.id, "ref": h.ref, "content": h.content, "galaxy_id": h.galaxy_id}
        for h in hits
    ]

    # 중심 은하는 뺀다 — 고르지 않았을 때 늘 예수가 나오면 열둘의 의미가 없다
    galaxy = recommend_galaxy(
        intent,
        user_mbti,
        theme_label=theme_labels().get(intent),
        exclude_center=True,
    )

    return {
        "question": question,
        "intent": intent,
        "empathy": variant["empathy"],
        "reflection": variant["reflection"],
        "verse_ids": verse_ids,
        # ★ 내용까지 함께 보낸다.
        #   화면의 별 목록에는 은하당 150절만 있다. 검색이 나머지
        #   29,000절 중 하나를 고르면 카드가 빈 채로 뜬다.
        #   폴백(예전 표)일 때는 비어 있고, 그때는 화면이 목록에서 찾는다.
        "verses": verses,
        "follow_ups": list(variant["followUps"]),
        "galaxy_id": galaxy.galaxy_id,
        "galaxy_name": galaxy.name,
        "galaxy_reason": galaxy.reason,
    }
