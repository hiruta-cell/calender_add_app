/**
 * candidateFormatter.js
 * 目的：抽出した日時の候補を、画面に表示する文字列に整える。
 */

import { WARNING_PAST } from './dateExtractor.js';
import { WEEKDAY_CHARACTERS, compareDates, getMondayBasedWeekday } from './dateUtils.js';

/** 警告コードと、利用者に表示する文の対応表 */
export const WARNING_MESSAGES = Object.freeze({
  [WARNING_PAST]: '過去の日時です',
});

/** 対応表にない警告コードのときに表示する文 */
const UNKNOWN_WARNING_MESSAGE = '内容を確認してください';

/**
 * 数字を2桁にそろえる。例：9 → "09"
 *
 * @param {number} value
 * @returns {string}
 */
function padTwoDigits(value) {
  return String(value).padStart(2, '0');
}

/**
 * 年月日を「2026年10月15日(木)」の形にする。
 *
 * @param {{year: number, month: number, day: number}} date
 * @returns {string}
 */
export function formatDateLabel(date) {
  const weekday = WEEKDAY_CHARACTERS[getMondayBasedWeekday(date)];
  return `${date.year}年${date.month}月${date.day}日(${weekday})`;
}

/**
 * 時分を「14:00」の形にする。
 *
 * @param {{hour: number, minute: number}} time
 * @returns {string}
 */
export function formatTimeLabel(time) {
  return `${padTwoDigits(time.hour)}:${padTwoDigits(time.minute)}`;
}

/**
 * 候補の日時を1行の文字列にする。
 *   時刻あり：2026年10月15日(木) 14:00〜15:00
 *   日をまたぐ：2026年10月15日(木) 23:00〜2026年10月16日(金) 01:00
 *   時刻なし：2026年10月15日(木)
 *
 * @param {{hasTime: boolean, start: object, end: object | null}} candidate dateExtractor.js が返す候補
 * @returns {string}
 */
export function formatCandidateLabel(candidate) {
  const startDateLabel = formatDateLabel(candidate.start);
  if (!candidate.hasTime) {
    return startDateLabel;
  }
  const isSameDay = compareDates(candidate.start, candidate.end) === 0;
  const endLabel = isSameDay
    ? formatTimeLabel(candidate.end)
    : `${formatDateLabel(candidate.end)} ${formatTimeLabel(candidate.end)}`;
  return `${startDateLabel} ${formatTimeLabel(candidate.start)}〜${endLabel}`;
}

/**
 * 警告コードを、利用者に表示する文に変換する。
 *
 * @param {string} warningCode 例：WARNING_PAST
 * @returns {string}
 */
export function describeWarning(warningCode) {
  return Object.hasOwn(WARNING_MESSAGES, warningCode)
    ? WARNING_MESSAGES[warningCode]
    : UNKNOWN_WARNING_MESSAGE;
}

/**
 * 登録した予定（calendarUrl.js の予定の形）の日時を1行の文字列にする。
 *   時刻あり：2026年10月15日(木) 14:00〜15:00　終日：2026年10月15日(木) 終日
 *
 * @param {{allDay: boolean, start: object, end: object | null}} event
 * @returns {string}
 */
export function formatEventLabel(event) {
  if (event.allDay) {
    return `${formatDateLabel(event.start)} 終日`;
  }
  return formatCandidateLabel({ hasTime: true, start: event.start, end: event.end });
}
