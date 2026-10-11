/**
 * main.js（Electron のメインプロセス）
 * 目的：アプリの起動、確認ウインドウの作成、常駐（トレイ）とホットキー、セキュリティ設定、
 *       画面とメインプロセスの通信（IPC）の受け付けを行う。
 *
 * 常駐（要件§6.1）：確認ウインドウを閉じてもアプリは終了せず、トレイ（Mac はメニューバー）に残る。
 *   終了はトレイのメニューの「終了」（Mac は Cmd+Q も可）。
 * ホットキー（要件§12）：既定は Ctrl+Shift+Y（Mac は Cmd+Shift+Y）で範囲キャプチャを始める。設定画面で変えられる。終了時に解除する。
 * 設定（要件§6.1）：予定の既定の長さ・ホットキーを settings.json に保存する（文章・画像は保存しない）。
 * デスクトップのアイコン・ログイン時の自動起動（要件§12）：設定画面から作る・切り替える（desktopIntegration.js）。
 *   自動起動では --hidden 付きで起動し、ウインドウを出さずに常駐する。
 */

import { app, BrowserWindow, dialog, globalShortcut, ipcMain, protocol, session, shell } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS, buildAccelerator, formatHotkeyLabel } from '../src/core/settings.js';
import { APP_ENTRY_URL, APP_SCHEME, APP_SCHEME_PRIVILEGES, handleAppRequest, isAppUrl } from './appProtocol.js';
import { OPEN_CALENDAR_EVENTS_CHANNEL, createOpenCalendarEventsHandler } from './calendarIpc.js';
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
import {
  DesktopIntegrationError,
  HIDDEN_START_ARGUMENT,
  WINDOWS_SHORTCUT_FILE_NAME,
  buildWindowsLoginItemSettings,
  buildWindowsShortcutOptions,
  createMacDesktopAlias,
  disableMacAutoStart,
  enableMacAutoStart,
  isMacAutoStartEnabled,
  isReplaceableWindowsShortcut,
  writeMacLauncher,
} from './desktopIntegration.js';
import { SECURE_WEB_PREFERENCES, applySessionSecurity, hardenWebContents } from './security.js';
import {
  DESKTOP_ICON_CHANNEL,
  SETTINGS_GET_CHANNEL,
  SETTINGS_SAVE_CHANNEL,
  createSettingsHandlers,
} from './settingsIpc.js';
import { createSettingsStore } from './settingsStore.js';
import { createAppTray } from './tray.js';

/** このファイルがあるフォルダ（electron/） */
const ELECTRON_DIR = path.dirname(fileURLToPath(import.meta.url));

/** このアプリのフォルダ（package.json があるプロジェクトのフォルダ） */
const APP_DIR = path.join(ELECTRON_DIR, '..');

/** Vite がビルドした画面ファイルの置き場所。app:// ではこのフォルダの中だけを配信する */
const RENDERER_DIST_DIR = path.join(APP_DIR, 'dist', 'renderer');

/** 確認ウインドウに関数を公開する preload スクリプト（サンドボックスで動くため CommonJS） */
const PRELOAD_PATH = path.join(ELECTRON_DIR, 'preload.cjs');

/** 範囲選択の画面に関数を公開する preload スクリプト */
const OVERLAY_PRELOAD_PATH = path.join(ELECTRON_DIR, 'overlayPreload.cjs');

/** Mac か（トレイのアイコンやホットキーの表記が違う） */
const IS_MAC = process.platform === 'darwin';

/** Windows か（デスクトップのアイコン・自動起動の作り方が違う） */
const IS_WINDOWS = process.platform === 'win32';

/** アイコンの置き場所 */
const ICONS_DIR = path.join(APP_DIR, 'assets', 'icons');

/** トレイのアイコン（Mac はメニューバー用の白黒の画像） */
const TRAY_ICON_PATH = path.join(ICONS_DIR, IS_MAC ? 'trayTemplate.png' : 'tray.png');

/** アプリのアイコン（Mac の Dock 用 PNG・Mac の起動用アプリ用 .icns・Windows のショートカット用 .ico） */
const APP_ICON_PNG_PATH = path.join(ICONS_DIR, 'app.png');
const APP_ICON_ICNS_PATH = path.join(ICONS_DIR, 'app.icns');
const APP_ICON_ICO_PATH = path.join(ICONS_DIR, 'app.ico');

/** Mac の起動用のアプリを置くフォルダ（Git には含めない） */
const MAC_LAUNCHER_DIR = path.join(APP_DIR, 'launcher');

