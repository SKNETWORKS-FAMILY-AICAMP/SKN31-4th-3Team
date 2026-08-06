/*
 * state/ThreadsContext.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 대화방 목록. 사이드바가 이 값을 그린다.
 *
 * ★ 두 출처를 한 모양으로 감싼다
 *   서버가 있으면 /chat/sessions/ 에서, 없으면 이 브라우저에서 읽는다.
 *   화면은 어느 쪽인지 몰라도 되게 한다 — 알아야 하는 순간 사이드바
 *   컴포넌트 안에 "서버가 있으면…" 분기가 생기고, 그 분기는 목록·삭제·
 *   갱신 세 곳으로 번진다.
 *
 * ★ 목록을 자동으로 새로 고치지 않는다
 *   대화가 오갈 때마다 목록을 다시 받으면, 말 한마디에 네트워크가 한 번씩
 *   나간다. 바뀌었다는 것을 아는 쪽(대화 화면)이 알려 주는 편이 정확하고
 *   싸다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../services/apiClient';
import { USING_API } from '../services/RepositoryProvider';
import {
  deleteThread as deleteLocalThread,
  listThreads as listLocalThreads,
  type ThreadSummary,
} from '../services/threadStore';
import { useAuth } from './AuthContext';

interface ThreadsValue {
  threads: readonly ThreadSummary[];
  /** 아직 첫 목록을 못 받았는가. 빈 목록과 구분해야 안내 문구가 달라진다. */
  loading: boolean;
  /** 목록을 다시 읽는다. 대화가 늘거나 줄었을 때 호출한다. */
  refresh: () => void;
  /** 대화방을 지운다. 목록에서도 곧바로 사라진다. */
  remove: (id: string) => Promise<void>;
}

const ThreadsContext = createContext<ThreadsValue | null>(null);

/** 서버 응답 한 줄. 우리가 쓰는 모양으로 좁혀 받는다. */
interface SessionDto {
  id: number;
  title?: string;
  persona_id?: string;
  updated_at?: string;
  last_message?: string;
}

function fromServer(dto: SessionDto): ThreadSummary {
  return {
    id: String(dto.id),
    title: dto.title?.trim() || '새로운 대화',
    personaId: dto.persona_id || undefined,
    updatedAt: dto.updated_at ? Date.parse(dto.updated_at) : Date.now(),
    preview: dto.last_message ?? '',
  };
}

export function ThreadsProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const [threads, setThreads] = useState<readonly ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  /** 값을 올려 목록을 다시 읽게 한다. */
  const [token, setToken] = useState(0);

  const refresh = useCallback(() => setToken((n) => n + 1), []);

  useEffect(() => {
    // 로그인 여부가 확정되기 전에는 판단하지 않는다 — 잠깐 빈 목록이 스친다.
    if (!ready) return;

    if (!USING_API) {
      setThreads(listLocalThreads());
      setLoading(false);
      return;
    }

    /*
     * 서버 목록은 내 것만 온다. 로그인하지 않았으면 부를 것이 없다.
     * 여기서 부르면 401 이 뜨고, 그 401 이 로그아웃 처리를 유발한다.
     */
    if (!user) {
      setThreads([]);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    /*
     * ★ 경로와 인증 둘 다 빼먹어서 목록이 늘 비어 있었다.
     *   BASE_URL 은 도메인까지만이라 "/api/v1" 을 직접 붙여야 하고,
     *   내 대화방을 부르는 요청이므로 토큰이 있어야 한다. 둘 중 하나만
     *   틀려도 결과가 "빈 목록"으로 똑같이 보여서, 화면만 봐서는
     *   무엇이 잘못됐는지 알 수 없었다.
     */
    api<{ results?: SessionDto[] } | SessionDto[]>('/api/v1/chat/sessions/', { auth: true })
      .then((data) => {
        if (!alive) return;
        const rows = Array.isArray(data) ? data : (data.results ?? []);
        setThreads(rows.map(fromServer).sort((a, b) => b.updatedAt - a.updatedAt));
      })
      .catch(() => {
        /*
         * ★ 실패해도 사이드바는 뜬다.
         *   목록을 못 받은 것이 앱이 고장 난 것은 아니다. 빈 목록으로
         *   두면 "대화가 없습니다" 가 뜨고, 사용자는 새 대화를 시작하면 된다.
         */
        if (alive) setThreads([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [token, user, ready]);

  const remove = useCallback(
    async (id: string) => {
      // 화면에서 먼저 지운다 — 누른 뒤 목록이 그대로면 안 눌린 줄 안다.
      setThreads((list) => list.filter((t) => t.id !== id));

      if (!USING_API) {
        deleteLocalThread(id);
        return;
      }
      try {
        await api(`/api/v1/chat/sessions/${encodeURIComponent(id)}/`, {
          method: 'DELETE',
          auth: true,
        });
      } catch {
        // 서버에서 못 지웠으면 목록을 되돌려 사실대로 보여 준다.
        refresh();
      }
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ threads, loading, refresh, remove }),
    [threads, loading, refresh, remove],
  );

  return <ThreadsContext.Provider value={value}>{children}</ThreadsContext.Provider>;
}

const IDLE: ThreadsValue = {
  threads: [],
  loading: false,
  refresh: () => {},
  remove: async () => {},
};

/** Provider 밖에서도 죽지 않는다 — 컴포넌트 하나만 떼어 렌더하는 테스트가 흔하다. */
export function useThreads(): ThreadsValue {
  return useContext(ThreadsContext) ?? IDLE;
}
