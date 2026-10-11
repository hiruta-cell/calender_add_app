/**
 * dateExtractor.test.js
 * 目的：日時抽出（src/core/dateExtractor.js）が要件どおりに動くことを確かめる。
 * 基準日時は 2026年10月11日(日) 10:00（東京）に固定する。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  DEFAULT_DURATION_MINUTES,
  InputTooLongError,
  MAX_CANDIDATES,
  MAX_INPUT_LENGTH,
  WARNING_PAST,
  extractDateCandidates,
} from '../src/core/dateExtractor.js';

/** テストの基準日時：2026-10-11(日) 10:00 JST（= 01:00 UTC） */
const NOW = new Date('2026-10-11T01:00:00Z');

/**
 * 文章から候補を抽出する（基準日時を固定）。
 * @param {string} text
 * @param {object} [options]
 */
function extract(text, options = {}) {
  return extractDateCandidates(text, { now: NOW, ...options });
}

/**
 * 候補が1件だけ抽出されることを確かめ、その候補を返す。
 * @param {string} text
 * @param {object} [options]
 */
function extractSingle(text, options = {}) {
  const { candidates } = extract(text, options);
  assert.equal(candidates.length, 1, `候補は1件のはず: ${text}`);
  return candidates[0];
}

/** 年月日時分のオブジェクトを作る（テストを読みやすくするため） */
function dateTime(year, month, day, hour, minute) {
  return { year, month, day, hour, minute };
}

describe('要件§5.7 の5種類の書き方', () => {
  test('10/15 14:00 → 10/15 14:00〜15:00（終了は既定の1時間）', () => {
    const candidate = extractSingle('10/15 14:00');
    assert.equal(candidate.hasTime, true);
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, 14, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 15, 0));
    assert.equal(candidate.endInferred, true);
    assert.deepEqual(candidate.warnings, []);
  });

  test('10月15日(木)14時〜15時 → 10/15 14:00〜15:00', () => {
    const candidate = extractSingle('10月15日(木)14時〜15時');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, 14, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 15, 0));
    assert.equal(candidate.endInferred, false);
  });

  test('2026年10月15日 → 時刻なし（日付だけ）', () => {
    const candidate = extractSingle('2026年10月15日');
    assert.equal(candidate.hasTime, false);
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, null, null));
    assert.equal(candidate.end, null);
    assert.equal(candidate.endInferred, false);
  });

  test('明日 → 10/12（時刻なし）', () => {
    const candidate = extractSingle('明日');
    assert.equal(candidate.hasTime, false);
    assert.deepEqual(candidate.start, dateTime(2026, 10, 12, null, null));
  });

  test('来週火曜 → 10/13（月曜始まりの週。今日は日曜なので次の週は10/12〜）', () => {
    const candidate = extractSingle('来週火曜');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 13, null, null));
  });
});

