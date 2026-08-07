# 📖 Eden — 더 유니버스
# SKN31기 4차 프로젝트 3팀
# 팀명 `https://1.0.0.r.mine:address`

* React SPA 프론트엔드와 Django REST Framework 백엔드, 그리고 외부 LLM API(OpenAI)를 연동하여 Server-Sent Events (SSE) 기반의 실시간 스트리밍 대화를 제공하는 웹 애플리케이션입니다.

* 사용자는 자연어 질문을 통해 실시간으로 답변을 수신하며, 대화 세션 관리 및 이전 대화 이력 조회, 마이페이지 프로필 관리 등의 기능을 이용할 수 있습니다.

## 목차

* [팀원 소개](#팀원-소개)
* [WBS](#WBS)
* [기술스택](#기술스택)
* [디렉토리 구조](#디렉토리-구조)
* [프로젝트 소개](#프로젝트-소개)
* [산출물](#산출물)
* [로컬환경 실행 방법](#로컬환경-실행-방법)
* [설계회고](#설계-회고)


---
## 팀원 소개
<div align="center">
<table align="center">
  <tr>
    <td align="center" width="190px"><img src="docs/image/Image_3.png" width="100" style="object-fit: contain; aspect-ratio: 1/1;"></td>
    <td align="center" width="190px"><img src="docs/image/Image_2.png" width="100" style="object-fit: contain; aspect-ratio: 1/1;"></td>
    <td align="center" width="190px"><img src="docs/image/Image_1.png" width="100" style="object-fit: contain; aspect-ratio: 1/1;"></td>
  </tr>
  <tr>
    <td align="center"><b>안혁진(PM)</b></td>
    <td align="center"><b>김가율</b></td>
    <td align="center"><b>김재원</b></td>
  </tr>
    <tr>
    <td align="center">React 기반 프론트엔드 구현<br>(UI / UX)</td>
    <td align="center">Django 백엔드<br>API 엔드포인트 구현</td>
    <td align="center">AI/LLM연동<br>GraphDB 구축</td>
  </tr>

  <tr>
    <td align="center"><a href="https://github.com/Jinxxxok"><img src="https://img.shields.io/badge/Jinxxxok-181717?style=for-the-badge&logo=github&logoColor=white"></a></td>
    <td align="center"><a href="https://github.com/Kim-gayul"><img src="https://img.shields.io/badge/Kimgayul-181717?style=for-the-badge&logo=github&logoColor=white"></a></td>
    <td align="center"><a href="https://github.com/kimjae9360"><img src="https://img.shields.io/badge/kimjae9360-181717?style=for-the-badge&logo=github&logoColor=white"></a></td>
  </tr>
  
</table>

</div>

---
## [WBS](docs/WBS.md)
![WBS](docs/image/WBS.png)

## 기술스택
#### Frontend
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=React&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=Vite&logoColor=white)
![Axios](https://img.shields.io/badge/Axios-5A29E4?style=for-the-badge&logo=Axios&logoColor=white)

#### Backend
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=Python&logoColor=white)
![Django](https://img.shields.io/badge/Django-009688?style=for-the-badge&logo=Django&logoColor=white)
![Django REST Framework](https://img.shields.io/badge/Django_REST_Framework-A30000?style=for-the-badge&logo=django&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens)

#### AI & Frameworks
![OpenAI](https://img.shields.io/badge/OpenAI-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)
![Streamlit](https://img.shields.io/badge/Streamlit-FF4B4B?style=for-the-badge&logo=Streamlit&logoColor=white)

#### Database
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=PostgreSQL&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=SQLite&logoColor=white)

#### Infrastructure & DevOps
![Amazon EC2](https://img.shields.io/badge/Amazon_EC2-FF9900?style=for-the-badge&logo=AmazonEC2&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=Docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=for-the-badge&logo=Nginx&logoColor=white)

## 디렉토리 구조
```
4TH_PROJECT/
│
├── frontend/                           프론트엔드 작업 폴더
│   ├── src/
│   │   ├── components/                 화면 조각 (71개 파일)
│   │   │   ├── answer/                 답변 패널 · 구절 카드
│   │   │   ├── common/                 버튼 · 오류 · 사이드바 · 복사 · 안전 안내
│   │   │   ├── counsel/                대화 스레드
│   │   │   ├── galaxy/                 캔버스 · MBTI 레일 · 상징 배지 · 구절 목록 창
│   │   │   ├── guide/                  이용 안내 투어
│   │   │   ├── home/                   질문 입력
│   │   │   ├── intro/                  창세기 시퀀스
│   │   │   └── verse/                  구절 상세 오버레이
│   │   │
│   │   ├── galaxy/                     렌더 엔진 (30개 파일) — React 와 분리
│   │   │   ├── GalaxyEngine.ts         단일 rAF 루프, 프레임당 할당 0
│   │   │   ├── Camera.ts               궤도 카메라 (yaw·pitch·distance)
│   │   │   ├── staticField.ts          3D 투영 · 별 그리기
│   │   │   ├── emblemField.ts          별 → 상징 배정
│   │   │   ├── twinkle.ts              별마다 다른 밝기 호흡
│   │   │   ├── DustLayer.ts            성운 먼지
│   │   │   ├── WordmarkLayer.ts        Eden 워드마크
│   │   │   └── constellation.ts        별자리 연결선
│   │   │
│   │   ├── data/                       타입 · 큐레이션 구절 · 13제자 · 상징 도형
│   │   ├── routes/                     7개 라우트 + 경로 정의
│   │   ├── services/                   API 클라이언트 · SSE · 저장소 인터페이스
│   │   │   ├── apiClient.ts            fetch · 토큰 갱신 · 타임아웃 · 취소
│   │   │   ├── sse.ts                  EventStream 파서
│   │   │   ├── httpRepositories.ts     Django 구현
│   │   │   ├── mockRepositories.ts     백엔드 없이 도는 구현
│   │   │   └── RepositoryProvider.tsx  mock ↔ API 교체 지점
│   │   │
│   │   ├── state/                      Context + reducer
│   │   └── styles/                     토큰 · 타이포그래피 · reset
│   │
│   ├── docker/                         nginx 설정 (SPA 폴백 + /api 프록시)
│   └── Dockerfile                      빌드 → nginx
│
├── server/                             백엔드 작업 폴더
│   ├── config/                         설정 · 라우팅 · WSGI
│   ├── users/                          인증 · 회원
│   ├── chat/                           대화방 · 메시지 · 스트리밍
│   │   └── context.py                  프롬프트 바탕 조립 (구절 + 그래프)
│   ├── scripture/                      구절 · 검색 · 그래프
│   │   ├── search.py                   네 층 검색
│   │   ├── graph.py                    Neo4j — 실패에 열린 통로
│   │   ├── vectors.py                  MRL 절단 + 재정규화
│   │   ├── tone.py                     구절 성격 (위로 vs 경고)
│   │   ├── usage.py                    상담 무관 구절 제외
│   │   └── management/commands/        ingest_bible · assign_galaxies · graph_probe
│   │
│   ├── llm_core/                       프롬프트 · 체인 · 인물 배정
│   │   ├── prompts/                    3층 (공통 · 관계 · 페르소나)
│   │   ├── chains.py                   LangChain 조립
│   │   └── matching.py                 질문 → 인물 배정
│   │
│   ├── tests/                     
│   └── requirements.txt
│
├── data/                               원천 데이터(json)
├── docs/                               작업별 부가 산출물
├── 산출물/                             필수 산출물
├── scripts/                            ec2-setup.sh · deploy.sh
├── docker-compose.yml                  로컬 (pgvector 컨테이너)
└── docker-compose.prod.yml             배포 (RDS + 호스트 Ollama)
```

## 프로젝트 소개

### React + Django 조합을 선택한 이유
* LLM 기반 챗봇 서비스는 UI의 실시간성과 유연함이 서비스 품질을 크게 좌우합니다. 완성도를 높이기 위해 두 조합을 선택했습니다.
* Django를 백엔드 API 서버로 사용하고, React를 전역 프론트엔드 Single Page Application(SPA)으로 구성하면 서버와 클라이언트의 역할이 명확하게 분리되어 보수성 및 확장성이 매우 좋아집니다.
* **자연스러운 실시간 스트리밍 UI 제공**
  * React의 State 관리와 Virtual DOM 덕분에 LLM에서 답변이 출력되는 동안 화면 전체를 리로드하지않고, 챗봇 답변 창만 글자 단위로 자연스럽게 업데이트 할 수 있습니다.
* **웹/앱 확장성 확보**
  * Django 백엔드는 순수한 API 서버 역할만 수행하므로 추후 동일한 Django API를 이용해 모바일 앱을 만들 때 백엔드를 수정할 필요가 없습니다.

### 1. 주제
누구나 어렵지 않게 성경 말씀으로 마음을 위로받을 수 있는 상담 채팅 시스템

### 2. 주제를 선택한 이유

종교의 선택은 개인의 자유이지만, 성경의 말씀은 특정 종교를 믿지 않는 사람에게도 위로가 될 수 있다고 생각했습니다.\
최근 해외에서 "예수님과 대화할 수 있는 챗봇" 앱이 큰 인기를 얻고 있다는 점에서 착안해,\
한국에서도 종교에 대한 거부감 없이 자연스럽게 성경 말씀에 다가가고 함께할 수 있는 상담 챗봇을 만들어보고자 이 주제를 선택했습니다.

#### * 데이터 수집
* **데이터명**: 성경 전서 (구약 성경 39권 및 신약 성경 27권, 총 66권)
* **데이터 규모**: 총 1,189장, 약 31,000개 이상의 구절(Verse) 데이터
* **데이터 구조**: 각 구절별로 서지 정보(책 이름, 장, 절)와 본문 내용이 매핑된 구조화된 형태의 텍스트 데이터(JSON형식 )
* **데이터 출처**: https://raw.githubusercontent.com/stranger828/bibleAPI/refs/heads/main/bible_structured.json

### 3. 주요 기능

### 1) 사용자 기능 (User Features)

* **사용자 인증 및 계정 관리 (Authentication)**
  * **회원가입 및 로그인**: JWT(JSON Web Token) 기반의 보안 로그인 및 회원가입 기능 제공
  * **토큰 자동 갱신**: Access Token 만료 시 Axios Interceptor를 통해 Refresh Token으로 사용자 개입 없는 자동 갱신 처리
  * **Protected Route**: 미인증 유저의 대화창 및 마이페이지 접근 차단 및 리다이렉트

* **LLM 실시간 대화 engine (LLM Chat Stream)**
  * **SSE 기반 실시간 스트리밍**: Server-Sent Events(SSE) 파이프라인을 구축하여 챗봇 답변을 글자 단위(Chunk)로 실시간 타이핑 렌더링
  * **대화 문맥(Context) 유지**: 이전 대화 히스토리(최근 N개 메시지)를 프롬프트 Context로 조합하여 일관성 있는 연속 대화 지원
  * **자동 스크롤 및 입력 제어**: 답변 생성 중 Auto-scroll 기능 및 전송 버튼 비활성화(`Disabled`) 처리로 UX 최적화

* **대화 세션 및 이력 관리 (Session History)**
  * **세션 자동 생성**: 질문 입력 시 새 대화방이 생성되며, 첫 질문 텍스트를 기반으로 대화방 제목 자동 추출 및 부여
  * **사이드바 히스토리 조회**: 반응형 Drawer/사이드바를 통해 과거 대화 세션 목록을 조회하고 클릭 시 과거 메시지 타임라인 복원
  * **대화 세션 삭제**: 불필요한 대화 세션 개별 삭제 기능

* **UI/UX 편의 기능 & 마이페이지 (UX & My Page)**
  * **마크다운 & 코드 블록 서빙**: 챗봇 답변 내 마크다운 렌더링, 코드 블록 Syntax Highlighting 및 클립보드 원클릭 복사 버튼 제공
  * **반응형 웹(Responsive Web) Layout**: Desktop, Tablet, Mobile(햄버거 메뉴 및 터치 키보드 대응) 화면비 최적화 지원
  * **마이페이지**: 개인 프로필 관리 및 총 대화 세션/질문 수행 건수 등 이용 통계 카드 제공


### 2) 관리자 기능 (Admin Features)
* **Django Admin 기본 관리자 기능**: Django Built-in Admin(`admin/`)을 통한 기본 사용자/대화 데이터 관리
* **권한 및 승인 필드 기반 제어**: 사용자 계정 상태(활성/정지/승인) 및 권한(is_staff) 필드 설계  
*(※ 전용 관리자 대시보드 UI 및 관리 API는 추후 확장 예정 항목입니다.)*

### 3) 화면 구성
> 구현 완료된 기능 중에서 필수화면만 수록했습니다.

<사용자 기능>
* 회원가입  
<img src="docs/image/register.jpeg" width=70%>
* 채팅창  
<img src="docs/image/comunication.jpeg" width=70%>
* 사이드바  
<img src="docs/image/sidebar.jpeg" width=70%>
* 마이페이지  
<img src="docs/image/mypage.jpeg" width=70%>

<관리자 기능>
* Django Admin  
<img src="docs/image/Django_admin.jpeg" width=70%>

* swagger API  
<img src="docs/image/API.png" width=70%>

### 4. AWS EC2 URL
**Eden** http://3.37.228.101/

---
## 산출물
### <목록>
### 1. [요구사항 정의서](산출물/요구사항정의서.md)

### 2. [유즈케이스 명세서](산출물/유즈케이스명세서.md)

### 3. [화면 설계서](산출물/화면설계서.md)

### 4. [시스템 구성도](산출물/시스템구성도.md)

### 5. [테이블 정의서](산출물/테이블정의서.md)

### 6. [테스트 계획서](산출물/테스트계획서.md)

### 7. [테스트 결과 보고서](산출물/테스트결과보고서.md)

---
### <요약>
### 1) 시스템 아키텍처 및 배포 구조 (시스템구성도.md)

* AWS VPC 환경 내 3-Tier 기반으로 구축되었으며, Docker Compose를 통한 멀티 컨테이너 환경으로 배포됩니다.

    * Client Tier: React 18 SPA (Vite) - JWT 인증 관리 및 fetch-event-source를 통한 Chunk 단위 실시간 텍스트 타이핑 렌더링.  
    * Web / Proxy Tier (Public Subnet): Nginx Web Server - SSL/TLS 암호화 종단, 정적 자원 서빙 및 /api/, /chat/stream/ 역방향 프록시 (SSE 버퍼링 해제 적용: proxy_buffering off;).  
    * Application Tier (Private Subnet): Django WAS (Gunicorn) - RESTful API, JWT 인증, 대화 세션/이력 관리 및 외부 LLM 연동 비동기 SSE 파이프라인 (StreamingHttpResponse) 중계.  
    * Data Tier (Private Subnet): PostgreSQL DB - 사용자 계정, 대화 세션, 메시지 내역 영속 저장.  
    * External Tier: OpenAI API - 프롬프트 및 Context 수신 후 Chunk 단위 Stream 응답 반환.


```mermaid
flowchart TB
    subgraph ClientZone ["Client Tier"]
        Browser["User Web Browser\n(React SPA / Desktop & Mobile)"]
    end

    subgraph AWS_VPC ["AWS VPC (10.0.0.0/16)"]
        subgraph PublicSubnet ["Public Subnet (10.0.0.0/24)"]
            Nginx["Nginx Web Server\n(Reverse Proxy & Static Files)\n:80 / :443"]
        end

        subgraph PrivateSubnet ["Private Subnet (10.0.10.0/24)"]
            Django["Django WAS (Gunicorn)\nREST API & SSE Engine\n:8000"]
            DB[(PostgreSQL DB\n:5432)]
        end
    end

    subgraph ExternalZone ["External Tier"]
        LLM_API["OpenAI API"]
    end

    Browser -->|HTTP Request / Static Assets| Nginx
    Nginx -->|Proxy Pass /api/| Django
    Nginx -->|SSE Stream /chat/stream/| Django
    Django -->|ORM Query| DB
    Django -->|Async Stream Request| LLM_API
```
### 2) 데이터베이스 ERD (테이블정의서.md)
* 사용자 계정, 대화 세션, 메시지 내역 간 1:N 관계를 가지며, CASCADE 옵션을 통해 회원 탈퇴나 세션 삭제 시 관련 데이터가 안전하게 일괄 삭제됩니다.
```mermaid
erDiagram
    USERS ||--o{ CHAT_SESSIONS : "1명의 사용자는 N개의 대화 세션을 소유"
    CHAT_SESSIONS ||--o{ CHAT_MESSAGES : "1개의 대화 세션은 N개의 메시지를 포함"

    USERS {
        BIGINT user_id PK "Auto Increment"
        VARCHAR username "Unique ID"
        VARCHAR email "Email Address"
        VARCHAR password "Hashed Password"
        BOOLEAN is_active "Active Status"
        DATETIME date_joined "Created At"
    }

    CHAT_SESSIONS {
        UUID session_id PK "UUIDv4"
        BIGINT user_id FK "References USERS(user_id)"
        VARCHAR title "Session Title"
        DATETIME created_at "Created At"
        DATETIME updated_at "Updated At"
    }

    CHAT_MESSAGES {
        BIGINT message_id PK "Auto Increment"
        UUID session_id FK "References CHAT_SESSIONS(session_id)"
        VARCHAR sender_type "user / assistant"
        TEXT content "Message Content"
        DATETIME created_at "Created At"
    }
```
### 3) 주요 화면 구조 (화면설계서.md)
![alt text](docs/image/image.png)
---
## [로컬환경 실행 방법](docs/window_로컬_실행_가이드.md)
### 백엔드 — Windows

1) 터미널에서 다음 명령어 순차적으로 실행
```powershell
cd server
uv venv .venv --python=3.13
.venv\Scripts\activate
uv pip install -r requirements.txt
copy .env.example .env
```
2) env 파일 생성후 아래 내용 복사
```
# 필수
SECRET_KEY=change-me-to-a-long-random-string
DEBUG=True

# 배포 시 채웁니다 (콤마 구분)
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
]

# DATABASE_URL=postgres://eden:PASSWORD@eden-db.xxxx.ap-northeast-2.rds.amazonaws.com:5432/eden
DATABASE_URL=sqlite:///db.sqlite3

# LLM
OPENAI_API_KEY=<<본인 API key 입력>>
```
3) DB 저장 `python manage.py migrate`
4) Docker desktop 실행 후 redis 서버 세팅
```
docker run -d --name redis-server -p 6379:6379 redis:alpine
```
5) celery worker 실행
```
celery -A config worker -l info -P solo
```
6) 새 터미널에서 서버 접속
```
python manage.py runserver 8080
```

### 프론트엔드 — Windows
1) .env.local 파일 생성하고 url 추가
```
VITE_API_BASE_URL=http://127.0.0.1:8080
```
2) 새 터미널 추가한 후 다음 명령어 실행
```powershell
cd frontend
npm install
npm run dev
http://localhost:5173/ 접속
```
---
### [* macOS 실행방법 바로가기](docs/macOS-로컬-실행-가이드.md)
---

### [설계 회고](docs/설계회고.md)
* 잘된 점
  * 백엔드 대기 없이 프론트엔드 작업 진행
  * 세개의 DB를 각 역할에 맞게 분류
    > 질문이 들어오면,
    * pg벡터 : 말이 비슷한 것을 찾는다.
    * Neo4j Aura : 이어져 있는 것을 찾는다.
    * PostgreSQL : 사용자의 대한 것을 찾는다.
  * 외부 의존이 전부 죽어도 화면이 뜨는 구조 — 단일 실패점이 RDS 하나뿐

* 어려웠던 점
  * 결함 12건 중 6건이 "코드는 맞는데 결과가 조용히 비어 있는" 종류였다. 오류도 안 나고 화면도 멀쩡해서 테스트로 잡히지 않았다.
  * 그래서 함수가 맞는지 검증보다 결과값이 도착하는지 검토했다.
  * 테스트를 하면서 관계 그래프가 연동이 안된 것 같은 대답이 나왔다.
  * 그래서 관계에 대한 가중치 설정을 여러번 수정했다.
  * 질문을 하면 딱딱하고 관련성이 낮은 답변이 나와서 채팅의 질이 자연스럽지 않았다.
  * 그래서 맥락읽기는 모델이 하도록 판단이 필요한 자리에는 요청사항을 넣지 않았다.

### 웹 애플리케이션 시연 : 안혁진
### LLM 모델 비교
![대답 비교](docs/image/그림01.png)