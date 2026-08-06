import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'ghost' | 'quiet';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

/*
 * ★ ref 를 넘겨받는다.
 *   조우 화면은 열리는 순간 이 버튼으로 포커스를 옮겨야 한다 — 그때
 *   화면의 유일한 할 일이기 때문이다. 포커스를 주려면 실제 DOM 노드에
 *   닿아야 하고, 그 통로가 ref 다.
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'ghost', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={[styles.base, styles[variant], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
});
