/*
 * services/apiTimeout.test.ts
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 응답이 안 와도 화면이 영원히 기다리지 않는가.
 *
 * ★ fetch 는 스스로 포기하지 않는다.
 *   서버가 응답하지 않으면 로딩 표시가 무한히 돌고, 사용자는 "멈췄다" 와
 *   "느리다" 를 구분할 수 없다. 실패는 빨리 드러나는 편이 낫다.
 *
 * ★ 취소와 시간 초과를 구분하는지도 함께 본다.
 *   둘 다 AbortError 로 온다. 구분하지 않으면 화면을 떠난 사용자에게
 *   "응답이 늦습니다" 를 띄우거나, 정말 느린 서버를 취소로 처리해
 *   아무 말 없이 넘어간다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, TimeoutError } from './apiClient';

/** 신호가 끊길 때까지 영원히 기다리는 fetch */
function hangingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }),
  );
}

const realFetch = globalThis.fetch;

describe('요청 타임아웃', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it('시간이 지나면 TimeoutError 로 끊는다', async () => {
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;

    const promise = api('/api/v1/scripture/galaxies/', { timeoutMs: 5_000 });
    // 실패를 붙잡아 두지 않으면 unhandled rejection 이 된다.
    const settled = promise.catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(5_001);

    const caught = await settled;
    expect(caught).toBeInstanceOf(TimeoutError);
  });

  it('사용자가 취소한 것은 TimeoutError 가 아니다', async () => {
    /*
     * ★ 화면을 떠난 사람에게 "응답이 늦습니다" 를 띄우면 안 된다.
     *   그건 실패가 아니라 사용자가 그만둔 것이다.
     */
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;

    const controller = new AbortController();
    const settled = api('/api/v1/scripture/galaxies/', {
      signal: controller.signal,
      timeoutMs: 10_000,
    }).catch((e: unknown) => e);

    controller.abort();
    await vi.advanceTimersByTimeAsync(1);

    const caught = await settled;
    expect(caught).not.toBeInstanceOf(TimeoutError);
    expect((caught as Error).name).toBe('AbortError');
  });

  it('timeoutMs 가 0 이면 기다린다 (스트리밍용)', async () => {
    /*
     * ★ 긴 답변은 연결이 수십 초 열려 있는 것이 정상이다.
     *   여기에 타임아웃이 걸리면 잘 나오던 답이 중간에 끊긴다.
     */
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;

    let settledWith: unknown = null;
    void api('/api/v1/chat/stream/', { timeoutMs: 0 }).catch((e: unknown) => {
      settledWith = e;
    });

    await vi.advanceTimersByTimeAsync(120_000);
    expect(settledWith).toBeNull();
  });
});
