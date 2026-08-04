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
  follow_ups: string[];
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
      body: { question, attempt },
    });

    return {
      question: dto.question,
      intent: dto.intent,
      empathy: dto.empathy,
      reflection: dto.reflection,
      verseIds: dto.verse_ids,
      followUps: dto.follow_ups,
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
function titleFor(seed: CounselSeed): string {
  if (seed.question) return seed.question.slice(0, 40);
  if (seed.verseId) return '구절에서 시작한 대화';
  return '새로운 대화';
}

/**
 * 서버가 만들어 주지 않는 첫 인사.
 *
 * ★ 서버를 기다리지 않는 이유
 *   대화방 생성은 빈 방을 만드는 일이고, 첫 인사를 받으려면 LLM 을 한 번
 *   더 호출해야 한다. 그 시간만큼 사용자는 빈 화면을 본다.
 *   첫 문장은 문맥에서 바로 만들 수 있으므로 화면에서 만든다.
 *
 * ★ 이 문장은 서버에 저장되지 않는다
 *   대화를 다시 열면 이 인사는 없고 실제 주고받은 말만 남는다.
 *   맞는 동작이다 — 인사는 기록이 아니라 문을 여는 몸짓이다.
 */
function openingFor(seed: CounselSeed): CounselMessage {
  const text = seed.verseId
    ? '이 구절을 곁에 두고 이어서 이야기해 볼까요.\n마음에 걸리는 것부터 편히 적어 주세요.'
    : '무엇이든 편히 적어 주세요.\n같이 천천히 짚어 보겠습니다.';

  return {
    id: `opening-${Date.now()}`,
    role: 'guide',
    text,
    verseId: seed.verseId,
    createdAt: Date.now(),
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
      body: { title: titleFor(seed) },
    });

    return { threadId: String(dto.id), opening: openingFor(seed) };
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
