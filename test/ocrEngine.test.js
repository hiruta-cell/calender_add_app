/**
 * ocrEngine.test.js
 * 目的：文字の読み取り（electron/ocrEngine.js）を、架空の文章の画像（test/fixtures/ocr/）で実際に動かして確かめる。
 *       あわせて、外部から文字データを取得しない設定であること、ファイルを書き出さないことを確かめる。
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ORIENTATION_HORIZONTAL,
  ORIENTATION_VERTICAL,
  OcrError,
  buildWorkerOptions,
  chooseBetterResult,
  getLanguageSettings,
  recognizeText,
} from '../electron/ocrEngine.js';
import { extractDateCandidates } from '../src/core/dateExtractor.js';
import { extractEventDetails } from '../src/core/detailExtractor.js';

/** テスト用の画像のフォルダ */
const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ocr');

/** テストの基準日時：2026-10-11(日) 10:00 JST */
const NOW = new Date('2026-10-11T01:00:00Z');

/** 実際に読み取るテストの制限時間（ミリ秒） */
const RECOGNITION_TEST_TIMEOUT_MS = 120_000;

/**
 * テスト用の画像を読み込む。
 * @param {string} fileName
 */
function readFixture(fileName) {
  return readFile(path.join(FIXTURE_DIR, fileName));
}

describe('設定：外部から文字データを取得しない', () => {
  test('横書き・縦書きとも、文字データは PC 内（node_modules）のフォルダから読む', () => {
    for (const [orientation, setting] of Object.entries(getLanguageSettings())) {
      assert.equal(path.isAbsolute(setting.langPath), true, orientation);
      assert.equal(/^[a-z]+:\/\//i.test(setting.langPath), false, `${orientation} が URL になっていない`);
      assert.ok(existsSync(path.join(setting.langPath, `${setting.language}.traineddata.gz`)), orientation);
    }
  });

  test('作業スレッドの設定：PC 内のフォルダを指定し、ファイルに書き出さない', () => {
    const options = buildWorkerOptions(getLanguageSettings()[ORIENTATION_HORIZONTAL]);
    assert.equal(options.cacheMethod, 'none');
    assert.equal(typeof options.errorHandler, 'function'); // 失敗しても処理されない例外にならない
    assert.equal(options.langPath, getLanguageSettings()[ORIENTATION_HORIZONTAL].langPath);
  });
});

describe('chooseBetterResult：確信度の高い方を選ぶ', () => {
  test('縦書きの方が高ければ縦書き、同じか低ければ横書き', () => {
    const horizontal = { confidence: 80, orientation: ORIENTATION_HORIZONTAL };
    assert.equal(chooseBetterResult(horizontal, { confidence: 90, orientation: ORIENTATION_VERTICAL }).orientation, ORIENTATION_VERTICAL);
    assert.equal(chooseBetterResult(horizontal, { confidence: 80, orientation: ORIENTATION_VERTICAL }).orientation, ORIENTATION_HORIZONTAL);
  });
});

describe('recognizeText：実際に読み取る（架空の画像）', { timeout: RECOGNITION_TEST_TIMEOUT_MS * 4 }, () => {
  test('横書きのメール：横書きと判定し、日時・件名・場所・URL を取り出せる', { timeout: RECOGNITION_TEST_TIMEOUT_MS }, async () => {
    const result = await recognizeText(await readFixture('horizontal-email-2x.png'));
    assert.equal(result.orientation, ORIENTATION_HORIZONTAL);
    const [candidate] = extractDateCandidates(result.text, { now: NOW }).candidates;
    assert.deepEqual(candidate.start, { year: 2026, month: 10, day: 15, hour: 14, minute: 0 });
    assert.deepEqual(candidate.end, { year: 2026, month: 10, day: 15, hour: 15, minute: 0 });
    const details = extractEventDetails(result.text);
    assert.match(details.title, /定例会のご案内/);
    assert.match(details.location, /オンライン/);
    assert.equal(details.meetingUrl, 'https://zoom.us/j/0000000000');
  });

  test('縦書きのお知らせ：縦書きと判定し、漢字の日時を取り出せる', { timeout: RECOGNITION_TEST_TIMEOUT_MS }, async () => {
    const result = await recognizeText(await readFixture('vertical-notice-2x.png'));
    assert.equal(result.orientation, ORIENTATION_VERTICAL);
    const [candidate] = extractDateCandidates(result.text, { now: NOW }).candidates;
    assert.deepEqual(candidate.start, { year: 2026, month: 10, day: 15, hour: 14, minute: 0 });
  });

  test('向きを指定して読み直せる（チャット風の文章を横書きで）', { timeout: RECOGNITION_TEST_TIMEOUT_MS }, async () => {
    const result = await recognizeText(await readFixture('horizontal-chat-2x.png'), { orientation: ORIENTATION_HORIZONTAL });
    assert.equal(result.orientation, ORIENTATION_HORIZONTAL);
    const [candidate] = extractDateCandidates(result.text, { now: NOW }).candidates;
    assert.deepEqual(candidate.start, { year: 2026, month: 10, day: 12, hour: 15, minute: 0 });
  });

  test('読み取っても作業フォルダにファイルを書き出さない', { timeout: RECOGNITION_TEST_TIMEOUT_MS }, async () => {
    const before = readdirSync(process.cwd()).sort();
    await recognizeText(await readFixture('horizontal-chat-2x.png'), { orientation: ORIENTATION_VERTICAL });
    assert.deepEqual(readdirSync(process.cwd()).sort(), before);
  });
});

describe('recognizeText：異常な入力・時間切れ', () => {
  test('画像がない・大きすぎる・向きが不正なら OcrError', async () => {
    await assert.rejects(recognizeText(Buffer.alloc(0)), OcrError);
    await assert.rejects(recognizeText('not a buffer'), OcrError);
    await assert.rejects(recognizeText(Buffer.alloc(21 * 1024 * 1024)), OcrError);
    await assert.rejects(recognizeText(Buffer.from([1, 2, 3]), { orientation: 'diagonal' }), OcrError);
  });

  test('画像として読めないデータは OcrError', { timeout: RECOGNITION_TEST_TIMEOUT_MS }, async () => {
    await assert.rejects(recognizeText(Buffer.from('これは画像ではありません'), { orientation: ORIENTATION_HORIZONTAL }), OcrError);
  });

  test('制限時間を過ぎたら OcrError で中断する（固まらない）', { timeout: RECOGNITION_TEST_TIMEOUT_MS }, async () => {
    const image = await readFixture('horizontal-email-2x.png');
    await assert.rejects(recognizeText(image, { orientation: ORIENTATION_HORIZONTAL, timeoutMs: 1 }), OcrError);
  });
});
