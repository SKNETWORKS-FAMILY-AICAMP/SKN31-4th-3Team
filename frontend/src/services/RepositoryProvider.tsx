/*
 * services/RepositoryProvider.tsx
 * ───────────────────────────────────────────────────────────────────────
 * ★★ 백엔드 교체 지점 — 이 파일 한 곳이 mock ↔ 실제 API 를 가른다. ★★
 *
 * ★ 스위치는 환경변수다.
 *   VITE_API_BASE_URL 이 있으면 Django 를, 없으면 mock 을 쓴다.
 *   코드를 고쳐서 전환하면 "지금 어느 쪽으로 빌드했는지"를 커밋 로그로만
 *   알 수 있게 된다. 환경변수로 두면 같은 코드가 개발·배포에서 각각
 *   맞는 쪽을 잡는다.
 *
 * ★ 테스트는 항상 mock 이다.
 *   vitest 환경에는 VITE_API_BASE_URL 이 없으므로 자동으로 mock 이 된다.
 *   네트워크에 기대는 테스트는 느리고 잘 깨진다.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { Repositories } from './repositories';
import { mockRepositories } from './mockRepositories';
import { httpRepositories } from './httpRepositories';

/** 실제 백엔드에 붙어 있는가. 화면이 "로그인이 필요한지"를 판단할 때도 쓴다. */
export const USING_API = Boolean(import.meta.env.VITE_API_BASE_URL);

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
