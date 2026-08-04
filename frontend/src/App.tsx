/*
 * App.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 앱 셸.
 *
 * 구조 핵심 두 가지:
 *
 * 1) <GalaxyCanvas/> 는 <Routes/> 바깥에 있다.
 *    라우트가 바뀌어도 은하수는 언마운트되지 않으므로, 화면 전환이
 *    "페이지 이동"이 아니라 "같은 우주 안에서의 이동"으로 느껴진다.
 *
 * 2) /verse/:id 는 오버레이 라우트다.
 *    배경으로 SkyRoute 를 그대로 두고 그 위에 상세를 얹는다.
 *    직접 URL 로 진입해도 은하수가 뒤에 살아 있고, 닫으면 별자리로 남는다.
 */

import { lazy, useEffect, Suspense } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router-dom';
import { GalaxyCanvas } from './components/galaxy/GalaxyCanvas';
import { SiteMenu } from './components/common/SiteMenu';
import { AccountButton } from './components/common/AccountButton';
import { MbtiSelector } from './components/galaxy/MbtiSelector';
import { GuideTour } from './components/guide/GuideTour';
import { GuideHint } from './components/guide/GuideHint';
import { useGuideTour } from './state/useGuideTour';
import { useGalaxy } from './state/GalaxyContext';
import { useStarJourney } from './state/useStarJourney';
import { AppPhaseProvider } from './state/AppPhaseContext';
import { GalaxyProvider } from './state/GalaxyContext';
import { CounselProvider } from './state/CounselContext';
import { IntroChannelProvider } from './state/IntroChannel';
import { RepositoryProvider, USING_API } from './services/RepositoryProvider';
import { AuthProvider, useAuth } from './state/AuthContext';
import { PATHS, verseClosePath } from './routes/paths';
import styles from './App.module.css';

/*
 * 라우트별 코드 스플리팅.
 *
 * 인트로만 즉시 필요하다 — 첫 화면이기 때문이다. 나머지는 사용자가
 * 그 화면에 갈 때 받는다. 첫 진입에서 상담 대화나 모티프 씬 코드까지
 * 내려받을 이유가 없다.
 *
 * 은하수 캔버스는 나누지 않는다. 모든 화면의 배경이라 어차피 항상 필요하다.
 */
import { IntroRoute } from './routes/IntroRoute';

const HomeRoute = lazy(() =>
  import('./routes/HomeRoute').then((m) => ({ default: m.HomeRoute })),
);
const AskRoute = lazy(() => import('./routes/AskRoute').then((m) => ({ default: m.AskRoute })));
const SkyRoute = lazy(() => import('./routes/SkyRoute').then((m) => ({ default: m.SkyRoute })));
const CounselRoute = lazy(() =>
  import('./routes/CounselRoute').then((m) => ({ default: m.CounselRoute })),
);
const NotFoundRoute = lazy(() =>
  import('./routes/NotFoundRoute').then((m) => ({ default: m.NotFoundRoute })),
);
const SettingsRoute = lazy(() =>
  import('./routes/SettingsRoute').then((m) => ({ default: m.SettingsRoute })),
);
const AuthRoute = lazy(() => import('./routes/AuthRoute').then((m) => ({ default: m.AuthRoute })));
const VerseDetailOverlay = lazy(() =>
  import('./components/verse/VerseDetailOverlay').then((m) => ({ default: m.VerseDetailOverlay })),
);

/**
 * 청크 로딩 중 폴백.
 * 은하수가 이미 화면에 있으므로 스피너를 얹지 않는다 — 빈 레이어가 낫다.
 * (로컬 네트워크에서는 사실상 보이지 않는 순간이다)
 */
function RouteFallback() {
  return <div aria-busy="true" aria-live="polite" />;
}

/**
 * 로그인이 필요한 화면을 감싼다.
 *
 * ★ 확인이 끝나기 전에는 판단하지 않는다.
 *   새로고침 직후에는 토큰 검증이 아직 안 끝났다. 그때 "로그인 안 됨"으로
 *   단정하면 로그인한 사용자가 매번 로그인 화면을 스쳐 지나간다.
 *
 * ★ mock 으로 도는 동안에는 막지 않는다.
 *   백엔드 없이 화면만 볼 때 로그인 벽을 세우면 아무 데도 갈 수 없다.
 */
