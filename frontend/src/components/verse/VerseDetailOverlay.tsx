/*
 * components/verse/VerseDetailOverlay.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 구절 상세 오버레이.
 *
 * 배경의 은하수를 덮지 않는다 — 아래쪽 시트로 올라오고 위쪽은 열려 있어
 * "별 앞에 서 있다"는 감각이 유지된다.
 *
 * 접근성:
 *  - 열리면 패널로 포커스를 옮기고, 닫히면 원래 요소로 돌려준다
 *  - Tab 이 패널 밖으로 나가지 않는다 (focus trap)
 *  - Esc 로 닫힌다
 *  - 배경 콘텐츠는 inert 처리해 스크린리더가 통과하지 않게 한다
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VerseStar } from '../../data/types';
import { formatRef } from '../../data/verses';
import { THEME_LABELS } from '../../data/intents';
import { galaxyLabel, galaxyOfVerse, galaxySwatch } from '../../data/disciples';
import { useRepositories } from '../../services/RepositoryProvider';
import { useAppPhase } from '../../state/AppPhaseContext';
import { useGalaxy } from '../../state/GalaxyContext';
import { Button } from '../common/Button';
import { MotifScene, MOTIF_LABELS } from './MotifScene';
import { counselPath } from '../../routes/paths';
import styles from './VerseDetailOverlay.module.css';

/** 포커스를 받을 수 있는 요소 선택자 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface Props {
  verseId: string;
  onClose: () => void;
}

export function VerseDetailOverlay({ verseId, onClose }: Props) {
  const navigate = useNavigate();
  const { verses } = useRepositories();
  const { focusStar } = useGalaxy();
  const { setPhase } = useAppPhase();

  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const [star, setStar] = useState<VerseStar | null>(null);
  const [loading, setLoading] = useState(true);

  // URL 로 직접 들어와도 카메라가 그 별을 찾아간다.
  useEffect(() => {
    focusStar(verseId);
    setPhase('verseDetail');
  }, [verseId, focusStar, setPhase]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    verses.getStar(verseId).then((s) => {
      if (cancelled) return;
      setStar(s);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [verseId, verses]);

  // 포커스 관리 + focus trap + Esc
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
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
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="verse-title"
        tabIndex={-1}
      >
        {loading && (
          <div className={styles.loading} role="status">
            <p className="u-muted">구절을 여는 중…</p>
          </div>
        )}

        {!loading && !star && (
          <div className={styles.missing}>
            <p className="u-title">찾을 수 없는 별입니다</p>
            <Button variant="ghost" onClick={onClose}>
              별자리로 돌아가기
            </Button>
          </div>
        )}

        {!loading && star && (
          <>
            <div className={styles.head}>
              <p className="u-eyebrow">{MOTIF_LABELS[star.motif]}</p>
              <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">
                ✕
              </button>
            </div>

            {/* 이 별이 어느 은하에 있는지 — 하늘에서 길을 잃지 않게 한다. */}
            {(() => {
              const galaxy = galaxyOfVerse(star.id);
              if (!galaxy) return null;
              return (
                <p className={styles.origin}>
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: galaxySwatch(galaxy) }}
                    aria-hidden="true"
                  />
                  {galaxyLabel(galaxy)}
                  <span className="u-muted"> · {galaxy.role}</span>
                </p>
              );
            })()}

            <MotifScene motif={star.motif} />

            {/*
              인용이 있는 별과 없는 별을 다르게 보여 준다.
              brief 구절에 빈 인용 틀을 남겨 두면 "데이터가 빠졌다"로 읽힌다 —
              아예 요약을 본문 자리에 놓고, 원문은 성경에서 보도록 안내한다.
            */}
            {star.depth === 'full' ? (
              <blockquote className={styles.quote}>
                <p className="u-verse" id="verse-title">
                  {star.excerpt}
                </p>
                <cite className={styles.ref}>
                  {formatRef(star)} · {star.attribution}
                </cite>
              </blockquote>
            ) : (
              <blockquote className={styles.quote}>
                <p className="u-verse" id="verse-title">
                  {star.summary}
                </p>
                <cite className={styles.ref}>{formatRef(star)}</cite>
              </blockquote>
            )}

            {star.depth === 'full' && (
              <>
                <section className={styles.section}>
                  <h2 className="u-eyebrow">이 구절의 자리</h2>
                  <p className="u-body">{star.story}</p>
                </section>

                <section className={styles.section}>
                  <h2 className="u-eyebrow">묵상</h2>
                  <p className="u-body">{star.meditation}</p>
                </section>
              </>
            )}

            {star.depth === 'brief' && (
              <p className={styles.note}>
                이 별은 아직 짧은 안내만 담고 있습니다. 본문은 가지고 계신 성경에서 펼쳐
                보시고, 이어지는 이야기는 아래에서 나눠 주세요.
              </p>
            )}

            <ul className={styles.tags} aria-label="주제">
              {star.themes.map((theme) => (
                <li key={theme} className={styles.tag}>
                  {THEME_LABELS[theme]}
                </li>
              ))}
            </ul>

            <div className={styles.actions}>
              <Button
                variant="primary"
                onClick={() => navigate(counselPath({ from: star.id }))}
              >
                상담 이어가기
              </Button>
              <Button variant="quiet" onClick={onClose}>
                별자리로 돌아가기
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