describe('要件§12 の時刻・範囲の書き方', () => {
  test('全角数字・全角記号：１０／１５　１４：００', () => {
    const candidate = extractSingle('１０／１５　１４：００');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, 14, 0));
  });

  test('全角の括弧と範囲：１０月１５日（木）１４時～１５時', () => {
    const candidate = extractSingle('１０月１５日（木）１４時～１５時');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, 14, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 15, 0));
  });

  test('午後：10月15日 午後3時 → 15:00', () => {
    assert.deepEqual(extractSingle('10月15日 午後3時').start, dateTime(2026, 10, 15, 15, 0));
  });

  test('午前と半：10/15 午前10時半 → 10:30', () => {
    assert.deepEqual(extractSingle('10/15 午前10時半').start, dateTime(2026, 10, 15, 10, 30));
  });

  test('午前12時は0時、午後12時は12時', () => {
    assert.deepEqual(extractSingle('10/15 午前12時').start, dateTime(2026, 10, 15, 0, 0));
    assert.deepEqual(extractSingle('10/15 午後12時').start, dateTime(2026, 10, 15, 12, 0));
  });

  test('時分：10/15 14時30分', () => {
    assert.deepEqual(extractSingle('10/15 14時30分').start, dateTime(2026, 10, 15, 14, 30));
  });

  test('コロンの範囲：10/15 15:00-16:00', () => {
    const candidate = extractSingle('10/15 15:00-16:00');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, 15, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 16, 0));
    assert.equal(candidate.endInferred, false);
  });

  test('「から」の範囲：明日の14時から15時まで', () => {
    const candidate = extractSingle('明日の14時から15時まで');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 12, 14, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 12, 15, 0));
  });

  test('終了側の午後の省略：午後2時〜4時 → 14:00〜16:00', () => {
    const candidate = extractSingle('10/15 午後2時〜4時');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, 14, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 16, 0));
  });

  test('午前から午後：午前11時〜午後1時 → 11:00〜13:00', () => {
    const candidate = extractSingle('10/15 午前11時〜午後1時');
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 13, 0));
  });

  test('12時間表記の範囲：11時〜1時 → 11:00〜13:00', () => {
    const candidate = extractSingle('10/15 11時〜1時');
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 13, 0));
  });

  test('日付をまたぐ範囲：22時〜1時 → 翌日1:00', () => {
    const candidate = extractSingle('10/15 22時〜1時');
    assert.deepEqual(candidate.end, dateTime(2026, 10, 16, 1, 0));
  });

  test('終了が既定の長さで日付をまたぐ：23:30 → 翌日0:30', () => {
    const candidate = extractSingle('10/15 23:30');
    assert.deepEqual(candidate.end, dateTime(2026, 10, 16, 0, 30));
    assert.equal(candidate.endInferred, true);
  });

  test('開始と終了が同じなら既定の長さにする', () => {
    const candidate = extractSingle('10/15 14時〜14時');
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 15, 0));
    assert.equal(candidate.endInferred, true);
  });

  test('曜日の書き方の違い：(木曜日) (月・祝) 木曜日', () => {
    assert.deepEqual(extractSingle('10月15日(木曜日) 14時').start, dateTime(2026, 10, 15, 14, 0));
    assert.deepEqual(extractSingle('10月12日(月・祝)9:00').start, dateTime(2026, 10, 12, 9, 0));
    assert.deepEqual(extractSingle('10月15日木曜日 14時').start, dateTime(2026, 10, 15, 14, 0));
  });

  test('日付と時刻のつなぎ：「の」「は」「、」', () => {
    assert.deepEqual(extractSingle('明日の午後3時').start, dateTime(2026, 10, 12, 15, 0));
    assert.deepEqual(extractSingle('10月15日は14時から').start, dateTime(2026, 10, 15, 14, 0));
    assert.deepEqual(extractSingle('10/15、14:00').start, dateTime(2026, 10, 15, 14, 0));
  });
});

describe('12時間表記（英語の AM/PM）と24時間表記の混在', () => {
  test('3pm → 15:00、3:30 PM → 15:30、PM3:00 → 15:00', () => {
    assert.deepEqual(extractSingle('10/15 3pm').start, dateTime(2026, 10, 15, 15, 0));
    assert.deepEqual(extractSingle('10/15 3:30 PM').start, dateTime(2026, 10, 15, 15, 30));
    assert.deepEqual(extractSingle('10/15 PM3:00').start, dateTime(2026, 10, 15, 15, 0));
  });

  test('a.m. / p.m. と大文字・小文字', () => {
    assert.deepEqual(extractSingle('10/15 10 a.m.').start, dateTime(2026, 10, 15, 10, 0));
    assert.deepEqual(extractSingle('10/15 2 P.M.').start, dateTime(2026, 10, 15, 14, 0));
    assert.deepEqual(extractSingle('10/15 7PM').start, dateTime(2026, 10, 15, 19, 0));
  });

  test('12am は 0時、12pm は 12時', () => {
    assert.deepEqual(extractSingle('10/15 12am').start, dateTime(2026, 10, 15, 0, 0));
    assert.deepEqual(extractSingle('10/15 12pm').start, dateTime(2026, 10, 15, 12, 0));
  });

  test('範囲：9am-11am、24時間表記から PM へ（14:00-4pm）', () => {
    const englishRange = extractSingle('10/15 9am-11am');
    assert.deepEqual(englishRange.start, dateTime(2026, 10, 15, 9, 0));
    assert.deepEqual(englishRange.end, dateTime(2026, 10, 15, 11, 0));
    assert.deepEqual(extractSingle('10/15 14:00-4pm').end, dateTime(2026, 10, 15, 16, 0));
  });

  test('日本語の午後と24時間表記の混在：10:00〜午後3時', () => {
    assert.deepEqual(extractSingle('10/15 10:00〜午後3時').end, dateTime(2026, 10, 15, 15, 0));
  });

  test('「AMAZON」のような単語は時刻と誤認しない', () => {
    assert.equal(extractSingle('10/15 AMAZONで購入').hasTime, false);
  });
});

