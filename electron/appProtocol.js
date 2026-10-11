/**
 * appProtocol.js
 * 目的：画面ファイル（Vite のビルド結果）を、独自の app:// で配信する。
 *
 * なぜ file:// を使わないか：
 *   Electron 公式のセキュリティ指針で、file:// は読み込める範囲が広いため独自プロトコルが推奨されている。
 *   app:// なら「dist/renderer の中のファイルだけ」を配信し、応答に CSP（読み込み可能な範囲の制限）を付けられる。
 *
 * このファイルは electron を import しない（main.js から関数を受け渡す）。そのため Node.js だけで単体テストできる。
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getCaptureImageName } from './captureImageStore.js';

/** 独自プロトコルの名前（app://） */
export const APP_SCHEME = 'app';

/** 独自プロトコルのホスト名（app://bundle/...）。これ以外のホストは拒否する */
export const APP_HOST = 'bundle';

/** 画面の起点の URL */
export const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

/** 範囲選択の画面の URL */
export const OVERLAY_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/overlay.html`;

/**
 * 独自プロトコルに与える特権（protocol.registerSchemesAsPrivileged に渡す）。
 *   standard：通常の URL として相対パスを解決できるようにする
 *   secure：https と同じ「安全な通信元」として扱う
 * fetch API・CORS・Service Worker・CSP の回避（bypassCSP）などは与えない。
 */
export const APP_SCHEME_PRIVILEGES = Object.freeze({ standard: true, secure: true });

/**
 * 画面に適用する Content-Security-Policy。
 *   - 読み込めるのは app://bundle の中のスクリプト・CSS・画像・フォントだけ
 *   - 外部との通信（connect-src）、プラグイン（object-src）、フォーム送信、他ページへの埋め込みは禁止
 *   - インラインスクリプトと eval は禁止（'unsafe-inline' / 'unsafe-eval' を書かない）
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** 拡張子と Content-Type の対応表 */
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
});

/** 対応表にない拡張子の Content-Type（ブラウザに中身を推測させない） */
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** パスの指定がないときに返すファイル */
const INDEX_FILE_NAME = 'index.html';

/**
 * URL が app://bundle/ のページかどうかを調べる（外部ページへの移動を防ぐ判定に使う）。
 *
 * @param {string} url 調べる URL
 * @returns {boolean} app://bundle の URL なら true
 */
export function isAppUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === `${APP_SCHEME}:` && parsedUrl.host === APP_HOST;
  } catch {
    return false; // URL として解釈できないものは許可しない
  }
}

/**
 * app:// の URL を、配信するファイルのパスに変換する。
 * rootDir の外を指すもの（../ や %2f を使った指定、別ドライブの指定など）は null を返す（パストラバーサル対策）。
 *
 * @param {string} requestUrl 要求された URL
 * @param {string} rootDir 配信してよいフォルダ（dist/renderer の絶対パス）
 * @returns {string | null} ファイルの絶対パス。配信してはいけない場合は null
 */
export function resolveAssetPath(requestUrl, rootDir) {
  if (!isAppUrl(requestUrl)) {
    return null;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return null; // 不正な % エンコード
  }
  if (decodedPath.includes('\0')) {
    return null; // ヌル文字を含むパスは拒否する
  }

  const relativePath = decodedPath.replace(/^\/+/, '') || INDEX_FILE_NAME;
  const resolvedPath = path.resolve(rootDir, relativePath);

  // 解決後のパスが rootDir の中にあるかを確かめる
  const pathFromRoot = path.relative(rootDir, resolvedPath);
  if (pathFromRoot === '' || pathFromRoot.startsWith('..') || path.isAbsolute(pathFromRoot)) {
    return null;
  }
  return resolvedPath;
}

/**
 * ファイルの拡張子から Content-Type を決める。
 *
 * @param {string} filePath ファイルのパス
 * @returns {string}
 */
export function getContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return Object.hasOwn(CONTENT_TYPES, extension) ? CONTENT_TYPES[extension] : DEFAULT_CONTENT_TYPE;
}

/**
 * 本文のない応答を作る（エラー用）。
 *
 * @param {number} status HTTP ステータスコード
 * @returns {Response}
 */
function createEmptyResponse(status) {
  return new Response(null, { status, headers: { 'X-Content-Type-Options': 'nosniff' } });
}

/**
 * app:// への要求に応答する（protocol.handle に渡す処理）。
 * app://bundle/capture/〜 は、取り込んだ画像（メモリの中だけにある）を返す。
 *
 * @param {{url: string, method: string}} request 要求（Electron から渡される Request）
 * @param {string} rootDir 配信してよいフォルダ（dist/renderer の絶対パス）
 * @param {(name: string) => Buffer | null} [getCaptureImage] 取り込んだ画像を名前で取り出す関数
 * @returns {Promise<Response>}
 *   200：ファイルの内容（CSP などのセキュリティ用ヘッダー付き）
 *   404：rootDir の外・存在しない・フォルダ　／　405：GET 以外　／　500：読み込みに失敗
 */
export async function handleAppRequest(request, rootDir, getCaptureImage = () => null) {
  if (request.method !== 'GET') {
    return createEmptyResponse(405);
  }

  // 取り込んだ画像（決めた名前のものだけ。ファイルには保存していない）
  const captureImageName = isAppUrl(request.url) ? getCaptureImageName(request.url) : null;
  if (captureImageName !== null) {
    const image = getCaptureImage(captureImageName);
    if (image === null) {
      return createEmptyResponse(404);
    }
    return new Response(image, {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPES['.png'],
        'Content-Security-Policy': CONTENT_SECURITY_POLICY,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  }

  const filePath = resolveAssetPath(request.url, rootDir);
  if (filePath === null) {
    return createEmptyResponse(404);
  }

  try {
    const body = await readFile(filePath);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': getContentType(filePath),
        'Content-Security-Policy': CONTENT_SECURITY_POLICY,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const isNotFound = ['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error?.code);
    return createEmptyResponse(isNotFound ? 404 : 500);
  }
}
