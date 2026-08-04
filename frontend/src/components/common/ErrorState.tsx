/*
 * components/common/ErrorState.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 실패 상태. 원인을 설명하고 다음 행동을 준다.
 * 사용자를 탓하지 않고, 기술 용어나 예외 문자열을 노출하지 않는다.
 */

import { Button } from './Button';
import styles from './ErrorState.module.css';

interface Props {
  message: string;
  /**
   * 서버가 알려 준 원인. 있으면 작게 덧붙인다.
   *
   * ★ 왜 보여 주는가
   *   "답변을 받지 못했습니다" 만 뜨면 사용자도 개발자도 다음에 무엇을
   *   할지 알 수 없다. 실제로 이 화면에서 원인을 감추는 바람에
   *   "LLM 스트리밍 실패: ..." 라는 서버의 설명이 통째로 사라졌다.
   *
   * ★ 그래도 주인공은 아니다
   *   기술 문구는 작고 흐리게 둔다. 첫 줄은 사람이 읽을 문장으로 남긴다.
   */
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ message, detail, onRetry, retryLabel = '다시 시도' }: Props) {
  return (
    <div className={styles.wrap} role="alert">
      <p className={styles.message}>{message}</p>
      {detail && <p className={styles.detail}>{detail}</p>}
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
