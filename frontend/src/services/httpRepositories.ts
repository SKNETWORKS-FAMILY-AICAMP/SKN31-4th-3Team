/*
 * services/httpRepositories.ts
 * ───────────────────────────────────────────────────────────────────────
 * Django 백엔드 구현. mockRepositories 와 같은 인터페이스를 만족한다.
 *
 * ★ 서버는 좌표를 주지 않는다.
 *   화면 좌표는 galaxy/placement.ts 가 "은하 안 순번"에서 파생시킨다.
 *   서버가 좌표까지 들고 있으면 배치 규칙을 고칠 때마다 DB 를 다시 써야
 *   하고, 두 규칙이 어긋나는 순간 별이 성운 밖에 뜬다.
 *   그래서 여기서 order → coord 변환을 한다.
 *
 * ★ snake_case ↔ camelCase 변환도 여기서만 한다.
 *   Django 는 snake_case 로, 화면은 camelCase 로 말한다. 경계에서 한 번
 *   번역해 두면 화면 코드가 서버의 표기법을 알 필요가 없다.
 */

import type {
  AskResult,
  BriefVerseStar,
  CounselMessage,
  CounselSeed,
  FullVerseStar,
  ResolvedIntent,
  ThemeTag,
  VerseStar,
  VisualMotif,
} from '../data/types';
import { galaxyOfVerse } from '../data/disciples';
import { placeInGalaxy } from '../galaxy/placement';
import { api, openStream } from './apiClient';
import { parseSseChunk, readEventStream } from './sse';
import type { CounselRepository, Repositories, VerseRepository } from './repositories';

/* ── 서버 응답 형태 ─────────────────────────────────────────────── */

interface GalaxyDto {
  id: string;
  name: string;
  role: string;
  mbti: string;
  tint: string;
  is_center: boolean;
  order: number;
}

interface VerseDto {
  id: string;
  galaxy_id: string;
  order: number;
  book_code: string;
  book_name: string;
  chapter: number;
  verse: number;
  depth: 'full' | 'brief';
  summary: string;
  themes: ThemeTag[];
  motif: VisualMotif;
  magnitude: number;
  excerpt: string;
  attribution: string;
  story: string;
  meditation: string;
  related_prompts: string[];
}

interface AskDto {
  question: string;
  intent: ResolvedIntent;
  empathy: string;
  reflection: string;
  verse_ids: string[];
  /** 검색이 고른 구절의 내용. 폴백일 때는 없다. */
  verses?: { id: string; ref: string; content: string; galaxy_id?: string }[];
  follow_ups: string[];
  galaxy_id: string;
  galaxy_name: string;
  galaxy_reason: string;
}

interface MessageDto {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  verse_id: string | null;
  created_at: string;
}

interface SessionDto {
  id: number;
  title: string;
  persona_id: string;
  /** 이 페르소나의 첫 인사. 서버가 만들어 준다. */
  opening: string;
  /** 왜 이 인물이 배정됐는지 한 줄. 직접 고른 경우엔 빈 문자열. */
  persona_reason: string;
  /** 이 대화를 시작시킨 구절. 없으면 null 로 온다. */
  seed_verse_id?: string | null;
  /** 구절 대신 질문에서 시작했다면 그 질문. */
  seed_question?: string;
  created_at: string;
}

/* ── 변환 ───────────────────────────────────────────────────────── */

function toStar(dto: VerseDto, galaxyOrder: number, verseCount: number): VerseStar {
  const base = {
    id: dto.id,
    ref: {
      bookCode: dto.book_code,
      bookName: dto.book_name,
      chapter: dto.chapter,
      verse: dto.verse,
    },
    summary: dto.summary,
    themes: dto.themes,
    motif: dto.motif,
    discipleId: dto.galaxy_id,
    coord: placeInGalaxy(dto.order, verseCount, galaxyOrder),
    magnitude: dto.magnitude,
  };

  if (dto.depth === 'full') {
    return {
      ...base,
      depth: 'full',
      excerpt: dto.excerpt,
      attribution: dto.attribution,
      story: dto.story,
      meditation: dto.meditation,
      relatedPrompts: dto.related_prompts,
    } satisfies FullVerseStar;
  }
  return { ...base, depth: 'brief' } satisfies BriefVerseStar;
}

function toMessage(dto: MessageDto): CounselMessage {
  return {
    id: String(dto.id),
    // 서버는 'assistant', 화면은 'guide' 라 부른다.
    role: dto.role === 'user' ? 'user' : 'guide',
    text: dto.content,
    verseId: dto.verse_id ?? undefined,
    createdAt: Date.parse(dto.created_at) || Date.now(),
  };
}

/* ── 구절 저장소 ────────────────────────────────────────────────── */

/**
 * 은하 목록과 구절 목록은 세션 내내 바뀌지 않는다.
 * 화면을 옮길 때마다 702건을 다시 받지 않도록 한 번만 받아 둔다.
 */
