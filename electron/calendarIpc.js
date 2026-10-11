/**
 * calendarIpc.js
 * 目的：画面から届いた「予定の一覧」を検証し、Googleカレンダーの予定作成画面を既定のブラウザで順に開く。
 *
 * セキュリティ（CLAUDE.md）：
 *   (1) 送信元が確認ウインドウの画面（app://bundle の最上位のフレーム）かを確かめる
 *   (2) 引数の型・件数・各項目を検証する（画面側の確認とは別に、ここで必ず検証する）
 *   (3) URL は画面から受け取らず、ここで組み立て、許可リストで確かめてから開く
 *   (4) 処理中に重ねて要求されたら断る（二度押しでタブが倍に開くのを防ぐ）
 *
 * すべての予定を開けたら、確認ウインドウを最小化する（ブラウザでの操作の邪魔にならないように。2026-10-11 依頼者の指示）。
 * 途中で開けなかったときは最小化せず、画面にエラーを表示させる。
 *
 * このファイルは electron を import しない。ブラウザを開く関数などは main.js から受け取るため、単体テストできる。
 */

import { CalendarEventError, buildCalendarUrl, isAllowedCalendarUrl } from '../src/core/calendarUrl.js';
import { MAX_CANDIDATES } from '../src/core/dateExtractor.js';

/** 画面からの登録要求のチャンネル名（electron/preload.cjs と同じ値にする） */
export const OPEN_CALENDAR_EVENTS_CHANNEL = 'calendar:open-events';

/** 複数の予定を開くときの間隔（ミリ秒）。続けて開くとブラウザが取りこぼすことがあるため */
export const OPEN_INTERVAL_MS = 800;

/** 1回の要求で開ける予定の最大数（候補の最大件数と同じ） */
export const MAX_EVENTS_PER_REQUEST = MAX_CANDIDATES;

/** 送信元を確認できなかったときの文 */
const UNTRUSTED_SENDER_MESSAGE = '不正な要求のため、処理を中断しました。';
/** 前の処理が終わっていないときの文 */
const BUSY_MESSAGE = '前の登録処理が終わるまでお待ちください。';
/** 予期しないエラーのときの文（内容は含めない） */
const UNEXPECTED_ERROR_MESSAGE = '登録内容を確認できませんでした。もう一度お試しください。';

/**
 * 指定した時間だけ待つ。
 *
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * 予定の一覧を検証し、開く URL の一覧を作る。
 *
 * @param {unknown} rawEvents 画面から届いた値
 * @returns {string[]} 許可リストを通った URL の一覧
 * @throws {CalendarEventError} 内容に問題がある場合（何件目かを文に含める）
 */
export function buildCalendarUrls(rawEvents) {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    throw new CalendarEventError('登録する予定が選ばれていません。');
  }
  if (rawEvents.length > MAX_EVENTS_PER_REQUEST) {
    throw new CalendarEventError(`一度に登録できるのは ${MAX_EVENTS_PER_REQUEST} 件までです。`);
  }
  return rawEvents.map((rawEvent, index) => {
    let url;
    try {
      url = buildCalendarUrl(rawEvent);
    } catch (error) {
      if (error instanceof CalendarEventError) {
        throw new CalendarEventError(`${index + 1}件目：${error.message}`);
      }
      throw error;
    }
    if (!isAllowedCalendarUrl(url)) {
      throw new CalendarEventError(`${index + 1}件目：登録先の URL を確認できませんでした。`);
    }
    return url;
  });
}

/**
 * 登録要求を処理する関数を作る（ipcMain.handle に渡す）。
 *
 * @param {object} dependencies
 * @param {(url: string) => Promise<void>} dependencies.openExternal 既定のブラウザで URL を開く関数（shell.openExternal）
 * @param {(event: object) => boolean} dependencies.isTrustedSender 送信元が確認ウインドウの画面かを調べる関数
 * @param {(milliseconds: number) => Promise<void>} [dependencies.delay] 待つ関数（テストでは待たない関数を渡す）
 * @param {() => void} [dependencies.onAllOpened] すべての予定を開けたあとに呼ぶ関数（確認ウインドウを最小化する）
 * @returns {(event: object, rawEvents: unknown) => Promise<{ok: boolean, openedCount: number, message?: string}>}
 */
export function createOpenCalendarEventsHandler({ openExternal, isTrustedSender, delay = wait, onAllOpened = () => {} }) {
  let isOpening = false; // 処理中なら true（重ねての要求を断る）

  return async function handleOpenCalendarEvents(event, rawEvents) {
    if (!isTrustedSender(event)) {
      return { ok: false, openedCount: 0, message: UNTRUSTED_SENDER_MESSAGE };
    }
    if (isOpening) {
      return { ok: false, openedCount: 0, message: BUSY_MESSAGE };
    }

    let urls;
    try {
      urls = buildCalendarUrls(rawEvents);
    } catch (error) {
      const message = error instanceof CalendarEventError ? error.message : UNEXPECTED_ERROR_MESSAGE;
      return { ok: false, openedCount: 0, message };
    }

    isOpening = true;
    let openedCount = 0;
    try {
      for (const url of urls) {
        if (openedCount > 0) {
          await delay(OPEN_INTERVAL_MS);
        }
        await openExternal(url);
        openedCount += 1;
      }
    } catch {
      return {
        ok: false,
        openedCount,
        message: `ブラウザを開けませんでした（${urls.length} 件中 ${openedCount} 件は開きました）。`,
      };
    } finally {
      isOpening = false;
    }
    // すべて開けたときだけ、確認ウインドウを最小化する（開けなかったときはエラーを見せるため、上で戻っている）
    onAllOpened();
    return { ok: true, openedCount };
  };
}
