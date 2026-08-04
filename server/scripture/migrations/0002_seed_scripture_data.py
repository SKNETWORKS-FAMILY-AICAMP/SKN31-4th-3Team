"""
scripture/migrations/0002_seed_scripture_data.py
────────────────────────────────────────────────────────────────────────
마이그레이션이 끝나면 은하·구절이 들어 있다.

★ 왜 마이그레이션에 넣는가

  `migrate` 는 표만 만든다. 데이터는 넣지 않는다.
  그래서 DB 를 초기화하고 `migrate` 만 돌리면 표는 생기는데 안이 비어,
  화면에서 별을 눌렀을 때 "찾을 수 없는 별입니다" 가 뜬다.

  이건 사람이 명령 하나를 잊어서 생기는 문제가 아니라, **잊을 수 있게
  만들어 둔 설계**의 문제다. 실제로 DB 를 초기화할 때마다 밟았다.

  seed 를 마이그레이션에 넣으면 `migrate` 한 번으로 항상 쓸 수 있는
  상태가 된다. 새로 합류한 팀원도, CI 도, 배포 스크립트도 마찬가지다.

★ 여러 번 돌아도 안전하다
  update_or_create 라서 기존 행을 덮어쓸 뿐 지우지 않는다.
  대화 기록(chat)은 건드리지 않는다.

★ 되돌릴 때는 지우지 않는다
  reverse 에서 구절을 삭제하면, 그 구절을 참조하던 대화(seed_verse)가
  함께 끊긴다. 마이그레이션을 되감는 것과 사용자 데이터를 버리는 것은
  다른 일이다. 그래서 reverse 는 아무것도 하지 않는다.

★ 시드 파일은 손으로 만들지 않는다
  server/scripts/export_seed.mjs 가 frontend/src/data 에서 뽑는다.
  구절 702개를 사람이 베끼면 반드시 어긋나고, 어긋나도 티가 안 난다.
"""

import json
from pathlib import Path

from django.db import migrations

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def seed(apps, schema_editor):
    """
    ★ 모델을 직접 import 하지 않고 apps.get_model 을 쓴다.
      마이그레이션은 "그 시점의 모델"로 돌아야 한다. 나중에 필드가
      바뀌면 직접 import 한 모델과 어긋나 과거 마이그레이션이 깨진다.
    """
    Galaxy = apps.get_model("scripture", "Galaxy")
    Verse = apps.get_model("scripture", "Verse")

    for row in load("galaxies.json"):
        Galaxy.objects.update_or_create(
            id=row["id"],
            defaults={
                "name": row["name"],
                "role": row["role"],
                "mbti": row["mbti"],
                "tint": row["tint"] or "",
                "is_center": row["is_center"],
                "order": row["order"],
            },
        )

    for row in load("verses.json"):
        Verse.objects.update_or_create(
            id=row["id"],
            defaults={
                "galaxy_id": row["galaxy_id"],
                "order": row["order"],
                "book_code": row["book_code"],
                "book_name": row["book_name"],
                "chapter": row["chapter"],
                "verse": row["verse"],
                "depth": row["depth"],
                "summary": row["summary"],
                "themes": row["themes"],
                "motif": row["motif"],
                "magnitude": row["magnitude"],
                "excerpt": row.get("excerpt", ""),
                "attribution": row.get("attribution", ""),
                "story": row.get("story", ""),
                "meditation": row.get("meditation", ""),
                "related_prompts": row.get("related_prompts", []),
            },
        )


def unseed(apps, schema_editor):
    """되감아도 지우지 않는다 (위 주석 참조)."""
    return


class Migration(migrations.Migration):
    dependencies = [("scripture", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
