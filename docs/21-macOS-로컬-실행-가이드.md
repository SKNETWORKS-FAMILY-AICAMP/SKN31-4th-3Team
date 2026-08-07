# macOS 로컬 실행 가이드

git clone 부터 화면이 뜨기까지. **위에서 아래로 그대로 복사해 붙이면 됩니다.**

---

## 어디까지 할 것인지 먼저 고르세요

세 단계가 있습니다. **1단계만 해도 화면 전체를 볼 수 있습니다.**

| 단계 | 걸리는 시간 | 필요한 것 | 되는 것 |
|---|---|---|---|
| **1. 프론트만** | 5분 | Node.js | 화면 전부 · 은하수 · 대화 (가짜 데이터) |
| **2. + 백엔드** | 15분 | Python | 회원가입 · 로그인 · 실제 LLM 상담 |
| **3. + 벡터 검색** | 2시간 | Docker · GPU 또는 API | 성경 31,077절 벡터 검색 |

> **처음 받는 분은 1단계부터 하세요.** 백엔드 없이도 모든 화면이 돌아갑니다.
> `services/RepositoryProvider.tsx` 가 mock 구현으로 떨어지기 때문입니다.

---

## 0. 준비물 설치 (한 번만)

### Homebrew

이미 있으면 건너뜁니다. 있는지 확인:

```bash
brew --version
```

`command not found` 가 나오면 설치합니다.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

> **Apple Silicon(M1~M4)** 은 설치 끝에 "Next steps" 로 두 줄이 뜹니다.
> 그걸 그대로 실행해야 `brew` 명령을 찾습니다.
>
> ```bash
> echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
> eval "$(/opt/homebrew/bin/brew shellenv)"
> ```

### Node.js · Python · Git

```bash
brew install node@22 python@3.12 git
```

`node@22` 는 자동으로 PATH 에 안 잡힐 수 있습니다. 확인 후 필요하면 연결합니다.

```bash
node --version        # v22.x 가 나와야 합니다
```

안 나오면:

```bash
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node --version
```

확인:

```bash
node --version        # v22.x
python3 --version     # 3.12.x
git --version
```

---

## 1단계 · 프론트엔드만 (5분)

### 1-1. 받기

```bash
cd ~/Desktop
git clone https://github.com/SKNETWORKS-FAMILY-AICAMP/SKN31-4th-3Team.git
cd SKN31-4th-3Team
```

### 1-2. 설치하고 띄우기

```bash
cd frontend
npm install
npm run dev
```

터미널에 이런 줄이 뜹니다.

```
  ➜  Local:   http://localhost:5173/
```

**브라우저에서 http://localhost:5173 을 여세요.** 창세기 문장이 흐르고 별이
모이면 성공입니다.

### 1-3. 무엇이 되나

- 인트로 · 홈 · 질문 · 은하수 탐색 · 구절 상세 · 상담 대화 — **전부**
- 다만 답변이 **미리 써 둔 문장**입니다 (실제 LLM 아님)
- 회원가입·로그인은 브라우저 안에서만 흉내 냅니다

### 1-4. 끄기

터미널에서 `Ctrl + C`

---

## 2단계 · 백엔드 붙이기 (10분 더)

### 2-1. 가상환경 만들고 패키지 설치

**새 터미널 창**을 여세요 (1단계 프론트는 켜 둔 채로).

```bash
cd ~/Desktop/SKN31-4th-3Team
python3 -m venv .venv
source .venv/bin/activate
```

프롬프트 앞에 `(.venv)` 가 붙으면 됐습니다.

```bash
pip install --upgrade pip
pip install -r server/requirements.txt
```

> 몇 분 걸립니다. `psycopg` 설치에서 멈춘 것처럼 보여도 기다리세요.

### 2-2. 환경변수 파일 만들기

```bash
cd server
cat > .env <<'EOF'
SECRET_KEY=dev-only-local-key-change-in-production
DEBUG=True
OPENAI_API_KEY=
EOF
```

**LLM 상담까지 쓰려면** `OPENAI_API_KEY=` 뒤에 키를 넣으세요.
비워 두면 상담만 안 되고 나머지는 전부 동작합니다.

```bash
nano .env          # 키를 넣고 Ctrl+O → Enter → Ctrl+X
```

