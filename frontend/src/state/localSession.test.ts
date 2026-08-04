/*
 * 백엔드 없이 도는 계정 자리.
 *
 * 여기서 확인하는 것은 "기억한다"가 아니라 "망가진 값을 만나도 앱이
 * 살아 있는가"다. 저장소는 사용자가 손댈 수 있는 곳이고, 예전 버전이
 * 남긴 다른 모양이 들어 있을 수도 있다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextLocalId, readLocalSession, writeLocalSession } from '../services/localSession';

const KEY = 'eden.localSession';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('localSession', () => {
  it('쓴 것을 그대로 읽는다', () => {
    const session = { id: 1, email: 'a@b.com', username: '혁진', mbti: 'INFJ' };
    writeLocalSession(session);
    expect(readLocalSession()).toEqual(session);
  });

  it('비어 있으면 null 이다', () => {
    expect(readLocalSession()).toBeNull();
  });

  it('null 을 쓰면 지워진다', () => {
    writeLocalSession({ id: 1, email: 'a@b.com', username: '혁진', mbti: 'INFJ' });
    writeLocalSession(null);
    expect(readLocalSession()).toBeNull();
  });

  it('JSON 이 아닌 값이 들어 있어도 던지지 않는다', () => {
    window.localStorage.setItem(KEY, '{{{');
    expect(readLocalSession()).toBeNull();
  });

  it('모양이 다른 객체는 없는 것으로 친다', () => {
    // 예전 버전이 남긴 값이거나 사용자가 손댄 값
    window.localStorage.setItem(KEY, JSON.stringify({ name: '혁진' }));
    expect(readLocalSession()).toBeNull();
  });

  it('null 이 저장돼 있어도 던지지 않는다', () => {
    window.localStorage.setItem(KEY, 'null');
    expect(readLocalSession()).toBeNull();
  });

  it('★ 저장소가 막혀 있어도 화면은 살아 있다', () => {
    /*
     * 사파리 프라이빗 모드에서 실제로 일어난다. 기억하지 못하는 것은
     * 불편할 뿐이지만, 여기서 예외가 새어 나가면 렌더 중에 터져
     * 화면 전체가 빈다.
     */
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => readLocalSession()).not.toThrow();
    expect(readLocalSession()).toBeNull();
    expect(() =>
      writeLocalSession({ id: 1, email: 'a@b.com', username: '혁진', mbti: 'INFJ' }),
    ).not.toThrow();
  });

  it('비밀번호는 어떤 경로로도 저장되지 않는다', () => {
    // 데모 편의를 위해서라도 평문 비밀번호를 브라우저에 두지 않는다.
    writeLocalSession({ id: 1, email: 'a@b.com', username: '혁진', mbti: 'INFJ' });
    const raw = window.localStorage.getItem(KEY) ?? '';
    expect(raw).not.toMatch(/password|pass|pw/i);
  });

  it('id 는 양수다', () => {
    expect(nextLocalId()).toBeGreaterThan(0);
  });
});
