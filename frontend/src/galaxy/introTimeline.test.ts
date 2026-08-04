/*
 * galaxy/introTimeline.test.ts
 * Phase 2 검증 기준: 타임라인이 끊기거나 뒤로 가지 않는가.
 */

import { describe, expect, it } from 'vitest';
import {
  CREATION_BEATS,
  INTRO_DURATION,
  REDUCED_BEATS,
  REDUCED_INTRO_DURATION,
  REDUCED_TIMELINE,
  SETTLE_START,
  beatDuration,
  resolveBeat,
  resolveConvergence,
  resolveLuminance,
  resolvePulse,
} from './introTimeline';

describe('CREATION_BEATS', () => {
  it('창세기 문장 4개가 순서대로 있다', () => {
    expect(CREATION_BEATS).toHaveLength(4);
    expect(CREATION_BEATS[0].text).toContain('태초에');
    expect(CREATION_BEATS[1].text).toContain('빛이 있으라');
    expect(CREATION_BEATS[2].text).toContain('빛과 어둠을 나누사');
    expect(CREATION_BEATS[3].text).toContain('첫째 날');
  });

  it('문장 구간이 서로 겹치지 않는다', () => {
    for (let i = 1; i < CREATION_BEATS.length; i += 1) {
      const prev = CREATION_BEATS[i - 1];
      const prevEnd = prev.start + beatDuration(prev);
      expect(CREATION_BEATS[i].start, `beat ${i}`).toBeGreaterThanOrEqual(prevEnd);
    }
  });

  it('마지막 문장은 정착 구간 시작 전에 끝난다', () => {
    const last = CREATION_BEATS[CREATION_BEATS.length - 1];
    expect(last.start + beatDuration(last)).toBeLessThanOrEqual(SETTLE_START);
  });

  it('수렴도가 단조 증가하고 마지막에 1이 된다', () => {
    let prev = 0;
    for (const beat of CREATION_BEATS) {
      expect(beat.convergence).toBeGreaterThanOrEqual(prev);
      prev = beat.convergence;
    }
    expect(prev).toBe(1);
  });
});

describe('resolveBeat', () => {
  it('시작 전에는 활성 문장이 없다', () => {
    expect(resolveBeat(CREATION_BEATS, 0).index).toBe(-1);
  });

  it('각 문장의 유지 구간에서 불투명도가 1이다', () => {
    for (let i = 0; i < CREATION_BEATS.length; i += 1) {
      const beat = CREATION_BEATS[i];
      const mid = beat.start + beat.fadeIn + beat.hold / 2;
      const state = resolveBeat(CREATION_BEATS, mid);
      expect(state.index, `beat ${i}`).toBe(i);
      expect(state.opacity).toBeCloseTo(1, 5);
    }
  });

  it('불투명도가 항상 0..1 안에 있다', () => {
    for (let t = 0; t <= INTRO_DURATION; t += 0.05) {
      const { opacity } = resolveBeat(CREATION_BEATS, t);
      expect(opacity).toBeGreaterThanOrEqual(0);
      expect(opacity).toBeLessThanOrEqual(1);
    }
  });
});

describe('resolveConvergence', () => {
  it('시작 시점에는 거의 0, 종료 시점에는 1이다', () => {
    expect(resolveConvergence(CREATION_BEATS, 0)).toBeLessThan(0.02);
    expect(resolveConvergence(CREATION_BEATS, INTRO_DURATION)).toBe(1);
  });

  it('시간이 흐르면 뒤로 가지 않는다 (단조 증가)', () => {
    let prev = -1;
    for (let t = 0; t <= INTRO_DURATION; t += 0.05) {
      const v = resolveConvergence(CREATION_BEATS, t);
      expect(v, `t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = v;
    }
  });

  it('문장 사이 호흡 구간에도 별이 계속 움직인다', () => {
    // beat1 종료(6.0) 직후와 beat2 시작 직후 사이에도 값이 변해야 한다.
    const a = resolveConvergence(CREATION_BEATS, 6.2);
    const b = resolveConvergence(CREATION_BEATS, 7.4);
    expect(b).toBeGreaterThan(a);
  });
});

describe('resolveLuminance / resolvePulse', () => {
  it('밝기가 0..1 범위를 벗어나지 않는다', () => {
    for (let t = 0; t <= INTRO_DURATION; t += 0.05) {
      const v = resolveLuminance(CREATION_BEATS, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('"빛이 있으라" 구간에만 광량 펄스가 발생한다', () => {
    const pulseBeat = CREATION_BEATS.find((b) => b.pulseAt !== undefined);
    expect(pulseBeat?.text).toContain('빛이 있으라');

    const at = pulseBeat!.pulseAt!;
    expect(resolvePulse(CREATION_BEATS, at)).toBeCloseTo(1, 5);
    expect(resolvePulse(CREATION_BEATS, at - 0.5)).toBe(0);
    expect(resolvePulse(CREATION_BEATS, at + 1.2)).toBe(0);
  });
});

describe('reduced-motion 타임라인', () => {
  it('별 이동이 없다 (수렴도가 처음부터 1)', () => {
    for (const beat of REDUCED_BEATS) {
      expect(beat.convergence).toBe(1);
    }
    // 타임라인 초기값까지 함께 확인한다 — 0에서 시작하면 별이 날아든다.
    expect(REDUCED_TIMELINE.initialConvergence).toBe(1);
    expect(
      resolveConvergence(REDUCED_BEATS, 0, REDUCED_TIMELINE.initialConvergence),
    ).toBe(1);
  });

  it('광량 펄스가 제거된다', () => {
    for (const beat of REDUCED_BEATS) {
      expect(beat.pulseAt).toBeUndefined();
    }
    expect(resolvePulse(REDUCED_BEATS, 7.4)).toBe(0);
  });

  it('총 길이가 기본 타임라인보다 짧다', () => {
    expect(REDUCED_INTRO_DURATION).toBeLessThan(INTRO_DURATION);
    const last = REDUCED_BEATS[REDUCED_BEATS.length - 1];
    expect(last.start + beatDuration(last)).toBeLessThanOrEqual(REDUCED_INTRO_DURATION);
  });

  it('문장 4개는 그대로 유지된다', () => {
    expect(REDUCED_BEATS).toHaveLength(CREATION_BEATS.length);
    REDUCED_BEATS.forEach((beat, i) => {
      expect(beat.text).toBe(CREATION_BEATS[i].text);
    });
  });
});