describe('時間帯の言葉（正午・朝・昼・夕方・夜）', () => {
  test('言葉だけなら既定の開始時刻（終了は1時間後）', () => {
    assert.deepEqual(extractSingle('10/15 正午').start, dateTime(2026, 10, 15, 12, 0));
    assert.deepEqual(extractSingle('明日の朝').start, dateTime(2026, 10, 12, 9, 0));
    assert.deepEqual(extractSingle('明日の昼').start, dateTime(2026, 10, 12, 11, 0));
    assert.deepEqual(extractSingle('明日の夕方').start, dateTime(2026, 10, 12, 15, 0));
    const night = extractSingle('明日の夜');
    assert.deepEqual(night.start, dateTime(2026, 10, 12, 18, 0));
    assert.deepEqual(night.end, dateTime(2026, 10, 12, 19, 0));
    assert.equal(night.endInferred, true);
  });

  test('言葉の後に時刻があれば手がかりにする：夜7時→19時、夕方5時→17時、朝10時→10時、昼1時→13時', () => {
    assert.deepEqual(extractSingle('明日の夜7時').start, dateTime(2026, 10, 12, 19, 0));
    assert.deepEqual(extractSingle('明日夕方5時').start, dateTime(2026, 10, 12, 17, 0));
    assert.deepEqual(extractSingle('明日朝10時').start, dateTime(2026, 10, 12, 10, 0));
    assert.deepEqual(extractSingle('明日の昼1時').start, dateTime(2026, 10, 12, 13, 0));
    assert.deepEqual(extractSingle('明日の昼12時').start, dateTime(2026, 10, 12, 12, 0));
    assert.deepEqual(extractSingle('明日の夜の8時').start, dateTime(2026, 10, 12, 20, 0));
  });

  test('言葉と食い違う書き方は、書かれている時刻を優先する：朝8時、昼17時、朝17時、夜13時、夕方12時', () => {
    assert.deepEqual(extractSingle('明日の朝8時').start, dateTime(2026, 10, 12, 8, 0));
    assert.deepEqual(extractSingle('明日の昼17時').start, dateTime(2026, 10, 12, 17, 0));
    assert.deepEqual(extractSingle('明日の朝17時').start, dateTime(2026, 10, 12, 17, 0));
    assert.deepEqual(extractSingle('明日の朝20:30').start, dateTime(2026, 10, 12, 20, 30));
    assert.deepEqual(extractSingle('明日の夜13時').start, dateTime(2026, 10, 12, 13, 0));
    assert.deepEqual(extractSingle('明日の夕方12時').start, dateTime(2026, 10, 12, 12, 0));
  });

  test('明記した午前/午後は言葉より優先する：夜 午前2時 → 2:00', () => {
    assert.deepEqual(extractSingle('明日の夜 午前2時').start, dateTime(2026, 10, 12, 2, 0));
  });

  test('範囲での午後の引き継ぎ：夕方5時〜7時 → 17:00〜19:00', () => {
    const candidate = extractSingle('10/15 夕方5時〜7時');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, 17, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 19, 0));
  });

  test('言葉から時刻までの範囲：昼〜15時', () => {
    const candidate = extractSingle('10/15 昼〜15時');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, 11, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 15, 0));
  });
});

