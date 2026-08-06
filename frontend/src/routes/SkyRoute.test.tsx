/*
 * routes/SkyRoute.test.tsx
 * 검증 기준: 하늘이 하늘만 보여 주는가, URL 이 카메라를 제대로 모는가.
 *
 * ★ 구절 목록 테스트는 여기 없다.
 *   목록은 사이드바로 옮겼다(components/common/SiteMenu.tsx). 이 화면
 *   위에 판으로 떠 있던 시절에는 오른쪽 MBTI 레일과 자리를 다퉜고,
 *   좁은 화면에서 글자가 포개졌다.
 *
 *   목록·키보드 순회 검증은 SiteMenuVerses.test.tsx 로 함께 옮겼다.
 *   기능이 이사하면 그 기능을 지키던 테스트도 같이 간다.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SkyRoute } from './SkyRoute';
import { useStarJourney } from '../state/useStarJourney';
import { RepositoryProvider } from '../services/RepositoryProvider';
import { AppPhaseProvider } from '../state/AppPhaseContext';
import { GalaxyProvider } from '../state/GalaxyContext';
import { VERSE_STARS } from '../data/verses';

/**
 * 여정(별 선택 → 비행 → 도착 → 상세)은 AppShell 이 useStarJourney 로 설치한다.
 * 테스트에서도 같은 훅을 걸어야 흐름이 끝까지 재현된다.
 */
function Journey() {
  useStarJourney();
  return null;
}

function renderSky(entry = '/sky') {
  render(
    <RepositoryProvider>
      <AppPhaseProvider>
        <GalaxyProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Journey />
            <Routes>
              <Route path="/sky" element={<SkyRoute />} />
              <Route path="/verse/:id" element={<p>구절 상세</p>} />
              <Route path="/home" element={<p>홈</p>} />
            </Routes>
          </MemoryRouter>
        </GalaxyProvider>
      </AppPhaseProvider>
    </RepositoryProvider>,
  );
}

describe('SkyRoute — 탐색', () => {
  it('기본은 하늘을 비워 두고 목록은 접혀 있다', () => {
    renderSky();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText(/별을 눌러 구절을 열고/)).toBeInTheDocument();
  });

});

describe('SkyRoute — 별로 가는 길', () => {
  it('별로 향하는 동안 "가는 중" 상태가 된다', () => {
    // 사이드바에서 구절을 고르면 이 주소로 들어온다.
    renderSky(`/sky?focus=${VERSE_STARS[3].id}&travel=1`);

    expect(screen.getByRole('status')).toHaveTextContent('그 별로 가는 중입니다');
    expect(screen.queryByText('구절 상세')).not.toBeInTheDocument();
  });

  it('평소에는 탐색 안내문이 보인다', async () => {
    renderSky();
    expect(screen.getByRole('status')).toHaveTextContent('별을 눌러 구절을 열고');
  });
});

describe('SkyRoute — URL 포커스', () => {
  it('?focus= 만 있으면 하늘에 머문다 (구절이 저절로 열리지 않는다)', async () => {
    renderSky(`/sky?focus=${VERSE_STARS[7].id}`);
    // 비행 시간이 지나도 탐색 화면 그대로여야 한다.
    await new Promise((resolve) => setTimeout(resolve, 2200));
    expect(screen.queryByText('구절 상세')).not.toBeInTheDocument();
  }, 8000);

  it('★ travel=1 이면 날아간 뒤 구절이 바로 열린다', async () => {
    /*
     * 답변에서 구절을 고른 경우다. 사용자는 이미 볼 구절을 정했으므로
     * 하늘에 내려놓고 다시 찾게 하면 안 된다.
     */
    renderSky(`/sky?focus=${VERSE_STARS[7].id}&travel=1`);

    expect(screen.getByRole('status')).toHaveTextContent('그 별로 가는 중입니다');
    expect(await screen.findByText('구절 상세', undefined, { timeout: 4000 })).toBeInTheDocument();
  }, 8000);
});
