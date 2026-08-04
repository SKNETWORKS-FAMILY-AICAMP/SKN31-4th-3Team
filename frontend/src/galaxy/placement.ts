/*
 * galaxy/placement.ts
 * ───────────────────────────────────────────────────────────────────────
 * 별 좌표 배치 수학. 데이터가 아니라 규칙으로 좌표를 만든다.
 *
 * 설계 의도:
 *  - 큐레이션 별은 "주제 링"에 배치된다 → 같은 주제의 별이 하늘에서도 이웃한다.
 *  - 배경 별은 피보나치 구 + 위도 밀도 가중으로 배치된다 → 지구를 닮은
 *    둥근 성운 느낌을 대륙 그림 없이 추상적으로만 만든다.
 *  - 모든 좌표는 -1..1 정규화. 화면 크기·DPR과 완전히 무관하다.
 *
 * ★ 좌표계 규약 (3D 전환 시 정한 것)
 *   은하면 = x-z 평면, y = 원반 두께(위아래).
 *   자전축과 카메라 궤도축이 모두 Y 이므로, 자전하면 나선 팔이 실제로
 *   "돌아간다". 예전처럼 원반을 x-y 에 두면 Y축 회전이 나선을 돌리는 게
 *   아니라 가로로 납작하게 눌러버린다 — 3D 로 읽히지 않는 원인이었다.
 */

import type { GalaxyCoord } from '../data/types';

/** 링 반경 범위 — 안쪽이 비면 성운이 도넛처럼 보이므로 하한을 둔다. */
const RING_INNER = 0.32;
const RING_OUTER = 0.86;

/** 큐레이션 별이 은하면에서 벗어나는 최대 높이. 원반 두께 안에 머문다. */
const RING_ELEVATION = 0.14;

/** 황금각. 같은 주제 안에서 별이 규칙적으로 겹치지 않게 흩는다. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** 결정론적 의사난수 — 같은 입력이면 항상 같은 하늘이 나온다. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

/** 나선 팔 개수. 먼지(dust.ts)와 같은 값을 써야 별이 팔 위에 얹힌다. */
export const ARMS = 2;
/** 팔이 감기는 정도. 이것도 먼지와 공유한다. */
export const ARM_TWIST = 3.4;

/**
 * 구절 별의 은하 안 위치 (로컬 좌표).
 *
 * ★ 별은 성운의 나선 팔 위에 놓인다.
 *   먼지와 같은 로그 나선 공식을 쓰기 때문에, 구절 별이 성운과 따로 노는
 *   고리처럼 보이지 않고 은하의 팔을 이루는 밝은 점으로 읽힌다.
 *   (한 은하당 40개 규모가 되면서 단순한 고리 배치로는 안 되는 지점이다)
 *
 * ★ 이 좌표는 은하 로컬이다.
 *   화면에 찍히는 위치는 system.ts 의 변환(자전·크기·공전)을 거쳐 나온다.
 *
 * @param indexInGalaxy 은하 안에서의 순번
 * @param galaxyCount   그 은하의 총 별 수
 * @param galaxyIndex   은하의 순번. 별 배치를 은하마다 다르게 돌려
 *                      13개가 같은 무늬로 복제된 것처럼 보이지 않게 한다.
 */
export function placeInGalaxy(
  indexInGalaxy: number,
  galaxyCount: number,
  galaxyIndex = 0,
): GalaxyCoord {
  /*
   * 반경은 제곱근으로 벌린다.
   * 순번에 비례시키면 바깥쪽이 성기게 보인다 — 원의 면적이 반경의 제곱으로
   * 늘기 때문이다. 제곱근을 쓰면 단위 면적당 밀도가 고르게 유지된다.
   */
  const step = galaxyCount > 1 ? (indexInGalaxy + 0.5) / galaxyCount : 0.5;
  const radius = RING_INNER + (RING_OUTER - RING_INNER) * Math.sqrt(step);

  /*
   * 로그 나선. 반경이 커질수록 각이 감긴다.
   * 팔을 번갈아 배정하고, 황금각으로 팔 주변에 흩는다 — 정확히 팔 위에만
   * 얹으면 선처럼 보여 인공적이다.
   */
  const arm = (indexInGalaxy % ARMS) * ((Math.PI * 2) / ARMS);
  const scatter = Math.sin(indexInGalaxy * GOLDEN_ANGLE * 3) * 0.34 * (0.3 + step);
  const angle = ARM_TWIST * Math.log(radius + 0.22) + arm + scatter + galaxyIndex * 1.2399;

  /*
   * 은하면(x-z)에 놓고 y 로 살짝만 띄운다.
   * 중심부는 부풀고 바깥으로 갈수록 얇아지는 원반의 모양을 따른다.
   * 값이 크면 원반이 아니라 공처럼 보이므로 두께 안에 묶어 둔다.
   */
  const elevation =
    Math.sin(indexInGalaxy * 1.71 + galaxyIndex * 0.77) * RING_ELEVATION * (1 - step * 0.55);

  return {
    x: Math.cos(angle) * radius,
    y: elevation,
    z: Math.sin(angle) * radius,
  };
}

/**
 * 배경 별 좌표. 피보나치 구 분포에 위도별 밀도 가중을 얹는다.
 *
 * 극축은 Y 다 — 적도가 곧 은하면(x-z)이 되어, 밀도가 높은 띠가
 * 원반과 같은 평면에 놓인다.
 *
 * @param index 0..total-1
 * @param total 전체 개수
 * @param rand  결정론적 난수 생성기
 */
export function placeOnSphere(index: number, total: number, rand: () => number): GalaxyCoord {
  // 피보나치 구: 균일하게 흩어진 점
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const inclination = Math.acos(1 - 2 * t);
  const azimuth = GOLDEN_ANGLE * index;

  // 밀도 가중: 적도(은하면) 근처를 조금 더 촘촘하게 → 성운의 띠 느낌
  const bandBias = 0.78 + Math.sin(inclination) * 0.22;
  // 반경 흔들기: 완벽한 구는 인공적으로 보인다
  const radius = (0.18 + Math.pow(rand(), 0.62) * 0.82) * bandBias;

  return {
    x: Math.sin(inclination) * Math.cos(azimuth) * radius,
    // 위아래로 살짝 눌러 완전한 구가 아닌 넓적한 헤일로로 만든다
    y: Math.cos(inclination) * radius * 0.75,
    z: Math.sin(inclination) * Math.sin(azimuth) * radius,
  };
}

/** 두 좌표 사이 거리 — 카메라 비행 시간 산정과 히트테스트에 쓴다. */
export function distance(a: GalaxyCoord, b: GalaxyCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
