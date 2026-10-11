/**
 * SettingsDialog.jsx
 * 目的：設定画面（要件§6.1・§12）。次を変えられる。
 *   - 予定の既定の長さ（候補の「終了」で初めに選ばれている長さ。30分刻み）
 *   - ホットキー（範囲キャプチャを始めるキー）
 *   - ログイン時の自動起動（オンのときはウインドウを出さずに常駐する）
 *   - デスクトップにアイコンを作る（npm start を使わずに起動できるようにする）
 *
 * 選択肢は src/core/settings.js の決まったものだけ。保存するときは、メインプロセスでも改めて検証する。
 * HTML 標準の <dialog> を使う。開いている間は後ろの画面を操作できず、Esc キーでも閉じられる。
 */

import { useEffect, useRef, useState } from 'react';
import {
  CLIPBOARD_HOTKEY_KEY,
  DEFAULT_SETTINGS,
  DURATION_CHOICES,
  HOTKEY_KEY_CHOICES,
  HOTKEY_MODIFIER_CHOICES,
  formatClipboardHotkeyLabel,
  formatHotkeyLabel,
  formatModifierLabel,
} from '../../core/settings.js';

/** 設定を読み込めなかったときの文 */
const LOAD_ERROR_MESSAGE = '設定を読み込めませんでした。もう一度開いてください。';

/** 保存・アイコンの作成で予期しないエラーが起きたときの文 */
const UNEXPECTED_ERROR_MESSAGE = '処理中にエラーが発生しました。もう一度お試しください。';

/**
 * 設定画面のポップアップ。
 *
 * @param {object} props
 * @param {boolean} props.open 表示するか
 * @param {() => void} props.onClose 閉じたときの処理
 * @param {(result: {settings: object, hotkeyRegistered: boolean, hotkeyLabel: string}) => void} props.onSaved
 *   保存できたときの処理（このあとダイアログを閉じる）
 * @returns {JSX.Element}
 */
