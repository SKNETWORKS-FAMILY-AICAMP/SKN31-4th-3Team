/*
 * 둘러보기를 그만둔 직후의 한 줄.
 *
 * 튜토리얼은 처음 한 번만 자동으로 뜬다. 그 장치가 "실수로 닫으면
 * 영영 못 본다"는 함정이 되지 않게 막는 것이 이 컴포넌트의 전부다.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GuideHint } from './GuideHint';

describe('GuideHint', () => {
  it('그만두기 전에는 뜨지 않는다', () => {
    render(<GuideHint show={false} onReopen={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('★ 어디서 다시 여는지 알려 준다', () => {
    render(<GuideHint show onReopen={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/환경설정/);
  });

  it('★ 여기서 바로 다시 열 수도 있다', () => {
    // 실수로 닫은 사람에게 환경설정까지 걸어가라고 하면 대부분 포기한다.
    render(<GuideHint show onReopen={vi.fn()} />);
    expect(screen.getByRole('button', { name: '지금 다시 보기' })).toBeInTheDocument();
  });

  it('다시 보기를 누르면 알린다', async () => {
    const onReopen = vi.fn();
    const user = userEvent.setup();
    render(<GuideHint show onReopen={onReopen} />);

    await user.click(screen.getByRole('button', { name: '지금 다시 보기' }));
    expect(onReopen).toHaveBeenCalled();
  });

  it('★ 닫기 버튼이 없다 — 스스로 사라지므로', () => {
    /*
     * 방금 무언가를 닫은 사람에게 닫을 것을 하나 더 주지 않는다.
     * 사라지는 일은 useGuideTour 의 타이머가 맡는다.
     */
    render(<GuideHint show onReopen={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('지금 다시 보기');
  });
});
