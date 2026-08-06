"""
llm_core/matching.py
────────────────────────────────────────────────────────────────────────
질문과 사용자에게 맞는 은하를 고른다.

    주제 적합도  (그 은하에 이 주제의 구절이 얼마나 있는가)
        +
    MBTI 궁합    (사용자 유형과 그 인물의 유형이 얼마나 맞는가)
        =
    추천 순위

★ 왜 두 축인가
  주제만 보면 같은 고민에 늘 같은 인물이 나온다. MBTI 만 보면
  무슨 이야기를 하든 같은 인물이 나온다. 둘을 합쳐야 "이 고민을,
  이 사람이" 가 된다.

★ 주제를 더 무겁게 둔다
  지금 무엇이 힘든지가 성격 궁합보다 중요하다. 불안해서 온 사람에게
  "성향이 잘 맞는 인물"을 주는 것보다 "불안을 아는 인물"을 주는 편이 낫다.

★ 사람이 손으로 정한 표가 없다
  '불안 → 도마' 같은 대응표를 만들면 702개 구절 데이터와 어긋나기
  시작하고, 구절을 옮길 때마다 표를 같이 고쳐야 한다.
  주제 점수는 실제 배정된 구절에서 계산한다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

FIXTURES = Path(__file__).resolve().parents[1] / "scripture" / "fixtures"

#: 주제 : 궁합 = 6 : 4
#:
#: 지금 겪고 있는 일이 성격보다 앞선다. 다만 궁합을 0으로 두면
#: 사용자가 남긴 MBTI 가 아무 의미도 없어지므로 절반 가까이 남긴다.
TOPIC_WEIGHT = 0.6
MBTI_WEIGHT = 0.4

#: MBTI 를 모를 때 쓰는 값 (compatScore 와 같은 규칙)
NEUTRAL_MBTI_SCORE = 50

#: 자동 추천에서 뺀다. 사용자가 직접 고르면 그때는 열린다.
#:
#: ★ 왜 유다인가
#:   점수만으로는 '슬픔'과 '용서'에서 모든 MBTI 유형에 대해 1위가 된다.
#:   배정된 구절이 그 주제에 몰려 있기 때문이다.
#:
#:   그런데 슬픔을 안고 온 사람에게, 자기가 고르지도 않은 상태로
#:   열둘 중 가장 무거운 인물을 붙이는 것은 위험하다. 그 페르소나는
#:   "용서받을 수 없다"고 믿는 사람을 위한 자리이고, 자해 신호에 대한
#:   경계도 가장 엄격하게 걸어 두었다.
#:
#:   그런 만남은 사용자가 스스로 걸어 들어올 때 의미가 있다.
#:   추천이 밀어 넣을 자리가 아니다.
#:
#: ★ 은하 자체를 없애는 것이 아니다
#:   하늘에 그대로 있고, 눌러서 들어가면 대화가 열린다.
#:   막는 것은 "자동으로 배정하는 것" 하나뿐이다.
NEVER_AUTO_RECOMMEND = frozenset({"judas"})


@dataclass(frozen=True)
class Match:
    galaxy_id: str
    name: str
    score: float
    topic_score: float
    mbti_score: float
    #: 화면에 보여 줄 한 줄 근거
    reason: str


@lru_cache(maxsize=1)
def _mbti() -> dict:
    return json.loads((FIXTURES / "mbti.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _galaxies() -> list[dict]:
    return json.loads((FIXTURES / "galaxies.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _theme_share() -> dict[str, dict[str, float]]:
    """
    은하별 주제 비중.

    ★ 개수가 아니라 비중이다.
      구절이 58개인 은하와 55개인 은하를 개수로 비교하면 큰 쪽이
      늘 이긴다. "그 은하의 구절 중 이 주제가 몇 할인가"로 본다.

    반환: {galaxy_id: {theme: 0.0~1.0}}
    """
    verses = json.loads((FIXTURES / "verses.json").read_text(encoding="utf-8"))

    counts: dict[str, dict[str, int]] = {}
    totals: dict[str, int] = {}
    for v in verses:
        gid = v["galaxy_id"]
        bucket = counts.setdefault(gid, {})
        for theme in v.get("themes", []):
            bucket[theme] = bucket.get(theme, 0) + 1
            totals[gid] = totals.get(gid, 0) + 1

    return {
        gid: {theme: n / totals[gid] for theme, n in bucket.items()}
        for gid, bucket in counts.items()
        if totals.get(gid)
    }


def mbti_score(user_mbti: str | None, persona_mbti: str) -> float:
    """0~100. 모르는 값이면 중립."""
    if not user_mbti:
        return NEUTRAL_MBTI_SCORE
    table = _mbti()["scores"]
    return float(table.get(user_mbti.upper(), {}).get(persona_mbti, NEUTRAL_MBTI_SCORE))


def topic_score(galaxy_id: str, theme: str | None) -> float:
    """
    0~100. 그 은하에서 이 주제가 차지하는 비중을 편다.

    ★ 비중은 대개 0.05~0.4 사이에 몰린다.
      그대로 쓰면 은하 간 차이가 뭉개져 MBTI 가 결과를 독점한다.
      가장 높은 비중을 100 으로 잡아 펴 준다.
    """
    if not theme:
        return NEUTRAL_MBTI_SCORE

    shares = _theme_share()
    values = [g.get(theme, 0.0) for g in shares.values()]
    top = max(values) if values else 0.0
    if top <= 0:
        # 아무 은하도 이 주제를 갖고 있지 않다 — 순위를 흔들지 않는다
        return NEUTRAL_MBTI_SCORE

    return 100.0 * shares.get(galaxy_id, {}).get(theme, 0.0) / top


def _object_particle(word: str) -> str:
    """
    '을' / '를' 을 가른다.

    ★ "을(를)" 로 도망가지 않는다.
      괄호 표기는 서류에서나 쓰는 것이고, 사람에게 건네는 문장에
      들어가면 그 자리에서 기계가 말하고 있다는 게 드러난다.

    한글 음절은 유니코드에서 (초성, 중성, 종성) 순으로 배열돼 있어,
    시작점부터의 거리를 28로 나눈 나머지가 곧 종성이다. 0이면 받침이 없다.
    """
    if not word:
        return "를"
    last = word[-1]
    if not ("가" <= last <= "힣"):
        return "를"
    has_final = (ord(last) - ord("가")) % 28 != 0
    return "을" if has_final else "를"


def _reason(name: str, theme_label: str | None, topic: float, mbti: float) -> str:
    """
    왜 이 인물인지 한 줄로.

    ★ 점수를 보여 주지 않는다.
      "82.4점" 은 사용자에게 아무 의미가 없고, 다른 인물이 '떨어졌다'는
      인상만 준다. 여기는 순위표가 아니다.

    ★ 짧게, 한 문장으로.
      대화를 열기 전에 읽는 줄이다. 길면 읽지 않고 넘어간다.

    ★ 단정하지 않는다.
      "가장 잘 맞는 분입니다" 라고 하면, 대화가 잘 안 풀렸을 때
      사용자가 자기 탓을 한다.
    """
    if theme_label and topic >= 70 and mbti >= 85:
        return f"{theme_label}에 닿는 구절이 많고, 결도 가까운 곳입니다."
    if theme_label and topic >= 70:
        return f"{theme_label}에 닿는 구절이 가장 많은 곳입니다."
    if mbti >= 85:
        return "결이 가까운 인물입니다."
    if theme_label:
        return f"{theme_label}{_object_particle(theme_label)} 함께 이야기해 볼 만한 곳입니다."
    return "지금 이야기를 나누기에 어울리는 곳입니다."


def rank(
    theme: str | None = None,
    user_mbti: str | None = None,
    *,
    theme_label: str | None = None,
    exclude_center: bool = False,
    include_all: bool = False,
    limit: int | None = None,
) -> list[Match]:
    """
    은하를 점수 순으로 늘어놓는다.

    :param theme: 판정된 주제 (anxiety, grief …). 없으면 MBTI 만 본다.
    :param user_mbti: 사용자 유형. 없으면 주제만 본다.
    :param exclude_center: 예수 은하를 빼고 열두 제자 중에서만 고른다.
    :param limit: 상위 몇 개까지.
    :param include_all:
        True 면 자동 추천 제외 목록까지 포함한다. 순위를 그대로 보고
        싶을 때(검증·디버깅)만 쓴다. 화면에서는 쓰지 않는다.

    ★ 동점은 은하 순서로 가른다.
      무작위로 흔들면 같은 질문에 매번 다른 인물이 나오고,
      "다른 인물로 바꾸기" 라는 동작이 의미를 잃는다.
    """
    results: list[Match] = []

    for g in _galaxies():
        if exclude_center and g.get("is_center"):
            continue
        if not include_all and g["id"] in NEVER_AUTO_RECOMMEND:
            continue

        t = topic_score(g["id"], theme)
        m = mbti_score(user_mbti, g["mbti"])
        total = TOPIC_WEIGHT * t + MBTI_WEIGHT * m

        results.append(
            Match(
                galaxy_id=g["id"],
                name=g["name"],
                score=round(total, 2),
                topic_score=round(t, 2),
                mbti_score=round(m, 2),
                reason=_reason(g["name"], theme_label, t, m),
            )
        )

    # 점수 내림차순, 동점이면 은하 순서 (결과가 흔들리지 않게)
    order = {g["id"]: g["order"] for g in _galaxies()}
    results.sort(key=lambda r: (-r.score, order.get(r.galaxy_id, 999)))

    return results[:limit] if limit else results


def recommend(
    theme: str | None = None,
    user_mbti: str | None = None,
    *,
    theme_label: str | None = None,
    exclude_center: bool = False,
) -> Match:
    """가장 잘 맞는 하나. 후보가 없으면 중심 은하로 떨어진다."""
    top = rank(theme, user_mbti, theme_label=theme_label, exclude_center=exclude_center, limit=1)
    if top:
        return top[0]

    center = next((g for g in _galaxies() if g.get("is_center")), _galaxies()[0])
    return Match(
        galaxy_id=center["id"],
        name=center["name"],
        score=0.0,
        topic_score=0.0,
        mbti_score=0.0,
        reason="지금 이야기를 나누기에 어울리는 곳입니다.",
    )
