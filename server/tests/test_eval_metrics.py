"""
검색 지표.

★ 여기서 잡아야 하는 고장
  지표가 틀리면 "제일 좋은 모델" 을 잘못 고른다. 그리고 그 뒤로는
  아무도 이 숫자를 다시 의심하지 않는다.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripture.eval.metrics import ndcg_at, recall_at, reciprocal_rank, score

GOLD = Path(__file__).resolve().parents[1] / "scripture" / "eval" / "gold_ko.json"
BIBLE = Path(__file__).resolve().parents[2] / "data" / "bible_structured.json"


class TestRecall:
    def test_divides_by_the_answer_count(self):
        """
        ★ k 로 나누면 안 된다.
          정답이 6개인 질의에서 3개를 맞히면 0.5 다. k(=10)로 나누면
          0.3 이 되어, 정답이 많은 topical 세트가 통째로 저평가된다.
        """
        assert recall_at(["a", "b", "c"], {"a", "b", "c", "d"}, 10) == pytest.approx(0.75)

    def test_only_counts_within_k(self):
        assert recall_at(["x", "y", "a"], {"a"}, 2) == 0.0
        assert recall_at(["x", "y", "a"], {"a"}, 3) == 1.0

    def test_empty_answers_is_zero_not_a_crash(self):
        assert recall_at(["a"], set(), 10) == 0.0


class TestReciprocalRank:
    def test_first_position_is_one(self):
        assert reciprocal_rank(["a", "b"], {"a"}) == 1.0

    def test_falls_off_by_position(self):
        assert reciprocal_rank(["x", "a"], {"a"}) == pytest.approx(0.5)
        assert reciprocal_rank(["x", "y", "a"], {"a"}) == pytest.approx(1 / 3)

    def test_misses_beyond_k_are_zero(self):
        assert reciprocal_rank(["x"] * 10 + ["a"], {"a"}, k=10) == 0.0


class TestNdcg:
    def test_perfect_order_is_one(self):
        assert ndcg_at(["a", "b", "c"], {"a", "b", "c"}) == pytest.approx(1.0)

    def test_order_matters(self):
        """
        ★ Recall 이 못 보는 것이 이것이다.
          두 결과 모두 정답 2개를 10위 안에 넣었지만, 화면에 3개만
          보여 주는 우리에게는 전혀 다른 결과다.
        """
        good = ndcg_at(["a", "b", "x", "y"], {"a", "b"})
        bad = ndcg_at(["x", "y", "a", "b"], {"a", "b"})
        assert good > bad
        assert recall_at(["a", "b", "x", "y"], {"a", "b"}, 10) == recall_at(
            ["x", "y", "a", "b"], {"a", "b"}, 10
        )

    def test_nothing_found_is_zero(self):
        assert ndcg_at(["x", "y"], {"a"}) == 0.0

    def test_stays_within_bounds(self):
        for ranked in (["a"], ["a", "b"], ["x", "a", "y", "b"], []):
            assert 0.0 <= ndcg_at(ranked, {"a", "b"}) <= 1.0


class TestScore:
    def test_averages_over_queries(self):
        result = score([(["a"], {"a"}), (["x"], {"a"})])
        assert result.n == 2
        assert result.recall_at_1 == pytest.approx(0.5)

    def test_no_queries_does_not_crash(self):
        assert score([]).n == 0


class TestGoldSet:
    """정답셋이 무너지면 모든 숫자가 조용히 거짓말이 된다."""

    @pytest.fixture(scope="class")
    @staticmethod
    def gold():
        return json.loads(GOLD.read_text(encoding="utf-8"))

    def test_has_both_sections(self, gold):
        assert gold["paraphrase"] and gold["topical"]

    def test_enough_queries_to_be_stable(self, gold):
        # 40개 미만이면 모델 간 차이가 우연에 묻힌다
        assert len(gold["paraphrase"]) + len(gold["topical"]) >= 40

    def test_every_query_has_an_answer(self, gold):
        for section in ("paraphrase", "topical"):
            for item in gold[section]:
                assert item["q"].strip()
                assert item["relevant"], f"정답이 비어 있음: {item['q']}"

    def test_no_duplicate_queries(self, gold):
        questions = [it["q"] for s in ("paraphrase", "topical") for it in gold[s]]
        assert len(set(questions)) == len(questions)

    def test_references_are_well_formed(self, gold):
        for section in ("paraphrase", "topical"):
            for item in gold[section]:
                for ref in item["relevant"]:
                    book, chapter, verse = ref.split(".")
                    assert book and chapter.isdigit() and verse.isdigit(), ref

    @pytest.mark.skipif(not BIBLE.exists(), reason="성경전서 파일이 없음")
    def test_every_reference_actually_exists(self, gold):
        """
        ★ 없는 구절을 정답으로 두면 그 질의는 영원히 0점이다.
          그리고 그 0점은 모델 탓으로 읽힌다.
        """
        rows = json.loads(BIBLE.read_text(encoding="utf-8"))
        have = {f"{r['book']}.{r['chapter']}.{r['verse']}" for r in rows}

        missing = [
            ref
            for section in ("paraphrase", "topical")
            for item in gold[section]
            for ref in item["relevant"]
            if ref not in have
        ]
        assert missing == []

    def test_paraphrase_queries_avoid_copying_the_verse(self, gold):
        """
        ★ 구절 본문을 그대로 베끼면 어휘 겹침만 재게 된다.
          그러면 의미를 아는 모델과 모르는 모델이 같은 점수를 받는다.
          6글자 이상 연속 일치가 없어야 한다.
        """
        if not BIBLE.exists():
            pytest.skip("성경전서 파일이 없음")

        rows = json.loads(BIBLE.read_text(encoding="utf-8"))
        text = {f"{r['book']}.{r['chapter']}.{r['verse']}": r["content"] for r in rows}

        offenders = []
        for item in gold["paraphrase"]:
            q = item["q"].replace(" ", "")
            for ref in item["relevant"]:
                body = text[ref].replace(" ", "")
                for i in range(len(q) - 5):
                    if q[i : i + 6] in body:
                        offenders.append((item["q"], ref, q[i : i + 6]))
                        break
        assert offenders == [], f"본문을 베낀 질의: {offenders}"


class TestOllamaBatching:
    """
    ★ 순서가 어긋나면 조용히 전부 틀린다.
      요청을 여러 개 동시에 날리면서 결과를 도착 순으로 이어 붙이면,
      "요한복음 3:16 벡터" 가 다른 구절에 붙는다. 검색은 멀쩡히 돌고
      결과만 틀리기 때문에 눈치채기가 매우 어렵다.
    """

    def _embedder(self, monkeypatch, delay_first: bool = False):
        import time as _time

        from scripture.eval.providers import OllamaEmbedder

        embedder = OllamaEmbedder("fake-model", 4)

        def fake_post(path, body):
            texts = body["input"]
            # 첫 묶음만 느리게 — 늦게 끝난 것이 뒤로 가는지 본다
            if delay_first and texts[0] == "0":
                _time.sleep(0.05)
            return {"embeddings": [[float(t)] * 4 for t in texts]}

        monkeypatch.setattr(embedder, "_post", fake_post)
        return embedder

    def test_returns_one_vector_per_text(self, monkeypatch):
        embedder = self._embedder(monkeypatch)
        texts = [str(i) for i in range(500)]
        assert len(embedder.embed(texts)) == 500

    def test_order_survives_concurrency(self, monkeypatch):
        embedder = self._embedder(monkeypatch, delay_first=True)
        embedder.BATCH = 10
        embedder.CONCURRENCY = 4

        texts = [str(i) for i in range(100)]
        vectors = embedder.embed(texts)

        # i번째 글의 벡터는 [i, i, i, i] 여야 한다
        assert [v[0] for v in vectors] == [float(i) for i in range(100)]

    def test_empty_input(self, monkeypatch):
        assert self._embedder(monkeypatch).embed([]) == []
