/*
 * 튜토리얼 배치 + 차단막 구멍.
 *
 * jsdom 에는 레이아웃 엔진이 없다 — 실제 DOM 을 띄워도 모든 사각형이
 * 0×0 이라 위치를 확인할 방법이 없다. 그래서 이 계산을 순수 함수로
 * 떼어 두었고, 여기서는 숫자만 넣고 숫자만 본다.
 */

import { describe, expect, it } from 'vitest';
import { GAP, MARGIN, placeCard, ringRect, veilPanels, type Rect } from './anchorRect';

const VIEWPORT = { width: 1200, height: 800 };
const CARD = { width: 380, height: 240 };

/** 사각형이 화면 안에 온전히 들어가는가 */
function inside(r: Rect, vp = VIEWPORT): boolean {
  return (
    r.left >= 0 && r.top >= 0 && r.left + r.width <= vp.width && r.top + r.height <= vp.height
  );
}

describe('placeCard — 가로로 넓은 대상', () => {
  it('대상이 없으면 화면 가운데에 놓는다', () => {
    const p = placeCard(null, CARD, VIEWPORT);
    expect(p.side).toBe('center');
    expect(p.left).toBe((VIEWPORT.width - CARD.width) / 2);
    expect(p.top).toBe((VIEWPORT.height - CARD.height) / 2);
  });

  it('아래에 자리가 있으면 대상 아래에 붙인다', () => {
    const anchor: Rect = { top: 100, left: 500, width: 200, height: 60 };
    const p = placeCard(anchor, CARD, VIEWPORT);

    expect(p.side).toBe('bottom');
    expect(p.top).toBe(anchor.top + anchor.height + GAP);
    expect(p.left).toBe(anchor.left + anchor.width / 2 - CARD.width / 2);
  });

  it('아래가 좁으면 위로 넘긴다', () => {
    const anchor: Rect = { top: 700, left: 500, width: 200, height: 60 };
    const p = placeCard(anchor, CARD, VIEWPORT);

    expect(p.side).toBe('top');
    expect(p.top).toBe(anchor.top - GAP - CARD.height);
  });

  it('화면 가장자리의 대상을 따라 카드가 밖으로 나가지 않는다', () => {
    const anchor: Rect = { top: 200, left: 1150, width: 40, height: 60 };
    const p = placeCard(anchor, CARD, VIEWPORT);

    expect(p.left).toBeGreaterThanOrEqual(MARGIN);
    expect(p.left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width - MARGIN);
  });

  it('크기가 0인 대상은 없는 것으로 친다', () => {
    const p = placeCard({ top: 100, left: 100, width: 0, height: 0 }, CARD, VIEWPORT);
    expect(p.side).toBe('center');
  });
});

/*
 * 오른쪽 MBTI 목록이 정확히 이 경우다 — 화면 세로의 절반을 차지하는
 * 좁고 긴 띠. 위아래로 붙이려 하면 화면 밖으로 밀리거나, 목록과 카드가
 * 세로로 늘어서 무엇을 가리키는지 알 수 없게 된다.
 */
