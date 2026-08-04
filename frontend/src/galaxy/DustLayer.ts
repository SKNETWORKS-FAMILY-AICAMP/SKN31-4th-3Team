/*
 * galaxy/DustLayer.ts
 * ───────────────────────────────────────────────────────────────────────
 * 성운 먼지 렌더 레이어.
 *
 * 성능 설계:
 *   입자 수천 개에 각각 다른 색을 주면 fillStyle 문자열을 프레임마다 수천 번
 *   만들게 된다. 그래서 색을 7단계로 양자화하고, 같은 색 입자를 연속 인덱스로
 *   정렬해 둔다. 렌더 루프는 색당 fillStyle 을 한 번만 설정하고,
 *   입자별 밝기는 globalAlpha 로만 조절한다.
 *   → fillStyle 설정 7회 / 프레임. 문자열 할당 0회.
 */

import { project, type Viewport } from './staticField';
import { convergeProgress, lerp } from './easing';
import { seededRandom } from './placement';
import { TINT_BUCKETS, TINT_RAMP, tintRgba } from './palette';
import { generateDust, generateHaze, type HazeBlob } from './dust';
import type { NodeTransform } from './system';

/** 흩어진 시작 위치 반경 — 별과 같은 규칙이라 인트로에서 한 몸으로 움직인다. */
const SCATTER_MIN = 1.7;
const SCATTER_MAX = 3.4;
const MAX_DELAY = 0.42;

export class DustLayer {
  private count: number;
  private originX: Float32Array;
  private originY: Float32Array;
  private originZ: Float32Array;
  private targetX: Float32Array;
  private targetY: Float32Array;
  private targetZ: Float32Array;
  private delay: Float32Array;
  private magnitude: Float32Array;

  /** 색 버킷 순으로 정렬된 입자 인덱스 */
  private order: Uint32Array;
  /** 각 버킷이 order 배열에서 시작하는 위치 (길이 = 버킷 수 + 1) */
  private bucketStart: Uint32Array;

  private haze: HazeBlob[];
  /** 이 은하의 색 램프. 제자마다 다르다. */
  private ramp: readonly string[];

  constructor(count: number, seed = 77003, ramp: readonly string[] = TINT_RAMP) {
    const particles = generateDust(count, seed);
    this.ramp = ramp;
    const rand = seededRandom(seed ^ 0x5f3a);
    this.count = particles.length;

    this.originX = new Float32Array(this.count);
    this.originY = new Float32Array(this.count);
    this.originZ = new Float32Array(this.count);
    this.targetX = new Float32Array(this.count);
    this.targetY = new Float32Array(this.count);
    this.targetZ = new Float32Array(this.count);
    this.delay = new Float32Array(this.count);
    this.magnitude = new Float32Array(this.count);

    const bucketOf = new Uint8Array(this.count);
    const bucketCounts = new Uint32Array(TINT_BUCKETS);

    for (let i = 0; i < this.count; i += 1) {
      const p = particles[i];

      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const radius = SCATTER_MIN + rand() * (SCATTER_MAX - SCATTER_MIN);
      this.originX[i] = Math.sin(phi) * Math.cos(theta) * radius;
      this.originY[i] = Math.sin(phi) * Math.sin(theta) * radius;
      this.originZ[i] = Math.cos(phi) * radius;

      this.targetX[i] = p.x;
      this.targetY[i] = p.y;
      this.targetZ[i] = p.z;
      this.delay[i] = rand() * MAX_DELAY;
      this.magnitude[i] = p.magnitude;

      // 같은 반경이라도 색이 조금씩 흩어지도록 지터를 준다.
      const jitter = rand() * 2 - 1;
      const t = p.radialT + jitter * 0.09;
      const index = Math.round(t * (TINT_BUCKETS - 1));
      const bucket = index < 0 ? 0 : index > TINT_BUCKETS - 1 ? TINT_BUCKETS - 1 : index;
      bucketOf[i] = bucket;
      bucketCounts[bucket] += 1;
    }

    // 카운팅 정렬로 버킷별 연속 구간을 만든다.
    this.bucketStart = new Uint32Array(TINT_BUCKETS + 1);
    for (let b = 0; b < TINT_BUCKETS; b += 1) {
      this.bucketStart[b + 1] = this.bucketStart[b] + bucketCounts[b];
    }
    const cursor = Uint32Array.from(this.bucketStart.subarray(0, TINT_BUCKETS));
    this.order = new Uint32Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      const b = bucketOf[i];
      this.order[cursor[b]] = i;
      cursor[b] += 1;
    }

