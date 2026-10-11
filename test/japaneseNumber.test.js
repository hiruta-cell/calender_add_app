/**
 * japaneseNumber.test.js
 * 目的：漢字の数字の変換（src/core/japaneseNumber.js）を確かめる。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseJapaneseNumber } from '../src/core/japaneseNumber.js';

describe('parseJapaneseNumber：漢字の数字を数値にする', () => {
  test('位を使う書き方：十、十五、二十、三十一、百、二千二十六', () => {
    assert.equal(parseJapaneseNumber('十'), 10);
    assert.equal(parseJapaneseNumber('十五'), 15);
    assert.equal(parseJapaneseNumber('二十'), 20);
    assert.equal(parseJapaneseNumber('三十一'), 31);
    assert.equal(parseJapaneseNumber('百'), 100);
    assert.equal(parseJapaneseNumber('二千二十六'), 2026);
  });

  test('1桁ずつの書き方：〇、八、二〇二六', () => {
    assert.equal(parseJapaneseNumber('〇'), 0);
    assert.equal(parseJapaneseNumber('八'), 8);
    assert.equal(parseJapaneseNumber('二〇二六'), 2026);
  });

  test('半角数字はそのまま', () => {
    assert.equal(parseJapaneseNumber('15'), 15);
  });

  test('数字として成り立たない書き方は NaN：二三十、十百、十十', () => {
    assert.ok(Number.isNaN(parseJapaneseNumber('二三十')));
    assert.ok(Number.isNaN(parseJapaneseNumber('十百')));
    assert.ok(Number.isNaN(parseJapaneseNumber('十十')));
  });
});