> `.env` 는 `.gitignore` 에 있어 커밋되지 않습니다. **키를 채팅이나
> 이슈에 붙이지 마세요.**

### 2-3. DB 만들고 기본 데이터 넣기

```bash
python manage.py migrate
python manage.py seed_scripture
```

> **DB 는 SQLite 로 자동 생성됩니다.** `DATABASE_URL` 이 없으면
> `server/db.sqlite3` 로 떨어지도록 해 두었습니다 — 첫 실행 장벽을
> 없애기 위해서입니다.

### 2-4. 서버 켜기

```bash
python manage.py runserver
```

`http://127.0.0.1:8000/api/v1/docs/` 를 열면 Swagger 문서가 보입니다.

### 2-5. 프론트를 백엔드에 연결

**또 다른 터미널**에서:

```bash
cd ~/Desktop/SKN31-4th-3Team/frontend
echo 'VITE_API_BASE_URL=http://localhost:8000' > .env.local
```

이미 `npm run dev` 가 돌고 있다면 **한 번 껐다 켜세요** (`Ctrl+C` 후 다시).
Vite 는 환경변수를 시작할 때만 읽습니다.

```bash
npm run dev
```

### 2-6. 확인

1. http://localhost:5173 접속
2. 우측 상단 **회원가입** → 이름 · 이메일 · 비밀번호 · MBTI 입력
3. 홈에서 질문을 던져 봅니다
4. 구절을 고르고 **상담 이어가기**

답변이 **글자 단위로 흘러나오면** SSE 스트리밍까지 붙은 것입니다.

> **이 줄이 이 단계의 스위치입니다.**
> `frontend/.env.local` 의 `VITE_API_BASE_URL` 한 줄이 mock ↔ 실제 API 를
> 가릅니다. 지우면 다시 1단계(가짜 데이터)로 돌아갑니다.

---

## 3단계 · 벡터 검색까지 (선택 · 오래 걸림)

성경 31,077절을 임베딩해 실제 벡터 검색을 쓰는 단계입니다.
**발표 시연에는 2단계로 충분합니다.**

### 3-1. Docker Desktop 설치

```bash
brew install --cask docker
open -a Docker
```

고래 아이콘이 상단 바에 뜨고 멈출 때까지 기다립니다.

```bash
docker --version
```

### 3-2. Postgres + pgvector 띄우기

```bash
cd ~/Desktop/SKN31-4th-3Team
docker compose up -d db
```

확인:

```bash
docker compose ps      # db 가 healthy 여야 합니다
```

### 3-3. `.env` 에 DB 주소 추가

```bash
cd server
echo 'DATABASE_URL=postgres://eden:eden-local-only@localhost:5432/eden' >> .env
```

### 3-4. 마이그레이션 다시

```bash
source ../.venv/bin/activate
python manage.py migrate
python manage.py seed_scripture
```

### 3-5. 임베딩 모델 준비 (둘 중 하나)

**(가) 로컬 GPU/CPU — Ollama** · 무료지만 느립니다

```bash
brew install ollama
ollama serve &                        # 백그라운드로 켜 둡니다
ollama pull qwen3-embedding:8b        # 9GB — 몇 분 걸립니다
```

**(나) OpenAI API** · 빠르지만 비용이 듭니다

`.env` 의 `OPENAI_API_KEY` 만 채워져 있으면 됩니다.

### 3-6. 성경 적재 + 임베딩

```bash
# ① 본문 적재 — 몇 분
python manage.py ingest_bible

# ② 임베딩 — 약 87분 (중단해도 --resume 으로 이어집니다)
python manage.py ingest_bible --embed --model oll8b --resume

# ③ 13은하 배정 — 몇 분
python manage.py assign_galaxies --by-embedding --canvas 150
```

> **먼저 조금만 해 보려면** `--limit 200` 을 붙이세요.
> ```bash
> python manage.py ingest_bible --embed --model oll8b --limit 200
> ```

### 3-7. 검색이 살아 있는지 확인

```bash
python manage.py shell -c "from scripture.search import ready, active_model; print(ready(), active_model())"
```

`True oll8b` 가 나오면 벡터 검색이 붙은 것입니다.

### 3-8. (선택) Neo4j 그래프 연결

팀에서 Aura 접속 정보를 받았다면:

```bash
pip install "neo4j>=5.23.0"
cd server
nano .env
```

