/**
 * dateUtils.js
 * 目的：年月日・時分の計算をまとめる。
 *
 * 日時は { year, month, day, hour, minute } の数値オブジェクトで扱う（month は 1〜12）。
 * Date オブジェクトをそのまま使うと PC のタイムゾーン設定の影響を受けるため、
 * 計算には Date.UTC を「暦の計算機」としてだけ使い、結果をすぐ数値に戻す。
 */

/** 予定のタイムゾーン（要件§12：Asia/Tokyo 固定） */
export const CALENDAR_TIME_ZONE = 'Asia/Tokyo';

/** 1時間の分数 */
export const MINUTES_PER_HOUR = 60;

/** 1日の分数 */
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** 1週間の日数 */
export const DAYS_PER_WEEK = 7;

/** 曜日の漢字。文字の位置が「月曜=0 〜 日曜=6」の曜日番号に対応する */
export const WEEKDAY_CHARACTERS = '月火水木金土日';

/** 1分のミリ秒数 */
const MILLISECONDS_PER_MINUTE = 60 * 1000;

/** 東京の年月日時分を取り出すための書式。作成に時間がかかるため1つを使い回す */
const tokyoDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CALENDAR_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23', // 0〜23時で表す（深夜0時を「24時」と表さない）
});

/**
 * 指定した瞬間の、東京における年月日時分を返す。
 * PC のタイムゾーン設定に関係なく、常に東京の日時になる。
 *
 * @param {Date} instant 基準となる瞬間（通常は現在時刻 new Date()）
 * @returns {{year: number, month: number, day: number, hour: number, minute: number}}
 */
export function getTokyoDateTime(instant) {
  const parts = {};
  for (const part of tokyoDateTimeFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

/**
 * 年月日が実在する日付かどうかを調べる（2月30日、4月31日などを除外する）。
 *
 * @param {number} year 年（西暦4桁）
 * @param {number} month 月（1〜12）
 * @param {number} day 日（1〜31）
 * @returns {boolean} 実在する日付なら true
 */
export function isValidDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  // 存在しない日付は Date.UTC が翌月へ繰り越すため、元の値と一致するかで判定する
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * 年月日に日数を足した年月日を返す（月末・年末の繰り上がりも計算する）。
 *
 * @param {{year: number, month: number, day: number}} date 元の年月日
 * @param {number} days 足す日数（負の数なら引く）
 * @returns {{year: number, month: number, day: number}}
 */
export function addDays(date, days) {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  };
}

/**
 * 年月日時分に分数を足した年月日時分を返す（日付をまたぐ場合も計算する）。
 *
 * @param {{year: number, month: number, day: number, hour: number, minute: number}} dateTime 元の日時
 * @param {number} minutes 足す分数
 * @returns {{year: number, month: number, day: number, hour: number, minute: number}}
 */
export function addMinutes(dateTime, minutes) {
  const result = new Date(
    Date.UTC(
      dateTime.year,
      dateTime.month - 1,
      dateTime.day,
      dateTime.hour,
      dateTime.minute + minutes,
    ),
  );
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
    hour: result.getUTCHours(),
    minute: result.getUTCMinutes(),
  };
}

/**
 * 2つの年月日時分の差を分で返す（to − from）。
 *
 * @param {{year: number, month: number, day: number, hour: number, minute: number}} from 起点の日時
 * @param {{year: number, month: number, day: number, hour: number, minute: number}} to 終点の日時
 * @returns {number} to が from より後なら正、前なら負
 */
export function diffMinutes(from, to) {
  const toEpochMinutes = (dateTime) =>
    Date.UTC(dateTime.year, dateTime.month - 1, dateTime.day, dateTime.hour, dateTime.minute) /
    MILLISECONDS_PER_MINUTE;
  return toEpochMinutes(to) - toEpochMinutes(from);
}

/**
 * 曜日番号を返す。週は月曜始まり（要件§12）。
 *
 * @param {{year: number, month: number, day: number}} date 年月日
 * @returns {number} 月曜=0, 火曜=1, … 日曜=6
 */
export function getMondayBasedWeekday(date) {
  const sundayBasedWeekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay(); // 日曜=0
  return (sundayBasedWeekday + 6) % DAYS_PER_WEEK;
}

/**
 * 2つの年月日を比べる（時分は見ない）。
 *
 * @param {{year: number, month: number, day: number}} a
 * @param {{year: number, month: number, day: number}} b
 * @returns {number} a が前なら負、同じなら 0、a が後なら正
 */
export function compareDates(a, b) {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/**
 * 2つの年月日時分を比べる。
 *
 * @param {{year: number, month: number, day: number, hour: number, minute: number}} a
 * @param {{year: number, month: number, day: number, hour: number, minute: number}} b
 * @returns {number} a が前なら負、同じなら 0、a が後なら正
 */
export function compareDateTimes(a, b) {
  return compareDates(a, b) || a.hour - b.hour || a.minute - b.minute;
}
