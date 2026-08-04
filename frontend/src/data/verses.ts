/*
 * data/verses.ts
 * ───────────────────────────────────────────────────────────────────────
 * 탐색 가능한 성경 구절 별 702개.
 *
 * 두 층으로 되어 있다.
 *   full  (40개)  — 이 파일의 SEEDS. 인용·스토리·묵상·추천 질문까지 갖춘다.
 *   brief (662개) — relatedVerses.ts. 출처와 자체 요약 한 줄만 갖는다.
 *
 * 하늘·픽킹·카메라 입장에서 둘은 똑같은 별이다. 차이는 열었을 때
 * 무엇이 나오느냐(depth)뿐이다.
 *
 * 콘텐츠 원칙:
 *  - 인용은 30자 내외의 짧은 구절만. 출처(번역본)를 항상 함께 표기한다.
 *  - summary/story/meditation 은 자체 서술이며 장문 인용을 대체한다.
 *  - meditation 은 단정적 신학 진술이 아니라 열린 초대의 문장으로 쓴다.
 *  - brief 에는 인용을 아예 넣지 않는다 (저작권 확인 없는 인용 수백 건 방지).
 *
 * 좌표는 데이터에 박지 않고 placeInGalaxy() 규칙으로 파생시킨다.
 * → 별이 늘어나도 좌표를 손으로 관리할 필요가 없다.
 *
 * ★ coord 는 "은하 로컬 좌표"다
 *   각 구절은 어느 제자의 은하에 속하고(disciples.ts), 그 은하 안에서의
 *   자리를 coord 로 갖는다. 화면 위치는 은하의 공전·자전·크기를 거쳐
 *   계산된다 (galaxy/system.ts). 그래서 서로 다른 은하의 두 구절이
 *   같은 coord 를 가질 수 있다 — 정상이다.
 */

import { isFullVerse } from './types';
import type { BriefVerseStar, FullVerseStar, ThemeTag, VerseStar } from './types';
import { placeInGalaxy } from '../galaxy/placement';
import { ALL_GALAXIES, galaxyOfVerse, verseIndexInGalaxy } from './disciples';
import { ALL_RELATED_VERSES } from './relatedVerses';

/*
 * 좌표와 소속 은하를 제외한 저작 데이터. 둘 다 파생된다.
 *
 * Omit 을 유니온에 그냥 걸면 공통 키만 남아 depth 판별이 무너지므로
 * 두 갈래를 각각 벗겨 다시 합친다.
 */
type FullSeed = Omit<FullVerseStar, 'coord' | 'discipleId'>;
type BriefSeed = Omit<BriefVerseStar, 'coord' | 'discipleId'>;
type VerseSeed = FullSeed | BriefSeed;

const KRV = '개역개정';

