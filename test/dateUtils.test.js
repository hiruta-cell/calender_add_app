/**
 * dateUtils.test.js
 * 目的：日付計算（src/core/dateUtils.js）と全角→半角の変換（src/core/textNormalizer.js）を確かめる。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addDays,
  addMinutes,
  compareDateTimes,
  compareDates,
  getMondayBasedWeekday,
  getTokyoDateTime,
  isValidDate,
} from '../src/core/dateUtils.js';
import { normalizeWidth } from '../src/core/textNormalizer.js';

describe('getTokyoDateTime：PC の設定に関係なく東京の日時を返す', () => {
  test('UTC 2026-10-11 15:30 は東京 2026-10-12 0:30', () => {
    assert.deepEqual(getTokyoDateTime(new Date('2026-10-11T15:30:00Z')), {
      year: 2026,
      month: 10,
      day: 12,
      hour: 0,
      minute: 30,
    });
  });

  test('東京の深夜0時は 0 時（24 時ではない）', () => {
    assert.equal(getTokyoDateTime(new Date('2026-10-11T15:00:00Z')).hour, 0);
  });
});

describe('isValidDate：実在する日付か', () => {
  test('実在する日付', () => {
    assert.equal(isValidDate(2026, 10, 15), true);
    assert.equal(isValidDate(2028, 2, 29), true); // うるう年
  });

  test('実在しない日付', () => {
    assert.equal(isValidDate(2026, 2, 29), false);
    assert.equal(isValidDate(2026, 4, 31), false);
    assert.equal(isValidDate(2026, 13, 1), false);
    assert.equal(isValidDate(2026, 0, 1), false);
    assert.equal(isValidDate(2026, 1, 0), false);
    assert.equal(isValidDate(2026, 1.5, 1), false);
  });
});

describe('addDays / addMinutes：繰り上がりの計算', () => {
  test('月末・年末をまたぐ', () => {
    assert.deepEqual(addDays({ year: 2026, month: 10, day: 31 }, 1), { year: 2026, month: 11, day: 1 });
    assert.deepEqual(addDays({ year: 2026, month: 12, day: 31 }, 1), { year: 2027, month: 1, day: 1 });
    assert.deepEqual(addDays({ year: 2026, month: 3, day: 1 }, -1), { year: 2026, month: 2, day: 28 });
  });

  test('日付をまたぐ分の計算', () => {
    assert.deepEqual(addMinutes({ year: 2026, month: 12, day: 31, hour: 23, minute: 30 }, 60), {
      year: 2027,
      month: 1,
      day: 1,
      hour: 0,
      minute: 30,
    });
  });
});

describe('getMondayBasedWeekday：月曜=0 〜 日曜=6', () => {
  test('2026-10-11 は日曜(6)、2026-10-12 は月曜(0)、2026-10-15 は木曜(3)', () => {
    assert.equal(getMondayBasedWeekday({ year: 2026, month: 10, day: 11 }), 6);
    assert.equal(getMondayBasedWeekday({ year: 2026, month: 10, day: 12 }), 0);
    assert.equal(getMondayBasedWeekday({ year: 2026, month: 10, day: 15 }), 3);
  });
});

describe('compareDates / compareDateTimes', () => {
  test('前後関係', () => {
    const earlier = { year: 2026, month: 10, day: 15, hour: 9, minute: 0 };
    const later = { year: 2026, month: 10, day: 15, hour: 9, minute: 30 };
    assert.equal(compareDates(earlier, later), 0);
    assert.ok(compareDateTimes(earlier, later) < 0);
    assert.ok(compareDateTimes(later, earlier) > 0);
    assert.ok(compareDates({ year: 2026, month: 12, day: 31 }, { year: 2027, month: 1, day: 1 }) < 0);
  });
});

describe('normalizeWidth：全角→半角', () => {
  test('全角の数字・記号・スペースを半角にする', () => {
    assert.equal(normalizeWidth('１０／１５（木）　１４：００～'), '10/15(木) 14:00~');
  });

  test('文字数は変わらない（色付けの位置がずれない）', () => {
    const text = 'ＡＢＣ　１２３㈱①ﾊﾟ';
    assert.equal(normalizeWidth(text).length, text.length);
  });

  test('漢字・かな・〜（波ダッシュ）はそのまま', () => {
    assert.equal(normalizeWidth('明日〜来週'), '明日〜来週');
  });
});
