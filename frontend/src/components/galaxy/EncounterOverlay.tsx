/*
 * components/galaxy/EncounterOverlay.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 조우 — 별이 상징으로 모인 뒤 건네는 한 줄.
 *
 * ★ 별이 모이는 동안에는 아무 글도 띄우지 않는다
 *   그 구간에서 보여 주려는 것은 형태다. 글이 먼저 뜨면 눈이 글로 가고,
 *   정작 상징이 만들어지는 순간을 아무도 안 본다.
 *
 * ★ 캔버스에 그리지 않는 이유
 *   글자를 캔버스에 그리면 폰트·대비·줄바꿈·스크린리더를 전부 따로
 *   관리해야 한다. DOM 으로 얹으면 role="status" 하나로 보조기기에도
 *   같은 정보가 간다.
 */

import { useEffect, useRef } from 'react';
import { getGalaxy } from '../../data/disciples';
import { emblemOf } from '../../data/emblems';
import { useEncounter } from '../../state/EncounterContext';
import { Button } from '../common/Button';
import styles from './EncounterOverlay.module.css';

export function EncounterOverlay() {
  const { galaxyId, stage, actionLabel, proceed } = useEncounter();
  const buttonRef = useRef<HTMLButtonElement>(null);

  /*
   * ★ 버튼으로 포커스를 옮긴다.
   *   키보드 사용자에게는 이 버튼이 지금 화면의 유일한 할 일이다.
   *   포커스를 주지 않으면 Tab 을 몇 번 눌러야 닿는지 알 수 없다.
   */
  useEffect(() => {
    if (stage === 'greeting') buttonRef.current?.focus();
  }, [stage]);

  /*
   * Esc 로도 넘어간다.
   *
   * ★ 아무 데나 눌러 넘기던 것은 뺐다.
   *   버튼이 생긴 이상 "누르는 곳"이 두 군데면 어느 쪽이 진짜인지
   *   헷갈리고, 무엇보다 뒤의 하늘을 돌려 보려고 끌 때마다 넘어가 버린다.
   */
  useEffect(() => {
    if (!stage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') proceed();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [stage, proceed]);

  // 모이는 동안에는 화면을 비운다 — 형태가 주인공인 구간이다.
  if (stage !== 'greeting' || !galaxyId) return null;

  const galaxy = getGalaxy(galaxyId);
  const emblem = emblemOf(galaxyId);
  if (!galaxy || !emblem) return null;

  return (
    /*
     * ★ 레이어는 포인터를 통과시킨다 (CSS 의 pointer-events: none).
     *   글이 뜬 동안에도 뒤의 하늘을 끌어 돌려 볼 수 있어야 한다.
     *   눌러야 하는 것은 카드 안의 버튼 하나뿐이다.
     */
    <div className={styles.layer}>
      <div className={styles.card} role="status" aria-live="polite">
        <div className={styles.thread} aria-hidden="true" />
        <p className={styles.name}>
          {galaxy.name}
          <span className={styles.symbol}>{emblem.symbol}</span>
        </p>
        <p className={styles.basis}>{emblem.basis}</p>
        <p className={styles.greeting}>{emblem.greeting}</p>
        <div className={styles.action}>
          <Button ref={buttonRef} variant="primary" onClick={proceed}>
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
