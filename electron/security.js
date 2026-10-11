/**
 * security.js
 * 目的：Electron のセキュリティ設定を1か所にまとめる（CLAUDE.md「Electron の必須設定」）。
 *
 * このファイルは electron を import しない（session や webContents を引数で受け取る）。
 * そのため、偽物のオブジェクトを渡して Node.js だけで単体テストできる。
 */

import { isAppUrl } from './appProtocol.js';

/**
 * すべてのウインドウに使う webPreferences（画面側の権限設定）。
 *   contextIsolation / sandbox：画面のコードを Node.js や Electron の内部から隔離する
 *   nodeIntegration 系：画面から Node.js の機能（ファイル操作など）を使えないようにする
 *   webSecurity / allowRunningInsecureContent：同一オリジンポリシーを有効にし、安全でない読み込みを禁止する
 *   webviewTag：別のページを埋め込む <webview> を禁止する
 *   spellcheck：スペルチェック辞書のダウンロード（外部通信）が起きないよう無効にする
 *   safeDialogs：alert などを連続表示させる嫌がらせを防ぐ
 *   navigateOnDragDrop：ファイルをドロップしたときにそのファイルへ移動しない
 */
export const SECURE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  spellcheck: false,
  safeDialogs: true,
  navigateOnDragDrop: false,
});

/**
 * 画面からの通信を遮断する URL の範囲。
 * このアプリの画面は外部と通信しない（要件§5.2：文面を外部に送らない）ため、すべて遮断する。
 * Googleカレンダーはメインプロセスから既定のブラウザで開くので、この遮断の影響を受けない。
 */
export const BLOCKED_URL_PATTERNS = Object.freeze(['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*']);

/**
 * セッション（画面の通信・権限の管理単位）にセキュリティ設定を適用する。
 *   - カメラ・マイク・通知・位置情報などの権限要求をすべて拒否する
 *   - 外部への通信をすべて遮断する
 *   - スペルチェック（辞書のダウンロード）を無効にする
 *
 * @param {Electron.Session} targetSession 対象のセッション（通常は session.defaultSession）
 */
export function applySessionSecurity(targetSession) {
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.webRequest.onBeforeRequest(
    { urls: [...BLOCKED_URL_PATTERNS] },
    (_details, callback) => callback({ cancel: true }),
  );
  targetSession.setSpellCheckerEnabled(false);
}

/**
 * 画面（webContents）が作られるたびに、ページの移動と新しいウインドウを制限する。
 *   - 新しいウインドウ（window.open、target="_blank" のリンク）はすべて拒否
 *   - app://bundle 以外へのページ移動・リダイレクトを拒否
 *   - <webview> の埋め込みを拒否
 *
 * @param {Electron.WebContents} contents 作られた画面
 */
export function hardenWebContents(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', preventExternalNavigation);
  contents.on('will-redirect', preventExternalNavigation);
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

/**
 * 移動先が app://bundle でなければ、移動を取り消す。
 *
 * @param {{url?: string, preventDefault: () => void}} event Electron のイベント（移動先の URL を持つ）
 * @param {string} [deprecatedUrl] 旧形式の引数で渡される移動先の URL（念のため参照する）
 */
function preventExternalNavigation(event, deprecatedUrl) {
  const targetUrl = event.url ?? deprecatedUrl;
  if (!isAppUrl(targetUrl)) {
    event.preventDefault();
  }
}
