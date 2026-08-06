/*
 * 오른쪽 위 계정 자리.
 *
 * 이 컴포넌트가 지켜야 하는 것은 "로그인이 되는가"가 아니라
 * "지금 내가 로그인 상태인지 화면만 보고 알 수 있는가"다.
 * 그것이 메뉴 안이 아니라 화면에 상주해야 하는 이유다.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountButton } from './AccountButton';
import { AuthProvider } from '../../state/AuthContext';
import { writeLocalSession } from '../../services/localSession';
import { PATHS } from '../../routes/paths';

/** 계정 화면이 어떤 모드를 요청받았는지 드러낸다 */
function AuthStub() {
  const mode = (useLocation().state as { mode?: string } | null)?.mode ?? '';
  return (
    <>
      <p>계정 화면</p>
      <p data-testid="mode">{mode}</p>
    </>
  );
}

function renderAccount(entry: string = PATHS.home) {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[entry]}>
        <AccountButton />
        <Routes>
          <Route path={PATHS.home} element={<p>홈 화면</p>} />
          <Route path={PATHS.sky} element={<p>하늘 화면</p>} />
          <Route path={PATHS.auth} element={<AuthStub />} />
          <Route path={PATHS.account} element={<p>내 정보 화면</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => window.localStorage.clear());

describe('비로그인', () => {
  it('★ 회원가입이 로그인보다 앞에 선다', async () => {
    /*
     * 계정이 없는 사람에게 "이메일과 비밀번호를 넣으세요"를 먼저 보이면
     * 가입하러 가는 길을 한 번 더 찾아야 한다. 처음 오는 사람이 훨씬
     * 많은 화면이므로 가입을 앞에 세운다.
     */
    renderAccount();
    await screen.findByRole('button', { name: '회원가입' });

    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels.indexOf('회원가입')).toBeLessThan(labels.indexOf('로그인'));
  });

  it('회원가입으로 들어가면 가입 모드를 요청한다', async () => {
    const user = renderAccount();
    await user.click(await screen.findByRole('button', { name: '회원가입' }));
    expect(await screen.findByText('계정 화면')).toBeInTheDocument();
    expect(screen.getByTestId('mode').textContent).toBe('register');
  });

  it('로그인으로 들어가는 길이 있다', async () => {
    const user = renderAccount();
    const button = await screen.findByRole('button', { name: '로그인' });
    await user.click(button);
    expect(await screen.findByText('계정 화면')).toBeInTheDocument();
    expect(screen.getByTestId('mode').textContent).toBe('login');
  });

  it('로그아웃은 보이지 않는다', async () => {
    renderAccount();
    await screen.findByRole('button', { name: '로그인' });
    expect(screen.queryByRole('button', { name: /로그아웃/ })).not.toBeInTheDocument();
  });
});

describe('로그인', () => {
  beforeEach(() => {
    writeLocalSession({ id: 1, email: 'a@b.com', username: '혁진', mbti: 'INFJ' });
  });

  it('★ 이름이 화면에 있다 — 메뉴를 열지 않아도 상태를 안다', async () => {
    renderAccount();
    expect(await screen.findByText('혁진')).toBeInTheDocument();
  });

  it('유형도 함께 보인다 — 오른쪽 목록에서 빛나는 그 값과 같은 것', async () => {
    renderAccount();
    expect(await screen.findByText('INFJ')).toBeInTheDocument();
  });

  it('유형을 남기지 않았으면 이름만 보인다', async () => {
    writeLocalSession({ id: 1, email: 'a@b.com', username: '혁진', mbti: '' });
    renderAccount();
    expect(await screen.findByText('혁진')).toBeInTheDocument();
    expect(screen.queryByText('INFJ')).not.toBeInTheDocument();
  });

  it('★ 로그아웃은 한 번 더 묻는다', async () => {
    /*
     * 한 번 눌러 끝나면 이름 옆을 스치듯 눌렀을 때 대화가 끊긴다.
     * 되돌릴 수 없는 것은 아니지만, 다시 로그인해야 한다는 점에서 성가시다.
     */
    const user = renderAccount();
    await user.click(await screen.findByRole('button', { name: '로그아웃' }));

    expect(screen.getByText('나가시겠어요?')).toBeInTheDocument();
    // 아직 로그인 상태다
    expect(screen.getByText('혁진')).toBeInTheDocument();
  });

  it('확인하면 로그아웃된다', async () => {
    const user = renderAccount();
    await user.click(await screen.findByRole('button', { name: '로그아웃' }));
    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByText('혁진')).not.toBeInTheDocument();
  });

  it('취소하면 그대로 남는다', async () => {
    const user = renderAccount();
    await user.click(await screen.findByRole('button', { name: '로그아웃' }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByText('혁진')).toBeInTheDocument();
    expect(screen.queryByText('나가시겠어요?')).not.toBeInTheDocument();
  });

  it('Esc 로도 확인을 접는다', async () => {
    const user = renderAccount();
    await user.click(await screen.findByRole('button', { name: '로그아웃' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByText('나가시겠어요?')).not.toBeInTheDocument();
  });

  it('바깥을 누르면 확인이 접힌다', async () => {
    const user = renderAccount();
    await user.click(await screen.findByRole('button', { name: '로그아웃' }));
    await user.click(screen.getByText('홈 화면'));
    expect(screen.queryByText('나가시겠어요?')).not.toBeInTheDocument();
  });

  it('★ 이름을 누르면 내 정보로 간다', async () => {
    /*
     * ★ 예전에는 "이름은 버튼이 아니다" 가 규칙이었다.
     *   눌러도 갈 곳이 없는 글자를 버튼처럼 두면 한 번 눌러 보고 고장이라
     *   여기기 때문이었다. 이제 갈 곳(내 정보)이 생겼으므로 규칙이 뒤집혔다.
     *   사람들은 어차피 자기 이름을 눌러 본다.
     */
    const user = renderAccount();
    await user.click(await screen.findByRole('button', { name: /혁진님 내 정보/ }));
    expect(await screen.findByText('내 정보 화면')).toBeInTheDocument();
  });
});

describe('튜토리얼 연결', () => {
  it('튜토리얼이 가리킬 수 있게 표시를 달고 있다', async () => {
    const { container } = render(
      <AuthProvider>
        <MemoryRouter initialEntries={[PATHS.home]}>
          <AccountButton />
        </MemoryRouter>
      </AuthProvider>,
    );
    await screen.findByRole('button', { name: '로그인' });
    expect(container.querySelector('[data-guide="account"]')).not.toBeNull();
  });
});
