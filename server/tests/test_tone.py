"""
구절 성격.

★ 여기서 잡아야 하는 고장
  불안해서 온 사람에게 "다만 불안만이 있구나"(욥 3:26)를 1위로 내놓는 것.
  검색은 정상이고 지표도 멀쩡한데 사용자에게만 해로운 종류라, 테스트가
  없으면 발표 당일에야 발견한다.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripture.tone import (
    CAUTION,
    PENALTY,
    Tone,
    adjust,
    is_safe_to_show,
    reason_for,
    rerank,
    tone_of,
    tone_of_key,
)

BIBLE = Path(__file__).resolve().parents[2] / "data" / "bible_structured.json"


class TestTheVersesThatStartedThis:
    """실제 검색 결과에서 발견한 것들. 이게 재발하면 안 된다."""

    def test_job_cursing_his_birth_is_lament(self):
        # "요즘 너무 불안해서 잠이 안 와요" 의 1위였다
        assert tone_of("욥", 3, 26) is Tone.LAMENT

    def test_deuteronomy_curse_is_warning(self):
        # 같은 질문의 5위. 불순종에 대한 저주 선언이다
        assert tone_of("신", 28, 65) is Tone.WARNING

    def test_curse_never_reaches_the_screen(self):
        assert not is_safe_to_show("신.28.65")

    def test_lament_is_not_penalised(self):
        """
        ★ 한 번 틀렸다가 되돌린 자리다.
          탄식에 0.85 를 곱했더니 애 1:16(애도), 애 1:12(억울함),
          전 1:2(허무)가 눌렸다. 전부 그 질문의 정답이었다.
          탄식을 겪는 사람에게는 탄식 본문이 위로가 된다.
        """
        assert is_safe_to_show("욥.3.26")
        assert adjust(1.0, "욥.3.26") == 1.0


class TestRanges:
    def test_curse_section_starts_where_it_starts(self):
        # 신명기 28장은 14절까지가 복, 15절부터가 저주다
        assert tone_of("신", 28, 14) is Tone.NEUTRAL
        assert tone_of("신", 28, 15) is Tone.WARNING

    def test_lamentations_hope_chapter_is_spared(self):
        """
        ★ 애가 3장은 통째로 빼 두었다.
          "이것들이 아침마다 새로우니"(3:23)가 거기 있다. 애가 전체를
          탄식으로 묶으면 애가에서 가장 많이 인용되는 구절이 사라진다.
        """
        assert tone_of("애", 3, 23) is Tone.NEUTRAL
        assert tone_of("애", 1, 1) is Tone.LAMENT

    def test_job_beyond_chapter_three_is_untouched(self):
        # 욥 19:25 "나의 대속자가 살아 계시니" 는 살아 있어야 한다
        assert tone_of("욥", 19, 25) is Tone.NEUTRAL

    def test_ordinary_verses_are_neutral(self):
        for ref in [("요", 3, 16), ("시", 23, 1), ("빌", 4, 6), ("창", 1, 1)]:
            assert tone_of(*ref) is Tone.NEUTRAL


class TestKeyLookup:
    def test_parses_reference(self):
        assert tone_of_key("신.28.65") is Tone.WARNING

    def test_garbage_is_neutral_not_a_crash(self):
        # 손으로 고친 주소나 깨진 데이터로도 검색이 죽으면 안 된다
        for bad in ["", "이상한값", "신.28", None, "신.x.y"]:
            assert tone_of_key(bad) is Tone.NEUTRAL


class TestRerank:
    def test_warning_is_removed(self):
        out = rerank([(0.9, "신.28.65"), (0.5, "시.23.1")])
        assert [k for _, k in out] == ["시.23.1"]

    def test_lament_keeps_its_place(self):
        """
        ★ 순서를 바꾸지 않는다.
          애도하는 사람에게 애가가 2위로 온 것을 뒤로 밀었던 적이 있다.
          그건 개선이 아니라 훼손이었다.
        """
        out = rerank([(0.597, "애.1.16"), (0.559, "시.4.8")])
        assert [k for _, k in out] == ["애.1.16", "시.4.8"]

    def test_only_warning_changes_the_result(self):
        out = rerank([(0.9, "신.28.65"), (0.5, "욥.3.26"), (0.4, "시.23.1")])
        assert [k for _, k in out] == ["욥.3.26", "시.23.1"]

    def test_empty_input(self):
        assert rerank([]) == []


class TestTable:
    """구간표 자체의 무결성."""

    def test_every_range_says_why(self):
        # 근거 없는 검열은 나중에 아무도 못 고친다
        for r in CAUTION:
            assert r.why.strip(), f"{r.book} {r.chapter} 에 근거가 없음"

    def test_ranges_are_well_formed(self):
        for r in CAUTION:
            assert r.start <= r.end
            assert r.chapter >= 1

    def test_reason_is_reachable(self):
        assert "저주" in reason_for("신", 28, 65)
        assert reason_for("요", 3, 16) == ""

    def test_penalty_covers_every_tone(self):
        for tone in Tone:
            assert tone in PENALTY

    @pytest.mark.skipif(not BIBLE.exists(), reason="성경전서 파일이 없음")
    def test_ranges_point_at_real_verses(self):
        """
        ★ 없는 장을 막아 두면 아무것도 안 막힌다.
          그리고 막힌 줄 알고 넘어간다.
        """
        rows = json.loads(BIBLE.read_text(encoding="utf-8"))
        have = {(r["book"], r["chapter"]) for r in rows}
        for r in CAUTION:
            assert (r.book, r.chapter) in have, f"{r.book} {r.chapter}장이 없음"

    @pytest.mark.skipif(not BIBLE.exists(), reason="성경전서 파일이 없음")
    def test_does_not_swallow_the_bible(self):
        """
        ★ 구간을 넓게 잡으면 검색이 조용히 텅 빈다.
          걸러지는 비율이 2%를 넘으면 뭔가 잘못 적은 것이다.
        """
        rows = json.loads(BIBLE.read_text(encoding="utf-8"))
        blocked = sum(
            1 for r in rows if tone_of(r["book"], r["chapter"], r["verse"]) is not Tone.NEUTRAL
        )
        share = blocked / len(rows)
        assert share < 0.02, f"{share:.1%} 가 걸러짐 — 너무 많다"
