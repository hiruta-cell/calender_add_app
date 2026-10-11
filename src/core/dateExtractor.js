/**
 * dateExtractor.js
 * 目的：貼り付けた文章（または OCR の結果）から、予定の日時の候補を抽出する。
 *
 * - PC 内で完結するルール処理（正規表現）だけを使い、文章を外部へ送らない（要件§5.2）。
 * - 画面（React）や Electron に依存しない純粋な関数にして、単体テストできるようにしている。
 *
 * 対応する書き方（要件§5.7・§12）：
 *   日付：10/15、10月15日、2026年10月15日、明日、来週火曜（来週の火曜日）
 *   曜日：日付の後の (木)、(木曜日)、(月・祝)、木曜日 は読み飛ばす
 *   時刻：14:00、14時、14時30分、14時半、午前/午後、全角数字、3pm・3:00 PM・PM3:00（英語の AM/PM）
 *   時間帯：正午(12時)、朝(9時)、昼(11時)、夕方(15時)、夜(18時)。「夜7時」→19時のように手がかりにもする
 *   範囲：14時〜15時、15:00-16:00、14時から15時
 * 対象外：複数日にまたがる範囲（10/15〜10/17）
 *
 * 判定のルール：
 *   - 年の記載がない日付は「今日以降で最も近い日」にする（要件§12）
 *   - 「来週」は月曜始まりの週で、今日の次の週（要件§12）
 *   - 終了時刻がない予定は既定の長さ（60分）にする（要件§5.4）
 *   - 過去の日時には警告を付ける（要件§12）
 */

import { normalizeWidth } from './textNormalizer.js';
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
 * 日付の書き方に一致する正規表現（文章全体から探すため g フラグ、漢字の判定に u フラグ）。
 * 名前付きグループで、どの書き方に一致したかを区別する。
 *   jpYear / jpMonth / jpDay … 2026年10月15日、10月15日
 *   slashMonth / slashDay    … 10/15（前後に数字や / が続くもの（2026/10/15、1/2/3 など）は除外）
 *   tomorrow                 … 明日（直前が漢字のものは除外。「説明日程」の「明日」を誤認しないため）
 *   nextWeekWeekday          … 来週火曜、来週の火曜日（「再来週」は除外。1週間ずれるのを防ぐため）
 * 量指定子はすべて上限付きにして、入力が長くても処理時間が急増しないようにしている（ReDoS 対策）。
 */
const DATE_PATTERN = new RegExp(
  [
    String.raw`(?<!\d)(?:(?<jpYear>\d{4})[ \t]?年[ \t]?)?(?<jpMonth>\d{1,2})[ \t]?月[ \t]?(?<jpDay>\d{1,2})[ \t]?日`,
    String.raw`(?<![\d/])(?<slashMonth>\d{1,2})/(?<slashDay>\d{1,2})(?![\d/])`,
    String.raw`(?<!\p{Script=Han})(?<tomorrow>明日)`,
    String.raw`(?<!再)来週[ \t]?(?:の[ \t]?)?(?<nextWeekWeekday>[月火水木金土日])曜日?`,
  ].join('|'),
  'gu',
);

/**
 * 日付の直後にある曜日の表記（読み飛ばすため）。例：(木) (木曜日) (月・祝) 木曜日
 * y（sticky）フラグ：lastIndex で指定した位置からだけ一致を試す。
 */
const WEEKDAY_PATTERN =
  /[ \t]{0,3}(?:\([ \t]{0,2}[月火水木金土日](?:曜日?)?(?:[ \t]{0,2}[・･][ \t]{0,2}祝日?)?[ \t]{0,2}\)|[月火水木金土日]曜日?)/y;

/** 日付と時刻の間のつなぎ（空白、「の」「は」「、」など）。例：「明日の14時」「10/15、14:00」 */
const CONNECTOR_PATTERN = /[ \t]{0,3}(?:[のは、,][ \t]{0,3})?/y;

/**
 * 時刻の書き方。i フラグ：英語の AM/PM を大文字・小文字どちらでも受け付ける。
 *   meridiem                  … 前に付く 午前 / 午後 / AM / PM / a.m. / p.m.
 *   colonHour / colonMinute   … 14:00（分は2桁）
 *   kanjiHour / kanjiMinute   … 14時、14時30分（「1時間」の「時」は時刻ではないので除外）
 *   half                      … 14時半
 *   bareHour                  … 3pm の「3」（後ろに AM/PM があるときだけ）
 *   suffixMeridiem            … 後ろに付く AM / PM（3pm、3:00 PM）
 */
