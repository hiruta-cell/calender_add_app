/**
 * captureGeometry.js
 * 目的：範囲選択の座標を検証し、画面の座標から「撮影した画像の画素の座標」に変換する。
 *
 * 画面の座標（DIP）と画像の画素は、画面の拡大率（Retina や Windows の 125% など）によって一致しないため、
 * 撮影した画像の大きさと画面の大きさの比から変換する。
 * このファイルは electron を import しない（単体テストできる）。
 */

/** 選べる範囲の最小の幅・高さ（画面の座標）。小さすぎる範囲は文字を読み取れない */
export const MIN_SELECTION_SIZE = 8;

/** 画面の座標1つあたりの画素数がこれ未満なら、OCR の前に画像を拡大する（文字が小さいと読み取れないため） */
export const UPSCALE_PIXEL_RATIO_THRESHOLD = 2;

/** OCR の前に拡大するときの倍率 */
export const UPSCALE_FACTOR = 2;

/**
 * 範囲キャプチャのエラー。message はそのまま利用者に表示できる文にしている。
 */
export class CaptureError extends Error {
  /**
   * @param {string} message 利用者に表示する文
   * @param {string | null} [reason] 画面で特別な案内をするための理由（例：'screenPermission'）。なければ null
   */
  constructor(message, reason = null) {
    super(message);
    this.name = 'CaptureError';
    this.reason = reason;
  }
}

/** エラーの理由：Mac の画面収録の許可がない（画面に「システム設定を開く」ボタンを出す） */
export const CAPTURE_ERROR_SCREEN_PERMISSION = 'screenPermission';

/**
 * 値を最小値と最大値の間に収める。
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * 範囲選択の画面から届いた矩形を検証し、画面の中に収めた矩形を返す。
 *
 * @param {unknown} rawSelection {x, y, width, height}（範囲選択の画面の座標）
 * @param {{width: number, height: number}} viewport 範囲選択の画面の大きさ
 * @returns {{x: number, y: number, width: number, height: number}}
 * @throws {CaptureError} 形式が正しくない、または範囲が小さすぎる場合
 */
export function validateSelection(rawSelection, viewport) {
  if (rawSelection === null || typeof rawSelection !== 'object') {
    throw new CaptureError('範囲の指定が正しくありません。');
  }
  const { x, y, width, height } = rawSelection;
  if (![x, y, width, height].every(Number.isFinite)) {
    throw new CaptureError('範囲の指定が正しくありません。');
  }
  const left = clamp(x, 0, viewport.width);
  const top = clamp(y, 0, viewport.height);
  const right = clamp(x + width, 0, viewport.width);
  const bottom = clamp(y + height, 0, viewport.height);
  if (right - left < MIN_SELECTION_SIZE || bottom - top < MIN_SELECTION_SIZE) {
    throw new CaptureError('範囲が小さすぎます。もう少し大きく選んでください。');
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * 画面の座標の矩形を、撮影した画像の画素の矩形に変換する（画像の外にははみ出さない）。
 *
 * @param {{x: number, y: number, width: number, height: number}} selection 画面の座標の矩形
 * @param {{width: number, height: number}} displaySize 画面の大きさ（画面の座標）
 * @param {{width: number, height: number}} imageSize 撮影した画像の大きさ（画素）
 * @returns {{x: number, y: number, width: number, height: number}} 画像の画素の矩形（整数）
 */
export function toImageRect(selection, displaySize, imageSize) {
  const scaleX = imageSize.width / displaySize.width;
  const scaleY = imageSize.height / displaySize.height;
  const left = clamp(Math.floor(selection.x * scaleX), 0, imageSize.width);
  const top = clamp(Math.floor(selection.y * scaleY), 0, imageSize.height);
  const right = clamp(Math.ceil((selection.x + selection.width) * scaleX), 0, imageSize.width);
  const bottom = clamp(Math.ceil((selection.y + selection.height) * scaleY), 0, imageSize.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * OCR の前に画像を何倍に拡大するかを決める。
 * 画面の座標1つあたりの画素数が少ない（Windows の拡大率 100% など）と文字が小さく読み取りにくいため、拡大する。
 *
 * @param {{width: number}} displaySize 画面の大きさ（画面の座標）
 * @param {{width: number}} imageSize 撮影した画像の大きさ（画素）
 * @returns {number} 倍率（1 なら拡大しない）
 */
export function getUpscaleFactor(displaySize, imageSize) {
  const pixelRatio = imageSize.width / displaySize.width;
  return pixelRatio < UPSCALE_PIXEL_RATIO_THRESHOLD ? UPSCALE_FACTOR : 1;
}
