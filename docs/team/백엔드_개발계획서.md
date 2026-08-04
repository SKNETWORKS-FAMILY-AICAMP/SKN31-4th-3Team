# React + Django + LLM 챗봇 시스템 백엔드 README

**Django Backend Lead - Task Breakdown & Execution Plan**

- **역할:** Django 백엔드 개발 리드
- **기술 스택:** Python 3.13, Django 6.0.7, DRF, LangChain/OpenAI, PostgreSQL, Redis
- **연동 대상:** React (Frontend), LLM API / Vector DB
- **작성일자:** 2026-07-31 ~ 2026-
- **작성자:** 김가율

---

## 백엔드 개발 계획 요약
- **개요 및 프로젝트 범위 (Scope)**:
    - 역할, 기술 스택, 백엔드 주요 개발 목표
- **단계별 작업 프로세스 (1~6단계)**:  
    - 기반 구축 → 인증(JWT) → DB 모델링 → LLM 스트리밍(SSE) → 고도화 → 배포/문서화
- **상세 기술 스택 및 엔드포인트 명시**:  
    - `djangorestframework-simplejwt` 인증 구조
    - `ChatSession, ChatMessage ORM` 모델링
    - `StreamingHttpResponse`를 활용한 SSE 스트리밍 연동
    - `drf-spectacular` 기반 Swagger 문서화 및 PyTest/Docker 구성
---

## 백엔드 개발 주요 목표 (Backend Scope)
1. **안정적인 API 설계:** React 프론트엔드와 통신하기 위한 RESTful API 및 보안 인증(JWT) 구축
2. **LLM Pipeline 연동:** OpenAI / LangChain API 연동, 실시간 스트리밍 답변(SSE 또는 WebSocket) 구현
3. **데이터 정합성 & 성능:** 대화 세션/메시지 데이터 모델링, Redis 기반 캐싱 및 비동기 작업(Celery) 처리

---

## 1. 전체 작업 흐름 (Process Lifecycle)

| 단계 (Phase) | 단계명 | 핵심 과제 | 예상 비중 |
| :--- | :--- | :--- | :---: |
| **STEP 1** | **기반 구축 및 아키텍처 설정** | 환경 설정, DB 연동, Git Workflow, CORS 및 기본 보안 설정 | 15% |
| **STEP 2** | **인증 및 회원 관리 (Auth)** | JWT 로그인/회원가입, Refresh Token 관리, Permission 구현 | 15% |
| **STEP 3** | **대화 데이터 모델링 & CRUD** | ChatSession, ChatMessage 테이블 설계 및 DRF Serializer 구현 | 20% |
| **STEP 4** | **LLM 파이프라인 & 스트리밍** | OpenAI/LangChain 연동, Prompt 관리, SSE(Streaming) API 구축 | 25% |
| **STEP 5** | **고도화 & 비동기 처리** | RAG(Vector DB) 확장 지원, Redis 캐싱, Celery 비동기 작업 | 15% |
| **STEP 6** | **테스트 & 배포 (CI/CD)** | PyTest 단위 테스트, Swagger API 문서화, Dockerization & 배포 지원 | 10% |

---

## 2. 단계별 상세 작업 내역 (Detailed Tasks)
### STEP 1: 초기 프로젝트 세팅 & 아키텍처 설정
* [**자료 : STEP1 상세 작업 내역서**](./docs/상세작업내역/상세작업내역_STEP1.md)
* **개발 환경 세팅**
  * Python 가상환경(`venv`) 구성 및 필수 라이브러리 설치
  * `django-admin startproject` 실행 및 App 단위 분리 (`users`, `chat`, `llm_core`)
  * 산출물: [requirements.txt](/requirements.txt), [패키지별 역할 설명서](./패키지별%20역할%20설명서.md), [프로젝트 디렉토리 구조 설명서](./디렉토리구조설명.md)
* **DB & 환경변수 설정**
  * PostgreSQL DB 연동 설정 (`django-environ` 적용)
  * OpenAI API Key, DB 접속 정보 등 민감한 환경변수 `.env` 격리
  * 산출물: `settings.py`, `.env.example`
* **CORS & Security 설정**
  * `django-cors-headers` 설정으로 React 개발/운영 도메인 허용
  * CSRF 및 Security Middleware 점검

### STEP 2: 사용자 인증 및 회원 관리 (Auth Module)
* [**자료 : STEP2 상세 작업 내역서**](./docs/상세작업내역/상세작업내역_STEP2.md)  
  [**자료 : API 명세서**](./docs/api_endpoints.md)
