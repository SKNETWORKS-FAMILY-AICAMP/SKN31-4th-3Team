/*
 * components/common/SiteMenu.test.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 메뉴가 뒤를 가리지 않으면서, 열고 닫고 이동할 수 있는가.
 *
 * ★ "배경을 덮지 않는다"가 이 컴포넌트의 핵심 제약이다.
 *   보통의 드롭다운은 화면 전체를 덮는 판을 깔아 바깥 클릭을 받는다.
 *   여기서 그렇게 하면 메뉴를 연 동안 은하수의 별을 누를 수 없게 된다.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SiteMenu } from './SiteMenu';
import { MENU_ITEMS } from './siteMenuItems';
import { PATHS } from '../../routes/paths';

const here = dirname(fileURLToPath(import.meta.url));

function renderMenu(entry: string = PATHS.home) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <SiteMenu />
      <Routes>
        <Route path={PATHS.home} element={<p>홈 화면</p>} />
        <Route path={PATHS.sky} element={<p>별자리 화면</p>} />
        <Route path={PATHS.settings} element={<p>환경설정 화면</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '메뉴 열기' }));
}

describe('메뉴 구성', () => {
  it('HOME · 별자리 · 환경설정 세 자리다', () => {
    expect(MENU_ITEMS).toHaveLength(3);
    expect(MENU_ITEMS.map((i) => i.label)).toEqual(['HOME', '별자리', '환경설정']);
  });

  it('갈 곳이 있는 항목은 실재하는 경로를 가리킨다', () => {
    const known = new Set<string>(Object.values(PATHS));
    for (const item of MENU_ITEMS) {
      if (item.to) expect(known.has(item.to), item.id).toBe(true);
    }
  });

  it('모든 항목에 한 줄 설명이 있다', () => {
    for (const item of MENU_ITEMS) {
      expect(item.hint.length, item.id).toBeGreaterThan(0);
    }
  });
});

describe('열고 닫기', () => {
  it('처음에는 닫혀 있다', () => {
    renderMenu();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('누르면 세 항목이 나타난다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
    expect(screen.getByText('HOME')).toBeInTheDocument();
    expect(screen.getByText('환경설정')).toBeInTheDocument();
    expect(screen.getByText('별자리')).toBeInTheDocument();
  });

  it('다시 누르면 닫힌다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);
    await user.click(screen.getByRole('button', { name: '메뉴 닫기' }));
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('Esc 로 닫히고 포커스가 버튼으로 돌아온다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '메뉴 열기' }));
  });

  it('바깥을 누르면 닫힌다 (덮는 판 없이 document 가 대신 듣는다)', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(screen.getByText('홈 화면'));
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('이동', () => {
  it('환경설정으로 간다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole('button', { name: /환경설정/ }));
    expect(await screen.findByText('환경설정 화면')).toBeInTheDocument();
  });

  it('이동하면 메뉴가 닫힌다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole('button', { name: /환경설정/ }));
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('지금 보고 있는 화면이 표시된다', async () => {
    const user = userEvent.setup();
    renderMenu(PATHS.settings);
    await openMenu(user);

    expect(screen.getByRole('button', { name: /환경설정/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: /HOME/ })).not.toHaveAttribute('aria-current');
  });

  it('세 자리 모두 갈 곳이 있다', () => {
    // 눌러도 아무 일이 없는 버튼은 고장으로 읽힌다.
    for (const item of MENU_ITEMS) {
      expect(item.to, item.id).toBeTruthy();
    }
  });
});

/*
 * jsdom 에는 레이아웃이 없어 "무엇이 무엇을 덮는가"를 재현할 수 없다.
 * 그래서 이 제약은 스타일 규칙 자체를 계약으로 보고 검증한다.
 */
describe('배경을 덮지 않는다', () => {
  const css = readFileSync(resolve(here, './SiteMenu.module.css'), 'utf8');
  const ruleBody = (className: string) => {
    const match = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(css);
    if (!match) throw new Error(`.${className} 규칙을 찾지 못했습니다`);
    return match[1];
  };

  it('★ 화면 전체를 덮는 요소가 없다', () => {
    // inset: 0 이 등장하는 순간 뒤의 은하수를 누를 수 없게 된다.
    expect(css).not.toContain('inset: 0');
  });

  it('메뉴는 내용만큼만 자리를 차지한다', () => {
    const root = ruleBody('root');
    expect(root).toContain('position: fixed');
    expect(root).not.toContain('width: 100%');
    expect(root).not.toContain('height: 100%');
  });

  it('구절 상세보다 아래에 놓인다', () => {
    // 상세가 열렸을 때는 그쪽이 주인공이다.
    expect(ruleBody('root')).toContain('z-index: var(--z-menu)');
  });

  it('판은 반투명 배경을 쓴다', () => {
    const panel = ruleBody('panel');
    expect(panel).toContain('var(--bg-scrim)');
    expect(panel).toContain('backdrop-filter');
  });
});
