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
import { useVerses } from '../state/VersesContext';
import { isCrisis } from '../services/intentMatcher';
import { useRepositories } from '../services/RepositoryProvider';
import { useAppPhase } from '../state/AppPhaseContext';
import { AnswerPanel } from '../components/answer/AnswerPanel';
import { AnswerSkeleton } from '../components/answer/AnswerSkeleton';
import { SafetyNotice } from '../components/common/SafetyNotice';
import { ErrorState } from '../components/common/ErrorState';
import { Button } from '../components/common/Button';
import { askPath, counselPath, galaxyPath, PATHS, skyPath, versePath } from './paths';
import screen from './Screen.module.css';
import styles from './AskRoute.module.css';

export function AskRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { byId } = useVerses();
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
    .map((id) => byId.get(id))
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

  /**
   * 추천된 은하로 날아간 다음 목록을 연다.
   *
   * 구절을 고를 때와 같은 몸짓이다 — 바로 열지 않고 그 자리까지 간다.
   */
  const visitGalaxy = (galaxyId: string) => {
    setPhase('traveling');
    navigate(galaxyPath(galaxyId, { travel: true }));
  };

  /**
   * 상담으로 넘어간다.
   *
   * ★ 은하를 그대로 들고 간다.
   *   넘기지 않으면 서버가 다시 추천하는데, 그 사이 로그인이 바뀌거나
   *   구절 데이터가 늘면 다른 사람이 나온다. 화면에 "요한의 은하"라고
   *   써 놓고 마태가 답하는 셈이다.
   *
   * ★ 은하가 있으면 거쳐서 간다.
   *   대화창이 갑자기 뜨는 것과, 그 사람이 있는 자리까지 가서 열리는
   *   것은 다르다. 은하를 모르면 곧장 연다 — 갈 곳이 없는데 카메라만
   *   움직이면 그건 지연일 뿐이다.
   */
  const continueCounsel = (galaxyId?: string) => {
    const destination = counselPath({ q: question, from: stars[0]?.id, galaxy: galaxyId });
    if (!galaxyId) {
      navigate(destination);
      return;
    }
    setPhase('traveling');
    navigate(galaxyPath(galaxyId, { travel: true, then: destination }));
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

      {/*
        * ★ 넓은 패널을 쓴다.
        *   기본 패널(560px)에서는 두 단이 들어가지 않아 답변이 다시
        *   세로 한 줄이 된다. 대신 글줄은 --width-reading 으로 따로
        *   묶어 둔다 — 패널이 넓어졌다고 문장까지 늘어나면 읽기 힘들다.
        */}
      <div className={`${screen.panel} ${screen.wide} ${screen.stack}`}>
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
          searchVerses={result.verses}
              onVisitStar={visitStar}
              onOpenVerse={(star) => navigate(versePath(star.id))}
              onContinueCounsel={() => continueCounsel(result.galaxyId)}
              onVisitGalaxy={result.galaxyId ? () => visitGalaxy(result.galaxyId!) : undefined}
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
