/*
 * state/IntroChannel.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 캔버스 엔진 ↔ 인트로 UI 사이의 얇은 채널.
 *
 * 왜 Context state 가 아니라 pub/sub 인가:
 *   인트로 문장의 불투명도는 초당 60회 바뀐다. 이것을 React state 로 올리면
 *   프레임마다 리렌더가 발생한다. 대신 구독자가 DOM 스타일을 직접 만지도록
 *   하고, 문장이 바뀌는 순간(총 4회)만 state 로 승격시킨다.
 */

import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { IntroFrame } from '../galaxy/GalaxyEngine';

type FrameListener = (frame: IntroFrame) => void;
type DoneListener = () => void;

interface IntroChannelValue {
  /** 엔진이 매 프레임 호출한다. */
  publishFrame: (frame: IntroFrame) => void;
  /** 엔진이 인트로 종료 시 호출한다. */
  publishDone: () => void;
  subscribeFrame: (listener: FrameListener) => () => void;
  subscribeDone: (listener: DoneListener) => () => void;
  /** 엔진이 자신의 skip 구현을 등록한다. */
  registerSkip: (fn: () => void) => void;
  /** UI가 건너뛰기를 요청한다. */
  requestSkip: () => void;
}

const IntroChannelContext = createContext<IntroChannelValue | null>(null);

export function IntroChannelProvider({ children }: { children: ReactNode }) {
  const frameListeners = useRef(new Set<FrameListener>());
  const doneListeners = useRef(new Set<DoneListener>());
  const skipFn = useRef<(() => void) | null>(null);

  const value = useMemo<IntroChannelValue>(
    () => ({
      publishFrame: (frame) => {
        frameListeners.current.forEach((l) => l(frame));
      },
      publishDone: () => {
        doneListeners.current.forEach((l) => l());
      },
      subscribeFrame: (listener) => {
        frameListeners.current.add(listener);
        return () => frameListeners.current.delete(listener) as unknown as void;
      },
      subscribeDone: (listener) => {
        doneListeners.current.add(listener);
        return () => doneListeners.current.delete(listener) as unknown as void;
      },
      registerSkip: (fn) => {
        skipFn.current = fn;
      },
      requestSkip: () => {
        skipFn.current?.();
      },
    }),
    [],
  );

  return <IntroChannelContext.Provider value={value}>{children}</IntroChannelContext.Provider>;
}

export function useIntroChannel(): IntroChannelValue {
  const ctx = useContext(IntroChannelContext);
  if (!ctx) throw new Error('useIntroChannel must be used within IntroChannelProvider');
  return ctx;
}