const SEEDS: FullSeed[] = [
  // ── 의미 / purpose ──────────────────────────────────────────────
  {
    id: 'gen-1-3',
    depth: 'full',
    ref: { bookCode: '창', bookName: '창세기', chapter: 1, verse: 3 },
    excerpt: '빛이 있으라 하시니 빛이 있었고',
    attribution: KRV,
    summary: '혼돈과 어둠뿐이던 자리에 가장 먼저 놓인 것은 빛이었습니다.',
    story:
      '창세기의 첫 장면은 형태도 질서도 없는 어둠에서 시작합니다. 그 위로 처음 울린 말이 빛을 불렀고, 이후의 모든 창조는 그 빛 위에서 이어집니다.',
    meditation: '지금 당신의 하루에서 가장 먼저 밝아졌으면 하는 자리는 어디인가요.',
    themes: ['purpose', 'hope'],
    motif: 'light',
    magnitude: 1,
    relatedPrompts: ['제 삶에 의미가 있을까요?', '아무것도 없는 것 같은 날이에요'],
  },
  {
    id: 'mic-6-8',
    depth: 'full',
    ref: { bookCode: '미', bookName: '미가', chapter: 6, verse: 8 },
    excerpt: '정의를 행하며 인자를 사랑하며 겸손하게 행하는 것',
    attribution: KRV,
    summary: '무엇을 드려야 하느냐는 물음에, 대단한 제물 대신 살아가는 방식이 답으로 주어집니다.',
    story:
      '미가 시대의 사람들은 무엇을 얼마나 바쳐야 인정받을지 계산하고 있었습니다. 돌아온 답은 규모가 아니라 태도였습니다.',
    meditation: '오늘 당신이 이미 하고 있는 작은 정직함은 무엇인가요.',
    themes: ['purpose'],
    motif: 'path',
    magnitude: 0.72,
    relatedPrompts: ['어떻게 살아야 할지 모르겠어요'],
  },
  {
    id: 'eph-2-10',
    depth: 'full',
    ref: { bookCode: '엡', bookName: '에베소서', chapter: 2, verse: 10 },
    excerpt: '우리는 그가 만드신 바라',
    attribution: KRV,
    summary: '존재의 근거를 성취가 아니라 만들어졌다는 사실에 둡니다.',
    story:
      '에베소 교회에는 출신도 배경도 제각각인 사람들이 섞여 있었습니다. 서로의 자격을 견주던 이들에게 같은 손에서 왔다는 말이 전해집니다.',
    meditation: '당신을 증명하지 않아도 되는 자리가 있다면 어디일까요.',
    themes: ['purpose', 'recovery'],
    motif: 'seed',
    magnitude: 0.78,
    relatedPrompts: ['제가 쓸모없게 느껴져요'],
  },
  {
    id: 'psa-119-105',
    depth: 'full',
    ref: { bookCode: '시', bookName: '시편', chapter: 119, verse: 105 },
    excerpt: '주의 말씀은 내 발에 등이요 내 길에 빛이니이다',
    attribution: KRV,
    summary: '멀리까지 비추는 조명이 아니라, 다음 한 걸음을 보여주는 등입니다.',
    story:
      '고대의 등불은 발 앞 한두 걸음만 밝혔습니다. 전 구간을 미리 볼 수는 없어도 걸을 수는 있었습니다.',
    meditation: '전부를 알지 못한 채로 내디딜 수 있는 한 걸음은 무엇인가요.',
    themes: ['purpose', 'career'],
    motif: 'path',
    magnitude: 0.85,
    relatedPrompts: ['앞이 안 보여요', '선택을 앞두고 있어요'],
  },

  // ── 희망 / hope ─────────────────────────────────────────────────
  {
    id: 'jer-29-11',
    depth: 'full',
    ref: { bookCode: '렘', bookName: '예레미야', chapter: 29, verse: 11 },
    excerpt: '너희를 향한 나의 생각은 평안이요',
    attribution: KRV,
    summary: '당장 상황이 바뀌지 않아도, 향하고 있는 방향이 있다고 말합니다.',
    story:
      '이 말은 편안한 시기가 아니라 포로로 끌려간 사람들에게 보낸 편지에 담겼습니다. 돌아가기까지 오랜 시간이 남아 있던 때였습니다.',
    meditation: '기다림이 길어질 때 당신을 붙잡아 주는 것은 무엇인가요.',
    themes: ['hope'],
    motif: 'dawn',
    magnitude: 0.92,
    relatedPrompts: ['앞으로 나아질까요?', '기다리는 게 너무 지쳐요'],
  },
  {
    id: 'lam-3-22',
    depth: 'full',
    ref: { bookCode: '애', bookName: '예레미야애가', chapter: 3, verse: 22 },
    excerpt: '그의 긍휼이 무궁하시므로',
    attribution: KRV,
    summary: '가장 어두운 애가 한가운데에 아침마다 새로워진다는 문장이 놓여 있습니다.',
    story:
      '예루살렘이 무너진 뒤 쓰인 이 노래는 대부분 탄식입니다. 그 탄식의 정중앙에서 시인은 아침을 언급합니다.',
    meditation: '오늘 아침 당신에게 다시 주어진 것은 무엇이었나요.',
    themes: ['hope', 'grief'],
    motif: 'dawn',
    magnitude: 0.74,
    relatedPrompts: ['다시 시작할 수 있을까요?'],
  },
  {
    id: 'isa-40-31',
    depth: 'full',
    ref: { bookCode: '사', bookName: '이사야', chapter: 40, verse: 31 },
    excerpt: '독수리가 날개치며 올라감 같을 것이요',
    attribution: KRV,
    summary: '힘을 쥐어짜는 것이 아니라, 새로 얻는 쪽을 말합니다.',
    story:
      '오래 걸어 지친 사람들에게 주어진 말입니다. 달리다 지치지 않는다는 표현 앞에는 기다린다는 조건이 먼저 놓여 있습니다.',
    meditation: '지금 당신이 억지로 버티고 있는 지점은 어디인가요.',
    themes: ['hope', 'recovery'],
    motif: 'wind',
    magnitude: 0.8,
    relatedPrompts: ['너무 지쳤어요'],
  },
  {
    id: 'rom-15-13',
    depth: 'full',
    ref: { bookCode: '롬', bookName: '로마서', chapter: 15, verse: 13 },
    excerpt: '소망의 하나님이 모든 기쁨과 평강을 충만하게 하사',
    attribution: KRV,
    summary: '소망을 사람이 만들어내는 감정이 아니라 받는 것으로 봅니다.',
    story:
      '배경이 다른 두 무리가 한 공동체에서 부딪히던 상황에서, 바울은 서로를 향한 인내를 말한 뒤 이 문장으로 편지를 맺습니다.',
    meditation: '오늘 당신에게 채워졌으면 하는 것은 기쁨인가요, 평온인가요.',
    themes: ['hope'],
    motif: 'light',
    magnitude: 0.66,
    relatedPrompts: ['마음이 메말랐어요'],
  },

  // ── 감사 / gratitude ────────────────────────────────────────────
  {
    id: '1th-5-18',
    depth: 'full',
    ref: { bookCode: '살전', bookName: '데살로니가전서', chapter: 5, verse: 18 },
    excerpt: '범사에 감사하라',
    attribution: KRV,
    summary: '모든 일이 좋다는 말이 아니라, 모든 상황 안에서라는 뜻에 가깝습니다.',
    story:
      '박해를 겪던 작은 공동체에 보낸 짧은 권면들 사이에 놓여 있습니다. 항상 기뻐하라, 쉬지 말고 기도하라와 나란히 있습니다.',
    meditation: '오늘 하루 중 그냥 지나쳤지만 다행이었던 순간이 있었나요.',
    themes: ['gratitude'],
    motif: 'light',
    magnitude: 0.68,
    relatedPrompts: ['감사한 일을 찾고 싶어요'],
  },
  {
    id: 'psa-103-2',
    depth: 'full',
    ref: { bookCode: '시', bookName: '시편', chapter: 103, verse: 2 },
    excerpt: '그의 모든 은택을 잊지 말지어다',
    attribution: KRV,
    summary: '기억하는 일을 의식적인 훈련으로 다룹니다.',
    story:
      '시인은 자기 자신에게 말을 겁니다. 내 영혼아, 하고 부르며 잊지 말라고 스스로를 설득합니다.',
    meditation: '잊고 지냈지만 다시 꺼내볼 만한 기억이 있나요.',
    themes: ['gratitude'],
    motif: 'water',
    magnitude: 0.6,
    relatedPrompts: ['좋았던 때가 기억나지 않아요'],
  },
  {
    id: 'psa-118-24',
    depth: 'full',
    ref: { bookCode: '시', bookName: '시편', chapter: 118, verse: 24 },
    excerpt: '이 날은 여호와께서 정하신 것이라',
    attribution: KRV,
    summary: '특별한 날이 아니라 오늘 이 날을 가리킵니다.',
    story:
      '이 노래는 절기의 행렬에서 함께 불렸습니다. 큰 위기를 지나온 뒤 부르는 감사의 노래입니다.',
    meditation: '오늘을 다르게 부를 수 있다면 어떤 이름을 붙이겠어요.',
    themes: ['gratitude', 'hope'],
    motif: 'dawn',
    magnitude: 0.62,
    relatedPrompts: ['평범한 하루가 무의미하게 느껴져요'],
  },

  // ── 회복 / recovery ─────────────────────────────────────────────
  {
    id: 'mat-11-28',
    depth: 'full',
    ref: { bookCode: '마', bookName: '마태복음', chapter: 11, verse: 28 },
    excerpt: '수고하고 무거운 짐 진 자들아 다 내게로 오라',
    attribution: KRV,
    summary: '짐을 내려놓으라는 요구가 아니라, 짐을 진 채로 오라는 초대입니다.',
    story:
      '지켜야 할 규범이 겹겹이 쌓여 숨 막히던 사람들에게 건네진 말입니다. 자격을 묻지 않고 상태만 부릅니다.',
    meditation: '지금 당신이 지고 있는 것 중 가장 무거운 것은 무엇인가요.',
    themes: ['recovery', 'anxiety'],
    motif: 'mountain',
    magnitude: 0.95,
    relatedPrompts: ['너무 지쳤어요', '쉬고 싶어요'],
  },
  {
    id: 'psa-23-3',
    depth: 'full',
    ref: { bookCode: '시', bookName: '시편', chapter: 23, verse: 3 },
    excerpt: '내 영혼을 소생시키시고',
    attribution: KRV,
    summary: '앞으로 밀기 전에 먼저 되살리는 순서를 말합니다.',
    story:
      '목자의 시선으로 쓰인 시입니다. 양이 지치면 목자는 재촉하지 않고 물가로 데려가 눕힙니다.',
    meditation: '당신이 회복되는 자리는 대체로 어디였나요.',
    themes: ['recovery'],
    motif: 'water',
    magnitude: 0.82,
    relatedPrompts: ['번아웃이 온 것 같아요'],
  },
  {
    id: 'isa-43-19',
    depth: 'full',
    ref: { bookCode: '사', bookName: '이사야', chapter: 43, verse: 19 },
    excerpt: '내가 광야에 길을 사막에 강을 내리니',
    attribution: KRV,
    summary: '길이 없다고 여겨지던 곳을 굳이 무대로 삼습니다.',
    story:
      '광야는 이 사람들에게 실패와 방황의 기억이 있는 장소였습니다. 그 장소가 새 길의 배경으로 다시 등장합니다.',
    meditation: '당신의 광야라 부를 만한 시간은 언제였나요.',
    themes: ['recovery', 'hope'],
    motif: 'wilderness',
    magnitude: 0.86,
    relatedPrompts: ['방법이 없어 보여요'],
  },
  {
    id: 'joe-2-25',
    depth: 'full',
    ref: { bookCode: '욜', bookName: '요엘', chapter: 2, verse: 25 },
    excerpt: '메뚜기가 먹은 햇수대로 갚아 주리니',
    attribution: KRV,
    summary: '잃어버린 시간 자체를 회복의 대상으로 셉니다.',
    story:
      '메뚜기 떼가 한 해 농사를 통째로 먹어치운 뒤였습니다. 잃은 것은 수확만이 아니라 그 세월이었습니다.',
    meditation: '당신이 잃었다고 느끼는 시간은 어느 구간인가요.',
    themes: ['recovery', 'grief'],
    motif: 'seed',
    magnitude: 0.64,
    relatedPrompts: ['시간을 낭비한 것 같아요'],
  },

  // ── 관계 / relationship ─────────────────────────────────────────
  {
    id: 'eph-4-32',
    depth: 'full',
    ref: { bookCode: '엡', bookName: '에베소서', chapter: 4, verse: 32 },
    excerpt: '서로 친절하게 하며 불쌍히 여기며',
    attribution: KRV,
    summary: '감정이 정리된 다음이 아니라, 태도부터 먼저 놓습니다.',
    story:
      '한 공동체 안에서 말로 서로를 상하게 하던 상황을 배경으로 합니다. 앞 문장은 분을 품은 채 해가 지지 않게 하라는 권면입니다.',
    meditation: '지금 떠오르는 그 사람에게 건넬 수 있는 가장 작은 친절은 무엇일까요.',
    themes: ['relationship', 'forgiveness'],
    motif: 'water',
    magnitude: 0.7,
    relatedPrompts: ['사람 때문에 힘들어요'],
  },
  {
    id: 'rom-12-18',
    depth: 'full',
    ref: { bookCode: '롬', bookName: '로마서', chapter: 12, verse: 18 },
    excerpt: '할 수 있거든 모든 사람과 더불어 화목하라',
    attribution: KRV,
    summary: '할 수 있거든이라는 단서를 붙여, 혼자 감당할 수 없는 관계도 인정합니다.',
    story:
      '바울은 이상적인 명령을 내리다가 현실의 한계를 문장 안에 함께 적어 둡니다. 상대의 몫까지 떠안으라고 하지 않습니다.',
    meditation: '당신이 할 수 있는 몫과 상대의 몫을 나눈다면 어디가 경계일까요.',
    themes: ['relationship'],
    motif: 'path',
    magnitude: 0.66,
    relatedPrompts: ['관계를 회복하고 싶어요', '갈등이 반복돼요'],
  },
  {
    id: 'pro-17-17',
    depth: 'full',
    ref: { bookCode: '잠', bookName: '잠언', chapter: 17, verse: 17 },
    excerpt: '친구는 사랑이 끊어지지 아니하고',
    attribution: KRV,
    summary: '좋을 때가 아니라 어려울 때를 기준으로 관계를 봅니다.',
    story: '잠언은 일상의 관찰을 짧게 눌러 담은 모음입니다. 이 문장도 이론이 아니라 목격담에 가깝습니다.',
    meditation: '어려울 때 연락할 수 있는 사람의 이름이 떠오르나요.',
    themes: ['relationship', 'loneliness'],
    motif: 'light',
    magnitude: 0.58,
    relatedPrompts: ['진짜 친구가 없는 것 같아요'],
  },

  // ── 용서 / forgiveness ──────────────────────────────────────────
  {
    id: 'mat-6-14',
    depth: 'full',
    ref: { bookCode: '마', bookName: '마태복음', chapter: 6, verse: 14 },
    excerpt: '너희가 사람의 잘못을 용서하면',
    attribution: KRV,
    summary: '용서를 받는 일과 하는 일을 하나로 묶어 봅니다.',
    story: '기도를 가르치는 대목 바로 뒤에 붙어 있습니다. 기도문 안에도 같은 구조가 이미 들어 있습니다.',
    meditation: '용서가 아직 어렵다면, 그 어려움 자체를 말해보는 것부터 어떨까요.',
    themes: ['forgiveness'],
    motif: 'water',
    magnitude: 0.68,
    relatedPrompts: ['용서가 안 돼요'],
  },
  {
    id: 'col-3-13',
    depth: 'full',
    ref: { bookCode: '골', bookName: '골로새서', chapter: 3, verse: 13 },
    excerpt: '누가 누구에게 불만이 있거든 서로 용납하여',
    attribution: KRV,
    summary: '불만이 있다는 전제를 지우지 않고 그대로 둡니다.',
    story:
      '함께 지내는 사람들 사이에 마찰이 없을 수 없다는 전제 위에서 쓰인 권면입니다. 감정을 없애라고 하지 않습니다.',
    meditation: '지금 품고 있는 서운함에 이름을 붙인다면 무엇일까요.',
    themes: ['forgiveness', 'relationship'],
    motif: 'wind',
    magnitude: 0.56,
    relatedPrompts: ['서운한 마음이 안 풀려요'],
  },
  {
    id: 'luk-23-34',
    depth: 'full',
    ref: { bookCode: '눅', bookName: '누가복음', chapter: 23, verse: 34 },
    excerpt: '아버지 저들을 사하여 주옵소서',
    attribution: KRV,
    summary: '가장 정당하게 분노할 수 있는 자리에서 나온 말입니다.',
    story:
      '십자가 위에서 남긴 말 중 하나로 전해집니다. 상황이 정리된 뒤가 아니라 한가운데에서 나왔습니다.',
    meditation: '이 문장을 지금 당신의 상황에 옮겨 놓기 어렵다면, 그 이유는 무엇인가요.',
    themes: ['forgiveness'],
    motif: 'light',
    magnitude: 0.76,
    relatedPrompts: ['억울한 일을 당했어요'],
  },

  // ── 죄책감 / guilt ──────────────────────────────────────────────
  {
    id: '1jn-1-9',
    depth: 'full',
    ref: { bookCode: '요일', bookName: '요한1서', chapter: 1, verse: 9 },
    excerpt: '만일 우리가 우리 죄를 자백하면',
    attribution: KRV,
    summary: '숨기는 대신 말하는 쪽을 길로 제시합니다.',
    story: '초기 공동체 안에서 잘못을 감추는 일이 문제가 되던 때에 쓰인 편지입니다.',
    meditation: '입 밖에 내지 못하고 있는 문장이 있다면 무엇인가요.',
    themes: ['guilt'],
    motif: 'water',
    magnitude: 0.6,
    relatedPrompts: ['후회되는 일이 있어요'],
  },
  {
    id: 'psa-51-10',
    depth: 'full',
    ref: { bookCode: '시', bookName: '시편', chapter: 51, verse: 10 },
    excerpt: '하나님이여 내 속에 정한 마음을 창조하시고',
    attribution: KRV,
    summary: '고치는 것이 아니라 새로 만들어 달라고 청합니다.',
    story:
      '큰 잘못이 드러난 뒤에 쓰인 것으로 전해지는 시입니다. 변명이 거의 없고 요청만 남아 있습니다.',
    meditation: '다시 시작한다면 어디서부터 다시 하고 싶은가요.',
    themes: ['guilt', 'recovery'],
    motif: 'seed',
    magnitude: 0.66,
    relatedPrompts: ['스스로가 미워요'],
  },
  {
    id: 'rom-8-1',
    depth: 'full',
    ref: { bookCode: '롬', bookName: '로마서', chapter: 8, verse: 1 },
    excerpt: '결코 정죄함이 없나니',
    attribution: KRV,
    summary: '판결이 이미 끝났다는 전제에서 이야기를 다시 시작합니다.',
    story:
      '앞 장에서 바울은 원하는 것을 하지 못하는 자신에 대해 길게 씁니다. 그 막다른 문장 바로 다음에 이 말이 놓입니다.',
    meditation: '당신이 당신에게 내리고 있는 판결문이 있다면 어떤 내용인가요.',
    themes: ['guilt'],
    motif: 'dawn',
    magnitude: 0.72,
    relatedPrompts: ['자책이 멈추지 않아요'],
  },

  // ── 슬픔 / grief ────────────────────────────────────────────────
  {
    id: 'psa-34-18',
    depth: 'full',
    ref: { bookCode: '시', bookName: '시편', chapter: 34, verse: 18 },
    excerpt: '여호와는 마음이 상한 자를 가까이 하시고',
    attribution: KRV,
    summary: '멀리서 해결하는 대신 가까이 오는 쪽을 말합니다.',
    story: '쫓기던 시기에 쓰인 것으로 전해지는 시입니다. 구조보다 곁에 있음이 먼저 나옵니다.',
    meditation: '지금 당신 곁에 그냥 있어 주었으면 하는 사람이 있나요.',
    themes: ['grief'],
    motif: 'water',
    magnitude: 0.88,
    relatedPrompts: ['너무 슬퍼요', '마음이 무너졌어요'],
  },
  {
    id: 'rev-21-4',
    depth: 'full',
    ref: { bookCode: '계', bookName: '요한계시록', chapter: 21, verse: 4 },
    excerpt: '모든 눈물을 그 눈에서 닦아 주시니',
    attribution: KRV,
    summary: '눈물이 없던 것으로 되는 게 아니라, 닦인다고 말합니다.',
    story: '박해 속에 있던 공동체에게 보낸 마지막 환상 장면입니다. 울음이 있었다는 사실은 지워지지 않습니다.',
    meditation: '누군가 닦아 주었으면 하는 눈물이 있다면 어떤 것인가요.',
    themes: ['grief', 'hope'],
    motif: 'dawn',
    magnitude: 0.7,
    relatedPrompts: ['상실을 겪었어요'],
  },
  {
    id: 'jhn-11-35',
    depth: 'full',
    ref: { bookCode: '요', bookName: '요한복음', chapter: 11, verse: 35 },
    excerpt: '예수께서 눈물을 흘리시더라',
    attribution: KRV,
    summary: '성경에서 가장 짧은 절 중 하나이며, 설명 없이 우는 장면만 남습니다.',
    story:
      '곧 상황이 달라질 것을 알고 있는 자리였습니다. 그런데도 먼저 한 일은 함께 우는 것이었습니다.',
    meditation: '슬픔을 빨리 정리하지 않아도 괜찮다면, 지금 무엇을 하고 싶은가요.',
    themes: ['grief'],
    motif: 'water',
    magnitude: 0.64,
    relatedPrompts: ['울고 싶은데 울지 못하겠어요'],
  },

  // ── 외로움 / loneliness ─────────────────────────────────────────
  {
    id: 'deu-31-6',
    depth: 'full',
    ref: { bookCode: '신', bookName: '신명기', chapter: 31, verse: 6 },
    excerpt: '그가 너를 떠나지 아니하시며 버리지 아니하시리라',
    attribution: KRV,
    summary: '함께 있겠다는 약속을 떠남과 버림이라는 두 단어로 못 박습니다.',
    story:
      '광야 세대가 지도자 없이 새 땅으로 들어가야 하던 전환점에서 주어진 말입니다. 불안이 가장 컸을 시점입니다.',
    meditation: '혼자라고 느끼는 순간은 주로 하루 중 언제인가요.',
    themes: ['loneliness', 'fear'],
    motif: 'wilderness',
    magnitude: 0.78,
    relatedPrompts: ['혼자인 것 같아요'],
  },
  {
    id: 'psa-139-7',
    depth: 'full',
    ref: { bookCode: '시', bookName: '시편', chapter: 139, verse: 7 },
    excerpt: '내가 주의 영을 떠나 어디로 가리이까',
    attribution: KRV,
    summary: '숨을 곳을 찾다가 결국 어디에도 없다는 것을 알게 되는 시입니다.',
    story:
      '시인은 하늘 끝과 바다 끝을 차례로 상상합니다. 도망의 목록이 곧 동행의 목록이 됩니다.',
    meditation: '누구에게도 보이고 싶지 않은 부분이 있다면 무엇인가요.',
    themes: ['loneliness'],
    motif: 'wind',
    magnitude: 0.62,
    relatedPrompts: ['아무도 저를 모르는 것 같아요'],
  },
  {
    id: 'mat-28-20',
    depth: 'full',
    ref: { bookCode: '마', bookName: '마태복음', chapter: 28, verse: 20 },
    excerpt: '내가 세상 끝날까지 너희와 항상 함께 있으리라',
    attribution: KRV,
    summary: '떠나는 장면의 마지막 말이 함께 있겠다는 약속입니다.',
    story: '이 문장은 마태복음의 마지막 절입니다. 이야기가 끝나는 자리에서 시간이 열려 있습니다.',
    meditation: '항상이라는 말을 오늘의 언어로 바꾼다면 어떤 문장이 될까요.',
    themes: ['loneliness', 'hope'],
    motif: 'light',
    magnitude: 0.74,
    relatedPrompts: ['버려진 기분이에요'],
  },

  // ── 불안 / anxiety ──────────────────────────────────────────────
  {
    id: 'php-4-6',
    depth: 'full',
    ref: { bookCode: '빌', bookName: '빌립보서', chapter: 4, verse: 6 },
    excerpt: '아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로',
    attribution: KRV,
    summary: '염려를 없애라기보다, 염려를 옮겨 놓을 자리를 제시합니다.',
    story: '감옥에서 쓰인 것으로 전해지는 편지입니다. 상황이 안전해서 나온 말이 아닙니다.',
    meditation: '지금 머릿속을 가장 많이 차지하고 있는 문장은 무엇인가요.',
    themes: ['anxiety'],
    motif: 'wind',
    magnitude: 0.9,
    relatedPrompts: ['불안해서 잠이 안 와요', '걱정이 멈추지 않아요'],
  },
  {
    id: '1pe-5-7',
    depth: 'full',
    ref: { bookCode: '벧전', bookName: '베드로전서', chapter: 5, verse: 7 },
    excerpt: '너희 염려를 다 주께 맡기라',
    attribution: KRV,
    summary: '일부가 아니라 다라고 적혀 있습니다.',
    story: '흩어져 살던 이들에게 보낸 편지입니다. 각자 감당하던 불안을 혼자 지지 말라고 말합니다.',
    meditation: '내려놓기 가장 어려운 염려 하나를 고른다면 무엇인가요.',
    themes: ['anxiety'],
    motif: 'water',
    magnitude: 0.72,
    relatedPrompts: ['생각이 너무 많아요'],
  },
  {
    id: 'mat-6-34',
    depth: 'full',
    ref: { bookCode: '마', bookName: '마태복음', chapter: 6, verse: 34 },
    excerpt: '내일 일을 위하여 염려하지 말라',
    attribution: KRV,
    summary: '오늘의 몫만 오늘 감당하자는 제안에 가깝습니다.',
    story:
      '들꽃과 새를 가리키며 이어진 이야기의 결론부입니다. 계획을 금지하는 말이 아니라 무게를 나누는 말입니다.',
    meditation: '오늘 안에 끝낼 수 있는 일 하나만 고른다면 무엇인가요.',
    themes: ['anxiety'],
    motif: 'seed',
    magnitude: 0.68,
    relatedPrompts: ['미래가 두려워요'],
  },
  {
    id: 'psa-55-22',
    depth: 'full',
    ref: { bookCode: '시', bookName: '시편', chapter: 55, verse: 22 },
    excerpt: '네 짐을 여호와께 맡기라',
    attribution: KRV,
    summary: '짐이 있다는 사실을 부정하지 않고 옮길 곳을 말합니다.',
    story: '가까운 사람에게 배신당한 정황에서 쓰인 시로 읽힙니다. 분노와 탄식이 함께 들어 있습니다.',
    meditation: '지금 당신의 짐에 무게를 매긴다면 무엇이 가장 무거운가요.',
    themes: ['anxiety', 'relationship'],
    motif: 'mountain',
    magnitude: 0.6,
    relatedPrompts: ['믿었던 사람에게 상처받았어요'],
  },

  // ── 두려움 / fear ───────────────────────────────────────────────
  {
    id: 'isa-41-10',
    depth: 'full',
    ref: { bookCode: '사', bookName: '이사야', chapter: 41, verse: 10 },
    excerpt: '두려워하지 말라 내가 너와 함께 함이라',
    attribution: KRV,
    summary: '두려워하지 말라는 말 뒤에 곧바로 이유가 붙습니다.',
    story:
      '주변 강대국의 압박이 커지던 시기에 주어진 말입니다. 위협이 사라졌다는 통보가 아니라 동행의 통보입니다.',
    meditation: '함께 있어 준다면 견딜 만해지는 상황이 있다면 어떤 것인가요.',
    themes: ['fear'],
    motif: 'light',
    magnitude: 0.9,
    relatedPrompts: ['두려운 일이 있어요'],
  },
  {
    id: 'psa-23-4',
    depth: 'full',
    ref: { bookCode: '시', bookName: '시편', chapter: 23, verse: 4 },
    excerpt: '사망의 음침한 골짜기로 다닐지라도',
    attribution: KRV,
    summary: '골짜기를 피해 가는 것이 아니라 통과한다고 적혀 있습니다.',
    story: '목자의 시 한가운데 있는 절입니다. 앞뒤로는 푸른 풀밭과 상이 차려진 장면이 놓여 있습니다.',
    meditation: '지금 지나는 중인 골짜기의 이름을 붙인다면 무엇일까요.',
    themes: ['fear', 'grief'],
    motif: 'path',
    magnitude: 0.84,
    relatedPrompts: ['앞이 캄캄해요'],
  },
  {
    id: '2ti-1-7',
    depth: 'full',
    ref: { bookCode: '딤후', bookName: '디모데후서', chapter: 1, verse: 7 },
    excerpt: '두려워하는 마음을 주지 아니하시고',
    attribution: KRV,
    summary: '두려움이 당신의 본래 성질이 아니라고 말합니다.',
    story: '젊은 동역자에게 보낸 개인적인 편지입니다. 상대가 위축되어 있던 정황이 문장에 배어 있습니다.',
    meditation: '두려움을 잠시 옆에 두면, 그 아래에는 무엇이 있나요.',
    themes: ['fear', 'purpose'],
    motif: 'wind',
    magnitude: 0.62,
    relatedPrompts: ['자신이 없어요'],
  },

  // ── 진로 / career ───────────────────────────────────────────────
  {
    id: 'pro-3-5',
    depth: 'full',
    ref: { bookCode: '잠', bookName: '잠언', chapter: 3, verse: 5 },
    excerpt: '너는 마음을 다하여 여호와를 신뢰하고',
    attribution: KRV,
    summary: '판단을 멈추라는 뜻이라기보다, 판단의 근거를 넓히라는 쪽에 가깝습니다.',
    story: '잠언은 젊은 사람에게 건네는 조언의 형식을 띱니다. 실용적인 문장들 사이에 놓여 있습니다.',
    meditation: '결정을 앞두고 당신이 가장 크게 의지하는 것은 무엇인가요.',
    themes: ['career'],
    motif: 'path',
    magnitude: 0.8,
    relatedPrompts: ['진로를 고민 중이에요'],
  },
  {
    id: 'psa-37-5',
    depth: 'full',
    ref: { bookCode: '시', bookName: '시편', chapter: 37, verse: 5 },
    excerpt: '네 길을 여호와께 맡기라',
    attribution: KRV,
    summary: '길을 포기하라는 말이 아니라 맡기라는 말입니다.',
    story: '남들이 더 잘되는 것처럼 보일 때의 조급함을 다루는 시입니다.',
    meditation: '비교를 잠시 멈춘다면, 당신이 정말 하고 싶은 일은 무엇인가요.',
    themes: ['career', 'anxiety'],
    motif: 'path',
    magnitude: 0.64,
    relatedPrompts: ['남들과 비교하게 돼요'],
  },
  {
    id: 'pro-16-9',
    depth: 'full',
    ref: { bookCode: '잠', bookName: '잠언', chapter: 16, verse: 9 },
    excerpt: '사람이 마음으로 자기의 길을 계획할지라도',
    attribution: KRV,
    summary: '계획을 세우는 일과 걸음이 인도되는 일을 동시에 인정합니다.',
    story: '계획 자체를 부정하지 않는다는 점에서, 자주 오해되는 문장이기도 합니다.',
    meditation: '계획대로 되지 않았던 일 중, 지나고 보니 다행이었던 것이 있나요.',
    themes: ['career', 'purpose'],
    motif: 'mountain',
    magnitude: 0.58,
    relatedPrompts: ['계획대로 되지 않아요'],
  },
];

