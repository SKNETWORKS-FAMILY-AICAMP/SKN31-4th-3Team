/*
 * galaxy/Camera.test.ts
 * 검증 기준: 궤도 카메라가 별을 정확히 조준하고, 자전하는 별을 놓치지 않는가.
 */

import { describe, expect, it } from 'vitest';
import {
  Camera,
  DRAG_YAW_PER_WIDTH,
  DEFAULT_DISTANCE,
  DEFAULT_PITCH,
  FLIGHT_DURATION,
  FLIGHT_DURATION_REDUCED,
  FOCUS_APPROACH,
  aimAt,
  aimAtGalaxy,
  lerpAngle,
  shortestAngle,
  spinPoint,
  type OrbitTarget,
} from './Camera';
import { focalFor, project, type Viewport } from './staticField';

const SPIN_SPEED = 0.012;

function advance(camera: Camera, target: OrbitTarget | null, seconds: number, step = 1 / 60) {
  let arrived = false;
  for (let t = 0; t < seconds; t += step) {
    if (camera.update(target, step)) arrived = true;
  }
  return arrived;
}

/** 주어진 카메라 상태로 화면 중앙 대비 별의 오차를 잰다. */
function screenOffset(point: { x: number; y: number; z: number }, camera: Camera) {
  const vp: Viewport = {
    width: 1000,
    height: 1000,
    focal: focalFor(1000, 1000),
    ...camera.state,
  };
  const p = project(point, vp);
  return { dx: p.sx - vp.width / 2, dy: p.sy - vp.height / 2, visible: p.visible };
}

describe('각도 보간', () => {
  it('최단 방향을 고른다 (한 바퀴 돌지 않는다)', () => {
    // 350° → 10° 는 +20° 가 최단이다. 그냥 빼면 -340° 로 역주행한다.
    const from = (350 * Math.PI) / 180;
    const to = (10 * Math.PI) / 180;
    expect(shortestAngle(from, to)).toBeCloseTo((20 * Math.PI) / 180, 6);
  });

  it('반대 방향도 대칭으로 처리한다', () => {
    const from = (10 * Math.PI) / 180;
    const to = (350 * Math.PI) / 180;
    expect(shortestAngle(from, to)).toBeCloseTo((-20 * Math.PI) / 180, 6);
  });

  it('lerpAngle 은 경계를 넘어도 짧게 간다', () => {
    const from = Math.PI - 0.1;
    const to = -Math.PI + 0.1;
    const mid = lerpAngle(from, to, 0.5);
    // 중간값은 ±π 근처여야 한다 (0 근처로 가로지르면 역주행이다)
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.05);
  });
});

describe('aimAt', () => {
  it('별 방향의 바깥쪽에 카메라를 세운다', () => {
    const star = { x: 0, y: 0, z: 0.8 };
    const target = aimAt(star);
    expect(target.distance).toBeCloseTo(0.8 + FOCUS_APPROACH, 6);
  });

  it('조준하면 별이 화면 중앙에 온다', () => {
    const camera = new Camera();
    const samples = [
      { x: 0.7, y: 0.1, z: 0.3 },
      { x: -0.5, y: -0.12, z: 0.6 },
      { x: 0.2, y: 0.05, z: -0.75 },
      { x: -0.8, y: 0, z: -0.2 },
    ];

    for (const star of samples) {
      camera.snapTo(aimAt(star));
      const { dx, dy, visible } = screenOffset(star, camera);
      expect(visible, JSON.stringify(star)).toBe(true);
      // 정확히 중앙이어야 한다 — 고도를 틀면 그만큼 별이 밀려난다.
      expect(Math.abs(dx), JSON.stringify(star)).toBeLessThan(1);
      expect(Math.abs(dy), JSON.stringify(star)).toBeLessThan(1);
    }
  });

  it('원점 근처에서도 터지지 않는다', () => {
    const target = aimAt({ x: 0, y: 0, z: 0 });
    expect(Number.isFinite(target.yaw)).toBe(true);
    expect(Number.isFinite(target.pitch)).toBe(true);
    expect(Number.isFinite(target.distance)).toBe(true);
  });
});

