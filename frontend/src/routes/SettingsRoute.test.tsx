/*
 * routes/SettingsRoute.test.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 여기 있는 것이 전부 실제로 무언가를 바꾸는가.
 *
 * 설정 화면에서 가장 나쁜 것은 눌러도 아무 일이 없는 스위치와,
 * 조절할 수 없는데 자리만 차지하는 안내문이다. 둘 다 화면을 거짓말로 만든다.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SettingsRoute } from './SettingsRoute';
import { GalaxyProvider } from '../state/GalaxyContext';
import { AuthProvider } from '../state/AuthContext';
import { PATHS } from './paths';

function renderSettings() {
  render(
    <AuthProvider>
      <GalaxyProvider>
        <MemoryRouter initialEntries={[PATHS.settings]}>
          <Routes>
            <Route path={PATHS.settings} element={<SettingsRoute />} />
            <Route path={PATHS.home} element={<p>홈 화면</p>} />
          </Routes>
        </MemoryRouter>
      </GalaxyProvider>
    </AuthProvider>,
  );
  return userEvent.setup();
}

const qualityGroup = () => screen.getByRole('radiogroup', { name: /화면 품질/ });
const motionGroup = () => screen.getByRole('radiogroup', { name: /움직임/ });

beforeEach(() => window.localStorage.clear());

describe('화면 품질', () => {
  it('자동을 포함해 네 가지를 고를 수 있다', () => {
    renderSettings();
    const options = within(qualityGroup()).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('자동'),
      expect.stringContaining('높음'),
      expect.stringContaining('보통'),
      expect.stringContaining('낮음'),
    ]);
  });

  it('처음에는 자동이다', () => {
    // 기기 사양을 모르는 첫 방문자에게 가장 안전한 기본값이다.
    renderSettings();
    expect(within(qualityGroup()).getByRole('radio', { name: /자동/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('하나만 선택돼 있다', () => {
    renderSettings();
    const checked = within(qualityGroup())
      .getAllByRole('radio')
      .filter((o) => o.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
  });

  it('고르면 그 값으로 바뀐다', async () => {
    const user = renderSettings();
    await user.click(within(qualityGroup()).getByRole('radio', { name: /낮음/ }));

    expect(within(qualityGroup()).getByRole('radio', { name: /낮음/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(qualityGroup()).getByRole('radio', { name: /자동/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('★ 고른 값이 새로고침 뒤에도 남는다', () => {
    // 되돌아가는 값은 설정이 아니라 이번 화면에만 통하는 임시 스위치다.
    window.localStorage.setItem('eden.quality', 'low');
    renderSettings();
    expect(within(qualityGroup()).getByRole('radio', { name: /낮음/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('자동일 때는 지금 어느 단계인지 알려 준다', () => {
    // "자동"만 표시하면 실제로 무엇이 적용됐는지 알 수 없다.
    renderSettings();
    expect(screen.getByText(/지금 적용된 단계/)).toBeInTheDocument();
  });

  it('★ 직접 고르면 자동 강등이 적용되지 않음을 밝힌다', () => {
    // 고른 값을 시스템이 뒤에서 바꿔 버리면 고른 의미가 없다.
    renderSettings();
    expect(screen.getByText(/느려져도 낮추지 않습니다/)).toBeInTheDocument();
  });
});

describe('움직임', () => {
  it('★ 설명만 두지 않고 실제로 고를 수 있다', () => {
    /*
     * 이전에는 "기기 설정을 따릅니다"라는 안내문만 있었다.
     * 조절할 수 없는 항목은 설정이 아니라 설명이다.
     */
    const options = (renderSettings(), within(motionGroup()).getAllByRole('radio'));
    expect(options).toHaveLength(3);
  });

  it('처음에는 기기 설정을 따른다', () => {
    renderSettings();
    expect(within(motionGroup()).getByRole('radio', { name: /기기 설정 따르기/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('기기 설정을 덮어쓸 수 있다', async () => {
    const user = renderSettings();
    await user.click(within(motionGroup()).getByRole('radio', { name: /^줄이기/ }));

    expect(within(motionGroup()).getByRole('radio', { name: /^줄이기/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('★ 줄이기를 고르면 품질 선택이 잠기고 이유를 밝힌다', async () => {
    // 정적 구성으로 고정되므로 품질을 고르는 것이 의미가 없어진다.
    const user = renderSettings();
    await user.click(within(motionGroup()).getByRole('radio', { name: /^줄이기/ }));

    expect(within(qualityGroup()).getAllByRole('radio')[0]).toBeDisabled();
    expect(screen.getByText(/정적 구성으로 고정됩니다/)).toBeInTheDocument();
  });

  it('고른 값이 남는다', () => {
    window.localStorage.setItem('eden.motion', 'full');
    renderSettings();
    expect(within(motionGroup()).getByRole('radio', { name: /움직이게/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('지금 어떤 상태인지 한 줄로 알려 준다', () => {
    renderSettings();
    expect(screen.getByText(/모션 줄이기가 (켜|꺼)져 있어/)).toBeInTheDocument();
  });
});

describe('둘러보기 · 계정', () => {
  it('둘러보기를 다시 열 수 있다', async () => {
    /*
     * 튜토리얼은 처음 한 번만 자동으로 뜬다. 다시 볼 길이 없으면
     * 그 한 번을 놓친 사람에게는 영영 없는 기능이 된다.
     */
    const user = renderSettings();
    await user.click(screen.getByRole('button', { name: /둘러보기 다시 하기/ }));
    // 안내가 가리키는 대상은 홈에 있으므로 홈으로 데려간다
    expect(await screen.findByText('홈 화면')).toBeInTheDocument();
  });

  it('★ 로그인 버튼을 여기에 두지 않는다 — 계정은 오른쪽 위 한 곳에만 있다', () => {
    // 같은 일을 하는 버튼이 두 곳에 있으면 사용자는 둘이 다른 것이라고 생각한다.
    renderSettings();
    expect(screen.queryByRole('button', { name: /로그인/ })).not.toBeInTheDocument();
    expect(screen.getByText(/오른쪽 위에서 계정을 만들 수 있습니다/)).toBeInTheDocument();
  });
});

describe('★ 아직 없는 설정을 스위치로 만들어 두지 않는다', () => {
  it('준비 중인 것은 준비 중이라고만 적는다', () => {
    renderSettings();
    expect(screen.getByText(/알림 설정은 준비 중입니다/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('처음으로 돌아갈 수 있다', async () => {
    const user = renderSettings();
    await user.click(screen.getByRole('button', { name: /처음으로/ }));
    expect(await screen.findByText('홈 화면')).toBeInTheDocument();
  });
});