/** ウインドウを出さずに起動したか（ログイン時の自動起動。要件§12） */
const START_HIDDEN = process.argv.includes(HIDDEN_START_ARGUMENT);

/** 確認ウインドウの大きさ（px）。画面をコンパクトにしたため小さめ（2026-10-11 依頼者の指示。以前は 1120×760、最小 820×560） */
const MAIN_WINDOW_SIZE = Object.freeze({ width: 980, height: 660, minWidth: 760, minHeight: 500 });

/** 確認ウインドウ。作成前と破棄した後は null */
let mainWindow = null;

/** アプリを終了しようとしているか（true なら確認ウインドウを閉じたとき隠さずに閉じる） */
let isQuitting = false;

/** 実際に登録できているホットキー（Electron の表記）。登録できていなければ null（ほかのアプリが使っている） */
let registeredAccelerator = null;

/** 今の設定（起動時に settings.json から読み込む。読めなければ既定値） */
let currentSettings = DEFAULT_SETTINGS;

/** 設定の保存先（app の準備ができてから作る） */
let settingsStore = null;

/** トレイ（メニューのホットキーの表記を変える関数付き） */
let trayController = null;


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
 *
 * @param {{show?: boolean}} [options] show：読み込みが終わったら表示するか（自動起動のときは false で、出さずに常駐する）
 */
function createMainWindow({ show = true } = {}) {
  const window = new BrowserWindow({
    ...MAIN_WINDOW_SIZE,
    show: false, // 読み込みが終わってから表示する（白い画面のちらつきを防ぐ）
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: PRELOAD_PATH },
  });
  if (show) {
    window.once('ready-to-show', () => window.show());
  }
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
 * 確認ウインドウを表示して前面に出す（なければ作る）。起動処理が終わってから呼ぶ（showMainWindowWhenStarted を参照）。
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
 * 確認ウインドウを最小化する。予定作成画面をすべて開いたあと、ブラウザでの操作の邪魔にならないようにするため（依頼者の指示）。
 * 戻すときは、Dock・タスクバーのアイコンか、トレイの「確認ウインドウを開く」（showMainWindow）を使う。
 * ウインドウがない・壊れているときは何もしない。
 */
function minimizeMainWindow() {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
}

/**
 * ホットキーを登録する。
 *
 * @param {string} accelerator Electron の表記（例：CommandOrControl+Shift+Y）
 * @returns {boolean} 登録できたら true（ほかのアプリが使っていると false）
 */
function registerCaptureHotkey(accelerator) {
  if (globalShortcut.register(accelerator, () => captureController.startCapture())) {
    registeredAccelerator = accelerator;
    return true;
  }
  return false;
}

/**
 * ホットキーを、設定の組み合わせに登録し直す（設定画面で変えたとき）。
 * 新しい組み合わせを登録できなければ、元の組み合わせに戻して false を返す。
 *
 * @param {{hotkeyModifiers: string, hotkeyKey: string}} nextSettings 新しい設定（検証済み）
 * @returns {boolean} 登録できたら true
 */
function changeCaptureHotkey(nextSettings) {
  const previousAccelerator = registeredAccelerator;
  if (previousAccelerator !== null) {
    globalShortcut.unregister(previousAccelerator);
    registeredAccelerator = null;
  }
  if (registerCaptureHotkey(buildAccelerator(nextSettings))) {
    trayController?.setHotkeyLabel(formatHotkeyLabel(nextSettings, IS_MAC));
    return true;
  }
  if (previousAccelerator !== null) {
    registerCaptureHotkey(previousAccelerator); // 元に戻す
  }
  return false;
}

/**
 * ホットキーの状態（登録できているか、利用者に見せる表記）を返す。
 *
 * @returns {{hotkeyRegistered: boolean, hotkeyLabel: string}}
 */
function getHotkeyStatus() {
  return { hotkeyRegistered: registeredAccelerator !== null, hotkeyLabel: formatHotkeyLabel(currentSettings, IS_MAC) };
}

/**
 * デスクトップにアイコンを作る（要件§12：G7）。
 *   Mac：プロジェクトの launcher/ に起動用のアプリを作り、デスクトップにその分身を置く
 *   Windows：デスクトップにショートカットを作る
 *
 * @returns {Promise<void>}
 * @throws {DesktopIntegrationError} 作れなかった場合
 */
