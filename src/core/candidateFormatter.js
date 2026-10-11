/**
 * candidateFormatter.js
 * 目的：抽出した日時の候補を、画面に表示する文字列に整える。
 */

import { WARNING_AMBIGUOUS_ORDER, WARNING_PAST, WARNING_WEEKDAY_MISMATCH } from './dateExtractor.js';
import { MINUTES_PER_HOUR, WEEKDAY_CHARACTERS, addMinutes, compareDates, getMondayBasedWeekday } from './dateUtils.js';

/** 警告コードと、利用者に表示する文の対応表 */
export const WARNING_MESSAGES = Object.freeze({
  [WARNING_PAST]: '過去の日時です',
  [WARNING_AMBIGUOUS_ORDER]: '月と日の順番を確認してください（月/日として読みました）',
  [WARNING_WEEKDAY_MISMATCH]: '書かれた曜日と日付が合いません。日付を確認してください',
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
 * 候補の日時を1行の文字列にする（終了は画面で選ぶため、開始だけを表示する）。
 *   時刻あり：2026年10月15日(木) 14:00
 *   時刻なし：2026年10月15日(木)
 *
 * @param {{hasTime: boolean, start: object}} candidate dateExtractor.js が返す候補
 * @returns {string}
 */
export function formatCandidateLabel(candidate) {
  const startDateLabel = formatDateLabel(candidate.start);
  return candidate.hasTime ? `${startDateLabel} ${formatTimeLabel(candidate.start)}` : startDateLabel;
}

/**
 * 終了の選択の1項目を「1時間30分後（15:30）」の形にする。
 *   開始時刻が分からない（日付だけの候補で未入力）ときは「1時間30分後」だけ。
 *   日をまたぐときは「（翌日 01:00）」とする（長さは最大23時間30分なので、終了は同じ日か翌日）。
 *
 * @param {number} durationMinutes 開始からの長さ（分。30分刻み）
 * @param {{year: number, month: number, day: number, hour: number, minute: number} | null} start 開始日時（分からなければ null）
 * @returns {string}
 */
export function formatEndChoiceLabel(durationMinutes, start) {
  const hours = Math.floor(durationMinutes / MINUTES_PER_HOUR);
  const minutes = durationMinutes % MINUTES_PER_HOUR;
  const durationLabel = `${hours > 0 ? `${hours}時間` : ''}${minutes > 0 ? `${minutes}分` : ''}後`;
  if (start === null) {
    return durationLabel;
  }
  const end = addMinutes(start, durationMinutes);
  const dayLabel = compareDates(start, end) === 0 ? '' : '翌日 ';
  return `${durationLabel}（${dayLabel}${formatTimeLabel(end)}）`;
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