function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  if (!USING_API) return children;
  if (!ready) return <RouteFallback />;
  if (!user) {
    return <Navigate to={PATHS.auth} replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const verseMatch = useMatch(PATHS.verse);
  const skyMatch = useMatch(PATHS.sky);
  const introMatch = useMatch(PATHS.intro);
  const homeMatch = useMatch(PATHS.home);
  const authMatch = useMatch(PATHS.auth);
  const { user } = useAuth();
  const {
    travelTo,
    focusGalaxy,
    resetView,
    travelingToId,
    selectedMbti,
    selectMbti,
    affinityGalaxyIds,
  } = useGalaxy();

  // 별을 고르면 카메라가 도착한 뒤에 상세가 열린다 (useStarJourney).
  const arrive = useStarJourney();

  const onSky = Boolean(skyMatch || verseMatch);
  const verseId = verseMatch?.params.id;

  /*
   * 별을 직접 누를 수 있는 화면에서만 캔버스가 포인터를 받는다.
   *
   * ★ 비행 중에는 잠근다.
   *   카메라가 목표로 날아가는 동안 화면은 계속 움직인다. 그 위에서 클릭을
   *   받으면 가려던 별이 아니라 지나가던 다른 별이 잡혀, 사용자가 이미
   *   정한 목적지가 뒤집힌다.
   */
  const interactive = onSky && !travelingToId;

  /*
   * 탐색 화면을 떠나면 카메라를 처음 자리로 되돌린다.
   *
   * 캔버스는 라우터 밖에 있어 화면을 옮겨도 살아 있다. 되돌리지 않으면
   * "처음으로"를 눌러 홈에 와도 별 하나에 코를 박은 채로 남아, 배경이
   * 무슨 화면인지 알 수 없는 상태가 된다.
   */
  useEffect(() => {
    if (onSky) return;
    resetView();
  }, [onSky, resetView]);

  /*
   * 이용 안내.
   *
   * ★ 홈에서만 연다.
   *   안내가 가리키는 것들(입력창, 추천 질문, 오른쪽 목록, 메뉴)이 한
   *   화면에 같이 있는 자리는 홈뿐이다. 인트로 위에 얹으면 창세기 문장이
   *   흐르는 연출이 통째로 깨진다.
   *
   * ★ 캔버스 밖에 둔다.
   *   라우터 바깥이라 화면을 옮겨도 살아 있고, 오른쪽 MBTI 목록처럼
   *   라우트에 속하지 않는 요소도 가리킬 수 있다.
   */
  const onHome = Boolean(homeMatch);
  const guide = useGuideTour(onHome);

  // 환경설정에서 "다시 보기"를 누르면 홈으로 오면서 이 표시를 들고 온다.
  const guideRequested = (location.state as { guide?: boolean } | null)?.guide === true;
  const { start: startGuide } = guide;
  useEffect(() => {
    if (onHome && guideRequested) startGuide();
  }, [onHome, guideRequested, startGuide]);

  return (
    <>
      {/*
        사이트 제목은 캔버스에 별로 그려진다 — 픽셀이라 스크린리더가 읽지 못한다.
        문서에는 진짜 제목이 하나 있어야 하므로 시각적으로만 숨겨 둔다.
      */}
      <h1 className={styles.srOnlyTitle}>Eden — 말씀의 별자리</h1>

      {/*
        전역 메뉴는 라우트 밖에 둔다 — 화면을 옮겨도 같은 자리에 있어야 한다.
        인트로에서는 감춘다. 창세기 문장이 흐르는 화면에 버튼이 얹히면
        연출이 끊긴다.
      */}
      {!introMatch && <SiteMenu />}

      {/*
        계정은 오른쪽 위에 상주한다.
        로그인 여부는 설정 항목이 아니라 "지금 내 상태"이므로, 메뉴를 열어야만
        알 수 있으면 로그인한 줄 알고 쓰다가 대화를 잃는다.
        인트로와 계정 화면에서는 감춘다 — 인트로는 연출이 끊기고, 계정
        화면에서는 같은 것을 두 번 말하는 셈이 된다.
      */}
      {!introMatch && !authMatch && <AccountButton />}

      <GalaxyCanvas
        interactive={interactive}
        onPickStar={travelTo}
        // 별이 아닌 은하를 누르면 열지 않고 그 은하를 화면 중앙으로 데려온다.
        onPickGalaxy={focusGalaxy}
        onArrive={arrive}
      />

      {/*
        16유형 목록.
        인트로에서는 감춘다 — 창세기 문장 옆에 선택지가 서면 연출이 끊긴다.
        구절 상세가 열렸을 때도 감춘다. 그때는 그 구절이 주인공이다.
      */}
      {!introMatch && !verseId && (
        <MbtiSelector
          selected={selectedMbti}
          onSelect={selectMbti}
          matchCount={affinityGalaxyIds.length}
          // 가입할 때 남긴 유형. 고르지 않아도 늘 조용히 빛난다.
          ownMbti={user?.mbti}
        />
      )}

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path={PATHS.intro} element={<IntroRoute />} />
          <Route path={PATHS.home} element={<HomeRoute />} />
          <Route path={PATHS.ask} element={<AskRoute />} />
          <Route path={PATHS.sky} element={<SkyRoute />} />
          {/* 상세는 오버레이다 — 배경 라우트는 별자리를 그대로 쓴다 */}
          <Route path={PATHS.verse} element={<SkyRoute />} />
          {/*
            상담만 로그인을 요구한다.
            대화는 사용자의 기록이므로 저장할 곳이 있어야 하고, 남의 것을
            볼 수 없어야 한다. 둘러보기와 질문은 그대로 열려 있다.
          */}
          <Route
            path={PATHS.counsel}
            element={
              <RequireAuth>
                <CounselRoute />
              </RequireAuth>
            }
          />
          <Route path={PATHS.auth} element={<AuthRoute />} />
          <Route path={PATHS.settings} element={<SettingsRoute />} />
          <Route path="*" element={<NotFoundRoute />} />
        </Routes>

        {verseId && (
          <VerseDetailOverlay verseId={verseId} onClose={() => navigate(verseClosePath())} />
        )}
      </Suspense>

      <GuideTour open={guide.open} onClose={guide.close} />

      {/*
        그만둔 직후 "다시 여는 법"을 한 줄 알려 준다.
        인트로에서는 띄우지 않는다 — 그 화면에는 애초에 튜토리얼이 없다.
      */}
      {!introMatch && <GuideHint show={guide.hint} onReopen={guide.start} />}
    </>
  );
}

export function App() {
  return (
    <RepositoryProvider>
      <AppPhaseProvider>
        <AuthProvider>
          <GalaxyProvider>
          <IntroChannelProvider>
            <CounselProvider>
              <BrowserRouter>
                <AppShell />
              </BrowserRouter>
            </CounselProvider>
          </IntroChannelProvider>
          </GalaxyProvider>
        </AuthProvider>
      </AppPhaseProvider>
    </RepositoryProvider>
  );
}
