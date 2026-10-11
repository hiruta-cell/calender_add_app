/**
 * display.test.js
 * 目的：画面表示用の整形（candidateFormatter.js）と色付けの分割（highlight.js）を確かめる。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  describeWarning,
  formatCandidateLabel,
  formatDateLabel,
  formatTimeLabel,
} from '../src/core/candidateFormatter.js';
import { WARNING_AMBIGUOUS_ORDER, WARNING_PAST, extractDateCandidates } from '../src/core/dateExtractor.js';
import { splitTextByRanges } from '../src/core/highlight.js';

/** テストの基準日時：2026-10-11(日) 10:00 JST */
const NOW = new Date('2026-10-11T01:00:00Z');

/** 文章から最初の候補を取り出す */
function firstCandidate(text) {
  return extractDateCandidates(text, { now: NOW }).candidates[0];
}

describe('candidateFormatter：候補の表示文字列', () => {
  test('日付と時刻の表示', () => {
    assert.equal(formatDateLabel({ year: 2026, month: 10, day: 15 }), '2026年10月15日(木)');
    assert.equal(formatTimeLabel({ hour: 9, minute: 5 }), '09:05');
  });

  test('時刻ありの候補', () => {
    assert.equal(formatCandidateLabel(firstCandidate('10/15 14:00')), '2026年10月15日(木) 14:00〜15:00');
  });

  test('日をまたぐ候補は終了側にも日付を付ける', () => {
    assert.equal(
      formatCandidateLabel(firstCandidate('10/15 23:30')),
      '2026年10月15日(木) 23:30〜2026年10月16日(金) 00:30',
    );
  });

  test('時刻なしの候補は日付だけ', () => {
    assert.equal(formatCandidateLabel(firstCandidate('明日')), '2026年10月12日(月)');
  });

  test('警告コードを文に変換する（未知のコードも表示できる）', () => {
    assert.equal(describeWarning(WARNING_PAST), '過去の日時です');
    assert.equal(describeWarning(WARNING_AMBIGUOUS_ORDER), '月と日の順番を確認してください（月/日として読みました）');
    assert.equal(describeWarning('unknown-code'), '内容を確認してください');
    assert.equal(describeWarning('__proto__'), '内容を確認してください');
  });
});

describe('splitTextByRanges：色付けのための分割', () => {
  test('範囲の前後を通常の部分として分ける', () => {
    assert.deepEqual(splitTextByRanges('会議は10/15です', [{ start: 3, end: 8 }]), [
      { text: '会議は', start: 0, highlighted: false },
      { text: '10/15', start: 3, highlighted: true },
      { text: 'です', start: 8, highlighted: false },
    ]);
  });

  test('重なる・隣り合う範囲はまとめる。順番が逆でも並べ直す', () => {
    const segments = splitTextByRanges('abcdefgh', [
      { start: 4, end: 6 },
      { start: 0, end: 2 },
      { start: 1, end: 3 },
      { start: 3, end: 4 },
    ]);
    assert.deepEqual(segments, [
      { text: 'abcdef', start: 0, highlighted: true },
      { text: 'gh', start: 6, highlighted: false },
    ]);
  });

  test('文章の外にはみ出した範囲・不正な範囲は切り詰める／無視する', () => {
    assert.deepEqual(
      splitTextByRanges('abc', [
        { start: -5, end: 1 },
        { start: 2, end: 99 },
        { start: 2, end: 1 },
        { start: 0.5, end: 1 },
      ]),
      [
        { text: 'a', start: 0, highlighted: true },
        { text: 'b', start: 1, highlighted: false },
        { text: 'c', start: 2, highlighted: true },
      ],
    );
  });

  test('範囲がなければ全体が通常の部分。空の文章なら空の配列', () => {
    assert.deepEqual(splitTextByRanges('abc', []), [{ text: 'abc', start: 0, highlighted: false }]);
    assert.deepEqual(splitTextByRanges('', []), []);
  });

  test('HTML のタグを含む文章も、文字列のまま分割する（HTML として扱わない）', () => {
    const text = '<img src=x onerror=alert(1)>10/15';
    const segments = splitTextByRanges(text, firstCandidate(text).ranges);
    assert.equal(segments.map((segment) => segment.text).join(''), text);
    assert.deepEqual(segments.at(-1), { text: '10/15', start: 28, highlighted: true });
  });
});