let starsPromise: Promise<VerseStar[]> | null = null;

async function loadStars(): Promise<VerseStar[]> {
  if (starsPromise) return starsPromise;

  starsPromise = (async () => {
    const [galaxies, verses] = await Promise.all([
      api<GalaxyDto[]>('/api/v1/scripture/galaxies/'),
      api<VerseDto[]>('/api/v1/scripture/verses/'),
    ]);

    const orderOf = new Map(galaxies.map((g) => [g.id, g.order]));
    const countOf = new Map<string, number>();
    for (const verse of verses) {
      countOf.set(verse.galaxy_id, (countOf.get(verse.galaxy_id) ?? 0) + 1);
    }

    return verses.map((verse) =>
      toStar(verse, orderOf.get(verse.galaxy_id) ?? 0, countOf.get(verse.galaxy_id) ?? 1),
    );
  })();

  try {
    return await starsPromise;
  } catch (error) {
    // 실패한 약속을 남겨 두면 이후 요청이 전부 같은 오류를 되풀이한다.
    starsPromise = null;
    throw error;
  }
}

export const httpVerseRepository: VerseRepository = {
  listStars() {
    return loadStars();
  },

  async getStar(id: string) {
    const stars = await loadStars();
    return stars.find((star) => star.id === id) ?? null;
  },

  async ask(question: string, attempt = 0): Promise<AskResult> {
    const dto = await api<AskDto>('/api/v1/scripture/ask/', {
      method: 'POST',
      // 로그인했으면 MBTI 가 추천에 반영된다. 안 했어도 그대로 답이 온다.
      auth: 'optional',
      body: { question, attempt },
    });

    return {
      question: dto.question,
      intent: dto.intent,
      empathy: dto.empathy,
      reflection: dto.reflection,
      verseIds: dto.verse_ids,
      /*
       * ★ 없으면 undefined 로 둔다.
       *   빈 배열로 두면 화면이 "검색은 됐는데 결과가 0개" 로 읽고
       *   구절 자리를 비운다. 폴백일 때는 verseIds 로 목록에서 찾아야 한다.
       */
      verses: dto.verses?.length
        ? dto.verses.map((v) => ({
            id: v.id,
            ref: v.ref,
            content: v.content,
            galaxyId: v.galaxy_id ?? '',
          }))
        : undefined,
      followUps: dto.follow_ups,
      galaxyId: dto.galaxy_id || undefined,
      galaxyReason: dto.galaxy_reason || undefined,
    };
  },
};

/* ── 상담 저장소 ────────────────────────────────────────────────── */

/**
 * 대화를 열 때 붙일 제목.
 *
 * 서버는 제목을 정해 주지 않는다(기본값 "새로운 대화"). 목록에서 어떤
 * 대화였는지 알아볼 수 있어야 하므로 여기서 문맥으로 만든다.
 */
/**
 * 어느 은하와 이야기할 것인가.
 *
 * ★ 구절에서 이어 왔으면 그 구절이 속한 은하다.
 *   화면에서 요한의 별을 눌러 들어왔는데 예수가 답하면, 사용자는
 *   자기가 무엇을 골랐는지 알 수 없게 된다.
 *
 * ★ 문맥이 없으면 비워 보낸다.
 *   서버가 중심 은하로 떨어뜨린다. 화면이 기본값을 정하면 규칙이
 *   두 곳에 생긴다.
 */
function personaFor(seed: CounselSeed): string {
  // 답변 화면에서 이미 정해졌다면 그것이 이긴다.
  if (seed.galaxyId) return seed.galaxyId;
  if (!seed.verseId) return '';
  return galaxyOfVerse(seed.verseId)?.id ?? '';
}

function titleFor(seed: CounselSeed): string {
  if (seed.question) return seed.question.slice(0, 40);
  if (seed.verseId) return '구절에서 시작한 대화';
  return '새로운 대화';
}

/**
 * 첫 인사.
 *
 * ★ 문구는 서버가 준다.
 *   인사말은 페르소나 정의(server/llm_core/prompts)에 있다. 화면이 따로
 *   들고 있으면 인물을 고칠 때 두 곳을 고쳐야 하고, 한쪽만 고치면
 *   베드로가 요한의 인사를 한다.
 *
 * ★ LLM 을 부르지 않는다.
 *   미리 정해 둔 문장이라 대화방을 여는 즉시 나온다.
 *
 * ★ 이 문장은 DB 에 저장되지 않는다.
 *   대화를 다시 열면 실제로 주고받은 말만 남는다. 맞는 동작이다 —
 *   인사는 기록이 아니라 문을 여는 몸짓이다.
 */
function openingFor(seed: CounselSeed, text: string): CounselMessage {
  return {
    id: `opening-${Date.now()}`,
    role: 'guide',
    text: text || '무엇이든 편히 적어 주세요.',
    verseId: seed.verseId,
    createdAt: Date.now(),
  };
}

