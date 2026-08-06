/*
 * data/types.ts
 * ───────────────────────────────────────────────────────────────────────
 * 전 도메인 타입의 단일 소스.
 *
 * ★ 백엔드 연동 시점 정렬 대상: backend/app/models/schemas.py
 *   - Verse         ↔ VerseRef + excerpt
 *   - ChatResponse  ↔ CounselMessage
 *   - RecommendResponse ↔ AskResult
 *   차이 나는 필드는 docs/mock-boundaries.md 에 마이그레이션 표로 기록한다.
 */

/** 사용자 질문에서 추론되는 주제/의도. emotion.py 키워드 사전을 확장한 12종. */
export type ThemeTag =
  | 'anxiety' // 불안
  | 'grief' // 슬픔
  | 'loneliness' // 외로움
  | 'relationship' // 관계
  | 'career' // 진로
  | 'fear' // 두려움
  | 'forgiveness' // 용서
  | 'guilt' // 죄책감
  | 'hope' // 희망
  | 'gratitude' // 감사
  | 'recovery' // 회복
  | 'purpose'; // 의미

/** 매칭 결과 종류. 12개 주제 + 매칭 실패 + 안전 분기. */
export type ResolvedIntent = ThemeTag | 'fallback' | 'crisis';

/**
 * 구절 상세 화면의 짧은 추상 연출 키워드.
 * 성경의 상징을 추상적으로만 쓴다 — 인물 형상이나 진부한 종교 그래픽 금지.
 */
export type VisualMotif =
  | 'light' // 빛
  | 'water' // 물결
  | 'wilderness' // 광야
  | 'dawn' // 새벽빛
  | 'path' // 길
  | 'seed' // 씨앗
  | 'mountain' // 산
  | 'wind'; // 바람

export interface VerseRef {
  /** data/bible_structured.json 의 `book` 과 동일한 축약 코드. 예: "창" */
  bookCode: string;
  /** 표시용 전체 이름. 예: "창세기" */
  bookName: string;
  chapter: number;
  verse: number;
}

/** 은하 좌표. 각 축 -1..1 로 정규화되어 화면 크기와 무관하다. */
export interface GalaxyCoord {
  x: number;
  y: number;
  /** 깊이. 카메라 시차(parallax)와 크기 감쇠에 쓰인다. */
  z: number;
}

/**
 * 구절 별의 콘텐츠 깊이.
 *
 *   full  — 스토리·묵상·추천 질문까지 갖춘 큐레이션 구절. 답변 추천의 대상이다.
 *   brief — 은하를 채우는 연관 구절. 출처와 자체 요약 한 줄만 갖는다.
 *
 * ★ brief 에 본문 인용을 넣지 않는 것은 의도적이다.
 *   번역본 저작권을 확인할 수 없는 인용을 수백 건 싣지 않기 위해서다.
 *   실제 본문은 백엔드 연동 시 정식 번역본 API 로 채운다
 *   (docs/mock-boundaries.md 5절).
 */
export type VerseDepth = 'full' | 'brief';

/** 모든 구절 별이 공유하는 부분 — 하늘에 그려지고 클릭되는 데 필요한 최소치. */
interface VerseStarBase {
  /** 안정적 슬러그. 예: "gen-1-3" — URL과 카메라 타깃 키로 쓰인다. */
  id: string;
  ref: VerseRef;
  /** 자체 요약. brief 에서는 이것이 유일한 본문 설명이다. */
  summary: string;
  themes: ThemeTag[];
  motif: VisualMotif;
  /** 이 구절이 속한 은하 (data/disciples.ts 의 id) */
  discipleId: string;
  /**
   * 은하 안에서의 위치 (로컬 좌표).
   * 화면 위치는 은하의 공전·자전·크기를 거쳐 계산된다 (galaxy/system.ts).
   */
  coord: GalaxyCoord;
  /** 0..1 — 밝기와 반경에 함께 반영된다. */
  magnitude: number;
}

/** 상세 콘텐츠를 갖춘 큐레이션 구절. 답변 추천은 이 별들만 가리킨다. */
export interface FullVerseStar extends VerseStarBase {
  depth: 'full';
  /** 30자 내외 짧은 인용. 장문 인용은 저작권상 사용하지 않는다. */
  excerpt: string;
  /** 출처 표기 (번역본). 인용 시 항상 함께 노출한다. */
  attribution: string;
  /** 배경 스토리 2~3문장. */
  story: string;
  /** 묵상 포인트 1문장. 단정적 신학 진술을 피한다. */
  meditation: string;
  /** 이 별로 이어지는 추천 질문. 홈/상세에서 노출된다. */
  relatedPrompts: string[];
}

/** 은하를 채우는 연관 구절. 출처 + 한 줄 요약만 갖는다. */
export interface BriefVerseStar extends VerseStarBase {
  depth: 'brief';
}

/**
 * 은하수의 별 하나 = 성경 구절 하나.
 * 큐레이션 별(상세 콘텐츠 보유)과 배경 별(좌표만 보유)이 같은 개념을 공유하되,
 * 배경 별은 BackdropStar 로 분리해 메모리를 아낀다.
 */
export type VerseStar = FullVerseStar | BriefVerseStar;