* **Custom User 모델**
  * `AbstractUser` 상속받아 커스텀 유저 모델 정의 (이메일 기반 로그인 지원)
  * 산출물: `users/models.py`
* **JWT 인증 구현**
  * `djangorestframework-simplejwt` 활용
  * Access Token (단기) & Refresh Token (장기) 발급 및 재발급 엔드포인트 구현
  * 주요 엔드포인트: `/api/v1/auth/login/`, `/api/v1/auth/refresh/`
  * 산출물: `users/serializers.py`
* **인가(Permission) 설정**
  * `IsAuthenticated` 권한 클래스 적용하여 로그인된 유저만 챗봇 기능에 접근하도록 제한

### 🔑 Authentication API Endpoints Overview

`users` 앱에 구현된 회원가입, 로그인(JWT 토큰 발급), 토큰 재발급 및 내 정보 조회 API 엔드포인트 명세입니다.

---

### 📌 API 엔드포인트 목록

| 기능 | HTTP Method | URL | 권한 (Permission) | 설명 |
| :--- | :---: | :--- | :--- | :--- |
| **회원가입** | `POST` | `/api/v1/auth/register/` | `AllowAny` | 이메일, 유저네임, 비밀번호 기반 유저 등록 |
| **로그인** | `POST` | `/api/v1/auth/login/` | `AllowAny` | 계정 인증 후 Access Token & Refresh Token 발급 |
| **토큰 재발급** | `POST` | `/api/v1/auth/refresh/` | `AllowAny` | Refresh Token 전달 시 새로운 Access Token 발급 |
| **내 정보 조회** | `GET` | `/api/v1/auth/me/` | `IsAuthenticated` | 로그인된 유저의 프로필 정보 조회 (`Bearer Token` 필요) |

---


### STEP 3: 대화 데이터 모델링 & REST API (Chat Data Module)
* [**자료 : STEP3 상세 작업 내역서**](./docs/상세작업내역/상세작업내역_STEP3.md)
* **데이터 모델 설계 (ORM)**
  * `ChatSession`: 유저 Foreign Key, 세션 제목, 생성/수정일자
  * `ChatMessage`: 세션 Foreign Key, 역할(`user` / `assistant` / `system`), 메시지 본문, 생성일자
  * 산출물: `chat/models.py`
* **대화 CRUD API 개발**
  * 새 대화방 생성, 목록 조회, 방 제목 변경 및 삭제 API
  * 특정 대화방의 과거 메시지 페이징 조회 API 구현
  * 주요 엔드포인트: `/api/v1/chat/rooms/`, `/api/v1/chat/rooms/{id}/messages/`

### STEP 4: LLM 파이프라인 구축 & 스트리밍 연동 (Core LLM Integration)
* [**자료 : STEP4 상세 작업 내역서**](./docs/상세작업내역/상세작업내역_STEP4.md)
* **LLM Client 모듈화**
  * LangChain 또는 OpenAI SDK 기반의 LLM 서비스 클래스 캡슐화
  * 이전 대화 맥락(Context)을 템플릿 프롬프트에 결합하는 로직 구현
  * 산출물: `llm_core/services.py`
* **실시간 스트리밍 API (SSE)**
  * `StreamingHttpResponse`를 활용한 Server-Sent Events (SSE) 구현
  * LLM 답변의 토큰 단위 스트리밍 응답을 React로 전달하고, 답변 완료 시 DB에 수신 메시지 저장
  * 주요 엔드포인트: `/api/v1/chat/stream/` (`text/event-stream`)

### STEP 5 & 6: 고도화, 테스트 및 API 문서화
* [**자료 : STEP5 상세 작업 내역서**](./docs/상세작업내역/상세작업내역_STEP5_6.md)
* **비동기 처리 & 캐싱**
  * Redis를 통한 세션 상태 저장 및 Celery를 이용한 대화 요약/통계 비동기 처리
  * 산출물: Redis, Celery 연동
* **API 문서화**
  * `drf-spectacular` 활용, Swagger UI 자동 생성하여 프론트엔드 팀에 제공
  * 주요 엔드포인트: `/api/schema/swagger-ui/`
* **테스트 & 배포 준비**
  * PyTest 기반 주요 API 및 LLM 파이프라인 단위 테스트 작성
  * Dockerfile 및 `docker-compose.yml` 작성
