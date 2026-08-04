/*
 * routes/CounselRoute.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 상담 대화.
 *
 * 구절이나 질문에서 이어져 온 문맥이 대화의 첫 상태로 주입된다.
 * — "상담 이어가기"가 새 대화를 여는 게 아니라 하던 이야기를 잇는 것으로
 *   느껴져야 한다.
 *
 * 안전: 사용자가 대화 중에 위기 신호를 보이면, mock 응답을 기다리지 않고
 * 즉시 안내를 붙인다. 네트워크 왕복을 기다릴 일이 아니다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CounselMessage } from '../data/types';
import { formatRef, getVerseStar } from '../data/verses';
import { isCrisis } from '../services/intentMatcher';
import { USING_API, useRepositories } from '../services/RepositoryProvider';
import { streamCounselReply } from '../services/httpRepositories';
import { useAppPhase } from '../state/AppPhaseContext';
import { useCounsel } from '../state/CounselContext';
import { CounselThread } from '../components/counsel/CounselThread';
import { QuestionComposer } from '../components/home/QuestionComposer';
import { ErrorState } from '../components/common/ErrorState';
import { Button } from '../components/common/Button';
import { PATHS, versePath } from './paths';
import screen from './Screen.module.css';
import styles from './CounselRoute.module.css';

let localId = 0;
function nextLocalId(): string {
  localId += 1;
  return `local-${Date.now().toString(36)}-${localId}`;
}

/**
 * 오류에서 사람이 읽을 만한 원인을 뽑는다.
 *
 * 서버는 "LLM 스트리밍 실패: ..." 처럼 이미 사람이 쓴 문장을 준다.
 * 그걸 버리고 "답변을 받지 못했습니다" 만 남기면, 정작 무엇이 잘못됐는지
 * 아무도 알 수 없다 — 키가 없는 건지, 잔액이 없는 건지, 모델 이름이
 * 틀린 건지.
 */
function detailOf(caught: unknown): string | undefined {
  if (caught instanceof Error && caught.message) return caught.message;
  return undefined;
}

/** 대화 중 위기 신호에 붙이는 안내 메시지 */
function safetyMessage(): CounselMessage {
  return {
    id: nextLocalId(),
    role: 'guide',
    kind: 'safety',
    text: '안전 안내',
    createdAt: Date.now(),
  };
}

