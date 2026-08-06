#!/usr/bin/env bash
#
# EC2(g4dn.xlarge, Deep Learning AMI) 초기 세팅.
#
#   ssh -i eden.pem ubuntu@<EC2_IP>
#   bash ec2-setup.sh
#
# ★ Deep Learning AMI 를 전제로 한다
#   NVIDIA 드라이버와 Docker 가 이미 들어 있다. 직접 까는 것이 GPU
#   세팅에서 제일 오래 걸리고 제일 잘 깨지는 부분이라, 그걸 건너뛰는
#   것이 이 선택의 전부다.
#
# ★ 실패하면 그 자리에서 멈춘다
#   set -e 없이 두면 드라이버가 없는데도 뒷단계가 계속 돌아가고,
#   마지막에 "왜 느리지" 로 끝난다. 원인이 보이는 곳에서 멈추는 게 낫다.

set -euo pipefail

echo "── 1. GPU 확인 ─────────────────────────────────────────"
if ! command -v nvidia-smi >/dev/null; then
  echo "✗ nvidia-smi 가 없습니다. Deep Learning AMI 로 띄운 게 맞나요?"
  exit 1
fi
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

echo
echo "── 2. Docker 확인 ──────────────────────────────────────"
if ! command -v docker >/dev/null; then
  echo "  Docker 가 없어 설치합니다…"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "  ※ 그룹 반영을 위해 SSH 를 한 번 나갔다 들어와야 합니다."
fi
docker --version

echo
echo "── 3. Ollama ───────────────────────────────────────────"
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

# ★ 컨테이너에서 닿으려면 0.0.0.0 으로 들어야 한다.
#   기본값(127.0.0.1)이면 호스트 안에서만 열리고, Django 컨테이너는
#   연결이 거부된다. 그런데 그 실패는 화면에 오류로 안 나온다 —
#   검색이 조용히 폴백으로 떨어질 뿐이다.
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf >/dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
# 모델을 메모리에 계속 올려 둔다. 기본값(5분)이면 발표 중 잠깐 쉬는
# 사이에 내려가고, 다음 질문에서 9GB 를 다시 올리느라 수십 초가 걸린다.
Environment="OLLAMA_KEEP_ALIVE=-1"
EOF
sudo systemctl daemon-reload
sudo systemctl restart ollama
sleep 3

echo
echo "── 4. 모델 내려받기 (9GB, 몇 분) ───────────────────────"
ollama pull qwen3-embedding:8b

echo
echo "── 5. 임베딩이 실제로 나오는지 ─────────────────────────"
RESPONSE=$(curl -s http://localhost:11434/api/embed \
  -d '{"model":"qwen3-embedding:8b","input":"불안합니다"}')

if echo "$RESPONSE" | grep -q '"embeddings"'; then
  echo "✓ 임베딩 정상"
else
  echo "✗ 임베딩 실패:"
  echo "$RESPONSE" | head -c 400
  exit 1
fi

echo
echo "── 6. GPU 를 쓰고 있는지 ───────────────────────────────"
# ★ 이걸 확인하지 않으면 CPU 로 도는 채로 발표에 간다.
#   결과는 똑같이 나오고 속도만 10배 느리다.
if nvidia-smi | grep -q ollama; then
  echo "✓ GPU 사용 중"
else
  echo "⚠ nvidia-smi 에 ollama 가 안 보입니다. CPU 로 돌고 있을 수 있습니다."
  echo "  질문 하나에 5초 이상 걸리면 그게 원인입니다."
fi

echo
echo "완료. 다음: .env.prod 를 채우고 scripts/deploy.sh 를 실행하세요."
