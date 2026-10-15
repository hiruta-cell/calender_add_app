/**
 * screenPermission.js
 * 目的：Mac で画面収録の許可がないときに、どのアプリを許可すればよいかを具体的に案内する。
 *
 * npm start で起動した場合、macOS は「起動に使ったアプリ」（ターミナル、Visual Studio Code など）に許可を求める。
 * そのため、起動元のアプリを環境変数（__CFBundleIdentifier、TERM_PROGRAM）から判別し、名前を案内に入れる。
 * このファイルは electron を import しない（単体テストできる）。
 */

/**
 * macOS のアプリの識別子と、「画面収録」の一覧に表示される名前の対応。
 * 'local.calendar-add-app.launcher' は デスクトップの起動用 .app（desktopIntegration.js の MAC_LAUNCHER_BUNDLE_ID と同じ値）。
 * デスクトップのアイコンから起動すると、macOS はこの .app を許可の対象にするため、ここに無いと案内が「ターミナル」になってしまう。
 */
const APP_NAMES_BY_BUNDLE_ID = Object.freeze({
  'com.apple.Terminal': 'ターミナル',
  'com.microsoft.VSCode': 'Visual Studio Code',
  'com.googlecode.iterm2': 'iTerm',
  'com.github.Electron': 'Electron',
  'local.calendar-add-app.launcher': 'カレンダー登録ツール',
});

/** ターミナルの種類（TERM_PROGRAM）と、アプリの名前の対応（識別子がないときに使う） */
const APP_NAMES_BY_TERM_PROGRAM = Object.freeze({
  Apple_Terminal: 'ターミナル',
  vscode: 'Visual Studio Code',
  'iTerm.app': 'iTerm',
});

/**
 * 画面収録の許可を求められるアプリの名前を、起動元の環境変数から判別する。
 *
 * @param {Record<string, string | undefined>} environment 環境変数（通常は process.env）
 * @returns {string | null} アプリの名前。判別できなければ null
 */
export function getScreenPermissionAppName(environment) {
  const bundleId = environment.__CFBundleIdentifier;
  if (typeof bundleId === 'string' && Object.hasOwn(APP_NAMES_BY_BUNDLE_ID, bundleId)) {
    return APP_NAMES_BY_BUNDLE_ID[bundleId];
  }
  const termProgram = environment.TERM_PROGRAM;
  if (typeof termProgram === 'string' && Object.hasOwn(APP_NAMES_BY_TERM_PROGRAM, termProgram)) {
    return APP_NAMES_BY_TERM_PROGRAM[termProgram];
  }
  return null;
}

/**
 * 画面収録の許可がないときの案内文を作る。
 * 許可はそのアプリを起動し直したあとに有効になるため、起動し直す対象も案内する。
 *
 * @param {string | null} appName 許可を求められるアプリの名前（判別できなければ null）
 * @returns {string}
 */
export function buildScreenPermissionMessage(appName) {
  const settingsPath = 'Mac の「システム設定」→「プライバシーとセキュリティ」→「画面収録とシステムオーディオ録音」';
  if (appName === null) {
    return `画面を取り込む許可がありません。${settingsPath}で、このアプリを起動したアプリ（ターミナルなど）をオンにし、そのアプリを終了して開き直してから、もう一度起動してください。${STALE_PERMISSION_HINT}`;
  }
  if (appName === 'Electron') {
    return `画面を取り込む許可がありません。${settingsPath}で「Electron」をオンにしてから、このアプリを終了して起動し直してください。${STALE_PERMISSION_HINT}`;
  }
  return `画面を取り込む許可がありません。${settingsPath}で「${appName}」をオンにし、${appName}を終了して開き直してから、もう一度このアプリを起動してください。${STALE_PERMISSION_HINT}`;
}

/**
 * 一覧でオンなのに許可が効かないときの直し方（案内文の最後に付ける）。
 * Electron は簡易署名（開発元の ID なし）のため、macOS は許可をその版のバイナリに結び付ける。
 * Electron の更新や起動用 .app の作り直しのあとは、一覧の表示はオンのままでも許可が効かなくなる（2026-10-15 依頼者の実機で発生）。
 */
const STALE_PERMISSION_HINT =
  'すでにオンになっているのに取り込めないとき（更新やアイコンの作り直しのあと）は、一覧のその項目を「−」で消し、「+」で追加し直してください。';
