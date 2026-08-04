/*
 * services/intentMatcher.test.ts
 * Phase 1 검증 기준: 12개 의도 + fallback + crisis 분기가 실제로 갈리는가.
 */

import { describe, expect, it } from 'vitest';
import { matchIntent, isCrisis } from './intentMatcher';
import { mockVerseRepository } from './mockRepositories';
import type { ThemeTag } from '../data/types';

const CASES: Array<[string, ThemeTag]> = [
  ['요즘 너무 불안해서 잠이 안 와요', 'anxiety'],
  ['너무 슬퍼서 눈물이 나요', 'grief'],
  ['사람들 속에서도 외로워요', 'loneliness'],
  ['가족과 갈등이 있어요', 'relationship'],
  ['진로를 어떻게 정해야 할지 모르겠어요', 'career'],
  ['실패할까 봐 두려워요', 'fear'],
  ['그 사람을 용서하기가 어려워요', 'forgiveness'],
  ['제 잘못이 후회돼요', 'guilt'],
  ['그래도 다시 시작하고 싶은 소망이 있어요', 'hope'],
  ['오늘은 정말 감사한 하루였어요', 'gratitude'],
  ['번아웃이 와서 아무것도 못 하겠어요', 'recovery'],
  ['제가 사는 의미가 뭘까요', 'purpose'],
];

describe('matchIntent', () => {
  it.each(CASES)('"%s" → %s', (question, expected) => {
    expect(matchIntent(question).intent).toBe(expected);
  });

  it('12개 케이스가 서로 다른 의도로 갈린다', () => {
    const intents = CASES.map(([q]) => matchIntent(q).intent);
    expect(new Set(intents).size).toBe(12);
  });

  it('키워드가 없으면 fallback 이다', () => {
    for (const q of ['음...', '오늘 날씨가 흐리네요', 'ㅁㄴㅇㄹ']) {
      expect(matchIntent(q).intent, q).toBe('fallback');
    }
  });

  it('빈 문자열도 안전하게 fallback 이다', () => {
    expect(matchIntent('   ').intent).toBe('fallback');
  });

  it('위기 신호는 다른 어떤 주제보다 우선한다', () => {
    // '감사'(gratitude) 키워드가 섞여 있어도 crisis 가 이겨야 한다.
    expect(matchIntent('그동안 감사했어요 이제 죽고 싶어요').intent).toBe('crisis');
    expect(isCrisis('자해를 생각하고 있어요')).toBe(true);
    expect(isCrisis('오늘 기분이 좋아요')).toBe(false);
  });
});

describe('mockVerseRepository.ask', () => {
  it('의도별로 서로 다른 추천 구절을 반환한다', async () => {
    const results = await Promise.all(CASES.map(([q]) => mockVerseRepository.ask(q)));
    const signatures = results.map((r) => r.verseIds.join(','));
    // 12개 의도가 최소 10가지 이상의 서로 다른 구절 조합을 만든다.
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(10);
  });

  it('매칭 실패해도 공감 문장과 구절을 준다', async () => {
    const r = await mockVerseRepository.ask('오늘 날씨가 흐리네요');
    expect(r.intent).toBe('fallback');
    expect(r.empathy.length).toBeGreaterThan(0);
    expect(r.verseIds.length).toBeGreaterThan(0);
  });

  it('같은 질문에는 항상 같은 응답이 나온다 (결정론)', async () => {
    const a = await mockVerseRepository.ask('불안해요');
    const b = await mockVerseRepository.ask('불안해요');
    expect(a.verseIds).toEqual(b.verseIds);
    expect(a.empathy).toBe(b.empathy);
  });
});
