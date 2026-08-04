/*
 * galaxy/Camera.ts
 * ───────────────────────────────────────────────────────────────────────
 * 은하수 궤도 카메라.
 *
 * 카메라는 항상 원점(은하 중심)을 바라보며 구면 궤도 위를 움직인다.
 *   yaw      — Y축 기준 방위각
 *   pitch    — 은하면 위로 올라간 각도
 *   distance — 중심까지 거리
 *
 * 별로 간다는 것은 "그 별이 카메라와 중심 사이에 오도록 궤도를 도는 것"이다.
 * 화면 중앙에 별이 놓이고, 그 뒤로 은하 중심이 보인다. 자유 비행보다
 * 길을 잃지 않고, 은하가 항상 화면 안에 남는다.
 *
 * ★ 자전 문제
 *   은하는 계속 자전한다. 목표 별의 좌표를 한 번 찍어 두고 그리로 돌면,
 *   도착했을 때 별은 이미 다른 각도에 가 있다. 그래서 목표를 "고정 좌표"가
 *   아니라 "매 프레임 다시 계산되는 별의 현재 위치"로 둔다.
 */

import { easeInOutCubic, lerp } from './easing';
import type { GalaxyCoord } from '../data/types';

/** 비행 시간(초). tokens.css 의 --dur-journey 와 같은 값. */
export const FLIGHT_DURATION = 1.6;
/** reduced-motion 에서는 비행 대신 짧은 크로스페이드로 착지한다. */
export const FLIGHT_DURATION_REDUCED = 0.24;

/** 평상시 카메라 거리 — 은하 전체가 화면에 들어온다. */
export const DEFAULT_DISTANCE = 2.9;
/** 평상시 고도. 0이면 원반을 옆에서 보게 되어 나선이 안 보인다. */
export const DEFAULT_PITCH = 0.34;
/** 자동 선회 속도(rad/s). 의식되지 않을 만큼 느리게. */
export const ORBIT_SPEED = 0.055;

/**
 * 별에 도착했을 때 별 앞에 남기는 거리.
 *
 * ★ 이 값은 "그려지는 거리" 기준이다.
 *   엔진은 인트로 후 카메라 거리를 SETTLED_SCALE 로 나눠 그리므로,
 *   호출부가 그 배율을 곱해서 넘겨야 실제로 이만큼 앞에 선다.
 *   곱하지 않으면 원점에서 먼 목표일수록 간격이 함께 부풀어,
 *   위성 은하의 별은 의도보다 5배 뒤에 멈춘다.
 *
 * ★ 은하 크기를 곱해서 쓴다.
 *   같은 간격에 서도 작은 은하는 화면을 덜 채운다. 크기에 비례시켜야
 *   어느 은하로 들어가든 같은 구도로 도착한다.
 */
export const FOCUS_APPROACH = 1.35;

/*
 * 고도 보정은 넣지 않는다.
 * 카메라는 항상 원점을 보므로, 고도를 조금이라도 틀면 그만큼 별이 화면
 * 중앙에서 밀려난다 (0.12rad 만 줘도 1000px 화면에서 176px 어긋났다).
 * 입체감은 평상시 고도(DEFAULT_PITCH)와 궤도 선회가 만들어 주면 충분하다.
 */

/** 수직으로 완전히 서면 방위각이 의미를 잃는다(짐벌락). 조금 못 미치게 막는다. */
const MAX_PITCH = 1.35;

/**
 * 드래그 감도 — 화면 가로폭을 한 번 훑으면 도는 각도(rad).
 * 한 바퀴(2π)로 두면 손이 조금만 떨려도 하늘이 휙 돌아간다.
 */
export const DRAG_YAW_PER_WIDTH = Math.PI * 1.1;
export const DRAG_PITCH_PER_HEIGHT = Math.PI * 0.55;

/** 사용자가 돌려 둔 각도가 자동 선회로 되돌아가는 속도(1/s). */
const DRAG_RELEASE = 0.35;

