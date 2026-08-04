/*
 * data/openings.ts
 * ───────────────────────────────────────────────────────────────────────
 * 홈 화면 오프닝 문구 풀.
 *
 * 톤 원칙: 신적 권위를 대신 선포하지 않는다. 따뜻하고 목회적인 안내.
 * 매 방문/새로고침마다 이 풀에서 3~4개를 뽑아 보여준다.
 */

export interface Opening {
  id: string;
  /** 화면 중앙 큰 문구 */
  headline: string;
  /** 입력창 placeholder */
  placeholder: string;
}

export const OPENINGS: readonly Opening[] = [
  {
    id: 'lingering',
    headline: '오늘 마음에 가장 오래 남아 있는 일은 무엇인가요?',
    placeholder: '떠오르는 대로 적어보세요',
  },
  {
    id: 'comfort',
    headline: '지금 당신에게 필요한 위로를 함께 찾아볼까요?',
    placeholder: '어떤 위로가 필요한지 말씀해 주세요',
  },
  {
    id: 'hard-to-say',
    headline: '말하기 어려운 고민도 괜찮습니다. 천천히 들려주세요.',
    placeholder: '정리되지 않은 채로 적어도 됩니다',
  },
  {
    id: 'where',
    headline: '오늘 당신의 마음은 어디에 머물러 있나요?',
    placeholder: '머물러 있는 자리를 적어보세요',
  },
  {
    id: 'unfinished',
    headline: '아직 끝맺지 못한 이야기가 있다면, 여기서 이어가도 좋습니다.',
    placeholder: '어디서부터든 시작하셔도 됩니다',
  },
  {
    id: 'quiet',
    headline: '조용히 묻고 싶은 것이 있으신가요?',
    placeholder: '무엇이든 물어보세요',
  },
  {
    id: 'today',
    headline: '오늘 하루는 당신에게 어떤 날이었나요?',
    placeholder: '오늘을 한 문장으로 적어보세요',
  },
];

/** 홈 화면이 한 번에 보여줄 문구 수 */
export const OPENINGS_PER_VISIT = 4;

/** 문구 교대 주기(ms). 읽고 남을 만큼 충분히 느리게. */
export const OPENING_ROTATION_MS = 7200;

/**
 * 결정론적이지 않은 무작위 선택 — 방문마다 달라지는 것이 의도다.
 * 같은 문구가 중복해 뽑히지 않는다(뽑은 항목을 풀에서 제거).
 *
 * @param count 뽑을 개수
 */
export function pickOpenings(
  count = OPENINGS_PER_VISIT,
  random: () => number = Math.random,
): Opening[] {
  const pool = [...OPENINGS];
  const picked: Opening[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i += 1) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

/**
 * 추천 질문 칩용 문구.
 * 큐레이션 별의 relatedPrompts 에서 뽑으므로, 어떤 칩을 눌러도
 * 대응하는 별이 반드시 존재한다.
 */
export function pickSuggestedPrompts(
  prompts: readonly string[],
  count: number,
  random: () => number = Math.random,
): string[] {
  const pool = [...new Set(prompts)];
  const picked: string[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i += 1) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}
