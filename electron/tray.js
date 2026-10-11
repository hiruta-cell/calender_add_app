/**
 * tray.js
 * 目的：タスクトレイ（Mac はメニューバー）にアイコンを置き、常駐させる（要件§6.1）。
 * メニュー：範囲を選んで読み取る／コピーした文章を読み取る／確認ウインドウを開く／終了
 */

import { Menu, Tray, nativeImage } from 'electron';
import { APP_DISPLAY_NAME } from './desktopIntegration.js';

/**
 * トレイのアイコンとメニューを作る。
 *
 * @param {object} options
 * @param {string} options.iconPath アイコンの画像のパス（@2x の画像は自動で使われる）
 * @param {boolean} options.isTemplateImage Mac のメニューバー用の白黒画像か（明暗に合わせて macOS が色を変える）
 * @param {string} options.hotkeyLabel 範囲キャプチャのホットキーの表記（例：Ctrl+Shift+Y）
 * @param {string} options.clipboardHotkeyLabel コピーした文章を読み取るホットキーの表記（例：Ctrl+Shift+U）
 * @param {() => void} options.onCapture 「範囲を選んで読み取る」を選んだときの処理
 * @param {() => void} options.onReadClipboard 「コピーした文章を読み取る」を選んだときの処理
 * @param {() => void} options.onShowWindow 「確認ウインドウを開く」を選んだときの処理
 * @param {() => void} options.onQuit 「終了」を選んだときの処理
 * @returns {{tray: Electron.Tray, setHotkeyLabels: (captureLabel: string, clipboardLabel: string) => void}}
 *   トレイ（ガベージコレクションで消えないよう保持すること）と、メニューのホットキーの表記を変える関数（設定の変更時）
 */
export function createAppTray({ iconPath, isTemplateImage, hotkeyLabel, clipboardHotkeyLabel, onCapture, onReadClipboard, onShowWindow, onQuit }) {
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(isTemplateImage);
  const tray = new Tray(icon);
  tray.setToolTip(APP_DISPLAY_NAME);

  /** メニューを作り直す（ホットキーの表記を入れる） */
  const setHotkeyLabels = (captureLabel, clipboardLabel) => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `範囲を選んで読み取る（${captureLabel}）`, click: onCapture },
        { label: `コピーした文章を読み取る（${clipboardLabel}）`, click: onReadClipboard },
        { label: '確認ウインドウを開く', click: onShowWindow },
        { type: 'separator' },
        { label: '終了', click: onQuit },
      ]),
    );
  };
  setHotkeyLabels(hotkeyLabel, clipboardHotkeyLabel);
  if (!isTemplateImage) {
    tray.on('click', onShowWindow); // Windows：左クリックで確認ウインドウを開く（右クリックでメニュー）
  }
  return { tray, setHotkeyLabels };
}
