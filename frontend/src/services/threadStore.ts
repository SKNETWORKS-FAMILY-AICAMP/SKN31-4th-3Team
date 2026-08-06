/*
 * services/threadStore.ts
 * ───────────────────────────────────────────────────────────────────────
 * 대화방 목록. 서버가 없을 때 이 브라우저가 대신 기억한다.
 *
 * ★ 왜 로컬에도 두는가
 *   대화방 목록은 사이드바의 전부다. 서버가 없을 때 늘 비어 있으면,
 *   팀원이 clone 만 해서 켰을 때나 발표장에서 서버가 죽었을 때 화면에
 *   "기능이 없는 것"으로 보인다. 이야기 자체는 mock 이 이미 만들고
 *   있으므로, 그 결과를 남겨 두기만 하면 된다.
 *
 * ★ 서버가 붙으면 서버가 이긴다
 *   USING_API 가 켜지면 목록·삭제는 Django 의 /chat/sessions/ 를 쓴다.
 *   이 파일은 그때 읽히지 않는다. 두 벌을 동기화하려 들지 않는다 —
 *   맞추려는 순간 "어느 쪽이 진짜인가" 라는 질문이 영영 따라다닌다.
 *
 * ★ 메시지까지 통째로 남긴다
 *   제목만 남기면 이어보기가 "다시 처음부터" 가 된다. 지난 대화를 다시
 *   여는 것이 이 기능의 목적이므로 메시지가 함께 있어야 한다.
 */

import type { CounselMessage, CounselSeed } from '../data/types';

const STORAGE_KEY = 'eden.threads';

/** 브라우저에 남길 대화방 수 상한. */
const MAX_THREADS = 40;

export interface StoredThread {
  id: string;
  /** 목록에 보이는 이름. 첫 질문이나 구절에서 따온다. */
  title: string;
  /** 어느 은하와 이야기했는가. */
  personaId?: string;
  personaReason?: string;
  seed: CounselSeed;
  messages: CounselMessage[];
  createdAt: number;
  updatedAt: number;
}

/** 목록에만 필요한 만큼. 메시지 수백 개를 목록에 실어 나르지 않는다. */
export interface ThreadSummary {
  id: string;
  title: string;
  personaId?: string;
  updatedAt: number;
  /** 마지막으로 오간 말 한 토막. 목록에서 어느 대화인지 알아보게 한다. */
  preview: string;
}

/*
 * localStorage 접근을 감싼다.
 *
 * 사파리 프라이빗 모드나 저장소가 가득 찬 상황에서는 읽기·쓰기가 예외를
 * 던진다. 그 예외가 렌더 중에 터지면 화면 전체가 빈다 — 기억하지 못하는
 * 것은 불편할 뿐이지만, 화면이 사라지는 것은 고장이다.
 */
function safeRead(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeWrite(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* 기억하지 못할 뿐, 이번 대화는 그대로 흘러간다 */
  }
}

function isThread(value: unknown): value is StoredThread {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    Array.isArray(v.messages) &&
    typeof v.updatedAt === 'number'
  );
}

function readAll(): StoredThread[] {
  const raw = safeRead();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 예전 버전이 남긴 다른 모양일 수 있다. 모르는 모양은 없는 것으로 친다.
    return parsed.filter(isThread);
  } catch {
    return [];
  }
}

function writeAll(threads: StoredThread[]): void {
  /*
   * 최근 것부터 자른다.
   * 오래된 대화를 지우는 편이, 저장에 실패해 이번 대화까지 통째로
   * 사라지는 것보다 낫다.
   */
  const trimmed = [...threads]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS);
  safeWrite(JSON.stringify(trimmed));
}

/**
 * 목록. 최근에 이야기한 것이 위로 온다.
 *
 * 메시지가 하나도 없는 방은 빼고 준다 — 열었다가 아무 말도 안 하고 나간
 * 자리이고, 목록에 남으면 "빈 대화" 가 쌓이기만 한다.
 */
export function listThreads(): ThreadSummary[] {
  return readAll()
    .filter((t) => t.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((t) => ({
      id: t.id,
      title: t.title,
      personaId: t.personaId,
      updatedAt: t.updatedAt,
      preview: t.messages[t.messages.length - 1]?.text ?? '',
    }));
}

export function readThread(id: string): StoredThread | null {
  return readAll().find((t) => t.id === id) ?? null;
}

/** 대화방을 통째로 저장한다 (없으면 만들고, 있으면 덮는다). */
export function saveThread(thread: StoredThread): void {
  const rest = readAll().filter((t) => t.id !== thread.id);
  writeAll([...rest, thread]);
}

export function deleteThread(id: string): void {
  writeAll(readAll().filter((t) => t.id !== id));
}

/** 이 브라우저의 모든 대화방을 지운다. 탈퇴에서 쓴다. */
export function clearThreads(): void {
  safeWrite('[]');
}

/**
 * 목록에 보일 이름을 짓는다.
 *
 * ★ 사용자가 처음 한 말을 쓴다.
 *   "새로운 대화" 가 열 개 쌓이면 어느 것이 어느 것인지 알 수 없다.
 *   질문에서 시작했다면 그 질문이, 구절에서 시작했다면 그 구절이
 *   이 대화를 가장 잘 가리킨다.
 */
export function titleFor(seed: CounselSeed, firstUserText?: string): string {
  const source = seed.question?.trim() || firstUserText?.trim() || '';
  if (source) {
    const oneLine = source.replace(/\s+/g, ' ');
    return oneLine.length > 28 ? `${oneLine.slice(0, 28)}…` : oneLine;
  }
  return '새로운 대화';
}
