/**
 * dateExtractor.js
 * 目的：貼り付けた文章（または OCR の結果）から、予定の日時の候補を抽出する。
 *
 * - PC 内で完結するルール処理（正規表現）だけを使い、文章を外部へ送らない（要件§5.2）。
 * - 画面（React）や Electron に依存しない純粋な関数にして、単体テストできるようにしている。
 *
 * 対応する書き方（要件§5.7・§12）：
 *   日付：10/15、10月15日、2026年10月15日、明日、来週火曜（来週の火曜日）
 *         年→月→日の数字：26.10.15、27/10/15、2026/10/15、2026-10-15、2026.10.15（年が2桁なら 20XX 年）
 *         英語：October 15, 2026、Oct 15、Oct. 15th、15 Oct 2026、15th of October、10/15/2026、tomorrow
 *         （年が最後の数字の日付で、月と日の順番が決まらないもの（05/10/2026）は月/日（米国式）として読み、警告を付ける）
 *   曜日：日付の後の (木)、(木曜日)、(月・祝)、木曜日 は読み飛ばす
 *   メール：送信日・受信日・引用の見出しの行（Sent:、送信日時:、… wrote: など）の日付は候補にしない（mailHeader.js）
 *   漢字の数字：十月十五日、十五時三十分、二〇二六年 など（japaneseNumber.js で数値にする）
 *   時刻：14:00、14時、14時30分、14時半、午前/午後、全角数字、3pm・3:00 PM・PM3:00（英語の AM/PM）
 *   時間帯：正午(12時)、朝(9時)、昼(11時)、夕方(15時)、夜(18時)。「夜7時」→19時のように手がかりにもする
 *   範囲：14時〜15時、15:00-16:00、14時から15時、14時15時（OCR で「〜」が抜けた形。後ろが遅いときだけ）
 *   別の行の時刻：日付が行末にあり、次の行が「時間：」「時刻：」「開始：」「Time:」「Start:」で始まるときだけ結び付ける
 *         英語：2:00–3:00 PM、2-3pm、11am-1pm、from 2pm to 3pm、at 3pm（後ろの PM は前の時刻にも当てはめる）
 * 対象外：複数日にまたがる範囲（10/15〜10/17）、英語の next Tuesday（「今週」と「来週」の両方の意味で使われるため）
 *
 * 判定のルール：
 *   - 年の記載がない日付は「今日以降で最も近い日」にする（要件§12）
 *   - 「来週」は月曜始まりの週で、今日の次の週（要件§12）
 *   - 終了時刻がない予定は既定の長さ（60分）にする（要件§5.4）
 *   - 過去の日時には警告を付ける（要件§12）
 */

import { parseJapaneseNumber } from './japaneseNumber.js';
import { normalizeWidth } from './textNormalizer.js';
import { findMailHeaderRanges, isInRanges } from './mailHeader.js';
import {
  DAYS_PER_WEEK,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  WEEKDAY_CHARACTERS,
  addDays,
  addMinutes,
  compareDateTimes,
  compareDates,
  getMondayBasedWeekday,
  getTokyoDateTime,
  isValidDate,
} from './dateUtils.js';

/** 終了時刻が書かれていない予定の長さ（分）。要件§5.4 の既定値 */
export const DEFAULT_DURATION_MINUTES = 60;

/** 予定の長さとして受け付ける最大値（分）。設定で変更されても1日を超えないようにする */
export const MAX_DURATION_MINUTES = MINUTES_PER_DAY;

/** 受け付ける文章の最大文字数。極端に長い入力で処理が重くならないようにする（CLAUDE.md） */
export const MAX_INPUT_LENGTH = 20000;

/** 候補の最大件数。候補が多すぎて画面やブラウザのタブがあふれないようにする */
export const MAX_CANDIDATES = 30;

/** 警告コード：過去の日時（画面での表示文は candidateFormatter.js で決める） */
export const WARNING_PAST = 'past';

/** 警告コード：月と日の順番が決まらない英語の数字の日付（05/10/2026 など）を、月/日（米国式）として読んだ */
export const WARNING_AMBIGUOUS_ORDER = 'ambiguousOrder';

/** 警告コード：日付の後ろに書かれた曜日が、その日付の本当の曜日と合わない（例：2026年10月15日(水)。本当は木曜） */
export const WARNING_WEEKDAY_MISMATCH = 'weekdayMismatch';

/** 英語の曜日の正式な名前。並びは月曜始まり（月=0〜日=6）で、先頭3文字が略称になる */
const ENGLISH_WEEKDAY_NAMES = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

/** 英語の略称の曜日の文字数（Mon、Tue など） */
const ENGLISH_WEEKDAY_ABBREVIATION_LENGTH = 3;

/** 2桁の年に足す数（26.10.15 → 2026年） */
const TWO_DIGIT_YEAR_BASE = 2000;

/** 1年の月の数（月と日の順番の判定に使う） */
const MONTHS_PER_YEAR = 12;

/** 英語の月名（小文字）と月の数字の対応 */
const ENGLISH_MONTH_NUMBERS = Object.freeze({
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
});

/** 英語の月名の正規表現の部品（長い名前を先に書く。「Sept」を「Sep」より先に） */
const ENGLISH_MONTH_PATTERN =
  'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec';

/** 年の記載がない日付で、実在する日を探す年数（2月29日は最長で4年後になる） */
const MAX_YEAR_LOOKAHEAD = 4;

/** 正午をまたぐ補正に使う12時間（分） */
const HALF_DAY_MINUTES = 12 * MINUTES_PER_HOUR;

/** 午前・午後の表記 */
const MERIDIEM_AM = '午前';
const MERIDIEM_PM = '午後';

/** 「14時半」の「半」が表す分数 */
const HALF_HOUR_MINUTES = 30;

