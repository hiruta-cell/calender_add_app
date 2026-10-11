/**
 * settingsStore.js
 * 目的：設定（予定の既定の長さ・ホットキー）を、アプリの設定フォルダの settings.json に保存し、読み込む。
 *
 * - 保存するのは設定だけ。貼り付けた文章・取り込んだ画像・読み取った文字は保存しない（CLAUDE.md）。
 * - 読み込んだ値は書き換えられている可能性があるため検証し、おかしな項目は既定値にする（src/core/settings.js）。
 * - ファイルがない・大きすぎる・壊れている・読めないときも、既定値で起動できるようにする（アプリを止めない）。
 * - 書き込みは一時ファイルに書いてから名前を変える（途中で止まっても、壊れたファイルを残さない）。
 *   ファイルは本人だけが読み書きできる権限（600）で作る。
 * - このファイルは electron を import しない（保存先のフォルダは main.js から受け取る）。単体テストできる。
 */

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeStoredSettings } from '../src/core/settings.js';

/** 設定ファイルの名前 */
export const SETTINGS_FILE_NAME = 'settings.json';

/** 読み込む設定ファイルの大きさの上限（バイト）。設定は数十バイトなので、これを超えるものは壊れているとみなす */
export const MAX_SETTINGS_FILE_BYTES = 4096;

/** 設定ファイルの権限（本人だけが読み書きできる） */
const SETTINGS_FILE_MODE = 0o600;

/**
 * 設定の保存先を作る。
 *
 * @param {string} directory 設定ファイルを置くフォルダ（アプリの設定フォルダ：app.getPath('userData')）
 * @returns {{filePath: string, load: () => Promise<object>, save: (settings: object) => Promise<void>}}
 */
export function createSettingsStore(directory) {
  const filePath = path.join(directory, SETTINGS_FILE_NAME);

  return {
    filePath,

    /**
     * 設定を読み込む。読めない・壊れているときは既定値を返す（例外を投げない）。
     *
     * @returns {Promise<{durationMinutes: number, hotkeyModifiers: string, hotkeyKey: string}>}
     */
    async load() {
      let buffer;
      try {
        buffer = await readFile(filePath);
      } catch {
        return normalizeStoredSettings(null); // まだ保存していない・読めない
      }
      if (buffer.length > MAX_SETTINGS_FILE_BYTES) {
        return normalizeStoredSettings(null);
      }
      try {
        return normalizeStoredSettings(JSON.parse(buffer.toString('utf8')));
      } catch {
        return normalizeStoredSettings(null); // JSON として読めない
      }
    },

    /**
     * 設定を保存する（検証済みの設定を渡すこと）。決まった項目だけを書き込む。
     *
     * @param {{durationMinutes: number, hotkeyModifiers: string, hotkeyKey: string}} settings 検証済みの設定
     * @returns {Promise<void>}
     */
    async save(settings) {
      const { durationMinutes, hotkeyModifiers, hotkeyKey } = settings;
      const text = `${JSON.stringify({ durationMinutes, hotkeyModifiers, hotkeyKey }, null, 2)}\n`;
      await mkdir(directory, { recursive: true });
      const temporaryPath = `${filePath}.tmp`;
      await writeFile(temporaryPath, text, { mode: SETTINGS_FILE_MODE });
      // mode は新しく作るときだけ効く。前回の失敗で残った一時ファイル（権限が広い可能性）でも 600 にする
      await chmod(temporaryPath, SETTINGS_FILE_MODE);
      await rename(temporaryPath, filePath);
    },
  };
}
