/**
 * highlight.js
 * 目的：文章のうち日時と認識した部分を色付けするため、文章を「通常の部分」と「強調する部分」に分ける。
 *
 * 画面側（React）はこの結果を文字列と <mark> で描画する。
 * 文章を HTML として解釈しないので、文章に HTML のタグが含まれていても実行されない（安全）。
 */

/**
 * 文章を、指定した範囲で区切った部分の配列に分ける。
 * 範囲が重なっている・隣り合っている場合は1つにまとめる。文章の外にはみ出した範囲は切り詰める。
 *
 * @param {string} text 元の文章
 * @param {Array<{start: number, end: number}>} ranges 強調する範囲（start は含み、end は含まない）
 * @returns {Array<{text: string, start: number, highlighted: boolean}>}
 *   文章を先頭から順に並べた部分。start は元の文章での開始位置（React の key に使う）
 */
export function splitTextByRanges(text, ranges) {
  // 正しい範囲だけを残し、文章の長さに収めて、開始位置の順に並べる
  const sortedRanges = ranges
    .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end))
    .map((range) => ({ start: Math.max(0, range.start), end: Math.min(text.length, range.end) }))
    .filter((range) => range.start < range.end)
    .sort((a, b) => a.start - b.start);

  // 重なる範囲・隣り合う範囲をまとめる
  const mergedRanges = [];
  for (const range of sortedRanges) {
    const lastRange = mergedRanges.at(-1);
    if (lastRange !== undefined && range.start <= lastRange.end) {
      lastRange.end = Math.max(lastRange.end, range.end);
    } else {
      mergedRanges.push({ ...range });
    }
  }

  // 範囲の外側を通常の部分、内側を強調する部分として順に並べる
  const segments = [];
  let cursor = 0;
  for (const range of mergedRanges) {
    if (cursor < range.start) {
      segments.push({ text: text.slice(cursor, range.start), start: cursor, highlighted: false });
    }
    segments.push({ text: text.slice(range.start, range.end), start: range.start, highlighted: true });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), start: cursor, highlighted: false });
  }
  return segments;
}
