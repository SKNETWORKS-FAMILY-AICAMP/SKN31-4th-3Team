/*
 * scripts/generateBackdrop.mjs
 * ───────────────────────────────────────────────────────────────────────
 * data/bible_structured.json (31,077절) 을 훑어 "책별 절 수 분포"만 추출한다.
 *
 * 본문 텍스트는 절대 산출물에 포함하지 않는다.
 *  - 저작권: 번역본 장문을 번들에 넣지 않기 위함
 *  - 용량:   31,077절 원문은 약 4MB. 분포표는 1KB 미만
 *
 * 실행: npm run gen:backdrop
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, '../../data/bible_structured.json');
const TARGET = resolve(here, '../src/data/backdropSeed.ts');

const verses = JSON.parse(readFileSync(SOURCE, 'utf8'));

const counts = new Map();
for (const v of verses) {
  counts.set(v.book, (counts.get(v.book) ?? 0) + 1);
}

// 정경 순서를 보존하기 위해 최초 등장 순서를 그대로 쓴다.
const order = [];
const seen = new Set();
for (const v of verses) {
  if (!seen.has(v.book)) {
    seen.add(v.book);
    order.push(v.book);
  }
}

const rows = order.map((book) => `  ['${book}', ${counts.get(book)}],`).join('\n');
const total = verses.length;

writeFileSync(
  TARGET,
  `/*
 * data/backdropSeed.ts — 자동 생성 파일. 직접 수정하지 마세요.
 * 생성: npm run gen:backdrop  (scripts/generateBackdrop.mjs)
 *
 * data/bible_structured.json 의 책별 절 수 분포입니다.
 * 본문 텍스트는 포함하지 않으며, 배경 별의 분포를 실제 성경 구조에
 * 맞추는 용도로만 씁니다.
 */

/** 전체 절 수 */
export const TOTAL_VERSES = ${total};

/** [책 코드, 절 수] — 정경 순서 */
export const BOOK_VERSE_COUNTS: readonly (readonly [string, number])[] = [
${rows}
];
`,
  'utf8',
);

console.log(`generated ${TARGET}`);
console.log(`books=${order.length} totalVerses=${total}`);
