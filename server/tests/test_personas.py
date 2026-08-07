"""
페르소나 정합성.

★ 여기서 잡아야 하는 고장
  사용자가 요한 은하를 눌렀는데 마태가 답하는 것. 화면(disciples.ts)과
  프롬프트(personas.py)가 각자 목록을 들고 있으므로, 한쪽만 고치면
  조용히 어긋난다. 어긋나도 서버는 멀쩡히 돌아가서 아무도 모른다.

★ 안전 규칙이 페르소나에 눌리지 않는지도 본다
  프롬프트 조립 순서가 바뀌면 연기가 안전을 덮을 수 있다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from llm_core.prompts import (
    COMMON_RULES,
    DEFAULT_PERSONA_ID,
    PERSONAS,
    build_system_prompt,
    opening_line,
)

REPO = Path(__file__).resolve().parents[2]
DISCIPLES_TS = REPO / "frontend" / "src" / "data" / "disciples.ts"
GALAXIES_JSON = REPO / "server" / "scripture" / "fixtures" / "galaxies.json"


def galaxy_rows() -> list[dict]:
    """시드 데이터의 13은하. 화면과 서버가 공유하는 원본이다."""
    return json.loads(GALAXIES_JSON.read_text(encoding="utf-8"))


class TestRegistry:
    def test_thirteen_personas(self):
        assert len(PERSONAS) == 13

    def test_ids_have_no_duplicates(self):
        assert len(set(PERSONAS)) == len(PERSONAS)

    def test_every_persona_id_matches_its_key(self):
        for key, persona in PERSONAS.items():
            assert key == persona.id


class TestMatchesScreen:
    """★ 화면의 13은하와 1:1 이어야 한다."""

    def test_same_ids(self):
        screen_ids = {row["id"] for row in galaxy_rows()}
        assert screen_ids == set(PERSONAS)

    def test_same_names_and_roles(self):
        """
        이름·역할이 다르면 사용자는 '베드로의 은하'를 눌렀는데
        다른 소개를 읽게 된다.
        """
        for row in galaxy_rows():
            persona = PERSONAS[row["id"]]
            assert persona.name == row["name"], f"{row['id']} 이름 불일치"
            assert persona.role == row["role"], f"{row['id']} 역할 불일치"

    def test_same_mbti(self):
        # 오른쪽 목록의 궁합 계산이 이 값을 쓴다
        for row in galaxy_rows():
            assert PERSONAS[row["id"]].mbti == row["mbti"], f"{row['id']} MBTI 불일치"

    def test_center_is_default(self):
        center = next(row["id"] for row in galaxy_rows() if row["is_center"])
        assert center == DEFAULT_PERSONA_ID

    def test_ts_and_fixture_agree(self):
        """
        시드 JSON 은 disciples.ts 에서 뽑은 것이다. 둘이 어긋나면
        위 검사들이 잘못된 기준을 보게 된다.
        """
        ts = DISCIPLES_TS.read_text(encoding="utf-8")
        for row in galaxy_rows():
            assert f"id: '{row['id']}'" in ts, f"{row['id']} 가 disciples.ts 에 없음"


class TestContent:
    def test_every_persona_is_filled_in(self):
        for pid, p in PERSONAS.items():
            assert p.scripture, f"{pid}: 복음서 근거가 비어 있음"
            assert p.character.strip(), f"{pid}: character 비어 있음"
            assert p.voice.strip(), f"{pid}: voice 비어 있음"
            assert p.strength.strip(), f"{pid}: strength 비어 있음"
            assert p.greeting.strip(), f"{pid}: 첫 인사 비어 있음"

    def test_every_persona_has_a_caution(self):
        """
        ★ 강점만 적으면 그 성격이 상담에서 해롭게 작동한다.
          '열심 있는 시몬'이 사용자를 몰아붙이는 식이다.
        """
        for pid, p in PERSONAS.items():
            assert p.caution.strip(), f"{pid}: caution 이 비어 있음"

    def test_greetings_are_short(self):
        # 첫 인사가 길면 사용자가 말을 꺼내기 전에 지친다
        for pid, p in PERSONAS.items():
            assert len(p.greeting) <= 120, f"{pid}: 첫 인사가 너무 김"

    def test_no_archaic_endings(self):
        """
        전원 현대 존댓말이다. 옛 번역투는 상담에서 거리를 만든다.
        """
        archaic = ["하느니라", "할지어다", "하였느니라", "이니라", "하리라"]
        for pid, p in PERSONAS.items():
            blob = p.voice + p.greeting + p.character
            for word in archaic:
                assert word not in blob, f"{pid}: 옛 어미 '{word}'"

    def test_tradition_is_separated_from_scripture(self):
        """
        전승을 성경인 양 말하지 않기 위해 필드를 나눴다.
        scripture 쪽에 '전해집니다' 가 섞이면 그 구분이 무너진다.
        """
        for pid, p in PERSONAS.items():
            for line in p.scripture:
                assert "전해집니다" not in line, f"{pid}: 전승이 scripture 에 섞임"


class TestSensitivePersonas:
    """가룟 유다는 잘못 다루면 해롭다."""

    def test_judas_forbids_despair(self):
        judas = PERSONAS["judas"]
        blob = judas.caution + judas.strength
        assert "절망" in blob
        assert "늦지 않았다" in blob or "닫혀 있지 않" in judas.strength

    def test_judas_caution_points_back_to_safety(self):
        # 이 페르소나에서는 자해 신호 대응이 특히 엄격해야 한다
        assert "안전" in PERSONAS["judas"].caution

    def test_hot_tempered_personas_warn_against_pushing(self):
        """야고보·시몬은 사용자를 몰아붙이기 쉽다."""
        assert "몰아붙" in PERSONAS["james"].caution
        assert "분노" in PERSONAS["simon"].caution


class TestSystemPrompt:
    def test_builds_for_every_persona(self):
        for pid in PERSONAS:
            prompt = build_system_prompt(pid)
            assert PERSONAS[pid].name in prompt
            assert len(prompt) > 500

    def test_unknown_id_falls_back_to_center(self):
        # 대화가 안 열리는 것보다 낫다
        assert PERSONAS[DEFAULT_PERSONA_ID].name in build_system_prompt("없는-사람")
        assert PERSONAS[DEFAULT_PERSONA_ID].name in build_system_prompt(None)

    def test_common_rules_come_first(self):
        """
        ★ 순서가 곧 우선순위다.
          페르소나가 앞에 오면 연기가 안전 규칙을 덮을 여지가 생긴다.
        """
        prompt = build_system_prompt("peter")
        assert prompt.index("[안전") < prompt.index("[당신이 결을 빌린 사람")

    def test_safety_is_restated_at_the_end(self):
        # 모델은 나중에 온 지시를 더 따르는 경향이 있다
        for pid in PERSONAS:
            tail = build_system_prompt(pid)[-300:]
            assert "안전" in tail

    def test_every_prompt_carries_the_common_rules(self):
        for pid in PERSONAS:
            prompt = build_system_prompt(pid)
            assert "[안전" in prompt
            assert "[상담 태도]" in prompt
            assert "[욕설·비방이 나왔을 때]" in prompt
            assert "[상담과 무관한 질문]" in prompt

    def test_disciples_get_relations_but_center_does_not(self):
        """중심에 있는 이에게 '당신은 열둘 중 하나'라고 할 수 없다."""
        assert "열둘 중 한 사람" in build_system_prompt("peter")
        assert "열둘 중 한 사람" not in build_system_prompt("jesus")

    def test_verse_context_is_injected(self):
        prompt = build_system_prompt("john", verse_context="시편 23:1 — 목자 되심")
        assert "시편 23:1" in prompt

    def test_verse_context_carries_no_turn_rules(self):
        """
        ★ 이번 답변에서 무엇을 할지는 여기서 정하지 않는다.
          chat/context.py 가 턴 수를 보고 정해서 verse_context 끝에
          실어 보낸다. 여기서 또 규칙을 쓰면 두 벌의 지시가 들어가고,
          서로 어긋나는 순간 모델은 편한 쪽 — 대개 아무것도 안 하는
          쪽을 고른다.
        """
        prompt = build_system_prompt("john", verse_context="재료")
        assert "두 번째 답변부터" not in prompt
        assert "첫 답변에서는" not in prompt

    def test_no_markdown_leaks_into_output_rules(self):
        # 대화창에 ** 가 그대로 노출되는 것을 막는다
        assert "마크다운" in COMMON_RULES


class TestJesusFraming:
    """
    프로젝트 지침: 인물을 강하게 규정하기보다 빛·음성·상징을 우선한다.
    '나는 예수다' 라고 선언하지 않는 결을 지킨다.
    """

    def test_does_not_claim_divinity(self):
        voice = PERSONAS["jesus"].voice
        assert "선언하지 않습니다" in voice
        assert "대변하지도 않습니다" in voice

    def test_common_rules_disclaim_representing_god(self):
        assert "신을 대변하지도 않습니다" in COMMON_RULES

    def test_avoids_declaring_gods_will(self):
        assert "하나님의 뜻" in PERSONAS["jesus"].caution


class TestOpeningLine:
    def test_returns_greeting(self):
        assert opening_line("thomas") == PERSONAS["thomas"].greeting

    def test_unknown_falls_back(self):
        assert opening_line("없는-사람") == PERSONAS[DEFAULT_PERSONA_ID].greeting


@pytest.mark.parametrize("pid", sorted(PERSONAS))
def test_prompt_has_no_unfilled_placeholder(pid: str):
    """{name} 같은 미치환 자리표시자가 남아 있으면 그대로 모델에 간다."""
    prompt = build_system_prompt(pid)
    assert not re.search(r"\{[a-z_]+\}", prompt), f"{pid}: 치환되지 않은 자리표시자"
