/**
 * demoTexts.test.js
 * 目的：README の「まず試す」で使う架空の文面3通（demo/texts/）が、README に書いたとおりの候補・下書き・
 * 予定作成 URL になることを確かめる。文面や抽出の規則を変えて README と食い違ったら、ここで失敗させる。
 * 基準日時は発表日の 2026年10月16日(金) 10:00（東京）に固定する（「来週火曜」は 10/20 になる）。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatCandidateLabel } from '../src/core/candidateFormatter.js';
import { buildCalendarUrl } from '../src/core/calendarUrl.js';
import { DEFAULT_DURATION_MINUTES, extractDateCandidates } from '../src/core/dateExtractor.js';
import { extractEventDetails } from '../src/core/detailExtractor.js';
import { buildCalendarEvents } from '../src/core/registration.js';

/** デモの文面のフォルダ */
const DEMO_TEXT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'texts');

/** 発表日の 2026-10-16(金) 10:00 JST（= 01:00 UTC） */
const PRESENTATION_NOW = new Date('2026-10-16T01:00:00Z');

/**
 * デモの文面を読み、候補と下書きを返す。
 *
 * @param {string} fileName demo/texts の中のファイル名
 * @returns {Promise<{text: string, candidates: Array<object>, labels: string[], details: object}>}
 */
async function runDemo(fileName) {
  const text = await readFile(path.join(DEMO_TEXT_DIR, fileName), 'utf8');
  const { candidates } = extractDateCandidates(text, { now: PRESENTATION_NOW });
  return { text, candidates, labels: candidates.map(formatCandidateLabel), details: extractEventDetails(text) };
}

/**
 * 候補を選んで登録したときに開く予定作成 URL の、クエリの値を返す。
 *
 * @param {object} demo runDemo の結果
 * @param {number[]} indexes 選ぶ候補の番号
 * @param {object} details 入力欄の内容（下書きを直した後の値）
 * @returns {Array<Record<string, string>>}
 */
function openedQueries(demo, indexes, details) {
  const { events, errors } = buildCalendarEvents({
    candidates: demo.candidates,
    selectedIds: new Set(indexes.map((index) => demo.candidates[index].id)),
    timeChoices: {},
    details: { memo: '', includeSourceText: false, ...details },
    sourceText: demo.text,
    defaultDurationMinutes: DEFAULT_DURATION_MINUTES,
  });
  assert.deepEqual(errors, []);
  return events.map((event) => Object.fromEntries(new URL(buildCalendarUrl(event)).searchParams));
}

describe('デモ1：日本語のメール（見出し付き・Zoom・予備日）', () => {
  test('候補は 10/22 14:00〜15:30 と 10/29（日付だけ）。件名・場所・URL が下書きされる', async () => {
    const demo = await runDemo('1-mail-ja.txt');
    assert.deepEqual(demo.labels, ['2026年10月22日(木) 14:00〜15:30', '2026年10月29日(木)']);
    assert.equal(demo.candidates[1].hasTime, false);
    assert.deepEqual(demo.details, {
      title: '【架空】秋の社内勉強会のご案内',
      location: '本社3階 第一会議室',
      meetingUrl: 'https://zoom.us/j/0000000000?pwd=demo',
      isKnownMeetingService: true,
    });
  });

  test('2件とも選ぶと、時刻指定と終日の予定作成 URL が開く（場所があるので URL はメモへ）', async () => {
    const demo = await runDemo('1-mail-ja.txt');
    const [timed, allDay] = openedQueries(demo, [0, 1], demo.details);
    assert.equal(timed.text, '【架空】秋の社内勉強会のご案内');
    assert.equal(timed.dates, '20261022T140000/20261022T153000');
    assert.equal(timed.location, '本社3階 第一会議室');
    assert.ok(timed.details.includes('https://zoom.us/j/0000000000?pwd=demo'));
    assert.equal(timed.ctz, 'Asia/Tokyo');
    assert.equal(allDay.dates, '20261029/20261030');
  });
});

describe('デモ2：チャット（見出しなし・「来週火曜」・夜7時）', () => {
  test('候補は 10/20 15:00〜16:00（終了なし→60分）と 10/23 19:00〜20:00。件名などは空', async () => {
    const demo = await runDemo('2-chat-ja.txt');
    assert.deepEqual(demo.labels, ['2026年10月20日(火) 15:00〜16:00', '2026年10月23日(金) 19:00〜20:00']);
    assert.ok(demo.candidates.every((candidate) => candidate.endInferred));
    assert.equal(demo.details.title, '');
    assert.equal(demo.details.location, '');
    assert.equal(demo.details.meetingUrl, '');
  });

  test('件名を手で入れて1件目を登録すると、その件名で開く', async () => {
    const demo = await runDemo('2-chat-ja.txt');
    const [query] = openedQueries(demo, [0], { title: 'デモの打ち合わせ', location: '', meetingUrl: '' });
    assert.equal(query.text, 'デモの打ち合わせ');
    assert.equal(query.dates, '20261020T150000/20261020T160000');
  });
});

describe('デモ3：英語のメール（Subject・Venue・Google Meet）', () => {
  test('候補は 10/28 14:00〜15:00。件名・場所・URL が下書きされる', async () => {
    const demo = await runDemo('3-mail-en.txt');
    assert.deepEqual(demo.labels, ['2026年10月28日(水) 14:00〜15:00']);
    assert.deepEqual(demo.details, {
      title: '[Demo] Project Kickoff',
      location: 'Room 5B',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      isKnownMeetingService: true,
    });
    const [query] = openedQueries(demo, [0], demo.details);
    assert.equal(query.dates, '20261028T140000/20261028T150000');
  });
});
