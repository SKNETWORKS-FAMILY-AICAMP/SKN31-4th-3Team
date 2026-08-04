/*
 * galaxy/WordmarkLayer.ts
 * ───────────────────────────────────────────────────────────────────────
 * 제목 "✝ Eden" 을 별자리로 쓰는 레이어.
 *
 * ★ 이 레이어만 화면 좌표계를 쓴다.
 *   다른 모든 것은 3D 월드에 있지만 제목은 읽혀야 한다. 월드에 두면
 *   카메라가 궤도를 돌 때 글자가 기울고 뒤집혀 못 읽는다.
 *
 * ★ 도트 매트릭스가 되지 않기 위한 규칙
 *   - 정수 좌표로 반올림하지 않는다. 스냅하는 순간 픽셀 아트가 된다.
 *   - 사각형을 쓰지 않는다. 부드러운 스프라이트를 겹쳐 그린다.
 *   - 모든 점을 같은 크기로 그리지 않는다. 소수의 밝은 별과 다수의
 *     희미한 먼지로 나뉘어야 밀도가 질감으로 읽힌다.
 *   - 밝은 별에는 아주 얇은 십자 광선을 준다. 사진에서 밝은 광원이
 *     보이는 방식이라, 이것 하나로 "점"이 "별"이 된다.
 *
 * ★ 상시 반짝임은 두 겹이다
 *   1) 정반사 하이라이트: 빛줄기 하나가 글자를 왼쪽에서 오른쪽으로 훑고
 *      지나간다. 금속이나 유리에 빛이 스치는 방식이라 "어딘가에서 빛을
 *      받고 있다"는 인상을 준다. 지나간 뒤에는 한참 쉰다 — 쉬는 구간이
 *      없으면 계속 번쩍이는 배너 광고가 된다.
 *   2) 개별 반짝임: 광선을 가진 별이 각자 다른 주기로 아주 짧게 터진다.
 *      전부 같이 밝아지면 명멸하는 전구가 되므로, 한 번에 한둘만 빛나도록
 *      뾰족한 포락선(sin^12)을 쓴다.
 */

import { clamp, easeInOutCubic, easeOutCubic, lerp } from './easing';
import { seededRandom } from './placement';
import type { WordmarkState } from './introTimeline';
import type { WordmarkShape } from './wordmark';

/** 화면 중앙에 쓰일 때 차지하는 가로 폭 비율 */
const CENTER_WIDTH_RATIO = 0.6;

/*
 * 상단 제목은 폭이 아니라 "높이"로 정한다.
 * 폭을 화면 비율로 잡으면 글자 종횡비에 따라 높이가 달라져서,
 * 화면들이 비켜 줄 여백(--header-space)을 정할 수가 없다.
 */
const HEADER_HEIGHT_RATIO = 0.055;
const HEADER_HEIGHT_MIN = 42;
const HEADER_HEIGHT_MAX = 62;
const HEADER_TOP = 32;

/** 한 별이 제자리에 도착하는 데 쓰는 시간 비율 (전체 write 진행도 기준) */
const STROKE_SPAN = 0.42;

/** 흩어진 시작 위치 — 화면 밖에서 날아든다. */
const SCATTER_MIN = 0.7;
const SCATTER_MAX = 1.8;

/** 빛이 오는 방향(화면 좌표, y는 아래로 증가하므로 위는 음수). */
const LIGHT_X = -0.55;
const LIGHT_Y = -0.83;

/** 광선을 받을 별의 비율. 많으면 반짝이 스티커가 된다. */
const FLARE_RATIO = 0.05;

/*
 * ── 정반사 하이라이트 ─────────────────────────────────────────────
 * 한 번 훑고 지나간 뒤 나머지 시간은 쉰다. 훑는 시간보다 주기가 훨씬
 * 길어야 "가끔 빛을 받는" 느낌이 되고, 짧으면 광고 배너가 된다.
 */
const SWEEP_PERIOD = 7.4;
const SWEEP_TRAVEL = 1.9;
/** 하이라이트 폭 (글자 가로 폭 대비) */
const SWEEP_WIDTH = 0.15;
/** 하이라이트가 더해 주는 최대 밝기 */
const SWEEP_GAIN = 0.34;

/** 개별 반짝임 주기 범위(초). 별마다 달라야 동시에 터지지 않는다. */
const TWINKLE_MIN_PERIOD = 5.5;
const TWINKLE_MAX_PERIOD = 11;
/** 포락선 지수 — 클수록 짧고 뾰족하게 터진다. */
const TWINKLE_SHARPNESS = 12;

/** 부드러운 별 스프라이트 해상도 */
const SPRITE_SIZE = 64;

