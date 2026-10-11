/**
 * settingsIpc.js
 * 目的：設定画面からの要求（設定の取得・保存、デスクトップのアイコンの作成）を受け付ける（要件§6.1・§12）。
 *
 * セキュリティ（CLAUDE.md）：
 *   (1) 送信元が確認ウインドウの画面（app://bundle の最上位のフレーム）かを確かめる
 *   (2) 設定は、決まった選択肢に入っているかを検証し、外れていれば断る（src/core/settings.js）
 *   (3) アイコンの作成は引数を受け取らない（作る場所・名前・中身はメインプロセスで決まっている）
 *   (4) エラーの文に、パスなどの個人の情報を含めない
 *   (5) 保存の途中で失敗したら、ホットキーと自動起動を元に戻す（中途半端な状態を残さない）
 *
 * このファイルは electron を import しない。ホットキー・自動起動・アイコンの処理は main.js から受け取るため、単体テストできる。
 */

import { SettingsError, buildAccelerator, validateSettings } from '../src/core/settings.js';
import { DesktopIntegrationError } from './desktopIntegration.js';

/** 設定を取得するチャンネル名（electron/preload.cjs と同じ値にする） */
export const SETTINGS_GET_CHANNEL = 'settings:get';

/** 設定を保存するチャンネル名（electron/preload.cjs と同じ値にする） */
export const SETTINGS_SAVE_CHANNEL = 'settings:save';

/** デスクトップのアイコンを作るチャンネル名（electron/preload.cjs と同じ値にする） */
export const DESKTOP_ICON_CHANNEL = 'settings:create-desktop-icon';

/** 送信元を確認できなかったときの文 */
const UNTRUSTED_SENDER_MESSAGE = '不正な要求のため、処理を中断しました。';
/** 前の保存が終わっていないときの文 */
const BUSY_MESSAGE = '前の保存が終わるまでお待ちください。';
/** 予期しない形式の要求のときの文 */
const INVALID_REQUEST_MESSAGE = '設定を確認できませんでした。';
/** 新しいホットキーを登録できなかったときの文 */
const HOTKEY_UNAVAILABLE_MESSAGE = 'そのホットキーは、ほかのアプリが使っているため登録できませんでした。別の組み合わせを選んでください。';
/** 自動起動の設定を変えられなかったときの文 */
const AUTO_START_FAILED_MESSAGE = 'ログイン時の自動起動の設定を変えられませんでした。';
/** 自動起動に対応していない OS のときの文 */
const AUTO_START_UNSUPPORTED_MESSAGE = 'この OS では、ログイン時の自動起動を設定できません。';
/** 設定ファイルに保存できなかったときの文 */
const SAVE_FAILED_MESSAGE = '設定を保存できませんでした。もう一度お試しください。';
/** アイコンを作れなかったときの文 */
const DESKTOP_ICON_FAILED_MESSAGE = 'デスクトップにアイコンを作れませんでした。';
/** アイコンを作れたときの文 */
const DESKTOP_ICON_CREATED_MESSAGE = 'デスクトップにアイコンを作りました。';

/**
 * 画面から届いた保存の要求を、設定（予定の長さ・ホットキー）と自動起動のオン／オフに分けて検証する。
 *
 * @param {unknown} rawRequest 画面から届いた値 {durationMinutes, hotkeyModifiers, hotkeyKey, autoStart}
 * @returns {{settings: {durationMinutes: number, hotkeyModifiers: string, hotkeyKey: string}, autoStart: boolean}}
 * @throws {SettingsError} 内容に問題がある場合
 */
export function parseSaveRequest(rawRequest) {
  if (rawRequest === null || typeof rawRequest !== 'object' || Array.isArray(rawRequest)) {
    throw new SettingsError('設定の形式が正しくありません。');
  }
  const { autoStart, ...rawSettings } = rawRequest;
  if (typeof autoStart !== 'boolean') {
    throw new SettingsError('自動起動の設定が正しくありません。');
  }
  return { settings: validateSettings(rawSettings), autoStart };
}