/**
 * 日付の書き方に一致する正規表現（文章全体から探すため g、漢字の判定に u、英語の月名の大文字・小文字に i フラグ）。
 * 名前付きグループで、どの書き方に一致したかを区別する。左の書き方ほど優先される。
 *   jpYear / jpMonth / jpDay        … 2026年10月15日、10月15日、十月十五日、二〇二六年十月十五日（漢字の数字も可）
 *   ymdYear / ymdMonth / ymdDay     … 2026/10/15、2026-10-15、2026.10.15（区切りは同じ記号だけ）
 *   mdyFirst / mdySecond / mdyYear  … 10/15/2026（米国式）、15/10/2026（英国式）。年が最後の英語圏の書き方
 *   yymdYear / yymdMonth / yymdDay  … 26.10.15、27/10/15、26-10-15（年が2桁。日本式の年→月→日）
 *   slashMonth / slashDay           … 10/15（前後に数字や / が続くものは除外）
 *   enMonthA / enDayA / enYearA     … October 15, 2026、Oct 15、Oct. 15th
 *   enDayB / enMonthB / enYearB     … 15 Oct 2026、15th of October
 *   tomorrow / tomorrowEn           … 明日（直前が漢字のものは除外。「説明日程」を誤認しないため）、tomorrow
 *   nextWeekWeekday                 … 来週火曜、来週の火曜日（「再来週」は除外。1週間ずれるのを防ぐため）
 * 数字の日付は、前後に数字や区切りの記号が続くもの（電話番号 03-1234-5678、版番号 12.10.15.3 など）を除外する。
 * 量指定子はすべて上限付きにして、入力が長くても処理時間が急増しないようにしている（ReDoS 対策）。
 */
const DATE_PATTERN = new RegExp(
  [
    String.raw`(?<![\d〇一二三四五六七八九十百千])(?:(?<jpYear>\d{4}|[〇一二三四五六七八九十百千]{2,7})[ \t]?年[ \t]?)?(?<jpMonth>\d{1,2}|[一二三四五六七八九十]{1,3})[ \t]?月[ \t]?(?<jpDay>\d{1,2}|[一二三四五六七八九十]{1,3})[ \t]?日`,
    String.raw`(?<![\d./\-])(?<ymdYear>\d{4})(?<ymdSeparator>[/.\-])(?<ymdMonth>\d{1,2})\k<ymdSeparator>(?<ymdDay>\d{1,2})(?![./\-]?\d)`,
    String.raw`(?<![\d./\-])(?<mdyFirst>\d{1,2})/(?<mdySecond>\d{1,2})/(?<mdyYear>\d{4})(?![/\d])`,
    String.raw`(?<![\d./\-])(?<yymdYear>\d{2})(?<yymdSeparator>[/.\-])(?<yymdMonth>\d{1,2})\k<yymdSeparator>(?<yymdDay>\d{1,2})(?![./\-]?\d)`,
    String.raw`(?<![\d/])(?<slashMonth>\d{1,2})/(?<slashDay>\d{1,2})(?![\d/])`,
    String.raw`(?<![A-Za-z])(?<enMonthA>${ENGLISH_MONTH_PATTERN})\.?[ \t]{1,2}(?<enDayA>\d{1,2})(?:st|nd|rd|th)?(?![\dA-Za-z])(?:,?[ \t]{1,2}(?<enYearA>\d{4})(?!\d))?`,
    String.raw`(?<![\dA-Za-z])(?<enDayB>\d{1,2})(?:st|nd|rd|th)?[ \t]{1,2}(?:of[ \t]{1,2})?(?<enMonthB>${ENGLISH_MONTH_PATTERN})\.?(?![A-Za-z])(?:,?[ \t]{1,2}(?<enYearB>\d{4})(?!\d))?`,
    String.raw`(?<!\p{Script=Han})(?<tomorrow>明日)`,
    String.raw`(?<![A-Za-z])(?<tomorrowEn>tomorrow)(?![A-Za-z])`,
    String.raw`(?<!再)来週[ \t]?(?:の[ \t]?)?(?<nextWeekWeekday>[月火水木金土日])曜日?`,
  ].join('|'),
  'giu',
);

/**
 * 日付の直後にある曜日の表記（読み飛ばし、日付と合っているかを確かめるため）。例：(木) (木曜日) (月・祝) 木曜日 (Thu) (Thursday)
 * 名前付きグループ：jpWeekday … 括弧内の漢字の曜日、enWeekday … 括弧内の英語の曜日（Thu、Thursday など単語全体）、
 *   bareWeekday … 括弧なしの「木曜日」の「木」
 * y（sticky）フラグ：lastIndex で指定した位置からだけ一致を試す。i フラグ：英語の曜日の大文字・小文字。
 * d フラグ：グループの位置（indices）を得る（下書きの曜日を書き換える位置に使う）。
 */
const WEEKDAY_PATTERN =
  /[ \t]{0,3}(?:\([ \t]{0,2}(?:(?<jpWeekday>[月火水木金土日])(?:曜日?)?(?:[ \t]{0,2}[・･][ \t]{0,2}祝日?)?|(?<enWeekday>(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]{0,6})\.?)[ \t]{0,2}\)|(?<bareWeekday>[月火水木金土日])曜日?)/diy;

/**
 * 日付と時刻の間のつなぎ（空白、「の」「は」「、」、英語の at / from / @ など）。
 * 例：「明日の14時」「10/15、14:00」「Oct 15 at 3pm」「Oct 15, from 2pm」
 */
const CONNECTOR_PATTERN = /[ \t]{0,3}(?:[のは、,][ \t]{0,3})?(?:(?:at|from)[ \t]{1,3}|@[ \t]{0,3})?/iy;

