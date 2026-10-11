/**
 * textNormalizer.js
 * 目的：日時抽出の前処理として、全角の数字・記号を半角にそろえる。
 *
 * 重要：1文字を必ず1文字に置き換える（文字数を変えない）。
 * 抽出結果の位置（何文字目か）を、そのまま元の文章の色付けに使うため。
 * そのため String.prototype.normalize('NFKC') は使わない（「㈱」→「(株)」のように文字数が変わる場合がある）。
 */

/** 全角英数記号（！ U+FF01 〜 ～ U+FF5E）に一致する正規表現 */
const FULLWIDTH_ASCII_PATTERN = /[！-～]/g;

/** 全角英数記号と半角英数記号の文字コードの差（例：「０」U+FF10 − 「0」U+0030 = 0xFEE0） */
const FULLWIDTH_TO_HALFWIDTH_OFFSET = 0xfee0;

/** 全角スペース（U+3000）に一致する正規表現 */
const IDEOGRAPHIC_SPACE_PATTERN = /　/g;

/**
 * 全角英数記号を半角に、全角スペースを半角スペースに置き換える。
 * 例：「１０／１５　１４：００」→「10/15 14:00」
 *
 * @param {string} text 元の文章
 * @returns {string} 置き換え後の文章（文字数は元の文章と同じ）
 */
export function normalizeWidth(text) {
  return text
    .replace(FULLWIDTH_ASCII_PATTERN, (character) =>
      String.fromCharCode(character.charCodeAt(0) - FULLWIDTH_TO_HALFWIDTH_OFFSET),
    )
    .replace(IDEOGRAPHIC_SPACE_PATTERN, ' ');
}
