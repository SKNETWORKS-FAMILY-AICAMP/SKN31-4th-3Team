/*
 * services/mockRepositories.ts
 * ───────────────────────────────────────────────────────────────────────
 * Mock 구현. 실제 네트워크 감각을 위해 의도적으로 지연을 넣는다.
 *
 * ★ 이 파일 전체가 백엔드 연동 시 삭제 대상이다.
 *   교체 지점은 RepositoryProvider 한 곳뿐이다.
 */

import type { AskResult, CounselMessage, CounselSeed, VerseStar } from '../data/types';
import { VERSE_STARS, formatRef, getVerseStar } from '../data/verses';
import { ANSWER_VARIANTS } from '../data/answers';
import { THEME_LABELS } from '../data/intents';
import { galaxyOfVerse } from '../data/disciples';
import { objectOf } from '../data/korean';
import { counselOpening } from '../data/counselOpenings';
import { matchIntent } from './intentMatcher';
import type { CounselRepository, Repositories, VerseRepository } from './repositories';

/** 실제 API 호출처럼 느껴지도록 400~900ms 지연. */
function latency(min = 400, max = 900): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 같은 질문에 항상 같은 variant 가 나오도록 문자열 해시를 쓴다. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export const mockVerseRepository: VerseRepository = {
  async listStars(): Promise<VerseStar[]> {
    return [...VERSE_STARS];
  },

  async getStar(id: string): Promise<VerseStar | null> {
    await latency(120, 260);
    return getVerseStar(id) ?? null;
  },

  async ask(question: string, attempt = 0): Promise<AskResult> {
    await latency();
    const { intent } = matchIntent(question);
    const variants = ANSWER_VARIANTS[intent];
    // 같은 질문이면 같은 결과가 나오되, 재요청할 때마다 다음 variant 로 넘어간다.
    const variant = variants[(hash(question) + attempt) % variants.length];

    /*
     * 은하는 추천된 구절이 속한 곳으로 둔다.
     *
     * ★ 서버의 두 축(주제 비중 × MBTI 궁합)을 흉내 내지 않는다.
     *   여기서 비슷한 계산을 또 만들면 규칙이 두 벌이 되고, 백엔드를
     *   붙였을 때 어느 쪽이 맞는지 알 수 없게 된다. 구절에서 거슬러
     *   올라가는 것은 계산이 아니라 사실이라 어긋날 여지가 없다.
     */
    const galaxy = variant.verseIds[0] ? galaxyOfVerse(variant.verseIds[0]) : undefined;

    return {
      question,
      intent,
      empathy: variant.empathy,
      reflection: variant.reflection,
      verseIds: variant.verseIds,
      followUps: variant.followUps,
      galaxyId: galaxy?.id,
    };
  },
};

let threadCounter = 0;
let messageCounter = 0;

function nextId(prefix: string): string {
  messageCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${messageCounter}`;
}

/**
 * 상담 응답 mock.
 * 실제 LLM 대신, 구절 문맥과 의도를 조합한 템플릿을 쓴다.
 * 단정적 조언·의료 판단을 하지 않는 문장만 넣는다.
 */
function composeGuideReply(text: string, seed: CounselSeed): string {
  const { intent } = matchIntent(text);
  const star = seed.verseId ? getVerseStar(seed.verseId) : undefined;

  if (intent === 'crisis') {
    return (
      '지금 많이 힘드신 것 같아 걱정이 됩니다. 이 이야기를 혼자 감당하지 않으셨으면 합니다. ' +
      '가까운 사람이나 전문 상담 창구와 연결되는 일을 먼저 생각해 보시면 좋겠습니다. 여기서 계속 이야기하셔도 괜찮습니다.'
    );
  }

  const themeLabel = intent === 'fallback' ? '지금의 마음' : THEME_LABELS[intent];
  const anchor = star
    ? star.depth === 'full'
      ? `${formatRef(star)}의 "${star.excerpt}"라는 문장을 다시 떠올려 봅니다.`
      : `${objectOf(formatRef(star))} 함께 떠올리며 이야기를 시작합니다.`
    : '먼저 그 마음을 그대로 두고 살펴봅니다.';

  return (
    `${themeLabel}에 대해 말씀해 주셔서 고맙습니다. ${anchor} ` +
    '무엇이 가장 크게 걸리는지, 조금 더 구체적으로 들려주실 수 있을까요. 정리되지 않은 채로 말씀하셔도 괜찮습니다.'
  );
}

export const mockCounselRepository: CounselRepository = {
  async startThread(seed: CounselSeed) {
    await latency(200, 420);
    threadCounter += 1;
    const star = seed.verseId ? getVerseStar(seed.verseId) : undefined;

    /*
     * ★ 인물이 정해지는 규칙은 personaId 와 같아야 한다.
     *   따로 구하면 "베드로의 은하로 들어왔는데 요한의 인사가 뜨는" 어긋남이
     *   생긴다. 한 번 구해서 인사와 personaId 가 같이 쓴다.
     */
    const personaId = seed.galaxyId ?? (seed.verseId ? galaxyOfVerse(seed.verseId)?.id : undefined);

    const verseLead = star
      ? star.depth === 'full'
        ? `${formatRef(star)}에서 이어서 이야기해 볼게요. ${star.meditation}`
        : `${formatRef(star)}에서 이어서 이야기해 볼게요.`
      : undefined;

    const opening: CounselMessage = {
      id: nextId('msg'),
      role: 'guide',
      /*
       * ★ 열세 은하가 전부 같은 인사를 하던 자리다.
       *   조우에서 그 사람이 한마디 건넨 직후에 이 창이 열린다. 여기서
       *   누구에게나 같은 문장이 나오면 방금 만난 사람이 사라진다.
       */
      text: counselOpening(personaId, verseLead),
      verseId: seed.verseId,
      createdAt: Date.now(),
    };

    /*
     * mock 은 추천을 흉내 내지 않는다.
     *
     * ★ 근거(reason)를 지어내지 않는 이유
     *   서버의 추천은 702개 구절의 주제 분포와 MBTI 궁합에서 나온다.
     *   여기서 그럴듯한 문장을 만들어 두면, 백엔드를 붙인 순간 같은
     *   질문에 다른 이유가 뜨고 어느 쪽이 진짜인지 알 수 없게 된다.
     *   구절에서 이어 왔다면 인물은 확정이므로 그것만 알려 준다.
     */
    return { threadId: `thread-${threadCounter}`, opening, personaId };
  },

  async send(_threadId: string, text: string, seed: CounselSeed): Promise<CounselMessage> {
    await latency(500, 1100);
    return {
      id: nextId('msg'),
      role: 'guide',
      text: composeGuideReply(text, seed),
      verseId: seed.verseId,
      createdAt: Date.now(),
    };
  },
};

export const mockRepositories: Repositories = {
  verses: mockVerseRepository,
  counsel: mockCounselRepository,
};
