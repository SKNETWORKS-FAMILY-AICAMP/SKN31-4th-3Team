# 백엔드 연동 경계 (mock boundaries)

> **⚠️ 이 문서는 합병 이전 기준입니다.**
> 연동은 이미 끝났습니다. 현재 구조와 API 계약은
> **[`01-통합-설계서.md`](./01-통합-설계서.md)** 를 보세요.
>
> 여기서 언급하는 `backend/app/**`(FastAPI)는
> 저장소에서 제거됐고, 도메인 로직은 `server/`(Django)에
> 통합됐습니다. 이 문서는 **당시 어떤 판단으로 경계를 그었는지**의
> 기록으로 남깁니다 — 특히 6절(클라이언트에 남겨야 하는 것)은 지금도 유효합니다.

프론트엔드는 백엔드 없이 완결되어 있습니다. 이 문서는 **어디를 바꾸면 실제
API로 전환되는지**와, 그때 주의할 점을 정리합니다.

작성 기준: `frontend/` Phase 7 완료 시점

---

## 1. 한 줄 요약

교체 지점은 **`frontend/src/services/RepositoryProvider.tsx` 한 곳**입니다.

```ts
// TODO(api): 백엔드 연동 시 httpRepositories 로 교체
const DEFAULT_REPOSITORIES: Repositories = mockRepositories;
```

화면 코드는 `services/repositories.ts`의 **인터페이스에만** 의존하며, mock 모듈을
직접 import 하는 곳이 한 군데도 없습니다. 구현체를 바꿔 끼우면 화면은 한 줄도
고치지 않습니다.

---

## 2. 파일별 처리

| 파일 | 연동 시 |
|---|---|
| `services/repositories.ts` | **유지** — 계약. 여기 시그니처가 기준이다 |
| `services/RepositoryProvider.tsx` | **1줄 수정** — 구현체 교체 |
| `services/mockRepositories.ts` | **삭제 대상** |
| `services/httpRepositories.ts` | **신규 작성** (아래 매핑표 참조) |
| `data/answers.ts` | **삭제 대상** — 서버 응답으로 대체 |
| `data/verses.ts` | 유지하되 **점진 축소** — 5절 참조 |
| `data/intents.ts` | **부분 유지** — 6절(안전) 참조 |
| `services/intentMatcher.ts` | **부분 유지** — 6절 참조 |

---

## 3. 엔드포인트 매핑

### `VerseRepository.ask(question, attempt)`

→ `POST /api/chat/recommend` (`backend/app/api/chat_router.py`)

| 프론트 | 백엔드 (`RecommendRequest`) | 비고 |
|---|---|---|
| `question` | `message` | |
| `attempt` | `emo_weight` | 백엔드 주석에 이미 "'다른 벗 추천' 반복 시 증가"로 같은 개념이 있다. `1.0 + attempt * 0.5` 정도로 매핑 권장 |

응답 매핑 (`RecommendResponse` → `AskResult`):

| 백엔드 | 프론트 | 비고 |
|---|---|---|
| `emotion` | `intent` | **값 정렬 필요** — 4절 참조 |
| `emotion_label` | (표시용) | 프론트는 `THEME_LABELS`로 자체 표시 중 |
| `ranked[]` (`DiscipleCard`) | — | **대응 필드 없음** — 4절 참조 |
| — | `empathy`, `reflection` | **서버에 없음** — 서버가 생성해 내려줘야 한다 |
| — | `verseIds` | 서버가 구절 id를 내려줘야 한다 |
| — | `followUps` | 없으면 프론트에서 빈 배열 처리 |

### `CounselRepository.send(threadId, text, seed)`

→ `POST /api/chat/answer`

| 프론트 | 백엔드 (`ChatRequest`) |
|---|---|
| `text` | `message` |
| `seed.verseId` → 화자 결정 | `person_id` |
| (스레드 이력) | `history` |

응답 (`ChatResponse` → `CounselMessage`):

| 백엔드 | 프론트 |
|---|---|
| `answer` | `text` |
| `verses[0]` | `verseId` (구절 식별자 필요 — 4절) |
| `person_name` | 현재 미사용 |

### `CounselRepository.startThread(seed)`