    this.haze = generateHaze(seed ^ 0x9e37);
  }

  /**
   * 안개를 먼저 깐다. 입자보다 아래에 놓여야 구름처럼 읽힌다.
   * 블롭이 7개뿐이라 매 프레임 그라디언트를 만들어도 비용이 낮다.
   */
  drawHaze(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    luminance: number,
    transform: NodeTransform,
  ): void {
    if (luminance <= 0.02) return;

    const point = { x: 0, y: 0, z: 0 };
    const cos = Math.cos(transform.spin);
    const sin = Math.sin(transform.spin);

    for (const blob of this.haze) {
      applyTransform(point, blob.x, blob.y, blob.z, cos, sin, transform);
      const p = project(point, vp);
      if (!p.visible) continue;

      // 안개도 3D 공간에 있다 — 멀면 작게 보인다.
      const radius = blob.radius * transform.scale * p.k;
      if (radius < 1) continue;

      const alpha = blob.alpha * luminance;
      if (alpha <= 0.002) continue;

      const bucket = Math.round(blob.radialT * (TINT_BUCKETS - 1));
      const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, radius);
      g.addColorStop(0, tintRgba(bucket, alpha, this.ramp));
      g.addColorStop(0.55, tintRgba(bucket, alpha * 0.38, this.ramp));
      g.addColorStop(1, tintRgba(bucket, 0, this.ramp));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 입자를 색 버킷 단위로 묶어 그린다. */
  draw(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    convergence: number,
    luminance: number,
    transform: NodeTransform,
  ): void {
    if (luminance <= 0.01) return;

    const point = { x: 0, y: 0, z: 0 };
    const cos = Math.cos(transform.spin);
    const sin = Math.sin(transform.spin);
    // 작은 은하는 입자도 작게 — 안 그러면 위성이 뭉친 덩어리로 보인다.
    const sizeScale = 0.45 + transform.scale * 0.55;

    for (let b = 0; b < TINT_BUCKETS; b += 1) {
      const from = this.bucketStart[b];
      const to = this.bucketStart[b + 1];
      if (from === to) continue;

      ctx.fillStyle = this.ramp[b];

      for (let k = from; k < to; k += 1) {
        const i = this.order[k];
        const t = convergeProgress(this.delay[i], convergence);
        applyTransform(
          point,
          lerp(this.originX[i], this.targetX[i], t),
          lerp(this.originY[i], this.targetY[i], t),
          lerp(this.originZ[i], this.targetZ[i], t),
          cos,
          sin,
          transform,
        );

        const p = project(point, vp);
        if (!p.visible) continue;
        if (p.sx < -20 || p.sx > vp.width + 20 || p.sy < -20 || p.sy > vp.height + 20) continue;

        const alpha = this.magnitude[i] * p.depth * luminance;
        if (alpha <= 0.006) continue;

        ctx.globalAlpha = alpha;
        // 먼지는 점 하나 크기. 원호 대신 사각형을 쓰면 훨씬 싸다.
        const size = (0.6 + this.magnitude[i] * 1.4 * p.depth) * sizeScale;
        ctx.fillRect(p.sx - size / 2, p.sy - size / 2, size, size);
      }
    }

    ctx.globalAlpha = 1;
  }
}

/**
 * 로컬 좌표를 월드로 옮겨 재사용 객체에 쓴다.
 * 매 입자마다 객체를 만들면 수천 번의 할당이 생기므로 out 을 재활용한다.
 * (system.ts 의 toWorld 와 같은 변환이며, 여기서는 sin/cos 를 미리 받는다)
 */
function applyTransform(
  out: { x: number; y: number; z: number },
  x: number,
  y: number,
  z: number,
  cos: number,
  sin: number,
  transform: NodeTransform,
): void {
  out.x = (x * cos - z * sin) * transform.scale + transform.center.x;
  out.y = y * transform.scale + transform.center.y;
  out.z = (x * sin + z * cos) * transform.scale + transform.center.z;
}
