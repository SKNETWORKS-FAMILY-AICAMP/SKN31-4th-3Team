/*
 * 로그인 / 회원가입.
 *
 * 여기서 확인하는 것은 인증이 아니라 폼의 정직함이다 —
 * 필요한 것을 필요하다고 말하는가, 빠뜨렸을 때 왜인지 알려 주는가.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthRoute } from './AuthRoute';
import { AuthProvider } from '../state/AuthContext';
import { MBTI_TYPES } from '../data/mbti';
import { PATHS } from './paths';

function renderAuth(mode?: 'login' | 'register') {
  render(
    <AuthProvider>
      <MemoryRouter
        initialEntries={[{ pathname: PATHS.auth, state: mode ? { mode } : null }]}
      >
        <Routes>
          <Route path={PATHS.auth} element={<AuthRoute />} />
          <Route path={PATHS.home} element={<p>홈 화면</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  return userEvent.setup();
}

/** 가입 모드로 전환한다. 기본은 로그인이다. */
async function toRegister(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '계정 만들기' }));
}

describe('어떤 모드로 열리는가', () => {
  it('요청이 없으면 로그인 모드다', () => {
    renderAuth();
    expect(screen.getByRole('heading', { name: '로그인' })).toBeInTheDocument();
  });

  it('★ 회원가입으로 들어오면 가입 폼이 바로 보인다', () => {
    /*
     * 로그인 폼을 먼저 보여 주고 "계정 만들기"를 다시 찾게 하면,
     * 방금 회원가입을 눌렀는데 회원가입이 아닌 화면이 뜬 셈이 된다.
     * 튜토리얼이 여기서 이름·MBTI 를 이어서 설명하므로 순서가 어긋나면
     * 안내 전체가 꼬인다.
     */
    renderAuth('register');
    expect(screen.getByRole('heading', { name: '계정 만들기' })).toBeInTheDocument();
    expect(screen.getByText('이름')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'MBTI 유형' })).toBeInTheDocument();
  });

  it('로그인으로 들어오면 로그인 폼이다', () => {
    renderAuth('login');
    expect(screen.getByRole('heading', { name: '로그인' })).toBeInTheDocument();
  });

  it('로그인에는 이름도 MBTI 도 묻지 않는다', () => {
    renderAuth();
    expect(screen.queryByText('이름')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('★ 계정 없이도 둘러볼 수 있다고 밝힌다', () => {
    // 첫 방문자가 연출을 보기도 전에 벽으로 읽으면 안 된다.
    renderAuth();
    expect(screen.getByText(/둘러보기와 구절 읽기는/)).toBeInTheDocument();
  });
});

describe('회원가입', () => {
  it('이름을 받는다', async () => {
    const user = renderAuth();
    await toRegister(user);
    expect(screen.getByText('이름')).toBeInTheDocument();
  });

  it('★ MBTI 16개가 접히지 않고 모두 보인다', async () => {
    /*
     * select 로 접어 두면 무엇이 있는지 보이지 않고 두 번을 눌러야 한다.
     * 이 값은 나중에 오른쪽 목록에서 빛나는 "내 자리"가 되므로, 처음
     * 고를 때부터 그 자리들이 보여야 한다.
     */
    const user = renderAuth();
    await toRegister(user);

    const group = screen.getByRole('radiogroup', { name: 'MBTI 유형' });
    expect(group).toBeInTheDocument();
    for (const type of MBTI_TYPES) {
      expect(screen.getByRole('radio', { name: type })).toBeInTheDocument();
    }
  });

  it('고르기 전에는 아무것도 선택돼 있지 않다', async () => {
    const user = renderAuth();
    await toRegister(user);

    const checked = screen
      .getAllByRole('radio')
      .filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(0);
  });

  it('고르면 그것만 선택된다', async () => {
    const user = renderAuth();
    await toRegister(user);

    await user.click(screen.getByRole('radio', { name: 'INFJ' }));
    expect(screen.getByRole('radio', { name: 'INFJ' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'ENTP' })).toHaveAttribute('aria-checked', 'false');
  });

  it('★ 같은 것을 다시 누르면 해제된다 — 잘못 눌렀을 때 되돌릴 길', async () => {
    const user = renderAuth();
    await toRegister(user);

    await user.click(screen.getByRole('radio', { name: 'INFJ' }));
    await user.click(screen.getByRole('radio', { name: 'INFJ' }));
    expect(screen.getByRole('radio', { name: 'INFJ' })).toHaveAttribute('aria-checked', 'false');
  });

  it('★ MBTI 를 고르지 않으면 왜 필요한지 알려 준다', async () => {
    /*
     * 버튼 그리드라 브라우저의 required 검사가 닿지 않는다. 그냥 넘어가면
     * 가입은 되지만 오른쪽 목록에서 아무것도 빛나지 않아, 사용자는
     * "왜 나만 안 되지"를 묻게 된다.
     */
    const user = renderAuth();
    await toRegister(user);

    await user.type(screen.getByLabelText('이메일'), 'a@b.com');
    await user.type(screen.getByLabelText('이름'), '혁진');
    await user.type(screen.getByLabelText(/비밀번호/), 'password123');
    await user.click(screen.getByRole('button', { name: /가입하고 시작하기/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/MBTI 를 골라 주세요/);
  });

  it('MBTI 가 무엇에 쓰이는지, 사람을 규정하지 않는다는 것을 밝힌다', async () => {
    const user = renderAuth();
    await toRegister(user);
    expect(screen.getByText(/사람을 규정하려는 것이/)).toBeInTheDocument();
  });

  it('★ 백엔드 없이도 가입이 끝까지 간다', async () => {
    /*
     * mock 으로 도는 동안 가입이 항상 실패하면, 이름 인사와 내 MBTI 강조는
     * 아무도 볼 수 없는 기능이 된다.
     */
    const user = renderAuth();
    await toRegister(user);

    await user.type(screen.getByLabelText('이메일'), 'a@b.com');
    await user.type(screen.getByLabelText('이름'), '혁진');
    await user.type(screen.getByLabelText(/비밀번호/), 'password123');
    await user.click(screen.getByRole('radio', { name: 'INFJ' }));
    await user.click(screen.getByRole('button', { name: /가입하고 시작하기/ }));

    expect(await screen.findByText('홈 화면')).toBeInTheDocument();
  });

  it('한 화면에서 로그인으로 돌아올 수 있다', async () => {
    const user = renderAuth();
    await toRegister(user);
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getByRole('heading', { name: '로그인' })).toBeInTheDocument();
  });
});
