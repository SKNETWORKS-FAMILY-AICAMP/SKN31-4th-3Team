/*
 * "채워야 넘어간다" 판정.
 *
 * 이 함수가 틀리면 둘 중 하나가 일어난다 —
 * 다 채웠는데 막히거나(가장 나쁘다), 비었는데 통과해서 다음 설명이
 * 빈 화면 위에 뜨거나.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { checkRequirement } from './requirement';

function build(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('요구가 없을 때', () => {
  it('막지 않는다', () => {
    expect(checkRequirement(undefined, build('<input value="" />')).ok).toBe(true);
  });

  it('★ 가리킬 대상을 못 찾아도 막지 않는다', () => {
    /*
     * 대상을 못 찾았다고 사용자를 세워 두면, 화면 구조가 바뀐 날
     * 튜토리얼이 통째로 잠긴다. 모르면 통과시키는 쪽이 안전하다.
     */
    expect(checkRequirement('filled', null).ok).toBe(true);
  });
});

describe('filled — 다 채워야 한다', () => {
  it('비어 있으면 막고 입력을 청한다', () => {
    const root = build('<input type="text" value="" />');
    const result = checkRequirement('filled', root);

    expect(result.ok).toBe(false);
    expect(result.message).toBe('입력을 해 주세요.');
  });

  it('★ 한 칸만 비어도 막는다', () => {
    // 이름만 강조하던 시절, 이메일·비밀번호를 비운 채 가입을 눌렀다.
    const root = build(`
      <input type="email" value="a@b.com" />
      <input type="text" value="혁진" />
      <input type="password" value="" />
    `);
    expect(checkRequirement('filled', root).ok).toBe(false);
  });

  it('공백만 있는 것은 채운 것이 아니다', () => {
    const root = build('<input type="text" value="   " />');
    expect(checkRequirement('filled', root).ok).toBe(false);
  });

  it('다 채우면 통과한다', () => {
    const root = build(`
      <input type="email" value="a@b.com" />
      <input type="text" value="혁진" />
      <input type="password" value="password123" />
    `);
    expect(checkRequirement('filled', root).ok).toBe(true);
  });

  it('★ 형식이 틀리면 다른 말을 한다', () => {
    /*
     * 이메일에 "abc"를 적어 둔 사람에게 "입력을 해 주세요"라고 하면,
     * 이미 적었는데 왜 그러냐고 생각한다.
     */
    const root = build('<input type="email" value="abc" />');
    const result = checkRequirement('filled', root);

    expect(result.ok).toBe(false);
    expect(result.message).toBe('형식을 다시 확인해 주세요.');
  });

  it('입력 칸이 아예 없으면 막지 않는다', () => {
    expect(checkRequirement('filled', build('<p>설명</p>')).ok).toBe(true);
  });
});

describe('chosen — 하나는 골라야 한다', () => {
  it('고르지 않았으면 막고 고르기를 청한다', () => {
    const root = build(`
      <button role="radio" aria-checked="false">INFJ</button>
      <button role="radio" aria-checked="false">ENTP</button>
    `);
    const result = checkRequirement('chosen', root);

    expect(result.ok).toBe(false);
    expect(result.message).toBe('하나를 골라 주세요.');
  });

  it('하나라도 골랐으면 통과한다', () => {
    const root = build(`
      <button role="radio" aria-checked="false">INFJ</button>
      <button role="radio" aria-checked="true">ENTP</button>
    `);
    expect(checkRequirement('chosen', root).ok).toBe(true);
  });

  it('진짜 라디오 입력도 같이 본다', () => {
    // 지금 화면은 버튼 그리드지만, 나중에 input 으로 바뀌어도 계속 맞아야 한다.
    const root = build('<input type="radio" checked />');
    expect(checkRequirement('chosen', root).ok).toBe(true);
  });

  it('빈 채로 두면 막힌다', () => {
    expect(checkRequirement('chosen', build('<div></div>')).ok).toBe(false);
  });
});
