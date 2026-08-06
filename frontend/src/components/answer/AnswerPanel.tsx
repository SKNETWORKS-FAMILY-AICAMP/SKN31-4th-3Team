/*
 * components/answer/AnswerPanel.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 답변 화면 본체.
 *
 * 순서가 곧 톤이다:
 *   공감 → 짧은 묵상 → 구절 → 다음 행동
 * 해결책을 먼저 내밀지 않고, 먼저 받아준 다음 함께 본다.
 */

import type { CSSProperties } from 'react';

import type { AskResult, FullVerseStar, AskVerse } from '../../data/types';
import { galaxySwatch, getGalaxy } from '../../data/disciples';
import { withOf } from '../../data/korean';
import { THEME_LABELS } from '../../data/intents';
import { Button } from '../common/Button';
import { VerseCard } from './VerseCard';
import styles from './AnswerPanel.module.css';

interface Props {
  result: AskResult;
  stars: readonly FullVerseStar[];
  /**
   * 벡터 검색이 고른 구절. 있으면 이쪽을 그린다.
   *
   * ★ stars 와 나눠 둔다.
   *   stars 는 큐레이션 702절이라 스토리·묵상·모티프가 다 있다.
   *   검색은 31,077절에서 고르므로 본문뿐이다. 한 타입으로 합치면
   *   없는 필드를 빈 문자열로 채우게 되고, 그건 데이터가 빠진 것과
   *   구분되지 않는다.
   */
  searchVerses?: readonly AskVerse[];
  onVisitStar: (star: FullVerseStar) => void;
  onOpenVerse: (star: FullVerseStar) => void;
  onContinueCounsel: () => void;
  /** 추천된 은하로 데려다준다. 은하가 없으면 넘기지 않는다. */
  onVisitGalaxy?: () => void;
  onAskAgain: (question: string) => void;
  /** 같은 질문으로 다른 구절 조합 요청 */
  onReroll: () => void;
  rerolling: boolean;
}

export function AnswerPanel({
  result,
  stars,
  searchVerses,
  onVisitStar,
  onOpenVerse,
  onContinueCounsel,
  onVisitGalaxy,
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

  const galaxy = result.galaxyId ? getGalaxy(result.galaxyId) : undefined;

  return (
    <div className={styles.panel}>
      {/*
       * 왼쪽 — 지금 당신에게 하는 말.
       *
       * ★ 오른쪽(은하 안내)과 나란히 놓인다.
       *   세로로만 쌓으면 공감 → 묵상 → 구절 → 은하 → 버튼이 한 줄이
       *   되어 화면이 길어지고, 답을 끝까지 읽기 전에는 다음에 무엇을
       *   할 수 있는지 알 수 없다. 배치는 AnswerPanel.module.css 참조.
       */}
      <div className={styles.lede}>
        {/* 감정 라벨은 단정이 아니라 "이렇게 읽었습니다"라는 표시다 */}
        {themeLabel && <p className="u-eyebrow">{themeLabel}에 대한 이야기로 들었습니다</p>}

        <p className={styles.empathy}>{result.empathy}</p>
        <p className={styles.reflection}>{result.reflection}</p>
      </div>

      {/* 오른쪽 — 그래서 어디로 가면 되는지 */}
      {/*
        * ★ 은하가 없어도 이 자리는 남는다.
        *   상담 버튼이 여기 있기 때문이다. 다만 이름표(aria-label)는
        *   은하가 있을 때만 붙인다 — 내용이 버튼 하나뿐인 영역을
        *   "추천 은하" 라고 읽어 주면 스크린리더 사용자는 찾다가 만다.
        */}
      <aside
        className={styles.guide}
        aria-label={galaxy ? '추천 은하' : undefined}
        style={galaxy ? ({ '--galaxy-tint': galaxySwatch(galaxy) } as CSSProperties) : undefined}
      >
        {galaxy && (
          <>
            <p className="u-eyebrow">이 이야기를 들어 줄 사람</p>
            <p className={styles.galaxyName}>
              <span className={styles.galaxyDot} aria-hidden="true" />
              {galaxy.name}의 은하
            </p>
            {result.galaxyReason && <p className={styles.galaxyReason}>{result.galaxyReason}</p>}
          </>
        )}

        <div className={styles.cta}>
          <Button variant="primary" onClick={onContinueCounsel}>
            {galaxy ? `${withOf(galaxy.name)} 상담 이어가기` : '상담 이어가기'}
          </Button>
          {galaxy && onVisitGalaxy && (
            <Button variant="quiet" onClick={onVisitGalaxy}>
              은하 찾아가기
            </Button>
          )}
        </div>
      </aside>

      {/*
       * 아래층 — 구절은 폭을 다 쓴다.
       *
       * ★ 카드를 옆으로 눕히는 것이 목적이 아니다.
       *   셋을 나란히 두면 "고르는 것"이 되고, 세로로 쌓으면 "차례로
       *   읽는 것"이 된다. 여기서 사용자가 할 일은 고르는 쪽이다.
       */}
      <section className={styles.verses} aria-label="추천 구절" data-guide="answerVerses">
        <div className={styles.versesHead}>
          <h2 className="u-eyebrow">함께 볼 구절</h2>
          <Button variant="quiet" onClick={onReroll} disabled={rerolling}>
            {rerolling ? '다른 구절을 찾는 중…' : '다른 구절 보기'}
          </Button>
        </div>

        {/*
          ★ 검색이 고른 구절과 큐레이션 구절을 다르게 그린다.
            큐레이션 702절에는 스토리·묵상·모티프가 있고, 성경전서에서
            올라온 구절에는 본문뿐이다. 없는 것을 빈 칸으로 채워 두면
            화면이 "데이터가 빠졌다" 로 읽힌다. 있는 것만 보여 준다.
        */}
        {searchVerses && searchVerses.length > 0 ? (
          <ul className={styles.cards}>
            {searchVerses.map((verse) => (
              <li key={verse.id} className={styles.cardItem}>
                <article className={styles.found}>
                  <blockquote className={styles.foundQuote}>
                    <p className="u-verse">{verse.content}</p>
                    <cite className={styles.foundRef}>{verse.ref}</cite>
                  </blockquote>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <ul className={styles.cards}>
            {stars.map((star, i) => (
              <li key={star.id} className={styles.cardItem}>
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
        )}
      </section>

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
