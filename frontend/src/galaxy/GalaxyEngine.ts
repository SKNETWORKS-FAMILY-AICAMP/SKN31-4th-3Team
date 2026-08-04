/*
 * galaxy/GalaxyEngine.ts
 * ───────────────────────────────────────────────────────────────────────
 * 은하수 렌더링 엔진. React 비의존 순수 TS.
 *
 * 설계 원칙:
 *  - 단일 requestAnimationFrame 루프. React 리렌더와 완전히 분리된다.
 *  - 별 위치는 SoA(Float32Array) 버퍼. 40개든 31,077개든 렌더 경로가 같다.
 *  - 프레임 델타 기반 진행. 저프레임 기기에서도 인트로 총 길이는 동일하다.
 *  - 별마다 다른 지연 계수로 수렴시킨다. 일괄 이동은 인공적으로 보인다.
 */

import type { BackdropStar, QualityProfile, VerseStar } from '../data/types';
import { project, drawStar, focalFor, type Viewport } from './staticField';
import { clamp, convergeProgress, easeInOutCubic, easeOutCubic, lerp } from './easing';
import { DustLayer } from './DustLayer';
import {
  Camera,
  DEFAULT_DISTANCE,
  DEFAULT_PITCH,
  FOCUS_APPROACH,
  aimAt,
  aimAtGalaxy,
} from './Camera';
import { WordmarkLayer } from './WordmarkLayer';
import { sampleWordmark, waitForFonts } from './wordmark';
import { NEUTRAL_TINT, parseHex, rampFor } from './palette';
import { constellationOf } from '../data/constellations';
import {
  SYSTEM_RADIUS,
  buildNodes,
  toWorld,
  transformAt,
  worldPointOf,
  type GalaxyNode,
  type NodeTransform,
} from './system';
import { seededRandom } from './placement';
import {
  DEFAULT_TIMELINE,
  REDUCED_TIMELINE,
  SETTLE_START,
  SETTLE_DURATION,
  SETTLED_SCALE,
  WORDMARK_SETTLED,
  clamp01,
  resolveBeat,
  resolveConvergence,
  resolveLuminance,
  resolvePulse,
  resolveWordmark,
} from './introTimeline';

export type EngineMode = 'intro' | 'settled';

export interface IntroFrame {
  /** 인트로 경과 시각(초) */
  time: number;
  /** 활성 문장 인덱스. 없으면 -1 */
  beatIndex: number;
  /** 활성 문장 불투명도 0..1 */
  textOpacity: number;
}

export interface EngineCallbacks {
  onIntroFrame?: (frame: IntroFrame) => void;
  onIntroDone?: () => void;
  /** 실측 FPS가 목표에 못 미칠 때 한 번 호출된다. */
  onPerformanceDrop?: (fps: number) => void;
  /** 카메라가 목표 별에 도착했을 때 한 번 호출된다. */
  onArrive?: (starId: string) => void;
}

export interface EngineInput {
  backdrop: readonly BackdropStar[];
  curated: readonly VerseStar[];
  quality: QualityProfile;
  reducedMotion: boolean;
  mode: EngineMode;
  focusStarId: string | null;
  hoverStarId: string | null;
  /** 화면 가운데로 데려올 은하 (별 포커스가 없을 때만 쓰인다) */
  focusGalaxyId?: string | null;
  /** 포인터가 올라가 있는 은하 — 오라와 이름표가 붙는다 */
  hoverGalaxyId?: string | null;
  /**
   * MBTI 로 고른 "결이 가까운 은하들". 비어 있거나 없으면 전부 보인다.
   * 여기 없는 은하는 아주 옅게 물러난다.
   */
  affinityGalaxyIds?: readonly string[] | null;
}

/** 별이 흩어져 시작하는 반경 범위 (정규 좌표 기준, 화면 밖) */
const SCATTER_MIN = 1.7;
const SCATTER_MAX = 3.4;

/** 별마다 다른 도착 지연. 클수록 시차가 커진다. */
const MAX_DELAY = 0.42;
/** "빛과 어둠을 나누사" — 어두운 별은 더 늦게 도착한다. */
const DARK_EXTRA_DELAY = 0.14;

const MAX_DPR = 2;

/**
 * 입자 예산 배분.
 * 중심 은하가 화면에서 가장 크므로 대부분을 가져가고, 위성 12개가 나머지를 나눈다.
 * 위성은 작게 보이므로 적은 입자로도 충분히 은하로 읽힌다.
 */
const CENTER_DUST_SHARE = 0.58;

/** 인트로에서 중심 은하만 보일 때의 카메라 거리 */
const INTRO_DISTANCE = 2.9;
/**
 * 12은하가 드러난 뒤 계 전체를 담는 카메라 거리.
 * 화면 짧은 변에 반지름이 꽉 차려면 초점거리 비율상 2.4배가 필요하다.
 * 조금 더 물러나 가장자리 은하가 잘리지 않을 여유를 둔다.
 */
const SYSTEM_DISTANCE = SYSTEM_RADIUS * 2.5;

/**
 * 포인터 패럴랙스.
 * 2D 로 화면을 밀지 않고 카메라 각도를 아주 조금 흔든다 — 3D 공간을
 * 들여다보는 감각이 여기서 나온다. 크게 주면 멀미가 난다.
 */
const PARALLAX_YAW = 0.07;
const PARALLAX_PITCH = 0.05;
/** 포인터를 따라가는 속도. 낮을수록 묵직하게 따라온다. */
const PARALLAX_EASE = 3.5;

/**
 * 은하 하나가 화면에서 차지하는 반경 (로컬 단위).
 * 픽킹 판정과 오라 크기가 이 값을 공유한다.
 */
const GALAXY_RADIUS = 1.05;

/** 호버한 은하가 밝아지는 정도. 나머지는 그대로 두고 이 은하만 올린다. */
const HOVER_GAIN = 0.55;

/**
 * 구절 하나에 집중할 때 나머지 은하가 남는 정도.
 *
 * 0 으로 완전히 지우지 않는 이유: 다 사라지면 "다른 은하가 있었다"는 사실까지
 * 잊게 되어, 닫고 나왔을 때 화면이 낯설어진다. 아주 옅게 남겨 두면
 * 돌아올 자리가 계속 보인다.
 */
export const SOLO_REMAINDER = 0.06;

/**
 * 물러나고 돌아오는 데 걸리는 시간(초).
 *
 * ★ 비대칭이 의도다.
 *   사라질 때는 빨라야 "골랐다"는 반응으로 읽히고, 돌아올 때는 느려야
 *   "다시 생겨난다"로 읽힌다. 같은 속도로 두면 돌아오는 순간이 툭 튄다.
 */
export const SOLO_HIDE_SECONDS = 0.42;
export const SOLO_RETURN_SECONDS = 1.15;

/**
 * 돌아올 때 은하마다 주는 시차(초).
 * 13개가 한 몸처럼 켜지면 스위치를 올린 것처럼 보인다. 조금씩 어긋나게
 * 두면 하나씩 다시 맺히는 결이 생긴다.
 */
export const SOLO_RETURN_STAGGER = 0.055;

