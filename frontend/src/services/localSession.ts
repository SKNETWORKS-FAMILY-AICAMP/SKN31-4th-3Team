/*
 * services/localSession.ts
 * ───────────────────────────────────────────────────────────────────────
 * 백엔드가 없을 때의 계정 자리.
 *
 * ★ 왜 필요한가
 *   VITE_API_BASE_URL 이 없으면 앱은 mock 으로 돈다. 그 상태에서 가입·로그인만
 *   실제 API 를 부르면 "가입 버튼이 항상 실패하는 화면"이 된다.
 *   이름 인사와 내 MBTI 강조는 로그인해야 보이는 연출인데, 로그인이 안 되면
 *   그 연출은 아무도 볼 수 없다.
 *
 * ★ 이것은 인증이 아니다
 *   비밀번호를 저장하지도, 검증하지도 않는다. 저장하는 순간 그것은
 *   "브라우저에 평문으로 놓인 비밀번호"가 되고, 데모 편의를 위해 만들 값이
 *   절대 아니다. 여기서 하는 일은 "이 브라우저에서 이름과 MBTI 를 기억한다"
 *   뿐이다.
 *
 *   진짜 인증은 USING_API 가 켜졌을 때 Django + JWT 가 한다.
 *   이 파일의 코드는 그때 단 한 줄도 실행되지 않는다.
 */

const STORAGE_KEY = 'eden.localSession';

export interface LocalSession {
  id: number;
  email: string;
  username: string;
  mbti: string;
}

/**
 * localStorage 접근을 감싼다.
 *
 * 사파리 프라이빗 모드나 저장소가 가득 찬 상황에서는 읽기·쓰기가 예외를
 * 던진다. 그 예외가 렌더 중에 터지면 화면 전체가 빈다 — 기억하지 못하는 것은
 * 불편할 뿐이지만, 화면이 사라지는 것은 고장이다.
 */
function safeRead(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeWrite(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* 기억하지 못할 뿐, 이번 세션은 그대로 흘러간다 */
  }
}

function isSession(value: unknown): value is LocalSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'number' &&
    typeof v.email === 'string' &&
    typeof v.username === 'string' &&
    typeof v.mbti === 'string'
  );
}

export function readLocalSession(): LocalSession | null {
  const raw = safeRead();
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // 예전 버전이 남긴 다른 모양일 수 있다. 모르는 모양은 없는 것으로 친다.
    return isSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocalSession(session: LocalSession | null): void {
  safeWrite(session === null ? null : JSON.stringify(session));
}

/**
 * 이 브라우저 안에서만 유효한 식별자.
 * 서버가 붙으면 진짜 PK 로 대체된다. 그때까지 화면이 `user.id` 를 기대하는
 * 자리를 비워 두지 않기 위한 값이다.
 */
export function nextLocalId(): number {
  return Date.now();
}
