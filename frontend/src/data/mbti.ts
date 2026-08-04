/*
 * data/mbti.ts
 * ───────────────────────────────────────────────────────────────────────
 * MBTI 궁합.
 *
 * ★ 값은 백엔드에서 그대로 가져왔다.
 *   backend/app/services/mock_data.py 의 TYPE_ORDER / SCORES 와 동일하며,
 *   그쪽은 다시 팀의 neo4j_seed.py 를 따른다. 프런트에서 임의로 계산하면
 *   서버가 붙는 순간 두 화면이 서로 다른 궁합을 말하게 된다.
 *   숫자를 고쳐야 한다면 백엔드부터 고치고 여기로 옮겨 오는 순서다.
 *
 * ★ 궁합은 "재미"의 축이다.
 *   사람의 성격을 단정하거나, 어떤 유형이 어떤 인물보다 낫다고 말하지 않는다.
 *   화면에서도 "이 은하들이 지금 당신의 결과 가깝습니다" 정도로만 쓴다.
 */

/** 16유형. SCORES 각 행의 열 순서가 이 배열과 같다. */
export const MBTI_TYPES = [
  'INFJ', 'INFP', 'INTJ', 'INTP',
  'ENFJ', 'ENFP', 'ENTJ', 'ENTP',
  'ISFJ', 'ISFP', 'ISTJ', 'ISTP',
  'ESFJ', 'ESFP', 'ESTJ', 'ESTP',
] as const;

export type MbtiType = (typeof MBTI_TYPES)[number];

/**
 * 궁합 점수 행렬 (0..100).
 * SCORES[a][MBTI_TYPES.indexOf(b)] 가 a 와 b 의 점수다. 대칭 행렬이다.
 */
const SCORES: Record<MbtiType, readonly number[]> = {
  INFJ: [72, 92, 78, 85, 92, 100, 85, 98, 49, 56, 42, 49, 56, 63, 49, 56],
  INFP: [92, 72, 85, 78, 100, 92, 98, 85, 56, 49, 49, 42, 63, 56, 56, 49],
  INTJ: [78, 85, 72, 92, 85, 98, 92, 100, 42, 49, 49, 56, 49, 56, 56, 63],
  INTP: [85, 78, 92, 72, 98, 85, 100, 92, 49, 42, 56, 49, 56, 49, 63, 56],
  ENFJ: [92, 100, 85, 98, 72, 92, 78, 85, 56, 63, 49, 56, 49, 56, 42, 49],
  ENFP: [100, 92, 98, 85, 92, 72, 85, 78, 63, 56, 56, 49, 56, 49, 49, 42],
  ENTJ: [85, 98, 92, 100, 78, 85, 72, 92, 49, 56, 56, 63, 42, 49, 49, 56],
  ENTP: [98, 85, 100, 92, 85, 78, 92, 72, 56, 49, 63, 56, 49, 42, 56, 49],
  ISFJ: [49, 56, 42, 49, 56, 63, 49, 56, 72, 92, 78, 85, 92, 100, 85, 98],
  ISFP: [56, 49, 49, 42, 63, 56, 56, 49, 92, 72, 85, 78, 100, 92, 98, 85],
  ISTJ: [42, 49, 49, 56, 49, 56, 56, 63, 78, 85, 72, 92, 85, 98, 92, 100],
  ISTP: [49, 42, 56, 49, 56, 49, 63, 56, 85, 78, 92, 72, 98, 85, 100, 92],
  ESFJ: [56, 63, 49, 56, 49, 56, 42, 49, 92, 100, 85, 98, 72, 92, 78, 85],
  ESFP: [63, 56, 56, 49, 56, 49, 49, 42, 100, 92, 98, 85, 92, 72, 85, 78],
  ESTJ: [49, 56, 56, 63, 42, 49, 49, 56, 85, 98, 92, 100, 78, 85, 72, 92],
  ESTP: [56, 49, 63, 56, 49, 42, 56, 49, 98, 85, 100, 92, 85, 78, 92, 72],
};

/** 값이 이 아래면 "가까운 결"로 보지 않는다. */
export const AFFINITY_THRESHOLD = 85;

export function isMbtiType(value: string): value is MbtiType {
  return (MBTI_TYPES as readonly string[]).includes(value);
}

/**
 * 두 유형의 궁합 점수.
 * 모르는 값이 들어오면 중립(50)을 준다 — 없는 관계를 좋게도 나쁘게도 만들지 않는다.
 */
export function compatScore(a: string, b: string): number {
  if (!isMbtiType(a) || !isMbtiType(b)) return 50;
  return SCORES[a][MBTI_TYPES.indexOf(b)];
}

/** 이 유형과 결이 가까운가. */
export function isAffinity(user: string, other: string): boolean {
  return compatScore(user, other) >= AFFINITY_THRESHOLD;
}
