/**
 * mailHeader.js
 * 目的：メールの送信日・受信日など、予定ではない日付が書かれた行の位置を見つける（依頼者の指摘）。
 * 日時抽出（dateExtractor.js）は、ここで見つけた行の日付を候補にしない。
 *
 * 対象にする行（行頭の引用記号「>」や、Outlook の太字の「*」があってもよい）：
 *   1. 送信日・受信日の見出しの行：Sent: / Received: / 送信日時: / 受信日時: など（Outlook）
 *   2. 「Date:」「日付:」の行。ただし同じまとまり（空行で区切られた連続する行）に
 *      From: / 差出人: / 件名: などのヘッダーがあるときだけ（Thunderbird・Gmail の転送、Outlook）。
 *      お知らせの本文の「日付：10月15日」を誤って外さないため
 *   3. 返信の引用の見出しの行：
 *      「On Fri, Oct 9, 2026 at 6:39 PM Taro <taro@example.com> wrote:」（Gmail・Thunderbird・Apple Mail の英語）
 *      「2026/10/09 18:39 に Taro さんは書きました:」（Thunderbird の日本語）
 *      「2026/10/09 18:39、Taro <taro@example.com>のメール:」（Apple Mail の日本語）
 *      「2026年10月9日(金) 18:39 Taro <taro@example.com>:」（Gmail の日本語）
 *      見出しが2行に折り返されている場合（前の行が「On 」で始まる、または「<」で終わる）は前の行も含める
 *
 * - 件名（Subject: / 件名:）の行の日付は、予定の日付のことが多いため対象にしない。
 * - 文章は半角にそろえた後のものを受け取る（全角の「：」「＞」は半角になっている）。
 * - 正規表現は入れ子の量指定子を使わず、1行ずつ調べる（処理が重くならないように）。
 */

/** 行頭の引用記号（「>」「> >」など）と空白 */
const QUOTE_PREFIX = String.raw`^[ \t]*(?:>[ \t]*)*`;

/**
 * 見出し（ラベル）とコロンに一致する正規表現を作る。Outlook の書式なしの「*From:*」のような太字の印も許す。
 *
 * @param {string[]} labels 見出しの一覧（正規表現の特殊文字を含まないもの）
 * @returns {RegExp} 行頭の見出しに一致する正規表現（大文字・小文字を区別しない）
 */
function buildHeaderLabelPattern(labels) {
  return new RegExp(`${QUOTE_PREFIX}\\*?(?:${labels.join('|')})[ \\t]*:`, 'i');
}

/** 必ず送信日・受信日の行とみなす見出し（本文で予定の見出しに使われることはまずない） */
const SENT_DATE_LABEL_PATTERN = buildHeaderLabelPattern([
  'Sent',
  'Received',
  '送信日時',
  '受信日時',
  '送信日',
  '受信日',
  '送信時刻',
  '受信時刻',
]);

/** ヘッダーのまとまりの中にあるときだけ送信日とみなす見出し（本文の「日付：10月15日」と区別するため） */
const CONTEXT_DATE_LABEL_PATTERN = buildHeaderLabelPattern(['Date', '日付']);

/** その行がメールのヘッダーであることを示す、日付以外の見出し */
const OTHER_HEADER_LABEL_PATTERN = buildHeaderLabelPattern([
  'From',
  'To',
  'Cc',
  'Bcc',
  'Subject',
  'Reply-To',
  '差出人',
  '送信者',
  '宛先',
  '件名',
  '返信先',
]);

/**
 * 返信の引用の見出しの行の終わり方。
 *   wrote:              … 英語（Gmail・Thunderbird・Apple Mail）
 *   書きました:          … Thunderbird の日本語（「さんは書きました:」。本文の「〜を書きました」と区別するためコロンが必要）
 *   のメール:            … Apple Mail の日本語
 *   <アドレス>:          … Gmail の日本語（「名前 <taro@example.com>:」）
 */
