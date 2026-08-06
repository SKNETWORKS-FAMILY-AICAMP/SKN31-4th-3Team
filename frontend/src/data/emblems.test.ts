/*
 * data/emblems.test.ts
 *
 * ★ 이 파일의 절반은 사람이 눈으로 보라고 있다.
 *   상징이 "열쇠처럼 보이는가" 는 단언으로 확인할 수 없다. 그래서
 *   ASCII 로 그려 출력한다. `npx vitest run emblems --reporter=verbose`
 *   로 돌리고 콘솔을 보면 열세 개가 어떻게 생겼는지 바로 확인된다.
 *
 *   나머지 절반은 기계가 확인할 수 있는 것들이다 — 좌표가 상자를
 *   벗어나지 않는가, 점이 너무 적거나 많지 않은가, 은하와 1:1 인가.
 */

import { describe, expect, it } from 'vitest';

import { ALL_GALAXIES } from './disciples';
import { EMBLEMS, emblemOf, type Emblem } from './emblems';

/** 0..1 좌표를 문자 격자에 찍는다. */
function render(emblem: Emblem, size = 26): string {
  const grid: string[][] = Array.from({ length: size }, () => Array(size * 2).fill(' '));
  for (const p of emblem.points) {
    const col = Math.round(p.x * (size * 2 - 1));
    const row = Math.round(p.y * (size - 1));
    if (row < 0 || row >= size || col < 0 || col >= size * 2) continue;
    // 윤곽은 진하게, 속은 옅게
    const mark = p.weight >= 0.9 ? '#' : '·';
    if (grid[row][col] !== '#') grid[row][col] = mark;
  }
  return grid.map((r) => r.join('')).join('\n');
}

describe('열세 상징', () => {
  it('은하와 1:1 이다', () => {
    /*
     * ★ 하나라도 빠지면 그 은하만 모양이 안 변한다.
     *   화면에서는 "왜 여기만 그대로지" 로 보이고, 원인을 찾기 어렵다.
     */
    const galaxyIds = ALL_GALAXIES.map((g) => g.id).sort();
    const emblemIds = EMBLEMS.map((e) => e.galaxyId).sort();
    expect(emblemIds).toEqual(galaxyIds);
  });

  it('id 가 겹치지 않는다', () => {
    expect(new Set(EMBLEMS.map((e) => e.galaxyId)).size).toBe(EMBLEMS.length);
  });

  it.each(EMBLEMS.map((e) => [e.galaxyId, e] as const))('%s — 좌표가 상자 안에 있다', (_, e) => {
    // 벗어나면 그 별만 성운 밖으로 튄다
    for (const p of e.points) {
      expect(p.x).toBeGreaterThanOrEqual(-0.02);
      expect(p.x).toBeLessThanOrEqual(1.02);
      expect(p.y).toBeGreaterThanOrEqual(-0.02);
      expect(p.y).toBeLessThanOrEqual(1.02);
      expect(Number.isFinite(p.weight)).toBe(true);
    }
  });

  it.each(EMBLEMS.map((e) => [e.galaxyId, e] as const))('%s — 별 수가 적당하다', (_, e) => {
    /*
     * ★ 은하당 캔버스 별이 150개다.
     *   상징의 점이 그보다 훨씬 적으면 모양이 성기게 보이고, 훨씬 많으면
     *   남는 점에 배정할 별이 없어 형태가 뭉개진다.
     */
    expect(e.points.length).toBeGreaterThan(80);
    expect(e.points.length).toBeLessThan(700);
  });

  it.each(EMBLEMS.map((e) => [e.galaxyId, e] as const))('%s — 화면 폭을 쓴다', (_, e) => {
    // 한쪽에 쏠려 있으면 성운 가장자리에 치우쳐 뜬다
    const xs = e.points.map((p) => p.x);
    const ys = e.points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.35);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.35);
  });

  it('같은 상징을 다시 만들어도 같다', () => {
    /*
     * ★ 무작위가 섞이면 볼 때마다 모양이 달라진다.
     *   그러면 "그 은하의 상징" 이라고 부를 수 없다.
     */
    const first = JSON.stringify(emblemOf('peter')?.points);
    const second = JSON.stringify(emblemOf('peter')?.points);
    expect(first).toBe(second);
  });

  it('조우 멘트가 짧고 단정하다', () => {
    for (const e of EMBLEMS) {
      expect(e.greeting.trim()).toBeTruthy();
      // 도착하고 잠깐 뜨는 한 줄이다. 길면 읽기 전에 지나간다
      expect(e.greeting.length).toBeLessThanOrEqual(24);
      expect(e.greeting).not.toContain('\n');
      // 느낌표는 이 서비스의 톤이 아니다
      expect(e.greeting).not.toContain('!');
    }
  });

  it('상징마다 근거를 밝힌다', () => {
    // "왜 열쇠인가" 를 화면에서도 코드에서도 설명할 수 있어야 한다
    for (const e of EMBLEMS) {
      expect(e.symbol.trim()).toBeTruthy();
      expect(e.basis.trim()).toBeTruthy();
    }
  });

  it('★ 눈으로 확인 — 열세 상징을 그린다', () => {
    const drawings = EMBLEMS.map(
      (e) => `\n[${e.symbol}] ${e.galaxyId} — ${e.basis}\n"${e.greeting}"\n${render(e)}`,
    ).join('\n');
    // 콘솔에 남긴다. 단언이 아니라 검토용이다.
    console.log(drawings);
    expect(drawings.length).toBeGreaterThan(0);
  });
});
