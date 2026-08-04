/*
 * components/intro/IntroSequence.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 창조 인트로의 텍스트 레이어.
 *
 * 별은 캔버스가, 문장은 DOM 이 담당한다. 문장을 DOM 에 두는 이유:
 *  - 스크린리더가 읽을 수 있다 (캔버스 텍스트는 읽히지 않는다)
 *  - 폰트 렌더링 품질과 한글 줄바꿈 규칙(keep-all)을 그대로 쓸 수 있다
 *
 * 성능: 불투명도는 초당 60회 바뀌므로 state 로 올리지 않고 DOM 스타일을
 * 직접 갱신한다. 문장이 교체되는 순간(총 4회)만 state 로 승격한다.
 */

import { useEffect, useRef, useState } from 'react';
import {
  CREATION_ATTRIBUTION,
  CREATION_BEATS,
  REDUCED_BEATS,
  SKIP_CROSSFADE,
} from '../../galaxy/introTimeline';
import { useGalaxy } from '../../state/GalaxyContext';
import { useIntroChannel } from '../../state/IntroChannel';
import styles from './IntroSequence.module.css';

interface Props {
  /** 인트로가 끝났을 때 (자연 종료·건너뛰기 공통) */
  onComplete: () => void;
}

export function IntroSequence({ onComplete }: Props) {
  const { reducedMotion } = useGalaxy();
  const channel = useIntroChannel();
  const lineRef = useRef<HTMLParagraphElement>(null);
  const [beatIndex, setBeatIndex] = useState(-1);
  const [leaving, setLeaving] = useState(false);

  const beats = reducedMotion ? REDUCED_BEATS : CREATION_BEATS;

  // 매 프레임: 불투명도는 DOM 직접 조작, 문장 교체만 state 갱신
  useEffect(() => {
    let currentIndex = -1;

    const unsubscribeFrame = channel.subscribeFrame(({ beatIndex: index, textOpacity }) => {
      if (index !== currentIndex) {
        currentIndex = index;
        setBeatIndex(index);
      }
      if (lineRef.current) {
        lineRef.current.style.opacity = textOpacity.toFixed(3);
      }
    });

    const unsubscribeDone = channel.subscribeDone(() => {
      setLeaving(true);
      // 0.5s 크로스페이드 후 홈으로. 뚝 끊기지 않게 한다.
      window.setTimeout(onComplete, SKIP_CROSSFADE * 1000);
    });

    return () => {
      unsubscribeFrame();
      unsubscribeDone();
    };
  }, [channel, onComplete]);

  // Esc / Enter 로도 건너뛸 수 있다.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        channel.requestSkip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [channel]);

  const line = beatIndex >= 0 ? beats[beatIndex] : null;

  return (
    <div className={`${styles.stage} ${leaving ? styles.leaving : ''}`}>
      {/*
        aria-live 로 문장을 순차 전달한다. 시각적 페이드와 무관하게
        스크린리더는 텍스트가 바뀌는 시점에 읽는다.
      */}
      <p
        ref={lineRef}
        className={styles.line}
        style={{ opacity: 0 }}
        aria-live="polite"
        aria-atomic="true"
      >
        {line?.text ?? ''}
      </p>

      {line && <p className={styles.attribution}>{CREATION_ATTRIBUTION}</p>}
    </div>
  );
}
