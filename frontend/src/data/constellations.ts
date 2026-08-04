/*
 * data/constellations.ts
 * ───────────────────────────────────────────────────────────────────────
 * 은하별 별자리 선.
 *
 * 좌표와 주제는 이미 verses.ts 가 갖고 있으므로, 여기서는 그것을
 * galaxy/constellation.ts 의 규칙에 넣어 간선을 파생시킬 뿐이다.
 * 손으로 관리하는 데이터가 아니다 — 구절이 늘어도 저절로 다시 그려진다.
 *
 * ★ 모듈 로드 시 한 번만 계산한다.
 *   은하 13개 × 노드 50개의 O(n²) 이므로 총 3만 번 남짓이다.
 *   매 프레임 다시 만들 이유가 전혀 없고, 고정돼 있어야 "이 은하는 이런
 *   모양"이라는 기억이 생긴다.
 */

import { buildConstellation, type ConstellationEdge } from '../galaxy/constellation';
import { ALL_GALAXIES } from './disciples';
import { getVerseStarsByGalaxy } from './verses';

/** 은하 id → 그 은하 안의 별자리 간선 */
export const CONSTELLATIONS: Record<string, readonly ConstellationEdge[]> = Object.fromEntries(
  ALL_GALAXIES.map((galaxy) => [
    galaxy.id,
    buildConstellation(
      getVerseStarsByGalaxy(galaxy.id).map((star) => ({
        id: star.id,
        coord: star.coord,
        themes: star.themes,
      })),
    ),
  ]),
);

export function constellationOf(galaxyId: string): readonly ConstellationEdge[] {
  return CONSTELLATIONS[galaxyId] ?? [];
}
