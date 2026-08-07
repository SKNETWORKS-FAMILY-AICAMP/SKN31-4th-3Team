/*
 * galaxy/twinkle.test.ts
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 별이 서로 다르게, 그러나 사라지지는 않게 흔들리는가.
 *
 * ★ "예뻐 보이는가" 는 못 잰다.
 *   대신 예뻐 보이지 않게 되는 조건들을 못 박는다 — 다 같이 깜빡이거나,
 *   너무 어두워져 사라지거나, 프레임마다 값이 튀는 경우다.
 */

import { describe, expect, it } from 'vitest';
import { twinkleAt, TWINKLE_DEPTH } from './twinkle';

describe('별 반짝임', () => {
  it('밝기 배수가 정해진 폭 안에 머문다', () => {
    /*
     * ★ 0 근처로 내려가면 안 된다.
     *   별이 사라졌다 나타나면 그건 반짝임이 아니라 점멸이고, 클릭
     *   대상이 깜빡이는 셈이 된다.
     */
    const floor = 1 - TWINKLE_DEPTH * 2; // 가장 어두운 별의 하한
    for (let i = 0; i < 200; i += 1) {
      for (let t = 0; t < 20; t += 0.37) {
        const v = twinkleAt(i, t, i % 2 === 0 ? 0 : 1);
        expect(v).toBeGreaterThan(floor);
        expect(v).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('같은 순간에 별마다 밝기가 다르다', () => {
    // ★ 다 같이 깜빡이면 하늘이 아니라 신호등이 된다.
    const values = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      values.add(twinkleAt(i, 3.2, 0.5).toFixed(4));
    }
    expect(values.size).toBeGreaterThan(40);
  });

  it('시간이 지나면 같은 별의 밝기가 달라진다', () => {
    const a = twinkleAt(7, 0, 0.5);
    const b = twinkleAt(7, 1.9, 0.5);
    expect(Math.abs(a - b)).toBeGreaterThan(0.01);
  });

  it('어두운 별이 더 크게 흔들린다', () => {
    /*
     * ★ 실제로도 그렇다.
     *   밝은 별은 광량이 많아 흔들림이 작게 느껴진다. 이 비율이 맞아야
     *   밝은 별이 "중심" 으로 읽힌다.
     */
    const spread = (magnitude: number) => {
      let min = Infinity;
      let max = -Infinity;
      for (let t = 0; t < 30; t += 0.1) {
        const v = twinkleAt(3, t, magnitude);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      return max - min;
    };

    expect(spread(0.1)).toBeGreaterThan(spread(0.9));
  });

  it('같은 입력이면 늘 같은 값이다', () => {
    // ★ 순수 함수라야 프레임을 건너뛰어도 어긋나지 않는다.
    expect(twinkleAt(11, 4.25, 0.3)).toBe(twinkleAt(11, 4.25, 0.3));
  });

  it('한 프레임 사이에 값이 튀지 않는다', () => {
    /*
     * ★ 60fps 한 프레임(약 0.017초) 만에 크게 변하면 깜빡임으로 보인다.
     *   주기가 충분히 길다는 것을 이 방식으로 확인한다.
     */
    for (let i = 0; i < 40; i += 1) {
      for (let t = 0; t < 10; t += 0.5) {
        const step = Math.abs(twinkleAt(i, t, 0.5) - twinkleAt(i, t + 1 / 60, 0.5));
        expect(step).toBeLessThan(0.03);
      }
    }
  });
});
