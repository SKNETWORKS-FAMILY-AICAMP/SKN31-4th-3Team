/*
 * routes/CounselResume.test.tsx
 *
 * ★ 여기서 잡아야 하는 고장
 *   - 이어 보려고 눌렀는데 새 대화가 열림 (같은 대화가 둘이 된다)
 *   - 지난 메시지가 사라지고 첫 인사만 남음
 *   - 되살릴 수 없는 대화에서 화면이 영영 "여는 중…" 에 멈춤
 *   - 말 한마디 하고 나갔는데 목록에 안 남음
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { CounselRoute } from './CounselRoute';
import { PATHS, counselPath } from './paths';
import { AppPhaseProvider } from '../state/AppPhaseContext';
import { CounselProvider } from '../state/CounselContext';
import { RepositoryProvider } from '../services/RepositoryProvider';
import { mockRepositories } from '../services/mockRepositories';
import { listThreads, saveThread } from '../services/threadStore';

function renderAt(entry: string) {
  render(
    <RepositoryProvider value={mockRepositories}>
      <AppPhaseProvider>
        <CounselProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path={PATHS.counsel} element={<CounselRoute />} />
              <Route path={PATHS.home} element={<p>홈 화면</p>} />
            </Routes>
          </MemoryRouter>
        </CounselProvider>
      </AppPhaseProvider>
    </RepositoryProvider>,
  );
}

function seedThread() {
  saveThread({
    id: 'thread-9',
    title: '요즘 너무 불안해요',
    personaId: 'peter',
    personaReason: '무너져 본 사람입니다.',
    seed: { question: '요즘 너무 불안해요' },
    messages: [
      { id: 'm1', role: 'guide', text: '나도 여러 번 무너졌습니다.', createdAt: 1 },
      { id: 'm2', role: 'user', text: '잠이 잘 안 와요', createdAt: 2 },
      { id: 'm3', role: 'guide', text: '언제부터 그러셨습니까.', createdAt: 3 },
    ],
    createdAt: 1,
    updatedAt: 3,
  });
}

describe('지난 대화 이어 보기', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('★ 오간 말이 그대로 되살아난다', async () => {
    seedThread();
    renderAt(counselPath({ thread: 'thread-9' }));

    expect(await screen.findByText('나도 여러 번 무너졌습니다.')).toBeInTheDocument();
    expect(screen.getByText('잠이 잘 안 와요')).toBeInTheDocument();
    expect(screen.getByText('언제부터 그러셨습니까.')).toBeInTheDocument();
  });

  it('★ 새 대화를 열지 않는다', async () => {
    /*
     * startThread 를 부르면 첫 인사가 다시 오고 방 id 도 새로 생긴다.
     * 같은 대화가 둘이 되고 목록에 하나가 더 쌓인다.
     */
    seedThread();
    renderAt(counselPath({ thread: 'thread-9' }));

    await screen.findByText('잠이 잘 안 와요');
    expect(listThreads()).toHaveLength(1);
    expect(listThreads()[0].id).toBe('thread-9');
  });

  it('그때 그 인물이 그대로다', async () => {
    seedThread();
    renderAt(counselPath({ thread: 'thread-9' }));

    expect(await screen.findByText('무너져 본 사람입니다.')).toBeInTheDocument();
  });

  it('되살릴 수 없으면 사실대로 알린다', async () => {
    // 화면이 "여는 중…" 에서 영영 멈추는 것이 가장 나쁜 실패다
    renderAt(counselPath({ thread: '없는-대화' }));

    expect(await screen.findByText('이 대화를 불러오지 못했습니다.')).toBeInTheDocument();
  });
});

describe('대화가 목록에 남는다', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('★ 말을 걸면 그때 남는다', async () => {
    const user = userEvent.setup();
    renderAt(counselPath({ q: '요즘 너무 불안해요' }));

    /*
     * ★ 대화방이 열릴 때까지 기다린다.
     *   그전에는 입력창이 잠겨 있어서, 타이핑해도 아무 일이 일어나지 않는다.
     */
    await screen.findByRole('log', { name: '상담 대화' });
    // 첫 인사만 있는 방은 아직 목록에 없다 — 빈 방은 남기지 않는다
    expect(listThreads()).toHaveLength(0);

    await user.type(screen.getByLabelText('상담 메시지 입력'), '잠이 안 와요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => expect(listThreads()).toHaveLength(1), { timeout: 4000 });
    expect(listThreads()[0].title).toBe('요즘 너무 불안해요');
  });
});
