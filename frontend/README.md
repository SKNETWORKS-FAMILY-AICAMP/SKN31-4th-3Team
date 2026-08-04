# Eden Frontend

성경 구절과 그 배경 스토리를 사용자의 질문·감정·상황과 연결해 탐색하는 웹 경험.
현재 **백엔드 연동 전 목업** 단계입니다. 모든 데이터는 타입이 정의된 mock 이며,
교체 지점은 `src/services/RepositoryProvider.tsx` 한 곳입니다.

## 실행

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (HMR) |
| `npm run build` | 프로덕션 빌드 |
| `npm run lint` | ESLint (jsx-a11y 포함) |
| `npm run typecheck` | TypeScript 검사 |
| `npm run test` | Vitest |
| `npm run gen:backdrop` | `../data/bible_structured.json` → 책별 절 수 분포 재생성 |

## 라우트

| 경로 | 화면 |
|---|---|
| `/` | 창조 인트로 |
| `/home` | 질문 입력 |
| `/ask?q=` | mock 답변 + 추천 구절 |
| `/sky`, `/sky?focus=<id>` | 은하수 탐색 |
| `/verse/:id` | 구절 상세 (오버레이 — 배경은 별자리 유지) |
| `/counsel?from=<id>&q=` | 상담 대화 |

## 구조 원칙

- **은하수 캔버스는 라우터 바깥에 있다.** `App.tsx`에서 `<GalaxyCanvas/>`는 `<Routes/>`
  형제로 배치되어 절대 언마운트되지 않는다. 화면 전환이 "페이지 이동"이 아니라
  "같은 우주 안에서의 이동"으로 느껴지게 하기 위한 구조다.
- **별 하나 = 구절 하나.** 큐레이션 별 40개(`src/data/verses.ts`)는 상세 콘텐츠를 갖고,
  배경 별은 실제 성경 66권 31,077절의 책별 분포에 비례해 생성된다(`src/data/backdrop.ts`).
  본문 텍스트는 번들에 포함하지 않는다.
- **좌표는 데이터가 아니라 규칙이다.** `src/galaxy/placement.ts`가 주제 링/구면 분포로
  좌표를 파생시키므로, 별이 수천 개로 늘어도 좌표를 손으로 관리하지 않는다.
- **화면 코드는 mock 을 직접 import 하지 않는다.** `src/services/repositories.ts`의
  인터페이스에만 의존한다.

## 폰트

| 용도 | 폰트 | 라이선스 | 출처 |
|---|---|---|---|
| 본문·UI | Pretendard Variable | SIL OFL 1.1 | jsDelivr 동적 서브셋 |
| 성경 구절 | Noto Serif KR | SIL OFL 1.1 | Google Fonts |

Pretendard는 `unicode-range` 로 쪼갠 동적 서브셋(@font-face 92개)을 쓴다 —
화면에 실제로 등장한 글자 구간만 내려받으므로 한글 폰트의 용량 문제가 생기지 않는다.
세리프는 성경 구절 본문에만 제한적으로 사용한다.

## 백엔드 교체 지점

`src/services/repositories.ts`의 `TODO(api)` 주석 참조.

| 인터페이스 메서드 | 대체될 엔드포인트 |
|---|---|
| `VerseRepository.ask(q, attempt)` | `POST /api/chat/recommend` (`attempt` → `emo_weight`) |
| `CounselRepository.send` | `POST /api/chat/answer` |
| `CounselRepository.startThread` | (신설 필요) 세션 생성 |

`intentMatcher`의 **위기 신호 판정만은 클라이언트에 남긴다** — 네트워크 실패 시에도
안전 안내가 동작해야 하기 때문이다.

## 번들 구성

라우트별 코드 스플리팅이 적용되어 있다. 첫 진입(`/`)에서는 인트로에 필요한
것만 받고, 나머지 화면은 이동할 때 받는다.

| 청크 | gzip | 비고 |
|---|---|---|
| react | 60.3 KB | react + react-dom (거의 안 바뀜 → 캐시 잘 됨) |
| router | 13.6 KB | react-router |
| index | 25.3 KB | 앱 코드 + 은하수 엔진 + 구절 데이터 |
| 라우트별 | 1~3 KB | 필요할 때만 |
| CSS | 4.9 KB | |

첫 화면 기준 약 **104 KB (gzip)**.

## 현재 진행 단계

- [x] Phase 1 — 디자인 토큰, 앱 셸, 라우팅, mock data 모델
- [x] Phase 2 — 창조 인트로 + 별 수렴 애니메이션
- [x] Phase 3 — 홈 질문 UI + 오프닝 문구 로테이션
- [x] Phase 4 — mock 질문·답변 흐름 + 추천 구절 카드
- [x] Phase 5 — 은하수 탐색, 카메라 비행, 구절 상세
- [x] Phase 6 — 상담 대화 UI, 반응형, 접근성, 에러/빈 상태
- [x] Phase 7 — 성능, 시각 QA, 테스트, 완료 문서화
