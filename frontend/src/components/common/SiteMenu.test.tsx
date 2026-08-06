/*
 * components/common/SiteMenu.test.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 사이드바가 열리고 닫히는가, 지난 상담으로 갈 수 있는가.
 *
 * ★ 예전에는 "배경을 덮지 않는다" 가 핵심 제약이었다.
 *   사이드바가 되면서 옅은 판을 깔기로 했다 — 바깥을 눌러 닫는 것이
 *   사이드바에서 가장 흔한 동작이기 때문이다. 대신 "판이 옅어야 한다",
 *   "화면을 밀지 않는다" 는 제약이 남았고, 그건 CSS 규칙으로 검사한다.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SiteMenu } from './SiteMenu';
import { MENU_ITEMS } from './siteMenuItems';
import { PATHS } from '../../routes/paths';
import { AuthProvider } from '../../state/AuthContext';
import { ThreadsProvider } from '../../state/ThreadsContext';
import { saveThread } from '../../services/threadStore';

const here = dirname(fileURLToPath(import.meta.url));

function renderMenu(entry: string = PATHS.home) {
  render(
    <AuthProvider>
      <ThreadsProvider>
        <MemoryRouter initialEntries={[entry]}>
          <SiteMenu />
          <Routes>
            <Route path={PATHS.home} element={<p>홈 화면</p>} />
            <Route path={PATHS.sky} element={<p>별자리 화면</p>} />
            <Route path={PATHS.settings} element={<p>환경설정 화면</p>} />
            <Route path={PATHS.counsel} element={<p>상담 화면</p>} />
          </Routes>
        </MemoryRouter>
      </ThreadsProvider>
    </AuthProvider>,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '메뉴 열기' }));
}

/** 목록에 뜰 대화방 하나를 브라우저에 남긴다. */
function seedThread(title = '요즘 너무 불안해요') {
  window.localStorage.clear();
  saveThread({
    id: 'thread-1',
    title,
    personaId: 'peter',
    seed: { question: title },
    messages: [
      { id: 'm1', role: 'guide', text: '오래 기다렸습니다.', createdAt: 1 },
      { id: 'm2', role: 'user', text: title, createdAt: 2 },
    ],
    createdAt: 1,
    updatedAt: 2,
  });
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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '메뉴 열기' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('누르면 이동할 곳과 지난 상담 자리가 함께 나타난다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    expect(screen.getByRole('dialog', { name: '메뉴와 지난 상담' })).toBeInTheDocument();
    expect(screen.getByText('HOME')).toBeInTheDocument();
    expect(screen.getByText('별자리')).toBeInTheDocument();
    expect(screen.getByText('지난 상담')).toBeInTheDocument();
  });

  it('★ 환경설정은 위가 아니라 아래 톱니에 있다', async () => {
    /*
     * 요청대로 환경설정은 좌측 하단에 둔다. 위 목록에도 남겨 두면
     * 같은 곳으로 가는 입구가 둘이 되어 어느 쪽이 맞는지 헷갈린다.
     */
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    const gear = screen.getByRole('button', { name: '환경설정' });
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    expect(nav.contains(gear)).toBe(false);
  });

  it('다시 누르면 닫힌다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);
    await user.click(screen.getByRole('button', { name: '메뉴 닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Esc 로 닫히고 포커스가 버튼으로 돌아온다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '메뉴 열기' }));
  });
});

