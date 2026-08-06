"""
구절 검색 — 벡터 + 주제 + 성격.

★ 이 자리가 무엇인가
  LLM 이 답을 쓸 때 참고할 구절을 고른다. 최종 답이 아니라 사전(辭典)을
  펼쳐 주는 단계다. 그래서 정확히 하나를 맞히는 것보다, 쓸 만한 것이
  상위 몇 개 안에 들어오는 쪽이 중요하다.

★ 벡터만 쓰지 않는 이유
  임베딩은 "말이 비슷한 것" 을 찾는다. 상담에서는 그것만으로 부족하다.
    - 탄식·경고 구절이 위로를 구하는 질문에 올라온다 (tone)
    - 계보·측량 같은 구절이 문장 유사도만으로 올라온다 (usable)
    - 같은 주제로 사람이 이미 골라 둔 702절이 있다 (theme)
  셋을 가중치로 섞는다. 벡터가 주고, 나머지는 눌러 주는 역할이다.

★ Neo4j 는 나중에 여기 붙는다
  감정·관계 그래프가 적재되면 `graph_boost` 자리에서 후보에 가중치를
  더한다. 지금은 그 함수가 빈 dict 를 돌려준다 — 없는 것을 있는 척하지
  않고, 붙을 자리만 만들어 둔다.

★ 서버가 없거나 임베딩이 비어도 죽지 않는다
  Postgres 가 아니거나 벡터가 없으면 예전 방식(주제 사전)으로 물러선다.
  검색이 안 되는 것과 화면이 안 뜨는 것은 다른 문제다.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from django.conf import settings
from django.db import connection

from .books import name_of
from .intents import match_intent
from .models import EmbeddingRun
from .tone import PENALTY, Tone
from .vectors import truncate

#: 질문을 임베딩할 모델. 적재에 쓴 것과 반드시 같아야 한다.
#:
#: ★ 기본값을 두되 DB 기록이 이긴다.
#:   EmbeddingRun 에 남은 값이 있으면 그걸 쓴다. 설정만 믿으면
#:   "설정은 바꿨는데 적재는 안 했다" 를 잡을 수 없다.
DEFAULT_MODEL = "oll8b"

#: 벡터에서 몇 개를 먼저 건져 올릴까. 여기서 걸러 내고 상위 k 개를 낸다.
CANDIDATES = 60

#: 사람이 같은 주제로 골라 둔 구절에 주는 가산점.
#:
#: ★ 크게 주지 않는다.
#:   크게 주면 결국 예전의 주제 사전으로 돌아간다. 임베딩이 찾은 것을
#:   흔들지 않는 선에서, 동점일 때 사람의 판단이 이기게 하는 정도다.
THEME_BONUS = 0.06


@dataclass
class Hit:
    """검색이 건진 구절 하나."""

    id: str
    ref: str
    content: str
    tone: str
    galaxy_id: str
    #: 0~1. 벡터 유사도에 가중치를 반영한 뒤의 값이다.
    score: float
    #: 왜 올라왔는지 — 사람이 읽을 수 있는 표시. 디버깅과 화면 양쪽에 쓴다.
    signals: list[str] = field(default_factory=list)


def ready() -> bool:
    """벡터 검색을 쓸 수 있는가."""
    if connection.vendor != "postgresql":
        return False
    return EmbeddingRun.objects.exists()


def active_model() -> str:
    """
    지금 DB 에 들어 있는 벡터를 만든 모델.

    ★ 설정이 아니라 DB 를 믿는다.
      적재 기록이 있으면 그것이 사실이다. 설정은 아직 안 돌린 계획일 수
      있다. 둘이 다르면 검색은 DB 를 따라간다 — 그래야 결과가 맞는다.
    """
    run = EmbeddingRun.objects.first()
    if run:
        return run.model_key
    return getattr(settings, "EMBEDDING_MODEL", DEFAULT_MODEL)


def _embed_query(question: str) -> list[float] | None:
    """질문 하나를 적재와 같은 모델·차원으로 임베딩한다."""
    from .eval.providers import REGISTRY

    key = active_model()
    factory = REGISTRY.get(key)
    if factory is None:
        return None

    embedder = factory()
    if not type(embedder).available():
        # 모델이 안 떠 있다. 검색을 포기하고 폴백으로 간다.
        return None

    run = EmbeddingRun.objects.first()
    dim = run.dim if run else embedder.spec.dim

    vectors = embedder.embed([question], is_query=True)
    if not vectors:
        return None
    return truncate(vectors[0], dim)


def _graph_boost(ids: list[str]) -> dict[str, float]:
    """
    Neo4j 의 감정·관계 그래프에서 오는 가산점.

    ★ 아직 비어 있다.
      그래프가 적재되면(#116) 여기서 질문의 감정과 이어지는 구절에
      가중치를 얹는다. 지금 빈 dict 를 돌려주는 것은 게으름이 아니라,
      "없는 것을 있는 척하지 않는다" 는 선택이다. 붙는 순간 이 함수
      하나만 채우면 되고, 부르는 쪽은 바뀌지 않는다.

    :param ids: 벡터가 건진 후보들의 id
    :return: id → 가산점 (0 이면 없는 것과 같다)
    """
    return {}


def search(question: str, *, k: int = 3, offset: int = 0, use_tone: bool = True) -> list[Hit]:
    """
    질문에 맞는 구절을 고른다.

    :param k: 돌려줄 개수. 화면은 3개를 보여 준다.
    :param offset: 순위에서 몇 개를 건너뛸지. "다른 구절 보기" 가 쓴다.
    :param use_tone: 성격 게이트를 쓸지. 끄고 켠 차이를 재려는 스크립트가 있다.
    """
    if not ready():
        return []

    vector = _embed_query(question)
    if vector is None:
        return []

    theme = match_intent(question)

    # ★ 후보를 넉넉히 건지고 나서 거른다.
    #   SQL 에서 한 번에 k 개만 뽑으면, 걸러 낸 자리를 채울 것이 없다.
    #   경고 구절 셋이 상위에 오면 화면에 아무것도 안 남는다.
    #
    # ★ usable 은 SQL 에서 거른다.
    #   상담과 무관한 8.5% 는 어차피 쓸 일이 없다. 가져와서 버리는 것보다
    #   안 가져오는 편이 싸다.
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT id, book_code, chapter, verse, content, tone, galaxy_id,
                   1 - (embedding <=> %s::vector) AS similarity
            FROM scripture_bibleverse
            WHERE embedding IS NOT NULL AND usable = true
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            [str(vector), str(vector), CANDIDATES],
        )
        rows = cur.fetchall()

    if not rows:
        return []

    boosts = _graph_boost([r[0] for r in rows])

    hits: list[Hit] = []
    for vid, book, chapter, verse, content, tone, galaxy_id, similarity in rows:
        score = float(similarity)
        signals = []

        # 성격 — 경고 구절은 아예 뺀다 (tone.PENALTY 의 0.0)
        #
        # ★ 점수만 0 으로 만들면 목록 맨 아래에 남는다.
        #   k 개를 채우다 보면 결국 화면에 올라온다. 뺄 것은 빼야 한다.
        if use_tone:
            penalty = PENALTY.get(Tone(tone), 1.0)
            if penalty == 0.0:
                continue
            if penalty != 1.0:
                score *= penalty
                signals.append(f"tone:{tone}")

        # 주제 — 사람이 같은 주제로 골라 둔 것이면 조금 올린다
        if theme and _curated_theme(vid) == theme:
            score += THEME_BONUS
            signals.append(f"theme:{theme}")

        # 그래프 — 지금은 늘 0 이다
        boost = boosts.get(vid, 0.0)
        if boost:
            score += boost
            signals.append("graph")

        hits.append(
            Hit(
                id=vid,
                ref=f"{name_of(book)} {chapter}:{verse}",
                content=content,
                tone=tone,
                galaxy_id=galaxy_id or "",
                score=score,
                signals=signals,
            )
        )

    hits.sort(key=lambda h: h.score, reverse=True)

    if not hits:
        return []

    # ★ "다른 구절 보기" 는 순위에서 다음 묶음을 준다.
    #   예전에는 손으로 쓴 표를 돌려 가며 보여 줬다. 구절이 검색에서
    #   오게 된 뒤로는 몇 번을 눌러도 같은 상위 3개가 나와서, 버튼이
    #   죽은 것처럼 보였다.
    #
    # ★ 끝에 닿으면 처음으로 돌아온다.
    #   "더 없습니다" 를 띄우고 버튼을 잠그는 방법도 있지만, 후보 수는
    #   질문마다 다르다. 어떤 질문에서는 두 번 만에 잠기고 어떤 질문에서는
    #   다섯 번 눌린다 — 같은 버튼이 매번 다르게 굴면 고장으로 읽힌다.
    #   한 바퀴 돌아 처음 것이 다시 나오는 편이 예측 가능하다.
    start = offset % len(hits)
    window = hits[start : start + k]
    if len(window) < k:
        window += hits[: k - len(window)]
    return window


_CURATED_THEMES: dict[str, str] | None = None


def _curated_theme(verse_id: str) -> str | None:
    """
    큐레이션 702절이 이 구절에 붙여 둔 주제.

    ★ 한 번만 읽는다.
      질문마다 60개 후보에 대해 조회하면 요청 하나에 쿼리가 60번 난다.
      702개짜리 표라 통째로 들고 있어도 몇십 KB 다.
    """
    global _CURATED_THEMES
    if _CURATED_THEMES is None:
        from .models import Verse

        _CURATED_THEMES = {}
        for v in Verse.objects.all().only("book_code", "chapter", "verse", "themes"):
            key = f"{v.book_code}.{v.chapter}.{v.verse}"
            themes = v.themes if isinstance(v.themes, list) else []
            if themes:
                _CURATED_THEMES[key] = themes[0]

    return _CURATED_THEMES.get(verse_id)
