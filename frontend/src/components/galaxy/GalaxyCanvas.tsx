/*
 * components/galaxy/GalaxyCanvas.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 은하수 영속 레이어. GalaxyEngine 과 React 를 잇는 얇은 브리지다.
 *
 * ★ 이 컴포넌트는 라우터 바깥에 있으며 절대 언마운트되지 않는다.
 *   엔진 인스턴스도 마운트당 하나만 만들어지고, 상태 변화는 update() 로만
 *   전달된다 (루프를 재시작하지 않는다).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateBackdrop } from '../../data/backdrop';
import { useVerses } from '../../state/VersesContext';
import { galaxyLabel, galaxySwatch, getGalaxy } from '../../data/disciples';
import { GalaxyEngine } from '../../galaxy/GalaxyEngine';
import { useGalaxy } from '../../state/GalaxyContext';
import { useAppPhase } from '../../state/AppPhaseContext';
import { useEncounter } from '../../state/EncounterContext';
import { EncounterOverlay } from './EncounterOverlay';
import { useIntroChannel } from '../../state/IntroChannel';
import styles from './GalaxyCanvas.module.css';

/**
 * 이 거리(px)를 넘게 끌면 클릭이 아니라 드래그로 본다.
 * 값이 작으면 손 떨림에 클릭이 먹히고, 크면 드래그가 늦게 시작된다.
 */
const DRAG_THRESHOLD = 5;

interface Props {
  /**
   * 별을 직접 누를 수 있는가.
   * 홈·인트로에서는 배경으로만 두고, 탐색 화면에서만 켠다.
   */
  interactive?: boolean;
  onPickStar?: (starId: string) => void;
  /** 별이 아닌 은하를 눌렀을 때 — 그 은하가 화면 중앙으로 온다 */
  onPickGalaxy?: (galaxyId: string) => void;
  /** 카메라가 목표 별에 도착했을 때 */
  onArrive?: (starId: string) => void;
  /** 카메라가 목표 은하에 도착했을 때 */
  onArriveGalaxy?: (galaxyId: string) => void;
}

