/*
 * galaxy/wordmark.test.ts
 * 검증 기준: 제목 연출의 구간이 순서대로 이어지고 겹치지 않는가.
 */

import { describe, expect, it } from 'vitest';
import {
  CREATION_BEATS,
  INTRO_DURATION,
  RISE_DURATION,
  RISE_START,
  SETTLE_DURATION,
  SETTLE_START,
  WORDMARK_FLASH_AT,
  WORDMARK_SETTLED,
  WORDMARK_START,
  WORDMARK_WRITE,
  beatDuration,
  resolveWordmark,
} from './introTimeline';
import {
  WordmarkLayer,
  minWeightFor,
  sweepGainAt,
  sweepPositionAt,
} from './WordmarkLayer';
import type { WordmarkShape } from './wordmark';

/** 실제 샘플링 대신 쓰는 최소 도형 (jsdom 은 픽셀을 읽지 못한다). */
function fakeShape(): WordmarkShape {
  const points = [];
  for (let i = 0; i < 40; i += 1) {
    const onContour = i % 5 === 0 || i % 5 === 4;
    points.push({
      x: i / 39,
      y: (i % 5) / 4,
      weight: onContour ? 1 : 0.3,
      nx: 0,
      ny: -1,
    });
  }
  return { points, links: [[0, 4], [5, 9]], aspect: 4, spacing: 3 / 1000 };
}

describe('제목 구간 배치', () => {
  it('마지막 창세기 문장이 끝난 뒤에 시작한다', () => {
    const last = CREATION_BEATS[CREATION_BEATS.length - 1];
    expect(WORDMARK_START).toBeGreaterThanOrEqual(last.start + beatDuration(last));
  });

  it('써지기 → 섬광 → 상승 순서가 지켜진다', () => {
    expect(WORDMARK_FLASH_AT).toBeCloseTo(WORDMARK_START + WORDMARK_WRITE, 6);
    expect(RISE_START).toBeGreaterThan(WORDMARK_FLASH_AT);
  });

  it('은하가 물러나는 구간과 제목이 올라가는 구간이 맞물린다', () => {
    expect(SETTLE_START).toBe(RISE_START);
    expect(SETTLE_DURATION).toBe(RISE_DURATION);
  });

  it('상승이 끝난 뒤에 인트로가 끝난다 (홈이 먼저 뜨면 안 된다)', () => {
    expect(INTRO_DURATION).toBeGreaterThanOrEqual(RISE_START + RISE_DURATION);
  });
});

