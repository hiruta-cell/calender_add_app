/**
 * captureIpc.js
 * 目的：範囲キャプチャと OCR に関する、画面とメインプロセスの通信（IPC）の受け付け。
 *
 * - 確認ウインドウからの要求（取り込み開始・読み直し・画像を消す・アプリの状態）は、送信元を確かめてから受け付ける。
 * - 読み直しの向きは決めた値（自動・横書き・縦書き）だけを受け付ける。
 * - 進み具合と結果は CAPTURE_STATUS_CHANNEL でメインプロセスから確認ウインドウへ送る。
 * このファイルは electron を import しない（実際の取り込み処理は main.js から受け取る）ため、単体テストできる。
 */

import { MAX_IMAGE_BYTES, ORIENTATIONS } from './ocrEngine.js';

/** 確認ウインドウ → メインプロセス：範囲キャプチャを始める */
export const CAPTURE_START_CHANNEL = 'capture:start';
/** 確認ウインドウ → メインプロセス：向きを指定して読み直す */
export const CAPTURE_REREAD_CHANNEL = 'capture:reread';
/** 確認ウインドウ → メインプロセス：取り込んだ画像を消す */
export const CAPTURE_CLEAR_CHANNEL = 'capture:clear';
/** 確認ウインドウ → メインプロセス：貼り付け・ドラッグ＆ドロップした画像を読み取る */
export const CAPTURE_IMPORT_CHANNEL = 'capture:import-image';

/** PNG の先頭の8バイト（画面側で PNG にそろえてから送るため、PNG だけを受け付ける） */
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** 確認ウインドウ → メインプロセス：アプリの状態（ホットキーが使えるか）を尋ねる */
export const APP_STATUS_CHANNEL = 'app:get-status';
/** メインプロセス → 確認ウインドウ：取り込み・読み取りの進み具合と結果 */
export const CAPTURE_STATUS_CHANNEL = 'capture:status';
/** 範囲選択の画面 → メインプロセス：選んだ範囲 */
export const OVERLAY_SELECT_CHANNEL = 'overlay:select';
/** 範囲選択の画面 → メインプロセス：中止 */
export const OVERLAY_CANCEL_CHANNEL = 'overlay:cancel';
/** 確認ウインドウ → メインプロセス：Mac の画面収録の設定画面を開く */
export const OPEN_SCREEN_SETTINGS_CHANNEL = 'system:open-screen-settings';

/**
 * Mac の「画面収録とシステムオーディオ録音」の設定画面を開く URL（固定。依頼者承認 2026-10-11）。
 * 開いてよい URL の許可リストに加えたのはこの1つだけで、画面から URL は受け取らない。
 */
export const SCREEN_RECORDING_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

/** 送信元を確認できなかったときの文 */
const UNTRUSTED_SENDER_MESSAGE = '不正な要求のため、処理を中断しました。';

/**
 * 貼り付け・ドラッグ＆ドロップで届いた画像を検証する。
 * 画面側で PNG にそろえて送るため、ここでは「PNG であること」と「大きさの上限」だけを確かめる。
 * 中身の読み込みは OCR（Tesseract.js の WebAssembly の中）で行う。
 *
 * @param {unknown} bytes 画面から届いた値
 * @returns {Buffer} 画像のデータ
 * @throws {Error} 形式・大きさが正しくない場合（message は利用者に表示できる文）
 */
export function validateImportedImage(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new Error('画像を読み込めませんでした。');
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error('画像が大きすぎます（20MB まで）。');
  }
  if (!PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    throw new Error('画像を読み込めませんでした。PNG・JPEG の画像を使ってください。');
  }
  return Buffer.from(bytes);
}

/**
 * 確認ウインドウからの要求を処理する関数をまとめて作る（ipcMain.handle に渡す）。
 *
 * @param {object} dependencies
 * @param {(event: object) => boolean} dependencies.isTrustedSender 送信元が確認ウインドウの画面か
 * @param {{isBusy: () => boolean, startCapture: () => Promise<object>, importImage: (png: Buffer) => Promise<object>, rereadSelection: (orientation: string) => Promise<object>, clearCapture: () => void}} dependencies.controller 取り込みの処理
 * @param {() => {hotkeyRegistered: boolean, hotkeyLabel: string}} dependencies.getAppStatus アプリの状態
 * @returns {{
 *   handleStart: Function, handleImport: Function, handleReread: Function, handleClear: Function, handleAppStatus: Function
 * }}
 */