export default function SettingsDialog({ open, onClose, onSaved }) {
  /** <dialog> 要素への参照（showModal / close を呼ぶため） */
  const dialogRef = useRef(null);
  /** 入力中の設定（予定の長さ・ホットキー） */
  const [form, setForm] = useState(DEFAULT_SETTINGS);
  /** 入力中の自動起動のオン／オフ */
  const [autoStart, setAutoStart] = useState(false);
  /** この OS で自動起動を設定できるか */
  const [autoStartSupported, setAutoStartSupported] = useState(false);
  /** Mac か（ホットキーを Cmd・Option と表記する） */
  const [isMac, setIsMac] = useState(false);
  /** 設定を読み込み終わったか（読み込むまで保存できない） */
  const [isLoaded, setIsLoaded] = useState(false);
  /** 保存・アイコンの作成の途中か（二度押しを防ぐ） */
  const [isBusy, setIsBusy] = useState(false);
  /** ダイアログの中に表示するエラーの文 */
  const [errorMessage, setErrorMessage] = useState('');
  /** アイコンの作成の結果の文（成功・失敗） */
  const [desktopIconResult, setDesktopIconResult] = useState(null);

  // open の値に合わせて、ダイアログを開く／閉じる。開くときは、今の設定をメインプロセスから読み込む
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return undefined;
    }
    if (!open) {
      if (dialog.open) dialog.close();
      return undefined;
    }
    if (!dialog.open) {
      setIsLoaded(false);
      setErrorMessage('');
      setDesktopIconResult(null);
      dialog.showModal();
    }
    let isCurrent = true; // 読み込みの途中で閉じられたら、結果を使わない
    window.calendarApp
      ?.getSettings()
      .then((result) => {
        if (!isCurrent) return;
        if (!result?.ok) {
          setErrorMessage(result?.message ?? LOAD_ERROR_MESSAGE);
          return;
        }
        setForm(result.settings);
        setAutoStart(result.autoStart === true);
        setAutoStartSupported(result.autoStartSupported === true);
        setIsMac(result.platform === 'mac');
        setIsLoaded(true);
      })
      .catch(() => {
        if (isCurrent) setErrorMessage(LOAD_ERROR_MESSAGE);
      });
    return () => {
      isCurrent = false;
    };
  }, [open]);

  /**
   * 入力中の設定の1項目を変える。
   *
   * @param {'durationMinutes' | 'hotkeyModifiers' | 'hotkeyKey'} field 項目名
   * @param {number | string} value 新しい値
   */
  function handleFieldChange(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  /** 「保存」：メインプロセスに設定を保存してもらい、できたらダイアログを閉じる */
  async function handleSave() {
    setErrorMessage('');
    setIsBusy(true);
    try {
      const result = await window.calendarApp.saveSettings({ ...form, autoStart });
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      onSaved(result);
      dialogRef.current?.close();
    } catch (error) {
      setErrorMessage(UNEXPECTED_ERROR_MESSAGE);
      console.error('設定を保存できませんでした:', error?.name);
    } finally {
      setIsBusy(false);
    }
  }

  /** 「デスクトップにアイコンを作る」：メインプロセスにアイコンを作ってもらい、結果を表示する */
  async function handleCreateDesktopIcon() {
    setDesktopIconResult(null);
    setIsBusy(true);
    try {
      const result = await window.calendarApp.createDesktopIcon();
      setDesktopIconResult({ ok: result.ok, message: result.message });
    } catch (error) {
      setDesktopIconResult({ ok: false, message: UNEXPECTED_ERROR_MESSAGE });
      console.error('デスクトップのアイコンを作れませんでした:', error?.name);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog settings-dialog" onClose={onClose} aria-labelledby="settings-dialog-title">
      <h2 id="settings-dialog-title" className="dialog-title">
        設定
      </h2>

      <label className="settings-row">
        <span className="settings-label">予定の既定の長さ</span>
        <select
          id="settings-duration"
          className="select-field"
          value={form.durationMinutes}
          onChange={(event) => handleFieldChange('durationMinutes', Number(event.target.value))}
          disabled={!isLoaded}
        >
          {DURATION_CHOICES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes}分
            </option>
          ))}
        </select>
      </label>
      <p className="field-note">候補の「終了」で、初めに選ばれている長さです（あとから候補ごとに選び直せます）。</p>

      <div className="settings-row">
        <span className="settings-label" id="settings-hotkey-label">
          範囲を選んで読み取るキー
        </span>
        <div className="settings-hotkey" role="group" aria-labelledby="settings-hotkey-label">
          <select
            id="settings-hotkey-modifiers"
            className="select-field"
            aria-label="組み合わせるキー"
            value={form.hotkeyModifiers}
            onChange={(event) => handleFieldChange('hotkeyModifiers', event.target.value)}
            disabled={!isLoaded}
          >
            {HOTKEY_MODIFIER_CHOICES.map((modifiers) => (
              <option key={modifiers} value={modifiers}>
                {formatModifierLabel(modifiers, isMac)}
              </option>
            ))}
          </select>
          <span aria-hidden="true">＋</span>
          <select
            id="settings-hotkey-key"
            className="select-field"
            aria-label="文字・数字のキー"
            value={form.hotkeyKey}
            onChange={(event) => handleFieldChange('hotkeyKey', event.target.value)}
            disabled={!isLoaded}
          >
            {HOTKEY_KEY_CHOICES.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="field-note">
        今の選択：{formatHotkeyLabel(form, isMac)}（文字の入力を邪魔しないよう、{formatModifierLabel('CommandOrControl', isMac)} を含む組み合わせだけ選べます）
        <br />
        コピーした文章の読み取り：{formatClipboardHotkeyLabel(form, isMac)}（修飾キーは上と同じ。{CLIPBOARD_HOTKEY_KEY} は範囲キャプチャには選べません）
      </p>

      <label className="settings-row settings-checkbox">
        <input
          id="settings-auto-start"
          type="checkbox"
          checked={autoStart}
          onChange={(event) => setAutoStart(event.target.checked)}
          disabled={!isLoaded || !autoStartSupported}
        />
        ログイン時に自動で起動する
      </label>
      <p className="field-note">
        オンにすると、PC にログインしたときにウインドウを出さずに起動し、{isMac ? 'メニューバー' : 'タスクトレイ'}のアイコンとキーで使えます。
      </p>

      <div className="settings-row">
        <span className="settings-label">デスクトップのアイコン</span>
        <button type="button" className="button button-secondary" onClick={handleCreateDesktopIcon} disabled={isBusy}>
          デスクトップにアイコンを作る
        </button>
      </div>
      <p className="field-note">
        アイコンから起動できるようになります（npm start は不要）。プロジェクトのフォルダを移動したときは作り直してください。
      </p>
      {desktopIconResult !== null && (
        <p className={desktopIconResult.ok ? 'success-message' : 'field-note field-note-error'} role="status">
          {desktopIconResult.message}
        </p>
      )}

      {errorMessage !== '' && (
        <p className="field-note field-note-error" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="button-row button-row-end">
        <button type="button" className="button button-secondary" onClick={() => dialogRef.current?.close()}>
          キャンセル
        </button>
        <button type="button" className="button button-primary" onClick={handleSave} disabled={!isLoaded || isBusy}>
          保存
        </button>
      </div>
    </dialog>
  );
}
