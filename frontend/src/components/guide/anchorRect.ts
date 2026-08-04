/*
 * components/guide/anchorRect.ts
 * ───────────────────────────────────────────────────────────────────────
 * 튜토리얼 카드를 어디에 놓을지, 차단막을 어디에 뚫을지.
 *
 * 렌더에서 분리한 이유: 둘 다 순수 함수라서 화면을 띄우지 않고 검증할 수
 * 있다. jsdom 에는 레이아웃 엔진이 없어 실제 DOM 으로는 위치를 확인할
 * 방법이 아예 없다 — 숫자를 넣고 숫자를 받는 형태여야 한다.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Side = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface Placement {
  top: number;
  left: number;
  side: Side;
}

/** 카드와 대상 사이에 두는 숨 */
export const GAP = 20;
/** 화면 가장자리에서 최소한 띄우는 거리 */
export const MARGIN = 16;

/**
 * 이 비율보다 세로로 긴 대상은 옆에 카드를 붙인다.
 *
 * 오른쪽 MBTI 목록이 정확히 이 경우다 — 화면 세로의 절반을 차지하는
 * 좁고 긴 띠다. 그 아래에 카드를 놓으면 화면 밖으로 밀리고, 위에 놓으면
 * 목록과 카드가 세로로 늘어서 무엇을 가리키는지 알 수 없다.
 */
const TALL_RATIO = 0.3;

function clamp(value: number, min: number, max: number): number {
  // max < min 인 경우(카드가 화면보다 큰 경우) min 을 택한다 — 위쪽이 잘리는
  // 것보다 아래쪽이 잘리는 편이 낫다. 제목과 닫기 버튼이 위에 있기 때문이다.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function centeredIn(card: Size, viewport: Size): Placement {
  return {
    top: Math.max(MARGIN, (viewport.height - card.height) / 2),
    left: Math.max(MARGIN, (viewport.width - card.width) / 2),
    side: 'center',
  };
}

/** 대상 옆(가로)에 놓을 자리. 넣을 수 없으면 null. */
function beside(
  anchor: Rect,
  card: Size,
  viewport: Size,
  gap: number,
): Placement | null {
  // 세로는 대상 중앙에 맞추고 화면 안으로 당긴다.
  const top = clamp(
    anchor.top + anchor.height / 2 - card.height / 2,
    MARGIN,
    viewport.height - card.height - MARGIN,
  );

  const leftEdge = anchor.left - gap - card.width;
  const rightEdge = anchor.left + anchor.width + gap;

  const roomLeft = leftEdge - MARGIN;
  const roomRight = viewport.width - MARGIN - (rightEdge + card.width);

  // 더 넓은 쪽을 먼저 본다. 둘 다 되면 여유가 큰 쪽이 덜 답답하다.
  if (roomLeft >= 0 && roomLeft >= roomRight) return { top, left: leftEdge, side: 'left' };
  if (roomRight >= 0) return { top, left: rightEdge, side: 'right' };
  if (roomLeft >= 0) return { top, left: leftEdge, side: 'left' };
  return null;
}

/** 대상 위/아래에 놓을 자리. 넣을 수 없으면 null. */
function stacked(
  anchor: Rect,
  card: Size,
  viewport: Size,
  gap: number,
): Placement | null {
  const left = clamp(
    anchor.left + anchor.width / 2 - card.width / 2,
    MARGIN,
    viewport.width - card.width - MARGIN,
  );

  const below = anchor.top + anchor.height + gap;
  const above = anchor.top - gap - card.height;

  // 아래를 우선한다. 사람의 시선은 설명이 대상 아래에 있을 때 더 자연스럽게 이어진다.
  if (viewport.height - below - MARGIN >= card.height) {
    return { top: below, left, side: 'bottom' };
  }
  if (above - MARGIN >= 0) {
    return { top: above, left, side: 'top' };
  }
  return null;
}