/**
 * 이 은하가 지금 얼마나 보여야 하는가 (0..1).
 *
 * 집중 중인 은하는 1, 나머지는 집중이 차오른 만큼 옅어진다.
 * 집중이 없으면(soloGalaxyId 가 null) 전부 1 이므로 평소 화면은 그대로다.
 *
 * 순수 함수로 빼 둔 이유: 그리기·픽킹·테스트가 같은 규칙을 써야 하는데,
 * 클래스 안에 숨겨 두면 "보이지 않는데 눌리는 은하" 같은 어긋남을 잡을 수 없다.
 */
export function soloFadeFor(
  galaxyId: string,
  highlighted: ReadonlySet<string> | null,
  amount: number,
): number {
  if (!highlighted || highlighted.size === 0 || amount <= 0.001) return 1;
  if (highlighted.has(galaxyId)) return 1;
  return lerp(1, SOLO_REMAINDER, Math.min(1, Math.max(0, amount)));
}

/**
 * 구절 별의 최소 크기·밝기.
 * 이보다 작아지면 클릭할 수 있다는 사실이 화면에서 사라진다.
 */
const MIN_STAR_RADIUS = 1.15;
const MIN_STAR_ALPHA = 0.34;

/*
 * 별자리 선이 드러나는 구간.
 *
 * ★ 기준은 "카메라가 얼마나 가까운가"이지 "이 은하가 큰가"가 아니다.
 *   처음에는 은하의 실제 화면 반경으로 재다가, 위성 은하(중심의 0.4배)가
 *   영영 문턱을 넘지 못하는 버그를 만들었다. 같은 화면에서 중심은 157px,
 *   위성은 63px 이라 중심만 100%, 위성은 5% 였다.
 *   그래서 "크기가 1이라면 몇 px 인가"로 정규화한다 — 13개 은하가 같은
 *   카메라 거리에서 함께 드러난다.
 */
const LINE_FADE_IN_PX = 58;
const LINE_FADE_FULL_PX = 150;

/**
 * 이 크기 아래로 작아진 은하는 선을 조금 눌러 준다.
 * 같은 선 개수가 좁은 원 안에 들어가면 그물처럼 뭉치기 때문이다.
 * 0 으로 지우지는 않는다 — 위성도 관계가 보여야 한다.
 */
const LINE_COMPACT_PX = 110;
const LINE_COMPACT_FLOOR = 0.62;

/**
 * 카메라 거리로 정규화한 반경(px) → 선이 드러난 정도 0..1.
 *
 * 은하 크기를 곱하기 전의 값을 받는다. 그래야 중심이든 위성이든
 * 같은 카메라 거리에서 같은 값이 나온다.
 */
export function constellationReveal(unitRadiusPx: number): number {
  return clamp01((unitRadiusPx - LINE_FADE_IN_PX) / (LINE_FADE_FULL_PX - LINE_FADE_IN_PX));
}

/** 선의 최대 불투명도. 별보다 확실히 아래에 있어야 한다. */
const LINE_ALPHA = 0.2;

/** 주제가 겹치는 선이 더 밝다 — 관계의 세기가 밝기로 읽힌다. */
const LINE_KIN_GAIN = 0.55;

/** 선 하나가 아주 느리게 숨 쉬는 주기(초). 눈에 띄면 실패다. */
const LINE_BREATH = 9.5;

/** 스트리킹 선 길이 상한(px). 넘으면 화면이 지저분해진다. */
const MAX_STREAK = 70;

/** FPS 샘플링 구간과 강등 임계값 */
const FPS_SAMPLE_FRAMES = 90;
const FPS_THRESHOLD = 45;

interface StarBuffers {
  count: number;
  originX: Float32Array;
  originY: Float32Array;
  originZ: Float32Array;
  targetX: Float32Array;
  targetY: Float32Array;
  targetZ: Float32Array;
  delay: Float32Array;
  magnitude: Float32Array;
}

function buildBuffers(
  coords: readonly { coord: { x: number; y: number; z: number }; magnitude: number }[],
  seed: number,
  /** 목표 좌표에 곱할 배율. 배경 별을 계 전체 크기로 늘릴 때 쓴다. */
  targetScale = 1,
): StarBuffers {
  const count = coords.length;
  const rand = seededRandom(seed);
  const buffers: StarBuffers = {
    count,
    originX: new Float32Array(count),
    originY: new Float32Array(count),
    originZ: new Float32Array(count),
    targetX: new Float32Array(count),
    targetY: new Float32Array(count),
    targetZ: new Float32Array(count),
    delay: new Float32Array(count),
    magnitude: new Float32Array(count),
  };

  // 밝기 중앙값 — 빛/어둠 분화 기준
  const median = coords.length
    ? [...coords].sort((a, b) => a.magnitude - b.magnitude)[Math.floor(count / 2)].magnitude
    : 0;

  for (let i = 0; i < count; i += 1) {
    const { coord, magnitude } = coords[i];

    // 흩어진 시작 위치: 화면 밖 구면 임의 지점
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const radius = SCATTER_MIN + rand() * (SCATTER_MAX - SCATTER_MIN);

    buffers.originX[i] = Math.sin(phi) * Math.cos(theta) * radius;
    buffers.originY[i] = Math.sin(phi) * Math.sin(theta) * radius;
    buffers.originZ[i] = Math.cos(phi) * radius;

    buffers.targetX[i] = coord.x * targetScale;
    buffers.targetY[i] = coord.y * targetScale;
    buffers.targetZ[i] = coord.z * targetScale;

    const isDark = magnitude < median;
    buffers.delay[i] = rand() * MAX_DELAY + (isDark ? DARK_EXTRA_DELAY : 0);
    buffers.magnitude[i] = magnitude;
  }

  return buffers;
}

/**
 * 카메라로부터의 깊이. 은하를 뒤에서 앞으로 그리는 순서를 정하는 데만 쓴다.
 * project() 와 같은 변환이지만 화면 좌표는 필요 없으므로 z 만 계산한다.
 */
function viewDepth(coord: { x: number; y: number; z: number }, vp: Viewport): number {
  const z1 = coord.x * Math.sin(vp.yaw) + coord.z * Math.cos(vp.yaw);
  return coord.y * Math.sin(vp.pitch) + z1 * Math.cos(vp.pitch) + vp.distance;
}

