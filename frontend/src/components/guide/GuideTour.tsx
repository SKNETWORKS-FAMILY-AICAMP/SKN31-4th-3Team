/*
 * components/guide/GuideTour.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 튜토리얼.
 *
 * 네 개의 버튼이 있고, 각각이 무엇을 해야 하는지가 이 파일의 전부다.
 *
 *   다음          → 설명을 다 읽었다. 이어서 본다.
 *   건너뛰고 다음  → 이 분기는 관심 없다. 뒤따르는 단계까지 통째로 넘긴다.
 *   이전          → 방금 온 길을 되짚는다 (건너뛴 구간은 다시 밟지 않는다).
 *   그만두기      → 여기서 끝낸다. 다시 여는 법을 알려 주고 사라진다.
 *
 * ★ 가운데를 막지 않는다
 *   화면 한가운데서 무언가를 해 보라고 하면서 그 자리를 덮으면 안 된다.
 *   `stage` 단계는 차단막을 걷고 카드를 왼쪽 아래로 물린다.
 *
 * ★ 화면 이동은 단계에 들어설 때 한 번뿐
 *   계속 감시하면, 가입을 마치고 홈으로 나온 사람을 가입 화면으로 도로
 *   끌고 온다.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GUIDE_STEPS, stepMatchesPath } from '../../data/guideSteps';
import { useAuth } from '../../state/AuthContext';
import {
  placeCard,
  ringRect,
  veilPanels,
  type Placement,
  type Rect,
} from './anchorRect';
import { checkRequirement } from './requirement';
import styles from './GuideTour.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 카드가 실제로 그려지기 전에 쓰는 어림값. 첫 프레임에만 쓰인다. */
const ASSUMED_CARD = { width: 360, height: 240 };

/** 이만큼 움직였을 때만 다시 그린다. 소수점 떨림으로 매 프레임 렌더하지 않게. */
const MOVE_EPSILON = 0.5;

function readRect(selector: string | undefined): Rect | null {
  if (!selector || typeof document === 'undefined') return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.top - b.top) < MOVE_EPSILON &&
    Math.abs(a.left - b.left) < MOVE_EPSILON &&
    Math.abs(a.width - b.width) < MOVE_EPSILON &&
    Math.abs(a.height - b.height) < MOVE_EPSILON
  );
}

/** id 로 단계 번호를 찾는다. 없는 id 면 -1 — 시나리오 오타를 조용히 삼키지 않는다. */
function indexOfStep(id: string): number {
  return GUIDE_STEPS.findIndex((s) => s.id === id);
}

