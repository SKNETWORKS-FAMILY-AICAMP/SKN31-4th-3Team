/*
 * components/home/PromptChips.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 추천 질문 칩.
 *
 * 문구를 새로 쓰지 않고 큐레이션 별의 relatedPrompts 에서 가져온다.
 * → 칩을 누르면 반드시 대응하는 별이 존재한다. 데이터와 UI가 어긋나지 않는다.
 */

import styles from './PromptChips.module.css';

interface Props {
  prompts: readonly string[];
  onPick: (prompt: string) => void;
}

export function PromptChips({ prompts, onPick }: Props) {
  if (prompts.length === 0) return null;

  return (
    <nav aria-label="추천 질문" data-guide="chips">
      <ul className={styles.list}>
        {prompts.map((prompt) => (
          <li key={prompt}>
            <button type="button" className={styles.chip} onClick={() => onPick(prompt)}>
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
