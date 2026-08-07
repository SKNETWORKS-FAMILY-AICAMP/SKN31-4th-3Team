# 단계별 상세 작업 내역 (Detailed Tasks)

### STEP 5 & 6: 고도화, 테스트 및 API 문서화
* **작업일 : 2026-08-05**
* STEP 5 & 6 백엔드 구현 4단계
```
[1단계: Redis 세팅] Docker / Redis 구동
[2단계: STEP 5 비동기] Celery 연동 & 작업 처리
[3단계: STEP 6 캐싱] django-redis 설정
[4단계: 통합 검증] 동작 & 성능 검증
```
* 1단계: 공통 기반 인프라 (Redis) 세팅
  * Celery의 작업 큐(Broker)이자 캐시 DB로 사용할 Redis를 로컬에 구동하고 관련 패키지를 설치
  1) Docker 실행 후 Redis 서버 생성
  ```
  docker run -d --name redis-server -p 6379:6379 redis:alpine
  ```
  * 산출물: Redis, Celery 연동
* 2단계: STEP 5 - Celery 기반 비동기 작업 처리
  * LLM 대화 응답 시간 지연에 영향을 주지 않는 무거운 부가 작업(예: 대화 내용 요약, 이메일 발송, 사용량 통계 집계 등)을 백그라운드로 넘깁니다.
  1) Celery 설정을 프로젝트에 추가 (config/celery.py 및 config/__init__.py)
      * Django와 Celery 앱 인스턴스 연동
  2) 비동기 Task 정의 (chat/tasks.py)
      * @shared_task 데코레이터를 사용하여 무거운 작업 작성
  3) View에서 Task 호출 (views.py)
      * .delay() 함수를 사용하여 응답 대기 없이 비동기로 작업 실행
  4) Celery Worker 실행:
  ```
  (window) celery -A config worker -l info -P solo
  (mac) celery -A config worker -l info
  ```

* **API 문서화**
  * `drf-spectacular` 활용, Swagger UI 자동 생성하여 프론트엔드 팀에 제공
  * 주요 엔드포인트: `/api/schema/swagger-ui/`

---
* **테스트 & 배포 준비**
  * PyTest 기반 주요 API 및 LLM 파이프라인 단위 테스트 작성
  * Dockerfile 및 `docker-compose.yml` 작성