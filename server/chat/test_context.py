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
        self.assertEqual(serializer.validated_data["seed_verse_ref"], "요.3.16")

    def test_구절이_없어도_대화방은_열린다(self):
        from chat.serializers import ChatSessionSerializer

        serializer = ChatSessionSerializer(data={"title": "대화", "persona_id": "peter"})
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_큐레이션에_없는_구절도_거부하지_않는다(self):
        """
        ★ 실제로 터졌던 버그다.
          화면의 별 2,652개 중 1,950개는 BibleVerse 라 Verse 표에 없다.
          외래키로 검증하니 "유효하지 않은 pk 창.6.10" 이 뜨고
          별 넷 중 셋이 상담에 못 들어갔다.
        """
        from chat.serializers import ChatSessionSerializer

        serializer = ChatSessionSerializer(
            data={"title": "대화", "persona_id": "peter", "seed_verse_id": "창.6.10"}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["seed_verse_ref"], "창.6.10")


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


class TurnDirectiveTests(TestCase):
    """몇 번째 답변인지에 따라 지시가 달라지는가."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="t4@example.com", username="tester", password="pw-not-checked-here"
        )

    @override_settings(NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y")
    def _context(self, turn):
        from scripture import graph

        session = ChatSession.objects.create(
            user=self.user, seed_question="친구와 다퉜어요", persona_id="john"
        )
        fake = [graph.Witness(person="룻", felt=["충성"], became=["사랑과 가족의 회복"])]
        with patch.object(graph, "theme_witnesses", return_value=fake):
            with patch.object(graph, "enabled", return_value=True):
                return context.for_session(session, "친구와 다퉜어요", turn=turn)

    def test_첫_답변에는_이름을_꺼내지_말라고_한다(self):
        # ★ 처음부터 "룻도 그랬습니다" 로 시작하면 가르치는 사람이 된다.
        d = context.directive_for(1, has_people=True)
        self.assertIn("아직 이름을 꺼내지 마십시오", d)

    def test_두_번째_답변부터는_반드시_꺼내라고_한다(self):
        d = context.directive_for(2, has_people=True)
        self.assertIn("반드시 부르십시오", d)
        self.assertNotIn("아직 이름을 꺼내지 마십시오", d)

    def test_꺼낼_인물이_없으면_지시도_없다(self):
        self.assertEqual(context.directive_for(3, has_people=False), "")

    def test_지시는_조건문이_아니다(self):
        # ★ "~라면 ~하십시오" 는 모델이 조건을 스스로 판정해야 하고,
        #   판정에 실패하면 조용히 아무것도 안 한다.
        for turn in (1, 2, 5):
            self.assertNotIn("있다면", context.directive_for(turn, has_people=True))

    def test_씨앗_구절은_초반에만_남는다(self):
        """
        ★ 대화는 움직인다.
          "친구와 절교" 대화에 창세기 44:26 이 6턴째까지 프롬프트 맨 위에
          남아 있었다. 관계없는 재료가 위에 있으면 모델은 재료 전체를
          신뢰하지 않는다.
        """
        self.assertGreaterEqual(context.SEED_VERSE_TURNS, 1)
        self.assertLessEqual(context.SEED_VERSE_TURNS, 4)


class TurnCountTests(TestCase):
    """턴 세기 — 사용자가 연달아 말해도 흔들리지 않는가."""

    def test_지난_답변의_수로_센다(self):
        from chat.views import _turn_of

        self.assertEqual(_turn_of([]), 1)
        self.assertEqual(_turn_of([{"role": "user", "content": "안녕"}]), 1)

        # ★ 사용자가 연달아 두 줄을 보내도 아직 첫 답변이다.
        #   발화 수로 세면 답한 적이 없는데 "두 번째" 가 된다.
        self.assertEqual(
            _turn_of([{"role": "user", "content": "a"}, {"role": "user", "content": "b"}]),
            1,
        )
        self.assertEqual(
            _turn_of(
                [
                    {"role": "user", "content": "a"},
                    {"role": "assistant", "content": "b"},
                    {"role": "user", "content": "c"},
                ]
            ),
            2,
        )


class PromptWordingTests(TestCase):
    """프롬프트 문구가 없는 구절을 있다고 말하지 않는가."""

    def test_구절이_없어도_구절이_있다고_말하지_않는다(self):
        # ★ 예전 문구는 "이 구절에서 시작된 대화입니다" 로 못박혀 있었다.
        #   인물 이야기만 들어간 경우 모델이 있지도 않은 구절을 지어낸다.
        from llm_core.prompts import build_system_prompt

        prompt = build_system_prompt("john", verse_context="[이 감정을 지나간 사람들]\n다윗")

        self.assertIn("다윗", prompt)
        self.assertNotIn("이 구절에서 시작된 대화", prompt)

    def test_턴별_지시를_여기서_또_쓰지_않는다(self):
        # ★ 두 벌의 지시가 들어가면 어긋나는 순간 모델이 편한 쪽을 고른다.
        #   이번 답변에 무엇을 할지는 chat/context.py 가 정해서 실어 보낸다.
        from llm_core.prompts import build_system_prompt

        prompt = build_system_prompt("john", verse_context="재료")
        self.assertNotIn("두 번째 답변부터", prompt)
        self.assertNotIn("반드시 부르십시오", prompt)


class DirectivePlacementTests(TestCase):
    """지시가 사용자 발화 쪽에 붙는가 — 이번 수정의 핵심."""

    def test_지시가_마지막_발화에_붙는다(self):
        """
        ★ 시스템 프롬프트에 두었을 때 지켜지지 않았다.
          히스토리가 열 개쯤 쌓이면 시스템 블록은 대화 저 앞이고,
          모델은 방금 들은 말에 반응한다. 같은 문장을 마지막 턴에
          붙이는 것만으로 결과가 달라진다.
        """
        from llm_core.chains import _with_directive

        out = _with_directive("친구와 절교했어", "[이번 답변 지침]\n이름을 부르십시오")
        self.assertTrue(out.startswith("친구와 절교했어"))
        self.assertTrue(out.rstrip().endswith("이름을 부르십시오"))

    def test_지시가_없으면_발화가_그대로다(self):
        from llm_core.chains import _with_directive

        self.assertEqual(_with_directive("안녕", None), "안녕")
        self.assertEqual(_with_directive("안녕", ""), "안녕")
