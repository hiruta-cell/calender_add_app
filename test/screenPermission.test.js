/**
 * screenPermission.test.js
 * 目的：画面収録の許可の案内（electron/screenPermission.js）が、起動元のアプリを正しく案内することを確かめる。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildScreenPermissionMessage, getScreenPermissionAppName } from '../electron/screenPermission.js';

describe('getScreenPermissionAppName：起動元のアプリの判別', () => {
  test('アプリの識別子から判別する（ターミナル・VSCode・iTerm・Electron）', () => {
    assert.equal(getScreenPermissionAppName({ __CFBundleIdentifier: 'com.apple.Terminal' }), 'ターミナル');
    assert.equal(getScreenPermissionAppName({ __CFBundleIdentifier: 'com.microsoft.VSCode' }), 'Visual Studio Code');
    assert.equal(getScreenPermissionAppName({ __CFBundleIdentifier: 'com.googlecode.iterm2' }), 'iTerm');
    assert.equal(getScreenPermissionAppName({ __CFBundleIdentifier: 'com.github.Electron' }), 'Electron');
  });

  test('デスクトップの起動用 .app（local.calendar-add-app.launcher）は「カレンダー登録ツール」と判別する', () => {
    assert.equal(getScreenPermissionAppName({ __CFBundleIdentifier: 'local.calendar-add-app.launcher' }), 'カレンダー登録ツール');
  });

  test('識別子がなければ TERM_PROGRAM から判別する', () => {
    assert.equal(getScreenPermissionAppName({ TERM_PROGRAM: 'Apple_Terminal' }), 'ターミナル');
    assert.equal(getScreenPermissionAppName({ TERM_PROGRAM: 'vscode' }), 'Visual Studio Code');
  });

  test('判別できなければ null（知らない識別子・__proto__ などは使わない）', () => {
    assert.equal(getScreenPermissionAppName({}), null);
    assert.equal(getScreenPermissionAppName({ __CFBundleIdentifier: 'com.example.unknown' }), null);
    assert.equal(getScreenPermissionAppName({ __CFBundleIdentifier: '__proto__', TERM_PROGRAM: 'constructor' }), null);
  });
});

describe('buildScreenPermissionMessage：案内文', () => {
  test('アプリの名前と、起動し直す対象を案内する', () => {
    const message = buildScreenPermissionMessage('Visual Studio Code');
    assert.match(message, /「Visual Studio Code」をオン/);
    assert.match(message, /Visual Studio Codeを終了して開き直して/);
  });

  test('判別できないときは「起動したアプリ（ターミナルなど）」と案内する', () => {
    assert.match(buildScreenPermissionMessage(null), /このアプリを起動したアプリ（ターミナルなど）/);
  });
});
