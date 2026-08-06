/*
 * data/korean.ts
 * ───────────────────────────────────────────────────────────────────────
 * 한국어 조사.
 *
 * ★ "을(를)" 을 쓰지 않기 위해 있다.
 *   괄호 표기는 서류에서나 쓰는 것이다. 위로하려고 띄운 문장에 들어가면
 *   그 자리에서 "이건 사람이 쓴 문장이 아니다"가 드러난다. 이 서비스는
 *   문장이 거의 전부라, 조사 하나가 톤을 무너뜨린다.
 *
 * ★ 규칙은 유니코드에 이미 들어 있다.
 *   한글 음절은 (초성 × 21 × 28 + 중성 × 28 + 종성) 순으로 배열돼 있다.
 *   그래서 '가'부터의 거리를 28로 나눈 나머지가 곧 종성이고, 0이면
 *   받침이 없다. 사전도 표도 필요 없다.
 *
 * ★ 서버에도 같은 함수가 있다 (llm_core/matching.py::_object_particle).
 *   합치지 않는 이유는, 합치려면 조사 하나 때문에 런타임 호출을 만들어야
 *   하기 때문이다. 규칙이 바뀔 일이 없는 종류라 양쪽에 두고 각자 검사한다.
 */

const HANGUL_FIRST = 0xac00; // '가'
const HANGUL_LAST = 0xd7a3; // '힣'
const FINALS = 28; // 종성 개수 (없음 포함)

/**
 * 마지막 글자에 받침이 있는가.
 *
 * 한글이 아니면 false 로 본다 — 숫자·영문 뒤에서는 받침 없는 쪽 조사가
 * 대체로 자연스럽다. ("Eden를"이 "Eden을"보다 낫다)
 */
export function hasFinalConsonant(word: string): boolean {
  const last = word.trim().slice(-1);
  if (!last) return false;

  const code = last.charCodeAt(0);
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return false;

  return (code - HANGUL_FIRST) % FINALS !== 0;
}

/**
 * 단어에 맞는 조사를 붙인다.
 *
 * @example
 *   withParticle('요한', '와', '과')   // '요한과'
 *   withParticle('베드로', '와', '과') // '베드로와'
 *
 * @param withoutFinal 받침이 없을 때 (와 / 를 / 가 / 는)
 * @param withFinal    받침이 있을 때 (과 / 을 / 이 / 은)
 */
export function withParticle(
  word: string,
  withoutFinal: string,
  withFinal: string,
): string {
  return `${word}${hasFinalConsonant(word) ? withFinal : withoutFinal}`;
}

/** 목적격: 을 / 를 */
export const objectOf = (word: string) => withParticle(word, '를', '을');

/** 주격: 이 / 가 */
export const subjectOf = (word: string) => withParticle(word, '가', '이');

/** 동반격: 와 / 과 */
export const withOf = (word: string) => withParticle(word, '와', '과');

/** 보조사: 은 / 는 */
export const topicOf = (word: string) => withParticle(word, '는', '은');
