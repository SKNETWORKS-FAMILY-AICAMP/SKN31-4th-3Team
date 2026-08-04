/*
 * components/home/QuestionComposer.test.tsx
 * Phase 3 검증 기준: 한글 IME 조합 중 Enter 가 전송으로 오탐되지 않는가.
 *
 * 이 테스트가 없으면 리팩터링 중에 조용히 깨진다. 그리고 깨지면
 * 사용자는 글자를 확정할 때마다 질문이 날아가는 경험을 하게 된다.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuestionComposer, isComposingEnter, MAX_QUESTION_LENGTH } from './QuestionComposer';
import { GalaxyProvider } from '../../state/GalaxyContext';

function renderComposer(onSubmit = vi.fn()) {
  render(
    <GalaxyProvider>
      <QuestionComposer placeholder="적어보세요" onSubmit={onSubmit} />
    </GalaxyProvider>,
  );
  return {
    onSubmit,
    textarea: screen.getByLabelText('마음에 있는 것을 적어 질문하기') as HTMLTextAreaElement,
    button: screen.getByRole('button', { name: '물어보기' }) as HTMLButtonElement,
  };
}

describe('isComposingEnter', () => {
  const base = { key: 'Enter', keyCode: 13, nativeEvent: {} } as never;

  it('조합 플래그가 켜져 있으면 조합 확정으로 본다', () => {
    expect(isComposingEnter(base, true)).toBe(true);
  });

  it('nativeEvent.isComposing 이 true 면 조합 확정으로 본다', () => {
    const e = { key: 'Enter', keyCode: 13, nativeEvent: { isComposing: true } } as never;
    expect(isComposingEnter(e, false)).toBe(true);
  });

  it('구형 브라우저의 keyCode 229 도 조합으로 본다', () => {
    const e = { key: 'Enter', keyCode: 229, nativeEvent: {} } as never;
    expect(isComposingEnter(e, false)).toBe(true);
  });

  it('조합이 아닌 Enter 는 전송이다', () => {
    expect(isComposingEnter(base, false)).toBe(false);
  });

  it('Enter 가 아닌 키는 항상 false', () => {
    const e = { key: 'a', keyCode: 65, nativeEvent: { isComposing: true } } as never;
    expect(isComposingEnter(e, false)).toBe(false);
  });
});

describe('QuestionComposer', () => {
  it('한글 조합 중 Enter 는 전송하지 않는다', () => {
    const { onSubmit, textarea } = renderComposer();

    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: '안녕하세' } });
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('조합이 끝난 뒤의 Enter 는 전송한다', () => {
    const { onSubmit, textarea } = renderComposer();

    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: '불안해요' } });
    fireEvent.compositionEnd(textarea, { target: { value: '불안해요' } });
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 13 });

    expect(onSubmit).toHaveBeenCalledWith('불안해요');
  });

  it('Shift+Enter 는 전송이 아니라 개행이다', () => {
    const { onSubmit, textarea } = renderComposer();

    fireEvent.change(textarea, { target: { value: '첫 줄' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('공백만 입력하면 전송되지 않고 버튼도 비활성이다', () => {
    const { onSubmit, textarea, button } = renderComposer();

    fireEvent.change(textarea, { target: { value: '    ' } });
    expect(button).toBeDisabled();

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('앞뒤 공백은 제거해서 전송한다', () => {
    const { onSubmit, textarea } = renderComposer();

    fireEvent.change(textarea, { target: { value: '  진로가 고민이에요  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('진로가 고민이에요');
  });

  it('입력 상한을 넘겨도 잘려서 유지된다', () => {
    const { textarea } = renderComposer();

    fireEvent.change(textarea, { target: { value: 'ㄱ'.repeat(MAX_QUESTION_LENGTH + 50) } });
    expect(textarea.value).toHaveLength(MAX_QUESTION_LENGTH);
  });

  it('입력을 시작하면 onEngage 가 한 번만 호출된다', () => {
    const onEngage = vi.fn();
    render(
      <GalaxyProvider>
        <QuestionComposer placeholder="p" onSubmit={vi.fn()} onEngage={onEngage} />
      </GalaxyProvider>,
    );
    const textarea = screen.getByLabelText('마음에 있는 것을 적어 질문하기');

    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: 'ㅁ' } });
    fireEvent.change(textarea, { target: { value: '마음' } });

    expect(onEngage).toHaveBeenCalledTimes(1);
  });
});
