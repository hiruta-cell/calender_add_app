/**
 * electronSecurity.test.js
 * 目的：Electron のセキュリティ設定（electron/security.js、electron/appProtocol.js）が
 *       CLAUDE.md の方針どおりであることを確かめる。設定を誤って緩めた場合に、このテストが失敗する。
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  APP_ENTRY_URL,
  APP_SCHEME_PRIVILEGES,
  CONTENT_SECURITY_POLICY,
  getContentType,
  handleAppRequest,
  isAppUrl,
  resolveAssetPath,
} from '../electron/appProtocol.js';
import {
  BLOCKED_URL_PATTERNS,
  SECURE_WEB_PREFERENCES,
  applySessionSecurity,
  hardenWebContents,
} from '../electron/security.js';

/** テスト用の配信フォルダ（test/fixtures/renderer） */
const FIXTURE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'renderer');

/**
 * パスが配信フォルダの中にあるかを調べる。
 * @param {string} filePath
 */
function isInsideRoot(filePath) {
  const pathFromRoot = path.relative(FIXTURE_ROOT, filePath);
  return pathFromRoot !== '' && !pathFromRoot.startsWith('..') && !path.isAbsolute(pathFromRoot);
}

describe('webPreferences（画面の権限設定）', () => {
  test('隔離・サンドボックスが有効で、Node.js の機能は画面から使えない', () => {
    assert.equal(SECURE_WEB_PREFERENCES.contextIsolation, true);
    assert.equal(SECURE_WEB_PREFERENCES.sandbox, true);
    assert.equal(SECURE_WEB_PREFERENCES.nodeIntegration, false);
    assert.equal(SECURE_WEB_PREFERENCES.nodeIntegrationInWorker, false);
    assert.equal(SECURE_WEB_PREFERENCES.nodeIntegrationInSubFrames, false);
  });

  test('Web のセキュリティ機能が有効で、危険な機能は無効', () => {
    assert.equal(SECURE_WEB_PREFERENCES.webSecurity, true);
    assert.equal(SECURE_WEB_PREFERENCES.allowRunningInsecureContent, false);
    assert.equal(SECURE_WEB_PREFERENCES.webviewTag, false);
    assert.equal(SECURE_WEB_PREFERENCES.spellcheck, false);
    assert.equal(SECURE_WEB_PREFERENCES.navigateOnDragDrop, false);
  });

  test('設定は書き換えられない（凍結されている）', () => {
    assert.equal(Object.isFrozen(SECURE_WEB_PREFERENCES), true);
  });
});

describe('Content-Security-Policy', () => {
  /** CSP を「項目名 → 値」の対応表にする */
  const directives = Object.fromEntries(
    CONTENT_SECURITY_POLICY.split(';').map((directive) => {
      const [name, ...values] = directive.trim().split(/\s+/);
      return [name, values.join(' ')];
    }),
  );

  test('既定はすべて禁止し、自分自身（app://bundle）のファイルだけを許可する', () => {
    assert.equal(directives['default-src'], "'none'");
    assert.equal(directives['script-src'], "'self'");
    assert.equal(directives['style-src'], "'self'");
  });

  test('外部との通信・プラグイン・フォーム送信・埋め込みを禁止する', () => {
    assert.equal(directives['connect-src'], "'none'");
    assert.equal(directives['object-src'], "'none'");
    assert.equal(directives['form-action'], "'none'");
    assert.equal(directives['frame-ancestors'], "'none'");
    assert.equal(directives['base-uri'], "'none'");
  });

  test('インラインスクリプト・eval・外部の読み込みを許可していない', () => {
    for (const forbidden of ['unsafe-inline', 'unsafe-eval', 'unsafe-hashes', 'http:', 'https:', 'data:', '*']) {
      assert.equal(CONTENT_SECURITY_POLICY.includes(forbidden), false, `${forbidden} を含んではいけない`);
    }
  });
});

describe('app:// の特権', () => {
  test('CSP の回避・fetch・CORS・Service Worker の特権を与えていない', () => {
    assert.deepEqual({ ...APP_SCHEME_PRIVILEGES }, { standard: true, secure: true });
  });
});

describe('isAppUrl：移動してよいページの判定', () => {
  test('app://bundle のページだけを許可する', () => {
    assert.equal(isAppUrl(APP_ENTRY_URL), true);
    assert.equal(isAppUrl('app://bundle/assets/index.js'), true);
  });

  test('外部のページ・ファイル・別のホストは許可しない', () => {
    for (const url of [
      'https://example.com/',
      'http://bundle/index.html',
      'file:///etc/passwd',
      'app://evil/index.html',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'not a url',
      '',
    ]) {
      assert.equal(isAppUrl(url), false, url);
    }
  });
});