export interface CameraState {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface OrbitTarget {
  yaw: number;
  pitch: number;
  distance: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** -π..π 로 접은 각도 차이. 최단 방향으로 돌기 위해 필요하다. */
export function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** 최단 경로로 각도를 보간한다. 그냥 lerp 하면 한 바퀴 돌아가는 사고가 난다. */
export function lerpAngle(from: number, to: number, t: number): number {
  return from + shortestAngle(from, to) * t;
}

/**
 * 별을 화면 중앙에 놓는 궤도 파라미터.
 *
 * 카메라 위치는 별의 반대편이 아니라 "별 너머"다:
 * 카메라 → 별 → 은하 중심 순서가 되도록 별 방향의 바깥쪽에 선다.
 */
export function aimAt(point: GalaxyCoord, approach = FOCUS_APPROACH): OrbitTarget {
  const length = Math.hypot(point.x, point.y, point.z) || 1e-6;
  const nx = point.x / length;
  const ny = point.y / length;
  const nz = point.z / length;

  // 카메라 방향 = -n (별을 지나 중심을 보는 방향)
  return {
    yaw: Math.atan2(-nx, -nz),
    pitch: clamp(Math.asin(clamp(-ny, -1, 1)), -MAX_PITCH, MAX_PITCH),
    distance: length + approach,
  };
}

/**
 * 은하 하나를 화면 가운데에 담는 궤도 파라미터.
 *
 * ★ 중심 은하는 원점에 있어 "방향"이 없다.
 *   원점을 aimAt 에 넣으면 0 벡터를 정규화하게 되어 각도가 쓰레기가 된다.
 *   그 경우에는 지금 보고 있는 방위각을 유지하고 거리만 맞춘다.
 *
 * @param center 은하 중심의 월드 좌표
 * @param scale  은하 크기 — 화면에 담을 여유를 여기서 계산한다
 * @param currentYaw 중심 은하일 때 유지할 방위각
 */
export function aimAtGalaxy(
  center: GalaxyCoord,
  scale: number,
  currentYaw: number,
): OrbitTarget {
  // 반지름 1(로컬)의 원반이 짧은 변에 들어오려면 초점거리 비율상 2.4배가 필요하다.
  const framing = scale * 2.9;
  const length = Math.hypot(center.x, center.y, center.z);

  if (length < 1e-3) {
    return { yaw: currentYaw, pitch: DEFAULT_PITCH, distance: framing };
  }
  return aimAt(center, framing);
}

export class Camera {
  private current: CameraState = {
    yaw: 0,
    pitch: DEFAULT_PITCH,
    distance: DEFAULT_DISTANCE,
  };
  /** 비행 시작 시점의 상태 */
  private from: CameraState = { ...this.current };

  private elapsed = FLIGHT_DURATION;
  private duration = FLIGHT_DURATION;
  private arrivedNotified = true;

  /**
   * 사용자가 드래그로 돌려 둔 각도.
   *
   * ★ 궤도값에 직접 더하지 않고 따로 들고 있는다.
   *   목표로 날아갈 때 "사용자가 돌려 둔 만큼"을 0으로 되돌려야
   *   고른 별이 화면 정중앙에 온다. 한 변수에 섞어 두면 그걸 분리할 수 없다.
   */
  private dragYaw = 0;
  private dragPitch = 0;

  get state(): Readonly<CameraState> {
    return this.current;
  }

  /** 드래그 오프셋이 반영된, 실제로 그려야 할 궤도값. */
  get view(): Readonly<CameraState> {
    return {
      yaw: this.current.yaw + this.dragYaw,
      pitch: clamp(this.current.pitch + this.dragPitch, -MAX_PITCH, MAX_PITCH),
      distance: this.current.distance,
    };
  }

  /**
   * 드래그로 시점을 돌린다. 정규화된 화면 이동량(-1..1)을 받는다.
   * 고도는 짐벌락 직전에서 멈춘다 — 뒤집히면 방향 감각을 잃는다.
   */
  drag(dx: number, dy: number): void {
    this.dragYaw += dx * DRAG_YAW_PER_WIDTH;
    const limit = MAX_PITCH - 0.1;
    this.dragPitch = clamp(this.dragPitch + dy * DRAG_PITCH_PER_HEIGHT, -limit, limit);
  }

