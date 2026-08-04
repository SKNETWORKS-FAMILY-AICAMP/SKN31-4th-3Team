/*
 * galaxy/dust.ts
 * ───────────────────────────────────────────────────────────────────────
 * 성운 먼지 — 장식 전용 입자.
 *
 * ★ 개념 구분이 중요하다.
 *   - VerseStar   : 별. 성경 구절 하나에 대응하는 탐색 가능한 노드.
 *   - BackdropStar: 별. 실제 31,077절의 책별 분포를 반영한 배경 구절.
 *   - DustParticle: 별이 아니다. 구절과 대응하지 않는 순수 시각 요소.
 *
 *   먼지는 클릭·포커스 대상이 아니며 id 도 갖지 않는다. 은하의 밀도와
 *   형태를 만드는 역할만 한다. 이 구분을 흐리면 "별 하나가 구절 하나"라는
 *   서비스의 핵심 개념이 무너진다.
 *
 * 형태: 나선 원반 + 구형 헤일로.
 *   원반이 은하다운 결을 만들고, 헤일로가 전체 실루엣을 둥글게 유지한다.
 *   (요구사항의 "지구를 닮은 둥근 성운"과 "은하수"를 함께 만족시키는 구성)
 *
 * 좌표계는 placement.ts 규약을 따른다 — 은하면 x-z, y 가 두께.
 */

import { ARMS, ARM_TWIST, seededRandom } from './placement';

export interface DustParticle {
  x: number;
  y: number;
  z: number;
  /** 0..1 밝기. 큐레이션 별보다 확실히 어둡다. */
  magnitude: number;
  /** 은하면 위에서 중심으로부터의 정규 거리 0..1 — 색온도 결정에 쓴다. */
  radialT: number;
}

/*
 * 나선 팔 규격(ARMS / ARM_TWIST)은 placement.ts 가 가진다.
 * 구절 별과 먼지가 같은 나선을 따라야 별이 팔 위에 얹힌 것처럼 보인다.
 * 값이 갈라지는 순간 별과 성운이 서로 다른 은하처럼 어긋난다.
 */
/** 팔 주변으로 흩어지는 폭. 0이면 선처럼 보여 인공적이다. */
const ARM_SPREAD = 0.55;
/** 원반 두께. 얇을수록 납작한 은하가 된다. */
const DISK_THICKNESS = 0.16;
/** 전체 중 헤일로(구형) 비율. 실루엣을 둥글게 유지하는 몫. */
const HALO_RATIO = 0.28;

/** 정규분포 근사 — 균등난수 3개 평균. 팔 주변 흩뿌림에 쓴다. */
function gauss(rand: () => number): number {
  return (rand() + rand() + rand()) / 1.5 - 1;
}

/**
 * 먼지 입자를 생성한다.
 *
 * @param count 생성 개수 (품질 티어가 결정)
 * @param seed  고정 시드 — 방문마다 하늘이 바뀌지 않게 한다
 */
export function generateDust(count: number, seed = 77003): DustParticle[] {
  const rand = seededRandom(seed);
  const particles: DustParticle[] = [];
  const haloCount = Math.round(count * HALO_RATIO);

  // ── 나선 원반 ────────────────────────────────────────────────────
  for (let i = 0; i < count - haloCount; i += 1) {
    // 중심으로 갈수록 촘촘하게 (지수 < 1)
    const r = Math.pow(rand(), 0.62) * 0.96;

    // 로그 나선: 반경이 커질수록 각도가 감긴다
    const twist = ARM_TWIST * Math.log(r + 0.22);
    const arm = Math.floor(rand() * ARMS) * ((Math.PI * 2) / ARMS);
    // 바깥일수록 팔이 넓게 퍼진다 — 안쪽만 흩으면 중심이 지저분해진다
    const scatter = gauss(rand) * ARM_SPREAD * (0.25 + r * 0.9);
    const theta = twist + arm + scatter;

    particles.push({
      x: Math.cos(theta) * r,
      // 원반은 중심부가 부풀고(bulge) 바깥으로 갈수록 얇아진다
      y: gauss(rand) * DISK_THICKNESS * (1 - r * 0.55),
      z: Math.sin(theta) * r,
      // 중심부가 밝다
      magnitude: (0.05 + rand() * 0.2) * (1.25 - r * 0.45),
      radialT: r,
    });
  }

  // ── 구형 헤일로 ──────────────────────────────────────────────────
  for (let i = 0; i < haloCount; i += 1) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    // 헤일로는 바깥쪽에 얇게 퍼진다
    const r = 0.45 + Math.pow(rand(), 0.8) * 0.62;

    particles.push({
      x: Math.sin(phi) * Math.cos(theta) * r,
      // 극축이 Y — 헤일로도 위아래로 살짝 눌린 형태다
      y: Math.cos(phi) * r * 0.7,
      z: Math.sin(phi) * Math.sin(theta) * r,
      // 헤일로는 확연히 어둡다 — 있는 듯 없는 듯
      magnitude: 0.03 + rand() * 0.1,
      radialT: Math.min(1, r),
    });
  }

  return particles;
}

/**
 * 안개 블롭 위치.
 * 나선 팔 위에 얹혀 은하 구름 느낌을 만든다. 개수가 적어야 지저분해지지 않는다.
 */
export interface HazeBlob {
  x: number;
  /** 은하면에서의 높이. 안개는 원반에 붙어 있다. */
  y: number;
  z: number;
  /** 월드 단위 반경 — 투영 배율을 곱해 화면 크기로 환산한다 */
  radius: number;
  /** 0..1 색온도 (0 = 중심 온백, 1 = 외곽 달빛) */
  radialT: number;
  /** 최대 알파 — 아주 옅게만 */
  alpha: number;
}

const HAZE_COUNT = 7;

export function generateHaze(seed = 20260801): HazeBlob[] {
  const rand = seededRandom(seed);
  const blobs: HazeBlob[] = [];

  for (let i = 0; i < HAZE_COUNT; i += 1) {
    const r = 0.12 + Math.pow(rand(), 0.7) * 0.62;
    const twist = ARM_TWIST * Math.log(r + 0.22);
    const arm = Math.floor(rand() * ARMS) * ((Math.PI * 2) / ARMS);
    const theta = twist + arm + gauss(rand) * 0.4;

    blobs.push({
      x: Math.cos(theta) * r,
      y: gauss(rand) * 0.05,
      z: Math.sin(theta) * r,
      radius: 0.22 + rand() * 0.28,
      radialT: r,
      // 중심에 가까운 블롭이 조금 더 진하다. 그래도 상한이 낮다.
      alpha: 0.028 + (1 - r) * 0.03,
    });
  }

  return blobs;
}
