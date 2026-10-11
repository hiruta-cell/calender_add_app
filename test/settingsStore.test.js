/**
 * settingsStore.test.js
 * 目的：設定の保存・読み込み（electron/settingsStore.js）を、一時フォルダで確かめる。
 */

import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { MAX_SETTINGS_FILE_BYTES, SETTINGS_FILE_NAME, createSettingsStore } from '../electron/settingsStore.js';
import { DEFAULT_SETTINGS } from '../src/core/settings.js';

/** テストで作った一時フォルダ（最後に消す） */
const temporaryDirectories = [];

/**
 * 空の一時フォルダを作る。
 *
 * @returns {Promise<string>}
 */
async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'calendar-add-app-settings-'));
  temporaryDirectories.push(directory);
  return directory;
}

after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('設定の保存先（settings.json）', () => {
  test('まだ保存していなければ既定値', async () => {
    const store = createSettingsStore(await createTemporaryDirectory());
    assert.deepEqual(await store.load(), DEFAULT_SETTINGS);
  });

  test('保存した設定を読み込める。決まった項目だけを書き、一時ファイルを残さない', async () => {
    const directory = await createTemporaryDirectory();
    const store = createSettingsStore(directory);
    const settings = { durationMinutes: 30, hotkeyModifiers: 'CommandOrControl+Alt', hotkeyKey: 'K' };
    await store.save({ ...settings, extra: '保存しない項目' });
    assert.deepEqual(await store.load(), settings);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, SETTINGS_FILE_NAME), 'utf8')), settings);
    assert.deepEqual(await readdir(directory), [SETTINGS_FILE_NAME]);
  });

  test('ファイルは本人だけが読み書きできる権限（600）で作る', { skip: process.platform === 'win32' }, async () => {
    const directory = await createTemporaryDirectory();
    await createSettingsStore(directory).save(DEFAULT_SETTINGS);
    assert.equal((await stat(path.join(directory, SETTINGS_FILE_NAME))).mode & 0o777, 0o600);
  });

  test('前回の失敗で権限の広い一時ファイルが残っていても、保存した設定は 600 になる', { skip: process.platform === 'win32' }, async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, `${SETTINGS_FILE_NAME}.tmp`), 'leftover', { mode: 0o644 });
    await createSettingsStore(directory).save(DEFAULT_SETTINGS);
    assert.equal((await stat(path.join(directory, SETTINGS_FILE_NAME))).mode & 0o777, 0o600);
  });

  test('保存先のフォルダがなければ作る', async () => {
    const directory = path.join(await createTemporaryDirectory(), 'まだないフォルダ');
    await createSettingsStore(directory).save(DEFAULT_SETTINGS);
    assert.deepEqual(await createSettingsStore(directory).load(), DEFAULT_SETTINGS);
  });

  test('壊れた JSON・大きすぎるファイル・おかしな値でも、例外を投げずに既定値（正しい項目は使う）で読み込む', async () => {
    const directory = await createTemporaryDirectory();
    const filePath = path.join(directory, SETTINGS_FILE_NAME);
    const store = createSettingsStore(directory);

    await writeFile(filePath, '{ 壊れた JSON');
    assert.deepEqual(await store.load(), DEFAULT_SETTINGS);

    await writeFile(filePath, JSON.stringify({ durationMinutes: 90, padding: 'x'.repeat(MAX_SETTINGS_FILE_BYTES) }));
    assert.deepEqual(await store.load(), DEFAULT_SETTINGS);

    await writeFile(filePath, JSON.stringify({ durationMinutes: 90, hotkeyModifiers: 'Alt', hotkeyKey: 'F12' }));
    assert.deepEqual(await store.load(), { ...DEFAULT_SETTINGS, durationMinutes: 90 });
  });
});
