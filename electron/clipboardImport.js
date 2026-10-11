/**
 * clipboardImport.js
 * 目的：コピーした文章（クリップボードの文章）を読み取り、確認ウインドウで日時の抽出に回す（依頼者の指示 2026-10-11）。
 *
 * セキュリティ・個人情報（CLAUDE.md）：
 *   - クリップボードを読むのは、利用者が操作したとき（ホットキー・トレイ・画面のボタン）だけ。常時・定期的には読まない
 *   - 読んだ文章はメモリの中で確認ウインドウに渡すだけで、ファイルに保存せず、ログにも出さない
 *   - 画面のボタンからの要求は、送信元が確認ウインドウの画面かを確かめてから受け付ける。引数は受け取らない
 *   - クリップボードの中身は書き換えない
 *
 * このファイルは electron を import しない（クリップボードを読む関数は main.js から受け取る）ため、単体テストできる。
 */

import { InputTooLongError, MAX_INPUT_LENGTH } from '../src/core/dateExtractor.js';

/** 確認ウインドウ → メインプロセス：コピーした文章を読み取る（electron/preload.cjs と同じ値にする） */
export const CLIPBOARD_READ_CHANNEL = 'clipboard:read';

/** コピーした文章がないときの文 */
export const CLIPBOARD_EMPTY_MESSAGE =
  'コピーされた文章がありません。読み取りたい文章を選んでコピー（Ctrl+C、Mac は Cmd+C）してから、もう一度お試しください。';

/** 送信元を確認できなかったときの文 */
const UNTRUSTED_SENDER_MESSAGE = '不正な要求のため、処理を中断しました。';

/** クリップボードを読めなかったときの文 */
const CLIPBOARD_READ_FAILED_MESSAGE = 'コピーした文章を読み取れませんでした。もう一度お試しください。';

/**
 * クリップボードの文章を読み、抽出に回せるかを確かめる。
 *
 * @param {() => unknown} readText クリップボードの文章を読む関数（main.js では clipboard.readText）
 * @returns {{ok: true, text: string} | {ok: false, message: string}}
 *   ok が false のときの message は利用者に表示できる文（文章の中身は含めない）
 */
export function readClipboardForExtraction(readText) {
  let text;
  try {
    text = readText();
  } catch {
    return { ok: false, message: CLIPBOARD_READ_FAILED_MESSAGE };
  }
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, message: CLIPBOARD_EMPTY_MESSAGE };
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return { ok: false, message: new InputTooLongError(MAX_INPUT_LENGTH).message };
  }
  return { ok: true, text };
}

/**
 * 画面の「コピーした文章を読み取る」ボタンからの要求を処理する関数を作る（ipcMain.handle に渡す）。
 * 読み取った文章は、ホットキーのときと同じ道筋（CAPTURE_STATUS_CHANNEL）で確認ウインドウに届く。
 *
 * @param {object} dependencies
 * @param {(event: object) => boolean} dependencies.isTrustedSender 送信元が確認ウインドウの画面か
 * @param {() => void} dependencies.importClipboardText コピーした文章を読み取って確認ウインドウに送る関数（main.js）
 * @returns {{handleRead: (event: object) => Promise<{ok: boolean, message?: string}>}}
 */
export function createClipboardHandlers({ isTrustedSender, importClipboardText }) {
  return {
    async handleRead(event) {
      if (!isTrustedSender(event)) {
        return { ok: false, message: UNTRUSTED_SENDER_MESSAGE };
      }
      importClipboardText();
      return { ok: true };
    },
  };
}
