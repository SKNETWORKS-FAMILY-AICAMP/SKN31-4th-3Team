/*
 * galaxy/quality.ts
 * ───────────────────────────────────────────────────────────────────────
 * 렌더링 품질 티어 결정.
 *
 * 처음부터 무거운 구조를 만들지 않는다는 원칙에 따라, 기기 성능을 추정해
 * 별 개수와 효과를 조절한다. Phase 2에서 실측 FPS 기반 자동 강등을 붙인다.
 */

import type { QualityProfile, QualityTier } from '../data/types';

/*
 * 먼지(dust)는 구절 데이터와 무관한 장식 입자다.
 * 은하의 밀도를 만드는 몫이라 배경 별보다 훨씬 많이 둔다 — 대신 아주 어둡고
 * 작아서 개별 입자의 렌더 비용은 낮다.
 */
export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  high: {
    tier: 'high',
    backdropCount: 2300,
    dustCount: 7600,
    haze: true,
    glow: true,
    streaks: true,
    rotate: true,
  },
  medium: {
    tier: 'medium',
    backdropCount: 1100,
    dustCount: 3800,
    haze: true,
    glow: true,
    streaks: false,
    rotate: true,
  },
  low: {
    tier: 'low',
    backdropCount: 420,
    dustCount: 1500,
    haze: false,
    glow: false,
    streaks: false,
    rotate: false,
  },
  /** reduced-motion 전용. 정적 구성이며 자전하지 않는다. */
  still: {
    tier: 'still',
    backdropCount: 420,
    dustCount: 1500,
    // 안개는 움직이지 않으므로 모션 축소에서도 문제없다 — 오히려 정적 화면을 채워준다.
    haze: true,
    glow: false,
    streaks: false,
    rotate: false,
  },
};

interface DeviceHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  width: number;
  coarsePointer: boolean;
  reducedMotion: boolean;
}

/** 브라우저에서 힌트를 수집한다. 서버/테스트에서는 안전한 기본값을 쓴다. */
export function readDeviceHints(): DeviceHints {
  if (typeof window === 'undefined') {
    return { width: 1280, coarsePointer: false, reducedMotion: false };
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    width: window.innerWidth,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

/** 힌트로 초기 티어를 정한다. 확신이 없으면 보수적으로 낮춘다. */
export function resolveInitialTier(hints: DeviceHints = readDeviceHints()): QualityTier {
  if (hints.reducedMotion) return 'still';

  const memory = hints.deviceMemory ?? 4;
  const cores = hints.hardwareConcurrency ?? 4;

  if (memory <= 2 || cores <= 2) return 'low';
  if (hints.coarsePointer && hints.width < 768) return 'low';
  if (memory <= 4 || cores <= 4) return 'medium';
  if (hints.width < 1024) return 'medium';
  return 'high';
}

/** 한 단계 강등. 실측 FPS가 목표를 밑돌 때 호출한다. */
export function degrade(tier: QualityTier): QualityTier {
  if (tier === 'high') return 'medium';
  if (tier === 'medium') return 'low';
  return tier;
}

export function profileFor(tier: QualityTier): QualityProfile {
  return QUALITY_PROFILES[tier];
}
