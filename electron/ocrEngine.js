/**
 * ocrEngine.js
 * 目的：画像から文字を読み取る（Tesseract.js。要件§4・§5.1）。メインプロセスから呼び、処理は別スレッドで動く。
 *
 * セキュリティ・プライバシー（CLAUDE.md・要件§5.2・§6.2）：
 *   - 文字データは node_modules の @tesseract.js-data から読み、外部からダウンロードしない
 *     （langPath を指定しないと CDN からダウンロードされるため、必ず PC 内のフォルダを指定する）
 *   - 読み込んだデータや画像をファイルに保存しない（cacheMethod: 'none'）
 * 動作（要件§5.9）：
 *   - 1回読み取るごとに処理を終了し、CPU・メモリを使い続けない
 *   - 合計15秒を超えたら中断する（読み取れないなら手入力の方が早いため。依頼者の指示）
 * 縦書き（要件§12）：
 *   - 横書き用（jpn）と縦書き用（jpn_vert）の両方で読み、確信度の高い方を採用する（自動）
 *   - ただし横書きで確信度 80 以上なら、縦書きは省く（待ち時間を半分にするため。縦書きの文章を横書きとして読むと
 *     確信度は 30 程度にとどまることを確認済み）
 *
 * このファイルは electron を import しないため、Node.js だけで実際に読み取るテストができる。
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import tesseract from 'tesseract.js';
import { cleanOcrText } from '../src/core/ocrText.js';

const { createWorker, OEM, PSM } = tesseract;
const require = createRequire(import.meta.url);

/** 読み取りの向き：自動（横書き・縦書きの両方で読み、確信度の高い方を採用） */
export const ORIENTATION_AUTO = 'auto';
/** 読み取りの向き：横書き */
export const ORIENTATION_HORIZONTAL = 'horizontal';
/** 読み取りの向き：縦書き */
export const ORIENTATION_VERTICAL = 'vertical';
/** 受け付ける向きの一覧（画面から届く値の検証に使う） */
export const ORIENTATIONS = Object.freeze([ORIENTATION_AUTO, ORIENTATION_HORIZONTAL, ORIENTATION_VERTICAL]);

/** 読み取りの制限時間（ミリ秒）。横書き・縦書きの両方で読む場合も合計でこの時間まで（依頼者の指示：15秒） */
export const OCR_TIMEOUT_MS = 15_000;

/** 自動のとき、横書きの確信度がこれ以上なら縦書きでの読み取りを省く（0〜100） */
export const SKIP_VERTICAL_CONFIDENCE = 80;

/** 時間切れのときの文（手入力を案内する） */
const TIMEOUT_MESSAGE =
  '文字の読み取りに時間がかかりすぎたため、中断しました。日時を手入力するか、範囲を小さくして選び直してください。';

/** 受け付ける画像の最大サイズ（バイト）。極端に大きい画像で固まらないようにする */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * 使う文字データの種類。4.0.0_best_int は精度を保ったまま軽くした版（各 約2MB）。
 */
const LANGUAGE_DATA_VARIANT = '4.0.0_best_int';

/**
 * 文字データのフォルダを、node_modules の中から探す。
 *
 * @param {string} packageName 文字データのパッケージ名
 * @returns {string} フォルダの絶対パス
 */
function resolveLanguageDataDir(packageName) {
  return path.join(path.dirname(require.resolve(`${packageName}/package.json`)), LANGUAGE_DATA_VARIANT);
}

/**
 * 向きごとの読み取りの設定。
 *   language：文字データの名前　langPath：文字データのフォルダ（PC 内）　pageSegMode：文章の並びの解析方法
 */
const LANGUAGE_SETTINGS = Object.freeze({
  [ORIENTATION_HORIZONTAL]: Object.freeze({
    language: 'jpn',
    langPath: resolveLanguageDataDir('@tesseract.js-data/jpn'),
    pageSegMode: PSM.AUTO,
  }),
  [ORIENTATION_VERTICAL]: Object.freeze({
    language: 'jpn_vert',
    langPath: resolveLanguageDataDir('@tesseract.js-data/jpn_vert'),
    pageSegMode: PSM.SINGLE_BLOCK_VERT_TEXT,
  }),
});

/**
 * 読み取りのエラー。message はそのまま利用者に表示できる文にしている。
 */
export class OcrError extends Error {
  /**
   * @param {string} message 利用者に表示する文
   */
  constructor(message) {
    super(message);
    this.name = 'OcrError';
  }
}

/**
 * 向きごとの読み取りの設定を返す（テストで、PC 内の文字データを使う設定かを確かめるため）。
 *
 * @returns {Readonly<Record<string, {language: string, langPath: string, pageSegMode: string}>>}
 */
export function getLanguageSettings() {
  return LANGUAGE_SETTINGS;
}

/**
 * 作業スレッドのエラーを受け流す（エラーの内容は recognizeWithOrientation の Promise の拒否で扱う）。
 * 画像の内容を含みうるため、ここでは記録もしない。
 */
function ignoreWorkerError() {}

/**
 * Tesseract の作業スレッドに渡す設定を作る。
 *
 * @param {{langPath: string}} setting 向きごとの設定
 * @returns {object}
 */
