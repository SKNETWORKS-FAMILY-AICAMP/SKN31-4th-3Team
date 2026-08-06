"""
BibleVerse 에 임베딩 컬럼과 인덱스를 붙인다. Postgres 일 때만.

★ 왜 모델 필드가 아니라 raw SQL 인가
  pgvector 의 vector 타입은 Postgres 전용이다. 모델에 VectorField 를
  올리면 SQLite 로 개발하거나 테스트하는 사람의 migrate 가 그 자리에서
  죽는다. 벡터 검색을 못 쓰는 것과 앱이 아예 안 뜨는 것은 다른 문제다.

★ 차원을 1024 로 잡은 이유 — 세 가지 제약이 겹친다
  1) pgvector 의 HNSW 인덱스는 2,000차원까지다. Qwen3-Embedding-8B 는
     4,096차원이라 그대로는 인덱스를 못 만든다.
  2) 4,096차원 × 31,077절 = 약 509MB. db.t4g.micro(1GB)에서 인덱스 없이
     매 질의마다 전부 읽으면 몇 초가 걸린다.
  3) Qwen3-Embedding 은 Matryoshka 로 학습돼 앞쪽 차원만 잘라 써도
     의미가 유지된다(모델 카드가 32~4096 사이를 명시한다). 1024 로
     자르면 127MB 가 되고 HNSW 도 걸린다.

  잘라도 품질이 유지되는지는 가정이 아니라 확인할 일이다.
  scripts/bench_embeddings.py --dims 1024 로 재 보고 정한다.

★ 되돌리기는 컬럼만 지운다
  확장(vector)은 남긴다. 다른 표가 쓰고 있을 수 있고, DROP EXTENSION 은
  그걸 쓰는 컬럼을 함께 지운다.
"""

from django.conf import settings
from django.db import migrations

#: 저장할 차원. settings.EMBEDDING_DIM 으로 덮을 수 있다.
#: 바꾸면 적재를 다시 해야 한다 — 섞이면 검색이 조용히 틀린다.
DEFAULT_DIM = 1024


def dim() -> int:
    return int(getattr(settings, "EMBEDDING_DIM", DEFAULT_DIM))


def add_column(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    d = dim()
    schema_editor.execute(
        f"ALTER TABLE scripture_bibleverse ADD COLUMN IF NOT EXISTS embedding vector({d})"
    )
    # ★ 인덱스는 적재가 끝난 뒤에 만드는 편이 훨씬 빠르다.
    #   빈 표에 HNSW 를 걸어 두면 3만 번의 삽입마다 그래프를 고친다.
    #   scripts/ingest_bible.py 가 마지막에 만든다.


def drop_column(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("ALTER TABLE scripture_bibleverse DROP COLUMN IF EXISTS embedding")


class Migration(migrations.Migration):

    dependencies = [
        ("scripture", "0004_bibleverse"),
    ]

    operations = [
        migrations.RunPython(add_column, drop_column),
    ]
