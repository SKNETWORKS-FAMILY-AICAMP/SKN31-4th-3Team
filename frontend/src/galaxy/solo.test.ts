/*
 * galaxy/solo.test.ts
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 구절 하나에 집중할 때 나머지 은하가 물러나는가.
 *
 * 13개가 전부 켜져 있으면 어디를 보라는 화면인지 알 수 없다.
 * 반대로 완전히 지워 버리면 닫고 나왔을 때 돌아갈 자리가 사라진다.
 */

import { describe, expect, it } from 'vitest';
import {
  SOLO_HIDE_SECONDS,
  SOLO_REMAINDER,
  SOLO_RETURN_SECONDS,
  SOLO_RETURN_STAGGER,
  soloFadeFor,
} from './GalaxyEngine';

describe('집중 페이드', () => {
  it('집중 대상이 없으면 전부 그대로 보인다', () => {
    for (const amount of [0, 0.5, 1]) {
      expect(soloFadeFor('peter', null, amount)).toBe(1);
      // 빈 집합도 "고르지 않음"과 같게 본다.
      expect(soloFadeFor('peter', new Set<string>(), amount)).toBe(1);
    }
  });

  it('★ 여러 은하를 함께 남길 수 있다 (MBTI 궁합)', () => {
    // 구절 하나에 집중할 때는 한 개, 유형으로 고를 때는 여러 개가 남는다.
    const kin = new Set(['peter', 'john', 'thomas']);
    expect(soloFadeFor('john', kin, 1)).toBe(1);
    expect(soloFadeFor('thomas', kin, 1)).toBe(1);
    expect(soloFadeFor('judas', kin, 1)).toBeLessThan(0.2);
  });

  it('집중 중인 은하는 밝기를 잃지 않는다', () => {
    expect(soloFadeFor('peter', new Set(['peter']), 1)).toBe(1);
    expect(soloFadeFor('peter', new Set(['peter']), 0.4)).toBe(1);
  });

  it('★ 나머지 은하는 옅어지되 완전히 사라지지 않는다', () => {
    const other = soloFadeFor('john', new Set(['peter']), 1);
    expect(other).toBeLessThan(0.2);
    expect(other).toBeGreaterThan(0);
    expect(other).toBeCloseTo(SOLO_REMAINDER, 6);
  });

  it('집중이 차오르는 동안 단조롭게 옅어진다 (튀지 않는다)', () => {
    let prev = 1.1;
    for (let amount = 0; amount <= 1; amount += 0.05) {
      const fade = soloFadeFor('john', new Set(['peter']), amount);
      expect(fade).toBeLessThanOrEqual(prev + 1e-9);
      prev = fade;
    }
  });

  it('범위를 벗어난 값에도 0..1 을 지킨다', () => {
    expect(soloFadeFor('john', new Set(['peter']), 5)).toBeCloseTo(SOLO_REMAINDER, 6);
    expect(soloFadeFor('john', new Set(['peter']), -3)).toBe(1);
  });

  it('★ 사라질 때보다 돌아올 때가 느리다', () => {
    // 같은 속도로 두면 돌아오는 순간이 툭 튄다.
    expect(SOLO_RETURN_SECONDS).toBeGreaterThan(SOLO_HIDE_SECONDS * 2);
  });

  it('사라지는 데 한나절이 걸리지 않는다', () => {
    // 고른 반응이 늦으면 눌린 것 같지 않다.
    expect(SOLO_HIDE_SECONDS).toBeLessThan(0.6);
  });

  it('★ 돌아올 때 은하마다 시차가 있다', () => {
    // 13개가 한 몸처럼 켜지면 스위치를 올린 것처럼 보인다.
    expect(SOLO_RETURN_STAGGER).toBeGreaterThan(0);

    // 그렇다고 마지막 은하가 하염없이 기다려서는 안 된다.
    const lastDelay = 12 * SOLO_RETURN_STAGGER;
    expect(lastDelay).toBeLessThan(SOLO_RETURN_SECONDS);
  });
});