describe('漢字の数字', () => {
  test('十月十五日（木）十五時〜十六時', () => {
    const candidate = extractSingle('十月十五日（木）十五時〜十六時');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, 15, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 16, 0));
  });

  test('年も漢字：二〇二六年十月十五日、二千二十六年十月三十一日', () => {
    assert.deepEqual(extractSingle('二〇二六年十月十五日').start, dateTime(2026, 10, 15, null, null));
    assert.deepEqual(extractSingle('二千二十六年十月三十一日').start, dateTime(2026, 10, 31, null, null));
  });

  test('時刻：十五時三十分、午後三時半、明日の朝八時、夜七時', () => {
    assert.deepEqual(extractSingle('10/15 十五時三十分').start, dateTime(2026, 10, 15, 15, 30));
    assert.deepEqual(extractSingle('10/15 午後三時半').start, dateTime(2026, 10, 15, 15, 30));
    assert.deepEqual(extractSingle('明日の朝八時').start, dateTime(2026, 10, 12, 8, 0));
    assert.deepEqual(extractSingle('明日の夜七時').start, dateTime(2026, 10, 12, 19, 0));
  });

  test('漢字と数字の混在：10月十五日 14時〜十六時', () => {
    const candidate = extractSingle('10月十五日 14時〜十六時');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 15, 14, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 16, 0));
  });

  test('「十一月」を「一月」と誤認しない', () => {
    assert.deepEqual(extractSingle('十一月三日').start, dateTime(2026, 11, 3, null, null));
  });

  test('実在しない日付・時刻は使わない：十月三十二日、二十五時', () => {
    assert.equal(extract('十月三十二日').candidates.length, 0);
    assert.equal(extractSingle('10/15 二十五時').hasTime, false);
  });

  test('「一時的」「一時停止」「一日中」を時刻・日付と誤認しない', () => {
    assert.equal(extractSingle('明日一時的に停止します').hasTime, false);
    assert.equal(extractSingle('明日、一時停止します').hasTime, false);
    assert.equal(extract('一日中かかります').candidates.length, 0);
  });
});

describe('年の記載がない日付（今日以降で最も近い日）と過去の警告', () => {
  test('今年すでに過ぎた日付は来年：10/5 → 2027/10/5（警告なし）', () => {
    const candidate = extractSingle('10/5');
    assert.deepEqual(candidate.start, dateTime(2027, 10, 5, null, null));
    assert.deepEqual(candidate.warnings, []);
  });

  test('今日の日付は今年：10/11 → 2026/10/11（警告なし）', () => {
    const candidate = extractSingle('10/11');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 11, null, null));
    assert.deepEqual(candidate.warnings, []);
  });

  test('今日でも時刻が過ぎていれば警告：10/11 9:00（現在10:00）', () => {
    assert.deepEqual(extractSingle('10/11 9:00').warnings, [WARNING_PAST]);
  });

  test('年を明記した過去の日付は警告：2026年10月1日', () => {
    const candidate = extractSingle('2026年10月1日');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 1, null, null));
    assert.deepEqual(candidate.warnings, [WARNING_PAST]);
  });

  test('2/29 は次のうるう年：2028/2/29', () => {
    assert.deepEqual(extractSingle('2/29').start, dateTime(2028, 2, 29, null, null));
  });

  test('実在しない日付は候補にしない：2/30、4/31、13/1、2027年2月29日', () => {
    assert.equal(extract('2/30 4/31 13/1 2027年2月29日').candidates.length, 0);
  });
});

