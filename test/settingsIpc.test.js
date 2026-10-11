/**
 * settingsIpc.test.js
 * 目的：設定画面からの要求の処理（electron/settingsIpc.js）を、偽のホットキー・自動起動・保存先で確かめる。
 *       送信元・引数の検証、ホットキーの登録し直し、途中で失敗したときに元に戻すこと、preload との整合。
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { DesktopIntegrationError } from '../electron/desktopIntegration.js';
import {
  DESKTOP_ICON_CHANNEL,
  SETTINGS_GET_CHANNEL,
  SETTINGS_SAVE_CHANNEL,
  createSettingsHandlers,
} from '../electron/settingsIpc.js';
import { DEFAULT_SETTINGS, buildAccelerator, formatHotkeyLabel } from '../src/core/settings.js';

/** 保存の要求の例（予定の長さ 30分、ホットキー Ctrl+Alt+K、自動起動オフ） */
const SAMPLE_REQUEST = Object.freeze({ durationMinutes: 30, hotkeyModifiers: 'CommandOrControl+Alt', hotkeyKey: 'K', autoStart: false });

/**
 * 偽のホットキー・自動起動・保存先で、処理を作る。
 *
 * @param {object} [options]
 * @param {boolean} [options.trusted] 送信元を信頼するか
 * @param {(accelerator: string) => boolean} [options.isHotkeyAvailable] そのホットキーを登録できるか
 * @param {boolean} [options.autoStartSupported] 自動起動に対応しているか
 * @param {boolean} [options.autoStartFails] 自動起動の切り替えに失敗するか
 * @param {boolean} [options.saveFails] 保存に失敗するか
 * @param {() => Promise<void>} [options.createDesktopIcon] アイコンを作る関数
 */
function createHarness({
  trusted = true,
  isHotkeyAvailable = () => true,
  autoStartSupported = true,
  autoStartFails = false,
  autoStartReadFails = false,
  isInitiallyRegistered = true,
  saveFails = false,
  createDesktopIcon = async () => {},
} = {}) {
  const state = {
    currentSettings: DEFAULT_SETTINGS,
    registeredAccelerator: isInitiallyRegistered ? buildAccelerator(DEFAULT_SETTINGS) : null,
    autoStartEnabled: false,
    savedSettings: [],
    autoStartCalls: [],
  };
  const handlers = createSettingsHandlers({
    isTrustedSender: () => trusted,
    store: {
      save: async (settings) => {
        if (saveFails) throw new Error('disk full');
        state.savedSettings.push(settings);
      },
    },
    getCurrentSettings: () => state.currentSettings,
    setCurrentSettings: (settings) => {
      state.currentSettings = settings;
    },
    changeHotkey: (settings) => {
      const accelerator = buildAccelerator(settings);
      if (!isHotkeyAvailable(accelerator)) return false; // 登録できなければ元のまま
      state.registeredAccelerator = accelerator;
      return true;
    },
    getHotkeyStatus: () => ({ hotkeyRegistered: state.registeredAccelerator !== null, hotkeyLabel: formatHotkeyLabel(state.currentSettings, false) }),
    autoStart: {
      isSupported: autoStartSupported,
      isEnabled: async () => {
        if (autoStartReadFails) throw new Error('cannot read');
        return state.autoStartEnabled;
      },
      setEnabled: async (enabled) => {
        state.autoStartCalls.push(enabled);
        if (autoStartFails) throw new Error('registry error');
        state.autoStartEnabled = enabled;
      },
    },
    createDesktopIcon,
    platform: 'windows',
  });
  return { handlers, state };
}

describe('送信元の検証', () => {
  test('信頼できない送信元からの取得・保存・アイコンの作成は、何もせずに断る', async () => {
    let iconCreated = false;
    const { handlers, state } = createHarness({ trusted: false, createDesktopIcon: async () => { iconCreated = true; } });
    assert.equal((await handlers.handleGet({})).ok, false);
    assert.equal((await handlers.handleSave({}, { ...SAMPLE_REQUEST, autoStart: true })).ok, false);
    assert.equal((await handlers.handleCreateDesktopIcon({})).ok, false);
    assert.equal(iconCreated, false);
    assert.deepEqual(state.savedSettings, []);
    assert.deepEqual(state.autoStartCalls, []);
    assert.equal(state.registeredAccelerator, buildAccelerator(DEFAULT_SETTINGS));
  });
});

describe('設定の取得', () => {
  test('今の設定・自動起動の状態・OS・ホットキーの状態を返す', async () => {
    const { handlers } = createHarness();
    assert.deepEqual(await handlers.handleGet({}), {
      ok: true,
      settings: DEFAULT_SETTINGS,
      autoStart: false,
      autoStartSupported: true,
      platform: 'windows',
      hotkeyRegistered: true,
      hotkeyLabel: 'Ctrl+Shift+Y',
    });
  });
});

