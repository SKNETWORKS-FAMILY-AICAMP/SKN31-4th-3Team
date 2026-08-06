# llm_core/services.py
"""
상담 답변 생성.

★ 이 파일은 얇은 겉면이다.
  실제 조립은 chains.py 가 한다. 여기 두 함수는 chat/views.py 가
  부르는 이름과 시그니처를 지키기 위한 것이다 — 뷰를 고치지 않고
  안쪽을 LangChain 으로 갈아 끼웠다.

★ 페르소나는 인자로 받는다
  세션마다 어느 은하와 이야기하는지가 다르다. 기본값(None)이면
  중심 은하로 떨어진다.
"""

from __future__ import annotations

from collections.abc import Iterator

from .chains import reply, stream_reply

#: 모델명·온도 등은 chains.py 에 있다. 두 곳에 두면 한쪽만 바뀐다.
__all__ = ["generate_llm_response", "generate_llm_stream_response"]


def generate_llm_response(
    messages_history: list,
    system_prompt: str | None = None,
    *,
    persona_id: str | None = None,
    verse_context: str | None = None,
) -> str:
    """
    한 번에 답변을 받는다 (동기 방식).

    ★ system_prompt 인자는 남겨 두되 쓰지 않는다.
      예전 호출부와의 호환을 위해 자리만 지킨다. 시스템 프롬프트는
      이제 페르소나에서 만들어지므로, 밖에서 덮어쓰면 안전 규칙이
      통째로 사라질 수 있다.

    :param messages_history: [{"role": ..., "content": ...}] — 마지막이 이번 발화
    """
    history, current = _split(messages_history)
    try:
        return reply(
            current,
            persona_id=persona_id,
            history=history,
            verse_context=verse_context,
        )
    except Exception as e:
        raise RuntimeError(f"OpenAI API 호출 중 오류가 발생했습니다: {str(e)}")


def generate_llm_stream_response(
    messages_history: list,
    *,
    persona_id: str | None = None,
    verse_context: str | None = None,
) -> Iterator[str]:
    """답변을 조각으로 흘려보낸다 (SSE 용)."""
    history, current = _split(messages_history)
    yield from stream_reply(
        current,
        persona_id=persona_id,
        history=history,
        verse_context=verse_context,
    )


def _split(messages_history: list) -> tuple[list[dict], str]:
    """
    히스토리와 '이번 메시지'를 가른다.

    ★ 뷰는 이번 발화까지 포함한 전체를 넘긴다.
      LangChain 템플릿은 히스토리와 입력을 따로 받으므로 여기서 나눈다.
      나누지 않고 통째로 넣으면 마지막 발화가 두 번 들어간다.
    """
    if not messages_history:
        return [], ""

    last = messages_history[-1]
    if last.get("role") == "user":
        return list(messages_history[:-1]), last.get("content", "")

    # 마지막이 사용자 발화가 아니면(이례적) 전부 히스토리로 본다
    return list(messages_history), ""