export function buildWorkerOptions(setting) {
  return {
    langPath: setting.langPath, // PC 内のフォルダ（外部からダウンロードしない）
    gzip: true, // 文字データは .traineddata.gz
    cacheMethod: 'none', // 文字データをファイルに書き出さない
    // 失敗は Promise の拒否として受け取る。これを渡さないと、Tesseract.js が作業スレッドの
    // メッセージ処理の中で例外を投げ、メインプロセスの「処理されない例外」になる（要件§5.9：アプリを止めない）
    errorHandler: ignoreWorkerError,
  };
}

/**
 * 画像から文字を読み取る（このファイルの中心となる関数）。
 *
 * @param {Buffer} image PNG などの画像
 * @param {object} [options]
 * @param {string} [options.orientation] 'auto'（既定）／'horizontal'／'vertical'
 * @param {number} [options.timeoutMs] 読み取りの制限時間（両方の向きで読む場合も合計）
 * @returns {Promise<{text: string, confidence: number, orientation: string, triedOrientations: string[]}>}
 *   text：整えた文章　confidence：確信度（0〜100）　orientation：採用した向き　triedOrientations：実際に読んだ向き
 * @throws {OcrError} 画像が不正・時間切れ・読み取りに失敗した場合
 */
export async function recognizeText(image, { orientation = ORIENTATION_AUTO, timeoutMs = OCR_TIMEOUT_MS } = {}) {
  if (!Buffer.isBuffer(image) || image.length === 0) {
    throw new OcrError('読み取る画像がありません。');
  }
  if (image.length > MAX_IMAGE_BYTES) {
    throw new OcrError('画像が大きすぎます。範囲を小さくして選び直してください。');
  }
  if (!ORIENTATIONS.includes(orientation)) {
    throw new OcrError('読み取りの向きの指定が正しくありません。');
  }

  const deadline = Date.now() + timeoutMs; // 両方の向きで読む場合も、合計でこの時刻まで
  if (orientation !== ORIENTATION_AUTO) {
    const result = await recognizeWithOrientation(image, orientation, timeoutMs);
    return { ...result, triedOrientations: [orientation] };
  }

  // 自動：まず横書きで読む。確信度が十分高ければ、縦書きは省く
  const horizontal = await recognizeWithOrientation(image, ORIENTATION_HORIZONTAL, timeoutMs);
  if (horizontal.confidence >= SKIP_VERTICAL_CONFIDENCE) {
    return { ...horizontal, triedOrientations: [ORIENTATION_HORIZONTAL] };
  }
  // 続けて縦書きで読み（同時に動かすと CPU を使いすぎるため順番に）、確信度の高い方を採用する
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new OcrError(TIMEOUT_MESSAGE);
  }
  const vertical = await recognizeWithOrientation(image, ORIENTATION_VERTICAL, remainingMs);
  return { ...chooseBetterResult(horizontal, vertical), triedOrientations: [ORIENTATION_HORIZONTAL, ORIENTATION_VERTICAL] };
}

/**
 * 横書き・縦書きの結果のうち、確信度の高い方を選ぶ。同じなら横書きを選ぶ（画面の文章は横書きが多いため）。
 *
 * @param {{confidence: number}} horizontal 横書きで読んだ結果
 * @param {{confidence: number}} vertical 縦書きで読んだ結果
 * @returns {object} 選んだ結果
 */
export function chooseBetterResult(horizontal, vertical) {
  return vertical.confidence > horizontal.confidence ? vertical : horizontal;
}

/**
 * 1つの向きで読み取る。制限時間を過ぎたら作業スレッドを止めて OcrError を投げる。
 * 成功・失敗・時間切れのどの場合も、作業スレッドを必ず終了する（CPU を使い続けない）。
 *
 * @param {Buffer} image 画像
 * @param {string} orientation 'horizontal' または 'vertical'
 * @param {number} timeoutMs 制限時間
 * @returns {Promise<{text: string, confidence: number, orientation: string}>}
 */
async function recognizeWithOrientation(image, orientation, timeoutMs) {
  const setting = LANGUAGE_SETTINGS[orientation];
  let worker = null;
  let isCancelled = false; // 時間切れになったら true（あとから作業スレッドができても、すぐ止める）
  let timer = null;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      isCancelled = true;
      reject(new OcrError(TIMEOUT_MESSAGE));
    }, timeoutMs);
  });

  const recognition = (async () => {
    const createdWorker = await createWorker(setting.language, OEM.LSTM_ONLY, buildWorkerOptions(setting));
    worker = createdWorker;
    if (isCancelled) {
      return null;
    }
    await createdWorker.setParameters({ tessedit_pageseg_mode: setting.pageSegMode });
    const { data } = await createdWorker.recognize(image);
    return { text: cleanOcrText(data.text ?? ''), confidence: Number(data.confidence) || 0, orientation };
  })();
  recognition.catch(() => {}); // 時間切れのあとに失敗しても、未処理のエラーにしない

  try {
    return await Promise.race([recognition, timeout]);
  } catch (error) {
    if (error instanceof OcrError) {
      throw error;
    }
    throw new OcrError('文字を読み取れませんでした。範囲を選び直してください。');
  } finally {
    clearTimeout(timer);
    // 作業スレッドを終了する。時間切れのときは、作業スレッドができた時点で止める
    if (worker !== null) {
      await worker.terminate().catch(() => {});
    } else {
      recognition.then(() => worker?.terminate().catch(() => {})).catch(() => {});
    }
  }
}