const TIME_PATTERN =
  /(?:(?<meridiem>午前|午後|A\.M\.|P\.M\.|AM|PM)[ \t]{0,2})?(?:(?<colonHour>\d{1,2}):(?<colonMinute>\d{2})(?!\d)|(?<kanjiHour>\d{1,2})時(?!間)(?:[ \t]{0,2}(?<kanjiMinute>\d{1,2})分|(?<half>半))?|(?<bareHour>\d{1,2})(?=[ \t]{0,2}(?:A\.M\.|P\.M\.|AM|PM)(?![A-Z])))(?:[ \t]{0,2}(?<suffixMeridiem>A\.M\.|P\.M\.|AM|PM)(?![A-Z]))?/iy;

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

/** 開始時刻と終了時刻の区切り。例：〜 ~ - ― – — ー ‐ − から */
const RANGE_SEPARATOR_PATTERN = /[ \t]{0,3}(?:[~〜\-―–—ー‐−]|から)[ \t]{0,3}/y;

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

  for (const match of normalizedText.matchAll(DATE_PATTERN)) {
    const date = resolveDate(match.groups, current);
    if (date === null) {
      continue; // 実在しない日付（2月30日など）は候補にしない
    }

    // 数字の日付の後ろに曜日があれば読み飛ばす
    let cursor = match.index + match[0].length;
    if (match.groups.jpMonth !== undefined || match.groups.slashMonth !== undefined) {
      cursor = skipPattern(WEEKDAY_PATTERN, normalizedText, cursor);
    }

    // 日付の直後（つなぎの言葉の後）に時刻があれば読み取る
    const timeRange = matchTimeRange(normalizedText, skipPattern(CONNECTOR_PATTERN, normalizedText, cursor));
    const range = { start: match.index, end: timeRange === null ? cursor : timeRange.endIndex };
    const candidate = buildCandidate(date, timeRange, current, defaultDurationMinutes);

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
 * @returns {{year: number, month: number, day: number} | null} 実在しない日付なら null
 */
function resolveDate(groups, today) {
  if (groups.jpMonth !== undefined) {
    return resolveCalendarDate(groups.jpYear, groups.jpMonth, groups.jpDay, today);
  }
  if (groups.slashMonth !== undefined) {
    return resolveCalendarDate(undefined, groups.slashMonth, groups.slashDay, today);
  }
  if (groups.tomorrow !== undefined) {
    return addDays(today, 1);
  }
  if (groups.nextWeekWeekday !== undefined) {
    return resolveNextWeekWeekday(groups.nextWeekWeekday, today);
  }
  return null;
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
  const month = Number(monthText);
  const day = Number(dayText);

  if (yearText !== undefined) {
    const year = Number(yearText);
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
  const startTime = start.time;
  let endIndex = start.endIndex;
  let endTime = null;

  // 区切り（〜 など）の後に時刻があれば終了時刻とする
  const separatorMatch = matchAt(RANGE_SEPARATOR_PATTERN, text, endIndex);
  if (separatorMatch !== null) {
    // 「午後2時〜4時」のように終了側に午前/午後がなければ、開始側の「午後」を引き継ぐ
    const inheritedMeridiem = startTime.meridiem === MERIDIEM_PM ? MERIDIEM_PM : null;
    const end = matchTimeAt(text, endIndex + separatorMatch[0].length, inheritedMeridiem);
    if (end !== null) {
      endTime = end.time;
      endIndex = end.endIndex;
    }
  }

  return { startTime, endTime, endIndex };
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
 * @returns {{hour: number, minute: number, meridiem: string | null} | null}
 *   meridiem は実際に使った午前/午後（なければ null）。時刻として成り立たなければ null
 */
function parseTime(groups, inheritedMeridiem, timeWord) {
  const rawHour = Number(groups.colonHour ?? groups.kanjiHour ?? groups.bareHour);

  let minute = 0;
  if (groups.colonMinute !== undefined) {
    minute = Number(groups.colonMinute);
  } else if (groups.kanjiMinute !== undefined) {
    minute = Number(groups.kanjiMinute);
  } else if (groups.half !== undefined) {
    minute = HALF_HOUR_MINUTES;
  }

  const meridiem =
    normalizeMeridiem(groups.meridiem ?? groups.suffixMeridiem) ??
    meridiemFromTimeWord(timeWord, rawHour) ??
    inheritedMeridiem;
  const hour = applyMeridiem(rawHour, meridiem);
  if (hour === null || minute > 59) {
    return null;
  }
  return { hour, minute, meridiem };
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
 * @returns {{
 *   hasTime: boolean,        時刻の記載があるか（false なら日付だけ。画面で終日か時刻指定かを尋ねる）
 *   start: object,           開始日時 {year, month, day, hour, minute}。hasTime が false なら hour/minute は null
 *   end: object | null,      終了日時。hasTime が false なら null
 *   endInferred: boolean,    終了時刻を既定の長さで補ったか
 *   warnings: string[]       警告コード（WARNING_PAST など）
 * }}
 */
function buildCandidate(date, timeRange, current, defaultDurationMinutes) {
  const warnings = [];

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