async function createDesktopIcon() {
  if (IS_MAC) {
    const launcherPath = await writeCurrentMacLauncher();
    await createMacDesktopAlias({ desktopDir: app.getPath('desktop'), launcherPath });
    return;
  }
  if (IS_WINDOWS) {
    const shortcutPath = path.join(app.getPath('desktop'), WINDOWS_SHORTCUT_FILE_NAME);
    if (existsSync(shortcutPath) && !isReplaceableWindowsShortcut(readWindowsShortcut(shortcutPath))) {
      throw new DesktopIntegrationError(`デスクトップに「${WINDOWS_SHORTCUT_FILE_NAME}」という名前のものが既にあるため、アイコンを作れませんでした。`);
    }
    const options = buildWindowsShortcutOptions({ electronPath: process.execPath, appPath: APP_DIR, iconPath: APP_ICON_ICO_PATH });
    if (!shell.writeShortcutLink(shortcutPath, 'create', options)) {
      throw new DesktopIntegrationError('デスクトップにアイコンを作れませんでした。');
    }
    return;
  }
  throw new DesktopIntegrationError('この OS では、デスクトップのアイコンを作れません。');
}

/**
 * Mac の起動用アプリを、今のプロジェクトの場所・Electron の場所で launcher/ に書き出す（デスクトップのアイコンと自動起動で共通）。
 *
 * @returns {Promise<string>} 起動用アプリのパス
 */
function writeCurrentMacLauncher() {
  return writeMacLauncher({
    launcherDir: MAC_LAUNCHER_DIR,
    electronPath: process.execPath,
    appPath: APP_DIR,
    iconPath: APP_ICON_ICNS_PATH,
  });
}

/**
 * Mac の LaunchAgents のフォルダ（~/Library/LaunchAgents）。自動起動の plist を置く場所。
 *
 * @returns {string}
 */
function getMacLaunchAgentsDir() {
  return path.join(app.getPath('home'), 'Library', 'LaunchAgents');
}

/**
 * Windows のショートカットの中身を読む。読めないときは null（このアプリが作ったものとはみなさない）。
 *
 * @param {string} shortcutPath ショートカットのパス
 * @returns {Electron.ShortcutDetails | null}
 */
function readWindowsShortcut(shortcutPath) {
  try {
    return shell.readShortcutLink(shortcutPath);
  } catch {
    return null;
  }
}

