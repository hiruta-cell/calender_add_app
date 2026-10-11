/**
 * captureIpc.js
 * 目的：範囲キャプチャと OCR に関する、画面とメインプロセスの通信（IPC）の受け付け。
 *
 * - 確認ウインドウからの要求（取り込み開始・読み直し・画像を消す・アプリの状態）は、送信元を確かめてから受け付ける。
 * - 読み直しの向きは決めた値（自動・横書き・縦書き）だけを受け付ける。
 * - 進み具合と結果は CAPTURE_STATUS_CHANNEL でメインプロセスから確認ウインドウへ送る。
 * このファイルは electron を import しない（実際の取り込み処理は main.js から受け取る）ため、単体テストできる。
 */

import { ORIENTATIONS } from './ocrEngine.js';

/** 確認ウインドウ → メインプロセス：範囲キャプチャを始める */
export const CAPTURE_START_CHANNEL = 'capture:start';
/** 確認ウインドウ → メインプロセス：向きを指定して読み直す */
export const CAPTURE_REREAD_CHANNEL = 'capture:reread';
/** 確認ウインドウ → メインプロセス：取り込んだ画像を消す */
export const CAPTURE_CLEAR_CHANNEL = 'capture:clear';
/** 確認ウインドウ → メインプロセス：アプリの状態（ホットキーが使えるか）を尋ねる */
export const APP_STATUS_CHANNEL = 'app:get-status';
/** メインプロセス → 確認ウインドウ：取り込み・読み取りの進み具合と結果 */
export const CAPTURE_STATUS_CHANNEL = 'capture:status';
/** 範囲選択の画面 → メインプロセス：選んだ範囲 */
export const OVERLAY_SELECT_CHANNEL = 'overlay:select';
/** 範囲選択の画面 → メインプロセス：中止 */
export const OVERLAY_CANCEL_CHANNEL = 'overlay:cancel';

/** 送信元を確認できなかったときの文 */
const UNTRUSTED_SENDER_MESSAGE = '不正な要求のため、処理を中断しました。';

/**
 * 確認ウインドウからの要求を処理する関数をまとめて作る（ipcMain.handle に渡す）。
 *
 * @param {object} dependencies
 * @param {(event: object) => boolean} dependencies.isTrustedSender 送信元が確認ウインドウの画面か
 * @param {{isBusy: () => boolean, startCapture: () => Promise<object>, rereadSelection: (orientation: string) => Promise<object>, clearCapture: () => void}} dependencies.controller 取り込みの処理
 * @param {() => {hotkeyRegistered: boolean, hotkeyLabel: string}} dependencies.getAppStatus アプリの状態
 * @returns {{
 *   handleStart: Function, handleReread: Function, handleClear: Function, handleAppStatus: Function
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
