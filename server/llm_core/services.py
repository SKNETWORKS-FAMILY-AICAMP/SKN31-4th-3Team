# llm_core/services.py
"""
OpenAI 호출을 감싸는 얇은 층.

★ 클라이언트를 모듈 로드 시점에 만들지 않는다.
  OpenAI(api_key=None) 은 생성 즉시 예외를 던진다. 이 파일은
  chat/views → chat/urls → config/urls 로 이어지는 import 사슬 위에 있어서,
  모듈 최상단에서 만들면 **키가 없을 때 Django 자체가 뜨지 않는다.**
  로그인도, 은하도, 구절도 전부 막힌다.

  키가 없어서 막혀야 하는 것은 "LLM 답변 생성" 하나뿐이다.
"""

from django.conf import settings
from openai import OpenAI

#: 기본 모델. 두 함수가 같은 값을 쓰도록 한곳에 둔다.
MODEL = "gpt-4o-mini"

DEFAULT_SYSTEM_PROMPT = "너는 친절하고 유용한 AI 보조원이야."

_client = None


def get_client() -> OpenAI:
    """
    처음 호출될 때 한 번만 만든다.

    키가 없으면 여기서 처음으로 실패한다 — 호출한 화면만 오류를 보고,
    나머지 서비스는 계속 돈다.
    """
    global _client
    if _client is None:
        api_key = getattr(settings, "OPENAI_API_KEY", "") or None
        if not api_key:
            raise RuntimeError(
                "OPENAI_API_KEY 가 설정되지 않았습니다. server/.env 를 확인해 주세요."
            )
        _client = OpenAI(api_key=api_key)
    return _client


def generate_llm_response(messages_history: list, system_prompt: str = None) -> str:
    """이전 대화 내역을 받아 한 번에 답변을 생성한다 (동기 방식)."""
    formatted_messages = [
        {"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT}
    ]
    formatted_messages.extend(messages_history)

    try:
        response = get_client().chat.completions.create(
            model=MODEL,
            messages=formatted_messages,
            temperature=0.7,
        )
        return response.choices[0].message.content
    except Exception as e:
        raise RuntimeError(f"OpenAI API 호출 중 오류가 발생했습니다: {str(e)}")


def generate_llm_stream_response(messages_history):
    """답변을 조각으로 흘려보낸다 (SSE 용). 조각 하나가 곧 yield 하나다."""
    response = get_client().chat.completions.create(
        model=MODEL,
        messages=messages_history,
        stream=True,
    )
    for chunk in response:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
