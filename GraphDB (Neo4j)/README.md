# Neo4j 그래프 — 팀원 전달 패키지

## 이 폴더에 있는 것

- `GRAPH_SCHEMA.md` — 그래프 노드/관계 구조, 쿼리 예시
- `graph.py` — Django `server/scripture/graph.py`에 그대로 붙여 넣을 수 있는 Neo4j 드라이버 래퍼 초안

## 연결 정보 (별도 전달 — 이 문서엔 안 남김)

Aura 인스턴스 이름: **Eden**
아래 값은 카카오톡/디스코드 등 별도 채널로 전달합니다 (이 폴더가 깃에 커밋될 수 있어 비밀번호는 여기 안 넣음):
- `NEO4J_URI`
- `NEO4J_USERNAME`
- `NEO4J_PASSWORD`

## 해야 할 것

1. `server/requirements.txt`에 `neo4j` 드라이버 추가
2. `server/.env`에 위 3개 값 추가
3. `graph.py`를 `server/scripture/graph.py`로 복사
4. `scripture/intents.py::match_intent()` 내부에서 필요시 `graph.py`의 함수를 호출하도록 확장 (시그니처는 유지)

## 참고

- 이 그래프는 팀 프로젝트 발표(2026-08-07) 이후 재사용 예정이 있어, 인스턴스 자체를 삭제하지 말고 필요 없어지면 알려주세요.
- `Temptation`, `Typology`, `PARENT_OF`, `SIMILAR_TO`, `Verse.embedding`은 팀 프로젝트 필수 요구사항엔 없는 보너스 데이터입니다. 안 써도 무방합니다.