describe('placeCard — 세로로 긴 대상', () => {
  /** 실제 MBTI 목록의 대략적인 자리: 오른쪽 끝, 화면 세로 중앙, 16줄 */
  const MBTI_LIST: Rect = { top: 220, left: 1112, width: 56, height: 360 };

  it('★ 세로로 긴 대상은 옆에 붙인다', () => {
    const p = placeCard(MBTI_LIST, CARD, VIEWPORT);
    expect(p.side).toBe('left');
  });

  it('★ 카드가 대상을 덮지 않는다', () => {
    const p = placeCard(MBTI_LIST, CARD, VIEWPORT);
    // 카드의 오른쪽 끝이 목록의 왼쪽 끝보다 왼쪽에 있어야 한다
    expect(p.left + CARD.width).toBeLessThanOrEqual(MBTI_LIST.left);
  });

  it('★ 카드가 화면 안에 온전히 들어간다', () => {
    const p = placeCard(MBTI_LIST, CARD, VIEWPORT);
    expect(inside({ ...CARD, top: p.top, left: p.left })).toBe(true);
  });

  it('세로는 대상 중앙에 맞춘다', () => {
    const p = placeCard(MBTI_LIST, CARD, VIEWPORT);
    const cardCenter = p.top + CARD.height / 2;
    const anchorCenter = MBTI_LIST.top + MBTI_LIST.height / 2;
    expect(Math.abs(cardCenter - anchorCenter)).toBeLessThan(1);
  });

  it('왼쪽 끝에 붙은 세로 목록이면 오른쪽에 붙인다', () => {
    const leftList: Rect = { top: 200, left: 20, width: 56, height: 400 };
    const p = placeCard(leftList, CARD, VIEWPORT);
    expect(p.side).toBe('right');
    expect(p.left).toBeGreaterThanOrEqual(leftList.left + leftList.width);
  });

  it('세로로 길어도 옆에 자리가 없으면 위아래로 물러난다', () => {
    // 화면 폭을 거의 다 쓰는 세로로 긴 대상
    const wide: Rect = { top: 40, left: 60, width: 1080, height: 400 };
    const p = placeCard(wide, CARD, VIEWPORT);
    expect(['bottom', 'top', 'center']).toContain(p.side);
  });

  it('세로 중앙 정렬이 화면 밖으로 넘치지 않는다', () => {
    // 화면 위쪽에 붙은 긴 목록 — 중앙 정렬하면 카드가 위로 튀어나간다
    const highList: Rect = { top: 0, left: 1120, width: 50, height: 300 };
    const p = placeCard(highList, CARD, VIEWPORT);
    expect(p.top).toBeGreaterThanOrEqual(MARGIN);
  });
});

describe('ringRect', () => {
  it('대상보다 넉넉하게 감싼다 — 글자에 선이 붙지 않도록', () => {
    const anchor: Rect = { top: 100, left: 200, width: 300, height: 50 };
    const r = ringRect(anchor, 10);

    expect(r.top).toBe(90);
    expect(r.left).toBe(190);
    expect(r.width).toBe(320);
    expect(r.height).toBe(70);
  });

  it('중심은 그대로다 — 링이 대상에서 밀려나지 않는다', () => {
    const anchor: Rect = { top: 100, left: 200, width: 300, height: 50 };
    const r = ringRect(anchor);

    expect(r.left + r.width / 2).toBe(anchor.left + anchor.width / 2);
    expect(r.top + r.height / 2).toBe(anchor.top + anchor.height / 2);
  });
});

/*
 * 차단막에 구멍을 뚫는 계산.
 *
 * 이것이 틀리면 둘 중 하나가 일어난다 —
 * 구멍이 안 뚫려서 "눌러 보세요"를 누를 수 없거나,
 * 조각이 빠져서 튜토리얼 중에 엉뚱한 별로 날아간다.
 */
