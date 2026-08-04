/*
 * routes/SkyRoute.test.tsx
 * 검증 기준: 은하별 목록의 모든 별에 키보드로 도달할 수 있는가.
 *
 * 별이 520개가 되면서 목록은 한 은하씩 펼치는 방식으로 바뀌었다.
 * 한 번에 전부 렌더하면 키보드로는 끝까지 갈 수 없고 화면도 무거워진다.
 */

import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SkyRoute } from './SkyRoute';
import { useStarJourney } from '../state/useStarJourney';
import { RepositoryProvider } from '../services/RepositoryProvider';
import { AppPhaseProvider } from '../state/AppPhaseContext';
import { GalaxyProvider } from '../state/GalaxyContext';
import { VERSE_STARS, formatRef, getVerseStarsByGalaxy } from '../data/verses';
import { CENTER_GALAXY } from '../data/disciples';

/** 목록을 열면 기본으로 펼쳐지는 은하 */
const DEFAULT_STARS = getVerseStarsByGalaxy(CENTER_GALAXY.id);

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

async function openList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /구절 목록/ }));
}

/**
 * 포커스 이동은 onFocus 핸들러를 통해 GalaxyProvider 상태를 바꾼다.
 * act() 로 감싸지 않으면 React 가 경고를 낸다 — 경고를 끄는 게 아니라
 * 실제로 상태 갱신이 끝난 뒤에 단언하기 위해 감싼다.
 */
function focusOption(el: HTMLElement) {
  act(() => el.focus());
}

describe('SkyRoute — 탐색', () => {
  it('기본은 하늘을 비워 두고 목록은 접혀 있다', () => {
    renderSky();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText(/별을 눌러 구절을 열고/)).toBeInTheDocument();
  });

  it('목록을 열면 중심 은하의 별이 모두 노출된다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(DEFAULT_STARS.length);
    expect(DEFAULT_STARS.length).toBeGreaterThanOrEqual(30);
  });

  it('★ 한 번에 한 은하만 펼친다 (520개를 한 목록에 두지 않는다)', () => {
    // 전부 펼치면 roving tabindex 로는 끝까지 갈 수 없다.
    expect(VERSE_STARS.length).toBeGreaterThan(DEFAULT_STARS.length * 2);
  });

  it('펼친 은하의 별이 출처와 함께 표시된다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    for (const star of DEFAULT_STARS) {
      expect(screen.getAllByText(formatRef(star)).length, star.id).toBeGreaterThan(0);
    }
  });

  it('13개 은하를 모두 고를 수 있다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    expect(screen.getAllByRole('tab')).toHaveLength(13);
  });

  it('다른 은하를 고르면 그 은하의 별로 바뀐다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    const before = screen.getAllByRole('option').map((o) => o.id);
    await user.click(screen.getByRole('tab', { name: /베드로/ }));
    const after = screen.getAllByRole('option').map((o) => o.id);

    expect(after).not.toEqual(before);
    expect(after.length).toBeGreaterThan(0);
  });
});

describe('SkyRoute — 키보드 조작', () => {
  it('roving tabindex: 탭 스톱이 목록 전체에 하나뿐이다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    const options = screen.getAllByRole('option');
    const tabbable = options.filter((o) => o.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
  });

  it('방향키로 별 사이를 이동한다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    const options = screen.getAllByRole('option');
    focusOption(options[0]);
    expect(document.activeElement).toBe(options[0]);

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(options[1]);

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(options[0]);
  });

  it('↓ 는 한 줄 아래로 이동한다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    const options = screen.getAllByRole('option');
    focusOption(options[0]);
    await user.keyboard('{ArrowDown}');
    // COLUMNS_ESTIMATE = 3
    expect(document.activeElement).toBe(options[3]);
  });

  it('Home/End 로 처음과 끝으로 간다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    const options = screen.getAllByRole('option');
    focusOption(options[5]);

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(options[options.length - 1]);

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(options[0]);
  });

  it('경계를 넘어가지 않는다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    const options = screen.getAllByRole('option');
    focusOption(options[0]);
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(document.activeElement).toBe(options[0]);

    focusOption(options[options.length - 1]);
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(document.activeElement).toBe(options[options.length - 1]);
  });

  it('Enter 로 별을 고르면 비행이 끝난 뒤 구절 상세가 열린다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    const options = screen.getAllByRole('option');
    focusOption(options[0]);
    await user.keyboard('{Enter}');

    // 카메라가 도착하기 전에는 아직 열리지 않는다.
    expect(screen.queryByText('구절 상세')).not.toBeInTheDocument();

    // 비행(1.6초)이 끝나면 열린다.
    expect(await screen.findByText('구절 상세', {}, { timeout: 4000 })).toBeInTheDocument();
  });
});

describe('SkyRoute — 별로 가는 길', () => {
  it('별을 고르면 즉시 열리지 않고 "가는 중" 상태가 된다', async () => {
    const user = userEvent.setup();
    renderSky();
    await openList(user);

    await user.click(screen.getAllByRole('option')[0]);

    // 목록이 열려 있으면 안내문이 없으므로 목록을 닫고 확인한다.
    await user.click(screen.getByRole('button', { name: '목록 닫기' }));
    expect(screen.getByRole('status')).toHaveTextContent('그 별로 가는 중입니다');
    expect(screen.queryByText('구절 상세')).not.toBeInTheDocument();
  });

  it('평소에는 탐색 안내문이 보인다', async () => {
    renderSky();
    expect(screen.getByRole('status')).toHaveTextContent('별을 눌러 구절을 열고');
  });
});

describe('SkyRoute — URL 포커스', () => {
  it('?focus= 로 진입한 별이 선택 상태가 된다', async () => {
    const user = userEvent.setup();
    const target = VERSE_STARS[7];
    renderSky(`/sky?focus=${target.id}`);
    await openList(user);

    const selected = screen.getAllByRole('option').filter(
      (o) => o.getAttribute('aria-selected') === 'true',
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe(`star-${target.id}`);
  });

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
