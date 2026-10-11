/**
 * registration.test.js
 * 目的：登録内容の組み立て（src/core/registration.js）を確かめる。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { WARNING_PAST, extractDateCandidates } from '../src/core/dateExtractor.js';
import {
  DEFAULT_TIME_CHOICE,
  SOURCE_TEXT_EXCERPT_LENGTH,
  TIME_MODE_SPECIFIED,
  buildCalendarEvents,
  composeEventTexts,
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

  test('「時刻を指定」：開始だけなら既定の長さ、開始と終了なら指定どおり', () => {
    const { events } = buildCalendarEvents({
      candidates,
      selectedIds: new Set([tomorrow.id, nextTuesday.id]),
      timeChoices: {
        [tomorrow.id]: { mode: TIME_MODE_SPECIFIED, startTime: '09:00', endTime: '' },
        [nextTuesday.id]: { mode: TIME_MODE_SPECIFIED, startTime: '13:00', endTime: '14:30' },
      },
      details: emptyDetails(),
      sourceText: '',
      defaultDurationMinutes: 60,
    });
    assert.deepEqual(events[0].start, { year: 2026, month: 10, day: 12, hour: 9, minute: 0 });
    assert.deepEqual(events[0].end, { year: 2026, month: 10, day: 12, hour: 10, minute: 0 });
    assert.deepEqual(events[1].end, { year: 2026, month: 10, day: 13, hour: 14, minute: 30 });
  });

  test('「時刻を指定」で開始がない・終了が開始以前ならエラー（日付付きの文）', () => {
    const { events, errors } = buildCalendarEvents({
      candidates,
      selectedIds: new Set([tomorrow.id, nextTuesday.id]),
      timeChoices: {
        [tomorrow.id]: { mode: TIME_MODE_SPECIFIED, startTime: '', endTime: '' },
        [nextTuesday.id]: { mode: TIME_MODE_SPECIFIED, startTime: '13:00', endTime: '12:00' },
      },
      details: emptyDetails(),
      sourceText: '',
      defaultDurationMinutes: 60,
    });
    assert.equal(events.length, 0);
    assert.deepEqual(errors, [
      '2026年10月12日(月)：開始時刻を入力してください。',
      '2026年10月13日(火)：終了時刻は開始時刻より後にしてください。',
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

  test('時刻の扱いの初期値は終日', () => {
    assert.equal(DEFAULT_TIME_CHOICE.mode, 'allDay');
  });
});
