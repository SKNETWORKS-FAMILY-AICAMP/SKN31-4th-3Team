"""
구절 선별과 은하 배정.

★ 여기서 잡아야 하는 고장
  - 요 3:16 같은 구절이 "상담과 무관" 으로 걸러짐
  - 배정이 0인 은하가 생겨 화면에 빈 성운이 뜸
  - 명령을 다시 돌릴 때마다 별이 은하 사이를 건너다님
  - 28,424절을 전부 캔버스에 올려 프레임이 무너짐
"""

from __future__ import annotations

import json
from io import StringIO
from pathlib import Path

import pytest
from django.core.management import call_command

from scripture.models import BibleVerse, Galaxy, Verse
from scripture.usage import SKIP, is_usable, is_usable_key, skip_reason

BIBLE = Path(__file__).resolve().parents[2] / "data" / "bible_structured.json"


class TestUsageTable:
    def test_every_range_says_why(self):
        for s in SKIP:
            assert s.why.strip(), f"{s.book} {s.from_chapter}장에 근거가 없음"

    def test_ranges_are_well_formed(self):
        for s in SKIP:
            assert s.from_chapter <= s.to_chapter
            assert s.from_verse <= s.to_verse

    def test_removes_genealogies_and_measurements(self):
        assert not is_usable("창", 5, 5)       # 구백삼십 세를 살고 죽었더라
        assert not is_usable("민", 1, 21)      # 사만 육천오백 명이었더라
        assert not is_usable("수", 15, 21)     # 성읍 경계 목록
        assert not is_usable("겔", 40, 7)      # 한 장대요 한 장대요
        assert not is_usable("마", 1, 5)       # 계보

    def test_keeps_what_counselling_needs(self):
        """★ 하나라도 걸리면 그 구절은 영원히 검색되지 않는다."""
        for ref in [
            ("요", 3, 16), ("시", 23, 1), ("창", 1, 1), ("출", 20, 3),
            ("레", 19, 18), ("수", 1, 9), ("민", 6, 24), ("겔", 36, 26),
            ("마", 5, 3), ("눅", 15, 20), ("빌", 4, 6), ("사", 41, 10),
        ]:
            assert is_usable(*ref), f"{ref} 가 걸러짐"

    def test_matthew_genealogy_stops_at_seventeen(self):
        # 마 1:18 부터가 예수의 나심이다. 계보와 함께 잘리면 안 된다
        assert not is_usable("마", 1, 17)
        assert is_usable("마", 1, 18)

    def test_reason_is_reachable(self):
        assert "계보" in skip_reason("창", 5, 5)
        assert skip_reason("요", 3, 16) == ""

    def test_broken_key_is_kept(self):
        # 읽을 수 없는 참조를 조용히 지우는 것보다 남기는 편이 낫다
        for bad in ["", "이상한값", None, "창.5"]:
            assert is_usable_key(bad)

    @pytest.mark.skipif(not BIBLE.exists(), reason="성경전서 파일이 없음")
    def test_does_not_swallow_the_bible(self):
        """구간을 넓게 잡으면 검색 공간이 조용히 사라진다."""
        rows = json.loads(BIBLE.read_text(encoding="utf-8"))
        out = sum(1 for r in rows if not is_usable(r["book"], r["chapter"], r["verse"]))
        assert 0.03 < out / len(rows) < 0.15, f"{out / len(rows):.1%} 제외 — 확인 필요"


@pytest.mark.skipif(not BIBLE.exists(), reason="성경전서 파일이 없음")
class TestAssignment:
    @pytest.fixture(autouse=True)
    def _setup(self, db, seeded):
        call_command("ingest_bible", stdout=StringIO(), stderr=StringIO())

    def run(self, **kwargs) -> str:
        out = StringIO()
        call_command("assign_galaxies", stdout=out, stderr=StringIO(), **kwargs)
        return out.getvalue()

    def test_every_galaxy_gets_verses(self):
        """
        ★ 처음엔 3개 은하가 0개였다.
          주제 하나를 은하 하나가 독식하게 만들어서, 12주제로는 최대
          12은하만 채워졌다. 화면에 빈 성운이 세 개 생긴다.
        """
        self.run()
        empty = [
            g.name
            for g in Galaxy.objects.all()
            if not BibleVerse.objects.filter(galaxy_id=g.id, usable=True).exists()
        ]
        assert empty == [], f"배정이 0인 은하: {empty}"

    def test_assignment_is_deterministic(self):
        """
        ★ 다시 돌릴 때마다 별이 은하를 옮겨 다니면,
          사용자가 어제 본 구절을 오늘 못 찾는다.
        """
        self.run()
        first = dict(
            BibleVerse.objects.exclude(galaxy_id="").values_list("id", "galaxy_id")
        )
        self.run()
        second = dict(
            BibleVerse.objects.exclude(galaxy_id="").values_list("id", "galaxy_id")
        )
        assert first == second

    def test_unusable_verses_are_never_assigned(self):
        self.run()
        assert not BibleVerse.objects.filter(usable=False).exclude(galaxy_id="").exists()

    def test_canvas_is_capped_per_galaxy(self):
        """
        ★ 28,424절을 전부 그리면 매 프레임 그만큼을 투영하고 정렬한다.
          지금 702개를 그리는 구조에서 40배다.
        """
        self.run(canvas=50)
        for g in Galaxy.objects.all():
            n = BibleVerse.objects.filter(galaxy_id=g.id, on_canvas=True).count()
            assert n <= 50, f"{g.name}: {n}개"

    def test_canvas_verses_are_assigned_and_usable(self):
        self.run()
        assert not BibleVerse.objects.filter(on_canvas=True, usable=False).exists()
        assert not BibleVerse.objects.filter(on_canvas=True, galaxy_id="").exists()

    def test_order_is_unique_within_a_galaxy(self):
        """order 가 겹치면 두 별이 같은 좌표에 겹쳐 그려진다."""
        self.run(canvas=30)
        for g in Galaxy.objects.all():
            orders = list(
                BibleVerse.objects.filter(galaxy_id=g.id, on_canvas=True)
                .values_list("order", flat=True)
            )
            assert len(orders) == len(set(orders)), f"{g.name} 에 중복 order"

    def test_rerunning_does_not_grow_the_canvas(self):
        self.run(canvas=40)
        first = BibleVerse.objects.filter(on_canvas=True).count()
        self.run(canvas=40)
        assert BibleVerse.objects.filter(on_canvas=True).count() == first

    def test_curated_verses_are_untouched(self):
        before = Verse.objects.count()
        self.run()
        assert Verse.objects.count() == before
