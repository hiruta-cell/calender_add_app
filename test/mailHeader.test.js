/**
 * mailHeader.test.js
 * 目的：メールの送信日・受信日・引用の見出しの日付を、予定の候補にしないことを確かめる（依頼者の指摘）。
 * 文面は各メーラーの書き方をまねた架空のもの（実在の人名・会社名・アドレスは使わない）。
 * 基準日時は 2026年10月11日(日) 10:00（東京）に固定する。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { extractDateCandidates } from '../src/core/dateExtractor.js';
import { findMailHeaderRanges, isInRanges } from '../src/core/mailHeader.js';
import { normalizeWidth } from '../src/core/textNormalizer.js';

/** テストの基準日時：2026-10-11(日) 10:00 JST */
const NOW = new Date('2026-10-11T01:00:00Z');

/** 本文に書かれた予定（すべての例で共通）：2026年10月13日(火) 15:30 */
const BODY = ['架空商事 例山様', '', '10月13日(火)15時30分', '部品の納品にてお伺いいたします。'];

/**
 * 文章から候補を抽出し、「月/日 時:分」の一覧にする（時刻なしは「月/日」）。
 * @param {string[]} lines 文章の各行
 * @returns {string[]}
 */
function extractLabels(lines) {
  return extractDateCandidates(lines.join('\n'), { now: NOW }).candidates.map(({ start, hasTime }) =>
    hasTime ? `${start.month}/${start.day} ${start.hour}:${String(start.minute).padStart(2, '0')}` : `${start.month}/${start.day}`,
  );
}

describe('メーラーごとの送信日・受信日を候補にしない', () => {
  test('Outlook（英語）：Sent: の行', () => {
    const lines = [
      '-----Original Message-----',
      'From: Taro Example <taro@example.com>',
      'Sent: Friday, October 9, 2026 6:39 PM',
      'To: Hanako Sample <hanako@example.com>',
      'Subject: 10月13日(火) 15時30分のご訪問',
      '',
      ...BODY,
    ];
    assert.deepEqual(extractLabels(lines), ['10/13 15:30']);
  });

  test('Outlook（日本語・全角のコロン・太字の印）：送信日時: の行', () => {
    assert.deepEqual(extractLabels(['差出人： 例田 太郎', '送信日時： 2026年10月9日 金曜日 18:39', '件名： ご訪問の件', '', ...BODY]), ['10/13 15:30']);
    assert.deepEqual(extractLabels(['*From:* Taro Example', '*Sent:* Friday, October 9, 2026 6:39 PM', '', ...BODY]), ['10/13 15:30']);
  });

  test('Thunderbird（転送）：Date: / 日付: の行（RFC の日付の書き方を含む）', () => {
    const english = ['-------- Forwarded Message --------', 'Subject: ご訪問の件', 'Date: Fri, 9 Oct 2026 18:39:00 +0900', 'From: Taro Example <taro@example.com>', '', ...BODY];
    assert.deepEqual(extractLabels(english), ['10/13 15:30']);
    const japanese = ['-------- 転送メッセージ --------', '件名: ご訪問の件', '日付: Fri, 9 Oct 2026 18:39:00 +0900', '差出人: 例田 太郎 <taro@example.com>', '', ...BODY];
    assert.deepEqual(extractLabels(japanese), ['10/13 15:30']);
  });

  test('Thunderbird（返信の引用の見出し）：英語・日本語', () => {
    assert.deepEqual(extractLabels(['On 2026/10/09 18:39, Taro Example wrote:', ...BODY.map((line) => `> ${line}`)]), ['10/13 15:30']);
    assert.deepEqual(extractLabels(['2026/10/09 18:39 に 例田 太郎 さんは書きました:', ...BODY.map((line) => `> ${line}`)]), ['10/13 15:30']);
  });

  test('Gmail：英語の引用の見出し（2行に折り返したものも）・日本語の引用の見出し・転送のヘッダー', () => {
    assert.deepEqual(extractLabels(['On Fri, Oct 9, 2026 at 6:39 PM Taro Example <taro@example.com> wrote:', ...BODY]), ['10/13 15:30']);
    assert.deepEqual(extractLabels(['On Fri, Oct 9, 2026 at 6:39 PM Taro Example <', 'taro@example.com> wrote:', ...BODY]), ['10/13 15:30']);
    assert.deepEqual(extractLabels(['2026年10月9日(金) 18:39 例田 太郎 <taro@example.com>:', ...BODY]), ['10/13 15:30']);
    const forwarded = ['---------- Forwarded message ---------', 'From: Taro Example <taro@example.com>', 'Date: 2026年10月9日(金) 18:39', 'Subject: ご訪問の件', 'To: <hanako@example.com>', '', ...BODY];
    assert.deepEqual(extractLabels(forwarded), ['10/13 15:30']);
  });

  test('Apple Mail：英語・日本語の引用の見出し', () => {
    assert.deepEqual(extractLabels(['On Oct 9, 2026, at 18:39, Taro Example <taro@example.com> wrote:', ...BODY]), ['10/13 15:30']);
    assert.deepEqual(extractLabels(['2026/10/09 18:39、例田 太郎 <taro@example.com>のメール:', ...BODY]), ['10/13 15:30']);
  });

  test('受信日時: の行と、引用記号（>）の付いたヘッダー', () => {
    assert.deepEqual(extractLabels(['受信日時: 2026/10/10 9:00', ...BODY]), ['10/13 15:30']);
    assert.deepEqual(extractLabels(['> From: Taro Example', '> Sent: Friday, October 9, 2026 6:39 PM', '>', ...BODY]), ['10/13 15:30']);
  });
});

