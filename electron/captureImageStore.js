/**
 * captureImageStore.js
 * 目的：範囲キャプチャで取り込んだ画像を、メモリの中だけで一時的に持つ。
 *
 * - 画像はファイルに保存しない（CLAUDE.md：取り込み画像は保存しない）。
 * - 画面へは app://bundle/capture/〜 として配信する（CSP を緩めずに表示するため）。
 * - 新しい取り込み・クリア・アプリの終了のときに消す。
 * このファイルは electron を import しない（単体テストできる）。
 */

/** 範囲選択の画面の背景に使う、画面全体の画像の名前（範囲を選んだらすぐ消す） */
export const SCREENSHOT_IMAGE_NAME = 'screenshot.png';

/** 確認ウインドウに表示する、選んだ範囲の画像の名前（読み直しに使う） */
export const SELECTION_IMAGE_NAME = 'selection.png';

/** 配信してよい画像の名前の一覧 */
const IMAGE_NAMES = Object.freeze([SCREENSHOT_IMAGE_NAME, SELECTION_IMAGE_NAME]);

/** 画像を配信するパスの先頭（app://bundle/capture/〜） */
export const CAPTURE_PATH_PREFIX = '/capture/';

/**
 * 取り込んだ画像の置き場所を作る。
 *
 * @returns {{
 *   set: (name: string, image: Buffer) => number,
 *   get: (name: string) => Buffer | null,
 *   delete: (name: string) => void,
 *   clear: () => void,
 * }} set は画像を置き、表示の更新に使う番号（版）を返す
 */
export function createCaptureImageStore() {
  const images = new Map();
  let version = 0;
  return {
    set(name, image) {
      if (!IMAGE_NAMES.includes(name) || !Buffer.isBuffer(image)) {
        throw new TypeError('画像の名前または内容が正しくありません。');
      }
      images.set(name, image);
      version += 1;
      return version;
    },
    get(name) {
      return images.get(name) ?? null;
    },
    delete(name) {
      images.delete(name);
    },
    clear() {
      images.clear();
    },
  };
}

/**
 * app:// の URL が、取り込んだ画像を指していれば、その画像の名前を返す。
 * 決めた名前（screenshot.png / selection.png）以外は受け付けない。
 *
 * @param {string} requestUrl 要求された URL
 * @returns {string | null} 画像の名前。取り込んだ画像の URL でなければ null
 */
export function getCaptureImageName(requestUrl) {
  let pathname;
  try {
    pathname = new URL(requestUrl).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith(CAPTURE_PATH_PREFIX)) {
    return null;
  }
  const name = pathname.slice(CAPTURE_PATH_PREFIX.length);
  return IMAGE_NAMES.includes(name) ? name : null;
}
