/*
 * 상담 상태 — 특히 스트리밍.
 *
 * 답변이 조각으로 들어올 때 상태가 어떻게 자라는지가 전부다.
 * 여기가 틀리면 답변이 여러 말풍선으로 쪼개지거나, 지난 대화의 꼬리가
 * 새 대화 첫 줄에 붙는다.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CounselProvider, useCounsel } from './CounselContext';

function setup() {
  return renderHook(() => useCounsel(), { wrapper: CounselProvider });
}

const opening = { id: 'o1', role: 'guide' as const, text: '어서 오세요', createdAt: 1 };

/** 대화를 열고 사용자 메시지 하나를 보낸 상태 */
function started(result: ReturnType<typeof setup>['result']) {
  act(() => {
    result.current.dispatch({ type: 'thread/started', threadId: '7', opening, seed: {} });
    result.current.dispatch({
      type: 'message/sent',
      message: { id: 'u1', role: 'user', text: '요즘 잠이 안 와요', createdAt: 2 },
    });
  });
}

describe('스트리밍', () => {
  it('★ 조각이 하나의 말풍선에 이어 붙는다', () => {
    // 조각마다 말풍선을 만들면 한 답변이 열 개로 쪼개진다.
    const { result } = setup();
    started(result);

    act(() => {
      result.current.dispatch({ type: 'stream/started', id: 'a1' });
      result.current.dispatch({ type: 'stream/chunk', text: '많이' });
      result.current.dispatch({ type: 'stream/chunk', text: ' 지치셨' });
      result.current.dispatch({ type: 'stream/chunk', text: '겠어요' });
    });

    const messages = result.current.state.messages;
    expect(messages).toHaveLength(3); // 인사 + 사용자 + 답변 하나
    expect(messages[2].text).toBe('많이 지치셨겠어요');
    expect(messages[2].role).toBe('guide');
  });

  it('시작하자마자 빈 말풍선이 선다 — 자리를 먼저 잡는다', () => {
    const { result } = setup();
    started(result);
    act(() => result.current.dispatch({ type: 'stream/started', id: 'a1' }));

    const last = result.current.state.messages.at(-1)!;
    expect(last.text).toBe('');
    expect(last.role).toBe('guide');
  });

  it('★ 조각이 들어오는 동안에도 대기 상태다', () => {
    // 여기서 풀어 버리면 답변이 반쯤 나온 채로 입력창이 열린다.
    const { result } = setup();
    started(result);

    act(() => {
      result.current.dispatch({ type: 'stream/started', id: 'a1' });
      result.current.dispatch({ type: 'stream/chunk', text: '조금' });
    });
    expect(result.current.state.pending).toBe(true);

    act(() => result.current.dispatch({ type: 'stream/ended' }));
    expect(result.current.state.pending).toBe(false);
  });

  it('구절 문맥이 답변에 실린다', () => {
    const { result } = setup();
    started(result);
    act(() => result.current.dispatch({ type: 'stream/started', id: 'a1', verseId: 'ps-23-1' }));

    expect(result.current.state.messages.at(-1)!.verseId).toBe('ps-23-1');
  });

  it('★ 시작하지 않은 채 온 조각은 버린다', () => {
    /*
     * 화면을 떠난 뒤 늦게 도착한 조각이다. 여기서 새 말풍선을 만들면
     * 전 대화의 답변 꼬리가 다음 대화 첫 줄로 나타난다.
     */
    const { result } = setup();
    started(result);
    const before = result.current.state.messages.length;

    act(() => result.current.dispatch({ type: 'stream/chunk', text: '늦게 온 조각' }));

    expect(result.current.state.messages).toHaveLength(before);
    expect(result.current.state.messages.at(-1)!.role).toBe('user');
  });

  it('스트리밍이 시작되면 지난 오류는 걷힌다', () => {
    const { result } = setup();
    started(result);

    act(() => {
      result.current.dispatch({ type: 'error', message: '답변을 받지 못했습니다.' });
      result.current.dispatch({ type: 'stream/started', id: 'a2' });
    });

    expect(result.current.state.error).toBeNull();
  });
});

describe('기본 흐름', () => {
  it('대화를 열면 인사 하나로 시작한다', () => {
    const { result } = setup();
    act(() =>
      result.current.dispatch({ type: 'thread/started', threadId: '7', opening, seed: {} }),
    );

    expect(result.current.state.threadId).toBe('7');
    expect(result.current.state.messages).toEqual([opening]);
  });

  it('한 번에 받는 경로도 그대로 동작한다', () => {
    // 스트리밍이 막히는 환경에서 물러설 길이다.
    const { result } = setup();
    started(result);

    act(() =>
      result.current.dispatch({
        type: 'message/received',
        message: { id: 'a1', role: 'guide', text: '한 번에 온 답변', createdAt: 3 },
      }),
    );

    expect(result.current.state.messages.at(-1)!.text).toBe('한 번에 온 답변');
    expect(result.current.state.pending).toBe(false);
  });

  it('초기화하면 처음 상태로 돌아간다', () => {
    const { result } = setup();
    started(result);
    act(() => result.current.dispatch({ type: 'reset' }));

    expect(result.current.state.threadId).toBeNull();
    expect(result.current.state.messages).toEqual([]);
  });
});
