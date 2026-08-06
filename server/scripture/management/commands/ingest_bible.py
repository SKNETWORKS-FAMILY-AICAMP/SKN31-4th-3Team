"""
성경전서 31,077절을 적재한다.

    python manage.py ingest_bible              # 본문만 (임베딩 없이)
    python manage.py ingest_bible --embed      # 임베딩까지 (Postgres 필요)
    python manage.py ingest_bible --embed --resume   # 중단된 지점부터

★ 본문과 임베딩을 나눠 둔 이유
  본문 적재는 몇 초면 끝나고 아무것도 필요 없다. 임베딩은 몇십 분이
  걸리고 모델이 떠 있어야 한다. 한 명령으로 묶으면 "그냥 데이터만
  넣어 보려던" 팀원이 매번 30분을 기다리게 된다.

★ 다시 돌려도 안전하다
  같은 참조는 덮어쓴다. 중간에 끊고 다시 시작해도 중복이 생기지 않는다.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from scripture.books import order_of
from scripture.models import BibleVerse, EmbeddingRun
from scripture.vectors import truncate
from scripture.tone import tone_of

BIBLE = Path(__file__).resolve().parents[4] / "data" / "bible_structured.json"

#: 한 번에 DB 에 넣는 행 수. 3만 개를 한 트랜잭션에 넣으면 메모리가 튄다.
DB_BATCH = 2000

#: 임베딩 진행률을 찍는 간격.
#:
#: ★ DB_BATCH(2,000)와 나눠 놓았다.
#:   같은 값을 쓰던 때는 첫 줄이 뜰 때까지 5분 넘게 아무 표시가 없었다.
#:   "시작은 된 건가" 를 묻게 되는 시간이고, 실제로 그 질문을 받았다.
#:   Ollama 요청은 어차피 128개씩 나가므로(OLLAMA_BATCH) 여기서 더
#:   잘게 쓴다고 느려지지 않는다.
EMBED_BATCH = 250


class Command(BaseCommand):
    help = "성경전서를 BibleVerse 로 적재한다"

    def add_arguments(self, parser):
        parser.add_argument("--embed", action="store_true", help="임베딩까지 만든다")
        parser.add_argument(
            "--resume",
            action="store_true",
            help="임베딩이 이미 있는 절은 건너뛴다",
        )
        parser.add_argument("--model", default="oll8b", help="임베딩 공급자 (--embed 일 때)")
        parser.add_argument("--limit", type=int, help="앞에서 N절만 (시험용)")

    def handle(self, *args, **opts):
        if not BIBLE.exists():
            raise CommandError(f"성경전서 파일이 없습니다: {BIBLE}")

        rows = json.loads(BIBLE.read_text(encoding="utf-8"))
        if opts["limit"]:
            rows = rows[: opts["limit"]]

        self._load_text(rows)

        if opts["embed"]:
            # ★ --limit 은 임베딩에도 걸린다.
            #   예전에는 본문 적재만 잘랐다. "200절만 재 보자" 로 부르면
            #   31,077절 전체가 시작됐다 — 시간을 재려던 사람이 몇 시간짜리
            #   작업을 걸어 놓게 된다.
            self._embed(opts["model"], resume=opts["resume"], limit=opts["limit"])

    # ── 본문 ────────────────────────────────────────────────────
    #
    # (정리 함수는 파일 아래쪽 _clean 에 있다)

    def _load_text(self, rows: list[dict]) -> None:
        start = time.time()
        objects = []
        scrubbed = 0
        for r in rows:
            code, chapter, verse = r["book"], int(r["chapter"]), int(r["verse"])
            content = _clean(r["content"])
            if content != r["content"]:
                scrubbed += 1
            objects.append(
                BibleVerse(
                    id=f"{code}.{chapter}.{verse}",
                    book_code=code,
                    book_order=order_of(code),
                    chapter=chapter,
                    verse=verse,
                    content=content,
                    tone=tone_of(code, chapter, verse).value,
                )
            )

        if scrubbed:
            self.stdout.write(f"  제어문자 정리 {scrubbed}절")

        with transaction.atomic():
            for i in range(0, len(objects), DB_BATCH):
                BibleVerse.objects.bulk_create(
                    objects[i : i + DB_BATCH],
                    update_conflicts=True,
                    update_fields=["book_order", "content", "tone"],
                    unique_fields=["id"],
                )

        total = BibleVerse.objects.count()
        seconds = time.time() - start
        self.stdout.write(f"본문 {len(objects):,}절 적재 ({seconds:.1f}초) · 표에 {total:,}절")

        # ★ 표를 세는 것만으로는 부족하다.
        #   tone 이 전부 neutral 이면 구간표가 안 걸린 것이고, 그건
        #   적재는 성공했는데 안전장치만 조용히 빠진 상태다.
        by_tone = {
            t: BibleVerse.objects.filter(tone=t).count()
            for t in ("neutral", "lament", "warning")
        }
        self.stdout.write(f"  성격: {by_tone}")
        if by_tone["warning"] == 0 and len(objects) > 1000:
            self.stderr.write(self.style.WARNING("  ⚠ warning 이 0건입니다 — tone 구간표를 확인하세요"))

    # ── 임베딩 ──────────────────────────────────────────────────

    def _embed(self, model_key: str, *, resume: bool, limit: int | None = None) -> None:
        if connection.vendor != "postgresql":
            raise CommandError(
                "임베딩은 Postgres 에서만 됩니다 (pgvector).\n"
                "  docker compose up -d db\n"
                "  DATABASE_URL=postgres://eden:eden-local-only@localhost:5432/eden"
            )

        from scripture.eval.providers import REGISTRY

        if model_key not in REGISTRY:
            raise CommandError(f"모르는 모델: {model_key} (가능: {', '.join(sorted(REGISTRY))})")

        embedder = REGISTRY[model_key]()
        if not type(embedder).available():
            raise CommandError(f"{model_key} 를 쓸 수 없습니다 — 키 또는 서버를 확인하세요")

        dim = self._column_dim()
        self.stdout.write(f"임베딩: {embedder.spec.name} → {dim}차원")
        if embedder.spec.dim != dim:
            # ★ 자르는 것이지 다시 학습하는 것이 아니다.
            #   Qwen3 는 Matryoshka 라 앞쪽 차원만 남겨도 의미가 유지된다.
            #   그렇지 않은 모델이면 이 경고가 실제 경고다.
            self.stdout.write(
                f"  ※ 모델은 {embedder.spec.dim}차원입니다. 앞 {dim}개만 쓰고 다시 정규화합니다."
            )

        pending = self._pending(resume)
        if limit:
            pending = pending[:limit]
        if not pending:
            self.stdout.write("할 일이 없습니다.")
            return

        self.stdout.write(f"  {len(pending):,}절 처리 (중단해도 --resume 으로 이어집니다)")

        start = time.time()
        done = 0
        for i in range(0, len(pending), EMBED_BATCH):
            chunk = pending[i : i + EMBED_BATCH]
            vectors = embedder.embed([c[1] for c in chunk], is_query=False)
            self._write(
                [(key, truncate(v, dim)) for (key, _), v in zip(chunk, vectors)]
            )
            done += len(chunk)
            rate = done / (time.time() - start)
            left = (len(pending) - done) / rate / 60 if rate else 0
            self.stdout.write(
                f"    {done:,}/{len(pending):,}  ({rate:.0f}절/초, 남은 시간 ~{left:.0f}분)",
                ending="\n",
            )
            self.stdout.flush()

        self._create_index(dim)

        # ★ 무엇으로 넣었는지 남긴다.
        #   질문을 다른 모델로 임베딩하면 오류 없이 결과만 틀린다.
        #   검색 쪽이 이 값을 보고 대조한다 (scripture/search.py).
        with connection.cursor() as cur:
            cur.execute("SELECT count(*) FROM scripture_bibleverse WHERE embedding IS NOT NULL")
            filled = cur.fetchone()[0]
        EmbeddingRun.objects.all().delete()
        EmbeddingRun.objects.create(
            model_key=model_key,
            model_name=embedder.spec.name,
            dim=dim,
            verses=filled,
        )

        self.stdout.write(self.style.SUCCESS(f"완료 ({(time.time() - start) / 60:.1f}분)"))

    def _column_dim(self) -> int:
        """실제 컬럼이 몇 차원인지 DB 에 물어본다."""
        with connection.cursor() as cur:
            cur.execute(
                "SELECT atttypmod FROM pg_attribute "
                "WHERE attrelid = 'scripture_bibleverse'::regclass AND attname = 'embedding'"
            )
            row = cur.fetchone()
        if not row:
            raise CommandError("embedding 컬럼이 없습니다. migrate 를 먼저 돌리세요.")
        return int(row[0])

    def _pending(self, resume: bool) -> list[tuple[str, str]]:
        with connection.cursor() as cur:
            sql = "SELECT id, content FROM scripture_bibleverse"
            if resume:
                sql += " WHERE embedding IS NULL"
            sql += " ORDER BY book_order, chapter, verse"
            cur.execute(sql)
            return cur.fetchall()

    def _write(self, pairs: list[tuple[str, list[float]]]) -> None:
        with connection.cursor() as cur:
            cur.executemany(
                "UPDATE scripture_bibleverse SET embedding = %s::vector WHERE id = %s",
                [(str(vec), key) for key, vec in pairs],
            )

    def _create_index(self, dim: int) -> None:
        """
        ★ 적재가 끝난 뒤에 만든다.
          빈 표에 HNSW 를 걸어 두면 삽입 3만 번마다 그래프를 고친다.
        """
        if dim > 2000:
            self.stderr.write(
                self.style.WARNING(
                    f"  ⚠ {dim}차원은 HNSW 한계(2000)를 넘어 인덱스를 만들지 않습니다.\n"
                    "    31,077절이면 전수 비교로도 동작하지만 느립니다."
                )
            )
            return

        self.stdout.write("  인덱스 생성 중…")
        with connection.cursor() as cur:
            cur.execute(
                "CREATE INDEX IF NOT EXISTS bibleverse_embedding_hnsw "
                "ON scripture_bibleverse USING hnsw (embedding vector_cosine_ops)"
            )


def _clean(text: str) -> str:
    """
    본문에서 제어문자를 걷어 낸다.

    ★ 실제로 있었던 일이다
      원본 JSON 의 세 절 — 삿 21:25, 습 3:20, 벧전 5:14 — 끝에 NUL(0x00)이
      붙어 있었다. 셋 다 각 책의 마지막 절이라, 원본이 고정 길이로
      패딩된 흔적이지 본문이 아니다.

    ★ SQLite 는 받고 Postgres 는 거부한다
      Postgres 의 text 는 NUL 을 담지 못한다("A string literal cannot
      contain NUL"). SQLite 로 개발하는 동안에는 그대로 저장되다가,
      Postgres 로 옮기는 순간 적재가 통째로 실패한다.

    ★ 줄바꿈·탭은 남긴다
      본문에 의미가 있을 수 있다. 지우는 것은 화면에도 못 나오고
      토크나이저만 흔드는 문자들이다.
    """
    cleaned = "".join(ch for ch in text if ch >= " " or ch in "\n\t")
    return cleaned.strip()