/**
 * 時刻の書き方。i フラグ：英語の AM/PM を大文字・小文字どちらでも受け付ける。
 *   meridiem                  … 前に付く 午前 / 午後 / AM / PM / a.m. / p.m.
 *   colonHour / colonMinute   … 14:00（分は2桁）
 *   kanjiHour / kanjiMinute   … 14時、14時30分、十五時三十分（漢字の数字も可）
 *                               「2時間」「一時的」「一時停止」などの「時」は時刻ではないので除外
 *   half                      … 14時半
 *   bareHour                  … 3pm の「3」（後ろに AM/PM があるときだけ）
 *   rangeStartHour            … 2-3pm の「2」（後ろに「区切り＋AM/PM 付きの時刻」が続くときだけ）
 *   suffixMeridiem            … 後ろに付く AM / PM（3pm、3:00 PM）
 */
const TIME_PATTERN =
  /(?:(?<meridiem>午前|午後|A\.M\.|P\.M\.|AM|PM)[ \t]{0,2})?(?:(?<colonHour>\d{1,2}):(?<colonMinute>\d{2})(?!\d)|(?<kanjiHour>\d{1,2}|[〇一二三四五六七八九十]{1,3})時(?!間|的|点|期|代|限|刻|停|保)(?:[ \t]{0,2}(?<kanjiMinute>\d{1,2}|[〇一二三四五六七八九十]{1,3})分|(?<half>半))?|(?<bareHour>\d{1,2})(?=[ \t]{0,2}(?:A\.M\.|P\.M\.|AM|PM)(?![A-Z]))|(?<rangeStartHour>\d{1,2})(?=[ \t]{0,3}(?:[~〜\-―–—‐−]|to)[ \t]{0,3}\d{1,2}(?::\d{2})?[ \t]{0,2}(?:A\.M\.|P\.M\.|AM|PM)(?![A-Z])))(?:[ \t]{0,2}(?<suffixMeridiem>A\.M\.|P\.M\.|AM|PM)(?![A-Z]))?/iy;

/**
 * 時間帯を表す言葉（要件§12）。時刻が続かなければ、この言葉の既定の時刻を開始にする。
 *   正午 12:00 ／ 朝 9:00 ／ 昼 11:00 ／ 夕方 15:00 ／ 夜 18:00
 * 「夕方」を「夕」より先に書くため、長い言葉から並べている。
 */
const TIME_WORD_PATTERN = /(?<word>正午|夕方|朝|昼|夜)/y;

/** 時間帯の言葉と時刻の間のつなぎ。例：「夜の7時」「朝 9時」 */
const TIME_WORD_GAP_PATTERN = /[ \t]{0,2}(?:の[ \t]{0,2})?/y;

/**
 * 時間帯の言葉の既定の時刻（時刻が続かない場合に使う）。
 * meridiem は終了時刻へ「午後」を引き継ぐかの判定に使う。
 */
const TIME_WORD_DEFAULTS = Object.freeze({
  正午: { hour: 12, minute: 0, meridiem: MERIDIEM_PM },
  朝: { hour: 9, minute: 0, meridiem: MERIDIEM_AM },
  昼: { hour: 11, minute: 0, meridiem: MERIDIEM_AM },
  夕方: { hour: 15, minute: 0, meridiem: MERIDIEM_PM },
  夜: { hour: 18, minute: 0, meridiem: MERIDIEM_PM },
});

/** 午前・午後のどちらにも読める時の上限（12時以降は書かれた時刻をそのまま使う） */
const AMBIGUOUS_HOUR_MAX = 11;

/** 「昼1時」を13時とみなす上限の時（昼の後の 1〜6時は午後として扱う） */
const NOON_WORD_PM_MAX_HOUR = 6;

/** 開始時刻と終了時刻の区切り。例：〜 ~ - ― – — ー ‐ − から to until till */
const RANGE_SEPARATOR_PATTERN = /[ \t]{0,3}(?:[~〜\-―–—ー‐−]|から|to|until|till)[ \t]{0,3}/iy;

/** 区切りなしで続く2つ目の時刻の前に許す空白（OCR で「〜」が抜けた「14:00 15:00」など） */
const ADJACENT_TIME_GAP_PATTERN = /[ \t]?/y;

/** 日付の後ろが行末か（空白のあとに改行が来るか）。次の行の時刻を結び付けてよいかの判定に使う */
const LINE_END_PATTERN = /[ \t]{0,20}\r?\n/y;

/**
 * 次の行の先頭の「時間の見出し」。日付と時刻が別の行に書かれたメールに対応する。
 * 例：「日付：10月22日(木)」の次の行の「時間：14時〜15時」、「Date: October 29」の次の行の「Time: 2:00–3:00 PM」
 * 見出しのない行の時刻は、別の話題の可能性があるため結び付けない。
 */
