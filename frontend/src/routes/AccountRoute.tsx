/*
 * routes/AccountRoute.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 회원정보 수정과 탈퇴.
 *
 * ★ 두 가지를 한 화면에 두되 멀리 떼어 놓는다
 *   수정은 자주 하는 일이고 탈퇴는 평생 한 번 하는 일이다. 나란히 두면
 *   저장하려다 탈퇴를 누른다. 사이에 선을 긋고, 탈퇴는 맨 아래에 둔다.
 *
 * ★ 탈퇴는 두 단계다
 *   누르면 곧바로 지우지 않는다. 무엇이 사라지는지 적어 두고, 한 번 더
 *   누르게 한다. 되돌릴 수 없는 일에는 되돌아올 자리가 있어야 한다.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MBTI_TYPES } from '../data/mbti';
import { useAuth } from '../state/AuthContext';
import { Button } from '../components/common/Button';
import { PATHS } from './paths';
import screen from './Screen.module.css';
import styles from './AccountRoute.module.css';

export function AccountRoute() {
  const navigate = useNavigate();
  const { user, ready, updateProfile, withdraw } = useAuth();

  const [username, setUsername] = useState('');
  const [mbti, setMbti] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 탈퇴 확인 단계에 들어왔는가. */
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // 로그인한 사람만 들어온다. 확인이 끝나기 전에는 판단하지 않는다.
  useEffect(() => {
    if (ready && !user) navigate(PATHS.auth, { replace: true });
  }, [ready, user, navigate]);

  // 계정 정보가 오면 입력칸의 출발값으로 삼는다.
  useEffect(() => {
    if (!user) return;
    setUsername(user.username);
    setMbti(user.mbti ?? '');
  }, [user]);

  if (!user) {
    return (
      <main className={screen.screen}>
        <p className="u-muted" role="status">
          계정을 확인하는 중…
        </p>
      </main>
    );
  }

  const dirty = username.trim() !== user.username || mbti !== (user.mbti ?? '');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || saving) return;

    const name = username.trim();
    if (!name) {
      setError('이름을 비워 둘 수 없습니다.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile({ username: name, mbti });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    setLeaving(true);
    setError(null);
    try {
      await withdraw();
      navigate(PATHS.home, { replace: true });
    } catch (caught) {
      setLeaving(false);
      setConfirming(false);
      setError(
        caught instanceof Error
          ? `탈퇴하지 못했습니다. ${caught.message}`
          : '탈퇴하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  };

  return (
    <main className={screen.screen}>
      <div className={screen.topBar}>
        <Button variant="quiet" onClick={() => navigate(PATHS.home)}>
          ← 처음으로
        </Button>
      </div>

      <div className={styles.panel}>
        <header className={styles.head}>
          <h1 className="u-title">내 정보</h1>
          <p className={styles.email}>{user.email}</p>
        </header>

        <form className={styles.form} onSubmit={save}>
          <label className={styles.field}>
            <span className={styles.labelText}>이름</span>
            <input
              className={styles.input}
              value={username}
              maxLength={20}
              onChange={(e) => {
                setUsername(e.target.value);
                setSaved(false);
              }}
            />
          </label>

          <fieldset className={styles.field}>
            <legend className={styles.labelText}>MBTI</legend>
            <p className={styles.note}>
              성격을 규정하는 값이 아닙니다. 지금의 결과 가까운 은하를 고르는 데만 씁니다.
            </p>
            <div className={styles.grid}>
              {/*
                "고르지 않음" 을 첫 칸에 둔다.
                한 번 고르면 되돌릴 수 없는 선택지는 만들지 않는다.
              */}
              <button
                type="button"
                className={styles.chip}
                aria-pressed={mbti === ''}
                onClick={() => {
                  setMbti('');
                  setSaved(false);
                }}
              >
                고르지 않음
              </button>
              {MBTI_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={styles.chip}
                  aria-pressed={mbti === type}
                  onClick={() => {
                    setMbti(type);
                    setSaved(false);
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </fieldset>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <Button variant="primary" type="submit" disabled={!dirty || saving}>
              {saving ? '저장하는 중…' : '저장'}
            </Button>
            {saved && !dirty && (
              <span className={styles.saved} role="status">
                저장했습니다
              </span>
            )}
          </div>
        </form>

        {/*
          ★ 여기서부터는 다른 이야기다.
            선을 긋고 여백을 크게 둬서, 위를 만지다가 손이 미끄러지지
            않게 한다.
        */}
        <section className={styles.danger} aria-labelledby="withdraw-title">
          <h2 id="withdraw-title" className={styles.dangerTitle}>
            회원 탈퇴
          </h2>

          {!confirming ? (
            <>
              <p className={styles.dangerNote}>
                계정과 지금까지 나눈 상담이 모두 지워집니다.
                <br />
                되돌릴 수 없습니다.
              </p>
              <Button variant="quiet" onClick={() => setConfirming(true)}>
                탈퇴하기
              </Button>
            </>
          ) : (
            <>
              <p className={styles.dangerNote}>
                정말 탈퇴하시겠습니까.
                <br />
                지금 지워지는 것은 계정, 이름과 MBTI, 지난 상담 전부입니다.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.leave}
                  disabled={leaving}
                  onClick={() => void leave()}
                >
                  {leaving ? '지우는 중…' : '네, 탈퇴합니다'}
                </button>
                <Button variant="quiet" onClick={() => setConfirming(false)} disabled={leaving}>
                  그만두기
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
