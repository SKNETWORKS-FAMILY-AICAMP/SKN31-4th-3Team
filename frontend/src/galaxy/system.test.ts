/*
 * galaxy/system.test.ts
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 13개 은하가 서로 겹치지 않고, 각자 자전하며, 중심을 공전하는가.
 * 그리고 제자별 색이 "구분은 되지만 튀지는 않는" 범위에 머무는가.
 */

import { describe, expect, it } from 'vitest';
import {
  ORBIT_PERIOD,
  ORBIT_RADIUS,
  SATELLITE_SCALE,
  SYSTEM_RADIUS,
  buildNodes,
  nodeCenterAt,
  nodeSpinAt,
  toWorld,
  transformAt,
  worldPointOf,
} from './system';
import { rampFor } from './palette';
import { ALL_GALAXIES, CENTER_GALAXY, DISCIPLE_GALAXIES } from '../data/disciples';
import { VERSE_STARS, VERSE_STARS_BY_GALAXY } from '../data/verses';

const nodes = buildNodes();

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('은하 구성', () => {
  it('중심 1 + 제자 12 = 13개다', () => {
    expect(DISCIPLE_GALAXIES).toHaveLength(12);
    expect(ALL_GALAXIES).toHaveLength(13);
    expect(nodes).toHaveLength(13);
  });

  it('중심 노드는 하나뿐이고 예수 그리스도의 은하다', () => {
    const centers = nodes.filter((n) => n.center);
    expect(centers).toHaveLength(1);
    expect(centers[0].galaxy.id).toBe(CENTER_GALAXY.id);
  });

  it('중심 은하만 색이 없다 — 색이 없는 것이 중심으로 읽힌다', () => {
    expect(CENTER_GALAXY.tint).toBeNull();
    for (const galaxy of DISCIPLE_GALAXIES) {
      expect(galaxy.tint, galaxy.id).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('구절 배정 무결성', () => {
  it('모든 구절이 정확히 하나의 은하에 속한다', () => {
    const seen = new Map<string, string[]>();
    for (const galaxy of ALL_GALAXIES) {
      for (const id of galaxy.verseIds) {
        seen.set(id, [...(seen.get(id) ?? []), galaxy.id]);
      }
    }

    for (const star of VERSE_STARS) {
      expect(seen.get(star.id), `${star.id} 가 어느 은하에도 없다`).toHaveLength(1);
    }
  });

  it('은하가 가리키는 구절이 전부 실재한다 (오타 방지)', () => {
    const ids = new Set(VERSE_STARS.map((s) => s.id));
    for (const galaxy of ALL_GALAXIES) {
      for (const id of galaxy.verseIds) {
        expect(ids.has(id), `${galaxy.id} → ${id}`).toBe(true);
      }
    }
  });

  it('정렬 목록이 전체 구절을 빠짐없이 담는다', () => {
    expect(VERSE_STARS_BY_GALAXY).toHaveLength(VERSE_STARS.length);
    expect(new Set(VERSE_STARS_BY_GALAXY.map((s) => s.id)).size).toBe(VERSE_STARS.length);
  });

  it('빈 은하가 없다 — 별 없는 은하는 클릭할 것이 없다', () => {
    for (const galaxy of ALL_GALAXIES) {
      expect(galaxy.verseIds.length, galaxy.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('star.discipleId 가 실제 배정과 일치한다', () => {
    for (const galaxy of ALL_GALAXIES) {
      for (const id of galaxy.verseIds) {
        expect(VERSE_STARS.find((s) => s.id === id)?.discipleId, id).toBe(galaxy.id);
      }
    }
  });
});

describe('공전', () => {
  it('중심 은하는 움직이지 않는다', () => {
    for (const t of [0, 30, 120, 500]) {
      expect(nodeCenterAt(nodes[0], t)).toEqual({ x: 0, y: 0, z: 0 });
    }
  });

  it('한 주기 뒤에 제자리로 돌아온다', () => {
    for (const node of nodes.slice(1)) {
      const a = nodeCenterAt(node, 7);
      const b = nodeCenterAt(node, 7 + ORBIT_PERIOD);
      expect(distance(a, b), node.galaxy.id).toBeLessThan(1e-6);
    }
  });

  it('12개가 고리 위에 흩어져 있다 (한쪽에 몰리지 않는다)', () => {
    const angles = nodes
      .slice(1)
      .map((n) => n.orbitPhase)
      .sort((a, b) => a - b);

    for (let i = 1; i < angles.length; i += 1) {
      // 균등 배치면 간격이 2π/12 ≈ 0.52 다. 절반 아래로 붙으면 뭉친 것이다.
      expect(angles[i] - angles[i - 1]).toBeGreaterThan(0.26);
    }
  });

  it('★ 어느 시점에도 위성끼리 겹치지 않는다', () => {
    // 겹치면 두 은하가 한 덩어리로 보여 "12개"라는 정보가 사라진다.
    const minGap = SATELLITE_SCALE * 2.1;

    for (let t = 0; t < ORBIT_PERIOD; t += ORBIT_PERIOD / 24) {
      const centers = nodes.slice(1).map((n) => nodeCenterAt(n, t));
      for (let i = 0; i < centers.length; i += 1) {
        for (let j = i + 1; j < centers.length; j += 1) {
          expect(distance(centers[i], centers[j]), `t=${t} ${i}-${j}`).toBeGreaterThan(minGap);
        }
      }
    }
  });

  it('위성이 중심 은하를 파고들지 않는다', () => {
    // 중심 은하의 원반 반경은 로컬 1 이 상한이다.
    for (const node of nodes.slice(1)) {
      for (let t = 0; t < ORBIT_PERIOD; t += ORBIT_PERIOD / 16) {
        const center = nodeCenterAt(node, t);
        const gap = Math.hypot(center.x, center.y, center.z) - SATELLITE_SCALE;
        expect(gap, node.galaxy.id).toBeGreaterThan(1);
      }
    }
  });

  it('계 전체가 SYSTEM_RADIUS 안에 들어온다 (카메라 프레이밍 근거)', () => {
    for (const node of nodes) {
      for (let t = 0; t < ORBIT_PERIOD; t += ORBIT_PERIOD / 16) {
        const center = nodeCenterAt(node, t);
        const reach = Math.hypot(center.x, center.y, center.z) + node.scale;
        expect(reach, node.galaxy.id).toBeLessThanOrEqual(SYSTEM_RADIUS + 1e-6);
      }
    }
    expect(SYSTEM_RADIUS).toBeGreaterThan(ORBIT_RADIUS);
  });
});

describe('자전', () => {
  it('모든 은하가 자전한다', () => {
    for (const node of nodes) {
      expect(nodeSpinAt(node, 100), node.galaxy.id).not.toBeCloseTo(nodeSpinAt(node, 0), 3);
    }
  });

  it('★ 위성마다 자전 속도가 달라야 복제한 티가 안 난다', () => {
    const speeds = nodes.slice(1).map((n) => n.spinSpeed);
    expect(new Set(speeds).size).toBeGreaterThan(1);
  });

  it('출발 각도가 서로 다르다', () => {
    const phases = nodes.slice(1).map((n) => n.spinPhase.toFixed(4));
    expect(new Set(phases).size).toBe(phases.length);
  });

  it('자전은 느리다 — 한 바퀴에 최소 2분 이상 걸린다', () => {
    for (const node of nodes) {
      const period = (Math.PI * 2) / node.spinSpeed;
      expect(period, node.galaxy.id).toBeGreaterThan(120);
    }
  });
});

describe('로컬 → 월드 변환', () => {
  it('중심 은하는 자전만 적용된다 (크기 1, 이동 0)', () => {
    const transform = { center: { x: 0, y: 0, z: 0 }, spin: 0, scale: 1 };
    const local = { x: 0.4, y: 0.1, z: -0.7 };
    expect(toWorld(local, transform)).toEqual(local);
  });

  it('자전축은 Y다 — 높이는 변하지 않는다', () => {
    const transform = { center: { x: 0, y: 0, z: 0 }, spin: 1.3, scale: 1 };
    const out = toWorld({ x: 0.5, y: 0.09, z: 0.2 }, transform);
    expect(out.y).toBeCloseTo(0.09, 10);
  });

  it('자전은 원점까지의 거리를 바꾸지 않는다', () => {
    const local = { x: 0.6, y: 0.05, z: -0.3 };
    const before = Math.hypot(local.x, local.z);
    for (const spin of [0.4, 1.9, 4.4]) {
      const out = toWorld(local, { center: { x: 0, y: 0, z: 0 }, spin, scale: 1 });
      expect(Math.hypot(out.x, out.z)).toBeCloseTo(before, 10);
    }
  });

  it('위성의 별은 그 위성 안에 머문다', () => {
    for (const node of nodes.slice(1)) {
      for (const star of VERSE_STARS.filter((s) => s.discipleId === node.galaxy.id)) {
        for (const t of [0, 37, ORBIT_PERIOD / 3]) {
          const world = worldPointOf(node, star.coord, t);
          const center = nodeCenterAt(node, t);
          expect(distance(world, center), star.id).toBeLessThanOrEqual(node.scale + 1e-6);
        }
      }
    }
  });

  it('worldPointOf 와 toWorld(transformAt) 이 같은 값을 준다', () => {
    // 카메라 조준과 그리기가 서로 다른 경로를 쓰므로 반드시 일치해야 한다.
    const node = nodes[5];
    const local = { x: 0.3, y: -0.04, z: 0.62 };
    const t = 12.5;
    expect(worldPointOf(node, local, t)).toEqual(toWorld(local, transformAt(node, t)));
  });
});

describe('제자별 색 램프', () => {
  const channels = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

  /** HSV 의 S — 0 이면 무채색, 1 이면 원색. */
  const saturationOf = (hex: string) => {
    const [r, g, b] = channels(hex);
    const max = Math.max(r, g, b);
    return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
  };

  it('색이 없으면 기본 은백 램프를 그대로 쓴다', () => {
    expect(rampFor(null)).toBe(rampFor(null));
    expect(rampFor(null)[0]).toBe('#f2e9d8');
  });

  it('중심부는 거의 흰색이고 외곽에서 색이 드러난다', () => {
    const ramp = rampFor('#d9a68a');
    const spread = (hex: string) => {
      const [r, g, b] = channels(hex);
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    expect(spread(ramp[ramp.length - 1])).toBeGreaterThan(spread(ramp[0]));
  });

  it('★ 램프가 기준색보다 더 짙어지지 않는다', () => {
    /*
     * 램프의 각 단계는 "기본 은백"과 "제자의 기준색" 사이를 섞은 값이다.
     * 그러니 어느 단계도 두 끝점보다 짙어질 수 없어야 한다 — 없던 채도를
     * 만들어 내면 "성운 사진 정도"라는 색 원칙이 코드에서 사라진다.
     *
     * 섞는 과정의 반올림 때문에 아주 조금은 넘칠 수 있어 여유를 둔다.
     */
    const neutral = rampFor(null);
    for (const galaxy of DISCIPLE_GALAXIES) {
      const base = saturationOf(galaxy.tint!);
      rampFor(galaxy.tint).forEach((hex, index) => {
        const ceiling = Math.max(base, saturationOf(neutral[index]));
        expect(saturationOf(hex), `${galaxy.id} ${hex}`).toBeLessThanOrEqual(ceiling + 0.02);
        // 어두워지면 밤하늘에 묻혀 은하가 아니라 얼룩으로 보인다.
        expect(Math.max(...channels(hex)), `${galaxy.id} ${hex}`).toBeGreaterThan(130);
      });
    }
  });

  it('★ 색이 실제로 더 진해졌다 (12개를 눈으로 구분하려면 필요하다)', () => {
    // 외곽 단계는 기준색 쪽에 충분히 가까워야 한다.
    for (const galaxy of DISCIPLE_GALAXIES) {
      const ramp = rampFor(galaxy.tint);
      const outer = saturationOf(ramp[ramp.length - 1]);
      expect(outer, galaxy.id).toBeGreaterThan(saturationOf(galaxy.tint!) * 0.55);
    }
  });

  it('★ 기준색 자체가 원색이 아니다', () => {
    // 채도 0.45 를 넘어가면 밤하늘 위에서 즉시 촌스러워진다.
    for (const galaxy of DISCIPLE_GALAXIES) {
      expect(saturationOf(galaxy.tint!), galaxy.id).toBeLessThan(0.45);
    }
  });

  it('★ 12개 은하의 색이 서로 구분된다', () => {
    // 가장 색이 진한 바깥 버킷끼리 비교한다.
    const outer = DISCIPLE_GALAXIES.map((g) => {
      const ramp = rampFor(g.tint);
      return { id: g.id, rgb: channels(ramp[ramp.length - 1]) };
    });

    for (let i = 0; i < outer.length; i += 1) {
      for (let j = i + 1; j < outer.length; j += 1) {
        const gap = Math.hypot(
          outer[i].rgb[0] - outer[j].rgb[0],
          outer[i].rgb[1] - outer[j].rgb[1],
          outer[i].rgb[2] - outer[j].rgb[2],
        );
        expect(gap, `${outer[i].id} vs ${outer[j].id}`).toBeGreaterThan(6);
      }
    }
  });

  it('램프 길이는 기본 램프와 같다 (버킷 인덱스를 공유한다)', () => {
    for (const galaxy of DISCIPLE_GALAXIES) {
      expect(rampFor(galaxy.tint)).toHaveLength(rampFor(null).length);
    }
  });
});
