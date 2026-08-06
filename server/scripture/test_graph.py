"""
그래프가 없거나 죽었을 때 아무것도 무너지지 않는지.

★ 여기서 확인하려는 것은 "그래프가 잘 도는가" 가 아니다.
  그건 Aura 가 있어야 알 수 있고, CI 에서 외부 DB 에 기대면 남의
  네트워크 사정으로 빌드가 빨개진다.

  대신 반대쪽을 못 박는다 — 그래프가 없어도, 자격 증명이 틀려도,
  질의가 터져도 검색과 상담이 그대로 도는가. 발표장에서 Aura 세션이
  끊기는 쪽이 훨씬 그럴듯한 시나리오다.
"""

from unittest.mock import patch

from django.test import TestCase, override_settings

from scripture import graph


class GraphKeyTests(TestCase):
    """우리 id ↔ 그래프 키 변환."""

    def test_우리_id_를_그래프_키로_바꾼다(self):
        self.assertEqual(graph.graph_key("창.1.1"), "창 1:1")
        self.assertEqual(graph.graph_key("요.3.16"), "요 3:16")
        self.assertEqual(graph.graph_key("고전.13.4"), "고전 13:4")

    def test_모양이_다르면_그대로_둔다(self):
        # ★ 억지로 자르면 "붙었는데 아무것도 안 걸리는" 상태가 된다.
        #   그건 안 붙은 것보다 알아내기 어렵다.
        self.assertEqual(graph.graph_key("이상한id"), "이상한id")
        self.assertEqual(graph.graph_key("창.1"), "창.1")


@override_settings(NEO4J_URI="", NEO4J_USER="", NEO4J_PASSWORD="")
class GraphDisabledTests(TestCase):
    """자격 증명이 비어 있는 상태 — 팀원 대부분의 로컬이 이렇다."""

    def test_꺼져_있다고_보고한다(self):
        self.assertFalse(graph.enabled())

    def test_가산점은_빈_dict_다(self):
        self.assertEqual(graph.boost(["창.1.1"], "anxiety"), {})

    def test_맥락은_비어_있고_프롬프트도_빈_문자열이다(self):
        context = graph.verse_context("창.1.1", "anxiety")
        self.assertTrue(context.empty)
        self.assertEqual(context.as_prompt(), "")


@override_settings(
    NEO4J_URI="neo4j+s://nowhere.invalid",
    NEO4J_USER="neo4j",
    NEO4J_PASSWORD="whatever",
)
class GraphBrokenTests(TestCase):
    """설정은 있는데 서버가 응답하지 않는 상태 — 발표 중 가장 그럴듯한 사고."""

    def setUp(self):
        # 모듈 전역 드라이버 캐시를 비운다. 앞 테스트의 상태가 새면
        # 통과·실패가 실행 순서에 따라 달라진다.
        graph._driver = None
        graph._driver_failed = False

    def tearDown(self):
        graph._driver = None
        graph._driver_failed = False

    def test_질의가_터져도_예외가_밖으로_안_나간다(self):
        with patch.object(graph, "_get_driver", side_effect=RuntimeError("연결 끊김")):
            # ★ _get_driver 자체가 터지는 경우까지 막아야 한다.
            #   query() 안의 try 는 세션 단계만 감싸고 있었다면 여기서 샌다.
            try:
                result = graph.query("MATCH (n) RETURN n")
            except Exception as exc:  # pragma: no cover
                self.fail(f"예외가 밖으로 나왔습니다: {exc}")
            self.assertEqual(result, [])

    def test_세션이_터져도_가산점은_빈_dict_다(self):
        with patch.object(graph, "query", side_effect=RuntimeError("세션 만료")):
            try:
                result = graph.boost(["창.1.1"], "anxiety")
            except Exception as exc:  # pragma: no cover
                self.fail(f"예외가 밖으로 나왔습니다: {exc}")
            self.assertEqual(result, {})

    def test_맥락_조회가_터져도_빈_맥락이다(self):
        with patch.object(graph, "query", side_effect=RuntimeError("세션 만료")):
            context = graph.verse_context("창.1.1")
            self.assertTrue(context.empty)


