/*
 * galaxy/constellation.ts
 * ───────────────────────────────────────────────────────────────────────
 * 한 은하 안에서 구절들을 잇는 선을 만든다.
 *
 * ★ 왜 최소 신장 트리(MST)인가
 *   "가까운 것끼리 잇기"나 "주제가 같은 것끼리 잇기"로 하면 섬이 생긴다.
 *   두 개씩 뚝뚝 끊긴 짝들이 흩어져 있으면 별자리가 아니라 얼룩이다.
 *   MST 는 두 가지를 동시에 보장한다.
 *     1) 모든 별이 하나로 이어진다 (섬이 없다)
 *     2) 간선이 정확히 n-1 개다 (거미줄이 되지 않는다)
 *
 * ★ 거리만 보지 않는다
 *   간선 비용에 "주제가 얼마나 겹치는가"를 섞는다. 그래서 같은 결의
 *   구절이 서로 이어지려 하고, 그럴 수 없을 때만 가까운 별로 넘어간다.
 *   보기에는 성좌지만 실제로는 데이터의 관계가 그려진다.
 *
 * ★ 트리에 고리를 조금 더한다
 *   순수한 트리는 가지가 한 번도 만나지 않아 인위적으로 보인다.
 *   주제가 겹치면서 가까운 쌍 몇 개를 추가로 이어 작은 고리를 만든다.
 */

import type { GalaxyCoord } from '../data/types';

export interface ConstellationNode {
  id: string;
  coord: GalaxyCoord;
  themes: readonly string[];
}

export interface ConstellationEdge {
  a: string;
  b: string;
  /** 주제가 겹치는 정도 0..1. 선의 밝기에 쓰인다. */
  kin: number;
}

/**
 * 주제가 겹치는 비율 (자카드 유사도).
 * 둘 다 주제가 없으면 0 — 근거 없는 관계를 만들어 내지 않는다.
 */
export function kinship(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const theme of a) if (setB.has(theme)) shared += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
}

/**
 * 주제가 겹칠수록 싸진다.
 * 0.45 는 "완전히 같은 주제면 거리를 절반쯤으로 친다"는 뜻이다.
 */
const KIN_DISCOUNT = 0.45;

/**
 * 거리 비용의 지수.
 *
 * ★ 1 이면 안 된다.
 *   비용이 거리에 비례하면, 주제 할인을 받은 먼 별이 할인 없는 가까운 별보다
 *   싸질 수 있다 (0.93 × 0.5 < 0.5 × 1). 그 순간 선이 원반을 가로지른다.
 *   지수를 올리면 멀어질수록 비용이 가파르게 커져 할인으로 뒤집을 수 없다.
 */
const DISTANCE_EXPONENT = 1.9;

/** 트리에 얹을 추가 간선의 비율 (노드 수 대비). */
const CHORD_RATIO = 0.14;

/** 추가 간선으로 쓸 최소 주제 유사도. 근거 없는 선은 얹지 않는다. */
const CHORD_MIN_KIN = 0.25;

/**
 * 추가 간선이 뻗을 수 있는 최대 거리 (로컬 단위).
 *
 * 비용에는 주제 할인이 들어가므로, 같은 주제라면 은하 반대편의 별도
 * "싸게" 보인다. 그렇게 이어진 선은 원반을 가로질러 나선 구조를 지운다.
 * 트리와 달리 고리는 없어도 되는 선이므로 거리로 잘라 낸다.
 */
const CHORD_MAX_SPAN = 0.5;

function distance(a: GalaxyCoord, b: GalaxyCoord): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function costOf(a: ConstellationNode, b: ConstellationNode): number {
  const span = distance(a.coord, b.coord);
  return span ** DISTANCE_EXPONENT * (1 - KIN_DISCOUNT * kinship(a.themes, b.themes));
}

/**
 * 은하 하나의 별자리 간선을 만든다.
 *
 * 입력 순서가 같으면 결과도 항상 같다 — 방문할 때마다 별자리가 바뀌면
 * "이 은하는 이런 모양"이라는 기억이 생기지 않는다.
 */
export function buildConstellation(nodes: readonly ConstellationNode[]): ConstellationEdge[] {
  const n = nodes.length;
  if (n < 2) return [];

  /*
   * 프림 알고리즘. 노드가 50개 남짓이라 O(n²) 로 충분하고,
   * 힙을 쓰지 않으니 결과 순서가 입력에 대해 완전히 결정적이다.
   */
  const inTree = new Array<boolean>(n).fill(false);
  const best = new Array<number>(n).fill(Infinity);
  const parent = new Array<number>(n).fill(-1);

  best[0] = 0;
  const edges: ConstellationEdge[] = [];

  for (let step = 0; step < n; step += 1) {
    let pick = -1;
    for (let i = 0; i < n; i += 1) {
      if (!inTree[i] && (pick === -1 || best[i] < best[pick])) pick = i;
    }
    if (pick === -1) break;
    inTree[pick] = true;

    if (parent[pick] >= 0) {
      const from = nodes[parent[pick]];
      const to = nodes[pick];
      edges.push({ a: from.id, b: to.id, kin: kinship(from.themes, to.themes) });
    }

    for (let i = 0; i < n; i += 1) {
      if (inTree[i]) continue;
      const cost = costOf(nodes[pick], nodes[i]);
      if (cost < best[i]) {
        best[i] = cost;
        parent[i] = pick;
      }
    }
  }

  /*
   * 고리 몇 개를 더한다.
   * 주제가 확실히 겹치면서 가까운 쌍 중, 아직 이어지지 않은 것부터 고른다.
   */
  const taken = new Set(edges.map((e) => edgeKey(e.a, e.b)));
  const candidates: { edge: ConstellationEdge; cost: number }[] = [];

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const kin = kinship(nodes[i].themes, nodes[j].themes);
      if (kin < CHORD_MIN_KIN) continue;
      if (distance(nodes[i].coord, nodes[j].coord) > CHORD_MAX_SPAN) continue;
      if (taken.has(edgeKey(nodes[i].id, nodes[j].id))) continue;
      candidates.push({
        edge: { a: nodes[i].id, b: nodes[j].id, kin },
        cost: costOf(nodes[i], nodes[j]),
      });
    }
  }

  candidates.sort((x, y) => x.cost - y.cost);
  const chords = Math.round(n * CHORD_RATIO);

  for (const candidate of candidates) {
    if (edges.length >= n - 1 + chords) break;
    edges.push(candidate.edge);
  }

  return edges;
}

/** 방향이 없는 간선의 키. a-b 와 b-a 를 같은 것으로 본다. */
export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
