/*
 * galaxy/emblemField.ts
 * ───────────────────────────────────────────────────────────────────────
 * 별을 상징의 어느 점으로 보낼지 정한다.
 *
 * ★ 왜 따로 떼어 놓았나
 *   GalaxyEngine 은 캔버스가 있어야 만들어진다. 그런데 여기서 정하는 것은
 *   순수한 좌표 배정이고, 잘못되면 화면에서 "모양이 뭉개졌다" 로만 보여
 *   원인을 찾기 어렵다. 캔버스 없이 검증할 수 있는 자리에 둔다.
 *
 * ★ 상징은 빌보드다
 *   은하는 자전하고 카메라는 궤도를 돈다. 상징을 은하면(x-z)에 눕히면
 *   기울어져 찌그러지고, 자전하면 옆으로 돌아가 버린다. 그래서 상징은
 *   월드 좌표가 아니라 "화면 오른쪽 · 화면 위" 두 축 위의 2차원 오프셋으로
 *   들고 있다가, 그릴 때 카메라 방향으로 세운다. 어느 각도에서 도착해도
 *   정면으로 보인다.
 *
 * ★ 바깥 별이 윤곽을 맡는다
 *   상징을 알아보게 하는 것은 윤곽이다. 은하에서 바깥쪽에 있던 별을
 *   윤곽으로 보내면 이동 거리가 짧고, 서로 가로지르지 않는다. 안쪽 별은
 *   속을 채운다 — 원래 있던 자리와 역할이 그대로 대응된다.
 */

import type { EmblemPoint } from '../data/emblems';
import { emblemOf } from '../data/emblems';

/**
 * 상징이 차지하는 반경 (은하 로컬 단위).
 *
 * 별이 놓이는 나선 팔의 바깥 끝이 0.86 이다. 그보다 조금 크게 잡아
 * 상징이 성운을 눌러 담은 듯이 아니라 성운을 대신해 서도록 한다.
 */
export const EMBLEM_RADIUS = 0.95;

/** 윤곽으로 볼 가중치 하한. data/emblems.ts 의 OUTLINE 과 맞춘다. */
const OUTLINE_MIN = 0.9;

/**
 * 별이 상징 점보다 많을 때 겹쳐 쓰는 점에 주는 흔들림.
 * 정확히 같은 자리에 두 별이 겹치면 한 별이 사라진 것처럼 보인다.
 */
const DUPLICATE_JITTER = 0.02;

/**
 * 앵커(밝은 별) 하나가 이을 이웃의 최대 수.
 *
 * ★ 2개면 충분하다.
 *   좌우로 하나씩이면 선이 이어지는 길이 된다. 늘리면 삼각형이 겹쳐
 *   그물이 되고, 그러면 별자리가 아니라 그래프 도표로 보인다.
 */
const MAX_LINKS = 2;

/**
 * 이을 거리 — 앵커 사이 평균 간격의 몇 배까지인가.
 *
 * 고정값을 쓰면 은하마다 형태 크기가 달라 어떤 곳은 다 이어지고 어떤
 * 곳은 하나도 안 이어진다. 그 상징의 실제 간격에서 뽑는다.
 */
const LINK_SPAN = 1.75;

/**
 * 앵커 별의 개수 범위.
 *
 * ★ 윤곽을 다 잇지 않는다.
 *   처음에는 윤곽 별 백여 개를 가까운 것끼리 전부 이었다. 짧은 선
 *   아흔 개가 형태를 빽빽하게 두르니, 별자리가 아니라 도형에 두른
 *   철사가 됐다. 실제 별자리는 밝은 별 열 개 안팎만 잇는다 —
 *   나머지는 잇지 않아도 눈이 알아서 채운다.
 */
const ANCHOR_MIN = 9;
const ANCHOR_MAX = 16;

/**
 * 상징의 앞뒤 두께 (상징 반경 대비).
 *
 * ★ 왜 두께가 필요한가
 *   평면으로 두면 천천히 돌려도 종잇장이 흔들리는 것으로 보인다.
 *   앞뒤로 흩어져 있어야 가까운 별과 먼 별이 다른 속도로 움직이고,
 *   그 차이가 곧 입체감이다.
 *
 * ★ 크게 주지 않는다
 *   두꺼우면 옆에서 볼 때 형태가 뭉개진다. 상징은 어느 각도에서도
 *   무엇인지 읽혀야 한다.
 */
const DEPTH_SPREAD = 0.26;

