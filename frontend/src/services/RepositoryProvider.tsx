/*
 * services/RepositoryProvider.tsx
 * ───────────────────────────────────────────────────────────────────────
 * ★★ 백엔드 교체 지점 — 이 파일 한 곳이 mock ↔ 실제 API 를 가른다. ★★
 *
 * ★ 스위치는 환경변수다.
 *   VITE_API_BASE_URL 이 정의돼 있으면 Django 를, 아니면 mock 을 쓴다.
 *   코드를 고쳐서 전환하면 "지금 어느 쪽으로 빌드했는지"를 커밋 로그로만
 *   알 수 있게 된다. 환경변수로 두면 같은 코드가 개발·배포에서 각각
 *   맞는 쪽을 잡는다.
 *
 * ★ 빈 문자열은 "주소 없음" 이 아니라 "같은 도메인" 이다.
 *   nginx 가 프론트와 /api 를 함께 서빙하면 절대 주소가 필요 없으므로
 *   docker-compose.prod.yml 은 VITE_API_BASE_URL="" 로 빌드한다.
 *   이걸 Boolean() 으로 판정하면 "" 가 false 라 배포본이 통째로 mock 으로
 *   떨어진다 — 화면은 멀쩡히 뜨고 별 개수와 회원가입만 조용히 가짜가 된다.
 *   AWS 배포에서 실제로 겪었다.
 *
 * ★ 그래서 "mock 을 쓴다" 는 뜻은 따로 적는다.
 *   빈 문자열 하나에 "같은 도메인" 과 "백엔드 없음" 두 뜻이 실려 있던 것이
 *   위 사고의 원인이었다. 백엔드가 없다는 것은 값을 비우는 게 아니라
 *   MOCK 이라고 명시해서 말한다. 값이 아예 없을 때(로컬에서 .env.local 을
 *   만들지 않았을 때)도 mock 이다.
 *
 * ★ 테스트는 항상 mock 이다.
 *   vitest 환경에는 VITE_API_BASE_URL 이 없으므로 자동으로 mock 이 된다.
 *   네트워크에 기대는 테스트는 느리고 잘 깨진다.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { Repositories } from './repositories';
import { mockRepositories } from './mockRepositories';
import { httpRepositories } from './httpRepositories';

/**
 * VITE_API_BASE_URL 에 이 값을 넣으면 백엔드 없이 mock 으로 돈다.
 * vite.config.ts 의 test.env 와 문자열이 같아야 한다.
 */
export const MOCK_BACKEND = 'mock';

/** 실제 백엔드에 붙어 있는가. 화면이 "로그인이 필요한지"를 판단할 때도 쓴다. */
export const USING_API =
  typeof import.meta.env.VITE_API_BASE_URL === 'string' &&
  import.meta.env.VITE_API_BASE_URL !== MOCK_BACKEND;

const DEFAULT_REPOSITORIES: Repositories = USING_API ? httpRepositories : mockRepositories;

const RepositoryContext = createContext<Repositories>(DEFAULT_REPOSITORIES);

export function RepositoryProvider({
  children,
  value = DEFAULT_REPOSITORIES,
}: {
  children: ReactNode;
  /** 테스트에서 가짜 구현을 주입할 때 사용 */
  value?: Repositories;
}) {
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export function useRepositories(): Repositories {
  return useContext(RepositoryContext);
}
