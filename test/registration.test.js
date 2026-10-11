/**
 * registration.test.js
 * 目的：登録内容の組み立て（src/core/registration.js）を確かめる。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { WARNING_PAST, extractDateCandidates } from '../src/core/dateExtractor.js';
import {
  END_CHOICE_ALL_DAY,
  END_DURATION_CHOICES,
  MAX_END_DURATION_MINUTES,
  SOURCE_TEXT_EXCERPT_LENGTH,
  buildCalendarEvents,
  composeEventTexts,
  createDefaultTimeChoice,
  createManualCandidate,
  parseDateInput,
  parseTimeInput,
} from '../src/core/registration.js';

/** テストの基準日時：2026-10-11(日) 10:00 JST */
const NOW = new Date('2026-10-11T01:00:00Z');

/** 入力欄の内容（初期値） */
function emptyDetails(overrides = {}) {
  return { title: '', location: '', meetingUrl: '', memo: '', includeSourceText: false, ...overrides };
}

/** 架空の文面から候補を作る */
function candidatesOf(text) {
  return extractDateCandidates(text, { now: NOW }).candidates;
}

describe('入力欄の値の読み取り', () => {
  test('parseTimeInput：HH:MM', () => {
    assert.deepEqual(parseTimeInput('09:30'), { hour: 9, minute: 30 });
    assert.equal(parseTimeInput(''), null);
    assert.equal(parseTimeInput('24:00'), null);
    assert.equal(parseTimeInput('9:30'), null);
  });

  test('parseDateInput：YYYY-MM-DD（実在する日付だけ）', () => {
    assert.deepEqual(parseDateInput('2026-10-20'), { year: 2026, month: 10, day: 20 });
    assert.equal(parseDateInput('2026-02-30'), null);
    assert.equal(parseDateInput(''), null);
  });
});

describe('createManualCandidate：手入力の候補', () => {
  test('日付だけの候補になり、ID は manual- で始まる', () => {
    const candidate = createManualCandidate({ year: 2026, month: 10, day: 20 }, 1, NOW);
    assert.equal(candidate.id, 'manual-1');
    assert.equal(candidate.hasTime, false);
    assert.equal(candidate.isManual, true);
    assert.deepEqual(candidate.warnings, []);
  });

  test('過去の日付には警告を付ける', () => {
    assert.deepEqual(createManualCandidate({ year: 2026, month: 10, day: 1 }, 2, NOW).warnings, [WARNING_PAST]);
  });
});

describe('composeEventTexts：場所・会議 URL・メモの振り分け', () => {
  test('場所が空なら、会議 URL を「場所」に入れる', () => {
    const texts = composeEventTexts(emptyDetails({ meetingUrl: 'https://zoom.us/j/1' }), '');
    assert.equal(texts.location, 'https://zoom.us/j/1');
    assert.equal(texts.details, '');
  });

  test('場所があれば、会議 URL はメモの先頭に入れる', () => {
    const texts = composeEventTexts(
      emptyDetails({ location: '会議室A', meetingUrl: 'https://zoom.us/j/1', memo: '資料持参' }),
      '',
    );
    assert.equal(texts.location, '会議室A');
    assert.equal(texts.details, 'オンライン会議：https://zoom.us/j/1\n\n資料持参');
  });

  test('元の文章は選んだときだけ、抜粋をメモに入れる', () => {
    const source = 'あ'.repeat(SOURCE_TEXT_EXCERPT_LENGTH + 100);
    assert.equal(composeEventTexts(emptyDetails(), source).details, '');
    const included = composeEventTexts(emptyDetails({ includeSourceText: true }), source).details;
    assert.ok(included.startsWith('--- 元の文章 ---\n'));
    assert.ok(included.endsWith('…（以下省略）'));
  });

  test('https 以外の会議 URL はエラー', () => {
    assert.throws(() => composeEventTexts(emptyDetails({ meetingUrl: 'javascript:alert(1)' }), ''));
  });
});

