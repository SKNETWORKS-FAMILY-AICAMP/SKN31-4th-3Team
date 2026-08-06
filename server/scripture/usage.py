"""
scripture/usage.py
────────────────────────────────────────────────────────────────────────
상담 검색에서 뺄 구절.

★ 왜 빼는가
  성경전서 31,077절에는 이런 것들이 섞여 있다.

      창 5:5    그는 구백삼십 세를 살고 죽었더라
      민 1:21   르우벤 지파에서 계수된 자는 사만 육천오백 명이었더라
      수 15:21  유다 자손의 지파의 남쪽 끝 에돔 경계에 접근한 성읍들은…
      겔 40:7   각기 길이가 한 장대요 너비가 한 장대요…

  잘못된 본문이 아니다. 다만 "요즘 너무 불안합니다" 에 대한 답으로
  나올 일이 영원히 없다. 검색 공간에 남겨 두면 계산만 늘고, 어쩌다
  상위에 올라오면 사용자는 이 서비스가 무엇을 하는 곳인지 헷갈린다.

★ 두 가지를 다르게 다룬다
  tone.py 는 "해로울 수 있는 것" 을 다룬다 — 저주 선언 같은 것.
  여기는 "무해하지만 쓸모없는 것" 이다. 족보는 아무도 다치게 하지
  않는다. 그냥 상담이 아닐 뿐이다.

★ 구간으로만 자른다
  절 하나하나를 판단하지 않는다. 족보·인구조사·경계 목록·치수는
  덩어리로 존재하고, 덩어리째 빼는 편이 읽기도 고치기도 쉽다.
  경계에서 한두 절이 잘못 걸리는 것은 감수한다 — 3만 절 중 몇 절이다.

★ 이 목록은 사람이 읽고 반박하라고 있다
  "창세기 5장 전체가 정말 상담과 무관한가" 는 논쟁할 수 있는 말이다.
  그래서 구간마다 근거를 적어 둔다. 이견이 있으면 그 줄을 지우면 된다.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Skip:
    """건너뛸 구간과 그 이유."""

    book: str
    #: 장 범위 (양끝 포함)
    from_chapter: int
    to_chapter: int
    why: str
    #: 장 하나 안에서 절까지 좁힐 때만 쓴다.
    from_verse: int = 1
    to_verse: int = 999

    def covers(self, chapter: int, verse: int) -> bool:
        if not self.from_chapter <= chapter <= self.to_chapter:
            return False
        # 여러 장에 걸친 구간은 절을 따지지 않는다
        if self.from_chapter != self.to_chapter:
            return True
        return self.from_verse <= verse <= self.to_verse


#: ★ 상담 검색에서 뺄 구간.
#:
#:   여기 없는 것은 전부 남는다. "쓸 것만 적기" 로 가면 3만 절을 다
#:   검토해야 하고, 그 전까지 검색이 텅 빈다.
SKIP: tuple[Skip, ...] = (
    # ── 족보 ────────────────────────────────────────────────────
    Skip("창", 5, 5, "아담에서 노아까지의 계보"),
    Skip("창", 10, 10, "노아 자손의 족속 목록"),
    Skip("창", 11, 11, "셈에서 아브람까지의 계보", from_verse=10),
    Skip("창", 36, 36, "에서의 자손 목록"),
    Skip("대상", 1, 9, "아담부터 이스라엘 지파까지의 족보 9개 장"),
    Skip("마", 1, 1, "예수 그리스도의 계보", from_verse=1, to_verse=17),
    Skip("눅", 3, 3, "예수의 계보", from_verse=23, to_verse=38),
    Skip("룻", 4, 4, "베레스에서 다윗까지의 계보", from_verse=18),

    # ── 인구조사·명단 ───────────────────────────────────────────
    Skip("민", 1, 4, "1차 인구조사와 진영 배치"),
    Skip("민", 7, 7, "열두 지파의 봉헌 예물 목록"),
    Skip("민", 26, 26, "2차 인구조사"),
    Skip("민", 33, 33, "출애굽 여정의 숙영지 목록"),
    Skip("스", 2, 2, "귀환자 명단"),
    Skip("느", 7, 7, "귀환자 명단"),
    Skip("느", 11, 12, "예루살렘 거주자·제사장 명단"),

    # ── 땅 경계 ─────────────────────────────────────────────────
    Skip("수", 13, 21, "지파별 땅 분배와 성읍 경계"),

    # ── 제사·정결 규례의 세부 ──────────────────────────────────
    Skip("레", 1, 7, "제사의 종류와 절차"),
    Skip("레", 11, 15, "정결·부정에 관한 세부 규정"),

    # ── 건축 치수 ───────────────────────────────────────────────
    Skip("출", 25, 31, "성막의 재료와 치수"),
    Skip("출", 35, 40, "성막 제작 기록"),
    Skip("왕상", 6, 7, "성전과 왕궁의 치수"),
    Skip("겔", 40, 48, "환상 속 성전의 치수와 분배"),
)


def is_usable(book: str, chapter: int, verse: int) -> bool:
    """상담 검색 공간에 남길 것인가."""
    return not any(s.book == book and s.covers(chapter, verse) for s in SKIP)


def skip_reason(book: str, chapter: int, verse: int) -> str:
    """왜 뺐는가. 남는 구절이면 빈 문자열."""
    for s in SKIP:
        if s.book == book and s.covers(chapter, verse):
            return s.why
    return ""


def is_usable_key(key: str) -> bool:
    """'창.5.5' 형태의 참조로 조회한다."""
    try:
        book, chapter, verse = key.split(".")
        return is_usable(book, int(chapter), int(verse))
    except (ValueError, AttributeError):
        # 읽을 수 없는 참조는 남긴다. 조용히 지우는 것보다 낫다.
        return True
