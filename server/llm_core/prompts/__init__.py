"""
llm_core/prompts
────────────────────────────────────────────────────────────────────────
시스템 프롬프트를 세 층으로 나눠 조립한다.

    공통 규범  (common.py)     ← 13명 전원 동일. 안전·상담 태도·이탈·욕설
        +
    관계 맥락  (relations.py)  ← 열둘만. 나중에 Neo4j 조회로 교체
        +
    개별 인물  (personas.py)   ← 13명 각각

★ 왜 나누는가
  한 파일에 다 적으면 안전 규칙이 13벌이 되고, 한 곳을 빠뜨리는 순간
  그 인물만 규칙을 어긴다. 공통은 한 번만 쓰고 위에 얹는다.

★ 순서가 곧 우선순위다
  공통이 맨 앞이고 페르소나가 맨 뒤다. 모델은 나중에 온 지시를 더
  따르는 경향이 있으므로, 페르소나 안에 "안전보다 연기를 우선하라"는
  말이 절대 들어가면 안 된다. 그래서 각 페르소나의 caution 이
  마지막에 한 번 더 안전을 상기시킨다.
"""

from __future__ import annotations

from .common import COMMON_RULES
from .personas import DEFAULT_PERSONA_ID, PERSONAS, Persona, get_persona
from .relations import RELATION_TONE, relations_for

__all__ = [
    "COMMON_RULES",
    "PERSONAS",
    "Persona",
    "get_persona",
    "DEFAULT_PERSONA_ID",
    "build_system_prompt",
    "opening_line",
]


def _bullets(lines: list[str]) -> str:
    return "\n".join(f"- {line}" for line in lines)


def _persona_block(p: Persona) -> str:
    """개별 인물 블록."""
    parts = [
        f"[당신이 결을 빌린 사람 — {p.name} ({p.role})]",
        "",
        "복음서가 전하는 것:",
        _bullets(p.scripture),
    ]

    if p.tradition:
        parts += [
            "",
            "오래 전해지는 이야기 (성경 본문은 아닙니다. 사실로 단정하지 마십시오):",
            _bullets(p.tradition),
        ]

    parts += [
        "",
        "어떤 사람인가:",
        p.character,
        "",
        "어떻게 말하는가:",
        p.voice,
        "",
        f"이 자리에서 잘하는 일: {p.strength}",
        "",
        "조심할 것:",
        p.caution,
    ]
    return "\n".join(parts)


def build_system_prompt(
    person_id: str | None = None,
    *,
    verse_context: str | None = None,
) -> str:
    """
    시스템 프롬프트를 조립한다.

    :param person_id: 사용자가 고른 은하. 없으면 중심 은하.
    :param verse_context:
        구절 상세에서 '상담 이어가기'로 들어온 경우 그 구절.
        RAG 가 붙으면 검색 결과가 여기로 들어온다 — 그때도 이 인자만
        채우면 되고 나머지 층은 그대로다.

    ★ 관계 블록은 예수에게 붙이지 않는다.
      중심에 있는 이에게 "당신은 열둘 중 하나"라고 말할 수 없다.
    """
    persona = get_persona(person_id)

    blocks = [COMMON_RULES]

    if persona.id != DEFAULT_PERSONA_ID:
        blocks += [relations_for(persona.id), RELATION_TONE]

    blocks.append(_persona_block(persona))

    if verse_context:
        # ★ "이 구절에서 시작된 대화입니다" 라고 못박지 않는다.
        #   여기에는 구절이 올 때도 있고, 구절 없이 인물 이야기만 올 때도
        #   있다(홈에서 질문만 던지고 들어온 경우). 구절이 있다고 단정하면
        #   없을 때 모델이 있지도 않은 구절을 지어낸다.
        blocks.append(
            "[지금 대화의 바탕]\n"
            f"{verse_context}\n\n"
            "위는 참고 재료입니다. 설명하려 들지 말고, 사용자가 지금\n"
            "어디에 서 있는지를 먼저 물으십시오.\n\n"
            "인물 이야기가 있으면, 대화가 그쪽으로 자연스럽게 닿을 때만\n"
            "한 사람 정도를 짧게 꺼내십시오. 재료를 다 쓰려 하지 마십시오.\n"
            "'누구도 그랬으니 당신도 괜찮다' 로 건너뛰지 말고, 그 사람이\n"
            "지난 자리를 먼저 말한 뒤에 사용자에게 돌아오십시오.\n"
            "위에 없는 사실을 지어내지 마십시오."
        )

    # 마지막 한 줄 — 페르소나가 안전을 덮지 못하게 다시 못박는다
    blocks.append(
        "위 인물의 결로 말하되, 안전 규칙이 페르소나보다 항상 우선합니다.\n"
        "연기와 사람의 안전이 부딪히면 연기를 멈추십시오."
    )

    return "\n\n" + "\n\n".join(blocks) + "\n"


def opening_line(person_id: str | None = None) -> str:
    """대화를 열 때의 첫 인사. LLM 을 부르지 않고 바로 쓴다."""
    return get_persona(person_id).greeting
