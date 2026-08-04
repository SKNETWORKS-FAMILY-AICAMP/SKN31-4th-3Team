/*
 * routes/SettingsRoute.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 환경설정.
 *
 * ★ 실제로 바뀌는 것만 둔다
 *   눌러도 아무 일이 없는 스위치는 설정 화면 자체를 거짓말로 만든다.
 *   "기기 설정을 따릅니다" 같은 안내문만 있는 항목도 마찬가지다 —
 *   설정이 아니라 설명이므로 조절할 수 있게 만들거나 없애야 한다.
 *
 * ★ 고른 값은 남는다
 *   새로고침하면 되돌아가는 값은 설정이 아니라 임시 스위치다.
 *
 * ★ 은하수를 가리지 않는다
 *   다른 화면과 같은 반투명 패널을 쓰므로 뒤의 별이 계속 보인다.
 */

import { useNavigate } from 'react-router-dom';
import { useGalaxy } from '../state/GalaxyContext';
import { useAuth } from '../state/AuthContext';
import { forgetGuideSeen } from '../state/useGuideTour';
import { Button } from '../components/common/Button';
import type { MotionPreference, QualityMode } from '../services/preferences';
import { PATHS } from './paths';
import screen from './Screen.module.css';
import styles from './SettingsRoute.module.css';

interface Option<T> {
  value: T;
  label: string;
  hint: string;
}

/**
 * 'still' 은 목록에 없다.
 * 그건 사용자가 고르는 값이 아니라 "움직임 줄이기"의 결과이기 때문이다.
 */
const QUALITY_OPTIONS: readonly Option<QualityMode>[] = [
  { value: 'auto', label: '자동', hint: '기기에 맞춰 정하고\n느려지면 스스로 낮춥니다' },
  { value: 'high', label: '높음', hint: '별과 성운을\n가장 촘촘하게 그립니다' },
  { value: 'medium', label: '보통', hint: '대부분의 기기에서\n매끄럽습니다' },
  { value: 'low', label: '낮음', hint: '입자를 줄여\n배터리를 아낍니다' },
];

const MOTION_OPTIONS: readonly Option<MotionPreference>[] = [
  { value: 'system', label: '기기 설정 따르기', hint: '운영체제의 모션 줄이기를\n그대로 따릅니다' },
  { value: 'full', label: '움직이게', hint: '인트로와 카메라 이동을\n모두 보여 줍니다' },
  { value: 'reduced', label: '줄이기', hint: '정적인 하늘로 바꾸고\n카메라를 즉시 이동합니다' },
];

