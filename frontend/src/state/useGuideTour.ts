/*
 * state/useGuideTour.ts
 * ───────────────────────────────────────────────────────────────────────
 * 이용 안내를 언제 띄울지.
 *
 * ★ 처음 온 사람에게만 자동으로 뜬다
 *   매번 뜨는 안내는 읽히지 않는다 — 사람은 내용보다 닫는 법을 먼저 배운다.
 *
 * ★ 인트로가 끝난 뒤에 뜬다
 *   창세기 문장이 흐르는 화면에 설명 카드가 얹히면 연출이 통째로 깨진다.
 *   그래서 인트로 라우트가 아니라 홈에서 연다.
 *
 * ★ 저장에 실패해도 앱은 돈다
 *   프라이빗 모드에서는 localStorage 가 예외를 던진다. 그때 얻는 손해는
 *   "안내가 다음에도 뜬다"까지다. 화면이 사라지는 것보다 낫다.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'eden.guideSeen';

function hasSeen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // 확인할 수 없으면 "봤다"로 친다.
    // 반대로 두면 저장이 막힌 브라우저에서 방문할 때마다 안내가 뜬다.
    return true;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* 기억하지 못할 뿐이다 */
  }
}

/** 그만둔 뒤 "다시 여는 법" 안내가 떠 있는 시간 */
export const HINT_MS = 6000;

export interface GuideTourControl {
  open: boolean;
  /** 환경설정에서 다시 열 때 쓴다. 처음 단계부터 시작한다. */
  start: () => void;
  close: () => void;
  /**
   * 방금 그만두었는가.
   *
   * 그만둔 직후에 "다시 여는 법"을 한 줄 알려 주기 위한 값이다.
   * 이 안내가 없으면 실수로 닫은 사람은 튜토리얼을 영영 잃는다 —
   * 다시 뜨지 않도록 만들어 둔 것이 그대로 함정이 된다.
   */
  hint: boolean;
  dismissHint: () => void;
}

/**
 * @param eligible 지금 화면이 안내를 띄워도 되는 자리인가.
 *                 홈에서만 true 를 넘긴다.
 */
export function useGuideTour(eligible: boolean): GuideTourControl {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!eligible || hasSeen()) return;
    /*
     * 한 박자 늦춘다.
     * 홈에 막 도착한 순간은 은하수가 자리를 잡는 중이라 앵커의 위치가
     * 아직 흔들린다. 그 프레임에 재면 카드가 엉뚱한 곳을 가리킨다.
     */
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  const dismissHint = useCallback(() => setHint(false), []);

  const close = useCallback(() => {
    setOpen(false);
    markSeen();
    setHint(true);
  }, []);

  const start = useCallback(() => {
    setHint(false);
    setOpen(true);
  }, []);

  // 안내는 스스로 사라진다. 닫으라고 또 시키지 않는다.
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(false), HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);

  return { open, start, close, hint, dismissHint };
}

/** 환경설정에서 "다시 보기"를 눌렀을 때, 다음 방문에도 뜨도록 되돌린다. */
export function forgetGuideSeen(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 무시 */
  }
}
