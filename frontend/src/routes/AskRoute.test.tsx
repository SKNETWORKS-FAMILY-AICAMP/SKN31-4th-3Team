/*
 * routes/AskRoute.test.tsx
 * Phase 4 검증 기준:
 *   - 12개 의도가 UI까지 서로 다르게 도달하는가
 *   - 매칭 실패해도 친절한 응답이 나오는가
 *   - 위기 신호일 때 일반 답변 대신 안전 안내로 분기하는가
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AskRoute } from './AskRoute';
import { RepositoryProvider } from '../services/RepositoryProvider';
import { AppPhaseProvider } from '../state/AppPhaseContext';
import { GalaxyProvider } from '../state/GalaxyContext';
import { mockRepositories } from '../services/mockRepositories';
import type { Repositories } from '../services/repositories';
import { THEME_LABELS } from '../data/intents';
import { getGalaxy } from '../data/disciples';
import type { ThemeTag } from '../data/types';

/**
 * 도착지에서 주소를 읽어 내는 표지판.
 *
 * MemoryRouter 는 window.location 을 건드리지 않는다. 그래서 "어디로
 * 갔는가"는 도착한 화면 쪽에서 확인해야 한다.
 */
function Arrived({ where }: { where: string }) {
  const { search } = useLocation();
  return (
    <p data-testid="arrived">
      {where}:{search}
    </p>
  );
}

function renderAsk(question: string, repositories: Repositories = mockRepositories) {
  return render(
    <RepositoryProvider value={repositories}>
      <AppPhaseProvider>
        <GalaxyProvider>
          <MemoryRouter initialEntries={[`/ask?q=${encodeURIComponent(question)}`]}>
            <Routes>
              <Route path="/ask" element={<AskRoute />} />
              <Route path="/home" element={<p>홈 화면</p>} />
              <Route path="/counsel" element={<Arrived where="상담" />} />
              <Route path="/sky" element={<Arrived where="하늘" />} />
            </Routes>
          </MemoryRouter>
        </GalaxyProvider>
      </AppPhaseProvider>
    </RepositoryProvider>,
  );
}

const INTENT_CASES: Array<[string, ThemeTag]> = [
  ['요즘 너무 불안해서 잠이 안 와요', 'anxiety'],
  ['너무 슬퍼서 눈물이 나요', 'grief'],
  ['사람들 속에서도 외로워요', 'loneliness'],
  ['가족과 갈등이 있어요', 'relationship'],
  ['진로를 어떻게 정해야 할지 모르겠어요', 'career'],
  ['실패할까 봐 두려워요', 'fear'],
  ['그 사람을 용서하기가 어려워요', 'forgiveness'],
  ['제 잘못이 후회돼요', 'guilt'],
  ['그래도 다시 시작하고 싶은 소망이 있어요', 'hope'],
  ['오늘은 정말 감사한 하루였어요', 'gratitude'],
  ['번아웃이 와서 아무것도 못 하겠어요', 'recovery'],
  ['제가 사는 의미가 뭘까요', 'purpose'],
];

