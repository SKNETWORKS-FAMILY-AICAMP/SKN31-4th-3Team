/*
 * data/backdrop.ts
 * ───────────────────────────────────────────────────────────────────────
 * 배경 별 생성기.
 *
 * "별 하나 = 구절 하나"라는 개념을 배경에도 관철한다. 다만 31,077개를
 * 전부 그리지는 않고, 실제 책별 절 수 분포에 비례해 표본을 뽑는다.
 * → 창세기 영역은 실제로 별이 많고, 오바댜 영역은 실제로 희박하다.
 *
 * 품질 티어가 별 개수를 정하므로, 저사양에서는 같은 분포를 유지한 채
 * 밀도만 낮아진다.
 */

import type { BackdropStar } from './types';
import { BOOK_VERSE_COUNTS, TOTAL_VERSES } from './backdropSeed';
import { placeOnSphere, seededRandom } from '../galaxy/placement';

/** 하늘이 방문마다 바뀌지 않도록 고정 시드를 쓴다. */
const SKY_SEED = 20260731;

/**
 * 책별 절 수 비율에 맞춰 배경 별을 생성한다.
 *
 * @param count 생성할 총 개수 (품질 티어가 결정)
 */
export function generateBackdrop(count: number): BackdropStar[] {
  const rand = seededRandom(SKY_SEED);
  const stars: BackdropStar[] = [];

  // 각 책이 가져갈 몫을 비율로 배분한다.
  let index = 0;
  for (const [bookCode, verseCount] of BOOK_VERSE_COUNTS) {
    const share = Math.max(1, Math.round((verseCount / TOTAL_VERSES) * count));
    for (let i = 0; i < share && index < count; i += 1, index += 1) {
      stars.push({
        bookCode,
        coord: placeOnSphere(index, count, rand),
        // 배경 별은 어둡게. 큐레이션 별(0.56~1.0)과 확실히 구분된다.
        magnitude: 0.06 + rand() * 0.26,
      });
    }
  }

  return stars;
}

/** 배경 별이 대표하는 실제 구절 수 — UI에서 규모를 알릴 때 쓴다. */
export const REPRESENTED_VERSE_COUNT = TOTAL_VERSES;

/** 성경 책 수 */
export const BOOK_COUNT = BOOK_VERSE_COUNTS.length;
