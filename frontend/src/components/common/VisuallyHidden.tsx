import type { ReactNode } from 'react';
import styles from './VisuallyHidden.module.css';

/** 시각적으로는 숨기되 스크린리더에는 읽히는 텍스트 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className={styles.hidden}>{children}</span>;
}