/**
 * 그 자리의 앞뒤 위치.
 *
 * ★ 볼록한 돔이 아니다.
 *   처음에는 가운데가 앞으로 튀어나온 방패로 만들었다. 정면에서 보면
 *   가운데만 크고 밝아서, 입체가 아니라 렌즈를 덧댄 것처럼 보였다.
 *   실제 별자리는 앞뒤로 흩어진 별들이지 볼록한 판이 아니다.
 *
 *   그래서 좌표에서 뽑은 값으로 앞뒤 어느 쪽으로든 흩는다. 정면에서는
 *   평평해 보이고, 돌리면 그때 깊이가 드러난다 — 별자리가 실제로
 *   그렇게 생겼다.
 *
 * ★ 난수를 쓰지 않는다.
 *   볼 때마다 배치가 달라지면 "그 은하의 별자리" 라고 할 수 없다.
 *   좌표를 섞어 만든 값이라 같은 점은 언제나 같은 깊이에 있다.
 */
export function domeDepth(u: number, v: number): number {
  // 서로 다른 주기의 사인 셋을 겹친다 — 규칙이 눈에 잡히지 않는다
  const wave =
    Math.sin(u * 7.13 + v * 3.71) * 0.55 +
    Math.sin(u * 2.39 - v * 5.87) * 0.30 +
    Math.sin(u * 11.7 + v * 9.31) * 0.15;

  /*
   * 가장자리는 조금 얕게 둔다.
   * 실루엣을 만드는 것은 바깥 별이다. 그것들까지 앞뒤로 크게 흩으면
   * 윤곽이 두 겹으로 갈라져 형태가 흐려진다.
   */
  const r = Math.min(1, Math.hypot(u, v) / EMBLEM_RADIUS);
  const damp = 1 - r * 0.45;

  return wave * damp * DEPTH_SPREAD * EMBLEM_RADIUS;
}

/**
 * 별을 윤곽에 몇 할 주는가.
 *
 * ★ 0.66 에서 올렸다.
 *   은하당 별이 150개인데 상징의 점은 200~600개다. 속을 3분의 1이나
 *   채우면 윤곽이 성겨져서, 채운 점들이 형태 안에 흩어진 얼룩으로 보였다
 *   (가리비가 구름이 되고 X 십자가가 점무리가 됐다). 윤곽이 또렷하면
 *   속은 몇 개만 있어도 덩어리로 읽힌다.
 */
const OUTLINE_SHARE = 0.85;

export interface EmblemField {
  /** 화면 오른쪽 방향 오프셋 (-1..1 × EMBLEM_RADIUS) */
  u: Float32Array;
  /** 화면 위 방향 오프셋 */
  v: Float32Array;
  /**
   * 보는 사람 쪽으로 나온 두께.
   *
   * 이 값이 있어야 상징을 조금 돌렸을 때 가까운 별과 먼 별이 다른 속도로
   * 움직인다 — 그 차이가 곧 입체감이다. 0 이면 종잇장이 흔들린다.
   */
  w: Float32Array;
  /** 이 별에 상징 좌표가 배정됐는가 (1/0) */
  has: Uint8Array;
  /**
   * 앵커 별인가 (1/0) — 별자리의 "밝은 별".
   *
   * 선은 이 별들만 잇고, 그릴 때 조금 더 크고 밝게 낸다. 실제 별자리도
   * 밝은 별 몇 개가 형태를 잡고 나머지는 배경으로 남는다.
   */
  anchor: Uint8Array;
  /**
   * 상징을 두르는 선. 별 인덱스 쌍이 나란히 들어간다.
   *
   * ★ 별자리 선(constellations)과 다른 것이다.
   *   그쪽은 구절 사이의 의미 관계이고, 이건 형태를 읽히게 하는 윤곽선이다.
   *   섞으면 변형 중에 두 종류의 선이 겹쳐 무엇도 안 보인다.
   */
  links: Int32Array;
  /**
   * 노드별 links 구간 [시작, 끝). 노드 인덱스 × 2 로 찾는다.
   *
   * ★ 이게 없어서 열세 상징이 한꺼번에 겹쳐 그려졌다.
   *   links 는 열세 은하의 선을 한 배열에 담는다. 구간을 모르면 그리는
   *   쪽이 전부를 훑게 되고, 다른 은하 별의 u·v 를 지금 은하 중심에 대고
   *   찍어 버린다. 화면에는 상징 뒤에 정체 모를 밑그림이 깔린다.
   */
  linkRange: Int32Array;
}

/** 배정에 필요한 별 정보. 은하 로컬 좌표만 본다. */
export interface EmblemStar {
  /** 노드(은하) 인덱스 */
  node: number;
  x: number;
  z: number;
}

function angleOfStar(s: EmblemStar): number {
  return Math.atan2(s.z, s.x);
}

function angleOfPoint(p: EmblemPoint): number {
  // 상징 좌표는 y 가 아래로 증가한다 — 화면 위 방향으로 뒤집어 재야
  // 별의 각도와 같은 축에서 비교된다.
  return Math.atan2(0.5 - p.y, p.x - 0.5);
}

