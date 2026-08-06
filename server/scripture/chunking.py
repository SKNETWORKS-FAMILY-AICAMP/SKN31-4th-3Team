"""
scripture/chunking.py
────────────────────────────────────────────────────────────────────────
성경 본문을 검색 단위로 자른다.

★ 문제
  구절 하나만 임베딩하면 "예수께서 눈물을 흘리시더라"(요 11:35) 같은
  절은 검색되지 않는다. 문장 자체에는 슬픔도, 죽음도, 나사로도 없다.
  그 의미는 전부 앞뒤 절에 있다.

  반대로 여러 절을 묶어 저장하면 "몇 장 몇 절인지" 를 잃는다. 사용자에게
  "요한복음 11장 33~37절 어딘가입니다" 라고 할 수는 없다.

★ 해결 — 주소와 의미를 분리한다
  행은 절 단위로 하나만 둔다(주소 유지). 임베딩에 넣는 글만 앞뒤를
  포함시킨다(의미 보존).

      저장·표시:  예수께서 눈물을 흘리시더라
      임베딩 입력: … 예수께서 심령에 비통히 여기시고 불쌍히 여기사 …
                  예수께서 눈물을 흘리시더라
                  … 보라 그를 얼마나 사랑하셨는가 하며 …

  절마다 윈도우를 따로 행으로 저장하는 방법(슬라이딩)도 있지만, 그러면
  같은 절이 여러 청크에 걸쳐 중복으로 잡혀 검색 뒤에 다시 걸러 내야 하고
  행 수가 배로 는다. 그 방식도 SLIDING 으로 만들어 두었으니 벤치마크에서
  같이 재 본다 — 지금 이 판단은 가설이고, 숫자로 확인할 수 있다.

★ 경계를 넘지 않는다
  창세기 1장 31절의 뒤는 2장 1절이 아니라 "없음" 으로 본다. 장이 바뀌면
  대개 장면도 바뀌고, 책이 바뀌면 저자와 시대가 통째로 바뀐다. 넘어서
  붙이면 맥락이 아니라 잡음이 된다.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from enum import Enum


class Strategy(str, Enum):
    """청킹 방식. 벤치마크의 한 축이다."""

    #: 절 하나만. 가장 짧고 가장 정확한 주소, 가장 빈약한 맥락.
    VERSE = "verse"
    #: 앞뒤 1절씩 붙여 임베딩 (행은 그대로 절 단위)
    WINDOW_1 = "window1"
    #: 앞뒤 2절씩
    WINDOW_2 = "window2"
    #: 5절 묶음을 2절씩 겹쳐 별도 행으로. 행이 늘고 중복 제거가 필요하다.
    SLIDING = "sliding"


#: SLIDING 에서 한 청크에 담는 절 수와 겹치는 절 수.
SLIDING_SIZE = 5
SLIDING_STRIDE = 3  # = SLIDING_SIZE - 2 (2절 겹침)


@dataclass(frozen=True)
class Verse:
    """입력 한 줄. data/bible_structured.json 의 항목과 같다."""

    book: str
    chapter: int
    verse: int
    content: str

    @property
    def ref(self) -> str:
        return f"{self.book} {self.chapter}:{self.verse}"


@dataclass(frozen=True)
class Chunk:
    """
    검색 단위 하나.

    :param key:      이 청크의 고유 주소. VERSE/WINDOW 는 절 하나,
                     SLIDING 은 "시작-끝" 이다.
    :param text:     화면에 보이는 글. 늘 절 본문 그대로다.
    :param embed_text: 임베딩에 넣는 글. 맥락이 붙어 있을 수 있다.
    :param verse_keys: 이 청크가 덮는 절들. SLIDING 의 중복 제거에 쓴다.
    """

    key: str
    book: str
    chapter: int
    verse: int
    text: str
    embed_text: str
    verse_keys: tuple[str, ...]


def verse_key(v: Verse) -> str:
    return f"{v.book}.{v.chapter}.{v.verse}"


def _same_chapter(a: Verse, b: Verse) -> bool:
    return a.book == b.book and a.chapter == b.chapter


def _window(verses: list[Verse], index: int, radius: int) -> str:
    """
    index 를 중심으로 앞뒤 radius 절.

    ★ 장 경계에서 멈춘다. 장이 바뀌면 장면이 바뀐다.
    """
    center = verses[index]

    start = index
    while start > 0 and index - start < radius and _same_chapter(verses[start - 1], center):
        start -= 1

    end = index
    last = len(verses) - 1
    while end < last and end - index < radius and _same_chapter(verses[end + 1], center):
        end += 1

    return " ".join(v.content for v in verses[start : end + 1])


def _grouped_by_chapter(verses: Iterable[Verse]) -> Iterator[list[Verse]]:
    """장 단위로 끊어서 넘긴다. 청킹은 장 안에서만 일어난다."""
    bucket: list[Verse] = []
    for v in verses:
        if bucket and not _same_chapter(bucket[-1], v):
            yield bucket
            bucket = []
        bucket.append(v)
    if bucket:
        yield bucket


def chunk(verses: Iterable[Verse], strategy: Strategy = Strategy.WINDOW_2) -> list[Chunk]:
    """
    구절 목록을 검색 단위로 자른다.

    입력은 book → chapter → verse 순으로 정렬돼 있다고 본다
    (bible_structured.json 이 그렇다).
    """
    out: list[Chunk] = []

    for chapter_verses in _grouped_by_chapter(verses):
        if strategy is Strategy.SLIDING:
            out.extend(_sliding(chapter_verses))
        else:
            radius = {Strategy.VERSE: 0, Strategy.WINDOW_1: 1, Strategy.WINDOW_2: 2}[strategy]
            out.extend(_per_verse(chapter_verses, radius))

    return out


def _per_verse(verses: list[Verse], radius: int) -> Iterator[Chunk]:
    """행은 절 하나. 임베딩 입력만 넓힌다."""
    for i, v in enumerate(verses):
        key = verse_key(v)
        yield Chunk(
            key=key,
            book=v.book,
            chapter=v.chapter,
            verse=v.verse,
            text=v.content,
            embed_text=v.content if radius == 0 else _window(verses, i, radius),
            verse_keys=(key,),
        )


def _sliding(verses: list[Verse]) -> Iterator[Chunk]:
    """
    묶음을 겹쳐 가며 별도 행으로.

    ★ 마지막 조각을 버리지 않는다.
      절이 7개인 장을 5절씩 3칸 간격으로 자르면 [0:5], [3:7] 이 된다.
      stride 로만 돌면 두 번째가 나오지 않아 6·7절이 어디에도 안 들어간다.
      장의 끝은 반드시 덮이도록 마지막 시작점을 따로 맞춘다.
    """
    total = len(verses)
    if total == 0:
        return

    starts = list(range(0, max(total - SLIDING_SIZE, 0) + 1, SLIDING_STRIDE))
    tail = max(total - SLIDING_SIZE, 0)
    if starts[-1] != tail:
        starts.append(tail)

    for start in starts:
        group = verses[start : start + SLIDING_SIZE]
        head = group[0]
        body = " ".join(v.content for v in group)
        yield Chunk(
            key=f"{verse_key(head)}+{len(group)}",
            book=head.book,
            chapter=head.chapter,
            verse=head.verse,
            text=body,
            embed_text=body,
            verse_keys=tuple(verse_key(v) for v in group),
        )


def load_verses(path) -> list[Verse]:
    """data/bible_structured.json 을 읽는다."""
    import json
    from pathlib import Path

    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        Verse(book=r["book"], chapter=int(r["chapter"]), verse=int(r["verse"]), content=r["content"])
        for r in rows
    ]
