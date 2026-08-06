/*
 * services/repositories.ts
 * ───────────────────────────────────────────────────────────────────────
 * 데이터 접근 인터페이스 (백엔드 교체 경계).
 *
 * 이 파일의 인터페이스만 지키면 mock ↔ 실제 API 를 무중단 교체할 수 있다.
 * 화면 코드는 절대 mock 모듈을 직접 import 하지 않고 이 타입에만 의존한다.
 */

import type { AskResult, CounselMessage, CounselSeed, VerseStar } from '../data/types';

export interface VerseRepository {
  /** 큐레이션된 탐색 가능 별 전체. */
  listStars(): Promise<VerseStar[]>;

  getStar(id: string): Promise<VerseStar | null>;

  /**
   * 질문 → 공감/묵상/추천 구절.
   *
   * @param attempt 같은 질문에 대한 재요청 횟수. 0이 최초.
   *   "다른 구절 보기"를 누를 때마다 1씩 증가하며 다른 결과를 준다.
   *
   * TODO(api): POST /api/chat/recommend
   *   요청  { message: string, emo_weight: number }
   *         → attempt 를 emo_weight 로 매핑한다.
   *           백엔드 주석에 "'다른 벗 추천' 반복 시 증가"로 이미 같은 개념이 있다.
   *   응답  RecommendResponse → AskResult
   *   참고  backend/app/api/chat_router.py, backend/app/models/schemas.py
   */
  ask(question: string, attempt?: number): Promise<AskResult>;
}

/**
 * 대화방이 열릴 때 함께 오는 것들.
 *
 * ★ 인물과 근거가 여기 있는 이유
 *   어느 은하와 이야기하는지는 대화방이 만들어지는 순간 정해진다.
 *   사용자가 고르지 않았다면 서버가 골라 준다. 화면이 그 결정을
 *   다시 계산하면 서버와 다른 답이 나올 수 있으므로, 열 때 받아 둔다.
 */
export interface CounselIntro {
  threadId: string;
  opening: CounselMessage;
  /** 어느 은하와 이야기하는가. 정해지지 않았으면 비어 있다. */
  personaId?: string;
  /**
   * 왜 이 인물인지 한 줄.
   *
   * 사용자가 직접 고른 대화에서는 비어 있다 — 자기가 누른 은하에
   * 이유를 붙이는 것은 군더더기다.
   */
  reason?: string;
}

export interface CounselRepository {
  /**
   * 상담 스레드 시작. 구절 문맥이 있으면 첫 안내 메시지에 반영된다.
   * TODO(api): 서버 세션 생성이 필요해지면 POST /api/chat/session 신설
   */
  startThread(seed: CounselSeed): Promise<CounselIntro>;

  /**
   * 사용자 발화 → 안내자 응답.
   * TODO(api): POST /api/chat/answer
   *   요청  { person_id, message, history }
   *   응답  ChatResponse → CounselMessage 로 매핑 필요
   */
  send(threadId: string, text: string, seed: CounselSeed): Promise<CounselMessage>;
}

export interface Repositories {
  verses: VerseRepository;
  counsel: CounselRepository;
}