function radiusOfStar(s: EmblemStar): number {
  return Math.hypot(s.x, s.z);
}

/**
 * 은하마다 별을 상징의 점에 짝지어 준다.
 *
 * @param stars           큐레이션 별 (엔진 버퍼와 같은 순서)
 * @param galaxyIdOfNode  노드 인덱스 → 은하 id
 */
export function buildEmblemField(
  stars: readonly EmblemStar[],
  galaxyIdOfNode: readonly string[],
): EmblemField {
  const count = stars.length;
  const field: EmblemField = {
    u: new Float32Array(count),
    v: new Float32Array(count),
    w: new Float32Array(count),
    has: new Uint8Array(count),
    anchor: new Uint8Array(count),
    links: new Int32Array(0),
    linkRange: new Int32Array(galaxyIdOfNode.length * 2),
  };

  const linked: number[] = [];

  // 노드별로 별 인덱스를 모은다
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < count; i += 1) {
    const bucket = buckets.get(stars[i].node);
    if (bucket) bucket.push(i);
    else buckets.set(stars[i].node, [i]);
  }

  for (const [node, indices] of buckets) {
    const emblem = emblemOf(galaxyIdOfNode[node] ?? '');
    if (!emblem) continue;

    const outline = emblem.points.filter((p) => p.weight >= OUTLINE_MIN);
    const inner = emblem.points.filter((p) => p.weight < OUTLINE_MIN);
    if (outline.length === 0) continue;

    const n = indices.length;
    /*
     * 윤곽에 먼저 준다.
     * 속을 채우다 윤곽이 성기면 무슨 모양인지 알 수 없게 되지만,
     * 윤곽이 또렷하면 속이 비어도 형태는 읽힌다.
     */
    const wanted = Math.max(Math.round(n * OUTLINE_SHARE), n - inner.length);
    const outlineQuota = Math.min(n, wanted);
    const innerQuota = n - outlineQuota;

    // 바깥 별 → 윤곽, 안쪽 별 → 속
    const byRadius = [...indices].sort((a, b) => radiusOfStar(stars[a]) - radiusOfStar(stars[b]));
    const innerStars = byRadius.slice(0, innerQuota);
    const outlineStars = byRadius.slice(innerQuota);

    pair(field, stars, outlineStars, outline);
    pair(field, stars, innerStars, inner);

    // 윤곽을 맡은 별 중에서 앵커를 고르고, 앵커끼리만 잇는다.
    const anchors = pickAnchors(field, outlineStars);
    for (const i of anchors) field.anchor[i] = 1;

    const start = linked.length;
    linked.push(...linkNearest(field, anchors));
    if (node * 2 + 1 < field.linkRange.length) {
      field.linkRange[node * 2] = start;
      field.linkRange[node * 2 + 1] = linked.length;
    }
  }

  field.links = Int32Array.from(linked);
  return field;
}

/**
 * 형태를 대표하는 별 십여 개를 고른다.
 *
 * ★ 가장 먼 점 고르기(farthest-point sampling)
 *   이미 고른 앵커들에서 가장 멀리 떨어진 별을 하나씩 더한다. 그러면
 *   앵커가 형태 전체에 고르게 퍼진다 — 무작위로 뽑으면 한쪽에 뭉치고,
 *   순번으로 뽑으면 배정 순서(각도)를 따라가 한 방향으로만 늘어선다.
 *
 * ★ 첫 앵커는 중심에서 가장 먼 별이다.
 *   결정적이어야 하고(볼 때마다 같은 별자리여야 한다), 끝점에서
 *   시작해야 십자가의 팔 끝 같은 특징점이 빠지지 않는다.
 */
function pickAnchors(field: EmblemField, candidates: readonly number[]): number[] {
  const n = candidates.length;
  if (n === 0) return [];

  const want = Math.min(ANCHOR_MAX, Math.max(ANCHOR_MIN, Math.round(Math.sqrt(n) * 1.4)));
  if (n <= want) return [...candidates];

  const dist2 = (a: number, b: number) => {
    const du = field.u[a] - field.u[b];
    const dv = field.v[a] - field.v[b];
    return du * du + dv * dv;
  };

  let first = candidates[0];
  let best = -1;
  for (const i of candidates) {
    const r = field.u[i] * field.u[i] + field.v[i] * field.v[i];
    if (r > best) {
      best = r;
      first = i;
    }
  }

  const picked = [first];
  // 각 후보에서 "가장 가까운 앵커까지의 거리". 앵커를 더할 때마다 줄여 간다.
  const near = candidates.map((i) => dist2(i, first));

  while (picked.length < want) {
    let far = -1;
    let at = -1;
    for (let k = 0; k < n; k += 1) {
      if (near[k] > far) {
        far = near[k];
        at = k;
      }
    }
    if (at < 0 || far <= 0) break;

    const chosen = candidates[at];
    picked.push(chosen);
    for (let k = 0; k < n; k += 1) {
      const d = dist2(candidates[k], chosen);
      if (d < near[k]) near[k] = d;
    }
  }

  return picked;
}

