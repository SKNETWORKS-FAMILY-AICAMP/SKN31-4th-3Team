"""
Neo4j 에 무엇이 들어 있는지 읽어 온다.

    python manage.py graph_probe
    python manage.py graph_probe --verse "요 3:16"

★ 코드를 쓰기 전에 이걸 먼저 돌린다
  적재는 팀원이 했고 스키마는 우리가 정하지 않았다. 라벨 이름을
  짐작해서 Cypher 를 쓰면, 결과가 비었을 때 원인이 연결·이름·데이터
  셋 중 무엇인지 알 수 없다.

★ 값을 화면에 찍지만 비밀은 안 찍는다
  URI 는 호스트만, 비밀번호는 길이만 보여 준다. 이 출력을 그대로
  복사해 공유해도 안전해야 한다.
"""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand

from scripture import graph


class Command(BaseCommand):
    help = "Neo4j Aura 에 적재된 라벨·관계·속성을 읽어 온다"

    def add_arguments(self, parser):
        parser.add_argument(
            "--verse",
            default="",
            help='구절 하나를 찍어 본다 (예: "요 3:16"). 무엇과 이어져 있는지 보여 준다.',
        )

    def handle(self, *args, **opts):
        self._show_settings()

        if not graph.enabled():
            self.stdout.write(
                self.style.WARNING(
                    "\nNEO4J_URI 또는 NEO4J_PASSWORD 가 비어 있습니다.\n"
                    "  .env (로컬) 또는 .env.prod (배포) 에 채우고 다시 돌리세요.\n"
                    "  값이 없어도 검색과 상담은 그대로 돕니다."
                )
            )
            return

        schema = graph.probe()
        if not schema.reachable:
            self.stdout.write(
                self.style.ERROR(
                    "\n연결은 됐지만 라벨이 하나도 없습니다.\n"
                    "  · 적재가 아직 안 끝났거나\n"
                    "  · 다른 데이터베이스를 보고 있거나 (Aura 는 기본이 neo4j)\n"
                    "  · 자격 증명이 다른 인스턴스의 것일 수 있습니다."
                )
            )
            return

        self._show_schema(schema)

        if opts["verse"]:
            self._show_verse(opts["verse"])

        graph.close()

    # ── 출력 ────────────────────────────────────────────────────

    def _show_settings(self) -> None:
        uri = getattr(settings, "NEO4J_URI", "")
        user = getattr(settings, "NEO4J_USER", "")
        password = getattr(settings, "NEO4J_PASSWORD", "")

        # ★ 호스트만 보여 준다. 인스턴스 id 는 비밀이 아니지만 굳이 다 찍지 않는다.
        host = uri.split("//")[-1] if uri else "(없음)"

        self.stdout.write("── 설정 ────────────────────────────────────────")
        self.stdout.write(f"  URI       {host}")
        self.stdout.write(f"  USER      {user or '(없음)'}")
        self.stdout.write(f"  PASSWORD  {'*' * 8 + f' ({len(password)}자)' if password else '(없음)'}")

    def _show_schema(self, schema: graph.Schema) -> None:
        self.stdout.write("\n── 라벨 ────────────────────────────────────────")
        for label in schema.labels:
            count = schema.counts.get(label, 0)
            props = ", ".join(schema.properties.get(label, [])) or "(속성 없음)"
            self.stdout.write(f"  {label:20} {count:>8,}개")
            self.stdout.write(f"  {'':20} 속성: {props}")

        self.stdout.write("\n── 관계 ────────────────────────────────────────")
        for rel in schema.relationships:
            self.stdout.write(f"  {rel}")

        self.stdout.write("\n── 연결 모양 ───────────────────────────────────")
        for pattern in schema.patterns:
            self.stdout.write(f"  {pattern}")

    def _show_verse(self, key: str) -> None:
        """
        구절 하나가 무엇과 이어져 있는지.

        ★ 처음에는 모든 속성을 훑었다.
          라벨 이름을 모르던 때의 코드다. 그런데 `toString(n[p])` 는
          배열 속성(예: contexts: ['grief'])에서 터진다. 스키마를 알게
          된 지금은 Verse.ref 로 바로 찾으면 된다 — 빠르고 안 터진다.
        """
        self.stdout.write(f'\n── "{key}" 주변 ────────────────────────────────')

        rows = graph.query(
            "MATCH (v:Verse {ref: $key}) RETURN properties(v) AS props LIMIT 1",
            key=key,
        )
        if not rows:
            # ★ "없다" 와 "못 읽었다" 를 가른다.
            #   둘 다 빈 목록으로 오지만 해야 할 일이 다르다. 같은 문구를
            #   띄우면 다음 사람이 같은 자리에서 또 헤맨다.
            probe = graph.query("MATCH (v:Verse) RETURN count(v) AS c")
            if not probe:
                self.stdout.write(
                    self.style.ERROR(
                        "  질의가 실패했습니다 (위 경고 참조).\n"
                        "  연결이나 권한 문제이지 데이터 문제가 아닙니다."
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f'  Verse {{ref: "{key}"}} 가 없습니다. '
                        f"(전체 Verse {probe[0]['c']:,}개)\n"
                        "  키 표기가 다를 수 있습니다 — 아래 샘플과 비교해 보세요."
                    )
                )
                sample = graph.query("MATCH (v:Verse) RETURN v.ref AS ref LIMIT 5")
                for row in sample:
                    self.stdout.write(f"    예: {row['ref']}")
            return

        for k, v in rows[0]["props"].items():
            # embedding 은 1536개짜리 숫자 배열이라 그대로 찍으면 화면을 덮는다
            text = f"<{len(v)}차원 벡터>" if k == "embedding" else str(v)
            self.stdout.write(f"    {k} = {text[:70]}")

        neighbours = graph.query(
            "MATCH (v:Verse {ref: $key})-[r]-(m) "
            "RETURN type(r) AS rel, labels(m)[0] AS label, "
            "       coalesce(m.name, m.ref, m.id, '?') AS name LIMIT 15",
            key=key,
        )
        self.stdout.write(f"\n  이웃 {len(neighbours)}개")
        for row in neighbours:
            self.stdout.write(f"    -[{row['rel']}]- ({row['label']}) {str(row['name'])[:50]}")

        # 이 구절이 어떤 감정과 이어지는지 — boost() 가 실제로 보는 경로다
        emotions = graph.query(
            "MATCH (v:Verse {ref: $key})-[:MENTIONS]->(p:Person)-[r:EXPERIENCED|OVERCAME]->"
            "(e:EmotionOrState) "
            "RETURN p.name AS person, type(r) AS rel, e.name AS emotion, e.theme AS theme "
            "LIMIT 15",
            key=key,
        )
        self.stdout.write(f"\n  감정 경로 {len(emotions)}개 (가산점이 보는 길)")
        for row in emotions:
            self.stdout.write(
                f"    {row['person']} -[{row['rel']}]- {row['emotion']} (theme={row['theme']})"
            )
