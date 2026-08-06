"""
벡터 다루기 — 자르기와 정규화.

★ 적재와 검색이 같은 함수를 써야 한다
  구절을 넣을 때와 질문을 검색할 때 자르는 방식이 다르면, 두 벡터가
  같은 공간에 있지 않게 된다. 코사인 유사도는 그래도 숫자를 내놓는다 —
  오류 없이 조용히 틀린 순위가 나오는 종류의 사고다.

  그래서 이 파일에 한 벌만 둔다. ingest_bible 도 search 도 여기서 꺼내 쓴다.
"""

from __future__ import annotations

import math


def truncate(vector: list[float], dim: int) -> list[float]:
    """
    앞 dim 개만 남기고 다시 정규화한다.

    ★ 자르는 것이지 다시 학습하는 것이 아니다
      Qwen3-Embedding 은 Matryoshka(MRL)로 학습돼 앞쪽 차원만 남겨도
      의미가 유지된다고 모델 카드가 밝힌다. 그렇지 않은 모델
      (예: OpenAI text-embedding-3-large)에서는 이 연산이 품질을
      떨어뜨릴 수 있다.

    ★ 왜 다시 정규화하는가
      단위 벡터의 앞부분만 남기면 길이가 1보다 작아진다. 코사인 유사도는
      길이에 나누므로 결과는 같지만, pgvector 의 `<=>` 는 코사인 거리를
      쓰되 인덱스는 정규화를 전제로 최적화돼 있다. 맞춰 두는 편이 안전하다.
    """
    if dim >= len(vector):
        return vector

    head = vector[:dim]
    norm = math.sqrt(sum(v * v for v in head))
    if norm == 0:
        # 앞부분이 전부 0 인 벡터. 있을 수 없지만, 있으면 0 나눗셈이 된다.
        return head
    return [v / norm for v in head]
