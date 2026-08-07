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
            # ★ 인물은 재료를 얹는 턴에만 들어간다 (_material_turn).
            result = context.for_session(session, "요즘 너무 불안합니다", turn=2)

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
                result = context.for_session(session, "불안합니다", turn=2)
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
        self.assertIn("인물을 꺼내지 마십시오", d)

    def test_두_번째_답변부터는_이름을_부르라고_한다(self):
        d = context.directive_for(2, has_people=True)
        self.assertIn("이름을 부르십시오", d)

    def test_인물은_한_턴_걸러_나온다(self):
        """
        ★ 매 턴 꺼내라고 했더니 명함첩이 됐다.
          2턴 "다윗도 배신으로 슬퍼했습니다", 3턴 "룻은 회복을 위해
          노력했습니다". 사용자가 방금 한 말은 어디에도 없다.
        """
        self.assertIn("이름을 부르십시오", context.directive_for(2, has_people=True))
        self.assertIn("인물을 꺼내지 마십시오", context.directive_for(3, has_people=True))
        self.assertIn("이름을 부르십시오", context.directive_for(4, has_people=True))

    def test_분류표의_말을_그대로_읽지_말라고_한다(self):
        # ★ 그래프는 "룻: 충성 → 사랑과 가족의 회복" 을 준다.
        #   모델이 그걸 그대로 읽어 "룻은 사랑과 가족의 회복을 위해
        #   노력했던 사람입니다" 가 나왔다. 라벨 낭독이지 이야기가 아니다.
        d = context.directive_for(2, has_people=True)
        self.assertIn("분류표의 말", d)

    def test_꺼낼_인물이_없어도_말투_지시는_나간다(self):
        """
        ★ 예전에는 여기서 빈 문자열이었다.
          인물이 없는 턴이 대화의 절반인데, 그 절반이 전부
          "공감 한 줄 + 일반론 + 질문" 으로 나왔다. 질문 빈도와
          되받기는 그래프가 있든 없든 지켜야 하는 규칙이다.
        """
        d = context.directive_for(3, has_people=False)
        self.assertNotEqual(d, "")
        self.assertNotIn("이 감정을 지나간 사람들", d)

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


class AskCadenceTests(TestCase):
    """질문 빈도 — 상담이 설문이 되지 않게."""

    def test_첫_답변은_물어도_된다(self):
        # 아직 아는 것이 없다. 여기서 안 물으면 대화가 안 열린다.
        self.assertIn("물어도 됩니다", context.directive_for(1, has_people=False))

    def test_두_번째_답변은_질문_없이_끝낸다(self):
        """
        ★ 실제로 나왔던 대화다.
          "어떤 감정이 드시나요" → "어떻게 다루고 계신가요"
          → "무엇이 가장 힘드신가요". 문장은 다 맞는데 사용자가
          계속 답안지를 채우는 자리에 놓인다.
        """
        d = context.directive_for(2, has_people=False)
        self.assertIn("물음표로 끝내지 마십시오", d)
        self.assertNotIn("물어도 됩니다", d)

    def test_한_턴_걸러_한_번이다(self):
        # 빈도를 모델에게 세라고 하지 않는다. 서버가 정해서 알려 준다.
        asks = [context._may_ask(t) for t in range(1, 7)]
        self.assertEqual(asks, [True, False, True, False, True, False])

    def test_재료를_얹는_턴에는_묻지_않는다(self):
        # 인물·구절·질문을 한 답변에 다 넣으면 셋 다 얕아진다.
        for turn in range(1, 8):
            self.assertNotEqual(
                context._material_turn(turn), context._may_ask(turn), f"turn={turn}"
            )

    def test_상담_교본_문장을_금지한다(self):
        # 누구에게나 쓸 수 있는 문장은 아무에게도 닿지 않는다.
        from llm_core.prompts import COMMON_RULES

        for banned in ("많이 힘드시겠네요", "어떤 감정이 드시나요", "자연스러운 일입니다"):
            self.assertIn(banned, COMMON_RULES)


