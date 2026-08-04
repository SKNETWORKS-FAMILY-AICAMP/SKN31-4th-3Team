/*
 * galaxy/wordmark.ts
 * ───────────────────────────────────────────────────────────────────────
 * 프로젝트 제목("✝ Eden")을 별자리 좌표로 바꾼다.
 *
 * ★ 격자를 쓰면 안 된다
 *   불투명 픽셀을 일정 간격으로 뽑으면 도트 매트릭스 간판이 된다.
 *   점이 규칙적으로 줄 맞춰 서는 순간 "별이 모인 것"이 아니라
 *   "픽셀로 찍은 글자"로 읽힌다.
 *
 *   그래서 세 가지를 한다:
 *     1) 거리장(distance field)으로 윤곽과 내부를 구분한다.
 *        윤곽은 촘촘히, 내부는 성기게 — 밀도 자체가 형태를 만든다.
 *     2) 각 점을 셀 안에서 무작위로 흔든다. 줄이 사라진다.
 *     3) 글자 바깥에도 옅은 먼지를 조금 흘린다. 실루엣이 칼로 자른 듯
 *        딱 끊기지 않고 은하에서 번져 나온 것처럼 보인다.
 *
 * ★ 별자리선
 *   가까운 윤곽 점끼리 아주 옅은 선으로 잇는다. 실제 별자리를 읽는
 *   방식과 같아서, 점 무더기가 "글자"로 묶여 보인다.
 *
 * ★ 폰트 로딩을 반드시 기다린다
 *   Pretendard 가 아직 안 왔는데 샘플링하면 폴백 글꼴 모양이 좌표로
 *   굳어 버린다. 나중에 폰트가 도착해도 이미 만들어진 별은 바뀌지 않는다.
 */

import { seededRandom } from './placement';

/** 0..1 로 정규화된 글자 안의 한 점. y 는 아래로 증가한다. */
export interface GlyphPoint {
  x: number;
  y: number;
  /**
   * 0..1 — 이 점이 형태에 기여하는 비중.
   * 1에 가까울수록 윤곽이며 밝고 크게 그린다.
   */
  weight: number;
  /** 바깥을 향하는 단위 법선 (윤곽 점만 의미 있다) */
  nx: number;
  ny: number;
}

export interface WordmarkShape {
  points: GlyphPoint[];
  /** 별자리선으로 이을 점 쌍 (points 배열의 인덱스) */
  links: Array<[number, number]>;
  /** 가로/세로 비율 — 화면 배치 시 크기 계산에 쓴다. */
  aspect: number;
  /** 글자 상자 폭 대비 표본 간격 — 별 크기를 화면 크기에 맞출 때 쓴다. */
  spacing: number;
}

/** 샘플링용 설계 캔버스. 실제 화면 크기와 무관하다. */
const DESIGN_WIDTH = 1200;
const DESIGN_HEIGHT = 300;

/** 격자 간격(px). 이 격자는 "후보 위치"일 뿐, 점은 셀 안에서 흔들린다. */
const CELL = 3;

/** 이 알파 이상이면 글자 안쪽으로 본다. */
const ALPHA_THRESHOLD = 128;

/** 윤곽으로 볼 거리(셀 단위). 이 안쪽은 전부 남긴다. */
const CONTOUR_BAND = 1.6;
/** 내부를 남길 확률. 낮을수록 성기고 가볍다. */
const INTERIOR_KEEP = 0.2;
/** 글자 바깥으로 흘리는 먼지의 범위(셀)와 확률 */
const SPILL_RANGE = 2.4;
const SPILL_KEEP = 0.12;

/** 별자리선 최대 길이(셀)와 총 개수 상한 */
const LINK_RANGE = 2.6;
const MAX_LINKS = 420;

export const WORDMARK_TEXT = 'Eden';

/**
 * 십자가를 그린다. 장식 없는 라틴 십자가 비율.
 * (인물 형상이나 화려한 장식 없이 상징만 쓴다는 원칙에 맞춘다)
 */
