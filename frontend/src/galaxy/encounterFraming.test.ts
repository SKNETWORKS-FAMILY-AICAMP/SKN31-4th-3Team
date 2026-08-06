/*
 * galaxy/encounterFraming.test.ts
 *
 * ★ 잡아야 하는 고장: 상징이 화면 밖으로 잘린다.
 *
 *   상징은 카메라를 정면으로 마주 보는 판이다. 은하 원반은 고도 때문에
 *   눌려 보이지만 상징은 안 눌린다 — 그래서 같은 거리에서 은하보다
 *   화면을 더 많이 차지한다. 십자가나 닻처럼 세로로 긴 상징이 먼저 잘린다.
 *
 *   눈으로 확인하려면 매번 브라우저를 띄우고 열세 은하를 다 돌아야 한다.
 *   여기서는 실제 카메라·투영 함수를 그대로 써서 숫자로 확인한다.
 */

import { describe, expect, it } from 'vitest';

import { ALL_GALAXIES } from '../data/disciples';
import { EMBLEMS } from '../data/emblems';
import { aimAtGalaxy } from './Camera';
import { ENCOUNTER_FRAMING } from './GalaxyEngine';
import { EMBLEM_RADIUS } from './emblemField';
import { SATELLITE_SCALE, buildNodes, transformAt } from './system';
import { focalFor, project, type Viewport } from './staticField';

/** 짧은 변의 몇 %까지 써도 되는가. 넘으면 잘릴 위험이 있다. */
const SAFE_FRACTION = 0.42;

function viewportFor(node: ReturnType<typeof buildNodes>[number], w: number, h: number): Viewport {
  const center = transformAt(node, 0).center;
  const aim = aimAtGalaxy(center, node.scale * ENCOUNTER_FRAMING, 0);
  return {
    width: w,
    height: h,
    focal: focalFor(w, h),
    yaw: aim.yaw,
    pitch: aim.pitch,
    distance: aim.distance,
  };
}

/**
 * 상징의 네 귀퉁이가 화면 중앙에서 얼마나 벗어나는가.
 * 상징은 빌보드이므로 화면 축을 그대로 쓴다 — 엔진의 blendToEmblem 과 같은 식이다.
 */
function extentOf(node: ReturnType<typeof buildNodes>[number], w: number, h: number) {
  const vp = viewportFor(node, w, h);
  const center = transformAt(node, 0).center;

  const cosYaw = Math.cos(vp.yaw);
  const sinYaw = Math.sin(vp.yaw);
  const cosPitch = Math.cos(vp.pitch);
  const sinPitch = Math.sin(vp.pitch);

  let dx = 0;
  let dy = 0;
  for (const [u0, v0] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const u = u0 * EMBLEM_RADIUS * node.scale;
    const v = v0 * EMBLEM_RADIUS * node.scale;
    const p = project(
      {
        x: center.x + cosYaw * u + -sinPitch * sinYaw * v,
        y: center.y + cosPitch * v,
        z: center.z + -sinYaw * u + -sinPitch * cosYaw * v,
      },
      vp,
    );
    expect(p.visible).toBe(true);
    dx = Math.max(dx, Math.abs(p.sx - w / 2));
    dy = Math.max(dy, Math.abs(p.sy - h / 2));
  }
  return { dx, dy, short: Math.min(w, h) };
}

describe('조우 프레이밍', () => {
  const nodes = buildNodes();

  it.each([
    ['가로 넓은 화면', 1440, 900],
    ['정사각에 가까운 화면', 900, 900],
    ['세로 긴 화면 (모바일)', 390, 844],
  ])('%s — 상징이 화면 안에 들어온다', (_, w, h) => {
    for (const node of nodes) {
      const { dx, dy, short } = extentOf(node, w, h);
      expect(dx, `${node.galaxy.id} 가로로 넘침`).toBeLessThan(w / 2);
      expect(dy, `${node.galaxy.id} 세로로 넘침`).toBeLessThan(h / 2);
      // 여백까지 확인한다 — 딱 맞으면 글자 하나 들어갈 자리도 없다
      expect(Math.max(dx, dy) / short).toBeLessThan(SAFE_FRACTION);
    }
  });

  it('그래도 충분히 크다 — 물러나기만 하면 안 된다', () => {
    /*
     * ★ 반대 방향 고장.
     *   잘리는 게 무서워 멀리 세우면 상징이 점 뭉치로 보인다.
     *   짧은 변의 절반 이상은 차지해야 형태가 읽힌다.
     */
    for (const node of nodes) {
      const { dx, dy, short } = extentOf(node, 1280, 800);
      expect(Math.max(dx, dy) / short).toBeGreaterThan(0.25);
    }
  });

  it('중심 은하와 위성 은하가 같은 크기로 보인다', () => {
    /*
     * ★ 프레이밍을 은하 크기에 비례시킨 이유.
     *   상수로 두면 반경 0.4 인 위성은 중심 은하보다 2.5배 작게 보인다.
     *   어느 은하로 들어가든 같은 구도로 도착해야 한다.
     */
    const center = extentOf(nodes[0], 1280, 800);
    const satellite = extentOf(nodes[1], 1280, 800);
    expect(nodes[1].scale).toBe(SATELLITE_SCALE);
    expect(satellite.dx / center.dx).toBeGreaterThan(0.85);
    expect(satellite.dx / center.dx).toBeLessThan(1.15);
  });

  it('열세 상징의 실제 세로 길이로도 확인한다', () => {
    /*
     * 위 검사는 상자(-1..1) 기준이다. 상징이 상자를 꽉 채우지 않을 수도
     * 있으므로, 실제 점 좌표로 한 번 더 본다 — 가장 긴 상징이 기준이다.
     */
    const tallest = Math.max(
      ...EMBLEMS.map((e) => {
        const ys = e.points.map((p) => p.y);
        return Math.max(...ys) - Math.min(...ys);
      }),
    );
    // 상자를 거의 다 쓰는 상징이 있어야 위 검사가 의미를 갖는다
    expect(tallest).toBeGreaterThan(0.8);
    expect(EMBLEMS.length).toBe(ALL_GALAXIES.length);
  });
});
