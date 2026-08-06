"""
Neo4j Aura — 감정·인물·사건 그래프로 가는 유일한 통로.

★ 이 파일이 무엇인가
  벡터 검색이 "말이 비슷한 구절" 을 찾는다면, 그래프는 "이어져 있는
  구절" 을 찾는다. 번아웃에 잠언 24:10("네 힘이 미약함을 보임이니라")
  이 올라오는 문제는 문장 유사도로는 못 고친다. 그 구절이 질책이라는
  것은 본문이 아니라 관계가 안다.

★ 실패는 기능이 아니라 침묵이다
  Aura 가 느리거나 죽거나 스키마가 다르면 이 모듈의 모든 함수는
  빈 값을 돌려준다. 예외를 위로 던지지 않는다. 그래프는 답을 더
  좋게 만드는 재료이지 답을 만드는 재료가 아니다. 재료 하나가
  없다고 상담 화면이 안 뜨면 그건 설계가 잘못된 것이다.

  발표 중에 Aura 세션이 만료돼도 사용자는 아무것도 눈치채지 못해야
  한다 — 답이 조금 덜 풍부해질 뿐이다.

★ 그래서 타임아웃이 짧다
  기본 드라이버는 연결이 안 되면 수십 초를 기다린다. 상담 요청 하나가
  그만큼 멈추면 이미 실패한 것이다. 여기서는 초 단위로 끊고 포기한다.

★ 구절 키는 "책 장:절" 문자열이다
  적재 쪽이 그렇게 넣었다. 우리 DB 의 id 는 "창.1.1" 이므로 경계에서
  한 번만 바꾼다 (`graph_key`). 두 표기가 코드 여기저기 섞이면
  "왜 안 붙지" 를 매번 다시 확인하게 된다.

★ Verse.embedding 은 쓰지 않는다
  그래프에도 1536차원 임베딩과 벡터 인덱스가 있다. 우리 pgvector 는
  qwen3-embedding:8b 로 만든 다른 공간이다. 두 공간의 점수를 섞으면
  숫자는 나오지만 뜻이 없다. 벡터는 Postgres 가, 관계는 여기가 맡는다.

★ 우리가 쓰는 스키마 (팀원 GRAPH_SCHEMA.md)
    (Verse {ref, content})-[:MENTIONS]->(Person {name})
    (Person)-[:EXPERIENCED]->(EmotionOrState {name, theme, category})
    (Person)-[:OVERCAME]->(EmotionOrState)   회복된 상태가 목적지다
    (Galaxy {id})-[:CURATES]->(Verse)

  EmotionOrState.theme 은 우리 intents.json 의 코드와 같은 값이다.
  질문에서 뽑은 주제를 그대로 넣을 수 있다는 뜻이고, 이것이 벡터와
  그래프를 잇는 유일한 다리다.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)

#: 연결과 질의에 주는 시간. 넘으면 그래프 없이 간다.
#:
#: ★ 넉넉하게 잡고 싶은 유혹이 있다.
#:   그런데 이 값은 "그래프가 늦을 때 사용자가 기다리는 시간" 이다.
#:   Aura 무료 등급은 유휴 후 첫 질의가 느리다. 그 한 번을 위해 모두를
#:   기다리게 하느니, 그 한 번을 포기하는 편이 낫다.
CONNECT_TIMEOUT = 3.0
QUERY_TIMEOUT = 2.0

#: 드라이버는 프로세스마다 하나면 된다. 커넥션 풀을 스스로 관리한다.
_driver: Any = None
_driver_failed = False


def enabled() -> bool:
    """그래프를 쓸 수 있는 설정인가. 값이 비어 있으면 조용히 꺼진다."""
    return bool(getattr(settings, "NEO4J_URI", "")) and bool(
        getattr(settings, "NEO4J_PASSWORD", "")
    )


def graph_key(verse_id: str) -> str:
    """
    우리 id → 그래프 키.

        "창.1.1"  →  "창 1:1"
        "요.3.16" →  "요 3:16"

    ★ 모양이 다르면 그대로 돌려준다.
      점이 두 개가 아닌 id 가 들어오면 바꾸지 않는다. 억지로 자르면
      "붙긴 붙었는데 아무것도 안 걸리는" 상태가 되고, 그건 안 붙은
      것보다 알아내기 어렵다.
    """
    parts = verse_id.split(".")
    if len(parts) != 3:
        return verse_id
    book, chapter, verse = parts
    return f"{book} {chapter}:{verse}"


def _get_driver() -> Any:
    """드라이버 하나를 만들어 재사용한다. 실패하면 다시 시도하지 않는다."""
    global _driver, _driver_failed

    if _driver is not None:
        return _driver
    if _driver_failed or not enabled():
        return None

    try:
        from neo4j import GraphDatabase
    except ImportError:
        # 드라이버가 안 깔린 환경(예: 프론트만 돌리는 사람)도 있다.
        logger.info("neo4j 드라이버가 없습니다. 그래프 기능을 끕니다.")
        _driver_failed = True
        return None

    try:
        _driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            connection_timeout=CONNECT_TIMEOUT,
            # ★ 재시도를 짧게 둔다. 기본값은 30초이고, 그동안 요청이 멈춘다.
            max_transaction_retry_time=QUERY_TIMEOUT,
        )
    except Exception as exc:  # 주소 오타·인증 실패·DNS 등 무엇이든
        logger.warning("Neo4j 연결 실패 — 그래프 없이 진행합니다: %s", exc)
        _driver_failed = True
        return None

    return _driver


def query(cypher: str, **params: Any) -> list[dict[str, Any]]:
    """
    Cypher 하나를 돌리고 레코드를 dict 목록으로 준다.

    ★ 예외를 밖으로 내보내지 않는다.
      부르는 쪽은 "결과가 없다" 와 "그래프가 죽었다" 를 구분할 필요가
      없다. 둘 다 그래프 가중치가 없다는 뜻이고, 처리도 같다.

    ★ 드라이버를 얻는 것까지 try 안이다.
      처음에는 `_get_driver()` 를 try 밖에 두었다. 드라이버 생성은
      그 안에서 이미 감쌌으니 안전하다고 봤는데, 설정 접근이나 임포트가
      터지면 그대로 샌다. 테스트가 이걸 잡았다.
    """
    try:
        driver = _get_driver()
        if driver is None:
            return []
        with driver.session() as session:
            result = session.run(cypher, timeout=QUERY_TIMEOUT, **params)
            return [record.data() for record in result]
    except Exception as exc:
        logger.warning("Cypher 실패 — 그래프 없이 진행합니다: %s", exc)
        return []


#: 같은 감정을 "겪은" 인물이 등장하는 구절에 주는 가산점.
#:
#: ★ THEME_BONUS(0.06) 보다 훨씬 작게 둔다.
#:   사람이 직접 배정한 주제가 그래프 추론보다 신뢰도가 높다.
#:   그래프는 동점을 가르는 정도이지 순위를 뒤집는 역할이 아니다.
#:
#: ★ 처음에 0.04 로 두었다가 낮췄다.
#:   실측해 보니 후보들의 벡터 점수가 0.66~0.68 사이에 몰려 있었다.
#:   가산점 0.04 는 그 폭 전체와 맞먹어서, 동점을 가르는 게 아니라
#:   순위를 새로 쓰고 있었다. 번아웃 질문에서 마태복음 11:28 이
#:   1등에서 밀려난 것이 그 결과다.
EXPERIENCED_BONUS = 0.015

#: 그 감정을 "이겨 낸" 인물이 등장하는 구절에 주는 가산점.
#:
#: ★ 겪은 것보다 크게 준다.
#:   번아웃에 잠언 24:10("네 힘이 미약함을 보임이니라")이 올라오던 문제가
#:   여기서 눌린다. 그 구절도 낙심을 말하지만 이겨 낸 이야기가 아니다.
#:   위로를 구하는 사람에게는 "같은 자리를 지나온 사람" 이 필요하다.
#:
#: ★ OVERCAME 은 드물다. 그래서 신호가 된다.
#:   EXPERIENCED 는 흔해서 거의 모든 구절에 붙는다.
OVERCAME_BONUS = 0.04

#: 한 구절이 받을 수 있는 가산점의 상한.
MAX_BOOST = 0.05

#: 이 수보다 많은 구절이 언급하는 인물은 가산점 계산에서 뺀다.
#:
#: ★ 모든 곳에 있는 노드는 아무것도 구분해 주지 못한다.
#:   적재된 그래프에서 `여호와` 를 언급하는 구절이 6,020개다. 성경
#:   전체의 19% 다. 이 인물을 그대로 두면 후보 60개 중 대부분에
#:   가산점이 켜지고, 모두에게 주는 점수는 아무에게도 안 주는 것과 같다.
#:
#: ★ 처음에는 "테마 개수" 로 쟀다가 틀렸다.
#:   여호와가 12종 테마 전부에 걸려 있어서 그걸 자로 삼았는데, 다윗도
#:   11종이었다. 다윗은 시편의 절반을 쓴 사람이고 감정의 폭이 넓은 것이
#:   당연하다 — 그건 잡음이 아니라 신호다. 4종으로 자르니 쓸 만한 인물이
#:   전부 잘려 나가 그래프가 아무 일도 안 하게 됐다.
#:
#:   여호와가 쓸모없는 이유는 감정이 많아서가 아니라 어디에나 있어서다.
#:   그러니 재야 할 것은 감정의 폭이 아니라 등장 범위다.
#:
#: ★ 이름을 하드코딩하지 않는다.
#:   `여호와`, `예수` 를 목록으로 막을 수도 있다. 그러면 적재가 바뀌어
#:   새 허브가 생길 때마다 목록을 고쳐야 하고, 고치기 전까지는 조용히
#:   잡음이 낀다. 등장 횟수로 재면 관리할 목록이 없다.
#:
#: 실측(2,861명 / 29,813개 연결):
#:     여호와   6,020절   ← 빠진다
#:     예수     1,877절   ← 빠진다
#:     이스라엘   982절
#:     다윗       928절   ← 남는다
#:     모세       816절
#:     베드로     163절
#:
#: 1,000 으로 자르면 어디에나 있는 둘만 빠지고 나머지는 남는다.
HUB_MENTION_LIMIT = 1000

#: 상담 프롬프트에 넣을 인물 수. 많이 넣으면 프롬프트만 길어지고
#: 답은 산만해진다.
CONTEXT_PERSONS = 3


def boost(verse_ids: list[str], theme: str) -> dict[str, float]:
    """
    후보 구절들 중 질문의 감정과 이어진 것에 가산점을 준다.

    :param verse_ids: 우리 DB 의 id 들 ("창.1.1" 형식)
    :param theme: intents 코드 (예: "anxiety")
    :return: 우리 id → 가산점. 그래프가 없거나 실패하면 빈 dict.
    """
    if not theme or not verse_ids or not enabled():
        return {}

    # 그래프 키 → 우리 id. 돌아올 때 되돌리려고 들고 있는다.
    back = {graph_key(vid): vid for vid in verse_ids}

    # ★ query() 가 이미 총체적인데 여기도 감싼다.
    #   query 가 막는 것은 "질의가 실패한 경우" 다. 질의가 성공했는데
    #   응답의 모양이 우리 예상과 다른 경우(스키마가 바뀌어 키가 없다든지)
    #   는 아래 파싱에서 KeyError 로 터진다. 그건 검색 요청 전체를
    #   500 으로 만든다 — 가산점 하나 때문에.
    try:
        rows = query(
            """
            MATCH (v:Verse) WHERE v.ref IN $refs
            MATCH (v)-[:MENTIONS]->(p:Person)

            // 어디에나 등장하는 인물은 구절을 가려 내지 못한다.
            //
            // ★ COUNT {} 는 차수 저장소를 읽어서 O(1) 이다.
            //   MATCH 로 세면 여호와 하나만으로 6,020행이 펼쳐진다.
            //   후보 60개에 그걸 곱하면 2초 타임아웃에 걸린다.
            WHERE COUNT { (p)<-[:MENTIONS]-(:Verse) } <= $hub_limit

            MATCH (p)-[r:EXPERIENCED|OVERCAME]->(e:EmotionOrState {theme: $theme})
            RETURN v.ref AS ref,
                   count(DISTINCT CASE WHEN type(r) = 'EXPERIENCED' THEN p END) AS felt,
                   count(DISTINCT CASE WHEN type(r) = 'OVERCAME'    THEN p END) AS won
            """,
            refs=list(back.keys()),
            theme=theme,
            hub_limit=HUB_MENTION_LIMIT,
        )

        result: dict[str, float] = {}
        for row in rows:
            vid = back.get(row.get("ref"))
            if vid is None:
                continue
            # ★ 인물 수에 비례해서 주지 않는다.
            #   있음/없음만 본다. 비례해서 주면 상한에 늘 닿아 구분이 사라진다.
            score = (EXPERIENCED_BONUS if row.get("felt") else 0.0) + (
                OVERCAME_BONUS if row.get("won") else 0.0
            )
            if score:
                result[vid] = min(score, MAX_BOOST)

        return result
    except Exception as exc:
        logger.warning("그래프 가산점 계산 실패 — 벡터 점수만 씁니다: %s", exc)
        return {}


@dataclass
class VerseContext:
    """상담 프롬프트에 넣을, 구절 하나의 관계 맥락."""

    ref: str = ""
    #: 이 구절에 등장하는 인물 이름
    persons: list[str] = field(default_factory=list)
    #: 그 인물들이 겪은 감정/상태 이름
    emotions: list[str] = field(default_factory=list)
    #: 그 인물들이 그 감정에서 도달한 상태 (회복)
    overcame: list[str] = field(default_factory=list)

    @property
    def empty(self) -> bool:
        return not (self.persons or self.emotions or self.overcame)

    def as_prompt(self) -> str:
        """
        프롬프트에 붙일 한 덩어리.

        ★ 사실만 적고 해석은 안 한다.
          "베드로는 두려움을 이겼으니 당신도 이길 수 있다" 같은 문장을
          여기서 만들면, 그건 그래프가 아니라 우리가 한 말이 된다.
          재료만 주고 말은 상담 모델이 고르게 둔다.
        """
        if self.empty:
            return ""

        lines = [f"[{self.ref} 의 관계 맥락]"]
        if self.persons:
            lines.append(f"등장 인물: {', '.join(self.persons)}")
        if self.emotions:
            lines.append(f"이들이 겪은 상태: {', '.join(self.emotions)}")
        if self.overcame:
            lines.append(f"이들이 지나 간 자리: {', '.join(self.overcame)}")
        return "\n".join(lines)


def verse_context(verse_id: str, theme: str = "") -> VerseContext:
    """
    구절 하나의 인물·감정·회복을 읽어 온다. 상담 프롬프트에 쓴다.

    :param theme: 주면 그 주제의 감정을 우선해 고른다. 없으면 아무거나.
    """
    ref = graph_key(verse_id)
    context = VerseContext(ref=ref)
    if not enabled():
        return context

    # boost() 와 같은 이유로 파싱까지 감싼다. 상담 답변 하나를
    # 못 만드는 것보다 맥락 없이 만드는 편이 낫다.
    try:
        rows = query(
            """
            MATCH (v:Verse {ref: $ref})-[:MENTIONS]->(p:Person)

            // 가산점과 같은 허브 제외.
            //
            // ★ 프롬프트에서도 같은 이유로 뺀다.
            //   `여호와 → 기쁨, 분노, 슬픔, 경고, 긍휼…` 을 그대로 넣으면
            //   모델은 어느 감정이 지금 대화와 관계있는지 못 고른다.
            //   재료를 많이 주는 것과 쓸 재료를 주는 것은 다르다.
            WHERE COUNT { (p)<-[:MENTIONS]-(:Verse) } <= $hub_limit

            OPTIONAL MATCH (p)-[:EXPERIENCED]->(e:EmotionOrState)
                WHERE $theme = '' OR e.theme = $theme
            OPTIONAL MATCH (p)-[:OVERCAME]->(o:EmotionOrState)
                WHERE $theme = '' OR o.theme = $theme
            RETURN p.name AS person,
                   collect(DISTINCT e.name)[0..2] AS emotions,
                   collect(DISTINCT o.name)[0..2] AS overcame
            LIMIT $limit
            """,
            ref=ref,
            theme=theme,
            hub_limit=HUB_MENTION_LIMIT,
            limit=CONTEXT_PERSONS,
        )

        for row in rows:
            if row.get("person"):
                context.persons.append(row["person"])
            context.emotions.extend(n for n in (row.get("emotions") or []) if n)
            context.overcame.extend(n for n in (row.get("overcame") or []) if n)

        # 중복은 없애되 순서는 유지한다 (앞에 온 것이 주제에 가깝다)
        context.emotions = list(dict.fromkeys(context.emotions))
        context.overcame = list(dict.fromkeys(context.overcame))
    except Exception as exc:
        logger.warning("그래프 맥락 조회 실패 — 맥락 없이 진행합니다: %s", exc)
        return VerseContext(ref=ref)

    return context


@dataclass
class Witness:
    """어떤 감정을 지나간 인물 하나."""

    person: str = ""
    #: 그가 겪은 상태 이름
    felt: list[str] = field(default_factory=list)
    #: 그가 도달한 상태 이름
    became: list[str] = field(default_factory=list)


def theme_witnesses(theme: str, limit: int = 3) -> list[Witness]:
    """
    이 감정을 지나간 인물들.

    ★ 구절이 없는 대화를 위해 있다.
      홈에서 질문만 던지고 상담으로 들어오면 씨앗 구절이 없다.
      그 경우에도 그래프가 줄 것이 있다 — "이 감정을 지나간 사람이
      성경에 있다" 는 사실이다. 그게 이 서비스가 하려는 말이기도 하다.

    ★ OVERCAME 만 본다.
      겪은 사람은 너무 많아서 아무나 나온다. 지나간 사람은 드물고,
      드물기 때문에 이야기가 된다.
    """
    if not theme or not enabled():
        return []

    try:
        rows = query(
            """
            MATCH (p:Person)-[:OVERCAME]->(e:EmotionOrState {theme: $theme})
            WHERE COUNT { (p)<-[:MENTIONS]-(:Verse) } <= $hub_limit
            OPTIONAL MATCH (p)-[:EXPERIENCED]->(f:EmotionOrState {theme: $theme})
            RETURN p.name AS person,
                   collect(DISTINCT f.name)[0..2] AS felt,
                   collect(DISTINCT e.name)[0..2] AS became
            LIMIT $limit
            """,
            theme=theme,
            hub_limit=HUB_MENTION_LIMIT,
            limit=limit,
        )
        return [
            Witness(
                person=row.get("person") or "",
                felt=[n for n in (row.get("felt") or []) if n],
                became=[n for n in (row.get("became") or []) if n],
            )
            for row in rows
            if row.get("person")
        ]
    except Exception as exc:
        logger.warning("증인 조회 실패 — 없이 진행합니다: %s", exc)
        return []


def witnesses_prompt(witnesses: list[Witness]) -> str:
    """
    증인 목록을 프롬프트 한 덩어리로.

    ★ 여기서도 해석은 안 붙인다.
      "그러니 당신도 이겨 낼 수 있습니다" 를 우리가 쓰면 그건 그래프가
      아니라 우리 문장이다. 누구가 무엇을 지나갔다는 사실만 준다.
    """
    if not witnesses:
        return ""

    lines = ["[이 감정을 지나간 사람들]"]
    for w in witnesses:
        felt = ", ".join(w.felt) or "같은 자리"
        became = ", ".join(w.became)
        lines.append(f"{w.person}: {felt} → {became}" if became else f"{w.person}: {felt}")
    return "\n".join(lines)


@dataclass
class Schema:
    """탐침이 읽어 온 그래프의 생김새."""

    labels: list[str] = field(default_factory=list)
    relationships: list[str] = field(default_factory=list)
    #: 라벨 → 노드 수
    counts: dict[str, int] = field(default_factory=dict)
    #: 라벨 → 그 라벨 노드 하나가 가진 속성 이름들
    properties: dict[str, list[str]] = field(default_factory=dict)
    #: (시작라벨, 관계, 끝라벨) 조합
    patterns: list[str] = field(default_factory=list)

    @property
    def reachable(self) -> bool:
        return bool(self.labels)


def probe() -> Schema:
    """
    무엇이 적재돼 있는지 읽어 온다.

    ★ 왜 코드가 아니라 탐침이 먼저인가
      스키마를 짐작해서 Cypher 를 쓰면, 안 걸렸을 때 원인이 세 갈래로
      갈린다 — 연결이 안 된 건지, 라벨 이름이 다른 건지, 데이터가 없는
      건지. 먼저 읽어 두면 그 셋을 한 번에 구분할 수 있다.
    """
    schema = Schema()

    for row in query("CALL db.labels() YIELD label RETURN label ORDER BY label"):
        schema.labels.append(row["label"])

    for row in query(
        "CALL db.relationshipTypes() YIELD relationshipType "
        "RETURN relationshipType ORDER BY relationshipType"
    ):
        schema.relationships.append(row["relationshipType"])

    for label in schema.labels:
        # ★ 라벨은 파라미터로 못 넣는다 (Cypher 문법).
        #   db.labels() 가 준 값만 쓰므로 외부 입력이 섞일 자리는 없다.
        rows = query(f"MATCH (n:`{label}`) RETURN count(n) AS c")
        schema.counts[label] = rows[0]["c"] if rows else 0

        sample = query(f"MATCH (n:`{label}`) RETURN keys(n) AS k LIMIT 1")
        schema.properties[label] = sorted(sample[0]["k"]) if sample else []

    for row in query(
        "MATCH (a)-[r]->(b) "
        "RETURN DISTINCT labels(a)[0] AS a, type(r) AS r, labels(b)[0] AS b "
        "LIMIT 60"
    ):
        schema.patterns.append(f"({row['a']})-[:{row['r']}]->({row['b']})")

    return schema


def close() -> None:
    """테스트와 관리 명령이 끝날 때 커넥션을 정리한다."""
    global _driver
    if _driver is not None:
        try:
            _driver.close()
        except Exception:
            pass
        _driver = None
