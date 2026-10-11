/**
 * desktopIntegration.test.js
 * 目的：デスクトップのアイコンと自動起動の部品（electron/desktopIntegration.js）を確かめる。
 *       実際のデスクトップや ~/Library/LaunchAgents には書き込まず、一時フォルダに書き込んで確かめる。
 *       Mac の起動用スクリプトは、偽の Electron（受け取った引数を表示するだけ）を使って、実際に sh で動かす。
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { promisify } from 'node:util';
import {
  APP_DISPLAY_NAME,
  DesktopIntegrationError,
  WINDOWS_SHORTCUT_DESCRIPTION,
  HIDDEN_START_ARGUMENT,
  MAC_LAUNCHER_BUNDLE_ID,
  MAC_LAUNCHER_BUNDLE_NAME,
  MAC_LAUNCH_AGENT_FILE_NAME,
  assertSafeAbsolutePath,
  buildMacLaunchAgentPlist,
  buildMacLauncherScript,
  buildWindowsLoginItemSettings,
  buildWindowsShortcutOptions,
  createMacDesktopAlias,
  disableMacAutoStart,
  enableMacAutoStart,
  escapeXml,
  isMacAutoStartEnabled,
  isReplaceableWindowsShortcut,
  quoteForPosixShell,
  quoteWindowsArgument,
  writeMacLauncher,
} from '../electron/desktopIntegration.js';

/** 外部のコマンドを実行する（結果を待つ） */
const execFileAsync = promisify(execFile);

/** Mac でだけ動かすテスト（plutil を使う） */
const IS_MAC = process.platform === 'darwin';

/** POSIX の OS（Mac・Linux）でだけ動かすテスト（sh・シンボリックリンク・権限を使う） */
const IS_POSIX = process.platform !== 'win32';

/** 空白・日本語・一重引用符・$ を含む、わざと扱いにくいフォルダ名 */
const TRICKY_DIRECTORY_NAME = "レッスン it's $HOME";

/** テストで作った一時フォルダ（最後に消す） */
const temporaryDirectories = [];

/**
 * 空の一時フォルダを作る（名前に、わざと扱いにくい文字を含める）。
 *
 * @returns {Promise<string>}
 */
async function createTemporaryDirectory() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'calendar-add-app-desktop-'));
  temporaryDirectories.push(base);
  const directory = path.join(base, TRICKY_DIRECTORY_NAME);
  await mkdir(directory, { recursive: true });
  return directory;
}

