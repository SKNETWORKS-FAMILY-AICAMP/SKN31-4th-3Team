#!/usr/bin/env bash
#
# EC2 에서 실행한다. 코드를 받아 다시 띄운다.
#
#   cd ~/4TH_PROJECT && bash scripts/deploy.sh
#
# ★ GitHub Actions 를 쓰지 않는다
#   무중단 배포가 필요한 규모가 아니고, 워크플로를 만들다 막히면
#   그 시간이 통째로 사라진다. 지금 필요한 것은 "확실히 뜨는 것" 이다.
#   트래픽이 생기면 그때 옮긴다.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.prod ]; then
  echo "✗ .env.prod 가 없습니다. .env.prod.example 을 복사해 채우세요."
  exit 1
fi

echo "── 코드 갱신 ───────────────────────────────────────────"
git pull --ff-only

echo
echo "── 빌드 · 기동 ─────────────────────────────────────────"
# api 컨테이너가 뜨면서 migrate 와 seed_scripture 를 스스로 돌린다
# (server/Dockerfile 의 CMD 참조).
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo
echo "── 상태 ────────────────────────────────────────────────"
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

echo
echo "── 헬스체크 ────────────────────────────────────────────"
sleep 5
for i in $(seq 1 12); do
  if curl -sf http://localhost/healthz >/dev/null 2>&1; then
    echo "✓ API 응답"
    break
  fi
  [ "$i" = "12" ] && { echo "✗ API 무응답 — docker compose logs api 를 보세요"; exit 1; }
  sleep 5
done

echo
echo "── 검색이 살아 있는지 ──────────────────────────────────"
# ★ 여기가 진짜 확인 지점이다.
#   컨테이너가 떠 있어도 임베딩이 안 되면 검색은 조용히 폴백으로
#   떨어진다. 화면은 멀쩡하고 추천만 예전 표에서 나온다.
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T api \
  python manage.py shell -c "
from scripture.search import ready, active_model
print('검색 준비:', ready(), '/ 모델:', active_model())
" || echo "⚠ 확인 실패 — 컨테이너 안에서 직접 봐 주세요"

echo
echo "완료. http://<EC2_IP> 로 열어 보세요."
