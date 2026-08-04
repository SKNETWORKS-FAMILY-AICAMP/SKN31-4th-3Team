/*
 * state/GalaxyContext.test.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 카메라 목표가 하나로 유지되고, 화면을 떠나면 처음 자리로 돌아오는가.
 *
 * 캔버스는 라우터 밖에서 계속 살아 있다. 되돌리는 책임이 여기에 없으면
 * "처음으로"를 눌러 홈에 와도 별 하나에 코를 박은 배경이 남는다.
 */

import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { GalaxyProvider, useGalaxy } from './GalaxyContext';

function setup() {
  return renderHook(() => useGalaxy(), { wrapper: GalaxyProvider });
}

describe('카메라 목표는 하나뿐이다', () => {
  it('별을 고르면 은하 포커스가 풀린다', () => {
    const { result } = setup();

    act(() => result.current.focusGalaxy('peter'));
    expect(result.current.focusGalaxyId).toBe('peter');

    act(() => result.current.focusStar('gen-1-3'));
    expect(result.current.focusStarId).toBe('gen-1-3');
    expect(result.current.focusGalaxyId).toBeNull();
  });

  it('은하를 고르면 별 포커스가 풀린다', () => {
    const { result } = setup();

    act(() => result.current.travelTo('gen-1-3'));
    expect(result.current.focusStarId).toBe('gen-1-3');

    act(() => result.current.focusGalaxy('john'));
    expect(result.current.focusStarId).toBeNull();
    expect(result.current.focusGalaxyId).toBe('john');
    // 은하로 시선을 옮기면 진행 중이던 여정도 끝난다.
    expect(result.current.travelingToId).toBeNull();
  });

  it('별로 날아가는 동안에는 은하 포커스가 남지 않는다', () => {
    const { result } = setup();

    act(() => result.current.focusGalaxy('simon'));
    act(() => result.current.travelTo('php-4-6'));

    expect(result.current.travelingToId).toBe('php-4-6');
    expect(result.current.focusGalaxyId).toBeNull();
  });
});

describe('resetView', () => {
  it('★ 확대된 상태를 전부 푼다', () => {
    const { result } = setup();

    act(() => {
      result.current.travelTo('gen-1-3');
      result.current.setHoverStarId('gen-1-3');
      result.current.setHoverGalaxyId('jesus');
    });

    act(() => result.current.resetView());

    expect(result.current.focusStarId).toBeNull();
    expect(result.current.focusGalaxyId).toBeNull();
    expect(result.current.travelingToId).toBeNull();
    expect(result.current.hoverStarId).toBeNull();
    expect(result.current.hoverGalaxyId).toBeNull();
  });

  it('이미 처음 자리면 아무것도 바뀌지 않는다', () => {
    const { result } = setup();
    act(() => result.current.resetView());

    expect(result.current.focusStarId).toBeNull();
    expect(result.current.focusGalaxyId).toBeNull();
  });

  it('함수 정체성이 유지된다 (effect 가 매 렌더 다시 돌지 않게)', () => {
    const { result, rerender } = setup();
    const first = result.current.resetView;
    rerender();
    expect(result.current.resetView).toBe(first);
  });
});

describe('MBTI 선택', () => {
  it('고르면 결이 가까운 은하만 남는다', () => {
    const { result } = setup();
    act(() => result.current.selectMbti('INFJ'));

    expect(result.current.selectedMbti).toBe('INFJ');
    expect(result.current.affinityGalaxyIds.length).toBeGreaterThan(0);
    expect(result.current.affinityGalaxyIds.length).toBeLessThan(13);
  });

  it('해제하면 전부 돌아온다', () => {
    const { result } = setup();
    act(() => result.current.selectMbti('INFJ'));
    act(() => result.current.selectMbti(null));

    expect(result.current.selectedMbti).toBeNull();
    expect(result.current.affinityGalaxyIds).toEqual([]);
  });

  it('★ 고르면 진행 중이던 구절 집중은 풀린다', () => {
    // 구절 하나를 보는 중에 은하 절반이 사라지면 무슨 일인지 알 수 없다.
    const { result } = setup();
    act(() => result.current.travelTo('gen-1-3'));
    act(() => result.current.selectMbti('ENFP'));

    expect(result.current.focusStarId).toBeNull();
    expect(result.current.travelingToId).toBeNull();
  });

  it('resetView 는 유형 선택까지 건드리지 않는다', () => {
    // 화면을 옮겼다고 사용자가 고른 유형을 몰래 지우면 안 된다.
    const { result } = setup();
    act(() => result.current.selectMbti('ISTJ'));
    act(() => result.current.resetView());

    expect(result.current.selectedMbti).toBe('ISTJ');
  });

  it('같은 유형이면 목록 정체성이 유지된다 (엔진이 매 렌더 갱신되지 않게)', () => {
    const { result, rerender } = setup();
    act(() => result.current.selectMbti('INTP'));
    const first = result.current.affinityGalaxyIds;
    rerender();
    expect(result.current.affinityGalaxyIds).toBe(first);
  });
});