/** depth 판별 헬퍼. 타입 가드라 이걸 통과하면 상세 필드에 안전하게 접근한다. */
export function isFullVerse(star: VerseStar): star is FullVerseStar {
  return star.depth === 'full';
}

/**
 * 배경 별. 실제 성경 31,077절의 분포를 반영하되 본문은 담지 않는다.
 * (저작권 + 번들 용량 문제를 동시에 회피)
 */
export interface BackdropStar {
  /** bible_structured.json 의 book 코드. 별이 어느 책에 속하는지 추적 가능. */
  bookCode: string;
  coord: GalaxyCoord;
  magnitude: number;
}

/** 질문 1건에 대한 mock 응답. */
/**
 * 검색이 고른 구절 하나. 화면 목록에 없어도 카드를 그릴 수 있을 만큼만 담는다.
 *
 * VerseStar 를 그대로 쓰지 않는 이유는, 성경전서 구절에는 좌표·모티프·묵상이
 * 없기 때문이다. 없는 것을 빈 값으로 채워 보내면 화면이 "데이터가 빠졌다" 로
 * 읽는다.
 */
export interface AskVerse {
  id: string;
  /** "요한복음 3:16" 처럼 사람이 읽는 출처 */
  ref: string;
  content: string;
  /** 어느 은하에 속하는가. 비어 있을 수 있다. */
  galaxyId: string;
}

export interface AskResult {
  /** 원 질문 — 새로고침/공유 시 복원에 쓰인다. */
  question: string;
  intent: ResolvedIntent;
  /** 사용자 감정을 먼저 받아주는 문장. */
  empathy: string;
  /** 짧은 묵상/안내. 조언이 아니라 초대의 톤. */
  reflection: string;
  /** 추천 구절 2~3개의 VerseStar.id */
  verseIds: string[];
  /**
   * 검색이 고른 구절의 내용.
   *
   * ★ 왜 id 만으로 부족한가
   *   화면의 별 목록에는 은하당 150절만 올라간다. 서버의 벡터 검색은
   *   31,077절 전체에서 고르므로, 목록에 없는 구절이 오면 카드가 빈 채로
   *   뜬다. 내용을 함께 받으면 그 제약이 사라진다.
   *
   * ★ 없을 수 있다
   *   서버가 예전 방식(주제 표)으로 물러섰거나 mock 으로 도는 경우다.
   *   그때는 verseIds 가 큐레이션 702절을 가리키므로 목록에서 찾으면 된다.
   */
  verses?: AskVerse[];
  /** 이어서 던져볼 만한 질문. */
  followUps: string[];
  /**
   * 이 고민을 들어 줄 인물의 은하.
   *
   * ★ 구절만으로는 갈 곳이 없다.
   *   추천 구절 셋을 받아도 사용자는 520개 별 앞에 그대로 남는다.
   *   "어느 은하로 가면 되는지"가 있어야 화면이 이어진다.
   */
  galaxyId?: string;
  /** 왜 그 은하인지 한 줄. */
  galaxyReason?: string;
}

export type CounselRole = 'user' | 'guide';

export interface CounselMessage {
  id: string;
  role: CounselRole;
  text: string;
  /** 이 메시지가 근거로 삼은 구절. */
  verseId?: string;
  /**
   * 'safety' 는 위기 신호에 대한 안내다.
   * 일반 말풍선이 아니라 안전 안내 UI로 렌더된다.
   */
  kind?: 'safety';
  createdAt: number;
}

export interface CounselThread {
  id: string;
  /** 대화를 시작시킨 문맥. 구절에서 왔는지 질문에서 왔는지. */
  seed: CounselSeed;
  messages: CounselMessage[];
}

export interface CounselSeed {
  verseId?: string;
  question?: string;
  /**
   * 답변 화면에서 이미 정해진 인물.
   *
   * ★ 여기 없으면 서버가 다시 고른다.
   *   그 자체는 문제가 없지만, 답변 화면에 "요한의 은하"라고 써 두고
   *   대화에서 마태가 나오면 사용자는 무엇을 믿어야 할지 모르게 된다.
   *   한 번 정해진 사람은 화면을 넘어가도 같은 사람이어야 한다.
   */
  galaxyId?: string;
}

/** 렌더링 품질 티어. quality.ts 가 자동 결정하고 사용자가 고정할 수도 있다. */
export type QualityTier = 'high' | 'medium' | 'low' | 'still';

export interface QualityProfile {
  tier: QualityTier;
  /** 배경 별 개수 (실제 구절에 대응) */
  backdropCount: number;
  /** 성운 먼지 개수 (장식 전용, 구절과 무관) */
  dustCount: number;
  /** 성운 안개 렌더 여부 */
  haze: boolean;
  /** 글로우 렌더 여부 */
  glow: boolean;
  /** 시차 스트리킹 여부 */
  streaks: boolean;
  /** 은하 자전 여부 */
  rotate: boolean;
}

/** 앱 전역 단계. 라우트와 별개로 "지금 무엇이 벌어지는가"를 표현한다. */
export type AppPhase =
  | 'intro'
  | 'home'
  | 'answering'
  | 'answered'
  | 'traveling'
  | 'verseDetail'
  | 'counsel';
