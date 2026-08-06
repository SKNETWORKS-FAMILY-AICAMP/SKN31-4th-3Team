/*
 * state/VersesContext.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 하늘에 뜰 별 목록. 한 곳에서 한 번만 읽는다.
 *
 * ★ 왜 만들었나
 *   저장소(repositories.verses)는 처음부터 있었는데 아무도 안 썼다.
 *   모든 화면이 data/verses.ts 의 정적 702절을 직접 읽고 있었고, 그래서
 *   서버에 무엇을 넣어도 화면은 그대로였다. 백엔드를 붙여 놓고 "왜 안
 *   바뀌지" 를 한참 찾게 되는 종류의 어긋남이다.
 *
 * ★ 정적 데이터를 버리지 않는다
 *   API 를 안 쓰는 모드(VITE_API_BASE_URL 이 비어 있음)에서는 정적
 *   목록을 그대로 쓴다. 팀원이 서버 없이 clone 만 해도 하늘이 뜬다.
 *   테스트도 이 경로로 돈다.
 *
 * ★ 별이 확정된 뒤에 캔버스를 만든다
 *   엔진은 생성자에서 별 목록으로 버퍼를 통째로 굽는다. 중간에 목록이
 *   바뀌면 엔진을 다시 만들어야 하고, 그러면 인트로가 처음부터 다시
 *   시작한다. 창세기 문장이 두 번 지나가는 것보다, 뜨기 전에 잠깐
 *   기다리는 편이 낫다.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { VerseStar } from '../data/types';
import { VERSE_STARS } from '../data/verses';
import { USING_API, useRepositories } from '../services/RepositoryProvider';

interface VersesValue {
  stars: readonly VerseStar[];
  /** id → 별. getVerseStar 의 자리를 대신한다. */
  byId: ReadonlyMap<string, VerseStar>;
  /** 은하 id → 그 은하의 별들 (순번 순서) */
  byGalaxy: ReadonlyMap<string, readonly VerseStar[]>;
  /** 서버에서 받아 온 것인가. 정적 데이터면 false. */
  fromServer: boolean;
}

const VersesContext = createContext<VersesValue | null>(null);

function index(stars: readonly VerseStar[]): VersesValue {
  const byId = new Map<string, VerseStar>();
  const byGalaxy = new Map<string, VerseStar[]>();

  for (const star of stars) {
    byId.set(star.id, star);
    const bucket = byGalaxy.get(star.discipleId);
    if (bucket) bucket.push(star);
    else byGalaxy.set(star.discipleId, [star]);
  }

  return { stars, byId, byGalaxy, fromServer: false };
}

const STATIC = index(VERSE_STARS);

export function VersesProvider({ children }: { children: ReactNode }) {
  const { verses } = useRepositories();
  const [loaded, setLoaded] = useState<readonly VerseStar[] | null>(
    // API 를 안 쓰면 기다릴 것이 없다 — 첫 렌더부터 별이 있다.
    USING_API ? null : VERSE_STARS,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!USING_API) return;
    let alive = true;

    verses
      .listStars()
      .then((stars) => {
        if (alive) setLoaded(stars);
      })
      .catch(() => {
        /*
         * ★ 실패해도 하늘은 뜬다.
         *   서버가 죽었다고 화면이 검은 채로 남으면, 사용자는 앱이
         *   고장 났다고 본다. 정적 702절로 물러난다 — 성경전서에서
         *   올라온 별만 없을 뿐 나머지는 그대로다.
         */
        if (alive) {
          setLoaded(VERSE_STARS);
          setFailed(true);
        }
      });

    return () => {
      alive = false;
    };
  }, [verses]);

  const value = useMemo(() => {
    if (!loaded) return null;
    return { ...index(loaded), fromServer: USING_API && !failed };
  }, [loaded, failed]);

  if (!value) {
    // 별을 기다리는 동안. 인트로가 두 번 시작되지 않게 캔버스를 미룬다.
    return (
      <p className="u-muted" role="status" style={{ padding: '2rem' }}>
        하늘을 준비하는 중…
      </p>
    );
  }

  return <VersesContext.Provider value={value}>{children}</VersesContext.Provider>;
}

export function useVerses(): VersesValue {
  const ctx = useContext(VersesContext);
  /*
   * ★ Provider 밖에서도 죽지 않는다.
   *   이 훅은 화면 곳곳에서 쓰이고, 테스트가 컴포넌트 하나만 떼어
   *   렌더하는 일이 흔하다. 거기서 매번 Provider 를 감싸게 하면
   *   테스트가 본질과 상관없는 준비 코드로 뒤덮인다.
   */
  return ctx ?? STATIC;
}

/** 별 하나. 없으면 undefined — 정적 getVerseStar 와 같은 계약이다. */
export function useVerseStar(id: string | undefined): VerseStar | undefined {
  const { byId } = useVerses();
  return id ? byId.get(id) : undefined;
}
