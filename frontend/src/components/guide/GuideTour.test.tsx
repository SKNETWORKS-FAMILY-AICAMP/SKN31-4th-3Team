/*
 * 튜토리얼 — 화면 동작.
 *
 * 위치 계산은 anchorRect.test.ts 가 맡는다. 여기서는 버튼 네 개가
 * 각각 무엇을 하는지만 본다.
 *
 *   다음          → 이어서 본다
 *   건너뛰기      → 이 분기를 통째로 넘긴다 (끌려가지 않는다)
 *   이전          → 방금 온 길을 되짚는다 (건너뛴 구간은 다시 밟지 않는다)
 *   그만하기      → 끝낸다
 *
 * 튜토리얼에서 가장 흔한 고장은 잘못된 위치가 아니라, 사용자를
 * 원하지 않는 화면에 끌어다 놓거나 한 단계에 가둬 두는 것이다.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUIDE_STEPS, GUIDE_TARGETS } from '../../data/guideSteps';
import { AuthProvider } from '../../state/AuthContext';
import { writeLocalSession } from '../../services/localSession';
import { PATHS } from '../../routes/paths';
import { AuthRoute } from '../../routes/AuthRoute';
import { GuideTour } from './GuideTour';

/** 지금 어느 화면인지 찍어 둔다 — 라우트 이동을 눈으로 확인하기 위해 */
function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

/** 사용자가 스스로 다른 화면으로 옮기는 상황을 만든다 */
function GoTo({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      {label}
    </button>
  );
}

beforeEach(() => window.localStorage.clear());

function setup() {
  const onClose = vi.fn();
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[PATHS.home]}>
        <Where />
        {/* 튜토리얼이 가리키는 대상들. 실제 화면에서는 각 컴포넌트가 달고 있다. */}
        <button type="button" data-guide="signup">
          회원가입
        </button>
        <button type="button" data-guide="sky">
          별자리
        </button>
        <GoTo to={PATHS.ask} label="답변으로" />
        <GoTo to="/verse/abc" label="구절 열기" />
        <Routes>
          <Route path={PATHS.home} element={<p>홈</p>} />
          <Route path={PATHS.auth} element={<p>계정 화면</p>} />
          <Route path={PATHS.sky} element={<p>하늘</p>} />
          <Route path={PATHS.ask} element={<p>답변</p>} />
          <Route path={PATHS.counsel} element={<p>대화</p>} />
          <Route path={PATHS.verse} element={<p>구절</p>} />
        </Routes>
        <GuideTour open onClose={onClose} />
      </MemoryRouter>
    </AuthProvider>,
  );
  return { onClose, user: userEvent.setup() };
}

const at = () => screen.getByTestId('where').textContent;
const stepIndexOf = (id: string) => GUIDE_STEPS.findIndex((s) => s.id === id);
const showing = (id: string) =>
  screen.queryByText(GUIDE_STEPS[stepIndexOf(id)].title) !== null;

const clickNext = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /^다음/ }));
const clickSkip = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: '건너뛰기' }));
const clickBack = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: '이전' }));

/** "다음"으로 지나가는 단계 수. 곁가지는 세지 않는다. */
const MAIN_COUNT = GUIDE_STEPS.filter((s) => !s.detour).length;

/**
 * 목표 단계까지 진행한다.
 *
 * 상호작용 단계에는 "다음"이 없다 — 그 행동을 하거나 건너뛰거나 둘뿐이다.
 * 손을 대지 않고 지나가려면 건너뛰기를 눌러야 한다.
 */
async function nextUntil(user: ReturnType<typeof userEvent.setup>, id: string) {
  for (let i = 0; i < GUIDE_STEPS.length && !showing(id); i += 1) {
    const forward = screen.queryByRole('button', { name: /^다음/ });
    if (forward) await user.click(forward);
    else await clickSkip(user);
  }
}

