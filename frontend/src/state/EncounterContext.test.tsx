/*
 * state/EncounterContext.test.tsx
 *
 * ★ 여기서 잡아야 하는 고장
 *   - 조우가 끝나지 않아 화면이 영영 안 열림 (가장 나쁜 실패다)
 *   - 엔진 통지가 안 오는 환경에서 버튼이 안 뜸
 *   - 저절로 넘어가 버려서 형태를 볼 시간이 없음
 *   - 상징 없는 은하에서 빈 화면이 잠깐 뜸
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EncounterOverlay } from '../components/galaxy/EncounterOverlay';
import { EncounterProvider, useEncounter } from './EncounterContext';
import { GalaxyProvider } from './GalaxyContext';

function Harness({
  galaxyId,
  onDone,
  label,
}: {
  galaxyId: string;
  onDone: () => void;
  label?: string;
}) {
  const { begin, release, stage, galaxyId: current } = useEncounter();
  return (
    <div>
      <button type="button" onClick={() => begin(galaxyId, onDone, label)}>
        시작
      </button>
      <button type="button" onClick={release}>
        놓아주기
      </button>
      <span data-testid="stage">{stage ?? '없음'}</span>
      <span data-testid="galaxy">{current ?? '없음'}</span>
      <EncounterOverlay />
    </div>
  );
}

function setup(galaxyId = 'peter', label = '구절 열기') {
  const done = vi.fn();
  render(
    <GalaxyProvider>
      <EncounterProvider>
        <Harness galaxyId={galaxyId} onDone={done} label={label} />
      </EncounterProvider>
    </GalaxyProvider>,
  );
  return done;
}

function press(name: string) {
  act(() => {
    screen.getByRole('button', { name }).click();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('조우', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('시작하면 별부터 모은다 — 글은 아직 없다', () => {
    /*
     * ★ 이 구간의 주인공은 형태다.
     *   글이 먼저 뜨면 눈이 글로 가고, 상징이 만들어지는 순간을 아무도 안 본다.
     */
    setup();
    press('시작');

    expect(screen.getByTestId('stage')).toHaveTextContent('gathering');
    expect(screen.getByTestId('galaxy')).toHaveTextContent('peter');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('★ 저절로 넘어가지 않는다', () => {
    /*
     * 예전에는 1.9초 뒤에 저절로 넘어갔다. 형태를 더 보고 싶은 사람은
     * 놓치고, 서두르는 사람은 기다렸다. 이제는 누를 때까지 기다린다.
     */
    const done = setup();
    press('시작');
    advance(1800); // 형태 안전망 — 여기까지는 버튼이 떠야 한다
    expect(screen.getByTestId('stage')).toHaveTextContent('greeting');

    advance(30_000);
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByTestId('stage')).toHaveTextContent('greeting');
  });

  it('엔진 통지가 없어도 버튼은 뜬다', () => {
    /*
     * ★ 가장 나쁜 실패다.
     *   Canvas 를 못 쓰는 환경이나 백그라운드 탭에서는 엔진의 "형태가
     *   잡혔다" 통지가 영영 오지 않는다. 그래도 넘어갈 수 있어야 한다.
     */
    const done = setup();
    press('시작');
    advance(1800);

    press('구절 열기');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('버튼 문구가 어디로 가는지 말한다', () => {
    // "들어가기" 처럼 두루뭉술하면 누를 때 무슨 일이 생길지 모른다
    setup('peter', '상담 들어가기');
    press('시작');
    advance(1800);
    expect(screen.getByRole('button', { name: '상담 들어가기' })).toBeInTheDocument();
  });

  it('멘트에 이름·상징·근거가 함께 나온다', () => {
    // 상징만 보여 주면 무엇인지 알 수 없다. 근거 한 줄이 그걸 메운다.
    setup();
    press('시작');
    advance(1800);

    const panel = screen.getByRole('status');
    expect(panel).toHaveTextContent('베드로');
    expect(panel).toHaveTextContent('열쇠');
    expect(panel).toHaveTextContent('마태복음 16:19');
  });

  it('★ 넘어간 뒤에도 상징은 남는다', () => {
    /*
     * 구절 목록을 훑는 동안 배경이 다시 나선으로 풀려 버리면,
     * 방금 만든 형태가 스쳐 간 연출이 된다.
     */
    setup();
    press('시작');
    advance(1800);
    press('구절 열기');

    expect(screen.getByTestId('stage')).toHaveTextContent('없음');
    expect(screen.getByTestId('galaxy')).toHaveTextContent('peter');
  });

  it('하늘을 떠나면 상징을 놓아준다', () => {
    setup();
    press('시작');
    advance(1800);
    press('구절 열기');
    press('놓아주기');

    expect(screen.getByTestId('galaxy')).toHaveTextContent('없음');
  });

  it('Esc 로도 넘어간다', () => {
    const done = setup();
    press('시작');
    advance(1800);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('바깥을 눌러도 넘어가지 않는다', () => {
    /*
     * ★ 뒤의 하늘을 끌어 돌려 보다가 넘어가 버리면 안 된다.
     *   누르는 곳은 버튼 하나뿐이다.
     */
    const done = setup();
    press('시작');
    advance(1800);

    act(() => {
      fireEvent.click(screen.getByRole('status'));
    });
    expect(done).not.toHaveBeenCalled();
  });

  it('상징이 없는 은하는 조우 없이 곧바로 연다', () => {
    /*
     * 은하가 늘었는데 상징을 아직 안 만든 경우다. 빈 화면을 잠깐 띄우느니
     * 없던 일로 하는 편이 낫다.
     */
    const done = setup('없는_은하');
    press('시작');
    expect(done).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('stage')).toHaveTextContent('없음');
  });

  it('Provider 밖에서는 조우 없이 곧바로 연다', () => {
    // 컴포넌트 하나만 떼어 렌더하는 테스트가 흔하다
    const done = vi.fn();
    render(<Harness galaxyId="peter" onDone={done} />);
    press('시작');
    expect(done).toHaveBeenCalledTimes(1);
  });
});
