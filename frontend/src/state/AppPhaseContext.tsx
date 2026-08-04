/*
 * state/AppPhaseContext.tsx
 * ───────────────────────────────────────────────────────────────────────
 * "지금 무엇이 벌어지는가"를 라우트와 별개로 관리한다.
 * 라우트는 주소를, phase는 연출 상태를 담당한다.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppPhase } from '../data/types';

const INTRO_SEEN_KEY = 'eden.introSeen';

interface AppPhaseValue {
  phase: AppPhase;
  setPhase: (phase: AppPhase) => void;
  /** 이번 세션에서 인트로를 이미 봤는가 */
  introSeen: boolean;
  markIntroSeen: () => void;
}

const AppPhaseContext = createContext<AppPhaseValue | null>(null);

function readIntroSeen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    // 프라이빗 모드 등에서 sessionStorage 접근이 막힐 수 있다.
    return false;
  }
}

export function AppPhaseProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AppPhase>(() => (readIntroSeen() ? 'home' : 'intro'));
  const [introSeen, setIntroSeen] = useState(readIntroSeen);

  const markIntroSeen = useCallback(() => {
    setIntroSeen(true);
    try {
      window.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {
      // 저장 실패해도 이번 세션 메모리 상태로는 동작한다.
    }
  }, []);

  const value = useMemo(
    () => ({ phase, setPhase, introSeen, markIntroSeen }),
    [phase, introSeen, markIntroSeen],
  );

  return <AppPhaseContext.Provider value={value}>{children}</AppPhaseContext.Provider>;
}

export function useAppPhase(): AppPhaseValue {
  const ctx = useContext(AppPhaseContext);
  if (!ctx) throw new Error('useAppPhase must be used within AppPhaseProvider');
  return ctx;
}
