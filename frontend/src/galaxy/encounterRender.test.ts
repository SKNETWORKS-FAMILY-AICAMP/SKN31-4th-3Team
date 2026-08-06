/*
 * galaxy/encounterRender.test.ts
 * ───────────────────────────────────────────────────────────────────────
 * 조우하는 동안 화면에 무엇이 그려지는가.
 *
 * ★ 왜 이런 테스트를 쓰게 됐나
 *   "상징 뒤에 이상한 밑그림이 있다" 는 지적을 두 번 받았다. 첫 번째는
 *   선을 은하별로 나누지 않은 것이었고, 두 번째는 성운(먼지·안개)이
 *   나선 원반 모양 그대로 남은 것이었다. 둘 다 눈으로만 봐서는 "선이
 *   지저분하네" 정도로 읽혀서, 원인을 짚지 못하고 기능을 지울 뻔했다.
 *
 *   그래서 캔버스 컨텍스트를 가짜로 끼우고 무엇을 그렸는지 센다. 형태가
 *   다 잡힌 순간에는 상징을 이루는 것 말고 아무것도 그려지지 않아야 한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateBackdrop } from '../data/backdrop';
import { VERSE_STARS } from '../data/verses';
import { DustLayer } from './DustLayer';
import { profileFor } from './quality';
import { GalaxyEngine } from './GalaxyEngine';

/** 무엇을 몇 번 그렸는지만 센다. 픽셀은 보지 않는다. */
interface Recorder {
  counts: Record<string, number>;
  reset(): void;
}

function fakeContext(): CanvasRenderingContext2D & Recorder {
  const counts: Record<string, number> = {};
  const bump = (k: string) => {
    counts[k] = (counts[k] ?? 0) + 1;
  };

  const ctx = {
    counts,
    reset: () => {
      for (const k of Object.keys(counts)) delete counts[k];
    },
    canvas: null,
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => bump('fillRect'),
    beginPath: () => bump('beginPath'),
    arc: () => bump('arc'),
    fill: () => bump('fill'),
    moveTo: () => bump('moveTo'),
    lineTo: () => bump('lineTo'),
    stroke: () => bump('stroke'),
    drawImage: () => bump('drawImage'),
    createRadialGradient: () => {
      bump('radialGradient');
      return { addColorStop: () => {} };
    },
    createLinearGradient: () => {
      bump('linearGradient');
      return { addColorStop: () => {} };
    },
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    measureText: () => ({ width: 0 }),
    fillText: () => bump('fillText'),
  };
  return ctx as unknown as CanvasRenderingContext2D & Recorder;
}

