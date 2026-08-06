/*
 * routes/SkyRoute.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 은하수 탐색.
 *
 * 마우스는 캔버스의 별을 직접 누른다 (GalaxyCanvas 의 픽킹).
 * 키보드·스크린리더는 StarKeyboardLayer 로 같은 별에 도달한다.
 * 두 경로가 같은 상태(focusStarId)를 공유하므로 어긋나지 않는다.
 *
 * URL 의 ?focus=<id> 가 곧 카메라 목표다 — 공유·새로고침해도 같은 별에 착지한다.
 */

import { useEffect } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { REPRESENTED_VERSE_COUNT } from '../data/backdrop';
import { getGalaxy } from '../data/disciples';
import { useGalaxy } from '../state/GalaxyContext';
import { Button } from '../components/common/Button';
import { GALAXY_PARAM, PATHS, TRAVEL_PARAM } from './paths';
import screen from './Screen.module.css';
import styles from './SkyRoute.module.css';

/*
 * ★ 구절 목록은 여기 없다.
 *   예전에는 이 화면 위에 판을 띄웠다. 그런데 이 화면의 주인공은
 *   하늘이고, 판이 뜨는 순간 그 위를 덮는다. 게다가 오른쪽 MBTI 레일과
 *   자리를 다투느라 좁은 화면에서 글자가 포개졌다.
 *
 *   목록은 사이드바로 옮겼다(components/common/SiteMenu.tsx). 지난 상담이
 *   이미 거기 있으므로, "탐색할 것들" 이 한자리에 모인다. 하늘은 하늘만
 *   보여 준다.
 */

export function SkyRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { focusStar, focusGalaxy, travelingToId, travelTo, travelToGalaxy } = useGalaxy();

  const focusParam = params.get('focus');
  /*
   * "날아가서 열기" 요청인가.
   * 답변에서 구절을 고른 경우가 여기 해당한다 — 사용자는 이미 그 구절을
   * 보겠다고 정했으므로, 도착하면 상세가 바로 열려야 한다.
   */
  const travelRequested = params.get(TRAVEL_PARAM) === '1';
  /* 답변 화면에서 "은하 찾아가기"로 들어온 경우. 별이 아니라 은하가 목표다. */
  const galaxyParam = params.get(GALAXY_PARAM);
  // 이 화면은 /verse/:id 의 배경으로도 쓰인다.
  const asBackground = Boolean(useMatch(PATHS.verse));

  /*
   * URL 의 focus 가 카메라 목표다. 직접 진입해도 그 별로 날아간다.
   *
   * 단, 상세 오버레이의 배경으로 렌더될 때는 손대지 않는다.
   * 그 경우 카메라 주인은 오버레이이고, 여기서 focus 를 지우면
   * 상세가 열리는 순간 카메라가 중앙으로 되돌아가 버린다.
   */
  useEffect(() => {
    if (asBackground) return;
    if (focusParam && travelRequested) {
      // travelTo 는 도착 통지까지 이어져 useStarJourney 가 상세를 연다.
      travelTo(focusParam);
      return;
    }
    focusStar(focusParam);
  }, [focusParam, travelRequested, asBackground, focusStar, travelTo]);

  /* 은하로 안내받아 들어온 경우 — 카메라를 그 은하에 둔다. */
  useEffect(() => {
    if (asBackground || !galaxyParam) return;
    if (!getGalaxy(galaxyParam)) return; // 손으로 고친 주소로도 깨지지 않게

    if (travelRequested) travelToGalaxy(galaxyParam);
    else focusGalaxy(galaxyParam);
  }, [galaxyParam, travelRequested, asBackground, focusGalaxy, travelToGalaxy]);

  const traveling = Boolean(travelingToId);

  return (
    <main className={styles.screen}>
      <div className={screen.topBar}>
        <Button variant="quiet" onClick={() => navigate(PATHS.home)}>
          ← 처음으로
        </Button>
      </div>

      <p className={styles.hint} role="status">
        {traveling ? (
          <>
            그 별로 가는 중입니다
            <span className={styles.scale}>잠시 후 구절이 열립니다</span>
          </>
        ) : (
          <>
            별을 눌러 구절을 열고, 빈 곳을 끌어 시점을 돌려보세요.
            왼쪽 위 메뉴에서 구절을 목록으로 찾을 수 있습니다.
            <span className={styles.scale}>
              {REPRESENTED_VERSE_COUNT.toLocaleString('ko-KR')}개 구절이 이 하늘에 있습니다
            </span>
          </>
        )}
      </p>
    </main>
  );
}
