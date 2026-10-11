/**
 * clipboardImport.test.js
 * 目的：コピーした文章の読み取り（electron/clipboardImport.js）を確かめる。
 * 文章は架空のもの。クリップボードを読む関数は差し替えて、実際のクリップボードには触れない。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import {
  CLIPBOARD_EMPTY_MESSAGE,
  CLIPBOARD_READ_CHANNEL,
  createClipboardHandlers,
  readClipboardForExtraction,
} from '../electron/clipboardImport.js';
import { MAX_INPUT_LENGTH } from '../src/core/dateExtractor.js';

describe('readClipboardForExtraction', () => {
  test('文章があれば、そのまま返す', async () => {
    assert.deepEqual(await readClipboardForExtraction(() => '定例会 10月20日(火) 14時'), { ok: true, text: '定例会 10月20日(火) 14時' });
  });

  test('Electron 44 のように Promise で文章が届く場合も、届くのを待って読む（実機で見つかった不具合の再発防止）', async () => {
    assert.deepEqual(await readClipboardForExtraction(async () => '定例会 10月20日(火) 14時'), { ok: true, text: '定例会 10月20日(火) 14時' });
    assert.deepEqual(await readClipboardForExtraction(async () => ''), { ok: false, message: CLIPBOARD_EMPTY_MESSAGE });
    const rejected = await readClipboardForExtraction(() => Promise.reject(new Error('秘密の内容')));
    assert.equal(rejected.ok, false);
    assert.equal(rejected.message.includes('秘密'), false);
  });

  test('空・空白だけ・文字列でない（画像だけをコピーしたときなど）は、コピーし直すよう案内する', async () => {
    for (const value of ['', ' \n\t', undefined, null]) {
      assert.deepEqual(await readClipboardForExtraction(() => value), { ok: false, message: CLIPBOARD_EMPTY_MESSAGE });
    }
  });

  test('長すぎる文章は断る（文章の中身は文に含めない）', async () => {
    const result = await readClipboardForExtraction(() => 'あ'.repeat(MAX_INPUT_LENGTH + 1));
    assert.equal(result.ok, false);
    assert.ok(result.message.includes('文章が長すぎます'));
    assert.equal((await readClipboardForExtraction(() => 'あ'.repeat(MAX_INPUT_LENGTH))).ok, true);
  });

  test('クリップボードを読めなかったときは、エラーの中身を含めずに知らせる', async () => {
    const result = await readClipboardForExtraction(() => {
      throw new Error('秘密の内容');
    });
    assert.equal(result.ok, false);
    assert.equal(result.message.includes('秘密'), false);
  });
});

describe('createClipboardHandlers', () => {
  test('確認ウインドウからの要求なら読み取りを始める', async () => {
    let count = 0;
    const { handleRead } = createClipboardHandlers({ isTrustedSender: () => true, importClipboardText: () => { count += 1; } });
    assert.deepEqual(await handleRead({}), { ok: true });
    assert.equal(count, 1);
  });

  test('信頼できない送信元からの要求は、クリップボードを読まずに断る', async () => {
    let count = 0;
    const { handleRead } = createClipboardHandlers({ isTrustedSender: () => false, importClipboardText: () => { count += 1; } });
    assert.equal((await handleRead({})).ok, false);
    assert.equal(count, 0);
  });

  test('チャンネル名が preload.cjs と同じ', async () => {
    const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
    assert.ok(preload.includes(`'${CLIPBOARD_READ_CHANNEL}'`));
  });
});