describe('「明日」「来週」の境界', () => {
  test('月末の明日：10/31 → 11/1', () => {
    const { candidates } = extractDateCandidates('明日', { now: new Date('2026-10-31T01:00:00Z') });
    assert.deepEqual(candidates[0].start, dateTime(2026, 11, 1, null, null));
  });

  test('年末の明日：12/31 → 翌年1/1', () => {
    const { candidates } = extractDateCandidates('明日', { now: new Date('2026-12-31T01:00:00Z') });
    assert.deepEqual(candidates[0].start, dateTime(2027, 1, 1, null, null));
  });

  test('東京の日付で判定する：UTC 10/11 15:30 は東京 10/12 0:30 なので明日は 10/13', () => {
    const { candidates } = extractDateCandidates('明日', { now: new Date('2026-10-11T15:30:00Z') });
    assert.deepEqual(candidates[0].start, dateTime(2026, 10, 13, null, null));
  });

  test('今日が月曜(10/12)なら来週火曜は 10/20', () => {
    const { candidates } = extractDateCandidates('来週火曜', { now: new Date('2026-10-12T01:00:00Z') });
    assert.deepEqual(candidates[0].start, dateTime(2026, 10, 20, null, null));
  });

  test('今日が土曜(10/17)なら来週月曜は 10/19', () => {
    const { candidates } = extractDateCandidates('来週月曜', { now: new Date('2026-10-17T01:00:00Z') });
    assert.deepEqual(candidates[0].start, dateTime(2026, 10, 19, null, null));
  });

  test('今日が日曜(10/11)なら来週日曜は 10/18', () => {
    assert.deepEqual(extractSingle('来週日曜').start, dateTime(2026, 10, 18, null, null));
  });

  test('来週の火曜日 15:00〜16:00', () => {
    const candidate = extractSingle('来週の火曜日 15:00〜16:00');
    assert.deepEqual(candidate.start, dateTime(2026, 10, 13, 15, 0));
    assert.deepEqual(candidate.end, dateTime(2026, 10, 13, 16, 0));
  });
});

describe('誤認しないこと', () => {
  test('「再来週火曜」を「来週火曜」と誤認しない', () => {
    assert.equal(extract('再来週火曜にお願いします').candidates.length, 0);
  });

  test('「説明日程」の「明日」を誤認しない', () => {
    assert.equal(extract('説明日程は追って連絡します').candidates.length, 0);
  });

  test('「2時間」の「2時」を時刻と誤認しない', () => {
    const candidate = extractSingle('10/15 2時間の講座');
    assert.equal(candidate.hasTime, false);
  });

  test('2026/10/15 のような年付きの / 区切りは 10/15 と誤認しない（未対応の書き方）', () => {
    assert.equal(extract('2026/10/15').candidates.length, 0);
  });

  test('月日として成り立たない分数は候補にしない：50/50', () => {
    assert.equal(extract('50/50の確率').candidates.length, 0);
  });

  test('日付がない文章は候補なし（時刻だけでも候補にしない）', () => {
    assert.equal(extract('お世話になっております。よろしくお願いします。').candidates.length, 0);
    assert.equal(extract('14時から会議です').candidates.length, 0);
    assert.equal(extract('').candidates.length, 0);
  });
});

describe('複数の候補・重複・位置', () => {
  test('複数の日時は文章の順に候補になる', () => {
    const { candidates, truncated } = extract('10/16 15:00 または 10/15 14:00 でいかがでしょうか');
    assert.equal(truncated, false);
    assert.deepEqual(
      candidates.map((candidate) => candidate.id),
      ['candidate-0', 'candidate-1'],
    );
    assert.deepEqual(candidates[0].start, dateTime(2026, 10, 16, 15, 0));
    assert.deepEqual(candidates[1].start, dateTime(2026, 10, 15, 14, 0));
  });

  test('同じ日時が2回出てきたら1件にまとめ、色付けの位置は両方残す', () => {
    const text = '件名：10月15日(木)14時〜15時\n本文：10/15 14:00-15:00 に開催します';
    const { candidates } = extract(text);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].ranges.length, 2);
  });

  test('時刻ありと時刻なしの同じ日付は別の候補', () => {
    assert.equal(extract('10/15 と 10/15 14:00').candidates.length, 2);
  });

  test('位置と元の表記：全角の文章でも元の文字の位置を返す', () => {
    const text = 'ご案内：１０／１５（木）１４：００〜１５：００です';
    const candidate = extractSingle(text);
    const [range] = candidate.ranges;
    assert.equal(range.start, 4);
    assert.equal(candidate.sourceText, '１０／１５（木）１４：００〜１５：００');
    assert.equal(text.slice(range.start, range.end), candidate.sourceText);
  });

  test('時刻がない場合の位置は日付（と曜日）まで', () => {
    const candidate = extractSingle('締切は10月15日(木)です');
    assert.equal(candidate.sourceText, '10月15日(木)');
  });

  test(`候補は最大 ${MAX_CANDIDATES} 件で、超えたら truncated になる`, () => {
    // 11/1〜11/30 と 12/1 の、すべて異なる31件の日付
    const dates = Array.from(
      { length: MAX_CANDIDATES + 1 },
      (_, index) => `${index < 30 ? 11 : 12}/${(index % 30) + 1}`,
    );
    const { candidates, truncated } = extract(dates.join('\n'));
    assert.equal(candidates.length, MAX_CANDIDATES);
    assert.equal(truncated, true);
  });
});