/** 글로우 스프라이트를 한 번만 렌더해 재사용한다 (매 프레임 gradient 생성은 비싸다). */
function createGlowSprite(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  if (!ctx) return null;

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(232, 236, 242, 0.55)');
  g.addColorStop(0.4, 'rgba(232, 236, 242, 0.14)');
  g.addColorStop(1, 'rgba(232, 236, 242, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

export class GalaxyEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: EngineInput;
  private callbacks: EngineCallbacks;

  private backdropBuffers: StarBuffers;
  private curatedBuffers: StarBuffers;
  private curatedIds: string[];
  /** 13개 은하 (중심 1 + 제자 12) */
  private nodes: GalaxyNode[];
  /** 노드별 성운 먼지. 구절 데이터와 무관한 장식이다. */
  private dustLayers: DustLayer[];
  /** 큐레이션 별이 속한 노드의 인덱스 */
  private curatedNode: Uint8Array;
  /**
   * 상세 콘텐츠가 있는 별인가 (1/0).
   *
   * 글로우는 이 별들에만 붙인다. 520개 전부에 글로우를 그리면 비용도 크지만,
   * 그보다 "어느 별에 이야기가 있는지"가 화면에서 사라지는 게 더 큰 문제다.
   */
  private curatedFull: Uint8Array;
  /** 이번 프레임의 노드별 변환 — 그리기와 픽킹이 같은 값을 쓰도록 캐시한다 */
  private transforms: NodeTransform[];
  /** 깊이 정렬용 노드 인덱스 버퍼. 매 프레임 재정렬하되 새로 만들지는 않는다. */
  private drawOrder: number[];
  /**
   * 노드별 별자리 간선. 큐레이션 버퍼의 인덱스 쌍으로 미리 바꿔 둔다.
   * 매 프레임 id 로 찾으면 간선 수만큼 해시 조회가 생긴다.
   */
  private constellations: { pairs: Int32Array; kin: Float32Array }[];
  /** 선을 그릴 때 재사용하는 화면 좌표 캐시 (sx, sy, 보임 여부) */
  private lineScreen: Float32Array;
  /**
   * 제목 "✝ Eden". 폰트가 준비된 뒤에 만들어지므로 처음엔 null 이다.
   * (폰트 없이 샘플링하면 폴백 글꼴 모양으로 별이 굳어 버린다)
   */
  private wordmark: WordmarkLayer | null = null;
  /** 반짝임용 누적 시간 */
  private elapsed = 0;
  private camera = new Camera();
  /** 직전 프레임의 focusStarId — 바뀌는 순간에만 비행을 시작한다. */
  private lastFocusId: string | null = null;
  /**
   * 카메라가 쉬는 거리. 밝기·크기 감쇠의 기준으로 쓴다.
   * 비행 중 실제 거리가 아니라 "쉬는" 거리를 쓰는 이유는, 별에 다가갈 때
   * 나머지 하늘이 통째로 어두워지는 걸 막기 위해서다.
   */
  private restDistance = INTRO_DISTANCE;
  /**
   * 지금 집중 중인 은하 — 구절 하나를 향해 날아가는 동안 그 별의 은하다.
   * 은하 자체를 고른 경우에는 비워 둔다. 그때는 계 전체를 보는 중이다.
   */
  private soloGalaxyId: string | null = null;
  /**
   * MBTI 로 고른 "결이 가까운 은하들".
   *
   * 구절 집중(soloGalaxyId)과는 별개의 축이다. 하나는 "지금 이 구절을 본다",
   * 다른 하나는 "이 유형과 가까운 은하만 본다"이므로 서로 곱해진다.
   */
  private affinitySet: ReadonlySet<string> | null = null;
  /**
   * 노드별 가시성 진행도 0..1 (1 = 완전히 보임).
   *
   * ★ 프레임마다 다시 계산하지 않고 여기 담아 둔다.
   *   예전에는 별을 그릴 때마다 soloFade() 를 불렀고, 그 안에서 Set 을
   *   새로 만들었다. 별이 702개이므로 프레임당 700번이 넘는 할당이 생겨
   *   선택하는 순간 눈에 띄게 버벅였다.
   */
  private nodeProgress: Float32Array;
  /** 돌아오기 시작한 뒤 흐른 시간(초). 시차를 주는 데 쓴다. */
  private nodeReturnElapsed: Float32Array;
  /** 이번 프레임에 쓸 노드별 최종 가시성. 그리기·픽킹이 같은 값을 본다. */
  private nodeFade: Float32Array;
  /** 직전 프레임의 focusGalaxyId — 바뀌는 순간에만 비행을 시작한다. */
  private lastFocusGalaxyId: string | null = null;
  /**
   * 은하 픽킹용 화면 캐시 (x, y, 반경). 노드 순서와 같다.
   * 별 픽킹과 같은 규칙 — 그린 값을 그대로 재사용해 어긋남을 막는다.
   */
  private galaxyPickCache: Float32Array;

  /**
   * 큐레이션 별의 화면 좌표 캐시 (x, y, 반경).
   * 픽킹은 이 캐시만 훑으면 되므로 재투영이 필요 없다.
   */
  private pickCache: Float32Array;

  private glowSprite: HTMLCanvasElement | null;
  private frameId = 0;
  private lastFrameTime = 0;
  private introTime = 0;
  private introDone = false;
  private running = false;

  /** 직전 프레임의 뷰포트 — 스트리킹을 정확히 계산하는 데 쓴다. */
  private previousViewport: Viewport | null = null;

  /** 목표 포인터 위치(-1..1). 화면 중앙이 0 */
  private pointerTargetX = 0;
  private pointerTargetY = 0;
  /** 실제 적용 중인 위치. 목표를 향해 매 프레임 다가간다 */
  private pointerX = 0;
  private pointerY = 0;

  private frameSamples = 0;
  private elapsedSampleTime = 0;
  private perfReported = false;

  private viewport: Viewport = {
    width: 0,
    height: 0,
    focal: 0,
    yaw: 0,
    pitch: DEFAULT_PITCH,
    distance: DEFAULT_DISTANCE,
  };

  constructor(canvas: HTMLCanvasElement, input: EngineInput, callbacks: EngineCallbacks = {}) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('2D context unavailable');

    this.canvas = canvas;
    this.ctx = ctx;
    this.input = input;
    this.callbacks = callbacks;

    this.nodes = buildNodes();
    this.transforms = this.nodes.map((node) => transformAt(node, 0));
    this.drawOrder = this.nodes.map((_, index) => index);

    // 배경 별은 계 전체를 감싸야 하므로 시스템 반경까지 늘린다.
    this.backdropBuffers = buildBuffers(input.backdrop, 991, SYSTEM_RADIUS * 1.25);
    this.curatedBuffers = buildBuffers(input.curated, 4231);
    this.curatedIds = input.curated.map((s) => s.id);

    const nodeIndexById = new Map(this.nodes.map((node, index) => [node.galaxy.id, index]));
    this.curatedNode = Uint8Array.from(
      input.curated.map((star) => nodeIndexById.get(star.discipleId) ?? 0),
    );

    this.curatedFull = Uint8Array.from(input.curated.map((star) => (star.depth === 'full' ? 1 : 0)));

    this.dustLayers = this.buildDustLayers(input.quality.dustCount);
    this.pickCache = new Float32Array(input.curated.length * 3);
    this.galaxyPickCache = new Float32Array(this.nodes.length * 3);
    this.nodeProgress = new Float32Array(this.nodes.length).fill(1);
    this.nodeReturnElapsed = new Float32Array(this.nodes.length);
    this.nodeFade = new Float32Array(this.nodes.length).fill(1);
    this.lineScreen = new Float32Array(input.curated.length * 3);

    const indexById = new Map(input.curated.map((star, index) => [star.id, index]));
    this.constellations = this.nodes.map((node) => {
      const edges = constellationOf(node.galaxy.id).filter(
        (edge) => indexById.has(edge.a) && indexById.has(edge.b),
      );
      const pairs = new Int32Array(edges.length * 2);
      const kin = new Float32Array(edges.length);
      edges.forEach((edge, i) => {
        pairs[i * 2] = indexById.get(edge.a)!;
        pairs[i * 2 + 1] = indexById.get(edge.b)!;
        kin[i] = edge.kin;
      });
      return { pairs, kin };
    });
    this.glowSprite = createGlowSprite();
    void this.prepareWordmark();

    // 이미 정착 상태로 시작하면 인트로를 건너뛴 것으로 본다.
    if (input.mode === 'settled') {
      this.introTime = this.duration;
      this.introDone = true;
    }
  }

  /**
   * 제목 별 좌표를 준비한다.
   * 폰트를 기다린 뒤 샘플링하므로 비동기다. 실패해도 앱은 그대로 돌아간다.
   */
  private async prepareWordmark(): Promise<void> {
    await waitForFonts();
    const shape = sampleWordmark();
    if (shape) this.wordmark = new WordmarkLayer(shape);
  }

  private get timeline() {
    return this.input.reducedMotion ? REDUCED_TIMELINE : DEFAULT_TIMELINE;
  }

  private get duration(): number {
    return this.timeline.duration;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.lastFrameTime = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  /** 별 데이터가 바뀌면(품질 티어 변경 등) 버퍼를 다시 만든다. */
  setBackdrop(backdrop: readonly BackdropStar[]): void {
    this.input = { ...this.input, backdrop };
    this.backdropBuffers = buildBuffers(backdrop, 991, SYSTEM_RADIUS * 1.25);
  }

  /** 먼지 개수가 바뀌면(티어 강등) 레이어를 다시 만든다. */
  setDustCount(count: number): void {
    this.dustLayers = this.buildDustLayers(count);
  }

  /**
   * 노드별 먼지 레이어.
   * 은하마다 다른 시드를 줘야 12개가 복제한 티가 나지 않고,
   * 램프는 그 제자의 색에서 파생시킨다.
   */
  private buildDustLayers(totalCount: number): DustLayer[] {
    const satellites = Math.max(1, this.nodes.length - 1);
    const centerCount = Math.round(totalCount * CENTER_DUST_SHARE);
    // 위성의 하한을 넉넉히 둔다. 입자가 적으면 은하가 아니라 흐린 얼룩이 된다.
    const satelliteCount = Math.max(150, Math.round((totalCount - centerCount) / satellites));

    return this.nodes.map((node, index) => {
      const count = node.center ? centerCount : satelliteCount;
      return new DustLayer(count, 77003 + index * 1237, rampFor(node.galaxy.tint));
    });
  }

  update(partial: Partial<EngineInput>): void {
    this.input = { ...this.input, ...partial };
  }

  /**
   * 포인터 위치를 알린다. 정규 좌표(-1..1) 기준.
   * 터치 기기와 reduced-motion 에서는 호출하지 않는다.
   */
  setPointer(nx: number, ny: number): void {
    this.pointerTargetX = clamp(nx, -1, 1);
    this.pointerTargetY = clamp(ny, -1, 1);
  }

  setMode(mode: EngineMode): void {
    this.input = { ...this.input, mode };
  }

  /** 건너뛰기 — 최종 상태로 착지시킨다. */
  skipIntro(): void {
    this.introTime = this.duration;
    this.finishIntro();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewport = {
      ...this.viewport,
      width: w,
      height: h,
      // 짧은 변 기준이라 세로 화면에서도 성운이 잘리지 않는다.
      focal: focalFor(w, h),
    };
  }

  private finishIntro(): void {
    if (this.introDone) return;
    this.introDone = true;
    this.input = { ...this.input, mode: 'settled' };
    this.callbacks.onIntroDone?.();
  }

  private tick = (now: number): void => {
    if (!this.running) return;

    // 탭 복귀 시 큰 델타가 들어오면 연출이 순간이동한다 — 상한을 둔다.
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;
    this.elapsed += dt;

    this.sampleFps(dt);

    const introActive = this.input.mode === 'intro' && !this.introDone;
    if (introActive) {
      this.introTime = Math.min(this.introTime + dt, this.duration);
      const { index, opacity } = resolveBeat(this.timeline.beats, this.introTime);
      this.callbacks.onIntroFrame?.({ time: this.introTime, beatIndex: index, textOpacity: opacity });
      if (this.introTime >= this.duration) this.finishIntro();
    }


    // 포인터는 즉시 따라가지 않고 뒤늦게 따라온다 — 무게감이 생긴다.
    const follow = Math.min(1, PARALLAX_EASE * dt);
    this.pointerX += (this.pointerTargetX - this.pointerX) * follow;
    this.pointerY += (this.pointerTargetY - this.pointerY) * follow;

    this.updateCamera(dt);
    this.draw();
    this.frameId = requestAnimationFrame(this.tick);
  };

  /**
   * 카메라 갱신.
   *
   * 목표는 "고정 좌표"가 아니라 "지금 이 순간 별이 있는 위치"다.
   * 은하가 자전하므로 좌표를 한 번 찍어 두면 도착했을 때 별이 없다.
   */
  private updateCamera(dt: number): void {
    const { focusStarId, curated, reducedMotion } = this.input;
    const focusGalaxyId = this.input.focusGalaxyId ?? null;

    // 포커스가 바뀌는 순간에만 비행을 시작한다.
    if (focusStarId !== this.lastFocusId || focusGalaxyId !== this.lastFocusGalaxyId) {
      this.lastFocusId = focusStarId;
      this.lastFocusGalaxyId = focusGalaxyId;
      this.camera.flyTo(reducedMotion);
    }

    /*
     * 조준 지점은 "지금 이 순간의 월드 좌표"다.
     * 별은 은하 안에서 자전하고, 그 은하는 중심을 공전한다 — 좌표를 한 번
     * 찍어 두고 날아가면 도착했을 때 별은 이미 다른 곳에 가 있다.
     */
    const starIndex = focusStarId ? this.curatedIds.indexOf(focusStarId) : -1;
    const star = starIndex >= 0 ? curated[starIndex] : undefined;
    const node = starIndex >= 0 ? this.nodes[this.curatedNode[starIndex]] : undefined;

    /*
     * 구절 하나를 향해 갈 때는 그 별의 은하만 남긴다.
     * 13개가 전부 켜져 있으면 어디를 보라는 화면인지 알 수 없다.
     */
    this.soloGalaxyId = node ? node.galaxy.id : null;
    this.updateNodeVisibility(dt);

    /*
     * 별이 먼저다. 별을 고르지 않았고 은하만 골랐다면 그 은하를 담는다.
     * 은하는 공전하므로 이것도 매 프레임 다시 계산해야 한다.
     */
    /*
     * ★ 다가서는 거리를 은하 크기에 비례시킨다.
     *   상수로 두면 반지름 0.4 인 위성 은하는 중심 은하와 같은 간격에 서도
     *   화면을 2.5배 덜 채운다. "애매하게 확대"되는 정체가 이것이다.
     */
    let target =
      star && node
        ? aimAt(
            worldPointOf(node, star.coord, this.elapsed),
            FOCUS_APPROACH * node.scale,
          )
        : null;
    if (!target && focusGalaxyId) {
      const index = this.nodes.findIndex((n) => n.galaxy.id === focusGalaxyId);
      if (index >= 0) {
        const picked = this.nodes[index];
        target = aimAtGalaxy(
          transformAt(picked, this.elapsed).center,
          picked.scale * GALAXY_RADIUS,
          this.camera.state.yaw,
        );
      }
    }

    /*
     * 조준할 별이 없을 때 머무는 거리.
     * 인트로에서는 중심 은하만 화면에 담고, 12제자 은하가 드러나는 동안
     * 계 전체가 들어오도록 서서히 뒤로 물러난다.
     *
     * SETTLED_SCALE 을 곱해 두는 이유: 같은 구간에 currentScaleFactor() 가
     * 그리기 거리를 SETTLED_SCALE 로 나눈다. 여기서 미리 곱해 두면 서로
     * 상쇄되어 실제 그려지는 거리가 정확히 SYSTEM_DISTANCE 가 된다.
     */
    const reveal = this.systemReveal();
    // 감쇠 기준은 "그려지는" 거리다 (배율로 나뉘기 전 값이 아니라).
    this.restDistance = lerp(INTRO_DISTANCE, SYSTEM_DISTANCE, reveal);

    /*
     * ★ 목표 거리에 그리기 배율을 곱한다.
     *
     *   그려지는 거리 = 카메라 거리 / currentScaleFactor()
     *
     *   조준 함수는 "그려지는 거리"로 계산하므로, 여기서 배율을 곱해 두지
     *   않으면 나눗셈이 그대로 남는다. 원점에서 멀수록 그 오차가 커져서,
     *   중심 은하의 별은 그럭저럭 맞고 위성 은하의 별만 한참 뒤에 선다.
     */
    const scale = this.currentScaleFactor();
    const rest = this.restDistance * scale;
    if (target) target = { ...target, distance: target.distance * scale };

    const arrived = this.camera.update(target, dt, rest);
    if (arrived && focusStarId) this.callbacks.onArrive?.(focusStarId);
  }

  /**
   * 화면 좌표에서 가장 가까운 별을 찾는다.
   * 캐시된 투영 좌표만 훑으므로 별 개수에 선형이고, 40개 기준 무시할 비용이다.
   *
   * @returns 임계 반경 안에 별이 있으면 id, 없으면 null
   */
  pickAt(x: number, y: number): string | null {
    let bestId: string | null = null;
    let bestDistance = Infinity;

    for (let i = 0; i < this.curatedIds.length; i += 1) {
      const sx = this.pickCache[i * 3];
      const sy = this.pickCache[i * 3 + 1];
      const radius = this.pickCache[i * 3 + 2];
      // 화면 밖으로 밀린 별은 반경 0으로 표시해 둔다.
      if (radius <= 0) continue;

      const distance = Math.hypot(sx - x, sy - y);
      // 작은 별도 누를 수 있도록 최소 터치 반경을 보장한다.
      const threshold = Math.max(radius * 3, 18);
      if (distance < threshold && distance < bestDistance) {
        bestDistance = distance;
        bestId = this.curatedIds[i];
      }
    }

    return bestId;
  }

  /**
   * 화면 좌표 아래에 있는 은하를 찾는다.
   *
   * 별 픽킹이 실패했을 때만 의미가 있다 — 별이 곧 은하 안에 있으므로,
   * 별을 먼저 보고 없을 때 은하로 넓히는 순서를 호출부가 지켜야 한다.
   * 겹쳐 보일 때는 카메라에 가까운(=화면에서 큰) 은하를 고른다.
   */
  pickGalaxyAt(x: number, y: number): string | null {
    let bestId: string | null = null;
    let bestScore = Infinity;

    for (let i = 0; i < this.nodes.length; i += 1) {
      const sx = this.galaxyPickCache[i * 3];
      const sy = this.galaxyPickCache[i * 3 + 1];
      const radius = this.galaxyPickCache[i * 3 + 2];
      if (radius <= 0) continue;

      const distance = Math.hypot(sx - x, sy - y);
      if (distance > radius) continue;

      // 중심에 가까울수록, 그리고 큰 은하일수록 우선한다.
      const score = distance / radius;
      if (score < bestScore) {
        bestScore = score;
        bestId = this.nodes[i].galaxy.id;
      }
    }

    return bestId;
  }

  /**
   * 드래그로 시점을 돌린다. 캔버스 크기로 정규화된 이동량을 받는다.
   * 인트로 중에는 무시한다 — 연출이 진행 중인 카메라를 빼앗지 않는다.
   */
  drag(dxRatio: number, dyRatio: number): void {
    if (!this.introDone) return;
    this.camera.drag(dxRatio, dyRatio);
  }

  /** 첫 90프레임의 실측 FPS로 티어 강등 여부를 판단한다. */
  private sampleFps(dt: number): void {
    if (this.perfReported || this.frameSamples >= FPS_SAMPLE_FRAMES) return;
    this.frameSamples += 1;
    this.elapsedSampleTime += dt;

    if (this.frameSamples < FPS_SAMPLE_FRAMES) return;
    const fps = this.frameSamples / Math.max(this.elapsedSampleTime, 0.001);
    this.perfReported = true;
    if (fps < FPS_THRESHOLD) this.callbacks.onPerformanceDrop?.(fps);
  }

  /**
   * 인트로 후반, 성운이 뒤로 물러나는 배율.
   * 3D 에서는 "작게 그리기"가 아니라 "카메라를 뒤로 빼기"로 구현한다.
   */
  private currentScaleFactor(): number {
    if (this.input.reducedMotion) {
      return this.introDone ? SETTLED_SCALE : 1;
    }
    if (this.introTime < SETTLE_START) return 1;
    const t = clamp01((this.introTime - SETTLE_START) / SETTLE_DURATION);
    return lerp(1, SETTLED_SCALE, easeOutCubic(t));
  }

  /**
   * 12제자 은하가 드러난 정도 0..1.
   *
   * 제목이 상단으로 올라가며 은하가 뒤로 물러나는 바로 그 구간에 맞춘다.
   * 창세기 문장이 흐르는 동안에는 중심 은하 하나만 보여야 한다 —
   * 처음부터 13개가 다 있으면 "빛이 있으라"의 단독성이 사라진다.
   */
  private systemReveal(): number {
    if (this.input.reducedMotion) return this.introDone ? 1 : 0;
    if (this.introDone) return 1;
    if (this.introTime < SETTLE_START) return 0;
    return easeOutCubic(clamp01((this.introTime - SETTLE_START) / SETTLE_DURATION));
  }

  private draw(): void {
    const { ctx } = this;
    const { quality, focusStarId, hoverStarId } = this.input;
    const { width, height } = this.viewport;
    if (width === 0 || height === 0) return;

    ctx.clearRect(0, 0, width, height);

    // 드래그 오프셋이 반영된 각도로 그린다 (state 는 오프셋 이전 값이다).
    const camera = this.camera.view;
    const vp: Viewport = {
      ...this.viewport,
      // 패럴랙스는 카메라 각도를 아주 조금 흔든다 — 2D 로 미는 게 아니다.
      yaw: camera.yaw + this.pointerX * PARALLAX_YAW,
      pitch: camera.pitch - this.pointerY * PARALLAX_PITCH,
      // 인트로에서 뒤로 물러나는 구간은 거리로 표현한다.
      distance: camera.distance / this.currentScaleFactor(),
      // 은하가 늘어 카메라가 물러나도 하늘이 어두워지지 않게 하는 기준.
      depthReference: this.restDistance,
    };

    const tl = this.timeline;
    const convergence = this.introDone
      ? 1
      : resolveConvergence(tl.beats, this.introTime, tl.initialConvergence);
    const luminance = this.introDone
      ? 1
      : resolveLuminance(tl.beats, this.introTime, tl.initialLuminance);
    const pulse = this.introDone ? 0 : resolvePulse(tl.beats, this.introTime);

    /*
     * 13개 은하의 이번 프레임 변환을 한 번만 계산해 캐시한다.
     * 그리기와 카메라 조준, 픽킹이 전부 같은 값을 써야 어긋나지 않는다.
     */
    const reveal = this.systemReveal();
    for (let i = 0; i < this.nodes.length; i += 1) {
      this.transforms[i] = transformAt(this.nodes[i], this.elapsed);
    }

    /*
     * 먼 은하부터 그린다.
     * 캔버스 2D 에는 깊이 버퍼가 없으므로 그리는 순서가 곧 앞뒤다.
     * 정렬하지 않으면 뒤쪽 은하가 앞쪽 위에 얹혀 공전이 평면처럼 보인다.
     * (13개뿐이라 매 프레임 정렬해도 비용은 무시할 수준이다)
     */
    const order = this.drawOrder;
    order.sort((a, b) => viewDepth(this.transforms[b].center, vp) - viewDepth(this.transforms[a].center, vp));

    const hoverGalaxyId = this.input.hoverGalaxyId ?? null;

    // 안개와 먼지가 가장 아래. 그 위에 구절 별들이 올라간다.
    for (const index of order) {
      const node = this.nodes[index];
      // 위성 은하는 인트로 후반에 서서히 나타난다.
      const reveals = node.center ? 1 : reveal;
      const hovered = node.galaxy.id === hoverGalaxyId;
      const nodeLuminance =
        luminance * reveals * (hovered ? 1 + HOVER_GAIN : 1) * this.soloFade(index);

      this.cacheGalaxyPick(index, vp, reveals);
      if (nodeLuminance <= 0.01) continue;

      const transform = this.transforms[index];
      const layer = this.dustLayers[index];

      // 호버한 은하는 색 오라를 먼저 깔아 "이 은하"라는 범위를 보여 준다.
      if (hovered) this.drawGalaxyAura(index, vp, reveals);

      /*
       * 물러난 은하는 안개를 그리지 않는다.
       * 안개 블롭 하나마다 그라디언트를 새로 만들므로, 옅어져 보이지도 않는
       * 은하 12개에 84개를 만드는 셈이 된다.
       */
      if (quality.haze && nodeLuminance > 0.12) layer.drawHaze(ctx, vp, nodeLuminance, transform);
      layer.draw(ctx, vp, convergence, nodeLuminance, transform);

      // 관계선은 성운 위, 별 아래. 별을 가리지 않으면서 별을 잇는다.
      this.drawConstellation(index, vp, nodeLuminance, hovered);
    }

    /*
     * 비행 중에는 배경 별을 짧은 선으로 늘여 이동 방향을 드러낸다.
     * 방향감이 없으면 "이동"이 아니라 "화면이 갑자기 바뀐 것"으로 읽힌다.
     *
     * 궤도 카메라에서는 화면 이동이 회전·거리 변화가 뒤섞인 결과라
     * 공식으로 근사하기 어렵다. 직전 프레임의 뷰포트로 한 번 더 투영해
     * 실제 화면 변위를 그대로 쓴다 (비행 중에만 드는 비용이다).
     */
    const streakFrom = quality.streaks && this.camera.flying ? this.previousViewport : null;
    this.drawBuffers(this.backdropBuffers, vp, convergence, luminance, false, 1.1, 0.5, streakFrom);
    this.drawCurated(
      vp,
      convergence,
      luminance,
      reveal,
      quality.glow,
      focusStarId,
      hoverStarId,
      hoverGalaxyId,
    );

    if (pulse > 0.01) this.drawPulse(vp, pulse);

    /*
     * 제목은 맨 위에 그린다 — 은하 앞에 놓인 이름이다.
     * 인트로가 끝난 뒤에는 상단에 상주한다.
     */
    if (this.wordmark) {
      const state = this.introDone
        ? WORDMARK_SETTLED
        : resolveWordmark(this.introTime, this.input.reducedMotion);
      this.wordmark.draw(ctx, state, width, height, this.elapsed);
    }

    this.previousViewport = vp;
  }

  /**
   * 한 은하 안의 별자리 선.
   *
   * ★ 선은 별의 "지금 위치"를 그대로 따라야 한다.
   *   좌표를 따로 계산하면 은하가 자전하는 동안 선만 제자리에 남아
   *   별에서 떨어져 나간다. 별을 그릴 때와 같은 변환을 쓴다.
   */
  private drawConstellation(
    index: number,
    vp: Viewport,
    luminance: number,
    hovered: boolean,
  ): void {
    // 인트로에서 별이 아직 날아오는 중에는 잇지 않는다 — 선만 허공에 남는다.
    if (!this.introDone) return;

    const set = this.constellations[index];
    if (set.pairs.length === 0) return;

    const node = this.nodes[index];
    const transform = this.transforms[index];
    const center = project(transform.center, vp);
    if (!center.visible) return;

    /*
     * 드러나는 정도는 카메라 거리만 본다 (은하 크기를 곱하지 않은 값).
     * 곱해 버리면 작은 위성 은하는 아무리 가까이 가도 문턱을 넘지 못한다.
     */
    const reveal = constellationReveal(GALAXY_RADIUS * center.k);

    // 작은 은하는 같은 선이 좁은 원에 뭉치므로 살짝만 눌러 준다.
    const compactness = clamp01((node.scale * GALAXY_RADIUS * center.k) / LINE_COMPACT_PX);
    const compact = LINE_COMPACT_FLOOR + (1 - LINE_COMPACT_FLOOR) * compactness;

    const gain = reveal * compact * luminance * (hovered ? 1.7 : 1);
    if (gain < 0.02) return;

    const { ctx } = this;
    const buffers = this.curatedBuffers;
    const local = { x: 0, y: 0, z: 0 };

    // 간선마다 양 끝을 투영하면 별 하나를 두세 번 투영하게 된다. 한 번만 한다.
    const members = new Set<number>();
    for (let i = 0; i < set.pairs.length; i += 1) members.add(set.pairs[i]);

    for (const star of members) {
      local.x = buffers.targetX[star];
      local.y = buffers.targetY[star];
      local.z = buffers.targetZ[star];
      const p = project(toWorld(local, transform), vp);
      this.lineScreen[star * 3] = p.sx;
      this.lineScreen[star * 3 + 1] = p.sy;
      this.lineScreen[star * 3 + 2] = p.visible ? p.depth : 0;
    }

    const [r, g, b] = parseHex(node.galaxy.tint ?? NEUTRAL_TINT);
    ctx.lineCap = 'round';
    // 위성은 선 간격이 좁으므로 조금 더 가늘게 긋는다.
    ctx.lineWidth = (hovered ? 0.9 : 0.7) * (node.center ? 1 : 0.85);

    for (let i = 0; i < set.kin.length; i += 1) {
      const a = set.pairs[i * 2];
      const b2 = set.pairs[i * 2 + 1];
      const depthA = this.lineScreen[a * 3 + 2];
      const depthB = this.lineScreen[b2 * 3 + 2];
      if (depthA <= 0 || depthB <= 0) continue;

      /*
       * 아주 느린 호흡. 선마다 위상을 어긋나게 두어 전체가 한 번에
       * 밝아지지 않게 한다 — 같이 깜빡이면 장식이 아니라 경고등이 된다.
       */
      const breath =
        0.78 + 0.22 * Math.sin((this.elapsed / LINE_BREATH) * Math.PI * 2 + i * 1.7);

      const alpha =
        LINE_ALPHA *
        gain *
        breath *
        (1 - LINE_KIN_GAIN + LINE_KIN_GAIN * set.kin[i]) *
        ((depthA + depthB) / 2);
      if (alpha < 0.004) continue;

      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(this.lineScreen[a * 3], this.lineScreen[a * 3 + 1]);
      ctx.lineTo(this.lineScreen[b2 * 3], this.lineScreen[b2 * 3 + 1]);
      ctx.stroke();
    }
  }

  /**
   * 노드별 가시성을 한 번에 갱신한다.
   *
   * ★ 프레임당 한 번, 노드 수(13)만큼만 돈다.
   *   별 하나하나에서 다시 계산하면 같은 답을 702번 구하게 된다.
   *
   * ★ 사라짐과 돌아옴의 시간이 다르다.
   *   빠르게 물러나고 느리게 돌아온다. 돌아올 때는 은하마다 시차를 줘서
   *   한 몸처럼 켜지지 않게 한다.
   */
  private updateNodeVisibility(dt: number): void {
    /*
     * 집합을 프레임마다 새로 만들지 않는다.
     * 입력 배열이 그대로면 (GalaxyContext 가 useMemo 로 보장한다) 기존 것을 쓴다.
     */
    const affinity = this.input.affinityGalaxyIds ?? null;
    if (!affinity || affinity.length === 0) {
      this.affinitySet = null;
    } else if (!this.affinitySet || this.affinitySet.size !== affinity.length) {
      this.affinitySet = new Set(affinity);
    } else if (affinity.some((id) => !this.affinitySet!.has(id))) {
      this.affinitySet = new Set(affinity);
    }

    /*
     * 구절 집중용 집합은 프레임당 한 번만 만든다.
     * 노드 루프 안에서 만들면 13번, 별 루프에서 만들면 702번이 된다.
     */
    const soloSet = this.soloGalaxyId ? new Set([this.soloGalaxyId]) : null;

    for (let i = 0; i < this.nodes.length; i += 1) {
      const id = this.nodes[i].galaxy.id;

      /*
       * 두 축이 독립이다.
       * 구절 하나에 집중 중이면 그 은하만, MBTI 를 골랐으면 결이 가까운
       * 은하들만 남는다. 둘 다 걸려 있으면 둘 다 통과해야 한다.
       * (판정 규칙은 soloFadeFor 한 곳에만 둔다)
       */
      const visible =
        soloFadeFor(id, soloSet, 1) >= 1 && soloFadeFor(id, this.affinitySet, 1) >= 1;

      const progress = this.nodeProgress[i];
      if (!visible) {
        this.nodeProgress[i] = Math.max(0, progress - dt / SOLO_HIDE_SECONDS);
        this.nodeReturnElapsed[i] = 0;
      } else if (progress < 1) {
        // 시차만큼 기다렸다가 돌아오기 시작한다.
        this.nodeReturnElapsed[i] += dt;
        const delay = i * SOLO_RETURN_STAGGER;
        if (this.nodeReturnElapsed[i] >= delay) {
          this.nodeProgress[i] = Math.min(1, progress + dt / SOLO_RETURN_SECONDS);
        }
      }

      // 선형으로 움직인 값을 곡선으로 다듬어야 시작과 끝이 부드럽다.
      const eased = easeInOutCubic(this.nodeProgress[i]);
      this.nodeFade[i] = SOLO_REMAINDER + (1 - SOLO_REMAINDER) * eased;
    }
  }

  /** 이번 프레임의 노드 가시성. 계산은 updateNodeVisibility 가 이미 끝냈다. */
  private soloFade(nodeIndex: number): number {
    return this.nodeFade[nodeIndex];
  }

  /**
   * 은하 픽킹용 화면 반경을 이번 프레임 값으로 갱신한다.
   * 그리는 것과 같은 뷰포트를 쓰므로 눈에 보이는 자리와 클릭 판정이 어긋나지 않는다.
   */
  private cacheGalaxyPick(index: number, vp: Viewport, reveal: number): void {
    const node = this.nodes[index];
    const p = project(this.transforms[index].center, vp);
    // 옅어져서 거의 보이지 않는 은하는 누를 수도 없어야 한다.
    const drawn = p.visible && reveal > 0.4 && this.soloFade(index) > 0.5;

    this.galaxyPickCache[index * 3] = p.sx;
    this.galaxyPickCache[index * 3 + 1] = p.sy;
    // 아주 작게 보이는 은하도 누를 수 있도록 하한을 둔다.
    this.galaxyPickCache[index * 3 + 2] = drawn
      ? Math.max(28, node.scale * GALAXY_RADIUS * p.k)
      : 0;
  }

  /**
   * 호버한 은하를 감싸는 색 오라.
   *
   * ★ 색은 그 제자의 색이다.
   *   먼지 색만으로는 12개를 구분하기 어렵다 — 특히 작게 보이는 위성은
   *   색이 거의 회백으로 수렴한다. 오라가 그 색을 한 번에 크게 보여 준다.
   *   중심(예수) 은하는 색이 없으므로 은백으로 은은하게만 두른다.
   */
  private drawGalaxyAura(index: number, vp: Viewport, reveal: number): void {
    const node = this.nodes[index];
    const p = project(this.transforms[index].center, vp);
    if (!p.visible || reveal <= 0.4) return;

    const radius = Math.max(36, node.scale * GALAXY_RADIUS * p.k * 1.35);
    const [r, g, b] = parseHex(node.galaxy.tint ?? NEUTRAL_TINT);
    const peak = 0.16 * reveal;

    const gradient = this.ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, radius);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${peak.toFixed(3)})`);
    gradient.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${(peak * 0.42).toFixed(3)})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // 아주 얇은 테두리 하나가 "선택 가능한 덩어리"라는 신호를 준다.
    this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(0.3 * reveal).toFixed(3)})`;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(p.sx, p.sy, radius * 0.74, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  /** 배경 별 — 버퍼를 순회하며 그린다. 객체 할당이 없다. */
  private drawBuffers(
    buffers: StarBuffers,
    vp: Viewport,
    convergence: number,
    luminance: number,
    glow: boolean,
    magScale: number,
    baseRadius: number,
    /** 직전 프레임 뷰포트. 주면 그 위치에서 현재 위치로 선을 긋는다. */
    streakFrom: Viewport | null = null,
  ): void {
    const point = { x: 0, y: 0, z: 0 };
    if (streakFrom) this.ctx.lineCap = 'round';

    for (let i = 0; i < buffers.count; i += 1) {
      const t = this.starProgress(buffers.delay[i], convergence);
      point.x = lerp(buffers.originX[i], buffers.targetX[i], t);
      point.y = lerp(buffers.originY[i], buffers.targetY[i], t);
      point.z = lerp(buffers.originZ[i], buffers.targetZ[i], t);

      const p = project(point, vp);
      // 카메라 뒤에 있거나 화면 밖이면 그리지 않는다.
      if (!p.visible) continue;
      if (p.sx < -40 || p.sx > vp.width + 40 || p.sy < -40 || p.sy > vp.height + 40) continue;

      const mag = buffers.magnitude[i];
      const alpha = mag * p.depth * luminance;

      if (streakFrom) {
        const prev = project(point, streakFrom);
        const dx = clamp(prev.sx - p.sx, -MAX_STREAK, MAX_STREAK);
        const dy = clamp(prev.sy - p.sy, -MAX_STREAK, MAX_STREAK);

        // 움직임이 거의 없으면 선 대신 점으로 그린다.
        if (prev.visible && Math.hypot(dx, dy) > 1.5) {
          this.ctx.strokeStyle = `rgba(244, 244, 242, ${(alpha * 0.7).toFixed(3)})`;
          this.ctx.lineWidth = baseRadius + mag * magScale * p.depth;
          this.ctx.beginPath();
          this.ctx.moveTo(p.sx, p.sy);
          this.ctx.lineTo(p.sx + dx, p.sy + dy);
          this.ctx.stroke();
          continue;
        }
      }

      drawStar(this.ctx, p, baseRadius + mag * magScale * p.depth, alpha, glow);
    }
  }

  /**
   * 큐레이션 별 — 포커스/호버 링과 글로우가 붙는다.
   *
   * ★ 목표 좌표는 은하 로컬 좌표다
   *   먼저 그 별이 속한 은하의 변환으로 월드 좌표를 구한 뒤,
   *   흩어진 시작 위치(월드)에서 그리로 수렴시킨다. 반대로 하면
   *   별이 은하와 함께 도는 게 아니라 화면 위에서 미끄러진다.
   */
  private drawCurated(
    vp: Viewport,
    convergence: number,
    luminance: number,
    reveal: number,
    glow: boolean,
    focusStarId: string | null,
    hoverStarId: string | null,
    hoverGalaxyId: string | null,
  ): void {
    const buffers = this.curatedBuffers;
    const point = { x: 0, y: 0, z: 0 };
    const local = { x: 0, y: 0, z: 0 };

    for (let i = 0; i < buffers.count; i += 1) {
      const nodeIndex = this.curatedNode[i];
      const node = this.nodes[nodeIndex];
      const transform = this.transforms[nodeIndex];
      const hovered = node.galaxy.id === hoverGalaxyId;
      const starLuminance =
        luminance *
        (node.center ? 1 : reveal) *
        (hovered ? 1 + HOVER_GAIN * 0.6 : 1) *
        this.soloFade(nodeIndex);

      /*
       * ★ 별 크기는 은하 크기를 따라간다.
       *   위성 은하는 중심의 0.4배로 그려지는데 별만 같은 크기로 두면,
       *   작은 성운 위에 큰 점이 얹혀 "별이 은하보다 커 보이는" 상태가 된다.
       *   완전히 비례시키면 너무 작아지므로 절반만 따라가게 눌러 둔다.
       */
      const sizeScale = node.center ? 1 : 0.5 + node.scale * 0.5;

      local.x = buffers.targetX[i];
      local.y = buffers.targetY[i];
      local.z = buffers.targetZ[i];
      const world = toWorld(local, transform);

      const t = this.starProgress(buffers.delay[i], convergence);
      point.x = lerp(buffers.originX[i], world.x, t);
      point.y = lerp(buffers.originY[i], world.y, t);
      point.z = lerp(buffers.originZ[i], world.z, t);

      const p = project(point, vp);
      const id = this.curatedIds[i];
      const isFocus = id === focusStarId;
      const isHover = id === hoverStarId;
      const boost = isFocus ? 1.6 : isHover ? 1.3 : 1;

      /*
       * 크기와 밝기에 하한을 둔다.
       * 계 전체를 담는 거리에서는 계산값이 1px 아래로 내려가는데, 그러면
       * 캔버스에서 반투명한 얼룩이 되어 "별이 있다"는 사실 자체가 사라진다.
       * 클릭 대상이기도 하므로 보이지 않으면 기능이 없는 것과 같다.
       */
      const mag = buffers.magnitude[i];
      const radius =
        Math.max(MIN_STAR_RADIUS, (1.15 + mag * 2.3) * p.depth) * boost * sizeScale;
      const alpha = Math.min(
        1,
        Math.max(MIN_STAR_ALPHA, (0.5 + mag * 0.5) * p.depth) * boost * starLuminance,
      );

      // 픽킹 캐시 갱신. 카메라 뒤·화면 밖·아직 안 나타난 별은 반경 0으로 둔다.
      const offscreen =
        !p.visible ||
        p.sx < -40 ||
        p.sx > vp.width + 40 ||
        p.sy < -40 ||
        p.sy > vp.height + 40 ||
        alpha < 0.08;
      this.pickCache[i * 3] = p.sx;
      this.pickCache[i * 3 + 1] = p.sy;
      this.pickCache[i * 3 + 2] = offscreen ? 0 : radius;

      if (!p.visible) continue;

      if (glow && this.curatedFull[i] === 1 && this.glowSprite && alpha > 0.05) {
        // 글로우도 별과 같은 비율로 줄여야 위성의 후광만 커지지 않는다.
        const size = radius * 10;
        this.ctx.globalAlpha = alpha * 0.7;
        this.ctx.drawImage(this.glowSprite, p.sx - size / 2, p.sy - size / 2, size, size);
        this.ctx.globalAlpha = 1;
      }

      drawStar(this.ctx, p, radius, alpha, false);

      if ((isFocus || isHover) && alpha > 0.1) {
        this.ctx.strokeStyle = `rgba(232, 236, 242, ${isFocus ? 0.55 : 0.28})`;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(p.sx, p.sy, radius + (isFocus ? 12 : 8), 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
  }

  /** "빛이 있으라" 순간의 방사형 광량 펄스. */
  private drawPulse(vp: Viewport, intensity: number): void {
    const cx = vp.width / 2;
    const cy = vp.height / 2;
    const radius = Math.max(vp.width, vp.height) * 0.75;
    const g = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, `rgba(242, 233, 216, ${(intensity * 0.22).toFixed(3)})`);
    g.addColorStop(0.45, `rgba(232, 236, 242, ${(intensity * 0.07).toFixed(3)})`);
    g.addColorStop(1, 'rgba(232, 236, 242, 0)');
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, vp.width, vp.height);
  }

  /** 별 하나의 수렴 진행도. 먼지 레이어와 같은 규칙을 공유한다. */
  private starProgress(delay: number, convergence: number): number {
    return convergeProgress(delay, convergence);
  }
}
