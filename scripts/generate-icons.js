/**
 * generate-icons.js（開発者用・アイコンを作り直すときだけ実行するスクリプト）
 * 目的：アイコンを、コードでカレンダーの形を描いて assets/icons/ に保存する。
 *   - トレイ（Mac はメニューバー）のアイコン：Mac 用は白黒の「テンプレート画像」（明暗に合わせて macOS が色を変える）、Windows 用は青色
 *   - アプリのアイコン（青い角丸の四角に白いカレンダー）：Mac の Dock 用 app.png、
 *     Windows のデスクトップのショートカット用 app.ico、Mac の起動用アプリ用 app.icns（要件§12：G7）
 *
 * 使い方：env -u ELECTRON_RUN_AS_NODE npx electron scripts/generate-icons.js
 *   - 外部の画像素材やツールは使わない（ライセンスや改ざんの心配をなくすため。.ico・.icns も自分で組み立てる）。
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

/** アプリのアイコンのカレンダーの色（白） */
const WHITE_COLOR = { red: 0xff, green: 0xff, blue: 0xff };

/** アプリのアイコンの、角丸の四角の外側の余白（一辺に対する割合。macOS のアイコンの大きさに合わせる） */
const APP_ICON_MARGIN_RATIO = 0.1;

/** アプリのアイコンの角丸の半径（一辺に対する割合） */
const APP_ICON_CORNER_RATIO = 0.18;

/** アプリのアイコンの中のカレンダーの大きさ（一辺に対する割合） */
const APP_ICON_CALENDAR_RATIO = 0.62;

/** Windows の .ico に入れる大きさ（画素） */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** Mac の .icns に入れる種類と大きさ（画素）。どれも PNG で入れる */
const ICNS_ENTRIES = [
  { type: 'icp4', size: 16 },
  { type: 'icp5', size: 32 },
  { type: 'ic11', size: 32 }, // 16@2x
  { type: 'ic12', size: 64 }, // 32@2x
  { type: 'ic07', size: 128 },
  { type: 'ic13', size: 256 }, // 128@2x
  { type: 'ic08', size: 256 },
  { type: 'ic14', size: 512 }, // 256@2x
  { type: 'ic09', size: 512 },
  { type: 'ic10', size: 1024 }, // 512@2x
];

/** Mac の Dock に表示する PNG の大きさ（画素） */
const DOCK_ICON_SIZE = 512;

/**
 * 1画素を塗る（画素の並びは BGRA）。
 *
 * @param {Buffer} pixels 画素の並び
 * @param {number} size 一辺の画素数
 * @param {number} x
 * @param {number} y
 * @param {{red: number, green: number, blue: number}} color 色
 */
function setPixel(pixels, size, x, y, color) {
  const offset = (y * size + x) * 4;
  pixels[offset] = color.blue;
  pixels[offset + 1] = color.green;
  pixels[offset + 2] = color.red;
  pixels[offset + 3] = 255;
}

/**
 * カレンダーの形を、画素の並びに描く。外枠・上の帯・リング2つ・日付の点（3×2）を描く。
 *
 * @param {Buffer} pixels 画素の並び（BGRA）
 * @param {number} size 一辺の画素数
 * @param {{originX: number, originY: number, unit: number}} placement 描く位置（左上の画素）と、16分の1の大きさ（画素）
 * @param {{red: number, green: number, blue: number}} color 色
 */
