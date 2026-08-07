"""
llm_core/chains.py
────────────────────────────────────────────────────────────────────────
LangChain 으로 상담 체인을 만든다.

    시스템(페르소나) + 지난 대화 + 이번 메시지  →  ChatOpenAI  →  답변

★ 왜 LangChain 을 쓰는가
  OpenAI SDK 를 직접 부르면 "메시지 배열을 손으로 조립하는 코드"가
  호출부마다 생긴다. 프롬프트 템플릿과 히스토리 주입을 한 곳에 묶어 두면
  나중에 RAG(검색 결과 주입)나 다른 모델로 갈아탈 때 이 파일만 고치면 된다.

★ 클라이언트는 지연 생성한다
  services.py 와 같은 이유다 — 이 모듈은 import 사슬 위에 있어서,
  최상단에서 ChatOpenAI() 를 만들면 키가 없을 때 Django 가 뜨지 않는다.

★ 스트리밍은 chain.stream() 하나로 끝난다
  LangChain 이 청크를 AIMessageChunk 로 넘겨준다. 우리가 필요한 것은
  `.content` 뿐이고, 그걸 그대로 SSE 로 흘려보낸다.
"""

from __future__ import annotations

from collections.abc import Iterator

from django.conf import settings
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

from .prompts import build_system_prompt

#: 기본 모델. 환경변수로 바꿀 수 있다 — 발표 직전에 모델만 갈아 끼우는 일이 있다.
DEFAULT_MODEL = "gpt-4o-mini"

#: 상담이므로 너무 창의적이면 곤란하고, 너무 딱딱해도 곤란하다.
DEFAULT_TEMPERATURE = 0.7

#: 지난 대화를 몇 개까지 넣을 것인가.
#: 전부 넣으면 대화가 길어질수록 토큰이 선형으로 늘고 비용이 따라 오른다.
#: 20개면 최근 10번의 주고받음이다 — 상담 맥락으로 충분하다.
HISTORY_LIMIT = 20

_llm: ChatOpenAI | None = None


def get_llm(*, streaming: bool = False) -> ChatOpenAI:
    """
    모델 인스턴스를 만든다.

    ★ 첫 호출 때 만든다.
      키가 없으면 여기서 처음 실패한다 — 서버 전체가 아니라
      이 호출만 실패한다.

    ★ streaming 여부로 인스턴스를 나누지 않는다.
      LangChain 은 .invoke() / .stream() 으로 갈리므로 같은 객체를 쓴다.
      인자를 남겨 둔 것은 호출부의 의도를 읽기 쉽게 하기 위해서다.
    """
    global _llm
    if _llm is None:
        api_key = getattr(settings, "OPENAI_API_KEY", "") or None
        if not api_key:
            raise RuntimeError(
                "OPENAI_API_KEY 가 설정되지 않았습니다. server/.env 를 확인해 주세요."
            )
        _llm = ChatOpenAI(
            model=getattr(settings, "LLM_MODEL", DEFAULT_MODEL),
            temperature=DEFAULT_TEMPERATURE,
            api_key=api_key,
        )
    return _llm


def to_messages(history: list[dict]) -> list[BaseMessage]:
    """
    DB 의 {role, content} 목록을 LangChain 메시지로 바꾼다.

    ★ system 역할은 버린다.
      시스템 프롬프트는 페르소나에서 매번 새로 만든다. DB 에 남아 있던
      옛 시스템 메시지가 섞이면 페르소나를 바꿔도 예전 지시가 따라온다.

    ★ 최근 것만 남긴다.
      대화가 길어져도 토큰이 무한정 늘지 않게 한다.
    """
    recent = history[-HISTORY_LIMIT:]

    messages: list[BaseMessage] = []
    for item in recent:
        role = item.get("role")
        content = item.get("content") or ""
        if not content:
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
        # system 은 의도적으로 건너뛴다 (위 주석 참조)
    return messages


def build_prompt(persona_id: str | None, verse_context: str | None = None) -> ChatPromptTemplate:
    """
    페르소나 시스템 프롬프트 + 히스토리 자리 + 이번 입력.

    ★ 시스템 프롬프트를 템플릿 변수로 넣지 않는다.
      f-string 이 아니라 리터럴로 박는다 — 프롬프트 안에 중괄호가
      들어가면 LangChain 이 그걸 템플릿 변수로 오해해 KeyError 를 낸다.
      성경 인용이나 사용자 문장에 { 가 섞이는 일이 실제로 있다.
    """
    system_text = build_system_prompt(persona_id, verse_context=verse_context)

    return ChatPromptTemplate.from_messages(
        [
            ("system", "{system_prompt}"),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{input}"),
        ]
    ).partial(system_prompt=system_text)


def build_chain(persona_id: str | None, verse_context: str | None = None):
    """프롬프트 → 모델. 결과는 AIMessage(또는 그 청크)다."""
    return build_prompt(persona_id, verse_context) | get_llm()


def _with_directive(message: str, directive: str | None) -> str:
    """
    이번 턴의 지시를 사용자 발화 끝에 붙인다.

    ★ 왜 시스템 프롬프트가 아니라 여기인가
      지시를 시스템 프롬프트에 두었을 때 지켜지지 않았다. 히스토리가
      열 개쯤 쌓이면 시스템 블록은 대화 저 앞이고, 모델은 방금 들은
      말에 반응한다. 같은 문장을 마지막 턴에 붙이는 것만으로 결과가
      달라진다 — 모델이 무엇을 "최근" 으로 보는지의 문제다.

    ★ DB 에는 붙이지 않는다
      사용자가 쓴 말은 이미 그대로 저장돼 있다. 여기서 만드는 것은
      모델에게 보내는 이번 요청의 입력일 뿐이고, 화면에도 안 남는다.
    """
    if not directive:
        return message
    return f"{message}\n\n{directive}"


def reply(
    message: str,
    *,
    persona_id: str | None = None,
    history: list[dict] | None = None,
    verse_context: str | None = None,
    directive: str | None = None,
) -> str:
    """한 번에 받는다."""
    chain = build_chain(persona_id, verse_context)
    result = chain.invoke({
        "input": _with_directive(message, directive),
        "history": to_messages(history or []),
    })
    return result.content


def stream_reply(
    message: str,
    *,
    persona_id: str | None = None,
    history: list[dict] | None = None,
    verse_context: str | None = None,
    directive: str | None = None,
) -> Iterator[str]:
    """
    조각으로 받는다. 한 조각이 곧 yield 하나다.

    빈 조각은 걸러 낸다 — 모델이 가끔 내용 없는 청크를 보내는데,
    그대로 흘리면 SSE 에 빈 data 줄이 쌓인다.
    """
    chain = build_chain(persona_id, verse_context)
    for chunk in chain.stream({
        "input": _with_directive(message, directive),
        "history": to_messages(history or []),
    }):
        text = getattr(chunk, "content", "")
        if text:
            yield text
