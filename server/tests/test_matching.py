"""
은하 추천.

    주제 적합도 × 0.6  +  MBTI 궁합 × 0.4

★ 여기서 잡아야 하는 고장
  - 무슨 질문을 해도 같은 인물이 나온다 (한 축이 죽음)
  - 같은 질문에 매번 다른 인물이 나온다 (결과가 흔들림)
  - 사용자가 고른 은하를 추천이 덮어쓴다
  - 슬픔을 안고 온 사람에게 가룟 유다가 자동 배정된다
"""

from __future__ import annotations

import pytest

from llm_core.matching import (
    NEUTRAL_MBTI_SCORE,
    NEVER_AUTO_RECOMMEND,
    mbti_score,
    rank,
    recommend,
    topic_score,
)

#: 12개 주제 전부
THEMES = [
    "anxiety", "grief", "loneliness", "relationship", "career", "fear",
    "forgiveness", "guilt", "hope", "gratitude", "recovery", "purpose",
]
SOME_TYPES = ["INFJ", "ENFP", "ISTJ", "ESTP", "INTP", "ESFJ", "ISFP", "ENTJ"]


class TestMbtiScore:
    def test_same_type_pairs_are_symmetric(self):
        assert mbti_score("INFJ", "ENFP") == mbti_score("ENFP", "INFJ")

    def test_unknown_type_is_neutral(self):
        # 없는 관계를 좋게도 나쁘게도 만들지 않는다
        assert mbti_score("XXXX", "INFJ") == NEUTRAL_MBTI_SCORE
        assert mbti_score(None, "INFJ") == NEUTRAL_MBTI_SCORE

    def test_lowercase_is_accepted(self):
        assert mbti_score("infj", "ENFP") == mbti_score("INFJ", "ENFP")


class TestTopicScore:
    def test_no_theme_is_neutral(self):
        assert topic_score("peter", None) == NEUTRAL_MBTI_SCORE

    def test_unknown_theme_does_not_skew_ranking(self):
        # 아무 은하도 갖고 있지 않은 주제면 순위를 흔들지 않는다
        assert topic_score("peter", "없는-주제") == NEUTRAL_MBTI_SCORE

    def test_top_galaxy_scores_100(self):
        """가장 비중이 높은 은하가 100 이 되도록 편다."""
        for theme in THEMES:
            scores = [topic_score(m.galaxy_id, theme) for m in rank(theme, include_all=True)]
            assert max(scores) == pytest.approx(100.0)

    def test_normalized_by_share_not_count(self):
        """
        ★ 개수로 비교하면 구절이 많은 은하가 늘 이긴다.
          예수 은하가 58개로 가장 많은데, 모든 주제에서 1위면 안 된다.
        """
        winners = {rank(t, include_all=True, limit=1)[0].galaxy_id for t in THEMES}
        assert len(winners) > 1


class TestBothAxesMatter:
    def test_theme_changes_the_result(self):
        """주제가 죽어 있으면 무슨 질문을 해도 같은 인물이 나온다."""
        picks = {recommend(t, "INFJ", exclude_center=True).galaxy_id for t in THEMES}
        assert len(picks) >= 5

    def test_mbti_changes_the_result(self):
        """MBTI 가 죽어 있으면 사용자가 남긴 유형이 무의미해진다."""
        picks = {recommend("anxiety", m, exclude_center=True).galaxy_id for m in SOME_TYPES}
        assert len(picks) >= 2

    def test_topic_outweighs_mbti(self):
        """
        지금 무엇이 힘든지가 성격보다 앞선다.
        주제 1위가 궁합에서 밀려도 어지간해서는 살아남아야 한다.
        """
        top_by_theme = rank("fear", include_all=True, limit=1)[0].galaxy_id
        # 궁합이 최악에 가까운 유형으로 물어도 여전히 상위권
        ranked = [m.galaxy_id for m in rank("fear", "ISFP", include_all=True, limit=3)]
        assert top_by_theme in ranked


class TestDeterminism:
    def test_same_input_gives_same_output(self):
        """
        ★ 흔들리면 "다른 인물로 바꾸기" 가 의미를 잃는다.
        """
        first = [m.galaxy_id for m in rank("grief", "INFJ")]
        for _ in range(5):
            assert [m.galaxy_id for m in rank("grief", "INFJ")] == first


