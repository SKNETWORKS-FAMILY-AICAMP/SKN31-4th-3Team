"""
성경 66권 표.

★ 여기서 잡아야 하는 고장
  - 약어 하나가 빠져서 그 책 전체가 "창 1:1" 처럼 약어로만 나감
  - 순서가 어긋나 목록에서 갈라디아서가 창세기보다 앞에 섬
  - 큐레이션(fixtures)과 이 표의 정식명이 달라 화면에 두 이름이 섞임
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripture.books import BOOKS, BY_CODE, name_of, order_of, ref

SERVER = Path(__file__).resolve().parents[1]
BIBLE = SERVER.parent / "data" / "bible_structured.json"
FIXTURE = SERVER / "scripture" / "fixtures" / "verses.json"


class TestTable:
    def test_sixty_six_books(self):
        assert len(BOOKS) == 66

    def test_thirty_nine_old_twenty_seven_new(self):
        assert sum(1 for b in BOOKS if b.old) == 39
        assert sum(1 for b in BOOKS if not b.old) == 27

    def test_codes_are_unique(self):
        assert len({b.code for b in BOOKS}) == 66

    def test_names_are_unique(self):
        assert len({b.name for b in BOOKS}) == 66

    def test_order_is_one_through_sixty_six(self):
        assert sorted(b.order for b in BOOKS) == list(range(1, 67))

    def test_canonical_order_not_alphabetical(self):
        """
        ★ 가나다순으로 두면 갈라디아서가 창세기보다 앞에 선다.
          성경을 아는 사람에게는 즉시 어색하다.
        """
        assert order_of("창") < order_of("출") < order_of("마") < order_of("계")
        assert order_of("창") < order_of("갈")


class TestLookup:
    def test_expands_abbreviation(self):
        assert name_of("창") == "창세기"
        assert name_of("요일") == "요한일서"
        assert name_of("살후") == "데살로니가후서"

    def test_unknown_code_passes_through(self):
        # 번역본이 바뀌어도 적재가 멈추면 안 된다
        assert name_of("없는약어") == "없는약어"

    def test_unknown_code_sorts_last(self):
        # 0 을 주면 창세기보다 앞에 서서 목록 맨 위가 정체불명이 된다
        assert order_of("없는약어") > order_of("계")

    def test_reference_string(self):
        assert ref("요", 3, 16) == "요한복음 3:16"


@pytest.mark.skipif(not BIBLE.exists(), reason="성경전서 파일이 없음")
class TestAgainstTheBible:
    """★ 실제 데이터에 있는 약어를 하나도 빠뜨리지 않았는가."""

    @pytest.fixture(scope="class")
    @staticmethod
    def codes():
        rows = json.loads(BIBLE.read_text(encoding="utf-8"))
        return {r["book"] for r in rows}

    def test_covers_every_code_in_the_data(self, codes):
        missing = sorted(codes - set(BY_CODE))
        assert missing == [], f"표에 없는 약어: {missing}"

    def test_no_extra_codes(self, codes):
        extra = sorted(set(BY_CODE) - codes)
        assert extra == [], f"데이터에 없는 약어: {extra}"

    def test_data_order_matches_canonical_order(self, codes):
        """
        ★ 파일의 등장 순서가 곧 정경 순서다.
          우리 표가 그것과 어긋나면 목록 정렬이 성경과 달라진다.
        """
        rows = json.loads(BIBLE.read_text(encoding="utf-8"))
        seen, appearance = set(), []
        for r in rows:
            if r["book"] not in seen:
                seen.add(r["book"])
                appearance.append(r["book"])
        assert appearance == [b.code for b in BOOKS]


@pytest.mark.skipif(not FIXTURE.exists(), reason="큐레이션 fixture 가 없음")
class TestAgainstCuration:
    """
    ★ 큐레이션 702절에도 book_name 이 들어 있다.
      두 곳이 어긋나면 같은 책이 화면에서 두 이름으로 나온다.
    """

    def test_names_agree(self):
        rows = json.loads(FIXTURE.read_text(encoding="utf-8"))
        wrong = {
            (v["book_code"], v["book_name"], name_of(v["book_code"]))
            for v in rows
            if name_of(v["book_code"]) != v["book_name"]
        }
        assert wrong == set(), f"이름이 다름: {sorted(wrong)}"
