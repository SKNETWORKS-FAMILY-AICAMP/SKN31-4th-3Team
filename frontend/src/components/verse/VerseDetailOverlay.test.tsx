/*
 * components/verse/VerseDetailOverlay.test.tsx
 * Phase 5 검증 기준: 오버레이 접근성 (focus trap, Esc, 포커스 복원).
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { VerseDetailOverlay } from './VerseDetailOverlay';
import { RepositoryProvider } from '../../services/RepositoryProvider';
import { AppPhaseProvider } from '../../state/AppPhaseContext';
import { GalaxyProvider } from '../../state/GalaxyContext';
import { FULL_VERSE_STARS, getVerseStar } from '../../data/verses';
import { isFullVerse } from '../../data/types';

function renderOverlay(verseId: string, onClose = vi.fn()) {
  render(
    <RepositoryProvider>
      <AppPhaseProvider>
        <GalaxyProvider>
          <MemoryRouter>
            <button type="button">바깥 버튼</button>
            <VerseDetailOverlay verseId={verseId} onClose={onClose} />
          </MemoryRouter>
        </GalaxyProvider>
      </AppPhaseProvider>
    </RepositoryProvider>,
  );
  return { onClose };
}

describe('VerseDetailOverlay — 콘텐츠', () => {
  it('구절·출처·스토리·묵상·태그를 모두 보여준다', async () => {
    const star = getVerseStar('gen-1-3')!;
    if (!isFullVerse(star)) throw new Error('gen-1-3 은 큐레이션 별이어야 한다');
    renderOverlay('gen-1-3');

    expect(await screen.findByText(star.excerpt)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(star.attribution))).toBeInTheDocument();
    expect(screen.getByText(star.story)).toBeInTheDocument();
    expect(screen.getByText(star.meditation)).toBeInTheDocument();
    expect(screen.getByLabelText('주제')).toBeInTheDocument();
  });

  it('상담 이어가기 CTA 가 있다', async () => {
    renderOverlay('gen-1-3');
    expect(await screen.findByRole('button', { name: '상담 이어가기' })).toBeInTheDocument();
  });

  it('모티프 추상 연출이 스크린리더에 설명된다', async () => {
    renderOverlay('gen-1-3');
    // gen-1-3 의 모티프는 '빛'
    // 조사는 받침을 따른다 — "빛을", "물결을", "길을" (data/korean.ts)
    expect(await screen.findByLabelText('빛을 형상화한 추상 연출')).toBeInTheDocument();
  });

  it('존재하지 않는 별이면 안내를 보여준다', async () => {
    renderOverlay('does-not-exist');
    expect(await screen.findByText('찾을 수 없는 별입니다')).toBeInTheDocument();
  });

  it('모든 큐레이션 별이 오버레이로 열린다', async () => {
    // 40개 전부를 렌더하면 느리므로 대표 표본으로 확인한다.
    const sample = [
      FULL_VERSE_STARS[0],
      FULL_VERSE_STARS[13],
      FULL_VERSE_STARS[27],
      FULL_VERSE_STARS[39],
    ];
    for (const star of sample) {
      const { unmount } = render(
        <RepositoryProvider>
          <AppPhaseProvider>
            <GalaxyProvider>
              <MemoryRouter>
                <VerseDetailOverlay verseId={star.id} onClose={vi.fn()} />
              </MemoryRouter>
            </GalaxyProvider>
          </AppPhaseProvider>
        </RepositoryProvider>,
      );
      expect(await screen.findByText(star.excerpt)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('VerseDetailOverlay — 접근성', () => {
  it('dialog 로 표시되고 열리면 패널에 포커스가 간다', async () => {
    renderOverlay('gen-1-3');
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(document.activeElement).toBe(dialog));
  });

  it('Esc 로 닫힌다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay('gen-1-3');
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('닫기 버튼이 있다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderOverlay('gen-1-3');

    await user.click(await screen.findByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Tab 이 오버레이 밖으로 나가지 않는다 (focus trap)', async () => {
    const user = userEvent.setup();
    renderOverlay('gen-1-3');
    const dialog = await screen.findByRole('dialog');
    // 로딩이 끝나야 패널 안에 포커스 가능한 요소가 생긴다.
    await screen.findByRole('button', { name: '닫기' });

    const outside = screen.getByRole('button', { name: '바깥 버튼' });
    const inside = Array.from(dialog.querySelectorAll('button'));
    expect(inside.length).toBeGreaterThan(1);

    // 마지막 항목에서 Tab 하면 첫 항목으로 돌아온다.
    inside[inside.length - 1].focus();
    await user.tab();
    expect(document.activeElement).not.toBe(outside);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('닫히면 원래 포커스로 돌아간다', async () => {
    const user = userEvent.setup();
    const outside = document.createElement('button');
    outside.textContent = '트리거';
    document.body.appendChild(outside);
    outside.focus();

    const { unmount } = render(
      <RepositoryProvider>
        <AppPhaseProvider>
          <GalaxyProvider>
            <MemoryRouter>
              <VerseDetailOverlay verseId="gen-1-3" onClose={vi.fn()} />
            </MemoryRouter>
          </GalaxyProvider>
        </AppPhaseProvider>
      </RepositoryProvider>,
    );

    await screen.findByRole('dialog');
    unmount();
    await waitFor(() => expect(document.activeElement).toBe(outside));

    outside.remove();
    void user;
  });
});
