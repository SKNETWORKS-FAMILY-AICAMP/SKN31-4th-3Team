/*
 * state/useGalaxyJourney.test.tsx
 * 검증 기준: 은하로 가는 여정이 "도착한 뒤에" 끝나는가.
 *
 * ★ 여기서 잡아야 하는 고장
 *   - 누르자마자 열려서 비행 구간이 사라짐 (거리감이 없어진다)
 *   - 비행 중에 떠났는데 1.6초 뒤에 끌려감
 *   - ?then= 으로 외부 사이트에 내보내짐
 */

import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useGalaxyJourney } from './useGalaxyJourney';
import { GalaxyProvider, useGalaxy } from './GalaxyContext';
import { EncounterProvider } from './EncounterContext';
import { EncounterOverlay } from '../components/galaxy/EncounterOverlay';
import { FLIGHT_DURATION } from '../galaxy/Camera';

const TARGET = 'john';

function Harness({ onArriveRef }: { onArriveRef: { current: ((id: string) => void) | null } }) {
  const arrive = useGalaxyJourney();
  const { travelToGalaxy, travelingToGalaxyId } = useGalaxy();
  onArriveRef.current = arrive;

  return (
    <div>
      <button type="button" onClick={() => travelToGalaxy(TARGET)}>
        은하 고르기
      </button>
      <span data-testid="traveling">{travelingToGalaxyId ?? '없음'}</span>
    </div>
  );
}

function renderJourney(entry = '/sky?galaxy=john&travel=1') {
  const onArriveRef: { current: ((id: string) => void) | null } = { current: null };
  render(
    <GalaxyProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Harness onArriveRef={onArriveRef} />
        <Routes>
          <Route path="/sky" element={<p>별자리</p>} />
          <Route path="/home" element={<p>홈</p>} />
          <Route path="/counsel" element={<p>상담</p>} />
        </Routes>
      </MemoryRouter>
    </GalaxyProvider>,
  );
  return { onArriveRef };
}

function pickGalaxy() {
  act(() => {
    screen.getByRole('button', { name: '은하 고르기' }).click();
  });
}

const COUNSEL = encodeURIComponent('/counsel?q=%EC%99%B8%EB%A1%9C%EC%9B%8C&galaxy=john');

