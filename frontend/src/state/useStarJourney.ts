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
 */

import { useCallback, useEffect } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { FLIGHT_DURATION, FLIGHT_DURATION_REDUCED } from '../galaxy/Camera';
import { PATHS, versePath } from '../routes/paths';
import { useGalaxy } from './GalaxyContext';

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

      navigate(versePath(starId));
    },
    [travelingToId, endTravel, navigate, onSky],
  );

  useEffect(() => {
    if (!travelingToId) return;
    const flight = reducedMotion ? FLIGHT_DURATION_REDUCED : FLIGHT_DURATION;
    const timer = window.setTimeout(() => arrive(travelingToId), flight * 1000 + ARRIVAL_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [travelingToId, reducedMotion, arrive]);

  return arrive;
}
