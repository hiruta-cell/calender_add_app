/**
 * ocr-diagnose-canvas.js
 * 目的：貼り付け・ドロップした画像を、アプリと同じ方法（画面の中で描き直して PNG にする：src/renderer/imageImport.js）で
 * 変換し、変換の前後で画素がどれだけ変わるか、変換後の画像で読み取るとどうなるかを表示する診断
 * （2026-10-12：Windows でだけ縦書きのデモ画像が文字化けする件。Node.js・Electron の中の読み取りは正しいと確認済みのため、
 * 残る候補の「画面での変換」を確かめる）。使い方：npm run ocr:diagnose:canvas
 *
 * 個人情報（CLAUDE.md）：読むのは demo/images の架空の縦書きの画像だけ。ファイルには何も書かない。
 * 見えないウインドウを1つ開くだけで、外部のページ・ファイルは読み込まない（中身のない data: のページ）。
 * アプリの設定・常駐には関係しない（アプリとは別に起動し、終わったらすぐ終了する）。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, nativeImage } from 'electron';
import { ORIENTATION_AUTO, ORIENTATION_VERTICAL, recognizeText } from '../electron/ocrEngine.js';
import { extractDateCandidates } from '../src/core/dateExtractor.js';

/** このリポジトリのフォルダ */
const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 読む画像（架空の縦書きのデモ画像） */
const IMAGE_PATH = path.join(PROJECT_DIR, 'demo', 'images', '3-notice-vertical.png');

/** アプリの変換の処理が書かれたファイル（同じ処理を見えない画面の中で動かす） */
const IMAGE_IMPORT_SOURCE_PATH = path.join(PROJECT_DIR, 'src', 'renderer', 'imageImport.js');

/** 読んだ文章を表示する長さ（文字数） */
const TEXT_PREVIEW_LENGTH = 60;

/** 日時の候補を数えるときの基準日時（結果が日によって変わらないよう固定する） */
const DIAGNOSE_NOW = new Date('2026-10-12T01:00:00Z');

/**
 * アプリと同じ変換の処理を、見えない画面の中で動かし、変換後の PNG を受け取る。
 * imageImport.js の中身から「export」の文字を外して、そのまま画面の中で実行する（処理を書き写さないため）。
 *
 * @param {Buffer} original 元の画像（PNG）
 * @returns {Promise<Buffer>} 変換後の PNG
 */
async function convertLikeApp(original) {
  const window = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  try {
    await window.loadURL('data:text/html;charset=utf-8,<!doctype html><title>diagnose</title>');
    const source = (await readFile(IMAGE_IMPORT_SOURCE_PATH, 'utf8')).replaceAll(/^export /gm, '');
    const converted = await window.webContents.executeJavaScript(`(async () => {
      ${source}
      const bytes = Uint8Array.from(atob('${original.toString('base64')}'), (character) => character.charCodeAt(0));
      const png = await convertImageFileToPng(new File([bytes], 'demo.png', { type: 'image/png' }));
      let binary = '';
      for (const byte of png) binary += String.fromCharCode(byte);
      return btoa(binary);
    })()`);
    return Buffer.from(converted, 'base64');
  } finally {
    window.destroy();
  }
}

/**
 * 2つの画像の画素を比べる。
 *
 * @param {Buffer} before 変換前の PNG
 * @param {Buffer} after 変換後の PNG
 * @returns {string} 大きさと、違う画素の割合・最大の差の説明
 */
function comparePixels(before, after) {
  const beforeImage = nativeImage.createFromBuffer(before);
  const afterImage = nativeImage.createFromBuffer(after);
  const beforeSize = beforeImage.getSize();
  const afterSize = afterImage.getSize();
  if (beforeSize.width !== afterSize.width || beforeSize.height !== afterSize.height) {
    return `大きさが違う（前 ${beforeSize.width}×${beforeSize.height}、後 ${afterSize.width}×${afterSize.height}）`;
  }
  const beforeBitmap = beforeImage.toBitmap();
  const afterBitmap = afterImage.toBitmap();
  let differentBytes = 0;
  let maxDifference = 0;
  for (let index = 0; index < beforeBitmap.length; index += 1) {
    const difference = Math.abs(beforeBitmap[index] - afterBitmap[index]);
    if (difference > 0) {
      differentBytes += 1;
      maxDifference = Math.max(maxDifference, difference);
    }
  }
  const percent = ((differentBytes / beforeBitmap.length) * 100).toFixed(2);
  return `大きさ ${beforeSize.width}×${beforeSize.height}、値が違う割合 ${percent}%、最大の差 ${maxDifference}（0〜255）`;
}

/**
 * 画像を読み取り、結果を表示する。
 *
 * @param {string} label 表示の見出し
 * @param {Buffer} image 画像
 */
async function printRecognition(label, image) {
  for (const orientation of [ORIENTATION_AUTO, ORIENTATION_VERTICAL]) {
    try {
      const result = await recognizeText(image, { orientation });
      const candidateCount = extractDateCandidates(result.text, { now: DIAGNOSE_NOW }).candidates.length;
      console.log(`${label}（${orientation}）：採用 ${result.orientation}、確信度 ${Math.round(result.confidence)}、日時の候補 ${candidateCount} 件`);
      console.log(`  読んだ文章：${result.text.replace(/\s+/g, ' ').slice(0, TEXT_PREVIEW_LENGTH)}`);
    } catch (error) {
      console.log(`${label}（${orientation}）：読み取りに失敗（${error?.message ?? '不明'}）`);
    }
  }
}

/**
 * 診断の全体。終わったら（失敗しても）Electron を終了する。
 */
async function main() {
  try {
    console.log(`== 環境：${process.platform} ${process.arch}　Electron ${process.versions.electron}　Chrome ${process.versions.chrome}`);
    const original = await readFile(IMAGE_PATH);
    const converted = await convertLikeApp(original);
    console.log(`== 画面での変換：元 ${original.length} バイト → 変換後 ${converted.length} バイト`);
    console.log(`画素の比較：${comparePixels(original, converted)}`);
    console.log('== 読み取りの結果');
    await printRecognition('元の画像', original);
    await printRecognition('画面で変換した画像', converted);
    console.log('== 終わり（この表示をそのまま貼り付けてください）');
  } catch (error) {
    console.log(`診断を実行できませんでした：${error?.message ?? '不明'}`);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
}

// 見えないウインドウを閉じても終了しない（診断の終わりに自分で終了する。Electron は既定で、ウインドウがなくなると終了する）
app.on('window-all-closed', () => {});
app.whenReady().then(main);