function drawCalendar(pixels, size, { originX, originY, unit }, color) {
  /** 矩形を塗る（座標は単位で指定し、画素に直す） */
  const fillRect = (left, top, width, height) => {
    const x0 = Math.max(0, Math.round(originX + left * unit));
    const y0 = Math.max(0, Math.round(originY + top * unit));
    const x1 = Math.min(size, Math.round(originX + (left + width) * unit));
    const y1 = Math.min(size, Math.round(originY + (top + height) * unit));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        setPixel(pixels, size, x, y, color);
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
}

/**
 * トレイ用：カレンダーの形だけを描いた画素の並び（背景は透明）を作る。
 *
 * @param {number} size 一辺の画素数
 * @param {{red: number, green: number, blue: number}} color 色
 * @returns {Buffer}
 */
function drawCalendarIcon(size, color) {
  const pixels = Buffer.alloc(size * size * 4); // 透明で初期化
  drawCalendar(pixels, size, { originX: 0, originY: 0, unit: size / 16 }, color);
  return pixels;
}

/**
 * アプリのアイコン：青い角丸の四角に、白いカレンダーを描いた画素の並びを作る。
 *
 * @param {number} size 一辺の画素数
 * @returns {Buffer}
 */
function drawAppIcon(size) {
  const pixels = Buffer.alloc(size * size * 4); // 透明で初期化
  const margin = size * APP_ICON_MARGIN_RATIO;
  const radius = size * APP_ICON_CORNER_RATIO;
  const left = margin;
  const right = size - margin;
  // 角丸の四角：角の部分は、角の円の中にある画素だけを塗る
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const centerX = x + 0.5;
      const centerY = y + 0.5;
      if (centerX < left || centerX > right || centerY < left || centerY > right) continue;
      const cornerX = Math.max(left + radius - centerX, centerX - (right - radius), 0);
      const cornerY = Math.max(left + radius - centerY, centerY - (right - radius), 0);
      if (cornerX * cornerX + cornerY * cornerY <= radius * radius) {
        setPixel(pixels, size, x, y, BRAND_COLOR);
      }
    }
  }
  const calendarSize = size * APP_ICON_CALENDAR_RATIO;
  const origin = (size - calendarSize) / 2;
  drawCalendar(pixels, size, { originX: origin, originY: origin, unit: calendarSize / 16 }, WHITE_COLOR);
  return pixels;
}

/**
 * アプリのアイコンを PNG にする。
 *
 * @param {number} size 一辺の画素数
 * @returns {Buffer} PNG
 */
function renderAppIconPng(size) {
  return nativeImage.createFromBitmap(drawAppIcon(size), { width: size, height: size }).toPNG();
}

/**
 * Windows のアイコン（.ico）を組み立てる。中身は大きさごとの PNG（Windows Vista 以降が対応）。
 * 形式：見出し（6バイト）＋ 画像ごとの項目（16バイト）＋ PNG のデータ
 *
 * @param {Array<{size: number, png: Buffer}>} images 大きさごとの PNG
 * @returns {Buffer}
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // 予約
  header.writeUInt16LE(1, 2); // 種類：アイコン
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = header.length + images.length * 16;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 幅（256 は 0 と書く決まり）
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // 高さ
    entry.writeUInt8(0, 2); // 色数（使わない）
    entry.writeUInt8(0, 3); // 予約
    entry.writeUInt16LE(1, 4); // 面の数
    entry.writeUInt16LE(32, 6); // 1画素のビット数
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

/**
 * Mac のアイコン（.icns）を組み立てる。中身は種類ごとの PNG。
 * 形式：'icns'＋全体の長さ（4バイト・ビッグエンディアン）＋ 種類ごとに（種類4文字＋長さ4バイト＋PNG）
 *
 * @param {Array<{type: string, png: Buffer}>} entries 種類ごとの PNG
 * @returns {Buffer}
 */
function buildIcns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(type, 0, 4, 'ascii');
    chunkHeader.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([chunkHeader, png]);
  });
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
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
    // アプリのアイコン（大きさごとの PNG は使い回す）
    const pngBySize = new Map();
    const pngOf = (size) => {
      if (!pngBySize.has(size)) pngBySize.set(size, renderAppIconPng(size));
      return pngBySize.get(size);
    };
    await writeFile(path.join(OUTPUT_DIR, 'app.png'), pngOf(DOCK_ICON_SIZE));
    console.log(`保存しました：app.png（${DOCK_ICON_SIZE}×${DOCK_ICON_SIZE}）`);
    await writeFile(path.join(OUTPUT_DIR, 'app.ico'), buildIco(ICO_SIZES.map((size) => ({ size, png: pngOf(size) }))));
    console.log(`保存しました：app.ico（${ICO_SIZES.join('・')}）`);
    await writeFile(path.join(OUTPUT_DIR, 'app.icns'), buildIcns(ICNS_ENTRIES.map(({ type, size }) => ({ type, png: pngOf(size) }))));
    console.log(`保存しました：app.icns（${ICNS_ENTRIES.map(({ type, size }) => `${type}=${size}`).join('・')}）`);
  } catch (error) {
    console.error('アイコンを作れませんでした:', error);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
