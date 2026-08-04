# 🔑 Authentication API Endpoints Overview

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

### 🔒 인증 헤더 사용법 (Authorization Header)

`IsAuthenticated` 권한이 필요한 API(`/api/v1/auth/me/` 등)를 호출할 때는 HTTP Request Header에 다음과 같이 Access Token을 포함하여 전달해야 합니다.

```http
Authorization: Bearer <your_access_token>