export function createCaptureHandlers({ isTrustedSender, controller, getAppStatus }) {
  /** 送信元を確かめる。確認ウインドウ以外からの要求なら、断る結果を返す */
  const rejectUntrusted = (event) => (isTrustedSender(event) ? null : { ok: false, message: UNTRUSTED_SENDER_MESSAGE });

  return {
    /**
     * 範囲キャプチャを始める。結果は CAPTURE_STATUS_CHANNEL で届くため、ここでは始められたかだけを返す。
     */
    async handleStart(event) {
      const rejected = rejectUntrusted(event);
      if (rejected !== null) return rejected;
      if (controller.isBusy()) {
        return { ok: false, message: '範囲の選択または読み取りの途中です。終わるまでお待ちください。' };
      }
      controller.startCapture(); // 終わるのを待たない（範囲の選択に時間がかかるため）
      return { ok: true };
    },

    /**
     * 貼り付け・ドラッグ＆ドロップした画像を読み取る。結果は CAPTURE_STATUS_CHANNEL で届く。
     */
    async handleImport(event, bytes) {
      const rejected = rejectUntrusted(event);
      if (rejected !== null) return rejected;
      let png;
      try {
        png = validateImportedImage(bytes);
      } catch (error) {
        return { ok: false, message: error.message };
      }
      if (controller.isBusy()) {
        return { ok: false, message: '範囲の選択または読み取りの途中です。終わるまでお待ちください。' };
      }
      controller.importImage(png);
      return { ok: true };
    },

    /**
     * 向きを指定して、取り込んだ画像を読み直す。結果は CAPTURE_STATUS_CHANNEL で届く。
     */
    async handleReread(event, orientation) {
      const rejected = rejectUntrusted(event);
      if (rejected !== null) return rejected;
      if (typeof orientation !== 'string' || !ORIENTATIONS.includes(orientation)) {
        return { ok: false, message: '読み取りの向きの指定が正しくありません。' };
      }
      if (controller.isBusy()) {
        return { ok: false, message: '範囲の選択または読み取りの途中です。終わるまでお待ちください。' };
      }
      controller.rereadSelection(orientation);
      return { ok: true };
    },

    /**
     * 取り込んだ画像を消す（メモリの中から）。
     */
    async handleClear(event) {
      const rejected = rejectUntrusted(event);
      if (rejected !== null) return rejected;
      controller.clearCapture();
      return { ok: true };
    },

    /**
     * アプリの状態（ホットキーが使えるか、その表記）を返す。
     */
    async handleAppStatus(event) {
      const rejected = rejectUntrusted(event);
      if (rejected !== null) return rejected;
      return { ok: true, ...getAppStatus() };
    },
  };
}

/**
 * 「システム設定を開く」の要求を処理する関数を作る（ipcMain.handle に渡す）。
 * Mac でだけ、決まった設定画面の URL（SCREEN_RECORDING_SETTINGS_URL）を開く。
 *
 * @param {object} dependencies
 * @param {(event: object) => boolean} dependencies.isTrustedSender 送信元が確認ウインドウの画面か
 * @param {(url: string) => Promise<void>} dependencies.openExternal URL を開く関数（shell.openExternal）
 * @param {string} dependencies.platform 動いている OS（process.platform）
 * @returns {(event: object) => Promise<{ok: boolean, message?: string}>}
 */
export function createOpenScreenSettingsHandler({ isTrustedSender, openExternal, platform }) {
  return async function handleOpenScreenSettings(event) {
    if (!isTrustedSender(event)) {
      return { ok: false, message: UNTRUSTED_SENDER_MESSAGE };
    }
    if (platform !== 'darwin') {
      return { ok: false, message: 'この操作は Mac でだけ使えます。' };
    }
    try {
      await openExternal(SCREEN_RECORDING_SETTINGS_URL);
      return { ok: true };
    } catch {
      return { ok: false, message: 'システム設定を開けませんでした。手順に沿って、システム設定から開いてください。' };
    }
  };
}
