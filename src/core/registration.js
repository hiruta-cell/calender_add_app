/**
 * registration.js
 * 目的：画面で選んだ候補と入力欄の内容から、Googleカレンダーに渡す「予定の一覧」を組み立てる。
 *
 * - 日付だけの候補は「終日」（既定）か「時刻を指定」かを選べる（要件§5.10）。
 * - 日時が見つからないときに使う「手入力の候補」もここで作る（要件§5.8）。
 * - オンライン会議の URL は、場所が空なら「場所」に、場所があれば「メモ」の先頭に入れる（要件§12）。
 * - 元の文章をメモに入れるのは、利用者が選んだときだけ（既定はオフ。要件§6.2）。
 */

import { formatDateLabel } from './candidateFormatter.js';
import { CalendarEventError, MAX_DETAILS_LENGTH } from './calendarUrl.js';
import { WARNING_PAST } from './dateExtractor.js';
import { parseMeetingUrl } from './detailExtractor.js';
import { addMinutes, compareDateTimes, compareDates, getTokyoDateTime, isValidDate } from './dateUtils.js';

/** 日付だけの候補の時刻の扱い：終日 */
export const TIME_MODE_ALL_DAY = 'allDay';
/** 日付だけの候補の時刻の扱い：時刻を指定 */
export const TIME_MODE_SPECIFIED = 'specified';

/** 日付だけの候補の、時刻の扱いの初期値（要件§5.10：既定は終日） */
export const DEFAULT_TIME_CHOICE = Object.freeze({ mode: TIME_MODE_ALL_DAY, startTime: '', endTime: '' });

/** メモに入れる元の文章の最大文字数（URL が長くなりすぎないよう抜粋にする） */
export const SOURCE_TEXT_EXCERPT_LENGTH = 500;

/** メモに会議 URL を書くときの見出し */
const MEETING_URL_HEADING = 'オンライン会議：';
/** メモに元の文章を書くときの見出し */
const SOURCE_TEXT_HEADING = '--- 元の文章 ---';
/** 元の文章を省略したときの印 */
const OMISSION_MARK = '…（以下省略）';

/** 時刻の入力欄の値（HH:MM） */
const TIME_INPUT_PATTERN = /^(\d{2}):(\d{2})$/;
/** 日付の入力欄の値（YYYY-MM-DD） */
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 手入力の候補の ID の先頭（抽出した候補の ID と重ならないようにする） */
const MANUAL_ID_PREFIX = 'manual-';

/**
 * 時刻の入力欄の値（"14:30"）を時・分にする。
 *
 * @param {string} value
 * @returns {{hour: number, minute: number} | null} 正しくなければ null
 */