/**
 * 연관 구절(brief)의 밝기.
 *
 * 큐레이션 별보다 확실히 어둡게 둔다. 전부 같은 밝기로 그리면 하늘은
 * 꽉 차지만 "어느 별에 이야기가 있는지"가 사라진다.
 * 순번으로 조금씩 흔들어야 균일한 점묘처럼 보이지 않는다.
 */
function briefMagnitude(index: number): number {
  return 0.26 + ((index * 7) % 11) / 11 * 0.16;
}

/** 연관 구절 → 별. 상세 필드가 없는 대신 요약 한 줄을 갖는다. */
const BRIEF_SEEDS: BriefSeed[] = ALL_RELATED_VERSES.map((v, index) => ({
  id: v.id,
  depth: 'brief',
  ref: { bookCode: v.bookCode, bookName: v.bookName, chapter: v.chapter, verse: v.verse },
  summary: v.summary,
  themes: v.themes,
  motif: v.motif,
  magnitude: briefMagnitude(index),
}));

/**
 * 소속 은하와 그 안에서의 순번으로 로컬 좌표를 파생시킨다.
 *
 * 배정표(disciples.ts)에 없는 구절이 있으면 화면에 그려질 곳이 없다.
 * 조용히 사라지면 찾기 어려우므로 중심 은하로 보내고 테스트가 잡게 한다.
 */
