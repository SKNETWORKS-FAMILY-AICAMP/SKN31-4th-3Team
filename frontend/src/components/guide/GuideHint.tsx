/*
 * components/guide/GuideHint.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 둘러보기를 그만둔 직후의 한 줄.
 *
 * ★ 왜 필요한가
 *   튜토리얼은 처음 한 번만 자동으로 뜬다. 실수로 닫았거나 나중에 다시
 *   보고 싶어진 사람에게, 다시 뜨지 않도록 만들어 둔 장치가 그대로 함정이
 *   된다. 어디서 다시 여는지 그 자리에서 알려 준다.
 *
 * ★ 스스로 사라진다
 *   닫으라고 또 시키지 않는다. 방금 무언가를 닫은 사람에게 닫을 것을
 *   하나 더 주는 셈이기 때문이다. 몇 초 뒤 조용히 걷힌다.
 *
 * ★ 화면을 막지 않는다
 *   포인터를 통과시킨다. 이 한 줄 때문에 별 하나가 안 눌리면 안 된다.
 */

import styles from './GuideHint.module.css';

interface Props {
  show: boolean;
  /** 바로 다시 열기. 실수로 닫은 사람에게 가장 짧은 길이다. */
  onReopen: () => void;
}

export function GuideHint({ show, onReopen }: Props) {
  if (!show) return null;

  return (
    <div className={styles.root} role="status">
      <p className={styles.text}>
        둘러보기는 <strong className={styles.where}>환경설정</strong> 에서 다시 열 수 있습니다.
      </p>
      <button type="button" className={styles.reopen} onClick={onReopen}>
        지금 다시 보기
      </button>
    </div>
  );
}
