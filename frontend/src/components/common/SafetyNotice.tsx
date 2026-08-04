/*
 * components/common/SafetyNotice.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 안전 안내 상태.
 *
 * 사용자의 발화에서 자해·응급 위험 신호가 감지되면, 구절을 추천하는 대신
 * 이 화면으로 분기한다.
 *
 * 원칙:
 *  - 의료·법률·위기 상황에 대한 전문 조언을 하지 않는다.
 *  - 감정을 축소하거나 훈계하지 않는다. 판단하지 않고 곁에 있겠다는 톤.
 *  - 대화를 차단하지 않는다. 사용자가 원하면 계속 이야기할 수 있어야 한다.
 *  - 상담 창구의 비밀보장·절차를 단정해 약속하지 않는다.
 *
 * ★ 이 컴포넌트는 목업 단계부터 존재해야 한다.
 *   실제 서비스에 붙일 때 급히 만들면 톤을 그르치기 쉽다.
 */

import { Button } from './Button';
import styles from './SafetyNotice.module.css';

interface Props {
  /** 안내를 닫고 계속 이야기하기 */
  onContinue: () => void;
  /** 처음으로 돌아가기 */
  onBack: () => void;
}

export function SafetyNotice({ onContinue, onBack }: Props) {
  return (
    <section className={styles.notice} role="alert" aria-labelledby="safety-title">
      <p className="u-eyebrow">잠시 멈추고</p>

      <h2 id="safety-title" className={styles.title}>
        지금 많이 힘드신 것 같아 걱정이 됩니다
      </h2>

      <p className={styles.body}>
        이 이야기를 꺼내 주셔서 고맙습니다. 지금은 구절을 찾기보다, 곁에 있어 줄 사람과
        연결되는 일이 먼저였으면 합니다. 혼자 감당하지 않으셨으면 합니다.
      </p>

      <p className={styles.body}>
        가까운 사람에게 지금의 마음을 그대로 말해보시거나, 전문 상담 창구의 도움을 받아
        보시길 권합니다. 급한 위험이 느껴진다면 즉시 주변에 도움을 요청해 주세요.
      </p>

      <div className={styles.actions}>
        {/*
          TODO(api): 실제 서비스 연동 시 지역·언어에 맞는 공식 상담 창구를
          서버에서 내려받아 이 자리에 노출한다. 목업에서는 잘못된 번호를
          넣지 않기 위해 의도적으로 비워 둔다.
        */}
        <Button variant="primary" onClick={onContinue}>
          그래도 계속 이야기하기
        </Button>
        <Button variant="quiet" onClick={onBack}>
          처음으로
        </Button>
      </div>

      <p className={styles.footnote}>
        저는 전문 상담사가 아니며, 위급한 상황에서 도움을 드릴 수 없습니다.
      </p>
    </section>
  );
}
