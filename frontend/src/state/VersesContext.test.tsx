/*
 * state/VersesContext.test.tsx
 *
 * ★ 이 파일이 막으려는 고장
 *   저장소(repositories.verses)는 처음부터 있었는데 아무도 안 썼다.
 *   모든 화면이 data/verses.ts 를 직접 읽고 있었고, 그래서 서버에
 *   무엇을 넣어도 화면은 그대로였다. 백엔드를 붙여 놓고 "왜 안 바뀌지"
 *   를 한참 찾게 되는 종류의 어긋남이다.
 *
 *   테스트로 못 잡았던 이유는, 화면이 정적 데이터로도 정상 동작하기
 *   때문이다. 전부 초록불인데 연결만 안 돼 있었다.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { VERSE_STARS } from '../data/verses';
import { RepositoryProvider } from '../services/RepositoryProvider';
import { mockRepositories } from '../services/mockRepositories';
import { useVerses, useVerseStar, VersesProvider } from './VersesContext';

function Probe() {
  const { stars, byId, byGalaxy, fromServer } = useVerses();
  const first = useVerseStar(VERSE_STARS[0]?.id);
  return (
    <ul>
      <li data-testid="count">{stars.length}</li>
      <li data-testid="galaxies">{byGalaxy.size}</li>
      <li data-testid="lookup">{first?.id ?? '없음'}</li>
      <li data-testid="indexed">{String(byId.size === stars.length)}</li>
      <li data-testid="source">{fromServer ? '서버' : '정적'}</li>
    </ul>
  );
}

function renderProbe() {
  return render(
    <RepositoryProvider value={mockRepositories}>
      <VersesProvider>
        <Probe />
      </VersesProvider>
    </RepositoryProvider>,
  );
}

describe('별 목록 문맥', () => {
  it('API 를 안 쓰면 정적 목록이 첫 렌더부터 있다', () => {
    /*
     * ★ 기다리게 하면 안 된다.
     *   서버 없이 clone 만 한 팀원에게는 기다릴 대상이 없다.
     *   "하늘을 준비하는 중…" 이 영원히 떠 있으면 앱이 고장 난 것처럼 보인다.
     */
    renderProbe();
    expect(screen.getByTestId('count')).toHaveTextContent(String(VERSE_STARS.length));
    expect(screen.queryByText('하늘을 준비하는 중…')).not.toBeInTheDocument();
  });

  it('id 색인이 별 개수와 맞는다', () => {
    // 어긋나면 id 가 겹친 것이고, 겹친 별 하나는 영원히 못 찾는다
    renderProbe();
    expect(screen.getByTestId('indexed')).toHaveTextContent('true');
  });

  it('은하별로 묶인다', () => {
    renderProbe();
    expect(Number(screen.getByTestId('galaxies').textContent)).toBeGreaterThan(1);
  });

  it('별 하나를 id 로 찾는다', () => {
    renderProbe();
    expect(screen.getByTestId('lookup')).toHaveTextContent(VERSE_STARS[0].id);
  });

  it('Provider 없이도 죽지 않고 정적 목록을 준다', () => {
    // 컴포넌트 하나만 떼어 렌더하는 테스트가 흔하다
    render(<Probe />);
    expect(screen.getByTestId('count')).toHaveTextContent(String(VERSE_STARS.length));
  });
});

describe('★ 화면이 정적 데이터로 되돌아가지 않는다', () => {
  /*
   * 소스를 직접 읽어 확인한다. 동작 테스트로는 못 잡는다 —
   * 정적 데이터로도 화면이 멀쩡히 돌기 때문이다.
   */
  const ROOT = join(__dirname, '..');
  const WATCHED = ['routes', 'components'];

  /** 정적 별 목록을 직접 읽으면 서버 데이터가 화면에 닿지 않는다. */
  const FORBIDDEN = /\b(VERSE_STARS|getVerseStarsByGalaxy|getVerseStar)\b/;

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(path));
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
    }
    return out;
  }

  it.each(WATCHED)('%s 는 별 목록을 문맥에서 받는다', (folder) => {
    const offenders = walk(join(ROOT, folder))
      .filter((path) => FORBIDDEN.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(ROOT.length + 1));

    expect(offenders).toEqual([]);
  });

  it('FULL_VERSE_STARS 는 예외다 — 추천 질문 칩의 출처다', () => {
    // 큐레이션 구절에만 relatedPrompts 가 있어서, 그건 정적으로 둔다.
    // 이 테스트는 그 예외가 의도된 것임을 남겨 둔다.
    const home = readFileSync(join(ROOT, 'routes/HomeRoute.tsx'), 'utf8');
    expect(home).toContain('FULL_VERSE_STARS');
    expect(home).toContain('useVerses');
  });
});