class BoostShapeTests(TestCase):
    """가산점 계산 규칙 — 그래프 응답을 흉내 내서 확인한다."""

    @override_settings(
        NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y"
    )
    def test_이겨_낸_쪽이_겪은_쪽보다_높다(self):
        rows = [
            {"ref": "창 1:1", "felt": 1, "won": 0},
            {"ref": "요 3:16", "felt": 1, "won": 1},
        ]
        with patch.object(graph, "query", return_value=rows):
            result = graph.boost(["창.1.1", "요.3.16"], "anxiety")

        self.assertAlmostEqual(result["창.1.1"], graph.EXPERIENCED_BONUS)
        self.assertGreater(result["요.3.16"], result["창.1.1"])

    @override_settings(
        NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y"
    )
    def test_상한을_넘지_않는다(self):
        # ★ 인물이 많이 등장하는 구절이 늘 이기면 안 된다.
        #   관계가 많은 것과 위로가 되는 것은 다르다.
        rows = [{"ref": "요 3:16", "felt": 9, "won": 9}]
        with patch.object(graph, "query", return_value=rows):
            result = graph.boost(["요.3.16"], "anxiety")

        self.assertLessEqual(result["요.3.16"], graph.MAX_BOOST)

    @override_settings(
        NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y"
    )
    def test_주제가_없으면_그래프를_안_본다(self):
        with patch.object(graph, "query") as spy:
            self.assertEqual(graph.boost(["창.1.1"], ""), {})
            spy.assert_not_called()

    @override_settings(
        NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y"
    )
    def test_가산점이_주제_가산점보다_작다(self):
        # ★ 사람이 직접 배정한 주제가 그래프 추론보다 신뢰도가 높다.
        #   그래프가 순위를 뒤집기 시작하면 큐레이션이 무의미해진다.
        from scripture.search import THEME_BONUS

        self.assertLess(graph.EXPERIENCED_BONUS, THEME_BONUS)
        self.assertLess(graph.MAX_BOOST, THEME_BONUS)

    @override_settings(
        NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y"
    )
    def test_가산점_폭이_후보_점수_폭보다_좁다(self):
        """
        실측 기준선.

        ★ 번아웃 질문의 상위 8개는 0.66~0.68 안에 몰려 있었다 (폭 0.02).
          가산점이 그보다 크면 그래프가 순위를 새로 쓴다. 실제로 그렇게
          됐고, 마태복음 11:28 이 1등에서 밀려났다.

          가산점 상한을 그 폭의 세 배 아래로 둔다. 동점 구간은 가르되
          벡터가 확실히 앞선 것은 못 뒤집는 크기다.
        """
        OBSERVED_SPREAD = 0.02
        self.assertLessEqual(graph.MAX_BOOST, OBSERVED_SPREAD * 3)

    @override_settings(
        NEO4J_URI="neo4j+s://x", NEO4J_USER="neo4j", NEO4J_PASSWORD="y"
    )
    def test_허브_제한을_질의에_실어_보낸다(self):
        # ★ 여호와처럼 6천 절이 언급하는 인물은 구절을 못 가려 낸다.
        #   이 인자가 빠지면 가산점이 거의 모든 구절에 켜진다 — 실제로
        #   그렇게 돌아갔고, 그건 신호가 아니라 잡음이었다.
        with patch.object(graph, "query", return_value=[]) as spy:
            graph.boost(["창.1.1"], "anxiety")

        _, kwargs = spy.call_args
        self.assertEqual(kwargs["hub_limit"], graph.HUB_MENTION_LIMIT)


class VerseContextPromptTests(TestCase):
    """프롬프트 문자열 — 사실만 담고 해석은 안 담는다."""

    def test_빈_맥락은_빈_문자열이다(self):
        self.assertEqual(graph.VerseContext(ref="창 1:1").as_prompt(), "")

    def test_인물과_감정과_회복이_들어간다(self):
        context = graph.VerseContext(
            ref="요 3:16",
            persons=["베드로"],
            emotions=["두려움"],
            overcame=["담대함"],
        )
        prompt = context.as_prompt()

        self.assertIn("요 3:16", prompt)
        self.assertIn("베드로", prompt)
        self.assertIn("두려움", prompt)
        self.assertIn("담대함", prompt)
