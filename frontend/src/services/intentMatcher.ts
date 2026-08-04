/*
 * services/intentMatcher.ts
 * ───────────────────────────────────────────────────────────────────────
 * 질문 → 의도 판정.
 *
 * 순서:
 *   1) 위기 신호 검사 (최우선. 다른 어떤 매칭보다 앞선다)
 *   2) 주제 키워드 점수 합산
 *   3) 점수 0 이면 fallback
 *
 * ★ 백엔드 연동 시 2~3은 서버 감정 추론으로 대체하되, 1은 클라이언트에
 *   반드시 남긴다 (네트워크 실패 시에도 안전 안내가 떠야 하므로).
 */

import type { ResolvedIntent, ThemeTag } from '../data/types';
import { CRISIS_KEYWORDS, THEME_KEYWORDS, THEME_PRIORITY } from '../data/intents';

export interface IntentMatch {
  intent: ResolvedIntent;
  /** 매칭된 키워드 — 디버깅과 테스트용 */
  matchedKeywords: string[];
  /** 0..1 신뢰도. fallback 은 0. */
  confidence: number;
}

export function isCrisis(question: string): boolean {
  const text = normalize(question);
  return CRISIS_KEYWORDS.some((kw) => text.includes(normalize(kw)));
}

export function matchIntent(question: string): IntentMatch {
  const text = normalize(question);

  if (!text) {
    return { intent: 'fallback', matchedKeywords: [], confidence: 0 };
  }

  // 1) 안전 최우선
  const crisisHits = CRISIS_KEYWORDS.filter((kw) => text.includes(normalize(kw)));
  if (crisisHits.length > 0) {
    return { intent: 'crisis', matchedKeywords: crisisHits, confidence: 1 };
  }

  // 2) 주제 점수
  let best: { theme: ThemeTag; hits: string[] } | null = null;
  for (const theme of THEME_PRIORITY) {
    const hits = THEME_KEYWORDS[theme].filter((kw) => text.includes(normalize(kw)));
    if (hits.length === 0) continue;
    // 동점이면 THEME_PRIORITY 순서상 먼저 나온 쪽이 이긴다.
    if (!best || hits.length > best.hits.length) {
      best = { theme, hits };
    }
  }

  if (!best) {
    return { intent: 'fallback', matchedKeywords: [], confidence: 0 };
  }

  return {
    intent: best.theme,
    matchedKeywords: best.hits,
    // 키워드 1개=0.55, 2개=0.75, 3개 이상=0.9 로 완만히 오른다.
    confidence: Math.min(0.9, 0.35 + best.hits.length * 0.2),
  };
}

/** 공백/대소문자 정규화. 한국어라 소문자화는 사실상 무해하다. */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}