describe('設定の保存', () => {
  test('選択肢にない値・形式違いは断り、何も変えない', async () => {
    const { handlers, state } = createHarness();
    for (const bad of [
      null,
      'settings',
      { ...SAMPLE_REQUEST, autoStart: 'yes' },
      { durationMinutes: 30, hotkeyModifiers: 'CommandOrControl+Alt', hotkeyKey: 'K' },
      { ...SAMPLE_REQUEST, durationMinutes: 7 },
      { ...SAMPLE_REQUEST, hotkeyModifiers: 'Shift' },
      { ...SAMPLE_REQUEST, hotkeyKey: 'K; rm -rf' },
      { ...SAMPLE_REQUEST, extra: 1 },
    ]) {
      assert.equal((await handlers.handleSave({}, bad)).ok, false, JSON.stringify(bad));
    }
    assert.deepEqual(state.savedSettings, []);
    assert.equal(state.currentSettings, DEFAULT_SETTINGS);
  });

  test('ホットキーが変わったら登録し直し、保存して、今の設定にする', async () => {
    const { handlers, state } = createHarness();
    const result = await handlers.handleSave({}, SAMPLE_REQUEST);
    const { autoStart, ...settings } = SAMPLE_REQUEST;
    assert.deepEqual(result, { ok: true, settings, autoStart, hotkeyRegistered: true, hotkeyLabel: 'Ctrl+Alt+K' });
    assert.equal(state.registeredAccelerator, 'CommandOrControl+Alt+K');
    assert.deepEqual(state.savedSettings, [settings]);
    assert.deepEqual(state.currentSettings, settings);
    assert.deepEqual(state.autoStartCalls, []); // 自動起動は変わっていないので、OS の登録は触らない
  });

  test('新しいホットキーを登録できなければ断り、保存しない（元のホットキーのまま）', async () => {
    const { handlers, state } = createHarness({ isHotkeyAvailable: (accelerator) => accelerator !== 'CommandOrControl+Alt+K' });
    const result = await handlers.handleSave({}, SAMPLE_REQUEST);
    assert.equal(result.ok, false);
    assert.match(result.message, /ほかのアプリが使っている/);
    assert.equal(state.registeredAccelerator, buildAccelerator(DEFAULT_SETTINGS));
    assert.deepEqual(state.savedSettings, []);
  });

  test('自動起動は、オンなら保存のたびに登録し直し（フォルダの移動に追いつく）、オフは変わったときだけ OS の登録を変える', async () => {
    const { handlers, state } = createHarness();
    await handlers.handleSave({}, { ...SAMPLE_REQUEST, autoStart: true });
    await handlers.handleSave({}, { ...SAMPLE_REQUEST, autoStart: true });
    await handlers.handleSave({}, { ...SAMPLE_REQUEST, autoStart: false });
    await handlers.handleSave({}, { ...SAMPLE_REQUEST, autoStart: false });
    assert.deepEqual(state.autoStartCalls, [true, true, false]);
  });

  test('自動起動を変えられなければ、ホットキーを元に戻して断る（保存しない）', async () => {
    const { handlers, state } = createHarness({ autoStartFails: true });
    const result = await handlers.handleSave({}, { ...SAMPLE_REQUEST, autoStart: true });
    assert.equal(result.ok, false);
    assert.equal(state.registeredAccelerator, buildAccelerator(DEFAULT_SETTINGS));
    assert.deepEqual(state.savedSettings, []);
    assert.equal(state.currentSettings, DEFAULT_SETTINGS);
  });

  test('ファイルに保存できなければ、ホットキーと自動起動を元に戻して断る', async () => {
    const { handlers, state } = createHarness({ saveFails: true });
    const result = await handlers.handleSave({}, { ...SAMPLE_REQUEST, autoStart: true });
    assert.equal(result.ok, false);
    assert.equal(state.registeredAccelerator, buildAccelerator(DEFAULT_SETTINGS));
    assert.equal(state.autoStartEnabled, false);
    assert.deepEqual(state.autoStartCalls, [true, false]);
    assert.equal(state.currentSettings, DEFAULT_SETTINGS);
  });

  test('自動起動に対応していない OS でオンにしようとすると断る（オフのままなら保存できる）', async () => {
    const { handlers, state } = createHarness({ autoStartSupported: false });
    assert.equal((await handlers.handleSave({}, { ...SAMPLE_REQUEST, autoStart: true })).ok, false);
    assert.equal(state.registeredAccelerator, buildAccelerator(DEFAULT_SETTINGS));
    assert.equal((await handlers.handleSave({}, SAMPLE_REQUEST)).ok, true);
  });

  test('保存の途中に重ねて保存すると断る（終われば、また受け付ける）', async () => {
    let releaseSave = () => {};
    // 保存を止められる処理（releaseSave を呼ぶまで保存が終わらない）
    const blocking = createSettingsHandlers({
      isTrustedSender: () => true,
      store: { save: () => new Promise((resolve) => { releaseSave = resolve; }) },
      getCurrentSettings: () => DEFAULT_SETTINGS,
      setCurrentSettings: () => {},
      changeHotkey: () => true,
      getHotkeyStatus: () => ({ hotkeyRegistered: true, hotkeyLabel: '' }),
      autoStart: { isSupported: true, isEnabled: async () => false, setEnabled: async () => {} },
      createDesktopIcon: async () => {},
      platform: 'mac',
    });
    const first = blocking.handleSave({}, SAMPLE_REQUEST);
    await new Promise((resolve) => setImmediate(resolve)); // 1つ目が保存の途中で止まるまで進める
    assert.equal((await blocking.handleSave({}, SAMPLE_REQUEST)).ok, false);
    releaseSave();
    assert.equal((await first).ok, true);
    const third = blocking.handleSave({}, SAMPLE_REQUEST);
    await new Promise((resolve) => setImmediate(resolve));
    releaseSave();
    assert.equal((await third).ok, true);
  });
});