describe('予定の日付は外さない', () => {
  test('件名の行の日付は候補にする（本文と同じ日時なら1件にまとまる）', () => {
    assert.deepEqual(extractLabels(['From: Taro Example', 'Subject: 10月20日(火) 定例会']), ['10/20']);
  });

  test('お知らせの本文の「日付：」「日時：」は候補にする（ヘッダーのまとまりではないため）', () => {
    assert.deepEqual(extractLabels(['秋の勉強会のお知らせ', '', '日付：10月20日(火)', '時間：14:00〜15:00']), ['10/20 14:00']);
    assert.deepEqual(extractLabels(['Date: Oct 20', 'Time: 2pm']), ['10/20 14:00']);
    assert.deepEqual(extractLabels(['日時：10月20日(火) 14時']), ['10/20 14:00']);
  });

  test('本文の「〜を書きました」や「送信日は〜」の文の日付は候補にする', () => {
    assert.deepEqual(extractLabels(['10月20日の会議の議事録を書きました']), ['10/20']);
    assert.deepEqual(extractLabels(['申込書の送信は10月20日までにお願いします']), ['10/20']);
  });
});

describe('findMailHeaderRanges・isInRanges', () => {
  test('対象の行の範囲（改行を含まない）を前から順に返す', () => {
    const text = normalizeWidth('From: A\r\nSent: Oct 9\r\n\r\n本文');
    assert.deepEqual(findMailHeaderRanges(text), [{ start: 9, end: 20 }]);
  });

  test('空の文章・ヘッダーのない文章では範囲なし', () => {
    assert.deepEqual(findMailHeaderRanges(''), []);
    assert.deepEqual(findMailHeaderRanges('10月20日(火) 14時'), []);
  });

  test('isInRanges は start 以上 end 未満', () => {
    const ranges = [{ start: 5, end: 10 }];
    assert.equal(isInRanges(4, ranges), false);
    assert.equal(isInRanges(5, ranges), true);
    assert.equal(isInRanges(9, ranges), true);
    assert.equal(isInRanges(10, ranges), false);
  });

  test('長い文章（20000文字）でも処理が重くならない', () => {
    const text = `${'>'.repeat(10000)}${'a@'.repeat(5000)}`;
    const startedAt = performance.now();
    findMailHeaderRanges(text);
    assert.ok(performance.now() - startedAt < 500);
  });
});
