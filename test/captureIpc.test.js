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
  CAPTURE_IMPORT_CHANNEL,
  CAPTURE_REREAD_CHANNEL,
  CAPTURE_START_CHANNEL,
  CAPTURE_STATUS_CHANNEL,
  OPEN_SCREEN_SETTINGS_CHANNEL,
  OVERLAY_CANCEL_CHANNEL,
  OVERLAY_SELECT_CHANNEL,
  SCREEN_RECORDING_SETTINGS_URL,
  createCaptureHandlers,
  createOpenScreenSettingsHandler,
  validateImportedImage,
} from '../electron/captureIpc.js';

/** PNG の先頭の8バイト（テスト用の画像の印） */
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * 偽の取り込み処理を使って、受け付けの処理を作る。呼ばれた操作を記録する。
 * @param {object} [options]
 */
function createTestHandlers({ trusted = true, busy = false } = {}) {
  const calls = [];
  const controller = {
    isBusy: () => busy,
    startCapture: () => { calls.push('start'); return Promise.resolve({ ok: true }); },
    importImage: (png) => { calls.push(`import:${Buffer.isBuffer(png)}:${png.length}`); return Promise.resolve({ ok: true }); },
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

describe('貼り付け・ドラッグ＆ドロップした画像の受け付け', () => {
  test('PNG の画像だけを受け付け、取り込みの処理に渡す', async () => {
    const { handlers, calls } = createTestHandlers();
    const png = Uint8Array.from([...PNG_HEADER, 1, 2, 3]);
    assert.deepEqual(await handlers.handleImport({}, png), { ok: true });
    assert.deepEqual(calls, ['import:true:11']);
  });

  test('画像でない・空・大きすぎる・PNG でないものは断る（何も読み取らない）', async () => {
    const { handlers, calls } = createTestHandlers();
    const tooLarge = new Uint8Array(21 * 1024 * 1024);
    tooLarge.set(PNG_HEADER);
    for (const bad of [null, 'text', [1, 2, 3], new Uint8Array(0), tooLarge, Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])]) {
      assert.equal((await handlers.handleImport({}, bad)).ok, false);
    }
    assert.deepEqual(calls, []);
  });

  test('信頼できない送信元・読み取りの途中なら断る', async () => {
    const png = Uint8Array.from([...PNG_HEADER, 1]);
    const untrusted = createTestHandlers({ trusted: false });
    assert.equal((await untrusted.handlers.handleImport({}, png)).ok, false);
    const busy = createTestHandlers({ busy: true });
    assert.equal((await busy.handlers.handleImport({}, png)).ok, false);
    assert.deepEqual([...untrusted.calls, ...busy.calls], []);
  });

  test('validateImportedImage は Buffer を返す', () => {
    assert.ok(Buffer.isBuffer(validateImportedImage(Uint8Array.from([...PNG_HEADER, 9]))));
  });
});

describe('「システム設定を開く」の要求', () => {
  /** テスト用の処理を作る。開いた URL を記録する */
  function createSettingsHandler({ trusted = true, platform = 'darwin' } = {}) {
    const opened = [];
    const handler = createOpenScreenSettingsHandler({
      isTrustedSender: () => trusted,
      openExternal: async (url) => { opened.push(url); },
      platform,
    });
    return { handler, opened };
  }

  test('Mac では、決まった設定画面の URL だけを開く（画面から URL は受け取らない）', async () => {
    const { handler, opened } = createSettingsHandler();
    assert.deepEqual(await handler({}, 'https://evil.example/'), { ok: true });
    assert.deepEqual(opened, [SCREEN_RECORDING_SETTINGS_URL]);
    assert.equal(SCREEN_RECORDING_SETTINGS_URL, 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  });

  test('信頼できない送信元・Mac 以外では何も開かない', async () => {
    const untrusted = createSettingsHandler({ trusted: false });
    assert.equal((await untrusted.handler({})).ok, false);
    assert.equal(untrusted.opened.length, 0);
    const windows = createSettingsHandler({ platform: 'win32' });
    assert.equal((await windows.handler({})).ok, false);
    assert.equal(windows.opened.length, 0);
  });
});

describe('preload との整合', () => {
  test('確認ウインドウの preload：チャンネル名が captureIpc.js と同じ', async () => {
    const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
    for (const channel of [CAPTURE_START_CHANNEL, CAPTURE_IMPORT_CHANNEL, CAPTURE_REREAD_CHANNEL, CAPTURE_CLEAR_CHANNEL, APP_STATUS_CHANNEL, CAPTURE_STATUS_CHANNEL, OPEN_SCREEN_SETTINGS_CHANNEL]) {
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
