/**
 * tray.js
 * 目的：タスクトレイ（Mac はメニューバー）にアイコンを置き、常駐させる（要件§6.1）。
 * メニュー：範囲を選んで読み取る／確認ウインドウを開く／終了
 */

import { Menu, Tray, nativeImage } from 'electron';

/**
 * トレイのアイコンとメニューを作る。
 *
 * @param {object} options
 * @param {string} options.iconPath アイコンの画像のパス（@2x の画像は自動で使われる）
 * @param {boolean} options.isTemplateImage Mac のメニューバー用の白黒画像か（明暗に合わせて macOS が色を変える）
 * @param {string} options.hotkeyLabel ホットキーの表記（例：Ctrl+Shift+Y）
 * @param {() => void} options.onCapture 「範囲を選んで読み取る」を選んだときの処理
 * @param {() => void} options.onShowWindow 「確認ウインドウを開く」を選んだときの処理
 * @param {() => void} options.onQuit 「終了」を選んだときの処理
 * @returns {{tray: Electron.Tray, setHotkeyLabel: (label: string) => void}}
 *   トレイ（ガベージコレクションで消えないよう保持すること）と、メニューのホットキーの表記を変える関数（設定の変更時）
 */
export function createAppTray({ iconPath, isTemplateImage, hotkeyLabel, onCapture, onShowWindow, onQuit }) {
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(isTemplateImage);
  const tray = new Tray(icon);
  tray.setToolTip('カレンダー登録ツール');

  /** メニューを作り直す（ホットキーの表記を入れる） */
  const setHotkeyLabel = (label) => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `範囲を選んで読み取る（${label}）`, click: onCapture },
        { label: '確認ウインドウを開く', click: onShowWindow },
        { type: 'separator' },
        { label: '終了', click: onQuit },
      ]),
    );
  };
  setHotkeyLabel(hotkeyLabel);
  if (!isTemplateImage) {
    tray.on('click', onShowWindow); // Windows：左クリックで確認ウインドウを開く（右クリックでメニュー）
  }
  return { tray, setHotkeyLabel };
}
