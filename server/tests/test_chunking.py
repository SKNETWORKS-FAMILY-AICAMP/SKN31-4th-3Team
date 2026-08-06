"""
청킹.

★ 여기서 잡아야 하는 고장
  - 장·책 경계를 넘어 붙어서 맥락이 아니라 잡음이 됨
  - 슬라이딩에서 장 끝 몇 절이 어느 청크에도 안 들어감
  - 표시용 글에 앞뒤 절이 섞여 들어가 "이 구절"이 아니게 됨
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripture.chunking import (
    SLIDING_SIZE,
    Strategy,
    Verse,
    chunk,
    load_verses,
    verse_key,
)

BIBLE = Path(__file__).resolve().parents[2] / "data" / "bible_structured.json"


def make(book: str, chapter: int, count: int, offset: int = 0) -> list[Verse]:
    return [
        Verse(book=book, chapter=chapter, verse=i + 1, content=f"{book}{chapter}:{i + 1}절본문")
        for i in range(offset, offset + count)
    ]


class TestVerseStrategy:
    def test_one_row_per_verse(self):
        chunks = chunk(make("창", 1, 5), Strategy.VERSE)
        assert len(chunks) == 5

    def test_embed_text_is_the_verse_itself(self):
        for c in chunk(make("창", 1, 5), Strategy.VERSE):
            assert c.embed_text == c.text


class TestWindow:
    def test_row_count_is_unchanged(self):
        """
        ★ 맥락을 넓혀도 행은 절 단위 그대로다.
          늘어나면 "몇 장 몇 절" 이라는 주소를 잃는다.
        """
        for strategy in (Strategy.WINDOW_1, Strategy.WINDOW_2):
            assert len(chunk(make("창", 1, 10), strategy)) == 10

    def test_display_text_stays_pure(self):
        """
        ★ 화면에 나가는 글에는 앞뒤 절이 섞이면 안 된다.
          "이 구절입니다" 하고 세 절을 보여 주는 셈이 된다.
        """
        verses = make("창", 1, 10)
        for c, v in zip(chunk(verses, Strategy.WINDOW_2), verses):
            assert c.text == v.content

    def test_embed_text_includes_neighbours(self):
        verses = make("창", 1, 10)
        middle = chunk(verses, Strategy.WINDOW_1)[4]
        assert verses[3].content in middle.embed_text
        assert verses[5].content in middle.embed_text

    def test_window_2_is_wider_than_window_1(self):
        verses = make("창", 1, 10)
        w1 = chunk(verses, Strategy.WINDOW_1)[4]
        w2 = chunk(verses, Strategy.WINDOW_2)[4]
        assert len(w2.embed_text) > len(w1.embed_text)


class TestBoundaries:
    """★ 장이 바뀌면 장면이 바뀐다. 넘어서 붙이면 잡음이다."""

    def test_does_not_cross_chapters(self):
        verses = make("창", 1, 3) + make("창", 2, 3)
        chunks = chunk(verses, Strategy.WINDOW_2)

        last_of_ch1 = chunks[2]
        assert "창2:" not in last_of_ch1.embed_text

        first_of_ch2 = chunks[3]
        assert "창1:" not in first_of_ch2.embed_text

    def test_does_not_cross_books(self):
        verses = make("창", 50, 3) + make("출", 1, 3)
        chunks = chunk(verses, Strategy.WINDOW_2)
        assert "출1:" not in chunks[2].embed_text

    def test_first_verse_of_chapter_has_no_preceding(self):
        verses = make("창", 1, 3) + make("창", 2, 5)
        first_of_ch2 = chunk(verses, Strategy.WINDOW_2)[3]
        assert first_of_ch2.embed_text.startswith("창2:1절본문")


class TestSliding:
    def test_chunks_overlap(self):
        chunks = chunk(make("창", 1, 11), Strategy.SLIDING)
        covered = [set(c.verse_keys) for c in chunks]
        assert covered[0] & covered[1], "겹치지 않으면 경계 문맥이 끊긴다"

    def test_every_verse_is_covered(self):
        """
        ★ stride 로만 돌면 장 끝 몇 절이 어느 청크에도 안 들어간다.
          그 절들은 영원히 검색되지 않는다 — 그리고 아무도 모른다.
        """
        for count in range(1, 40):
            verses = make("창", 1, count)
            covered: set[str] = set()
            for c in chunk(verses, Strategy.SLIDING):
                covered |= set(c.verse_keys)
            assert covered == {verse_key(v) for v in verses}, f"{count}절 장에서 누락"

    def test_short_chapter_becomes_one_chunk(self):
        chunks = chunk(make("창", 1, 3), Strategy.SLIDING)
        assert len(chunks) == 1
        assert len(chunks[0].verse_keys) == 3

    def test_keys_are_unique(self):
        # 중복 키가 있으면 나중에 upsert 가 서로를 덮어쓴다
        chunks = chunk(make("창", 1, 31) + make("창", 2, 25), Strategy.SLIDING)
        assert len({c.key for c in chunks}) == len(chunks)

    def test_group_never_exceeds_the_size(self):
        for c in chunk(make("창", 1, 40), Strategy.SLIDING):
            assert len(c.verse_keys) <= SLIDING_SIZE


class TestEveryStrategyCoversEverything:
    @pytest.mark.parametrize("strategy", list(Strategy))
    def test_no_verse_is_lost(self, strategy: Strategy):
        verses = make("창", 1, 31) + make("창", 2, 25) + make("출", 1, 22)
        covered: set[str] = set()
        for c in chunk(verses, strategy):
            covered |= set(c.verse_keys)
        assert covered == {verse_key(v) for v in verses}


@pytest.mark.skipif(not BIBLE.exists(), reason="성경전서 파일이 없음")
class TestRealBible:
    """실제 31,077절로 돌려 본다 — 합성 데이터가 숨기는 것이 있다."""

    @pytest.fixture(scope="class")
    @staticmethod
    def verses():
        # 31,077절을 테스트마다 다시 읽으면 느리다 — 클래스당 한 번만.
        return load_verses(BIBLE)

    def test_loads_every_verse(self, verses):
        assert len(verses) == len(json.loads(BIBLE.read_text(encoding="utf-8")))

    def test_verse_strategy_keeps_the_count(self, verses):
        assert len(chunk(verses, Strategy.VERSE)) == len(verses)

    def test_window_keeps_the_count(self, verses):
        assert len(chunk(verses, Strategy.WINDOW_2)) == len(verses)

    def test_sliding_covers_every_verse(self, verses):
        covered: set[str] = set()
        for c in chunk(verses, Strategy.SLIDING):
            covered |= set(c.verse_keys)
        assert covered == {verse_key(v) for v in verses}

    def test_context_actually_helps_the_short_verses(self, verses):
        """
        ★ 이 청킹이 존재하는 이유 그 자체.
          "예수께서 눈물을 흘리시더라"(요 11:35)는 그 문장만으로는
          슬픔도 죽음도 나사로도 담고 있지 않다.
        """
        index = next(
            i
            for i, v in enumerate(verses)
            if v.book == "요" and v.chapter == 11 and v.verse == 35
        )
        target = chunk(verses, Strategy.WINDOW_2)[index]

        assert target.text == verses[index].content
        assert len(target.embed_text) > len(target.text) * 3