class TestSafety:
    """★ 이 절이 이 파일에서 가장 중요하다."""

    def test_judas_is_never_auto_recommended(self):
        """
        점수만 보면 유다는 '슬픔'과 '용서'에서 모든 유형에 대해 1위가 된다.
        슬픔을 안고 온 사람에게, 고르지도 않은 상태로 열둘 중 가장 무거운
        인물을 붙이는 것은 위험하다.
        """
        for theme in THEMES:
            for mbti in SOME_TYPES:
                pick = recommend(theme, mbti, exclude_center=True)
                assert pick.galaxy_id != "judas", f"{theme}/{mbti} 에서 유다가 자동 추천됨"

    def test_judas_is_absent_from_every_ranking(self):
        for theme in THEMES:
            ids = [m.galaxy_id for m in rank(theme, "INFJ")]
            assert "judas" not in ids

    def test_but_judas_still_exists_as_a_choice(self):
        """
        은하 자체를 없앤 것이 아니다. 사용자가 직접 고르면 열린다.
        막은 것은 '자동 배정' 하나뿐이다.
        """
        ids = [m.galaxy_id for m in rank("grief", "INFJ", include_all=True)]
        assert "judas" in ids

    def test_exclusion_list_is_explicit(self):
        assert "judas" in NEVER_AUTO_RECOMMEND


class TestCenterGalaxy:
    def test_excluded_when_asked(self):
        """
        고르지 않았을 때 늘 예수가 나오면 열두 은하를 만든 의미가 없다.
        """
        for theme in THEMES:
            assert recommend(theme, "INFJ", exclude_center=True).galaxy_id != "jesus"

    def test_included_by_default(self):
        ids = {m.galaxy_id for m in rank("purpose", "INFJ")}
        assert "jesus" in ids


class TestReason:
    def test_reason_is_human_readable(self):
        m = recommend("anxiety", "INFJ", theme_label="불안", exclude_center=True)
        assert m.reason
        # 점수를 그대로 노출하지 않는다
        assert str(int(m.score)) not in m.reason

    def test_reason_mentions_the_theme_when_known(self):
        m = recommend("fear", "INFJ", theme_label="두려움", exclude_center=True)
        assert "두려움" in m.reason

    def test_reason_survives_missing_label(self):
        assert recommend("fear", "INFJ", exclude_center=True).reason


class TestNoInput:
    def test_no_theme_no_mbti_still_returns_someone(self):
        m = recommend(None, None, exclude_center=True)
        assert m.galaxy_id
        assert m.galaxy_id != "jesus"

    def test_ranking_covers_twelve_when_center_excluded(self):
        # 13 − 예수 − 유다 = 11
        assert len(rank("hope", "INFJ", exclude_center=True)) == 11


class TestReasonCopy:
    """
    ★ 이 문장은 사용자가 상담을 시작하기 직전에 읽는다.
      길거나, 숫자가 섞이거나, 조사가 어긋나면 그 자리에서
      "기계가 골라 준 것"이 되어 버린다.
    """

    LABELS = {
        "anxiety": "불안", "grief": "슬픔", "loneliness": "외로움",
        "relationship": "관계", "career": "진로", "fear": "두려움",
        "forgiveness": "용서", "guilt": "죄책감", "hope": "희망",
        "gratitude": "감사", "recovery": "회복", "purpose": "의미",
    }

    def _every_reason(self):
        for theme, label in self.LABELS.items():
            for mbti in SOME_TYPES:
                yield recommend(theme, mbti, theme_label=label, exclude_center=True).reason

    def test_never_leaks_a_number(self):
        """점수는 사용자에게 아무 의미가 없고, 남을 '떨어뜨린' 인상만 준다."""
        for reason in self._every_reason():
            assert not any(ch.isdigit() for ch in reason), reason

    def test_stays_on_one_line(self):
        for reason in self._every_reason():
            assert "\n" not in reason
            assert len(reason) <= 45, f"너무 김: {reason}"

    def test_no_markdown_or_emoji(self):
        for reason in self._every_reason():
            assert "*" not in reason and "#" not in reason and "_" not in reason

    def test_ends_as_a_sentence(self):
        for reason in self._every_reason():
            assert reason.endswith("다.")

    def test_no_parenthesised_particle(self):
        """
        ★ "을(를)" 은 서류 표기다.
          사람에게 건네는 문장에 들어가면 그 자리에서 기계가 티 난다.
        """
        for reason in self._every_reason():
            assert "(를)" not in reason and "(이)" not in reason and "(과)" not in reason

    def test_particle_follows_the_final_consonant(self):
        from llm_core.matching import _object_particle

        assert _object_particle("불안") == "을"   # 받침 ㄴ
        assert _object_particle("관계") == "를"   # 받침 없음
        assert _object_particle("죄책감") == "을"
        assert _object_particle("의미") == "를"
        assert _object_particle("") == "를"       # 빈 값에도 터지지 않는다

    def test_does_not_promise_a_best_match(self):
        """
        단정하면, 대화가 잘 안 풀렸을 때 사용자가 자기 탓을 한다.
        """
        for reason in self._every_reason():
            assert "가장 잘 맞" not in reason
            assert "최고" not in reason
