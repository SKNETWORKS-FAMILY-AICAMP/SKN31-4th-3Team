/*
 * data/guideSteps.ts
 * ───────────────────────────────────────────────────────────────────────
 * 튜토리얼 시나리오.
 *
 * ★ 읽는 안내가 아니라 해 보는 안내다
 *   손이 한 번 움직인 기억은 문장 열 줄보다 오래 남는다.
 *
 * ★ 가운데를 막지 않는다
 *   화면 한가운데서 무언가를 해 보라고 하면서 그 자리를 안내창으로
 *   덮으면 안 된다. 그런 단계는 `stage` 로 표시해 차단막을 걷고 카드를
 *   구석으로 물린다.
 *
 * ★ 건너뛰면 진짜로 건너뛴다
 *   "가입은 나중에" 를 골랐는데 가입 화면으로 끌려가면 그건 건너뛴 것이
 *   아니다. 분기의 시작 단계에 `skipTo` 를 두어 뒤따르는 단계를 통째로
 *   넘긴다.
 *
 * ★ 문장은 짧게, 줄은 직접 끊는다
 *   본문은 `white-space: pre-line` 으로 그려진다. 여기서 넣은 줄바꿈이
 *   그대로 보이므로, 카드 폭에 맞춰 의미 단위로 끊어 둔다.
 */

import type { GuideRequirement } from '../components/guide/requirement';
import { PATHS } from '../routes/paths';

/**
 * 다음 단계로 넘어가는 방법.
 *
 * - `next`    : "다음"을 눌러야 넘어간다. 설명만 하는 단계.
 * - `interact`: 가리킨 것을 실제로 누르면 넘어간다.
 */
export type GuideAdvance = 'next' | 'interact';

/**
 * 이 단계를 보여 줄 조건.
 *
 * `signedOut` 인 단계는 이미 로그인한 사람에게 뜨지 않는다.
 * 로그인한 사람에게 "회원가입을 눌러 볼까요?" 를 권하고, 눌렀더니
 * 로그인 화면이 열리는 것은 안내가 아니라 사고다.
 */
export type GuideWhen = 'signedOut';

export interface GuideStep {
  id: string;
  /** 단계 위에 얹히는 아주 작은 라벨 */
  eyebrow: string;
  title: string;
  /** 두세 줄. 줄바꿈은 여기서 직접 넣는다. */
  body: string;
  /** 권유 문구. 없으면 설명만 하는 단계다. */
  action?: string;
  /**
   * 가리킬 요소의 CSS 선택자.
   * 대상에는 `data-guide` 속성을 붙인다 — 클래스명은 CSS Modules 가
   * 해시로 바꾸므로 선택자로 쓸 수 없다.
   */
  anchor?: string;
  /**
   * 이 단계에 처음 들어설 때 데려갈 화면.
   *
   * ★ 들어설 때 한 번뿐이다.
   *   그 뒤에는 사용자가 어디로 가든 따라가지 않는다. 계속 감시하면
   *   가입을 마치고 홈으로 나온 사람을 가입 화면으로 도로 끌고 온다.
   */
  route?: string;
  /**
   * 그 화면으로 갈 때 함께 넘길 상태.
   *
   * 계정 화면은 기본이 로그인 모드다. 가입을 설명하는 단계가 그냥 보내면
   * 이름·유형 칸이 없는 화면이 뜨고, 안내가 가리킬 것이 사라진다.
   */
  routeState?: Record<string, unknown>;
  advance?: GuideAdvance;
  /**
   * "건너뛰고 다음"을 눌렀을 때 갈 단계.
   *
   * 이 값이 있는 단계는 분기의 입구다 — 뒤따르는 몇 단계가 이 선택에만
   * 의미가 있다. 건너뛰면 그것들을 통째로 넘긴다.
   */
  skipTo?: string;
  /**
   * 무대 단계.
   *
   * 차단막을 걷고 카드를 화면 구석으로 물린다. 사용자가 화면 한가운데를
   * 마음껏 만져 봐야 하는 단계에 쓴다 — 시점 돌리기, 별 고르기처럼.
   */
  stage?: boolean;
  /** 이 단계를 보여 줄 조건. 없으면 항상 보여 준다. */
  when?: GuideWhen;
  /**
   * 채워야 넘어갈 수 있는 조건.
   *
   * 가입 폼처럼, 비운 채로 넘어가면 다음 설명이 말이 되지 않는 자리에 쓴다.
   * 조건은 `anchor` 안쪽을 보고 판정한다.
   *
   * ★ 막는 것은 "다음"뿐이다.
   *   건너뛰기는 언제나 열려 있다 — 튜토리얼이 가입을 강요하는 도구가
   *   되면 안 된다.
   */
  require?: GuideRequirement;
  /**
   * 곁가지 단계.
   *
   * "다음"으로는 지나가지 않는다. 사용자가 스스로 그 화면에 들어섰을 때만
   * 열린다 — 질문을 적어 답변 화면으로 넘어갔다거나, 별을 눌러 구절을
   * 열었다거나.
   *
   * ★ 왜 필요한가
   *   튜토리얼이 정해 둔 길만 따라가면, 사용자가 중간에 다른 데로 가는
   *   순간 안내가 엉뚱한 화면을 가리킨 채 멈춘다. 곁가지를 두면 어디로
   *   가든 그 자리에 맞는 설명이 따라붙는다.
   */
  detour?: boolean;
}

