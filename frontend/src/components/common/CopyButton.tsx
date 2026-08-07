/*
 * components/common/CopyButton.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 글 한 덩어리를 클립보드로 옮긴다.
 *
 * ★ 결과를 글자로 알린다
 *   복사는 화면에 아무 흔적을 남기지 않는 동작이다. 눌렀는데 아무 일도
 *   안 일어난 것처럼 보이면 사람은 한 번 더 누른다. "복사됨" 한 마디가
 *   그 두 번째 클릭을 없앤다.
 *
 * ★ 클립보드 API 는 실패할 수 있다
 *   http(https 가 아닌 곳), 오래된 브라우저, 권한 거부 — 어느 쪽이든
 *   navigator.clipboard 가 없거나 거부한다. 우리 배포도 지금 http 다.
 *   그래서 execCommand 폴백을 남겨 둔다. 낡은 API 지만 이 경로에서는
 *   그것이 유일하게 동작하는 방법이다.
 *
 * ★ 실패를 삼키지 않는다
 *   둘 다 안 되면 "복사 실패" 를 보여 준다. 조용히 아무 일도 없으면
 *   사용자는 복사가 됐다고 믿고 붙여넣기에서 처음 알게 된다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './CopyButton.module.css';

/** 결과 문구가 머무는 시간 (ms) */
const FEEDBACK_MS = 1600;

type Status = 'idle' | 'copied' | 'failed';

interface Props {
  text: string;
  /** 스크린리더에 읽히는 이름. 무엇을 복사하는지 밝힌다. */
  label?: string;
}

/**
 * 클립보드에 쓴다. 두 경로를 차례로 시도한다.
 *
 * ★ 왜 async 인가
 *   navigator.clipboard.writeText 는 Promise 를 준다. 권한 대화상자가
 *   뜨는 브라우저도 있어서 즉시 끝나지 않는다.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한 거부이거나 보안 컨텍스트가 아니다. 아래로 물러선다.
  }

  try {
    /*
     * ★ 화면 밖에 두되 display:none 은 안 된다.
     *   숨긴 요소는 선택이 안 되고, 선택이 안 되면 복사도 안 된다.
     *   화면 밖으로 밀어내는 것이 이 낡은 방법의 정석이다.
     */
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label = '이 답변 복사' }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ★ 남은 타이머를 정리한다. 대화가 길어지면 이 버튼이 수십 개 뜬다.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = useCallback(async () => {
    const ok = await writeToClipboard(text);
    setStatus(ok ? 'copied' : 'failed');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus('idle'), FEEDBACK_MS);
  }, [text]);

  return (
    <button
      type="button"
      className={styles.button}
      onClick={() => void copy()}
      aria-label={label}
      data-status={status}
    >
      {status === 'idle' && <CopyIcon />}
      <span className={styles.text}>
        {status === 'copied' ? '복사됨' : status === 'failed' ? '복사 실패' : '복사'}
      </span>
    </button>
  );
}

/** 겹친 종이 두 장. 아이콘 폰트를 들이지 않고 선으로 그린다. */
function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <rect
        x="5.5" y="5.5" width="8" height="9" rx="1.5"
        fill="none" stroke="currentColor" strokeWidth="1.2"
      />
      <path
        d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1"
        fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      />
    </svg>
  );
}
