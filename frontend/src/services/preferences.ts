/*
 * services/preferences.ts
 * ───────────────────────────────────────────────────────────────────────
 * 환경설정 값의 보관.
 *
 * ★ 설정은 남아야 설정이다
 *   화면 품질을 낮춰 두고 새로고침했더니 다시 높음으로 돌아가 있으면,
 *   그건 설정이 아니라 이번 화면에만 통하는 임시 스위치다.
 *
 * ★ 저장에 실패해도 앱은 돈다
 *   프라이빗 모드에서는 localStorage 가 예외를 던진다. 그때 잃는 것은
 *   "다음에도 기억한다"까지다. 화면이 사라지는 것보다 낫다.
 */

import type { QualityTier } from '../data/types';

/**
 * 화면 품질을 무엇으로 정할 것인가.
 *
 * - `auto` : 기기 사양으로 시작하고, 프레임이 떨어지면 스스로 한 단계 낮춘다.
 * - 그 외  : 사용자가 직접 고정한다. **자동 강등이 적용되지 않는다** —
 *            직접 고른 값을 시스템이 뒤에서 바꿔 버리면 고른 의미가 없다.
 */
export type QualityMode = 'auto' | Exclude<QualityTier, 'still'>;

/**
 * 움직임을 어떻게 다룰 것인가.
 *
 * - `system` : 기기의 "모션 줄이기" 설정을 따른다.
 * - `reduced`: 기기 설정과 무관하게 항상 정적으로.
 * - `full`   : 기기 설정과 무관하게 항상 움직이게.
 *
 * `full` 을 두는 이유는, 모션 줄이기를 켜 둔 채로도 이 화면의 연출만은
 * 보고 싶은 사람이 있기 때문이다. 기기 설정을 대신 꺼 주지는 않는다.
 */
export type MotionPreference = 'system' | 'reduced' | 'full';

const KEYS = {
  quality: 'eden.quality',
  motion: 'eden.motion',
} as const;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 기억하지 못할 뿐이다 */
  }
}

const QUALITY_MODES: readonly QualityMode[] = ['auto', 'high', 'medium', 'low'];
const MOTION_PREFERENCES: readonly MotionPreference[] = ['system', 'reduced', 'full'];

export function readQualityMode(): QualityMode {
  const saved = read(KEYS.quality);
  // 모르는 값(예전 버전이 남긴 것)은 기본값으로 되돌린다.
  return QUALITY_MODES.includes(saved as QualityMode) ? (saved as QualityMode) : 'auto';
}

export function writeQualityMode(mode: QualityMode): void {
  write(KEYS.quality, mode);
}

export function readMotionPreference(): MotionPreference {
  const saved = read(KEYS.motion);
  return MOTION_PREFERENCES.includes(saved as MotionPreference)
    ? (saved as MotionPreference)
    : 'system';
}

export function writeMotionPreference(pref: MotionPreference): void {
  write(KEYS.motion, pref);
}

/**
 * 최종적으로 모션을 줄일 것인가.
 *
 * 이 함수 하나가 판단의 유일한 자리다. 화면 여기저기서 각자 계산하면
 * 어떤 곳은 줄이고 어떤 곳은 안 줄이는 어중간한 상태가 된다.
 */
export function resolveReducedMotion(
  pref: MotionPreference,
  systemPrefersReduced: boolean,
): boolean {
  if (pref === 'reduced') return true;
  if (pref === 'full') return false;
  return systemPrefersReduced;
}
