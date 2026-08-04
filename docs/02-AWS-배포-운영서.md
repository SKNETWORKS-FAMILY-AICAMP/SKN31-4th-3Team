# AWS 배포 · 운영서

구성: **S3 + CloudFront**(프론트) / **EC2**(Django) / **RDS PostgreSQL**

이 문서는 "무엇을 왜 그렇게 두었는지"와 "손이 필요한 순간에 무엇을 보는지"를
적습니다. 명령어를 그대로 따라 할 수 있게 쓰되, 판단이 필요한 지점은 표시했습니다.

---

## 1. 구성도

```
                    사용자
                      │
        ┌─────────────┴──────────────┐
        │                            │
   CloudFront                    Route 53
   (HTTPS, 캐시)                (도메인, 선택)
        │
   ┌────┴─────┐
   │          │
  S3        EC2 (Nginx → Gunicorn → Django)
 (정적)          │
                RDS PostgreSQL (Private Subnet)
```

### 왜 이 구성인가

- **프론트는 정적 파일입니다.** 서버가 할 일이 없으므로 S3 에 올리고
  CloudFront 가 전 세계 엣지에서 서빙합니다. EC2 로 서빙하면 트래픽이
  전부 한 대를 통과하고, 그 한 대가 죽으면 화면조차 안 뜹니다.
- **EC2 한 대**는 팀 프로젝트 규모에 맞습니다. ECS Fargate 는 무중단
  배포가 깔끔하지만 ALB(월 약 $18)와 NAT(월 약 $35)가 고정비로 붙습니다.
  트래픽이 늘거나 무중단 배포가 필요해지면 그때 옮깁니다 —
  컨테이너로 만들어 두었으므로 이전 비용은 크지 않습니다.
- **RDS 는 Private Subnet** 에 둡니다. DB 는 인터넷에서 보이면 안 됩니다.

---

## 2. 리소스 목록

| 리소스 | 사양 | 용도 | 월 예상(서울, 온디맨드) |
|---|---|---|---|
| EC2 | t3.small (2 vCPU / 2GB) | Django + Nginx | 약 $19 |
| EBS | gp3 20GB | 루트 볼륨 | 약 $1.8 |
| RDS | db.t4g.micro, 20GB gp3 | PostgreSQL 16 | 약 $16 |
| S3 | Standard, 수 GB | 정적 파일 | 약 $0.3 |
| CloudFront | 트래픽 종량 | CDN + HTTPS | 약 $1~5 |
| Route 53 | 호스팅 존 1개 | 도메인 (선택) | $0.5 |
| **합계** | | | **약 $39~43** |

- 프리 티어 계정이면 EC2 t2.micro / RDS db.t4g.micro 가 12개월 무료라
  실 비용은 CloudFront·S3 종량분(월 $1 내외)만 남습니다.
- **비용이 새는 곳**: NAT Gateway(월 $35)를 만들지 마세요. 이 구성에서는
  필요 없습니다. EC2 를 Public Subnet 에 두고 Security Group 으로 막습니다.
- 데모가 끝나면 EC2 를 중지하고 RDS 스냅샷을 뜬 뒤 삭제하면 비용이 거의 0 이 됩니다.

---

## 3. 네트워크

```
VPC 10.0.0.0/16
├── Public  10.0.1.0/24   EC2      (인터넷 게이트웨이)
└── Private 10.0.2.0/24   RDS      (외부 접근 불가)
                          10.0.3.0/24  (RDS 는 서브넷 그룹에 2개 AZ 필요)
```

### Security Group

| 이름 | 인바운드 | 비고 |
|---|---|---|
| `eden-web-sg` (EC2) | 80, 443 ← 0.0.0.0/0<br>22 ← **내 IP만** | SSH 를 전체 공개하지 마세요 |
| `eden-db-sg` (RDS) | 5432 ← `eden-web-sg` | IP 가 아니라 **보안 그룹**으로 지정 |

DB 인바운드를 IP 로 열면 EC2 를 재생성할 때마다 규칙을 고쳐야 합니다.
보안 그룹으로 지정하면 그 그룹에 속한 인스턴스면 무엇이든 통과합니다.

---

## 4. 배포 절차

### 4.1 RDS

```bash
# 콘솔 또는 CLI. 엔진 PostgreSQL 16, 퍼블릭 액세스 "아니요"
aws rds create-db-instance \
  --db-instance-identifier eden-db \
  --db-instance-class db.t4g.micro \
  --engine postgres --engine-version 16 \
  --allocated-storage 20 --storage-type gp3 \
  --master-username eden --master-user-password '<강한-비밀번호>' \
  --db-name eden \
  --vpc-security-group-ids <eden-db-sg> \
  --db-subnet-group-name <private-subnet-group> \
  --backup-retention-period 7 \
  --no-publicly-accessible
```

