/*
 * components/galaxy/MbtiSelector.test.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 검증 기준: 16유형이 우주 위에 글자로만 서고, 고르면 밑줄로 드러나는가.
 *
 * ★ "판을 두지 않는다"가 이 컴포넌트의 제약이다.
 *   칸을 나누거나 테두리를 두르면 우주 위에 표가 얹힌 모양이 된다.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MbtiSelector } from './MbtiSelector';
import { MBTI_TYPES } from '../../data/mbti';

const here = dirname(fileURLToPath(import.meta.url));

describe('16유형 목록', () => {
  it('제목이 무엇을 하는 곳인지 밝힌다', () => {
    render(<MbtiSelector selected={null} onSelect={vi.fn()} matchCount={0} />);
    expect(screen.getByText('MBTI 선택')).toBeInTheDocument();
  });

  it('16개가 모두 버튼으로 있다', () => {
    render(<MbtiSelector selected={null} onSelect={vi.fn()} matchCount={0} />);
    for (const type of MBTI_TYPES) {
      expect(screen.getByRole('button', { name: type })).toBeInTheDocument();
    }
  });

  it('고르기 전에는 아무것도 눌려 있지 않다', () => {
    render(<MbtiSelector selected={null} onSelect={vi.fn()} matchCount={0} />);
    const pressed = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(0);
  });

  it('고르면 그 유형만 눌린 상태가 된다', () => {
    render(<MbtiSelector selected="INFJ" onSelect={vi.fn()} matchCount={4} />);
    expect(screen.getByRole('button', { name: 'INFJ' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'ENFP' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('누르면 그 유형을 알린다', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MbtiSelector selected={null} onSelect={onSelect} matchCount={0} />);

    await user.click(screen.getByRole('button', { name: 'ENTP' }));
    expect(onSelect).toHaveBeenCalledWith('ENTP');
  });

  it('★ 같은 유형을 다시 누르면 해제된다', async () => {
    // 되돌릴 길이 없으면 한 번 고른 뒤로는 전체 하늘을 못 본다.
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MbtiSelector selected="ENTP" onSelect={onSelect} matchCount={3} />);

    await user.click(screen.getByRole('button', { name: 'ENTP' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe('무슨 일이 일어났는지 알린다', () => {
  it('고르기 전에는 안내가 뜬다', () => {
    render(<MbtiSelector selected={null} onSelect={vi.fn()} matchCount={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('마음이 통하는 상담을 시작해보세요');
  });

  it('★ 고른 뒤에는 몇 곳이 남았는지 말해 준다', () => {
    // 화면이 어두워지기만 하고 설명이 없으면 고장으로 읽힌다.
    render(<MbtiSelector selected="INFJ" onSelect={vi.fn()} matchCount={5} />);
    expect(screen.getByRole('status')).toHaveTextContent('5곳');
  });
});

/*
 * 가입할 때 남긴 유형.
 *
 * ★ "고른 것"과 "나"는 다른 상태다.
 *   오늘은 다른 결을 보고 싶을 수 있다. 두 표시가 섞이면 사용자가 다른
 *   유형을 골랐을 때 무엇이 선택된 상태인지 알 수 없게 된다.
 */
