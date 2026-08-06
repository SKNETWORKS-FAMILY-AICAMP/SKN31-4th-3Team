/*
 * galaxy/emblemField.test.ts
 *
 * ★ 여기서 잡아야 하는 고장
 *   - 어떤 은하만 상징이 안 서고 별이 그대로 있음
 *   - 별 여럿이 한 점에 겹쳐 상징이 성기게 보임
 *   - 볼 때마다 배정이 달라져 "그 은하의 상징"이 아니게 됨
 *   - 좌표가 상자를 벗어나 별 하나가 성운 밖으로 튐
 */

import { describe, expect, it } from 'vitest';

import { ALL_GALAXIES } from '../data/disciples';
import { EMBLEMS } from '../data/emblems';
import { buildEmblemField, domeDepth, EMBLEM_RADIUS, type EmblemStar } from './emblemField';

const IDS = ALL_GALAXIES.map((g) => g.id);

/** 은하 하나에 별 n개를 나선처럼 흩어 놓는다. */
function starsFor(node: number, n: number, offset = 0): EmblemStar[] {
  return Array.from({ length: n }, (_, i) => {
    const r = 0.32 + 0.54 * Math.sqrt((i + 0.5) / n);
    const a = i * 2.399 + offset;
    return { node, x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
}

describe('상징 배정', () => {
  it('열세 은하 전부 배정된다', () => {
    /*
     * ★ 하나라도 빠지면 그 은하만 별이 그대로 있는다.
     *   화면에서는 "왜 여기만 안 변하지" 로 보이고 원인을 찾기 어렵다.
     */
    const stars = IDS.flatMap((_, node) => starsFor(node, 40));
    const field = buildEmblemField(stars, IDS);

    for (let node = 0; node < IDS.length; node += 1) {
      const mine = stars
        .map((s, i) => [s, i] as const)
        .filter(([s]) => s.node === node)
        .map(([, i]) => i);
      const placed = mine.filter((i) => field.has[i] === 1).length;
      expect(placed, `${IDS[node]} 에 배정된 별이 없음`).toBe(mine.length);
    }
  });

  it('좌표가 상징 반경 안에 있다', () => {
    const stars = IDS.flatMap((_, node) => starsFor(node, 60));
    const field = buildEmblemField(stars, IDS);

    for (let i = 0; i < stars.length; i += 1) {
      // 겹친 점에 주는 흔들림까지 감안해 아주 조금 여유를 둔다
      expect(Math.abs(field.u[i])).toBeLessThanOrEqual(EMBLEM_RADIUS * 1.2);
      expect(Math.abs(field.v[i])).toBeLessThanOrEqual(EMBLEM_RADIUS * 1.2);
    }
  });

  it('별이 적어도 윤곽이 먼저 채워진다', () => {
    /*
     * ★ 윤곽이 성기면 무슨 모양인지 알 수 없다.
     *   속은 비어도 형태는 읽히지만, 반대는 성립하지 않는다.
     *   윤곽 점은 상자의 가장자리 쪽에 몰려 있으므로, 배정된 좌표의
     *   평균 반경이 충분히 커야 한다.
     */
    const stars = starsFor(0, 24);
    const field = buildEmblemField(stars, IDS);

    const radii = stars.map((_, i) => Math.hypot(field.u[i], field.v[i]));
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    expect(mean).toBeGreaterThan(EMBLEM_RADIUS * 0.25);
  });

  it('같은 입력이면 같은 배정이 나온다', () => {
    const stars = starsFor(3, 50);
    const a = buildEmblemField(stars, IDS);
    const b = buildEmblemField(stars, IDS);
    expect(Array.from(a.u)).toEqual(Array.from(b.u));
    expect(Array.from(a.v)).toEqual(Array.from(b.v));
  });

  it('별이 점보다 많아도 같은 자리에 겹치지 않는다', () => {
    /*
     * ★ 정확히 같은 좌표에 두 별이 서면 한 별이 사라진 것처럼 보인다.
     *   상징 점(80~700)보다 별이 많은 은하가 생길 수 있으므로
     *   다시 쓰는 점에는 흔들림이 들어가야 한다.
     */
    const emblem = EMBLEMS[0];
    const n = emblem.points.length + 60;
    const stars = starsFor(0, n);
    const field = buildEmblemField(stars, IDS);

    const seen = new Set(
      stars.map((_, i) => `${field.u[i].toFixed(5)},${field.v[i].toFixed(5)}`),
    );
    expect(seen.size).toBe(n);
  });

  it('상징이 없는 은하는 조용히 건너뛴다', () => {
    // 은하가 늘었는데 상징을 아직 안 만든 경우다. 던지면 하늘이 통째로 죽는다.
    const stars = starsFor(0, 10);
    const field = buildEmblemField(stars, ['없는_은하']);
    expect(Array.from(field.has)).toEqual(Array(10).fill(0));
  });

  it('별이 없는 은하가 있어도 나머지는 배정된다', () => {
    const stars = [...starsFor(0, 20), ...starsFor(2, 20)];
    const field = buildEmblemField(stars, IDS);
    expect(Array.from(field.has).every((h) => h === 1)).toBe(true);
  });

  it('은하가 섞여 있어도 서로의 상징을 침범하지 않는다', () => {
    /*
     * 버퍼는 은하별로 정렬돼 있지 않다. 인덱스를 잘못 다루면 한 은하의
     * 별이 다른 은하의 상징으로 날아간다 — 화면에서는 별이 은하 사이를
     * 가로지르는 것으로 보인다.
     */
    const a = starsFor(0, 30);
    const b = starsFor(5, 30, 1.1);
    const mixed: EmblemStar[] = [];
    for (let i = 0; i < 30; i += 1) mixed.push(a[i], b[i]);

    const field = buildEmblemField(mixed, IDS);
    const only = buildEmblemField(a, IDS);

    // 0번 은하 별만 뽑아 좌표 집합을 비교한다 (짝짓는 순서는 같아야 한다)
    const fromMixed = mixed
      .map((s, i) => (s.node === 0 ? `${field.u[i].toFixed(5)}` : null))
      .filter(Boolean)
      .sort();
    const alone = a.map((_, i) => `${only.u[i].toFixed(5)}`).sort();
    expect(fromMixed).toEqual(alone);
  });

  it('화면 위가 +v 다', () => {
    /*
     * ★ 부호를 뒤집으면 상징이 통째로 뒤집힌다.
     *   십자가나 X 십자가는 위아래가 거의 대칭이라 티가 안 난다. 밀알로
     *   본다 — 낟알은 위(y 0.16)에 짧게 있고 뿌리는 아래(y 0.96)로 깊이
     *   뻗으므로, 아래쪽 뻗음이 위쪽보다 확실히 커야 맞다.
     */
    const node = IDS.indexOf('judas');
    expect(node).toBeGreaterThanOrEqual(0);

    const stars = starsFor(node, 300);
    const field = buildEmblemField(stars, IDS);
    const vs = stars.map((_, i) => field.v[i]);

    expect(Math.min(...vs)).toBeLessThan(-0.75);
    expect(Math.max(...vs)).toBeLessThan(0.72);
  });

  describe('앵커 — 별자리의 밝은 별', () => {
    it('열 개 안팎만 고른다', () => {
      /*
       * ★ 윤곽을 다 잇던 것을 걷어 낸 자리다.
       *   짧은 선 아흔 개가 형태를 빽빽하게 두르니 별자리가 아니라 도형에
       *   두른 철사가 됐다. 실제 별자리는 밝은 별 열 개 안팎만 잇는다.
       */
      for (const emblem of EMBLEMS) {
        const node = IDS.indexOf(emblem.galaxyId);
        const field = buildEmblemField(starsFor(node, 150), IDS);
        const count = Array.from(field.anchor).filter((a) => a === 1).length;
        expect(count, `${emblem.galaxyId} 앵커 ${count}개`).toBeGreaterThanOrEqual(9);
        expect(count, `${emblem.galaxyId} 앵커 ${count}개`).toBeLessThanOrEqual(16);
      }
    });

    it('한쪽에 뭉치지 않는다', () => {
      /*
       * ★ 무작위로 뽑으면 뭉치고, 순번으로 뽑으면 한 방향으로 늘어선다.
       *   앵커가 형태 전체에 퍼져 있어야 선이 형태를 대표한다.
       *   가장 먼 점 고르기(farthest-point sampling)를 쓴 이유다.
       */
      for (const emblem of EMBLEMS) {
        const node = IDS.indexOf(emblem.galaxyId);
        const field = buildEmblemField(starsFor(node, 150), IDS);
        const at = Array.from(field.anchor)
          .map((a, i) => (a === 1 ? i : -1))
          .filter((i) => i >= 0);

        const us = at.map((i) => field.u[i]);
        const vs = at.map((i) => field.v[i]);
        const spanU = Math.max(...us) - Math.min(...us);
        const spanV = Math.max(...vs) - Math.min(...vs);
        expect(spanU + spanV, `${emblem.galaxyId} 앵커가 뭉쳤다`).toBeGreaterThan(1.2);
      }
    });

    it('앵커는 상징 좌표를 가진 별이다', () => {
      const field = buildEmblemField(starsFor(0, 100), IDS);
      for (let i = 0; i < field.anchor.length; i += 1) {
        if (field.anchor[i] === 1) expect(field.has[i]).toBe(1);
      }
    });

    it('같은 입력이면 같은 앵커가 나온다', () => {
      // 볼 때마다 다른 별이 밝으면 "그 은하의 별자리" 라고 할 수 없다
      const stars = starsFor(6, 120);
      const a = buildEmblemField(stars, IDS);
      const b = buildEmblemField(stars, IDS);
      expect(Array.from(a.anchor)).toEqual(Array.from(b.anchor));
    });
  });

  describe('두께 — 돌렸을 때 입체로 보이게 하는 것', () => {
    it('★ 앞뒤 양쪽으로 흩어진다 (볼록한 판이 아니다)', () => {
      /*
       * ★ 처음에는 가운데가 앞으로 튀어나온 방패였다.
       *   정면에서 보면 가운데만 크고 밝아서, 입체가 아니라 렌즈를
       *   덧댄 것처럼 보였다. 실제 별자리는 앞뒤로 흩어진 별들이다.
       *
       *   앞으로 나온 별과 뒤로 간 별이 둘 다 넉넉히 있어야 한다.
       */
      const field = buildEmblemField(starsFor(0, 200), IDS);
      const ws = Array.from(field.w).filter((_, i) => field.has[i] === 1);
      const front = ws.filter((w) => w > 0.02).length;
      const back = ws.filter((w) => w < -0.02).length;

      expect(front).toBeGreaterThan(ws.length * 0.25);
      expect(back).toBeGreaterThan(ws.length * 0.25);
    });

    it('두께가 형태를 뭉갤 만큼 크지 않다', () => {
      // 두꺼우면 옆에서 볼 때 실루엣이 두 겹으로 보인다
      for (let u = -1; u <= 1; u += 0.05) {
        for (let v = -1; v <= 1; v += 0.05) {
          expect(Math.abs(domeDepth(u, v))).toBeLessThan(EMBLEM_RADIUS * 0.3);
        }
      }
    });

    it('가장자리로 갈수록 상한이 낮아진다', () => {
      /*
       * ★ 실루엣을 만드는 것은 바깥 별이다.
       *   그것들까지 크게 흩으면 윤곽이 두 겹으로 갈라져 형태가 흐려진다.
       *
       *   "바깥이 항상 더 얕다" 로 검사하지 않는다 — 깊이는 물결이라
       *   자리에 따라 오르내리고, 어떤 바깥 점이 어떤 안쪽 점보다 깊을
       *   수 있다. 검사할 것은 그 자리에서 허용되는 최대치다.
       */
      for (let u = -1; u <= 1; u += 0.037) {
        for (let v = -1; v <= 1; v += 0.037) {
          const r = Math.min(1, Math.hypot(u, v) / EMBLEM_RADIUS);
          const cap = 0.26 * EMBLEM_RADIUS * (1 - r * 0.45);
          expect(Math.abs(domeDepth(u, v))).toBeLessThanOrEqual(cap + 1e-9);
        }
      }
    });

    it('같은 자리는 언제나 같은 깊이다', () => {
      // 난수를 쓰면 볼 때마다 배치가 달라져 "그 은하의 별자리" 가 아니게 된다
      expect(domeDepth(0.3, -0.4)).toBe(domeDepth(0.3, -0.4));
      const a = buildEmblemField(starsFor(5, 120), IDS);
      const b = buildEmblemField(starsFor(5, 120), IDS);
      expect(Array.from(a.w)).toEqual(Array.from(b.w));
    });

    it('전부 평면은 아니다', () => {
      const field = buildEmblemField(starsFor(3, 120), IDS);
      const spread = Math.max(...field.w) - Math.min(...field.w);
      expect(spread).toBeGreaterThan(0.1);
    });
  });

  describe('형태를 두르는 선', () => {
    it('은하마다 선이 생긴다', () => {
      /*
       * ★ 선이 없으면 150개 점만 남는다.
       *   밤하늘의 별자리도 점만으로는 안 보이고, 선을 그어야 곰이 된다.
       */
      for (const emblem of EMBLEMS) {
        const node = IDS.indexOf(emblem.galaxyId);
        const field = buildEmblemField(starsFor(node, 150), IDS);
        const pairs = field.links.length / 2;
        expect(pairs, `${emblem.galaxyId} 선 ${pairs}개`).toBeGreaterThan(4);
        expect(pairs, `${emblem.galaxyId} 선 ${pairs}개`).toBeLessThan(26);
      }
    });

    it('선은 짧다 — 형태를 가로지르지 않는다', () => {
      /*
       * ★ 여기서 잡아야 하는 고장
       *   배정 순서대로 이으면 십자가의 왼쪽 팔과 오른쪽 팔을 잇는 선이
       *   생긴다. 화면에서는 상징 위에 X 자가 하나 더 그어진 것으로 보인다.
       *   실제 좌표에서 가까운 것끼리만 이어야 한다.
       */
      const field = buildEmblemField(starsFor(0, 120), IDS);
      for (let k = 0; k < field.links.length; k += 2) {
        const a = field.links[k];
        const b = field.links[k + 1];
        const d = Math.hypot(field.u[a] - field.u[b], field.v[a] - field.v[b]);
        expect(d).toBeLessThan(EMBLEM_RADIUS * 0.6);
      }
    });

    it('같은 선을 두 번 긋지 않는다', () => {
      // 겹쳐 그으면 그 선만 두 배로 진해져 얼룩이 된다
      const field = buildEmblemField(starsFor(2, 100), IDS);
      const seen = new Set<string>();
      for (let k = 0; k < field.links.length; k += 2) {
        const a = field.links[k];
        const b = field.links[k + 1];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });

    it('선은 배정된 별만 잇는다', () => {
      const field = buildEmblemField(starsFor(4, 90), IDS);
      for (const i of field.links) expect(field.has[i]).toBe(1);
    });

    it('★ 은하마다 자기 구간만 갖는다', () => {
      /*
       * ★ 실제로 났던 고장이다.
       *   links 는 열세 은하의 선을 한 배열에 담는다. 그리는 쪽이 구간을
       *   모르고 전부를 훑었고, 다른 은하 별의 상징 좌표를 지금 은하
       *   중심에 대고 찍었다. 화면에는 상징 뒤로 나머지 열두 개가 겹쳐
       *   깔렸다 — "이상한 밑그림" 의 정체다.
       */
      const N = 100;
      const stars = IDS.flatMap((_, node) => starsFor(node, N));
      const field = buildEmblemField(stars, IDS);

      for (let node = 0; node < IDS.length; node += 1) {
        const from = field.linkRange[node * 2];
        const to = field.linkRange[node * 2 + 1];
        expect(to, `${IDS[node]} 구간이 비어 있음`).toBeGreaterThan(from);

        for (let k = from; k < to; k += 1) {
          const star = field.links[k];
          expect(
            Math.floor(star / N),
            `${IDS[node]} 구간에 다른 은하 별(${star})이 있음`,
          ).toBe(node);
        }
      }
    });

    it('구간이 links 전체를 빠짐없이 덮는다', () => {
      // 틈이 생기면 그 은하의 선 일부가 영영 안 그려진다
      const field = buildEmblemField(
        IDS.flatMap((_, node) => starsFor(node, 80)),
        IDS,
      );
      let cursor = 0;
      for (let node = 0; node < IDS.length; node += 1) {
        expect(field.linkRange[node * 2]).toBe(cursor);
        cursor = field.linkRange[node * 2 + 1];
      }
      expect(cursor).toBe(field.links.length);
    });

    it('별이 아주 적으면 선을 만들지 않는다', () => {
      // 두 점 사이 한 줄은 형태가 아니라 그냥 막대다
      const field = buildEmblemField(starsFor(0, 2), IDS);
      expect(field.links.length).toBe(0);
    });
  });

  it('상징의 세로 범위를 넘어서지 않는다', () => {
    /*
     * 상징 데이터의 y 범위를 그대로 옮겼는지 본다.
     * 어긋나면 별 몇 개가 형태 밖에 떠 있는 것으로 보인다.
     */
    for (const emblem of EMBLEMS) {
      const node = IDS.indexOf(emblem.galaxyId);
      const stars = starsFor(node, 200);
      const field = buildEmblemField(stars, IDS);

      const ys = emblem.points.map((p) => p.y);
      const top = (0.5 - Math.min(...ys)) * 2 * EMBLEM_RADIUS;
      const bottom = (0.5 - Math.max(...ys)) * 2 * EMBLEM_RADIUS;

      for (let i = 0; i < stars.length; i += 1) {
        expect(field.v[i]).toBeLessThanOrEqual(top + 0.1);
        expect(field.v[i]).toBeGreaterThanOrEqual(bottom - 0.1);
      }
    }
  });
});
