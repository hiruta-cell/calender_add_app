/**
 * main.js（Electron のメインプロセス）
 * 目的：アプリの起動、確認ウインドウの作成、常駐（トレイ）とホットキー、セキュリティ設定、
 *       画面とメインプロセスの通信（IPC）の受け付けを行う。
 *
 * 常駐（要件§6.1）：確認ウインドウを閉じてもアプリは終了せず、トレイ（Mac はメニューバー）に残る。
 *   終了はトレイのメニューの「終了」（Mac は Cmd+Q も可）。
 * ホットキー（要件§12）：Ctrl+Shift+Y（Mac は Cmd+Shift+Y）で範囲キャプチャを始める。終了時に解除する。
 * 設定画面・デスクトップのアイコン・自動起動は、4日目に追加する。
 */

import { app, BrowserWindow, dialog, globalShortcut, ipcMain, protocol, session, shell } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ENTRY_URL, APP_SCHEME, APP_SCHEME_PRIVILEGES, handleAppRequest, isAppUrl } from './appProtocol.js';
import {
  OPEN_CALENDAR_DAY_CHANNEL,
  OPEN_CALENDAR_EVENTS_CHANNEL,
  createOpenCalendarDayHandler,
  createOpenCalendarEventsHandler,
} from './calendarIpc.js';
import { createCaptureController } from './captureController.js';
import { createCaptureImageStore } from './captureImageStore.js';
import {
  APP_STATUS_CHANNEL,
  CAPTURE_CLEAR_CHANNEL,
  CAPTURE_IMPORT_CHANNEL,
  CAPTURE_REREAD_CHANNEL,
  CAPTURE_START_CHANNEL,
  CAPTURE_STATUS_CHANNEL,
  OPEN_SCREEN_SETTINGS_CHANNEL,
  OVERLAY_CANCEL_CHANNEL,
  OVERLAY_SELECT_CHANNEL,
  createCaptureHandlers,
  createOpenScreenSettingsHandler,
} from './captureIpc.js';
import { SECURE_WEB_PREFERENCES, applySessionSecurity, hardenWebContents } from './security.js';
import { createAppTray } from './tray.js';

/** このファイルがあるフォルダ（electron/） */
const ELECTRON_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Vite がビルドした画面ファイルの置き場所。app:// ではこのフォルダの中だけを配信する */
const RENDERER_DIST_DIR = path.join(ELECTRON_DIR, '..', 'dist', 'renderer');

/** 確認ウインドウに関数を公開する preload スクリプト（サンドボックスで動くため CommonJS） */
const PRELOAD_PATH = path.join(ELECTRON_DIR, 'preload.cjs');

/** 範囲選択の画面に関数を公開する preload スクリプト */
const OVERLAY_PRELOAD_PATH = path.join(ELECTRON_DIR, 'overlayPreload.cjs');

/** Mac か（トレイのアイコンやホットキーの表記が違う） */
const IS_MAC = process.platform === 'darwin';

/** トレイのアイコン（Mac はメニューバー用の白黒の画像） */
const TRAY_ICON_PATH = path.join(ELECTRON_DIR, '..', 'assets', 'icons', IS_MAC ? 'trayTemplate.png' : 'tray.png');

/** 範囲キャプチャのホットキー（要件§12） */
const CAPTURE_HOTKEY = 'CommandOrControl+Shift+Y';

/** ホットキーの、利用者に見せる表記 */
const CAPTURE_HOTKEY_LABEL = IS_MAC ? 'Cmd+Shift+Y' : 'Ctrl+Shift+Y';

/** 確認ウインドウの大きさ（px） */
const MAIN_WINDOW_SIZE = Object.freeze({ width: 1120, height: 760, minWidth: 820, minHeight: 560 });

/** 確認ウインドウ。作成前と破棄した後は null */
let mainWindow = null;

/** トレイのアイコン（ガベージコレクションで消えないよう保持する） */
let tray = null;

/** アプリを終了しようとしているか（true なら確認ウインドウを閉じたとき隠さずに閉じる） */
let isQuitting = false;

/** ホットキーを登録できたか（ほかのアプリが使っていると登録できない） */
let isHotkeyRegistered = false;

/** 取り込んだ画像の置き場所（メモリの中だけ） */
const captureImageStore = createCaptureImageStore();

