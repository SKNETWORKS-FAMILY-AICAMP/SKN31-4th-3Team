"""
seed_scripture
────────────────────────────────────────────────────────────────────────
프런트가 저작한 데이터를 DB 에 적재한다.

    python manage.py seed_scripture

★ fixtures 는 손으로 만들지 않는다.
  server/scripts/export_seed.mjs 가 frontend/src/data 에서 뽑아낸다.
  구절 702개를 사람이 베끼면 반드시 어긋나고, 어긋나도 티가 안 난다.

★ 여러 번 돌려도 안전하다 (upsert).
  배포 때마다 실행해도 기존 대화 기록에는 손대지 않는다.
"""

from __future__ import annotations

import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from scripture.models import Galaxy, Verse

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


class Command(BaseCommand):
    help = "은하·구절 시드 데이터를 적재합니다 (여러 번 실행해도 안전)."

    def handle(self, *args, **options):
        galaxies = json.loads((FIXTURES / "galaxies.json").read_text(encoding="utf-8"))
        verses = json.loads((FIXTURES / "verses.json").read_text(encoding="utf-8"))

        with transaction.atomic():
            for row in galaxies:
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

            for row in verses:
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
                        "excerpt": row["excerpt"],
                        "attribution": row["attribution"],
                        "story": row["story"],
                        "meditation": row["meditation"],
                        "related_prompts": row["related_prompts"],
                    },
                )

        self.stdout.write(
            self.style.SUCCESS(f"은하 {len(galaxies)}개 · 구절 {len(verses)}개 적재 완료")
        )