describe('useGalaxyJourney', () => {
  it('★ 고른 직후에는 아직 열리지 않는다', () => {
    // 바로 열면 "고른 것"이지 "찾아간 것"이 아니다.
    renderJourney(`/sky?galaxy=john&travel=1&then=${COUNSEL}`);
    pickGalaxy();

    expect(screen.getByTestId('traveling')).toHaveTextContent(TARGET);
    expect(screen.queryByText('상담')).not.toBeInTheDocument();
  });

  it('엔진이 도착을 알리면 then 으로 넘어간다', () => {
    const { onArriveRef } = renderJourney(`/sky?galaxy=john&travel=1&then=${COUNSEL}`);
    pickGalaxy();

    act(() => onArriveRef.current?.(TARGET));

    expect(screen.getByText('상담')).toBeInTheDocument();
    expect(screen.getByTestId('traveling')).toHaveTextContent('없음');
  });

  it('도착 통지가 오지 않아도 타이머가 끝낸다', () => {
    // Canvas 를 못 쓰는 환경이나 백그라운드 탭에서는 통지가 영영 안 온다.
    vi.useFakeTimers();
    try {
      renderJourney(`/sky?galaxy=john&travel=1&then=${COUNSEL}`);
      pickGalaxy();
      act(() => {
        vi.advanceTimersByTime(FLIGHT_DURATION * 1000 + 500);
      });
      expect(screen.getByText('상담')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('then 이 없으면 그 자리에 머문다', () => {
    // "은하 찾아가기" 경로 — 목록은 SkyRoute 가 연다.
    const { onArriveRef } = renderJourney();
    pickGalaxy();

    act(() => onArriveRef.current?.(TARGET));

    expect(screen.getByText('별자리')).toBeInTheDocument();
    expect(screen.getByTestId('traveling')).toHaveTextContent('없음');
  });

  it('목적지가 아닌 도착 통지는 무시한다', () => {
    // 비행 도중 다른 은하로 목표가 바뀐 경우
    const { onArriveRef } = renderJourney(`/sky?galaxy=john&travel=1&then=${COUNSEL}`);
    pickGalaxy();

    act(() => onArriveRef.current?.('peter'));

    expect(screen.queryByText('상담')).not.toBeInTheDocument();
    expect(screen.getByTestId('traveling')).toHaveTextContent(TARGET);
  });

  it('비행 중에 떠났으면 데려오지 않는다', () => {
    // 이 가드가 없으면 홈으로 나간 뒤 1.6초 뒤에 상담으로 끌려간다.
    const { onArriveRef } = renderJourney(`/home?then=${COUNSEL}`);
    pickGalaxy();

    act(() => onArriveRef.current?.(TARGET));

    expect(screen.getByText('홈')).toBeInTheDocument();
    expect(screen.queryByText('상담')).not.toBeInTheDocument();
  });

  describe('★ then 은 앱 안의 주소만 받는다', () => {
    /*
     * ?then= 은 주소창에 그대로 노출된다. 검사하지 않으면 우리 도메인을
     * 거쳐 밖으로 내보내는 링크를 만들 수 있고, 받은 사람은 앞부분만
     * 보고 누른다.
     */
    const OUTSIDE = [
      'https://example.com',
      '//example.com',
      'javascript:alert(1)',
      'http://example.com/counsel',
    ];

    it.each(OUTSIDE)('%s 로는 나가지 않는다', (evil) => {
      const { onArriveRef } = renderJourney(
        `/sky?galaxy=john&travel=1&then=${encodeURIComponent(evil)}`,
      );
      pickGalaxy();

      act(() => onArriveRef.current?.(TARGET));

      // 비행은 정상적으로 끝나되, 그 자리에 남는다
      expect(screen.getByText('별자리')).toBeInTheDocument();
      expect(screen.getByTestId('traveling')).toHaveTextContent('없음');
    });
  });

  describe('조우가 사이에 들어간다', () => {
    /*
     * ★ 도착 → 조우 → 열림 순서다.
     *   조우를 건너뛰고 열리면 열세 은하가 전부 같은 경험이 된다.
     *   반대로 조우가 끝나도 안 열리면 화면이 멈춘 것으로 보인다 —
     *   그 두 가지를 여기서 잡는다.
     */
    function renderWithEncounter() {
      const onArriveRef: { current: ((id: string) => void) | null } = { current: null };
      render(
        <GalaxyProvider>
          <EncounterProvider>
            <MemoryRouter initialEntries={[`/sky?galaxy=john&travel=1&then=${COUNSEL}`]}>
              <Harness onArriveRef={onArriveRef} />
              {/* 조우 화면은 평소 캔버스가 얹는다. 여기서는 직접 붙인다. */}
              <EncounterOverlay />
              <Routes>
                <Route path="/sky" element={<p>별자리</p>} />
                <Route path="/counsel" element={<p>상담</p>} />
              </Routes>
            </MemoryRouter>
          </EncounterProvider>
        </GalaxyProvider>,
      );
      return { onArriveRef };
    }

    it('도착해도 조우가 끝나기 전에는 열리지 않는다', () => {
      vi.useFakeTimers();
      try {
        const { onArriveRef } = renderWithEncounter();
        pickGalaxy();
        act(() => onArriveRef.current?.(TARGET));

        // 비행은 끝났지만 아직 별이 모이는 중이다
        expect(screen.getByTestId('traveling')).toHaveTextContent('없음');
        expect(screen.queryByText('상담')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('★ 기다려도 저절로 열리지 않는다', () => {
      /*
       * 넘어가는 것은 시간이 아니라 사람이다. 저절로 넘어가면 형태를
       * 더 보고 싶은 사람이 놓친다.
       */
      vi.useFakeTimers();
      try {
        const { onArriveRef } = renderWithEncounter();
        pickGalaxy();
        act(() => onArriveRef.current?.(TARGET));
        act(() => {
          vi.advanceTimersByTime(30_000);
        });
        expect(screen.queryByText('상담')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('버튼을 누르면 열린다', () => {
      vi.useFakeTimers();
      try {
        const { onArriveRef } = renderWithEncounter();
        pickGalaxy();
        act(() => onArriveRef.current?.(TARGET));
        // 형태 안전망 — 엔진 통지가 없어도 버튼은 뜬다
        act(() => {
          vi.advanceTimersByTime(1800);
        });

        act(() => {
          screen.getByRole('button', { name: '상담 들어가기' }).click();
        });
        expect(screen.getByText('상담')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