describe('引数の検証', () => {
  test(`${MAX_INPUT_LENGTH} 文字を超える文章は InputTooLongError`, () => {
    assert.throws(() => extract('あ'.repeat(MAX_INPUT_LENGTH + 1)), InputTooLongError);
    assert.doesNotThrow(() => extract('あ'.repeat(MAX_INPUT_LENGTH)));
  });

  test('文字列以外は TypeError', () => {
    assert.throws(() => extractDateCandidates(null, { now: NOW }), TypeError);
    assert.throws(() => extractDateCandidates(123, { now: NOW }), TypeError);
  });

  test('基準日時が不正なら TypeError', () => {
    assert.throws(() => extractDateCandidates('明日', { now: new Date('invalid') }), TypeError);
    assert.throws(() => extractDateCandidates('明日', { now: '2026-10-11' }), TypeError);
  });

  test('予定の長さが不正なら RangeError（1〜1440分の整数のみ）', () => {
    for (const minutes of [0, -1, 1.5, 1441, Number.NaN]) {
      assert.throws(() => extract('10/15 14:00', { defaultDurationMinutes: minutes }), RangeError);
    }
  });

  test('予定の長さを変えると終了時刻も変わる（設定画面での変更を想定）', () => {
    const candidate = extractSingle('10/15 14:00', { defaultDurationMinutes: 90 });
    assert.deepEqual(candidate.end, dateTime(2026, 10, 15, 15, 30));
  });

  test(`既定の予定の長さは ${DEFAULT_DURATION_MINUTES} 分`, () => {
    assert.equal(DEFAULT_DURATION_MINUTES, 60);
  });
});

describe('処理時間（悪意のある長い入力でも固まらない：ReDoS 対策）', () => {
  const adversarialInputs = {
    '数字と/の繰り返し': '1/'.repeat(MAX_INPUT_LENGTH / 2),
    '月の繰り返し': '10月'.repeat(MAX_INPUT_LENGTH / 3),
    '午後と時の繰り返し': '午後1時〜'.repeat(MAX_INPUT_LENGTH / 5),
    '空白の繰り返し': `10/15${' '.repeat(MAX_INPUT_LENGTH - 10)}`,
    '来週の繰り返し': '来週の'.repeat(MAX_INPUT_LENGTH / 3),
    '数字だけ': '9'.repeat(MAX_INPUT_LENGTH),
    '漢字の数字の繰り返し': '十二'.repeat(MAX_INPUT_LENGTH / 2),
    '漢字の月の繰り返し': '十月'.repeat(MAX_INPUT_LENGTH / 2),
  };

  for (const [name, input] of Object.entries(adversarialInputs)) {
    test(`${name}（${input.length}文字）が1秒以内に終わる`, () => {
      const startedAt = performance.now();
      extract(input);
      const elapsedMilliseconds = performance.now() - startedAt;
      assert.ok(elapsedMilliseconds < 1000, `${elapsedMilliseconds.toFixed(0)}ms かかった`);
    });
  }
});