export function CounselRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { counsel } = useRepositories();
  const { state, dispatch } = useCounsel();
  const { setPhase } = useAppPhase();

  const from = params.get('from') ?? undefined;
  const question = params.get('q') ?? undefined;
  const star = from ? getVerseStar(from) : undefined;

  // 같은 문맥으로 두 번 시작하지 않도록 기억한다.
  const seededRef = useRef<string | null>(null);
  /** 진행 중인 스트림. 새 질문을 보내거나 화면을 떠나면 끊는다. */
  const streamAbortRef = useRef<AbortController | null>(null);

  /*
   * "대화 다시 시작" 을 눌렀음을 나타내는 숫자.
   *
   * ★ ref 를 비우는 것만으로는 아무 일도 일어나지 않는다.
   *   effect 는 의존성이 바뀔 때만 다시 돈다. 예전 코드는 재시도에서
   *   seededRef 만 null 로 되돌렸는데, 의존성이 그대로라 effect 가
   *   다시 돌지 않았다. 화면은 messages 가 비고 error 도 없는 상태가 되어
   *   "대화를 여는 중…" 에서 다시 멈췄다.
   *
   *   상태로 두어야 렌더와 effect 가 함께 움직인다.
   */
  const [retryToken, setRetryToken] = useState(0);
  const seedKey = `${from ?? ''}|${question ?? ''}`;

  /*
   * 대화방 열기.
   *
   * ★ 정리 함수에서 요청을 버리지 않는다 — 이게 핵심이다.
   *
   *   개발 모드의 StrictMode 는 effect 를 두 번 실행한다:
   *     1회차 실행 → 정리 → 2회차 실행
   *
   *   예전 코드는 정리에서 `cancelled = true` 로 표시했고, 2회차는
   *   seededRef 가드에 걸려 그냥 돌아갔다. 그래서 **유일하게 날아간
   *   요청의 응답이 버려지고 다시 요청하지도 않아**, 화면이
   *   "대화를 여는 중…" 에서 영원히 멈췄다.
   *
   *   개발 모드에서만 나타나고 빌드하면 사라지는 종류라 원인을 짚기
   *   어렵다. 아래처럼 "버리는 대신 늦게 온 응답만 걸러내는" 방식이면
   *   두 실행 중 어느 쪽이 이기든 결과가 같다.
   *
   * ★ 대화 상태는 이 화면보다 위(CounselProvider)에 있다.
   *   그래서 화면이 잠깐 언마운트돼도 dispatch 는 유효하다.
   *   버려야 하는 것은 "언마운트된 응답"이 아니라 "다른 문맥의 응답"이다.
   */
  const openKey = `${seedKey}#${retryToken}`;

  useEffect(() => {
    if (seededRef.current === openKey) return;
    seededRef.current = openKey;
    setPhase('counsel');

    const seed = { verseId: from, question };

    /** 그 사이 사용자가 다른 구절·질문으로 옮겨 갔거나 다시 시작했는가 */
    const stale = () => seededRef.current !== openKey;

    counsel
      .startThread(seed)
      .then(({ threadId, opening }) => {
        if (stale()) return;
        dispatch({ type: 'thread/started', threadId, opening, seed });
      })
      .catch((caught: unknown) => {
        if (stale()) return;
        dispatch({
          type: 'error',
          message: '대화를 시작하지 못했습니다.',
          detail: detailOf(caught),
        });
      });
  }, [openKey, from, question, counsel, dispatch, setPhase]);

  const send = useCallback(
    (text: string) => {
      const message: CounselMessage = {
        id: nextLocalId(),
        role: 'user',
        text,
        createdAt: Date.now(),
      };
      dispatch({ type: 'message/sent', message });

      // 위기 신호는 서버를 기다리지 않는다.
      if (isCrisis(text)) {
        dispatch({ type: 'message/received', message: safetyMessage() });
        return;
      }

      const threadId = state.threadId ?? 'local';

      /*
       * 실시간으로 받을 수 있으면 그렇게 한다.
       *
       * ★ mock 으로 도는 동안에는 스트리밍이 없다.
       *   그때는 한 번에 받는 기존 경로를 그대로 쓴다 — 화면 코드가
       *   두 벌이 되지 않도록 분기는 여기 한 곳에만 둔다.
       */
      if (!USING_API) {
        counsel
          .send(threadId, text, state.seed)
          .then((reply) => dispatch({ type: 'message/received', message: reply }))
          .catch((caught: unknown) =>
            dispatch({
              type: 'error',
              message: '답변을 받지 못했습니다. 다시 시도해 주세요.',
              detail: detailOf(caught),
            }),
          );
        return;
      }

      /*
       * 화면을 떠나면 읽기를 멈춘다.
       * 멈추지 않으면 이미 사라진 대화에 조각이 계속 밀려 들어온다.
       */
      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;

      dispatch({ type: 'stream/started', id: nextLocalId(), verseId: from });

      streamCounselReply(
        threadId,
        text,
        (piece) => dispatch({ type: 'stream/chunk', text: piece }),
        controller.signal,
      )
        .then(() => dispatch({ type: 'stream/ended' }))
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          dispatch({
            type: 'error',
            message: '답변을 받지 못했습니다. 다시 시도해 주세요.',
            detail: detailOf(caught),
          });
        });
    },
    [counsel, dispatch, state.threadId, state.seed, from],
  );

  // 화면을 떠날 때 진행 중인 스트림을 정리한다.
  useEffect(() => () => streamAbortRef.current?.abort(), []);

  const starting = state.messages.length === 0 && !state.error;

  return (
    <main className={styles.screen}>
      <div className={screen.topBar}>
        <Button variant="quiet" onClick={() => navigate(PATHS.home)}>
          ← 처음으로
        </Button>
        {star && (
          <Button variant="quiet" onClick={() => navigate(versePath(star.id))}>
            {formatRef(star)}에서 이어짐
          </Button>
        )}
      </div>

      <div className={styles.panel}>
        {state.error && (
          <ErrorState
            message={state.error}
            detail={state.errorDetail}
            onRetry={() => {
              dispatch({ type: 'reset' });
              // 토큰을 올려야 effect 가 다시 돈다 (위 retryToken 주석 참조)
              setRetryToken((n) => n + 1);
            }}
            retryLabel="대화 다시 시작"
          />
        )}

        {starting && (
          <p className="u-muted" role="status">
            대화를 여는 중…
          </p>
        )}

        {!starting && (
          <CounselThread
            messages={state.messages}
            pending={state.pending}
            onSafetyBack={() => navigate(PATHS.home)}
          />
        )}

        <div className={styles.composer}>
          <QuestionComposer
            placeholder="지금 떠오르는 대로 이야기해 주세요"
            label="상담 메시지 입력"
            submitLabel="보내기"
            clearOnSubmit
            disabled={state.pending || starting}
            hint={
              star
                ? `${formatRef(star)}의 맥락에서 이어집니다`
                : '정리되지 않은 채로 말씀하셔도 괜찮습니다'
            }
            onSubmit={send}
          />
        </div>
      </div>
    </main>
  );
}
