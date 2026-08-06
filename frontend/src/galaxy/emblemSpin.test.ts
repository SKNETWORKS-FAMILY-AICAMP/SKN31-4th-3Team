/*
 * galaxy/emblemSpin.test.ts
 *
 * ★ 여기서 잡아야 하는 고장
 *   - 돌려도 아무것도 안 움직임 (평면이라 회전이 안 보임)
 *   - 돌리면 형태가 배지 밖으로 튀어나감
 *   - 앞뒤 구분이 없어 "도는 것"이 아니라 "떨리는 것"으로 보임
 */

import { describe, expect, it } from 'vitest';

import { EMBLEMS, emblemOf } from '../data/emblems';
import { badgeAngle, BADGE_PERIOD, spinEmblem } from './emblemSpin';

const CROSS = emblemOf('jesus')!;

describe('배지 회전', () => {
  it('점 수는 상징 그대로다', () => {
    expect(spinEmblem(CROSS, 0)).toHaveLength(CROSS.points.length);
  });

  it('어느 각도에서도 배지 밖으로 나가지 않는다', () => {
    /*
     * ★ 얕은 원근 때문에 앞으로 나온 점이 바깥으로 밀린다.
     *   여백(BADGE_INSET)이 그 몫을 감당하는지 한 바퀴 돌며 확인한다.
     */
    for (const emblem of EMBLEMS) {
      for (let step = 0; step < 24; step += 1) {
        const angle = (step / 24) * Math.PI * 2;
        for (const p of spinEmblem(emblem, angle)) {
          expect(p.x, `${emblem.galaxyId} 가로로 튐`).toBeGreaterThanOrEqual(0);
          expect(p.x, `${emblem.galaxyId} 가로로 튐`).toBeLessThanOrEqual(1);
          expect(p.y, `${emblem.galaxyId} 세로로 튐`).toBeGreaterThanOrEqual(0);
          expect(p.y, `${emblem.galaxyId} 세로로 튐`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('★ 돌리면 실제로 움직인다', () => {
    /*
     * 두께가 0 이면 회전해도 가로 좌표만 일률적으로 줄어든다 — 도는 게
     * 아니라 납작해지는 것이다. 앞뒤가 다르게 움직이는지 본다.
     */
    const at0 = spinEmblem(CROSS, 0);
    const at90 = spinEmblem(CROSS, Math.PI / 2);

    let moved = 0;
    for (let i = 0; i < at0.length; i += 1) {
      if (Math.abs(at0[i].x - at90[i].x) > 0.01) moved += 1;
    }
    expect(moved).toBeGreaterThan(at0.length * 0.5);
  });

  it('세로는 회전에 흔들리지 않는다', () => {
    // 세로축 회전이므로 y 는 그대로여야 한다. 흔들리면 축이 잘못 잡힌 것이다.
    const at0 = spinEmblem(CROSS, 0);
    const at40 = spinEmblem(CROSS, 0.7);
    for (let i = 0; i < at0.length; i += 1) {
      expect(at40[i].y).toBeCloseTo(at0[i].y, 1);
    }
  });

  it('앞뒤가 나뉜다', () => {
    /*
     * ★ depth 가 전부 같으면 앞뒤가 겹쳐 보이고, 도는 게 아니라
     *   형태가 흔들리는 것으로 읽힌다.
     */
    const points = spinEmblem(CROSS, 0.9);
    const depths = points.map((p) => p.depth);
    expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.3);
    for (const d of depths) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });

  it('정면에서는 상징 그대로다', () => {
    // 각도 0 에서 형태가 틀어져 있으면 미리보기와 화면이 어긋난다
    const points = spinEmblem(CROSS, 0);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.5);
  });

  it('한 바퀴를 돈다', () => {
    expect(badgeAngle(0, false)).toBeCloseTo(0, 5);
    expect(badgeAngle(BADGE_PERIOD / 2, false)).toBeCloseTo(Math.PI, 5);
    // 주기가 지나면 처음으로 돌아온다 — 각도가 무한히 커지지 않는다
    expect(badgeAngle(BADGE_PERIOD, false)).toBeCloseTo(0, 5);
    expect(badgeAngle(BADGE_PERIOD * 3.25, false)).toBeCloseTo(Math.PI / 2, 5);
  });

  it('모션을 줄여 두면 멈춘 정면을 준다', () => {
    // 돌지 않아도 상징은 보이고, 배지의 목적은 그대로 달성된다
    expect(badgeAngle(999, true)).toBe(0);
  });
});
