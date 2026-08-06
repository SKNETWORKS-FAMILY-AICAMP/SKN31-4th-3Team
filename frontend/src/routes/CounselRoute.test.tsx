/*
 * routes/CounselRoute.test.tsx
 * Phase 6 검증 기준:
 *   - 구절 문맥이 대화 시작 상태에 실제로 주입되는가
 *   - 전송 → 응답 흐름과 대기 상태가 동작하는가
 *   - 대화 중 위기 신호에 즉시 안내가 붙는가 (서버 왕복 없이)
 */

import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CounselRoute } from './CounselRoute';
import { RepositoryProvider } from '../services/RepositoryProvider';
import { AppPhaseProvider } from '../state/AppPhaseContext';
import { GalaxyProvider } from '../state/GalaxyContext';
import { CounselProvider } from '../state/CounselContext';
import { mockRepositories } from '../services/mockRepositories';
import type { Repositories } from '../services/repositories';
import { formatRef, getVerseStar } from '../data/verses';
import { isFullVerse } from '../data/types';

function renderCounsel(search = '', repositories: Repositories = mockRepositories) {
  render(
    <RepositoryProvider value={repositories}>
      <AppPhaseProvider>
        <GalaxyProvider>
          <CounselProvider>
            <MemoryRouter initialEntries={[`/counsel${search}`]}>
              <Routes>
                <Route path="/counsel" element={<CounselRoute />} />
                <Route path="/home" element={<p>홈 화면</p>} />
                <Route path="/verse/:id" element={<p>구절 상세</p>} />
              </Routes>
            </MemoryRouter>
          </CounselProvider>
        </GalaxyProvider>
      </AppPhaseProvider>
    </RepositoryProvider>,
  );
}

/**
 * StrictMode 로 감싸 렌더한다.
 *
 * ★ 왜 따로 두는가
 *   개발 모드의 StrictMode 는 effect 를 두 번 실행한다 — 실행 → 정리 → 실행.
 *   실제 앱(main.tsx)은 StrictMode 안에서 돌지만 위 헬퍼는 아니다.
 *   그 차이 때문에 "대화를 여는 중…" 에서 멈추는 버그가 테스트를 통과한 채
 *   실제 화면에서만 나타났다.
 */
function renderCounselStrict(search = '', repositories: Repositories = mockRepositories) {
  render(
    <StrictMode>
      <RepositoryProvider value={repositories}>
        <AppPhaseProvider>
          <GalaxyProvider>
            <CounselProvider>
              <MemoryRouter initialEntries={[`/counsel${search}`]}>
                <Routes>
                  <Route path="/counsel" element={<CounselRoute />} />
                  <Route path="/home" element={<p>홈 화면</p>} />
                </Routes>
              </MemoryRouter>
            </CounselProvider>
          </GalaxyProvider>
        </AppPhaseProvider>
      </RepositoryProvider>
    </StrictMode>,
  );
}

const composer = () => screen.getByLabelText('상담 메시지 입력');

