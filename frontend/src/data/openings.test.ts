/*
 * data/openings.test.ts
 * Phase 3 검증 기준: 문구가 중복 없이 뽑히고, 톤 원칙을 지키는가.
 */

import { describe, expect, it } from 'vitest';
import {
  OPENINGS,
  OPENINGS_PER_VISIT,
  pickOpenings,
  pickSuggestedPrompts,
} from './openings';
import { FULL_VERSE_STARS } from './verses';

describe('pickOpenings', () => {
  it('요청한 개수만큼 중복 없이 뽑는다', () => {
    for (let trial = 0; trial < 50; trial += 1) {
      const picked = pickOpenings(OPENINGS_PER_VISIT);
      expect(picked).toHaveLength(OPENINGS_PER_VISIT);
      expect(new Set(picked.map((o) => o.id)).size).toBe(OPENINGS_PER_VISIT);
    }
  });

  it('풀보다 많이 요청해도 풀 크기를 넘지 않는다', () => {
    expect(pickOpenings(999)).toHaveLength(OPENINGS.length);
  });

  it('방문마다 조합이 달라진다', () => {
    const signatures = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      signatures.add(pickOpenings(OPENINGS_PER_VISIT).map((o) => o.id).join(','));
    }
    // 30번 뽑아 전부 같은 조합이 나오면 로테이션이 죽은 것이다.
    expect(signatures.size).toBeGreaterThan(1);
  });
});

describe('오프닝 문구 톤', () => {
  it('최소 4개 이상 준비되어 있다', () => {
    expect(OPENINGS.length).toBeGreaterThanOrEqual(OPENINGS_PER_VISIT);
  });

  it('모든 문구에 headline 과 placeholder 가 있다', () => {
    for (const o of OPENINGS) {
      expect(o.headline.length, o.id).toBeGreaterThan(0);
      expect(o.placeholder.length, o.id).toBeGreaterThan(0);
    }
  });

  it('신적 권위를 대신 선포하는 표현을 쓰지 않는다', () => {
    // 목회적 안내 톤 원칙 — 1인칭 신적 선언이나 명령형 단정을 배제한다.
    const forbidden = ['내가 너에게', '내가 명하노니', '하나님이 말씀하시길', '반드시 그리하리라'];
    for (const o of OPENINGS) {
      for (const phrase of forbidden) {
        expect(o.headline, o.id).not.toContain(phrase);
      }
    }
  });
});

describe('pickSuggestedPrompts', () => {
  const allPrompts = FULL_VERSE_STARS.flatMap((s) => s.relatedPrompts);

  it('중복 없이 뽑는다', () => {
    for (let trial = 0; trial < 30; trial += 1) {
      const picked = pickSuggestedPrompts(allPrompts, 3);
      expect(new Set(picked).size).toBe(picked.length);
    }
  });

  it('뽑힌 모든 칩은 실제 별의 추천 질문이다', () => {
    const known = new Set(allPrompts);
    for (const prompt of pickSuggestedPrompts(allPrompts, 5)) {
      expect(known.has(prompt), prompt).toBe(true);
    }
  });

  it('빈 배열이 들어와도 안전하다', () => {
    expect(pickSuggestedPrompts([], 3)).toEqual([]);
  });
});
