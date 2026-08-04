/*
 * components/guide/requirement.ts
 * ───────────────────────────────────────────────────────────────────────
 * "이건 채워야 넘어갑니다" 판정.
 *
 * ★ 왜 막는가
 *   가입 폼처럼 채워야만 다음 설명이 말이 되는 자리가 있다. 비운 채로
 *   넘어가면 "다 채우셨다면"이라는 안내가 빈 화면 위에 뜬다.
 *
 * ★ 가두지는 않는다
 *   막는 것은 "다음"뿐이다. 건너뛰기는 언제나 열려 있다 — 튜토리얼이
 *   가입을 강요하는 도구가 되면 안 된다.
 *
 * ★ 렌더에서 분리한 이유
 *   DOM 요소를 받아 판정만 하는 함수라 화면을 띄우지 않고 검증할 수 있다.
 */

/** 무엇을 요구하는가 */
export type GuideRequirement =
  /** 안의 입력 칸이 모두 채워지고 형식도 맞아야 한다 */
  | 'filled'
  /** 안에서 하나를 골라야 한다 (라디오·칩) */
  | 'chosen';

export interface RequirementResult {
  ok: boolean;
  /** 통과하지 못한 이유. 통과했으면 비어 있다. */
  message: string;
}

const OK: RequirementResult = { ok: true, message: '' };

/**
 * 왜 두 문구를 나누는가.
 *
 * 이메일에 "abc"를 적어 둔 사람에게 "입력을 해 주세요"라고 하면, 이미
 * 적었는데 왜 그러냐고 생각한다. 비어 있는 것과 형식이 틀린 것은 다른
 * 문제이므로 다르게 말한다.
 */
const EMPTY = '입력을 해 주세요.';
const INVALID = '형식을 다시 확인해 주세요.';
const UNCHOSEN = '하나를 골라 주세요.';

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function fieldsIn(root: Element): Field[] {
  return Array.from(root.querySelectorAll<Field>('input, textarea, select'));
}

export function checkRequirement(
  kind: GuideRequirement | undefined,
  root: Element | null,
): RequirementResult {
  // 요구가 없거나 가리킬 것이 없으면 막지 않는다.
  // 대상을 못 찾았다고 사용자를 세워 두면, 화면 구조가 바뀐 날 튜토리얼이
  // 통째로 잠긴다.
  if (!kind || !root) return OK;

  if (kind === 'chosen') {
    const picked = root.querySelector('[aria-checked="true"], input:checked');
    return picked ? OK : { ok: false, message: UNCHOSEN };
  }

  const fields = fieldsIn(root);
  if (fields.length === 0) return OK;

  if (fields.some((f) => f.value.trim().length === 0)) {
    return { ok: false, message: EMPTY };
  }

  /*
   * 형식 검사는 브라우저에 맡긴다.
   * type="email", minLength 같은 규칙을 여기서 다시 구현하면 폼과 튜토리얼이
   * 서로 다른 기준을 갖게 되고, 언젠가 반드시 어긋난다.
   */
  if (fields.some((f) => typeof f.checkValidity === 'function' && !f.checkValidity())) {
    return { ok: false, message: INVALID };
  }

  return OK;
}