/** 範囲キャプチャから OCR までの処理 */
const captureController = createCaptureController({
  imageStore: captureImageStore,
  getMainWindow: () => mainWindow,
  showMainWindow,
  sendStatus: (status) => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(CAPTURE_STATUS_CHANNEL, status);
    }
  },
  overlayPreloadPath: OVERLAY_PRELOAD_PATH,
  webPreferences: SECURE_WEB_PREFERENCES,
});

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
  // 閉じるボタンでは終了せず隠す（常駐）。取り込んだ画像はこのときに消す
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
      captureController.clearCapture();
      window.webContents.send(CAPTURE_STATUS_CHANNEL, { state: 'cleared' });
    }
  });
  window.on('closed', () => {
    mainWindow = null;
  });
  window.loadURL(APP_ENTRY_URL).catch((error) => {
    dialog.showErrorBox('画面を表示できません', `画面の読み込みに失敗しました。（${error.name}）`);
  });
  mainWindow = window;
}

/**
 * 確認ウインドウを表示して前面に出す（なければ作る）。
 */
function showMainWindow() {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
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
 * 画面からの要求（IPC）の受け付けを登録する。
 */
function registerIpcHandlers() {
  // 呼ぶたびに shell.openExternal を参照する（実機の自動確認で差し替えられるようにするため）
  const openExternal = (url) => shell.openExternal(url);
  ipcMain.handle(OPEN_CALENDAR_EVENTS_CHANNEL, createOpenCalendarEventsHandler({ openExternal, isTrustedSender }));
  ipcMain.handle(OPEN_CALENDAR_DAY_CHANNEL, createOpenCalendarDayHandler({ openExternal, isTrustedSender }));

  const captureHandlers = createCaptureHandlers({
    isTrustedSender,
    controller: captureController,
    getAppStatus: () => ({ hotkeyRegistered: isHotkeyRegistered, hotkeyLabel: CAPTURE_HOTKEY_LABEL }),
  });
  ipcMain.handle(CAPTURE_START_CHANNEL, captureHandlers.handleStart);
  ipcMain.handle(CAPTURE_IMPORT_CHANNEL, captureHandlers.handleImport);
  ipcMain.handle(CAPTURE_REREAD_CHANNEL, captureHandlers.handleReread);
  ipcMain.handle(CAPTURE_CLEAR_CHANNEL, captureHandlers.handleClear);
  ipcMain.handle(APP_STATUS_CHANNEL, captureHandlers.handleAppStatus);
  ipcMain.handle(OVERLAY_SELECT_CHANNEL, (event, rect) => captureController.handleOverlaySelect(event, rect));
  ipcMain.handle(OVERLAY_CANCEL_CHANNEL, (event) => captureController.handleOverlayCancel(event));
  ipcMain.handle(
    OPEN_SCREEN_SETTINGS_CHANNEL,
    createOpenScreenSettingsHandler({ isTrustedSender, openExternal, platform: process.platform }),
  );
}

/**
 * app の準備ができたら、セキュリティ設定を適用し、常駐・ホットキー・ウインドウを用意する。
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
  protocol.handle(APP_SCHEME, (request) =>
    handleAppRequest(request, RENDERER_DIST_DIR, (name) => captureImageStore.get(name)),
  );
  registerIpcHandlers();

  tray = createAppTray({
    iconPath: TRAY_ICON_PATH,
    isTemplateImage: IS_MAC,
    hotkeyLabel: CAPTURE_HOTKEY_LABEL,
    onCapture: () => captureController.startCapture(),
    onShowWindow: showMainWindow,
    onQuit: () => app.quit(),
  });

  // 登録できなかった場合（ほかのアプリが使っている）は、確認ウインドウで知らせる（要件§12）
  isHotkeyRegistered = globalShortcut.register(CAPTURE_HOTKEY, () => captureController.startCapture());

  createMainWindow();
}

// ---- 多重起動の防止 ----
// 2つ目を起動すると、ホットキーの取り合いなどが起きるため、1つだけ動くようにする
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  // 画面が作られるたびに、ページ移動・新しいウインドウの制限をかける
  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));
  // ウインドウがすべて閉じても終了しない（常駐する）。何もしない処理を登録すると自動で終了しなくなる
  app.on('window-all-closed', () => {});
  // Mac で Dock のアイコンを押したら、確認ウインドウを表示する
  app.on('activate', () => {
    if (app.isReady()) {
      showMainWindow();
    }
  });
  // 終了するときは、確認ウインドウを隠さずに閉じる
  app.on('before-quit', () => {
    isQuitting = true;
  });
  // 終了するときに、ホットキーを解除し（ほかのアプリが使えるように）、取り込んだ画像を消す（要件§5.9）
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    captureController.clearCapture();
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