describe('Camera 비행', () => {
  it('시작 상태는 은하 전체가 보이는 거리와 고도다', () => {
    const camera = new Camera();
    expect(camera.state.distance).toBeCloseTo(DEFAULT_DISTANCE, 6);
    expect(camera.state.pitch).toBeCloseTo(DEFAULT_PITCH, 6);
  });

  it('비행 시간이 지나면 목표 궤도에 정확히 도달한다', () => {
    const camera = new Camera();
    const target = aimAt({ x: 0.62, y: 0.1, z: -0.31 });

    camera.flyTo(false);
    const arrived = advance(camera, target, FLIGHT_DURATION + 0.1);

    expect(arrived).toBe(true);
    expect(camera.state.yaw).toBeCloseTo(target.yaw, 4);
    expect(camera.state.pitch).toBeCloseTo(target.pitch, 4);
    expect(camera.state.distance).toBeCloseTo(target.distance, 4);
  });

  it('도착 통지는 한 번만 발생한다', () => {
    const camera = new Camera();
    camera.flyTo(false);
    const target = aimAt({ x: 0.5, y: 0, z: 0.2 });

    let arrivals = 0;
    for (let t = 0; t < FLIGHT_DURATION + 1; t += 1 / 60) {
      if (camera.update(target, 1 / 60)) arrivals += 1;
    }
    expect(arrivals).toBe(1);
  });

  it('비행 중간에는 아직 도달하지 않는다', () => {
    const camera = new Camera();
    camera.flyTo(false);
    const target = aimAt({ x: 0.9, y: 0, z: 0 });
    advance(camera, target, FLIGHT_DURATION * 0.35);

    expect(camera.flying).toBe(true);
    expect(camera.state.distance).toBeGreaterThan(target.distance);
  });

  it('reduced-motion 에서는 훨씬 빨리 착지한다', () => {
    const camera = new Camera();
    camera.flyTo(true);
    const target = aimAt({ x: 0.5, y: 0.2, z: 0.1 });
    const arrived = advance(camera, target, FLIGHT_DURATION_REDUCED + 0.02);

    expect(arrived).toBe(true);
    expect(FLIGHT_DURATION_REDUCED).toBeLessThan(FLIGHT_DURATION / 4);
  });

  it('★ 자전하는 별을 계속 따라간다 (고정 좌표로 조준하면 놓친다)', () => {
    const camera = new Camera();
    const coord = { x: 0.7, y: 0.1, z: 0.3 };
    let spin = 0;

    camera.flyTo(false);
    // 비행 내내 은하가 자전한다 — 매 프레임 목표를 다시 계산한다.
    for (let t = 0; t < FLIGHT_DURATION + 0.5; t += 1 / 60) {
      spin += SPIN_SPEED / 60;
      camera.update(aimAt(spinPoint(coord, spin)), 1 / 60);
    }

    // 도착 후에도 별은 화면 중앙 부근에 머문다.
    const { dx, visible } = screenOffset(spinPoint(coord, spin), camera);
    expect(visible).toBe(true);
    expect(Math.abs(dx)).toBeLessThan(3);
  });

  it('포커스를 놓으면 기본 거리·고도로 돌아온다', () => {
    const camera = new Camera();
    camera.flyTo(false);
    advance(camera, aimAt({ x: 0.8, y: 0.1, z: 0.4 }), FLIGHT_DURATION + 0.1);

    camera.flyTo(false);
    advance(camera, null, FLIGHT_DURATION + 0.1);

    expect(camera.state.distance).toBeCloseTo(DEFAULT_DISTANCE, 3);
    expect(camera.state.pitch).toBeCloseTo(DEFAULT_PITCH, 3);
  });

  it('포커스가 없으면 천천히 선회한다', () => {
    const camera = new Camera();
    camera.snapTo({ yaw: 0, pitch: DEFAULT_PITCH, distance: DEFAULT_DISTANCE });
    advance(camera, null, 2);

    expect(camera.state.yaw).toBeGreaterThan(0);
  });

  it('snapTo 는 즉시 착지시킨다', () => {
    const camera = new Camera();
    camera.snapTo({ yaw: 0.3, pitch: -0.2, distance: 2 });
    expect(camera.flying).toBe(false);
    expect(camera.state).toEqual({ yaw: 0.3, pitch: -0.2, distance: 2 });
  });
});

