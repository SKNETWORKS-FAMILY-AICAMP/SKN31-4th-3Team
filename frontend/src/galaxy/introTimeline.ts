/*
 * galaxy/introTimeline.ts
 * ───────────────────────────────────────────────────────────────────────
 * 창조 인트로 타임라인 — 전부 데이터다.
 *
 * 연출을 코드에 흩어 놓으면 길이 하나 줄이는 데 여러 파일을 고쳐야 한다.
 * 여기 상수만 바꾸면 전체 호흡이 바뀌도록 만든다.
 *
 * 시간 단위는 초(second). 프레임 델타 기반으로 진행하므로 저프레임
 * 기기에서도 총 길이는 동일하다.
 */

export interface CreationBeat {
  id: string;
  /** 창세기 1장 본문 (짧은 인용, 출처는 화면에 함께 표기) */
  text: string;
  /** 이 문장이 등장하기 시작하는 시각 */
  start: number;
  fadeIn: number;
  hold: number;
  fadeOut: number;
  /**
   * 이 문장 구간이 끝날 때 별이 도달해 있어야 할 수렴도.
   * 0 = 완전히 흩어짐, 1 = 성운 완성
   */
  convergence: number;
  /** 이 구간의 별 밝기 배율 0..1 */
  luminance: number;
  /** 중심에서 퍼지는 광량 펄스 발생 시각 (절대 시각, 없으면 펄스 없음) */
  pulseAt?: number;
}

/** 문장 하나의 총 점유 시간 */
export function beatDuration(beat: CreationBeat): number {
  return beat.fadeIn + beat.hold + beat.fadeOut;
}

/**
 * 창세기 1:1~5.
 * 각 문장은 겹치지 않고 사이에 호흡이 남도록 배치했다.
 */
export const CREATION_BEATS: readonly CreationBeat[] = [
  {
    id: 'genesis-1-1',
    text: '태초에 하나님이 천지를 창조하시니',
    start: 1.5,
    fadeIn: 1.2,
    hold: 2.4,
    fadeOut: 0.9,
    convergence: 0.05,
    luminance: 0.02,
  },
  {
    id: 'genesis-1-3',
    text: '하나님이 이르시되 빛이 있으라 하시니 빛이 있었고',
    start: 6.0,
    fadeIn: 1.2,
    hold: 2.4,
    fadeOut: 0.9,
    convergence: 0.18,
    luminance: 0.35,
    // 문장이 완전히 표출된 직후 — "빛이 있었고"에 맞춘다.
    pulseAt: 7.4,
  },
  {
    id: 'genesis-1-4',
    text: '빛이 하나님이 보시기에 좋았더라 하나님이 빛과 어둠을 나누사',
    start: 10.5,
    fadeIn: 1.2,
    hold: 2.4,
    fadeOut: 0.9,
    convergence: 0.45,
    luminance: 0.55,
  },
  {
    id: 'genesis-1-5',
    text: '하나님이 빛을 낮이라 부르시고 어둠을 밤이라 부르시니 저녁이 되고 아침이 되니 이는 첫째 날이니라',
    start: 15.0,
    fadeIn: 1.4,
    hold: 2.7,
    fadeOut: 0.9,
    convergence: 1,
    luminance: 1,
  },
];

/** 인용 출처 표기 — 인용 옆에 항상 함께 노출한다. */
export const CREATION_ATTRIBUTION = '창세기 1:1–5 · 개역개정';

/*
 * ── 제목(워드마크) 구간 ─────────────────────────────────────────────
 *
 * 넷째 날 문장이 사라지면, 별들이 화면 중앙으로 모여 "✝ Eden" 을 쓴다.
 * 다 써지면 한 번 번쩍이고, 그대로 상단으로 올라가 사이트 제목이 된다.
 * 그 다음에야 홈 UI가 들어온다.
 */

/** 별들이 글자 자리로 모이기 시작하는 시각 */
export const WORDMARK_START = 20.4;
/** 왼쪽부터 오른쪽으로 써지는 데 걸리는 시간 */
export const WORDMARK_WRITE = 2.6;
/** 다 써진 순간의 섬광 */
export const WORDMARK_FLASH_AT = WORDMARK_START + WORDMARK_WRITE;
export const WORDMARK_FLASH_DECAY = 0.55;

/** 제목이 상단으로 올라가는 구간. 은하도 이때 뒤로 물러난다. */
export const RISE_START = WORDMARK_FLASH_AT + 0.35;
export const RISE_DURATION = 1.5;

/** 마지막 문장이 사라진 뒤, 성운이 뒤로 물러나며 홈 UI가 들어오는 구간 */
export const SETTLE_START = RISE_START;
export const SETTLE_DURATION = RISE_DURATION;

/** 인트로 총 길이 */
export const INTRO_DURATION = RISE_START + RISE_DURATION + 0.15;

/** 건너뛰기 버튼이 나타나는 시각 — 처음부터 거의 바로 보인다. */
export const SKIP_VISIBLE_AT = 0.3;

/** 건너뛰기 시 최종 상태로 착지하는 크로스페이드 길이 */
export const SKIP_CROSSFADE = 0.5;

/** 인트로 종료 후 성운이 물러난 배율 */
export const SETTLED_SCALE = 0.62;

/**
 * reduced-motion 타임라인.
 * 별은 처음부터 최종 배치에 있고 문장만 페이드로 순차 표출된다.
 * 총 길이도 22초 → 10초로 줄인다.
 */