/**
 * 지금 경로에 해당하는 단계인가.
 *
 * 구절 상세는 `/verse/:id` 라 정확히 일치하지 않는다. 경로가 그 아래로
 * 뻗는 경우까지 같은 단계로 본다.
 */
export function stepMatchesPath(step: GuideStep, pathname: string): boolean {
  if (!step.route) return false;
  if (step.route === pathname) return true;
  return pathname.startsWith(`${step.route}/`);
}

/** 안내 대상임을 표시하는 속성 이름. 붙이는 쪽과 찾는 쪽이 같은 문자열을 쓰게 한다. */
export const GUIDE_ATTR = 'data-guide';

/** `[data-guide="composer"]` 형태의 선택자를 만든다. */
export function guideAnchor(name: string): string {
  return `[${GUIDE_ATTR}="${name}"]`;
}

/**
 * 화면에 실제로 붙어 있는 대상 이름.
 *
 * 여기 없는 이름을 시나리오가 가리키면 링이 그려지지 않고 카드만 가운데
 * 뜬다 — 화면은 멀쩡해 보이므로 아무도 눈치채지 못한다.
 */
export const GUIDE_TARGETS = [
  'signup',
  'authFields',
  'authMbti',
  'authSubmit',
  'greeting',
  'composer',
  'answerVerses',
  'chips',
  'sky',
  'mbti',
  'menu',
] as const;

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: 'welcome',
    eyebrow: '함께 둘러보기',
    title: '여기는 말씀이 놓인 하늘입니다',
    body:
      '배경의 별 하나하나가 실제 성경 구절입니다.\n' +
      '잠깐 같이 걸으며 쓰는 법을 익혀 보시죠.',
    action: '2분이면 끝납니다. 언제든 그만두셔도 됩니다.',
    route: PATHS.home,
  },

  /* ── 가입 분기 ─────────────────────────────────────────────────
     이미 로그인한 사람에게는 통째로 뜨지 않는다 (when: signedOut).
     건너뛰면 아래 세 단계도 함께 넘긴다 — "나중에"를 골랐는데 가입
     화면이 뜨면 그건 건너뛴 것이 아니다.                              */
  {
    id: 'signup',
    eyebrow: '계정',
    title: '먼저 자리를 하나 만들어 둡니다',
    body:
      '이름과 결을 남겨 두면 하늘이 조금 달라집니다.\n' +
      '오른쪽 위에 늘 있는 자리입니다.',
    action: '회원가입을 눌러 볼까요?',
    anchor: guideAnchor('signup'),
    route: PATHS.home,
    advance: 'interact',
    skipTo: 'greeting',
    when: 'signedOut',
  },
  {
    id: 'name',
    eyebrow: '입력',
    title: '세 칸을 채웁니다',
    body:
      '이메일, 이름, 비밀번호 순입니다.\n' +
      '이름은 홈에서 맞이할 때 쓰는 호칭입니다.\n' +
      '비밀번호는 8자 이상으로 정해 주세요.',
    action: '세 칸을 모두 채워 보세요.',
    anchor: guideAnchor('authFields'),
    require: 'filled',
    route: PATHS.auth,
    routeState: { mode: 'register' },
    skipTo: 'greeting',
    when: 'signedOut',
  },
  {
    id: 'mbti',
    eyebrow: '결',
    title: '열여섯 중 하나를 고릅니다',
    body:
      '사람을 규정하려는 것이 아니라\n' +
      '어디서부터 볼지 좁히는 장치입니다.',
    action: '마음에 닿는 것을 하나 골라 보세요.',
    anchor: guideAnchor('authMbti'),
    require: 'chosen',
    route: PATHS.auth,
    routeState: { mode: 'register' },
    skipTo: 'greeting',
    when: 'signedOut',
  },
  {
    id: 'submit',
    eyebrow: '마무리',
    title: '다 채우셨다면',
    body:
      '가입을 마치면 홈으로 돌아가 이어집니다.\n' +
      '지금 하지 않으셔도 됩니다.',
    anchor: guideAnchor('authSubmit'),
    route: PATHS.auth,
    routeState: { mode: 'register' },
    skipTo: 'greeting',
    when: 'signedOut',
  },

  {
    id: 'greeting',
    eyebrow: '홈',
    title: '이름으로 맞이합니다',
    body:
      '이 자리에서 이름으로 인사드립니다.\n' +
      '계정이 있으면 나눈 대화도 이어집니다.',
    anchor: guideAnchor('greeting'),
    route: PATHS.home,
  },
  {
    id: 'composer',
    eyebrow: '질문',
    title: '마음에 있는 것을 그대로',
    body:
      '장·절을 몰라도 됩니다.\n' +
      '"요즘 잠이 오지 않아요" 처럼 적으면\n' +
      '결이 닿는 구절을 찾아 드립니다.',
    action: '한 문장 적고 보내 보세요.',
    anchor: guideAnchor('composer'),
    route: PATHS.home,
  },

  /* ── 곁가지 ────────────────────────────────────────────────────
     "다음"으로는 지나가지 않는다. 사용자가 실제로 질문을 보내
     답변 화면으로 넘어갔을 때만 열린다.                              */
  {
    id: 'answer',
    eyebrow: '답변',
    title: '읽고, 하나를 고릅니다',
    body:
      '먼저 지금 마음을 짚어 드리고\n' +
      '결이 닿는 구절 몇을 함께 놓아 드립니다.\n' +
      '고르면 그 별까지 날아갑니다.',
    action: '마음이 가는 구절을 하나 골라 보세요.',
    anchor: guideAnchor('answerVerses'),
    route: PATHS.ask,
    detour: true,
    stage: true,
  },
  {
    id: 'counsel',
    eyebrow: '대화',
    title: '구절을 두고 이어서 이야기합니다',
    body:
      '방금 읽은 구절이 대화의 바탕이 됩니다.\n' +
      '계정이 있으면 여기 나눈 이야기가 남습니다.',
    route: PATHS.counsel,
    detour: true,
    stage: true,
  },

  {
    id: 'chips',
    eyebrow: '시작점',
    title: '무엇부터 물을지 모르겠다면',
    body:
      '먼저 건네 보는 질문들입니다.\n' +
      '눌러서 그대로 시작하거나 고쳐 쓰셔도 됩니다.',
    anchor: guideAnchor('chips'),
    route: PATHS.home,
  },

  /* ── 하늘 분기 ─────────────────────────────────────────────────
     아래 세 단계는 하늘에서만 의미가 있다. 건너뛰면 메뉴로 넘어간다.  */
  {
    id: 'enterSky',
    eyebrow: '하늘',
    title: '질문 없이 하늘부터 열 수도 있습니다',
    body:
      '가운데는 예수 그리스도,\n' +
      '둘레를 도는 열둘은 제자들의 은하입니다.',
    action: '눌러서 들어가 볼까요?',
    anchor: guideAnchor('sky'),
    route: PATHS.home,
    advance: 'interact',
    skipTo: 'menu',
  },
  {
    id: 'navigate',
    eyebrow: '시점',
    title: '끌어서 돌리고, 눌러서 다가갑니다',
    body:
      '빈 곳을 끌면 시점이 돌아갑니다.\n' +
      '은하 위에 올리면 이름과 결이 뜹니다.',
    action: '은하를 누르고 구절을 확인해보세요.',
    route: PATHS.sky,
    stage: true,
    skipTo: 'menu',
  },
  {
    id: 'stars',
    eyebrow: '별',
    title: '별을 고르면 그 구절로 날아갑니다',
    body:
      '별을 잇는 흐린 선은 구절 사이의 관계입니다.\n' +
      '도착하면 구절과 배경 이야기, 묵상할 거리가 열립니다.',
    action: '별 하나를 눌러 보세요.',
    route: PATHS.sky,
    stage: true,
    skipTo: 'menu',
  },

  /* 별을 실제로 눌러 구절이 열렸을 때만 나타난다 */
  {
    id: 'verse',
    eyebrow: '구절',
    title: '구절 하나에 머무릅니다',
    body:
      '본문과 배경 이야기, 묵상할 거리가 놓여 있습니다.\n' +
      '더 이야기하고 싶으시면\n' +
      '"상담 이어가기"로 넘어갈 수 있습니다.',
    route: '/verse',
    detour: true,
    stage: true,
  },

  {
    id: 'filter',
    eyebrow: '좁히기',
    title: '가까운 은하만 남겨 봅니다',
    body:
      '고르면 결이 닿는 은하만 남고\n' +
      '나머지는 잠시 물러납니다.\n' +
      '다시 누르면 원래대로 돌아옵니다.',
    action: '오른쪽에서 하나 눌러 보세요.',
    anchor: guideAnchor('mbti'),
    route: PATHS.sky,
    stage: true,
  },

  {
    id: 'menu',
    eyebrow: '이동',
    title: '어디서든 여기로 돌아옵니다',
    body:
      '홈, 별자리, 환경설정으로 오갑니다.\n' +
      '이 안내도 환경설정에서 다시 열 수 있습니다.',
    anchor: guideAnchor('menu'),
  },
  {
    id: 'care',
    eyebrow: '마지막',
    title: '급한 도움이 필요할 때는',
    body:
      'Eden 은 상담이나 진료를 대신하지 않습니다.\n' +
      '많이 힘드시다면 곁에 있는 사람이나\n' +
      '전문 기관에 먼저 닿으시길 권합니다.',
  },
];