describe('resolveAssetPath：配信フォルダの外を読ませない（パストラバーサル対策）', () => {
  test('通常のファイルは配信フォルダの中のパスになる', () => {
    assert.equal(resolveAssetPath(APP_ENTRY_URL, FIXTURE_ROOT), path.join(FIXTURE_ROOT, 'index.html'));
    assert.equal(
      resolveAssetPath('app://bundle/assets/app.js', FIXTURE_ROOT),
      path.join(FIXTURE_ROOT, 'assets', 'app.js'),
    );
  });

  test('パスの指定がなければ index.html', () => {
    assert.equal(resolveAssetPath('app://bundle/', FIXTURE_ROOT), path.join(FIXTURE_ROOT, 'index.html'));
    assert.equal(resolveAssetPath('app://bundle', FIXTURE_ROOT), path.join(FIXTURE_ROOT, 'index.html'));
  });

  test('外を指す指定は null（エンコードした ../ や \\、ヌル文字、不正なエンコードも含む）', () => {
    for (const url of [
      'app://bundle/..%2foutside-secret.txt',
      'app://bundle/..%2F..%2Fpackage.json',
      'app://bundle/%2e%2e%2foutside-secret.txt',
      'app://bundle/assets/..%2f..%2foutside-secret.txt',
      'app://bundle/index.html%00.js',
      'app://bundle/%E0%A4%A',
      'app://evil/index.html',
      'https://bundle/index.html',
      'file:///etc/passwd',
    ]) {
      assert.equal(resolveAssetPath(url, FIXTURE_ROOT), null, url);
    }
  });

  test('どんな指定でも、結果は null か配信フォルダの中のパスだけ', () => {
    const attempts = [
      'app://bundle/../outside-secret.txt',
      'app://bundle/%2e%2e/outside-secret.txt',
      'app://bundle/..%5coutside-secret.txt',
      'app://bundle/....//outside-secret.txt',
      'app://bundle//etc/passwd',
      'app://bundle/C:%5cWindows%5cwin.ini',
      'app://bundle/%2fetc%2fpasswd',
    ];
    for (const url of attempts) {
      const resolved = resolveAssetPath(url, FIXTURE_ROOT);
      assert.ok(resolved === null || isInsideRoot(resolved), `${url} → ${resolved}`);
    }
  });
});

