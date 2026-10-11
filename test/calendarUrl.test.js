/**
 * calendarUrl.test.js
 * 目的：予定作成 URL の組み立て・検証（src/core/calendarUrl.js）を確かめる。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CalendarEventError,
  MAX_CALENDAR_URL_LENGTH,
  MAX_TITLE_LENGTH,
  buildCalendarUrl,
  isAllowedCalendarUrl,
  validateCalendarEvent,
} from '../src/core/calendarUrl.js';

/** 時刻ありの予定（テスト用の架空の内容） */
function timedEvent(overrides = {}) {
  return {
    title: '【架空】定例会',
    location: '会議室A',
    details: '',
    allDay: false,
    start: { year: 2026, month: 10, day: 15, hour: 14, minute: 0 },
    end: { year: 2026, month: 10, day: 15, hour: 15, minute: 0 },
    ...overrides,
  };
}

/** 終日の予定（テスト用） */
function allDayEvent(overrides = {}) {
  return {
    title: '締切',
    location: '',
    details: '',
    allDay: true,
    start: { year: 2026, month: 10, day: 15, hour: null, minute: null },
    end: null,
    ...overrides,
  };
}

/** URL のクエリを取り出す */
function queryOf(url) {
  return new URL(url).searchParams;
}

describe('buildCalendarUrl：予定作成 URL の組み立て', () => {
  test('時刻ありの予定：dates は YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS、ctz は Asia/Tokyo', () => {
    const url = buildCalendarUrl(timedEvent());
    assert.ok(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&'));
    const query = queryOf(url);
    assert.equal(query.get('dates'), '20261015T140000/20261015T150000');
    assert.equal(query.get('ctz'), 'Asia/Tokyo');
    assert.equal(query.get('text'), '【架空】定例会');
    assert.equal(query.get('location'), '会議室A');
    assert.equal(query.has('details'), false); // 空の項目は付けない
  });

  test('終日の予定：dates は YYYYMMDD/翌日（月末・年末の繰り上がりも）', () => {
    assert.equal(queryOf(buildCalendarUrl(allDayEvent())).get('dates'), '20261015/20261016');
    const yearEnd = allDayEvent({ start: { year: 2026, month: 12, day: 31, hour: null, minute: null } });
    assert.equal(queryOf(buildCalendarUrl(yearEnd)).get('dates'), '20261231/20270101');
  });

  test('値はエンコードされる：空白は %20、+ は %2B、& や改行も安全に入る', () => {
    const url = buildCalendarUrl(timedEvent({ title: 'A + B & C', details: '1行目\n2行目' }));
    assert.match(url, /text=A%20%2B%20B%20%26%20C/);
    assert.equal(url.includes('+'), false);
    assert.equal(queryOf(url).get('details'), '1行目\n2行目');
  });

  test('日付をまたぐ予定', () => {
    const url = buildCalendarUrl(timedEvent({
      start: { year: 2026, month: 10, day: 15, hour: 23, minute: 30 },
      end: { year: 2026, month: 10, day: 16, hour: 0, minute: 30 },
    }));
    assert.equal(queryOf(url).get('dates'), '20261015T233000/20261016T003000');
  });

  test(`URL が ${MAX_CALENDAR_URL_LENGTH} 文字を超えたら登録を止める`, () => {
    const longDetails = 'あ'.repeat(1900);
    assert.throws(() => buildCalendarUrl(timedEvent({ details: longDetails })), CalendarEventError);
  });

  test('組み立てた URL は許可リストを通る', () => {
    assert.equal(isAllowedCalendarUrl(buildCalendarUrl(timedEvent())), true);
    assert.equal(isAllowedCalendarUrl(buildCalendarUrl(allDayEvent())), true);
  });
});

describe('validateCalendarEvent：内容の検証（メインプロセスでも使う）', () => {
  test('形式が違うものは CalendarEventError', () => {
    for (const bad of [null, 'text', [], 123, {}]) {
      assert.throws(() => validateCalendarEvent(bad), CalendarEventError);
    }
    assert.throws(() => validateCalendarEvent(timedEvent({ title: 123 })), CalendarEventError);
    assert.throws(() => validateCalendarEvent(timedEvent({ allDay: 'false' })), CalendarEventError);
  });

  test(`件名が ${MAX_TITLE_LENGTH} 文字を超えたら CalendarEventError`, () => {
    assert.throws(() => validateCalendarEvent(timedEvent({ title: 'x'.repeat(MAX_TITLE_LENGTH + 1) })), CalendarEventError);
  });

  test('実在しない日付・時刻、終了が開始以前、24時間を超える予定は不可', () => {
    assert.throws(() => validateCalendarEvent(timedEvent({ start: { year: 2026, month: 2, day: 30, hour: 1, minute: 0 } })), CalendarEventError);
    assert.throws(() => validateCalendarEvent(timedEvent({ start: { year: 2026, month: 10, day: 15, hour: 24, minute: 0 } })), CalendarEventError);
    assert.throws(() => validateCalendarEvent(timedEvent({ end: { year: 2026, month: 10, day: 15, hour: 14, minute: 0 } })), CalendarEventError);
    assert.throws(() => validateCalendarEvent(timedEvent({ end: { year: 2026, month: 10, day: 16, hour: 15, minute: 0 } })), CalendarEventError);
    assert.throws(() => validateCalendarEvent(timedEvent({ start: { year: 1900, month: 1, day: 1, hour: 1, minute: 0 } })), CalendarEventError);
  });

  test('危険な制御文字・表示順を入れ替える文字を取り除き、件名・場所の改行は空白にする', () => {
    const event = validateCalendarEvent(timedEvent({
      title: '定例‮gnp.exe\u0000会',
      location: '会議室\nA',
      details: '1行目\r\n2行目\u0007',
    }));
    assert.equal(event.title, '定例gnp.exe会');
    assert.equal(event.location, '会議室 A');
    assert.equal(event.details, '1行目\n2行目');
  });

  test('終日の予定は時刻を使わない', () => {
    const event = validateCalendarEvent(allDayEvent({ start: { year: 2026, month: 10, day: 15, hour: 9, minute: 0 } }));
    assert.deepEqual(event.start, { year: 2026, month: 10, day: 15, hour: null, minute: null });
    assert.equal(event.end, null);
  });
});

describe('isAllowedCalendarUrl：開いてよい URL（許可リスト）', () => {
  test('予定作成画面の URL だけを許可する', () => {
    assert.equal(isAllowedCalendarUrl('https://calendar.google.com/calendar/render?action=TEMPLATE&text=a'), true);
  });

  test('それ以外はすべて拒否する', () => {
    for (const url of [
      'http://calendar.google.com/calendar/render?action=TEMPLATE',
      'https://calendar.google.com.evil.example/calendar/render?action=TEMPLATE',
      'https://evil.example/calendar/render?action=TEMPLATE',
      'https://user@calendar.google.com/calendar/render?action=TEMPLATE',
      'https://calendar.google.com:8443/calendar/render?action=TEMPLATE',
      'https://calendar.google.com/calendar/u/0/settings?action=TEMPLATE',
      'https://calendar.google.com/calendar/render?action=TEMPLATE#x',
      'https://calendar.google.com/calendar/render?action=VIEW',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'not a url',
    ]) {
      assert.equal(isAllowedCalendarUrl(url), false, url);
    }
  });
});

describe('予定作成画面以外の Googleカレンダーの URL', () => {
  test('日の表示・設定などの URL は開かない（「カレンダーで確認」は 2026-10-11 に削除。開いてよいのは予定作成画面だけ）', () => {
    for (const url of [
      'https://calendar.google.com/calendar/r/day/2026/10/15',
      'https://calendar.google.com/calendar/r/settings',
      'https://calendar.google.com/calendar/r',
    ]) {
      assert.equal(isAllowedCalendarUrl(url), false, url);
    }
  });
});
