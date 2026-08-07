# Eden 프로젝트 — Neo4j 그래프 스키마

> Neo4j Aura 인스턴스("Eden")에 올라간 그래프의 구조 문서. Django 연동(`server/scripture/graph.py`) 작성 시 참고.

## 노드 (Node Labels)

| 라벨 | 고유 키 | 주요 속성 | 설명 |
|---|---|---|---|
| `Person` | `name` | - | 성경 인물 (실명 + 서술적 지칭 혼재). 중복 제거(entity resolution) 완료 |
| `EmotionOrState` | `name` | `category`(20종), `theme`(12종, `intents.json`과 동일 코드) | 인물이 겪은 감정/상태 |
| `Verse` | `ref` (`"책 장:절"`) | `content`, `book`, `chapter`, `verse`, `embedding`(1536차원 벡터) | 성경 구절 전체(31,077개), 본문 포함 |
| `Galaxy` | `id` | `name`, `role`, `mbti`, `is_center`, `order` | 팀 프로젝트 은하(예수+12제자), 13개 |
| `Temptation` | `verse_ref` | `sweet_argument`, `actual_outcome`, `resisted`, `label` | 유혹 서사 8건 (개인 앱 전용, 팀은 안 씀) |
| `Typology` | `old_ref` | `new_ref`, `old_event`, `new_fulfillment`, `connection` | 예표-성취 6쌍 |

## 관계 (Relationship Types)

| 타입 | 시작→끝 | 주요 속성 | 설명 |
|---|---|---|---|
| `INTERACTS_WITH` | Person→Person | `type`(원문), `category`(정규화됨), `contexts`(배열) | 인물 간 상호작용 |
| `EXPERIENCED` | Person→EmotionOrState | `contexts`(배열) | 인물이 겪은 감정 |
| `OVERCAME` | Person→EmotionOrState | `verse_ref`, `from_emotion`, `context` | 회복/극복 (목적지 노드=회복된 상태) |
| `MENTIONS` | Verse→Person | - | 구절에 등장/언급된 인물 |
| `CURATES` | Galaxy→Verse | `order` | 팀 프로젝트 큐레이션 702구절 |
| `TEMPTED_BY` | Person→Temptation | - | 유혹받은 인물 |
| `OFFERED_BY` | Temptation→Person | - | 유혹을 가한 존재 |
| `PREFIGURES` | Verse→Typology | - | 구약 예표 구절 |
| `FULFILLED_IN` | Typology→Verse | - | 신약 성취 구절 |
| `PARENT_OF` | Person→Person | - | 부모-자녀 (족보 91건) |
| `SIMILAR_TO` | Verse→Verse | `score`(코사인 유사도) | 벡터 임베딩 기반 유사 구절 (상위 6개) |

## 벡터 인덱스

```cypher
CREATE VECTOR INDEX verse_embeddings IF NOT EXISTS
FOR (v:Verse) ON (v.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}}
```

## 자주 쓸 쿼리 예시

```cypher
// 은하 하나에 속한 구절 (팀 프로젝트 기존 기능과 매핑)
MATCH (g:Galaxy {id: $galaxyId})-[:CURATES]->(v:Verse) RETURN v ORDER BY v.order

// 특정 테마(intents.json 코드)로 인물+구절 찾기
MATCH (p:Person)-[:EXPERIENCED]->(e:EmotionOrState {theme: $theme})
OPTIONAL MATCH (v:Verse)-[:MENTIONS]->(p)
RETURN p, e, v LIMIT 10

// 벡터+그래프 하이브리드 검색
CALL db.index.vector.queryNodes('verse_embeddings', 10, $queryEmbedding)
YIELD node AS v, score
MATCH (v)-[:MENTIONS]->(p:Person)
RETURN v.content, p.name, score ORDER BY score DESC
```

## 참고

- 팀 프로젝트에 필수인 것: `Person`, `EmotionOrState`, `Verse`, `Galaxy`, `MENTIONS`, `EXPERIENCED`, `INTERACTS_WITH`, `CURATES`
- 개인 앱 전용/보너스: `Temptation`, `Typology`, `PARENT_OF`, `SIMILAR_TO`, `Verse.embedding` — 팀에서 안 써도 무방, 있어도 방해 안 됨