describe('buildCalendarEvents：選んだ候補から予定の一覧を作る', () => {
  const candidates = candidatesOf('10/15 14:00 と 明日 と 来週火曜');
  const [timed, tomorrow, nextTuesday] = candidates;

  test('チェックを付けた候補だけを、表示順に予定にする', () => {
    const { events, errors } = buildCalendarEvents({
      candidates,
      selectedIds: new Set([nextTuesday.id, timed.id]),
      timeChoices: {},
      details: emptyDetails({ title: '定例会' }),
      sourceText: '',
      defaultDurationMinutes: 60,
    });
    assert.deepEqual(errors, []);
    assert.equal(events.length, 2);
    assert.equal(events[0].allDay, false);
    assert.deepEqual(events[0].start, timed.start);
    assert.equal(events[1].allDay, true); // 日付だけの候補の既定は終日
    assert.equal(events[1].title, '定例会');
  });

  test('時刻のある候補：選んだ長さで終了を決める（文章の「〜16時」は使わない）。日をまたいでもよい', () => {
    const [ranged, late] = candidatesOf('10/15 14時〜16時 と 10/16 23:00');
    const { events, errors } = buildCalendarEvents({
      candidates: [ranged, late],
      selectedIds: new Set([ranged.id, late.id]),
      timeChoices: { [late.id]: { end: MAX_END_DURATION_MINUTES, startTime: '' } },
      details: emptyDetails(),
      sourceText: '',
      defaultDurationMinutes: 90,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(events[0].start, { year: 2026, month: 10, day: 15, hour: 14, minute: 0 });
    assert.deepEqual(events[0].end, { year: 2026, month: 10, day: 15, hour: 15, minute: 30 }); // 選んでいなければ設定の長さ
    assert.deepEqual(events[1].end, { year: 2026, month: 10, day: 17, hour: 22, minute: 30 }); // 23時間30分後
  });

  test('時刻のある候補でも「終日」を選べば、開始日の終日の予定になる', () => {
    const { events } = buildCalendarEvents({
      candidates,
      selectedIds: new Set([timed.id]),
      timeChoices: { [timed.id]: { end: END_CHOICE_ALL_DAY, startTime: '' } },
      details: emptyDetails(),
      sourceText: '',
      defaultDurationMinutes: 60,
    });
    assert.equal(events[0].allDay, true);
    assert.deepEqual(events[0].start, { year: 2026, month: 10, day: 15, hour: null, minute: null });
    assert.equal(events[0].end, null);
  });

  test('日付だけの候補で長さを選ぶと、入力した開始時刻から終了を決める', () => {
    const { events } = buildCalendarEvents({
      candidates,
      selectedIds: new Set([tomorrow.id]),
      timeChoices: { [tomorrow.id]: { end: 150, startTime: '09:00' } },
      details: emptyDetails(),
      sourceText: '',
      defaultDurationMinutes: 60,
    });
    assert.equal(events[0].allDay, false);
    assert.deepEqual(events[0].start, { year: 2026, month: 10, day: 12, hour: 9, minute: 0 });
    assert.deepEqual(events[0].end, { year: 2026, month: 10, day: 12, hour: 11, minute: 30 });
  });

  test('日付だけの候補で開始時刻がない・選んだ長さが一覧にないならエラー（日付付きの文）', () => {
    const { events, errors } = buildCalendarEvents({
      candidates,
      selectedIds: new Set([timed.id, tomorrow.id]),
      timeChoices: {
        [timed.id]: { end: 45, startTime: '' },
        [tomorrow.id]: { end: 60, startTime: '' },
      },
      details: emptyDetails(),
      sourceText: '',
      defaultDurationMinutes: 60,
    });
    assert.equal(events.length, 0);
    assert.deepEqual(errors, [
      '2026年10月15日(木)：終了の選択が正しくありません。',
      '2026年10月12日(月)：開始時刻を入力してください。',
    ]);
  });

  test('会議 URL が不正なら、予定を作らずエラーだけを返す', () => {
    const { events, errors } = buildCalendarEvents({
      candidates,
      selectedIds: new Set([timed.id]),
      timeChoices: {},
      details: emptyDetails({ meetingUrl: 'http://zoom.us/j/1' }),
      sourceText: '',
      defaultDurationMinutes: 60,
    });
    assert.equal(events.length, 0);
    assert.equal(errors.length, 1);
  });

  test('終了の選択の初めの値：時刻のある候補は設定の長さ、日付だけの候補は終日（要件§5.10）', () => {
    assert.deepEqual(createDefaultTimeChoice(timed, 90), { end: 90, startTime: '' });
    assert.deepEqual(createDefaultTimeChoice(tomorrow, 90), { end: END_CHOICE_ALL_DAY, startTime: '' });
  });

  test('選べる長さは 30分〜23時間30分の30分刻み（47通り）', () => {
    assert.equal(END_DURATION_CHOICES.length, 47);
    assert.equal(END_DURATION_CHOICES[0], 30);
    assert.equal(END_DURATION_CHOICES.at(-1), 23 * 60 + 30);
    assert.ok(END_DURATION_CHOICES.every((minutes, index) => minutes === (index + 1) * 30));
  });
});
