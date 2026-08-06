/*
 * data/counselOpenings.test.ts
 *
 * ★ 실제로 났던 고장이다.
 *   서버 없이 돌 때 열세 은하가 전부 "편하게 이야기를 시작해 주세요" 로
 *   시작했다. 조우에서 그 사람이 한마디 건넨 직후에 대화창이 열리는데,
 *   거기서 누구에게나 같은 문장이 나오니 방금 만난 사람이 사라졌다.
 */

import { describe, expect, it } from 'vitest';

import { ALL_GALAXIES } from './disciples';
import { emblemOf } from './emblems';
import { counselOpening } from './counselOpenings';

const IDS = ALL_GALAXIES.map((g) => g.id);

describe('상담 첫 줄', () => {
  it('★ 열세 은하가 서로 다른 첫 줄을 낸다', () => {
    const lines = new Set(IDS.map((id) => counselOpening(id)));
    expect(lines.size).toBe(IDS.length);
  });

  it('조우에서 건넨 말로 시작한다', () => {
    /*
     * 두 화면이 한 장면으로 이어지게 하는 것이 이 파일의 전부다.
     * 다른 인사로 시작하면 방금 만난 사람과 지금 말하는 사람이 같은지
     * 알 수 없다.
     */
    for (const id of IDS) {
      const greeting = emblemOf(id)?.greeting;
      expect(greeting).toBeTruthy();
      expect(counselOpening(id).startsWith(greeting!)).toBe(true);
    }
  });

  it('같은 사람은 언제나 같은 말로 맞이한다', () => {
    // 볼 때마다 다른 말이면 그 사람의 결이 흐려진다
    for (const id of IDS) {
      expect(counselOpening(id)).toBe(counselOpening(id));
    }
  });

  it('구절에서 이어 오면 그 안내가 사이에 들어간다', () => {
    const lead = '요한복음 3:16에서 이어서 이야기해 볼게요.';
    const text = counselOpening('peter', lead);
    expect(text).toContain(lead);
    expect(text.startsWith(emblemOf('peter')!.greeting)).toBe(true);
  });

  it('인물이 없으면 예전 문장을 그대로 쓴다', () => {
    // 은하 없이 바로 상담으로 들어오는 경로가 있다
    expect(counselOpening(undefined)).toContain('편하게 이야기를 시작해 주세요');
    expect(counselOpening('없는_은하')).toContain('편하게 이야기를 시작해 주세요');
  });

  it('줄바꿈이 의미 단위로만 들어간다', () => {
    /*
     * 첫 줄은 방금 건넨 말, 둘째 줄은 지금 여는 말이다.
     * 빈 줄이 생기면 화면에서 문단이 갈라져 두 사람이 말한 것처럼 보인다.
     */
    for (const id of IDS) {
      expect(counselOpening(id)).not.toContain('\n\n');
      expect(counselOpening(id).trim()).toBe(counselOpening(id));
    }
  });
});
