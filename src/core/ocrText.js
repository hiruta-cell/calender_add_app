/**
 * ocrText.js
 * 目的：OCR（文字認識）の結果の文章を、日時の抽出に向いた形に整える。
 *
 * Tesseract は日本語の文字の間に空白を入れることがある（例：「10 月 15 日 ( 木 ) 14 : 00」）。
 * そのままでは日時の書き方として読めないため、日本語の文字の前後の空白と、数字の間の「:」「/」の前後の空白を取り除く。
 */

/**
 * 日本語の文字（漢字・ひらがな・カタカナ・長音・々・全角の記号）。
 * この文字の前後にある空白は、OCR が入れた余分な空白とみなす。
 */
const JAPANESE_CHARACTER = String.raw`[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆〜～・、。，．：；！？「」『』（）【】［］〔〕｛｝＜＞]`;

/** 日本語の文字の前後の空白に一致する正規表現（どちらか一方が日本語の文字なら取り除く） */
const SPACE_AFTER_JAPANESE_PATTERN = new RegExp(String.raw`(?<=${JAPANESE_CHARACTER})[ \t　]+`, 'gu');
const SPACE_BEFORE_JAPANESE_PATTERN = new RegExp(String.raw`[ \t　]+(?=${JAPANESE_CHARACTER})`, 'gu');

/** 数字の間の「:」「/」の前後の空白（「14 : 00」「10 / 15」） */
const SPACED_NUMBER_SEPARATOR_PATTERN = /(\d)[ \t]{1,3}([:/])[ \t]{0,3}(\d)|(\d)[ \t]{0,3}([:/])[ \t]{1,3}(\d)/g;

/** 3行以上続く空行 */
const EXCESS_BLANK_LINES_PATTERN = /\n{3,}/g;

/**
 * OCR の結果の文章を整える。
 *
 * @param {string} text OCR の結果
 * @returns {string} 整えた文章
 */
export function cleanOcrText(text) {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(SPACE_AFTER_JAPANESE_PATTERN, '')
        .replace(SPACE_BEFORE_JAPANESE_PATTERN, '')
        .replace(SPACED_NUMBER_SEPARATOR_PATTERN, (...groups) =>
          groups[1] !== undefined ? `${groups[1]}${groups[2]}${groups[3]}` : `${groups[4]}${groups[5]}${groups[6]}`,
        )
        .trim(),
    );
  return lines.join('\n').replace(EXCESS_BLANK_LINES_PATTERN, '\n\n').trim();
}
