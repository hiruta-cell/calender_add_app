/**
 * imageImport.js
 * 目的：貼り付け・ドラッグ＆ドロップした画像を、メインプロセスに渡せる PNG にそろえる。
 *   - スマートフォンの写真の向き（EXIF）に合わせて読み込む（createImageBitmap の既定の動き）
 *   - 大きすぎる写真は縮める（読み取りを15秒以内に収めるため）
 *   - PNG に書き出し直す（写真に含まれる撮影場所などの情報も取り除かれる）
 * 画像はメモリの中だけで扱い、ファイルに保存しない。
 */

/** 受け付ける画像の種類 */
const ACCEPTED_IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg']);

/** 受け付ける画像ファイルの大きさの上限（バイト）。メインプロセスの上限と同じ 20MB */
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

/** 長い辺がこれより大きい画像は縮める（画素） */
const MAX_IMPORT_LONG_SIDE = 3000;

/**
 * 画像ファイルを PNG にそろえる。
 *
 * @param {File} file 貼り付け・ドラッグ＆ドロップされた画像
 * @returns {Promise<Uint8Array>} PNG のデータ
 * @throws {Error} 種類・大きさが正しくない、または読み込めない場合（message は利用者に表示できる文）
 */
export async function convertImageFileToPng(file) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('読み取れるのは PNG・JPEG の画像だけです。');
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('画像が大きすぎます（20MB まで）。');
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file); // 写真の向き（EXIF）に合わせて読み込まれる
  } catch {
    throw new Error('画像を読み込めませんでした。');
  }
  try {
    const scale = Math.min(1, MAX_IMPORT_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; // 透明な部分は白にする（文字を読み取りやすくするため）
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

/**
 * 貼り付け・ドロップのデータから、最初の画像ファイルを取り出す。
 *
 * @param {DataTransfer | null} dataTransfer
 * @returns {File | null} 画像ファイル。なければ null
 */
export function findImageFile(dataTransfer) {
  if (dataTransfer === null) {
    return null;
  }
  return [...dataTransfer.files].find((file) => file.type.startsWith('image/')) ?? null;
}