export function GalaxyCanvas({
  interactive = false,
  onPickStar,
  onPickGalaxy,
  onArrive,
  onArriveGalaxy,
}: Props) {
  const { stars, byId } = useVerses();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GalaxyEngine | null>(null);
  const [pointerOverStar, setPointerOverStar] = useState(false);
  const [canvasUnsupported, setCanvasUnsupported] = useState(false);
  /** 이름표 위치 — 포인터를 따라간다 */
  const [labelAt, setLabelAt] = useState<{ x: number; y: number } | null>(null);

  /*
   * 드래그 상태는 ref 에 둔다.
   * 포인터가 움직일 때마다 리렌더하면 프레임마다 React 트리가 흔들린다 —
   * 카메라는 엔진이 직접 돌리므로 React 는 알 필요가 없다.
   */
  const dragRef = useRef<{ id: number; x: number; y: number; moved: number } | null>(null);

  const {
    quality,
    focusStarId,
    hoverStarId,
    hoverGalaxyId,
    setHoverGalaxyId,
    focusGalaxyId,
    affinityGalaxyIds,
    reducedMotion,
    degradeQuality,
    setHoverStarId,
  } = useGalaxy();
  const { introSeen } = useAppPhase();
  const channel = useIntroChannel();
  const { galaxyId: encounterGalaxyId, formed } = useEncounter();

  const hoverGalaxy = useMemo(
    () => (hoverGalaxyId ? getGalaxy(hoverGalaxyId) : undefined),
    [hoverGalaxyId],
  );

  const backdrop = useMemo(() => generateBackdrop(quality.backdropCount), [quality.backdropCount]);

  // 콜백은 ref 로 흘려보낸다 — 엔진을 재생성하지 않기 위해서다.
  const arriveRef = useRef<((starId: string) => void) | undefined>(undefined);
  arriveRef.current = onArrive;
  const arriveGalaxyRef = useRef<((galaxyId: string) => void) | undefined>(undefined);
  arriveGalaxyRef.current = onArriveGalaxy;
  const formedRef = useRef<(galaxyId: string) => void>(formed);
  formedRef.current = formed;

  // 엔진은 마운트당 한 번만 만든다. 이후 변화는 전부 update() 로 흘려보낸다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: GalaxyEngine;
    try {
      engine = new GalaxyEngine(
      canvas,
      {
        backdrop,
        curated: stars,
        quality,
        reducedMotion,
        // 이번 세션에 인트로를 이미 봤다면 완성된 성운에서 시작한다.
        mode: introSeen ? 'settled' : 'intro',
        focusStarId,
        hoverStarId,
      },
      {
        onIntroFrame: channel.publishFrame,
        onIntroDone: channel.publishDone,
        // 자동 모드일 때만 듣는다 — 직접 고정한 값을 뒤에서 바꾸지 않는다.
        onPerformanceDrop: degradeQuality,
        onArrive: (starId) => arriveRef.current?.(starId),
        onArriveGalaxy: (galaxyId) => arriveGalaxyRef.current?.(galaxyId),
        onEmblemFormed: (galaxyId) => formedRef.current(galaxyId),
      },
    );

    } catch {
      // Canvas 2D 를 못 쓰는 환경(구형 브라우저, 일부 임베드)에서는
      // CSS 성운 배경만 남기고 조용히 물러난다. 앱은 계속 동작한다.
      setCanvasUnsupported(true);
      return;
    }

    engineRef.current = engine;
    channel.registerSkip(() => engine.skipIntro());
    engine.start();

    const observer = new ResizeObserver(() => engine.resize());
    observer.observe(canvas);

    // 탭이 가려지면 루프를 멈춘다 (배터리).
    const onVisibility = () => {
      if (document.hidden) engine.destroy();
      else engine.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
    // 의도적으로 마운트 시 1회만 실행한다. 이후 값 변경은 아래 effect 들이 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 별 개수가 바뀌면(티어 강등) 버퍼만 다시 만든다.
  useEffect(() => {
    engineRef.current?.setBackdrop(backdrop);
  }, [backdrop]);

  // 먼지 개수도 티어를 따라간다.
  useEffect(() => {
    engineRef.current?.setDustCount(quality.dustCount);
  }, [quality.dustCount]);

  useEffect(() => {
    engineRef.current?.update({
      quality,
      focusStarId,
      hoverStarId,
      hoverGalaxyId,
      focusGalaxyId,
      affinityGalaxyIds,
      reducedMotion,
      emblemGalaxyId: encounterGalaxyId,
    });
  }, [
    quality,
    focusStarId,
    hoverStarId,
    hoverGalaxyId,
    focusGalaxyId,
    affinityGalaxyIds,
    reducedMotion,
    encounterGalaxyId,
  ]);

  /*
   * 포인터 패럴랙스.
   * 터치 기기(coarse pointer)와 reduced-motion 에서는 아예 리스너를 달지 않는다.
   * — 터치에서는 손가락이 화면을 가리고, 모션 축소 사용자에게는 불필요한 움직임이다.
   */
  useEffect(() => {
    if (reducedMotion) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const onPointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      engineRef.current?.setPointer(nx, ny);
    };
    // 포인터가 창을 벗어나면 중앙으로 되돌린다.
    const onPointerLeave = () => engineRef.current?.setPointer(0, 0);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [reducedMotion]);

  /*
   * 별 픽킹.
   * 캔버스의 별은 DOM 요소가 아니므로 좌표로 히트테스트한다.
   * 키보드·스크린리더 사용자는 SkyRoute 의 별 목록으로 같은 별에 도달한다.
   */
  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!interactive) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      /*
       * 드래그 중이면 시점만 돌린다.
       * 화면 크기로 나눠 넘기므로 창 크기와 무관하게 감도가 같다.
       */
      const drag = dragRef.current;
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;

        if (drag.moved > DRAG_THRESHOLD) {
          engineRef.current?.drag(-dx / rect.width, -dy / rect.height);
          // 시점을 돌리는 동안에는 호버 강조를 끈다 — 초점이 둘이 되면 산만하다.
          setHoverStarId(null);
          setHoverGalaxyId(null);
          setLabelAt(null);
        }
        return;
      }

      const engine = engineRef.current;
      const star = engine?.pickAt(x, y) ?? null;
      setPointerOverStar(Boolean(star));
      setHoverStarId(star);

      /*
       * 은하 이름은 별 위에서도 유지한다.
       *
       * 별에 올리는 순간 이름이 사라지면 "지금 어느 은하를 보고 있는지"라는
       * 정보가 가장 필요한 순간에 없어진다. 별은 은하 안에 있으므로,
       * 별을 가리켰다면 그 별이 속한 은하를 가리킨 것이기도 하다.
       */
      /*
       * ★ 엔진은 별 id 만 돌려준다.
       *   정적 표(galaxyOfVerse)로 찾으면 성경전서에서 올라온 별은
       *   그 표에 없어서 은하 이름이 사라진다. 문맥의 byId 로 찾는다.
       */
      const galaxy = star
        ? (byId.get(star)?.discipleId ?? null)
        : (engine?.pickGalaxyAt(x, y) ?? null);
      setHoverGalaxyId(galaxy);
      setLabelAt(galaxy ? { x, y } : null);
    },
    [interactive, setHoverStarId, setHoverGalaxyId, byId],
  );

  const handleDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!interactive) return;
      /*
       * ★ 브라우저의 기본 동작(텍스트 선택 시작)을 막는다.
       *   막지 않으면 시점을 돌릴 때마다 페이지 전체 글자가 선택되어
       *   흰 블록으로 덮인다. CSS 의 user-select 만으로는 부족하다 —
       *   포인터 캡처 중에도 선택이 문서 바깥으로 번지기 때문이다.
       */
      e.preventDefault();
      dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [interactive],
  );

  /**
   * 손을 뗐을 때만 선택으로 본다.
   * 끌었다면 시점을 돌린 것이므로 아무것도 열지 않는다 — 시점을 맞추다가
   * 구절이 열려 버리면 탐색 자체가 불가능해진다.
   */
  const handleUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!interactive) return;
      const drag = dragRef.current;
      dragRef.current = null;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      if (drag && drag.moved > DRAG_THRESHOLD) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const engine = engineRef.current;

      const star = engine?.pickAt(x, y);
      if (star) {
        onPickStar?.(star);
        return;
      }

      const galaxy = engine?.pickGalaxyAt(x, y);
      if (galaxy) onPickGalaxy?.(galaxy);
    },
    [interactive, onPickStar, onPickGalaxy],
  );

  return (
    <div
      className={[
        styles.layer,
        interactive ? styles.interactive : '',
        canvasUnsupported ? styles.fallback : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label={`성경 구절로 이루어진 은하수. 탐색 가능한 구절 ${stars.length}개가 빛나고 있습니다.`}
        style={interactive ? { cursor: pointerOverStar ? 'pointer' : 'grab' } : undefined}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerLeave={() => {
          dragRef.current = null;
          setPointerOverStar(false);
          setHoverStarId(null);
          setHoverGalaxyId(null);
          setLabelAt(null);
        }}
        onPointerUp={handleUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />

      {/*
        은하 이름표.
        캔버스 위에 DOM 으로 얹는다 — 캔버스에 글자를 그리면 폰트·대비·
        스크린리더를 전부 따로 관리해야 한다. 여기서는 role="status" 로
        보조기기에도 같은 정보가 전달된다.
      */}
      {hoverGalaxy && labelAt && (
        <p
          className={styles.galaxyLabel}
          role="status"
          style={{ left: labelAt.x, top: labelAt.y }}
        >
          <span
            className={styles.labelSwatch}
            style={{ backgroundColor: galaxySwatch(hoverGalaxy) }}
            aria-hidden="true"
          />
          {galaxyLabel(hoverGalaxy)}
          {/* 유형은 이름 바로 옆에 — 오른쪽 목록에서 고를 값과 같은 표기다 */}
          <span className={styles.labelMbti}>{hoverGalaxy.mbti}</span>
          <span className={styles.labelRole}>{hoverGalaxy.role}</span>
        </p>
      )}

      <div className={styles.vignette} />

      {/* 조우 — 별이 상징으로 모인 뒤 건네는 한 줄 */}
      <EncounterOverlay />
    </div>
  );
}
