/**
 * desktopIntegration.js
 * 目的：デスクトップのアイコンと、ログイン時の自動起動を作る・消すための部品（要件§12：G7・G8）。
 *
 * npm 起動のまま（パッケージ化しない：要件§7）で実現する：
 *   - Windows：デスクトップにショートカット（.lnk）を作り、Electron 本体でこのフォルダを開く。
 *              自動起動は Electron の標準機能（ログイン項目）で、--hidden を付けて起動する。
 *   - Mac：プロジェクトの launcher/ に起動用の小さなアプリを作り、デスクトップにはその分身（シンボリックリンク）を置く。
 *          自動起動は LaunchAgent（~/Library/LaunchAgents。macOS 標準）で、起動用のアプリを --hidden 付きで開く。
 *          起動用のアプリを1つにまとめるのは、どこから起動しても画面収録の許可の対象をそろえるため。
 *
 * セキュリティ：
 *   - 書き込むのは、渡された決まったフォルダの、決まった名前のファイルだけ（フォルダは main.js が Electron から受け取る）。
 *   - 起動用のスクリプト・plist・ショートカットに入れるパスは、絶対パスで改行などの制御文字がないことを確かめ、
 *     シェル用・XML 用・Windows のコマンドライン用に、それぞれ正しく囲む（空白や日本語のパスでも安全に動くように）。
 *   - デスクトップに同じ名前の利用者のファイル（自分が作った分身でないもの）があれば、上書きしない。
 *
 * このファイルは electron を import しない。単体テストでは一時フォルダに書き込んで確かめる。
 */

import { chmod, copyFile, lstat, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** デスクトップのアイコンと起動用のアプリの名前（確認ウインドウの見出しと同じ） */
export const APP_DISPLAY_NAME = 'カレンダー登録ツール';

/** ウインドウを出さずに起動する（トレイに常駐するだけ）ための引数。自動起動のときに付ける（要件§12） */
export const HIDDEN_START_ARGUMENT = '--hidden';

/** Mac の起動用のアプリのフォルダ名 */
export const MAC_LAUNCHER_BUNDLE_NAME = `${APP_DISPLAY_NAME}.app`;

/** Mac の起動用のアプリの識別子（実在の組織と紛らわしくないよう local. で始める） */
export const MAC_LAUNCHER_BUNDLE_ID = 'local.calendar-add-app.launcher';

/** Mac の起動用のアプリの中で実際に動くスクリプトの名前 */
const MAC_LAUNCHER_EXECUTABLE_NAME = 'launcher';

/** Mac の起動用のアプリのアイコンのファイル名 */
const MAC_ICON_FILE_NAME = 'app.icns';

/** Mac の LaunchAgent の名前（ファイル名は この名前.plist） */
export const MAC_LAUNCH_AGENT_LABEL = 'local.calendar-add-app';

/** Mac の LaunchAgent のファイル名 */
export const MAC_LAUNCH_AGENT_FILE_NAME = `${MAC_LAUNCH_AGENT_LABEL}.plist`;

/** Mac でアプリを開く macOS 標準のコマンド */
const MAC_OPEN_COMMAND = '/usr/bin/open';

/** Windows のデスクトップのショートカットのファイル名 */
export const WINDOWS_SHORTCUT_FILE_NAME = `${APP_DISPLAY_NAME}.lnk`;

/** Windows のショートカットの説明。このアプリが作ったショートカットかの見分けにも使う */
export const WINDOWS_SHORTCUT_DESCRIPTION = `${APP_DISPLAY_NAME}（文章の日時から Googleカレンダーの予定を作る）`;

/** 起動用のスクリプトの権限（本人が実行できる。ほかの人は読むだけ） */
const EXECUTABLE_FILE_MODE = 0o755;

/** plist の権限 */
const READABLE_FILE_MODE = 0o644;

/** 改行などの制御文字（パスに入っていたら断る。スクリプトや plist の行を壊さないため） */
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * Windows の完全なパス：ドライブ名（C:\）か、ネットワークの場所（\\サーバー名）から始まるもの。
 * 「\folder」のような、今のドライブによって場所が変わるパスは使わない。
 */
const WINDOWS_FULL_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/])/;

/** アイコン・自動起動を作れなかったときのエラー（利用者向けの文付き。パスなどの個人の情報は文に含めない） */
export class DesktopIntegrationError extends Error {
  /**
   * @param {string} message 利用者に見せる文
   */
  constructor(message) {
    super(message);
    this.name = 'DesktopIntegrationError';
  }
}

