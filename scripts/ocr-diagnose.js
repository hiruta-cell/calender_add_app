/**
 * ocr-diagnose.js
 * 目的：OCR（文字の読み取り）が PC によって違う結果になる原因を切り分けるための診断（2026-10-12：Windows でだけ
 * 縦書きのデモ画像が文字化けする件。依頼者の指示で調査）。使い方：npm run ocr:diagnose
 *
 * 表示するもの：
 *   1. PC の環境（OS・CPU の種類・Node.js・tesseract.js の版、SIMD・relaxed SIMD に対応しているか）
 *   2. 文字データ（jpn・jpn_vert）のファイルの大きさと指紋（SHA-256。PC の間で同じファイルかを比べる）
 *   3. デモの架空の画像2枚（横書き・縦書き）を、Tesseract の「標準の部品」と「relaxed SIMD を使わない部品」で読んだ結果
 *      （確信度・時間・読んだ文章の先頭・日時の候補の数）
 *   4. アプリと同じ読み取りの関数（recognizeText。自動・縦書き）で縦書きの画像を読んだ結果
 *
 * --electron を付けると（npm run ocr:diagnose -- --electron）、同じ診断をアプリと同じ Electron の中で動かす
 * （ELECTRON_RUN_AS_NODE=1。Electron は Node.js より新しい V8 を使うため、その違いを確かめる）。
 *
 * 個人情報（CLAUDE.md）：読むのはリポジトリの demo/images の架空の画像だけ（引数で画像を受け取らない）。
 * 読んだ文章を画面に出すのは、架空の文面だからできること。利用者の画像では使わない。ファイルには何も書かない。
 * アプリの画面は開かない。文字データは PC 内のものを使い、外部から取得しない。
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWorkerOptions,
  getLanguageSettings,
  ORIENTATION_AUTO,
  ORIENTATION_HORIZONTAL,
  ORIENTATION_VERTICAL,
  recognizeText,
} from '../electron/ocrEngine.js';
import { extractDateCandidates } from '../src/core/dateExtractor.js';
import { cleanOcrText } from '../src/core/ocrText.js';

const require = createRequire(import.meta.url);
const { createWorker, OEM } = require('tesseract.js');
// SIMD の対応の確かめ方は、tesseract.js が中で使っている部品を、tesseract.js と同じ場所から読み込む（依存を増やさない）
const { relaxedSimd, simd } = createRequire(require.resolve('tesseract.js/package.json'))('wasm-feature-detect');

/** このリポジトリのフォルダ */
const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 読む画像（架空のデモ画像だけ）と、そのときの向き */
const DIAGNOSE_IMAGES = Object.freeze([
  Object.freeze({ fileName: '1-mail-ja.png', orientation: ORIENTATION_HORIZONTAL }),
  Object.freeze({ fileName: '3-notice-vertical.png', orientation: ORIENTATION_VERTICAL }),
]);

/** 部品の種類：名前と、作業スレッドのスクリプト（null は tesseract.js の標準） */
const CORE_VARIANTS = Object.freeze([
  Object.freeze({ label: '標準の部品', workerPath: null }),
  Object.freeze({ label: 'relaxed SIMD を使わない部品', workerPath: path.join(PROJECT_DIR, 'scripts', 'ocr-diagnose-simd-worker.cjs') }),
]);

/** 読んだ文章を表示する長さ（文字数） */
const TEXT_PREVIEW_LENGTH = 60;

/** Electron の中で動かす指定 */
const ELECTRON_OPTION = '--electron';

/** 日時の候補を数えるときの基準日時（結果が日によって変わらないよう固定する） */
const DIAGNOSE_NOW = new Date('2026-10-12T01:00:00Z');

/**
 * ファイルの大きさと指紋（SHA-256 の先頭16文字）を返す。
 *
 * @param {string} filePath ファイルの場所
 * @returns {Promise<string>} 「12345 バイト、指紋 0123456789abcdef」の形
 */