/**
 * 화면에서의 점 간격에 따라 "이 밝기 미만은 그리지 않는다"는 문턱을 정한다.
 *
 * 한 번에 잘라내면 크기가 바뀔 때 티가 난다. 문턱을 서서히 올려
 * 큰 화면에서는 먼지까지 보이고, 작은 제목에서는 윤곽만 남게 한다.
 */
export function minWeightFor(spacingPx: number): number {
  return clamp(0.62 - spacingPx * 0.32, 0.08, 0.6);
}

/**
 * 정반사 하이라이트의 현재 위치.
 *
 * @returns 글자 가로 방향 0..1 기준 위치. 쉬는 구간이면 null.
 */
export function sweepPositionAt(time: number): number | null {
  const phase = ((time % SWEEP_PERIOD) + SWEEP_PERIOD) % SWEEP_PERIOD;
  if (phase > SWEEP_TRAVEL) return null;

  // 양쪽 끝 바깥에서 시작해 바깥으로 빠져나간다 — 갑자기 나타나지 않게.
  return -0.18 + (phase / SWEEP_TRAVEL) * 1.36;
}

/**
 * 글자 안 x 위치(0..1)가 하이라이트에서 받는 세기.
 * 가우시안이라 가장자리가 부드럽게 사그라든다.
 */
export function sweepGainAt(time: number, x: number): number {
  const position = sweepPositionAt(time);
  if (position === null) return 0;

  const distance = (x - position) / SWEEP_WIDTH;
  return Math.exp(-distance * distance);
}

export interface WordmarkLayout {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

/** 코어와 헤일로를 한 장에 담은 별 스프라이트. 한 번만 만든다. */
function createStarSprite(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const half = SPRITE_SIZE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  // 가운데는 거의 흰색, 바깥으로 갈수록 빠르게 사그라든다.
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.16, 'rgba(255, 255, 255, 0.82)');
  gradient.addColorStop(0.38, 'rgba(236, 240, 248, 0.26)');
  gradient.addColorStop(0.7, 'rgba(214, 226, 242, 0.06)');
  gradient.addColorStop(1, 'rgba(200, 214, 236, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return canvas;
}

export class WordmarkLayer {
  private count: number;
  private glyphX: Float32Array;
  private glyphY: Float32Array;
  private originX: Float32Array;
  private originY: Float32Array;
  private delay: Float32Array;
  /** 형태 기여도 0..1 — 크기·밝기·생략 여부를 모두 이 값이 정한다 */
  private weight: Float32Array;
  /** 개별 크기 흔들림 — 같은 무게라도 조금씩 다르게 */
  private sizeJitter: Float32Array;
  private phase: Float32Array;
  private light: Float32Array;
  /** 1 = 십자 광선을 받는 별 */
  private flare: Uint8Array;
  /** 개별 반짝임 각속도 — 별마다 달라 동시에 터지지 않는다 */
  private twinkleRate: Float32Array;
  /** 0 = 차갑게, 1 = 따뜻하게 */
  private warmth: Float32Array;

  private links: Array<[number, number]>;
  private sprite: HTMLCanvasElement | null;

  readonly aspect: number;
  readonly spacing: number;

  constructor(shape: WordmarkShape, seed = 8811) {
    const rand = seededRandom(seed);
    this.count = shape.points.length;
    this.aspect = shape.aspect;
    this.spacing = shape.spacing;
    this.links = shape.links;
    this.sprite = createStarSprite();

    this.glyphX = new Float32Array(this.count);
    this.glyphY = new Float32Array(this.count);
    this.originX = new Float32Array(this.count);
    this.originY = new Float32Array(this.count);
    this.delay = new Float32Array(this.count);
    this.weight = new Float32Array(this.count);
    this.sizeJitter = new Float32Array(this.count);
    this.phase = new Float32Array(this.count);
    this.light = new Float32Array(this.count);
    this.flare = new Uint8Array(this.count);
    this.twinkleRate = new Float32Array(this.count);
    this.warmth = new Float32Array(this.count);

    for (let i = 0; i < this.count; i += 1) {
      const p = shape.points[i];

      this.glyphX[i] = p.x - 0.5;
      this.glyphY[i] = (p.y - 0.5) / shape.aspect;

      const angle = rand() * Math.PI * 2;
      const radius = SCATTER_MIN + rand() * (SCATTER_MAX - SCATTER_MIN);
      this.originX[i] = Math.cos(angle) * radius;
      this.originY[i] = Math.sin(angle) * radius * 0.7;

      this.delay[i] = clamp(p.x * (1 - STROKE_SPAN) + (rand() - 0.5) * 0.05, 0, 1 - STROKE_SPAN);
      this.weight[i] = p.weight;

      /*
       * 크기는 꼬리가 긴 분포로 뽑는다.
       * 균등하게 뽑으면 다들 비슷해져서 격자처럼 보인다.
       * 제곱을 쓰면 대부분 작고 소수만 크다 — 실제 별하늘의 밝기 분포다.
       */
      const roll = rand();
      this.sizeJitter[i] = 0.6 + roll * roll * 1.5;

      this.phase[i] = rand() * Math.PI * 2;
      this.warmth[i] = rand();
      this.flare[i] = p.weight >= 0.95 && rand() < FLARE_RATIO ? 1 : 0;

      const period = TWINKLE_MIN_PERIOD + rand() * (TWINKLE_MAX_PERIOD - TWINKLE_MIN_PERIOD);
      this.twinkleRate[i] = (Math.PI * 2) / period;

      const facing = p.nx * LIGHT_X + p.ny * LIGHT_Y;
      this.light[i] = p.weight >= 0.95 ? clamp(0.72 + facing * 0.38, 0.48, 1.2) : 1;
    }
  }

