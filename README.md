# Eden — 말씀의 별자리

성경 구절과 그 배경 이야기를, 사용자의 질문·감정·상황과 이어 탐색하는 웹 애플리케이션입니다.

칠흑 같은 우주에서 창세기 1장의 문장이 흐르고, 별들이 모여 은하가 됩니다.
별 하나가 성경 구절 하나입니다.

---

## 빠르게 실행

```bash
# 전체 (Django + PostgreSQL + Nginx)
docker compose up --build          # → http://localhost

# 화면만 (백엔드 없이 mock 데이터)
cd frontend && npm install && npm run dev
```

- 서비스: <http://localhost>
- API 문서(Swagger): <http://localhost/api/v1/docs/>

---

## 구조

```
frontend/   React 19 + TypeScript + Vite   — 은하수 캔버스, 상담 UI
server/     Django 5.2 + DRF                — 인증, 구절, 대화(SSE)
docs/       설계·배포·통합 문서 + 팀 원본 산출물(docs/team/)
data/       성경 전문 (31,077절) — 장절 검증, 향후 VectorDB 원본
```

## 숫자

| | |
|---|---|
| 은하 | 13개 (예수 그리스도 + 12제자) |
| 구절 | 702개 (큐레이션 40 + 연관 662) |
| 테스트 | 587개 (프론트 562 + 백엔드 25) |
| 첫 로드 | gzip 약 136KB |

---

## 문서

| 문서 | 읽어야 할 때 |
|---|---|
| [통합 설계서 & API 계약서](docs/01-통합-설계서.md) | 구조를 파악하거나 API 를 부를 때 |
| [AWS 배포·운영서](docs/02-AWS-배포-운영서.md) | 배포하거나 장애를 볼 때 |
| [산출물 갱신](docs/03-산출물-갱신.md) | 요구사항·화면·테스트 명세가 필요할 때 |
| [발표 요약](docs/04-발표-요약.md) | 5분 안에 설명해야 할 때 |
| [VectorDB·GraphDB 연동 결정서](docs/05-VectorDB-GraphDB-연동-결정서.md) | 검색·그래프를 붙일 때 |
| [인증 합병 계약서](docs/06-인증-합병-계약서.md) | 백엔드 인증을 손볼 때 |
| [백엔드 통합 결과](docs/07-백엔드-통합-결과.md) | 지금 무엇이 붙어 있는지 볼 때 |

---

## 개발

```bash
# 백엔드
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_scripture     # 은하 13 · 구절 702
python manage.py runserver
pytest

# 프론트
cd frontend
npm install
npm run dev
npm run lint && npx tsc --noEmit && npm test && npm run build
```

### 시드 다시 만들기

구절 데이터의 원본은 `frontend/src/data/` 입니다. 고친 뒤:

```bash
cd frontend && npx vite-node ../server/scripts/export_seed.mjs
cd ../server && python manage.py seed_scripture
```

---

## 지켜야 하는 것

- **위기 신호 판정은 클라이언트에 남습니다.** 서버가 죽어도 안전 안내는 떠야 합니다.
- **연관 구절 662개에는 본문 인용이 없습니다.** 저작권을 확인할 수 없는 번역본을
  수백 건 인용하지 않기 위해서이며, 누락이 아니라 의도입니다.
- **장절은 손으로 고치지 않습니다.** `data/bible_structured.json` 과 대조해
  실재를 확인한 값입니다.

자세한 배경은 [통합 설계서 6장](docs/01-통합-설계서.md)에 있습니다.