after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('パスの確認とエスケープ', () => {
  test('制御文字（改行など）を含むパス・相対パス・空・文字列以外は断る', () => {
    for (const bad of ['', 'relative/path', '/tmp/a\nb', '/tmp/a\u0000b', null, 42]) {
      assert.throws(() => assertSafeAbsolutePath(bad, 'posix'), DesktopIntegrationError, String(bad));
    }
    assert.equal(assertSafeAbsolutePath('/Users/架空/レッスン', 'posix'), '/Users/架空/レッスン');
    assert.equal(assertSafeAbsolutePath('C:\\Users\\架空', 'win32'), 'C:\\Users\\架空');
    assert.equal(assertSafeAbsolutePath('\\\\fileserver\\share\\app', 'win32'), '\\\\fileserver\\share\\app');
    // Windows で「\folder」「/usr/bin」は、今のドライブによって場所が変わるため使わない
    for (const bad of ['/usr/bin', '\\folder', 'C:relative', 'app\\electron.exe']) {
      assert.throws(() => assertSafeAbsolutePath(bad, 'win32'), DesktopIntegrationError, bad);
    }
  });

  test('シェル用の囲み：sh に通すと元の文字列のまま（一重引用符・空白・$・日本語を含んでも）', { skip: !IS_POSIX }, async () => {
    const value = `/tmp/${TRICKY_DIRECTORY_NAME}/"x"\`date\``;
    const { stdout } = await execFileAsync('/bin/sh', ['-c', `printf '%s' ${quoteForPosixShell(value)}`]);
    assert.equal(stdout, value);
  });

  test('XML の特別な文字を置き換える', () => {
    assert.equal(escapeXml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
  });

  test('Windows の引数：空白を含んでも二重引用符で囲む。二重引用符・末尾の \\ は断る', () => {
    assert.equal(quoteWindowsArgument('C:\\Users\\架空 さん\\calender_add_app'), '"C:\\Users\\架空 さん\\calender_add_app"');
    assert.throws(() => quoteWindowsArgument('C:\\Users\\a"b'), DesktopIntegrationError);
    assert.throws(() => quoteWindowsArgument('C:\\Users\\app\\'), DesktopIntegrationError);
    assert.throws(() => quoteWindowsArgument('relative\\app'), DesktopIntegrationError);
  });
});

describe('Mac の起動用アプリ', () => {
  test('スクリプト：ELECTRON_RUN_AS_NODE を外し、Electron 本体でこのフォルダを開き、引数をそのまま渡す', () => {
    const script = buildMacLauncherScript({ electronPath: '/Apps/Electron', appPath: "/Users/架空/it's app" });
    assert.ok(script.startsWith('#!/bin/sh\n'));
    assert.match(script, /^unset ELECTRON_RUN_AS_NODE$/m);
    assert.match(script, /^exec '\/Apps\/Electron' '\/Users\/架空\/it'\\''s app' "\$@"$/m);
  });

  test('一時フォルダに作ると、Info.plist・実行できるスクリプト・アイコンができる（作り直しても使える）', { skip: !IS_POSIX }, async () => {
    const directory = await createTemporaryDirectory();
    const iconPath = path.join(directory, 'app.icns');
    await writeFile(iconPath, 'icon');
    const options = { launcherDir: path.join(directory, 'launcher'), electronPath: '/Apps/Electron', appPath: directory, iconPath };
    await writeMacLauncher(options);
    const bundlePath = await writeMacLauncher(options); // 2回目（作り直し）
    assert.equal(bundlePath, path.join(directory, 'launcher', MAC_LAUNCHER_BUNDLE_NAME));
    const executablePath = path.join(bundlePath, 'Contents', 'MacOS', 'launcher');
    assert.equal((await stat(executablePath)).mode & 0o777, 0o755);
    assert.equal(await readFile(path.join(bundlePath, 'Contents', 'Resources', 'app.icns'), 'utf8'), 'icon');
    const infoPlist = await readFile(path.join(bundlePath, 'Contents', 'Info.plist'), 'utf8');
    assert.ok(infoPlist.includes(`<string>${MAC_LAUNCHER_BUNDLE_ID}</string>`));
    assert.ok(infoPlist.includes(`<string>${APP_DISPLAY_NAME}</string>`));
    if (IS_MAC) {
      await execFileAsync('/usr/bin/plutil', ['-lint', path.join(bundlePath, 'Contents', 'Info.plist')]);
    }
  });

  test('スクリプトを実際に動かすと、Electron 本体に「このフォルダ」と引数が崩れずに渡る', { skip: !IS_POSIX }, async () => {
    const directory = await createTemporaryDirectory();
    // 偽の Electron：受け取った引数と ELECTRON_RUN_AS_NODE の状態を1行ずつ表示する
    const fakeElectronPath = path.join(directory, 'fake electron');
    await writeFile(fakeElectronPath, '#!/bin/sh\nprintf "%s\\n" "$@" "RUN_AS_NODE=${ELECTRON_RUN_AS_NODE-unset}"\n', { mode: 0o755 });
    const iconPath = path.join(directory, 'app.icns');
    await writeFile(iconPath, 'icon');
    const bundlePath = await writeMacLauncher({
      launcherDir: path.join(directory, 'launcher'),
      electronPath: fakeElectronPath,
      appPath: directory,
      iconPath,
    });
    const { stdout } = await execFileAsync(path.join(bundlePath, 'Contents', 'MacOS', 'launcher'), [HIDDEN_START_ARGUMENT], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    assert.deepEqual(stdout.split('\n').filter((line) => line !== ''), [directory, HIDDEN_START_ARGUMENT, 'RUN_AS_NODE=unset']);
  });
});

describe('Mac のデスクトップの分身（シンボリックリンク）', () => {
  test('起動用アプリへのシンボリックリンクを置く。前に作った分身は作り直す', { skip: !IS_POSIX }, async () => {
    const directory = await createTemporaryDirectory();
    const desktopDir = path.join(directory, 'Desktop');
    await mkdir(desktopDir);
    const firstTarget = path.join(directory, 'old', MAC_LAUNCHER_BUNDLE_NAME);
    const secondTarget = path.join(directory, 'new', MAC_LAUNCHER_BUNDLE_NAME);
    await createMacDesktopAlias({ desktopDir, launcherPath: firstTarget });
    const aliasPath = await createMacDesktopAlias({ desktopDir, launcherPath: secondTarget });
    assert.equal(aliasPath, path.join(desktopDir, MAC_LAUNCHER_BUNDLE_NAME));
    assert.ok((await lstat(aliasPath)).isSymbolicLink());
    assert.equal(await readlink(aliasPath), secondTarget);
  });

  test('同じ名前の利用者のファイル・フォルダがあれば、上書きせずに断る', { skip: !IS_POSIX }, async () => {
    const directory = await createTemporaryDirectory();
    const desktopDir = path.join(directory, 'Desktop');
    await mkdir(path.join(desktopDir, MAC_LAUNCHER_BUNDLE_NAME), { recursive: true });
    await writeFile(path.join(desktopDir, MAC_LAUNCHER_BUNDLE_NAME, 'mine.txt'), '利用者のファイル');
    await assert.rejects(
      createMacDesktopAlias({ desktopDir, launcherPath: path.join(directory, MAC_LAUNCHER_BUNDLE_NAME) }),
      DesktopIntegrationError,
    );
    assert.equal(await readFile(path.join(desktopDir, MAC_LAUNCHER_BUNDLE_NAME, 'mine.txt'), 'utf8'), '利用者のファイル');
  });
});

describe('Mac のログイン時の自動起動（LaunchAgent）', () => {
  test('plist：起動用アプリを --hidden 付きで開く。ログイン時に動き、画面のある通常のログインだけ', async () => {
    const launcherPath = `/Users/架空/${TRICKY_DIRECTORY_NAME}/launcher/${MAC_LAUNCHER_BUNDLE_NAME}`;
    const plist = buildMacLaunchAgentPlist({ launcherPath });
    assert.ok(plist.includes(`<string>/usr/bin/open</string>\n    <string>-a</string>\n    <string>${escapeXml(launcherPath)}</string>\n    <string>--args</string>\n    <string>${HIDDEN_START_ARGUMENT}</string>`));
    assert.ok(plist.includes('<key>RunAtLoad</key>\n  <true/>'));
    assert.ok(plist.includes('<string>Aqua</string>'));
    assert.ok(plist.includes('&apos;')); // パスの一重引用符を XML 用に置き換えている
  });

  test('オン → plist ができる（plutil で正しい形式）、オフ → 消える、オフを繰り返しても失敗しない', { skip: !IS_POSIX }, async () => {
    const directory = await createTemporaryDirectory();
    const launchAgentsDir = path.join(directory, 'LaunchAgents');
    const launcherPath = path.join(directory, MAC_LAUNCHER_BUNDLE_NAME);
    assert.equal(await isMacAutoStartEnabled({ launchAgentsDir, launcherPath }), false);
    const plistPath = await enableMacAutoStart({ launchAgentsDir, launcherPath });
    assert.equal(plistPath, path.join(launchAgentsDir, MAC_LAUNCH_AGENT_FILE_NAME));
    assert.equal(await isMacAutoStartEnabled({ launchAgentsDir, launcherPath }), true);
    if (IS_MAC) {
      await execFileAsync('/usr/bin/plutil', ['-lint', plistPath]);
    }
    await disableMacAutoStart({ launchAgentsDir });
    await disableMacAutoStart({ launchAgentsDir });
    assert.equal(await isMacAutoStartEnabled({ launchAgentsDir, launcherPath }), false);
  });

  test('プロジェクトのフォルダを移動したら（plist が古い場所を指す）、オフとみなす', { skip: !IS_POSIX }, async () => {
    const directory = await createTemporaryDirectory();
    const launchAgentsDir = path.join(directory, 'LaunchAgents');
    await enableMacAutoStart({ launchAgentsDir, launcherPath: path.join(directory, '古い場所', MAC_LAUNCHER_BUNDLE_NAME) });
    const movedLauncherPath = path.join(directory, '新しい場所', MAC_LAUNCHER_BUNDLE_NAME);
    assert.equal(await isMacAutoStartEnabled({ launchAgentsDir, launcherPath: movedLauncherPath }), false);
    await enableMacAutoStart({ launchAgentsDir, launcherPath: movedLauncherPath }); // オンにして保存し直すと今の場所で作り直す
    assert.equal(await isMacAutoStartEnabled({ launchAgentsDir, launcherPath: movedLauncherPath }), true);
  });
});

describe('Windows のデスクトップのショートカットとログイン時の起動', () => {
  const electronPath = 'C:\\Users\\架空\\calender_add_app\\node_modules\\electron\\dist\\electron.exe';
  const appPath = 'C:\\Users\\架空 さん\\calender_add_app';
  const iconPath = 'C:\\Users\\架空 さん\\calender_add_app\\assets\\icons\\app.ico';

  test('ショートカット：Electron 本体で、このフォルダ（二重引用符付き）を開く。アイコンは .ico', () => {
    assert.deepEqual(buildWindowsShortcutOptions({ electronPath, appPath, iconPath }), {
      target: electronPath,
      args: `"${appPath}"`,
      cwd: appPath,
      description: `${APP_DISPLAY_NAME}（文章の日時から Googleカレンダーの予定を作る）`,
      icon: iconPath,
      iconIndex: 0,
    });
  });

  test('ログイン時の起動：--hidden を付ける。確かめるときも同じ path・args を使う', () => {
    assert.deepEqual(buildWindowsLoginItemSettings({ electronPath, appPath, openAtLogin: true }), {
      path: electronPath,
      args: [`"${appPath}"`, HIDDEN_START_ARGUMENT],
      openAtLogin: true,
    });
    assert.deepEqual(buildWindowsLoginItemSettings({ electronPath, appPath }), { path: electronPath, args: [`"${appPath}"`, HIDDEN_START_ARGUMENT] });
  });

  test('使えないパスは断る', () => {
    assert.throws(() => buildWindowsShortcutOptions({ electronPath: 'electron.exe', appPath, iconPath }), DesktopIntegrationError);
    assert.throws(() => buildWindowsLoginItemSettings({ electronPath, appPath: 'C:\\a"b' }), DesktopIntegrationError);
  });
});

describe('Windows：同じ名前のショートカットの扱い', () => {
  test('このアプリが作ったショートカット（説明が同じ）だけ作り直してよい。利用者のもの・読めないものは上書きしない', () => {
    assert.equal(isReplaceableWindowsShortcut({ description: WINDOWS_SHORTCUT_DESCRIPTION, target: 'C:\\old\\electron.exe' }), true);
    assert.equal(isReplaceableWindowsShortcut({ description: '利用者が自分で作ったショートカット' }), false);
    assert.equal(isReplaceableWindowsShortcut({}), false);
    assert.equal(isReplaceableWindowsShortcut(null), false);
  });

  test('作るショートカットの説明は、見分けに使う説明と同じ', () => {
    const options = buildWindowsShortcutOptions({ electronPath: 'C:\\a\\electron.exe', appPath: 'C:\\a\\app', iconPath: 'C:\\a\\app.ico' });
    assert.equal(isReplaceableWindowsShortcut(options), true);
  });
});
