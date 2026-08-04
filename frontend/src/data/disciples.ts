/*
 * data/disciples.ts
 * ───────────────────────────────────────────────────────────────────────
 * 은하계의 구성.
 *
 *   중심   — 예수 그리스도의 은하
 *   둘레   — 12제자의 은하 12개가 타원 고리를 이루며 공전한다
 *
 * 인물 정보는 backend/app/services/mock_data.py 의 PEOPLE 과 같은 값을 쓴다.
 * 백엔드가 붙으면 이 파일은 API 응답으로 대체된다.
 *
 * ★ 주제(ThemeTag)와 제자는 다른 축이다
 *   주제는 "사용자의 질문이 무엇에 관한 것인가"이고,
 *   제자는 "그 구절이 어느 은하에 속하는가"다.
 *   둘 다 12개라서 헷갈리기 쉽지만 절대 섞으면 안 된다 —
 *   주제는 답변 매칭 로직이, 제자는 화면 배치가 쓴다.
 *
 * ★ 색 원칙
 *   프로젝트의 흑백 절제 기조를 깨지 않도록, 제자 색은 "성운 사진에서
 *   보이는 정도"의 낮은 채도로만 쓴다. 원색을 쓰면 즉시 촌스러워진다.
 *   중심(예수)만은 색을 주지 않고 기존 은백/온백을 유지한다 — 색이 없는
 *   것이 오히려 중심으로 읽힌다.
 */

import { RELATED_VERSES } from './relatedVerses';
import { NEUTRAL_TINT } from '../galaxy/palette';
import type { MbtiType } from './mbti';

export { NEUTRAL_TINT };

export interface DiscipleGalaxy {
  id: string;
  /** 표시 이름 */
  name: string;
  /** 한 줄 역할 (mock_data.PEOPLE.role) */
  role: string;
  /**
   * 인물의 MBTI (mock_data.PEOPLE.mbti 와 같은 값).
   * 사용자가 고른 유형과의 궁합을 재는 데 쓴다 — data/mbti.ts 참조.
   */
  mbti: MbtiType;
  /**
   * 은하의 기준 색.
   * null 이면 색을 입히지 않고 기본 은백 램프를 쓴다 (중심 은하).
   */
  tint: string | null;
  /**
   * 상세 콘텐츠(스토리·묵상)를 갖춘 큐레이션 구절.
   * 답변 추천은 이 별들만 가리킨다.
   */
  coreVerseIds: readonly string[];
  /**
   * 이 은하의 전체 구절 = core + 연관 구절.
   * 배치와 조회는 항상 이 목록을 쓴다.
   */
  verseIds: readonly string[];
}

/** coreVerseIds 만 적어 두고, 연관 구절은 relatedVerses.ts 에서 붙인다. */
type GalaxySeed = Omit<DiscipleGalaxy, 'verseIds'>;

function withRelated(seed: GalaxySeed): DiscipleGalaxy {
  const related = RELATED_VERSES[seed.id] ?? [];
  return { ...seed, verseIds: [...seed.coreVerseIds, ...related.map((v) => v.id)] };
}

/**
 * 중심 은하 — 예수 그리스도.
 * 창조의 첫 빛과, 복음서에서 예수가 직접 건넨 말들을 모았다.
 */
export const CENTER_GALAXY: DiscipleGalaxy = withRelated({
  id: 'jesus',
  name: '예수 그리스도',
  role: '선한 목자',
  mbti: 'INFJ',
  tint: null,
  coreVerseIds: [
    'gen-1-3',
    'mat-11-28',
    'mat-28-20',
    'mat-6-34',
    'mat-6-14',
    'jhn-11-35',
    'luk-23-34',
  ],
});

/**
 * 둘레를 도는 12제자의 은하.
 *
 * 구절 배정 기준:
 *   1) 그 제자와 연결된 성경 책이 있으면 우선 (베드로 → 베드로전서)
 *   2) 없으면 인물의 성격과 구절의 결이 맞는 쪽으로
 * 배정은 데이터일 뿐이므로, 다르게 보시면 이 배열만 고치면 된다.
 */
