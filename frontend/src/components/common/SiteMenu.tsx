/*
 * components/common/SiteMenu.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 전역 메뉴. 화면 왼쪽 위의 작대기 셋을 누르면 이동할 곳만 떠오른다.
 *
 * ★ 배경을 덮지 않는다
 *   보통의 드롭다운은 뒤에 투명한 판(scrim)을 깔고 바깥 클릭을 받는다.
 *   여기서는 그 판을 두지 않는다 — 은하수가 계속 보여야 하고, 판이 있으면
 *   메뉴를 연 동안 별을 누를 수 없게 되기 때문이다.
 *   대신 document 에서 바깥 클릭을 직접 듣는다.
 *
 * ★ 열려 있어도 뒤가 살아 있다
 *   메뉴 자신만 포인터를 받고, 그 바깥은 그대로 통과시킨다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MENU_ITEMS } from './siteMenuItems';
import styles from './SiteMenu.module.css';

export function SiteMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // 화면을 옮기면 닫는다 — 이동했는데 메뉴가 남아 있으면 어디에 있는지 흐려진다.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    /*
     * 바깥을 누르면 닫는다.
     * 덮는 판이 없으므로 이 리스너가 그 역할을 대신한다. pointerdown 을 쓰는
     * 이유는, click 까지 기다리면 그 사이에 캔버스가 드래그를 시작해 버려서다.
     */
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close(true);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
        onClick={() => setOpen((v) => !v)}
        data-guide="menu"
      >
        {/* 작대기 셋. 글자가 아니라 선이므로 폰트에 기대지 않는다. */}
        <span className={styles.bars} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open && (
        <nav id="site-menu" className={styles.panel} aria-label="주요 메뉴">
          <ul className={styles.list}>
            {MENU_ITEMS.map((item) => {
              const current = item.to === pathname;

              if (!item.to) {
                return (
                  <li key={item.id} className={styles.soon}>
                    <span className={styles.label}>{item.label}</span>
                    <span className={styles.hint}>{item.hint}</span>
                  </li>
                );
              }

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={styles.item}
                    aria-current={current ? 'page' : undefined}
                    onClick={() => {
                      close();
                      navigate(item.to!);
                    }}
                  >
                    <span className={styles.label}>{item.label}</span>
                    <span className={styles.hint}>{item.hint}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