class ClosingTurnTests(TestCase):
    """대화를 닫는 말을 알아보는가."""

    def test_감사와_수긍을_알아본다(self):
        for text in ("고마워", "고맙습니다", "감사해요", "알겠어", "그렇구나", "응", "ㅋㅋ", "오케이"):
            self.assertTrue(context.is_closing(text), text)

    def test_짧아도_묻고_있으면_아니다(self):
        self.assertFalse(context.is_closing("왜 그럴까?"))
        self.assertFalse(context.is_closing("어떻게 해"))

    def test_짧은_것과_가벼운_것은_다르다(self):
        """
        ★ 처음에는 "12자 이하면 가벼운 말" 로 짰다.
          그랬더니 "불안합니다" 가 걸렸다. 상담에서 가장 중요한 말이
          대개 가장 짧다.
        """
        for text in ("불안합니다", "무서워요", "너무 외로워", "다 놓고 싶어요"):
            self.assertFalse(context.is_closing(text), text)

    def test_이야기를_이어가면_아니다(self):
        for text in ("동생이 아파서 일이 손에 안 잡혀요", "친구와 절교를 해서 마음이 아파"):
            self.assertFalse(context.is_closing(text), text)

    def test_위기_신호는_짧아도_가벼운_말이_아니다(self):
        # 판정은 [안전] 층이 한다. 여기서는 가벼운 응답으로 넘기지만 않으면 된다.
        self.assertFalse(context.is_closing("죽고 싶어"))