세 줄을 추가합니다.

```
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=받은-비밀번호
```

확인:

```bash
python manage.py graph_probe --verse "요 3:16"
```

라벨·관계·감정 경로가 찍히면 붙은 것입니다.
**비워 두어도 검색과 상담은 그대로 돕니다.**

---

## 매일 켜는 순서 (설치가 끝난 뒤)

터미널 **두 개** 를 씁니다.

**터미널 A — 백엔드**

```bash
cd ~/Desktop/SKN31-4th-3Team
source .venv/bin/activate
cd server
python manage.py runserver
```

**터미널 B — 프론트엔드**

```bash
cd ~/Desktop/SKN31-4th-3Team/frontend
npm run dev
```

3단계까지 했다면 A 전에 하나 더:

```bash
cd ~/Desktop/SKN31-4th-3Team && docker compose up -d db
```

---

## 테스트 돌리기

```bash
# 프론트 — 761개
cd frontend && npm test

# 서버 — 334개
cd server && source ../.venv/bin/activate && pytest -q

# 타입·린트·빌드
cd frontend && npm run typecheck && npm run lint && npm run build
```

---

## 막혔을 때

### `command not found: brew`

Apple Silicon 에서 PATH 설정을 안 한 경우입니다.

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### `command not found: node`

```bash
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### `npm install` 이 권한 오류

`sudo` 를 쓰지 마세요. Homebrew 로 깐 node 는 sudo 가 필요 없습니다.
`node_modules` 를 지우고 다시 하세요.

```bash
rm -rf node_modules package-lock.json
npm install
```

### 화면은 뜨는데 별이 702개뿐

프론트가 **mock 데이터**로 돌고 있습니다. `frontend/.env.local` 을 만들고
개발 서버를 껐다 켜세요 (2-5 참조).

### 회원가입에서 "연결이 끊어졌습니다"

백엔드가 안 켜져 있습니다. 터미널 A 에서 `runserver` 를 확인하세요.

```bash
curl http://localhost:8000/healthz
# {"status": "ok"} 가 나와야 합니다
```

### 상담에서 "답변을 받지 못했습니다"

`server/.env` 의 `OPENAI_API_KEY` 가 비었거나 잔액이 없습니다.
구절 탐색은 키 없이도 동작합니다.

### `pip install` 이 psycopg 에서 실패

```bash
brew install postgresql@16
pip install -r server/requirements.txt
```

### 포트가 이미 쓰이고 있다

```bash
lsof -ti:5173 | xargs kill      # 프론트
lsof -ti:8000 | xargs kill      # 백엔드
```

### Docker 가 안 뜬다

Docker Desktop 앱이 실행 중인지 확인하세요. 상단 바 고래 아이콘이
움직이고 있으면 아직 켜지는 중입니다.

### 전부 지우고 다시 하고 싶다

```bash
cd ~/Desktop/SKN31-4th-3Team

# 프론트
rm -rf frontend/node_modules frontend/.env.local

# 백엔드 (DB 포함)
rm -rf .venv server/db.sqlite3 server/.env

# Docker DB 볼륨까지
docker compose down -v
```

그리고 1단계부터 다시 하면 됩니다.

---

## 빠른 참조

| | |
|---|---|
| 프론트 개발 서버 | http://localhost:5173 |
| 백엔드 API | http://localhost:8000 |
| API 문서 (Swagger) | http://localhost:8000/api/v1/docs/ |
| Django 관리자 | http://localhost:8000/admin/ |
| 헬스체크 | http://localhost:8000/healthz |
| Postgres (3단계) | `localhost:5432` · eden / eden-local-only |

| 파일 | 역할 |
|---|---|
| `frontend/.env.local` | **mock ↔ 실제 API 스위치** |
| `server/.env` | SECRET_KEY · OpenAI · DB · Neo4j |
| `docker-compose.yml` | 로컬 Postgres + pgvector |

---

## 참고 문서

| 문서 | 내용 |
|---|---|
| `docs/13-기능-명세와-디렉토리.md` | 기능 전체 + 디렉토리 구성 |
| `docs/18-시스템-구성도.md` | 아키텍처 · 데이터 흐름 |
| `docs/11-배포-체크리스트.md` | AWS 배포 절차 |
| `docs/12-발표-당일-실행순서.md` | 운영 중 재시작 절차 |