function withPlacement(seeds: VerseSeed[]): VerseStar[] {
  return seeds.map((seed) => {
    const galaxy = galaxyOfVerse(seed.id) ?? ALL_GALAXIES[0];
    const index = verseIndexInGalaxy(seed.id);
    // 은하 순번을 함께 넘겨 13개가 같은 무늬로 복제되지 않게 한다.
    const galaxyIndex = ALL_GALAXIES.indexOf(galaxy);
    return {
      ...seed,
      discipleId: galaxy.id,
      coord: placeInGalaxy(index, galaxy.verseIds.length, galaxyIndex),
    } as VerseStar;
  });
}

/**
 * 탐색 가능한 별 전체 = 큐레이션 40개 + 연관 구절 480개.
 *
 * 두 층을 한 배열에 두는 이유: 하늘·픽킹·카메라 입장에서 둘은 똑같은 별이다.
 * 차이는 열었을 때 무엇이 나오느냐(depth)뿐이다.
 */
export const VERSE_STARS: readonly VerseStar[] = withPlacement([...SEEDS, ...BRIEF_SEEDS]);

/** 상세 콘텐츠를 갖춘 별만. 답변 추천과 추천 질문은 여기서만 뽑는다. */
export const FULL_VERSE_STARS: readonly FullVerseStar[] = VERSE_STARS.filter(isFullVerse);

