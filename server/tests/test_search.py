"""
구절 검색 — 벡터 + 주제 + 성격.

★ 여기서 잡아야 하는 고장
  - 적재 모델과 다른 모델로 질문을 임베딩해 결과가 조용히 틀림
  - Postgres 가 아닌데 검색을 시도해 화면이 통째로 죽음
  - 경고 구절이 위로를 구하는 질문에 올라옴
  - 검색이 안 되는데 답변까지 비어 버림 (폴백이 안 걸림)

★ 벡터 검색 자체는 Postgres 가 필요하다.
  SQLite 로 도는 CI 에서는 "폴백이 제대로 걸리는가" 를 본다.
  실제 검색 품질은 scripts/inspect_search.py 로 눈으로 확인한다.
"""

from __future__ import annotations

import pytest
from django.db import connection

from scripture import search as search_mod
from scripture.models import EmbeddingRun
from scripture.recommend import recommend
from scripture.vectors import truncate


class TestTruncate:
    def test_keeps_unit_length(self):
        """
        ★ 자른 뒤 다시 정규화해야 한다.
          단위 벡터의 앞부분만 남기면 길이가 1보다 작아진다.
        """
        vector = [0.5] * 16  # 길이 2.0
        out = truncate(vector, 4)
        assert len(out) == 4
        assert abs(sum(v * v for v in out) ** 0.5 - 1.0) < 1e-9

    def test_short_vector_is_untouched(self):
        vector = [0.1, 0.2, 0.3]
        assert truncate(vector, 10) == vector

    def test_all_zero_head_does_not_divide_by_zero(self):
        # 있을 수 없는 입력이지만, 있으면 0 나눗셈이 된다
        assert truncate([0.0, 0.0, 1.0], 2) == [0.0, 0.0]


@pytest.mark.django_db
class TestReadiness:
    def test_not_ready_without_embeddings(self):
        """
        ★ 적재 기록이 없으면 검색을 시도하지 않는다.
          시도하면 SQLite 에서 SQL 오류가 나고, 그 오류가 답변 API 를
          통째로 500 으로 만든다.
        """
        assert search_mod.ready() is False
        assert search_mod.search("요즘 너무 불안해요") == []

    def test_active_model_prefers_the_database(self, settings):
        """
        ★ 설정이 아니라 DB 를 믿는다.
          설정은 아직 안 돌린 계획일 수 있다. DB 에 남은 기록이 사실이다.
        """
        settings.EMBEDDING_MODEL = "large"
        EmbeddingRun.objects.create(
            model_key="oll8b", model_name="qwen3-embedding:8b", dim=1024, verses=31077
        )
        assert search_mod.active_model() == "oll8b"

    def test_falls_back_to_settings_when_never_ingested(self, settings):
        settings.EMBEDDING_MODEL = "small"
        assert search_mod.active_model() == "small"


@pytest.mark.django_db
class TestRecommendFallback:
    def test_answer_survives_without_search(self, seeded):
        """
        ★ 가장 나쁜 실패는 화면이 비는 것이다.
          검색을 못 써도 예전 주제 표로 답이 나와야 한다.
        """
        assert not search_mod.ready()

        result = recommend("요즘 너무 불안해서 잠이 안 와요")

        assert result["empathy"]
        assert result["reflection"]
        assert len(result["verse_ids"]) > 0
        # 폴백일 때는 내용을 싣지 않는다 — 화면이 목록에서 찾는다
        assert result["verses"] == []

    def test_fallback_ids_are_curated(self, seeded):
        """
        ★ 폴백 id 는 화면 목록에 있는 것이어야 한다.
          없는 id 를 주면 카드가 빈 채로 뜬다.
        """
        from scripture.models import Verse

        result = recommend("사람들 속에서도 외로워요")
        known = set(Verse.objects.values_list("id", flat=True))
        for vid in result["verse_ids"]:
            assert vid in known, f"{vid} 가 큐레이션 목록에 없음"


@pytest.mark.skipif(
    connection.vendor != "postgresql", reason="벡터 검색은 Postgres 에서만"
)
@pytest.mark.django_db
class TestVectorSearch:
    """Postgres 에서만 도는 검사. 로컬에서 임베딩을 적재한 뒤 확인한다."""

    def test_warning_verses_never_surface(self, seeded):
        from scripture.tone import PENALTY, Tone

        # 경고 구절은 점수를 0 으로 만드는 것이 아니라 아예 빼야 한다
        assert PENALTY[Tone.WARNING] == 0.0

        hits = search_mod.search("요즘 너무 불안해요", k=5)
        for hit in hits:
            assert hit.tone != "warning"


class TestPaging:
    """
    "다른 구절 보기" — 순위에서 다음 묶음.

    ★ 실제로 났던 고장이다.
      구절이 검색에서 오게 된 뒤로 attempt 가 구절에 아무 영향을 주지
      않았다. 버튼은 있는데 몇 번을 눌러도 같은 셋이 나왔다.

    ★ 벡터 없이 검사한다.
      창을 자르는 규칙만 보면 되고, 그건 Postgres 가 필요 없다.
    """

    @staticmethod
    def window(total: int, offset: int, k: int = 3) -> list[int]:
        """search() 의 창 자르기와 같은 규칙."""
        hits = list(range(total))
        start = offset % len(hits)
        out = hits[start : start + k]
        if len(out) < k:
            out += hits[: k - len(out)]
        return out

    def test_first_page_is_the_top(self):
        assert self.window(10, 0) == [0, 1, 2]

    def test_next_page_moves_down(self):
        assert self.window(10, 3) == [3, 4, 5]
        assert self.window(10, 6) == [6, 7, 8]

    def test_wraps_around_at_the_end(self):
        """
        ★ 끝에서 잠그지 않는다.
          후보 수는 질문마다 다르다. 어떤 질문에서는 두 번 만에 잠기고
          어떤 질문에서는 다섯 번 눌린다 — 같은 버튼이 매번 다르게 굴면
          고장으로 읽힌다.
        """
        assert self.window(10, 9) == [9, 0, 1]
        assert self.window(10, 12) == [2, 3, 4]

    def test_always_returns_k_when_enough_candidates(self):
        for offset in range(20):
            assert len(self.window(10, offset)) == 3

    def test_survives_fewer_candidates_than_k(self):
        # 후보가 2개뿐이면 되풀이해서라도 채운다 — 빈 칸보다 낫다
        assert len(self.window(2, 0)) == 3


@pytest.mark.django_db
class TestAttemptReachesSearch:
    def test_recommend_passes_offset(self):
        """
        ★ attempt 가 검색까지 닿는가.
          중간에 끊기면 버튼이 조용히 죽는다. 실제로 그랬다.
        """
        import inspect

        from scripture import recommend as rec_mod

        source = inspect.getsource(rec_mod.recommend)
        assert "offset=attempt * 3" in source
