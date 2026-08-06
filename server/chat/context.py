"""
상담 프롬프트에 넣을 '이 대화의 바탕' 을 만든다.

★ 왜 뷰가 아니라 여기인가
  두 뷰(한 번에 받기 / 스트리밍)가 같은 것을 필요로 한다. 뷰마다
  따로 만들면 한쪽만 고치는 날이 오고, 그러면 "스트리밍일 때만
  답이 얕다" 는 재현하기 어려운 증상이 된다.

★ 그래프는 있으면 얹고 없으면 만다
  Neo4j 가 없거나 느리면 씨앗 구절만 들어간다. 프롬프트가 조금
  짧아질 뿐 대화는 그대로 이어진다.

★ 사실만 넣고 해석은 안 넣는다
  "베드로도 두려워했으니 괜찮습니다" 같은 문장을 여기서 만들면
  그건 그래프가 아니라 우리가 한 말이 된다. 인물·감정·회복이라는
  재료만 주고, 문장은 페르소나가 고르게 둔다.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

#: 프롬프트에 넣을 구절 본문의 최대 길이. 길면 답이 본문 해설로 샌다.
CONTENT_LIMIT = 200


def for_session(session, question: str = "") -> str | None:
    """
    세션 하나의 바탕 문맥을 만든다.

    ★ 씨앗 구절이 없어도 빈손으로 돌아가지 않는다.
      처음에는 `seed_verse` 가 없으면 바로 None 을 돌려줬다. 그런데
      홈에서 질문만 던지고 들어온 대화에는 씨앗 구절이 없다 — 그게
      가장 흔한 경로다. 결과적으로 그래프가 대화에 한 번도 안 들어갔다.

      구절이 없으면 질문의 감정으로 인물을 찾는다. 그래프가 줄 수 있는
      것은 구절만이 아니다.

    :param session: ChatSession
    :param question: 사용자의 이번 발화. 감정 주제를 뽑는 데 쓴다.
    :return: build_system_prompt(verse_context=...) 에 넣을 문자열. 없으면 None.
    """
    text = question or getattr(session, "seed_question", "") or ""
    parts: list[str] = []

    verse = _resolve_verse(session)
    if verse is not None:
        ref = f"{verse.book_code} {verse.chapter}:{verse.verse}"
        body = (verse.summary or "").strip()
        if len(body) > CONTENT_LIMIT:
            body = body[:CONTENT_LIMIT].rstrip() + "…"
        parts.append(f"{ref}\n{body}" if body else ref)

        graph_block = _graph_block(verse, text)
        if graph_block:
            parts.append(graph_block)

    witnesses = _witnesses_block(text)
    if witnesses:
        parts.append(witnesses)

    return "\n\n".join(parts) if parts else None


class _Seed:
    """두 표의 구절을 프롬프트가 쓰는 한 가지 모양으로 맞춘다."""

    def __init__(self, book_code: str, chapter: int, verse: int, summary: str):
        self.book_code = book_code
        self.chapter = chapter
        self.verse = verse
        self.summary = summary


def _resolve_verse(session):
    """
    씨앗 구절을 찾는다. 큐레이션 표를 먼저, 없으면 성경전서를.

    ★ 두 표를 다 봐야 한다.
      화면의 별 2,652개 중 큐레이션 Verse 는 702개뿐이다. 나머지
      1,950개는 BibleVerse 다. 외래키만 보면 별 넷 중 셋이 문맥 없이
      대화를 시작한다 — 오류는 안 나고 답만 얕아진다.
    """
    verse = getattr(session, "seed_verse", None)
    if verse is not None:
        return verse

    ref = (getattr(session, "seed_verse_ref", "") or "").strip()
    if not ref:
        return None

    try:
        from scripture.models import BibleVerse

        row = BibleVerse.objects.filter(pk=ref).only(
            "book_code", "chapter", "verse", "content"
        ).first()
        if row is None:
            return None
        return _Seed(row.book_code, row.chapter, row.verse, row.content or "")
    except Exception as exc:
        logger.warning("씨앗 구절을 못 읽었습니다 — 없이 진행합니다: %s", exc)
        return None


def _witnesses_block(question: str) -> str:
    """질문의 감정을 지나간 인물들. 구절이 없는 대화의 유일한 그래프 재료다."""
    if not question:
        return ""
    try:
        from scripture import graph
        from scripture.intents import match_intent

        if not graph.enabled():
            return ""

        theme = match_intent(question)
        if not theme:
            return ""
        return graph.witnesses_prompt(graph.theme_witnesses(theme))
    except Exception as exc:
        logger.warning("증인 조회 실패 — 없이 진행합니다: %s", exc)
        return ""


def _graph_block(verse, question: str) -> str:
    """
    Neo4j 에서 이 구절의 인물·감정·회복을 읽어 온다.

    ★ 실패는 조용하다.
      그래프가 없어서 빈 문자열이 오는 것과, Aura 가 죽어서 빈 문자열이
      오는 것을 부르는 쪽이 구분할 이유가 없다. 둘 다 "얹을 게 없다" 다.
    """
    try:
        from scripture import graph
        from scripture.intents import match_intent

        if not graph.enabled():
            return ""

        verse_id = f"{verse.book_code}.{verse.chapter}.{verse.verse}"
        theme = match_intent(question) if question else ""
        context = graph.verse_context(verse_id, theme or "")
        return context.as_prompt()
    except Exception as exc:
        # 여기서 예외가 새면 상담 자체가 500 이 된다. 재료 하나 때문에.
        logger.warning("그래프 맥락을 못 읽었습니다 — 없이 진행합니다: %s", exc)
        return ""
