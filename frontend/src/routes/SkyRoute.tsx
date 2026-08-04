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

import { useEffect, useMemo, useState } from 'react';
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { VERSE_STARS, getVerseStarsByGalaxy } from '../data/verses';
import { ALL_GALAXIES, CENTER_GALAXY, galaxyOfVerse, galaxySwatch } from '../data/disciples';
import { REPRESENTED_VERSE_COUNT } from '../data/backdrop';
import { useGalaxy } from '../state/GalaxyContext';
import { StarKeyboardLayer } from '../components/galaxy/StarKeyboardLayer';
import { Button } from '../components/common/Button';
import { PATHS, TRAVEL_PARAM } from './paths';
import screen from './Screen.module.css';
import styles from './SkyRoute.module.css';

/** 목록이 접혔을 때는 하늘을 넓게 본다 — 탐색이 주인공이다. */
const COLUMNS_ESTIMATE = 3;

export function SkyRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { focusStar, focusStarId, focusGalaxy, setHoverStarId, travelingToId, travelTo } =
    useGalaxy();
  const [listOpen, setListOpen] = useState(false);
  /*
   * 목록에서 펼쳐 볼 은하. 기본은 중심이다.
   * 이미 어떤 별을 보고 있다면 그 별이 속한 은하를 연다 — 목록을 열었는데
   * 다른 은하가 나오면 지금 보고 있는 별을 다시 찾아야 한다.
   */
  const [openGalaxyId, setOpenGalaxyId] = useState(CENTER_GALAXY.id);

  const focusParam = params.get('focus');
  /*
   * "날아가서 열기" 요청인가.
   * 답변에서 구절을 고른 경우가 여기 해당한다 — 사용자는 이미 그 구절을
   * 보겠다고 정했으므로, 도착하면 상세가 바로 열려야 한다.
   */
  const travelRequested = params.get(TRAVEL_PARAM) === '1';
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

  useEffect(() => {
    if (!focusStarId) return;
    const galaxy = galaxyOfVerse(focusStarId);
    if (galaxy) setOpenGalaxyId(galaxy.id);
  }, [focusStarId]);

  const openGalaxyStars = useMemo(() => getVerseStarsByGalaxy(openGalaxyId), [openGalaxyId]);

  const traveling = Boolean(travelingToId);

  return (
    <main className={styles.screen}>
      <div className={screen.topBar}>
        <Button variant="quiet" onClick={() => navigate(PATHS.home)}>
          ← 처음으로
        </Button>
        <Button
          variant="ghost"
          onClick={() => setListOpen((v) => !v)}
          aria-expanded={listOpen}
          aria-controls="star-list"
        >
          {listOpen ? '목록 닫기' : `구절 목록 (${VERSE_STARS.length})`}
        </Button>
      </div>

      {!listOpen && (
        <p className={styles.hint} role="status">
          {traveling ? (
            <>
              그 별로 가는 중입니다
              <span className={styles.scale}>잠시 후 구절이 열립니다</span>
            </>
          ) : (
            <>
              별을 눌러 구절을 열고, 빈 곳을 끌어 시점을 돌려보세요.
              은하를 누르면 그 은하가 화면 가운데로 옵니다.
              <span className={styles.scale}>
                {REPRESENTED_VERSE_COUNT.toLocaleString('ko-KR')}개 구절이 이 하늘에 있습니다
              </span>
            </>
          )}
        </p>
      )}

      {listOpen && (
        <div id="star-list" className={`${screen.panel} ${screen.wide}`}>
          <p className="u-muted">
            별 하나가 성경 구절 하나입니다. 은하를 고른 뒤 방향키로 이동하고 Enter 로
            선택하세요.
          </p>

          {/*
            은하 단위로 나눠 보여 준다.
            520개를 한 목록에 펼치면 키보드로는 끝까지 갈 수 없고 화면도 무거워진다.
            하늘에서 은하가 나뉘어 보이는 방식을 목록도 그대로 따른다.
          */}
          <div className={styles.galaxyTabs} role="tablist" aria-label="은하 선택">
            {ALL_GALAXIES.map((galaxy) => (
              <button
                key={galaxy.id}
                type="button"
                role="tab"
                aria-selected={galaxy.id === openGalaxyId}
                className={styles.galaxyTab}
                onClick={() => {
                  setOpenGalaxyId(galaxy.id);
                  // 목록에서 고른 은하도 하늘에서 화면 중앙으로 온다.
                  focusGalaxy(galaxy.id);
                }}
              >
                <span
                  className={styles.tabSwatch}
                  style={{ backgroundColor: galaxySwatch(galaxy) }}
                  aria-hidden="true"
                />
                {galaxy.name}
                <span className={styles.tabCount}>{galaxy.verseIds.length}</span>
              </button>
            ))}
          </div>

          <StarKeyboardLayer
            stars={openGalaxyStars}
            activeId={focusStarId}
            columns={COLUMNS_ESTIMATE}
            onHover={setHoverStarId}
            // 목록에서 고른 별도 마찬가지로 "날아간 뒤에" 열린다.
            onActivate={(star) => travelTo(star.id)}
          />
        </div>
      )}
    </main>
  );
}
