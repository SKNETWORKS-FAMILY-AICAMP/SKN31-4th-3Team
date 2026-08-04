/*
 * routes/IntroRoute.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 창조 인트로.
 *
 * 화면은 완전한 칠흑에서 시작하고, 창세기 1장의 문장이 순차로 나타나며
 * 흩어져 있던 별들이 지구를 닮은 성운으로 모여든다.
 * (별 연출은 GalaxyCanvas/GalaxyEngine 이 담당한다)
 *
 * 사용자 입력을 막지 않는다: 건너뛰기는 상시 가능하고, 이번 세션에
 * 이미 본 사람에게는 인트로를 다시 틀지 않는다.
 */

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IntroSequence } from '../components/intro/IntroSequence';
import { SkipIntroButton } from '../components/intro/SkipIntroButton';
import { useAppPhase } from '../state/AppPhaseContext';
import { useIntroChannel } from '../state/IntroChannel';
import { PATHS } from './paths';
import styles from './IntroRoute.module.css';

export function IntroRoute() {
  const navigate = useNavigate();
  const { introSeen, markIntroSeen, setPhase } = useAppPhase();
  const channel = useIntroChannel();

  // 이번 세션에 이미 봤다면 우주를 다시 열지 않는다.
  useEffect(() => {
    if (introSeen) navigate(PATHS.home, { replace: true });
  }, [introSeen, navigate]);

  const complete = useCallback(() => {
    markIntroSeen();
    setPhase('home');
    navigate(PATHS.home, { replace: true });
  }, [markIntroSeen, setPhase, navigate]);

  return (
    <main className={styles.root}>
      {/* DOM 상 문장보다 앞에 둬서 첫 Tab 이 건너뛰기에 닿게 한다 */}
      <SkipIntroButton onSkip={channel.requestSkip} />
      <IntroSequence onComplete={complete} />
    </main>
  );
}
