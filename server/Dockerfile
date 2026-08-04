# server/Dockerfile
# ─────────────────────────────────────────────────────────────────────
# Django API 이미지.
#
# ★ slim 을 쓰고 psycopg2-binary 를 쓴다.
#   빌드 도구 없이 설치되므로 이미지가 작고 빌드가 빠르다. 소스 빌드가
#   필요해지면 그때 builder 스테이지를 나눈다.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 의존성 레이어를 먼저 굳힌다 — 코드만 바뀌면 이 레이어는 캐시된다.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 정적 파일은 이미지 안에 굽는다. 컨테이너가 여러 대여도 같은 결과가 나온다.
RUN SECRET_KEY=build-time-only python manage.py collectstatic --noinput

EXPOSE 8000

# gunicorn 워커 수는 (2 × vCPU) + 1 이 기본 권장이다.
# t3.small(2 vCPU) 기준 3. 환경변수로 조절한다.
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py seed_scripture && gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --timeout 60 --access-logfile -"]
