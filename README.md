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
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=React&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=TypeScript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=Vite&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router_7-CA4245?style=for-the-badge&logo=ReactRouter&logoColor=white)
![Canvas 2D](https://img.shields.io/badge/Canvas_2D-E34F26?style=for-the-badge&logo=HTML5&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=Vitest&logoColor=white)
 
#### Backend
![Python](https://img.shields.io/badge/Python_3.12-3776AB?style=for-the-badge&logo=Python&logoColor=white)
![Django](https://img.shields.io/badge/Django_5.2-092E20?style=for-the-badge&logo=Django&logoColor=white)
![Django REST Framework](https://img.shields.io/badge/Django_REST_Framework-A30000?style=for-the-badge&logo=django&logoColor=white)
![JWT](https://img.shields.io/badge/Simple_JWT-000000?style=for-the-badge&logo=JSON%20web%20tokens&logoColor=white)
![Swagger](https://img.shields.io/badge/drf--spectacular-85EA2D?style=for-the-badge&logo=Swagger&logoColor=black)
![Gunicorn](https://img.shields.io/badge/Gunicorn-499848?style=for-the-badge&logo=Gunicorn&logoColor=white)
![Pytest](https://img.shields.io/badge/pytest-0A9EDC?style=for-the-badge&logo=pytest&logoColor=white)
 
#### AI & Frameworks
![OpenAI](https://img.shields.io/badge/OpenAI_GPT--4o--mini-412991?style=for-the-badge&logo=OpenAI&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=LangChain&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000000?style=for-the-badge&logo=Ollama&logoColor=white)
![Qwen3 Embedding](https://img.shields.io/badge/qwen3--embedding:8b-8E75B2?style=for-the-badge&logo=Alibabacloud&logoColor=white)
![SSE](https://img.shields.io/badge/SSE_Streaming-FF6F00?style=for-the-badge&logo=Server&logoColor=white)
 
#### Database
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_17-4169E1?style=for-the-badge&logo=PostgreSQL&logoColor=white)
![pgvector](https://img.shields.io/badge/pgvector_HNSW-4169E1?style=for-the-badge&logo=PostgreSQL&logoColor=white)
![Neo4j](https://img.shields.io/badge/Neo4j_Aura-4581C3?style=for-the-badge&logo=Neo4j&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=SQLite&logoColor=white)
 
#### Infrastructure & DevOps
![Amazon EC2](https://img.shields.io/badge/EC2_g4dn.xlarge-FF9900?style=for-the-badge&logo=AmazonEC2&logoColor=white)
![Amazon RDS](https://img.shields.io/badge/Amazon_RDS-527FFF?style=for-the-badge&logo=AmazonRDS&logoColor=white)
![NVIDIA](https://img.shields.io/badge/NVIDIA_T4-76B900?style=for-the-badge&logo=NVIDIA&logoColor=white)
![Docker](https://img.shields.io/badge/Docker_Compose-2496ED?style=for-the-badge&logo=Docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?style=for-the-badge&logo=Nginx&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=GitHub&logoColor=white)

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

### 4) 주요 API
1. Authentication & User (/api/v1/auth/)  

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | /api/v1/auth/register/ | 회원가입 | X |
| POST | /api/v1/auth/login/ | 로그인 (Access/Refresh Token 발급) | X |
| POST | /api/v1/auth/refresh/ | Access Token 재발급 | X |
| GET | /api/v1/auth/me/ | 본인 정보 조회 | O |
| PUT / PATCH | /api/v1/auth/me/ | 본인 정보 수정 (MBTI 변경) | O | 
* /api/v1/auth/me/의 정보 수정은 별도 업데이트용 스키마(UserUpdate)를 사용하여 MBTI 수정만 허용합니다.

2. Chat Session & Completion (/api/v1/chat/)

| Method | Endpoint | Description | Auth Required | 
|---|---|---|---|
| GET | /api/v1/chat/sessions/ | 대화방 목록 조회 | O | 
| POST | /api/v1/chat/sessions/ | 새 대화방 생성 | O |
| GET | /api/v1/chat/sessions/{id}/ | 특정 대화방 상세 조회 및 대화 내역 확인 | O |
| DELETE | /api/v1/chat/sessions/{id}/ | 특정 대화방 삭제 | O |
| GET | /api/v1/chat/sessions/{session_id}/messages/ | 특정 대화방의 메시지 목록 조회 | O | 
| POST | /api/v1/chat/sessions/{session_id}/completion/ | LLM 답변 생성 요청 (동기 방식) | O |
| POST | /api/v1/chat/sessions/{session_id}/stream/ | LLM 답변 생성 요청 (SSE 기반 실시간 스트리밍) | O |
* 스트리밍 응답(stream)은 text/event-stream 타입을 반환하며 실시간 대화 처리에 사용됩니다.

3) Scripture & Galaxy Data (/api/v1/scripture/)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| POST | /api/v1/scripture/ask/ | 고민 입력 및 추천 구절/공감/묵상 결과 수신 | Optional |
| GET | /api/v1/scripture/galaxies/ | 전체 은하 목록 조회 (13개) | Optional |
| GET | /api/v1/scripture/verses/ | 전체 성경 구절 목록 조회 (702개 데이터 한 번에 반환) | Optional |
| GET | /api/v1/scripture/verses/{id}/ | 특정 구절 상세 조회 | Optional |
* /scripture/ask/: 위기 상황 판정 시 프론트엔드가 자체 안전 안내를 우선 노출하는 로직을 권장합니다.
* /scripture/verses/: 별자리 및 은하 전체 렌더링 특성상 페이지네이션 없이 702개 전체 구절 데이터를 일괄 전달합니다. Coordinate(좌표) 데이터는 DB에 저장하지 않으며 프론트엔드에서 galaxy_id + order 조합으로 연산합니다.
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
---
### 웹 애플리케이션 시연 : 안혁진
### LLM 모델 비교
![대답 비교](docs/image/그림01.png)
---
## 프로젝트 회고
### 안혁진
```
3차 프로젝트를 이어 4차 프로젝트까지 중간에 팀원 한분이 사정이 있어 과정을 그만두긴 했지만 그래도 남은 3명이서 서로 머리를 맞대면서 열심히 디벨롭 시킨 결과 전보다 더 나은 결과물이 나왔다고 생각해서 만족스러웠다.
저번에 완성 못하였던 react를 활용한 프론트엔드 구현을 이번에 streamlit에서 react로 변환하며 한층 더 업그레이드 된 프론트엔드를 구현해볼수있어 나의 기술스택을 키우는데 많은 도움이 된 것 같고 저번 프로젝트에서 아이디어 + 구성을 리빌딩하면서 발생하는 오류들그리고 분담을 하고 모든 구성을 통합할때 생기는 오류들을 경험하며 앞으로의 프로젝트에 있어 확실한 기획 통일성있는 명세서 등 개발에 들어가기전 좀 더 팀원들과 상세한 논의가 필요하다는 점도 배우게 되었다. 
연속 PM을 맡게 되면서 어깨가 많이 무거웠지만 팀원들이 같이 나눠들고 부담감을 많이 줄여주어서 너무 고마웠다 너무너무 고생많이한 팀원들과 나에게 박수를 치며 이번 프로젝트 회고를 마친다.
```
### 김재원
```
처음에는 성경을 통해 말씀을 AI와 연결할 수 있을까 하는 걱정과 우려가 있었습니다.
하지만 시작하고 나서는 방대한 성경 데이터도 AI 안에서 충분히 진행할 수 있어 놀랍고 재미있는 경험이자 프로젝트였던 것 같습니다.
Vector RAG, Graph RAG를 Neo4j에 연결하는 작업은 성경의 다양한 감정과 중복된 단어들을 처리하면서 이렇게 방대한 것도 연결할 수 있음에 좋은 학습을하게 되어 영광이었습니다.
```
### 김가율
```
3차 프로젝트가 기본 챗봇시스템이었다면 이번 프로젝트에서는 그것을 확장하는 웹 애플리케이션을 구현하는 것이었다.
Django 파트 수업을 아주 열심히 들었고, 자신있게 Django백엔드를 맡겠다고 나섰다. 
프로젝트 준비를 하는 일주일이 한달같은 느낌이 들 정도로 치열하게 준비했다. 
사실 3차 프로젝트까지 진행하면서 많이 지쳐있었는데 4차 프로젝트 시작하면서부터 갑자기 열정이 솟아 올랐고, 같이 모든 열정을 불태워준 팀원들에게 정말 고마움을 느낀다.
덕분에 최종프로젝트인 것처럼 4차 프로젝트를 마무리 할 수 있었다. 
```