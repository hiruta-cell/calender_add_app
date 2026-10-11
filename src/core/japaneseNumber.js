/**
 * japaneseNumber.js
 * 目的：漢字の数字（十五、二十四、三十一、二〇二六、二千二十六など）を数値に変換する。
 *
 * 日時抽出では、文章の文字数を変えないために漢字を数字へ置き換えず、
 * 正規表現で漢字のまま受け付けてから、この関数で数値にする。
 */

/** 漢字の数字（0〜9） */
const KANJI_DIGITS = Object.freeze({
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
});

/** 漢字の位（十・百・千） */
const KANJI_UNITS = Object.freeze({ 十: 10, 百: 100, 千: 1000 });

/** 半角の数字だけの文字列 */
const ARABIC_NUMBER_PATTERN = /^\d+$/;

/** 位の漢字を含むか（含まなければ「二〇二六」のような1桁ずつの書き方） */
const UNIT_PATTERN = /[十百千]/;

/**
 * 数字の文字列（半角数字、または漢字の数字）を数値にする。
 *   15 → 15 ／ 十五 → 15 ／ 二十 → 20 ／ 三十一 → 31 ／ 二〇二六 → 2026 ／ 二千二十六 → 2026
 *
 * @param {string} text 数字の文字列
 * @returns {number} 数値。数字として成り立たない場合（「二三十」など）は NaN
 */
export function parseJapaneseNumber(text) {
  if (ARABIC_NUMBER_PATTERN.test(text)) {
    return Number(text);
  }

  // 「二〇二六」のように位を使わない書き方は、1桁ずつ並べる
  if (!UNIT_PATTERN.test(text)) {
    let value = 0;
    for (const character of text) {
      if (!Object.hasOwn(KANJI_DIGITS, character)) return Number.NaN;
      value = value * 10 + KANJI_DIGITS[character];
    }
    return value;
  }

  // 「二千二十六」のように位を使う書き方
  let total = 0;
  let pendingDigit = null; // 位の前に置かれた数字（「二十」の「二」）
  let previousUnit = Number.POSITIVE_INFINITY; // 位は大きい順に並ぶ必要がある（「十百」は不正）
  for (const character of text) {
    if (Object.hasOwn(KANJI_DIGITS, character)) {
      if (pendingDigit !== null) return Number.NaN; // 「二三十」のように数字が続くのは不正
      pendingDigit = KANJI_DIGITS[character];
    } else if (Object.hasOwn(KANJI_UNITS, character)) {
      const unit = KANJI_UNITS[character];
      if (unit >= previousUnit) return Number.NaN;
      total += (pendingDigit ?? 1) * unit;
      pendingDigit = null;
      previousUnit = unit;
    } else {
      return Number.NaN;
    }
  }
  return total + (pendingDigit ?? 0);
}
