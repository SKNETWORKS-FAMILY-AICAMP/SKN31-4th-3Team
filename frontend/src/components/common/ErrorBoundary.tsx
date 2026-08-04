/*
 * components/common/ErrorBoundary.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 렌더 중 예외를 잡아 앱이 빈 화면으로 죽지 않게 한다.
 *
 * 톤: 사용자를 탓하지 않고, 기술 용어나 스택 트레이스를 노출하지 않는다.
 * 우주라는 세계관 안에서 조용히 안내한다.
 *
 * React 의 에러 경계는 아직 클래스 컴포넌트로만 만들 수 있다.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // TODO(api): 실제 서비스에서는 에러 리포팅으로 보낸다.
    // 지금은 개발 중 원인을 볼 수 있도록 콘솔에만 남긴다.
    console.error('[Eden] 렌더 오류', error, info.componentStack);
  }

  private reload = (): void => {
    window.location.assign('/');
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className={styles.wrap} role="alert">
        <p className="u-eyebrow">잠시 길을 잃었습니다</p>
        <h1 className={styles.title}>화면을 여는 중 문제가 생겼습니다</h1>
        <p className={styles.body}>
          잠시 후 다시 시도해 주세요. 계속 같은 문제가 생긴다면 브라우저를 새로고침해 주세요.
        </p>
        <button type="button" className={styles.action} onClick={this.reload}>
          처음으로 돌아가기
        </button>
      </main>
    );
  }
}
