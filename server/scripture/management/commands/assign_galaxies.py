"""
성경전서 구절을 13은하에 배정한다.

    python manage.py assign_galaxies                 # 주제 기반 (임베딩 없이)
    python manage.py assign_galaxies --by-embedding  # 임베딩 최근접 (Postgres 필요)
    python manage.py assign_galaxies --canvas 150    # 은하당 캔버스에 올릴 개수

★ 두 단계다
  1) usable — 상담과 무관한 구절을 뺀다 (scripture/usage.py)
  2) galaxy_id — 남은 것을 13은하에 나눈다

★ 배정과 노출은 다르다
  28,424절을 전부 캔버스에 올리면 매 프레임 그만큼을 투영하고 정렬한다.
  지금 702개를 그리는 구조에서 40배다. 검색은 배정된 전부를 쓰고,
  화면에는 은하마다 상위 N개만 올린다(--canvas).

★ 두 가지 배정 방법
  (가) 주제 기반 — 구절 본문을 주제 사전에 대고, 그 주제를 가장 많이
       가진 은하로 보낸다. 임베딩이 없어도 되고 즉시 끝난다.
       대신 사전에 없는 표현은 놓친다.
  (나) 임베딩 최근접 — 이미 사람이 배정한 큐레이션 702절 중 가장
       가까운 것을 찾아 그 은하를 물려받는다. 사람의 판단을 그대로
       퍼뜨리는 방식이라 결이 잘 맞는다. 임베딩이 필요하다.

  (나)가 낫지만 (가)로도 화면은 채워진다. 임베딩 적재가 끝나면
  --by-embedding 으로 다시 돌리면 된다 — 덮어쓴다.
"""

from __future__ import annotations

import hashlib
import re
import time
from collections import Counter, defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from scripture.intents import FALLBACK, _sources
from llm_core.matching import _theme_share
from scripture.models import BibleVerse, Galaxy
from scripture.usage import is_usable

#: 은하마다 캔버스에 올릴 기본 개수.
#:
#: ★ 702 → 1,950 이면 약 2.8배다.
#:   지금 구조가 감당하는 선에서 "확실히 늘었다" 가 보이는 값으로 잡았다.
#:   더 올리려면 프레임을 재 보고 정해야 한다.
DEFAULT_CANVAS_PER_GALAXY = 150

DB_BATCH = 2000