→ **신설 필요.** 현재 백엔드에 세션 생성 엔드포인트가 없습니다.
서버 세션이 필요 없다면 클라이언트에서 id를 만들고, 첫 안내 메시지만
`/api/chat/answer`로 받아오는 방식도 가능합니다.

---

## 4. 스키마 차이 (해결 필요)

`backend/app/models/schemas.py`와 프론트 타입 사이에 다음 간극이 있습니다.

### 4.1 구절에 안정적 식별자가 없다 — **가장 중요**

백엔드 `Verse`는 `book / chapter / verse / content / source` 로만 되어 있고
id가 없습니다. 프론트는 `VerseStar.id`(예: `gen-1-3`)를 URL, 카메라 목표,
추천 결과 참조에 모두 씁니다.

**권장:** 백엔드 `Verse`에 `id` 필드를 추가하고, 프론트의 슬러그 규칙
(`{책약어}-{장}-{절}`)과 동일하게 생성합니다. 그러면 별 ↔ 구절 대응이
서버·클라이언트 양쪽에서 같은 키로 유지됩니다.

`frontend/src/data/verses.ts`의 `id`가 그 규칙의 참조 구현입니다.

### 4.2 감정 라벨 체계가 다르다

| 백엔드 (`emotion.py`) | 프론트 (`ThemeTag`) |
|---|---|
| 7종: anxiety, sadness, anger, joy, doubt, decision, neutral | 12종: anxiety, grief, loneliness, relationship, career, fear, forgiveness, guilt, hope, gratitude, recovery, purpose |

**권장:** 백엔드를 프론트의 12종으로 확장합니다. 프론트의
`data/intents.ts`가 확장된 키워드 사전의 참조 구현입니다.
당장 확장이 어렵다면 서버 7종 → 프론트 12종 매핑 테이블을
`httpRepositories.ts` 안에 두고, 부족한 축은 fallback으로 흡수합니다.

### 4.3 인물(제자) 개념 — 프론트는 "공간"으로 가져갔다

프론트는 제자를 **화자**가 아니라 **은하(공간)** 로 도입했습니다.
`data/disciples.ts`가 중심 1개(예수 그리스도) + 제자 12개 = 13개 은하를
정의하고, 모든 구절은 정확히 하나의 은하에 속합니다
(`VerseStar.discipleId`). 화면에서는 12개 은하가 중심을 타원 고리로
공전하며 각자 자전합니다.

`disciples.ts`의 `id` / `name` / `role`은 백엔드
`mock_data.py`의 `PEOPLE`과 같은 값을 쓰도록 맞춰 두었습니다.
연동 시 이 파일이 API 응답으로 대체됩니다.

**아직 남은 결정:** 백엔드의 MBTI 궁합 기반 **화자** 선택을 유지할지 여부.
유지한다면 `AskResult`에 `speaker` 필드를 추가하고 답변 패널에 화자 표시를
넣는 작업이 별도로 필요합니다. 은하 배치와 화자는 서로 독립된 축입니다 —
한쪽을 다른 쪽으로 대체하지 마세요.

**구절 → 은하 배정**은 현재 프론트의 저작 데이터입니다
(`disciples.ts`의 `verseIds`). 서버가 이 관계를 갖게 되면 배열만 응답으로
바꾸면 되고, 좌표는 `placeInGalaxy()`가 순번으로부터 파생시키므로
손댈 것이 없습니다.

---

## 5. 구절 데이터의 이행 경로

현재 구성은 **네 층**입니다. 층마다 담는 것이 다르므로 섞지 마세요.

| 층 | 개수 | 파일 | 담는 것 | 클릭 |
|---|---|---|---|---|
| 큐레이션 (`depth: 'full'`) | 40 | `data/verses.ts` | 인용·스토리·묵상·추천 질문 | O |
| 연관 구절 (`depth: 'brief'`) | 480 | `data/relatedVerses.ts` | 출처 + 자체 요약 한 줄 | O |
| 배경 별 | 다수 | `data/backdrop.ts` | 66권 31,077절의 **책별 분포**만 | X |
| 먼지 | 다수 | `galaxy/dust.ts` | 구절과 무관한 장식 입자 | X |

### 연관 구절 480개에 본문이 없는 이유

