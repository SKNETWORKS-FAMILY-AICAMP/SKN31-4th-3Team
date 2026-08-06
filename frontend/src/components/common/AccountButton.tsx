/*
 * components/common/AccountButton.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 오른쪽 위 계정 자리.
 *
 * ★ 메뉴 안이 아니라 화면에 상주한다
 *   로그인 여부는 "지금 내가 어떤 상태인가"이지 설정 항목이 아니다.
 *   메뉴를 열어야만 알 수 있으면, 로그인한 줄 알고 쓰다가 대화를 잃는다.
 *
 * ★ 판을 두지 않는다
 *   왼쪽 위 메뉴, 오른쪽 MBTI 목록과 같은 언어를 쓴다 — 우주 위에 글자만.
 *
 * ★ 로그아웃은 한 번 더 묻는다
 *   한 번 눌러 끝나면 이름 옆을 스치듯 눌렀을 때 대화가 끊긴다.
 *   되돌릴 수 없는 것은 아니지만, 다시 로그인해야 한다는 점에서 성가시다.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../state/AuthContext';
import { PATHS } from '../../routes/paths';
import styles from './AccountButton.module.css';

export function AccountButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, ready, logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /*
   * 확인 상태에서 다른 곳을 누르면 접는다.
   * 열어 둔 채로 화면을 옮기면 엉뚱한 자리에 확인 문구가 남는다.
   */
  useEffect(() => {
    if (!confirming) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setConfirming(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirming(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [confirming]);

  // 화면을 옮기면 접는다
  useEffect(() => setConfirming(false), [location.pathname]);

  /*
   * 확인이 끝나기 전에는 아무것도 단정하지 않는다.
   * 새로고침 직후 "로그인"이라고 썼다가 곧 이름으로 바뀌면 글자가 튄다.
   */
  if (!ready) return <div className={styles.root} aria-hidden="true" />;

  return (
    <div className={styles.root} ref={rootRef} data-guide="account">
      {user ? (
        <div className={styles.signedIn}>
          {/*
            ★ 이름이 곧 내 정보로 가는 입구다.
              예전에는 글자였다 — "눌러도 갈 곳이 없으니 버튼처럼 보이면
              안 된다" 는 이유였다. 이제 갈 곳이 생겼으므로 버튼이 맞다.
              사람들은 어차피 자기 이름을 눌러 본다.
          */}
          <button
            type="button"
            className={styles.name}
            aria-label={`${user.username}님 내 정보`}
            onClick={() => navigate(PATHS.account)}
          >
            {user.username}
            {user.mbti && <span className={styles.badge}>{user.mbti}</span>}
          </button>

          {confirming ? (
            <span className={styles.confirm}>
              <span className={styles.ask}>나가시겠어요?</span>
              <button
                type="button"
                className={styles.danger}
                onClick={() => {
                  logout();
                  setConfirming(false);
                }}
              >
                로그아웃
              </button>
              <button
                type="button"
                className={styles.action}
                onClick={() => setConfirming(false)}
              >
                취소
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={styles.action}
              onClick={() => setConfirming(true)}
            >
              로그아웃
            </button>
          )}
        </div>
      ) : (
        /*
         * 회원가입과 로그인을 나란히 둔다.
         *
         * ★ 하나로 합치면 첫 방문자가 로그인 화면을 먼저 만난다.
         *   계정이 없는 사람에게 "이메일과 비밀번호를 넣으세요"를 먼저 보이면
         *   가입하러 가는 길을 한 번 더 찾아야 한다. 처음 오는 사람이
         *   훨씬 많은 화면이므로 가입을 앞에 세운다.
         */
        <span className={styles.signedOut}>
          <button
            type="button"
            className={styles.primary}
            data-guide="signup"
            onClick={() =>
              navigate(PATHS.auth, {
                state: { mode: 'register', from: location.pathname + location.search },
              })
            }
          >
            회원가입
          </button>
          <span className={styles.divider} aria-hidden="true" />
          <button
            type="button"
            className={styles.action}
            onClick={() =>
              // 마치고 나면 하던 화면으로 돌아온다
              navigate(PATHS.auth, {
                state: { mode: 'login', from: location.pathname + location.search },
              })
            }
          >
            로그인
          </button>
        </span>
      )}
    </div>
  );
}