describe('드래그로 시점 돌리기', () => {
  it('끈 만큼 방위각이 돌아간다', () => {
    const camera = new Camera();
    const before = camera.view.yaw;
    camera.drag(0.25, 0);
    expect(camera.view.yaw - before).toBeCloseTo(DRAG_YAW_PER_WIDTH * 0.25, 6);
  });

  it('고도는 뒤집히지 않는다 (짐벌락 방지)', () => {
    const camera = new Camera();
    for (let i = 0; i < 40; i += 1) camera.drag(0, 1);
    expect(Math.abs(camera.view.pitch)).toBeLessThan(Math.PI / 2);

    for (let i = 0; i < 80; i += 1) camera.drag(0, -1);
    expect(Math.abs(camera.view.pitch)).toBeLessThan(Math.PI / 2);
  });

  it('state 는 오프셋 이전 값을 그대로 둔다', () => {
    // 두 값을 한 변수에 섞으면 "사용자가 돌려 둔 만큼"을 되돌릴 수 없다.
    const camera = new Camera();
    const before = camera.state.yaw;
    camera.drag(0.3, 0.1);
    expect(camera.state.yaw).toBe(before);
    expect(camera.view.yaw).not.toBe(before);
  });

  it('★ 별로 날아가면 돌려 둔 각도가 사라진다', () => {
    // 남아 있으면 고른 별이 화면 중앙에서 그만큼 밀린 채로 도착한다.
    const camera = new Camera();
    camera.drag(0.4, 0.2);
    expect(camera.dragged).toBe(true);

    camera.flyTo(false);
    expect(camera.dragged).toBe(false);
  });

  it('비행 시작 순간에는 화면이 튀지 않는다', () => {
    const camera = new Camera();
    camera.drag(0.4, 0.2);
    const seen = { ...camera.view };

    camera.flyTo(false);
    expect(camera.view.yaw).toBeCloseTo(seen.yaw, 6);
    expect(camera.view.pitch).toBeCloseTo(seen.pitch, 6);
  });

  it('★ 드래그한 뒤에도 목표 별은 정확히 중앙에 도착한다', () => {
    const coord = { x: 0.62, y: 0.05, z: -0.3 };
    const camera = new Camera();
    camera.drag(0.45, -0.2);

    camera.flyTo(false);
    advance(camera, aimAt(coord), FLIGHT_DURATION + 0.4);

    const { dx, dy, visible } = screenOffset(coord, camera);
    expect(visible).toBe(true);
    expect(Math.hypot(dx, dy)).toBeLessThan(1);
  });

  it('목표가 없으면 돌려 둔 각도를 아주 천천히 놓아 준다', () => {
    const camera = new Camera();
    camera.drag(0.5, 0);
    const right = camera.view.yaw - camera.state.yaw;

    // 1초로는 거의 그대로 — 손 떼자마자 튕겨 돌아가면 조작감이 무너진다.
    advance(camera, null, 1);
    const afterOneSecond = camera.view.yaw - camera.state.yaw;
    expect(afterOneSecond).toBeGreaterThan(right * 0.6);

    // 충분히 오래 두면 자동 선회로 돌아온다.
    advance(camera, null, 40);
    expect(Math.abs(camera.view.yaw - camera.state.yaw)).toBeLessThan(Math.abs(right) * 0.1);
  });
});

