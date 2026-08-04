/*
 * routes/paths.test.ts
 * 검증 기준: 경로가 카메라 상태에 남기는 흔적까지 의도대로인가.
 */

import { describe, expect, it } from 'vitest';
import {
  PATHS,
  TRAVEL_PARAM,
  askPath,
  counselPath,
  skyPath,
  verseClosePath,
  versePath,
} from './paths';

describe('경로 생성', () => {
  it('질문과 구절 id 를 안전하게 인코딩한다', () => {
    expect(askPath('제 삶에 의미가 있을까요?')).toContain(encodeURIComponent('제 삶에 의미가 있을까요?'));
    expect(versePath('gen-1-3')).toBe('/verse/gen-1-3');
  });

  it('focus 를 주면 그 별을 조준한 채로 하늘에 들어간다', () => {
    expect(skyPath('gen-1-3')).toBe('/sky?focus=gen-1-3');
    expect(skyPath()).toBe(PATHS.sky);
  });

  it('★ travel 을 주면 도착 후 구절을 연다는 뜻이 경로에 남는다', () => {
    const path = skyPath('gen-1-3', { travel: true });
    expect(path).toContain(`${TRAVEL_PARAM}=1`);
    expect(path).toContain('focus=gen-1-3');
  });

  it('travel 은 기본으로 붙지 않는다 (탐색은 여전히 탐색이다)', () => {
    expect(skyPath('gen-1-3')).not.toContain(TRAVEL_PARAM);
  });

  it('focus 가 없으면 travel 도 의미가 없다', () => {
    expect(skyPath(undefined, { travel: true })).toBe(PATHS.sky);
  });

  it('상담 경로는 준 파라미터만 붙인다', () => {
    expect(counselPath()).toBe(PATHS.counsel);
    expect(counselPath({ from: 'gen-1-3' })).toBe('/counsel?from=gen-1-3');
  });
});

describe('구절 상세를 닫았을 때', () => {
  it('★ focus 를 남기지 않는다 (남기면 확대된 채로 멈춘다)', () => {
    expect(verseClosePath()).toBe(PATHS.sky);
    expect(verseClosePath()).not.toContain('focus');
  });
});
