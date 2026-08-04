/*
 * data/intents.ts
 * ───────────────────────────────────────────────────────────────────────
 * 질문 의도 사전.
 *
 * 원본: backend/app/services/emotion.py 의 _KEYWORDS (감정 7종)
 * 확장: 주제 12종 + 매칭 실패(fallback) + 안전 분기(crisis)
 *
 * ★ 백엔드 연동 시 이 사전은 서버 감정 추론으로 대체된다.
 *   단, crisis 판정만은 클라이언트에도 남겨 네트워크 실패 시에도
 *   안전 안내가 뜨도록 한다.
 */

import type { ThemeTag } from './types';

export const THEME_LABELS: Record<ThemeTag, string> = {
  anxiety: '불안',
  grief: '슬픔',
  loneliness: '외로움',
  relationship: '관계',
  career: '진로',
  fear: '두려움',
  forgiveness: '용서',
  guilt: '죄책감',
  hope: '희망',
  gratitude: '감사',
  recovery: '회복',
  purpose: '의미',
};

/**
 * 주제별 키워드. 부분 문자열 매칭이므로 어간 위주로 짧게 둔다.
 * (한국어 활용형을 전부 나열하지 않기 위함 — "지치", "지쳐" 같은 형태만)
 */
export const THEME_KEYWORDS: Record<ThemeTag, readonly string[]> = {
  anxiety: ['불안', '걱정', '초조', '막막', '긴장', '조마', '떨려', '생각이 많'],
  grief: ['슬프', '슬퍼', '우울', '눈물', '울고', '공허', '상실', '떠나보', '허무'],
  loneliness: ['외로', '혼자', '아무도', '소외', '고립', '쓸쓸', '단절'],
  relationship: ['친구', '가족', '갈등', '오해', '서운', '싸웠', '사람 때문', '동료', '연인'],
  career: ['진로', '직장', '취업', '이직', '방향', '갈림길', '전공', '커리어', '퇴사'],
  fear: ['두렵', '두려', '무서', '겁', '감당', '자신이 없', '실패할'],
  forgiveness: ['용서', '미워', '원망', '화해', '앙금', '괘씸'],
  guilt: ['죄책', '미안', '후회', '부끄', '자책', '잘못했'],
  hope: ['희망', '바라', '나아질', '다시 시작', '기대', '소망'],
  gratitude: ['감사', '고마', '기쁘', '행복', '뿌듯', '다행'],
  recovery: ['회복', '지치', '지쳐', '번아웃', '버티', '견디', '쉬고', '힘들'],
  purpose: ['의미', '왜 사', '이유', '소명', '목적', '쓸모', '살아야 할'],
};

/**
 * 위기 신호. 이 키워드가 잡히면 일반 답변 대신 안내 상태로 분기한다.
 * 오탐(false positive)이 과탐지보다 낫다는 전제로 넓게 잡는다.
 */
export const CRISIS_KEYWORDS: readonly string[] = [
  '자살',
  '죽고 싶',
  '죽고싶',
  '살기 싫',
  '살기싫',
  '자해',
  '사라지고 싶',
  '없어지고 싶',
  '끝내고 싶',
  '해치고 싶',
  '학대',
  '맞았어',
  '때려',
];

/** 주제 매칭 우선순위. 앞에 있을수록 먼저 판정된다. */
export const THEME_PRIORITY: readonly ThemeTag[] = [
  'grief',
  'loneliness',
  'anxiety',
  'fear',
  'guilt',
  'forgiveness',
  'recovery',
  'relationship',
  'career',
  'purpose',
  'gratitude',
  'hope',
];
