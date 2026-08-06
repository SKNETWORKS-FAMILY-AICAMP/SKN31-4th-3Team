/*
 * data/counselOpenings.ts
 * ───────────────────────────────────────────────────────────────────────
 * 상담 첫 줄. 조우에서 건넨 말을 그 사람이 이어 간다.
 *
 * ★ 왜 만들었나
 *   서버 없이 돌 때(mock) 열세 은하가 전부 같은 첫 인사를 냈다.
 *   "편하게 이야기를 시작해 주세요" — 누구와 상담하든 같은 문장이라,
 *   인물을 고르는 일이 화면에서 의미를 잃었다.
 *
 * ★ 조우 멘트를 다시 쓴다
 *   별이 상징으로 모이고 그 사람이 한마디 건넨 직후에 대화창이 열린다.
 *   거기서 전혀 다른 인사가 나오면 방금 만난 사람과 지금 말하는 사람이
 *   같은 사람인지 알 수 없다. 첫 줄을 조우 멘트로 시작하면 두 화면이
 *   한 장면으로 이어진다.
 *
 * ★ 서버가 붙으면 서버가 이긴다
 *   실제 인사는 llm_core/prompts/personas.py 의 greeting 이고 여기보다
 *   길고 결이 살아 있다. 이 파일은 백엔드 없이도 화면이 제 모습을
 *   보이게 하는 대역이다. 두 벌을 억지로 맞추려 들지 않는다 —
 *   맞추려는 순간 한쪽을 고칠 때마다 다른 쪽을 찾아다녀야 한다.
 */

import { emblemOf } from './emblems';

/**
 * 조우 멘트 뒤에 붙는 한 줄.
 *
 * 인물별로 다른 문장을 쓰지 않는다. 결은 이미 앞 문장이 만들었고,
 * 여기서 또 개성을 내면 두 문장이 서로 경쟁한다. 대신 무엇을 물을지는
 * 인물마다 다르게 고른다.
 */
const FOLLOW_UPS: readonly string[] = [
  '무엇부터 이야기해 볼까요.',
  '어떤 이야기를 가지고 오셨는지 궁금합니다.',
  '천천히 말씀하셔도 됩니다.',
  '지금 가장 크게 걸리는 것부터 들려주세요.',
  '정리되지 않은 채로 말씀하셔도 괜찮습니다.',
];

/**
 * 은하 id 로 하나를 고른다.
 *
 * ★ 무작위를 쓰지 않는다.
 *   같은 사람이 볼 때마다 다른 말로 맞이하면 그 사람의 결이 흐려진다.
 *   id 의 글자 코드 합으로 고르면 언제나 같은 문장이 나온다.
 */
function followUpFor(galaxyId: string): string {
  let sum = 0;
  for (let i = 0; i < galaxyId.length; i += 1) sum += galaxyId.charCodeAt(i);
  return FOLLOW_UPS[sum % FOLLOW_UPS.length];
}

/**
 * 그 인물의 첫 줄.
 *
 * @param galaxyId 조우한 은하. 없으면 인물이 정해지지 않은 상태다.
 * @param verseLead 구절에서 이어 왔다면 그 안내 문장
 */
export function counselOpening(
  galaxyId: string | undefined,
  verseLead?: string,
): string {
  const emblem = galaxyId ? emblemOf(galaxyId) : undefined;

  if (!emblem) {
    // 인물이 없다 — 예전 문장을 그대로 쓴다
    return verseLead
      ? `${verseLead}\n무엇부터 이야기해 볼까요.`
      : '편하게 이야기를 시작해 주세요. 어떤 이야기든 괜찮습니다.';
  }

  /*
   * 줄바꿈은 의미 단위로만 넣는다.
   * 첫 줄은 방금 건넨 말, 둘째 줄은 지금 여는 말이다.
   */
  const lead = verseLead ? `\n${verseLead}` : '';
  return `${emblem.greeting}${lead}\n${followUpFor(galaxyId!)}`;
}
