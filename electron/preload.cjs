/**
 * preload.cjs
 * 目的：確認ウインドウの画面（React）に、カレンダー登録・範囲キャプチャ・設定に必要な最小限の関数だけを公開する。
 *
 * - contextBridge で公開した関数だけが画面から使える。ipcRenderer そのものや汎用の送信関数は公開しない（CLAUDE.md）。
 * - サンドボックスの中で動くため、CommonJS（require）で書く。ES モジュールの import は使えない。
 */

const { contextBridge, ipcRenderer } = require('electron');

/** メインプロセスの登録処理を呼び出すチャンネル名（electron/calendarIpc.js の OPEN_CALENDAR_EVENTS_CHANNEL と同じ値） */
const OPEN_CALENDAR_EVENTS_CHANNEL = 'calendar:open-events';

/** 以下は electron/captureIpc.js の同名の定数と同じ値 */
/** 範囲キャプチャを始める */
const CAPTURE_START_CHANNEL = 'capture:start';
/** 向きを指定して読み直す */
const CAPTURE_REREAD_CHANNEL = 'capture:reread';
/** 貼り付け・ドラッグ＆ドロップした画像を読み取る */
const CAPTURE_IMPORT_CHANNEL = 'capture:import-image';
/** 取り込んだ画像を消す */
const CAPTURE_CLEAR_CHANNEL = 'capture:clear';
/** アプリの状態（ホットキーが使えるか）を尋ねる */
const APP_STATUS_CHANNEL = 'app:get-status';
/** 取り込み・読み取りの進み具合と結果を受け取る（メインプロセスから届く） */
const CAPTURE_STATUS_CHANNEL = 'capture:status';
/** Mac の画面収録の設定画面を開く */
const OPEN_SCREEN_SETTINGS_CHANNEL = 'system:open-screen-settings';

/** 以下は electron/settingsIpc.js の同名の定数と同じ値 */
/** 設定を取得する */
const SETTINGS_GET_CHANNEL = 'settings:get';
/** 設定を保存する */
const SETTINGS_SAVE_CHANNEL = 'settings:save';
/** デスクトップにアイコンを作る */
const DESKTOP_ICON_CHANNEL = 'settings:create-desktop-icon';

contextBridge.exposeInMainWorld('calendarApp', {
  /**
   * 予定の一覧をメインプロセスに渡し、Googleカレンダーの予定作成画面を順に開いてもらう。
   * 内容の検証と URL の組み立ては、メインプロセス側で行う。
   *
   * @param {Array<object>} events 予定の一覧
   * @returns {Promise<{ok: boolean, openedCount: number, message?: string}>}
   */
  openCalendarEvents: (events) => ipcRenderer.invoke(OPEN_CALENDAR_EVENTS_CHANNEL, events),

  /**
   * 範囲キャプチャを始めてもらう（結果は onCaptureStatus で届く）。
   *
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  startCapture: () => ipcRenderer.invoke(CAPTURE_START_CHANNEL),

  /**
   * 貼り付け・ドラッグ＆ドロップした画像（画面側で PNG にそろえたもの）を読み取ってもらう（結果は onCaptureStatus で届く）。
   *
   * @param {Uint8Array} pngBytes 画像（PNG）
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  importImage: (pngBytes) => ipcRenderer.invoke(CAPTURE_IMPORT_CHANNEL, pngBytes),

  /**
   * 取り込んだ画像を、向きを指定して読み直してもらう（結果は onCaptureStatus で届く）。
   *
   * @param {'auto' | 'horizontal' | 'vertical'} orientation 読み取りの向き
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  rereadCapture: (orientation) => ipcRenderer.invoke(CAPTURE_REREAD_CHANNEL, orientation),

  /**
   * 取り込んだ画像を消してもらう。
   *
   * @returns {Promise<{ok: boolean}>}
   */
  clearCapture: () => ipcRenderer.invoke(CAPTURE_CLEAR_CHANNEL),

  /**
   * アプリの状態（ホットキーが使えるか、その表記）を尋ねる。
   *
   * @returns {Promise<{ok: boolean, hotkeyRegistered: boolean, hotkeyLabel: string}>}
   */
  getAppStatus: () => ipcRenderer.invoke(APP_STATUS_CHANNEL),

  /**
   * Mac の「画面収録とシステムオーディオ録音」の設定画面を開いてもらう（開く URL はメインプロセスで決まっている）。
   *
   * @returns {Promise<{ok: boolean, message?: string}>}
   */
  openScreenRecordingSettings: () => ipcRenderer.invoke(OPEN_SCREEN_SETTINGS_CHANNEL),

  /**
   * 今の設定（予定の既定の長さ・ホットキー）と、自動起動・ホットキーの状態を受け取る。
   *
   * @returns {Promise<{ok: boolean, settings?: object, autoStart?: boolean, autoStartSupported?: boolean, platform?: string, hotkeyRegistered?: boolean, hotkeyLabel?: string, message?: string}>}
   */
  getSettings: () => ipcRenderer.invoke(SETTINGS_GET_CHANNEL),

  /**
   * 設定を保存してもらう（検証・ホットキーの登録し直し・自動起動の切り替えは、メインプロセス側で行う）。
   *
   * @param {{durationMinutes: number, hotkeyModifiers: string, hotkeyKey: string, autoStart: boolean}} settings 設定
   * @returns {Promise<{ok: boolean, settings?: object, autoStart?: boolean, hotkeyRegistered?: boolean, hotkeyLabel?: string, message?: string}>}
   */
  saveSettings: (settings) => ipcRenderer.invoke(SETTINGS_SAVE_CHANNEL, settings),

  /**
   * デスクトップにアイコンを作ってもらう（場所・名前・中身はメインプロセスで決まっている）。
   *
   * @returns {Promise<{ok: boolean, message: string}>}
   */
  createDesktopIcon: () => ipcRenderer.invoke(DESKTOP_ICON_CHANNEL),

  /**
   * 取り込み・読み取りの進み具合と結果を受け取る関数を登録する。
   * 受け取った関数には、内容（status）だけを渡す（IPC のイベントそのものは渡さない）。
   *
   * @param {(status: object) => void} callback 進み具合と結果を受け取る関数
   * @returns {() => void} 登録を解除する関数
   */
  onCaptureStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on(CAPTURE_STATUS_CHANNEL, listener);
    return () => ipcRenderer.removeListener(CAPTURE_STATUS_CHANNEL, listener);
  },
});