export function SettingsRoute() {
  const navigate = useNavigate();
  const {
    quality,
    qualityMode,
    setQualityMode,
    motionPreference,
    setMotionPreference,
    systemPrefersReducedMotion,
    reducedMotion,
  } = useGalaxy();
  const { user, logout } = useAuth();

  /*
   * 둘러보기를 다시 여는 길.
   *
   * 안내가 가리키는 것들은 홈에 있다. 여기서 바로 띄우면 가리킬 대상이 없어
   * 전부 화면 가운데 카드로만 뜬다 — 설명은 남지만 "어디를 말하는지"는
   * 사라진다. 그래서 홈으로 데려가면서 열라고 표시를 들려 보낸다.
   */
  const replayGuide = () => {
    forgetGuideSeen();
    navigate(PATHS.home, { state: { guide: true } });
  };

  return (
    <main className={screen.screen}>
      <div className={screen.topBar}>
        <Button variant="quiet" onClick={() => navigate(PATHS.home)}>
          ← 처음으로
        </Button>
      </div>

      <div className={`${screen.panel} ${screen.stack}`}>
        <header>
          <p className="u-eyebrow">환경설정</p>
          <h2 className="u-title">화면과 움직임</h2>
        </header>

        <section className={styles.section} aria-labelledby="quality-heading">
          <h3 className="u-eyebrow" id="quality-heading">
            화면 품질
          </h3>
          <p className="u-muted">
            자동으로 두면 기기 사양에 맞춰 시작합니다.
            <br />
            직접 고르시면 그 값이 유지됩니다 — 느려져도 낮추지 않습니다.
          </p>

          <div className={styles.options} role="radiogroup" aria-labelledby="quality-heading">
            {QUALITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={qualityMode === option.value}
                className={styles.option}
                onClick={() => setQualityMode(option.value)}
                disabled={reducedMotion}
              >
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionHint}>{option.hint}</span>
              </button>
            ))}
          </div>

          {/*
            자동일 때는 지금 몇 단계에 있는지 알려 준다.
            "자동"만 표시하면 사용자는 지금 무엇이 적용됐는지 알 수 없다.
          */}
          {qualityMode === 'auto' && !reducedMotion && (
            <p className={styles.state} role="status">
              지금 적용된 단계 —{' '}
              <strong>
                {QUALITY_OPTIONS.find((o) => o.value === quality.tier)?.label ?? quality.tier}
              </strong>
            </p>
          )}

          {reducedMotion && (
            <p className={styles.state} role="status">
              움직임을 줄이는 동안에는 품질이 정적 구성으로 고정됩니다.
            </p>
          )}
        </section>

        <section className={styles.section} aria-labelledby="motion-heading">
          <h3 className="u-eyebrow" id="motion-heading">
            움직임
          </h3>
          <p className="u-muted">
            인트로 연출과 카메라 이동을 어떻게 다룰지 정합니다.
            <br />
            기기 설정을 따르되, 여기서 덮어쓸 수도 있습니다.
          </p>

          <div className={styles.options} role="radiogroup" aria-labelledby="motion-heading">
            {MOTION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={motionPreference === option.value}
                className={styles.option}
                onClick={() => setMotionPreference(option.value)}
              >
                <span className={styles.optionLabel}>{option.label}</span>
                <span className={styles.optionHint}>{option.hint}</span>
              </button>
            ))}
          </div>

          <p className={styles.state} role="status">
            {motionPreference === 'system'
              ? systemPrefersReducedMotion
                ? '이 기기는 모션 줄이기가 켜져 있어, 정적인 하늘을 보여 드리고 있습니다.'
                : '이 기기는 모션 줄이기가 꺼져 있어, 연출을 모두 보여 드리고 있습니다.'
              : '기기 설정과 무관하게 여기서 정한 값을 씁니다.'}
          </p>
        </section>

        <section className={styles.section}>
          <h3 className="u-eyebrow">둘러보기</h3>
          <p className="u-body">
            처음 오셨을 때 보여 드린 안내입니다.
            <br />
            화면 구성과 조작을 다시 짚어 드립니다.
          </p>
          <div className={screen.row}>
            <Button variant="ghost" onClick={replayGuide}>
              둘러보기 다시 하기
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className="u-eyebrow">계정</h3>
          {user ? (
            <>
              <p className="u-body">
                <strong>{user.username}</strong>님으로 로그인되어 있습니다.
                <br />
                {user.mbti
                  ? `남기신 유형은 ${user.mbti} 입니다.`
                  : '아직 유형을 남기지 않으셨습니다.'}
                <br />
                {user.mbti
                  ? '오른쪽 목록에서 조용히 빛나고 있습니다.'
                  : '오른쪽 목록에서 고르시면 기억해 둡니다.'}
              </p>
              <div className={screen.row}>
                <Button variant="ghost" onClick={logout}>
                  로그아웃
                </Button>
              </div>
            </>
          ) : (
            /*
             * 로그인 버튼을 여기에 두지 않는다.
             * 계정은 오른쪽 위에 늘 있다 — 같은 일을 하는 버튼이 두 곳에
             * 있으면 사용자는 둘이 다른 것이라고 생각한다.
             */
            <p className="u-body">
              아직 로그인하지 않으셨습니다.
              <br />
              오른쪽 위에서 계정을 만들 수 있습니다.
              <br />
              이름과 유형을 남기시면 홈에서 이름으로 맞이하고, 대화가 저장됩니다.
              <br />
              둘러보기와 구절 읽기는 계정 없이도 그대로 하실 수 있습니다.
            </p>
          )}
        </section>

        <p className={styles.note}>
          {/* TODO(api): 알림 설정은 백엔드 연동 후에 붙는다 */}
          알림 설정은 준비 중입니다.
        </p>
      </div>
    </main>
  );
}
