/*
 * server/scripts/export_seed.mjs
 * ───────────────────────────────────────────────────────────────────────
 * 프런트가 저작한 도메인 데이터를 서버 시드(JSON)로 뽑아낸다.
 *
 * ★ 손으로 옮기지 않는다.
 *   구절 702개, 은하 13개, 주제 사전, 응답 variant 를 사람이 베끼면
 *   반드시 어긋난다. 이미 타입 검사와 테스트를 통과한 프런트 데이터를
 *   그대로 읽어 JSON 으로 떨어뜨리고, Django 는 그 JSON 만 적재한다.
 *
 * ★ 좌표는 뽑지 않는다.
 *   화면 좌표는 galaxy/placement.ts 가 "은하 안 순번"에서 파생시킨다.
 *   서버가 좌표를 들고 있으면 배치 규칙을 고칠 때마다 DB 를 다시 써야 한다.
 *   서버는 순번(order)까지만 책임진다.
 *
 * 실행: node server/scripts/export_seed.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../frontend/src');
const out = resolve(here, '../scripture/fixtures');

const { ALL_GALAXIES } = await import(`${src}/data/disciples.ts`);
const { VERSE_STARS } = await import(`${src}/data/verses.ts`);
const { THEME_LABELS, THEME_KEYWORDS, CRISIS_KEYWORDS } = await import(`${src}/data/intents.ts`);
const { ANSWER_VARIANTS } = await import(`${src}/data/answers.ts`);

mkdirSync(out, { recursive: true });

const galaxies = ALL_GALAXIES.map((g, order) => ({
  id: g.id,
  name: g.name,
  role: g.role,
  mbti: g.mbti,
  tint: g.tint,
  is_center: g.tint === null,
  order,
}));

const verses = VERSE_STARS.map((s) => {
  const galaxy = ALL_GALAXIES.find((g) => g.id === s.discipleId);
  return {
    id: s.id,
    galaxy_id: s.discipleId,
    order: galaxy.verseIds.indexOf(s.id),
    book_code: s.ref.bookCode,
    book_name: s.ref.bookName,
    chapter: s.ref.chapter,
    verse: s.ref.verse,
    depth: s.depth,
    summary: s.summary,
    themes: s.themes,
    motif: s.motif,
    magnitude: s.magnitude,
    excerpt: s.depth === 'full' ? s.excerpt : '',
    attribution: s.depth === 'full' ? s.attribution : '',
    story: s.depth === 'full' ? s.story : '',
    meditation: s.depth === 'full' ? s.meditation : '',
    related_prompts: s.depth === 'full' ? s.relatedPrompts : [],
  };
});

const write = (name, data) => {
  writeFileSync(resolve(out, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`${name.padEnd(20)} ${Array.isArray(data) ? data.length : Object.keys(data).length}건`);
};

write('galaxies.json', galaxies);
write('verses.json', verses);
write('intents.json', {
  labels: THEME_LABELS,
  keywords: THEME_KEYWORDS,
  crisis: CRISIS_KEYWORDS,
});
write('answers.json', ANSWER_VARIANTS);
