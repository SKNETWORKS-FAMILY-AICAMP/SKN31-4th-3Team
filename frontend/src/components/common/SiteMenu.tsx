/*
 * components/common/SiteMenu.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 전역 사이드바. 왼쪽 위 작대기 셋을 누르면 왼쪽에서 밀려 나온다.
 *
 *   위    이동할 곳 (HOME · 별자리)
 *   가운데 구절 목록 · 지난 상담
 *   아래  톱니바퀴(환경설정)와 계정
 *
 * ★ 구절 목록이 왜 여기 있는가
 *   예전에는 별자리 화면 위에 판으로 떠 있었다. 그 화면의 주인공은
 *   하늘인데 판이 그 위를 덮었고, 오른쪽 MBTI 레일과 자리를 다투느라
 *   좁은 화면에서 글자가 포개졌다.
 *
 *   "찾아갈 곳" 이라는 점에서 구절 목록과 지난 상담은 같은 성격이다.
 *   한자리에 모으면 화면은 하늘만 보여 주면 된다.
 *
 * ★ 배경 위에 겹친다. 화면을 밀지 않는다
 *   화면을 오른쪽으로 밀면 캔버스도 함께 밀려 카메라 구도가 틀어진다.
 *   은하수가 제자리에 있어야 "사이드바를 잠깐 열었다" 로 읽힌다.
 *
 * ★ 뒤를 완전히 덮지는 않는다
 *   덮는 판(scrim)은 아주 옅게만 깐다. 별이 계속 보여야 하고, 판이 짙으면
 *   메뉴를 여는 순간 앱이 다른 화면으로 넘어간 것처럼 보인다.
 *   다만 판은 포인터를 받는다 — 바깥을 눌러 닫는 가장 흔한 동작이다.
 *
 * ★ 열려 있는 동안 포커스를 가둔다
 *   Tab 이 뒤의 화면으로 새어 나가면, 보이지 않는 버튼에 포커스가 가서
 *   키보드 사용자는 자기가 어디 있는지 알 수 없게 된다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ALL_GALAXIES, CENTER_GALAXY, galaxySwatch, getGalaxy } from '../../data/disciples';
import { PATHS, counselPath, skyPath } from '../../routes/paths';
import { useAuth } from '../../state/AuthContext';
import { useThreads } from '../../state/ThreadsContext';
import { useVerses } from '../../state/VersesContext';
import { StarKeyboardLayer } from '../galaxy/StarKeyboardLayer';
import { MENU_ITEMS } from './siteMenuItems';
import styles from './SiteMenu.module.css';

/** 포커스를 받을 수 있는 요소 선택자 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function SiteMenu() {
  const [open, setOpen] = useState(false);
  /** 지우기 전에 한 번 더 묻는 대화방. null 이면 묻는 중이 아니다. */
  const [confirming, setConfirming] = useState<string | null>(null);

  /*
   * 목록에서 펼쳐 볼 은하. 기본은 중심이다.
   *
   * ★ 열 때마다 되돌리지 않는다.
   *   사이드바는 자주 여닫는다. 매번 중심 은하로 돌아가면, 요한의
   *   구절을 훑다 잠깐 닫았을 때 자리를 다시 찾아야 한다.
   */
  const [openGalaxyId, setOpenGalaxyId] = useState(CENTER_GALAXY.id);

  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { user } = useAuth();
  const { threads, loading, refresh, remove } = useThreads();
  const { byGalaxy } = useVerses();

  const openGalaxyStars = useMemo(
    () => byGalaxy.get(openGalaxyId) ?? [],
    [byGalaxy, openGalaxyId],
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setConfirming(null);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // 화면을 옮기면 닫는다 — 이동했는데 사이드바가 남아 있으면 어디 있는지 흐려진다.
  useEffect(() => {
    setOpen(false);
    setConfirming(null);
  }, [pathname, search]);

  // 열 때마다 목록을 다시 읽는다. 대화가 늘었는데 옛 목록이 뜨면 안 된다.
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];

      // 패널 밖으로 나가려 하면 반대쪽 끝으로 돌린다.
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const openThread = (id: string) => {
    close();
    navigate(counselPath({ thread: id }));
  };

  /*
   * 목록에서 구절을 고르면 사이드바를 닫고 그 별로 날아간다.
   *
   * ★ 사이드바를 먼저 닫는다.
   *   카메라가 1.6초 동안 날아가는데 사이드바가 그 위를 덮고 있으면
   *   비행이 안 보인다. 이 서비스에서 그 1.6초는 연출이지 대기가 아니다.
   */
  const openStar = (starId: string) => {
    close();
    navigate(skyPath(starId, { travel: true }));
  };

  return (
    <>
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
        <>
          {/* 바깥을 눌러 닫는다. 아주 옅어서 별이 계속 보인다. */}
          <div className={styles.scrim} role="presentation" onPointerDown={() => close()} />

          <div
            id="site-menu"
            ref={panelRef}
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label="메뉴와 지난 상담"
            tabIndex={-1}
          >
            <nav className={styles.top} aria-label="주요 메뉴">
              <ul className={styles.list}>
                {MENU_ITEMS.filter((item) => item.id !== 'settings').map((item) => {
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
                        aria-current={item.to === pathname ? 'page' : undefined}
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

            <section className={styles.verses} aria-label="구절 목록">
              <p className={styles.sectionTitle}>구절 목록</p>

              {/*
                은하 단위로 나눠 보여 준다.
                2,652개를 한 목록에 펼치면 키보드로는 끝까지 갈 수 없고
                화면도 무거워진다. 하늘에서 은하가 나뉘어 보이는 방식을
                목록도 그대로 따른다.
              */}
              <div className={styles.galaxyTabs} role="tablist" aria-label="은하 선택">
                {ALL_GALAXIES.map((galaxy) => (
                  <button
                    key={galaxy.id}
                    type="button"
                    role="tab"
                    aria-selected={galaxy.id === openGalaxyId}
                    className={styles.galaxyTab}
                    onClick={() => setOpenGalaxyId(galaxy.id)}
                  >
                    <span
                      className={styles.tabSwatch}
                      style={{ backgroundColor: galaxySwatch(galaxy) }}
                      aria-hidden="true"
                    />
                    {galaxy.name}
                    <span className={styles.tabCount}>
                      {byGalaxy.get(galaxy.id)?.length ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              {openGalaxyStars.length === 0 ? (
                <p className={styles.empty}>이 은하에는 아직 구절이 없습니다.</p>
              ) : (
                /*
                  ★ 단순 목록이 아니라 StarKeyboardLayer 를 그대로 쓴다.
                    방향키 순회와 roving tabindex 가 여기 들어 있다.
                    옮기면서 <ul> 로 바꿨다가 되돌렸다 — 목록이 이사한다고
                    접근성이 함께 이사에서 빠지면 안 된다.

                  ★ columns={1} 이다.
                    사이드바는 좁아서 한 줄에 하나씩 선다. 3 으로 두면
                    ↓ 키가 세 칸씩 건너뛰어 화면과 손이 어긋난다.
                */
                <StarKeyboardLayer
                  stars={openGalaxyStars}
                  activeId={null}
                  columns={1}
                  onHover={() => {}}
                  onActivate={(star) => openStar(star.id)}
                />
              )}
            </section>

            <section className={styles.threads} aria-label="지난 상담">
              <p className={styles.sectionTitle}>지난 상담</p>

              {loading && (
                <p className={styles.empty} role="status">
                  불러오는 중…
                </p>
              )}

              {!loading && threads.length === 0 && (
                <p className={styles.empty}>
                  {user || threads.length > 0
                    ? '아직 나눈 이야기가 없습니다.'
                    : '이야기를 시작하면 여기에 남습니다.'}
                </p>
              )}

              <ul className={styles.threadList}>
                {threads.map((thread) => {
                  const galaxy = thread.personaId ? getGalaxy(thread.personaId) : undefined;
                  const asking = confirming === thread.id;

                  return (
                    <li key={thread.id} className={styles.thread}>
                      <button
                        type="button"
                        className={styles.threadOpen}
                        onClick={() => openThread(thread.id)}
                      >
                        <span className={styles.threadTitle}>{thread.title}</span>
                        {galaxy && <span className={styles.threadWho}>{galaxy.name}</span>}
                      </button>

                      {/*
                        ★ 지우기는 한 번 더 묻는다.
                          되돌릴 수 없는 일이고, 목록에서 손가락이 미끄러지기
                          쉬운 자리다. 다만 창을 띄우지는 않는다 — 그 자리에서
                          문구만 바뀌는 편이 흐름을 덜 끊는다.
                      */}
                      {asking ? (
                        <span className={styles.confirm}>
                          <button
                            type="button"
                            className={styles.confirmYes}
                            onClick={() => {
                              setConfirming(null);
                              void remove(thread.id);
                            }}
                          >
                            지우기
                          </button>
                          <button
                            type="button"
                            className={styles.confirmNo}
                            onClick={() => setConfirming(null)}
                          >
                            취소
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.threadRemove}
                          aria-label={`${thread.title} 대화 나가기`}
                          onClick={() => setConfirming(thread.id)}
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className={styles.bottom}>
              <button
                type="button"
                className={styles.gear}
                aria-label="환경설정"
                aria-current={pathname === PATHS.settings ? 'page' : undefined}
                onClick={() => {
                  close();
                  navigate(PATHS.settings);
                }}
              >
                <GearIcon />
                <span>환경설정</span>
              </button>

              <button
                type="button"
                className={styles.account}
                onClick={() => {
                  close();
                  navigate(user ? PATHS.account : PATHS.auth);
                }}
              >
                {user ? `${user.username}님` : '로그인'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** 톱니바퀴. 아이콘 폰트를 들이지 않고 선으로 그린다. */
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
