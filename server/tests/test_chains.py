"""
LangChain 체인 조립.

★ 여기서는 모델을 부르지 않는다
  실제 호출은 돈이 들고 느리고 답이 매번 다르다. 우리가 확인해야 하는
  것은 "모델에게 무엇이 전달되는가" 이고, 그건 부르지 않고도 볼 수 있다.

★ 잡아야 하는 고장
  - 페르소나를 골랐는데 프롬프트가 그대로 (은하 선택이 무의미해짐)
  - 마지막 발화가 히스토리와 입력에 두 번 들어감
  - 프롬프트 속 중괄호를 템플릿 변수로 오해해 터짐
"""

from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from llm_core.chains import HISTORY_LIMIT, build_prompt, to_messages
from llm_core.prompts import PERSONAS
from llm_core.services import _split


def rendered(persona_id: str | None, *, history=None, user_input="안녕하세요", verse=None) -> str:
    """체인에 들어가는 최종 메시지들을 문자열로 펼친다."""
    prompt = build_prompt(persona_id, verse)
    messages = prompt.format_messages(input=user_input, history=history or [])
    return "\n".join(str(m.content) for m in messages)


class TestPersonaReachesTheModel:
    def test_each_persona_produces_a_different_prompt(self):
        """
        ★ 이게 깨지면 은하를 고르는 일 자체가 무의미해진다.
          13개가 모두 서로 달라야 한다.
        """
        prompts = {pid: rendered(pid) for pid in PERSONAS}
        assert len(set(prompts.values())) == 13

    def test_persona_name_is_in_the_system_message(self):
        for pid, persona in PERSONAS.items():
            assert persona.name in rendered(pid)

    def test_choosing_john_does_not_leak_matthew(self):
        john = rendered("john")
        assert "요한" in john
        assert "기록하는 자" not in john  # 마태의 역할

    def test_unknown_persona_falls_back_to_center(self):
        assert "예수 그리스도" in rendered("없는-사람")
        assert "예수 그리스도" in rendered(None)


class TestSafetySurvivesComposition:
    """조립 과정에서 안전 규칙이 빠지면 안 된다."""

    @pytest.mark.parametrize("pid", sorted(PERSONAS))
    def test_safety_block_is_present(self, pid: str):
        assert "[안전" in rendered(pid)

    @pytest.mark.parametrize("pid", sorted(PERSONAS))
    def test_safety_is_restated_last(self, pid: str):
        text = rendered(pid)
        assert "안전 규칙이 페르소나보다 항상 우선합니다" in text


class TestHistory:
    def test_converts_roles(self):
        msgs = to_messages(
            [
                {"role": "user", "content": "안녕"},
                {"role": "assistant", "content": "반갑습니다"},
            ]
        )
        assert isinstance(msgs[0], HumanMessage)
        assert isinstance(msgs[1], AIMessage)

    def test_drops_stale_system_messages(self):
        """
        ★ DB 에 남아 있던 옛 시스템 메시지가 섞이면, 페르소나를 바꿔도
          예전 지시가 따라온다.
        """
        msgs = to_messages(
            [
                {"role": "system", "content": "너는 해적이다"},
                {"role": "user", "content": "안녕"},
            ]
        )
        assert len(msgs) == 1
        assert "해적" not in str(msgs[0].content)

    def test_drops_empty_content(self):
        msgs = to_messages([{"role": "user", "content": ""}, {"role": "user", "content": "안녕"}])
        assert len(msgs) == 1

    def test_keeps_only_recent(self):
        # 대화가 길어져도 토큰이 무한정 늘지 않아야 한다
        long = [{"role": "user", "content": f"메시지 {i}"} for i in range(100)]
        assert len(to_messages(long)) == HISTORY_LIMIT

    def test_history_appears_in_the_prompt(self):
        text = rendered("peter", history=to_messages([{"role": "user", "content": "지난 이야기"}]))
        assert "지난 이야기" in text


class TestSplit:
    """뷰는 이번 발화까지 포함해 넘긴다. 히스토리와 입력을 갈라야 한다."""

    def test_last_user_message_becomes_the_input(self):
        history, current = _split(
            [
                {"role": "user", "content": "첫 질문"},
                {"role": "assistant", "content": "답"},
                {"role": "user", "content": "이번 질문"},
            ]
        )
        assert current == "이번 질문"
        assert len(history) == 2

    def test_current_message_is_not_duplicated(self):
        """
        ★ 나누지 않으면 마지막 발화가 히스토리와 입력에 두 번 들어간다.
          모델이 같은 말을 두 번 들은 것으로 착각한다.
        """
        raw = [{"role": "user", "content": "잠이 안 옵니다"}]
        history, current = _split(raw)

        text = rendered("john", history=to_messages(history), user_input=current)
        assert text.count("잠이 안 옵니다") == 1

    def test_empty_history(self):
        assert _split([]) == ([], "")


class TestTemplateSafety:
    def test_braces_in_persona_do_not_break_the_template(self):
        """
        ★ 프롬프트에 { 가 있으면 LangChain 이 템플릿 변수로 오해한다.
          성경 인용이나 설명에 중괄호가 섞이는 일이 실제로 있다.
          시스템 프롬프트를 partial 로 넣는 이유가 이것이다.
        """
        for pid in PERSONAS:
            rendered(pid)  # 예외가 나지 않아야 한다

    def test_braces_in_user_input_are_safe(self):
        text = rendered("thomas", user_input="이건 {변수} 같은 글자입니다")
        assert "{변수}" in text


class TestVerseContext:
    def test_injected_when_given(self):
        text = rendered("john", verse="시편 23:1 — 목자 되심")
        assert "시편 23:1" in text

    def test_absent_when_not_given(self):
        assert "지금 대화의 바탕이 되는 구절" not in rendered("john")
