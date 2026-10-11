/**
 * settings.js
 * 目的：設定（予定の既定の長さ・ホットキー）の既定値・選択肢・検証と、ホットキーの表記をまとめる（要件§6.1・§12）。
 *
 * - 画面（設定画面の選択肢・表示）とメインプロセス（保存・読み込みの検証）の両方で使う。
 * - 画面から届いた設定は、決まった選択肢に入っているかを厳しく検証し、外れていれば断る（CLAUDE.md：IPC の引数の検証）。
 * - 保存した設定ファイルは書き換えられている可能性があるため、読み込むたびに検証し、おかしな項目は既定値に戻す。
 * - ホットキーは、決まった組み合わせ（Ctrl・Mac は Cmd を必ず含む）からだけ選べる。普段の文字入力を横取りしないため。
 * - コピーした文章を読み取るホットキーは、範囲キャプチャと同じ修飾キー＋ CLIPBOARD_HOTKEY_KEY（U）に固定する
 *   （設定の項目を増やさないため。修飾キーを変えると両方が変わる。依頼者承認 2026-10-11）。
 * - ログイン時の自動起動のオン／オフは、OS の登録の状態そのものを正とし、このファイルの設定には含めない。
 */

/** 予定の長さの既定値（分）。確認ウインドウの終了の選択で、時刻のある候補の初めの値になる（要件§5.4） */
export const DEFAULT_DURATION_MINUTES = 60;

/** 予定の既定の長さとして選べる値（分）。終了の選択（30分刻み）に合わせる（2026-10-12 依頼者の仕様変更で 15・45分を除いた） */
export const DURATION_CHOICES = Object.freeze([30, 60, 90, 120]);

/**
 * ホットキーの修飾キーとして選べる組み合わせ（Electron の表記）。
 * CommandOrControl は、Windows では Ctrl、Mac では Cmd になる。
 */
export const HOTKEY_MODIFIER_CHOICES = Object.freeze([
  'CommandOrControl+Shift',
  'CommandOrControl+Alt',
  'CommandOrControl+Alt+Shift',
]);

/** コピーした文章を読み取るホットキーのキー（修飾キーは範囲キャプチャと同じ。例：Ctrl+Shift+U） */
export const CLIPBOARD_HOTKEY_KEY = 'U';

/**
 * 範囲キャプチャのホットキーのキーとして選べる文字（英字 A〜Z と数字 0〜9）。
 * コピーした文章の読み取りのキー（U）は、同じ組み合わせになってしまうため選べない。
 */
export const HOTKEY_KEY_CHOICES = Object.freeze(
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].filter((key) => key !== CLIPBOARD_HOTKEY_KEY),
);

/** 設定の既定値（ホットキーの既定値は要件§12：Ctrl+Shift+Y、Mac は Cmd+Shift+Y） */
export const DEFAULT_SETTINGS = Object.freeze({
  durationMinutes: DEFAULT_DURATION_MINUTES,
  hotkeyModifiers: 'CommandOrControl+Shift',
  hotkeyKey: 'Y',
});

/** 設定の項目名（これ以外の項目は受け付けない） */
const SETTING_KEYS = Object.freeze(Object.keys(DEFAULT_SETTINGS));

/** 修飾キーの、利用者に見せる名前（Windows と Mac で違う） */
const MODIFIER_LABELS = Object.freeze({
  windows: Object.freeze({ CommandOrControl: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }),
  mac: Object.freeze({ CommandOrControl: 'Cmd', Alt: 'Option', Shift: 'Shift' }),
});

/** 設定の内容に問題があるときのエラー（利用者向けの文付き） */
export class SettingsError extends Error {
  /**
   * @param {string} message 利用者に見せる文
   */
  constructor(message) {
    super(message);
    this.name = 'SettingsError';
  }
}

/**
 * 画面から届いた設定を検証し、整えた設定を返す。項目の過不足・選択肢にない値は断る。
 *
 * @param {unknown} rawSettings 画面から届いた値
 * @returns {{durationMinutes: number, hotkeyModifiers: string, hotkeyKey: string}}
 * @throws {SettingsError} 内容に問題がある場合
 */
