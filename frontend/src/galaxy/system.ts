/*
 * galaxy/system.ts
 * ───────────────────────────────────────────────────────────────────────
 * 은하계의 배치와 운동.
 *
 *   중심   — 예수 그리스도의 은하. 제자리에서 자전만 한다.
 *   둘레   — 12제자의 은하가 타원 고리를 이루며 공전한다. 각자 자전도 한다.
 *
 * ★ 좌표가 두 층이다
 *   - 로컬 좌표: 한 은하 안에서의 위치. 별과 먼지는 전부 여기에 산다.
 *   - 월드 좌표: 로컬을 자전시키고, 크기를 곱하고, 은하 중심으로 옮긴 것.
 *
 *   이 구분이 있어야 은하 하나를 통째로 옮기고 돌리는 게 공짜가 된다.
 *   카메라 조준과 픽킹도 반드시 같은 변환을 써야 어긋나지 않는다.
 */

import type { GalaxyCoord } from '../data/types';
import { ALL_GALAXIES, CENTER_GALAXY, type DiscipleGalaxy } from '../data/disciples';

/** 12제자 은하가 도는 고리의 반지름 */
export const ORBIT_RADIUS = 2.45;
/**
 * 고리를 눌러 타원으로 만드는 비율.
 * 카메라가 이미 위에서 내려다보므로 원도 타원으로 보이지만,
 * 실제로 조금 눌러 두면 앞뒤 깊이 차가 커져 공전이 더 뚜렷하게 읽힌다.
 */
export const ORBIT_FLATTEN = 0.82;
/** 고리 자체를 기울인 각도(rad). 정면으로 누우면 납작한 원판처럼 보인다. */
export const ORBIT_TILT = 0.18;
/** 한 바퀴 도는 데 걸리는 시간(초). 의식되지 않을 만큼 느리게. */
export const ORBIT_PERIOD = 240;

/** 위성 은하의 크기 (중심 은하 대비) */
export const SATELLITE_SCALE = 0.4;

/** 계 전체가 들어오는 반지름 — 카메라 거리와 배경 별 범위의 기준 */
export const SYSTEM_RADIUS = ORBIT_RADIUS + SATELLITE_SCALE * 1.1;

/** 은하 하나의 배치·운동 정보 */
export interface GalaxyNode {
  galaxy: DiscipleGalaxy;
  /** 중심 은하인가 */
  center: boolean;
  /** 고리 위에서의 시작 각도 */
  orbitPhase: number;
  /** 자전 각속도(rad/s) */
  spinSpeed: number;
  /** 은하 크기 */
  scale: number;
  /** 자전 시작 각도 — 전부 같은 각도에서 출발하면 복제한 티가 난다 */
  spinPhase: number;
}

/** 로컬 → 월드 변환에 필요한 값 묶음 */
export interface NodeTransform {
  center: GalaxyCoord;
  spin: number;
  scale: number;
}

/**
 * 노드 목록을 만든다.
 * 12제자는 고리 위에 균등하게 배치되고, 자전 속도는 조금씩 다르다.
 */
export function buildNodes(): GalaxyNode[] {
  const satellites = ALL_GALAXIES.filter((g) => g.id !== CENTER_GALAXY.id);

  const center: GalaxyNode = {
    galaxy: CENTER_GALAXY,
    center: true,
    orbitPhase: 0,
    spinSpeed: 0.012,
    scale: 1,
    spinPhase: 0,
  };

  const nodes = satellites.map((galaxy, index) => ({
    galaxy,
    center: false,
    orbitPhase: (index / satellites.length) * Math.PI * 2,
    /*
     * 자전 속도를 조금씩 다르게 준다. 전부 같으면 12개가 한 몸처럼
     * 움직여서 "복제해 붙인 것"으로 보인다.
     */
    spinSpeed: 0.016 + (index % 5) * 0.004,
    scale: SATELLITE_SCALE,
    spinPhase: (index * 2.399) % (Math.PI * 2),
  }));

  return [center, ...nodes];
}

/** 지금 이 노드의 은하 중심 위치. */
export function nodeCenterAt(node: GalaxyNode, time: number): GalaxyCoord {
  if (node.center) return { x: 0, y: 0, z: 0 };

  const angle = node.orbitPhase + (time / ORBIT_PERIOD) * Math.PI * 2;
  const x = Math.cos(angle) * ORBIT_RADIUS;
  const ring = Math.sin(angle) * ORBIT_RADIUS * ORBIT_FLATTEN;

  // 고리를 X축 기준으로 기울인다.
  return {
    x,
    y: -ring * Math.sin(ORBIT_TILT),
    z: ring * Math.cos(ORBIT_TILT),
  };
}

/** 지금 이 노드의 자전각. */
export function nodeSpinAt(node: GalaxyNode, time: number): number {
  return node.spinPhase + node.spinSpeed * time;
}

export function transformAt(node: GalaxyNode, time: number): NodeTransform {
  return {
    center: nodeCenterAt(node, time),
    spin: nodeSpinAt(node, time),
    scale: node.scale,
  };
}

/**
 * 로컬 좌표를 월드 좌표로 옮긴다.
 * 자전(Y축) → 크기 → 은하 중심 이동 순서다.
 */
export function toWorld(local: GalaxyCoord, transform: NodeTransform): GalaxyCoord {
  const cos = Math.cos(transform.spin);
  const sin = Math.sin(transform.spin);

  return {
    x: (local.x * cos - local.z * sin) * transform.scale + transform.center.x,
    y: local.y * transform.scale + transform.center.y,
    z: (local.x * sin + local.z * cos) * transform.scale + transform.center.z,
  };
}

/** 구절 별의 지금 월드 위치. 카메라 조준이 이걸 쓴다. */
export function worldPointOf(
  node: GalaxyNode,
  local: GalaxyCoord,
  time: number,
): GalaxyCoord {
  return toWorld(local, transformAt(node, time));
}
