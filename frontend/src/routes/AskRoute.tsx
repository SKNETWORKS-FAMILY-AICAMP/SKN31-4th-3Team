/*
 * routes/AskRoute.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 질문에 대한 mock 답변 화면.
 *
 * 상태는 넷 중 하나다: loading / crisis / error / answered.
 * 질문은 URL 쿼리에 남으므로 새로고침·공유·뒤로가기가 모두 자연스럽다.
 *
 * 흐름을 막지 않는다: 로딩 중에도 상단 네비게이션은 살아 있고,
 * 재요청 중에도 기존 답변이 화면에 남는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AskResult, FullVerseStar } from '../data/types';
import { isFullVerse } from '../data/types';
import { getVerseStar } from '../data/verses';
import { isCrisis } from '../services/intentMatcher';
import { useRepositories } from '../services/RepositoryProvider';
import { useAppPhase } from '../state/AppPhaseContext';
import { AnswerPanel } from '../components/answer/AnswerPanel';
import { AnswerSkeleton } from '../components/answer/AnswerSkeleton';
import { SafetyNotice } from '../components/common/SafetyNotice';
import { ErrorState } from '../components/common/ErrorState';
import { Button } from '../components/common/Button';
import { askPath, counselPath, PATHS, skyPath, versePath } from './paths';
import screen from './Screen.module.css';
import styles from './AskRoute.module.css';

export function AskRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { verses } = useRepositories();
  const { setPhase } = useAppPhase();

  const question = params.get('q') ?? '';

  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [rerolling, setRerolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 안전 안내를 사용자가 직접 닫았는가 */
  const [safetyDismissed, setSafetyDismissed] = useState(false);

  const attemptRef = useRef(0);

  /*
   * 위기 신호는 네트워크를 타기 전에 클라이언트에서 먼저 판정한다.
   * 서버가 죽어 있어도 안전 안내는 떠야 하기 때문이다.
   */
  const crisis = isCrisis(question) && !safetyDismissed;

  const load = useCallback(
    (attempt: number, mode: 'initial' | 'reroll') => {
      if (mode === 'initial') setLoading(true);
      else setRerolling(true);
      setError(null);

      let cancelled = false;
      verses
        .ask(question, attempt)
        .then((r) => {
          if (cancelled) return;
          setResult(r);
          setPhase('answered');
        })
        .catch(() => {
          if (cancelled) return;
          setError('응답을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
          setRerolling(false);
        });

      return () => {
        cancelled = true;
      };
    },
    [question, verses, setPhase],
  );

  useEffect(() => {
    if (!question) {
      navigate(PATHS.home, { replace: true });
      return;
    }
    // 위기 분기에서는 mock 응답을 요청하지 않는다.
    if (crisis) {
      setLoading(false);
      return;
    }
    setPhase('answering');
    attemptRef.current = 0;
    return load(0, 'initial');
  }, [question, crisis, load, navigate, setPhase]);

  /*
   * 추천은 상세 콘텐츠가 있는 별만 가리킨다.
   * 연관 구절이 섞여 들어오면 인용 없는 빈 카드가 되므로 여기서 걸러 낸다.
   */
  const stars = (result?.verseIds ?? [])
    .map(getVerseStar)
    .filter((s): s is FullVerseStar => Boolean(s) && isFullVerse(s!));

  /*
   * 답변에서 고른 구절은 "날아가서 바로 연다".
   *
   * 예전에는 하늘에 내려놓기만 해서, 이미 볼 구절을 정한 사용자가 그 별을
   * 다시 찾아야 했다. 게다가 비행 중에 다른 별이 눌리기도 했다.
   */
  const visitStar = (star: FullVerseStar) => {
    setPhase('traveling');
    navigate(skyPath(star.id, { travel: true }));
  };

  const reroll = () => {
    attemptRef.current += 1;
    load(attemptRef.current, 'reroll');
  };

  return (
    <main className={screen.screen}>
      <div className={screen.topBar}>
        <Button variant="quiet" onClick={() => navigate(PATHS.home)}>
          ← 처음으로
        </Button>
        <Button variant="quiet" onClick={() => navigate(PATHS.sky)}>
          별자리 보기
        </Button>
      </div>

      <div className={`${screen.panel} ${screen.stack}`}>
        <header className={styles.question}>
          <p className="u-eyebrow">당신의 질문</p>
          <p className="u-title">{question}</p>
        </header>

        {crisis && (
          <SafetyNotice
            onContinue={() => setSafetyDismissed(true)}
            onBack={() => navigate(PATHS.home)}
          />
        )}

        {!crisis && loading && <AnswerSkeleton />}

        {!crisis && !loading && error && !result && (
          <ErrorState message={error} onRetry={() => load(attemptRef.current, 'initial')} />
        )}

        {!crisis && !loading && result && (
          <>
            {/* 재요청이 실패해도 기존 답변은 지우지 않는다 */}
            {error && <ErrorState message={error} onRetry={reroll} retryLabel="다시 불러오기" />}

            <AnswerPanel
              result={result}
              stars={stars}
              onVisitStar={visitStar}
              onOpenVerse={(star) => navigate(versePath(star.id))}
              onContinueCounsel={() => navigate(counselPath({ q: question, from: stars[0]?.id }))}
              onAskAgain={(prompt) => navigate(askPath(prompt))}
              onReroll={reroll}
              rerolling={rerolling}
            />
          </>
        )}
      </div>
    </main>
  );
}
