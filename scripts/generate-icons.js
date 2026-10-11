/**
 * generate-icons.js（開発者用・アイコンを作り直すときだけ実行するスクリプト）
 * 目的：タスクトレイ（Mac はメニューバー）のアイコンを、コードでカレンダーの形を描いて assets/icons/ に保存する。
 *
 * 使い方（Mac）：env -u ELECTRON_RUN_AS_NODE npx electron scripts/generate-icons.js
 *   - 外部の画像素材は使わない（ライセンスや改ざんの心配をなくすため）。
 *   - Mac 用は白黒の「テンプレート画像」（メニューバーの明暗に合わせて macOS が色を変える）。
 *   - Windows 用は青色。
 */

import { app, nativeImage } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** アイコンの保存先 */
const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');

/** Mac 用の色（黒。テンプレート画像では形だけが使われる） */
const TEMPLATE_COLOR = { red: 0, green: 0, blue: 0 };

/** Windows 用の色（青 #1a73e8） */
const BRAND_COLOR = { red: 0x1a, green: 0x73, blue: 0xe8 };

/**
 * カレンダーの形を描いた画素の並び（BGRA）を作る。
 * 外枠・上の帯・リング2つ・日付の点（3×2）を、大きさに合わせて描く。
 *
 * @param {number} size 一辺の画素数
 * @param {{red: number, green: number, blue: number}} color 色
 * @returns {Buffer}
 */
function drawCalendarIcon(size, color) {
  const pixels = Buffer.alloc(size * size * 4); // 透明で初期化
  const unit = size / 16; // 16画素を基準にした1単位

  /** 矩形を塗る（座標は単位で指定し、画素に直す） */
  const fillRect = (left, top, width, height) => {
    const x0 = Math.round(left * unit);
    const y0 = Math.round(top * unit);
    const x1 = Math.round((left + width) * unit);
    const y1 = Math.round((top + height) * unit);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const offset = (y * size + x) * 4;
        pixels[offset] = color.blue;
        pixels[offset + 1] = color.green;
        pixels[offset + 2] = color.red;
        pixels[offset + 3] = 255;
      }
    }
  };

  // 外枠（左・右・下）と上の帯
  fillRect(1, 3, 1, 12);
  fillRect(14, 3, 1, 12);
  fillRect(1, 14, 14, 1);
  fillRect(1, 3, 14, 3);
  // リング（帯の上に飛び出す2本）
  fillRect(4, 1, 1.5, 3);
  fillRect(10.5, 1, 1.5, 3);
  // 日付の点（3列×2行）
  for (const top of [8, 11]) {
    for (const left of [4, 7, 10]) {
      fillRect(left, top, 2, 2);
    }
  }
  return pixels;
}

/**
 * アイコンを PNG で保存する。
 *
 * @param {string} fileName ファイル名
 * @param {number} size 一辺の画素数
 * @param {{red: number, green: number, blue: number}} color 色
 */
async function saveIcon(fileName, size, color) {
  const image = nativeImage.createFromBitmap(drawCalendarIcon(size, color), { width: size, height: size });
  await writeFile(path.join(OUTPUT_DIR, fileName), image.toPNG());
  console.log(`保存しました：${fileName}（${size}×${size}）`);
}

app.whenReady().then(async () => {
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await saveIcon('trayTemplate.png', 16, TEMPLATE_COLOR);
    await saveIcon('trayTemplate@2x.png', 32, TEMPLATE_COLOR);
    await saveIcon('tray.png', 16, BRAND_COLOR);
    await saveIcon('tray@2x.png', 32, BRAND_COLOR);
  } catch (error) {
    console.error('アイコンを作れませんでした:', error);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
