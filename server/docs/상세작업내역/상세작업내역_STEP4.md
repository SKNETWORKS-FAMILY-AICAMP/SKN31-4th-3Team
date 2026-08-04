# 단계별 상세 작업 내역 (Detailed Tasks)

### STEP 4: LLM 파이프라인 구축 & 스트리밍 연동 (Core LLM Integration)
* **작업일 : 2026-08-03**
* 이 단계에서는 사용자가 메시지를 보냈을 때 OpenAI API(또나 LangChain 등)를 통해 답변을 생성하고, 이를 ChatMessage DB 모델에 저장 및 반환하는 핵심 비즈니스 로직을 구축합니다.

* **LLM Client 모듈화**
  * LangChain 또는 OpenAI SDK 기반의 LLM 서비스 클래스 캡슐화
  * 이전 대화 맥락(Context)을 템플릿 프롬프트에 결합하는 로직 구현

  1) LLM 호출 서비스 파일 생성 및 작성 (llm_core/services.py)
      * 산출물: `llm_core/services.py`
  2) chat/serializers.py에 메시지 요청용 Serializer 추가
  3) chat/views.py에 LLM 메시지 전송 API 구현
  4) chat/urls.py에 엔드포인트 연결

  * 웹 연결 확인해보기
  1) 파일을 모두 저장한 뒤 서버를 재시작합니다 (python manage.py runserver)
  2) Swagger UI ([http://127.0.0.1:8000/api/v1/docs/](http://127.0.0.1:8000/api/v1/docs/))에 접속
  3) /api/v1/auth/login/에서 로그인하여 발급받은 Access Token을 우측 상단 Authorize 버튼을 눌러 등록 (<토큰>).
  4) POST /api/v1/chat/sessions/로 새 대화방을 생성 (id 확인)
  5) POST /api/v1/chat/sessions/{session_id}/completion/ 엔드포인트에서 message 항목에 질문을 넣고 실행하여 GPT의 답변이 정상적으로 돌아오는지 확인
  6) GET /api/v1/chat/sessions/ 엔드포인트에서 대화방 내역 확인
  7) DELETE /api/v1/chat/sessions/{session_id}/ 엔드포인트에서 대화방 삭제

---

* **실시간 스트리밍 API (SSE)**
  * `StreamingHttpResponse`를 활용한 Server-Sent Events (SSE) 구현
  * LLM 답변의 토큰 단위 스트리밍 응답을 React로 전달하고, 답변 완료 시 DB에 수신 메시지 저장
  * 주요 엔드포인트: `/api/v1/chat/stream/` (`text/event-stream`)