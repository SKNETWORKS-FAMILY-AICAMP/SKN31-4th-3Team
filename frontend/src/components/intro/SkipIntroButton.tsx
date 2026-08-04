/*
 * components/intro/SkipIntroButton.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 건너뛰기 버튼.
 *
 * 접근성 요건:
 *  - 인트로 시작 직후(0.3s)부터 항상 보인다
 *  - 페이지의 첫 포커스 대상이다 (DOM 상 인트로 문장보다 앞)
 *  - Esc 키로도 같은 동작이 가능하다 (IntroSequence 가 처리)
 */

import { useEffect, useState } from 'react';
import { SKIP_VISIBLE_AT } from '../../galaxy/introTimeline';
import styles from './SkipIntroButton.module.css';

export function SkipIntroButton({ onSkip }: { onSkip: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), SKIP_VISIBLE_AT * 1000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <button
      type="button"
      className={`${styles.skip} ${visible ? styles.visible : ''}`}
      onClick={onSkip}
    >
      인트로 건너뛰기
      <span className={styles.hint} aria-hidden="true">Esc</span>
    </button>
  );
}
