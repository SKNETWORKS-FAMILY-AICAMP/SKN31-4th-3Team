/*
 * components/home/QuestionComposer.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 질문 입력창.
 *
 * 한국어 입력에서 가장 흔한 버그를 여기서 막는다:
 *   한글은 IME 조합(composition)을 거친다. "안녕" 을 치는 도중 Enter 를
 *   누르면 그 Enter 는 "조합 확정"이지 "전송"이 아니다. 이걸 구분하지
 *   않으면 사용자가 글자를 확정할 때마다 질문이 전송된다.
 *
 * 그래서 두 겹으로 막는다:
 *   1) compositionstart/end 로 조합 상태를 직접 추적
 *   2) KeyboardEvent.isComposing (표준) 과 keyCode 229 (구형 브라우저)
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Button } from '../common/Button';
import styles from './QuestionComposer.module.css';

/** 입력 상한. 초과 입력을 막기보다 남은 글자를 알려주는 쪽을 택한다. */
export const MAX_QUESTION_LENGTH = 500;
/** 이 비율을 넘으면 글자 수를 노출한다. 평소에는 숨겨 화면을 비운다. */
const COUNTER_THRESHOLD = 0.8;
/** 자동 높이 최대치(px). 넘으면 내부 스크롤. */
const MAX_HEIGHT = 220;

/**
 * Enter 가 IME 조합 확정인지 판별한다.
 * 컴포넌트 밖으로 빼서 단위 테스트가 가능하게 한다.
 */
export function isComposingEnter(
  event: Pick<KeyboardEvent<HTMLTextAreaElement>, 'key' | 'keyCode' | 'nativeEvent'>,
  composingFlag: boolean,
): boolean {
  if (event.key !== 'Enter') return false;
  if (composingFlag) return true;
  // 표준: 조합 중 발생한 keydown 은 isComposing === true
  if ((event.nativeEvent as { isComposing?: boolean })?.isComposing) return true;
  // 구형 브라우저/일부 IME 는 keyCode 229 로만 알린다
  if (event.keyCode === 229) return true;
  return false;
}

interface Props {
  placeholder: string;
  onSubmit: (question: string) => void;
  /** 사용자가 입력을 시작했음을 알린다 (오프닝 문구 로테이션 정지용) */
  onEngage?: () => void;
  /** 하단에 렌더할 보조 정보 */
  hint?: string;
  disabled?: boolean;
  /** 스크린리더용 레이블. 화면에는 보이지 않는다. */
  label?: string;
  submitLabel?: string;
  /** 전송 후 입력창을 비운다 (대화 모드) */
  clearOnSubmit?: boolean;
}

/**
 * ★ 이 컴포넌트는 홈의 질문 입력과 상담 대화 입력에 함께 쓰인다.
 *   IME 처리 같은 까다로운 로직을 두 벌 유지하면 한쪽만 고쳐지고 어긋난다.
 */
export function QuestionComposer({
  placeholder,
  onSubmit,
  onEngage,
  hint,
  disabled,
  label = '마음에 있는 것을 적어 질문하기',
  submitLabel = '물어보기',
  clearOnSubmit = false,
}: Props) {
  // 한 화면에 두 개가 렌더돼도 id 가 충돌하지 않게 한다.
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const engagedRef = useRef(false);
  const [value, setValue] = useState('');

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !disabled;
  const showCounter = value.length >= MAX_QUESTION_LENGTH * COUNTER_THRESHOLD;

  // 자동 높이: 내용에 맞춰 늘어나되 상한을 둔다.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [value]);

  const engage = useCallback(() => {
    if (engagedRef.current) return;
    engagedRef.current = true;
    onEngage?.();
  }, [onEngage]);

  const submit = useCallback(() => {
    const question = value.trim();
    if (!question || disabled) return;
    onSubmit(question);
    if (clearOnSubmit) setValue('');
  }, [value, disabled, onSubmit, clearOnSubmit]);

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value.slice(0, MAX_QUESTION_LENGTH));
    engage();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Enter 는 언제나 개행이다.
    if (e.key === 'Enter' && e.shiftKey) return;

    if (isComposingEnter(e, composingRef.current)) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const onCompositionStart = () => {
    composingRef.current = true;
  };

  const onCompositionEnd = (e: CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false;
    // 조합이 끝나며 확정된 값을 반영한다.
    setValue((e.target as HTMLTextAreaElement).value.slice(0, MAX_QUESTION_LENGTH));
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    /* data-guide: 이용 안내가 가리키는 대상. 클래스명은 해시되므로 속성으로 표시한다. */
    <form className={styles.composer} onSubmit={onFormSubmit} data-guide="composer">
      <label htmlFor={fieldId} className={styles.srOnly}>
        {label}
      </label>

      <textarea
        id={fieldId}
        ref={textareaRef}
        className={styles.input}
        rows={1}
        placeholder={placeholder}
        value={value}
        maxLength={MAX_QUESTION_LENGTH}
        disabled={disabled}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={engage}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        aria-describedby={hintId}
      />

      <div className={styles.foot}>
        <p id={hintId} className={styles.hint}>
          {showCounter ? `${value.length} / ${MAX_QUESTION_LENGTH}자` : hint}
        </p>
        <Button variant="primary" type="submit" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