- **백업 보존 7일**을 켜 두세요. 기본값 1일이면 금요일 사고를 월요일에
  복구할 수 없습니다.
- 엔드포인트를 받아 둡니다: `eden-db.xxxx.ap-northeast-2.rds.amazonaws.com`

### 4.2 EC2

```bash
# Amazon Linux 2023, t3.small, eden-web-sg, 키페어 지정
ssh -i eden.pem ec2-user@<EIP>

sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/bin/docker-compose && sudo chmod +x /usr/local/bin/docker-compose
exit  # 그룹 반영을 위해 재접속

ssh -i eden.pem ec2-user@<EIP>
git clone <저장소> eden && cd eden/server
cp .env.example .env && vi .env      # 아래 4.4 참조
```

**Elastic IP 를 붙이세요.** 안 붙이면 인스턴스를 재시작할 때마다 IP 가
바뀌고, CloudFront 오리진과 DNS 를 매번 고쳐야 합니다.

### 4.3 서버 기동

프런트를 S3 로 올릴 것이므로 EC2 에서는 API 만 띄웁니다.

```bash
cd ~/eden
docker compose up -d --build api db   # db 는 RDS 를 쓰면 제외
```

RDS 를 쓴다면 `docker-compose.prod.yml` 로 `db` 서비스 없이 띄우고
`DATABASE_URL` 만 RDS 엔드포인트로 지정합니다.

컨테이너는 기동 시 `migrate` → `seed_scripture` → `gunicorn` 순서로
돕니다. 시드는 upsert 라 배포할 때마다 돌아도 기존 대화에 손대지 않습니다.

### 4.4 환경변수 (`server/.env`)

```ini
SECRET_KEY=<openssl rand -hex 32 결과>
DEBUG=False

ALLOWED_HOSTS=api.example.com,<EC2 사설IP>
CORS_ALLOWED_ORIGINS=https://example.com
CSRF_TRUSTED_ORIGINS=https://example.com,https://api.example.com

DATABASE_URL=postgres://eden:<비밀번호>@eden-db.xxxx.ap-northeast-2.rds.amazonaws.com:5432/eden

GUNICORN_WORKERS=3
```

- `DEBUG=False` 를 반드시 확인하세요. `True` 로 두면 오류 화면에
  설정값과 스택이 그대로 노출됩니다.
- `ALLOWED_HOSTS` 에 **EC2 사설 IP** 를 넣는 이유: ALB/헬스체크가
  IP 로 접근하면 Host 헤더가 IP 가 되어 400 이 납니다.

### 4.5 프론트 → S3 + CloudFront

```bash
cd frontend
echo "VITE_API_BASE_URL=https://api.example.com" > .env.production
npm ci && npm run build

aws s3 sync dist/ s3://eden-web/ --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"

# ★ index.html 만 캐시하지 않는다
aws s3 cp dist/index.html s3://eden-web/index.html \
  --cache-control "no-cache"

aws cloudfront create-invalidation --distribution-id <ID> --paths "/index.html" "/"
```

**`index.html` 을 캐시하면 배포해도 옛 화면이 계속 나옵니다.**
자산 파일명에는 해시가 붙어 있어 영구 캐시가 안전하지만, 그 해시를
가리키는 문서는 매번 새로 받아야 합니다.

### 4.6 CloudFront 설정

| 항목 | 값 | 이유 |
|---|---|---|
| Origin | S3 (OAC 사용) | 버킷을 공개하지 않고 CloudFront 만 읽게 |
| Viewer protocol | Redirect HTTP to HTTPS | |
| **커스텀 오류 응답** | 403 → `/index.html` (200)<br>404 → `/index.html` (200) | **SPA 폴백** |
| 압축 | 켜기 | |

**커스텀 오류 응답이 핵심입니다.** `/verse/gen-1-3` 을 새로고침하면
S3 에 그런 키가 없어 403/404 가 납니다. `index.html` 로 돌려줘야
React Router 가 경로를 해석합니다. 이걸 빼먹으면 "새로고침하면 깨진다"는
증상이 나옵니다.

### 4.7 HTTPS

- **프론트(CloudFront)**: ACM 인증서는 반드시 **us-east-1** 에서 발급합니다.
  서울 리전에서 발급하면 CloudFront 에 붙지 않습니다.
