/*
 * components/answer/AnswerSkeleton.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 로딩 상태.
 *
 * 스피너 대신 실제 답변과 같은 골격을 보여준다. 내용이 도착했을 때
 * 레이아웃이 튀지 않고, 무엇이 오고 있는지도 예고된다.
 *
 * 펄스 애니메이션은 tokens.css 의 duration 토큰을 따르므로
 * reduced-motion 에서는 자동으로 거의 정지한다.
 */

import styles from './AnswerSkeleton.module.css';

export function AnswerSkeleton() {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.srOnly}>마음을 살피는 중입니다</span>

      <div className={styles.lineGroup} aria-hidden="true">
        <span className={styles.line} style={{ width: '92%' }} />
        <span className={styles.line} style={{ width: '74%' }} />
      </div>

      <div className={styles.lineGroup} aria-hidden="true">
        <span className={styles.line} style={{ width: '86%' }} />
        <span className={styles.line} style={{ width: '58%' }} />
      </div>

      <div className={styles.cards} aria-hidden="true">
        <span className={styles.card} />
        <span className={styles.card} />
      </div>
    </div>
  );
}
