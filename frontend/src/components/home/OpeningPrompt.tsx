/*
 * components/home/OpeningPrompt.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 오프닝 문구.
 *
 * 방문마다 풀에서 3~4개를 뽑아 느리게 교대시킨다.
 *
 * 두 가지를 지킨다:
 *  - 사용자가 입력을 시작하면 로테이션을 멈춘다. 글을 쓰는 중에 배경
 *    문구가 바뀌면 시선이 뺏긴다.
 *  - reduced-motion 에서는 교대하지 않고 첫 문구만 정적으로 둔다.
 */

import { useEffect, useRef, useState } from 'react';
import type { Opening } from '../../data/openings';
import { OPENING_ROTATION_MS } from '../../data/openings';
import { useGalaxy } from '../../state/GalaxyContext';
import styles from './OpeningPrompt.module.css';

interface Props {
  openings: readonly Opening[];
  /** 로테이션 정지 (사용자가 입력을 시작함) */
  paused: boolean;
  onChange?: (opening: Opening) => void;
  /**
   * 로그인한 사용자의 이름. 문구 위에 한 줄로 앉는다.
   *
   * ★ 문구를 대체하지 않고 그 위에 얹는다.
   *   오프닝 문구는 방문마다 달라지는 것이 의도다. 인사가 그 자리를
   *   차지하면 매번 같은 화면이 되어 버린다.
   *
   * ★ 로테이션과 함께 흐려지지 않는다.
   *   이름은 바뀌지 않으므로 문구가 교대할 때 같이 깜빡이면 어색하다.
   */
  greetingName?: string | null;
}

export function OpeningPrompt({ openings, paused, onChange, greetingName }: Props) {
  const { reducedMotion } = useGalaxy();
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const rotating = !paused && !reducedMotion && openings.length > 1;

  useEffect(() => {
    if (!rotating) return;

    const timer = window.setInterval(() => {
      // 페이드 아웃 → 교체 → 페이드 인. 글자가 뚝 바뀌지 않게.
      setFading(true);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % openings.length);
        setFading(false);
      }, 420);
    }, OPENING_ROTATION_MS);

    return () => window.clearInterval(timer);
  }, [rotating, openings.length]);

  const current = openings[index] ?? openings[0];

  useEffect(() => {
    if (current) onChangeRef.current?.(current);
  }, [current]);

  if (!current) return null;

  const name = greetingName?.trim();

  return (
    /*
      data-guide 는 인사 문구가 아니라 이 블록 전체에 붙인다.
      인사는 로그인해야 나타나므로, 그 요소를 가리키면 비로그인 상태에서는
      가리킬 것이 사라진다 — "여기에 이름이 앉습니다"를 설명할 자리가
      바로 그 비로그인 상태다.
    */
    <div className={styles.wrap} data-guide="greeting">
      {name && <p className={styles.greeting}>{name}님, 어서 오세요</p>}

      <h1 className={`${styles.headline} ${fading ? styles.fading : ''}`}>{current.headline}</h1>

      {rotating && (
        <ol className={styles.dots} aria-hidden="true">
          {openings.map((o, i) => (
            <li key={o.id} className={i === index ? styles.dotActive : styles.dot} />
          ))}
        </ol>
      )}
    </div>
  );
}
