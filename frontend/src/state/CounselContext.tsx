/*
 * state/CounselContext.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 상담 대화 상태. 메시지 추가/전송중 상태만 다루는 얇은 reducer.
 * (실제 대화 UI는 Phase 6에서 붙는다)
 */

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { CounselMessage, CounselSeed } from '../data/types';

interface CounselState {
  threadId: string | null;
  seed: CounselSeed;
  messages: CounselMessage[];
  /** 안내자 응답 대기 중 */
  pending: boolean;
  error: string | null;
  /** 오류의 실제 원인. 서버가 알려 준 문장을 그대로 담는다. */
  errorDetail?: string;
}

type CounselAction =
  | { type: 'thread/started'; threadId: string; opening: CounselMessage; seed: CounselSeed }
  | { type: 'message/sent'; message: CounselMessage }
  | { type: 'message/received'; message: CounselMessage }
  /*
   * 스트리밍 시작 — 빈 말풍선을 먼저 세운다.
   *
   * ★ 왜 빈 말풍선인가
   *   답변이 다 올 때까지 기다렸다가 한 번에 붙이면, 그건 스트리밍이
   *   아니라 그냥 느린 응답이다. 자리를 먼저 잡아 두고 글자를 그 안에
   *   흘려 넣어야 "지금 쓰고 있다"는 감각이 생긴다.
   */
  | { type: 'stream/started'; id: string; verseId?: string }
  /** 조각 도착 — 마지막 말풍선에 이어 붙인다 */
  | { type: 'stream/chunk'; text: string }
  /** 스트리밍 종료. 대기 상태를 푼다. */
  | { type: 'stream/ended' }
  /**
   * @param detail 서버가 알려 준 원인. 화면에 작게 덧붙는다.
   *               감추면 사용자도 개발자도 다음에 뭘 할지 알 수 없다.
   */
  | { type: 'error'; message: string; detail?: string }
  | { type: 'reset' };

const initialState: CounselState = {
  threadId: null,
  seed: {},
  messages: [],
  pending: false,
  error: null,
};

function reducer(state: CounselState, action: CounselAction): CounselState {
  switch (action.type) {
    case 'thread/started':
      return {
        threadId: action.threadId,
        seed: action.seed,
        messages: [action.opening],
        pending: false,
        error: null,
      };
    case 'message/sent':
      return {
        ...state,
        messages: [...state.messages, action.message],
        pending: true,
        error: null,
      };
    case 'message/received':
      return { ...state, messages: [...state.messages, action.message], pending: false };

    case 'stream/started':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.id,
            role: 'guide',
            text: '',
            verseId: action.verseId,
            createdAt: Date.now(),
          },
        ],
        // 조각이 들어오는 동안에도 대기 상태다 — 아직 끝나지 않았다
        pending: true,
        error: null,
      };

    case 'stream/chunk': {
      /*
       * 마지막 말풍선에만 이어 붙인다.
       *
       * ★ 없으면 조용히 무시한다.
       *   화면을 떠난 뒤 늦게 도착한 조각이 새 대화에 끼어드는 것을
       *   막는다. 여기서 새 말풍선을 만들면 전 대화의 답변 꼬리가
       *   다음 대화 첫 줄로 나타난다.
       */
      const last = state.messages[state.messages.length - 1];
      if (!last || last.role !== 'guide') return state;

      const updated = { ...last, text: last.text + action.text };
      return { ...state, messages: [...state.messages.slice(0, -1), updated] };
    }

    case 'stream/ended':
      return { ...state, pending: false };

    case 'error':
      return { ...state, pending: false, error: action.message, errorDetail: action.detail };
    case 'reset':
      return initialState;
    default:
      return state;
  }
}

const CounselContext = createContext<{
  state: CounselState;
  dispatch: Dispatch<CounselAction>;
} | null>(null);

export function CounselProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <CounselContext.Provider value={value}>{children}</CounselContext.Provider>;
}

export function useCounsel() {
  const ctx = useContext(CounselContext);
  if (!ctx) throw new Error('useCounsel must be used within CounselProvider');
  return ctx;
}
