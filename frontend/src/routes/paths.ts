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
  /** 회원정보 수정과 탈퇴. 로그인한 사람만 들어온다. */
  account: '/account',
} as const;

/** 이어 볼 대화방 id. counselPath 와 CounselRoute 가 같은 문자열을 쓰게 한다. */
export const THREAD_PARAM = 'thread';

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

/** 은하 하나를 열어 둔 채로 하늘에 들어가는 입구. */
export const GALAXY_PARAM = 'galaxy';

/** 도착한 뒤에 이어서 갈 곳. */
export const THEN_PARAM = 'then';

/**
 * 앱 안의 주소인지 확인한다.
 *
 * ★ 왜 검사하는가
 *   ?then= 은 주소창에 그대로 노출된다. 검사 없이 navigate 에 넘기면
 *   "…/sky?galaxy=john&travel=1&then=https://남의사이트" 같은 링크로
 *   우리 화면을 거쳐 밖으로 내보낼 수 있다. 링크를 받은 사람은 우리
 *   도메인만 보고 누른다.
 *
 *   그래서 "/" 로 시작하되 "//" 로는 시작하지 않는 것만 통과시킨다.
 *   //evil.com 은 프로토콜 상대 URL 이라 외부로 나간다.
 */
export function internalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/**
 * 별 하나가 아니라 은하 하나로 간다.
 *
 * ★ focus 로 대신하지 않는 이유
 *   focus 는 별 id 다. 은하를 열려고 그 안의 아무 별이나 골라 넣으면,
 *   사용자는 자기가 고르지도 않은 구절 앞에 도착한다. "이 은하로
 *   안내합니다" 와 "이 구절을 보세요" 는 다른 말이다.
 */
export function galaxyPath(
  galaxyId: string,
  options: { travel?: boolean; then?: string } = {},
): string {
  const search = new URLSearchParams({ [GALAXY_PARAM]: galaxyId });
  // 카메라가 날아가서 도착한 뒤에 열린다. 없으면 그냥 그 자리에 놓인다.
  if (options.travel) search.set(TRAVEL_PARAM, '1');
  // 도착하면 이어서 갈 곳 (상담 화면 등). 없으면 구절 목록이 열린다.
  if (options.then) search.set(THEN_PARAM, options.then);
  return `${PATHS.sky}?${search.toString()}`;
}

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

export function counselPath(
  params: { from?: string; q?: string; galaxy?: string; thread?: string } = {},
): string {
  const search = new URLSearchParams();
  /*
   * ★ 이어 보기가 다른 값들을 이긴다.
   *   지난 대화를 여는 것과 새 대화를 여는 것은 다른 일이다. 둘이 섞이면
   *   "이어 보려고 눌렀는데 새 대화가 열리는" 상태가 된다.
   */
  if (params.thread) {
    search.set(THREAD_PARAM, params.thread);
    return `${PATHS.counsel}?${search.toString()}`;
  }
  if (params.from) search.set('from', params.from);
  if (params.q) search.set('q', params.q);
  // 답변 화면에서 이미 정해진 인물. 없으면 서버가 고른다.
  if (params.galaxy) search.set('galaxy', params.galaxy);
  const qs = search.toString();
  return qs ? `${PATHS.counsel}?${qs}` : PATHS.counsel;
}
