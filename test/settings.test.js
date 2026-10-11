/**
 * settings.test.js
 * 目的：設定の既定値・選択肢・検証・ホットキーの表記（src/core/settings.js）を確かめる。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CLIPBOARD_HOTKEY_KEY,
  DEFAULT_SETTINGS,
  DURATION_CHOICES,
  HOTKEY_KEY_CHOICES,
  HOTKEY_MODIFIER_CHOICES,
  SettingsError,
  buildAccelerator,
  buildClipboardAccelerator,
  formatClipboardHotkeyLabel,
  formatHotkeyLabel,
  formatModifierLabel,
  normalizeStoredSettings,
  validateSettings,
} from '../src/core/settings.js';

describe('設定の既定値と選択肢', () => {
  test('既定は 60分・Ctrl+Shift+Y（Mac は Cmd+Shift+Y）（要件§5.4・§12）', () => {
    assert.deepEqual(DEFAULT_SETTINGS, { durationMinutes: 60, hotkeyModifiers: 'CommandOrControl+Shift', hotkeyKey: 'Y' });
    assert.ok(DURATION_CHOICES.includes(DEFAULT_SETTINGS.durationMinutes));
  });

  test('ホットキーの組み合わせは、どれも Ctrl（Mac は Cmd）を含む（文字の入力を横取りしない）', () => {
    assert.ok(HOTKEY_MODIFIER_CHOICES.every((modifiers) => modifiers.startsWith('CommandOrControl+')));
  });

  test('キーは英字（大文字）と数字の36個から、コピーした文章の読み取りの U を除いた35個', () => {
    assert.equal(HOTKEY_KEY_CHOICES.length, 35);
    assert.ok(HOTKEY_KEY_CHOICES.every((key) => /^[A-Z0-9]$/.test(key)));
  });
});

describe('validateSettings：画面から届いた設定の検証', () => {
  test('選択肢の中の値は受け付ける', () => {
    const settings = { durationMinutes: 30, hotkeyModifiers: 'CommandOrControl+Alt', hotkeyKey: '7' };
    assert.deepEqual(validateSettings(settings), settings);
  });

  test('形式違い・項目の過不足・選択肢にない値は断る', () => {
    const base = { ...DEFAULT_SETTINGS };
    for (const bad of [
      null,
      [],
      'settings',
      {},
      { durationMinutes: 60, hotkeyModifiers: 'CommandOrControl+Shift' },
      { ...base, extra: true },
      { ...base, durationMinutes: 61 },
      { ...base, durationMinutes: '60' },
      { ...base, durationMinutes: 0 },
      { ...base, hotkeyModifiers: 'Shift' },
      { ...base, hotkeyModifiers: 'Alt' },
      { ...base, hotkeyModifiers: 'CommandOrControl' },
      { ...base, hotkeyKey: 'y' },
      { ...base, hotkeyKey: 'F1' },
      { ...base, hotkeyKey: 'Y+Q' },
      { ...base, hotkeyKey: '' },
    ]) {
      assert.throws(() => validateSettings(bad), SettingsError, JSON.stringify(bad));
    }
  });
});

describe('normalizeStoredSettings：設定ファイルから読んだ値', () => {
  test('正しい項目はそのまま、おかしな項目は既定値、知らない項目は捨てる', () => {
    assert.deepEqual(
      normalizeStoredSettings({ durationMinutes: 90, hotkeyModifiers: 'Shift', hotkeyKey: 'K', unknown: 'x' }),
      { durationMinutes: 90, hotkeyModifiers: 'CommandOrControl+Shift', hotkeyKey: 'K' },
    );
  });

  test('壊れた値（null・配列・文字列・数）は既定値', () => {
    for (const broken of [null, undefined, [], 'text', 42]) {
      assert.deepEqual(normalizeStoredSettings(broken), DEFAULT_SETTINGS);
    }
  });
});

describe('ホットキーの表記', () => {
  test('Electron に登録する表記', () => {
    assert.equal(buildAccelerator(DEFAULT_SETTINGS), 'CommandOrControl+Shift+Y');
    assert.equal(buildAccelerator({ hotkeyModifiers: 'CommandOrControl+Alt+Shift', hotkeyKey: '1' }), 'CommandOrControl+Alt+Shift+1');
  });

  test('利用者に見せる表記：Windows は Ctrl・Alt、Mac は Cmd・Option', () => {
    assert.equal(formatHotkeyLabel(DEFAULT_SETTINGS, false), 'Ctrl+Shift+Y');
    assert.equal(formatHotkeyLabel(DEFAULT_SETTINGS, true), 'Cmd+Shift+Y');
    assert.equal(formatModifierLabel('CommandOrControl+Alt+Shift', false), 'Ctrl+Alt+Shift');
    assert.equal(formatModifierLabel('CommandOrControl+Alt+Shift', true), 'Cmd+Option+Shift');
  });
});

describe('コピーした文章を読み取るホットキー', () => {
  test('修飾キーは範囲キャプチャと同じで、キーは U', () => {
    assert.equal(CLIPBOARD_HOTKEY_KEY, 'U');
    assert.equal(buildClipboardAccelerator(DEFAULT_SETTINGS), 'CommandOrControl+Shift+U');
    assert.equal(buildClipboardAccelerator({ hotkeyModifiers: 'CommandOrControl+Alt', hotkeyKey: 'K' }), 'CommandOrControl+Alt+U');
    assert.equal(formatClipboardHotkeyLabel(DEFAULT_SETTINGS, false), 'Ctrl+Shift+U');
    assert.equal(formatClipboardHotkeyLabel(DEFAULT_SETTINGS, true), 'Cmd+Shift+U');
  });

  test('範囲キャプチャのキーに U は選べない（同じ組み合わせになるため）。保存されていた U は既定値に戻す', () => {
    assert.equal(HOTKEY_KEY_CHOICES.includes('U'), false);
    assert.equal(HOTKEY_KEY_CHOICES.length, 35);
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, hotkeyKey: 'U' }), SettingsError);
    assert.equal(normalizeStoredSettings({ ...DEFAULT_SETTINGS, hotkeyKey: 'U' }).hotkeyKey, DEFAULT_SETTINGS.hotkeyKey);
  });
});
