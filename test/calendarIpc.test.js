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
 * テスト用の処理を作る。開いた URL と待った時間を記録する。
 * @param {object} [options]
 */
function createTestHandler({ trusted = true, openExternal } = {}) {
  const opened = [];
  const delays = [];
  const handler = createOpenCalendarEventsHandler({
    openExternal: openExternal ?? (async (url) => { opened.push(url); }),
    isTrustedSender: () => trusted,
    delay: async (milliseconds) => { delays.push(milliseconds); },
  });
  return { handler, opened, delays };
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

describe('preload との整合', () => {
  test('preload.cjs のチャンネル名が calendarIpc.js と同じ', async () => {
    const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
    assert.ok(preload.includes(`'${OPEN_CALENDAR_EVENTS_CHANNEL}'`));
  });

  test('preload.cjs が公開するのは openCalendarEvents だけで、ipcRenderer そのものは公開しない', async () => {
    const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
    assert.equal((preload.match(/exposeInMainWorld\(/g) ?? []).length, 1);
    assert.equal((preload.match(/ipcRenderer\.(send|on|invoke|sendSync)\(/g) ?? []).length, 1);
    assert.equal(/exposeInMainWorld\([^)]*ipcRenderer\s*[,)]/.test(preload), false);
  });
});