export function validateSettings(rawSettings) {
  if (rawSettings === null || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    throw new SettingsError('設定の形式が正しくありません。');
  }
  const keys = Object.keys(rawSettings);
  if (keys.length !== SETTING_KEYS.length || !SETTING_KEYS.every((key) => Object.hasOwn(rawSettings, key))) {
    throw new SettingsError('設定の項目が正しくありません。');
  }
  const { durationMinutes, hotkeyModifiers, hotkeyKey } = rawSettings;
  if (!DURATION_CHOICES.includes(durationMinutes)) {
    throw new SettingsError('予定の長さは、選択肢の中から選んでください。');
  }
  if (!HOTKEY_MODIFIER_CHOICES.includes(hotkeyModifiers) || !HOTKEY_KEY_CHOICES.includes(hotkeyKey)) {
    throw new SettingsError('ホットキーは、選択肢の中から選んでください。');
  }
  return { durationMinutes, hotkeyModifiers, hotkeyKey };
}

/**
 * 設定ファイルから読んだ値を整える。おかしな項目・足りない項目は既定値にし、知らない項目は捨てる。
 * （ファイルが壊れていても、アプリは既定値で起動できるようにする）
 *
 * @param {unknown} storedSettings 設定ファイルから読んだ値
 * @returns {{durationMinutes: number, hotkeyModifiers: string, hotkeyKey: string}}
 */
export function normalizeStoredSettings(storedSettings) {
  const stored = storedSettings !== null && typeof storedSettings === 'object' && !Array.isArray(storedSettings)
    ? storedSettings
    : {};
  return {
    durationMinutes: DURATION_CHOICES.includes(stored.durationMinutes) ? stored.durationMinutes : DEFAULT_SETTINGS.durationMinutes,
    hotkeyModifiers: HOTKEY_MODIFIER_CHOICES.includes(stored.hotkeyModifiers) ? stored.hotkeyModifiers : DEFAULT_SETTINGS.hotkeyModifiers,
    hotkeyKey: HOTKEY_KEY_CHOICES.includes(stored.hotkeyKey) ? stored.hotkeyKey : DEFAULT_SETTINGS.hotkeyKey,
  };
}

/**
 * 設定から、Electron に登録するホットキーの表記を作る。
 *
 * @param {{hotkeyModifiers: string, hotkeyKey: string}} settings 検証済みの設定
 * @returns {string} 例：CommandOrControl+Shift+Y
 */
export function buildAccelerator(settings) {
  return `${settings.hotkeyModifiers}+${settings.hotkeyKey}`;
}

/**
 * 修飾キーの組み合わせの、利用者に見せる表記を作る。
 *
 * @param {string} hotkeyModifiers 修飾キーの組み合わせ（Electron の表記。例：CommandOrControl+Shift）
 * @param {boolean} isMac Mac なら true（Cmd・Option と表記する）
 * @returns {string} 例：Windows は Ctrl+Shift、Mac は Cmd+Shift
 */
export function formatModifierLabel(hotkeyModifiers, isMac) {
  const labels = isMac ? MODIFIER_LABELS.mac : MODIFIER_LABELS.windows;
  return hotkeyModifiers
    .split('+')
    .map((modifier) => labels[modifier] ?? modifier)
    .join('+');
}

/**
 * ホットキーの、利用者に見せる表記を作る。
 *
 * @param {{hotkeyModifiers: string, hotkeyKey: string}} settings 検証済みの設定
 * @param {boolean} isMac Mac なら true（Cmd・Option と表記する）
 * @returns {string} 例：Windows は Ctrl+Shift+Y、Mac は Cmd+Shift+Y
 */
export function formatHotkeyLabel(settings, isMac) {
  return `${formatModifierLabel(settings.hotkeyModifiers, isMac)}+${settings.hotkeyKey}`;
}

/**
 * コピーした文章を読み取るホットキーの、Electron に登録する表記を作る（修飾キーは範囲キャプチャと同じ）。
 *
 * @param {{hotkeyModifiers: string}} settings 検証済みの設定
 * @returns {string} 例：CommandOrControl+Shift+U
 */
export function buildClipboardAccelerator(settings) {
  return `${settings.hotkeyModifiers}+${CLIPBOARD_HOTKEY_KEY}`;
}

/**
 * コピーした文章を読み取るホットキーの、利用者に見せる表記を作る。
 *
 * @param {{hotkeyModifiers: string}} settings 検証済みの設定
 * @param {boolean} isMac Mac なら true（Cmd・Option と表記する）
 * @returns {string} 例：Windows は Ctrl+Shift+U、Mac は Cmd+Shift+U
 */
export function formatClipboardHotkeyLabel(settings, isMac) {
  return `${formatModifierLabel(settings.hotkeyModifiers, isMac)}+${CLIPBOARD_HOTKEY_KEY}`;
}