describe('이동', () => {
  it('환경설정으로 간다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole('button', { name: '환경설정' }));
    expect(await screen.findByText('환경설정 화면')).toBeInTheDocument();
  });

  it('이동하면 사이드바가 닫힌다', async () => {
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(screen.getByRole('button', { name: '환경설정' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('지금 보고 있는 화면이 표시된다', async () => {
    const user = userEvent.setup();
    renderMenu(PATHS.settings);
    await openMenu(user);

    expect(screen.getByRole('button', { name: '환경설정' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: /HOME/ })).not.toHaveAttribute('aria-current');
  });
});

describe('지난 상담', () => {
  it('없으면 그렇다고 알린다', async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    expect(
      screen.getByText(/이야기를 시작하면 여기에 남습니다|아직 나눈 이야기가 없습니다/),
    ).toBeInTheDocument();
  });

  it('있으면 제목과 상대가 뜬다', async () => {
    seedThread();
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    expect(await screen.findByText('요즘 너무 불안해요')).toBeInTheDocument();
    expect(screen.getByText('베드로')).toBeInTheDocument();
  });

  it('누르면 그 대화로 들어간다', async () => {
    seedThread();
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(await screen.findByText('요즘 너무 불안해요'));
    expect(await screen.findByText('상담 화면')).toBeInTheDocument();
  });

  it('★ 나가기는 한 번 더 묻는다', async () => {
    /*
     * 되돌릴 수 없는 일이고, 목록에서 손가락이 미끄러지기 쉬운 자리다.
     * 한 번에 지워지면 지난 이야기가 실수로 사라진다.
     */
    seedThread();
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(await screen.findByRole('button', { name: /대화 나가기/ }));
    expect(screen.getByRole('button', { name: '지우기' })).toBeInTheDocument();
    // 아직 목록에 남아 있다
    expect(screen.getByText('요즘 너무 불안해요')).toBeInTheDocument();
  });

  it('취소하면 남는다', async () => {
    seedThread();
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(await screen.findByRole('button', { name: /대화 나가기/ }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByText('요즘 너무 불안해요')).toBeInTheDocument();
  });

  it('한 번 더 누르면 목록에서 사라진다', async () => {
    seedThread();
    const user = userEvent.setup();
    renderMenu();
    await openMenu(user);

    await user.click(await screen.findByRole('button', { name: /대화 나가기/ }));
    await user.click(screen.getByRole('button', { name: '지우기' }));

    expect(screen.queryByText('요즘 너무 불안해요')).not.toBeInTheDocument();
  });

  it('저장소가 막혀 있어도 사이드바는 뜬다', async () => {
    /*
     * ★ 사파리 프라이빗 모드에서 localStorage 는 예외를 던진다.
     *   그 예외가 렌더 중에 터지면 화면 전체가 빈다 — 기억하지 못하는 것은
     *   불편할 뿐이지만, 화면이 사라지는 것은 고장이다.
     */
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    try {
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });
});

/*
 * jsdom 에는 레이아웃이 없어 "무엇이 무엇을 덮는가"를 재현할 수 없다.
 * 그래서 이 제약은 스타일 규칙 자체를 계약으로 보고 검증한다.
 */
describe('배경 연출을 지우지 않는다', () => {
  const css = readFileSync(resolve(here, './SiteMenu.module.css'), 'utf8');
  const ruleBody = (className: string) => {
    const match = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(css);
    if (!match) throw new Error(`.${className} 규칙을 찾지 못했습니다`);
    return match[1];
  };

  it('★ 덮는 판이 옅다', () => {
    /*
     * 짙게 깔면 사이드바를 여는 순간 다른 화면으로 넘어간 것처럼 보인다.
     * 별이 계속 보여야 한다.
     */
    const alpha = /rgba\([^)]*?,\s*([\d.]+)\s*\)/.exec(ruleBody('scrim'));
    expect(alpha, 'scrim 에 rgba 배경이 없습니다').toBeTruthy();
    expect(Number(alpha![1])).toBeLessThan(0.5);
  });

  it('★ 화면을 밀지 않는다', () => {
    /*
     * 화면을 오른쪽으로 밀면 캔버스도 함께 밀려 카메라 구도가 틀어진다.
     * 사이드바는 fixed 로 그 위에 얹혀야 한다.
     */
    expect(ruleBody('panel')).toMatch(/position:\s*fixed/);
  });

  it('구절 상세보다 아래에 놓인다', () => {
    // 상세가 열렸을 때는 그쪽이 주인공이다.
    expect(ruleBody('panel')).toContain('z-index: var(--z-menu)');
  });

  it('작대기 버튼이 왼쪽 끝에 붙어 있다', () => {
    // 본문 여백에 맞추면 넓은 화면에서 한참 안쪽에 떠서 손잡이로 안 보인다
    expect(ruleBody('trigger')).toMatch(/left:\s*var\(--sp-4\)/);
  });

  it('판은 반투명 배경을 쓴다', () => {
    const panel = ruleBody('panel');
    expect(panel).toContain('var(--bg-scrim)');
    expect(panel).toContain('backdrop-filter');
  });
});
