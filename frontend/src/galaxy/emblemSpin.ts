/*
 * galaxy/emblemSpin.ts
 * ───────────────────────────────────────────────────────────────────────
 * 상징 하나를 작게, 계속 돌려 그린다.
 *
 * ★ 왜 은하 엔진을 쓰지 않는가
 *   엔진은 화면 전체를 덮는 영속 레이어이고, 열세 은하와 카메라와 인트로
 *   타임라인을 함께 들고 있다. 팝업 구석의 배지 하나를 위해 그걸 다시
 *   띄우면, 창을 열 때마다 우주가 하나씩 늘어난다.
 *
 *   여기서는 상징 좌표만 빌려 쓴다. 별의 배정(emblemField)도 필요 없다 —
 *   배지에는 은하의 별이 아니라 상징 자체가 뜨면 된다.
 *
 * ★ 여기는 계속 한 바퀴 돈다
 *   큰 화면의 상징은 좌우로만 흔든다. 90도를 지나면 형태를 알아볼 수
 *   없기 때문이다. 배지는 다르다 — 바로 아래에 "○○의 은하" 가 적혀
 *   있어서 형태로 인물을 알아낼 필요가 없고, 계속 도는 편이 "저기 그
 *   은하가 돌고 있다" 는 인상을 준다.
 */

import type { Emblem, EmblemPoint } from '../data/emblems';

/** 한 바퀴 도는 데 걸리는 시간(초). 눈이 따라가지 않을 만큼 느리게. */
export const BADGE_PERIOD = 22;

/** 배지에서 상징이 화면 밖으로 나가지 않게 하는 여백 비율. */
const BADGE_INSET = 0.86;

/** 앞뒤 두께 (반경 대비). 큰 화면보다 조금 두껍게 — 작아서 잘 안 보인다. */
const BADGE_DEPTH = 0.34;

export interface SpunPoint {
  /** 0..1 — 배지 안에서의 가로 위치 */
  x: number;
  /** 0..1 — 세로 위치 */
  y: number;
  /**
   * 0..1 — 1 이면 보는 사람 쪽으로 가장 나온 것.
   * 크기와 밝기를 여기에 걸어 앞뒤를 구분한다.
   */
  depth: number;
  /** 윤곽인가 (data/emblems.ts 의 weight 를 그대로 물려받는다) */
  outline: boolean;
}

/**
 * 상징 점 하나의 앞뒤 위치.
 *
 * ★ 볼록한 돔이 아니다.
 *   처음에는 가운데가 앞으로 튀어나온 방패로 만들었다. 정면에서 보면
 *   가운데만 크고 밝아서 입체가 아니라 렌즈를 덧댄 것처럼 보였다.
 *   실제 별자리는 앞뒤로 흩어진 별들이다.
 *
 * ★ 큰 화면과 같은 식을 쓴다.
 *   조우에서 본 형태와 배지의 형태가 같은 입체여야 한 물건으로 읽힌다.
 */
function depthAt(p: EmblemPoint): number {
  const u = (p.x - 0.5) * 2;
  const v = (p.y - 0.5) * 2;

  const wave =
    Math.sin(u * 7.13 + v * 3.71) * 0.55 +
    Math.sin(u * 2.39 - v * 5.87) * 0.30 +
    Math.sin(u * 11.7 + v * 9.31) * 0.15;

  // 가장자리는 얕게 — 실루엣이 두 겹으로 갈라지지 않게
  const damp = 1 - Math.min(1, Math.hypot(u, v)) * 0.45;
  return wave * damp * BADGE_DEPTH;
}

/**
 * 각도 angle 만큼 돌린 상징의 화면 좌표.
 *
 * ★ 원근을 아주 얕게만 준다.
 *   배지는 손톱만 하다. 원근을 세게 주면 도는 게 아니라 형태가 늘었다
 *   줄었다 하는 것으로 보인다. 앞으로 나온 점이 조금 커지는 정도면
 *   깊이는 충분히 전달된다.
 *
 * @param angle 라디안. 세로축 기준 회전.
 */
export function spinEmblem(emblem: Emblem, angle: number): SpunPoint[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const turned = emblem.points.map((p) => {
    const u = (p.x - 0.5) * 2;
    const v = (p.y - 0.5) * 2;
    const w = depthAt(p);

    // 세로축 회전: 가로와 깊이가 섞인다. 세로는 그대로다.
    return {
      u2: u * cos + w * sin,
      w2: w * cos - u * sin,
      v,
      outline: p.weight >= 0.9,
    };
  });

  /*
   * ★ 깊이는 그 각도의 실제 범위로 나눈다.
   *   두께(BADGE_DEPTH)로만 나누면 안 된다. 돌린 뒤의 깊이에는 가로
   *   좌표가 섞여 들어오는데(w2 = w·cos − u·sin), 가로는 두께보다
   *   훨씬 크다. 그대로 나누면 90도 부근에서 값이 0..1 을 크게 벗어나고,
   *   밝기 계산이 음수가 되어 별이 사라진다.
   *
   *   범위로 나누면 어느 각도에서도 앞뒤가 고르게 나뉜다 — 밝기에 쓰기에
   *   오히려 이쪽이 맞다.
   */
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of turned) {
    if (t.w2 < lo) lo = t.w2;
    if (t.w2 > hi) hi = t.w2;
  }
  const span = hi - lo || 1;

  return turned.map((t) => {
    // 얕은 원근 — 앞으로 나온 점이 살짝 바깥으로 밀린다
    const scale = 1 + t.w2 * 0.18;
    return {
      x: 0.5 + ((t.u2 * scale) / 2) * BADGE_INSET,
      y: 0.5 + ((t.v * scale) / 2) * BADGE_INSET,
      depth: (t.w2 - lo) / span,
      outline: t.outline,
    };
  });
}

/**
 * 흐른 시간(초)에 해당하는 회전각.
 *
 * 모션을 줄여 둔 사용자에게는 멈춘 정면을 준다. 돌지 않아도 상징은
 * 그대로 보이고, 배지의 목적(누구의 자리인지 알리기)은 그대로 달성된다.
 */
export function badgeAngle(seconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return ((seconds % BADGE_PERIOD) / BADGE_PERIOD) * Math.PI * 2;
}