describe('★ StrictMode — 대화가 실제로 열리는가', () => {
  it('"대화를 여는 중…" 에 멈추지 않는다', async () => {
    /*
     * 예전 코드는 정리 함수에서 요청을 "버림" 표시했고, 두 번째 실행은
     * 중복 방지 가드에 걸려 그냥 돌아갔다. 그래서 유일하게 날아간 요청의
     * 응답이 버려지고 다시 요청하지도 않았다.
     */
    renderCounselStrict();

    expect(await screen.findByRole('log', { name: '상담 대화' })).toBeInTheDocument();
    expect(screen.queryByText('대화를 여는 중…')).not.toBeInTheDocument();
  });

  it('구절에서 이어온 경우에도 열린다', async () => {
    const star = getVerseStar('gen-1-3')!;
    renderCounselStrict(`?from=${star.id}`);

    const log = await screen.findByRole('log', { name: '상담 대화' });
    await waitFor(() => expect(log.textContent).toContain(formatRef(star)));
  });

  describe('누구와 이야기하는가', () => {
    /** 서버가 골라 준 상황을 흉내 낸다 — mock 은 추천을 하지 않는다. */
    const withPersona = (personaId: string, reason?: string) => ({
      ...mockRepositories,
      counsel: {
        ...mockRepositories.counsel,
        startThread: async (seed: Parameters<typeof mockRepositories.counsel.startThread>[0]) => ({
          ...(await mockRepositories.counsel.startThread(seed)),
          personaId,
          reason,
        }),
      },
    });

    it('인물 이름을 보여 준다', async () => {
      renderCounselStrict('', withPersona('peter'));
      expect(await screen.findByText('베드로의 은하')).toBeInTheDocument();
    });

    it('서버가 골랐으면 왜 이 인물인지도 보여 준다', async () => {
      const reason = '두려움에 닿는 구절이 가장 많은 곳입니다.';
      renderCounselStrict('', withPersona('peter', reason));
      expect(await screen.findByText(reason)).toBeInTheDocument();
    });

    it('★ 직접 고른 대화에는 이유를 붙이지 않는다', async () => {
      // 자기가 누른 은하에 "왜 이 사람인지"를 설명하는 것은 군더더기다.
      renderCounselStrict('', withPersona('peter'));
      await screen.findByText('베드로의 은하');
      expect(screen.queryByText(/곳입니다\.$/)).not.toBeInTheDocument();
    });

    it('인물을 모르면 아무것도 세우지 않는다', async () => {
      renderCounselStrict('');
      await screen.findByRole('log', { name: '상담 대화' });
      expect(screen.queryByText(/의 은하$/)).not.toBeInTheDocument();
    });

    it('구절에서 이어 오면 그 구절의 은하가 나온다', async () => {
      renderCounselStrict('?from=gen-1-3');
      await screen.findByRole('log', { name: '상담 대화' });
      await waitFor(() => expect(screen.getByText(/의 은하$/)).toBeInTheDocument());
    });
  });

  it('★ 대화방 생성 요청은 한 번만 나간다', async () => {
    // effect 가 두 번 돌았다고 서버에 빈 방이 두 개 생기면 안 된다.
    const startThread = vi.fn(mockRepositories.counsel.startThread);
    renderCounselStrict('', {
      ...mockRepositories,
      counsel: { ...mockRepositories.counsel, startThread },
    });

    await screen.findByRole('log', { name: '상담 대화' });
    expect(startThread).toHaveBeenCalledTimes(1);
  });

  it('열지 못하면 이유를 밝히고 다시 시도할 길을 준다', async () => {
    renderCounselStrict('', {
      ...mockRepositories,
      counsel: {
        ...mockRepositories.counsel,
        startThread: () => Promise.reject(new Error('네트워크 오류')),
      },
    });

    expect(await screen.findByText('대화를 시작하지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '대화 다시 시작' })).toBeInTheDocument();
  });

  it('★ 서버가 알려 준 원인을 감추지 않는다', async () => {
    /*
     * "답변을 받지 못했습니다" 만 뜨면 키가 없는 건지, 잔액이 없는 건지,
     * 모델 이름이 틀린 건지 아무도 알 수 없다.
     */
    renderCounselStrict('', {
      ...mockRepositories,
      counsel: {
        ...mockRepositories.counsel,
        startThread: () => Promise.reject(new Error('LLM 스트리밍 실패: 잔액이 부족합니다')),
      },
    });

    expect(await screen.findByText(/잔액이 부족합니다/)).toBeInTheDocument();
  });

  it('★ "대화 다시 시작" 을 누르면 정말로 다시 연다', async () => {
    /*
     * 예전 코드는 재시도에서 ref 만 비웠다. effect 는 의존성이 바뀔 때만
     * 도는데 의존성이 그대로여서 아무 일도 일어나지 않았고, 화면은
     * "대화를 여는 중…" 에서 다시 멈췄다.
     */
    const user = userEvent.setup();
    let attempt = 0;
    const startThread: Repositories['counsel']['startThread'] = (seed) => {
      attempt += 1;
      // 첫 번째만 실패시키고, 재시도는 성공하게 둔다
      if (attempt === 1) return Promise.reject(new Error('네트워크 오류'));
      return mockRepositories.counsel.startThread(seed);
    };

    renderCounselStrict('', {
      ...mockRepositories,
      counsel: { ...mockRepositories.counsel, startThread },
    });

    await screen.findByText('대화를 시작하지 못했습니다.');
    await user.click(screen.getByRole('button', { name: '대화 다시 시작' }));

    // 대화가 실제로 열려야 한다 — "대화를 여는 중…" 에 머무르면 안 된다
    expect(await screen.findByRole('log', { name: '상담 대화' })).toBeInTheDocument();
    expect(screen.queryByText('대화를 여는 중…')).not.toBeInTheDocument();
    expect(attempt).toBe(2);
  });
});

describe('CounselRoute — 문맥 주입', () => {
  it('구절에서 이어오면 그 구절의 묵상이 첫 메시지가 된다', async () => {
    const star = getVerseStar('gen-1-3')!;
    if (!isFullVerse(star)) throw new Error('gen-1-3 은 큐레이션 별이어야 한다');
    renderCounsel(`?from=${star.id}`);

    const log = await screen.findByRole('log', { name: '상담 대화' });
    await waitFor(() => expect(log.textContent).toContain(star.meditation));
    expect(log.textContent).toContain(formatRef(star));
  });

  it('구절 문맥이 있으면 상단에 출처가 보이고 상세로 돌아갈 수 있다', async () => {
    const user = userEvent.setup();
    const star = getVerseStar('psa-23-3')!;
    renderCounsel(`?from=${star.id}`);

    const link = await screen.findByRole('button', { name: `${formatRef(star)}에서 이어짐` });
    await user.click(link);
    expect(await screen.findByText('구절 상세')).toBeInTheDocument();
  });

  it('문맥 없이 들어와도 대화가 열린다', async () => {
    renderCounsel();
    const log = await screen.findByRole('log', { name: '상담 대화' });
    await waitFor(() => expect(log.textContent).toContain('편하게 이야기를 시작해 주세요'));
  });
});

describe('CounselRoute — 대화', () => {
  it('메시지를 보내면 내 말이 먼저 나타나고 응답이 뒤따른다', async () => {
    const user = userEvent.setup();
    renderCounsel('?from=php-4-6');
    await screen.findByRole('log', { name: '상담 대화' });

    await user.type(composer(), '요즘 잠이 잘 안 와요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    // 내 말은 즉시 보인다 (낙관적 렌더)
    expect(await screen.findByText('요즘 잠이 잘 안 와요')).toBeInTheDocument();
    // 대기 상태 표시
    expect(screen.getByRole('status')).toHaveTextContent('마음을 살피는 중');

    await waitFor(
      () => expect(screen.getAllByLabelText('안내자의 말').length).toBeGreaterThanOrEqual(2),
      { timeout: 3000 },
    );
  });

  it('전송 후 입력창이 비워진다', async () => {
    const user = userEvent.setup();
    renderCounsel();
    await screen.findByRole('log', { name: '상담 대화' });

    const input = composer() as HTMLTextAreaElement;
    await user.type(input, '안녕하세요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => expect(input.value).toBe(''));
  });

  it('응답 대기 중에는 다시 보낼 수 없다', async () => {
    const user = userEvent.setup();
    renderCounsel();
    await screen.findByRole('log', { name: '상담 대화' });

    await user.type(composer(), '들어주세요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    await waitFor(() => expect(composer()).toBeDisabled());
  });
});

describe('CounselRoute — 안전', () => {
  it('대화 중 위기 신호에는 서버를 기다리지 않고 안내가 붙는다', async () => {
    const user = userEvent.setup();
    const send = vi.fn(mockRepositories.counsel.send);
    const spied: Repositories = {
      ...mockRepositories,
      counsel: { ...mockRepositories.counsel, send },
    };

    renderCounsel('', spied);
    await screen.findByRole('log', { name: '상담 대화' });

    await user.type(composer(), '이제 죽고 싶어요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(
      await screen.findByText('지금 많이 힘드신 것 같아 걱정이 됩니다'),
    ).toBeInTheDocument();
    // 위기 상황에서 mock 응답을 기다리지 않는다
    expect(send).not.toHaveBeenCalled();
  });

  it('안전 안내에서도 전문가가 아님을 밝힌다', async () => {
    const user = userEvent.setup();
    renderCounsel();
    await screen.findByRole('log', { name: '상담 대화' });

    await user.type(composer(), '자해를 생각하고 있어요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(
      await screen.findByText(/전문 상담사가 아니며, 위급한 상황에서 도움을 드릴 수 없습니다/),
    ).toBeInTheDocument();
  });
});

describe('CounselRoute — 실패', () => {
  it('대화를 시작하지 못하면 재시도를 제공한다', async () => {
    const failing: Repositories = {
      ...mockRepositories,
      counsel: {
        ...mockRepositories.counsel,
        startThread: vi.fn().mockRejectedValue(new Error('network')),
      },
    };
    renderCounsel('', failing);

    expect(await screen.findByRole('alert')).toHaveTextContent('대화를 시작하지 못했습니다');
    expect(screen.getByRole('button', { name: '대화 다시 시작' })).toBeInTheDocument();
  });

  it('응답을 받지 못하면 안내한다', async () => {
    const user = userEvent.setup();
    const failing: Repositories = {
      ...mockRepositories,
      counsel: {
        ...mockRepositories.counsel,
        send: vi.fn().mockRejectedValue(new Error('network')),
      },
    };
    renderCounsel('', failing);
    await screen.findByRole('log', { name: '상담 대화' });

    await user.type(composer(), '이야기하고 싶어요');
    await user.click(screen.getByRole('button', { name: '보내기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('답변을 받지 못했습니다');
  });
});