describe('設定の保存（見直しで見つかった場合）', () => {
  test('起動時に登録できなかったキーは、同じ組み合わせのまま保存すると登録し直す', async () => {
    const { handlers, state } = createHarness({ isInitiallyRegistered: false });
    const result = await handlers.handleSave({}, { ...DEFAULT_SETTINGS, autoStart: false });
    assert.equal(result.ok, true);
    assert.equal(result.hotkeyRegistered, true);
    assert.equal(state.registeredAccelerator, buildAccelerator(DEFAULT_SETTINGS));
  });

  test('同じキーがまだ使われていても、ほかの設定（予定の長さ）は保存できる', async () => {
    const { handlers, state } = createHarness({ isInitiallyRegistered: false, isHotkeyAvailable: () => false });
    const result = await handlers.handleSave({}, { ...DEFAULT_SETTINGS, durationMinutes: 30, autoStart: false });
    assert.equal(result.ok, true);
    assert.equal(result.hotkeyRegistered, false);
    assert.equal(state.currentSettings.durationMinutes, 30);
  });

  test('自動起動の状態を読めないときは、変えたキーを元に戻して断る', async () => {
    const { handlers, state } = createHarness({ autoStartReadFails: true });
    const result = await handlers.handleSave({}, { ...DEFAULT_SETTINGS, hotkeyKey: 'K', autoStart: false });
    assert.equal(result.ok, false);
    assert.equal(state.registeredAccelerator, buildAccelerator(DEFAULT_SETTINGS));
    assert.deepEqual(state.savedSettings, []);
    assert.equal(state.currentSettings, DEFAULT_SETTINGS);
  });
});

describe('デスクトップのアイコンの作成', () => {
  test('作れたら知らせる', async () => {
    const { handlers } = createHarness();
    assert.deepEqual(await handlers.handleCreateDesktopIcon({}), { ok: true, message: 'デスクトップにアイコンを作りました。' });
  });

  test('利用者向けのエラーはそのまま、予期しないエラーは決まった文で知らせる（パスなどを含めない）', async () => {
    const known = createHarness({ createDesktopIcon: async () => { throw new DesktopIntegrationError('同じ名前のものがあります。'); } });
    assert.deepEqual(await known.handlers.handleCreateDesktopIcon({}), { ok: false, message: '同じ名前のものがあります。' });
    const unknown = createHarness({ createDesktopIcon: async () => { throw new Error('EACCES: /Users/架空/Desktop'); } });
    const result = await unknown.handlers.handleCreateDesktopIcon({});
    assert.equal(result.ok, false);
    assert.equal(result.message.includes('/Users'), false);
  });
});

describe('preload との整合', () => {
  /** preload.cjs の内容 */
  const preloadSource = () => readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');

  test('設定のチャンネル名が settingsIpc.js と同じ', async () => {
    const preload = await preloadSource();
    for (const channel of [SETTINGS_GET_CHANNEL, SETTINGS_SAVE_CHANNEL, DESKTOP_ICON_CHANNEL]) {
      assert.ok(preload.includes(`'${channel}'`), channel);
    }
  });

  test('画面から送れる（invoke する）チャンネルは、決めた10個だけ', async () => {
    const preload = await preloadSource();
    const invokedChannels = [...preload.matchAll(/ipcRenderer\.invoke\(([^,)]+)/g)].map((match) => match[1].trim()).sort();
    assert.deepEqual(invokedChannels, [
      'APP_STATUS_CHANNEL',
      'CAPTURE_CLEAR_CHANNEL',
      'CAPTURE_IMPORT_CHANNEL',
      'CAPTURE_REREAD_CHANNEL',
      'CAPTURE_START_CHANNEL',
      'DESKTOP_ICON_CHANNEL',
      'OPEN_CALENDAR_EVENTS_CHANNEL',
      'OPEN_SCREEN_SETTINGS_CHANNEL',
      'SETTINGS_GET_CHANNEL',
      'SETTINGS_SAVE_CHANNEL',
    ]);
  });
});
