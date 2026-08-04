/*
 * data/verses.test.ts
 * Phase 1 검증 기준: 별 데이터의 구조적 무결성.
 */

import { describe, expect, it } from 'vitest';
import { FULL_VERSE_STARS, VERSE_STARS, getVerseStar } from './verses';
import { THEME_KEYWORDS, THEME_LABELS } from './intents';
import { ANSWER_VARIANTS } from './answers';
import { getGalaxy, verseIndexInGalaxy } from './disciples';
import type { ThemeTag } from './types';

const ALL_THEMES = Object.keys(THEME_LABELS) as ThemeTag[];

describe('VERSE_STARS', () => {
  it('큐레이션 별이 40개 이상이다', () => {
    expect(VERSE_STARS.length).toBeGreaterThanOrEqual(40);
  });

  it('id 가 유일하다', () => {
    const ids = VERSE_STARS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 좌표가 -1..1 범위 안에 있다', () => {
    for (const star of VERSE_STARS) {
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(Math.abs(star.coord[axis]), `${star.id}.${axis}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('magnitude 가 0..1 범위다', () => {
    for (const star of VERSE_STARS) {
      expect(star.magnitude).toBeGreaterThan(0);
      expect(star.magnitude).toBeLessThanOrEqual(1);
    }
  });

  it('모든 별에 요약이 있다 (brief 는 이것이 유일한 설명이다)', () => {
    for (const star of VERSE_STARS) {
      expect(star.summary.length, star.id).toBeGreaterThan(0);
    }
  });

  it('큐레이션 별의 상세 서술 필드가 비어 있지 않다', () => {
    for (const star of FULL_VERSE_STARS) {
      expect(star.excerpt.length, star.id).toBeGreaterThan(0);
      expect(star.story.length, star.id).toBeGreaterThan(0);
      expect(star.meditation.length, star.id).toBeGreaterThan(0);
      expect(star.attribution.length, star.id).toBeGreaterThan(0);
    }
  });

  it('인용은 짧게 유지된다 (저작권 원칙: 40자 이하)', () => {
    for (const star of FULL_VERSE_STARS) {
      expect(star.excerpt.length, `${star.id}: ${star.excerpt}`).toBeLessThanOrEqual(40);
    }
  });

  it('★ 연관 구절에는 본문 인용이 없다', () => {
    // brief 에 인용이 붙기 시작하면 저작권 확인 없는 인용이 수백 건이 된다.
    for (const star of VERSE_STARS) {
      if (star.depth === 'brief') {
        expect(star, star.id).not.toHaveProperty('excerpt');
        expect(star, star.id).not.toHaveProperty('attribution');
      }
    }
  });

  it('12개 주제 각각에 최소 3개의 별이 있다', () => {
    for (const theme of ALL_THEMES) {
      const count = VERSE_STARS.filter((s) => s.themes.includes(theme)).length;
      expect(count, theme).toBeGreaterThanOrEqual(3);
    }
  });

  it('같은 좌표에 겹치는 별이 없다', () => {
    /*
     * coord 는 은하 로컬 좌표다. 서로 다른 은하의 두 별이 같은 로컬 좌표를
     * 가져도 화면에서는 떨어져 있으므로 문제가 아니다. 확인해야 할 것은
     * "같은 은하 안에서" 겹치지 않는가다.
     *
     * 은하면이 x-z 이므로 세 축을 모두 본다 — y 만으로는 구분되지 않는다.
     */
    const keys = VERSE_STARS.map(
      (s) =>
        `${s.discipleId}|${s.coord.x.toFixed(4)}:${s.coord.y.toFixed(4)}:${s.coord.z.toFixed(4)}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('은하마다 별 배치가 다르다 (복제한 티가 나지 않는다)', () => {
    // 별 수가 같은 은하끼리 좌표까지 같으면 12개가 같은 무늬로 보인다.
    const byIndex = new Map<string, string[]>();
    for (const star of VERSE_STARS) {
      const index = verseIndexInGalaxy(star.id);
      const count = getGalaxy(star.discipleId)?.verseIds.length ?? 0;
      const slot = `${count}:${index}`;
      const list = byIndex.get(slot) ?? [];
      list.push(`${star.coord.x.toFixed(4)}:${star.coord.z.toFixed(4)}`);
      byIndex.set(slot, list);
    }

    for (const [slot, coords] of byIndex) {
      expect(new Set(coords).size, slot).toBe(coords.length);
    }
  });

  it('큐레이션 별은 은하면 근처에 머문다 (원반 두께 안)', () => {
    for (const star of VERSE_STARS) {
      expect(Math.abs(star.coord.y), star.id).toBeLessThanOrEqual(0.15);
    }
  });

  it('getVerseStar 로 모든 별을 조회할 수 있다', () => {
    for (const star of VERSE_STARS) {
      expect(getVerseStar(star.id)?.id).toBe(star.id);
    }
    expect(getVerseStar('does-not-exist')).toBeUndefined();
  });
});

describe('사전과 응답 데이터', () => {
  it('모든 주제에 키워드가 정의되어 있다', () => {
    for (const theme of ALL_THEMES) {
      expect(THEME_KEYWORDS[theme].length, theme).toBeGreaterThan(0);
    }
  });

  it('모든 응답 variant 가 실재하는 별을 가리킨다', () => {
    for (const [intent, variants] of Object.entries(ANSWER_VARIANTS)) {
      for (const v of variants) {
        expect(v.verseIds.length, intent).toBeGreaterThan(0);
        for (const id of v.verseIds) {
          expect(getVerseStar(id), `${intent} → ${id}`).toBeDefined();
        }
      }
    }
  });

  it('12개 주제 + fallback + crisis 응답이 모두 존재한다', () => {
    for (const theme of ALL_THEMES) {
      expect(ANSWER_VARIANTS[theme]?.length, theme).toBeGreaterThan(0);
    }
    expect(ANSWER_VARIANTS.fallback.length).toBeGreaterThan(0);
    expect(ANSWER_VARIANTS.crisis.length).toBeGreaterThan(0);
  });
});
