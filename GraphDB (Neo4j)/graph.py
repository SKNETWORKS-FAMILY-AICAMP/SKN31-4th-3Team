"""
scripture/graph.py
────────────────────────────────────────────────────────────────────────
Neo4j Aura 그래프 드라이버 래퍼.

★ 자격증명이 없으면 조용히 비활성화된다.
  NEO4J_URI 가 .env 에 없으면 그래프 확장 기능은 그냥 건너뛴다.
  (docs/05-VectorDB-GraphDB-연동-결정서.md 5절 원칙과 동일)
"""

from __future__ import annotations

import os
from functools import lru_cache

from neo4j import GraphDatabase


@lru_cache(maxsize=1)
def _driver():
    uri = os.getenv("NEO4J_URI")
    user = os.getenv("NEO4J_USERNAME")
    password = os.getenv("NEO4J_PASSWORD")
    if not uri:
        return None
    return GraphDatabase.driver(uri, auth=(user, password))


def is_available() -> bool:
    return _driver() is not None


def get_persons_for_theme(theme: str, limit: int = 5) -> list[dict]:
    """테마(intents.json 코드, 예: 'anxiety')로 관련 인물+감정+구절을 찾는다."""
    driver = _driver()
    if driver is None:
        return []
    with driver.session() as session:
        rows = session.run(
            """
            MATCH (p:Person)-[:EXPERIENCED]->(e:EmotionOrState {theme: $theme})
            OPTIONAL MATCH (v:Verse)-[:MENTIONS]->(p)
            OPTIONAL MATCH (p)-[:OVERCAME]->(resolved)
            RETURN p.name AS person, e.name AS emotion,
                   collect(DISTINCT v.ref)[0..3] AS verse_refs,
                   resolved.name AS resolution
            LIMIT $limit
            """,
            theme=theme, limit=limit,
        )
        return [dict(r) for r in rows]


def semantic_search_verses(query_embedding: list[float], top_k: int = 10) -> list[dict]:
    """벡터 유사도로 구절을 찾고, 관련 인물까지 한 번에 가져온다 (하이브리드 검색)."""
    driver = _driver()
    if driver is None:
        return []
    with driver.session() as session:
        rows = session.run(
            """
            CALL db.index.vector.queryNodes('verse_embeddings', $top_k, $embedding)
            YIELD node AS v, score
            OPTIONAL MATCH (v)-[:MENTIONS]->(p:Person)
            RETURN v.ref AS ref, v.content AS content, score,
                   collect(DISTINCT p.name) AS persons
            ORDER BY score DESC
            """,
            embedding=query_embedding, top_k=top_k,
        )
        return [dict(r) for r in rows]


def close():
    driver = _driver()
    if driver is not None:
        driver.close()
