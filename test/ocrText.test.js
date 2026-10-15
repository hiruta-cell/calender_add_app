/**
 * ocrText.test.js
 * 目的：OCR の結果の整形（src/core/ocrText.js）を確かめる。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { extractDateCandidates } from '../src/core/dateExtractor.js';
import { cleanOcrText } from '../src/core/ocrText.js';

describe('cleanOcrText：OCR の結果を整える', () => {
  test('日本語の文字の前後の空白を取り除く（半角の「)」と数字の間の空白は、手入力と同じく残る）', () => {
    assert.equal(cleanOcrText('日 時 ： 10 月 15 日 ( 木 ) 14 時 〜 15 時'), '日時：10月15日(木) 14時〜15時');
  });

  test('数字の間の「:」「/」の前後の空白を取り除く', () => {
    assert.equal(cleanOcrText('10 / 15  14 : 00'), '10/15  14:00');
  });

  test('英単語の間の空白や URL は残す', () => {
    assert.equal(cleanOcrText('Weekly sync https://zoom.us/j/1'), 'Weekly sync https://zoom.us/j/1');
  });

  test('スラッシュが1つ抜けた「https:/」を「https://」に直す（正しい URL は変えない）', () => {
    assert.equal(cleanOcrText('https:/us02web.zoom.us/j/0000000000?'), 'https://us02web.zoom.us/j/0000000000?');
    assert.equal(cleanOcrText('参加URL：HTTPS:/zoom.us/j/1'), '参加URL：https://zoom.us/j/1');
    assert.equal(cleanOcrText('https://zoom.us/j/1'), 'https://zoom.us/j/1');
    assert.equal(cleanOcrText('https:/'), 'https:/');
  });

  test('行の前後の空白と、続きすぎる空行を整える', () => {
    assert.equal(cleanOcrText('  件名 ： 定例会  \r\n\r\n\r\n\r\n 場所 ： 会議室A '), '件名：定例会\n\n場所：会議室A');
  });

  test('整えた結果から日時を抽出できる', () => {
    const cleaned = cleanOcrText('日 時 ： 10 月 15 日 ( 木 ) 14 時 〜 15 時');
    const { candidates } = extractDateCandidates(cleaned, { now: new Date('2026-10-11T01:00:00Z') });
    assert.deepEqual(candidates[0].start, { year: 2026, month: 10, day: 15, hour: 14, minute: 0 });
  });
});
