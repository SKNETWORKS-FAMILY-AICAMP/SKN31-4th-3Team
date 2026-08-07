# GraphDB (Neo4j) 챗봇 지식그래프 개발 README

**GraphDB Lead - Task Breakdown & Execution Plan**

- **역할:** Neo4j
  - 그래프DB 설계 및 구축 리드 (Graph RAG 파트)
- **기술 스택:**
  - Python 3.13, Neo4j (Aura Free), OpenAI API (`gpt-4o-mini`, `text-embedding-3-small`), Ollama(초기 프로토타입), LangChain
- **연동 대상:**
  - Django (`server/scripture/graph.py`), Vector RAG(pgvector, 팀원 담당) 하이브리드 구조

---

## GraphDB 개발 계획 요약

- **개요 및 프로젝트 범위 (Scope)**:
  - 성경 인물 간 관계·감정·구절 지식그래프를 구축해, Django 상담 챗봇이 근거 있는 답변(Graph RAG)을 생성할 수 있게 지원
- **단계별 작업 프로세스 (1~6단계)**:
  - 데이터 소스 확보 → 인물/관계/감정 추출 → 구조 정제 → 벡터 임베딩(하이브리드 RAG) → 심화 데이터 보강 → Aura 배포/문서화
- **상세 기술 스택 및 산출물 명시**:
  - LLM 기반 구조화 추출 파이프라인 (Ollama 로컬 GPU → OpenAI 병렬 처리로 전환)
  - Neo4j 벡터 인덱스(`CREATE VECTOR INDEX`) 기반 Vector + Graph RAG 하이브리드 쿼리
  - Neo4j Aura Free 배포 및 팀 핸드오프 패키지(`GRAPH_SCHEMA.md`, `graph.py`) 작성

---

## GraphDB 개발 주요 목표 (GraphDB Scope)

1. **근거 있는 상담 응답 지원:** 사용자 질문(테마)에 대해 성경 인물의 실제 사례·회복 서사를 그래프 탐색으로 찾아 Django에 제공
2. **Vector + Graph RAG 하이브리드:** 별도 벡터DB 없이 Neo4j 자체 벡터 인덱스로 의미 검색과 관계 탐색을 한 쿼리에서 결합
3. **데이터 정합성:** LLM 추출 특성상 발생하는 인물 중복·관계 표기 불일치·신학적 오류를 정제하여 안정적인 그래프 확보

---

## 1. 전체 작업 흐름 (Process Lifecycle)

| 단계 (Phase) | 단계명                                  | 핵심 과제                                                                            | 예상 비중 |
| :----------- | :-------------------------------------- | :----------------------------------------------------------------------------------- | :-------: |
| **STEP 1**   | **데이터 소스 확보 및 파이프라인 설계** | 성경 원문 JSON 확보, 청킹 전략 설계, LLM 추출 스키마(Pydantic) 정의                  |    10%    |
| **STEP 2**   | **인물/관계/감정 추출**                 | 622개 청크 LLM 구조화 추출, 회복/극복(`OVERCAME`) 서사 추출                          |    25%    |
| **STEP 3**   | **그래프 구조 정제**                    | 구절-인물 연결(`MENTIONS`), 인물 중복 제거(entity resolution), 관계 타입 정규화      |    20%    |
| **STEP 4**   | **Vector + Graph RAG 하이브리드 구축**  | 구절/감정 벡터 임베딩, Neo4j 벡터 인덱스, `SIMILAR_TO` 유사도 네트워크               |    15%    |
| **STEP 5**   | **심화 데이터 보강**                    | 감정 카테고리·테마 태깅, 유혹패턴, 예표-성취, 가족관계, 인물 프로필·현대적 적용 원리 |    20%    |
| **STEP 6**   | **Aura 배포 & 문서화**                  | Neo4j Aura Free 마이그레이션, 스키마 문서화, Django 연동용 `graph.py` 작성           |    10%    |

---

## 2. 단계별 상세 작업 내역 (Detailed Tasks)

### STEP 1: 데이터 소스 확보 및 파이프라인 설계

- **성경 원문 확보**
  - `참고자료/bibleAPI/bible_structured.json` — 31,077절 전문(`book/chapter/verse/content`)
  - 50구절 단위 청킹(622개 청크) 전략 수립
- **LLM 추출 스키마 설계**
  - Pydantic 모델(`Relationship`, `EmotionState`, `GraphExtraction`)로 구조화 출력 강제
  - 산출물: [`build_graph_openai.py`](../Neo4j/build_graph_openai.py)

### STEP 2: 인물/관계/감정 추출 (Core Extraction)