/**
 * パスが、制御文字を含まない絶対パスかを確かめる（Windows は、ドライブ名などから始まる完全なパスに限る）。
 *
 * @param {unknown} value 確かめるパス
 * @param {'posix' | 'win32'} style パスの形式（Mac は posix、Windows は win32）
 * @returns {string} 確かめたパス
 * @throws {DesktopIntegrationError} 使えないパスの場合
 */
export function assertSafeAbsolutePath(value, style) {
  if (typeof value !== 'string' || value === '' || CONTROL_CHARACTER_PATTERN.test(value)) {
    throw new DesktopIntegrationError('アプリの場所を確認できませんでした。');
  }
  const isAbsolute = style === 'win32' ? WINDOWS_FULL_PATH_PATTERN.test(value) : path.posix.isAbsolute(value);
  if (!isAbsolute) {
    throw new DesktopIntegrationError('アプリの場所を確認できませんでした。');
  }
  return value;
}

/**
 * 文字列を、シェル（sh）の引数として安全に使えるように一重引用符で囲む。
 * 中の一重引用符は '\'' に置き換える（引用符の中では、ほかの記号は特別な意味を持たない）。
 *
 * @param {string} value
 * @returns {string} 例：it's → 'it'\''s'
 */
export function quoteForPosixShell(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * 文字列を、XML（plist）の中に安全に書けるようにする。
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Windows のコマンドラインの引数として、パスを二重引用符で囲む。
 * Windows のパスには二重引用符を使えないため、含まれていたら断る。末尾の \ は閉じる引用符を壊すため断る。
 *
 * @param {string} value 絶対パス
 * @returns {string} 例："C:\Users\me\calender_add_app"
 * @throws {DesktopIntegrationError} 囲めないパスの場合
 */
export function quoteWindowsArgument(value) {
  assertSafeAbsolutePath(value, 'win32');
  if (value.includes('"') || value.endsWith('\\')) {
    throw new DesktopIntegrationError('アプリの場所を確認できませんでした。');
  }
  return `"${value}"`;
}

/**
 * Mac の起動用のアプリの中で動くスクリプトを作る。Electron 本体で、このアプリのフォルダを開く。
 *
 * @param {{electronPath: string, appPath: string}} paths Electron 本体と、このアプリのフォルダ（どちらも絶対パス）
 * @returns {string} スクリプトの内容
 */
export function buildMacLauncherScript({ electronPath, appPath }) {
  assertSafeAbsolutePath(electronPath, 'posix');
  assertSafeAbsolutePath(appPath, 'posix');
  return [
    '#!/bin/sh',
    `# ${APP_DISPLAY_NAME} の起動用（設定画面の「デスクトップにアイコンを作る」などで作成）。`,
    '# Electron 本体で、このアプリのフォルダを開く。引数（--hidden など）はそのまま渡す。',
    'unset ELECTRON_RUN_AS_NODE',
    `exec ${quoteForPosixShell(electronPath)} ${quoteForPosixShell(appPath)} "$@"`,
    '',
  ].join('\n');
}

/**
 * Mac の起動用のアプリの情報（Info.plist）を作る。
 *
 * @returns {string} plist の内容
 */
export function buildMacInfoPlist() {
  const entries = [
    ['CFBundleDevelopmentRegion', 'ja'],
    ['CFBundleDisplayName', APP_DISPLAY_NAME],
    ['CFBundleExecutable', MAC_LAUNCHER_EXECUTABLE_NAME],
    ['CFBundleIconFile', MAC_ICON_FILE_NAME],
    ['CFBundleIdentifier', MAC_LAUNCHER_BUNDLE_ID],
    ['CFBundleInfoDictionaryVersion', '6.0'],
    ['CFBundleName', APP_DISPLAY_NAME],
    ['CFBundlePackageType', 'APPL'],
    ['CFBundleShortVersionString', '1.0'],
    ['CFBundleVersion', '1'],
  ];
  return buildPlist(entries.map(([key, value]) => `  <key>${key}</key>\n  <string>${escapeXml(value)}</string>`).join('\n'));
}

/**
 * Mac の LaunchAgent（ログイン時の自動起動）の plist を作る。起動用のアプリを --hidden 付きで開く。
 *
 * @param {{launcherPath: string}} options 起動用のアプリの絶対パス
 * @returns {string} plist の内容
 */
export function buildMacLaunchAgentPlist({ launcherPath }) {
  assertSafeAbsolutePath(launcherPath, 'posix');
  const programArguments = [MAC_OPEN_COMMAND, '-a', launcherPath, '--args', HIDDEN_START_ARGUMENT]
    .map((argument) => `    <string>${escapeXml(argument)}</string>`)
    .join('\n');
  return buildPlist(
    [
      `  <key>Label</key>\n  <string>${MAC_LAUNCH_AGENT_LABEL}</string>`,
      `  <key>ProgramArguments</key>\n  <array>\n${programArguments}\n  </array>`,
      '  <key>RunAtLoad</key>\n  <true/>',
      // 画面のある通常のログインのときだけ動かす（画面のない接続では起動しない）
      '  <key>LimitLoadToSessionType</key>\n  <string>Aqua</string>',
    ].join('\n'),
  );
}

/**
 * plist の外側（XML の宣言と dict）を付ける。
 *
 * @param {string} dictBody dict の中身
 * @returns {string}
 */
function buildPlist(dictBody) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    dictBody,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/**
 * Mac の起動用のアプリを作る（あれば、今のパスを指すように書き直す）。
 * 起動中のアプリを壊さないよう、フォルダは消さずにファイルだけを書き直す。
 *
 * @param {{launcherDir: string, electronPath: string, appPath: string, iconPath: string}} options
 *   launcherDir：起動用のアプリを置くフォルダ（プロジェクトの launcher/）、electronPath：Electron 本体、
 *   appPath：このアプリのフォルダ、iconPath：アイコン（.icns）
 * @returns {Promise<string>} 起動用のアプリのパス
 */
export async function writeMacLauncher({ launcherDir, electronPath, appPath, iconPath }) {
  assertSafeAbsolutePath(launcherDir, 'posix');
  assertSafeAbsolutePath(iconPath, 'posix');
  const script = buildMacLauncherScript({ electronPath, appPath });
  const bundlePath = path.join(launcherDir, MAC_LAUNCHER_BUNDLE_NAME);
  const contentsDir = path.join(bundlePath, 'Contents');
  const executablePath = path.join(contentsDir, 'MacOS', MAC_LAUNCHER_EXECUTABLE_NAME);

  await mkdir(path.join(contentsDir, 'MacOS'), { recursive: true });
  await mkdir(path.join(contentsDir, 'Resources'), { recursive: true });
  await writeFile(path.join(contentsDir, 'Info.plist'), buildMacInfoPlist(), { mode: READABLE_FILE_MODE });
  await writeFile(executablePath, script, { mode: EXECUTABLE_FILE_MODE });
  await chmod(executablePath, EXECUTABLE_FILE_MODE); // 既にあったファイルにも実行の権限を付ける
  await copyFile(iconPath, path.join(contentsDir, 'Resources', MAC_ICON_FILE_NAME));
  return bundlePath;
}

/**
 * Mac のデスクトップに、起動用のアプリの分身（シンボリックリンク）を置く。
 * 前に作った分身は作り直す。同じ名前の利用者のファイル・フォルダがあれば、上書きせずに断る。
 *
 * @param {{desktopDir: string, launcherPath: string}} options デスクトップのフォルダと、起動用のアプリのパス
 * @returns {Promise<string>} デスクトップに置いた分身のパス
 * @throws {DesktopIntegrationError} 同じ名前のものがある場合
 */
export async function createMacDesktopAlias({ desktopDir, launcherPath }) {
  assertSafeAbsolutePath(desktopDir, 'posix');
  assertSafeAbsolutePath(launcherPath, 'posix');
  const aliasPath = path.join(desktopDir, MAC_LAUNCHER_BUNDLE_NAME);
  const existing = await lstat(aliasPath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing !== null) {
    if (!existing.isSymbolicLink()) {
      throw new DesktopIntegrationError(`デスクトップに「${MAC_LAUNCHER_BUNDLE_NAME}」という名前のものが既にあるため、アイコンを作れませんでした。`);
    }
    await unlink(aliasPath); // 前に作った分身を作り直す
  }
  await symlink(launcherPath, aliasPath);
  return aliasPath;
}

/**
 * Mac のログイン時の自動起動をオンにする（LaunchAgent の plist を置く）。
 *
 * @param {{launchAgentsDir: string, launcherPath: string}} options LaunchAgents のフォルダと、起動用のアプリのパス
 * @returns {Promise<string>} 置いた plist のパス
 */
export async function enableMacAutoStart({ launchAgentsDir, launcherPath }) {
  assertSafeAbsolutePath(launchAgentsDir, 'posix');
  const plistPath = path.join(launchAgentsDir, MAC_LAUNCH_AGENT_FILE_NAME);
  const content = buildMacLaunchAgentPlist({ launcherPath });
  await mkdir(launchAgentsDir, { recursive: true });
  await writeFile(plistPath, content, { mode: READABLE_FILE_MODE });
  return plistPath;
}

/**
 * Mac のログイン時の自動起動をオフにする（自分の LaunchAgent の plist だけを消す。なければ何もしない）。
 *
 * @param {{launchAgentsDir: string}} options LaunchAgents のフォルダ
 * @returns {Promise<void>}
 */
export async function disableMacAutoStart({ launchAgentsDir }) {
  assertSafeAbsolutePath(launchAgentsDir, 'posix');
  await rm(path.join(launchAgentsDir, MAC_LAUNCH_AGENT_FILE_NAME), { force: true });
}

/**
 * Mac のログイン時の自動起動がオンか。自分の LaunchAgent の plist が、今の場所の起動用アプリを指しているときだけオンとみなす。
 * プロジェクトのフォルダを移動すると plist は古い場所を指したまま（ログインしても起動しない）になるため、そのときはオフと表示し、
 * 利用者がオンにして保存すれば今の場所で作り直される（オフのまま保存すれば古い plist は消える。settingsIpc.js の handleSave）。
 *
 * @param {{launchAgentsDir: string, launcherPath: string}} options LaunchAgents のフォルダと、今の起動用のアプリのパス
 * @returns {Promise<boolean>}
 */
export async function isMacAutoStartEnabled({ launchAgentsDir, launcherPath }) {
  assertSafeAbsolutePath(launchAgentsDir, 'posix');
  const content = await readFile(path.join(launchAgentsDir, MAC_LAUNCH_AGENT_FILE_NAME), 'utf8').catch(() => null);
  return content !== null && content === buildMacLaunchAgentPlist({ launcherPath });
}

/**
 * Windows のデスクトップのショートカットの内容を作る（shell.writeShortcutLink に渡す）。
 *
 * @param {{electronPath: string, appPath: string, iconPath: string}} paths Electron 本体・このアプリのフォルダ・アイコン（.ico）
 * @returns {{target: string, args: string, cwd: string, description: string, icon: string, iconIndex: number}}
 */
export function buildWindowsShortcutOptions({ electronPath, appPath, iconPath }) {
  return {
    target: assertSafeAbsolutePath(electronPath, 'win32'),
    args: quoteWindowsArgument(appPath),
    cwd: assertSafeAbsolutePath(appPath, 'win32'),
    description: WINDOWS_SHORTCUT_DESCRIPTION,
    icon: assertSafeAbsolutePath(iconPath, 'win32'),
    iconIndex: 0,
  };
}

/**
 * デスクトップに同じ名前のショートカットがあるとき、作り直してよいか（このアプリが前に作ったものだけ作り直す）。
 * 利用者が自分で置いた同じ名前のショートカットは上書きしない（Mac の createMacDesktopAlias と同じ考え方）。
 *
 * @param {{description?: string} | null} existingShortcut shell.readShortcutLink で読んだ内容。ない・読めないときは null
 * @returns {boolean} 作り直してよければ true
 */
export function isReplaceableWindowsShortcut(existingShortcut) {
  return existingShortcut !== null && existingShortcut.description === WINDOWS_SHORTCUT_DESCRIPTION;
}

/**
 * Windows のログイン時の自動起動の設定を作る（app.setLoginItemSettings・getLoginItemSettings に渡す）。
 * 確かめるときも、登録したときと同じ path・args を渡す必要がある。
 *
 * @param {{electronPath: string, appPath: string, openAtLogin?: boolean}} options
 * @returns {{path: string, args: string[], openAtLogin?: boolean}}
 */
export function buildWindowsLoginItemSettings({ electronPath, appPath, openAtLogin }) {
  const settings = {
    path: assertSafeAbsolutePath(electronPath, 'win32'),
    args: [quoteWindowsArgument(appPath), HIDDEN_START_ARGUMENT],
  };
  return openAtLogin === undefined ? settings : { ...settings, openAtLogin };
}
