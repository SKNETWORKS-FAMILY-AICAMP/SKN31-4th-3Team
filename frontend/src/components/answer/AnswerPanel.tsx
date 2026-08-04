/*
 * components/answer/AnswerPanel.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 답변 화면 본체.
 *
 * 순서가 곧 톤이다:
 *   공감 → 짧은 묵상 → 구절 → 다음 행동
 * 해결책을 먼저 내밀지 않고, 먼저 받아준 다음 함께 본다.
 */

import type { AskResult, FullVerseStar } from '../../data/types';
import { THEME_LABELS } from '../../data/intents';
import { Button } from '../common/Button';
import { VerseCard } from './VerseCard';
import styles from './AnswerPanel.module.css';

interface Props {
  result: AskResult;
  stars: readonly FullVerseStar[];
  onVisitStar: (star: FullVerseStar) => void;
  onOpenVerse: (star: FullVerseStar) => void;
  onContinueCounsel: () => void;
  onAskAgain: (question: string) => void;
  /** 같은 질문으로 다른 구절 조합 요청 */
  onReroll: () => void;
  rerolling: boolean;
}

export function AnswerPanel({
  result,
  stars,
  onVisitStar,
  onOpenVerse,
  onContinueCounsel,
  onAskAgain,
  onReroll,
  rerolling,
}: Props) {
  // 삼항으로 좁혀야 THEME_LABELS 인덱싱이 타입 안전하다.
  // (boolean 플래그로는 TS가 intent 를 좁혀 주지 않는다)
  const themeLabel =
    result.intent === 'fallback' || result.intent === 'crisis'
      ? null
      : THEME_LABELS[result.intent];

  return (
    <div className={styles.panel}>
      {/* 감정 라벨은 단정이 아니라 "이렇게 읽었습니다"라는 표시다 */}
      {themeLabel && <p className="u-eyebrow">{themeLabel}에 대한 이야기로 들었습니다</p>}

      <p className={styles.empathy}>{result.empathy}</p>
      <p className={styles.reflection}>{result.reflection}</p>

      <section className={styles.verses} aria-label="추천 구절" data-guide="answerVerses">
        <div className={styles.versesHead}>
          <h2 className="u-eyebrow">함께 볼 구절</h2>
          <Button variant="quiet" onClick={onReroll} disabled={rerolling}>
            {rerolling ? '다른 구절을 찾는 중…' : '다른 구절 보기'}
          </Button>
        </div>

        <ul className={styles.cards}>
          {stars.map((star, i) => (
            <li key={star.id}>
              <VerseCard
                star={star}
                index={i}
                total={stars.length}
                onVisit={onVisitStar}
                onDetail={onOpenVerse}
              />
            </li>
          ))}
        </ul>
      </section>

      <div className={styles.cta}>
        <Button variant="primary" onClick={onContinueCounsel}>
          상담 이어가기
        </Button>
      </div>

      {result.followUps.length > 0 && (
        <nav className={styles.followUps} aria-label="이어서 물어볼 질문">
          <p className="u-eyebrow">이어서 물어보기</p>
          <ul className={styles.followList}>
            {result.followUps.map((prompt) => (
              <li key={prompt}>
                <button type="button" className={styles.followChip} onClick={() => onAskAgain(prompt)}>
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