  /** 진행 상태에 따른 화면 배치 (중앙 큰 글씨 → 상단 작은 제목). */
  layoutFor(state: WordmarkState, width: number, height: number): WordmarkLayout {
    const short = Math.min(width, height);
    const t = easeInOutCubic(state.rise);

    const centerWidth = short * CENTER_WIDTH_RATIO;
    const headerHeight = clamp(short * HEADER_HEIGHT_RATIO, HEADER_HEIGHT_MIN, HEADER_HEIGHT_MAX);
    const headerWidth = Math.min(headerHeight * this.aspect, width - 32);

    const boxWidth = lerp(centerWidth, headerWidth, t);

    return {
      cx: width / 2,
      cy: lerp(height * 0.5, HEADER_TOP + headerWidth / this.aspect / 2, t),
      width: boxWidth,
      height: boxWidth / this.aspect,
    };
  }

  /**
   * 제목을 그린다.
   *
   * @param time 반짝임용 경과 시간(초)
   */
  draw(
    ctx: CanvasRenderingContext2D,
    state: WordmarkState,
    width: number,
    height: number,
    time: number,
  ): void {
    if (state.write <= 0 || !this.sprite) return;

    const layout = this.layoutFor(state, width, height);
    const scale = layout.width;
    const short = Math.min(width, height);
    const spacingPx = this.spacing * layout.width;

    // 작아질수록 희미한 점부터 지운다 (minWeightFor 참고).
    const minWeight = minWeightFor(spacingPx);

    ctx.save();
    // 별빛은 겹칠수록 밝아진다. 이 한 줄이 "점 무더기"를 "빛"으로 바꾼다.
    ctx.globalCompositeOperation = 'lighter';

    this.drawLinks(ctx, layout, scale, state, minWeight);

    for (let i = 0; i < this.count; i += 1) {
      const weight = this.weight[i];
      if (weight < minWeight) continue;

      const local = clamp((state.write - this.delay[i]) / STROKE_SPAN, 0, 1);
      if (local <= 0) continue;
      const eased = easeOutCubic(local);

      const px = lerp(layout.cx + this.originX[i] * short, layout.cx + this.glyphX[i] * scale, eased);
      const py = lerp(layout.cy + this.originY[i] * short, layout.cy + this.glyphY[i] * scale, eased);

      /*
       * 반짝임 = 바탕의 잔잔한 흔들림 + 훑고 지나가는 하이라이트 + 개별 점멸.
       * 셋을 더하지 않고 각각 역할을 나눠 둬야 과하지 않다.
       */
      const breathe = 0.92 + Math.sin(time * 1.2 + this.phase[i]) * 0.08;
      const sweep = sweepGainAt(time, this.glyphX[i] + 0.5) * weight;
      const pulse = this.pulseAt(i, time);

      const alpha = clamp(
        (0.2 + weight * 0.8) * this.light[i] * eased * breathe +
          sweep * SWEEP_GAIN +
          pulse * 0.18 * weight +
          state.flash * 0.45,
        0,
        1,
      );
      if (alpha <= 0.015) continue;

      // 스프라이트 크기는 표본 간격에 매인다 — 커지면 서로 뭉개진다.
      const size =
        spacingPx *
        (0.9 + weight * 1.5) *
        this.sizeJitter[i] *
        (0.6 + eased * 0.4) *
        (1 + sweep * 0.35);

      this.drawStar(ctx, px, py, size, alpha, this.warmth[i]);

      if (this.flare[i] === 1 && eased > 0.7) {
        /*
         * 광선 세기는 바닥을 낮게 깔고 반짝임에 얹는다.
         * 완전히 꺼지면 별이 사라진 것처럼 보이고, 늘 세게 켜 두면
         * 반짝이 스티커가 된다.
         */
        const intensity = 0.3 + Math.max(pulse, sweep) * 0.7;
        this.drawFlare(ctx, px, py, size * 3.2 * (0.7 + intensity * 0.5), alpha * 0.5 * intensity);
      }
    }

    if (state.flash > 0.02) {
      this.drawFlash(ctx, layout, state.flash);
    }

    ctx.restore();
  }

