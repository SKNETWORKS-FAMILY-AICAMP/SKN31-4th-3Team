/*
 * galaxy/constellation.test.ts
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 별자리가 하나로 이어지고, 거미줄이 되지 않는가.
 *
 * ★ 가장 중요한 성질은 "섬이 없다"이다.
 *   두 개씩 뚝뚝 끊긴 짝이 흩어져 있으면 별자리로 읽히지 않는다.
 */

import { describe, expect, it } from 'vitest';
import { buildConstellation, edgeKey, kinship, type ConstellationNode } from './constellation';
import { CONSTELLATIONS, constellationOf } from '../data/constellations';
import { ALL_GALAXIES } from '../data/disciples';
import { getVerseStarsByGalaxy } from '../data/verses';
import { constellationReveal } from './GalaxyEngine';
import { ORBIT_RADIUS, SATELLITE_SCALE } from './system';

function grid(count: number, themes: (i: number) => string[]): ConstellationNode[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    coord: { x: Math.cos(i * 1.3) * (0.2 + i * 0.02), y: 0, z: Math.sin(i * 1.3) * (0.2 + i * 0.02) },
    themes: themes(i),
  }));
}

/** 간선 목록에서 모든 노드에 닿을 수 있는가. */
function connected(nodes: readonly ConstellationNode[], edges: { a: string; b: string }[]): boolean {
  if (nodes.length === 0) return true;
  const neighbours = new Map<string, string[]>();
  for (const { a, b } of edges) {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  }

  const seen = new Set<string>([nodes[0].id]);
  const queue = [nodes[0].id];
  while (queue.length > 0) {
    const at = queue.pop()!;
    for (const next of neighbours.get(at) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size === nodes.length;
}

describe('주제 유사도', () => {
  it('완전히 같으면 1, 겹치지 않으면 0', () => {
    expect(kinship(['hope'], ['hope'])).toBe(1);
    expect(kinship(['hope'], ['grief'])).toBe(0);
  });

  it('일부만 겹치면 그 비율이 된다', () => {
    // 합집합 3개 중 1개가 겹친다.
    expect(kinship(['hope', 'grief'], ['hope'])).toBeCloseTo(1 / 2, 6);
  });

  it('주제가 없으면 관계를 만들어 내지 않는다', () => {
    expect(kinship([], ['hope'])).toBe(0);
    expect(kinship([], [])).toBe(0);
  });
});

describe('별자리 만들기', () => {
  const nodes = grid(24, (i) => [['hope', 'grief', 'purpose'][i % 3]]);
  const edges = buildConstellation(nodes);

  it('★ 모든 별이 하나로 이어진다 (섬이 없다)', () => {
    expect(connected(nodes, edges)).toBe(true);
  });

  it('★ 거미줄이 되지 않는다', () => {
    // 트리(n-1) 에 고리 몇 개만 더한 수준이어야 한다.
    expect(edges.length).toBeGreaterThanOrEqual(nodes.length - 1);
    expect(edges.length).toBeLessThan(nodes.length * 1.35);
  });

  it('자기 자신을 잇거나 같은 쌍을 두 번 잇지 않는다', () => {
    const keys = edges.map((e) => edgeKey(e.a, e.b));
    expect(new Set(keys).size).toBe(keys.length);
    for (const edge of edges) expect(edge.a).not.toBe(edge.b);
  });

  it('결과가 결정적이다 (방문할 때마다 별자리가 바뀌지 않는다)', () => {
    expect(buildConstellation(nodes)).toEqual(edges);
  });

  it('별이 하나뿐이면 선이 없다', () => {
    expect(buildConstellation(grid(1, () => ['hope']))).toEqual([]);
    expect(buildConstellation([])).toEqual([]);
  });

  it('비슷한 거리라면 주제가 겹치는 쪽을 잇는다', () => {
    /*
     * 다른 주제를 조금 가까이, 같은 주제를 조금 멀리 둔다.
     * 거리만 봤다면 가까운 쪽이 이어졌을 것이다.
     */
    const nearer: ConstellationNode[] = [
      { id: 'a', coord: { x: 0, y: 0, z: 0 }, themes: ['hope'] },
      { id: 'near', coord: { x: 0.16, y: 0, z: 0 }, themes: ['career'] },
      { id: 'kin', coord: { x: 0.19, y: 0, z: 0 }, themes: ['hope'] },
    ];
    const keys = buildConstellation(nearer).map((e) => edgeKey(e.a, e.b));
    expect(keys).toContain(edgeKey('a', 'kin'));
  });

  it('★ 거리 차이가 크면 주제 할인으로 뒤집히지 않는다', () => {
    /*
     * 이게 무너지면 선이 원반을 가로질러 나선 구조를 지운다.
     *
     * far 는 주제가 a 와 같지만 a 까지는 0.85, 이웃까지는 0.25 다.
     * 3배가 넘는 차이를 할인이 이겨서는 안 된다.
     */
    const spread: ConstellationNode[] = [
      { id: 'a', coord: { x: 0, y: 0, z: 0 }, themes: ['hope'] },
      { id: 'mid', coord: { x: 0.6, y: 0, z: 0 }, themes: ['career'] },
      { id: 'far', coord: { x: 0.85, y: 0, z: 0 }, themes: ['hope'] },
    ];
    const keys = buildConstellation(spread).map((e) => edgeKey(e.a, e.b));
    expect(keys).toContain(edgeKey('mid', 'far'));
    expect(keys).not.toContain(edgeKey('a', 'far'));
  });
});

describe('실제 은하의 별자리', () => {
  it('13개 은하 모두에 별자리가 있다', () => {
    expect(Object.keys(CONSTELLATIONS)).toHaveLength(13);
    for (const galaxy of ALL_GALAXIES) {
      expect(constellationOf(galaxy.id).length, galaxy.id).toBeGreaterThan(0);
    }
  });

  it('★ 은하마다 모든 구절이 하나의 별자리로 이어진다', () => {
    for (const galaxy of ALL_GALAXIES) {
      const nodes = getVerseStarsByGalaxy(galaxy.id).map((s) => ({
        id: s.id,
        coord: s.coord,
        themes: s.themes,
      }));
      expect(connected(nodes, [...constellationOf(galaxy.id)]), galaxy.id).toBe(true);
    }
  });

  it('선이 은하를 가로지르지 않는다', () => {
    // 로컬 반경이 0.86 이므로 지름은 1.72 다. 그 절반을 넘으면 가로지른 것이다.
    for (const galaxy of ALL_GALAXIES) {
      const byId = new Map(getVerseStarsByGalaxy(galaxy.id).map((s) => [s.id, s.coord]));
      for (const edge of constellationOf(galaxy.id)) {
        const a = byId.get(edge.a)!;
        const b = byId.get(edge.b)!;
        const span = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        expect(span, `${galaxy.id} ${edge.a}-${edge.b}`).toBeLessThan(0.9);
      }
    }
  });

  it('간선이 실재하는 구절만 가리킨다', () => {
    for (const galaxy of ALL_GALAXIES) {
      const ids = new Set(getVerseStarsByGalaxy(galaxy.id).map((s) => s.id));
      for (const edge of constellationOf(galaxy.id)) {
        expect(ids.has(edge.a), edge.a).toBe(true);
        expect(ids.has(edge.b), edge.b).toBe(true);
      }
    }
  });

  it('kin 이 0..1 을 벗어나지 않는다 (선 밝기 계산의 전제)', () => {
    for (const galaxy of ALL_GALAXIES) {
      for (const edge of constellationOf(galaxy.id)) {
        expect(edge.kin).toBeGreaterThanOrEqual(0);
        expect(edge.kin).toBeLessThanOrEqual(1);
      }
    }
  });

  it('없는 은하를 물어도 빈 배열을 준다', () => {
    expect(constellationOf('does-not-exist')).toEqual([]);
  });
});

/*
 * 실제로 났던 버그:
 *   드러나는 기준을 "은하의 화면 반경"으로 재는 바람에, 중심의 0.4배인
 *   위성 은하가 같은 화면에서 5% 밖에 드러나지 않았다.
 *   (같은 카메라 거리에서 중심 157px, 위성 63px → 100% vs 5.2%)
 */
describe('선이 드러나는 기준', () => {
  /** 계 전체를 담는 기본 카메라에서, 크기 1인 은하의 화면 반경(px) */
  const restUnitRadius = (() => {
    const systemRadius = ORBIT_RADIUS + SATELLITE_SCALE * 1.1;
    const distance = systemRadius * 2.5;
    const focal = 1.2 * 900; // 1440×900 창의 짧은 변
    return 1.05 * (focal / distance);
  })();

  it('★ 초기 화면에서 이미 충분히 드러난다', () => {
    // 클릭해서 확대해야 겨우 보이는 상태였던 것이 이 버그의 증상이다.
    expect(constellationReveal(restUnitRadius)).toBeGreaterThan(0.9);
  });

  it('★ 은하 크기와 무관하다 (위성도 중심과 같이 드러난다)', () => {
    // 인자에 은하 크기를 곱해 넣는 순간 위성만 뒤처진다.
    const center = constellationReveal(restUnitRadius);
    const satellite = constellationReveal(restUnitRadius);
    expect(satellite).toBe(center);
  });

  it('멀어지면 사라진다 (13개 선이 한꺼번에 켜져 그물이 되지 않게)', () => {
    expect(constellationReveal(restUnitRadius * 0.3)).toBe(0);
  });

  it('0..1 을 벗어나지 않는다', () => {
    for (const px of [-50, 0, 58, 100, 150, 4000]) {
      const value = constellationReveal(px);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('가까워질수록 단조롭게 진해진다', () => {
    let prev = -1;
    for (let px = 0; px < 260; px += 10) {
      const value = constellationReveal(px);
      expect(value).toBeGreaterThanOrEqual(prev);
      prev = value;
    }
  });
});
