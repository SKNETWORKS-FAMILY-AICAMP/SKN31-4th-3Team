import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'ghost' | 'quiet';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'ghost', className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={[styles.base, styles[variant], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