/** 되살린 대화방. CounselContext 의 thread/restored 가 그대로 받는다. */
export interface RestoredThread {
  threadId: string;
  seed: CounselSeed;
  messages: CounselMessage[];
  personaId?: string;
  personaReason?: string;
}

/**
 * 지난 대화를 서버에서 가져온다.
 *
 * ★ 첫 인사를 앞에 다시 붙인다.
 *   서버는 인사를 저장하지 않는다 — 인사는 기록이 아니라 문을 여는
 *   몸짓이기 때문이다(openingFor 주석). 그래서 되살릴 때 화면이 다시
 *   얹는다. 없으면 대화가 사용자의 첫마디부터 시작해, 누구와 이야기하던
 *   중이었는지가 사라진다.
 *
 * ★ 저장소 인터페이스에 넣지 않았다.
 *   mock 에는 대응물이 없다 — 서버가 없을 때는 브라우저에 남긴 것을
 *   그대로 읽으면 되고, 그건 저장소를 거칠 일이 아니다. 억지로 계약에
 *   넣으면 mock 쪽에 "쓰이지 않는 구현" 이 하나 생긴다.
 */
export async function fetchThread(threadId: string): Promise<RestoredThread> {
  const dto = await api<SessionDto & { messages?: MessageDto[] }>(
    `/api/v1/chat/sessions/${encodeURIComponent(threadId)}/`,
    { auth: true },
  );

  const seed: CounselSeed = {
    verseId: dto.seed_verse_id ?? undefined,
    question: dto.seed_question || undefined,
    galaxyId: dto.persona_id || undefined,
  };

  const opening = openingFor(seed, dto.opening);
  const messages = (dto.messages ?? []).map(toMessage);

  return {
    threadId: String(dto.id),
    seed,
    messages: [opening, ...messages],
    personaId: dto.persona_id || undefined,
    personaReason: dto.persona_reason || undefined,
  };
}

export const httpCounselRepository: CounselRepository = {
  async startThread(seed: CounselSeed) {
    /*
     * 서버에는 대화방만 만든다.
     * (예전 /chat/threads/ 는 없어졌다 — 세션 생성으로 통일됐다)
     */
    const dto = await api<SessionDto>('/api/v1/chat/sessions/', {
      method: 'POST',
      auth: true,
      body: { title: titleFor(seed), persona_id: personaFor(seed) },
    });

    return {
      threadId: String(dto.id),
      opening: openingFor(seed, dto.opening),
      personaId: dto.persona_id || undefined,
      reason: dto.persona_reason || undefined,
    };
  },

  async send(threadId: string, text: string) {
    /*
     * 한 번에 받는 방식.
     *
     * 실시간으로 흘려받는 경로는 streamCounselReply() 가 따로 맡는다.
     * 둘 다 남겨 두는 이유는, 스트리밍이 막히는 환경(일부 사내 프록시가
     * text/event-stream 을 버퍼링한다)에서 이쪽으로 물러설 수 있어야
     * 하기 때문이다.
     */
    const dto = await api<MessageDto>(`/api/v1/chat/sessions/${threadId}/completion/`, {
      method: 'POST',
      auth: true,
      body: { message: text },
    });
    return toMessage(dto);
  },
};

/**
 * 답변을 조각으로 받아 가며 화면에 흘린다.
 *
 * @param onChunk 글자 조각이 올 때마다. 누적은 호출한 쪽이 한다.
 * @param signal  화면을 떠나면 읽기를 멈춘다.
 *
 * ★ 저장은 서버가 한다
 *   스트림이 끝나면 서버가 전체 답변을 ChatMessage 로 기록한다.
 *   화면에서 따로 저장 요청을 보내지 않는다 — 보내면 같은 답변이 두 번
 *   남는다.
 */
export async function streamCounselReply(
  threadId: string,
  text: string,
  onChunk: (piece: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await openStream(`/api/v1/chat/sessions/${threadId}/stream/`, {
    method: 'POST',
    auth: true,
    body: { message: text },
    signal,
  });

  let failure: string | null = null;

  await readEventStream(
    response.body!,
    {
      onData(raw) {
        const chunk = parseSseChunk(raw);
        if (chunk.kind === 'content') onChunk(chunk.text);
        // 서버가 스트림 안에서 오류를 알린 경우 — 끝난 뒤에 던진다
        else if (chunk.kind === 'error') failure = chunk.message;
      },
    },
    signal,
  );

  if (failure) throw new Error(failure);
}

export const httpRepositories: Repositories = {
  verses: httpVerseRepository,
  counsel: httpCounselRepository,
};

/** 테스트에서 캐시를 비울 때 쓴다. */
export function resetStarCache(): void {
  starsPromise = null;
}