class Command(BaseCommand):
    help = "성경전서 구절을 13은하에 배정한다"

    def add_arguments(self, parser):
        parser.add_argument(
            "--by-embedding",
            action="store_true",
            help="큐레이션 702절 중 최근접을 찾아 그 은하를 물려받는다",
        )
        parser.add_argument(
            "--canvas",
            type=int,
            default=DEFAULT_CANVAS_PER_GALAXY,
            help="은하당 캔버스에 올릴 구절 수",
        )

    def handle(self, *args, **opts):
        if not BibleVerse.objects.exists():
            raise CommandError("성경전서가 비어 있습니다. 먼저 ingest_bible 을 돌리세요.")
        if not Galaxy.objects.exists():
            raise CommandError("은하가 없습니다. 먼저 seed_scripture 를 돌리세요.")

        self._mark_usable()
        if opts["by_embedding"]:
            self._assign_by_embedding()
        else:
            self._assign_by_theme()
        self._pick_canvas(opts["canvas"])
        self._report()

    # ── 1단계: 쓸 것과 안 쓸 것 ─────────────────────────────────

    def _mark_usable(self) -> None:
        start = time.time()
        skipped = []
        for v in BibleVerse.objects.all().iterator(chunk_size=DB_BATCH):
            ok = is_usable(v.book_code, v.chapter, v.verse)
            if v.usable != ok:
                v.usable = ok
                skipped.append(v)

        with transaction.atomic():
            for i in range(0, len(skipped), DB_BATCH):
                BibleVerse.objects.bulk_update(skipped[i : i + DB_BATCH], ["usable"])

        total = BibleVerse.objects.count()
        out = BibleVerse.objects.filter(usable=False).count()
        self.stdout.write(
            f"1) 제외 {out:,}절 ({out / total:.1%}) · 남은 것 {total - out:,}절 "
            f"({time.time() - start:.1f}초)"
        )

    # ── 2단계: 은하 배정 ────────────────────────────────────────

    def _assign_by_theme(self) -> None:
        """
        본문을 주제 사전에 대고, 그 주제를 가장 많이 가진 은하로 보낸다.

        ★ 주제 → 은하는 큐레이션에서 나온다.
          '불안 → 다대오' 같은 표를 손으로 만들지 않는다. 사람이 이미
          702절을 배정해 뒀고, 그 안의 주제 분포가 곧 그 은하의 성격이다.
        """
        start = time.time()
        table = _galaxy_distribution()
        patterns = _theme_patterns()

        assigned, counts = [], Counter()
        for v in BibleVerse.objects.filter(usable=True).iterator(chunk_size=DB_BATCH):
            theme = _match_theme(v.content, patterns)
            galaxy = _pick_galaxy(theme, v.id, table) if theme else ""
            if v.galaxy_id != galaxy:
                v.galaxy_id = galaxy
                assigned.append(v)
            if galaxy:
                counts[galaxy] += 1

        with transaction.atomic():
            for i in range(0, len(assigned), DB_BATCH):
                BibleVerse.objects.bulk_update(assigned[i : i + DB_BATCH], ["galaxy_id"])

        placed = sum(counts.values())
        self.stdout.write(
            f"2) 주제 기반 배정 {placed:,}절 ({time.time() - start:.1f}초)\n"
            f"   주제를 못 찾은 구절은 검색에는 남고 은하에는 안 붙습니다."
        )

    def _assign_by_embedding(self) -> None:
        """큐레이션 702절 중 최근접을 찾아 그 은하를 물려받는다."""
        if connection.vendor != "postgresql":
            raise CommandError("--by-embedding 은 Postgres 에서만 됩니다 (pgvector).")

        with connection.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM scripture_bibleverse WHERE embedding IS NOT NULL"
            )
            if cur.fetchone()[0] == 0:
                raise CommandError(
                    "임베딩이 비어 있습니다.\n"
                    "  python manage.py ingest_bible --embed"
                )

        start = time.time()
        # ★ 큐레이션 구절의 임베딩은 성경전서 표에서 빌린다.
        #   같은 절이므로 따로 계산할 이유가 없다.
        with connection.cursor() as cur:
            cur.execute(
                """
                WITH seed AS (
                    SELECT b.id, b.embedding, v.galaxy_id
                    FROM scripture_verse v
                    JOIN scripture_bibleverse b
                      ON b.book_code = v.book_code
                     AND b.chapter = v.chapter
                     AND b.verse = v.verse
                    WHERE b.embedding IS NOT NULL
                )
                UPDATE scripture_bibleverse t
                SET galaxy_id = (
                    SELECT s.galaxy_id FROM seed s
                    ORDER BY t.embedding <=> s.embedding
                    LIMIT 1
                )
                WHERE t.usable = true AND t.embedding IS NOT NULL
                """
            )
            touched = cur.rowcount

        self.stdout.write(
            f"2) 임베딩 최근접 배정 {touched:,}절 ({(time.time() - start) / 60:.1f}분)"
        )

    # ── 3단계: 캔버스에 올릴 것 고르기 ──────────────────────────

    def _pick_canvas(self, per_galaxy: int) -> None:
        """
        은하마다 앞에서 N개를 캔버스에 올린다.

        ★ 정경 순서로 자른다.
          점수순으로 고르면 창세기와 요한복음만 남아 은하가 편중된다.
          성경 순서로 고르면 구약·신약이 고루 섞이고, 무엇보다
          "왜 이 구절이 화면에 있는가" 를 설명할 수 있다.
        """
        start = time.time()
        BibleVerse.objects.filter(on_canvas=True).update(on_canvas=False, order=0)

        picked = []
        for galaxy_id in Galaxy.objects.values_list("id", flat=True):
            rows = (
                BibleVerse.objects.filter(usable=True, galaxy_id=galaxy_id)
                .order_by("book_order", "chapter", "verse")[:per_galaxy]
            )
            for i, v in enumerate(rows):
                v.on_canvas = True
                v.order = i
                picked.append(v)

        with transaction.atomic():
            for i in range(0, len(picked), DB_BATCH):
                BibleVerse.objects.bulk_update(picked[i : i + DB_BATCH], ["on_canvas", "order"])

        self.stdout.write(f"3) 캔버스 {len(picked):,}개 ({time.time() - start:.1f}초)")

    # ── 결과 ────────────────────────────────────────────────────

    def _report(self) -> None:
        self.stdout.write("")
        head = f"   {'은하':12} {'배정':>8} {'캔버스':>8}"
        self.stdout.write(head)
        self.stdout.write("   " + "─" * (len(head) - 3))

        empty = []
        for g in Galaxy.objects.all():
            n = BibleVerse.objects.filter(galaxy_id=g.id, usable=True).count()
            c = BibleVerse.objects.filter(galaxy_id=g.id, on_canvas=True).count()
            self.stdout.write(f"   {g.name:12} {n:8,} {c:8,}")
            if n == 0:
                empty.append(g.name)

        unplaced = BibleVerse.objects.filter(usable=True, galaxy_id="").count()
        self.stdout.write(f"\n   은하 없음 {unplaced:,}절 (검색에는 남습니다)")

        # ★ 빈 은하가 있으면 화면에 구멍이 뚫린다.
        if empty:
            self.stderr.write(
                self.style.WARNING(f"   ⚠ 배정이 0인 은하: {', '.join(empty)}")
            )


