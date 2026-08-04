/*
 * galaxy/dust.test.ts
 * 검증 기준: 먼지가 은하 형태를 만들되, 구절 데이터를 오염시키지 않는가.
 */

import { describe, expect, it } from 'vitest';
import { generateDust, generateHaze } from './dust';
import { TINT_BUCKETS, TINT_RAMP, tintBucket, tintRgba } from './palette';
import { QUALITY_PROFILES } from './quality';

describe('generateDust', () => {
  const dust = generateDust(3000);

  it('요청한 개수만큼 생성한다', () => {
    expect(dust).toHaveLength(3000);
  });

  it('모든 입자가 좌표 범위 안에 있다', () => {
    for (const p of dust) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.2);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1.2);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(1.2);
    }
  });

  it('먼지는 구절 별보다 확실히 어둡다', () => {
    // 큐레이션 별의 최소 magnitude 는 0.56 이다.
    for (const p of dust) {
      expect(p.magnitude).toBeLessThan(0.4);
      expect(p.magnitude).toBeGreaterThan(0);
    }
  });

  it('중심부가 외곽보다 촘촘하다 (개수가 아니라 밀도로 본다)', () => {
    // 바깥 고리는 면적 자체가 훨씬 넓다. 개수를 그대로 비교하면
    // 균등 분포도 "외곽이 많다"로 나온다 — 반드시 단위 면적당으로 봐야 한다.
    // 반경은 은하면(x-z) 위에서 잰다.
    const INNER_R = 0.45;
    const OUTER_R = 1.1;

    const inner = dust.filter((p) => Math.hypot(p.x, p.z) < INNER_R).length;
    const outer = dust.filter((p) => {
      const r = Math.hypot(p.x, p.z);
      return r >= INNER_R && r < OUTER_R;
    }).length;

    const innerArea = Math.PI * INNER_R ** 2;
    const outerArea = Math.PI * (OUTER_R ** 2 - INNER_R ** 2);

    expect(inner / innerArea).toBeGreaterThan(outer / outerArea);
  });

  it('원반이 y축으로 납작하다 (구가 아니라 은하)', () => {
    // 은하면은 x-z. y 는 두께축이므로 대부분의 입자가 0 근처에 몰려야 한다.
    const disk = dust.filter((p) => Math.abs(p.y) < 0.2).length;
    expect(disk / dust.length).toBeGreaterThan(0.6);
  });

  it('구형 헤일로가 있어 실루엣이 둥글게 유지된다', () => {
    // 원반 평면에서 확연히 벗어난 입자가 존재해야 한다.
    const halo = dust.filter((p) => Math.abs(p.y) > 0.3).length;
    expect(halo).toBeGreaterThan(0);
  });

  it('같은 시드면 항상 같은 하늘이 나온다', () => {
    const a = generateDust(200, 42);
    const b = generateDust(200, 42);
    expect(a[0]).toEqual(b[0]);
    expect(a[199]).toEqual(b[199]);
  });

  it('먼지 입자에는 구절 식별자가 없다 (데이터 오염 방지)', () => {
    for (const p of dust.slice(0, 50)) {
      expect(p).not.toHaveProperty('id');
      expect(p).not.toHaveProperty('ref');
      expect(p).not.toHaveProperty('excerpt');
    }
  });
});

describe('generateHaze', () => {
  it('블롭이 소수만 생성된다 (많으면 지저분해진다)', () => {
    const haze = generateHaze();
    expect(haze.length).toBeGreaterThan(0);
    expect(haze.length).toBeLessThanOrEqual(10);
  });

  it('안개 알파가 아주 낮게 유지된다', () => {
    for (const blob of generateHaze()) {
      expect(blob.alpha).toBeLessThan(0.07);
    }
  });

  it('안개는 은하면에 붙어 있다', () => {
    for (const blob of generateHaze()) {
      expect(Math.abs(blob.y)).toBeLessThan(0.12);
    }
  });
});

describe('색온도 램프', () => {
  it('버킷 인덱스가 범위를 벗어나지 않는다', () => {
    for (let t = -0.5; t <= 1.5; t += 0.05) {
      for (const jitter of [-1, 0, 1]) {
        const b = tintBucket(t, jitter);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(TINT_BUCKETS);
      }
    }
  });

  it('채도가 낮게 유지된다 (팔레트 원칙: 미세한 색만)', () => {
    for (const hex of TINT_RAMP) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      expect(saturation, hex).toBeLessThan(0.16);
      // 어두운 색이 섞이면 탁해진다 — 전부 밝은 계열이어야 한다.
      expect(max, hex).toBeGreaterThan(180);
    }
  });

  it('중심이 따뜻하고 외곽이 차갑다', () => {
    const warm = TINT_RAMP[0];
    const cool = TINT_RAMP[TINT_RAMP.length - 1];
    const warmR = parseInt(warm.slice(1, 3), 16);
    const warmB = parseInt(warm.slice(5, 7), 16);
    const coolR = parseInt(cool.slice(1, 3), 16);
    const coolB = parseInt(cool.slice(5, 7), 16);
    // 따뜻한 쪽은 R > B, 차가운 쪽은 B > R
    expect(warmR).toBeGreaterThan(warmB);
    expect(coolB).toBeGreaterThan(coolR);
  });

  it('tintRgba 가 유효한 rgba 문자열을 만든다', () => {
    expect(tintRgba(0, 0.5)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5\)$/);
  });
});

describe('품질 티어와 먼지', () => {
  it('티어가 낮아질수록 먼지가 줄어든다', () => {
    expect(QUALITY_PROFILES.high.dustCount).toBeGreaterThan(QUALITY_PROFILES.medium.dustCount);
    expect(QUALITY_PROFILES.medium.dustCount).toBeGreaterThan(QUALITY_PROFILES.low.dustCount);
  });

  it('저사양 티어는 안개를 끈다', () => {
    expect(QUALITY_PROFILES.low.haze).toBe(false);
  });
});
