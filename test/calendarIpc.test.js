/**
 * calendarIpc.test.js
 * 目的：登録要求の処理（electron/calendarIpc.js）が、送信元・引数を検証し、許可した URL だけを順に開くことを確かめる。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import {
  MAX_EVENTS_PER_REQUEST,
  OPEN_CALENDAR_EVENTS_CHANNEL,
  OPEN_INTERVAL_MS,
  createOpenCalendarEventsHandler,
} from '../electron/calendarIpc.js';
import { isAllowedCalendarUrl } from '../src/core/calendarUrl.js';

/** 架空の予定 */
function sampleEvent(day = 15) {
  return {
    title: '【架空】定例会',
    location: '',
    details: '',
    allDay: false,
    start: { year: 2026, month: 10, day, hour: 14, minute: 0 },
    end: { year: 2026, month: 10, day, hour: 15, minute: 0 },
  };
}

/**
 * テスト用の処理を作る。開いた URL・待った時間・「すべて開けた」の呼び出し（最小化）の回数を記録する。
 * @param {object} [options]
 */
function createTestHandler({ trusted = true, openExternal } = {}) {
  const opened = [];
  const delays = [];
  const allOpened = { count: 0 };
  const handler = createOpenCalendarEventsHandler({
    openExternal: openExternal ?? (async (url) => { opened.push(url); }),
    isTrustedSender: () => trusted,
    delay: async (milliseconds) => { delays.push(milliseconds); },
    onAllOpened: () => { allOpened.count += 1; },
  });
  return { handler, opened, delays, allOpened };
}

describe('送信元の検証', () => {
  test('信頼できない送信元からの要求は、何も開かずに断る', async () => {
    const { handler, opened } = createTestHandler({ trusted: false });
    const result = await handler({}, [sampleEvent()]);
    assert.equal(result.ok, false);
    assert.equal(opened.length, 0);
  });
});

describe('引数の検証', () => {
  test('配列でない・空・件数超過は断る', async () => {
    const { handler, opened } = createTestHandler();
    for (const bad of [null, 'text', {}, [], Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, () => sampleEvent())]) {
      const result = await handler({}, bad);
      assert.equal(result.ok, false);
    }
    assert.equal(opened.length, 0);
  });

  test('1件でも不正な予定があれば、1件も開かない（何件目かを知らせる）', async () => {
    const { handler, opened } = createTestHandler();
    const result = await handler({}, [sampleEvent(), { ...sampleEvent(), title: 'x'.repeat(10000) }]);
    assert.equal(result.ok, false);
    assert.match(result.message, /^2件目：/);
    assert.equal(opened.length, 0);
  });
});

describe('ブラウザで開く処理', () => {
  test('許可リストを通った URL を順に開き、間に待ち時間を入れる', async () => {
    const { handler, opened, delays } = createTestHandler();
    const result = await handler({}, [sampleEvent(15), sampleEvent(16), sampleEvent(17)]);
    assert.deepEqual(result, { ok: true, openedCount: 3 });
    assert.equal(opened.length, 3);
    assert.ok(opened.every(isAllowedCalendarUrl));
    assert.match(opened[0], /dates=20261015T140000/);
    assert.match(opened[2], /dates=20261017T140000/);
    assert.deepEqual(delays, [OPEN_INTERVAL_MS, OPEN_INTERVAL_MS]);
  });

  test('処理中に重ねて要求されたら断る（二度押し対策）', async () => {
    let releaseFirst;
    const { handler } = createTestHandler({
      openExternal: () => new Promise((resolve) => { releaseFirst = resolve; }),
    });
    const first = handler({}, [sampleEvent()]);
    const second = await handler({}, [sampleEvent()]);
    assert.equal(second.ok, false);
    releaseFirst();
    assert.equal((await first).ok, true);
    // 処理が終われば、また受け付ける
    const { handler: freshHandler } = createTestHandler();
    assert.equal((await freshHandler({}, [sampleEvent()])).ok, true);
  });

  test('ブラウザを開けなかったら、開けた件数とともに知らせる', async () => {
    let calls = 0;
    const { handler } = createTestHandler({
      openExternal: async () => {
        calls += 1;
        if (calls === 2) throw new Error('failed');
      },
    });
    const result = await handler({}, [sampleEvent(15), sampleEvent(16)]);
    assert.equal(result.ok, false);
    assert.equal(result.openedCount, 1);
  });
});

describe('登録後の確認ウインドウの最小化（依頼者の指示）', () => {
  test('すべて開けたら、最後に1回だけ最小化を呼ぶ', async () => {
    const order = [];
    const handler = createOpenCalendarEventsHandler({
      openExternal: async () => { order.push('open'); },
      isTrustedSender: () => true,
      delay: async () => {},
      onAllOpened: () => { order.push('minimize'); },
    });
    assert.equal((await handler({}, [sampleEvent(15), sampleEvent(16)])).ok, true);
    assert.deepEqual(order, ['open', 'open', 'minimize']);
  });

  test('途中で開けなかったとき・断ったときは最小化しない（エラーを見せるため）', async () => {
    let calls = 0;
    const failing = createTestHandler({
      openExternal: async () => {
        calls += 1;
        if (calls === 2) throw new Error('failed');
      },
    });
    await failing.handler({}, [sampleEvent(15), sampleEvent(16)]);
    assert.equal(failing.allOpened.count, 0);

    const untrusted = createTestHandler({ trusted: false });
    await untrusted.handler({}, [sampleEvent()]);
    assert.equal(untrusted.allOpened.count, 0);

    const invalid = createTestHandler();
    await invalid.handler({}, []);
    assert.equal(invalid.allOpened.count, 0);
  });
});

describe('preload との整合', () => {
  /** preload.cjs の内容 */
  const preloadSource = () => readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

  test('preload.cjs のチャンネル名が calendarIpc.js と同じ', async () => {
    const preload = await preloadSource();
    assert.ok(preload.includes(`'${OPEN_CALENDAR_EVENTS_CHANNEL}'`));
  });

  test('削除した「カレンダーで確認」（openCalendarDay・calendar:open-day）は公開していない', async () => {
    const preload = await preloadSource();
    assert.equal(preload.includes('openCalendarDay'), false);
    assert.equal(preload.includes('calendar:open-day'), false);
  });

  test('preload.cjs は ipcRenderer そのものを公開せず、送信は決まったチャンネルの invoke だけ', async () => {
    const preload = await preloadSource();
    assert.equal((preload.match(/exposeInMainWorld\(/g) ?? []).length, 1);
    assert.equal(/ipcRenderer\.(send|sendSync|sendTo|postMessage)\(/.test(preload), false);
    assert.equal(/exposeInMainWorld\([^)]*ipcRenderer\s*[,)]/.test(preload), false);
    // invoke に渡すチャンネルは、すべて定数（文字列をそのまま渡したり、画面から受け取ったりしない）
    const invokedChannels = [...preload.matchAll(/ipcRenderer\.invoke\(([^,)]+)/g)].map((match) => match[1].trim());
    assert.ok(invokedChannels.length > 0);
    assert.ok(invokedChannels.every((channel) => /^[A-Z_]+_CHANNEL$/.test(channel)), invokedChannels.join(','));
  });
});
