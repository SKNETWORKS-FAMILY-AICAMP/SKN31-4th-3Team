/*
 * state/useStarJourney.ts
 * ───────────────────────────────────────────────────────────────────────
 * 별로 가는 여정.
 *
 * 별을 고르는 것과 구절을 여는 것은 한 동작이 아니다.
 *   클릭 → 카메라 비행 → 도착 → 상세
 * 이 순서가 "별을 찾아간다"는 감각을 만든다. 즉시 열면 그냥 목록에서
 * 항목을 고른 것과 다를 게 없다.
 *
 * 여정을 끝내는 신호는 둘 중 먼저 오는 쪽이다:
 *   1) 엔진의 도착 통지 (정상 경로)
 *   2) 비행 시간 타이머 (안전망)
 *
 * 안전망이 필요한 이유: Canvas 를 못 쓰는 환경이나 탭이 백그라운드로
 * 내려가 렌더 루프가 멈춘 경우에는 도착 통지가 영영 오지 않는다.
 * 그때도 상세는 열려야 한다.
 *
 * ★ 도착과 열림 사이에 조우가 들어온다
 *   도착하면 그 별이 속한 은하의 별들이 상징으로 모이고, 한 줄이 지나간
 *   다음에 구절이 열린다. 여기서는 "언제 열지"만 조우에 맡기고, 무엇을
 *   열지는 그대로 둔다.
 */

import { useCallback, useEffect } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { FLIGHT_DURATION, FLIGHT_DURATION_REDUCED } from '../galaxy/Camera';
import { PATHS, versePath } from '../routes/paths';
import { useEncounter } from './EncounterContext';
import { useGalaxy } from './GalaxyContext';
import { useVerses } from './VersesContext';

/** 도착 통지가 늦을 때를 대비한 여유 시간(ms). */
const ARRIVAL_GRACE_MS = 140;

/**
 * @returns 엔진이 도착을 알릴 때 호출할 콜백.
 *   타이머가 먼저 울리면 이 콜백 없이도 여정이 끝난다.
 */
export function useStarJourney(): (starId: string) => void {
  const navigate = useNavigate();
  const onSky = useMatch(PATHS.sky);
  const { travelingToId, endTravel, reducedMotion } = useGalaxy();
  const { byId } = useVerses();
  const { begin } = useEncounter();

  const arrive = useCallback(
    (starId: string) => {
      // 진행 중인 여정의 목적지가 아니면 무시한다.
      // (도중에 다른 별로 목표가 바뀐 경우)
      if (travelingToId !== starId) return;
      endTravel();

      /*
       * 사용자가 비행 도중 다른 화면으로 떠났다면 데려오지 않는다.
       * 이 가드가 없으면 홈으로 나간 뒤 1.6초 뒤에 구절 상세로 끌려간다.
       */
      if (!onSky) return;

      /*
       * 그 별이 속한 은하의 주인을 만난 다음에 구절이 열린다.
       * 은하를 모르면(정적 표에 없는 별) 조우 없이 바로 연다 —
       * begin 이 그 판단을 대신해 준다.
       */
      const galaxyId = byId.get(starId)?.discipleId;
      const open = () => navigate(versePath(starId));
      if (galaxyId) begin(galaxyId, open, '구절 열기');
      else open();
    },
    [travelingToId, endTravel, navigate, onSky, byId, begin],
  );

  useEffect(() => {
    if (!travelingToId) return;
    const flight = reducedMotion ? FLIGHT_DURATION_REDUCED : FLIGHT_DURATION;
    const timer = window.setTimeout(() => arrive(travelingToId), flight * 1000 + ARRIVAL_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [travelingToId, reducedMotion, arrive]);

  return arrive;
}
