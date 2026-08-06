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
import { formatRef } from '../data/verses';
import { useVerseStar } from '../state/VersesContext';
import { getGalaxy } from '../data/disciples';
import { isCrisis } from '../services/intentMatcher';
import { USING_API, useRepositories } from '../services/RepositoryProvider';
import { fetchThread, streamCounselReply } from '../services/httpRepositories';
import { useAppPhase } from '../state/AppPhaseContext';
import { useCounsel } from '../state/CounselContext';
import { CounselThread } from '../components/counsel/CounselThread';
import { QuestionComposer } from '../components/home/QuestionComposer';
import { ErrorState } from '../components/common/ErrorState';
import { useThreads } from '../state/ThreadsContext';
import { readThread, saveThread, titleFor } from '../services/threadStore';
import { EmblemBadge } from '../components/galaxy/EmblemBadge';
import { Button } from '../components/common/Button';
import { PATHS, THREAD_PARAM, versePath } from './paths';
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
  /* 답변 화면에서 이미 고른 인물. 없으면 서버가 고른다. */
  const galaxyId = params.get('galaxy') ?? undefined;
  /* 사이드바에서 지난 대화를 골라 들어온 경우. 새로 열지 않고 되살린다. */
  const resumeId = params.get(THREAD_PARAM) ?? undefined;
  const star = useVerseStar(from);
  const { refresh: refreshThreads } = useThreads();

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
  const seedKey = `${from ?? ''}|${question ?? ''}|${galaxyId ?? ''}`;

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
  const openKey = `${resumeId ?? seedKey}#${retryToken}`;

  useEffect(() => {
    if (seededRef.current === openKey) return;
    seededRef.current = openKey;
    setPhase('counsel');

    /*
     * 지난 대화를 되살린다.
     *
     * ★ 새로 열지 않는다.
     *   startThread 를 부르면 첫 인사가 다시 오고 방 id 도 새로 생긴다.
     *   같은 대화가 둘이 되고, 사이드바에 하나가 더 쌓인다.
     */
    if (resumeId) {
      /*
       * ★ 서버가 있으면 서버에서 가져온다.
       *   브라우저에 남긴 것은 서버가 없을 때의 대역이다. 서버로 도는데
       *   로컬만 뒤지면, 다른 기기에서 나눈 대화나 이 브라우저를 지운 뒤의
       *   대화가 전부 "불러오지 못했습니다" 가 된다.
       */
      if (USING_API) {
        fetchThread(resumeId)
          .then((restored) => {
            if (seededRef.current !== openKey) return;
            dispatch({ type: 'thread/restored', ...restored });
          })
          .catch((caught: unknown) => {
            if (seededRef.current !== openKey) return;
            dispatch({
              type: 'error',
              message: '이 대화를 불러오지 못했습니다.',
              detail: detailOf(caught),
            });
          });
        return;
      }

      const saved = readThread(resumeId);
      if (saved) {
        dispatch({
          type: 'thread/restored',
          threadId: saved.id,
          seed: saved.seed,
          messages: saved.messages,
          personaId: saved.personaId,
          personaReason: saved.personaReason,
        });
      } else {
        // 이 브라우저에서 만든 것이 아니다. 되살릴 방법이 없으므로 사실대로 알린다.
        dispatch({
          type: 'error',
          message: '이 대화를 불러오지 못했습니다.',
          detail: '이 브라우저에 남아 있지 않은 대화입니다.',
        });
      }
      return;
    }

    const seed = { verseId: from, question, galaxyId };

    /** 그 사이 사용자가 다른 구절·질문으로 옮겨 갔거나 다시 시작했는가 */
    const stale = () => seededRef.current !== openKey;

    counsel
      .startThread(seed)
      .then(({ threadId, opening, personaId, reason }) => {
        if (stale()) return;
        dispatch({
          type: 'thread/started',
          threadId,
          opening,
          seed,
          personaId,
          personaReason: reason,
        });
      })
      .catch((caught: unknown) => {
        if (stale()) return;
        dispatch({
          type: 'error',
          message: '대화를 시작하지 못했습니다.',
          detail: detailOf(caught),
        });
      });
  }, [openKey, resumeId, from, question, galaxyId, counsel, dispatch, setPhase]);

  /*
   * 오간 말을 이 브라우저에 남긴다.
   *
   * ★ 서버가 있으면 하지 않는다.
   *   Django 가 이미 세션과 메시지를 저장한다. 여기서 또 남기면 두 벌이
   *   생기고, 어느 쪽이 진짜인지 묻는 순간이 반드시 온다.
   *
   * ★ 첫 인사만 있는 방은 남기지 않는다.
   *   열었다가 아무 말도 안 하고 나간 자리다. 목록에 쌓이기만 한다.
   */
  useEffect(() => {
    if (USING_API) return;
    if (!state.threadId || state.messages.length < 2) return;
    // 스트리밍이 끝난 뒤에 남긴다 — 도중에 남기면 잘린 말이 저장된다.
    if (state.pending) return;

    const firstUser = state.messages.find((m) => m.role === 'user')?.text;
    saveThread({
      id: state.threadId,
      title: titleFor(state.seed, firstUser),
      personaId: state.personaId,
      personaReason: state.personaReason,
      seed: state.seed,
      messages: state.messages,
      createdAt: state.messages[0]?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    refreshThreads();
  }, [
    state.threadId,
    state.messages,
    state.pending,
    state.seed,
    state.personaId,
    state.personaReason,
    refreshThreads,
  ]);

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

  /*
   * 누구와 이야기하고 있는가.
   *
   * ★ 이름은 화면이 찾는다.
   *   서버는 은하 id 만 내려 준다. 이름·색·역할은 이미 disciples.ts 에
   *   있으므로 같은 문자열을 두 번 실어 보낼 이유가 없다.
   */
  const persona = state.personaId ? getGalaxy(state.personaId) : undefined;

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

      <div className={styles.stage}>
        {persona && !state.error && (
          /*
           * ★ 창 밖에 둔다.
           *   대화창 안에 넣었더니 첫 화면이 상징 · 근거 · 첫 인사 세
           *   덩어리로 시작해서, 정작 말을 걸려는 사람의 시선이 아래로
           *   한참 밀렸다. 밖에 세우면 "여기가 그 사람의 자리" 라는 표시는
           *   남으면서 대화가 창을 통째로 쓴다.
           */
          <aside className={styles.aside} aria-label="상담 상대">
            <EmblemBadge galaxyId={persona.id} size={72} />
            {state.personaReason && (
              <p className={styles.personaReason}>{state.personaReason}</p>
            )}
          </aside>
        )}

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
      </div>
    </main>
  );
}
