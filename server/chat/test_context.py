"""
상담 프롬프트에 실제로 문맥이 들어가는지.

★ 이 파일이 있는 이유
  그래프 코드는 다 맞게 짰는데 대화에는 한 번도 안 들어갔다.
  `seed_verse_id` 가 시리얼라이저에서 read_only 였고, 화면도 그 값을
  안 보냈다. 두 곳 다 "정상" 으로 보였고 화면도 멀쩡했다 —
  답이 조금 밋밋할 뿐이었다.

  그래서 여기서 확인하는 것은 그래프 로직이 아니라 **배관**이다.
  값이 화면에서 프롬프트까지 실제로 도달하는가.
"""

from unittest.mock import patch

from django.test import TestCase, override_settings

from chat import context
from chat.models import ChatSession
from django.contrib.auth import get_user_model
from scripture.models import Galaxy, Verse


class SeedVerseWritableTests(TestCase):
    """구절 id 가 서버까지 실제로 들어오는가."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="t@example.com", username="tester", password="pw-not-checked-here"
        )
        # ★ create 가 아니라 get_or_create 다.
        #   마이그레이션이 은하 13개를 미리 심어 둔다. create 로 쓰면
        #   UNIQUE 충돌이 나는데, 그 오류는 "테스트가 잘못됐다" 처럼
        #   보이지 않고 "코드가 깨졌다" 처럼 보인다.
        self.galaxy, _ = Galaxy.objects.get_or_create(
            id="peter", defaults={"name": "베드로", "order": 1}
        )
        self.verse, _ = Verse.objects.get_or_create(
            id="요.3.16",
            defaults={
                "galaxy": self.galaxy,
                "order": 0,
                "book_code": "요",
                "chapter": 3,
                "verse": 16,
                "summary": "사랑에 관한 구절",
            },
        )

    def test_시리얼라이저가_구절을_받는다(self):
        # ★ read_only 였다면 이 값이 조용히 버려진다.
        #   응답은 201 이고 화면은 정상이며, seed_verse 만 None 이다.
        from chat.serializers import ChatSessionSerializer

        serializer = ChatSessionSerializer(
            data={"title": "대화", "persona_id": "peter", "seed_verse_id": "요.3.16"}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["seed_verse"], self.verse)

    def test_구절이_없어도_대화방은_열린다(self):
        from chat.serializers import ChatSessionSerializer

        serializer = ChatSessionSerializer(data={"title": "대화", "persona_id": "peter"})
        self.assertTrue(serializer.is_valid(), serializer.errors)


@override_settings(NEO4J_URI="", NEO4J_USER="", NEO4J_PASSWORD="")
class ContextWithoutGraphTests(TestCase):
    """그래프가 꺼져 있을 때 — 팀원 대부분의 로컬."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="t2@example.com", username="tester", password="pw-not-checked-here"
        )
        self.galaxy, _ = Galaxy.objects.get_or_create(
            id="john", defaults={"name": "요한", "order": 2}
        )
        self.verse, _ = Verse.objects.get_or_create(
            id="요.3.16",
            defaults={
                "galaxy": self.galaxy,
                "order": 0,
                "book_code": "요",
                "chapter": 3,
                "verse": 16,
                "summary": "사랑에 관한 구절",
            },
        )

    def test_구절만_들어간다(self):
        session = ChatSession.objects.create(
            user=self.user, seed_verse=self.verse, persona_id="john"
        )
        result = context.for_session(session, "불안합니다")

        self.assertIn("요 3:16", result)
        self.assertIn("사랑에 관한 구절", result)

    def test_구절도_질문도_없으면_None(self):
        session = ChatSession.objects.create(user=self.user, persona_id="john")
        self.assertIsNone(context.for_session(session, ""))


@override_settings(
    NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y"
)
class ContextWithGraphTests(TestCase):
    """그래프가 켜져 있을 때 — 배포 환경."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="t3@example.com", username="tester", password="pw-not-checked-here"
        )

    def test_구절이_없어도_감정_증인이_들어간다(self):
        """
        ★ 발표에서 가장 흔한 경로다.
          홈에서 질문만 던지고 상담으로 들어오면 씨앗 구절이 없다.
          예전 코드는 여기서 바로 None 을 돌려줬고, 그래서 그래프가
          대화에 한 번도 등장하지 않았다.
        """
        from scripture import graph

        session = ChatSession.objects.create(
            user=self.user, seed_question="요즘 너무 불안합니다", persona_id="john"
        )

        fake = [graph.Witness(person="다윗", felt=["두려움"], became=["평안"])]
        with patch.object(graph, "theme_witnesses", return_value=fake):
            result = context.for_session(session, "요즘 너무 불안합니다")

        self.assertIsNotNone(result)
        self.assertIn("다윗", result)
        self.assertIn("평안", result)

    def test_그래프가_터져도_문맥은_만들어진다(self):
        from scripture import graph

        session = ChatSession.objects.create(
            user=self.user, seed_question="불안합니다", persona_id="john"
        )

        with patch.object(graph, "theme_witnesses", side_effect=RuntimeError("끊김")):
            try:
                result = context.for_session(session, "불안합니다")
            except Exception as exc:  # pragma: no cover
                self.fail(f"예외가 밖으로 나왔습니다: {exc}")

        # 구절도 증인도 없으면 None 이 맞다. 중요한 것은 안 터진다는 것.
        self.assertIsNone(result)


class PromptWordingTests(TestCase):
    """프롬프트 문구가 없는 구절을 있다고 말하지 않는가."""

    def test_구절이_없어도_구절이_있다고_말하지_않는다(self):
        # ★ 예전 문구는 "이 구절에서 시작된 대화입니다" 로 못박혀 있었다.
        #   인물 이야기만 들어간 경우 모델이 있지도 않은 구절을 지어낸다.
        from llm_core.prompts import build_system_prompt

        prompt = build_system_prompt("john", verse_context="[이 감정을 지나간 사람들]\n다윗")

        self.assertIn("다윗", prompt)
        self.assertNotIn("이 구절에서 시작된 대화", prompt)
        self.assertIn("지어내지", prompt)
