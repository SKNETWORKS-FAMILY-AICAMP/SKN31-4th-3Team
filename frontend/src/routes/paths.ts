/*
 * routes/paths.ts
 * 라우트 경로 단일 소스. 화면 코드에 문자열 경로를 흩지 않는다.
 */

export const PATHS = {
  intro: '/',
  home: '/home',
  ask: '/ask',
  sky: '/sky',
  verse: '/verse/:id',
  counsel: '/counsel',
  settings: '/settings',
  auth: '/auth',
} as const;

export function askPath(question: string): string {
  return `${PATHS.ask}?q=${encodeURIComponent(question)}`;
}

export function versePath(id: string): string {
  return `/verse/${encodeURIComponent(id)}`;
}

/**
 * 하늘로 들어가는 경로.
 *
 * @param focusId 조준할 별
 * @param options.travel
 *   true 면 "그 별까지 날아간 뒤 구절을 연다"는 뜻이다.
 *   답변에서 구절을 고른 경우가 여기에 해당한다 — 사용자는 이미 그 구절을
 *   보겠다고 정했으므로, 하늘에 내려놓고 다시 찾게 하면 안 된다.
 *   false(기본)면 카메라만 그 별을 향하고 화면은 탐색 상태로 남는다.
 */
export function skyPath(focusId?: string, options: { travel?: boolean } = {}): string {
  if (!focusId) return PATHS.sky;
  const search = new URLSearchParams({ focus: focusId });
  if (options.travel) search.set('travel', '1');
  return `${PATHS.sky}?${search.toString()}`;
}

/** skyPath 의 travel 플래그 이름. 읽는 쪽과 쓰는 쪽이 같은 문자열을 쓰게 한다. */
export const TRAVEL_PARAM = 'travel';

/**
 * 구절 상세를 닫았을 때 돌아갈 곳.
 *
 * ★ focus 를 남기지 않는 것이 핵심이다.
 *   ?focus= 를 붙이면 카메라가 그 별에 붙은 채로 멈춰 서서, 다른 은하를
 *   다시 보려면 사용자가 직접 끌어서 빠져나와야 한다. 닫는다는 것은
 *   "이 구절에서 물러난다"는 뜻이므로 시야도 함께 넓어져야 한다.
 */
export function verseClosePath(): string {
  return PATHS.sky;
}

export function counselPath(params: { from?: string; q?: string } = {}): string {
  const search = new URLSearchParams();
  if (params.from) search.set('from', params.from);
  if (params.q) search.set('q', params.q);
  const qs = search.toString();
  return qs ? `${PATHS.counsel}?${qs}` : PATHS.counsel;
}