describe('은하 조준', () => {
  it('중심 은하는 방위각을 유지하고 거리만 맞춘다', () => {
    // 원점에는 방향이 없다 — 0 벡터를 정규화하면 각도가 쓰레기가 된다.
    const target = aimAtGalaxy({ x: 0, y: 0, z: 0 }, 1, 1.234);
    expect(target.yaw).toBe(1.234);
    expect(Number.isFinite(target.pitch)).toBe(true);
    expect(target.distance).toBeGreaterThan(1);
  });

  it('위성 은하는 그 방향으로 돌아가 화면 중앙에 담는다', () => {
    const center = { x: 2.45, y: 0, z: 0 };
    const camera = new Camera();
    camera.snapTo(aimAtGalaxy(center, 0.4, 0));
    advance(camera, aimAtGalaxy(center, 0.4, 0), 0.1);

    const { dx, dy, visible } = screenOffset(center, camera);
    expect(visible).toBe(true);
    expect(Math.hypot(dx, dy)).toBeLessThan(1);
  });

  it('작은 은하일수록 가까이 간다', () => {
    const center = { x: 2.45, y: 0, z: 0 };
    const near = aimAtGalaxy(center, 0.4, 0);
    const far = aimAtGalaxy(center, 1, 0);
    expect(near.distance).toBeLessThan(far.distance);
  });
});

/*
 * 실제로 났던 버그:
 *   엔진은 그릴 때 카메라 거리를 SETTLED_SCALE(0.62)로 나눈다. 그런데 조준
 *   거리에는 그 배율을 곱하지 않아, 나눗셈이 그대로 남았다. 원점에서 멀수록
 *   오차가 커져 중심 은하의 별은 1.2 앞에, 위성 은하의 별은 2.8 뒤에 섰다.
 *   게다가 다가서는 거리가 상수라, 반지름 0.4 인 위성은 같은 자리에 서도
 *   화면을 2.5배 덜 채웠다. → "애매하게 확대되는" 느낌.
 */
describe('별에 도착했을 때의 구도', () => {
  const DRAW_SCALE = 0.62; // introTimeline 의 SETTLED_SCALE

  /** 엔진과 같은 순서로 계산한, 도착 시점에 별까지 남는 거리. */
  function gapOnArrival(worldLength: number, galaxyScale: number): number {
    const point = { x: 0, y: 0, z: worldLength };
    const target = aimAt(point, FOCUS_APPROACH * galaxyScale);
    // 엔진: 목표에 배율을 곱해 두고, 그릴 때 다시 나눈다.
    const drawn = (target.distance * DRAW_SCALE) / DRAW_SCALE;
    return drawn - worldLength;
  }

  it('★ 원점에서 얼마나 먼 별이든 같은 거리 앞에 선다', () => {
    const near = gapOnArrival(0.35, 1);
    const outer = gapOnArrival(0.86, 1);
    expect(outer).toBeCloseTo(near, 6);
  });

  it('★ 어느 은하로 들어가든 은하가 화면을 같은 비율로 채운다', () => {
    // 은하각 = 은하 반지름 / 남은 거리. 이게 같아야 같은 구도로 도착한다.
    const centre = 1 / gapOnArrival(0.35, 1);
    const satellite = 0.4 / gapOnArrival(2.9, 0.4);
    expect(satellite).toBeCloseTo(centre, 6);
  });

  it('작은 은하일수록 더 가까이 다가선다', () => {
    expect(gapOnArrival(2.9, 0.4)).toBeLessThan(gapOnArrival(0.35, 1));
  });

  it('★ 배율을 곱하지 않으면 먼 별일수록 뒤에 선다 (고치기 전의 동작)', () => {
    // 고치기 전: 다가서는 거리가 0.62 상수였고, 배율을 곱하지 않았다.
    const OLD_APPROACH = 0.62;
    const broken = (worldLength: number) => {
      const target = aimAt({ x: 0, y: 0, z: worldLength }, OLD_APPROACH);
      return target.distance / DRAW_SCALE - worldLength;
    };

    // 중심 은하의 별은 1.2 앞, 위성 은하의 별은 2.8 뒤 — 2배 넘게 벌어졌다.
    expect(broken(2.9)).toBeGreaterThan(broken(0.35) * 2);

    // 지금은 은하 크기까지 반영해 그 차이가 뒤집힌다 (위성이 더 가까이 간다).
    expect(gapOnArrival(2.9, 0.4)).toBeLessThan(gapOnArrival(0.35, 1));
  });
});
