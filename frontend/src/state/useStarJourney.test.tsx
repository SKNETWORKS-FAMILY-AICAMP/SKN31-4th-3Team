/*
 * state/useStarJourney.test.tsx
 * 검증 기준: 별로 가는 여정이 "도착한 뒤에" 끝나는가.
 */

import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useStarJourney } from './useStarJourney';
import { GalaxyProvider, useGalaxy } from './GalaxyContext';
import { FLIGHT_DURATION } from '../galaxy/Camera';

const TARGET = 'gen-1-3';

/** 여정 훅을 설치하고, 테스트에서 조작할 수 있게 제어 버튼을 노출한다. */
function Harness({ onArriveRef }: { onArriveRef: { current: ((id: string) => void) | null } }) {
  const arrive = useStarJourney();
  const { travelTo, travelingToId } = useGalaxy();
  onArriveRef.current = arrive;

  return (
    <div>
      <button type="button" onClick={() => travelTo(TARGET)}>
        별 고르기
      </button>
      <span data-testid="traveling">{travelingToId ?? '없음'}</span>
    </div>
  );
}

function renderJourney(entry = '/sky') {
  const onArriveRef: { current: ((id: string) => void) | null } = { current: null };
  render(
    <GalaxyProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Harness onArriveRef={onArriveRef} />
        <Routes>
          <Route path="/sky" element={<p>별자리</p>} />
          <Route path="/home" element={<p>홈</p>} />
          <Route path="/verse/:id" element={<p>구절 상세</p>} />
        </Routes>
      </MemoryRouter>
    </GalaxyProvider>,
  );
  return { onArriveRef };
}

function pickStar() {
  act(() => {
    screen.getByRole('button', { name: '별 고르기' }).click();
  });
}

describe('useStarJourney', () => {
  it('별을 고른 직후에는 아직 상세가 열리지 않는다', () => {
    renderJourney();
    pickStar();

    expect(screen.getByTestId('traveling')).toHaveTextContent(TARGET);
    expect(screen.queryByText('구절 상세')).not.toBeInTheDocument();
    expect(screen.getByText('별자리')).toBeInTheDocument();
  });

  it('엔진이 도착을 알리면 즉시 상세가 열린다', async () => {
    const { onArriveRef } = renderJourney();
    pickStar();

    act(() => onArriveRef.current?.(TARGET));

    expect(await screen.findByText('구절 상세')).toBeInTheDocument();
    expect(screen.getByTestId('traveling')).toHaveTextContent('없음');
  });

  it('도착 통지가 없어도 비행 시간이 지나면 열린다 (Canvas 미지원 안전망)', async () => {
    renderJourney();
    pickStar();

    expect(screen.queryByText('구절 상세')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('구절 상세')).toBeInTheDocument(), {
      timeout: FLIGHT_DURATION * 1000 + 1500,
    });
  });

  it('다른 별의 도착 통지는 무시한다 (도중에 목표가 바뀐 경우)', () => {
    const { onArriveRef } = renderJourney();
    pickStar();

    act(() => onArriveRef.current?.('psa-23-3'));

    expect(screen.queryByText('구절 상세')).not.toBeInTheDocument();
    expect(screen.getByTestId('traveling')).toHaveTextContent(TARGET);
  });

  it('★ 비행 도중 다른 화면으로 떠나면 끌고 오지 않는다', async () => {
    const { onArriveRef } = renderJourney('/home');
    pickStar();

    // 사용자는 이미 홈에 있다 — 도착해도 상세를 열면 안 된다.
    act(() => onArriveRef.current?.(TARGET));

    expect(screen.getByText('홈')).toBeInTheDocument();
    expect(screen.queryByText('구절 상세')).not.toBeInTheDocument();
    // 여정 상태는 정리된다.
    await waitFor(() => expect(screen.getByTestId('traveling')).toHaveTextContent('없음'));
  });
});