describe('내 유형', () => {
  it('로그인하지 않았으면 아무것도 빛나지 않는다', () => {
    render(<MbtiSelector selected={null} onSelect={vi.fn()} matchCount={0} />);
    expect(screen.queryByText(/내 유형/)).not.toBeInTheDocument();
  });

  it('내 유형에는 표시가 붙는다 — 빛만으로는 읽어 줄 수 없으므로', () => {
    render(<MbtiSelector selected={null} onSelect={vi.fn()} matchCount={0} ownMbti="INFJ" />);
    expect(screen.getByRole('button', { name: /INFJ.*내 유형/ })).toBeInTheDocument();
  });

  it('★ 내 유형이라는 것과 지금 고른 것은 별개다', () => {
    // 내 유형은 INFJ 인데 오늘은 ENTP 를 보고 있는 상태
    render(<MbtiSelector selected="ENTP" onSelect={vi.fn()} matchCount={3} ownMbti="INFJ" />);

    expect(screen.getByRole('button', { name: /INFJ.*내 유형/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'ENTP' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('표시는 딱 하나만 붙는다', () => {
    render(<MbtiSelector selected={null} onSelect={vi.fn()} matchCount={0} ownMbti="ISTP" />);
    expect(screen.getAllByText(/내 유형/)).toHaveLength(1);
  });

  it('★ 16유형이 아닌 값이 오면 없는 것으로 친다', () => {
    // 서버가 준 문자열이 16유형 중 하나라는 보장은 없다.
    render(<MbtiSelector selected={null} onSelect={vi.fn()} matchCount={0} ownMbti="XXXX" />);
    expect(screen.queryByText(/내 유형/)).not.toBeInTheDocument();
  });

  it('빈 문자열도 마찬가지다 — 가입 때 고르지 않은 경우', () => {
    render(<MbtiSelector selected={null} onSelect={vi.fn()} matchCount={0} ownMbti="" />);
    expect(screen.queryByText(/내 유형/)).not.toBeInTheDocument();
  });
});

/*
 * jsdom 에는 레이아웃이 없어 "글자만 떠 있는가"를 렌더로 확인할 수 없다.
 * 그래서 이 제약은 스타일 규칙 자체를 계약으로 본다.
 */
describe('우주 위에 글자만 둔다', () => {
  const css = readFileSync(resolve(here, './MbtiSelector.module.css'), 'utf8');
  const ruleBody = (className: string) => {
    const match = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(css);
    if (!match) throw new Error(`.${className} 규칙을 찾지 못했습니다`);
    return match[1];
  };

  it('★ 판이나 테두리를 두르지 않는다', () => {
    const root = ruleBody('root');
    expect(root).not.toContain('background');
    expect(root).not.toContain('border');
    expect(root).not.toContain('backdrop-filter');
  });

  it('★ 목록이 차지한 자리는 포인터를 통과시킨다', () => {
    // 세로 띠 전체가 클릭을 먹으면 그 뒤의 별을 누를 수 없다.
    expect(ruleBody('root')).toContain('pointer-events: none');
    expect(ruleBody('type')).toContain('pointer-events: auto');
  });

  it('글자에도 배경이 없다', () => {
    expect(ruleBody('type')).toContain('background: none');
    expect(ruleBody('type')).toContain('border: none');
  });

  it('고른 유형은 밑줄로 드러난다', () => {
    const rule = ruleBody('rule');
    expect(rule).toContain('transform: scaleX(0)');
    expect(css).toContain(".type[aria-pressed='true'] .rule { transform: scaleX(1); }");
  });

  it('밑줄 끝이 흐려진다 (선이 아니라 스민 빛으로 보이게)', () => {
    expect(ruleBody('rule')).toContain('transparent 0%');
  });

  it('★ 내 유형은 밑줄이 아니라 빛으로 표시된다', () => {
    // 같은 표기를 쓰면 "고른 것"과 구별되지 않는다.
    const own = ruleBody('own');
    expect(own).toContain('text-shadow');
    expect(own).not.toContain('scaleX');
  });

  it('내 유형의 빛은 글자 뒤에 깔린다 — 글자를 덮지 않는다', () => {
    const halo = ruleBody('halo');
    expect(halo).toContain('z-index: -1');
    expect(halo).toContain('pointer-events: none');
  });

  it('★ 모션 줄이기에서도 표시는 남는다', () => {
    /*
     * 호흡만 멈추고 빛은 남긴다. 애니메이션과 함께 표시까지 사라지면
     * 모션을 끈 사용자에게는 "내 유형"이라는 정보 자체가 없어진다.
     */
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(reduced).toContain('.halo');
    expect(reduced).toMatch(/\.halo\s*\{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/\.halo\s*\{[^}]*opacity:/);
  });
});