/** ログイン時の自動起動（OS の登録の状態を正とする。要件§12：G8） */
const autoStart = {
  isSupported: IS_MAC || IS_WINDOWS,

  /**
   * 自動起動がオンか。
   *
   * @returns {Promise<boolean>}
   */
  async isEnabled() {
    if (IS_MAC) {
      return isMacAutoStartEnabled({ launchAgentsDir: getMacLaunchAgentsDir() });
    }
    if (IS_WINDOWS) {
      return app.getLoginItemSettings(buildWindowsLoginItemSettings({ electronPath: process.execPath, appPath: APP_DIR })).openAtLogin;
    }
    return false;
  },

  /**
   * 自動起動をオン／オフにする。Mac は起動用のアプリを最新のパスで作り直してから LaunchAgent を置く。
   *
   * @param {boolean} enabled オンにするなら true
   * @returns {Promise<void>}
   */
  async setEnabled(enabled) {
    if (IS_MAC) {
      const launchAgentsDir = getMacLaunchAgentsDir();
      if (!enabled) {
        await disableMacAutoStart({ launchAgentsDir });
        return;
      }
      const launcherPath = await writeCurrentMacLauncher();
      await enableMacAutoStart({ launchAgentsDir, launcherPath });
      return;
    }
    if (IS_WINDOWS) {
      app.setLoginItemSettings(
        buildWindowsLoginItemSettings({ electronPath: process.execPath, appPath: APP_DIR, openAtLogin: enabled }),
      );
      return;
    }
    throw new DesktopIntegrationError('この OS では、ログイン時の自動起動を設定できません。');
  },
};

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
  ipcMain.handle(
    OPEN_CALENDAR_EVENTS_CHANNEL,
    createOpenCalendarEventsHandler({ openExternal, isTrustedSender, onAllOpened: minimizeMainWindow }),
  );

  const captureHandlers = createCaptureHandlers({
    isTrustedSender,
    controller: captureController,
    getAppStatus: getHotkeyStatus,
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

  const settingsHandlers = createSettingsHandlers({
    isTrustedSender,
    store: settingsStore,
    getCurrentSettings: () => currentSettings,
    setCurrentSettings: (settings) => {
      currentSettings = settings;
    },
    changeHotkey: changeCaptureHotkey,
    getHotkeyStatus,
    autoStart,
    createDesktopIcon,
    platform: IS_MAC ? 'mac' : IS_WINDOWS ? 'windows' : 'other',
  });
  ipcMain.handle(SETTINGS_GET_CHANNEL, settingsHandlers.handleGet);
  ipcMain.handle(SETTINGS_SAVE_CHANNEL, settingsHandlers.handleSave);
  ipcMain.handle(DESKTOP_ICON_CHANNEL, settingsHandlers.handleCreateDesktopIcon);
}

/**
 * app の準備ができたら、セキュリティ設定を適用し、設定を読み込んで、常駐・ホットキー・ウインドウを用意する。
 *
 * @returns {Promise<boolean>} 起動できたら true（画面のファイルがなく終了するときは false）
 */
async function startApp() {
  if (!existsSync(path.join(RENDERER_DIST_DIR, 'index.html'))) {
    dialog.showErrorBox(
      '起動できません',
      '画面のファイルが見つかりません。\nプロジェクトのフォルダで「npm start」を実行して起動してください。',
    );
    app.quit();
    return false;
  }
  applySessionSecurity(session.defaultSession);
  protocol.handle(APP_SCHEME, (request) =>
    handleAppRequest(request, RENDERER_DIST_DIR, (name) => captureImageStore.get(name)),
  );
  // 設定を読み込む（読めない・壊れているときは既定値。アプリは止めない）
  settingsStore = createSettingsStore(app.getPath('userData'));
  currentSettings = await settingsStore.load();
  registerIpcHandlers();

  trayController = createAppTray({
    iconPath: TRAY_ICON_PATH,
    isTemplateImage: IS_MAC,
    hotkeyLabel: formatHotkeyLabel(currentSettings, IS_MAC),
    onCapture: () => captureController.startCapture(),
    onShowWindow: showMainWindow,
    onQuit: () => app.quit(),
  });
  // Mac の Dock に、このアプリのアイコンを表示する（起動用のアプリから起動したときも同じ見た目にする）
  if (IS_MAC && existsSync(APP_ICON_PNG_PATH)) {
    app.dock?.setIcon(APP_ICON_PNG_PATH);
  }

  // 登録できなかった場合（ほかのアプリが使っている）は、確認ウインドウで知らせる（要件§12）
  registerCaptureHotkey(buildAccelerator(currentSettings));

  // 自動起動（--hidden）のときは、最初のウインドウを出さずに常駐する（トレイ・ホットキーから使う）
  createMainWindow({ show: !START_HIDDEN });
  return true;
}

// ---- 多重起動の防止 ----
// 2つ目を起動すると、ホットキーの取り合いなどが起きるため、1つだけ動くようにする
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  /**
   * 起動処理（startApp）の結果。設定の読み込みを待つ間に Dock の activate や2つ目の起動が来ても、
   * 準備（通信の受け付け・トレイ・ホットキー）がそろってから表示する（取りこぼさず、ウインドウも2つ作らない）
   */
  const appStarted = app
    .whenReady()
    .then(startApp)
    .catch((error) => {
      // 起動処理そのものに失敗した場合は、動作を続けられないため知らせて終了する
      dialog.showErrorBox('起動できません', `起動中にエラーが発生しました。（${error.name}）`);
      app.quit();
      return false;
    });
  /** 起動処理が終わってから確認ウインドウを表示する（起動できなかったときは何もしない） */
  const showMainWindowWhenStarted = () => {
    appStarted.then((isStarted) => {
      if (isStarted) showMainWindow();
    });
  };
  app.on('second-instance', showMainWindowWhenStarted);
  // 画面が作られるたびに、ページ移動・新しいウインドウの制限をかける
  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));
  // ウインドウがすべて閉じても終了しない（常駐する）。何もしない処理を登録すると自動で終了しなくなる
  app.on('window-all-closed', () => {});
  // Mac で Dock のアイコンを押したら、確認ウインドウを表示する
  app.on('activate', showMainWindowWhenStarted);
  // 終了するときは、確認ウインドウを隠さずに閉じる
  app.on('before-quit', () => {
    isQuitting = true;
  });
  // 終了するときに、ホットキーを解除し（ほかのアプリが使えるように）、取り込んだ画像を消す（要件§5.9）
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    captureController.clearCapture();
  });
}
