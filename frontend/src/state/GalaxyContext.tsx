/*
 * state/GalaxyContext.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 은하수 레이어의 상태. 캔버스는 라우트 밖에서 영속하므로,
 * 화면 전환은 "언마운트"가 아니라 이 상태의 변화로 표현된다.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { QualityProfile, QualityTier } from '../data/types';
import { ALL_GALAXIES } from '../data/disciples';
import { isAffinity, type MbtiType } from '../data/mbti';
import { degrade, profileFor, resolveInitialTier } from '../galaxy/quality';
import {
  readMotionPreference,
  readQualityMode,
  resolveReducedMotion,
  writeMotionPreference,
  writeQualityMode,
  type MotionPreference,
  type QualityMode,
} from '../services/preferences';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface GalaxyValue {
  /** 현재 포커스된 별 (카메라 목표) */
  focusStarId: string | null;
  focusStar: (id: string | null) => void;
  /** 호버 중인 별 — 툴팁/커서 반응용 */
  hoverStarId: string | null;
  setHoverStarId: (id: string | null) => void;
  /** 포인터가 올라가 있는 은하 — 이름표와 색 오라가 붙는다 */
  hoverGalaxyId: string | null;
  setHoverGalaxyId: (id: string | null) => void;
  /**
   * 화면 가운데로 데려올 은하.
   *
   * 별 포커스와는 별개 축이다 — 별을 고르면 그 별이, 은하를 고르면
   * 그 은하가 중앙에 온다. 둘이 동시에 설정되면 별이 이긴다.
   */
  focusGalaxyId: string | null;
  focusGalaxy: (id: string | null) => void;
  /**
   * 사용자가 고른 MBTI. null 이면 고르지 않은 상태다.
   *
   * ★ 성격을 규정하는 값이 아니다.
   *   "지금 이 결과 가까운 은하"를 고르는 손잡이일 뿐이며, 언제든 해제된다.
   */
  selectedMbti: MbtiType | null;
  selectMbti: (mbti: MbtiType | null) => void;
  /** 고른 유형과 결이 가까운 은하 id. 고르지 않았으면 빈 배열이다. */
  affinityGalaxyIds: readonly string[];
  /**
   * 카메라를 처음 자리로 되돌린다.
   * 별·은하 포커스와 호버를 한 번에 푼다 — 탐색 화면을 떠날 때 쓴다.
   */
  resetView: () => void;
  /**
   * "이 별로 날아가는 중" 상태.
   *
   * 별을 고르는 것과 구절을 여는 것은 한 동작이 아니다.
   * 먼저 카메라가 그 별까지 가고, 도착한 뒤에 상세가 열린다.
   * 그 사이 구간을 이 값이 표시한다.
   */
  travelingToId: string | null;
  /** 별을 고르고 비행을 시작한다 (도착 처리는 AppShell 이 한다) */
  travelTo: (id: string) => void;
  /** 비행 상태를 종료한다 — 도착했거나 취소됐을 때 */
  endTravel: () => void;
  /**
   * "이 은하로 날아가는 중" 상태.
   *
   * ★ 별 비행과 나눠 둔다.
   *   도착했을 때 할 일이 다르다. 별은 구절 상세를 열고, 은하는 그
   *   은하의 구절 목록을 열거나 상담으로 넘어간다. 한 값에 섞으면
   *   도착 처리에서 "이게 별이었나 은하였나"를 다시 판별해야 한다.
   */
  travelingToGalaxyId: string | null;
  /** 은하를 고르고 비행을 시작한다 */
  travelToGalaxy: (id: string) => void;
  endGalaxyTravel: () => void;
  quality: QualityProfile;
  /**
   * 지금 적용된 티어를 강등한다.
   *
   * ★ 자동일 때만 듣는다.
   *   사용자가 "높음"으로 고정해 두었는데 프레임이 떨어졌다고 시스템이
   *   낮춰 버리면, 직접 고른 의미가 없어진다. 고정은 고정이어야 한다.
   */
  degradeQuality: () => void;
  qualityMode: QualityMode;
  setQualityMode: (mode: QualityMode) => void;
  motionPreference: MotionPreference;
  setMotionPreference: (pref: MotionPreference) => void;
  /** 기기가 모션 줄이기를 켜 두었는가. 설정 화면이 "따르는 중"임을 밝힐 때 쓴다. */
  systemPrefersReducedMotion: boolean;
  reducedMotion: boolean;
}

const GalaxyContext = createContext<GalaxyValue | null>(null);

