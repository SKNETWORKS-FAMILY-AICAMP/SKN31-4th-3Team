/*
 * 레일과 화면이 같은 값을 보고 있는가.
 *
 * ★ 픽셀을 재는 테스트가 아니다.
 *   jsdom 은 레이아웃을 계산하지 않으므로 "겹쳤다" 를 직접 확인할 수
 *   없다. 대신 겹침이 생기는 조건을 못 박는다 — 레일이 숨는 구간과
 *   화면이 자리를 되찾는 구간이 어긋나면 다시 겹친다.
 *
 * ★ 실제로 났던 문제
 *   레일은 position: fixed 라 문서 흐름에서 사라진다. 화면은 그 자리가
 *   비어 있다고 믿고 가운데 정렬을 했고, 세로로 긴 좁은 모니터에서
 *   "MBTI 선택" 과 안내 문구가 포개졌다.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = join(__dirname, '..', '..');
const tokens = readFileSync(join(here, 'styles', 'tokens.css'), 'utf8');
const rail = readFileSync(join(__dirname, 'MbtiSelector.module.css'), 'utf8');
const sky = readFileSync(join(here, 'routes', 'SkyRoute.module.css'), 'utf8');
const screen = readFileSync(join(here, 'routes', 'Screen.module.css'), 'utf8');

/** `@media (max-width: 720px)` 처럼 생긴 구간의 경계값을 모은다. */
function breakpoints(css: string, axis: 'width' | 'height'): number[] {
  const pattern = new RegExp(`max-${axis}:\\s*(\\d+)px`, 'g');
  return [...css.matchAll(pattern)].map((m) => Number(m[1]));
}

describe('MBTI 레일 레이아웃', () => {
  it('레일 폭이 토큰으로 선언돼 있다', () => {
    // 화면들이 이 값을 보고 자리를 비운다. 하드코딩된 px 로 흩어지면
    // 한쪽만 고쳤을 때 다시 겹친다.
    expect(tokens).toMatch(/--rail-w:\s*\d+px/);
  });

  it('레일을 감추는 폭과 자리를 되찾는 폭이 같다', () => {
    const railHidden = breakpoints(rail, 'width');
    const tokenZero = breakpoints(tokens, 'width');

    // 레일이 720px 에서 숨으면 토큰도 720px 에서 0 이 돼야 한다.
    // 어긋나면 레일은 없는데 오른쪽만 비어 있는 화면이 된다.
    expect(railHidden).toContain(720);
    expect(tokenZero).toContain(720);
  });

  it('세로로 짧은 화면에서도 같은 경계를 쓴다', () => {
    expect(breakpoints(rail, 'height')).toContain(620);
    expect(breakpoints(tokens, 'height')).toContain(620);
  });

  it('레일이 화면 높이를 넘지 않는다', () => {
    // 16줄은 700px 가까이 된다. 상한이 없으면 위아래로 넘쳐 덮는다.
    expect(rail).toMatch(/max-height:\s*calc\(100dvh/);
    // vh 는 모바일 주소창이 접힐 때 화면 높이를 잘못 잡는다.
    expect(rail).not.toMatch(/max-height:\s*calc\(100vh/);
  });

  it('화면을 밀어서 자리를 만들지는 않는다', () => {
    /*
     * ★ 한 번 그렇게 했다가 되돌렸다.
     *   두 셸에 padding-right 로 레일 폭만큼 여백을 줬더니, 겹침은
     *   사라졌지만 화면 전체가 왼쪽으로 밀렸다. 가운데 정렬된 것들이
     *   가운데가 아니게 되어 그쪽이 더 이상해 보였다.
     *
     *   대신 겹칠 것 자체를 없앴다 — 구절 목록을 사이드바로 옮겨서
     *   하늘 위에는 안내 문구 한 줄만 남는다.
     */
    for (const css of [sky, screen]) {
      expect(css).not.toMatch(/padding-right:[^;]*var\(--rail-w\)/);
    }
  });
});
