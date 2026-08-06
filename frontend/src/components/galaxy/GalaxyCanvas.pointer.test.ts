/*
 * components/galaxy/GalaxyCanvas.pointer.test.ts
 * ───────────────────────────────────────────────────────────────────────
 * 회귀 테스트: 별 클릭이 장식 레이어에 먹히지 않는가.
 *
 * 실제로 났던 버그:
 *   .canvas 는 일반 흐름 요소이고 .vignette 는 position:absolute 라
 *   비네트가 캔버스 위에 그려진다. 비네트에 pointer-events: none 이 없으면
 *   탐색 화면에서 별 클릭이 전부 비네트에 흡수되어 픽킹이 죽는다.
 *
 * 왜 CSS 파일을 직접 읽는가:
 *   jsdom 에는 레이아웃 엔진이 없어 히트테스트를 재현할 수 없고,
 *   vitest 는 CSS Modules 를 클래스명만 남기고 스텁 처리한다.
 *   즉 이 버그는 렌더 테스트로는 절대 잡히지 않는다. 그래서 스타일 규칙
 *   자체를 계약으로 보고 검증한다.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function readCss(relativePath: string): string {
  return readFileSync(resolve(here, relativePath), 'utf8');
}

/** `.name { ... }` 블록의 선언부만 뽑는다. */
function ruleBody(css: string, className: string): string {
  const match = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`.${className} 규칙을 찾지 못했습니다`);
  return match[1];
}

describe('은하수 레이어의 포인터 규칙', () => {
  const css = readCss('./GalaxyCanvas.module.css');

  it('★ 비네트는 포인터를 통과시켜야 한다 (별 클릭을 가로채면 탐색이 죽는다)', () => {
    expect(ruleBody(css, 'vignette')).toContain('pointer-events: none');
  });

  it('레이어 기본값은 통과다 — 배경일 때 아래 UI 를 막지 않는다', () => {
    expect(ruleBody(css, 'layer')).toContain('pointer-events: none');
  });

  it('탐색 화면에서만 포인터를 받는다', () => {
    expect(ruleBody(css, 'interactive')).toContain('pointer-events: auto');
  });
});

describe('탐색 화면의 포인터 규칙', () => {
  const css = readCss('../../routes/SkyRoute.module.css');

  it('화면 컨테이너는 포인터를 통과시킨다 (캔버스를 덮고 있다)', () => {
    expect(ruleBody(css, 'screen')).toContain('pointer-events: none');
  });

  it('안내문은 클릭을 가로채지 않는다', () => {
    expect(ruleBody(css, 'hint')).toContain('pointer-events: none');
  });
});

describe('은하 이름표', () => {
  const css = readCss('./GalaxyCanvas.module.css');

  it('★ 이름표도 포인터를 통과시킨다 (커서 밑에 붙어 있다)', () => {
    // 포인터를 따라다니는 요소가 클릭을 먹으면 별을 영영 누를 수 없다.
    expect(ruleBody(css, 'galaxyLabel')).toContain('pointer-events: none');
  });

  it('캔버스 위에 얹힌다', () => {
    expect(ruleBody(css, 'galaxyLabel')).toContain('position: absolute');
  });
});

/*
 * 드래그와 클릭의 구분은 좌표 계산이므로 jsdom 없이도 검증할 수 있다.
 * 컴포넌트가 쓰는 것과 같은 판정식을 여기서 고정한다.
 */
describe('드래그와 클릭의 구분', () => {
  const source = readCss('./GalaxyCanvas.tsx');

  it('임계값이 정의되어 있다', () => {
    expect(source).toContain('DRAG_THRESHOLD');
  });

  it('★ 끌었으면 아무것도 열지 않는다', () => {
    // 이 가드가 사라지면 시점을 돌릴 때마다 구절이 열려 탐색이 불가능해진다.
    expect(source).toMatch(/drag\.moved > DRAG_THRESHOLD\) return/);
  });

  it('별을 먼저 보고, 없을 때만 은하로 넓힌다', () => {
    // 순서가 뒤집히면 별 위에서도 은하가 잡혀 별을 고를 수 없다.
    const starFirst = source.indexOf('engine?.pickAt(x, y);');
    const galaxyNext = source.indexOf('engine?.pickGalaxyAt(x, y);');
    expect(starFirst).toBeGreaterThan(0);
    expect(galaxyNext).toBeGreaterThan(starFirst);
  });
});

/*
 * 실제로 났던 버그: 캔버스를 끌면 페이지의 모든 글자가 선택되어
 * 흰 블록으로 덮였다. jsdom 에는 선택 동작이 없으므로 규칙 자체를 검증한다.
 */
describe('드래그 중 텍스트 선택 방지', () => {
  const css = readCss('./GalaxyCanvas.module.css');
  const source = readCss('./GalaxyCanvas.tsx');

  it('★ 캔버스는 텍스트 선택 대상이 아니다', () => {
    expect(ruleBody(css, 'canvas')).toContain('user-select: none');
  });

  it('터치 제스처도 캔버스가 가져간다 (안 그러면 페이지가 스크롤된다)', () => {
    expect(ruleBody(css, 'canvas')).toContain('touch-action: none');
  });

  it('★ pointerdown 에서 기본 동작을 막는다', () => {
    // CSS 만으로는 부족하다 — 포인터 캡처 중 선택이 문서 바깥으로 번진다.
    expect(source).toMatch(/handleDown[\s\S]{0,600}e\.preventDefault\(\)/);
  });
});

describe('은하 이름표가 유지되는 조건', () => {
  const source = readCss('./GalaxyCanvas.tsx');

  it('★ 별 위에서도 그 별의 은하 이름이 남는다', () => {
    // 별에 올리는 순간 이름이 사라지면 "어느 은하인지"를 가장 알고 싶은
    // 순간에 정보가 없어진다.
    //
    // 표현을 통째로 박아 두면 리팩터링마다 깨진다. 이 테스트가 지키려는
    // 것은 "별이 있을 때도 hoverGalaxy 를 세운다" 하나다.
    expect(source).toMatch(/const galaxy = star[\s\S]{0,200}setHoverGalaxyId\(galaxy\)/);
  });

  it('★ 은하를 정적 표가 아니라 별 목록에서 찾는다', () => {
    /*
     * galaxyOfVerse 는 큐레이션 702절로 만든 표를 본다. 성경전서에서
     * 올라온 별은 그 표에 없어서 은하 이름이 조용히 사라진다.
     */
    expect(source).not.toContain('galaxyOfVerse(');
    expect(source).toContain('byId.get(star)?.discipleId');
  });
});