/**
 * 대상 사각형 옆에 카드를 놓는다.
 *
 * ★ 대상이 없으면 화면 가운데다.
 *   가리킬 것이 없는 단계가 실제로 있다 — 하늘에서 시점을 돌려 보라는
 *   안내처럼, 특정 요소가 아니라 화면 전체를 말하는 경우다.
 *
 * ★ 대상의 모양이 방향을 정한다.
 *   가로로 넓은 것(입력창, 버튼)은 위아래로, 세로로 긴 것(오른쪽 목록)은
 *   옆으로 붙인다. 이 판단을 하지 않으면 세로 목록을 가리킬 때 카드가
 *   목록 아래로 밀려 화면 밖으로 나간다.
 */
export function placeCard(
  anchor: Rect | null,
  card: Size,
  viewport: Size,
  gap: number = GAP,
): Placement {
  if (!anchor) return centeredIn(card, viewport);

  // 화면 밖으로 밀렸거나 아직 그려지지 않은 대상은 없는 것으로 친다.
  if (anchor.width <= 0 || anchor.height <= 0) return centeredIn(card, viewport);

  const tall = anchor.height > viewport.height * TALL_RATIO;

  const first = tall ? beside(anchor, card, viewport, gap) : stacked(anchor, card, viewport, gap);
  if (first) return first;

  const second = tall ? stacked(anchor, card, viewport, gap) : beside(anchor, card, viewport, gap);
  if (second) return second;

  // 어느 쪽으로도 담기지 않는다. 억지로 붙이면 카드가 대상을 덮는다.
  return centeredIn(card, viewport);
}

/** 강조 링이 차지할 영역. 대상보다 조금 넉넉하게 잡아 글자에 선이 붙지 않게 한다. */
export function ringRect(anchor: Rect, pad = 10): Rect {
  return {
    top: anchor.top - pad,
    left: anchor.left - pad,
    width: anchor.width + pad * 2,
    height: anchor.height + pad * 2,
  };
}

/**
 * 차단막을 네 조각으로 나눠 대상 자리에 구멍을 뚫는다.
 *
 * ★ 왜 통짜 막이 아닌가
 *   튜토리얼은 읽는 것이 아니라 해 보는 것이다. 화면 전체를 막으면
 *   "눌러 보세요"라고 써 놓고 누를 수 없는 화면이 된다.
 *   그렇다고 막을 없애면 설명을 읽다가 엉뚱한 별로 날아간다.
 *
 *   구멍을 뚫으면 둘 다 해결된다 — 지금 눌러야 할 것만 눌린다.
 *
 * @returns 겹치지 않는 사각형들. 대상이 없으면 화면 전체 한 장.
 */
export function veilPanels(hole: Rect | null, viewport: Size): Rect[] {
  const full: Rect = { top: 0, left: 0, width: viewport.width, height: viewport.height };
  if (!hole || hole.width <= 0 || hole.height <= 0) return [full];

  // 구멍을 화면 안으로 자른다. 밖으로 삐져나간 채로 계산하면 음수 크기가 나온다.
  const top = Math.max(0, Math.min(hole.top, viewport.height));
  const left = Math.max(0, Math.min(hole.left, viewport.width));
  const right = Math.max(0, Math.min(hole.left + hole.width, viewport.width));
  const bottom = Math.max(0, Math.min(hole.top + hole.height, viewport.height));

  // 잘라 내고 나니 구멍이 남지 않았다 — 대상이 화면 밖에 있다.
  if (right <= left || bottom <= top) return [full];

  const panels: Rect[] = [];

  // 위 / 아래는 화면 폭 전체를 덮고, 좌 / 우는 구멍 높이만큼만 덮는다.
  if (top > 0) panels.push({ top: 0, left: 0, width: viewport.width, height: top });
  if (bottom < viewport.height) {
    panels.push({
      top: bottom,
      left: 0,
      width: viewport.width,
      height: viewport.height - bottom,
    });
  }
  if (left > 0) panels.push({ top, left: 0, width: left, height: bottom - top });
  if (right < viewport.width) {
    panels.push({ top, left: right, width: viewport.width - right, height: bottom - top });
  }

  return panels;
}
