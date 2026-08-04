/*
 * services/sse.ts
 * ───────────────────────────────────────────────────────────────────────
 * text/event-stream 을 읽는다.
 *
 * ★ 왜 EventSource 를 쓰지 않는가
 *   브라우저 기본 EventSource 는 GET 만 보내고 헤더를 붙일 수 없다.
 *   이 API 는 POST 에 Authorization 이 필요하므로 애초에 쓸 수 없다.
 *
 * ★ 왜 라이브러리를 쓰지 않는가
 *   @microsoft/fetch-event-source 가 흔한 선택이지만, 그 라이브러리가
 *   해 주는 일 중 우리가 필요한 것은 "청크를 줄 단위로 자르는 것"뿐이다.
 *   자동 재연결은 오히려 해롭다 — 답변이 반쯤 나오다 끊겼을 때 다시
 *   요청하면 같은 질문이 두 번 저장되고, 서버는 답변도 두 번 만든다.
 *   40줄이면 되는 일에 의존성을 늘리지 않는다.
 *
 * ★ 청크 경계는 줄 경계가 아니다
 *   네트워크가 주는 조각은 "data: {"con" 처럼 아무 데서나 끊긴다.
 *   버퍼에 이어 붙였다가 개행이 나올 때만 잘라야 한다. 이걸 빠뜨리면
 *   긴 답변에서만, 그것도 가끔 JSON 파싱이 깨진다.
 */

/** 스트림이 끝났음을 알리는 약속된 문자열 */
export const SSE_DONE = '[DONE]';

export interface SseHandlers {
  /** data: 한 줄이 도착할 때마다. `[DONE]` 은 여기로 오지 않는다. */
  onData: (raw: string) => void;
  /** 서버가 [DONE] 을 보냈을 때 */
  onDone?: () => void;
}

/**
 * 응답 본문을 SSE 로 읽는다.
 *
 * @param signal 중단 신호. 화면을 떠나면 읽기를 멈춘다 —
 *               멈추지 않으면 언마운트된 컴포넌트에 계속 상태를 밀어 넣는다.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  handlers: SseHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      if (signal?.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      // stream: true — 여러 바이트로 된 한글이 청크 경계에서 잘려도 안전하다
      buffer += decoder.decode(value, { stream: true });

      /*
       * 마지막 조각은 아직 완성되지 않았을 수 있으므로 버퍼에 남긴다.
       * split 결과의 끝을 pop 해서 다음 청크와 이어 붙인다.
       */
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        // 빈 줄은 이벤트 구분자, ':' 로 시작하는 줄은 주석(keep-alive)이다
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice('data:'.length).trim();
        if (payload === SSE_DONE) {
          handlers.onDone?.();
          return;
        }
        handlers.onData(payload);
      }
    }

    // 서버가 [DONE] 없이 연결을 닫은 경우에도 끝은 끝이다
    handlers.onDone?.();
  } finally {
    /*
     * 이미 끝난 스트림에 cancel 을 부르면 예외가 날 수 있다.
     * 여기서 던지면 정작 화면이 알아야 할 오류를 덮어 버린다.
     */
    try {
      await reader.cancel();
    } catch {
      /* 무시 */
    }
  }
}

/** `data:` 한 줄을 해석한 결과 */
export type SseChunk =
  | { kind: 'content'; text: string }
  | { kind: 'error'; message: string }
  | { kind: 'unknown' };

/**
 * 서버가 보내는 두 가지 모양을 가른다.
 *
 *   {"content": "안녕"}          → 글자 조각
 *   {"error": "LLM 스트리밍 실패"} → 오류
 *
 * 모르는 모양은 조용히 흘려보낸다. 서버가 나중에 필드를 하나 더 붙였다고
 * 화면이 멈추면 안 된다.
 */
export function parseSseChunk(raw: string): SseChunk {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { kind: 'unknown' };

    const obj = parsed as Record<string, unknown>;
    if (typeof obj.content === 'string') return { kind: 'content', text: obj.content };
    if (typeof obj.error === 'string') return { kind: 'error', message: obj.error };
    return { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
}
