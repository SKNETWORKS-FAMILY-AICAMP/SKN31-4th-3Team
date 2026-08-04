/*
 * data/relatedVerses.test.ts
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 연관 구절이 은하를 고르게 채우고, 규칙을 어기지 않는가.
 *
 * ★ 장절의 실재 여부는 여기서 검사하지 않는다.
 *   그건 생성 시점에 data/bible_structured.json(31,077절 전문)과 대조해
 *   확인했다. 프런트 번들에 7MB 성경 전문을 넣을 수는 없으므로,
 *   여기서는 형식과 배정만 지킨다.
 */

import { describe, expect, it } from 'vitest';
import { ALL_RELATED_VERSES, RELATED_VERSES } from './relatedVerses';
import { ALL_GALAXIES } from './disciples';
import { FULL_VERSE_STARS, VERSE_STARS, getVerseStar } from './verses';
import { THEME_LABELS } from './intents';
import { MOTIF_LABELS } from '../components/verse/MotifScene';

describe('연관 구절 데이터', () => {
  it('13개 은하가 모두 채워졌다', () => {
    expect(Object.keys(RELATED_VERSES)).toHaveLength(13);
    for (const galaxy of ALL_GALAXIES) {
      expect(RELATED_VERSES[galaxy.id], galaxy.id).toBeDefined();
    }
  });

  it('은하마다 50개 안팎이다 (휑하지도, 한쪽만 몰리지도 않게)', () => {
    for (const galaxy of ALL_GALAXIES) {
      expect(galaxy.verseIds.length, galaxy.id).toBeGreaterThanOrEqual(48);
      expect(galaxy.verseIds.length, galaxy.id).toBeLessThanOrEqual(58);
    }
  });

  it('id 가 전부 유일하다', () => {
    const ids = ALL_RELATED_VERSES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id 가 장절과 일치한다 (슬러그를 손으로 고치다 어긋나는 사고 방지)', () => {
    for (const v of ALL_RELATED_VERSES) {
      expect(v.id.endsWith(`-${v.chapter}-${v.verse}`), v.id).toBe(true);
    }
  });

  it('큐레이션 40개와 겹치지 않는다', () => {
    const core = new Set(FULL_VERSE_STARS.map((s) => s.id));
    for (const v of ALL_RELATED_VERSES) {
      expect(core.has(v.id), v.id).toBe(false);
    }
  });

  it('책 이름과 축약 코드가 모두 채워져 있다', () => {
    for (const v of ALL_RELATED_VERSES) {
      expect(v.bookCode.length, v.id).toBeGreaterThan(0);
      expect(v.bookName.length, v.id).toBeGreaterThan(1);
      expect(v.chapter, v.id).toBeGreaterThan(0);
      expect(v.verse, v.id).toBeGreaterThan(0);
    }
  });

  it('주제와 모티프가 실재하는 값이다', () => {
    for (const v of ALL_RELATED_VERSES) {
      expect(v.themes.length, v.id).toBeGreaterThan(0);
      for (const t of v.themes) expect(THEME_LABELS[t], `${v.id} ${t}`).toBeDefined();
      expect(MOTIF_LABELS[v.motif], `${v.id} ${v.motif}`).toBeDefined();
    }
  });

  it('요약이 한 줄로 유지된다', () => {
    for (const v of ALL_RELATED_VERSES) {
      expect(v.summary.length, v.id).toBeGreaterThan(8);
      expect(v.summary.length, `${v.id}: ${v.summary}`).toBeLessThanOrEqual(60);
    }
  });

  it('★ 요약이 서로 복사되지 않았다', () => {
    // 같은 문장이 반복되면 "채워 넣은 티"가 즉시 난다.
    const summaries = ALL_RELATED_VERSES.map((v) => v.summary);
    expect(new Set(summaries).size).toBe(summaries.length);
  });
});

describe('두 층이 합쳐진 결과', () => {
  it('별이 650개 이상이다', () => {
    expect(VERSE_STARS.length).toBe(FULL_VERSE_STARS.length + ALL_RELATED_VERSES.length);
    expect(VERSE_STARS.length).toBeGreaterThanOrEqual(650);
  });

  it('큐레이션 40개는 그대로 남아 있다', () => {
    expect(FULL_VERSE_STARS.length).toBe(40);
  });

  it('연관 구절도 전부 조회·이동 가능하다 (하늘에만 있고 못 여는 별이 없다)', () => {
    for (const v of ALL_RELATED_VERSES) {
      const star = getVerseStar(v.id);
      expect(star, v.id).toBeDefined();
      expect(star?.depth, v.id).toBe('brief');
    }
  });

  it('★ 연관 구절이 큐레이션보다 어둡다', () => {
    // 밝기가 같으면 하늘은 꽉 차지만 "이야기가 있는 별"이 묻힌다.
    const brightestBrief = Math.max(
      ...VERSE_STARS.filter((s) => s.depth === 'brief').map((s) => s.magnitude),
    );
    const dimmestFull = Math.min(...FULL_VERSE_STARS.map((s) => s.magnitude));
    expect(brightestBrief).toBeLessThan(dimmestFull);
  });

  it('배정되지 않은 별이 없다 (모든 별에 갈 곳이 있다)', () => {
    const placed = new Set(ALL_GALAXIES.flatMap((g) => g.verseIds));
    for (const star of VERSE_STARS) {
      expect(placed.has(star.id), star.id).toBe(true);
    }
    expect(placed.size).toBe(VERSE_STARS.length);
  });
});
