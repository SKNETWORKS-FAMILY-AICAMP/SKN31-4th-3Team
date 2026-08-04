/*
 * components/common/ErrorBoundary.test.tsx
 * Phase 6 검증 기준: 렌더 예외가 빈 화면이 아니라 복구 안내로 이어지는가.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('의도적 렌더 실패');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React 는 잡힌 예외도 콘솔에 출력한다 — 테스트 출력만 조용히 한다.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('예외가 없으면 자식을 그대로 렌더한다', () => {
    render(
      <ErrorBoundary>
        <p>정상 화면</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('정상 화면')).toBeInTheDocument();
  });

  it('예외가 나면 복구 안내를 보여준다', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('화면을 여는 중 문제가 생겼습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '처음으로 돌아가기' })).toBeInTheDocument();
  });

  it('스택 트레이스나 예외 메시지를 노출하지 않는다', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    // 사용자에게는 기술 정보를 보여주지 않는다.
    expect(screen.queryByText(/의도적 렌더 실패/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Error');
  });
});