describe('다음', () => {
  it('열리면 첫 단계를 보여 준다', () => {
    setup();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(showing('welcome')).toBe(true);
    expect(screen.getByText(`1 / ${MAIN_COUNT}`)).toBeInTheDocument();
  });

  it('바로 뒤 단계로 간다', async () => {
    const { user } = setup();
    await clickNext(user);
    expect(showing('signup')).toBe(true);
  });

  it('마지막에서는 "시작하기"가 되고, 누르면 닫힌다', async () => {
    const { user, onClose } = setup();
    await nextUntil(user, 'care');

    expect(screen.queryByRole('button', { name: /그만하기/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '시작하기' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('★ 건너뛰기 — 분기를 통째로 넘긴다', () => {
  it('가입을 건너뛰면 가입 화면으로 끌려가지 않는다', async () => {
    /*
     * 이것이 이번 수정의 핵심이다. "나중에"를 골랐는데 이름 입력창이
     * 뜨면 그건 건너뛴 것이 아니다.
     */
    const { user } = setup();
    await clickNext(user); // welcome → signup
    expect(showing('signup')).toBe(true);

    await clickSkip(user);

    expect(at()).toBe(PATHS.home);
    expect(showing('name')).toBe(false);
    expect(showing('mbti')).toBe(false);
    expect(showing('submit')).toBe(false);
    expect(showing('greeting')).toBe(true);
  });

  it('하늘을 건너뛰면 하늘로 끌려가지 않는다', async () => {
    const { user } = setup();
    await nextUntil(user, 'enterSky');
    expect(at()).toBe(PATHS.home);

    await clickSkip(user);

    expect(at()).toBe(PATHS.home);
    expect(showing('navigate')).toBe(false);
    expect(showing('menu')).toBe(true);
  });

  it('분기가 아닌 단계에는 건너뛰기가 없다', async () => {
    // 넘길 것이 없는데 버튼만 있으면 "다음"과 구별되지 않는다.
    setup();
    expect(screen.queryByRole('button', { name: '건너뛰기' })).not.toBeInTheDocument();
  });

  it('분기 입구에는 건너뛰기가 있다', async () => {
    const { user } = setup();
    await clickNext(user);
    expect(screen.getByRole('button', { name: '건너뛰기' })).toBeInTheDocument();
  });
});

describe('★ 이전 — 지나온 길만 되짚는다', () => {
  it('첫 단계에는 이전이 없다', () => {
    setup();
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument();
  });

  it('한 걸음 되돌아간다', async () => {
    const { user } = setup();
    await clickNext(user);
    await clickBack(user);
    expect(showing('welcome')).toBe(true);
  });

  it('★ 건너뛴 구간을 다시 밟지 않는다', async () => {
    /*
     * 이전이 그냥 index-1 이면, 가입을 건너뛰고 온 사람이 이전을 눌렀을 때
     * 방금 건너뛴 가입 화면으로 끌려 들어간다.
     */
    const { user } = setup();
    await clickNext(user); // → signup
    await clickSkip(user); // → composer (name/mbti/submit 건너뜀)
    await clickBack(user);

    expect(showing('signup')).toBe(true);
    expect(at()).toBe(PATHS.home);
  });

  it('되짚어 올라가면 이전 버튼이 사라진다', async () => {
    const { user } = setup();
    await clickNext(user);
    await clickBack(user);
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument();
  });

  it('왼쪽 화살표로도 되짚는다', async () => {
    const { user } = setup();
    await clickNext(user);
    await user.keyboard('{ArrowLeft}');
    expect(showing('welcome')).toBe(true);
  });
});

describe('★ 그만두기 — 어느 단계에서도 나갈 수 있다', () => {
  it('X 로 닫힌다', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('button', { name: '둘러보기 그만두기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('"그만하기"로도 닫힌다', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('button', { name: '둘러보기 그만하기' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc 로 닫힌다', async () => {
    const { user, onClose } = setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('★ 지나가는 모든 단계에 나갈 길이 있다', async () => {
    /*
     * 건너뛰기로 분기를 넘기면 실제로 밟는 단계 수는 MAIN_COUNT 보다
     * 적다. 그래서 횟수를 세지 않고 마지막 단계에 닿을 때까지 걷는다.
     */
    const { user } = setup();
    for (let i = 0; i < GUIDE_STEPS.length && !showing('care'); i += 1) {
      expect(screen.getByRole('button', { name: '둘러보기 그만두기' })).toBeInTheDocument();
      const forward = screen.queryByRole('button', { name: /^다음/ });
      if (forward) await user.click(forward);
      else await clickSkip(user);
    }
    expect(showing('care')).toBe(true);
  });
});

describe('★ 상호작용 단계는 행동을 기다린다', () => {
  it('회원가입을 누르지 않으면 가입 설명으로 넘어가지 않는다', async () => {
    /*
     * 예전에는 "다음"이 있어서, 버튼을 누르지 않은 채 이름 설명이 떴다.
     * 그러면 화면에는 로그인 창이 떠 있어 아무것도 할 수 없었다.
     * 길은 둘뿐이어야 한다 — 누르거나, 건너뛰거나.
     */
    const { user } = setup();
    await clickNext(user);
    expect(showing('signup')).toBe(true);

    expect(screen.queryByRole('button', { name: /^다음/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '건너뛰기' })).toBeInTheDocument();
  });

  it('★ 회원가입을 누르면 입력 설명부터 시작한다', async () => {
    /*
     * 이전에는 한 칸이 밀려 이름·이메일·비밀번호 설명이 통째로 사라지고
     * 유형 고르기부터 나왔다. 그 상태로는 가입 자체가 되지 않는다.
     */
    const { user } = setup();
    await clickNext(user);
    await user.click(screen.getByRole('button', { name: '회원가입' }));

    await vi.waitFor(() => expect(at()).toBe(PATHS.auth));
    await vi.waitFor(() => expect(showing('name')).toBe(true));
    expect(showing('mbti')).toBe(false);
  });

  it('입력 다음이 유형, 그 다음이 마무리다', async () => {
    const { user } = setup();
    await clickNext(user);
    await user.click(screen.getByRole('button', { name: '회원가입' }));
    await vi.waitFor(() => expect(showing('name')).toBe(true));

    await clickNext(user);
    expect(showing('mbti')).toBe(true);
    await clickNext(user);
    expect(showing('submit')).toBe(true);
  });

  it('하늘도 마찬가지로 눌러야 들어간다', async () => {
    const { user } = setup();
    await nextUntil(user, 'enterSky');
    expect(screen.queryByRole('button', { name: /^다음/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '별자리' }));
    await vi.waitFor(() => expect(at()).toBe(PATHS.sky));
    await vi.waitFor(() => expect(showing('navigate')).toBe(true));
  });
});

describe('화면 이동', () => {

  it('가입 설명이 끝나면 홈으로 돌아온다', async () => {
    const { user } = setup();
    await nextUntil(user, 'greeting');
    expect(at()).toBe(PATHS.home);
  });

  it('마지막 단계는 화면을 지정하지 않는다 — 있던 자리에 그대로 둔다', async () => {
    const { user } = setup();
    await nextUntil(user, 'enterSky');
    await user.click(screen.getByRole('button', { name: '별자리' }));
    await vi.waitFor(() => expect(showing('navigate')).toBe(true));

    await nextUntil(user, 'care');
    expect(at()).toBe(PATHS.sky);
  });
});

describe('★ 해 보면서 배운다', () => {
  it('권유 문구가 무엇을 해 볼지 알려 준다', () => {
    setup();
    expect(screen.getByText(GUIDE_STEPS[0].action!)).toBeInTheDocument();
  });

  it('가리킨 것을 실제로 누르면 다음 단계로 넘어간다', async () => {
    const { user } = setup();
    await clickNext(user);
    expect(showing('signup')).toBe(true);

    // 튜토리얼이 뚫어 준 구멍으로 진짜 회원가입 버튼을 누른다
    await user.click(screen.getByRole('button', { name: '회원가입' }));
    await vi.waitFor(() => expect(showing('name')).toBe(true));
  });
});

describe('시나리오 데이터', () => {
  it('id 가 겹치지 않는다 — 진행 표시가 key 로 쓴다', () => {
    const ids = GUIDE_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 단계에 라벨·제목·본문이 있다', () => {
    for (const step of GUIDE_STEPS) {
      expect(step.eyebrow.length).toBeGreaterThan(0);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it('앵커는 data-guide 선택자 형태이고, 실제 붙어 있는 이름이다', () => {
    for (const step of GUIDE_STEPS) {
      if (!step.anchor) continue;
      expect(step.anchor).toMatch(/^\[data-guide="[a-zA-Z]+"\]$/);
      const name = step.anchor.match(/"([a-zA-Z]+)"/)?.[1] ?? '';
      expect(GUIDE_TARGETS).toContain(name);
    }
  });

  it('★ skipTo 는 실제로 있는 단계를 가리킨다', () => {
    // 없는 id 를 가리키면 건너뛰기가 한 칸씩만 움직여 분기가 새어 나온다.
    for (const step of GUIDE_STEPS) {
      if (!step.skipTo) continue;
      expect(stepIndexOf(step.skipTo)).toBeGreaterThanOrEqual(0);
    }
  });

  it('★ skipTo 는 항상 앞이 아니라 뒤를 가리킨다', () => {
    // 뒤로 가면 무한히 맴돈다.
    for (const [i, step] of GUIDE_STEPS.entries()) {
      if (!step.skipTo) continue;
      expect(stepIndexOf(step.skipTo)).toBeGreaterThan(i);
    }
  });

  it('★ 눌러서 넘어가는 단계에는 반드시 가리킬 대상이 있다', () => {
    // 대상 없이 interact 면 구멍이 안 뚫려 영원히 넘어가지 못한다.
    for (const step of GUIDE_STEPS) {
      if (step.advance !== 'interact') continue;
      expect(step.anchor).toBeTruthy();
    }
  });

  it('★ 눌러서 넘어가는 단계에는 반드시 빠져나갈 skipTo 가 있다', () => {
    // 누르기 싫은 사람을 그 단계에 가둬 두면 안 된다.
    for (const step of GUIDE_STEPS) {
      if (step.advance !== 'interact') continue;
      expect(step.skipTo).toBeTruthy();
    }
  });

  it('★ 무대 단계는 화면 가운데를 요구하는 단계다', () => {
    /*
     * 무대 단계는 차단막을 걷고 카드를 구석으로 물린다. 화면 한가운데를
     * 직접 만지거나 읽어야 하는 단계가 여기 해당한다.
     */
    const stages = GUIDE_STEPS.filter((s) => s.stage).map((s) => s.id);
    expect(stages).toEqual(['answer', 'counsel', 'navigate', 'stars', 'verse', 'filter']);
  });

  it('★ 곁가지는 "다음"으로 지나가지 않는다', () => {
    // 지나가 버리면 사용자를 답변 화면이나 구절 상세로 끌고 가게 된다.
    const detours = GUIDE_STEPS.filter((s) => s.detour).map((s) => s.id);
    expect(detours).toEqual(['answer', 'counsel', 'verse']);
  });

  it('★ 곁가지에는 반드시 담당 화면이 있다', () => {
    // 화면이 없으면 열릴 계기가 없어 영원히 죽은 단계가 된다.
    for (const step of GUIDE_STEPS) {
      if (!step.detour) continue;
      expect(step.route).toBeTruthy();
    }
  });

  it('가입 분기는 로그인하지 않은 사람에게만 뜬다', () => {
    const gated = GUIDE_STEPS.filter((s) => s.when === 'signedOut').map((s) => s.id);
    expect(gated).toEqual(['signup', 'name', 'mbti', 'submit']);
  });

  it('본문 줄이 너무 길지 않다 — 카드 폭을 넘기지 않도록 끊어 둔다', () => {
    for (const step of GUIDE_STEPS) {
      for (const line of step.body.split('\n')) {
        expect(line.length).toBeLessThanOrEqual(34);
      }
      for (const line of (step.action ?? '').split('\n')) {
        expect(line.length).toBeLessThanOrEqual(34);
      }
    }
  });

  it('계정 만들기를 가장 먼저 안내한다', () => {
    expect(stepIndexOf('signup')).toBe(1);
    expect(stepIndexOf('name')).toBeLessThan(stepIndexOf('composer'));
    expect(stepIndexOf('mbti')).toBeLessThan(stepIndexOf('composer'));
  });

  it('안전 안내로 끝난다', () => {
    expect(GUIDE_STEPS[GUIDE_STEPS.length - 1].id).toBe('care');
  });
});

/*
 * 채워야 넘어가는 단계.
 *
 * 진짜 가입 폼을 세워 두고 확인한다 — 판정이 실제 DOM 을 보기 때문에,
 * 가짜 입력 칸으로는 폼이 바뀌었을 때 어긋나는 것을 잡지 못한다.
 */
describe('★ 비어 있으면 다음이 막힌다', () => {
  function setupForm() {
    const onClose = vi.fn();
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={[{ pathname: PATHS.auth, state: { mode: 'register' } }]}>
          <Routes>
            <Route path={PATHS.auth} element={<AuthRoute />} />
            <Route path={PATHS.home} element={<p>홈</p>} />
          </Routes>
          <GuideTour open onClose={onClose} />
        </MemoryRouter>
      </AuthProvider>,
    );
    return { onClose, user: userEvent.setup() };
  }

  /** 가입 폼 위에 서는 '입력' 단계까지 간다 */
  async function toFormStep(user: ReturnType<typeof userEvent.setup>) {
    for (let i = 0; i < GUIDE_STEPS.length && !showing('name'); i += 1) {
      const forward = screen.queryByRole('button', { name: /^다음/ });
      if (forward) await user.click(forward);
      else await clickSkip(user);
    }
  }

  it('빈 채로 다음을 누르면 넘어가지 않고 입력을 청한다', async () => {
    const { user } = setupForm();
    await toFormStep(user);
    expect(showing('name')).toBe(true);

    await clickNext(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('입력을 해 주세요.');
    // 그대로 머문다 — 다음 단계로 밀리지 않는다
    expect(showing('name')).toBe(true);
    expect(showing('mbti')).toBe(false);
  });

  it('일부만 채워도 막힌다', async () => {
    const { user } = setupForm();
    await toFormStep(user);

    await user.type(screen.getByLabelText('이메일'), 'a@b.com');
    await clickNext(user);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(showing('name')).toBe(true);
  });

  it('다 채우면 넘어간다', async () => {
    const { user } = setupForm();
    await toFormStep(user);

    await user.type(screen.getByLabelText('이메일'), 'a@b.com');
    await user.type(screen.getByLabelText('이름'), '혁진');
    await user.type(screen.getByLabelText(/비밀번호/), 'password123');
    await clickNext(user);

    expect(showing('mbti')).toBe(true);
  });

  it('★ 채우면 경고가 스스로 걷힌다', async () => {
    /*
     * 칸을 채웠는데도 빨간 테두리와 경고가 남아 있으면, 채운 것이
     * 반영되지 않았다고 읽는다.
     */
    const { user } = setupForm();
    await toFormStep(user);
    await clickNext(user);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.type(screen.getByLabelText('이메일'), 'a@b.com');
    await user.type(screen.getByLabelText('이름'), '혁진');
    await user.type(screen.getByLabelText(/비밀번호/), 'password123');

    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('★ 막혀도 건너뛰기는 열려 있다', async () => {
    // 튜토리얼이 가입을 강요하는 도구가 되면 안 된다.
    const { user } = setupForm();
    await toFormStep(user);
    await clickNext(user);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await clickSkip(user);
    expect(showing('greeting')).toBe(true);
  });

  it('MBTI 를 고르지 않으면 고르기를 청한다', async () => {
    const { user } = setupForm();
    await toFormStep(user);
    await user.type(screen.getByLabelText('이메일'), 'a@b.com');
    await user.type(screen.getByLabelText('이름'), '혁진');
    await user.type(screen.getByLabelText(/비밀번호/), 'password123');
    await clickNext(user);
    expect(showing('mbti')).toBe(true);

    await clickNext(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('하나를 골라 주세요.');
    expect(showing('mbti')).toBe(true);
  });

  it('고르면 넘어간다', async () => {
    const { user } = setupForm();
    await toFormStep(user);
    await user.type(screen.getByLabelText('이메일'), 'a@b.com');
    await user.type(screen.getByLabelText('이름'), '혁진');
    await user.type(screen.getByLabelText(/비밀번호/), 'password123');
    await clickNext(user);

    await user.click(screen.getByRole('radio', { name: 'INFJ' }));
    await clickNext(user);

    expect(showing('submit')).toBe(true);
  });
});

describe('★ 이미 로그인한 사람', () => {
  beforeEach(() => {
    writeLocalSession({ id: 1, email: 'a@b.com', username: '혁진', mbti: 'INFJ' });
  });

  it('회원가입 권유가 뜨지 않는다', async () => {
    /*
     * 로그인한 사람에게 "회원가입을 눌러 볼까요?"를 권하고, 눌렀더니
     * 로그인 화면이 열리는 것은 안내가 아니라 사고다.
     */
    const { user } = setup();
    await clickNext(user);
    expect(showing('signup')).toBe(false);
    expect(showing('greeting')).toBe(true);
  });

  it('가입 화면으로 데려가지 않는다', async () => {
    const { user } = setup();
    await clickNext(user);
    await clickNext(user);
    expect(at()).not.toBe(PATHS.auth);
  });

  it('진행 표시가 실제로 보게 될 단계 수만 센다', async () => {
    // 4단계를 감췄는데 "1 / 15"라고 하면 4개는 영영 오지 않는다.
    setup();
    const signedOutCount = GUIDE_STEPS.filter((s) => s.when === 'signedOut').length;
    const mainCount = GUIDE_STEPS.filter((s) => !s.detour).length - signedOutCount;
    expect(screen.getByText(`1 / ${mainCount}`)).toBeInTheDocument();
  });
});

describe('★ 사용자가 스스로 옮기면 안내가 따라간다', () => {
  it('질문을 보내 답변 화면으로 가면 답변 설명이 뜬다', async () => {
    /*
     * 이것이 이번 수정의 핵심이다. 지금까지는 홈의 입력창을 가리킨 채
     * 멈춰 서 있었다.
     */
    const { user } = setup();
    await nextUntil(user, 'composer');

    await user.click(screen.getByRole('button', { name: '답변으로' }));
    await vi.waitFor(() => expect(showing('answer')).toBe(true));
    expect(at()).toBe(PATHS.ask);
  });

  it('구절을 열면 구절 설명이 뜬다 — 단계가 한참 뒤여도', async () => {
    const { user } = setup();
    await nextUntil(user, 'menu'); // 거의 끝까지 온 상태

    await user.click(screen.getByRole('button', { name: '구절 열기' }));
    await vi.waitFor(() => expect(showing('verse')).toBe(true));
  });

  it('곁가지에서 다음을 누르면 본 흐름으로 돌아온다', async () => {
    const { user } = setup();
    await nextUntil(user, 'composer');
    await user.click(screen.getByRole('button', { name: '답변으로' }));
    await vi.waitFor(() => expect(showing('answer')).toBe(true));

    await clickNext(user);
    expect(showing('chips')).toBe(true);
    expect(at()).toBe(PATHS.home);
  });

  it('곁가지에서 이전을 누르면 곁길로 새기 전으로 돌아간다', async () => {
    const { user } = setup();
    await nextUntil(user, 'composer');
    await user.click(screen.getByRole('button', { name: '답변으로' }));
    await vi.waitFor(() => expect(showing('answer')).toBe(true));

    await clickBack(user);
    expect(showing('composer')).toBe(true);
  });

  it('곁가지에는 번호 대신 옆길임을 표시한다', async () => {
    // 곁가지에 번호를 붙이면 전체 개수가 사람마다 달라져 오히려 헷갈린다.
    const { user } = setup();
    await nextUntil(user, 'composer');
    await user.click(screen.getByRole('button', { name: '답변으로' }));
    await vi.waitFor(() => expect(showing('answer')).toBe(true));

    expect(screen.getByText('잠깐 옆길')).toBeInTheDocument();
  });
});

describe('접근성', () => {
  it('단계 내용이 대화상자의 이름과 설명으로 연결된다', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'guide-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'guide-body');
  });

  it('★ 모달로 선언하지 않는다 — 화면의 요소를 실제로 눌러야 하므로', () => {
    /*
     * aria-modal="true" 면 보조기술이 대화상자 바깥을 통째로 감춘다.
     * 그러면 "회원가입을 눌러 보세요"라고 읽어 주고는 그 버튼을
     * 찾을 수 없게 된다.
     */
    setup();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'false');
  });

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <GuideTour open={false} onClose={vi.fn()} />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
