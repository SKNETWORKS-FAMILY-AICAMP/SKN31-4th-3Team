/*
 * components/answer/VerseCard.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 추천 구절 카드.
 *
 * 카드는 "읽을거리"가 아니라 "가는 길"이다. 구절을 보여주는 동시에
 * 은하수 어디에 그 별이 있는지로 이어져야 한다.
 *
 * 인용은 짧게(30자 내외) + 출처를 반드시 함께 표기한다.
 */

import type { FullVerseStar } from '../../data/types';
import { formatRef } from '../../data/verses';
import { THEME_LABELS } from '../../data/intents';
import { Button } from '../common/Button';
import styles from './VerseCard.module.css';

interface Props {
  /*
   * 인용과 스토리를 보여 주는 카드이므로 상세 콘텐츠가 있는 별만 받는다.
   * 연관 구절(brief)은 추천 대상이 아니며, 타입이 그 사실을 강제한다.
   */
  star: FullVerseStar;
  /** 카드 순번 — 스크린리더에 "3개 중 1번째"로 전달한다 */
  index: number;
  total: number;
  onVisit: (star: FullVerseStar) => void;
  onDetail: (star: FullVerseStar) => void;
}

export function VerseCard({ star, index, total, onVisit, onDetail }: Props) {
  return (
    <article className={styles.card} aria-label={`추천 구절 ${index + 1} / ${total}`}>
      <blockquote className={styles.quote}>
        <p className="u-verse">{star.excerpt}</p>
        <cite className={styles.ref}>
          {formatRef(star)} · {star.attribution}
        </cite>
      </blockquote>

      <p className={styles.summary}>{star.summary}</p>

      <ul className={styles.tags}>
        {star.themes.map((theme) => (
          <li key={theme} className={styles.tag}>
            {THEME_LABELS[theme]}
          </li>
        ))}
      </ul>

      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => onVisit(star)}>
          별자리에서 보기
        </Button>
        <Button variant="quiet" onClick={() => onDetail(star)}>
          구절 자세히
        </Button>
      </div>
    </article>
  );
}