describe('resolveWordmark', () => {
  it('창세기 구간에는 아무것도 나타나지 않는다', () => {
    const state = resolveWordmark(12, false);
    expect(state.write).toBe(0);
    expect(state.flash).toBe(0);
    expect(state.rise).toBe(0);
  });

  it('써지는 동안 진행도가 단조 증가한다', () => {
    let prev = -1;
    for (let t = WORDMARK_START; t <= WORDMARK_FLASH_AT; t += 0.05) {
      const { write } = resolveWordmark(t, false);
      expect(write).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = write;
    }
    // 표본 간격 때문에 끝점에 정확히 닿지 않는다 — 완성 여부는 아래에서 따로 본다.
    expect(prev).toBeGreaterThan(0.97);
    expect(resolveWordmark(WORDMARK_FLASH_AT, false).write).toBe(1);
  });

  it('다 써진 순간에만 번쩍인다', () => {
    expect(resolveWordmark(WORDMARK_FLASH_AT, false).flash).toBeCloseTo(1, 5);
    expect(resolveWordmark(WORDMARK_FLASH_AT - 0.3, false).flash).toBe(0);
    expect(resolveWordmark(WORDMARK_FLASH_AT + 1.2, false).flash).toBe(0);
  });

  it('섬광이 시작될 때 글자는 이미 완성되어 있다', () => {
    expect(resolveWordmark(WORDMARK_FLASH_AT, false).write).toBeCloseTo(1, 5);
  });

  it('인트로 종료 시점에 상단 자리에 도착해 있다', () => {
    const state = resolveWordmark(INTRO_DURATION, false);
    expect(state.write).toBe(1);
    expect(state.rise).toBe(1);
  });

  it('모든 값이 0..1 을 벗어나지 않는다', () => {
    for (let t = 0; t <= INTRO_DURATION + 2; t += 0.05) {
      const { write, flash, rise } = resolveWordmark(t, false);
      for (const v of [write, flash, rise]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reduced-motion 에서는 처음부터 상단에 완성돼 있다 (글자가 날아다니지 않는다)', () => {
    for (const t of [0, 5, 20, INTRO_DURATION]) {
      expect(resolveWordmark(t, true)).toEqual(WORDMARK_SETTLED);
    }
  });
});

describe('밀도 문턱 (도트 매트릭스 방지)', () => {
  it('작아질수록 희미한 점부터 사라진다', () => {
    const large = minWeightFor(1.6);
    const small = minWeightFor(0.3);
    expect(small).toBeGreaterThan(large);
  });

  it('아주 커도 윤곽 아닌 점을 전부 지우지는 않는다', () => {
    // 문턱이 1에 닿으면 글자가 윤곽선만 남아 앙상해진다.
    expect(minWeightFor(3)).toBeLessThanOrEqual(0.6);
    expect(minWeightFor(0.05)).toBeLessThanOrEqual(0.6);
  });

  it('아무리 촘촘해도 윤곽(weight 1)은 살아남는다', () => {
    for (const spacing of [0.05, 0.3, 1, 2, 5]) {
      expect(minWeightFor(spacing), `${spacing}`).toBeLessThan(1);
    }
  });

  it('문턱이 음수로 내려가지 않는다', () => {
    expect(minWeightFor(100)).toBeGreaterThan(0);
  });
});

describe('정반사 하이라이트 (상시 반짝임)', () => {
  it('훑고 지나간 뒤에는 쉬는 구간이 있다', () => {
    // 쉬는 구간이 없으면 계속 번쩍이는 배너 광고가 된다.
    let resting = 0;
    let sweeping = 0;
    for (let t = 0; t < 30; t += 0.05) {
      if (sweepPositionAt(t) === null) resting += 1;
      else sweeping += 1;
    }
    expect(resting).toBeGreaterThan(sweeping * 2);
  });

  it('왼쪽 바깥에서 시작해 오른쪽 바깥으로 빠져나간다', () => {
    const positions: number[] = [];
    for (let t = 0; t < 1.9; t += 0.05) {
      const p = sweepPositionAt(t);
      if (p !== null) positions.push(p);
    }

    expect(positions[0]).toBeLessThan(0);
    expect(positions[positions.length - 1]).toBeGreaterThan(1);
    // 진행 방향이 뒤집히지 않는다
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('주기적으로 반복된다', () => {
    expect(sweepPositionAt(0.4)).toBeCloseTo(sweepPositionAt(0.4 + 7.4)!, 6);
  });

  it('하이라이트 중심에서 가장 밝고 멀어지면 사그라든다', () => {
    const t = 0.95;
    const center = sweepPositionAt(t)!;

    expect(sweepGainAt(t, center)).toBeCloseTo(1, 5);
    expect(sweepGainAt(t, center + 0.16)).toBeLessThan(0.5);
    expect(sweepGainAt(t, center + 0.5)).toBeLessThan(0.01);
  });

  it('쉬는 동안에는 아무 곳도 밝아지지 않는다', () => {
    const resting = 5;
    expect(sweepPositionAt(resting)).toBeNull();
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(sweepGainAt(resting, x)).toBe(0);
    }
  });

  it('세기가 0..1 을 벗어나지 않는다', () => {
    for (let t = 0; t < 20; t += 0.07) {
      for (const x of [-0.2, 0, 0.5, 1, 1.2]) {
        const gain = sweepGainAt(t, x);
        expect(gain).toBeGreaterThanOrEqual(0);
        expect(gain).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('WordmarkLayer 배치', () => {
  const layer = new WordmarkLayer(fakeShape());

  it('중앙에서 시작해 상단으로 이동한다', () => {
    const start = layer.layoutFor({ write: 1, flash: 0, rise: 0 }, 1200, 800);
    const end = layer.layoutFor(WORDMARK_SETTLED, 1200, 800);

    expect(start.cy).toBeCloseTo(400, 0);
    expect(end.cy).toBeLessThan(120);
    expect(end.cx).toBe(start.cx);
  });

  it('상단으로 갈수록 작아진다', () => {
    const start = layer.layoutFor({ write: 1, flash: 0, rise: 0 }, 1200, 800);
    const end = layer.layoutFor(WORDMARK_SETTLED, 1200, 800);
    expect(end.width).toBeLessThan(start.width);
  });

  it('★ 상단 제목 높이가 화면 크기와 무관하게 묶여 있다', () => {
    // 이게 흔들리면 화면들이 비켜 줄 여백(--header-space)을 정할 수 없다.
    for (const [w, h] of [
      [360, 640],
      [768, 1024],
      [1440, 900],
      [2560, 1440],
    ]) {
      const layout = layer.layoutFor(WORDMARK_SETTLED, w, h);
      expect(layout.height, `${w}x${h}`).toBeGreaterThanOrEqual(40);
      expect(layout.height, `${w}x${h}`).toBeLessThanOrEqual(64);
    }
  });

  it('제목 블록이 상단 여백(108px) 안에 들어온다', () => {
    for (const [w, h] of [
      [360, 640],
      [1440, 900],
      [2560, 1440],
    ]) {
      const layout = layer.layoutFor(WORDMARK_SETTLED, w, h);
      expect(layout.cy + layout.height / 2, `${w}x${h}`).toBeLessThanOrEqual(108);
    }
  });

  it('제목이 화면 밖으로 나가지 않는다', () => {
    for (const [w, h] of [
      [360, 640],
      [768, 1024],
      [1440, 900],
    ]) {
      const layout = layer.layoutFor(WORDMARK_SETTLED, w, h);
      expect(layout.cy - layout.height / 2, `${w}x${h}`).toBeGreaterThan(0);
      expect(layout.cx + layout.width / 2, `${w}x${h}`).toBeLessThanOrEqual(w);
    }
  });
});