export function parseTimeInput(value) {
  const match = typeof value === 'string' ? value.match(TIME_INPUT_PATTERN) : null;
  if (match === null) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/**
 * 日付の入力欄の値（"2026-10-15"）を年月日にする。
 *
 * @param {string} value
 * @returns {{year: number, month: number, day: number} | null} 正しくなければ null
 */
export function parseDateInput(value) {
  const match = typeof value === 'string' ? value.match(DATE_INPUT_PATTERN) : null;
  if (match === null) {
    return null;
  }
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return isValidDate(date.year, date.month, date.day) ? date : null;
}

/**
 * 手入力した日付から、候補（日付だけの候補と同じ形）を作る。
 *
 * @param {{year: number, month: number, day: number}} date 手入力した日付
 * @param {number} sequence 手入力の通し番号（ID に使う）
 * @param {Date} now 現在時刻（過去の日付の警告に使う）
 * @returns {object} 候補（dateExtractor.js の候補と同じ形。isManual が true）
 */
export function createManualCandidate(date, sequence, now) {
  const today = getTokyoDateTime(now);
  return {
    id: `${MANUAL_ID_PREFIX}${sequence}`,
    ranges: [],
    sourceText: '手入力',
    hasTime: false,
    start: { year: date.year, month: date.month, day: date.day, hour: null, minute: null },
    end: null,
    endInferred: false,
    warnings: compareDates(date, today) < 0 ? [WARNING_PAST] : [],
    isManual: true,
  };
}

/**
 * 入力欄の内容から、予定の件名・場所・メモに入れる文字列を作る。
 *
 * @param {{title: string, location: string, meetingUrl: string, memo: string, includeSourceText: boolean}} details 入力欄の内容
 * @param {string} sourceText 抽出に使った元の文章
 * @returns {{title: string, location: string, details: string}}
 * @throws {CalendarEventError} 会議 URL が https の正しい URL でない場合
 */
export function composeEventTexts(details, sourceText) {
  const title = details.title.trim();
  const locationText = details.location.trim();
  const meetingUrlText = details.meetingUrl.trim();

  let meetingUrl = '';
  if (meetingUrlText !== '') {
    const parsed = parseMeetingUrl(meetingUrlText);
    if (parsed === null) {
      throw new CalendarEventError('オンライン会議URLは、https:// で始まる正しい URL を入力してください。');
    }
    meetingUrl = parsed.href;
  }

  const memoParts = [];
  // 場所が書かれていれば、会議 URL はメモの先頭に入れる
  if (locationText !== '' && meetingUrl !== '') {
    memoParts.push(`${MEETING_URL_HEADING}${meetingUrl}`);
  }
  if (details.memo.trim() !== '') {
    memoParts.push(details.memo.trim());
  }
  if (details.includeSourceText && sourceText.trim() !== '') {
    memoParts.push(`${SOURCE_TEXT_HEADING}\n${excerpt(sourceText.trim(), SOURCE_TEXT_EXCERPT_LENGTH)}`);
  }

  return {
    title,
    location: locationText !== '' ? locationText : meetingUrl,
    details: excerpt(memoParts.join('\n\n'), MAX_DETAILS_LENGTH),
  };
}

/**
 * 選んだ候補と入力欄の内容から、予定の一覧を作る。
 *
 * @param {object} input
 * @param {Array<object>} input.candidates 表示中の候補（抽出した候補と手入力の候補）
 * @param {Set<string>} input.selectedIds チェックを付けた候補の ID
 * @param {Record<string, {mode: string, startTime: string, endTime: string}>} input.timeChoices 日付だけの候補の時刻の扱い
 * @param {object} input.details 入力欄の内容（composeEventTexts を参照）
 * @param {string} input.sourceText 抽出に使った元の文章
 * @param {number} input.defaultDurationMinutes 終了時刻がないときの予定の長さ（分）
 * @returns {{events: Array<object>, errors: string[]}}
 *   events：calendarUrl.js の validateCalendarEvent に渡せる形の予定（候補の表示順）
 *   errors：利用者に表示するエラーの文（1つでもあれば登録しない）
 */
export function buildCalendarEvents({ candidates, selectedIds, timeChoices, details, sourceText, defaultDurationMinutes }) {
  const errors = [];
  let texts;
  try {
    texts = composeEventTexts(details, sourceText);
  } catch (error) {
    if (error instanceof CalendarEventError) {
      return { events: [], errors: [error.message] };
    }
    throw error;
  }

  const events = [];
  for (const candidate of candidates) {
    if (!selectedIds.has(candidate.id)) {
      continue;
    }
    if (candidate.hasTime) {
      events.push({ ...texts, allDay: false, start: candidate.start, end: candidate.end });
      continue;
    }

    const choice = timeChoices[candidate.id] ?? DEFAULT_TIME_CHOICE;
    if (choice.mode !== TIME_MODE_SPECIFIED) {
      events.push({ ...texts, allDay: true, start: candidate.start, end: null });
      continue;
    }

    const result = resolveSpecifiedTime(candidate.start, choice, defaultDurationMinutes);
    if (result.error !== null) {
      errors.push(`${formatDateLabel(candidate.start)}：${result.error}`);
    } else {
      events.push({ ...texts, allDay: false, start: result.start, end: result.end });
    }
  }
  return { events, errors };
}

/**
 * 日付だけの候補に、利用者が指定した時刻を当てはめる。終了時刻が空なら既定の長さにする。
 *
 * @param {{year: number, month: number, day: number}} date 候補の日付
 * @param {{startTime: string, endTime: string}} choice 入力された時刻（HH:MM）
 * @param {number} defaultDurationMinutes 既定の予定の長さ（分）
 * @returns {{start: object | null, end: object | null, error: string | null}}
 */
function resolveSpecifiedTime(date, choice, defaultDurationMinutes) {
  const startTime = parseTimeInput(choice.startTime);
  if (startTime === null) {
    return { start: null, end: null, error: '開始時刻を入力してください。' };
  }
  const start = { year: date.year, month: date.month, day: date.day, ...startTime };
  if (choice.endTime === '') {
    return { start, end: addMinutes(start, defaultDurationMinutes), error: null };
  }
  const endTime = parseTimeInput(choice.endTime);
  if (endTime === null) {
    return { start: null, end: null, error: '終了時刻が正しくありません。' };
  }
  const end = { year: date.year, month: date.month, day: date.day, ...endTime };
  if (compareDateTimes(end, start) <= 0) {
    return { start: null, end: null, error: '終了時刻は開始時刻より後にしてください。' };
  }
  return { start, end, error: null };
}

/**
 * 文字列を最大文字数までにし、省略した場合は印を付ける。
 *
 * @param {string} text
 * @param {number} maxLength 印を含めた最大文字数
 * @returns {string}
 */
function excerpt(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - OMISSION_MARK.length)}${OMISSION_MARK}` : text;
}
