/**
 * calendarUrl.js
 * 目的：Googleカレンダーの「予定作成画面」を開く URL（リンク方式。要件§5.6）を組み立て、検証する。
 *
 * - 画面（登録前の確認）とメインプロセス（ブラウザで開く直前の最終確認）の両方で使う。
 * - リンクの形式は非公式資料に基づく（要件§5.6）：
 *   https://calendar.google.com/calendar/render?action=TEMPLATE&text=件名&dates=開始/終了&details=メモ&location=場所&ctz=Asia/Tokyo
 * - URL は URL / URLSearchParams で組み立て、各値をエンコードする（文字列の連結で作らない：CLAUDE.md）。
 */

import {
  CALENDAR_TIME_ZONE,
  MINUTES_PER_DAY,
  addDays,
  diffMinutes,
  isValidDate,
} from './dateUtils.js';

/** 予定作成画面の URL（クエリより前の部分） */
export const CALENDAR_BASE_URL = 'https://calendar.google.com/calendar/render';

/** 開いてよい URL のホストとパス（許可リスト：CLAUDE.md） */
const ALLOWED_HOST = 'calendar.google.com';
const ALLOWED_PATH = '/calendar/render';

/** 件名の最大文字数 */
export const MAX_TITLE_LENGTH = 120;
/** 場所（入力欄）の最大文字数 */
export const MAX_LOCATION_TEXT_LENGTH = 150;
/** オンライン会議 URL の最大文字数（Teams の URL は300文字程度になるため余裕を持たせる） */
export const MAX_MEETING_URL_LENGTH = 1000;
/** メモ（入力欄）の最大文字数 */
export const MAX_MEMO_LENGTH = 600;
/** 予定の「場所」に送る文字の最大数（場所が空のときは会議 URL が入るため、URL の上限に合わせる） */
export const MAX_LOCATION_LENGTH = MAX_MEETING_URL_LENGTH;
/** 予定の「メモ」に送る文字の最大数（メモ＋会議 URL＋元の文章の抜粋） */
export const MAX_DETAILS_LENGTH = 2000;
/** 組み立てた URL の最大文字数。長すぎると Google 側で開けないため、超えたら登録を止める */
export const MAX_CALENDAR_URL_LENGTH = 8000;
/** 予定の長さの上限（分）。抽出・手入力のどちらでも1日以内になる */
export const MAX_EVENT_DURATION_MINUTES = MINUTES_PER_DAY;

/** 受け付ける年の範囲（明らかにおかしい年を弾く） */
const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

/**
 * 取り除く文字：改行・タブ以外の制御文字と、文字の表示順を入れ替える制御文字（なりすましに使われる）。
 */
const UNSAFE_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‎‏‪-‮⁦-⁩]/g;

/**
 * 登録内容に問題があるときのエラー。message はそのまま利用者に表示できる文にしている。
 */
export class CalendarEventError extends Error {
  /**
   * @param {string} message 利用者に表示する文
   */
  constructor(message) {
    super(message);
    this.name = 'CalendarEventError';
  }
}

/**
 * 1行の文字列を整える（危険な制御文字を除き、改行・タブを空白にし、前後の空白を除く）。
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeSingleLine(text) {
  return text.replace(UNSAFE_CHARACTER_PATTERN, '').replace(/[\r\n\t]+/g, ' ').trim();
}

/**
 * 複数行の文字列を整える（改行は残し、危険な制御文字を除き、タブを空白にする）。
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeMultiLine(text) {
  return text.replace(/\r\n?/g, '\n').replace(UNSAFE_CHARACTER_PATTERN, '').replace(/\t/g, ' ').trim();
}

/**
 * 文字列の項目を検証して整える。
 *
 * @param {unknown} value 検証する値
 * @param {string} label 利用者に表示する項目名
 * @param {number} maxLength 最大文字数
 * @param {(text: string) => string} sanitize 整える関数
 * @returns {string}
 */
function requireText(value, label, maxLength, sanitize) {
  if (typeof value !== 'string') {
    throw new CalendarEventError(`${label}の形式が正しくありません。`);
  }
  if (value.length > maxLength) {
    throw new CalendarEventError(`${label}が長すぎます（最大 ${maxLength} 文字）。`);
  }
  return sanitize(value);
}

/**
 * 日時の項目を検証して整える。
 *
 * @param {unknown} value {year, month, day, hour, minute}
 * @param {string} label 利用者に表示する項目名（開始／終了）
 * @param {boolean} requireTime 時刻も必要か（終日なら false）
 * @returns {{year: number, month: number, day: number, hour: number | null, minute: number | null}}
 */
function requireDateTime(value, label, requireTime) {
  if (value === null || typeof value !== 'object') {
    throw new CalendarEventError(`${label}の日時の形式が正しくありません。`);
  }
  const { year, month, day, hour, minute } = value;
  if (!isValidDate(year, month, day) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new CalendarEventError(`${label}の日付が正しくありません。`);
  }
  if (!requireTime) {
    return { year, month, day, hour: null, minute: null };
  }
  const isValidTime =
    Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59;
  if (!isValidTime) {
    throw new CalendarEventError(`${label}の時刻が正しくありません。`);
  }
  return { year, month, day, hour, minute };
}

