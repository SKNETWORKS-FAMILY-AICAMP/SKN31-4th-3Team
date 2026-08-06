/*
 * state/useGalaxyJourney.ts
 * ───────────────────────────────────────────────────────────────────────
 * 은하로 가는 여정.
 *
 *   답변 화면에서 누름 → 카메라 비행 → 도착 → 열림
 *
 * useStarJourney 와 같은 모양이지만 도착지가 다르다. 별은 늘 그 구절의
 * 상세로 가고, 은하는 두 갈래다:
 *
 *   ?then= 이 있으면   그 주소로 (상담 이어가기)
 *   없으면             그 자리에 머문다 (은하 찾아가기 — 목록은 SkyRoute 가 연다)
 *
 * ★ 왜 즉시 열지 않는가
 *   목록을 바로 띄우면 "고른 것"이지 "찾아간 것"이 아니다. 은하수 한가운데
 *   에서 그 은하까지 카메라가 이동하는 1.6초가, 이 서비스에서 거리를
 *   느끼게 하는 유일한 구간이다.
 *
 * ★ 타이머가 안전망이다
 *   Canvas 를 못 쓰는 환경이나 탭이 백그라운드로 내려간 경우에는 엔진의
 *   도착 통지가 영영 오지 않는다. 그때도 화면은 열려야 한다.
 */

import { useCallback, useEffect } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { FLIGHT_DURATION, FLIGHT_DURATION_REDUCED } from '../galaxy/Camera';
import { internalPath, PATHS, THEN_PARAM } from '../routes/paths';
import { useEncounter } from './EncounterContext';
import { useGalaxy } from './GalaxyContext';

/** 도착 통지가 늦을 때를 대비한 여유 시간(ms). */
const ARRIVAL_GRACE_MS = 140;

/**
 * @returns 엔진이 도착을 알릴 때 호출할 콜백.
 */
export function useGalaxyJourney(): (galaxyId: string) => void {
  const navigate = useNavigate();
  const onSky = useMatch(PATHS.sky);
  const [params] = useSearchParams();
  const { travelingToGalaxyId, endGalaxyTravel, reducedMotion } = useGalaxy();
  const { begin } = useEncounter();

  const then = internalPath(params.get(THEN_PARAM));

  const arrive = useCallback(
    (galaxyId: string) => {
      // 진행 중인 여정의 목적지가 아니면 무시한다 (도중에 목표가 바뀐 경우)
      if (travelingToGalaxyId !== galaxyId) return;
      endGalaxyTravel();

      /*
       * 비행 도중 다른 화면으로 떠났다면 데려오지 않는다.
       * 이 가드가 없으면 홈으로 나간 뒤 1.6초 뒤에 끌려간다.
       */
      if (!onSky) return;

      /*
       * 별이 상징으로 모이고, 사용자가 버튼을 누른 다음에 넘어간다.
       *
       * ★ 버튼 문구가 곧 목적지다.
       *   "들어가기" 처럼 두루뭉술하게 두면 누를 때 무슨 일이 생길지
       *   모른다. then 이 있으면 상담으로 가고, 없으면 이 은하의 구절을
       *   보게 된다 — 그 차이를 문구가 말한다.
       */
      begin(
        galaxyId,
        () => {
          // then 이 없으면 여기서 끝이다 — 목록은 SkyRoute 가 연다.
          if (then) navigate(then);
        },
        then ? '상담 들어가기' : '구절 목록 보기',
      );
    },
    [travelingToGalaxyId, endGalaxyTravel, navigate, onSky, then, begin],
  );

  useEffect(() => {
    if (!travelingToGalaxyId) return;
    const flight = reducedMotion ? FLIGHT_DURATION_REDUCED : FLIGHT_DURATION;
    const timer = window.setTimeout(
      () => arrive(travelingToGalaxyId),
      flight * 1000 + ARRIVAL_GRACE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [travelingToGalaxyId, reducedMotion, arrive]);

  return arrive;
}