function fakeCanvas(ctx: CanvasRenderingContext2D): HTMLCanvasElement {
  return {
    width: 1200,
    height: 800,
    clientWidth: 1200,
    clientHeight: 800,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

const TARGET = 'peter';

function makeEngine(ctx: CanvasRenderingContext2D) {
  return new GalaxyEngine(fakeCanvas(ctx), {
    backdrop: generateBackdrop(200),
    curated: VERSE_STARS,
    quality: profileFor('high'),
    reducedMotion: false,
    mode: 'settled',
    focusStarId: null,
    hoverStarId: null,
  });
}

/**
 * 프레임을 흘려보낸다.
 *
 * rAF 를 가짜로 바꿔 두고, 엔진이 예약한 콜백을 우리가 직접 부른다.
 * 그래야 몇 초가 흘렀는지 시험이 정한다.
 */
function runFrames(engine: GalaxyEngine, seconds: number, step = 1 / 60): void {
  const frames = Math.round(seconds / step);
  for (let i = 0; i < frames; i += 1) {
    now += step * 1000;
    const cb = pending;
    pending = null;
    cb?.(now);
  }
  void engine;
}

let now = 0;
let pending: FrameRequestCallback | null = null;

describe('조우 중 렌더', () => {
  beforeEach(() => {
    now = 1000;
    pending = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pending = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('★ 형태가 다 잡히면 성운이 남지 않는다', () => {
    /*
     * ★ 두 번째로 지적받은 고장이다.
     *   별은 상징으로 떠나는데 먼지와 안개는 나선 원반 그대로 남았다.
     *   카메라가 그 은하에 바싹 붙어 있으므로 원반이 화면을 가득 채우고,
     *   상징 뒤에 정체 모를 밑그림이 깔린 것으로 보였다.
     *
     *   성운은 그라디언트(안개)와 사각형·원(먼지)으로 그려진다. 형태가
     *   다 잡힌 프레임에서는 그라디언트가 하나도 만들어지지 않아야 한다.
     */
    const ctx = fakeContext();
    const engine = makeEngine(ctx);
    engine.start();

    engine.update({ emblemGalaxyId: TARGET });
    runFrames(engine, 2.5); // 변형 1.15초 + 여유

    (ctx as unknown as Recorder).reset();
    runFrames(engine, 1 / 60);

    expect(engine.emblemFormation).toBeCloseTo(1, 2);
    expect(ctx.counts.radialGradient ?? 0, '안개가 남아 있다').toBe(0);
    engine.destroy();
  });

  it('★ 먼지 입자도 한 알 남지 않는다', () => {
    /*
     * 위 검사는 안개(그라디언트)만 본다. 먼지 입자는 별과 같은 방법으로
     * 그려져서 그린 것만 세어서는 구분되지 않는다. 레이어를 직접 지켜본다.
     */
    const draw = vi.spyOn(DustLayer.prototype, 'draw');
    const haze = vi.spyOn(DustLayer.prototype, 'drawHaze');

    const ctx = fakeContext();
    const engine = makeEngine(ctx);
    engine.start();

    engine.update({ emblemGalaxyId: TARGET });
    runFrames(engine, 2.5);

    draw.mockClear();
    haze.mockClear();
    runFrames(engine, 1 / 60);

    // 조우 은하만이 아니라 열세 개 전부다 — 물러난 은하의 원반도 보인다
    expect(draw, '먼지가 남아 있다').not.toHaveBeenCalled();
    expect(haze, '안개가 남아 있다').not.toHaveBeenCalled();
    engine.destroy();
  });

  it('조우 전에는 성운이 있다 — 위 검사가 헛돌지 않는다', () => {
    /*
     * ★ 이 검사가 없으면 위 검사는 아무것도 증명하지 않는다.
     *   성운을 통째로 지워도 통과하기 때문이다.
     */
    const ctx = fakeContext();
    const engine = makeEngine(ctx);
    engine.start();

    runFrames(engine, 0.5);
    (ctx as unknown as Recorder).reset();
    runFrames(engine, 1 / 60);

    expect(ctx.counts.radialGradient ?? 0).toBeGreaterThan(0);
    engine.destroy();
  });

  it('성운은 별보다 먼저 걷힌다', () => {
    // 별이 절반쯤 모였는데 성운이 그대로면 형태와 원반이 겹쳐 보인다
    const ctx = fakeContext();
    const engine = makeEngine(ctx);
    engine.start();

    engine.update({ emblemGalaxyId: TARGET });
    runFrames(engine, 0.85); // 변형 1.15초의 0.74 지점

    (ctx as unknown as Recorder).reset();
    runFrames(engine, 1 / 60);

    expect(engine.emblemFormation).toBeGreaterThan(0.6);
    expect(engine.emblemFormation).toBeLessThan(1);
    expect(ctx.counts.radialGradient ?? 0, '아직 안개가 남아 있다').toBe(0);
    engine.destroy();
  });

  it('별자리 선은 적고 길다', () => {
    /*
     * ★ 위아래 양쪽을 다 막는다.
     *   0 이면 성운을 걷다가 선까지 같이 사라진 것이고, 수십 개면 예전처럼
     *   윤곽을 다 훑어 철사를 두른 것이다. 별자리는 밝은 별 열 개 안팎만
     *   잇는다.
     */
    const ctx = fakeContext();
    const engine = makeEngine(ctx);
    engine.start();

    engine.update({ emblemGalaxyId: TARGET });
    runFrames(engine, 2.5);

    (ctx as unknown as Recorder).reset();
    runFrames(engine, 1 / 60);

    const lines = ctx.counts.lineTo ?? 0;
    expect(lines).toBeGreaterThan(4);
    expect(lines).toBeLessThan(26);
    engine.destroy();
  });

  it('조우가 끝나면 성운이 돌아온다', () => {
    /*
     * ★ 걷어 낸 것은 반드시 되돌아와야 한다.
     *   안 돌아오면 조우를 한 번 겪은 뒤로 하늘이 영영 밋밋해진다.
     */
    const ctx = fakeContext();
    const engine = makeEngine(ctx);
    engine.start();

    engine.update({ emblemGalaxyId: TARGET });
    runFrames(engine, 2.0);
    engine.update({ emblemGalaxyId: null });
    runFrames(engine, 1.5); // 풀리는 데 0.6초

    (ctx as unknown as Recorder).reset();
    runFrames(engine, 1 / 60);

    expect(engine.emblemFormation).toBe(0);
    expect(ctx.counts.radialGradient ?? 0).toBeGreaterThan(0);
    engine.destroy();
  });
});
