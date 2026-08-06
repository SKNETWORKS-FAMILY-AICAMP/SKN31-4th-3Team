/*
 * components/galaxy/StarKeyboardLayer.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 별의 키보드·스크린리더 인터페이스.
 *
 * 캔버스의 별은 DOM 요소가 아니라 픽셀이다. 마우스 사용자는 클릭할 수 있지만
 * 키보드와 스크린리더 사용자에게는 존재하지 않는 것이나 마찬가지다.
 * 이 레이어가 같은 별들을 listbox 로 노출해 그 격차를 메운다.
 *
 * 조작:
 *  - Tab 으로 목록에 진입 (roving tabindex — 목록 전체가 탭 스톱 하나)
 *  - ←→↑↓ 로 별 사이 이동, Home/End 로 처음·끝
 *  - Enter/Space 로 선택
 *
 * ★ aria-activedescendant 는 쓰지 않는다.
 *   그건 "컨테이너가 포커스를 갖고 자식은 갖지 않는" 반대 패턴이다.
 *   두 패턴을 섞으면 스크린리더가 현재 위치를 이중으로 읽는다.
 *   여기서는 실제 포커스가 항목으로 이동하므로 aria-selected 로 충분하다.
 */

import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import type { VerseStar } from '../../data/types';
import { formatRef } from '../../data/verses';
import { THEME_LABELS } from '../../data/intents';
import { galaxyLabel, galaxyOfStar, galaxySwatch } from '../../data/disciples';
import styles from './StarKeyboardLayer.module.css';

interface Props {
  stars: readonly VerseStar[];
  /** 현재 활성 별 (카메라가 보고 있는 별) */
  activeId: string | null;
  onActivate: (star: VerseStar) => void;
  onHover: (starId: string | null) => void;
  /** 격자 한 줄에 놓이는 개수 — ↑↓ 이동 폭을 결정한다 */
  columns: number;
}

export function StarKeyboardLayer({ stars, activeId, onActivate, onHover, columns }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  // roving tabindex 의 커서. 포커스가 목록을 떠나도 위치를 기억한다.
  const cursorRef = useRef(0);

  const activeIndex = stars.findIndex((s) => s.id === activeId);
  if (activeIndex >= 0) cursorRef.current = activeIndex;

  const focusAt = useCallback((index: number) => {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>('button');
    if (!items || items.length === 0) return;
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    cursorRef.current = clamped;
    items[clamped]?.focus();
  }, []);

  // 카메라가 다른 별로 이동하면 포커스도 따라간다 (외부에서 선택된 경우).
  useEffect(() => {
    if (activeIndex < 0) return;
    const active = document.activeElement;
    if (listRef.current?.contains(active)) focusAt(activeIndex);
  }, [activeIndex, focusAt]);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>, index: number) => {
    const last = stars.length - 1;
    let next: number | null = null;

    switch (e.key) {
      case 'ArrowRight':
        next = Math.min(index + 1, last);
        break;
      case 'ArrowLeft':
        next = Math.max(index - 1, 0);
        break;
      case 'ArrowDown':
        next = Math.min(index + columns, last);
        break;
      case 'ArrowUp':
        next = Math.max(index - columns, 0);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }

    e.preventDefault();
    focusAt(next);
    // 이동만 해도 해당 별이 하늘에서 은은하게 강조된다.
    onHover(stars[next].id);
  };

  return (
    <ul
      ref={listRef}
      className={styles.grid}
      role="listbox"
      aria-label={`구절 별 ${stars.length}개`}
    >
      {stars.map((star, index) => {
        const selected = star.id === activeId;
        const galaxy = galaxyOfStar(star);
        return (
          <li key={star.id} role="none">
            <button
              type="button"
              id={`star-${star.id}`}
              role="option"
              aria-selected={selected}
              // roving tabindex: 커서 위치의 항목만 탭 스톱이 된다
              tabIndex={index === cursorRef.current ? 0 : -1}
              className={styles.star}
              onKeyDown={(e) => onKeyDown(e as unknown as KeyboardEvent<HTMLUListElement>, index)}
              onFocus={() => {
                cursorRef.current = index;
                onHover(star.id);
              }}
              onBlur={() => onHover(null)}
              onMouseEnter={() => onHover(star.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onActivate(star)}
            >
              {galaxy && (
                /* 어느 은하의 별인지 — 하늘의 색과 목록의 이름을 잇는다 */
                <span className={styles.galaxy}>
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: galaxySwatch(galaxy) }}
                    aria-hidden="true"
                  />
                  {galaxyLabel(galaxy)}
                </span>
              )}
              <span className={styles.ref}>{formatRef(star)}</span>
              {/* brief 구절은 인용이 없으므로 자체 요약을 대신 읽힌다 */}
              <span className={styles.excerpt}>
                {star.depth === 'full' ? star.excerpt : star.summary}
              </span>
              <span className={styles.tags}>
                {star.themes.map((t) => THEME_LABELS[t]).join(' · ')}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