function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, height: number): void {
  const stem = height * 0.15;
  const armWidth = height * 0.58;
  // 가로대는 위에서 30% 지점 — 너무 가운데면 더하기 기호처럼 보인다.
  const armY = y + height * 0.3;

  ctx.fillStyle = '#fff';
  ctx.fillRect(x + armWidth / 2 - stem / 2, y, stem, height);
  ctx.fillRect(x, armY, armWidth, stem);
}

/** 폰트가 준비될 때까지 기다린다. 지원하지 않는 환경이면 그냥 진행한다. */
export async function waitForFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.ready) return;
  try {
    await fonts.ready;
    // ready 는 "로딩이 끝났다"만 보장한다. 우리가 쓸 굵기를 콕 집어 확인한다.
    if (fonts.load) await fonts.load('700 200px Pretendard');
  } catch {
    // 폰트 로딩 실패는 치명적이지 않다 — 폴백 글꼴로라도 그린다.
  }
}

/**
 * 체임퍼 거리 변환.
 * seed 가 1인 셀로부터의 대략적인 거리를 두 번의 훑기로 구한다.
 */
function distanceTransform(seed: Uint8Array, cols: number, rows: number): Float32Array {
  const dist = new Float32Array(cols * rows);
  const FAR = 1e6;
  const D1 = 1;
  const D2 = Math.SQRT2;

  for (let i = 0; i < dist.length; i += 1) dist[i] = seed[i] ? 0 : FAR;

  const relax = (index: number, from: number, cost: number): void => {
    const candidate = dist[from] + cost;
    if (candidate < dist[index]) dist[index] = candidate;
  };

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = row * cols + col;
      if (col > 0) relax(i, i - 1, D1);
      if (row > 0) relax(i, i - cols, D1);
      if (row > 0 && col > 0) relax(i, i - cols - 1, D2);
      if (row > 0 && col < cols - 1) relax(i, i - cols + 1, D2);
    }
  }

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      const i = row * cols + col;
      if (col < cols - 1) relax(i, i + 1, D1);
      if (row < rows - 1) relax(i, i + cols, D1);
      if (row < rows - 1 && col < cols - 1) relax(i, i + cols + 1, D2);
      if (row < rows - 1 && col > 0) relax(i, i + cols - 1, D2);
    }
  }

  return dist;
}

/**
 * 제목을 별자리 좌표로 샘플링한다.
 *
 * @returns 샘플에 실패하면 null (캔버스를 쓸 수 없는 환경)
 */
