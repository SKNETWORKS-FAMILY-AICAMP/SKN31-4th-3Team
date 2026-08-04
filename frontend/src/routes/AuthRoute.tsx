/*
 * routes/AuthRoute.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 로그인 / 회원가입.
 *
 * ★ 한 화면에서 전환한다.
 *   두 화면을 오가게 만들면 "가입할까 로그인할까" 사이에서 뒤로가기를
 *   반복하게 된다. 같은 자리에서 모드만 바뀐다.
 *
 * ★ 어디로 돌아갈지 기억한다.
 *   상담을 이어가려다 로그인 화면으로 온 경우, 마치고 나면 그 대화로
 *   돌아가야 한다. 홈으로 떨어뜨리면 하던 일을 잃는다.
 */

import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MBTI_TYPES } from '../data/mbti';
import { useAuth } from '../state/AuthContext';
import { Button } from '../components/common/Button';
import { PATHS } from './paths';
import screen from './Screen.module.css';
import styles from './AuthRoute.module.css';

type Mode = 'login' | 'register';

export function AuthRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuth();

  /*
   * 어떤 모드로 열 것인가.
   *
   * 오른쪽 위 "회원가입"으로 들어오면 가입 폼이 바로 보여야 한다.
   * 로그인 폼을 먼저 보여 주고 "계정 만들기"를 다시 찾게 하면, 방금
   * 회원가입을 눌렀는데 회원가입이 아닌 화면이 뜬 셈이 된다.
   */
  const requestedMode = (location.state as { mode?: Mode } | null)?.mode;
  const [mode, setMode] = useState<Mode>(requestedMode ?? 'login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mbti, setMbti] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** 로그인 화면으로 오기 전에 있던 곳. 없으면 홈. */
  const from = (location.state as { from?: string } | null)?.from ?? PATHS.home;

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    /*
     * MBTI 는 버튼 그리드라 브라우저의 required 검사가 닿지 않는다.
     * 비운 채 넘어가면 가입은 되지만 오른쪽 목록에서 아무것도 빛나지 않아,
     * 사용자는 "왜 나만 안 되지"를 묻게 된다. 여기서 막는다.
     */
    if (mode === 'register' && !mbti) {
      setError('MBTI 를 골라 주세요. 결이 가까운 은하를 찾는 데 씁니다.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register({ email, username, password, mbti });
      navigate(from, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '요청을 처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
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
          <p className="u-eyebrow">{mode === 'login' ? '다시 오셨군요' : '처음 오셨나요'}</p>
          <h2 className="u-title">
            {mode === 'login' ? '로그인' : '계정 만들기'}
          </h2>
          <p className="u-muted">
            대화를 저장하고 다음에 이어가려면 계정이 필요합니다. 둘러보기와 구절 읽기는
            로그인 없이도 계속 하실 수 있습니다.
          </p>
        </header>

        <form className={styles.form} onSubmit={submit}>
          {/*
            이메일·이름·비밀번호를 한 덩어리로 묶는다.
            튜토리얼이 "적어 보세요"라고 할 때 가리켜야 하는 것은 칸 하나가
            아니라 이 세 칸 전부다. 이름 칸만 강조하면 나머지는 비운 채로
            가입 버튼을 누르게 된다.
          */}
          <div className={styles.fields} data-guide="authFields">
            <label className={styles.field}>
              <span className={styles.label}>이메일</span>
              <input
                className={styles.input}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            {mode === 'register' && (
              <label className={styles.field}>
                <span className={styles.label}>이름</span>
                <input
                  className={styles.input}
                  type="text"
                  autoComplete="nickname"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.label}>비밀번호</span>
              <input
                className={styles.input}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'register' && (
                <span className={styles.hint}>8자 이상으로 정해 주세요.</span>
              )}
            </label>
          </div>

          {mode === 'register' && (
            /*
             * MBTI 는 목록이 아니라 판으로 고른다.
             *
             * ★ select 를 쓰지 않는 이유
             *   16개를 접어 두면 무엇이 있는지 보이지 않고, 고르는 데 두 번을
             *   눌러야 한다. 무엇보다 이 값은 나중에 오른쪽 목록에서 빛나는
             *   "내 자리"가 된다 — 처음 고를 때부터 그 자리들이 보여야 한다.
             *
             * ★ radiogroup 으로 표시한다
             *   생김새는 버튼이지만 의미는 "여럿 중 하나"다. 그렇게 알리지
             *   않으면 스크린리더에게는 그냥 버튼 16개가 된다.
             */
            <fieldset className={styles.field}>
              <legend className={styles.label}>MBTI</legend>
              <div
                className={styles.mbtiGrid}
                role="radiogroup"
                aria-label="MBTI 유형"
                data-guide="authMbti"
              >
                {MBTI_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={mbti === type}
                    className={styles.mbtiChip}
                    // 같은 것을 다시 누르면 해제된다 — 잘못 눌렀을 때 되돌릴 길
                    onClick={() => setMbti(mbti === type ? '' : type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <span className={styles.hint}>
                결이 가까운 은하를 먼저 보여 드리는 데만 씁니다. 사람을 규정하려는 것이
                아니며, 언제든 바꿀 수 있습니다.
              </span>
            </fieldset>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <Button variant="primary" type="submit" disabled={busy} data-guide="authSubmit">
            {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
          </Button>
        </form>

        <p className={styles.switch}>
          {mode === 'login' ? '아직 계정이 없으신가요?' : '이미 계정이 있으신가요?'}{' '}
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? '계정 만들기' : '로그인'}
          </button>
        </p>
      </div>
    </main>
  );
}