const BY_ID = new Map(VERSE_STARS.map((s) => [s.id, s]));

/**
 * 은하 순서로 정렬한 목록 (중심 → 12제자).
 * 목록 UI 는 이 순서를 쓴다 — 저작 순서대로 두면 은하가 뒤섞여
 * "어느 은하의 별인가"라는 정보가 읽히지 않는다.
 */
export const VERSE_STARS_BY_GALAXY: readonly VerseStar[] = ALL_GALAXIES.flatMap((galaxy) =>
  galaxy.verseIds
    .map((id) => BY_ID.get(id))
    .filter((s): s is VerseStar => Boolean(s)),
);

export function getVerseStar(id: string): VerseStar | undefined {
  return BY_ID.get(id);
}

export function getVerseStarsByTheme(theme: ThemeTag): VerseStar[] {
  return VERSE_STARS.filter((s) => s.themes.includes(theme));
}

/** 이 은하에 속한 구절들 */
export function getVerseStarsByGalaxy(galaxyId: string): VerseStar[] {
  return VERSE_STARS.filter((s) => s.discipleId === galaxyId);
}

/** 표시용 참조 문자열. 예: "시편 23:4" */
export function formatRef(star: VerseStar): string {
  return `${star.ref.bookName} ${star.ref.chapter}:${star.ref.verse}`;
}
