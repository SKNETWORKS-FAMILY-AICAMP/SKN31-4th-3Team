/*
 * galaxy/easing.ts
 * 애니메이션 이징. CSS 토큰의 --ease-* 와 짝을 이룬다.
 */

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 호흡감 — 시작과 끝이 모두 느리다. 인트로 수렴에 쓴다. */
export function easeBreath(t: number): number {
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * 별/먼지 하나의 수렴 진행도.
 * 지연 계수만큼 늦게 출발하고, 남은 구간을 호흡 이징으로 채운다.
 * 엔진과 먼지 레이어가 같은 규칙을 써야 인트로가 한 몸으로 움직인다.
 */
export function convergeProgress(delay: number, convergence: number): number {
  if (convergence >= 1) return 1;
  const span = 1 - delay;
  if (span <= 0) return 0;
  return easeBreath(clamp((convergence - delay) / span, 0, 1));
}