- **API(EC2)**: Let's Encrypt + certbot, 또는 ALB + ACM(서울).
  단일 EC2 라면 certbot 이 간단합니다.

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com
```

---

## 5. 운영

### 헬스체크

```
GET /healthz/   → {"status":"ok"}
```

DB 를 건드리지 않습니다. DB 가 잠깐 느릴 때 헬스체크까지 실패해
인스턴스가 교체되는 일을 막기 위해서입니다.

### 로그

```bash
docker compose logs -f api          # 애플리케이션
docker compose logs -f web          # Nginx 접근 로그
```

CloudWatch Agent 를 붙이면 보존과 검색이 편해집니다(선택).

### 배포 (재배포)

```bash
# 백엔드
cd ~/eden && git pull && docker compose up -d --build api

# 프론트
npm run build && aws s3 sync ... && aws cloudfront create-invalidation ...
```

무중단이 아닙니다. 컨테이너가 교체되는 수 초 동안 502 가 납니다.
데모 중이 아니라면 문제되지 않고, 필요해지면 ECS 로 옮깁니다.

### 롤백

| 대상 | 방법 |
|---|---|
| 프론트 | 이전 빌드를 다시 `s3 sync` + invalidation. S3 버전 관리를 켜 두면 더 간단 |
| 백엔드 | `git checkout <이전 태그> && docker compose up -d --build api` |
| DB 스키마 | `python manage.py migrate <app> <이전 마이그레이션 번호>` |
| DB 데이터 | RDS 스냅샷 복원 (새 인스턴스로 뜨므로 엔드포인트 교체 필요) |

**마이그레이션 롤백은 데이터 손실을 동반할 수 있습니다.** 컬럼을 지우는
마이그레이션은 배포 전에 스냅샷을 한 번 뜨고 진행하세요.

---

## 6. 시크릿 관리

| 값 | 지금 | 권장 |
|---|---|---|
| `SECRET_KEY` | EC2 의 `.env` | AWS Secrets Manager |
| DB 비밀번호 | EC2 의 `.env` | Secrets Manager (RDS 통합 회전) |
| `OPENAI_API_KEY` | 미사용 | Secrets Manager (연동 시) |

`.env` 는 **커밋하지 않습니다**(`.gitignore` 확인). 지금은 EC2 파일에
두지만, 인스턴스가 늘거나 팀원이 늘면 Secrets Manager 로 옮기세요.
`.env` 방식은 "서버에 들어갈 수 있는 사람 = 시크릿을 볼 수 있는 사람" 입니다.

---

## 7. 알려진 위험

| 위험 | 지금 상태 | 대응 |
|---|---|---|
| **JWT 를 localStorage 에 보관** | XSS 가 나면 토큰이 유출됨 | 의존성 최소화 + CSP 적용. 장기적으로는 HttpOnly 쿠키 + BFF |
| **EC2 단일 장애점** | 인스턴스가 죽으면 API 중단 (프론트는 살아 있음) | 데모 범위에서 수용. 운영 전환 시 ALB + 2대 |
| **자동 백업만 있음** | RDS 7일 보존 | 중요한 시점에 수동 스냅샷 |
| **모니터링 없음** | 장애를 사람이 발견 | CloudWatch 알람(CPU, RDS 연결 수, 5xx) |
| **비밀번호 정책이 Django 기본** | 8자 이상 + 흔한 비밀번호 차단 | 필요 시 강화 |

---

## 8. 배포 체크리스트

```
□ RDS 생성, 백업 보존 7일, 퍼블릭 액세스 끔
□ eden-db-sg 인바운드를 IP 가 아니라 eden-web-sg 로 지정
□ EC2 Elastic IP 할당
□ SSH(22)는 내 IP 만
□ server/.env — DEBUG=False, SECRET_KEY 랜덤, ALLOWED_HOSTS 채움
□ docker compose up -d --build → /healthz/ 200 확인
□ /api/v1/scripture/verses/ 가 702건 반환하는지 확인
□ ACM 인증서 us-east-1 에서 발급 (CloudFront 용)
□ CloudFront 커스텀 오류 응답 403/404 → /index.html (200)
□ index.html 만 no-cache 로 업로드
□ 배포 후 /verse/gen-1-3 직접 접속(새로고침)해서 깨지지 않는지 확인
□ 로그인 → 상담 → 새로고침 후에도 로그인 유지되는지 확인
```

마지막 두 줄이 실제로 자주 빠지는 항목입니다.