export const REDUCED_BEATS: readonly CreationBeat[] = CREATION_BEATS.map((beat, i) => ({
  ...beat,
  start: 0.4 + i * 2.4,
  fadeIn: 0.6,
  hold: 1.2,
  fadeOut: 0.6,
  convergence: 1, // 이동 없음
  luminance: 1,
  pulseAt: undefined,
}));

export const REDUCED_INTRO_DURATION = 10.0;

/**
 * 제목 연출의 진행 상태.
 * write  — 글자가 써진 정도 0..1
 * flash  — 완성 순간의 섬광 0..1
 * rise   — 화면 중앙(0)에서 상단 제목 자리(1)까지
 */
export interface WordmarkState {
  write: number;
  flash: number;
  rise: number;
}

/** 인트로가 끝난 뒤의 상주 상태 — 상단에 완성된 채로 있다. */
export const WORDMARK_SETTLED: WordmarkState = { write: 1, flash: 0, rise: 1 };

export function resolveWordmark(t: number, reducedMotion: boolean): WordmarkState {
  /*
   * 모션 축소에서는 쓰는 연출도 섬광도 없이 처음부터 상단에 놓는다.
   * 글자가 날아다니는 것이야말로 이 설정에서 피해야 할 움직임이다.
   */
  if (reducedMotion) return WORDMARK_SETTLED;

  return {
    write: clamp01((t - WORDMARK_START) / WORDMARK_WRITE),
    flash: flashAt(t),
    rise: clamp01((t - RISE_START) / RISE_DURATION),
  };
}

function flashAt(t: number): number {
  const since = t - WORDMARK_FLASH_AT;
  if (since < 0 || since > WORDMARK_FLASH_DECAY) return 0;
  // 즉시 밝아지고 부드럽게 꺼진다.
  return Math.pow(1 - since / WORDMARK_FLASH_DECAY, 2);
}

/** 현재 시각에서 활성 문장의 인덱스와 불투명도를 구한다. */
export interface BeatState {
  index: number;
  opacity: number;
}

export function resolveBeat(beats: readonly CreationBeat[], t: number): BeatState {
  for (let i = 0; i < beats.length; i += 1) {
    const beat = beats[i];
    const local = t - beat.start;
    if (local < 0 || local > beatDuration(beat)) continue;

    if (local < beat.fadeIn) {
      return { index: i, opacity: local / beat.fadeIn };
    }
    if (local < beat.fadeIn + beat.hold) {
      return { index: i, opacity: 1 };
    }
    const out = local - beat.fadeIn - beat.hold;
    return { index: i, opacity: 1 - out / beat.fadeOut };
  }
  return { index: -1, opacity: 0 };
}

/**
 * 현재 시각의 수렴도(0..1).
 * 문장 구간 사이를 선형 보간해, 문장이 없는 호흡 구간에도 별이 계속 움직인다.
 */
export function resolveConvergence(
  beats: readonly CreationBeat[],
  t: number,
  initial = 0,
): number {
  if (beats.length === 0) return 1;
  if (t >= SETTLE_START) return 1;

  let prevTime = 0;
  let prevValue = initial;

  for (const beat of beats) {
    const endTime = beat.start + beatDuration(beat);
    if (t <= endTime) {
      const span = endTime - prevTime;
      const ratio = span <= 0 ? 1 : (t - prevTime) / span;
      return prevValue + (beat.convergence - prevValue) * clamp01(ratio);
    }
    prevTime = endTime;
    prevValue = beat.convergence;
  }
  return prevValue;
}

/** 현재 시각의 별 밝기 배율(0..1). 수렴도와 같은 방식으로 보간한다. */
export function resolveLuminance(
  beats: readonly CreationBeat[],
  t: number,
  initial = 0,
): number {
  if (beats.length === 0) return 1;

  let prevTime = 0;
  let prevValue = initial;

  for (const beat of beats) {
    const endTime = beat.start + beatDuration(beat);
    if (t <= endTime) {
      const span = endTime - prevTime;
      const ratio = span <= 0 ? 1 : (t - prevTime) / span;
      return prevValue + (beat.luminance - prevValue) * clamp01(ratio);
    }
    prevTime = endTime;
    prevValue = beat.luminance;
  }
  return prevValue;
}

/** 광량 펄스 강도(0..1). 펄스 시각 직후 0.8초에 걸쳐 사그라든다. */
export const PULSE_DECAY = 0.8;

export function resolvePulse(beats: readonly CreationBeat[], t: number): number {
  for (const beat of beats) {
    if (beat.pulseAt === undefined) continue;
    const since = t - beat.pulseAt;
    if (since < 0 || since > PULSE_DECAY) continue;
    // 빠르게 밝아지고 천천히 꺼진다.
    return Math.pow(1 - since / PULSE_DECAY, 2);
  }
  return 0;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 타임라인 묶음.
 *
 * 초기값을 타임라인이 직접 들고 있어야 한다 — reduced-motion 은 별이
 * "처음부터 최종 배치에 있는" 연출이므로 수렴도가 0에서 시작하면 안 된다.
 */
export interface IntroTimeline {
  beats: readonly CreationBeat[];
  duration: number;
  /** t=0 시점의 수렴도 */
  initialConvergence: number;
  /** t=0 시점의 밝기 */
  initialLuminance: number;
}

export const DEFAULT_TIMELINE: IntroTimeline = {
  beats: CREATION_BEATS,
  duration: INTRO_DURATION,
  initialConvergence: 0,
  initialLuminance: 0,
};

/** 과도한 이동 없이 페이드/정적 구성으로 대체한다. */
export const REDUCED_TIMELINE: IntroTimeline = {
  beats: REDUCED_BEATS,
  duration: REDUCED_INTRO_DURATION,
  initialConvergence: 1,
  initialLuminance: 1,
};