- **로컬 LLM(Ollama) → OpenAI 전환**
  - 초기 로컬 GPU(gemma4:12b) 프로토타입 → 속도/안정성 비교 후 OpenAI(`gpt-4o-mini`) + 병렬 처리(ThreadPoolExecutor)로 전환
  - 산출물: [`build_graph_openai.py`](../Neo4j/build_graph_openai.py) — `INTERACTS_WITH`, `EXPERIENCED` 관계 생성
- **회복/극복 서사 추출**
  - 부정적 감정 → 회복된 상태로의 전환을 별도 관계로 추출 (`verse_ref`, `from_emotion`, `context` 포함)
  - 산출물: [`extract_overcomings.py`](../Neo4j/extract_overcomings.py) — `OVERCAME` 관계, 823건

### STEP 3: 그래프 구조 정제 (Data Quality)

- **구절-인물 연결**
  - 전체 622청크에서 구절별 등장 인물 태깅, `Verse` 노드 생성
  - 산출물: [`link_verse_mentions.py`](../Neo4j/link_verse_mentions.py) — `MENTIONS` 관계, 29,813건
- **인물 중복 제거 (Entity Resolution)**
  - 동일 인물의 표기 변형("다윗"/"다윗 왕" 등) 병합, 신학적으로 민감한 오병합(성부/성자 등) 방지 예외 목록 적용
  - 산출물: [`merge_duplicate_persons.py`](../Neo4j/merge_duplicate_persons.py)
- **관계 타입 정규화**
  - 자유 텍스트로 추출된 관계 유형을 16개 고정 카테고리로 재분류
  - 산출물: [`normalize_relationship_types.py`](../Neo4j/normalize_relationship_types.py)

### STEP 4: Vector + Graph RAG 하이브리드 구축

- **벡터 임베딩**
  - `text-embedding-3-small`로 전체 31,077개 구절 + 9,864개 감정 라벨 임베딩
  - 산출물: [`generate_verse_embeddings.py`](../Neo4j/generate_verse_embeddings.py), [`generate_emotion_embeddings.py`](../Neo4j/generate_emotion_embeddings.py)
- **Neo4j 벡터 인덱스 & 유사도 네트워크**
  - `CREATE VECTOR INDEX` + `db.index.vector.queryNodes()`로 그래프 탐색과 벡터 검색을 단일 Cypher 쿼리로 결합
  - `SIMILAR_TO` 관계로 구절-구절, 감정-감정 유사도 네트워크 구축 (225,882건)

### STEP 5: 심화 데이터 보강

- **감정 분류 체계**
  - 감정 카테고리(20종) + 팀 프로젝트 `intents.json`과 동일한 테마 코드(12종) 태깅
  - 산출물: [`categorize_emotions.py`](../Neo4j/categorize_emotions.py), [`categorize_themes.py`](../Neo4j/categorize_themes.py)
- **특화 데이터**
  - 유혹 패턴(`Temptation`, 8건), 예표-성취(`Typology`, 6건), 족보(`PARENT_OF`, 91건), 구절별 감정 강도(`magnitude`, 30,991건)
  - 산출물: `extract_temptations.py`, `extract_typology.py`, `extract_family_tree.py`, `extract_magnitude.py`
- **인물 프로필 & 현대적 적용**
  - 주요 인물 100명 캐릭터 요약, 회복 서사의 현대적 적용 원리(`modern_principle`) 추출
  - ⚠️ 신적 존재("여호와"/"예수")는 자동생성 시 신학적 오해 소지 발견 → 제외 처리, 수동 작성 필요로 표시
  - 산출물: `generate_person_profiles.py`, `extract_modern_principles.py`

### STEP 6: Aura 배포 & 문서화

- **Neo4j Aura Free 마이그레이션**
  - 로컬 그래프(노드 44,328 / 관계 262,236, Aura Free 한도 내)를 Aura 인스턴스로 이관
  - 산출물: [`migrate_to_aura.py`](../Neo4j/migrate_to_aura.py)
- **Django 연동 문서화**
  - 그래프 스키마, 쿼리 예시, `.env` 설정 가이드, 드라이버 래퍼 코드 제공
  - 산출물: [`GRAPH_SCHEMA.md`](./GRAPH_SCHEMA.md), [`README.md`](./README.md), [`graph.py`](./graph.py)

---

## 3. 최종 그래프 규모

| 노드           |       개수 | 관계           |        개수 |
| :------------- | ---------: | :------------- | ----------: |
| Person         |      3,358 | MENTIONS       |      29,813 |
| EmotionOrState |      9,864 | SIMILAR_TO     |     225,882 |
| Verse          |     31,079 | INTERACTS_WITH |       2,631 |
| Galaxy         |         13 | EXPERIENCED    |       2,280 |
| Temptation     |          8 | OVERCAME       |         777 |
| Typology       |          6 | 기타           |         845 |
| **합계**       | **44,328** | **합계**       | **262,236** |