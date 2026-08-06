"""
scripture/eval/metrics.py
────────────────────────────────────────────────────────────────────────
검색 품질 지표.

세 개만 본다. 더 늘리면 표를 읽는 사람이 어디를 봐야 할지 모른다.

  Recall@k   정답 중 상위 k 안에 몇 개나 들어왔는가
             → "찾아는 지는가"

  MRR@k      첫 정답이 몇 번째에 있는가 (1등이면 1.0, 5등이면 0.2)
             → "맨 위에 오는가"

  nDCG@k     정답이 위쪽에 몰려 있을수록 높다. 정답이 여럿일 때
             Recall 과 MRR 이 못 보는 순서를 본다.
             → "잘 정렬돼 있는가"

★ 왜 셋 다 필요한가
  상담 화면은 구절 3개를 보여 준다. Recall@10 이 높아도 정답이 8~10위에
  몰려 있으면 화면에는 하나도 안 나온다. MRR 만 보면 "첫 정답" 뒤는
  전혀 안 보이는데, 우리는 3개를 고른다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Scores:
    recall_at_1: float
    recall_at_3: float
    recall_at_5: float
    recall_at_10: float
    mrr_at_10: float
    ndcg_at_10: float
    n: int

    def row(self) -> list[str]:
        return [
            f"{self.recall_at_1:.3f}",
            f"{self.recall_at_3:.3f}",
            f"{self.recall_at_5:.3f}",
            f"{self.recall_at_10:.3f}",
            f"{self.mrr_at_10:.3f}",
            f"{self.ndcg_at_10:.3f}",
        ]


HEADERS = ["R@1", "R@3", "R@5", "R@10", "MRR@10", "nDCG@10"]


def recall_at(ranked: list[str], relevant: set[str], k: int) -> float:
    """
    ★ 분모가 정답 개수다 (k 가 아니라).
      정답이 6개인 질의에서 3개를 맞혔다면 0.5 다. k 로 나누면 정답이
      많은 질의일수록 불리해져서, topical 세트가 통째로 저평가된다.
    """
    if not relevant:
        return 0.0
    hit = sum(1 for r in ranked[:k] if r in relevant)
    return hit / len(relevant)


def reciprocal_rank(ranked: list[str], relevant: set[str], k: int = 10) -> float:
    for i, r in enumerate(ranked[:k], start=1):
        if r in relevant:
            return 1.0 / i
    return 0.0


def ndcg_at(ranked: list[str], relevant: set[str], k: int = 10) -> float:
    """
    이진 적합도(맞다/아니다)로 계산한다.

    ★ 등급을 매기지 않는 이유
      "이 구절이 3점짜리 정답인지 2점짜리인지" 를 사람이 매기면 그
      판단부터 흔들린다. 우리 정답셋은 팀이 "나오면 맞다" 고 합의한
      목록이라 이진이 정직하다.
    """
    if not relevant:
        return 0.0

    dcg = sum(1.0 / math.log2(i + 1) for i, r in enumerate(ranked[:k], start=1) if r in relevant)
    ideal = sum(1.0 / math.log2(i + 1) for i in range(1, min(len(relevant), k) + 1))
    return dcg / ideal if ideal else 0.0


def score(results: list[tuple[list[str], set[str]]]) -> Scores:
    """
    :param results: (검색 결과 순위, 정답 집합) 목록
    """
    if not results:
        return Scores(0, 0, 0, 0, 0, 0, 0)

    n = len(results)
    return Scores(
        recall_at_1=sum(recall_at(r, g, 1) for r, g in results) / n,
        recall_at_3=sum(recall_at(r, g, 3) for r, g in results) / n,
        recall_at_5=sum(recall_at(r, g, 5) for r, g in results) / n,
        recall_at_10=sum(recall_at(r, g, 10) for r, g in results) / n,
        mrr_at_10=sum(reciprocal_rank(r, g) for r, g in results) / n,
        ndcg_at_10=sum(ndcg_at(r, g) for r, g in results) / n,
        n=n,
    )
