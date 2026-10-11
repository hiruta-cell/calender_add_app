/**
 * captureIpc.test.js
 * 目的：範囲キャプチャの通信の受け付け（electron/captureIpc.js）が、送信元と引数を検証することを確かめる。
 *       あわせて、preload が決めた関数だけを公開していることを確かめる。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import {
  APP_STATUS_CHANNEL,
  CAPTURE_CLEAR_CHANNEL,
  CAPTURE_REREAD_CHANNEL,
  CAPTURE_START_CHANNEL,
  CAPTURE_STATUS_CHANNEL,
  OVERLAY_CANCEL_CHANNEL,
  OVERLAY_SELECT_CHANNEL,
  createCaptureHandlers,
} from '../electron/captureIpc.js';

/**
 * 偽の取り込み処理を使って、受け付けの処理を作る。呼ばれた操作を記録する。
 * @param {object} [options]
 */
function createTestHandlers({ trusted = true, busy = false } = {}) {
  const calls = [];
  const controller = {
    isBusy: () => busy,
    startCapture: () => { calls.push('start'); return Promise.resolve({ ok: true }); },
    rereadSelection: (orientation) => { calls.push(`reread:${orientation}`); return Promise.resolve({ ok: true }); },
    clearCapture: () => { calls.push('clear'); },
  };
  const handlers = createCaptureHandlers({
    isTrustedSender: () => trusted,
    controller,
    getAppStatus: () => ({ hotkeyRegistered: true, hotkeyLabel: 'Ctrl+Shift+Y' }),
  });
  return { handlers, calls };
}

describe('確認ウインドウからの要求', () => {
  test('取り込みの開始・画像を消す・アプリの状態を受け付ける', async () => {
    const { handlers, calls } = createTestHandlers();
    assert.deepEqual(await handlers.handleStart({}), { ok: true });
    assert.deepEqual(await handlers.handleClear({}), { ok: true });
    assert.deepEqual(await handlers.handleAppStatus({}), { ok: true, hotkeyRegistered: true, hotkeyLabel: 'Ctrl+Shift+Y' });
    assert.deepEqual(calls, ['start', 'clear']);
  });

  test('読み直しは、決めた向き（auto / horizontal / vertical）だけを受け付ける', async () => {
    const { handlers, calls } = createTestHandlers();
    assert.equal((await handlers.handleReread({}, 'vertical')).ok, true);
    for (const bad of ['diagonal', '', null, 1, { orientation: 'vertical' }]) {
      assert.equal((await handlers.handleReread({}, bad)).ok, false);
    }
    assert.deepEqual(calls, ['reread:vertical']);
  });

  test('信頼できない送信元からの要求は、何もせずに断る', async () => {
    const { handlers, calls } = createTestHandlers({ trusted: false });
    for (const result of [
      await handlers.handleStart({}),
      await handlers.handleReread({}, 'vertical'),
      await handlers.handleClear({}),
      await handlers.handleAppStatus({}),
    ]) {
      assert.equal(result.ok, false);
    }
    assert.deepEqual(calls, []);
  });

  test('範囲の選択・読み取りの途中なら、重ねて始めない', async () => {
    const { handlers, calls } = createTestHandlers({ busy: true });
    assert.equal((await handlers.handleStart({})).ok, false);
    assert.equal((await handlers.handleReread({}, 'horizontal')).ok, false);
    assert.deepEqual(calls, []);
  });
});

describe('preload との整合', () => {
  test('確認ウインドウの preload：チャンネル名が captureIpc.js と同じ', async () => {
    const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
    for (const channel of [CAPTURE_START_CHANNEL, CAPTURE_REREAD_CHANNEL, CAPTURE_CLEAR_CHANNEL, APP_STATUS_CHANNEL, CAPTURE_STATUS_CHANNEL]) {
      assert.ok(preload.includes(`'${channel}'`), channel);
    }
    // メインプロセスからの受信は、結果を届けるチャンネルだけ。IPC のイベントそのものは画面に渡さない
    const listenedChannels = [...preload.matchAll(/ipcRenderer\.on\(([^,)]+)/g)].map((match) => match[1].trim());
    assert.deepEqual(listenedChannels, ['CAPTURE_STATUS_CHANNEL']);
    assert.match(preload, /\(_event, status\) => callback\(status\)/);
  });

  test('範囲選択の画面の preload：公開するのは select と cancel だけで、送信は決まったチャンネルの invoke だけ', async () => {
    const preload = await readFile(new URL('../electron/overlayPreload.cjs', import.meta.url), 'utf8');
    assert.ok(preload.includes(`'${OVERLAY_SELECT_CHANNEL}'`));
    assert.ok(preload.includes(`'${OVERLAY_CANCEL_CHANNEL}'`));
    assert.equal((preload.match(/exposeInMainWorld\(/g) ?? []).length, 1);
    assert.equal(/ipcRenderer\.(send|sendSync|sendTo|postMessage|on)\(/.test(preload), false);
    const invokedChannels = [...preload.matchAll(/ipcRenderer\.invoke\(([^,)]+)/g)].map((match) => match[1].trim());
    assert.deepEqual(invokedChannels.sort(), ['OVERLAY_CANCEL_CHANNEL', 'OVERLAY_SELECT_CHANNEL']);
  });
});