/**
 * 가까운 이웃끼리 잇는다.
 *
 * ★ 배정 순서로 잇지 않는다.
 *   별은 각도 순으로 짝지어졌는데 상징의 윤곽은 하나의 원이 아니다
 *   (십자가·닻·잔 전부 갈래가 있다). 순서대로 이으면 형태를 가로지르는
 *   선이 생긴다. 실제 좌표에서 가까운 것끼리 이어야 윤곽을 따라간다.
 *
 * ★ 은하당 한 번만 돈다.
 *   앵커는 스무 개 안쪽이라 비교가 몇백 번이다. 상징은 변하지 않으므로
 *   만들 때 한 번이면 끝난다.
 */
function linkNearest(field: EmblemField, indices: readonly number[]): number[] {
  const n = indices.length;
  if (n < 3) return [];

  // 각 별에서 가장 가까운 이웃까지의 거리 — 문턱을 여기서 뽑는다
  const nearest: number[] = [];
  const sorted: { to: number; d: number }[][] = [];

  for (let a = 0; a < n; a += 1) {
    const list: { to: number; d: number }[] = [];
    for (let b = 0; b < n; b += 1) {
      if (a === b) continue;
      const du = field.u[indices[a]] - field.u[indices[b]];
      const dv = field.v[indices[a]] - field.v[indices[b]];
      list.push({ to: b, d: Math.hypot(du, dv) });
    }
    list.sort((x, y) => x.d - y.d);
    sorted.push(list);
    nearest.push(list[0].d);
  }

  const median = [...nearest].sort((a, b) => a - b)[Math.floor(n / 2)];
  const limit = median * LINK_SPAN;

  const seen = new Set<string>();
  const out: number[] = [];
  for (let a = 0; a < n; a += 1) {
    let taken = 0;
    for (const { to, d } of sorted[a]) {
      if (taken >= MAX_LINKS || d > limit) break;
      const key = a < to ? `${a}-${to}` : `${to}-${a}`;
      if (seen.has(key)) {
        // 상대가 이미 나를 이었다 — 이 별의 몫으로 세되 두 번 그리지 않는다
        taken += 1;
        continue;
      }
      seen.add(key);
      out.push(indices[a], indices[to]);
      taken += 1;
    }
  }
  return out;
}

/**
 * 별 무리와 점 무리를 각도 순으로 짝짓는다.
 *
 * 같은 각도끼리 이으면 이동 경로가 서로 엇갈리지 않는다. 엇갈리면 변형
 * 도중에 별들이 서로를 통과해 지나가고, 그 순간 형태가 아니라 소용돌이로
 * 보인다.
 */
function pair(
  field: EmblemField,
  stars: readonly EmblemStar[],
  indices: readonly number[],
  points: readonly EmblemPoint[],
): void {
  if (indices.length === 0 || points.length === 0) return;

  const sortedStars = [...indices].sort((a, b) => angleOfStar(stars[a]) - angleOfStar(stars[b]));
  const sortedPoints = [...points].sort((a, b) => angleOfPoint(a) - angleOfPoint(b));

  const n = sortedStars.length;
  const m = sortedPoints.length;

  for (let k = 0; k < n; k += 1) {
    const star = sortedStars[k];
    // 점이 별보다 많으면 고르게 솎아 쓰고, 적으면 다시 쓴다.
    const p = sortedPoints[m >= n ? Math.floor((k * m) / n) : k % m];

    /*
     * 다시 쓴 점에는 결정적인 흔들림을 준다.
     * 난수를 쓰지 않는 이유는 상징이 볼 때마다 달라지면 안 되기 때문이다.
     */
    const reused = m < n ? Math.floor(k / m) : 0;
    const wobble = reused === 0 ? 0 : DUPLICATE_JITTER * (reused % 2 === 0 ? 1 : -1) * reused;

    const u = ((p.x - 0.5) * 2 + wobble) * EMBLEM_RADIUS;
    // 화면 위가 +v 다. 상징의 y 는 아래로 증가하므로 부호를 뒤집는다.
    const v = ((0.5 - p.y) * 2 + wobble) * EMBLEM_RADIUS;

    field.u[star] = u;
    field.v[star] = v;
    /* 앞뒤 위치. 정면에서는 평평하고, 돌리면 그때 깊이가 드러난다. */
    field.w[star] = domeDepth(u, v);
    field.has[star] = 1;
  }
}
