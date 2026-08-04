# frontend/Dockerfile
# ─────────────────────────────────────────────────────────────────────
# 정적 빌드 + Nginx.
#
# ★ AWS 에서는 이 이미지를 쓰지 않는다.
#   배포는 dist/ 를 S3 에 올리고 CloudFront 가 서빙한다. 이 이미지는
#   로컬에서 "배포와 같은 경로 규칙"을 재현하기 위한 것이다.

FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# 빌드 시점에 API 주소가 박힌다 — Vite 는 런타임 환경변수를 읽지 못한다.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/proxy_params_eden /etc/nginx/proxy_params_eden
EXPOSE 80