/**
 * 設定画面からの要求を処理する関数をまとめて作る（ipcMain.handle に渡す）。
 *
 * @param {object} dependencies
 * @param {(event: object) => boolean} dependencies.isTrustedSender 送信元が確認ウインドウの画面かを調べる関数
 * @param {{save: (settings: object) => Promise<void>}} dependencies.store 設定の保存先（settingsStore.js）
 * @param {() => object} dependencies.getCurrentSettings 今の設定を返す関数
 * @param {(settings: object) => void} dependencies.setCurrentSettings 今の設定を置き換える関数
 * @param {(settings: object) => boolean} dependencies.changeHotkey ホットキーを登録し直す関数（失敗したら元のホットキーのまま false）
 * @param {() => {hotkeyRegistered: boolean, hotkeyLabel: string}} dependencies.getHotkeyStatus ホットキーの状態
 * @param {{isSupported: boolean, isEnabled: () => Promise<boolean>, setEnabled: (enabled: boolean) => Promise<void>}} dependencies.autoStart
 *   ログイン時の自動起動（OS の登録の状態を正とする）
 * @param {() => Promise<void>} dependencies.createDesktopIcon デスクトップにアイコンを作る関数
 * @param {'mac' | 'windows' | 'other'} dependencies.platform OS の種類（画面の表記に使う）
 * @returns {{handleGet: Function, handleSave: Function, handleCreateDesktopIcon: Function}}
 */
export function createSettingsHandlers({
  isTrustedSender,
  store,
  getCurrentSettings,
  setCurrentSettings,
  changeHotkey,
  getHotkeyStatus,
  autoStart,
  createDesktopIcon,
  platform,
}) {
  /** 送信元を確かめる。確認ウインドウ以外からの要求なら、断る結果を返す */
  const rejectUntrusted = (event) => (isTrustedSender(event) ? null : { ok: false, message: UNTRUSTED_SENDER_MESSAGE });
  /** 自動起動がオンか（対応していない OS では常にオフ） */
  const readAutoStart = async () => (autoStart.isSupported ? autoStart.isEnabled() : false);
  let isSaving = false; // 保存の途中なら true（重ねての保存を断る）

  return {
    /**
     * 今の設定と、自動起動・ホットキーの状態を返す。
     */
    async handleGet(event) {
      const rejected = rejectUntrusted(event);
      if (rejected !== null) return rejected;
      return {
        ok: true,
        settings: getCurrentSettings(),
        autoStart: await readAutoStart(),
        autoStartSupported: autoStart.isSupported,
        platform,
        ...getHotkeyStatus(),
      };
    },

    /**
     * 設定を検証し、ホットキー・自動起動に反映してから保存する。途中で失敗したら元に戻す。
     */
    async handleSave(event, rawRequest) {
      const rejected = rejectUntrusted(event);
      if (rejected !== null) return rejected;
      if (isSaving) return { ok: false, message: BUSY_MESSAGE };

      let request;
      try {
        request = parseSaveRequest(rawRequest);
      } catch (error) {
        return { ok: false, message: error instanceof SettingsError ? error.message : INVALID_REQUEST_MESSAGE };
      }

      isSaving = true;
      try {
        const previousSettings = getCurrentSettings();
        const isHotkeyChanged = buildAccelerator(request.settings) !== buildAccelerator(previousSettings);
        if (isHotkeyChanged && !changeHotkey(request.settings)) {
          return { ok: false, message: HOTKEY_UNAVAILABLE_MESSAGE };
        }
        /** ホットキーを元に戻す（途中で失敗したとき） */
        const revertHotkey = () => {
          if (isHotkeyChanged) changeHotkey(previousSettings);
        };

        const wasAutoStartEnabled = await readAutoStart();
        const isAutoStartChanged = request.autoStart !== wasAutoStartEnabled;
        if (isAutoStartChanged) {
          if (!autoStart.isSupported) {
            revertHotkey();
            return { ok: false, message: AUTO_START_UNSUPPORTED_MESSAGE };
          }
          try {
            await autoStart.setEnabled(request.autoStart);
          } catch {
            revertHotkey();
            return { ok: false, message: AUTO_START_FAILED_MESSAGE };
          }
        }

        try {
          await store.save(request.settings);
        } catch {
          revertHotkey();
          if (isAutoStartChanged) {
            await autoStart.setEnabled(wasAutoStartEnabled).catch(() => {}); // 戻せなくても、保存の失敗を先に知らせる
          }
          return { ok: false, message: SAVE_FAILED_MESSAGE };
        }

        setCurrentSettings(request.settings);
        return { ok: true, settings: request.settings, autoStart: request.autoStart, ...getHotkeyStatus() };
      } finally {
        isSaving = false;
      }
    },

    /**
     * デスクトップにアイコンを作る（場所・名前・中身はメインプロセスで決まっている）。
     */
    async handleCreateDesktopIcon(event) {
      const rejected = rejectUntrusted(event);
      if (rejected !== null) return rejected;
      try {
        await createDesktopIcon();
        return { ok: true, message: DESKTOP_ICON_CREATED_MESSAGE };
      } catch (error) {
        return { ok: false, message: error instanceof DesktopIntegrationError ? error.message : DESKTOP_ICON_FAILED_MESSAGE };
      }
    },
  };
}
