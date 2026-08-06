"""
scripture/tone.py
────────────────────────────────────────────────────────────────────────
구절의 성격 — 상담에서 그대로 건네도 되는가.

★ 왜 필요한가
  "요즘 너무 불안해서 잠이 안 와요" 로 검색했을 때 1위가 이것이었다.

      욥 3:26  나에게는 평온도 없고 안일도 없고 휴식도 없고 다만 불안만이 있구나

  검색이 틀린 게 아니다. 이 구절은 '불안' 그 자체다. 다만 욥이 자기가
  태어난 날을 저주하는 대목이고, 불안해서 온 사람에게 맨 위로 내놓으면
  위로가 아니라 확인 사살이다.

  5위는 이랬다.

      신 28:65  …여호와께서 네 마음을 떨게 하고 눈을 쇠하게 하고
                정신을 산란하게 하시리니

  불순종에 대한 저주 선언이다. 상담 화면에 올라가서는 안 된다.

★ 의미 유사도로는 못 거른다
  임베딩은 '불안을 말하는 구절' 과 '불안한 사람에게 하는 말' 을
  구분하지 않는다. 둘 다 불안이라는 의미장에 있기 때문이다.
  검색을 아무리 잘해도 이 문제는 남는다. 별도의 층이 필요하다.

★ 탄식은 건드리지 않는다 — 한 번 틀렸다가 되돌린 자리다
  처음에는 탄식도 순위를 낮췄다. "탄식은 위로가 아니다" 라고 봤다.
  70개 질의를 훑어 무엇이 눌렸는지 세어 보니 이랬다.

      애 1:16  내가 우니 내 눈에 눈물이 물 같이 흘러내림이여
               나를 위로할 자가 멀리 떠났음이로다
               ← "가까운 사람을 잃고 슬픔이 가시지 않습니다"  2위

      애 1:12  지나가는 모든 사람들이여 너희에게는 관계가 없는가
               나의 고통과 같은 고통이 있는가
               ← "억울한 일을 당했는데 아무도 몰라줍니다"  5위

      전 1:2   헛되고 헛되며 헛되고 헛되니 모든 것이 헛되도다
               ← "인생이 너무 빨리 지나가는 것 같아 허무합니다"  6위

  전부 그 질문에 가장 잘 맞는 구절이었다. 애도하는 사람에게 애가만큼
  맞는 본문이 없고, 허무를 말하는 사람에게 전도서가 나오는 것은 정확하다.
  탄식을 겪는 사람에게는 탄식 본문이 위로가 된다 — 시편 탄식시가 가장
  많이 사랑받는 이유가 그것이다.

  욥 3:26 이 나빴던 이유는 탄식이라서가 아니었다. "잠이 안 온다" 에
  "다만 불안만이 있구나" 로 답하면 아무 데도 데려가지 않기 때문이다.
  같은 애도라도 애 1:16 에는 "나를 위로할 자" 라는 방향이 있다.
  그 차이는 장·절 구간으로 가를 수 없다.

  그래서 탄식은 이름표만 남기고 순위는 건드리지 않는다. 사람이 결과를
  검토할 때 표시로는 쓸모가 있다.

★ 남기는 것은 저주·심판 선언뿐이다
  "아이를 키우는 게 너무 버겁습니다" 에 레위기 26:17("내가 너희를
  치리니")이 상위로 올라온 적이 있다. 700번에 한 번이라도 일어나서는
  안 되는 종류이고, 전체의 0.4% 만 막으므로 비용이 없다.

★ 이 목록은 사람이 읽고 고치라고 있는 것이다
  자동 분류가 아니라 손으로 적은 구간표다. 완전하지 않고, 완전할 수도
  없다. 다만 무엇을 왜 걸렀는지 코드에서 읽을 수 있다는 점이 중요하다.
  팀에서 이견이 있으면 그 자리에서 고치면 된다.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Tone(str, Enum):
    #: 기본값. 대부분의 구절이 여기 속한다.
    NEUTRAL = "neutral"
    #: 탄식·절망의 묘사. 공감에는 쓰이되 맨 위에 두지 않는다.
    LAMENT = "lament"
    #: 저주·심판 선언. 상담 노출에서 뺀다.
    WARNING = "warning"


@dataclass(frozen=True)
class Range:
    """
    한 구간과 그 판단 근거.

    :param why: 왜 이렇게 봤는가. 사람이 읽고 반박할 수 있어야 한다.
    """

    book: str
    chapter: int
    start: int
    end: int
    tone: Tone
    why: str

    def covers(self, chapter: int, verse: int) -> bool:
        return chapter == self.chapter and self.start <= verse <= self.end


#: 끝을 모르는 구간에 쓴다 (장 끝까지).
END = 999


#: ★ 손으로 적은 구간표.
#:
#:   여기 없는 구절은 전부 NEUTRAL 이다. 즉 "걸러야 할 것만" 적는다.
#:   반대로 적으면(안전한 것만 통과) 3만 절을 다 검토해야 하고, 그 전까지
#:   검색 결과가 텅 빈다.
CAUTION: tuple[Range, ...] = (
    # ── 저주·심판 선언 ──────────────────────────────────────────
    Range("신", 28, 15, END, Tone.WARNING, "불순종에 대한 저주 선언"),
    Range("레", 26, 14, 39, Tone.WARNING, "불순종에 대한 저주 선언"),
    Range("신", 27, 15, 26, Tone.WARNING, "에발산 저주 낭독"),
    Range("마", 23, 13, 36, Tone.WARNING, "서기관·바리새인에 대한 화 선언"),
    Range("눅", 6, 24, 26, Tone.WARNING, "'화 있을진저' 선언"),

    # ── 탄식 ────────────────────────────────────────────────────
    Range("욥", 3, 1, END, Tone.LAMENT, "욥이 자기 태어난 날을 저주함"),
    Range("시", 88, 1, END, Tone.LAMENT, "소망 없이 어둠으로 끝나는 유일한 시편"),
    Range("애", 1, 1, END, Tone.LAMENT, "예루살렘 함락에 대한 애가"),
    Range("애", 2, 1, END, Tone.LAMENT, "예루살렘 함락에 대한 애가"),
    Range("애", 4, 1, END, Tone.LAMENT, "예루살렘 함락에 대한 애가"),
    Range("애", 5, 1, END, Tone.LAMENT, "예루살렘 함락에 대한 애가"),
    Range("전", 1, 1, END, Tone.LAMENT, "'헛되고 헛되며' — 허무의 서술"),
    Range("전", 2, 1, END, Tone.LAMENT, "'헛되고 헛되며' — 허무의 서술"),
    Range("렘", 20, 14, 18, Tone.LAMENT, "예레미야가 자기 생일을 저주함"),
)


#: ★ 욥기 4~31장을 통째로 넣지 않은 이유
#:
#:   그 대목은 욥의 친구들이 한 말이고, 욥기 42:7 에서 하나님이
#:   "너희가 나를 가리켜 말한 것이 옳지 못하도다" 라고 하신다.
#:   그러니 위로로 인용하기에 조심스러운 것은 맞다.
#:
#:   그런데 28개 장을 한 번에 막으면, 그 안에 있는 좋은 구절
#:   (욥 19:25 "내가 알기에는 나의 대속자가 살아 계시니" 등)까지
#:   함께 사라진다. 근거가 옅은 곳에서 크게 자르는 것보다,
#:   확실한 곳만 좁게 자르는 편이 낫다.
#:
#:   판단이 필요하면 팀에서 논의하고 여기에 추가하면 된다.


def tone_of(book: str, chapter: int, verse: int) -> Tone:
    """이 구절의 성격. 목록에 없으면 NEUTRAL."""
    for r in CAUTION:
        if r.book == book and r.covers(chapter, verse):
            return r.tone
    return Tone.NEUTRAL


def reason_for(book: str, chapter: int, verse: int) -> str:
    """왜 그렇게 판단했는가. NEUTRAL 이면 빈 문자열."""
    for r in CAUTION:
        if r.book == book and r.covers(chapter, verse):
            return r.why
    return ""


def tone_of_key(key: str) -> Tone:
    """'욥.3.26' 형태의 참조로 조회한다."""
    try:
        book, chapter, verse = key.split(".")
        return tone_of(book, int(chapter), int(verse))
    except (ValueError, AttributeError):
        return Tone.NEUTRAL


#: 순위 점수에 곱하는 값.
#:
#: ★ LAMENT 가 1.0 인 것은 실수가 아니다.
#:   0.85 로 두었다가 되돌렸다. 위 주석의 세 사례를 보라 — 눌린 것이
#:   전부 그 질문의 정답이었다. 값을 다시 낮추기 전에 그 증거부터
#:   반박해야 한다.
PENALTY: dict[Tone, float] = {
    Tone.NEUTRAL: 1.0,
    Tone.LAMENT: 1.0,
    Tone.WARNING: 0.0,
}


def adjust(score: float, key: str) -> float:
    """유사도 점수에 성격을 반영한다."""
    return score * PENALTY[tone_of_key(key)]


def is_safe_to_show(key: str) -> bool:
    """상담 화면에 올려도 되는가."""
    return tone_of_key(key) is not Tone.WARNING


def rerank(scored: list[tuple[float, str]]) -> list[tuple[float, str]]:
    """
    (점수, 참조) 목록을 성격까지 반영해 다시 정렬한다.

    WARNING 은 아예 뺀다. LAMENT 는 점수만 깎아 아래로 내려간다.
    """
    out = [(adjust(s, k), k) for s, k in scored if is_safe_to_show(k)]
    out.sort(reverse=True)
    return out
