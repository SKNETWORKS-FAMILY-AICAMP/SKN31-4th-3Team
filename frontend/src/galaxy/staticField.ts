/*
 * galaxy/staticField.ts
 * ───────────────────────────────────────────────────────────────────────
 * 3D 투영과 별 하나 그리기.
 *
 * 좌표계 (placement.ts 규약):
 *   은하면 = x-z 평면, y = 위(원반 두께). 자전축과 카메라 궤도축이 모두 Y.
 *
 * 카메라는 원점을 바라보며 구면 궤도를 돈다:
 *   yaw      — Y축 기준 방위각
 *   pitch    — 은하면 위로 올라간 각도 (양수면 위에서 내려다본다)
 *   distance — 원점까지의 거리
 *
 * 변환 순서: Y회전(-yaw) → X회전(pitch) → 카메라 거리만큼 밀기 → 원근분할.
 * 카메라 뒤로 넘어간 점은 near 평면에서 잘라낸다 — 안 자르면 뒤쪽 별이
 * 화면에 뒤집혀 나타난다.
 */

import type { GalaxyCoord } from '../data/types';

export interface Viewport {
  width: number;
  height: number;
  /** 초점거리(px). 클수록 화각이 좁아지고 원근이 약해진다. */
  focal: number;
  yaw: number;
  pitch: number;
  distance: number;
  /**
   * 밝기·크기 감쇠의 기준 거리. 보통 "카메라가 쉬는 거리"를 넣는다.
   *
   * ★ 없으면 은하가 늘어난 순간 화면이 캄캄해진다.
   *   감쇠를 고정 상수로 두면, 13개 은하를 담으려고 카메라를 뒤로 뺀 만큼
   *   모든 별이 그대로 어두워지고 작아진다. 기준을 카메라와 함께 움직이면
   *   "얼마나 멀리서 보든 전체 밝기는 비슷하고, 그 안에서 앞뒤 대비만 남는"
   *   상태가 된다.
   *
   *   생략하면 기본 카메라 거리 기준으로 동작한다 (테스트·단순 호출용).
   */
  depthReference?: number;
}

export interface Projected {
  sx: number;
  sy: number;
  /** 0..1+ — 카메라에 가까울수록 커진다. 크기·밝기 감쇠에 쓴다. */
  depth: number;
  /** 이 깊이에서 월드 1단위가 차지하는 화면 픽셀 수 */
  k: number;
  /** 카메라 앞에 있는가. false 면 그리지 않는다. */
  visible: boolean;
}

/** 이보다 가까우면 원근분할이 폭발한다. */
const NEAR_PLANE = 0.12;

/**
 * 기준 거리에 섰을 때의 감쇠값.
 * 0.6 은 기존 튜닝값이다 (카메라 2.9 / 상수 1.7 → 0.586).
 */
const DEPTH_AT_REFERENCE = 0.6;

/** depthReference 를 주지 않았을 때 쓰는 기본 기준 거리. */
const DEFAULT_DEPTH_REFERENCE = 2.9;

/** 화면 짧은 변 대비 초점거리 비율. */
export const FOCAL_RATIO = 1.2;

export function focalFor(width: number, height: number): number {
  return Math.min(width, height) * FOCAL_RATIO;
}

/** 월드 좌표 → 화면 좌표. */
export function project(coord: GalaxyCoord, vp: Viewport): Projected {
  const cosYaw = Math.cos(vp.yaw);
  const sinYaw = Math.sin(vp.yaw);
  const cosPitch = Math.cos(vp.pitch);
  const sinPitch = Math.sin(vp.pitch);

  // 1) 카메라 방위각만큼 되돌린다 (Y축 회전)
  const x1 = coord.x * cosYaw - coord.z * sinYaw;
  const z1 = coord.x * sinYaw + coord.z * cosYaw;

  // 2) 카메라 고도만큼 되돌린다 (X축 회전)
  const y2 = coord.y * cosPitch - z1 * sinPitch;
  const z2 = coord.y * sinPitch + z1 * cosPitch;

  // 3) 카메라는 -Z 쪽에 distance 만큼 떨어져 있다
  const depthFromCamera = z2 + vp.distance;

  if (depthFromCamera < NEAR_PLANE) {
    return { sx: 0, sy: 0, depth: 0, k: 0, visible: false };
  }

  const k = vp.focal / depthFromCamera;
  const reference = (vp.depthReference ?? DEFAULT_DEPTH_REFERENCE) * DEPTH_AT_REFERENCE;

  return {
    sx: vp.width / 2 + x1 * k,
    // 화면 y 는 아래로 증가하므로 뒤집는다
    sy: vp.height / 2 - y2 * k,
    depth: Math.min(1.2, reference / depthFromCamera),
    k,
    visible: true,
  };
}

/**
 * 아주 작은 별은 원호 대신 사각형으로 그린다.
 * 1px 남짓에서는 시각적 차이가 없는데 arc+fill 은 path 를 만들어야 해서
 * 훨씬 비싸다. 수천 개를 60fps 로 그릴 때 이 차이가 누적된다.
 */
const RECT_THRESHOLD = 1.1;

/** 별 하나를 그린다. glow 는 비용이 크므로 티어에 따라 끈다. */
export function drawStar(
  ctx: CanvasRenderingContext2D,
  p: Projected,
  radius: number,
  alpha: number,
  glow: boolean,
): void {
  if (!p.visible || alpha <= 0.01) return;

  if (glow && radius > 1.1) {
    const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, radius * 5);
    g.addColorStop(0, `rgba(232, 236, 242, ${alpha * 0.5})`);
    g.addColorStop(1, 'rgba(232, 236, 242, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, radius * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = `rgba(244, 244, 242, ${alpha})`;

  if (radius < RECT_THRESHOLD) {
    const size = radius * 2;
    ctx.fillRect(p.sx - radius, p.sy - radius, size, size);
    return;
  }

  ctx.beginPath();
  ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
  ctx.fill();
}