  /** 지금 사용자가 시점을 돌려 둔 상태인가. */
  get dragged(): boolean {
    return Math.abs(this.dragYaw) > 1e-4 || Math.abs(this.dragPitch) > 1e-4;
  }

  get flying(): boolean {
    return this.elapsed < this.duration;
  }

  /** 0..1 비행 진행도 */
  get progress(): number {
    return this.duration <= 0 ? 1 : Math.min(1, this.elapsed / this.duration);
  }

  /**
   * 새 목표로 비행을 시작한다.
   *
   * 출발점에 드래그 오프셋을 접어 넣고 오프셋 자체는 0으로 만든다.
   * 그래야 화면은 지금 보이는 각도에서 이어지면서, 도착 지점은
   * 사용자가 돌려 둔 각도와 무관하게 정확히 목표 중앙이 된다.
   */
  flyTo(reducedMotion: boolean): void {
    this.from = { ...this.view };
    this.current = { ...this.view };
    this.dragYaw = 0;
    this.dragPitch = 0;
    this.elapsed = 0;
    this.duration = reducedMotion ? FLIGHT_DURATION_REDUCED : FLIGHT_DURATION;
    this.arrivedNotified = false;
  }

  /**
   * 매 프레임 갱신.
   *
   * @param target 조준할 궤도 파라미터. null 이면 자동 선회로 돌아간다.
   * @param dt 프레임 간격(초)
   * @param restDistance 목표가 없을 때 머무는 거리. 인트로에서는 중심 은하만
   *        담고, 12제자 은하가 드러나면 계 전체를 담도록 늘어난다.
   * @returns 이번 프레임에 도착했으면 true (한 번만 true)
   */
  update(target: OrbitTarget | null, dt: number, restDistance = DEFAULT_DISTANCE): boolean {
    this.elapsed = Math.min(this.elapsed + dt, this.duration);

    // 목표가 없으면 지금 각도에서 계속 천천히 돈다.
    const desired: OrbitTarget = target ?? {
      yaw: this.current.yaw + ORBIT_SPEED * dt,
      pitch: DEFAULT_PITCH,
      distance: restDistance,
    };

    if (this.flying) {
      const t = easeInOutCubic(this.progress);
      this.current = {
        yaw: lerpAngle(this.from.yaw, desired.yaw, t),
        pitch: lerp(this.from.pitch, desired.pitch, t),
        distance: lerp(this.from.distance, desired.distance, t),
      };
    } else {
      // 도착 후에는 목표를 그대로 따라간다 (자전하는 별을 계속 추적).
      this.current = { ...desired };
    }

    /*
     * 조준할 곳이 없을 때만 드래그 오프셋을 아주 천천히 놓아 준다.
     * 즉시 되돌리면 손을 떼는 순간 하늘이 튕겨 돌아가고, 그대로 두면
     * 자동 선회가 사용자가 맞춰 둔 구도를 계속 밀어낸다.
     */
    if (!target && !this.flying) {
      const release = Math.min(1, DRAG_RELEASE * dt);
      this.dragYaw -= this.dragYaw * release;
      this.dragPitch -= this.dragPitch * release;
    }

    if (!this.arrivedNotified && this.progress >= 1) {
      this.arrivedNotified = true;
      return true;
    }
    return false;
  }

  /** 즉시 착지 (초기화·테스트용) */
  snapTo(target: OrbitTarget): void {
    this.current = { ...target };
    this.from = { ...target };
    this.dragYaw = 0;
    this.dragPitch = 0;
    this.elapsed = this.duration;
    this.arrivedNotified = true;
  }
}

/**
 * 은하 자전을 적용한 별의 현재 위치.
 * 자전축은 Y — 은하면(x-z) 위에서 나선 팔이 돌아간다.
 */
export function spinPoint(coord: GalaxyCoord, spin: number): GalaxyCoord {
  const cos = Math.cos(spin);
  const sin = Math.sin(spin);
  return {
    x: coord.x * cos - coord.z * sin,
    y: coord.y,
    z: coord.x * sin + coord.z * cos,
  };
}
