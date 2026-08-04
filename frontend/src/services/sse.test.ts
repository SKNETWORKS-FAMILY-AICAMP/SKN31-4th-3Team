/*
 * SSE 읽기.
 *
 * 여기서 잡아야 하는 고장은 하나다 — **청크 경계가 줄 경계와 다르다.**
 * 네트워크는 `data: {"con` 처럼 아무 데서나 끊어서 준다. 이걸 처리하지
 * 않으면 짧은 답변에서는 멀쩡하다가 긴 답변에서만, 그것도 가끔 깨진다.
 * 손으로 재현하기 가장 어려운 종류의 버그라 테스트로 못박는다.
 */

import { describe, expect, it, vi } from 'vitest';
import { parseSseChunk, readEventStream } from './sse';

/** 주어진 조각들을 그대로 흘려보내는 스트림을 만든다 */
function streamOf(pieces: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
}

/** 스트림을 끝까지 읽고 받은 data 줄들을 돌려준다 */
async function collect(pieces: string[]): Promise<{ data: string[]; done: boolean }> {
  const data: string[] = [];
  let done = false;
  await readEventStream(streamOf(pieces), {
    onData: (raw) => data.push(raw),
    onDone: () => {
      done = true;
    },
  });
  return { data, done };
}

describe('readEventStream', () => {
  it('한 줄씩 온 데이터를 그대로 읽는다', async () => {
    const { data } = await collect([
      'data: {"content": "안녕"}\n\n',
      'data: {"content": "하세요"}\n\n',
    ]);
    expect(data).toEqual(['{"content": "안녕"}', '{"content": "하세요"}']);
  });

  it('★ 줄 중간에서 끊긴 청크를 이어 붙인다', async () => {
    // 실제 네트워크가 주는 모양이다
    const { data } = await collect(['data: {"con', 'tent": "안녕"}\n\n', 'data: {"content"', ': "하세요"}\n\n']);
    expect(data).toEqual(['{"content": "안녕"}', '{"content": "하세요"}']);
  });

  it('★ 한 청크에 여러 줄이 들어와도 모두 읽는다', async () => {
    const { data } = await collect([
      'data: {"content": "가"}\n\ndata: {"content": "나"}\n\ndata: {"content": "다"}\n\n',
    ]);
    expect(data).toHaveLength(3);
  });

  it('[DONE] 을 만나면 끝난 것으로 본다', async () => {
    const { data, done } = await collect(['data: {"content": "안녕"}\n\n', 'data: [DONE]\n\n']);
    expect(data).toEqual(['{"content": "안녕"}']);
    expect(done).toBe(true);
  });

  it('★ [DONE] 뒤의 내용은 읽지 않는다', async () => {
    // 서버가 실수로 더 보내도 끝난 대화에 글자가 더 붙으면 안 된다
    const { data } = await collect(['data: [DONE]\n\n', 'data: {"content": "덤"}\n\n']);
    expect(data).toEqual([]);
  });

  it('★ [DONE] 없이 끊겨도 끝났다고 알린다', async () => {
    // 그러지 않으면 "답변 생성 중…" 이 영원히 남는다
    const { done } = await collect(['data: {"content": "안녕"}\n\n']);
    expect(done).toBe(true);
  });

  it('keep-alive 주석과 빈 줄은 무시한다', async () => {
    const { data } = await collect([': ping\n\n', '\n', 'data: {"content": "안녕"}\n\n']);
    expect(data).toEqual(['{"content": "안녕"}']);
  });

  it('data: 가 아닌 줄은 무시한다', async () => {
    const { data } = await collect(['event: message\n', 'id: 7\n', 'data: {"content": "안녕"}\n\n']);
    expect(data).toEqual(['{"content": "안녕"}']);
  });

  it('★ 한글이 청크 경계에서 잘려도 깨지지 않는다', async () => {
    /*
     * 한글은 UTF-8 로 3바이트다. 조각이 그 사이에서 끊기면 디코딩이
     * 깨진다 — TextDecoder 를 stream 모드로 써야만 이어진다.
     */
    const encoder = new TextEncoder();
    const full = encoder.encode('data: {"content": "말씀"}\n\n');
    const cut = 20; // "말" 한가운데 어딘가

    const data: string[] = [];
    await readEventStream(
      new ReadableStream({
        start(controller) {
          controller.enqueue(full.slice(0, cut));
          controller.enqueue(full.slice(cut));
          controller.close();
        },
      }),
      { onData: (raw) => data.push(raw) },
    );

    expect(JSON.parse(data[0]).content).toBe('말씀');
  });

  it('중단 신호를 받으면 더 읽지 않는다', async () => {
    const onData = vi.fn();
    const controller = new AbortController();
    controller.abort();

    await readEventStream(streamOf(['data: {"content": "안녕"}\n\n']), { onData }, controller.signal);
    expect(onData).not.toHaveBeenCalled();
  });
});

describe('parseSseChunk', () => {
  it('글자 조각을 알아본다', () => {
    expect(parseSseChunk('{"content": "안녕"}')).toEqual({ kind: 'content', text: '안녕' });
  });

  it('빈 문자열 조각도 조각이다', () => {
    // 서버가 공백만 보낼 수 있다. unknown 으로 흘려보내면 띄어쓰기가 사라진다.
    expect(parseSseChunk('{"content": ""}')).toEqual({ kind: 'content', text: '' });
  });

  it('오류를 알아본다', () => {
    expect(parseSseChunk('{"error": "LLM 실패"}')).toEqual({ kind: 'error', message: 'LLM 실패' });
  });

  it('★ 모르는 모양은 조용히 넘긴다', () => {
    // 서버가 필드를 하나 더 붙였다고 화면이 멈추면 안 된다.
    expect(parseSseChunk('{"usage": {"tokens": 12}}').kind).toBe('unknown');
  });

  it('JSON 이 아니어도 던지지 않는다', () => {
    expect(parseSseChunk('그냥 글자').kind).toBe('unknown');
    expect(parseSseChunk('null').kind).toBe('unknown');
  });
});
