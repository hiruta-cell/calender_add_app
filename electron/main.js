/**
 * main.js（Electron のメインプロセス）
 * 目的：アプリの起動、確認ウインドウの作成、セキュリティ設定の適用を行う。
 *
 * 2日目の範囲：確認ウインドウを開き、画面からの登録要求を受けて予定作成画面をブラウザで開く。
 * タスクトレイ常駐・ホットキー・範囲キャプチャ・設定は、3日目以降に追加する。
 */

import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ENTRY_URL, APP_SCHEME, APP_SCHEME_PRIVILEGES, handleAppRequest, isAppUrl } from './appProtocol.js';
import { OPEN_CALENDAR_EVENTS_CHANNEL, createOpenCalendarEventsHandler } from './calendarIpc.js';
import { SECURE_WEB_PREFERENCES, applySessionSecurity, hardenWebContents } from './security.js';

/** このファイルがあるフォルダ（electron/） */
const ELECTRON_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Vite がビルドした画面ファイルの置き場所。app:// ではこのフォルダの中だけを配信する */
const RENDERER_DIST_DIR = path.join(ELECTRON_DIR, '..', 'dist', 'renderer');

/** 画面に関数を公開する preload スクリプト（サンドボックスで動くため CommonJS） */
const PRELOAD_PATH = path.join(ELECTRON_DIR, 'preload.cjs');

/** 確認ウインドウの大きさ（px） */
const MAIN_WINDOW_SIZE = Object.freeze({ width: 1120, height: 760, minWidth: 820, minHeight: 560 });

/** 確認ウインドウ。作成前と閉じた後は null */
let mainWindow = null;

// ---- app の準備完了（ready）より前に行う必要がある設定 ----

// app:// を「安全な通常の URL」として登録する
protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: APP_SCHEME_PRIVILEGES }]);
// すべての画面をサンドボックス（隔離された環境）で動かす
app.enableSandbox();

/**
 * 確認ウインドウを作成して画面を読み込む。
 */
function createMainWindow() {
  const window = new BrowserWindow({
    ...MAIN_WINDOW_SIZE,
    show: false, // 読み込みが終わってから表示する（白い画面のちらつきを防ぐ）
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: PRELOAD_PATH },
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
  });
  window.loadURL(APP_ENTRY_URL).catch((error) => {
    dialog.showErrorBox('画面を表示できません', `画面の読み込みに失敗しました。（${error.name}）`);
  });
  mainWindow = window;
}

/**
 * 2つ目の起動が行われたとき、すでに開いている確認ウインドウを前面に出す。
 */
function focusMainWindow() {
  if (mainWindow === null) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

/**
 * IPC の送信元が、確認ウインドウの画面（app://bundle の最上位のフレーム）かを調べる。
 * iframe や、万一読み込まれた外部ページからの要求は受け付けない（CLAUDE.md）。
 *
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {boolean}
 */
function isTrustedSender(event) {
  const frame = event.senderFrame;
  return (
    mainWindow !== null &&
    event.sender === mainWindow.webContents &&
    frame !== null &&
    frame.parent === null &&
    isAppUrl(frame.url)
  );
}

/**
 * app の準備ができたら、セキュリティ設定を適用してウインドウを開く。
 */
function startApp() {
  if (!existsSync(path.join(RENDERER_DIST_DIR, 'index.html'))) {
    dialog.showErrorBox(
      '起動できません',
      '画面のファイルが見つかりません。\nプロジェクトのフォルダで「npm start」を実行して起動してください。',
    );
    app.quit();
    return;
  }
  applySessionSecurity(session.defaultSession);
  protocol.handle(APP_SCHEME, (request) => handleAppRequest(request, RENDERER_DIST_DIR));
  ipcMain.handle(
    OPEN_CALENDAR_EVENTS_CHANNEL,
    createOpenCalendarEventsHandler({
      // 呼ぶたびに shell.openExternal を参照する（実機の自動確認で差し替えられるようにするため）
      openExternal: (url) => shell.openExternal(url),
      isTrustedSender,
    }),
  );
  createMainWindow();
}

// ---- 多重起動の防止 ----
// 2つ目を起動すると、ホットキーの取り合いなどが起きるため、1つだけ動くようにする
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);
  // 画面が作られるたびに、ページ移動・新しいウインドウの制限をかける
  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));
  // Mac 以外は、ウインドウをすべて閉じたら終了する（Mac はメニューバーのアプリ名 → 終了 で閉じる）
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
  // Mac で Dock のアイコンを押したとき、ウインドウがなければ作り直す
  app.on('activate', () => {
    if (mainWindow === null && app.isReady()) {
      createMainWindow();
    }
  });
  app
    .whenReady()
    .then(startApp)
    .catch((error) => {
      // 起動処理そのものに失敗した場合は、動作を続けられないため知らせて終了する
      dialog.showErrorBox('起動できません', `起動中にエラーが発生しました。（${error.name}）`);
      app.quit();
    });
}
