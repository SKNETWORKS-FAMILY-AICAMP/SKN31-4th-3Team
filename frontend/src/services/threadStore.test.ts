/*
 * services/threadStore.test.ts
 *
 * ★ 여기서 잡아야 하는 고장
 *   - 저장소가 막힌 브라우저에서 예외가 렌더 중에 터져 화면이 빔
 *   - 예전 버전이 남긴 모양 때문에 목록이 통째로 깨짐
 *   - 대화가 무한히 쌓여 저장에 실패하고 이번 대화까지 사라짐
 *   - 열었다 아무 말 없이 나간 빈 방이 목록에 쌓임
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearThreads,
  deleteThread,
  listThreads,
  readThread,
  saveThread,
  titleFor,
  type StoredThread,
} from './threadStore';

function thread(id: string, updatedAt: number, extra: Partial<StoredThread> = {}): StoredThread {
  return {
    id,
    title: `대화 ${id}`,
    seed: {},
    messages: [
      { id: `${id}-1`, role: 'guide', text: '오래 기다렸습니다.', createdAt: 1 },
      { id: `${id}-2`, role: 'user', text: '안녕하세요', createdAt: 2 },
    ],
    createdAt: 1,
    updatedAt,
    ...extra,
  };
}

describe('대화방 저장소', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('저장한 것을 그대로 되찾는다', () => {
    const t = thread('a', 10, { personaId: 'peter', personaReason: '근거' });
    saveThread(t);

    const back = readThread('a');
    expect(back?.messages).toHaveLength(2);
    expect(back?.personaId).toBe('peter');
    expect(back?.personaReason).toBe('근거');
  });

  it('같은 id 를 저장하면 덮어쓴다', () => {
    saveThread(thread('a', 10));
    saveThread(thread('a', 20));
    expect(listThreads()).toHaveLength(1);
    expect(readThread('a')?.updatedAt).toBe(20);
  });

  it('최근에 이야기한 것이 위로 온다', () => {
    saveThread(thread('old', 10));
    saveThread(thread('new', 30));
    saveThread(thread('mid', 20));
    expect(listThreads().map((t) => t.id)).toEqual(['new', 'mid', 'old']);
  });

  it('★ 빈 방은 목록에 넣지 않는다', () => {
    /*
     * 열었다가 아무 말도 안 하고 나간 자리다. 목록에 남으면 "새로운 대화"
     * 만 쌓이고, 정작 찾으려는 대화가 밀려난다.
     */
    saveThread({ ...thread('empty', 10), messages: [] });
    expect(listThreads()).toHaveLength(0);
    // 다만 저장 자체는 되어 있다 — 이어서 말하면 그때 목록에 뜬다
    expect(readThread('empty')).not.toBeNull();
  });

  it('마지막 말이 미리보기로 온다', () => {
    saveThread(thread('a', 10));
    expect(listThreads()[0].preview).toBe('안녕하세요');
  });

  it('지운 것은 사라진다', () => {
    saveThread(thread('a', 10));
    saveThread(thread('b', 20));
    deleteThread('a');
    expect(listThreads().map((t) => t.id)).toEqual(['b']);
    expect(readThread('a')).toBeNull();
  });

  it('탈퇴하면 전부 사라진다', () => {
    saveThread(thread('a', 10));
    saveThread(thread('b', 20));
    clearThreads();
    expect(listThreads()).toHaveLength(0);
  });

  it('★ 무한히 쌓이지 않는다', () => {
    /*
     * 저장소가 가득 차면 쓰기가 실패하고, 그러면 이번 대화까지 통째로
     * 사라진다. 오래된 것을 버리는 편이 낫다.
     */
    for (let i = 0; i < 60; i += 1) saveThread(thread(`t${i}`, i));
    const list = listThreads();
    expect(list.length).toBeLessThanOrEqual(40);
    // 남은 것은 최근 것이어야 한다
    expect(list[0].id).toBe('t59');
  });

  it('★ 저장소가 막혀 있어도 던지지 않는다', () => {
    /*
     * 사파리 프라이빗 모드나 저장소가 가득 찬 상황에서는 읽기·쓰기가
     * 예외를 던진다. 그 예외가 렌더 중에 터지면 화면 전체가 빈다.
     */
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    try {
      expect(() => saveThread(thread('a', 10))).not.toThrow();
      expect(listThreads()).toEqual([]);
      expect(readThread('a')).toBeNull();
      expect(() => clearThreads()).not.toThrow();
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it('모르는 모양이 남아 있어도 목록이 깨지지 않는다', () => {
    // 예전 버전이 남긴 값일 수 있다. 모르는 것은 없는 것으로 친다.
    window.localStorage.setItem('eden.threads', JSON.stringify([{ nope: true }, 42, null]));
    expect(listThreads()).toEqual([]);
  });

  it('JSON 이 아니어도 목록이 깨지지 않는다', () => {
    window.localStorage.setItem('eden.threads', '{{{');
    expect(listThreads()).toEqual([]);
  });
});

describe('목록에 보일 이름', () => {
  it('질문에서 시작했으면 그 질문이 이름이 된다', () => {
    expect(titleFor({ question: '요즘 너무 불안해요' })).toBe('요즘 너무 불안해요');
  });

  it('질문이 없으면 처음 한 말을 쓴다', () => {
    expect(titleFor({}, '무슨 말부터 해야 할지 모르겠어요')).toBe(
      '무슨 말부터 해야 할지 모르겠어요',
    );
  });

  it('길면 자른다', () => {
    // 목록 한 줄에 들어가야 한다. 두 줄이 되면 대화 로그처럼 읽힌다.
    const long = '가'.repeat(80);
    const title = titleFor({ question: long });
    expect(title.length).toBeLessThanOrEqual(29);
    expect(title.endsWith('…')).toBe(true);
  });

  it('줄바꿈은 한 줄로 편다', () => {
    expect(titleFor({ question: '첫 줄\n둘째 줄' })).toBe('첫 줄 둘째 줄');
  });

  it('둘 다 없으면 기본 이름을 쓴다', () => {
    expect(titleFor({})).toBe('새로운 대화');
    expect(titleFor({ question: '   ' })).toBe('새로운 대화');
  });
});