describe('veilPanels', () => {
  const HOLE: Rect = { top: 200, left: 400, width: 300, height: 100 };

  /** 이 점이 어느 조각에라도 덮이는가 */
  const covered = (panels: Rect[], x: number, y: number) =>
    panels.some(
      (p) => x >= p.left && x < p.left + p.width && y >= p.top && y < p.top + p.height,
    );

  it('대상이 없으면 화면 전체를 한 장으로 덮는다', () => {
    const panels = veilPanels(null, VIEWPORT);
    expect(panels).toHaveLength(1);
    expect(panels[0]).toEqual({ top: 0, left: 0, ...VIEWPORT });
  });

  it('★ 구멍 안은 덮이지 않는다 — 여기를 눌러야 한다', () => {
    const panels = veilPanels(HOLE, VIEWPORT);
    expect(covered(panels, 550, 250)).toBe(false); // 구멍 한가운데
    expect(covered(panels, 401, 201)).toBe(false); // 구멍 왼쪽 위 모서리
    expect(covered(panels, 699, 299)).toBe(false); // 구멍 오른쪽 아래 모서리
  });

  it('★ 구멍 밖은 빠짐없이 덮인다 — 여기를 누르면 안 된다', () => {
    const panels = veilPanels(HOLE, VIEWPORT);

    // 구멍 바로 바깥 네 방향
    expect(covered(panels, 550, 199)).toBe(true); // 위
    expect(covered(panels, 550, 300)).toBe(true); // 아래
    expect(covered(panels, 399, 250)).toBe(true); // 왼쪽
    expect(covered(panels, 700, 250)).toBe(true); // 오른쪽

    // 화면 네 귀퉁이
    expect(covered(panels, 0, 0)).toBe(true);
    expect(covered(panels, 1199, 0)).toBe(true);
    expect(covered(panels, 0, 799)).toBe(true);
    expect(covered(panels, 1199, 799)).toBe(true);
  });

  it('조각들이 서로 겹치지 않는다 — 겹치면 그만큼 더 어두워진다', () => {
    const panels = veilPanels(HOLE, VIEWPORT);
    for (let i = 0; i < panels.length; i += 1) {
      for (let j = i + 1; j < panels.length; j += 1) {
        const a = panels[i];
        const b = panels[j];
        const overlaps =
          a.left < b.left + b.width &&
          b.left < a.left + a.width &&
          a.top < b.top + b.height &&
          b.top < a.top + a.height;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('덮인 넓이 = 화면 - 구멍', () => {
    const panels = veilPanels(HOLE, VIEWPORT);
    const area = panels.reduce((sum, p) => sum + p.width * p.height, 0);
    expect(area).toBe(VIEWPORT.width * VIEWPORT.height - HOLE.width * HOLE.height);
  });

  it('모든 조각이 화면 안에 있다', () => {
    const panels = veilPanels(HOLE, VIEWPORT);
    for (const p of panels) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(inside(p)).toBe(true);
    }
  });

  it('화면 모서리에 붙은 구멍도 조각 수가 줄 뿐 새지 않는다', () => {
    // 왼쪽 위 모서리에 딱 붙은 구멍 — 위 조각과 왼쪽 조각이 없어야 한다
    const corner: Rect = { top: 0, left: 0, width: 200, height: 100 };
    const panels = veilPanels(corner, VIEWPORT);

    expect(covered(panels, 100, 50)).toBe(false);
    expect(covered(panels, 201, 50)).toBe(true);
    expect(covered(panels, 100, 101)).toBe(true);

    const area = panels.reduce((sum, p) => sum + p.width * p.height, 0);
    expect(area).toBe(VIEWPORT.width * VIEWPORT.height - 200 * 100);
  });

  it('★ 화면 밖으로 삐져나간 구멍은 잘라서 계산한다', () => {
    // 음수 크기 조각이 생기면 렌더에서 조용히 사라져 막이 새어 나간다
    const spill: Rect = { top: -50, left: -60, width: 200, height: 200 };
    const panels = veilPanels(spill, VIEWPORT);

    for (const p of panels) {
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
      expect(inside(p)).toBe(true);
    }
    // 화면에 걸친 부분만 뚫린다: 가로 140 × 세로 150
    const area = panels.reduce((sum, p) => sum + p.width * p.height, 0);
    expect(area).toBe(VIEWPORT.width * VIEWPORT.height - 140 * 150);
  });

  it('구멍이 화면 완전 바깥이면 통짜로 덮는다', () => {
    const offscreen: Rect = { top: 2000, left: 2000, width: 100, height: 100 };
    const panels = veilPanels(offscreen, VIEWPORT);
    expect(panels).toHaveLength(1);
    expect(panels[0].width).toBe(VIEWPORT.width);
  });
});
