/*
 * galaxy/staticField.test.ts
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 카메라가 멀어져도 하늘이 캄캄해지지 않는가.
 *
 * ★ 이 파일이 지키는 회귀
 *   13개 은하를 담으려고 카메라를 2.9 → 7.2 로 뺐더니 별의 밝기·크기가
 *   그대로 1/2.5 로 줄었다. 클릭할 수 있는 별이 화면에서 사라진 것이다.
 *   감쇠 기준(depthReference)을 카메라와 함께 움직이는 것이 그 해법이고,
 *   여기서 그 성질을 고정한다.
 */

import { describe, expect, it } from 'vitest';
import { FOCAL_RATIO, focalFor, project, type Viewport } from './staticField';

function viewport(distance: number, depthReference?: number): Viewport {
  return {
    width: 1200,
    height: 800,
    focal: focalFor(1200, 800),
    yaw: 0,
    pitch: 0,
    distance,
    depthReference,
  };
}

const ORIGIN = { x: 0, y: 0, z: 0 };

describe('감쇠 기준', () => {
  it('★ 기준을 카메라와 함께 키우면 밝기가 유지된다', () => {
    const near = project(ORIGIN, viewport(2.9, 2.9));
    const far = project(ORIGIN, viewport(7.2, 7.2));
    expect(far.depth).toBeCloseTo(near.depth, 6);
  });

  it('기준을 고정하면 멀어질수록 어두워진다 (고치기 전의 동작)', () => {
    const near = project(ORIGIN, viewport(2.9, 2.9));
    const far = project(ORIGIN, viewport(7.2, 2.9));
    // 2.5배 멀어지면 2.5배 어두워졌다 — 이게 별이 사라진 원인이었다.
    expect(far.depth).toBeLessThan(near.depth * 0.45);
  });

  it('기준을 줘도 앞뒤 대비는 남는다', () => {
    const vp = viewport(7.2, 7.2);
    const front = project({ x: 0, y: 0, z: -2 }, vp);
    const back = project({ x: 0, y: 0, z: 2 }, vp);
    expect(front.depth).toBeGreaterThan(back.depth);
  });

  it('기준을 생략해도 기존 카메라 거리에서는 값이 같다', () => {
    // 테스트와 단순 호출부가 기본값으로도 예전과 같이 동작해야 한다.
    expect(project(ORIGIN, viewport(2.9)).depth).toBeCloseTo(
      project(ORIGIN, viewport(2.9, 2.9)).depth,
      6,
    );
  });

  it('감쇠에 상한이 있다 (코앞의 별이 폭발하지 않는다)', () => {
    expect(project(ORIGIN, viewport(0.2, 7.2)).depth).toBeLessThanOrEqual(1.2);
  });
});

describe('투영', () => {
  it('원점은 화면 중앙이다', () => {
    const vp = viewport(7.2, 7.2);
    const p = project(ORIGIN, vp);
    expect(p.sx).toBeCloseTo(vp.width / 2, 6);
    expect(p.sy).toBeCloseTo(vp.height / 2, 6);
  });

  it('카메라 뒤의 점은 그리지 않는다', () => {
    expect(project({ x: 0, y: 0, z: -3 }, viewport(2.9, 2.9)).visible).toBe(false);
  });

  it('초점거리는 짧은 변을 따른다 (세로 화면에서 성운이 잘리지 않게)', () => {
    expect(focalFor(1200, 800)).toBeCloseTo(800 * FOCAL_RATIO, 6);
    expect(focalFor(360, 640)).toBeCloseTo(360 * FOCAL_RATIO, 6);
  });
});