# ── 주제 판정 ───────────────────────────────────────────────────


def _theme_patterns() -> dict[str, re.Pattern]:
    """
    주제별 키워드를 정규식 하나로 묶는다.

    ★ 3만 절 × 12주제 × 키워드 수만큼 in 연산을 돌면 느리다.
      주제마다 정규식 하나로 합치면 한 번의 스캔으로 끝난다.
    """
    out = {}
    for theme, words in _sources()["keywords"].items():
        if theme in (FALLBACK, "crisis"):
            continue
        out[theme] = re.compile("|".join(re.escape(w) for w in words))
    return out


def _match_theme(text: str, patterns: dict[str, re.Pattern]) -> str:
    """
    가장 많이 걸린 주제. 하나도 안 걸리면 빈 문자열.

    ★ 첫 번째로 걸린 것을 쓰지 않는다.
      사전 순서가 곧 우선순위가 되어 버린다. 개수로 고르면 적어도
      "이 구절에 그 주제 표현이 더 많다" 는 근거가 있다.
    """
    counts = {t: len(p.findall(text)) for t, p in patterns.items()}
    theme, n = max(counts.items(), key=lambda kv: kv[1], default=("", 0))
    return theme if n else ""


def _galaxy_distribution() -> dict[str, list[tuple[str, float]]]:
    """
    주제 → [(은하, 누적비중)] 목록.

    ★ 한 주제를 한 은하가 독식하지 않는다.
      처음엔 "그 주제 비중이 가장 높은 은하" 하나에 전부 보냈다.
      12주제 / 13은하이므로 최대 12은하만 채워지고, 실제로는 여러 주제의
      1등이 겹쳐서 3개 은하가 0개로 남았다. 화면에 빈 성운이 세 개 생긴다.

      비중대로 나눠 준다. '불안' 구절의 30%를 다대오가 큐레이션했다면
      새로 들어오는 불안 구절의 30%도 다대오로 간다. 은하의 성격이
      희석되지 않으면서 모두가 채워진다.

    ★ 비중은 큐레이션에서 나온다
      '불안 → 다대오' 같은 표를 손으로 만들지 않는다. 사람이 이미 702절을
      배정해 뒀고, 그 안의 주제 분포가 곧 그 은하의 성격이다.
    """
    shares = _theme_share()
    by_theme: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for galaxy_id, themes in shares.items():
        for theme, share in themes.items():
            if share > 0:
                by_theme[theme].append((galaxy_id, share))

    table: dict[str, list[tuple[str, float]]] = {}
    for theme, rows in by_theme.items():
        # 은하 id 로 정렬해 두면 실행마다 같은 결과가 나온다
        rows.sort()
        total = sum(share for _, share in rows)
        running = 0.0
        cumulative = []
        for galaxy_id, share in rows:
            running += share / total
            cumulative.append((galaxy_id, running))
        table[theme] = cumulative
    return table


def _pick_galaxy(theme: str, verse_id: str, table: dict[str, list[tuple[str, float]]]) -> str:
    """
    비중에 따라 은하 하나를 고른다.

    ★ 난수를 쓰지 않는다.
      구절 id 를 해시해 0~1 사이 값을 만든다. 같은 구절은 몇 번을 돌려도
      같은 은하로 간다. 난수면 명령을 다시 돌릴 때마다 별이 은하 사이를
      건너다니고, 사용자가 어제 본 구절을 오늘 못 찾는다.
    """
    rows = table.get(theme)
    if not rows:
        return ""

    digest = hashlib.md5(verse_id.encode()).digest()
    point = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF

    for galaxy_id, ceiling in rows:
        if point <= ceiling:
            return galaxy_id
    return rows[-1][0]
