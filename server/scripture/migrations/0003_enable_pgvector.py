"""
pgvector 확장을 켠다.

★ 왜 마이그레이션인가
  손으로 `CREATE EXTENSION vector;` 를 치게 하면, 팀원 중 한 명은
  반드시 빠뜨린다. 그리고 그 사람은 "왜 나만 검색이 안 되지" 를
  한참 뒤에야 발견한다. RDS 를 새로 만들 때도 같은 일이 생긴다.

★ 왜 조건을 다는가
  SQLite 에는 이 확장이 없다. 조건 없이 실행하면 DB 없이 clone 만 한
  팀원의 `migrate` 가 첫 줄에서 죽는다. 벡터 검색을 못 쓰는 것과
  앱이 아예 안 뜨는 것은 다른 문제다.

★ 되돌리기는 비워 둔다
  DROP EXTENSION 은 그 확장을 쓰는 컬럼을 함께 지운다. 마이그레이션을
  한 칸 되감았을 뿐인데 31,077개의 임베딩이 사라지는 일은 없어야 한다.
"""

from django.db import migrations


def enable_vector(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("CREATE EXTENSION IF NOT EXISTS vector")


class Migration(migrations.Migration):

    dependencies = [
        ("scripture", "0002_seed_scripture_data"),
    ]

    operations = [
        migrations.RunPython(enable_vector, migrations.RunPython.noop),
    ]
