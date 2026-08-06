/*
 * components/galaxy/VerseListDialog.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 구절 목록 창. 사이드바의 "구절 목록" 항목을 누르면 화면 가운데 뜬다.
 *
 * ★ 왜 창인가
 *   ① 처음에는 별자리 화면 위에 판으로 떠 있었다. 그 화면의 주인공은
 *      하늘인데 판이 덮었고, 오른쪽 MBTI 레일과 자리를 다투느라 좁은
 *      화면에서 글자가 포개졌다.
 *   ② 사이드바 안에도 넣어 봤다. 겹침은 사라졌지만 지난 상담과 한 칸을
 *      나눠 쓰게 되어 대화 목록이 제목 두어 줄로 쪼그라들었다.
 *
 *   목록에는 넓이가 필요하고 사이드바는 좁다. 목록만 따로 넓게 띄우고,
 *   사이드바는 "어디로 갈까" 를 고르는 자리로 남긴다.
 *
 * ★ 고르면 닫고 날아간다
 *   창이 떠 있는 채로 카메라가 움직이면 1.6초 비행이 안 보인다.
 *   이 서비스에서 그 시간은 대기가 아니라 연출이다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALL_GALAXIES, CENTER_GALAXY, galaxySwatch } from '../../data/disciples';
import { useVerses } from '../../state/VersesContext';
import { StarKeyboardLayer } from './StarKeyboardLayer';
import styles from './VerseListDialog.module.css';

/**
 * 격자 한 줄에 놓이는 개수 — ↑↓ 이동 폭을 결정한다.
 * CSS 의 minmax 와 창 너비에서 나온 값이다. 어긋나면 ↓ 가 대각선으로
 * 움직이는 느낌이 된다.
 */
const COLUMNS = 3;

interface Props {
  open: boolean;
  onClose: () => void;
  /** 구절 하나를 고름 — 부모가 창을 닫고 그 별로 보낸다. */
  onPick: (starId: string) => void;
}

export function VerseListDialog({ open, onClose, onPick }: Props) {
  const { byGalaxy } = useVerses();
  /*
   * 펼쳐 볼 은하. 기본은 중심이다.
   *
   * ★ 닫아도 기억한다.
   *   요한의 구절을 훑다 잠깐 닫았을 때 중심 은하로 돌아가 있으면
   *   자리를 다시 찾아야 한다.
   */
  const [openGalaxyId, setOpenGalaxyId] = useState(CENTER_GALAXY.id);
  const panelRef = useRef<HTMLDivElement>(null);

  const stars = useMemo(() => byGalaxy.get(openGalaxyId) ?? [], [byGalaxy, openGalaxyId]);
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  if (!open) return null;

  return (
    <>
      {/* 바깥을 눌러 닫는다. 사이드바보다 짙게 — 이 창이 지금 주인공이다. */}
      <div className={styles.scrim} role="presentation" onPointerDown={close} />

      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="구절 목록"
        tabIndex={-1}
      >
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>구절 목록</h2>
            <p className={styles.lead}>
              별 하나가 성경 구절 하나입니다. 은하를 고른 뒤 방향키로 이동하고 Enter 로
              선택하세요.
            </p>
          </div>
          <button type="button" className={styles.close} onClick={close} aria-label="목록 닫기">
            ✕
          </button>
        </header>

        {/*
          은하 단위로 나눠 보여 준다.
          2,652개를 한 목록에 펼치면 키보드로는 끝까지 갈 수 없고 화면도
          무거워진다. 하늘에서 은하가 나뉘어 보이는 방식을 목록도 따른다.
        */}
        <div className={styles.tabs} role="tablist" aria-label="은하 선택">
          {ALL_GALAXIES.map((galaxy) => (
            <button
              key={galaxy.id}
              type="button"
              role="tab"
              aria-selected={galaxy.id === openGalaxyId}
              className={styles.tab}
              onClick={() => setOpenGalaxyId(galaxy.id)}
            >
              <span
                className={styles.swatch}
                style={{ backgroundColor: galaxySwatch(galaxy) }}
                aria-hidden="true"
              />
              {galaxy.name}
              <span className={styles.count}>{byGalaxy.get(galaxy.id)?.length ?? 0}</span>
            </button>
          ))}
        </div>

        <div className={styles.body}>
          {stars.length === 0 ? (
            <p className={styles.empty}>이 은하에는 아직 구절이 없습니다.</p>
          ) : (
            /*
              ★ 단순 목록이 아니라 StarKeyboardLayer 다.
                방향키 순회와 roving tabindex 가 여기 들어 있다. 한 번
                <ul> 로 바꿨다가 되돌렸다 — 목록이 이사한다고 접근성이
                이사에서 빠지면 안 된다.
            */
            <StarKeyboardLayer
              stars={stars}
              activeId={null}
              columns={COLUMNS}
              onHover={() => {}}
              onActivate={(star) => onPick(star.id)}
            />
          )}
        </div>
      </div>
    </>
  );
}