/**
 * 予定の内容を検証し、整えた内容を返す。問題があれば CalendarEventError を投げる。
 * メインプロセスでは、画面から届いた値をこの関数で必ず検証してから使う（CLAUDE.md：IPC の引数の検証）。
 *
 * @param {unknown} rawEvent {title, location, details, allDay, start, end}
 * @returns {{title: string, location: string, details: string, allDay: boolean, start: object, end: object | null}}
 *   終日なら end は null（終了日はURLを作るときに翌日として計算する）
 */
export function validateCalendarEvent(rawEvent) {
  if (rawEvent === null || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
    throw new CalendarEventError('登録内容の形式が正しくありません。');
  }
  if (typeof rawEvent.allDay !== 'boolean') {
    throw new CalendarEventError('終日かどうかの指定が正しくありません。');
  }
  const title = requireText(rawEvent.title, '件名', MAX_TITLE_LENGTH, sanitizeSingleLine);
  const location = requireText(rawEvent.location, '場所', MAX_LOCATION_LENGTH, sanitizeSingleLine);
  const details = requireText(rawEvent.details, 'メモ', MAX_DETAILS_LENGTH, sanitizeMultiLine);
  const start = requireDateTime(rawEvent.start, '開始', !rawEvent.allDay);

  if (rawEvent.allDay) {
    return { title, location, details, allDay: true, start, end: null };
  }

  const end = requireDateTime(rawEvent.end, '終了', true);
  const durationMinutes = diffMinutes(start, end);
  if (durationMinutes <= 0) {
    throw new CalendarEventError('終了日時は開始日時より後にしてください。');
  }
  if (durationMinutes > MAX_EVENT_DURATION_MINUTES) {
    throw new CalendarEventError('予定の長さは24時間以内にしてください。');
  }
  return { title, location, details, allDay: false, start, end };
}

/**
 * 数字を指定の桁数にそろえる。例：(9, 2) → "09"
 *
 * @param {number} value
 * @param {number} length
 * @returns {string}
 */
function pad(value, length) {
  return String(value).padStart(length, '0');
}

/**
 * 年月日を「YYYYMMDD」にする（終日の予定に使う）。
 *
 * @param {{year: number, month: number, day: number}} date
 * @returns {string}
 */
export function formatCalendarDate(date) {
  return `${pad(date.year, 4)}${pad(date.month, 2)}${pad(date.day, 2)}`;
}

/**
 * 年月日時分を「YYYYMMDDTHHMMSS」にする（秒は 00）。
 *
 * @param {{year: number, month: number, day: number, hour: number, minute: number}} dateTime
 * @returns {string}
 */
export function formatCalendarDateTime(dateTime) {
  return `${formatCalendarDate(dateTime)}T${pad(dateTime.hour, 2)}${pad(dateTime.minute, 2)}00`;
}

/**
 * 予定の内容から、予定作成画面の URL を組み立てる。
 *   時刻あり：dates=YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS
 *   終日　　：dates=YYYYMMDD/YYYYMMDD（終了日は翌日。要件§5.10）
 *
 * @param {unknown} rawEvent validateCalendarEvent と同じ形
 * @returns {string} URL
 * @throws {CalendarEventError} 内容に問題がある、または URL が長すぎる場合
 */
export function buildCalendarUrl(rawEvent) {
  const event = validateCalendarEvent(rawEvent);
  const dates = event.allDay
    ? `${formatCalendarDate(event.start)}/${formatCalendarDate(addDays(event.start, 1))}`
    : `${formatCalendarDateTime(event.start)}/${formatCalendarDateTime(event.end)}`;

  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  if (event.title !== '') params.set('text', event.title);
  params.set('dates', dates);
  if (event.details !== '') params.set('details', event.details);
  if (event.location !== '') params.set('location', event.location);
  params.set('ctz', CALENDAR_TIME_ZONE);

  // URLSearchParams は空白を「+」にするが、確実に空白として扱われるよう %20 にする
  // （値の中の「+」は %2B にエンコード済みなので、ここで置き換わるのは空白だけ）
  const url = new URL(CALENDAR_BASE_URL);
  url.search = params.toString().replace(/\+/g, '%20');
  const href = url.href;

  if (href.length > MAX_CALENDAR_URL_LENGTH) {
    throw new CalendarEventError(
      '登録内容が長すぎて、Googleカレンダーの画面を開けません。メモを短くするか、「元の文章をメモに入れる」を外してください。',
    );
  }
  return href;
}

/**
 * URL が「開いてよい予定作成画面の URL」かを調べる（許可リスト方式：CLAUDE.md）。
 * https・ホスト calendar.google.com・パス /calendar/render・action=TEMPLATE のものだけを許可する。
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedCalendarUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === ALLOWED_HOST &&
    parsed.port === '' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.pathname === ALLOWED_PATH &&
    parsed.hash === '' &&
    parsed.searchParams.get('action') === 'TEMPLATE'
  );
}
