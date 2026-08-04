/*
 * state/AuthContext.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 로그인 상태.
 *
 * ★ 둘러보기는 막지 않는다.
 *   은하수를 보고 구절을 읽고 질문하는 것까지는 로그인 없이 된다.
 *   로그인은 "대화를 저장하고 이어가는" 시점에만 필요하다 —
 *   첫 방문자가 연출을 보기도 전에 벽을 만나면 안 된다.
 *
 * ★ 토큰 관리는 apiClient 가 한다.
 *   여기서는 "지금 누구인가"만 들고 있는다. 갱신·만료 처리를 두 곳에
 *   나눠 두면 어느 쪽이 진실인지 알 수 없게 된다.
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
import { ApiError, SESSION_EXPIRED, api, getAccessToken, setTokens } from '../services/apiClient';
import { USING_API } from '../services/RepositoryProvider';
import { nextLocalId, readLocalSession, writeLocalSession } from '../services/localSession';

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  mbti: string;
}

interface AuthValue {
  user: AuthUser | null;
  /** 첫 확인이 끝났는가. 끝나기 전에는 "로그인 안 됨"으로 단정하지 않는다. */
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    username: string;
    password: string;
    mbti?: string;
  }) => Promise<void>;
  logout: () => void;
  /** 화면에서 고른 MBTI 를 계정에 남긴다. 실패해도 화면은 그대로 둔다. */
  saveMbti: (mbti: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const loadMe = useCallback(async () => {
    // 백엔드가 없으면 이 브라우저에 남은 기록이 곧 "지금 누구인가"다.
    if (!USING_API) {
      setUser(readLocalSession());
      return;
    }
    if (!getAccessToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<AuthUser>('/api/v1/auth/me/', { auth: true }));
    } catch {
      // 토큰이 있어도 만료됐을 수 있다. 조용히 비로그인으로 둔다.
      setUser(null);
    }
  }, []);

  // 새로고침 후에도 로그인이 유지되도록 한 번 확인한다.
  useEffect(() => {
    void loadMe().finally(() => setReady(true));
  }, [loadMe]);

  /*
   * 갱신까지 실패해 세션이 끝나면 apiClient 가 알려 준다.
   * 화면 여기저기서 401 을 각자 처리하면 어떤 것은 로그아웃되고 어떤
   * 것은 남는 어중간한 상태가 된다.
   */
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      /*
       * 백엔드가 없을 때는 이 브라우저에 남은 기록을 되살린다.
       * 비밀번호는 확인하지 않는다 — 저장한 적이 없기 때문이다(localSession.ts).
       */
      if (!USING_API) {
        const saved = readLocalSession();
        if (!saved || saved.email !== email.trim()) {
          throw new Error('이 브라우저에 저장된 계정이 없습니다. 먼저 계정을 만들어 주세요.');
        }
        setUser(saved);
        return;
      }

      const tokens = await api<{ access: string; refresh: string }>('/api/v1/auth/login/', {
        method: 'POST',
        body: { email, password },
      });
      setTokens(tokens);
      await loadMe();
    },
    [loadMe],
  );

  const register = useCallback(
    async (input: { email: string; username: string; password: string; mbti?: string }) => {
      if (!USING_API) {
        const session = {
          id: nextLocalId(),
          email: input.email.trim(),
          username: input.username.trim(),
          mbti: input.mbti ?? '',
        };
        writeLocalSession(session);
        setUser(session);
        return;
      }

      await api('/api/v1/auth/register/', { method: 'POST', body: input });
      // 가입 직후 바로 들어가게 한다 — 다시 로그인시키면 이탈 지점이 하나 는다.
      await login(input.email, input.password);
    },
    [login],
  );

  const logout = useCallback(() => {
    setTokens(null);
    setUser(null);
    /*
     * 로그아웃해도 이 브라우저의 기록은 지우지 않는다.
     * 지워 버리면 다시 로그인할 방법이 없어져(비밀번호를 확인하지 않으므로)
     * 로그아웃이 사실상 탈퇴가 된다.
     */
  }, []);

  const saveMbti = useCallback(async (mbti: string) => {
    if (!USING_API) {
      setUser((prev) => {
        if (!prev) return prev;
        const next = { ...prev, mbti };
        writeLocalSession(next);
        return next;
      });
      return;
    }

    try {
      const updated = await api<{ mbti: string }>('/api/v1/auth/me/', {
        method: 'PATCH',
        auth: true,
        body: { mbti },
      });
      setUser((prev) => (prev ? { ...prev, mbti: updated.mbti } : prev));
    } catch (error) {
      // 저장 실패로 화면의 선택까지 되돌리지는 않는다. 이번 세션에는 남는다.
      if (!(error instanceof ApiError)) throw error;
    }
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, saveMbti }),
    [user, ready, login, register, logout, saveMbti],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
