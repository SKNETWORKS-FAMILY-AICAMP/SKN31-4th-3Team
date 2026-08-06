/*
 * state/EncounterContext.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 조우 — 도착과 열림 사이.
 *
 *   카메라 비행 → ① 별이 상징으로 모임 → ② 한 줄 건넴 → ③ 사용자가 누름
 *
 * ★ 시간이 아니라 사람이 넘긴다
 *   처음에는 1.9초 뒤에 저절로 넘어갔다. 그러면 형태를 더 보고 싶은
 *   사람은 놓치고, 서두르는 사람은 기다린다. 둘 다 만족시키는 시간은
 *   없다. 버튼 하나면 각자 원할 때 넘어간다.
 *
 * ★ 넘어간 뒤에도 상징은 남는다
 *   구절 목록을 훑는 동안 배경이 다시 나선으로 풀려 버리면, 방금 만든
 *   형태가 스쳐 간 연출이 된다. 그 은하를 떠날 때까지 상징으로 서 있는다.
 *
 * ★ 타이머는 하나만 남긴다
 *   Canvas 를 못 쓰는 환경이나 백그라운드 탭에서는 엔진의 "형태가
 *   잡혔다" 통지가 영영 오지 않는다. 그때도 버튼은 떠야 한다.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getGalaxy } from '../data/disciples';
import { emblemOf } from '../data/emblems';
import { useGalaxy } from './GalaxyContext';

/**
 * 엔진 통지가 늦을 때를 대비한 상한(ms).
 * 변형 1.15초 + 여유. 이보다 오래 걸리면 통지가 오지 않는 것으로 본다.
 */
const FORM_TIMEOUT_MS = 1800;
const FORM_TIMEOUT_MS_REDUCED = 500;

/** 버튼 문구를 안 주면 이걸 쓴다. */
const DEFAULT_ACTION = '들어가기';

export type EncounterStage = 'gathering' | 'greeting';

interface EncounterValue {
  /**
   * 엔진에 넘길 은하 id.
   *
   * 조우 중이거나, 조우가 끝난 뒤 상징을 유지하는 동안 값이 있다.
   * 엔진은 이 값만 보면 되고 "지금 어느 단계인지"는 알 필요가 없다.
   */
  galaxyId: string | null;
  stage: EncounterStage | null;
  /** 진행 버튼에 쓸 문구. 어디로 넘어가는지가 여기 적힌다. */
  actionLabel: string;
  /**
   * 조우를 시작한다. 사용자가 버튼을 누르면 done 이 불린다.
   *
   * 상징이 없는 은하이면 done 을 바로 부른다 — 호출부가 "조우가
   * 있었는지"를 신경 쓰지 않아도 된다.
   */
  begin: (galaxyId: string, done: () => void, actionLabel?: string) => void;
  /** 버튼을 눌렀다. */
  proceed: () => void;
  /** 상징을 풀고 은하를 원래 모습으로 되돌린다 (탐색 화면을 떠날 때). */
  release: () => void;
}

interface InternalValue extends EncounterValue {
  /** 엔진 콜백용. 화면 쪽에서는 쓰지 않는다. */
  formed: (galaxyId: string) => void;
}

const EncounterContext = createContext<InternalValue | null>(null);

export function EncounterProvider({ children }: { children: ReactNode }) {
  const { reducedMotion } = useGalaxy();

  /** 지금 조우 중인 은하. 버튼을 누르면 비워진다. */
  const [active, setActive] = useState<string | null>(null);
  /** 조우가 끝난 뒤에도 상징으로 서 있는 은하. */
  const [held, setHeld] = useState<string | null>(null);
  const [stage, setStage] = useState<EncounterStage | null>(null);
  const [actionLabel, setActionLabel] = useState(DEFAULT_ACTION);

  /*
   * 넘어갈 때 할 일과 타이머는 ref 에 둔다.
   * 상태로 두면 단계가 바뀔 때마다 이 값을 보는 effect 가 다시 돈다.
   */
  const doneRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const proceed = useCallback(() => {
    clearTimer();
    const done = doneRef.current;
    doneRef.current = null;

    setActive((id) => {
      // 넘어가도 상징은 남는다 — 이 은하를 떠날 때까지.
      if (id) setHeld(id);
      return null;
    });
    setStage(null);
    done?.();
  }, []);

  const begin = useCallback(
    (id: string, done: () => void, label = DEFAULT_ACTION) => {
      // 상징이 없으면 보여 줄 것이 없다. 지체 없이 넘긴다.
      if (!emblemOf(id) || !getGalaxy(id)) {
        done();
        return;
      }
      clearTimer();
      doneRef.current = done;
      setHeld(null);
      setActive(id);
      setStage('gathering');
      setActionLabel(label);

      // 엔진 통지가 안 올 때를 대비한 안전망
      timerRef.current = window.setTimeout(
        () => setStage((s) => (s === 'gathering' ? 'greeting' : s)),
        reducedMotion ? FORM_TIMEOUT_MS_REDUCED : FORM_TIMEOUT_MS,
      );
    },
    [reducedMotion],
  );

  const release = useCallback(() => {
    clearTimer();
    doneRef.current = null;
    setActive(null);
    setHeld(null);
    setStage(null);
  }, []);

  /** 엔진이 "형태가 잡혔다"고 알릴 때. */
  const formed = useCallback((id: string) => {
    setActive((current) => {
      if (current === id) setStage((s) => (s === 'gathering' ? 'greeting' : s));
      return current;
    });
  }, []);

  // 언마운트되며 타이머만 남는 일이 없게 한다.
  useEffect(() => clearTimer, []);

  const value = useMemo(
    () => ({
      galaxyId: active ?? held,
      stage,
      actionLabel,
      begin,
      proceed,
      release,
      formed,
    }),
    [active, held, stage, actionLabel, begin, proceed, release, formed],
  );

  return <EncounterContext.Provider value={value}>{children}</EncounterContext.Provider>;
}

const IDLE: InternalValue = {
  galaxyId: null,
  stage: null,
  actionLabel: DEFAULT_ACTION,
  begin: (_id, done) => done(),
  proceed: () => {},
  release: () => {},
  formed: () => {},
};

/**
 * Provider 밖에서도 죽지 않는다.
 *
 * 이 훅은 캔버스와 라우트 양쪽에서 쓰이고, 테스트가 컴포넌트 하나만 떼어
 * 렌더하는 일이 흔하다. 그때는 조우 없이 곧바로 열리는 게 맞는 동작이다.
 */
export function useEncounter(): InternalValue {
  return useContext(EncounterContext) ?? IDLE;
}
