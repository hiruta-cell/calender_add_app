/**
 * registration.js
 * 目的：画面で選んだ候補と入力欄の内容から、Googleカレンダーに渡す「予定の一覧」を組み立てる。
 *
 * - 終了は文章から読み取らず、候補ごとに「開始から30分〜23時間30分後（30分刻み）」か「終日」を選ぶ（2026-10-12 依頼者の仕様変更）。
 *   時刻のある候補の初めの選択は設定の長さ、日付だけの候補は「終日」（要件§5.10）。日付だけの候補で長さを選んだら開始時刻を入れる。
 * - 日時が見つからないときに使う「手入力の候補」もここで作る（要件§5.8）。
 * - オンライン会議の URL は、場所が空なら「場所」に、場所があれば「メモ」の先頭に入れる（要件§12）。
 * - 元の文章をメモに入れるのは、利用者が選んだときだけ（既定はオフ。要件§6.2）。
 */

import { formatDateLabel } from './candidateFormatter.js';
import { CalendarEventError, MAX_DETAILS_LENGTH } from './calendarUrl.js';
import { WARNING_PAST } from './dateExtractor.js';
import { parseMeetingUrl } from './detailExtractor.js';
import { addMinutes, compareDates, getTokyoDateTime, isValidDate } from './dateUtils.js';

/** 終了の選択：終日（時刻のある候補でも、開始日の終日の予定にする） */
export const END_CHOICE_ALL_DAY = 'allDay';

/** 終了を選ぶ刻み（分） */
export const END_DURATION_STEP_MINUTES = 30;
/** 選べる最も長い長さ（分）：23時間30分 */
export const MAX_END_DURATION_MINUTES = 23 * 60 + 30;
/** 選べる長さの一覧（分）：30, 60, 90, … 1410 の47通り */
export const END_DURATION_CHOICES = Object.freeze(
  Array.from({ length: MAX_END_DURATION_MINUTES / END_DURATION_STEP_MINUTES }, (_, index) => (index + 1) * END_DURATION_STEP_MINUTES),
);

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
    warnings: compareDates(date, today) < 0 ? [WARNING_PAST] : [],
    isManual: true,
  };
}

/**
 * 候補の終了の選択の初めの値を作る。
 *
 * @param {{hasTime: boolean}} candidate 候補
 * @param {number} defaultDurationMinutes 設定の予定の長さ（分。END_DURATION_CHOICES のどれか）
 * @returns {{end: string | number, startTime: string}}
 *   end：END_CHOICE_ALL_DAY か長さ（分）。時刻のある候補は設定の長さ、日付だけの候補は終日（要件§5.10）
 *   startTime：日付だけの候補で長さを選んだときの開始時刻（HH:MM。初めは空）
 */
export function createDefaultTimeChoice(candidate, defaultDurationMinutes) {
  return { end: candidate.hasTime ? defaultDurationMinutes : END_CHOICE_ALL_DAY, startTime: '' };
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
 * @param {Record<string, {end: string | number, startTime: string}>} input.timeChoices 候補ごとの終了の選択（なければ初めの値）
 * @param {object} input.details 入力欄の内容（composeEventTexts を参照）
 * @param {string} input.sourceText 抽出に使った元の文章
 * @param {number} input.defaultDurationMinutes 設定の予定の長さ（分。終了の選択の初めの値）
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
    const choice = timeChoices[candidate.id] ?? createDefaultTimeChoice(candidate, defaultDurationMinutes);
    if (choice.end === END_CHOICE_ALL_DAY) {
      const { year, month, day } = candidate.start;
      events.push({ ...texts, allDay: true, start: { year, month, day, hour: null, minute: null }, end: null });
      continue;
    }

    const result = resolveTimedEvent(candidate, choice);
    if (result.error !== null) {
      errors.push(`${formatDateLabel(candidate.start)}：${result.error}`);
    } else {
      events.push({ ...texts, allDay: false, start: result.start, end: result.end });
    }
  }
  return { events, errors };
}

/**
 * 終了の選択（長さ）から、時刻のある予定の開始・終了を決める。
 *   時刻のある候補：開始は候補の時刻。日付だけの候補：開始は入力された開始時刻（必須）
 *
 * @param {{hasTime: boolean, start: object}} candidate 候補
 * @param {{end: string | number, startTime: string}} choice 終了の選択（end は長さ（分））
 * @returns {{start: object | null, end: object | null, error: string | null}}
 */
function resolveTimedEvent(candidate, choice) {
  if (!END_DURATION_CHOICES.includes(choice.end)) {
    return { start: null, end: null, error: '終了の選択が正しくありません。' };
  }
  let start = candidate.start;
  if (!candidate.hasTime) {
    const startTime = parseTimeInput(choice.startTime);
    if (startTime === null) {
      return { start: null, end: null, error: '開始時刻を入力してください。' };
    }
    start = { year: start.year, month: start.month, day: start.day, ...startTime };
  }
  return { start, end: addMinutes(start, choice.end), error: null };
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
