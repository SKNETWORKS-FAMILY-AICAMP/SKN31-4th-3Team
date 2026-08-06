/*
 * routes/AccountRoute.test.tsx
 *
 * ★ 여기서 잡아야 하는 고장
 *   - 한 번 눌러서 탈퇴됨 (되돌릴 수 없는 일에 확인이 없음)
 *   - 탈퇴했는데 브라우저에 지난 대화가 그대로 남음
 *   - 빈 이름으로 저장되어 화면 곳곳의 "○○님" 이 "님" 이 됨
 *   - 실패했는데 성공한 것처럼 보임
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AccountRoute } from './AccountRoute';
import { PATHS } from './paths';
import { AuthProvider } from '../state/AuthContext';
import { listThreads, saveThread } from '../services/threadStore';
import { writeLocalSession } from '../services/localSession';

function renderAccount() {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[PATHS.account]}>
        <Routes>
          <Route path={PATHS.account} element={<AccountRoute />} />
          <Route path={PATHS.home} element={<p>홈 화면</p>} />
          <Route path={PATHS.auth} element={<p>로그인 화면</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function signIn() {
  writeLocalSession({ id: 1, email: 'a@b.c', username: '혁진', mbti: 'INFP' });
}

function seedThread() {
  saveThread({
    id: 't1',
    title: '지난 이야기',
    seed: {},
    messages: [
      { id: 'm1', role: 'guide', text: '오래 기다렸습니다.', createdAt: 1 },
      { id: 'm2', role: 'user', text: '안녕하세요', createdAt: 2 },
    ],
    createdAt: 1,
    updatedAt: 2,
  });
}

describe('내 정보', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('로그인하지 않았으면 로그인 화면으로 보낸다', async () => {
    renderAccount();
    expect(await screen.findByText('로그인 화면')).toBeInTheDocument();
  });

  it('지금 이름과 유형이 입력칸에 들어와 있다', async () => {
    signIn();
    renderAccount();

    expect(await screen.findByDisplayValue('혁진')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'INFP' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('바꾼 것이 없으면 저장 버튼이 눌리지 않는다', async () => {
    // 누를 수 있는데 아무 일도 안 일어나면 고장으로 읽힌다
    signIn();
    renderAccount();
    expect(await screen.findByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('이름을 고치면 저장된다', async () => {
    signIn();
    const user = userEvent.setup();
    renderAccount();

    const input = await screen.findByDisplayValue('혁진');
    await user.clear(input);
    await user.type(input, '혁진2');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('저장했습니다')).toBeInTheDocument();
  });

  it('★ 빈 이름은 막는다', async () => {
    /*
     * 공백만 넣어도 통과하면 화면 곳곳의 "○○님" 이 "님" 이 되고,
     * 어디서 깨졌는지 찾기 어렵다.
     */
    signIn();
    const user = userEvent.setup();
    renderAccount();

    const input = await screen.findByDisplayValue('혁진');
    await user.clear(input);
    await user.type(input, '   ');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이름을 비워 둘 수 없습니다');
  });

  it('유형을 지울 수 있다', async () => {
    // 한 번 고르면 되돌릴 수 없는 선택지는 만들지 않는다
    signIn();
    const user = userEvent.setup();
    renderAccount();

    await user.click(await screen.findByRole('button', { name: '고르지 않음' }));
    expect(screen.getByRole('button', { name: '고르지 않음' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('회원 탈퇴', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('★ 한 번에 지워지지 않는다', async () => {
    /*
     * 되돌릴 수 없는 일에는 되돌아올 자리가 있어야 한다.
     * 첫 누름은 "무엇이 사라지는지" 를 보여 주는 데까지만 간다.
     */
    signIn();
    seedThread();
    const user = userEvent.setup();
    renderAccount();

    await user.click(await screen.findByRole('button', { name: '탈퇴하기' }));

    expect(screen.getByRole('button', { name: '네, 탈퇴합니다' })).toBeInTheDocument();
    expect(screen.queryByText('홈 화면')).not.toBeInTheDocument();
    // 아직 아무것도 지워지지 않았다
    expect(listThreads()).toHaveLength(1);
  });

  it('무엇이 사라지는지 적어 둔다', async () => {
    signIn();
    const user = userEvent.setup();
    renderAccount();

    await user.click(await screen.findByRole('button', { name: '탈퇴하기' }));
    expect(screen.getByText(/계정, 이름과 MBTI, 지난 상담 전부/)).toBeInTheDocument();
  });

  it('그만두면 원래대로 돌아온다', async () => {
    signIn();
    const user = userEvent.setup();
    renderAccount();

    await user.click(await screen.findByRole('button', { name: '탈퇴하기' }));
    await user.click(screen.getByRole('button', { name: '그만두기' }));

    expect(screen.getByRole('button', { name: '탈퇴하기' })).toBeInTheDocument();
  });

  it('★ 확인하면 계정과 지난 대화가 함께 사라진다', async () => {
    /*
     * "탈퇴했는데 사이드바에 지난 대화가 그대로" 는 사고다.
     */
    signIn();
    seedThread();
    const user = userEvent.setup();
    renderAccount();

    await user.click(await screen.findByRole('button', { name: '탈퇴하기' }));
    await user.click(screen.getByRole('button', { name: '네, 탈퇴합니다' }));

    await waitFor(() => expect(screen.getByText('홈 화면')).toBeInTheDocument());
    expect(listThreads()).toHaveLength(0);
    expect(window.localStorage.getItem('eden.localSession')).toBeNull();
  });
});