번역본 저작권을 확인할 수 없는 인용을 480건 싣지 않기 위해서입니다.
장절만 표기하고 설명은 자체 요약으로 대체했습니다.
**연동 시 가장 먼저 채워야 할 구멍이 이것입니다** — 정식 번역본 API 또는
라이선스를 확보한 본문이 붙으면 `BriefVerseStar`에 `excerpt`/`attribution`을
더해 `FullVerseStar`와 같은 화면을 쓸 수 있습니다.

`data/verses.test.ts`의 "연관 구절에는 본문 인용이 없다" 테스트가 이 원칙을
지키고 있으므로, 라이선스를 확보한 뒤에는 그 테스트도 함께 손봐야 합니다.

### 장절의 실재는 생성 시점에 검증했다

480개 장절은 저장소의 `data/bible_structured.json`(31,077절 전문)과 대조해
전부 실재를 확인한 뒤 생성했습니다. 프런트 번들에 7MB 전문을 넣을 수는
없으므로 런타임 테스트는 형식과 배정만 봅니다.
**장절을 손으로 고치지 마세요.** 고쳐야 한다면 같은 대조를 다시 거치세요.

### 연동 순서

1. 서버가 구절 메타(id, ref, excerpt, themes, motif, story, meditation)를
   내려주면 `verses.ts`를 API 응답으로 교체합니다.
2. 좌표는 **서버가 주지 않아도 됩니다.** `galaxy/placement.ts`가 은하 안
   순번으로 좌표를 파생시키므로, 구절이 수천 개로 늘어도 좌표 관리가 필요 없습니다.
3. `data/backdropSeed.ts`는 자동 생성 파일입니다
   (`npm run gen:backdrop`). 성경 데이터가 바뀌면 재생성하세요.

---

## 6. ★ 클라이언트에 반드시 남겨야 하는 것

### 위기 신호 판정

`services/intentMatcher.ts`의 `isCrisis()`와 `data/intents.ts`의
`CRISIS_KEYWORDS`는 **서버로 옮기지 마세요.**

이유: 서버가 죽거나 네트워크가 끊겨도 안전 안내는 떠야 합니다. 현재
`AskRoute`와 `CounselRoute` 모두 네트워크 요청 **이전에** 클라이언트에서
먼저 판정하고, 위기로 판정되면 mock/API 호출 자체를 하지 않습니다.

서버에도 판정을 두는 것은 좋습니다 — 다만 **클라이언트 판정을 대체하는 게
아니라 추가**여야 합니다.

관련 테스트:

- `routes/AskRoute.test.tsx` — "위기 신호에는 구절 대신 안내 화면이 나온다"
- `routes/CounselRoute.test.tsx` — "대화 중 위기 신호에는 서버를 기다리지 않고
  안내가 붙는다" (`send`가 호출되지 않음을 단언)

### 상담 창구 정보

`components/common/SafetyNotice.tsx`에는 전화번호가 **의도적으로 없습니다.**
지역·시점에 따라 달라지고 틀린 번호는 위험하기 때문입니다.

연동 시 서버가 지역·언어에 맞는 공식 창구를 내려주고, 해당 컴포넌트의
`TODO(api)` 자리에 렌더하세요.

---

## 7. 연동 시 체크리스트

- [ ] `Verse`에 `id` 필드 추가 (4.1)
- [ ] 감정 라벨 12종 정렬 또는 매핑 테이블 작성 (4.2)
- [ ] **연관 구절 480개에 정식 번역본 본문 채우기 (5절)** — 가장 먼저
- [ ] 구절 → 은하 배정을 서버로 옮길지 결정 (4.3)
- [ ] MBTI 화자 개념 유지 여부 결정 (4.3, 은하 배치와는 별개 축)
- [ ] `empathy` / `reflection` 생성 책임을 서버로 이관
- [ ] `startThread` 대응 방식 결정 (신설 or 클라이언트 생성)
- [ ] `httpRepositories.ts` 작성 후 `RepositoryProvider` 1줄 교체
- [ ] `mockRepositories.ts`, `answers.ts` 삭제
- [ ] **위기 판정은 클라이언트에 남았는지 확인** (6절)
- [ ] 기존 테스트가 mock 주입으로 계속 통과하는지 확인
      (테스트는 `RepositoryProvider`의 `value` prop으로 가짜 구현을 주입한다 —
      실 API로 바뀌어도 테스트는 그대로 동작한다)