export const DISCIPLE_GALAXIES: readonly DiscipleGalaxy[] = ([
  {
    id: 'peter',
    name: '베드로',
    role: '반석',
    mbti: 'ESFP',
    // 따뜻한 모래빛 — 열정과 회복
    tint: '#d9a68a',
    coreVerseIds: ['1pe-5-7', 'isa-41-10', 'psa-23-4'],
  },
  {
    id: 'john',
    name: '요한',
    role: '사랑받는 제자',
    mbti: 'INFP',
    // 연보라 — 사랑과 깊은 묵상
    tint: '#c9b6dd',
    coreVerseIds: ['psa-34-18', 'rev-21-4', 'pro-17-17'],
  },
  {
    id: 'james',
    name: '야고보',
    role: '천둥의 아들',
    mbti: 'ENTJ',
    // 붉은 기운 — 신념과 추진력
    tint: '#d99a9a',
    coreVerseIds: ['psa-55-22', '2ti-1-7', 'col-3-13'],
  },
  {
    id: 'andrew',
    name: '안드레',
    role: '연결자',
    mbti: 'ISFJ',
    // 청록 — 조용한 섬김
    tint: '#a8c4c0',
    coreVerseIds: ['deu-31-6', 'psa-139-7', 'eph-4-32'],
  },
  {
    id: 'philip',
    name: '빌립',
    role: '확인하는 자',
    mbti: 'ISTJ',
    // 푸른 회색 — 현실적이고 신중한
    tint: '#b9c2d8',
    coreVerseIds: ['pro-3-5', 'psa-119-105', 'pro-16-9'],
  },
  {
    id: 'bartholomew',
    name: '바돌로매',
    role: '참된 자',
    mbti: 'ISTJ',
    // 담황 — 정직과 원칙
    tint: '#cfc7a8',
    coreVerseIds: ['1jn-1-9', 'rom-8-1', 'psa-51-10'],
  },
  {
    id: 'matthew',
    name: '마태',
    role: '기록하는 자',
    mbti: 'INTJ',
    // 차분한 청 — 분석과 기록
    tint: '#a9bcd4',
    coreVerseIds: ['eph-2-10', 'joe-2-25', 'psa-103-2'],
  },
  {
    id: 'thomas',
    name: '도마',
    role: '묻는 자',
    mbti: 'INTP',
    // 회청 — 의심에서 확신으로
    tint: '#b0b8c8',
    coreVerseIds: ['isa-40-31', 'rom-15-13', 'rom-12-18'],
  },
  {
    id: 'james_alph',
    name: '작은 야고보',
    role: '조용한 증인',
    mbti: 'ISFJ',
    // 연녹 — 드러나지 않는 충성
    tint: '#bcc9b4',
    coreVerseIds: ['mic-6-8', '1th-5-18'],
  },
  {
    id: 'thaddaeus',
    name: '다대오',
    role: '질문하는 자',
    mbti: 'ENFP',
    // 밝은 베이지 — 질문과 공동체
    tint: '#d3bfa0',
    coreVerseIds: ['jer-29-11', 'lam-3-22'],
  },
  {
    id: 'simon',
    name: '시몬',
    role: '열심당원',
    mbti: 'ESTP',
    // 황토 — 뜨거운 신념
    tint: '#d8b48c',
    coreVerseIds: ['php-4-6', 'isa-43-19', 'psa-23-3'],
  },
  {
    id: 'judas',
    name: '가룟 유다',
    role: '회계',
    mbti: 'ENTJ',
    // 탁한 회색 — 계산과 후회. 다른 은하보다 어둡게 남는다.
    tint: '#9aa0ab',
    coreVerseIds: ['psa-118-24', 'psa-37-5'],
  },
] as GalaxySeed[]).map(withRelated);

/** 중심 + 둘레 전체. 화면에 그려지는 은하의 목록이다. */
export const ALL_GALAXIES: readonly DiscipleGalaxy[] = [CENTER_GALAXY, ...DISCIPLE_GALAXIES];

const GALAXY_BY_ID = new Map(ALL_GALAXIES.map((g) => [g.id, g]));

/** 구절 id → 그 구절이 속한 은하 */
const GALAXY_BY_VERSE = new Map<string, DiscipleGalaxy>();
for (const galaxy of ALL_GALAXIES) {
  for (const verseId of galaxy.verseIds) {
    GALAXY_BY_VERSE.set(verseId, galaxy);
  }
}

export function getGalaxy(id: string): DiscipleGalaxy | undefined {
  return GALAXY_BY_ID.get(id);
}

export function galaxyOfVerse(verseId: string): DiscipleGalaxy | undefined {
  return GALAXY_BY_VERSE.get(verseId);
}

/**
 * 화면에 쓰는 은하 이름.
 * "누구의 은하"는 소유가 아니라 길찾기 표지다 — 그 인물과 이어지는 구절이
 * 모여 있는 자리라는 뜻으로 쓴다.
 */
export function galaxyLabel(galaxy: DiscipleGalaxy): string {
  return `${galaxy.name}의 은하`;
}

export function galaxySwatch(galaxy: DiscipleGalaxy): string {
  return galaxy.tint ?? NEUTRAL_TINT;
}

/** 은하 안에서 이 구절이 몇 번째인가 — 로컬 좌표를 정하는 데 쓴다. */
export function verseIndexInGalaxy(verseId: string): number {
  const galaxy = GALAXY_BY_VERSE.get(verseId);
  if (!galaxy) return 0;
  return galaxy.verseIds.indexOf(verseId);
}