describe('AskRoute — 의도별 응답', () => {
  it('먼저 로딩 상태를 보여준다', async () => {
    renderAsk('불안해요');
    expect(screen.getByText('마음을 살피는 중입니다')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('추천 구절')).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it.each(INTENT_CASES)('"%s" → %s 라벨과 구절 카드가 나온다', async (question, theme) => {
    renderAsk(question);

    await waitFor(
      () => {
        expect(
          screen.getByText(`${THEME_LABELS[theme]}에 대한 이야기로 들었습니다`),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // 추천 구절 카드가 최소 2장 이상 렌더된다
    const cards = screen.getAllByRole('article');
    expect(cards.length).toBeGreaterThanOrEqual(2);

    // 인용 옆에 출처가 반드시 붙는다 (저작권 원칙)
    for (const card of cards) {
      expect(card.textContent).toContain('개역개정');
    }
  });

  it('매칭에 실패해도 공감 문장과 구절을 준다', async () => {
    renderAsk('오늘 날씨가 흐리네요');

    await waitFor(() => expect(screen.getByLabelText('추천 구절')).toBeInTheDocument(), {
      timeout: 3000,
    });

    // fallback 은 주제 라벨을 붙이지 않는다 (단정하지 않기 위해)
    expect(screen.queryByText(/에 대한 이야기로 들었습니다/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThanOrEqual(2);
  });

  it('상담 이어가기와 별자리 이동 CTA 가 모두 제공된다', async () => {
    renderAsk('불안해요');

    await waitFor(() => expect(screen.getByLabelText('추천 구절')).toBeInTheDocument(), {
      timeout: 3000,
    });

    expect(screen.getByRole('button', { name: /상담 이어가기$/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '별자리에서 보기' }).length).toBeGreaterThan(0);
  });
});

describe('AskRoute — 안전 분기', () => {
  it('위기 신호에는 구절 대신 안내 화면이 나온다', async () => {
    renderAsk('요즘 죽고 싶다는 생각이 들어요');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('많이 힘드신 것 같아 걱정이 됩니다'),
    );

    // 일반 답변 경로가 열리지 않아야 한다
    expect(screen.queryByLabelText('추천 구절')).not.toBeInTheDocument();
  });

  it('안전 안내는 대화를 차단하지 않는다', async () => {
    const user = userEvent.setup();
    renderAsk('죽고 싶어요');

    const keepTalking = await screen.findByRole('button', { name: '그래도 계속 이야기하기' });
    await user.click(keepTalking);

    await waitFor(() => expect(screen.getByLabelText('추천 구절')).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('전문가가 아님을 분명히 밝힌다', async () => {
    renderAsk('자해를 생각하고 있어요');
    expect(
      await screen.findByText(/전문 상담사가 아니며, 위급한 상황에서 도움을 드릴 수 없습니다/),
    ).toBeInTheDocument();
  });
});

describe('AskRoute — 실패와 재요청', () => {
  it('요청이 실패하면 재시도를 제공한다', async () => {
    const failing: Repositories = {
      ...mockRepositories,
      verses: {
        ...mockRepositories.verses,
        ask: vi.fn().mockRejectedValue(new Error('network')),
      },
    };
    renderAsk('불안해요', failing);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('응답을 불러오지 못했습니다'),
    );
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('"다른 구절 보기"는 attempt 를 증가시켜 재요청한다', async () => {
    const user = userEvent.setup();
    const ask = vi.fn(mockRepositories.verses.ask);
    const spied: Repositories = {
      ...mockRepositories,
      verses: { ...mockRepositories.verses, ask },
    };
    renderAsk('불안해요', spied);

    await waitFor(() => expect(screen.getByLabelText('추천 구절')).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(ask).toHaveBeenCalledWith('불안해요', 0);

    await user.click(screen.getByRole('button', { name: '다른 구절 보기' }));
    await waitFor(() => expect(ask).toHaveBeenCalledWith('불안해요', 1));
  });
});

describe('은하 안내 — "어디로 가야 하는가"', () => {
  /*
   * ★ 이 절이 있는 이유
   *   추천 시스템을 서버에 다 만들어 두고도 답변 화면에 아무것도
   *   내보내지 않아서, 사용자에게는 예전과 똑같이 "구절만 주는" 화면으로
   *   보였던 적이 있다. 계산이 도는 것과 화면에 나오는 것은 다른 문제다.
   */

  const QUESTION = '사람들 속에서도 외로워요';

  it('추천된 은하를 이름으로 보여 준다', async () => {
    renderAsk(QUESTION);
    // <aside> 는 complementary 랜드마크다 (section 의 region 이 아니다)
    expect(await screen.findByRole('complementary', { name: '추천 은하' })).toBeInTheDocument();
    expect(screen.getByText(/의 은하$/)).toBeInTheDocument();
  });

  it('조사가 어긋나지 않는다', async () => {
    renderAsk(QUESTION);
    const cta = await screen.findByRole('button', { name: /상담 이어가기$/ });
    // 받침 있는 이름(요한·빌립·시몬) 뒤에 "와" 가 오면 안 된다
    expect(cta.textContent).not.toMatch(/[한립몬]와 /);
  });

  /** 도착한 화면의 주소를 "어디:쿼리" 형태로 읽는다. */
  async function landed(): Promise<{ where: string; params: URLSearchParams }> {
    const text = (await screen.findByTestId('arrived')).textContent ?? '';
    const [where, search] = [text.slice(0, text.indexOf(':')), text.slice(text.indexOf(':') + 1)];
    return { where, params: new URLSearchParams(search) };
  }

  it('은하 찾아가기 — 바로 열지 않고 그 은하까지 날아간다', async () => {
    const user = userEvent.setup();
    renderAsk(QUESTION);

    const shown = (await screen.findByText(/의 은하$/)).textContent ?? '';
    await user.click(screen.getByRole('button', { name: '은하 찾아가기' }));

    const { where, params } = await landed();
    expect(where).toBe('하늘');
    expect(params.get('travel')).toBe('1'); // 비행을 거친다
    expect(shown).toContain(getGalaxy(params.get('galaxy')!)!.name);
  });

  it('★ 상담 이어가기 — 그 은하를 거쳐서, 인물을 들고 간다', async () => {
    /*
     * 화면에 "요한의 은하"라고 써 놓고 대화에서 마태가 나오면 안 된다.
     * 그리고 대화창이 갑자기 뜨는 대신 그 사람이 있는 자리까지 간다.
     */
    const user = userEvent.setup();
    renderAsk(QUESTION);

    const shown = (await screen.findByText(/의 은하$/)).textContent ?? '';
    await user.click(screen.getByRole('button', { name: /상담 이어가기$/ }));

    const { where, params } = await landed();
    expect(where).toBe('하늘');
    expect(params.get('travel')).toBe('1');

    // 도착하면 이어서 갈 곳이 상담이고, 거기에도 같은 인물이 실려 있다
    const then = new URLSearchParams((params.get('then') ?? '').split('?')[1]);
    expect(params.get('then')).toMatch(/^\/counsel\?/);
    expect(then.get('galaxy')).toBe(params.get('galaxy'));
    expect(shown).toContain(getGalaxy(then.get('galaxy')!)!.name);
  });
});