export function sampleWordmark(text = WORDMARK_TEXT, seed = 4177): WordmarkShape | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = DESIGN_WIDTH;
  canvas.height = DESIGN_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const crossHeight = DESIGN_HEIGHT * 0.7;
  const crossY = (DESIGN_HEIGHT - crossHeight) / 2;
  drawCross(ctx, 44, crossY, crossHeight);

  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${Math.round(DESIGN_HEIGHT * 0.72)}px Pretendard, 'Pretendard Variable', sans-serif`;
  ctx.fillText(text, 44 + crossHeight * 0.58 + 52, DESIGN_HEIGHT * 0.775);

  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  } catch {
    // jsdom 등 픽셀을 읽을 수 없는 환경
    return null;
  }

  // ── 1) 격자 마스크 ────────────────────────────────────────────────
  const cols = Math.ceil(DESIGN_WIDTH / CELL);
  const rows = Math.ceil(DESIGN_HEIGHT / CELL);
  const inside = new Uint8Array(cols * rows);
  const outside = new Uint8Array(cols * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(DESIGN_WIDTH - 1, col * CELL);
      const y = Math.min(DESIGN_HEIGHT - 1, row * CELL);
      const alpha = image.data[(y * DESIGN_WIDTH + x) * 4 + 3];
      const i = row * cols + col;
      inside[i] = alpha >= ALPHA_THRESHOLD ? 1 : 0;
      outside[i] = inside[i] ? 0 : 1;
    }
  }

  // ── 2) 거리장: 윤곽에서 얼마나 안/밖인가 ─────────────────────────
  const depthInside = distanceTransform(outside, cols, rows);
  const depthOutside = distanceTransform(inside, cols, rows);

  const at = (col: number, row: number): number =>
    col < 0 || row < 0 || col >= cols || row >= rows ? 0 : inside[row * cols + col];

  // ── 3) 밀도로 뽑고, 셀 안에서 흔든다 ─────────────────────────────
  const rand = seededRandom(seed);
  const raw: Array<GlyphPoint & { contour: boolean }> = [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const i = row * cols + col;
      const isInside = inside[i] === 1;
      const depth = isInside ? depthInside[i] : depthOutside[i];

      let weight: number;
      let contour = false;

      if (isInside && depth <= CONTOUR_BAND) {
        // 윤곽: 형태를 결정한다. 하나도 버리지 않는다.
        weight = 1;
        contour = true;
      } else if (isInside) {
        // 내부: 성기게. 깊을수록 흐리다.
        if (rand() > INTERIOR_KEEP) continue;
        weight = Math.max(0.16, 0.5 - depth * 0.025);
      } else if (depth <= SPILL_RANGE) {
        // 바깥 먼지: 실루엣이 칼로 자른 듯 끊기지 않게 한다.
        if (rand() > SPILL_KEEP) continue;
        weight = 0.24 * (1 - depth / SPILL_RANGE);
      } else {
        continue;
      }

      // 격자를 깨는 흔들림. 이게 없으면 줄이 보이고 도트 간판이 된다.
      const jitterX = (rand() - 0.5) * CELL * 0.95;
      const jitterY = (rand() - 0.5) * CELL * 0.95;
      const x = col * CELL + jitterX;
      const y = row * CELL + jitterY;

      // 법선은 비어 있는 이웃들의 합 방향이다.
      let nx = 0;
      let ny = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (at(col + dx, row + dy)) continue;
          nx += dx;
          ny += dy;
        }
      }
      const length = Math.hypot(nx, ny) || 1;

      raw.push({ x, y, weight, nx: nx / length, ny: ny / length, contour });

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (raw.length === 0) return null;

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  // 왼쪽부터 차례로 켜지도록 정렬해 둔다 — "써지는" 느낌의 근거다.
  raw.sort((a, b) => a.x - b.x);

  const points: GlyphPoint[] = raw.map((p) => ({
    x: (p.x - minX) / width,
    y: (p.y - minY) / height,
    weight: p.weight,
    nx: p.nx,
    ny: p.ny,
  }));

  return {
    points,
    links: buildLinks(raw, LINK_RANGE * CELL, rand),
    aspect: width / height,
    spacing: CELL / width,
  };
}

/**
 * 가까운 윤곽 점끼리 잇는다.
 *
 * 정렬된 배열에서 가까운 인덱스만 살피면 충분하다 — x 순으로 정렬돼 있어
 * 멀리 떨어진 점은 애초에 후보가 아니다. (전수 비교는 O(n²) 라 과하다)
 */
function buildLinks(
  points: Array<{ x: number; y: number; contour: boolean }>,
  maxDistance: number,
  rand: () => number,
): Array<[number, number]> {
  const links: Array<[number, number]> = [];
  const LOOK_AHEAD = 26;

  for (let i = 0; i < points.length && links.length < MAX_LINKS; i += 1) {
    if (!points[i].contour) continue;

    for (let j = i + 1; j < Math.min(points.length, i + LOOK_AHEAD); j += 1) {
      if (!points[j].contour) continue;
      const distance = Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y);
      if (distance > maxDistance) continue;
      // 전부 이으면 그물이 된다. 성기게 골라야 별자리로 읽힌다.
      if (rand() > 0.35) continue;

      links.push([i, j]);
      break;
    }
  }

  return links;
}
