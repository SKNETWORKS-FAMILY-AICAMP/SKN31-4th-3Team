/*
 * components/galaxy/VerseListDialog.test.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 구절 목록 창에 키보드로 끝까지 도달할 수 있는가.
 *
 * ★ 이 테스트들은 SkyRoute.test.tsx 에서 왔다.
 *   목록은 자리를 옮겨 다녔다 — 하늘 위 판 → 사이드바 안 → 별도 창.
 *   옮기는 동안 한 번은 단순 <ul> 로 바꿨는데, 그러면 방향키 순회와
 *   roving tabindex 가 사라진다. 기능이 이사한다고 접근성이 이사에서
 *   빠지면 안 되므로 StarKeyboardLayer 를 그대로 데려왔고, 이 파일이
 *   그걸 지킨다.
 *
 * ★ 창은 넓어서 3열이다 (columns=3).
 */

import { describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SiteMenu } from '../common/SiteMenu';
import { PATHS } from '../../routes/paths';
import { AuthProvider } from '../../state/AuthContext';
import { ThreadsProvider } from '../../state/ThreadsContext';
import { CENTER_GALAXY } from '../../data/disciples';
import { getVerseStarsByGalaxy } from '../../data/verses';

/** 창을 열면 기본으로 펼쳐지는 은하 */
const DEFAULT_STARS = getVerseStarsByGalaxy(CENTER_GALAXY.id);

function renderMenu() {
  render(
    <AuthProvider>
      <ThreadsProvider>
        <MemoryRouter initialEntries={[PATHS.home]}>
          <SiteMenu />
          <Routes>
            <Route path={PATHS.home} element={<p>홈 화면</p>} />
            <Route path={PATHS.sky} element={<p>별자리 화면</p>} />
          </Routes>
        </MemoryRouter>
      </ThreadsProvider>
    </AuthProvider>,
  );
}

/**
 * 사이드바를 열고 거기서 구절 목록 창을 띄운다.
 *
 * ★ "구절 목록" 은 HOME·별자리와 같은 줄에 선 메뉴 항목이다.
 *   다른 항목은 주소를 바꾸지만 이것만 창을 띄운다.
 */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '메뉴 열기' }));
  await user.click(screen.getByRole('button', { name: /구절 목록/ }));
}

/**
 * 포커스 이동은 onFocus 핸들러를 통해 상태를 바꾼다.
 * act() 로 감싸지 않으면 React 가 경고를 낸다 — 경고를 끄려는 게 아니라
 * 상태 갱신이 끝난 뒤에 단언하기 위해서다.
 */
function focusOption(el: HTMLElement) {
  act(() => el.focus());
}

describe('구절 목록 창', () => {
  it('열면 중심 은하의 별이 모두 노출된다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    expect(screen.getAllByRole('option')).toHaveLength(DEFAULT_STARS.length);
  });

  it('13개 은하를 모두 고를 수 있다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    const dialog = screen.getByRole('dialog', { name: '구절 목록' });
    expect(within(dialog).getAllByRole('tab')).toHaveLength(13);
  });

  it('다른 은하를 고르면 그 은하의 별로 바뀐다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    const before = screen.getAllByRole('option').map((o) => o.id);
    const dialog = screen.getByRole('dialog', { name: '구절 목록' });
    await user.click(within(dialog).getByRole('tab', { name: /베드로/ }));
    const after = screen.getAllByRole('option').map((o) => o.id);

    expect(after).not.toEqual(before);
    expect(after.length).toBeGreaterThan(0);
  });
});

describe('구절 목록 창 — 키보드', () => {
  it('roving tabindex: 탭 스톱이 목록 전체에 하나뿐이다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    const tabbable = screen
      .getAllByRole('option')
      .filter((o) => o.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
  });

  it('←→ 로 한 칸씩, ↓ 로 한 줄씩 이동한다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    const options = screen.getAllByRole('option');
    focusOption(options[0]);

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(options[1]);

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(options[0]);

    // 3열이므로 한 줄 아래는 세 칸 뒤다.
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(options[3]);
  });

  it('Home/End 로 처음과 끝으로 간다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    const options = screen.getAllByRole('option');
    focusOption(options[5]);

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(options[options.length - 1]);

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(options[0]);
  });

  it('경계를 넘어가지 않는다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    const options = screen.getAllByRole('option');
    focusOption(options[0]);
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(document.activeElement).toBe(options[0]);

    focusOption(options[options.length - 1]);
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(document.activeElement).toBe(options[options.length - 1]);
  });
});

describe('구절 목록 창 — 고르면', () => {
  it('창이 닫히고 그 별로 날아간다', async () => {
    /*
     * ★ 닫히는 것이 먼저다.
     *   카메라가 1.6초 동안 날아가는데 창이 덮고 있으면 비행이 안 보인다.
     *   도착하면 구절 상세가 열린다.
     */
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(screen.getAllByRole('option')[0]);

    expect(await screen.findByText('별자리 화면')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
