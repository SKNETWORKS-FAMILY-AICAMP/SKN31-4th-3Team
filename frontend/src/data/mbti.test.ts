/*
 * data/mbti.test.ts
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 궁합 값이 백엔드와 어긋나지 않고, 고르면 항상 남는 은하가 있는가.
 *
 * ★ 숫자의 출처는 backend/app/services/mock_data.py 다.
 *   프런트에서 임의로 계산하면 서버가 붙는 순간 두 화면이 서로 다른
 *   궁합을 말하게 된다.
 */

import { describe, expect, it } from 'vitest';
import {
  AFFINITY_THRESHOLD,
  MBTI_TYPES,
  compatScore,
  isAffinity,
  isMbtiType,
} from './mbti';
import { ALL_GALAXIES, CENTER_GALAXY } from './disciples';

describe('16유형', () => {
  it('중복 없이 16개다', () => {
    expect(MBTI_TYPES).toHaveLength(16);
    expect(new Set(MBTI_TYPES).size).toBe(16);
  });

  it('네 글자 표기다', () => {
    for (const type of MBTI_TYPES) expect(type).toMatch(/^[IE][NS][FT][JP]$/);
  });

  it('아는 값만 유형으로 인정한다', () => {
    expect(isMbtiType('INFJ')).toBe(true);
    expect(isMbtiType('XXXX')).toBe(false);
    expect(isMbtiType('infj')).toBe(false);
  });
});

describe('궁합 점수', () => {
  it('대칭이다 (a→b 와 b→a 가 같다)', () => {
    for (const a of MBTI_TYPES) {
      for (const b of MBTI_TYPES) {
        expect(compatScore(a, b), `${a}-${b}`).toBe(compatScore(b, a));
      }
    }
  });

  it('0..100 을 벗어나지 않는다', () => {
    for (const a of MBTI_TYPES) {
      for (const b of MBTI_TYPES) {
        const score = compatScore(a, b);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('백엔드 표본과 값이 같다', () => {
    // mock_data.py 의 SCORES 에서 몇 칸을 그대로 옮겨 대조한다.
    expect(compatScore('INFJ', 'INFJ')).toBe(72);
    expect(compatScore('INFJ', 'ENFP')).toBe(100);
    expect(compatScore('ISTJ', 'INFJ')).toBe(42);
    expect(compatScore('ESTP', 'ISTJ')).toBe(100);
  });

  it('모르는 값에는 중립을 준다', () => {
    // 없는 관계를 좋게도 나쁘게도 만들지 않는다.
    expect(compatScore('XXXX', 'INFJ')).toBe(50);
    expect(compatScore('INFJ', '')).toBe(50);
  });
});

describe('은하 궁합', () => {
  it('13개 은하 모두 MBTI 를 갖는다', () => {
    for (const galaxy of ALL_GALAXIES) {
      expect(isMbtiType(galaxy.mbti), galaxy.id).toBe(true);
    }
  });

  it('백엔드 인물 데이터와 같다', () => {
    // mock_data.PEOPLE 의 mbti 를 표본으로 대조한다.
    const expected: Record<string, string> = {
      jesus: 'INFJ',
      peter: 'ESFP',
      john: 'INFP',
      thomas: 'INTP',
      judas: 'ENTJ',
    };
    for (const [id, mbti] of Object.entries(expected)) {
      expect(ALL_GALAXIES.find((g) => g.id === id)?.mbti, id).toBe(mbti);
    }
  });

  it('예수 그리스도의 은하는 INFJ 다', () => {
    expect(CENTER_GALAXY.mbti).toBe('INFJ');
  });

  it('★ 어떤 유형을 골라도 남는 은하가 있다', () => {
    // 전부 사라지면 화면이 고장 난 것처럼 보인다.
    for (const type of MBTI_TYPES) {
      const kin = ALL_GALAXIES.filter((g) => isAffinity(type, g.mbti));
      expect(kin.length, type).toBeGreaterThan(0);
    }
  });

  it('★ 어떤 유형을 골라도 전부 남지는 않는다', () => {
    // 전부 남으면 고른 의미가 없다.
    for (const type of MBTI_TYPES) {
      const kin = ALL_GALAXIES.filter((g) => isAffinity(type, g.mbti));
      expect(kin.length, type).toBeLessThan(ALL_GALAXIES.length);
    }
  });

  it('남는 은하 수가 한 줌 정도다', () => {
    for (const type of MBTI_TYPES) {
      const kin = ALL_GALAXIES.filter((g) => isAffinity(type, g.mbti));
      expect(kin.length, type).toBeGreaterThanOrEqual(2);
      expect(kin.length, type).toBeLessThanOrEqual(7);
    }
  });

  it('임계값이 점수 눈금 위에 있다', () => {
    // 눈금 사이에 걸치면 값이 조금만 흔들려도 결과가 통째로 바뀐다.
    const values = new Set<number>();
    for (const a of MBTI_TYPES) for (const b of MBTI_TYPES) values.add(compatScore(a, b));
    expect(values.has(AFFINITY_THRESHOLD)).toBe(true);
  });
});