const QUOTE_ATTRIBUTION_PATTERN =
  /(?:\bwrote[ \t]*:|書きました[ \t]*:|のメール[ \t]*:|<[^<>\s@]{1,64}@[^<>\s]{1,255}>[ \t]*:)[ \t]*$/i;

/** 折り返された引用の見出しの1行目（「On Fri, Oct 9, 2026 at 6:39 PM Taro Example <」など） */
const WRAPPED_ATTRIBUTION_FIRST_LINE_PATTERN = new RegExp(`${QUOTE_PREFIX}On[ \\t]|<[ \\t]*$`, 'i');

/** 行の区切り（\r\n・\r・\n） */
const LINE_BREAK_PATTERN = /\r\n|\r|\n/g;

/** 空行（空白と引用記号だけの行も空行とみなす） */
const BLANK_LINE_PATTERN = new RegExp(`${QUOTE_PREFIX}$`);

/**
 * 文章を行に分け、各行の開始・終了の位置を求める。
 *
 * @param {string} text 文章
 * @returns {Array<{text: string, start: number, end: number}>} 各行（end は改行の直前の位置）
 */
function splitLines(text) {
  const lines = [];
  let start = 0;
  for (const lineBreak of text.matchAll(LINE_BREAK_PATTERN)) {
    lines.push({ text: text.slice(start, lineBreak.index), start, end: lineBreak.index });
    start = lineBreak.index + lineBreak[0].length;
  }
  lines.push({ text: text.slice(start), start, end: text.length });
  return lines;
}

/**
 * 空行で区切られたまとまりごとに、ヘッダー（From: など）を含むかを調べる。
 *
 * @param {Array<{text: string}>} lines 各行
 * @returns {boolean[]} 各行が「ヘッダーを含むまとまり」に属していれば true
 */
function markHeaderBlocks(lines) {
  const inHeaderBlock = new Array(lines.length).fill(false);
  let blockStart = 0;
  for (let index = 0; index <= lines.length; index += 1) {
    const isBlockEnd = index === lines.length || BLANK_LINE_PATTERN.test(lines[index].text);
    if (!isBlockEnd) {
      continue;
    }
    const block = lines.slice(blockStart, index);
    if (block.some((line) => OTHER_HEADER_LABEL_PATTERN.test(line.text))) {
      inHeaderBlock.fill(true, blockStart, index);
    }
    blockStart = index + 1;
  }
  return inHeaderBlock;
}

/**
 * 送信日・受信日など、予定ではない日付が書かれた行の範囲を見つける。
 *
 * @param {string} text 半角にそろえた文章（normalizeWidth の結果）
 * @returns {Array<{start: number, end: number}>} 行の範囲（start 以上 end 未満）。文章の前から順
 */
export function findMailHeaderRanges(text) {
  const lines = splitLines(text);
  const inHeaderBlock = markHeaderBlocks(lines);
  const isExcluded = new Array(lines.length).fill(false);

  lines.forEach((line, index) => {
    if (SENT_DATE_LABEL_PATTERN.test(line.text) || (inHeaderBlock[index] && CONTEXT_DATE_LABEL_PATTERN.test(line.text))) {
      isExcluded[index] = true;
    }
    if (QUOTE_ATTRIBUTION_PATTERN.test(line.text)) {
      isExcluded[index] = true;
      // 見出しが2行に折り返されていれば、前の行（日付が書かれている方）も含める
      if (index > 0 && WRAPPED_ATTRIBUTION_FIRST_LINE_PATTERN.test(lines[index - 1].text)) {
        isExcluded[index - 1] = true;
      }
    }
  });

  return lines.filter((_, index) => isExcluded[index]).map(({ start, end }) => ({ start, end }));
}

/**
 * 位置が、いずれかの範囲に含まれるかを調べる。
 *
 * @param {number} position 調べる位置
 * @param {Array<{start: number, end: number}>} ranges findMailHeaderRanges() の結果
 * @returns {boolean} 含まれれば true
 */
export function isInRanges(position, ranges) {
  return ranges.some((range) => position >= range.start && position < range.end);
}
