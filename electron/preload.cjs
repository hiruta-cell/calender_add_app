/**
 * preload.cjs
 * 目的：画面（React）に、カレンダー登録に必要な関数を1つだけ公開する。
 *
 * - contextBridge で公開した関数だけが画面から使える。ipcRenderer そのものや汎用の送信関数は公開しない（CLAUDE.md）。
 * - サンドボックスの中で動くため、CommonJS（require）で書く。ES モジュールの import は使えない。
 */

const { contextBridge, ipcRenderer } = require('electron');

/** メインプロセスの登録処理を呼び出すチャンネル名（electron/calendarIpc.js の OPEN_CALENDAR_EVENTS_CHANNEL と同じ値） */
const OPEN_CALENDAR_EVENTS_CHANNEL = 'calendar:open-events';

contextBridge.exposeInMainWorld('calendarApp', {
  /**
   * 予定の一覧をメインプロセスに渡し、Googleカレンダーの予定作成画面を順に開いてもらう。
   * 内容の検証と URL の組み立ては、メインプロセス側で行う。
   *
   * @param {Array<object>} events 予定の一覧
   * @returns {Promise<{ok: boolean, openedCount: number, message?: string}>}
   */
  openCalendarEvents: (events) => ipcRenderer.invoke(OPEN_CALENDAR_EVENTS_CHANNEL, events),
});