describe('handleAppRequest：app:// の応答', () => {
  test('index.html を CSP などのヘッダー付きで返す', async () => {
    const response = await handleAppRequest({ url: APP_ENTRY_URL, method: 'GET' }, FIXTURE_ROOT);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
    assert.equal(response.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(await response.text(), /fixture/);
  });

  test('JavaScript は text/javascript で返す', async () => {
    const response = await handleAppRequest({ url: 'app://bundle/assets/app.js', method: 'GET' }, FIXTURE_ROOT);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/javascript; charset=utf-8');
  });

  test('配信フォルダの外のファイルは 404（中身を返さない）', async () => {
    const response = await handleAppRequest(
      { url: 'app://bundle/..%2foutside-secret.txt', method: 'GET' },
      FIXTURE_ROOT,
    );
    assert.equal(response.status, 404);
    assert.equal(await response.text(), '');
  });

  test('存在しないファイル・フォルダは 404、GET 以外は 405', async () => {
    assert.equal((await handleAppRequest({ url: 'app://bundle/nothing.js', method: 'GET' }, FIXTURE_ROOT)).status, 404);
    assert.equal((await handleAppRequest({ url: 'app://bundle/assets', method: 'GET' }, FIXTURE_ROOT)).status, 404);
    assert.equal((await handleAppRequest({ url: APP_ENTRY_URL, method: 'POST' }, FIXTURE_ROOT)).status, 405);
  });

  test('取り込んだ画像（メモリの中）は app://bundle/capture/〜 で返す。なければ 404、決めた名前以外は配信しない', async () => {
    const image = Buffer.from('fake-png');
    const getCaptureImage = (name) => (name === 'selection.png' ? image : null);
    const found = await handleAppRequest({ url: 'app://bundle/capture/selection.png?v=2', method: 'GET' }, FIXTURE_ROOT, getCaptureImage);
    assert.equal(found.status, 200);
    assert.equal(found.headers.get('Content-Type'), 'image/png');
    assert.equal(found.headers.get('Cache-Control'), 'no-store');
    assert.equal(found.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
    assert.equal(Buffer.from(await found.arrayBuffer()).toString(), 'fake-png');
    assert.equal((await handleAppRequest({ url: 'app://bundle/capture/screenshot.png', method: 'GET' }, FIXTURE_ROOT, getCaptureImage)).status, 404);
    assert.equal((await handleAppRequest({ url: 'app://bundle/capture/other.png', method: 'GET' }, FIXTURE_ROOT, getCaptureImage)).status, 404);
    assert.equal((await handleAppRequest({ url: 'app://evil/capture/selection.png', method: 'GET' }, FIXTURE_ROOT, getCaptureImage)).status, 404);
  });

  test('拡張子が不明なファイルは、中身を推測させない形式にする', () => {
    assert.equal(getContentType('/x/file.unknown'), 'application/octet-stream');
    assert.equal(getContentType('/x/FILE.JS'), 'text/javascript; charset=utf-8');
  });
});

describe('applySessionSecurity：権限要求の拒否と外部通信の遮断', () => {
  /** Electron の session の代わりに使う偽物。登録された処理を記録する */
  function createFakeSession() {
    const fake = {
      requestHandler: null,
      checkHandler: null,
      blockFilter: null,
      blockListener: null,
      spellCheckerEnabled: true,
      setPermissionRequestHandler(handler) {
        fake.requestHandler = handler;
      },
      setPermissionCheckHandler(handler) {
        fake.checkHandler = handler;
      },
      setSpellCheckerEnabled(enabled) {
        fake.spellCheckerEnabled = enabled;
      },
      webRequest: {
        onBeforeRequest(filter, listener) {
          fake.blockFilter = filter;
          fake.blockListener = listener;
        },
      },
    };
    return fake;
  }

  test('カメラ・マイク・通知などの権限要求をすべて拒否する', () => {
    const fakeSession = createFakeSession();
    applySessionSecurity(fakeSession);
    for (const permission of ['media', 'notifications', 'geolocation', 'clipboard-read', 'display-capture']) {
      let granted = null;
      fakeSession.requestHandler(null, permission, (result) => {
        granted = result;
      });
      assert.equal(granted, false, permission);
      assert.equal(fakeSession.checkHandler(null, permission), false, permission);
    }
  });

  test('http / https / ws / wss の通信をすべて取り消す', () => {
    const fakeSession = createFakeSession();
    applySessionSecurity(fakeSession);
    assert.deepEqual(fakeSession.blockFilter.urls, [...BLOCKED_URL_PATTERNS]);
    let decision = null;
    fakeSession.blockListener({ url: 'https://example.com/' }, (result) => {
      decision = result;
    });
    assert.deepEqual(decision, { cancel: true });
  });

  test('スペルチェック（辞書のダウンロード）を無効にする', () => {
    const fakeSession = createFakeSession();
    applySessionSecurity(fakeSession);
    assert.equal(fakeSession.spellCheckerEnabled, false);
  });
});

describe('hardenWebContents：ページ移動と新しいウインドウの制限', () => {
  /** Electron の webContents の代わりに使う偽物 */
  function createFakeContents() {
    const fake = {
      windowOpenHandler: null,
      listeners: {},
      setWindowOpenHandler(handler) {
        fake.windowOpenHandler = handler;
      },
      on(eventName, listener) {
        fake.listeners[eventName] = listener;
      },
    };
    return fake;
  }

  /** preventDefault が呼ばれたかを記録するイベントの偽物 */
  function createFakeEvent(url) {
    return {
      url,
      prevented: false,
      preventDefault() {
        this.prevented = true;
      },
    };
  }

  test('新しいウインドウはすべて拒否する', () => {
    const fakeContents = createFakeContents();
    hardenWebContents(fakeContents);
    assert.deepEqual(fakeContents.windowOpenHandler({ url: 'https://example.com/' }), { action: 'deny' });
    assert.deepEqual(fakeContents.windowOpenHandler({ url: APP_ENTRY_URL }), { action: 'deny' });
  });

  test('外部へのページ移動・リダイレクトを取り消し、app://bundle への移動は許可する', () => {
    const fakeContents = createFakeContents();
    hardenWebContents(fakeContents);
    for (const eventName of ['will-navigate', 'will-redirect']) {
      const externalEvent = createFakeEvent('https://example.com/');
      fakeContents.listeners[eventName](externalEvent);
      assert.equal(externalEvent.prevented, true, eventName);

      const fileEvent = createFakeEvent('file:///etc/passwd');
      fakeContents.listeners[eventName](fileEvent);
      assert.equal(fileEvent.prevented, true, eventName);

      const appEvent = createFakeEvent(APP_ENTRY_URL);
      fakeContents.listeners[eventName](appEvent);
      assert.equal(appEvent.prevented, false, eventName);
    }
  });

  test('<webview> の埋め込みを取り消す', () => {
    const fakeContents = createFakeContents();
    hardenWebContents(fakeContents);
    const event = createFakeEvent(undefined);
    fakeContents.listeners['will-attach-webview'](event);
    assert.equal(event.prevented, true);
  });
});