export function GalaxyProvider({ children }: { children: ReactNode }) {
  const systemPrefersReducedMotion = usePrefersReducedMotion();

  const [motionPreference, setMotionPreferenceState] = useState<MotionPreference>(() =>
    readMotionPreference(),
  );
  const [qualityMode, setQualityModeState] = useState<QualityMode>(() => readQualityMode());

  /*
   * 자동 모드가 지금 쓰고 있는 티어.
   *
   * 사용자가 고정한 값과 분리해 둔다. 섞어 두면 "자동 → 낮음으로 강등 →
   * 사용자가 자동을 다시 고름" 이후에도 낮음에 눌러앉는다.
   */
  const [autoTier, setAutoTier] = useState<QualityTier>(() => resolveInitialTier());

  const reducedMotion = resolveReducedMotion(motionPreference, systemPrefersReducedMotion);

  const setMotionPreference = useCallback((pref: MotionPreference) => {
    setMotionPreferenceState(pref);
    writeMotionPreference(pref);
  }, []);

  const setQualityMode = useCallback((mode: QualityMode) => {
    setQualityModeState(mode);
    writeQualityMode(mode);
    // 자동으로 돌아올 때는 기기 사양에서 다시 시작한다.
    if (mode === 'auto') setAutoTier(resolveInitialTier());
  }, []);

  const degradeQuality = useCallback(() => {
    setQualityModeState((mode) => {
      if (mode === 'auto') setAutoTier((t) => degrade(t));
      return mode;
    });
  }, []);

  const tier: QualityTier = qualityMode === 'auto' ? autoTier : qualityMode;
  const [focusStarId, setFocusStarId] = useState<string | null>(null);
  const [hoverStarId, setHoverStarId] = useState<string | null>(null);
  const [hoverGalaxyId, setHoverGalaxyId] = useState<string | null>(null);
  const [focusGalaxyId, setFocusGalaxyId] = useState<string | null>(null);
  const [selectedMbti, setSelectedMbti] = useState<MbtiType | null>(null);

  /*
   * 궁합은 값이 바뀔 때만 다시 센다.
   * 13개 비교라 비싸지는 않지만, 매 렌더 새 배열을 만들면 그걸 받는 쪽의
   * effect 가 프레임마다 다시 돈다.
   */
  const affinityGalaxyIds = useMemo(
    () =>
      selectedMbti
        ? ALL_GALAXIES.filter((g) => isAffinity(selectedMbti, g.mbti)).map((g) => g.id)
        : [],
    [selectedMbti],
  );
  const [travelingToId, setTravelingToId] = useState<string | null>(null);
  const [travelingToGalaxyId, setTravelingToGalaxyId] = useState<string | null>(null);

  // 카메라만 옮기는 경우 (URL 의 ?focus= 등). 진행 중이던 비행은 취소된다.
  const focusStar = useCallback((id: string | null) => {
    setFocusStarId(id);
    setTravelingToId(null);
    setTravelingToGalaxyId(null);
    // 별을 향하는 동안 은하 포커스가 남아 있으면 목표가 둘이 된다.
    if (id) setFocusGalaxyId(null);
  }, []);

  /** 은하를 화면 가운데로 데려온다. 별 포커스는 풀린다. */
  const focusGalaxy = useCallback((id: string | null) => {
    setFocusGalaxyId(id);
    setTravelingToGalaxyId(null);
    if (id) {
      setFocusStarId(null);
      setTravelingToId(null);
    }
  }, []);

  // 별을 골라 그리로 날아간다. 도착하면 상세가 열린다.
  const travelTo = useCallback((id: string) => {
    setFocusStarId(id);
    setTravelingToId(id);
    setFocusGalaxyId(null);
    setTravelingToGalaxyId(null);
  }, []);

  const endTravel = useCallback(() => setTravelingToId(null), []);

  // 은하를 골라 그리로 날아간다. 도착하면 목록이 열리거나 상담으로 넘어간다.
  const travelToGalaxy = useCallback((id: string) => {
    setFocusGalaxyId(id);
    setTravelingToGalaxyId(id);
    setFocusStarId(null);
    setTravelingToId(null);
  }, []);

  const endGalaxyTravel = useCallback(() => setTravelingToGalaxyId(null), []);

  /*
   * MBTI 를 고르면 진행 중이던 집중은 푼다.
   * 구절 하나를 보는 중에 은하 절반이 사라지면 무슨 일이 일어난 건지 알 수 없다.
   */
  const selectMbti = useCallback((mbti: MbtiType | null) => {
    setSelectedMbti(mbti);
    if (mbti) {
      setFocusStarId(null);
      setFocusGalaxyId(null);
      setTravelingToId(null);
      setTravelingToGalaxyId(null);
    }
  }, []);

  const resetView = useCallback(() => {
    setFocusStarId(null);
    setFocusGalaxyId(null);
    setTravelingToId(null);
    setTravelingToGalaxyId(null);
    setHoverStarId(null);
    setHoverGalaxyId(null);
  }, []);

  const quality = useMemo(
    () => profileFor(reducedMotion ? 'still' : tier),
    [tier, reducedMotion],
  );

  const value = useMemo(
    () => ({
      focusStarId,
      focusStar,
      hoverStarId,
      setHoverStarId,
      hoverGalaxyId,
      setHoverGalaxyId,
      focusGalaxyId,
      focusGalaxy,
      selectedMbti,
      selectMbti,
      affinityGalaxyIds,
      resetView,
      travelingToId,
      travelTo,
      endTravel,
      travelingToGalaxyId,
      travelToGalaxy,
      endGalaxyTravel,
      quality,
      degradeQuality,
      qualityMode,
      setQualityMode,
      motionPreference,
      setMotionPreference,
      systemPrefersReducedMotion,
      reducedMotion,
    }),
    [
      focusStarId,
      focusStar,
      hoverStarId,
      hoverGalaxyId,
      focusGalaxyId,
      focusGalaxy,
      selectedMbti,
      selectMbti,
      affinityGalaxyIds,
      resetView,
      travelingToId,
      travelTo,
      endTravel,
      travelingToGalaxyId,
      travelToGalaxy,
      endGalaxyTravel,
      quality,
      degradeQuality,
      qualityMode,
      setQualityMode,
      motionPreference,
      setMotionPreference,
      systemPrefersReducedMotion,
      reducedMotion,
    ],
  );

  return <GalaxyContext.Provider value={value}>{children}</GalaxyContext.Provider>;
}

export function useGalaxy(): GalaxyValue {
  const ctx = useContext(GalaxyContext);
  if (!ctx) throw new Error('useGalaxy must be used within GalaxyProvider');
  return ctx;
}
