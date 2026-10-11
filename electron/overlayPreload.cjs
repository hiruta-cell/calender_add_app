/**
 * overlayPreload.cjs
 * 目的：範囲選択の画面に、「選んだ範囲を送る」「中止する」の2つの関数だけを公開する。
 *
 * - ipcRenderer そのものは公開しない（CLAUDE.md）。
 * - サンドボックスの中で動くため、CommonJS（require）で書く。
 */

const { contextBridge, ipcRenderer } = require('electron');

/** 選んだ範囲を送るチャンネル名（electron/captureIpc.js の OVERLAY_SELECT_CHANNEL と同じ値） */
const OVERLAY_SELECT_CHANNEL = 'overlay:select';

/** 中止を送るチャンネル名（electron/captureIpc.js の OVERLAY_CANCEL_CHANNEL と同じ値） */
const OVERLAY_CANCEL_CHANNEL = 'overlay:cancel';

contextBridge.exposeInMainWorld('captureOverlay', {
  /**
   * 選んだ範囲をメインプロセスに送る（範囲の検証はメインプロセスで行う）。
   *
   * @param {{x: number, y: number, width: number, height: number}} rect 範囲選択の画面の座標
   * @returns {Promise<{ok: boolean}>}
   */
  select: (rect) => ipcRenderer.invoke(OVERLAY_SELECT_CHANNEL, rect),

  /**
   * 範囲の選択を中止したことをメインプロセスに送る。
   *
   * @returns {Promise<{ok: boolean}>}
   */
  cancel: () => ipcRenderer.invoke(OVERLAY_CANCEL_CHANNEL),
});