class MaterialOmissionTests(TestCase):
    """
    안 쓸 재료를 프롬프트에 넣지 않는가.

    ★ 이게 "고마워 → 아브라함" 의 진짜 원인이었다.
      인물 블록은 늘 넣어 놓고 "이번에는 꺼내지 마십시오" 라고만 적었다.
      눈앞에 놓인 재료를 금지문으로 이길 수 없다. 안 쓸 거면 안 넣는다.
    """

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="t5@example.com", username="tester", password="pw-not-checked-here"
        )

    @override_settings(NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y")
    def _materials(self, question, turn):
        from scripture import graph

        session = ChatSession.objects.create(
            user=self.user, seed_question="친구와 다퉜어요", persona_id="john"
        )
        fake = [graph.Witness(person="아브라함", felt=["감사"], became=["믿음"])]
        with patch.object(graph, "theme_witnesses", return_value=fake):
            with patch.object(graph, "enabled", return_value=True):
                return context.materials(session, question, turn=turn)

    def test_고마워에는_아무것도_안_얹는다(self):
        m = self._materials("고마워", turn=2)
        self.assertTrue(m.closing)
        self.assertIsNone(m.text)
        self.assertFalse(m.has_people)

    def test_재료를_안_쓰는_턴에는_인물도_안_넣는다(self):
        m = self._materials("요즘 너무 불안합니다", turn=3)
        self.assertIsNone(m.text)

    def test_재료_턴에는_인물이_들어간다(self):
        m = self._materials("요즘 너무 불안합니다", turn=2)
        self.assertTrue(m.has_people)
        self.assertIn("아브라함", m.text)


class GroundedVerseTests(TestCase):
    """
    없는 구절을 꺼내라고 시키지 않는가.

    ★ 이걸 왜 구조로 막는가
      "친구와 다시 친해지고 싶어" 에 이런 답이 나왔다.
        "'내가 네게 무엇을 해 주리오?' 라는 말이 떠오릅니다"
      상황과도 안 맞고 출처도 불분명하다. 프롬프트에 구절이 하나도
      없는데 "구절을 꺼내십시오" 라고 시켰기 때문이다. 모델은
      시키면 한다 — 없으면 기억에서 만들어서라도.
    """

    def test_구절이_없으면_인용하지_말라고_한다(self):
        d = context.directive_for(2, has_verse=False)
        self.assertIn("성경 구절을 인용하지 마십시오", d)

    def test_구절이_있으면_그것을_쓰라고_한다(self):
        d = context.directive_for(2, has_verse=True)
        self.assertIn("[지금 대화의 바탕]에 있는 구절", d)
        self.assertNotIn("인용하지 마십시오", d)

    def test_구절이_있어도_홀수_턴에는_안_꺼낸다(self):
        # 재료를 얹는 턴이 아니면 사용자의 말만 받는다.
        self.assertIn("인용하지 마십시오", context.directive_for(3, has_verse=True))


class ActionRequestTests(TestCase):
    """
    '어떻게 할지' 를 물었는데 감정으로 되돌리지 않는가.

    ★ 실제로 나온 답이다.
      사용자: "친구와 다시 친해지고 싶어"
      답변:   "그 마음이 어떤 길로 이어질 수 있을까요?"
      사용자는 이미 길을 말했다. 그걸 다시 물으면 회피다.
    """

    def test_원하는_것을_말하면_걸린다(self):
        for text in (
            "친구와 다시 친해지고 싶어",
            "어떻게 해야 할까요",
            "무슨 방법이 있을까요",
            "뭘 해야 할지 모르겠어요",
            "먼저 연락해도 될까",
        ):
            self.assertTrue(context.wants_action(text), text)

    def test_감정만_말하면_안_걸린다(self):
        for text in ("마음이 슬퍼", "요즘 너무 지쳐요", "동생이 아파서 일이 손에 안 잡혀"):
            self.assertFalse(context.wants_action(text), text)

    def test_위기_신호에는_한_걸음을_붙이지_않는다(self):
        """
        ★ "사라지고 싶어" 도 문법으로는 '-고 싶다' 다.
          여기에 "오늘 할 수 있는 일 하나" 를 붙이면 안 된다.
          이 지침은 마지막 발화에 실려 가장 강하게 작동하기 때문에,
          안전 규칙과 부딪히게 두면 안 된다.
        """
        for text in ("그냥 사라지고 싶어", "죽고 싶어요", "살고 싶지 않아"):
            self.assertFalse(context.wants_action(text), text)

    def test_요청_턴에는_되묻지_말라고_한다(self):
        d = context.directive_for(3, asked_for_action=True)
        self.assertIn("한 걸음을 놓으십시오", d)
        # ★ 홀수 턴이라 원래는 물어도 되는 턴이다. 요청이 그것을 이긴다.
        self.assertIn("물음표로 끝내지 마십시오", d)

    def test_짧게_받은_말에는_짧게_받는다(self):
        """
        ★ 실제로 "고마워" 에 이런 답이 나왔다.
          "고마워요. 아브라함은 믿음으로 가족과의 관계를 지키기 위해
           많은 어려움을 겪었죠. … 지금 어떤 생각이 드시나요?"
          끝내려는 사람을 붙잡는 꼴이다.
        """
        d = context.directive_for(2, has_people=True, has_verse=True, closing=True)
        self.assertIn("한두 문장으로 받고 끝내십시오", d)
        self.assertIn("인물도 구절도 꺼내지 마십시오", d)
        self.assertNotIn("이름을 부르십시오", d)

    def test_요청_턴에는_목록을_만들지_말라고_한다(self):
        # 방법 세 개를 늘어놓으면 상담이 아니라 안내문이 된다.
        self.assertIn("목록으로 만들지 마십시오", context.directive_for(3, asked_for_action=True))


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
        self.assertNotIn("[이번 답변 지침]", prompt)


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


class PlannerTests(TestCase):
    """
    답을 쓰기 전에 '이번 답변이 뭘 해야 하는가' 를 먼저 묻는다.

    ★ 왜 이 층이 생겼는가
      그전까지 규칙은 전부 '몇 번째 턴인가' 로 인덱싱돼 있었다.
      사용자가 무슨 말을 했는지는 정규식 몇 개로만 봤다. 그래서
      "고마워" 한마디에 아브라함과 구절과 새 질문이 쏟아졌다 —
      턴 번호는 짝수였고 규칙은 시킨 대로 했다.

    ★ 여기서 확인하는 것은 계획의 품질이 아니다.
      그건 모델이 한다. 여기서는 배관을 본다.
        - 계획이 실려 오면 턴 규칙 대신 계획을 따르는가
        - 계획이 죽으면 예전 규칙으로 조용히 돌아가는가
        - 계획이 뭐라 하든 안전 바닥은 코드가 지키는가
    """

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="t6@example.com", username="tester", password="pw-not-checked-here"
        )

    def _plan(self, **kw):
        from chat.planner import Plan

        return Plan(**kw)

    # ── 배관: 계획이 턴 규칙을 이기는가 ────────────────────────────

    def test_계획이_없으면_턴_규칙으로_돈다(self):
        # ★ 플래너는 더 좋아지는 장치이지, 없으면 안 되는 장치가 아니다.
        d = context.directive_for(3, has_people=True, plan=None)
        self.assertIn("인물을 꺼내지 마십시오", d)  # 3턴 = 홀수 = 재료 없음

    def test_계획이_있으면_홀수_턴에도_인물을_꺼낸다(self):
        # 턴 번호가 아니라 사용자가 방금 한 말이 정한다.
        p = self._plan(state="감정", needs_person=True, ask_question=False)
        d = context.directive_for(3, has_people=True, plan=p)
        self.assertIn("이름을 부르십시오", d)

    def test_계획이_질문하지_말라면_안_묻는다(self):
        p = self._plan(state="감정", ask_question=False)
        d = context.directive_for(1, plan=p)
        self.assertIn("물음표로 끝내지 마십시오", d)

    def test_계획이_되받을_말을_집어_준다(self):
        # 고르는 일을 모델에게 시키지 않는다. 이미 골라 놨다.
        p = self._plan(state="감정", echo="동생", focus="동생 이야기에 머문다")
        d = context.directive_for(2, plan=p)
        self.assertIn("'동생'", d)
        self.assertIn("동생 이야기에 머문다", d)

    def test_되받기와_메아리는_다르다(self):
        """
        ★ 실제로 이렇게 나왔다.
          사용자: "어떻게 해결해야 할까요?"
          답변:   "어떻게 해결해야 할까요? 친구와의 소통이…"
          들었다는 표시가 아니라 받아쓰기다.
        """
        d = context.directive_for(2, plan=self._plan(echo="친구"))
        self.assertIn("그대로 옮겨 적으며 시작하지 마십시오", d)
        self.assertIn("첫 문장은 당신의 말이어야 합니다", d)

    def test_지침이_답변으로_새지_않게_한다(self):
        # ★ "잘 안 될 수도 있다는 것을 함께 이해하며" 가 답변에 그대로 나왔다.
        #   위에 적어 둔 지침 문장이다.
        d = context.directive_for(2, plan=self._plan())
        self.assertIn("지침의 문장을 답변에 옮겨 쓰지 마십시오", d)

    def test_echo_가_문장이면_버린다(self):
        from chat.planner import _short_echo

        for sentence in ("어떻게 해결해야 할까요", "친구랑 대화가 안 통해요", "너무 지쳤어요"):
            self.assertEqual(_short_echo(sentence), "", sentence)

    def test_echo_가_명사면_남긴다(self):
        from chat.planner import _short_echo

        for word in ("친구", "동생", "그 밤", "번아웃"):
            self.assertEqual(_short_echo(word), word)

    def test_마무리_계획에는_아무것도_안_얹는다(self):
        p = self._plan(state="마무리")
        d = context.directive_for(4, has_people=True, has_verse=True, plan=p)
        self.assertIn("한두 문장으로 받고 끝내십시오", d)

    def test_요청_계획이면_한_걸음을_놓는다(self):
        p = self._plan(state="요청", ask_question=True)
        d = context.directive_for(2, plan=p)
        self.assertIn("한 걸음을 놓으십시오", d)

    # ── 계획을 코드가 한 번 더 조인다 ──────────────────────────────

    def test_마무리인데_재료를_쓰라는_계획은_무시한다(self):
        """
        ★ "마무리인데 인물을 꺼내라" 같은 계획이 실제로 나올 수 있다.
          판단은 모델에게 맡기되, 우리가 아는 불변식은 코드가 지킨다.
        """
        from chat import planner

        raw = {
            "state": "마무리",
            "needs_person": True,
            "needs_verse": True,
            "ask_question": True,
            "echo": "고마워",
            "focus": "인물을 소개한다",
        }
        with patch.object(planner, "enabled", return_value=True):
            with patch.object(planner, "_get_planner") as fake:
                fake.return_value.invoke.return_value = type(
                    "R", (), {"content": __import__("json").dumps(raw)}
                )()
                p = planner.plan("고마워", [])

        self.assertIsNotNone(p)
        self.assertTrue(p.closing)
        self.assertFalse(p.needs_person)
        self.assertFalse(p.needs_verse)

    def test_계획이_깨지면_None_이고_터지지_않는다(self):
        from chat import planner

        with patch.object(planner, "enabled", return_value=True):
            with patch.object(planner, "_get_planner") as fake:
                fake.return_value.invoke.return_value = type("R", (), {"content": "JSON 아님"})()
                self.assertIsNone(planner.plan("안녕하세요", []))

    def test_모델이_안_뜨면_None_이고_터지지_않는다(self):
        from chat import planner

        with patch.object(planner, "enabled", return_value=True):
            with patch.object(planner, "_get_planner", side_effect=RuntimeError("키 없음")):
                self.assertIsNone(planner.plan("안녕하세요", []))

    def test_키가_없으면_아예_부르지_않는다(self):
        from chat import planner

        with override_settings(OPENAI_API_KEY=""):
            self.assertFalse(planner.enabled())
            self.assertIsNone(planner.plan("안녕하세요", []))

    def test_스위치로_끌_수_있다(self):
        # ★ 무대에서 이상하면 이 값만 false 로 두고 재배포한다.
        from chat import planner

        with override_settings(OPENAI_API_KEY="sk-x", PLANNER_ENABLED=False):
            self.assertFalse(planner.enabled())

    # ── 안전 바닥은 계획 위에 있다 ────────────────────────────────

    @override_settings(NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y")
    def test_위기_신호에는_계획과_무관하게_아무것도_안_얹는다(self):
        """
        ★ 플래너는 좋아지는 장치이지 안전 장치가 아니다.
          계획이 "감정" 이라고 잘못 봐도, 위기어가 보이면 재료를 얹지
          않는다. 안전의 바닥은 모델 호출이 아니라 코드가 지킨다.
        """
        from scripture import graph

        session = ChatSession.objects.create(
            user=self.user, seed_question="힘들어요", persona_id="john"
        )
        p = self._plan(state="감정", needs_person=True, needs_verse=True)
        fake = [graph.Witness(person="엘리야", felt=["절망"], became=["회복"])]

        with patch.object(graph, "theme_witnesses", return_value=fake):
            with patch.object(graph, "enabled", return_value=True):
                m = context.materials(session, "그냥 죽고 싶어요", turn=2, plan=p)

        self.assertIsNone(m.text)
        self.assertFalse(m.has_people)
        self.assertFalse(m.has_verse)

    @override_settings(NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y")
    def test_계획이_계속_아무것도_필요없다고_해도_바닥은_있다(self):
        """
        ★ 실제로 세 턴 내내 인물도 구절도 없이 흘렀다.
          플래너 프롬프트에 false 로 둘 이유만 적어 놨더니, 모델이
          시킨 대로 전부 false 를 냈다. 결과는 성경 없는 일반 챗봇이다.

          판단은 계획에 맡기되, 얹을 자리인데 계획이 둘 다 마다하면
          인물 하나는 올린다.
        """
        from scripture import graph

        session = ChatSession.objects.create(
            user=self.user, seed_question="불안합니다", persona_id="john"
        )
        p = self._plan(state="감정", needs_person=False, needs_verse=False)
        fake = [graph.Witness(person="엘리야", felt=["절망"], became=["회복"])]

        with patch.object(graph, "theme_witnesses", return_value=fake):
            with patch.object(graph, "enabled", return_value=True):
                m = context.materials(session, "요즘 너무 불안합니다", turn=2, plan=p)

        self.assertTrue(m.has_people)
        self.assertIn("엘리야", m.text)
