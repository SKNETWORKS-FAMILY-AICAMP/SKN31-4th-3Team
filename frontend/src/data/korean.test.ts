/*
 * 조사.
 *
 * ★ 여기서 잡아야 하는 고장
 *   문장에 "을(를)" 이 다시 기어 들어오는 것. 그리고 13인 이름 중
 *   하나라도 "요한와" 처럼 어긋나는 것 — 인물 이름은 화면에서 가장
 *   자주 보이는 단어라 한 번 어긋나면 계속 눈에 밟힌다.
 */

import { describe, expect, it } from 'vitest';

import { hasFinalConsonant, objectOf, subjectOf, topicOf, withOf } from './korean';
import { ALL_GALAXIES } from './disciples';

describe('받침 판정', () => {
  it('종성이 있으면 참', () => {
    expect(hasFinalConsonant('불안')).toBe(true);
    expect(hasFinalConsonant('죄책감')).toBe(true);
  });

  it('종성이 없으면 거짓', () => {
    expect(hasFinalConsonant('관계')).toBe(false);
    expect(hasFinalConsonant('의미')).toBe(false);
  });

  it('빈 값에도 터지지 않는다', () => {
    expect(hasFinalConsonant('')).toBe(false);
    expect(hasFinalConsonant('   ')).toBe(false);
  });

  it('한글이 아니면 받침 없는 쪽으로 본다', () => {
    // "Eden를" 이 "Eden을" 보다 자연스럽다
    expect(hasFinalConsonant('Eden')).toBe(false);
    expect(objectOf('Eden')).toBe('Eden를');
  });

  it('띄어쓰기가 있어도 마지막 글자를 본다', () => {
    expect(hasFinalConsonant('작은 야고보')).toBe(false);
    expect(hasFinalConsonant('가룟 유다')).toBe(false);
  });
});

describe('격조사', () => {
  it('목적격', () => {
    expect(objectOf('불안')).toBe('불안을');
    expect(objectOf('관계')).toBe('관계를');
  });

  it('주격', () => {
    expect(subjectOf('사람')).toBe('사람이');
    expect(subjectOf('구절')).toBe('구절이');
    expect(subjectOf('이야기')).toBe('이야기가');
  });

  it('동반격', () => {
    expect(withOf('요한')).toBe('요한과');
    expect(withOf('베드로')).toBe('베드로와');
  });

  it('보조사', () => {
    expect(topicOf('빌립')).toBe('빌립은');
    expect(topicOf('마태')).toBe('마태는');
  });
});

describe('★ 13인 이름 전수', () => {
  it('모든 인물 이름에 조사가 어긋나지 않는다', () => {
    const wrong = ALL_GALAXIES.map((g) => withOf(g.name)).filter(
      (s) => !s.endsWith('와') && !s.endsWith('과'),
    );
    expect(wrong).toEqual([]);
  });

  it('받침 있는 이름만 "과" 를 받는다', () => {
    // 요한 · 빌립 · 시몬 셋이 여기 해당한다
    const withGwa = ALL_GALAXIES.filter((g) => withOf(g.name).endsWith('과')).map((g) => g.name);
    expect(withGwa.sort()).toEqual(['빌립', '시몬', '요한']);
  });
});
