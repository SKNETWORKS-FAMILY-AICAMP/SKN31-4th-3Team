/*
 * routes/HomeRoute.tsx
 * ───────────────────────────────────────────────────────────────────────
 * 홈 — 질문을 던지는 자리.
 *
 * 화면의 무게중심은 입력창 하나다. 그 외 요소는 전부 보조다.
 * 배경 은하수는 장식이 아니라, 추천 구절이 실제로 놓여 있는 공간이다.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pickOpenings, pickSuggestedPrompts } from '../data/openings';
import { FULL_VERSE_STARS, VERSE_STARS } from '../data/verses';
import { BOOK_COUNT, REPRESENTED_VERSE_COUNT } from '../data/backdrop';
import { OpeningPrompt } from '../components/home/OpeningPrompt';
import { QuestionComposer } from '../components/home/QuestionComposer';
import { PromptChips } from '../components/home/PromptChips';
import { Button } from '../components/common/Button';
import { useAuth } from '../state/AuthContext';
import { askPath, PATHS } from './paths';
import screen from './Screen.module.css';

/** 한 화면에 노출할 추천 질문 수 */
const CHIP_COUNT = 3;

export function HomeRoute() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // 방문마다 달라지는 것이 의도다 — 마운트 시 한 번만 뽑는다.
  const openings = useMemo(() => pickOpenings(), []);
  const chips = useMemo(
    () => pickSuggestedPrompts(FULL_VERSE_STARS.flatMap((s) => s.relatedPrompts), CHIP_COUNT),
    [],
  );

  const [placeholder, setPlaceholder] = useState(openings[0]?.placeholder ?? '');
  const [engaged, setEngaged] = useState(false);

  const ask = useCallback(
    (question: string) => {
      navigate(askPath(question));
    },
    [navigate],
  );

  return (
    <main className={screen.screen}>
      <div className={screen.centered}>
        <OpeningPrompt
          openings={openings}
          paused={engaged}
          onChange={(o) => setPlaceholder(o.placeholder)}
          greetingName={user?.username}
        />

        <QuestionComposer
          placeholder={placeholder}
          onSubmit={ask}
          onEngage={() => setEngaged(true)}
          hint={`구절 ${REPRESENTED_VERSE_COUNT.toLocaleString('ko-KR')}개 · ${BOOK_COUNT}권이 하늘에 떠 있습니다`}
        />

        <PromptChips prompts={chips} onPick={ask} />

        <Button variant="quiet" data-guide="sky" onClick={() => navigate(PATHS.sky)}>
          별자리 먼저 둘러보기 ({VERSE_STARS.length}개 구절)
        </Button>
      </div>
    </main>
  );
}
