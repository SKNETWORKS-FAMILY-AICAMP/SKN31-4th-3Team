/*
 * 오프닝 문구 + 이름 인사.
 *
 * 인사는 문구를 대체하지 않고 그 위에 얹힌다 — 오프닝 문구는 방문마다
 * 달라지는 것이 의도이므로, 인사가 그 자리를 차지하면 매번 같은 화면이
 * 되어 버린다. 여기서 확인하는 것이 그 관계다.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OpeningPrompt } from './OpeningPrompt';
import { GalaxyProvider } from '../../state/GalaxyContext';
import type { Opening } from '../../data/openings';

const OPENINGS: readonly Opening[] = [
  { id: 'a', headline: '어떤 마음으로 오셨나요', placeholder: '무엇이든 적어 보세요' },
];

function renderPrompt(name?: string | null) {
  render(
    <GalaxyProvider>
      <OpeningPrompt openings={OPENINGS} paused onChange={vi.fn()} greetingName={name} />
    </GalaxyProvider>,
  );
}

describe('이름 인사', () => {
  it('로그인하지 않았으면 인사가 없다', () => {
    renderPrompt(null);
    expect(screen.queryByText(/어서 오세요/)).not.toBeInTheDocument();
  });

  it('이름이 없어도 자리를 비워 두지 않는다 (undefined)', () => {
    renderPrompt(undefined);
    expect(screen.queryByText(/어서 오세요/)).not.toBeInTheDocument();
  });

  it('이름이 있으면 "…님, 어서 오세요"로 맞이한다', () => {
    renderPrompt('혁진');
    expect(screen.getByText('혁진님, 어서 오세요')).toBeInTheDocument();
  });

  it('★ 인사가 오프닝 문구를 대체하지 않는다', () => {
    // 문구는 방문마다 달라지는 것이 의도다. 인사가 그 자리를 먹으면 안 된다.
    renderPrompt('혁진');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('어떤 마음으로 오셨나요');
  });

  it('공백만 있는 이름은 없는 것으로 친다', () => {
    // 서버나 폼에서 넘어온 값이 항상 다듬어져 있다는 보장은 없다.
    renderPrompt('   ');
    expect(screen.queryByText(/어서 오세요/)).not.toBeInTheDocument();
  });

  it('앞뒤 공백은 다듬어서 보여 준다', () => {
    renderPrompt('  혁진 ');
    expect(screen.getByText('혁진님, 어서 오세요')).toBeInTheDocument();
  });

  it('인사는 제목이 아니다 — 화면의 무게중심은 여전히 질문이다', () => {
    renderPrompt('혁진');
    const headings = screen.getAllByRole('heading');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('어떤 마음으로 오셨나요');
  });
});