export function GuideTour({ open, onClose }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const signedIn = Boolean(user);

  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  /*
   * 채워야 넘어가는 단계에서 "다음"을 눌렀는데 비어 있을 때.
   *
   * `at` 은 흔들기 애니메이션을 다시 트는 용도다 — 같은 이유로 두 번
   * 막혔을 때 아무 반응이 없으면 버튼이 죽은 것처럼 보인다.
   */
  const [blocked, setBlocked] = useState<{ message: string; at: number } | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  /** 튜토리얼을 열기 직전에 포커스가 있던 곳. 닫을 때 돌려준다. */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  /*
   * 지나온 길.
   *
   * "이전"이 단순히 index-1 이면, 가입을 건너뛰고 온 사람이 이전을 눌렀을 때
   * 건너뛴 가입 화면으로 들어간다. 밟은 순서를 그대로 들고 있어야 한다.
   */
  const trailRef = useRef<number[]>([]);
  const indexRef = useRef(0);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  /*
   * 지금 이 사람에게 보여 줄 수 있는 단계인가.
   *
   * 로그인한 사람에게 "회원가입을 눌러 볼까요?"를 권하고, 눌렀더니
   * 로그인 화면이 열리는 것은 안내가 아니라 사고다.
   */
  const visible = useCallback(
    (i: number) => {
      const s = GUIDE_STEPS[i];
      if (!s) return false;
      if (s.when === 'signedOut' && signedIn) return false;
      return true;
    },
    [signedIn],
  );

  /**
   * "다음"이 지나갈 수 있는 단계인가.
   * 곁가지는 사용자가 직접 그 화면에 들어섰을 때만 열린다.
   */
  const inMainFlow = useCallback(
    (i: number) => visible(i) && GUIDE_STEPS[i]?.detour !== true,
    [visible],
  );

  const step = GUIDE_STEPS[index];
  const stage = step?.stage === true;

  /** 본 흐름의 단계 번호들. 진행 표시가 이것만 센다. */
  const mainFlow = useMemo(
    () => GUIDE_STEPS.map((_, i) => i).filter((i) => inMainFlow(i)),
    [inMainFlow],
  );
  const detour = step?.detour === true;
  const last = !detour && index === mainFlow[mainFlow.length - 1];

  // 열 때마다 처음부터. 지난번에 멈춘 자리에서 시작하면 앞부분을 볼 방법이 없다.
  useEffect(() => {
    if (!open) return;
    setIndex(mainFlow[0] ?? 0);
    trailRef.current = [];
    // 열 때 한 번이면 된다 — mainFlow 가 바뀌었다고 처음으로 되돌리면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /*
   * 단계에 들어설 때 한 번만 화면을 옮긴다.
   *
   * deps 에 현재 경로를 넣지 않는 것이 핵심이다. 넣으면 사용자가 스스로
   * 이동할 때마다 되돌려 놓는 감시자가 된다.
   */
  /** 가이드가 스스로 보낸 경로. 사용자가 옮긴 것과 구별하기 위해 표시해 둔다. */
  const sentToRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const current = GUIDE_STEPS[index];
    const route = current?.route;
    // 곁가지는 사용자가 이미 그 화면에 있어서 열린 것이다. 데려갈 일이 없다.
    if (!route || current.detour) return;
    if (window.location.pathname === route) return;
    sentToRef.current = route;
    // 계정 화면은 기본이 로그인 모드다 — 가입을 설명하는 단계는 가입 모드를 요청한다.
    navigate(route, current.routeState ? { state: current.routeState } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  /*
   * 대상을 매 프레임 따라간다.
   *
   * resize 이벤트만으로는 부족하다 — 라우트가 바뀌고, 청크가 늦게 도착하고,
   * 카드가 그려진 뒤 크기가 확정된다. 이 중 어느 것도 resize 를 내지 않는다.
   * 값이 실제로 바뀔 때만 setState 해서 매 프레임 렌더하지 않는다.
   */
  const frameRef = useRef(0);
  /** 경고가 떠 있는 동안에만 조건을 다시 본다 — 평소에는 한 번도 검사하지 않는다. */
  const blockedRef = useRef(false);
  blockedRef.current = blocked !== null;

  const measure = useCallback(() => {
    /*
     * 다 채우면 경고가 스스로 걷힌다.
     * 사용자가 칸을 채웠는데도 빨간 테두리가 남아 있으면, 채운 것이
     * 반영되지 않았다고 읽는다.
     */
    if (blockedRef.current && step?.require && step.anchor) {
      const el = document.querySelector(step.anchor);
      if (checkRequirement(step.require, el).ok) setBlocked(null);
    }

    const rect = readRect(step?.anchor);
    const vp = { width: window.innerWidth, height: window.innerHeight };
    const card = cardRef.current;
    const size = card ? { width: card.offsetWidth, height: card.offsetHeight } : ASSUMED_CARD;
    const nextPlacement = placeCard(rect, size, vp);

    setAnchor((prev) => (sameRect(prev, rect) ? prev : rect));
    setViewport((prev) => (prev.width === vp.width && prev.height === vp.height ? prev : vp));
    setPlacement((prev) =>
      prev &&
      Math.abs(prev.top - nextPlacement.top) < MOVE_EPSILON &&
      Math.abs(prev.left - nextPlacement.left) < MOVE_EPSILON &&
      prev.side === nextPlacement.side
        ? prev
        : nextPlacement,
    );
  }, [step?.anchor, step?.require]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const loop = () => {
      measure();
      frameRef.current = window.requestAnimationFrame(loop);
    };
    frameRef.current = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [open, measure]);

  // 카드로 포커스를 옮긴다. 스크린리더가 단계 내용을 읽을 수 있어야 한다.
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    return () => {
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  /** 지나온 길에 지금 자리를 남기고 목적지로 간다. */
  const goTo = useCallback(
    (to: number) => {
      if (to < 0 || to >= GUIDE_STEPS.length) {
        onClose();
        return;
      }
      // 단계를 옮기면 경고는 지난 이야기가 된다.
      setBlocked(null);
      trailRef.current.push(indexRef.current);
      indexRef.current = to;
      setIndex(to);
    },
    [onClose],
  );

  /** from 이상에서 본 흐름에 속하는 첫 단계. 없으면 -1. */
  const firstMainFrom = useCallback(
    (from: number) => {
      for (let i = Math.max(0, from); i < GUIDE_STEPS.length; i += 1) {
        if (inMainFlow(i)) return i;
      }
      return -1;
    },
    [inMainFlow],
  );

  /**
   * 다음 — 본 흐름의 바로 뒤 단계로.
   *
   * 건너뛸 대상이 둘이다. 로그인한 사람에게 뜨지 않는 가입 단계와,
   * 사용자가 직접 들어서야만 열리는 곁가지. 둘 다 여기서 넘어간다.
   *
   * ★ 채워야 넘어가는 단계에서는 여기서 멈춘다.
   *   멈추되 가두지는 않는다 — 건너뛰기는 그대로 열려 있다.
   */
  const next = useCallback(() => {
    const current = GUIDE_STEPS[indexRef.current];
    if (current?.require) {
      const el = current.anchor ? document.querySelector(current.anchor) : null;
      const result = checkRequirement(current.require, el);
      if (!result.ok) {
        // 같은 이유로 또 막혀도 다시 흔들리도록 매번 새 번호를 매긴다.
        setBlocked({ message: result.message, at: Date.now() });
        return;
      }
    }

    setBlocked(null);
    const to = firstMainFrom(indexRef.current + 1);
    if (to < 0) {
      onClose();
      return;
    }
    goTo(to);
  }, [firstMainFrom, goTo, onClose]);

  /** 건너뛰고 다음 — 이 분기가 끝나는 자리로. */
  const skip = useCallback(() => {
    const target = GUIDE_STEPS[indexRef.current]?.skipTo;
    const at = target ? indexOfStep(target) : -1;
    const to = firstMainFrom(at >= 0 ? at : indexRef.current + 1);
    if (to < 0) {
      onClose();
      return;
    }
    goTo(to);
  }, [firstMainFrom, goTo, onClose]);

  /*
   * ★ 사용자가 스스로 옮기면 안내가 따라간다.
   *
   * 튜토리얼이 정해 둔 길만 따라가면, 질문을 적어 답변 화면으로 넘어가는
   * 순간 안내는 홈의 입력창을 가리킨 채 멈춰 선다. 어디로 가든 그 자리에
   * 맞는 설명이 붙어야 한다.
   *
   * 찾는 순서:
   *  1) 지금보다 뒤에 있는, 그 화면을 담당하는 단계
   *  2) 없으면 곁가지 중에서 (구절 상세처럼 어디서든 열릴 수 있는 것)
   */
  useEffect(() => {
    if (!open) return;
    const path = location.pathname;

    // 가이드가 보낸 이동이면 따라갈 것이 없다.
    if (sentToRef.current === path) {
      sentToRef.current = null;
      return;
    }
    sentToRef.current = null;

    const cur = indexRef.current;
    const current = GUIDE_STEPS[cur];
    if (current && stepMatchesPath(current, path)) return;

    const forward = GUIDE_STEPS.findIndex(
      (s, i) => i > cur && visible(i) && stepMatchesPath(s, path),
    );
    if (forward >= 0) {
      goTo(forward);
      return;
    }

    const aside = GUIDE_STEPS.findIndex(
      (s, i) => s.detour === true && visible(i) && stepMatchesPath(s, path),
    );
    if (aside >= 0) goTo(aside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, location.pathname]);

  /** 이전 — 방금 온 길을 되짚는다. 건너뛴 구간은 다시 밟지 않는다. */
  const back = useCallback(() => {
    setBlocked(null);
    const from = trailRef.current.pop();
    if (from === undefined) return;
    indexRef.current = from;
    setIndex(from);
  }, []);

  /*
   * 가리킨 것을 실제로 누르면 다음으로.
   *
   * 구멍이 뚫려 있으므로 그 클릭은 원래 동작(가입 화면 열기, 하늘로 들어가기)도
   * 그대로 수행한다. 튜토리얼은 그 뒤를 따라갈 뿐 흐름을 가로채지 않는다.
   */
  useEffect(() => {
    if (!open || step?.advance !== 'interact' || !step.anchor) return;
    const selector = step.anchor;

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest?.(selector)) return;

      /*
       * ★ 이미 옮겨졌으면 손대지 않는다.
       *
       * 그 클릭은 화면 이동도 함께 일으킨다. 그러면 경로 반응이 먼저
       * 알맞은 단계로 옮겨 놓는데, 그 위에 이 핸들러가 한 번 더 "다음"을
       * 부르면 두 칸이 밀린다 — 가입에서 이름 설명이 통째로 사라지고
       * 유형 고르기부터 나오던 것이 이 때문이었다.
       */
      const at = indexRef.current;
      window.setTimeout(() => {
        if (indexRef.current === at) next();
      }, 60);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open, step?.advance, step?.anchor, next]);

  /*
   * 키보드.
   * Esc 는 그만두기, 좌우 화살표는 단계 이동.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, next, back]);

  if (!open || !step) return null;

  /*
   * 사용자의 행동을 기다리는 단계인가.
   *
   * 이 단계에서 "다음"을 눌러 넘어가면, 하지 않은 행동을 전제로 한
   * 설명이 이어진다. 회원가입을 누르지 않은 채 가입 폼 설명이 뜨는
   * 것이 바로 그 경우였다.
   */
  const awaitingAction = step.advance === 'interact' && Boolean(step.skipTo);

  const ring = anchor ? ringRect(anchor) : null;
  /*
   * 무대 단계에서는 차단막을 걷는다.
   * 화면 한가운데를 끌고 눌러 봐야 하는 단계이기 때문이다.
   */
  const panels = stage ? [] : veilPanels(ring, viewport);
  const canGoBack = trailRef.current.length > 0;

  return (
    <div className={styles.root} role="presentation">
      {panels.map((panel, i) => (
        <div
          key={i}
          className={styles.veil}
          aria-hidden="true"
          style={{
            top: `${panel.top}px`,
            left: `${panel.left}px`,
            width: `${panel.width}px`,
            height: `${panel.height}px`,
          }}
        />
      ))}

      {/*
        강조 링.
        테두리를 두르는 대신 빛이 스민 것처럼 보이게 한다. 무대 단계에서도
        가리킬 것이 있으면 링은 남긴다 — 막이 없어도 어디를 보라는 표시는
        있어야 한다.
      */}
      {ring && (
        <div
          /*
            key 로 blocked.at 을 준다.
            같은 이유로 두 번 막혔을 때 요소가 그대로면 애니메이션이 다시
            돌지 않아, 버튼이 죽은 것처럼 보인다. 새 key 는 곧 새 요소이고,
            새 요소는 애니메이션을 처음부터 다시 튼다.
          */
          key={blocked ? `blocked-${blocked.at}` : 'ring'}
          className={`${styles.ring} ${blocked ? styles.ringBlocked : ''}`}
          aria-hidden="true"
          style={{
            top: `${ring.top}px`,
            left: `${ring.left}px`,
            width: `${ring.width}px`,
            height: `${ring.height}px`,
          }}
        />
      )}

      <div
        ref={cardRef}
        className={`${styles.card} ${stage ? styles.stageCard : ''}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby="guide-title"
        aria-describedby="guide-body"
        tabIndex={-1}
        data-side={stage ? 'stage' : (placement?.side ?? 'center')}
        style={
          stage
            ? undefined
            : placement
              ? { top: `${placement.top}px`, left: `${placement.left}px` }
              : { visibility: 'hidden' }
        }
      >
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="둘러보기 그만두기"
        >
          <span aria-hidden="true">×</span>
        </button>

        <p className={styles.eyebrow}>{step.eyebrow}</p>
        <h2 className={styles.title} id="guide-title">
          {step.title}
        </h2>
        <p className={styles.body} id="guide-body">
          {step.body}
        </p>

        {/*
          권유 문구.
          설명과 다른 결로 둔다 — 읽을 것과 해 볼 것이 같은 모양이면
          사람은 둘 다 읽기만 한다.
        */}
        {step.action && (
          <p className={styles.action}>
            <span className={styles.actionMark} aria-hidden="true" />
            <span>{step.action}</span>
          </p>
        )}

        {/*
          경고.
          권유 문구를 대체하지 않고 그 아래에 붙는다 — 무엇을 해야 하는지는
          여전히 보여야 하고, 경고는 "아직 그게 안 됐다"는 덧말이다.
        */}
        {blocked && (
          <p key={blocked.at} className={styles.warn} role="alert">
            {blocked.message}
          </p>
        )}

        <div className={styles.footer}>
          {/*
            진행 표시는 본 흐름만 센다.
            곁가지는 사용자가 스스로 들른 자리이므로 "몇 번째"가 없다 —
            숫자를 붙이면 전체 개수가 사람마다 달라져 오히려 헷갈린다.
          */}
          <div className={styles.progress}>
            <ol className={styles.dots} aria-hidden="true">
              {mainFlow.map((i) => (
                <li
                  key={GUIDE_STEPS[i].id}
                  className={i === index ? styles.dotActive : styles.dot}
                />
              ))}
            </ol>
            <span className={styles.count}>
              {detour ? '잠깐 옆길' : `${mainFlow.indexOf(index) + 1} / ${mainFlow.length}`}
            </span>
          </div>

          <div className={styles.actions}>
            {canGoBack && (
              <button type="button" className={styles.quiet} onClick={back}>
                이전
              </button>
            )}

            {/*
              ★ 눌러야 넘어가는 단계에는 "다음"을 두지 않는다.
                길은 둘뿐이어야 한다 — 그 버튼을 누르거나, 이 분기를
                건너뛰거나. 셋째 길("다음")을 두면 회원가입을 누르지 않은
                채로 가입 폼 설명이 뜨고, 정작 화면에는 로그인 창이 떠
                아무것도 할 수 없게 된다.
            */}
            {awaitingAction ? (
              <button type="button" className={styles.next} onClick={skip}>
                건너뛰기
              </button>
            ) : (
              <>
                {step.skipTo && !last && (
                  <button type="button" className={styles.quiet} onClick={skip}>
                    건너뛰기
                  </button>
                )}
                <button type="button" className={styles.next} onClick={next}>
                  {last ? '시작하기' : '다음'}
                  {!last && (
                    <span className={styles.chevron} aria-hidden="true">
                      ›
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {!last && (
          <button type="button" className={styles.stop} onClick={onClose}>
            둘러보기 그만하기
          </button>
        )}
      </div>

      {/* 단계가 바뀐 것을 스크린리더에 알린다 */}
      <p className={styles.srOnly} role="status">
        {`둘러보기 ${index + 1}단계, 전체 ${GUIDE_STEPS.length}단계. ${step.title}. ${
          step.action ?? ''
        }`}
      </p>
    </div>
  );
}
