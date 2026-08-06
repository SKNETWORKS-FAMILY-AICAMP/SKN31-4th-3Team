/*
 * services/apiClient.ts
 * ───────────────────────────────────────────────────────────────────────
 * Django 백엔드와 통신하는 얇은 클라이언트.
 *
 * ★ 토큰 갱신을 여기 한 곳에 모은다.
 *   Access Token 은 1일, Refresh 는 7일이다. 401 이 오면 조용히 갱신해
 *   원래 요청을 한 번만 다시 보낸다. 화면 코드는 이 사실을 몰라도 된다.
 *
 * ★ 갱신 요청은 하나만 날린다.
 *   토큰이 만료된 순간 화면이 여러 요청을 동시에 보내는 일이 흔하다.
 *   각자 갱신하면 서버에 같은 요청이 여러 번 가고, 그중 하나만 살아남아
 *   나머지가 로그아웃된다. 진행 중인 갱신이 있으면 그 약속을 함께 기다린다.
 *
 * ★ 토큰은 localStorage 에 둔다.
 *   XSS 에 노출되는 자리라는 것을 알고 쓰는 선택이다. HttpOnly 쿠키가
 *   더 안전하지만 CloudFront 와 API 도메인이 달라 SameSite 처리가 붙는다.
 *   운영 전환 시 재검토 대상으로 docs/aws-deployment.md 에 적어 두었다.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

const ACCESS_KEY = 'eden.access';
const REFRESH_KEY = 'eden.refresh';

export interface Tokens {
  access: string;
  refresh: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** 서버가 준 필드별 오류. 폼에 그대로 붙일 수 있다. */
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/* ── 토큰 보관 ───────────────────────────────────────────────────── */

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // 시크릿 모드나 저장소가 막힌 환경. 메모리에만 남고 새로고침 시 풀린다.
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* 저장할 수 없으면 이번 세션 동안만 유지된다 */
  }
}

let accessToken: string | null = read(ACCESS_KEY);
let refreshToken: string | null = read(REFRESH_KEY);

export function getAccessToken(): string | null {
  return accessToken;
}

export function setTokens(tokens: Tokens | null): void {
  accessToken = tokens?.access ?? null;
  refreshToken = tokens?.refresh ?? null;
  write(ACCESS_KEY, accessToken);
  write(REFRESH_KEY, refreshToken);
}

/** 로그아웃 시 다른 탭에도 알리기 위한 이벤트 이름. */
export const SESSION_EXPIRED = 'eden:session-expired';

function expireSession(): void {
  setTokens(null);
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED));
}

/* ── 토큰 갱신 ───────────────────────────────────────────────────── */

/** 진행 중인 갱신. 동시에 여러 번 갱신하지 않기 위한 자물쇠다. */
let refreshing: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  if (!refreshToken) return null;
  if (refreshing) return refreshing;

  refreshing = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/v1/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (!response.ok) {
        expireSession();
        return null;
      }
      const data = (await response.json()) as { access: string };
      accessToken = data.access;
      write(ACCESS_KEY, accessToken);
      return accessToken;
    } catch {
      // 네트워크 실패는 만료와 다르다. 토큰을 버리지 않고 다음 기회를 남긴다.
      return null;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

/* ── 요청 ────────────────────────────────────────────────────────── */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /**
   * 인증을 어떻게 다룰 것인가.
   *
   *   false      — 토큰을 붙이지 않는다 (목록·구절 조회)
   *   true       — 붙인다. 없거나 만료면 실패한다 (대화·내 정보)
   *   'optional' — 있으면 붙이고, 안 통하면 없는 셈 치고 다시 보낸다
   *
   * ★ 'optional' 이 필요한 이유
   *   질문하기는 로그인 없이도 되는 입구다. 그런데 토큰이 만료된 채로
   *   남아 있으면 붙였다가 401 이 나고, 로그인도 안 한 사람에게
   *   "로그인이 필요합니다" 가 뜬다. 입구가 막히는 것이 가장 나쁘다.
   */
  auth?: boolean | 'optional';
  signal?: AbortSignal;
  /** 스트리밍 요청은 text/event-stream 을 요청한다. 기본은 JSON. */
  accept?: string;
}

async function send(path: string, options: RequestOptions, retry = true): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: options.accept ?? 'application/json',
  };
  if (options.auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  // 만료된 토큰이면 한 번만 갱신해 다시 보낸다. 두 번 이상은 무한 루프다.
  if (response.status === 401 && options.auth && retry) {
    const fresh = await refreshAccess();
    if (fresh) return send(path, options, false);

    // 갱신도 실패했다. 선택적 인증이면 익명으로 물러선다.
    if (options.auth === 'optional') {
      return send(path, { ...options, auth: false }, false);
    }
  }

  return response;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = undefined;
    }
    throw new ApiError(response.status, messageFor(response.status, detail), detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * 스트리밍 응답을 연다.
 *
 * ★ api() 와 나눠 두는 이유
 *   api() 는 본문을 통째로 읽어 JSON 으로 만든다. 스트리밍은 그러면 안
 *   된다 — 본문이 끝날 때까지 기다리는 순간 "실시간"이 사라진다.
 *   여기서는 응답 객체를 그대로 돌려주고, 읽는 일은 호출한 쪽이 한다.
 *
 * ★ 토큰 갱신은 그대로 얹힌다
 *   send() 를 쓰므로 401 이면 한 번 갱신하고 다시 보낸다. 긴 대화 도중
 *   토큰이 만료되는 상황이 실제로 있다.
 */
export async function openStream(
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const response = await send(path, { ...options, accept: 'text/event-stream' });

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = undefined;
    }
    throw new ApiError(response.status, messageFor(response.status, detail), detail);
  }

  if (!response.body) {
    // 아주 오래된 브라우저이거나 프록시가 본문을 삼킨 경우
    throw new ApiError(0, '실시간 응답을 받을 수 없는 환경입니다.', undefined);
  }

  return response;
}

/**
 * 사용자에게 보일 문장.
 * 서버의 원문 오류를 그대로 띄우지 않는다 — 스택이나 내부 필드명이
 * 화면에 나오면 무슨 일이 일어난 건지 오히려 알기 어렵다.
 */
function messageFor(status: number, detail: unknown): string {
  if (status === 401) return '로그인이 필요합니다.';
  if (status === 403) return '접근 권한이 없습니다.';
  if (status === 404) return '찾을 수 없습니다.';
  if (status === 429) return '요청이 조금 많습니다. 잠시 뒤에 다시 시도해 주세요.';
  if (status >= 500) return '서버에 문제가 있습니다. 잠시 뒤에 다시 시도해 주세요.';

  if (detail && typeof detail === 'object') {
    const first = Object.values(detail as Record<string, unknown>)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    if (typeof first === 'string') return first;
  }
  return '요청을 처리하지 못했습니다.';
}

export { BASE_URL };