const NEXT_LINE_TIME_LABEL_PATTERN =
  /[ \t]{0,8}(?:[■□●○◆◇▼▽▶・*#>\-]{1,3}[ \t]{0,4})?(?:開始時刻|開始|時間|時刻|Start[ \t]?time|Start|Time)[ \t]{0,4}:?[ \t]{0,4}/iy;

/**
 * 文章が長すぎるときのエラー。message はそのまま利用者に表示できる文にしている。
 */
export class InputTooLongError extends Error {
  /**
   * @param {number} maxLength 受け付ける最大文字数
   */
  constructor(maxLength) {
    super(`文章が長すぎます（最大 ${maxLength.toLocaleString('ja-JP')} 文字）。日時が書かれた部分だけを貼り付けてください。`);
    this.name = 'InputTooLongError';
    this.maxLength = maxLength;
  }
}

/**
 * 文章から日時の候補を抽出する（このファイルの中心となる関数）。
 *
 * @param {string} text 貼り付けた文章（または OCR の結果）
 * @param {object} [options]
 * @param {Date} [options.now] 「今日」「明日」などの基準となる現在時刻（テストでは固定値を渡す）
 * @param {number} [options.defaultDurationMinutes] 終了時刻がないときの予定の長さ（分）
 * @returns {{candidates: Array<object>, truncated: boolean}}
 *   candidates：文章に出てきた順の候補。各候補の形は buildCandidate() の説明を参照
 *   truncated：候補が MAX_CANDIDATES 件を超えたため、残りを省いた場合 true
 * @throws {InputTooLongError} 文章が MAX_INPUT_LENGTH 文字を超える場合
 * @throws {TypeError|RangeError} 引数の形式が正しくない場合
 */
export function extractDateCandidates(text, options = {}) {
  const now = options.now ?? new Date();
  const defaultDurationMinutes = options.defaultDurationMinutes ?? DEFAULT_DURATION_MINUTES;
  validateArguments(text, now, defaultDurationMinutes);

  // 全角を半角にそろえる（文字数は変わらないので、位置は元の文章と同じ）
  const normalizedText = normalizeWidth(text);
  const current = getTokyoDateTime(now);

  const candidates = [];
  const candidatesByKey = new Map(); // 同じ日時の候補をまとめるための索引
  let truncated = false;

  // メールの送信日・受信日・引用の見出しの行の日付は予定ではないため、候補にしない（依頼者の指摘）
  const mailHeaderRanges = findMailHeaderRanges(normalizedText);

  for (const match of normalizedText.matchAll(DATE_PATTERN)) {
    if (isInRanges(match.index, mailHeaderRanges)) {
      continue;
    }
    const resolved = resolveDate(match.groups, current);
    if (resolved === null) {
      continue; // 実在しない日付（2月30日など）は候補にしない
    }

    // 日付の後ろに曜日があれば読み飛ばす。書かれた曜日が日付の本当の曜日と合わなければ警告を付ける
    // （日付は書かれたとおりに使い、利用者に確かめてもらう）
    const writtenWeekday = readWrittenWeekday(normalizedText, match, resolved.date);
    let cursor = writtenWeekday.endIndex;
    const dateWarnings = writtenWeekday.mismatch === null ? resolved.warnings : [...resolved.warnings, WARNING_WEEKDAY_MISMATCH];

    // 日付の直後（つなぎの言葉の後）に時刻があれば読み取る。なければ、次の行の「時間：」「Time:」の時刻を探す
    const timeRange =
      matchTimeRange(normalizedText, skipPattern(CONNECTOR_PATTERN, normalizedText, cursor)) ??
      matchNextLineTimeRange(normalizedText, cursor);
    const range = { start: match.index, end: timeRange === null ? cursor : timeRange.endIndex };
    const candidate = buildCandidate(resolved.date, timeRange, current, defaultDurationMinutes, dateWarnings);

    // 同じ日時がすでにあれば、新しい候補は作らず、色付けする位置だけ追加する
    const key = getCandidateKey(candidate);
    const existing = candidatesByKey.get(key);
    if (existing !== undefined) {
      existing.ranges.push(range);
      continue;
    }

    if (candidates.length >= MAX_CANDIDATES) {
      truncated = true;
      break;
    }

    const fullCandidate = {
      id: `candidate-${candidates.length}`,
      ranges: [range],
      sourceText: text.slice(range.start, range.end), // 画面表示用に、元の（全角のままの）表記を残す
      ...candidate,
    };
    candidates.push(fullCandidate);
    candidatesByKey.set(key, fullCandidate);
  }

  return { candidates, truncated };
}

/**
 * 引数を検証し、問題があれば例外を投げる。
 *
 * @param {unknown} text
 * @param {unknown} now
 * @param {unknown} defaultDurationMinutes
 */
function validateArguments(text, now, defaultDurationMinutes) {
  if (typeof text !== 'string') {
    throw new TypeError('文章は文字列で指定してください。');
  }
  if (text.length > MAX_INPUT_LENGTH) {
    throw new InputTooLongError(MAX_INPUT_LENGTH);
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('基準の日時が正しくありません。');
  }
  if (
    !Number.isInteger(defaultDurationMinutes) ||
    defaultDurationMinutes < 1 ||
    defaultDurationMinutes > MAX_DURATION_MINUTES
  ) {
    throw new RangeError('予定の長さが正しくありません。');
  }
}

/**
 * sticky 正規表現を、指定した位置から一致させる。
 *
 * @param {RegExp} pattern y フラグ付きの正規表現
 * @param {string} text 対象の文章
 * @param {number} index 一致を試す位置
 * @returns {RegExpExecArray | null} 一致しなければ null
 */
function matchAt(pattern, text, index) {
  pattern.lastIndex = index;
  return pattern.exec(text);
}

/**
 * 文章の中の「日付＋曜日」で、曜日が日付と合わないものを、日付の本当の曜日に書き換える。
 * 件名・場所の下書きに使う（例：「10月15日(水)のご訪問」→「10月15日(木)のご訪問」。2026年10月15日は木曜）。
 * 日付の読み方（年がなければ今日以降で最も近い日）は extractDateCandidates() と同じ。
 *
 * @param {string} text 下書きの文章（件名など）
 * @param {object} [options]
 * @param {Date} [options.now] 年が書かれていない日付の年を決める基準（テストでは固定値を渡す）
 * @returns {string} 曜日を直した文章（直すものがなければ元の文章のまま）
 * @throws {InputTooLongError} 文章が MAX_INPUT_LENGTH 文字を超える場合
 * @throws {TypeError} 引数の形式が正しくない場合
 */
export function correctWrittenWeekdays(text, options = {}) {
  const now = options.now ?? new Date();
  validateArguments(text, now, DEFAULT_DURATION_MINUTES);

  // 全角を半角にそろえても文字数は変わらないため、半角の文章で見つけた位置で元の文章を書き換えられる
  const normalizedText = normalizeWidth(text);
  const current = getTokyoDateTime(now);
  let corrected = '';
  let copiedUntil = 0;
  for (const match of normalizedText.matchAll(DATE_PATTERN)) {
    const resolved = resolveDate(match.groups, current);
    const mismatch = resolved === null ? null : readWrittenWeekday(normalizedText, match, resolved.date).mismatch;
    if (mismatch !== null) {
      corrected += text.slice(copiedUntil, mismatch.start) + mismatch.correctText;
      copiedUntil = mismatch.end;
    }
  }
  return corrected + text.slice(copiedUntil);
}

/**
 * 日付の直後に書かれた曜日を読み、日付の本当の曜日と合うかを確かめる。
 * 「明日」「来週火曜」の後ろの曜日は読まない（日付そのものが曜日や相対表現のため）。
 *
 * @param {string} text 半角にそろえた文章
 * @param {RegExpMatchArray} dateMatch DATE_PATTERN の一致結果
 * @param {{year: number, month: number, day: number}} date 一致した日付の年月日
 * @returns {{endIndex: number, mismatch: {start: number, end: number, correctText: string} | null}}
 *   endIndex：日付（と曜日）の直後の位置。
 *   mismatch：曜日が合わないとき、曜日の文字の位置（start〜end）と、正しい曜日の書き方。合う・曜日がないなら null
 */
function readWrittenWeekday(text, dateMatch, date) {
  const dateEnd = dateMatch.index + dateMatch[0].length;
  const { tomorrow, tomorrowEn, nextWeekWeekday } = dateMatch.groups;
  if (tomorrow !== undefined || tomorrowEn !== undefined || nextWeekWeekday !== undefined) {
    return { endIndex: dateEnd, mismatch: null };
  }
  const weekdayMatch = matchAt(WEEKDAY_PATTERN, text, dateEnd);
  if (weekdayMatch === null) {
    return { endIndex: dateEnd, mismatch: null };
  }

  const endIndex = dateEnd + weekdayMatch[0].length;
  const actualWeekday = getMondayBasedWeekday(date);
  const groupName = ['jpWeekday', 'enWeekday', 'bareWeekday'].find((name) => weekdayMatch.groups[name] !== undefined);
  const writtenText = weekdayMatch.groups[groupName];
  const isEnglish = groupName === 'enWeekday';
  const writtenWeekday = isEnglish
    ? ENGLISH_WEEKDAY_NAMES.findIndex((name) => name.slice(0, ENGLISH_WEEKDAY_ABBREVIATION_LENGTH).toLowerCase() === writtenText.slice(0, ENGLISH_WEEKDAY_ABBREVIATION_LENGTH).toLowerCase())
    : WEEKDAY_CHARACTERS.indexOf(writtenText);
  if (writtenWeekday === actualWeekday) {
    return { endIndex, mismatch: null };
  }

  const [start, end] = weekdayMatch.indices.groups[groupName];
  const correctText = isEnglish ? toEnglishWeekdayLike(writtenText, actualWeekday) : WEEKDAY_CHARACTERS[actualWeekday];
  return { endIndex, mismatch: { start, end, correctText } };
}

/**
 * 書かれた英語の曜日と同じ書き方（略称か正式名か、大文字・小文字）で、正しい曜日を作る。
 * 例：Wed → Thu、WEDNESDAY → THURSDAY、wednesday → thursday
 *
 * @param {string} writtenText 書かれた英語の曜日（Wed、Wednesday など）
 * @param {number} weekday 正しい曜日（月曜始まりの番号。月=0〜日=6）
 * @returns {string} 正しい曜日
 */
function toEnglishWeekdayLike(writtenText, weekday) {
  const fullName = ENGLISH_WEEKDAY_NAMES[weekday];
  const name = writtenText.length === ENGLISH_WEEKDAY_ABBREVIATION_LENGTH ? fullName.slice(0, ENGLISH_WEEKDAY_ABBREVIATION_LENGTH) : fullName;
  if (writtenText === writtenText.toUpperCase()) {
    return name.toUpperCase();
  }
  return writtenText[0] === writtenText[0].toLowerCase() ? name.toLowerCase() : name;
}

/**
 * 指定した位置に pattern が一致すれば、その分だけ位置を進める。
 *
 * @param {RegExp} pattern y フラグ付きの正規表現
 * @param {string} text 対象の文章
 * @param {number} index 現在の位置
 * @returns {number} 読み飛ばした後の位置（一致しなければ index のまま）
 */
function skipPattern(pattern, text, index) {
  const match = matchAt(pattern, text, index);
  return match === null ? index : index + match[0].length;
}

/**
 * 日付の一致結果から、年月日を決める。
 *
 * @param {object} groups DATE_PATTERN の名前付きグループ
 * @param {{year: number, month: number, day: number}} today 今日（東京）
 * @returns {{date: {year: number, month: number, day: number}, warnings: string[]} | null}
 *   実在しない日付なら null。warnings は日付の読み方に関する警告（月と日の順番が決まらないときなど）
 */
function resolveDate(groups, today) {
  const withoutWarning = (date) => (date === null ? null : { date, warnings: [] });

  if (groups.jpMonth !== undefined) {
    return withoutWarning(resolveCalendarDate(groups.jpYear, groups.jpMonth, groups.jpDay, today));
  }
  if (groups.ymdYear !== undefined) {
    return withoutWarning(resolveCalendarDate(groups.ymdYear, groups.ymdMonth, groups.ymdDay, today));
  }
  if (groups.mdyYear !== undefined) {
    return resolveYearLastDate(groups.mdyFirst, groups.mdySecond, groups.mdyYear);
  }
  if (groups.yymdYear !== undefined) {
    const year = String(TWO_DIGIT_YEAR_BASE + Number(groups.yymdYear));
    return withoutWarning(resolveCalendarDate(year, groups.yymdMonth, groups.yymdDay, today));
  }
  if (groups.slashMonth !== undefined) {
    return withoutWarning(resolveCalendarDate(undefined, groups.slashMonth, groups.slashDay, today));
  }
  if (groups.enMonthA !== undefined) {
    return withoutWarning(resolveCalendarDate(groups.enYearA, toEnglishMonthNumber(groups.enMonthA), groups.enDayA, today));
  }
  if (groups.enMonthB !== undefined) {
    return withoutWarning(resolveCalendarDate(groups.enYearB, toEnglishMonthNumber(groups.enMonthB), groups.enDayB, today));
  }
  if (groups.tomorrow !== undefined || groups.tomorrowEn !== undefined) {
    return withoutWarning(addDays(today, 1));
  }
  if (groups.nextWeekWeekday !== undefined) {
    return withoutWarning(resolveNextWeekWeekday(groups.nextWeekWeekday, today));
  }
  return null;
}

/**
 * 英語の月名を、月の数字（文字列）にする。
 *
 * @param {string} monthName 例：Oct、October、SEPT
 * @returns {string} 例："10"
 */
function toEnglishMonthNumber(monthName) {
  return String(ENGLISH_MONTH_NUMBERS[monthName.toLowerCase()]);
}

/**
 * 年が最後の英語圏の数字の日付（10/15/2026、15/10/2026）から年月日を決める。
 *   - 1つ目が12より大きい → 日/月（英国式）
 *   - 2つ目が12より大きい → 月/日（米国式）
 *   - どちらも12以下で違う数 → 月/日（米国式）として読み、「月と日の順番を確認」の警告を付ける（依頼者の決定）
 *
 * @param {string} firstText 1つ目の数字
 * @param {string} secondText 2つ目の数字
 * @param {string} yearText 年（4桁）
 * @returns {{date: object, warnings: string[]} | null} 実在しない日付なら null
 */
function resolveYearLastDate(firstText, secondText, yearText) {
  const first = Number(firstText);
  const second = Number(secondText);
  const year = Number(yearText);
  const isDayFirst = first > MONTHS_PER_YEAR && second <= MONTHS_PER_YEAR;
  const month = isDayFirst ? second : first;
  const day = isDayFirst ? first : second;
  if (!isValidDate(year, month, day)) {
    return null;
  }
  const isOrderAmbiguous = first <= MONTHS_PER_YEAR && second <= MONTHS_PER_YEAR && first !== second;
  return { date: { year, month, day }, warnings: isOrderAmbiguous ? [WARNING_AMBIGUOUS_ORDER] : [] };
}

/**
 * 「年・月・日」の数字から年月日を決める。年がなければ「今日以降で最も近い日」にする。
 * 例：今日が 2026/10/11 のとき、10/15 → 2026/10/15、10/5 → 2027/10/5、2/29 → 2028/2/29
 *
 * @param {string | undefined} yearText 年（記載がなければ undefined）
 * @param {string} monthText 月
 * @param {string} dayText 日
 * @param {{year: number, month: number, day: number}} today 今日（東京）
 * @returns {{year: number, month: number, day: number} | null} 実在しない日付なら null
 */
function resolveCalendarDate(yearText, monthText, dayText, today) {
  const month = parseJapaneseNumber(monthText);
  const day = parseJapaneseNumber(dayText);

  if (yearText !== undefined) {
    const year = parseJapaneseNumber(yearText);
    return isValidDate(year, month, day) ? { year, month, day } : null;
  }

  // 今年のその日がすでに過ぎていれば来年から探す
  const isPassedThisYear = compareDates({ year: today.year, month, day }, today) < 0;
  const firstYear = isPassedThisYear ? today.year + 1 : today.year;
  for (let year = firstYear; year <= firstYear + MAX_YEAR_LOOKAHEAD; year += 1) {
    if (isValidDate(year, month, day)) {
      return { year, month, day };
    }
  }
  return null;
}

/**
 * 「来週◯曜」の年月日を決める。週は月曜始まりで、「来週」は今日の次の週。
 * 例：今日が 2026/10/11（日）のとき、来週火曜 → 2026/10/13
 *
 * @param {string} weekdayCharacter 曜日の漢字（月〜日）
 * @param {{year: number, month: number, day: number}} today 今日（東京）
 * @returns {{year: number, month: number, day: number}}
 */
function resolveNextWeekWeekday(weekdayCharacter, today) {
  const targetWeekday = WEEKDAY_CHARACTERS.indexOf(weekdayCharacter);
  const mondayOfThisWeek = addDays(today, -getMondayBasedWeekday(today));
  return addDays(mondayOfThisWeek, DAYS_PER_WEEK + targetWeekday);
}

/**
 * 指定した位置から「時刻」または「時刻の範囲」を読み取る。
 *
 * @param {string} text 半角にそろえた文章
 * @param {number} index 読み取りを始める位置
 * @returns {{startTime: object, endTime: object | null, endIndex: number} | null}
 *   時刻がなければ null。endIndex は読み取った部分の直後の位置
 */
function matchTimeRange(text, index) {
  const start = matchTimeAt(text, index, null);
  if (start === null) {
    return null; // 時刻がない、または 25時 など時刻として成り立たない場合は「時刻なし」として扱う
  }
  let startTime = start.time;
  let endIndex = start.endIndex;
  let endTime = null;

  // 「午後2時〜4時」のように終了側に午前/午後がなければ、開始側の「午後」を引き継ぐ
  const inheritedMeridiem = startTime.meridiem === MERIDIEM_PM ? MERIDIEM_PM : null;

  // 区切り（〜 など）の後に時刻があれば終了時刻とする
  const separatorMatch = matchAt(RANGE_SEPARATOR_PATTERN, text, endIndex);
  if (separatorMatch !== null) {
    const end = matchTimeAt(text, endIndex + separatorMatch[0].length, inheritedMeridiem);
    if (end !== null) {
      endTime = end.time;
      endIndex = end.endIndex;
    }
    // 英語の「2:00–3:00 PM」「2-3pm」のように、後ろにだけ PM が書かれていれば、前の時刻にも当てはめる
    // （ただし「11am-1pm」のように午前と読める場合は変えない：前の時刻＋12時間が後ろの時刻より遅くなるため）
    if (
      endTime !== null &&
      endTime.isExplicitMeridiem &&
      endTime.meridiem === MERIDIEM_PM &&
      startTime.meridiem === null &&
      startTime.hour < 12 &&
      startTime.hour + 12 <= endTime.hour
    ) {
      startTime = { ...startTime, hour: startTime.hour + 12, meridiem: MERIDIEM_PM };
    }
  } else {
    // 区切りがなく時刻が2つ続く場合（OCR で「〜」が抜けた「14時15時」など）は、後ろの方が遅ければ範囲とみなす
    const followingIndex = skipPattern(ADJACENT_TIME_GAP_PATTERN, text, endIndex);
    const end = matchTimeAt(text, followingIndex, inheritedMeridiem);
    if (end !== null && toMinutesOfDay(end.time) > toMinutesOfDay(startTime)) {
      endTime = end.time;
      endIndex = end.endIndex;
    }
  }

  return { startTime, endTime, endIndex };
}

/**
 * 日付が行末にあり、次の行が「時間」「時刻」「開始」「Time」などの見出しで始まるとき、その行の時刻を読み取る。
 *
 * @param {string} text 半角にそろえた文章
 * @param {number} index 日付（と曜日）の直後の位置
 * @returns {{startTime: object, endTime: object | null, endIndex: number} | null} 時刻がなければ null
 */
function matchNextLineTimeRange(text, index) {
  const lineEnd = matchAt(LINE_END_PATTERN, text, index);
  if (lineEnd === null) {
    return null; // 日付の後ろに別の言葉がある（行末ではない）
  }
  const nextLineIndex = index + lineEnd[0].length;
  const label = matchAt(NEXT_LINE_TIME_LABEL_PATTERN, text, nextLineIndex);
  if (label === null) {
    return null; // 時間の見出しがない
  }
  return matchTimeRange(text, nextLineIndex + label[0].length);
}

/**
 * 指定した位置から時刻を1つ読み取る。
 * 時間帯の言葉（朝・夜など）があり、その後に時刻が続けば「夜7時→19時」のように言葉を手がかりにする。
 * 時刻が続かなければ、言葉の既定の時刻（夜→18時など）にする。
 *
 * @param {string} text 半角にそろえた文章
 * @param {number} index 読み取りを始める位置
 * @param {string | null} inheritedMeridiem 記載がないときに使う午前/午後（終了時刻用）
 * @returns {{time: {hour: number, minute: number, meridiem: string | null}, endIndex: number} | null}
 */
function matchTimeAt(text, index, inheritedMeridiem) {
  const wordMatch = matchAt(TIME_WORD_PATTERN, text, index);
  if (wordMatch !== null) {
    const word = wordMatch.groups.word;
    const wordEndIndex = index + wordMatch[0].length;
    if (word !== '正午') {
      const timeIndex = skipPattern(TIME_WORD_GAP_PATTERN, text, wordEndIndex);
      const timeMatch = matchAt(TIME_PATTERN, text, timeIndex);
      const time = timeMatch === null ? null : parseTime(timeMatch.groups, inheritedMeridiem, word);
      if (time !== null) {
        return { time, endIndex: timeIndex + timeMatch[0].length };
      }
    }
    return { time: { ...TIME_WORD_DEFAULTS[word] }, endIndex: wordEndIndex };
  }

  const timeMatch = matchAt(TIME_PATTERN, text, index);
  const time = timeMatch === null ? null : parseTime(timeMatch.groups, inheritedMeridiem, null);
  return time === null ? null : { time, endIndex: index + timeMatch[0].length };
}

/**
 * 時刻を、その日の 0:00 からの分数にする（2つの時刻の前後を比べるため）。
 *
 * @param {{hour: number, minute: number}} time
 * @returns {number}
 */
function toMinutesOfDay(time) {
  return time.hour * MINUTES_PER_HOUR + time.minute;
}

/**
 * 午前/午後の表記を「午前」「午後」にそろえる。
 *
 * @param {string | undefined} text 午前 / 午後 / AM / PM / a.m. / p.m.（大文字・小文字を問わない）
 * @returns {string | null} 午前 / 午後。記載がなければ null
 */
function normalizeMeridiem(text) {
  if (text === undefined) {
    return null;
  }
  if (text === MERIDIEM_AM || text === MERIDIEM_PM) {
    return text;
  }
  return text.replaceAll('.', '').toUpperCase() === 'AM' ? MERIDIEM_AM : MERIDIEM_PM;
}

/**
 * 時間帯の言葉から、続く時刻の午前/午後を推定する。
 * 推定するのは 1〜11時のように午前と午後のどちらにも読める時刻だけで、
 * 「朝17時」「昼17時」のように言葉と食い違う書き方は、書かれている時刻を優先する（要件§12）。
 *   朝 → 午前、夕方・夜 → 午後（夜7時＝19時）、昼 → 1〜6時なら午後（昼1時＝13時）
 *
 * @param {string | null} word 時間帯の言葉
 * @param {number} rawHour 書かれていた時
 * @returns {string | null} 推定した午前/午後。推定しない場合は null（書かれた時刻をそのまま使う）
 */
function meridiemFromTimeWord(word, rawHour) {
  if (rawHour > AMBIGUOUS_HOUR_MAX) return null;
  if (word === '朝') return MERIDIEM_AM;
  if (word === '夕方' || word === '夜') return MERIDIEM_PM;
  if (word === '昼' && rawHour <= NOON_WORD_PM_MAX_HOUR) return MERIDIEM_PM;
  return null;
}

/**
 * 時刻の一致結果を、24時間制の時・分に変換する。
 * 午前/午後は「書かれた表記（前・後ろ）」→「時間帯の言葉」→「開始側からの引き継ぎ」の順に決める。
 *
 * @param {object} groups TIME_PATTERN の名前付きグループ
 * @param {string | null} inheritedMeridiem 記載がないときに使う午前/午後（終了時刻用）
 * @param {string | null} timeWord 直前にあった時間帯の言葉（朝・夜など）。なければ null
 * @returns {{hour: number, minute: number, meridiem: string | null, isExplicitMeridiem: boolean} | null}
 *   meridiem は実際に使った午前/午後（なければ null）。isExplicitMeridiem は午前/午後が文章に書かれていたか。
 *   時刻として成り立たなければ null
 */
function parseTime(groups, inheritedMeridiem, timeWord) {
  const rawHour = parseJapaneseNumber(groups.colonHour ?? groups.kanjiHour ?? groups.bareHour ?? groups.rangeStartHour);

  let minute = 0;
  if (groups.colonMinute !== undefined) {
    minute = Number(groups.colonMinute);
  } else if (groups.kanjiMinute !== undefined) {
    minute = parseJapaneseNumber(groups.kanjiMinute);
  } else if (groups.half !== undefined) {
    minute = HALF_HOUR_MINUTES;
  }

  const explicitMeridiem = normalizeMeridiem(groups.meridiem ?? groups.suffixMeridiem);
  const meridiem = explicitMeridiem ?? meridiemFromTimeWord(timeWord, rawHour) ?? inheritedMeridiem;
  const hour = applyMeridiem(rawHour, meridiem);
  if (!Number.isInteger(rawHour) || !Number.isInteger(minute) || hour === null || minute > 59) {
    return null;
  }
  return { hour, minute, meridiem, isExplicitMeridiem: explicitMeridiem !== null };
}

/**
 * 午前/午後を反映した24時間制の「時」を返す。
 * 午前12時 → 0時、午後12時 → 12時（英語の AM/PM と同じ考え方）。
 * 「午後13時」のような書き方は13時として受け付ける。
 *
 * @param {number} hour 書かれていた時
 * @param {string | null} meridiem 午前 / 午後 / null
 * @returns {number | null} 0〜23。成り立たない場合は null
 */
function applyMeridiem(hour, meridiem) {
  if (meridiem === MERIDIEM_AM) {
    if (hour <= 11) return hour;
    if (hour === 12) return 0;
    return null;
  }
  if (meridiem === MERIDIEM_PM) {
    if (hour <= 11) return hour + 12;
    if (hour <= 23) return hour;
    return null;
  }
  return hour <= 23 ? hour : null;
}

/**
 * 年月日と時刻の読み取り結果から、候補の本体を作る。
 *
 * @param {{year: number, month: number, day: number}} date 開始日
 * @param {{startTime: object, endTime: object | null} | null} timeRange 時刻（なければ null）
 * @param {{year: number, month: number, day: number, hour: number, minute: number}} current 現在の東京の日時
 * @param {number} defaultDurationMinutes 終了時刻がないときの予定の長さ（分）
 * @param {string[]} [dateWarnings] 日付の読み方に関する警告（WARNING_AMBIGUOUS_ORDER、WARNING_WEEKDAY_MISMATCH など）
 * @returns {{
 *   hasTime: boolean,        時刻の記載があるか（false なら日付だけ。画面で終日か時刻指定かを尋ねる）
 *   start: object,           開始日時 {year, month, day, hour, minute}。hasTime が false なら hour/minute は null
 *   end: object | null,      終了日時。hasTime が false なら null
 *   endInferred: boolean,    終了時刻を既定の長さで補ったか
 *   warnings: string[]       警告コード（WARNING_PAST など）
 * }}
 */
function buildCandidate(date, timeRange, current, defaultDurationMinutes, dateWarnings = []) {
  const warnings = [...dateWarnings];

  if (timeRange === null) {
    if (compareDates(date, current) < 0) {
      warnings.push(WARNING_PAST);
    }
    return {
      hasTime: false,
      start: { ...date, hour: null, minute: null },
      end: null,
      endInferred: false,
      warnings,
    };
  }

  const start = { ...date, hour: timeRange.startTime.hour, minute: timeRange.startTime.minute };
  const { end, endInferred } = resolveEnd(start, timeRange, defaultDurationMinutes);
  if (compareDateTimes(start, current) < 0) {
    warnings.push(WARNING_PAST);
  }
  return { hasTime: true, start, end, endInferred, warnings };
}

/**
 * 終了日時を決める。
 *   - 終了時刻がない、または開始と同じ → 開始 + 既定の長さ
 *   - 「11時〜1時」のように終了が開始より前で、午前/午後の記載がない → 12時間足す（13時）
 *   - それでも開始より前（例：22時〜1時）→ 翌日の時刻とみなす
 *
 * @param {object} start 開始日時
 * @param {{startTime: object, endTime: object | null}} timeRange 時刻の読み取り結果
 * @param {number} defaultDurationMinutes 既定の予定の長さ（分）
 * @returns {{end: object, endInferred: boolean}}
 */
function resolveEnd(start, timeRange, defaultDurationMinutes) {
  const { startTime, endTime } = timeRange;
  if (endTime === null) {
    return { end: addMinutes(start, defaultDurationMinutes), endInferred: true };
  }

  const startMinutes = startTime.hour * MINUTES_PER_HOUR + startTime.minute;
  let endMinutes = endTime.hour * MINUTES_PER_HOUR + endTime.minute;

  if (
    endMinutes <= startMinutes &&
    endTime.meridiem === null &&
    endTime.hour < 12 &&
    endMinutes + HALF_DAY_MINUTES > startMinutes
  ) {
    endMinutes += HALF_DAY_MINUTES;
  }
  if (endMinutes === startMinutes) {
    return { end: addMinutes(start, defaultDurationMinutes), endInferred: true };
  }
  if (endMinutes < startMinutes) {
    endMinutes += MINUTES_PER_DAY; // 日付をまたぐ
  }
  return { end: addMinutes(start, endMinutes - startMinutes), endInferred: false };
}

/**
 * 同じ日時の候補を見分けるためのキーを作る。
 *
 * @param {{hasTime: boolean, start: object, end: object | null}} candidate
 * @returns {string}
 */
function getCandidateKey(candidate) {
  return JSON.stringify([candidate.hasTime, candidate.start, candidate.end]);
}