async function describeFile(filePath) {
  try {
    const content = await readFile(filePath);
    return `${content.length} バイト、指紋 ${createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
  } catch {
    return '読めません（ファイルがない可能性があります）';
  }
}

/**
 * PC の環境と文字データの情報を表示する。
 */
async function printEnvironment() {
  console.log('== PC の環境');
  console.log(`OS：${process.platform} ${os.release()}　CPU：${process.arch}（${os.cpus()[0]?.model ?? '不明'}）`);
  console.log(`Node.js：${process.version}　Electron：${process.versions.electron ?? '（使っていない）'}　V8：${process.versions.v8}`);
  console.log(`tesseract.js：${require('tesseract.js/package.json').version}`);
  console.log(`SIMD：${await simd()}　relaxed SIMD：${await relaxedSimd()}`);
  console.log('== 文字データ');
  for (const setting of Object.values(getLanguageSettings())) {
    console.log(`${setting.language}：${await describeFile(path.join(setting.langPath, `${setting.language}.traineddata.gz`))}`);
  }
}

/**
 * 1枚の画像を、1つの部品・決まった向きで読み、結果を1行で表示する。
 *
 * @param {{fileName: string, orientation: string}} target 読む画像と向き
 * @param {{label: string, workerPath: string | null}} variant 部品の種類
 */
async function diagnoseOne(target, variant) {
  const setting = getLanguageSettings()[target.orientation];
  const image = await readFile(path.join(PROJECT_DIR, 'demo', 'images', target.fileName));
  const options = { ...buildWorkerOptions(setting), ...(variant.workerPath === null ? {} : { workerPath: variant.workerPath }) };
  const startedAt = Date.now();
  const worker = await createWorker(setting.language, OEM.LSTM_ONLY, options);
  try {
    await worker.setParameters({ tessedit_pageseg_mode: setting.pageSegMode });
    const { data } = await worker.recognize(image);
    const text = cleanOcrText(data.text ?? '');
    const candidateCount = extractDateCandidates(text, { now: DIAGNOSE_NOW }).candidates.length;
    console.log(
      `${target.fileName}（${target.orientation}）／${variant.label}：確信度 ${Math.round(Number(data.confidence) || 0)}、` +
        `${Date.now() - startedAt}ms、日時の候補 ${candidateCount} 件`,
    );
    console.log(`  読んだ文章：${text.replace(/\s+/g, ' ').slice(0, TEXT_PREVIEW_LENGTH)}`);
  } catch (error) {
    console.log(`${target.fileName}（${target.orientation}）／${variant.label}：読み取りに失敗（${error?.message ?? '不明'}）`);
  } finally {
    await worker.terminate().catch(() => {});
  }
}

/**
 * アプリと同じ読み取りの関数（recognizeText）で縦書きの画像を読み、結果を表示する。
 */
async function diagnoseAppFunction() {
  const image = await readFile(path.join(PROJECT_DIR, 'demo', 'images', '3-notice-vertical.png'));
  for (const orientation of [ORIENTATION_AUTO, ORIENTATION_VERTICAL]) {
    try {
      const result = await recognizeText(image, { orientation });
      const candidateCount = extractDateCandidates(result.text, { now: DIAGNOSE_NOW }).candidates.length;
      console.log(
        `3-notice-vertical.png／アプリの関数（${orientation}）：採用 ${result.orientation}、確信度 ${Math.round(result.confidence)}、` +
          `読んだ向き ${result.triedOrientations.join('→')}、日時の候補 ${candidateCount} 件`,
      );
      console.log(`  読んだ文章：${result.text.replace(/\s+/g, ' ').slice(0, TEXT_PREVIEW_LENGTH)}`);
    } catch (error) {
      console.log(`3-notice-vertical.png／アプリの関数（${orientation}）：読み取りに失敗（${error?.message ?? '不明'}）`);
    }
  }
}

/**
 * --electron のとき、このスクリプトを Electron の中（Node.js として動かす設定）で動かし直す。
 *
 * @returns {boolean} 動かし直した（このあと何もしない）なら true
 */
function rerunInElectronIfRequested() {
  if (!process.argv.includes(ELECTRON_OPTION) || process.versions.electron !== undefined) {
    return false;
  }
  const electronPath = require('electron'); // Node.js から読むと、Electron の実行ファイルの場所が返る
  const result = spawnSync(electronPath, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  process.exitCode = result.status ?? 1;
  return true;
}

/**
 * 診断の全体（環境の表示 → 画像ごと・部品ごとの読み取り → アプリの関数での読み取り）。
 */
async function main() {
  if (rerunInElectronIfRequested()) {
    return;
  }
  await printEnvironment();
  console.log('== 読み取りの結果');
  for (const target of DIAGNOSE_IMAGES) {
    for (const variant of CORE_VARIANTS) {
      await diagnoseOne(target, variant);
    }
  }
  await diagnoseAppFunction();
  console.log('== 終わり（この表示をそのまま貼り付けてください）');
}

await main();