  /**
   * 개별 반짝임 0..1.
   * sin 을 높은 지수로 눌러 대부분의 시간은 0에 가깝고 아주 잠깐만 1이 된다.
   */
  private pulseAt(index: number, time: number): number {
    const wave = Math.sin(time * this.twinkleRate[index] + this.phase[index]);
    return wave <= 0 ? 0 : Math.pow(wave, TWINKLE_SHARPNESS);
  }

  /**
   * 별 하나. 부드러운 스프라이트를 그대로 얹는다.
   * 좌표를 반올림하지 않는 것이 중요하다 — 스냅하면 픽셀 아트가 된다.
   */
  private drawStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    alpha: number,
    warmth: number,
  ): void {
    if (!this.sprite) return;
    const half = size / 2;

    ctx.globalAlpha = alpha;
    ctx.drawImage(this.sprite, x - half, y - half, size, size);

    /*
     * 색은 스프라이트 위에 아주 옅게 덧입힌다.
     * 따뜻한 별과 차가운 별이 섞이면 단색 점 무더기보다 훨씬 깊어 보인다.
     */
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = warmth > 0.5 ? 'rgba(242, 233, 216, 1)' : 'rgba(205, 216, 230, 1)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.35, size * 0.13), 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  /** 밝은 별의 십자 광선. 얇고 짧아야 품위가 산다. */
  private drawFlare(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    length: number,
    alpha: number,
  ): void {
    const gradient = ctx.createLinearGradient(x - length, y, x + length, y);
    gradient.addColorStop(0, 'rgba(232, 236, 242, 0)');
    gradient.addColorStop(0.5, `rgba(248, 248, 246, ${alpha.toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(232, 236, 242, 0)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - length, y);
    ctx.lineTo(x + length, y);
    ctx.stroke();

    const vertical = ctx.createLinearGradient(x, y - length * 0.6, x, y + length * 0.6);
    vertical.addColorStop(0, 'rgba(232, 236, 242, 0)');
    vertical.addColorStop(0.5, `rgba(248, 248, 246, ${(alpha * 0.8).toFixed(3)})`);
    vertical.addColorStop(1, 'rgba(232, 236, 242, 0)');

    ctx.strokeStyle = vertical;
    ctx.beginPath();
    ctx.moveTo(x, y - length * 0.6);
    ctx.lineTo(x, y + length * 0.6);
    ctx.stroke();
  }

  /**
   * 별자리선. 아주 옅어서 의식되지는 않지만, 점들이 하나의 형태로 묶인다.
   * 글자가 다 써진 뒤에 서서히 나타난다.
   */
  private drawLinks(
    ctx: CanvasRenderingContext2D,
    layout: WordmarkLayout,
    scale: number,
    state: WordmarkState,
    minWeight: number,
  ): void {
    // 아직 쓰는 중이면 선을 긋지 않는다 — 완성된 형태를 확인시켜 주는 요소다.
    const reveal = clamp((state.write - 0.72) / 0.28, 0, 1);
    if (reveal <= 0) return;

    ctx.strokeStyle = `rgba(205, 216, 230, ${(0.07 * reveal).toFixed(3)})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();

    for (const [a, b] of this.links) {
      if (this.weight[a] < minWeight || this.weight[b] < minWeight) continue;
      ctx.moveTo(layout.cx + this.glyphX[a] * scale, layout.cy + this.glyphY[a] * scale);
      ctx.lineTo(layout.cx + this.glyphX[b] * scale, layout.cy + this.glyphY[b] * scale);
    }

    ctx.stroke();
  }

  /** 완성 순간의 섬광. 글자 상자를 감싸는 한 번의 빛. */
  private drawFlash(
    ctx: CanvasRenderingContext2D,
    layout: WordmarkLayout,
    intensity: number,
  ): void {
    const radius = layout.width * 0.8;
    const gradient = ctx.createRadialGradient(
      layout.cx,
      layout.cy,
      0,
      layout.cx,
      layout.cy,
      radius,
    );
    gradient.addColorStop(0, `rgba(242, 233, 216, ${(intensity * 0.2).toFixed(3)})`);
    gradient.addColorStop(0.45, `rgba(232, 236, 242, ${(intensity * 0.07).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(232, 236, 242, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(layout.cx, layout.cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
