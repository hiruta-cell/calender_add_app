/**
 * smoke-test.js（開発者用の確認スクリプト）
 * 目的：実際にアプリを起動し、画面を自動で操作して、主な機能とセキュリティ設定が動いていることを確かめる。
 *
 * 使い方：npm run test:smoke（先に npm run build が実行される）
 *   - 確認中はアプリのウインドウが開き、終わると自動で閉じる
 *   - すでにアプリを起動している場合は、閉じてから実行する（多重起動防止のため）
 *   - --screenshot-dir <フォルダ> で画面の画像を保存する先を指定できる（既定：test-results/）
 *
 * 仕組み：Electron を --remote-debugging-port（画面用）と --inspect（メインプロセス用）付きで起動し、
 *   Chrome DevTools Protocol で操作する。どちらの接続口も 127.0.0.1（このPCの中）だけで開き、確認が終わると閉じる。
 *   通常の起動（npm start）ではこれらの接続口は開かない。
 *   登録の流れの確認では、メインプロセスの shell.openExternal を「開こうとした URL を記録するだけ」の関数に差し替え、
 *   実際のブラウザは開かない（アプリ本体に確認用のコードは入れない）。
 *   範囲キャプチャの確認では、画面を撮影する関数（desktopCapturer.getSources）を、架空の画像を返す関数に差し替える。
 *   そのため Mac の画面収録の許可は要らず、利用者の実際の画面も撮影しない。
 *
 * 入力に使う文面はすべて架空のもの（CLAUDE.md：実際のメールを使わない）。
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { APP_ENTRY_URL } from '../electron/appProtocol.js';
import { AUTO_RESET_DELAY_MS, AUTO_RESET_DELAY_SECONDS } from '../src/core/autoReset.js';
import { formatCalendarDate, formatCalendarDateTime } from '../src/core/calendarUrl.js';
import { MAX_INPUT_LENGTH, extractDateCandidates } from '../src/core/dateExtractor.js';
import { addDays, getTokyoDateTime } from '../src/core/dateUtils.js';

/** プロジェクトのフォルダ */
const PROJECT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 確認全体の制限時間（ミリ秒）。正常なら約22秒で終わる。これを超えたら失敗として終了する（固まったままにしない） */
const OVERALL_TIMEOUT_MS = 30_000;

/** 画面の表示や接続を待つときの確認間隔（ミリ秒） */
const POLL_INTERVAL_MS = 200;

/** 1つの待ち（画面が開く・表示が変わる・OCR が終わるなど）の上限（ミリ秒）。通常はどれも3秒以内に終わる */
const STEP_TIMEOUT_MS = 10_000;

/** 画面の更新を待つ時間（ミリ秒） */
const UI_SETTLE_MS = 300;

/** 登録のあと、確認ウインドウが最小化される（・元に戻る）のを待つ上限（ミリ秒）。Mac は最小化の動きに 0.5 秒ほどかかる */
const MINIMIZE_WAIT_MS = 3_000;

/** 自動のクリアの確認で、60秒の代わりに待つ時間（ミリ秒）。確認全体の時間を短くするため */
const AUTO_RESET_TEST_DELAY_MS = 1_000;

/** 画像の貼り付けの確認に使う架空の画像（日本語のメール。10/22 14:00〜15:30） */
const IMPORT_FIXTURE_PATH = path.join(PROJECT_DIR, 'demo', 'images', '1-mail-ja.png');

/** 範囲キャプチャの確認で「撮影した画面」として使う架空の画像（等倍。拡大の処理も通る） */
const CAPTURE_FIXTURE_PATH = path.join(PROJECT_DIR, 'test', 'fixtures', 'ocr', 'horizontal-email-1x.png');



/** 架空のデモ文面（日時が3つ。件名・場所・会議 URL 付き） */
const DEMO_TITLE = '【架空】第3回 定例会のご案内';
const DEMO_LOCATION = 'オンライン(Zoom)';
const DEMO_MEETING_URL = 'https://zoom.us/j/0000000000?pwd=example';
const DEMO_TEXT = [
  `件名：${DEMO_TITLE}`,
  '日時：10月15日(木)14時〜15時',
  '場所：オンライン（Zoom）',
  `参加URL：${DEMO_MEETING_URL}`,
  '予備日：来週火曜 午後3時半から',
  '資料の締切は明日です。',
].join('\n');

/** 日時を含まない架空の文面 */
const NO_DATE_TEXT = 'お世話になっております。資料を拝見しました。引き続きよろしくお願いいたします。';

/** 確認結果の一覧 { name, passed, detail } */
const results = [];

/** 機能確認中に画面で起きたエラー（コンソールのエラー・例外） */
const unexpectedErrors = [];

/** true の間に起きたエラーは「意図的に起こしたもの」として数えない（セキュリティの実地確認中） */
let isExpectingErrors = false;

/** 起動したアプリのプロセス。時間切れ・中断のときも必ず終了させるために保持する（常駐するため自分では終わらない） */
let launchedApp = null;

/**
 * 確認結果を記録して表示する。
 *
 * @param {string} name 確認する内容
 * @param {boolean} passed 合格なら true
 * @param {string} [detail] 補足（失敗時の実際の値など）
 */
function record(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '✔' : '✖'} ${name}${detail ? `（${detail}）` : ''}`);
}

/**
 * 指定した時間だけ待つ。
 *
 * @param {number} milliseconds
 */
function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Chrome DevTools Protocol の接続（命令を送り、結果やイベントを受け取る）。
 */
class DevToolsConnection {
  /**
   * @param {string} webSocketUrl 接続先（画面ごとの WebSocket の URL）
   */
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map(); // 返事を待っている命令（ID → Promise の解決関数）
    this.eventListeners = [];
  }

  /** 接続が開くまで待つ */
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('DevTools に接続できません')), { once: true });
    });
    this.socket.addEventListener('message', (event) => this.handleMessage(JSON.parse(event.data)));
  }

  /**
   * 命令を送り、結果を受け取る。
   *
   * @param {string} method 命令の名前（例：Runtime.evaluate）
   * @param {object} [params] 命令の引数
   * @returns {Promise<object>}
   */
  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      // 返事が来ないまま止まらないよう、上限時間を過ぎたら失敗させる
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${STEP_TIMEOUT_MS / 1000} 秒待っても返事がありませんでした：${method}`));
      }, STEP_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
  }

  /**
   * 受け取ったメッセージを、命令の結果かイベントかに振り分ける。
   *
   * @param {object} message
   */
  handleMessage(message) {
    if (message.id !== undefined) {
      const waiter = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        waiter?.reject(new Error(message.error.message));
      } else {
        waiter?.resolve(message.result);
      }
      return;
    }
    for (const listener of this.eventListeners) {
      listener(message);
    }
  }

  /**
   * 画面の中で JavaScript の式を実行し、結果の値を返す。
   *
   * @param {string} expression 実行する式（Promise なら完了を待つ）
   * @returns {Promise<unknown>}
   */
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
      throw new Error(`画面での実行に失敗: ${detail}`);
    }
    return response.result.value;
  }

  /** 接続を閉じる */
  close() {
    this.socket.close();
  }
}

/**
 * Electron を、確認用の接続口（DevTools）付きで起動する。
 *
 * @returns {Promise<{child: import('node:child_process').ChildProcess, port: number, mainInspectorUrl: string}>}
 */
function launchApp() {
  // ELECTRON_RUN_AS_NODE が設定されていると Electron が Node.js として動いてしまうため外す
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronPath, ['--inspect=0', '--remote-debugging-port=0', PROJECT_DIR], {
    cwd: PROJECT_DIR,
    env: environment,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  launchedApp = child;

  return new Promise((resolve, reject) => {
    let stderrText = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrText += chunk;
      // 起動すると、画面用は「DevTools listening on ws://127.0.0.1:ポート番号/...」、
      // メインプロセス用は「Debugger listening on ws://127.0.0.1:ポート番号/...」と出力される
      const pageMatch = stderrText.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      const mainMatch = stderrText.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/\S+)/);
      if (pageMatch && mainMatch) {
        resolve({ child, port: Number(pageMatch[1]), mainInspectorUrl: mainMatch[1] });
      }
    });
    child.once('exit', (code) => {
      reject(new Error(`アプリがすぐに終了しました（終了コード ${code}）。起動中のアプリがあれば閉じてください。`));
    });
  });
}

/**
 * 確認ウインドウ（app://bundle のページ）が現れるまで待ち、接続する。
 *
 * @param {number} port DevTools の接続口の番号
 * @returns {Promise<DevToolsConnection>}
 */
async function connectToMainWindow(port) {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = targets.find((target) => target.type === 'page' && target.url.startsWith('app://bundle/index.html'));
    if (page) {
      const connection = new DevToolsConnection(page.webSocketDebuggerUrl);
      await connection.open();
      return connection;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${STEP_TIMEOUT_MS / 1000} 秒待っても確認ウインドウが開きませんでした`);
}

/**
 * 画面の中で、条件の式が true になるまで待つ。STEP_TIMEOUT_MS を過ぎたら、待っていた条件を示して失敗させる。
 *
 * @param {DevToolsConnection} connection
 * @param {string} conditionExpression 条件の式
 */
async function waitFor(connection, conditionExpression) {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await connection.evaluate(conditionExpression)) {
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${STEP_TIMEOUT_MS / 1000} 秒待っても次の状態になりませんでした：${conditionExpression.slice(0, 80)}`);
}

/**
 * 入力欄の文章を入れ替える（実際の入力と同じイベントが起きる方法で入力する）。
 *
 * @param {DevToolsConnection} connection
 * @param {string} text 入力する文章
 */
async function replaceInputText(connection, text) {
  await connection.evaluate(`(() => {
    const textarea = document.querySelector('#source-text');
    textarea.focus();
    textarea.select();
  })()`);
  await connection.send('Input.insertText', { text });
  await sleep(UI_SETTLE_MS);
}

/**
 * 表示されている文字が一致するボタンを押す。
 *
 * @param {DevToolsConnection} connection
 * @param {string} label ボタンの文字
 */
async function clickButton(connection, label) {
  await connection.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === ${JSON.stringify(label)});
    if (!button) throw new Error('ボタンが見つかりません');
    button.click();
  })()`);
  await sleep(UI_SETTLE_MS);
}

/**
 * React が管理する入力欄（日付・時刻など）に値を入れる（実際の入力と同じイベントを起こす）。
 *
 * @param {DevToolsConnection} connection
 * @param {string} selector 入力欄の CSS セレクター
 * @param {string} value 入れる値
 */
async function setInputValue(connection, selector, value) {
  await connection.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error('入力欄が見つかりません');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(UI_SETTLE_MS);
}

/**
 * メインプロセスの shell.openExternal を、開こうとした URL を記録するだけの関数に差し替える。
 *
 * @param {DevToolsConnection} mainConnection メインプロセスへの接続
 */
async function replaceOpenExternal(mainConnection) {
  const response = await mainConnection.send('Runtime.evaluate', {
    expression: `(() => {
      const { shell } = require('electron');
      globalThis.__smokeTestOpenedUrls = [];
      shell.openExternal = async (url) => { globalThis.__smokeTestOpenedUrls.push(url); };
      return true;
    })()`,
    includeCommandLineAPI: true,
    returnByValue: true,
  });
  if (response.exceptionDetails || response.result.value !== true) {
    throw new Error('メインプロセスの shell.openExternal を差し替えられませんでした');
  }
}

/**
 * メインプロセスが開こうとした URL の一覧を受け取る。
 *
 * @param {DevToolsConnection} mainConnection
 * @returns {Promise<string[]>}
 */
async function getOpenedUrls(mainConnection) {
  return mainConnection.evaluate('globalThis.__smokeTestOpenedUrls');
}

/**
 * メインプロセスの画面の撮影（desktopCapturer.getSources）を、架空の画像を返す関数に差し替える。
 * Mac の画面収録の許可の確認（systemPreferences.getMediaAccessStatus）も「許可済み」を返すようにする。
 *
 * @param {DevToolsConnection} mainConnection メインプロセスへの接続
 */
async function replaceScreenCapture(mainConnection) {
  const response = await mainConnection.send('Runtime.evaluate', {
    expression: `(() => {
      const { desktopCapturer, nativeImage, screen, systemPreferences } = require('electron');
      desktopCapturer.getSources = async () => {
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const thumbnail = nativeImage.createFromPath(${JSON.stringify(CAPTURE_FIXTURE_PATH)});
        return [{ id: 'screen:smoke-test', name: 'smoke-test', display_id: String(display.id), thumbnail, appIcon: null }];
      };
      systemPreferences.getMediaAccessStatus = () => 'granted';
      return true;
    })()`,
    includeCommandLineAPI: true,
    returnByValue: true,
  });
  if (response.exceptionDetails || response.result.value !== true) {
    throw new Error('メインプロセスの画面の撮影を差し替えられませんでした');
  }
}


/**
 * 範囲選択の画面が開くまで待ち、接続する。開かなければ、確認ウインドウのエラー表示とともに失敗させる。
 *
 * @param {number} port DevTools の接続口の番号
 * @param {DevToolsConnection} [mainWindowConnection] 確認ウインドウへの接続（開かなかった理由の表示に使う）
 * @returns {Promise<DevToolsConnection>}
 */
async function connectToOverlay(port, mainWindowConnection) {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = targets.find((target) => target.type === 'page' && target.url.startsWith('app://bundle/overlay.html'));
    if (page) {
      const connection = new DevToolsConnection(page.webSocketDebuggerUrl);
      await connection.open();
      return connection;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  const banner = mainWindowConnection
    ? await mainWindowConnection.evaluate(`document.querySelector('.error-banner')?.textContent ?? '（エラー表示なし）'`)
    : '';
  throw new Error(`範囲選択の画面が開きませんでした ${banner}`);
}

/**
 * 範囲選択の画面が閉じるまで待つ（上限 STEP_TIMEOUT_MS）。
 *
 * @param {number} port DevTools の接続口の番号
 * @returns {Promise<boolean>} 閉じたら true
 */
async function waitForOverlayClosed(port) {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    if (!targets.some((target) => target.url.startsWith('app://bundle/overlay.html'))) {
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false; // 閉じなかった（呼び出し側で不合格として記録する）
}

/**
 * 範囲選択の画面で、左上から右下までドラッグする（実際のマウス操作と同じイベントを起こす）。
 *
 * @param {DevToolsConnection} overlayConnection 範囲選択の画面への接続
 */
async function dragWholeOverlay(overlayConnection) {
  const { width, height } = await overlayConnection.evaluate('({ width: window.innerWidth, height: window.innerHeight })');
  const start = { x: 2, y: 2 };
  const end = { x: width - 2, y: height - 2 };
  await overlayConnection.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 });
  await overlayConnection.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, button: 'left', buttons: 1 });
  await overlayConnection.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...end, button: 'left', buttons: 1 });
  // 離すと範囲が決まり、アプリがすぐに範囲選択の画面を閉じる。閉じるのが命令の返事より先になると返事が来ず、
  // 時間切れまで止まるため、返事は待たない（範囲が決まったことは、画面が閉じることと OCR の結果で確かめる）
  overlayConnection
    .send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0, clickCount: 1 })
    .catch(() => {});
}

/**
 * 画面の中で、条件の式が true になるまで待つ（上限時間付き）。
 *
 * @param {DevToolsConnection} connection
 * @param {string} conditionExpression 条件の式
 * @param {number} timeoutMs 待つ上限（ミリ秒）
 * @returns {Promise<boolean>} 条件を満たしたら true、時間切れなら false
 */
async function waitForWithTimeout(connection, conditionExpression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await connection.evaluate(conditionExpression)) {
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

/**
 * 範囲キャプチャの確認：取り込み → 範囲選択 → OCR → 日時の抽出、読み直し、中止、小さすぎる範囲。
 *
 * @param {DevToolsConnection} connection 確認ウインドウへの接続
 * @param {DevToolsConnection} mainConnection メインプロセスへの接続
 * @param {number} port DevTools の接続口の番号
 * @param {string} screenshotDir 画像の保存先
 * @returns {Promise<string[]>} 保存した画像のパス
 */
async function checkCapture(connection, mainConnection, port, screenshotDir) {
  await replaceScreenCapture(mainConnection);
  await clickButton(connection, 'クリア');

  const hotkeyResponse = await mainConnection.send('Runtime.evaluate', {
    expression: `require('electron').globalShortcut.isRegistered('CommandOrControl+Shift+Y')`,
    includeCommandLineAPI: true,
    returnByValue: true,
  });
  record('ホットキー（Ctrl/Cmd+Shift+Y）が登録されている', hotkeyResponse.result?.value === true);

  // 1. 取り込み → 範囲選択 → OCR → 日時の抽出
  await connection.evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.startsWith('画面から読み取る')).click()`);
  const overlay = await connectToOverlay(port, connection);
  const isScreenshotShown = await waitForWithTimeout(
    overlay,
    `document.querySelector('#screenshot')?.complete === true && document.querySelector('#screenshot').naturalWidth > 0`,
    STEP_TIMEOUT_MS,
  );
  const overlayState = await overlay.evaluate(`(() => {
    const image = document.querySelector('#screenshot');
    return JSON.stringify({ readyState: document.readyState, url: location.href, src: image?.src, complete: image?.complete, width: image?.naturalWidth });
  })()`);
  record('範囲選択の画面に、撮影した画面が表示される', isScreenshotShown, isScreenshotShown ? '' : overlayState);
  record(
    '範囲選択の画面に公開されている機能は select と cancel だけ',
    JSON.stringify(await overlay.evaluate('Object.keys(window.captureOverlay).sort()')) === JSON.stringify(['cancel', 'select']) &&
      (await overlay.evaluate(`typeof require === 'undefined' && typeof process === 'undefined'`)),
  );
  const overlayImage = await saveScreenshot(overlay, screenshotDir, '04-overlay.png');
  await dragWholeOverlay(overlay);
  overlay.close();
  record('範囲を選ぶと範囲選択の画面が閉じる', await waitForOverlayClosed(port));

  const isRead = await waitForWithTimeout(
    connection,
    `document.querySelector('#source-text').value.includes('10月15日') && document.querySelectorAll('.candidate-item').length > 0`,
    STEP_TIMEOUT_MS,
  );
  record('OCR で読み取った文章が入力欄に入り、日時が抽出される', isRead);
  const firstCandidate = await connection.evaluate(`document.querySelector('.candidate-date')?.textContent ?? ''`);
  record('1件目は「10月15日 14:00〜15:00」（等倍の画面を拡大して読み取り）', firstCandidate.includes('10月15日') && firstCandidate.endsWith('14:00〜15:00'), firstCandidate);
  record(
    '取り込んだ画像が表示され、横書きとして読み取った',
    await connection.evaluate(`(() => {
      const image = document.querySelector('.capture-image');
      return image !== null && image.complete && image.naturalWidth > 0 &&
        document.querySelector('.capture-panel').textContent.includes('横書きとして読み取りました');
    })()`),
  );
  record('件名が下書きされる（OCR の文章から）', (await connection.evaluate(`document.querySelector('#event-title').value`)).includes('定例会'));
  const captureImage = await saveScreenshot(connection, screenshotDir, '05-captured.png');

  // 2. 縦書きで読み直す
  await clickButton(connection, '縦書きで読み直す');
  const isReread = await waitForWithTimeout(
    connection,
    `document.querySelector('.capture-panel').textContent.includes('縦書きとして読み取りました')`,
    STEP_TIMEOUT_MS,
  );
  record('「縦書きで読み直す」で、縦書きとして読み直せる', isReread);

  // 3. Esc で中止 → 範囲選択の画面が閉じ、エラーも出ない
  await connection.evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.startsWith('画面から読み取る')).click()`);
  const overlayForCancel = await connectToOverlay(port, connection);
  await waitFor(overlayForCancel, `document.readyState === 'complete'`);
  // 確認の実行中は範囲選択の画面が OS 上で選択されておらず、キー入力の命令（Input.dispatchKeyEvent）が届かないため、
  // 画面の中で Esc キーのイベントを起こす（「Esc を受けて中止する」処理の流れを確かめる。実際のキーボードの確認は手動で行う）
  // アプリが範囲選択の画面をすぐ閉じるため、命令の返事を先に返してからイベントを起こす
  await overlayForCancel.evaluate(`setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), 50)`);
  overlayForCancel.close();
  const isClosedByEscape = await waitForOverlayClosed(port);
  await sleep(UI_SETTLE_MS);
  record(
    'Esc で中止すると範囲選択の画面が閉じ、エラーも出ない（暗い画面を残さない）',
    isClosedByEscape && (await connection.evaluate(`document.querySelector('.error-banner') === null`)),
  );

  // 4. 小さすぎる範囲 → メインプロセスで断られ、エラーを表示して待機状態に戻る
  await connection.evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.startsWith('画面から読み取る')).click()`);
  const overlayForSmall = await connectToOverlay(port, connection);
  await waitFor(overlayForSmall, `document.readyState === 'complete'`);
  await overlayForSmall.evaluate(`setTimeout(() => window.captureOverlay.select({ x: 0, y: 0, width: 2, height: 2 }), 50)`);
  overlayForSmall.close();
  await waitForOverlayClosed(port);
  const isSmallRejected = await waitForWithTimeout(
    connection,
    `(document.querySelector('.error-banner')?.textContent ?? '').includes('範囲が小さすぎます')`,
    STEP_TIMEOUT_MS,
  );
  record('小さすぎる範囲はメインプロセスで断られ、エラーを表示して待機状態に戻る', isSmallRejected);
  record(
    'エラーのあとも、もう一度「画面から読み取る」を押せる（固まらない）',
    await connection.evaluate(`![...document.querySelectorAll('button')].find((button) => button.textContent.startsWith('画面から読み取る')).disabled`),
  );
  await clickButton(connection, '閉じる');

  // 5. Mac で画面収録の許可がない → 案内と「システム設定を開く」ボタン（Mac のときだけ確認する）
  if (process.platform === 'darwin') {
    await mainConnection.send('Runtime.evaluate', {
      expression: `require('electron').systemPreferences.getMediaAccessStatus = () => 'denied'`,
      includeCommandLineAPI: true,
    });
    await connection.evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.startsWith('画面から読み取る')).click()`);
    const isPermissionShown = await waitForWithTimeout(
      connection,
      `(document.querySelector('.error-banner')?.textContent ?? '').includes('画面を取り込む許可がありません')`,
      STEP_TIMEOUT_MS,
    );
    record('画面収録の許可がないと、取り込みを中止して許可の手順を案内する', isPermissionShown);
    await clickButton(connection, 'システム設定を開く');
    const settingsUrl = (await getOpenedUrls(mainConnection)).at(-1);
    record(
      '「システム設定を開く」で、画面収録の設定画面（決まった URL）を開く',
      settingsUrl === 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      settingsUrl,
    );
    await mainConnection.send('Runtime.evaluate', {
      expression: `require('electron').systemPreferences.getMediaAccessStatus = () => 'granted'`,
      includeCommandLineAPI: true,
    });
    await clickButton(connection, '閉じる');
  }
  // 6. 画像の貼り付け（Ctrl/Cmd+V）→ PNG にそろえて読み取り → 日時の抽出
  await clickButton(connection, 'クリア');
  const importBase64 = (await readFile(IMPORT_FIXTURE_PATH)).toString('base64');
  await connection.evaluate(`(() => {
    const bytes = Uint8Array.from(atob('${importBase64}'), (character) => character.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'demo.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  })()`);
  const isImported = await waitForWithTimeout(
    connection,
    `document.querySelector('#source-text').value.includes('10月22日') && document.querySelectorAll('.candidate-item').length > 0`,
    STEP_TIMEOUT_MS,
  );
  record('画像を貼り付けると読み取り、日時が抽出される', isImported);
  const importedCandidate = await connection.evaluate(`document.querySelector('.candidate-date')?.textContent ?? ''`);
  record('貼り付けた画像の1件目は「10月22日 14:00〜15:30」', importedCandidate.includes('10月22日') && importedCandidate.endsWith('14:00〜15:30'), importedCandidate);

  // 7. 画像でないファイルをドロップ → 案内を表示（読み取らない）
  await connection.evaluate(`(() => {
    const data = new DataTransfer();
    data.items.add(new File(['not an image'], 'memo.txt', { type: 'text/plain' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  })()`);
  record(
    '画像でないファイルをドロップすると、PNG・JPEG だけ読み取れると案内する',
    await waitForWithTimeout(connection, `(document.querySelector('.error-banner')?.textContent ?? '').includes('PNG・JPEG')`, STEP_TIMEOUT_MS),
  );
  await clickButton(connection, '閉じる');
  return [overlayImage, captureImage];
}

/**
 * 登録ボタンを押し、処理が終わるまで待つ。
 *
 * @param {DevToolsConnection} connection 画面への接続
 */
async function clickRegister(connection) {
  await connection.evaluate(`document.querySelector('.register-section button').click()`);
  await waitFor(connection, `!document.querySelector('.register-section button').textContent.includes('開いています')`);
  await sleep(UI_SETTLE_MS);
}

/**
 * 確認ウインドウの最小化（BrowserWindow の minimize）を、呼ばれた回数を数えるだけの関数に差し替える。
 * 実際に最小化されることは最初の登録で確かめ、以降は最小化・復元の動き（Mac で約1秒）を待たずに確認を進めるため。
 *
 * @param {DevToolsConnection} mainConnection メインプロセスへの接続
 */
async function replaceMinimize(mainConnection) {
  const response = await mainConnection.send('Runtime.evaluate', {
    expression: `(() => {
      const { BrowserWindow } = require('electron');
      const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().startsWith(${JSON.stringify(APP_ENTRY_URL)}));
      if (window === undefined) return false;
      globalThis.__smokeTestMinimizeCount = 0;
      window.minimize = () => { globalThis.__smokeTestMinimizeCount += 1; };
      return true;
    })()`,
    includeCommandLineAPI: true,
    returnByValue: true,
  });
  if (response.exceptionDetails || response.result.value !== true) {
    throw new Error('確認ウインドウの最小化を差し替えられませんでした');
  }
}

/**
 * 差し替えた最小化が呼ばれた回数を受け取る（replaceMinimize の後で使う）。
 *
 * @param {DevToolsConnection} mainConnection
 * @returns {Promise<number>}
 */
async function getMinimizeCount(mainConnection) {
  return mainConnection.evaluate('globalThis.__smokeTestMinimizeCount');
}

/**
 * 確認ウインドウが最小化されるのを待ち（Mac は最小化の動きが終わるまで時間がかかる）、元に戻す。
 *
 * @param {DevToolsConnection} mainConnection メインプロセスへの接続
 * @returns {Promise<boolean>} 最小化されていたら true（時間内に最小化されなければ false）
 */
async function restoreMinimizedMainWindow(mainConnection) {
  const response = await mainConnection.send('Runtime.evaluate', {
    expression: `(async () => {
      const { BrowserWindow } = require('electron');
      const window = BrowserWindow.getAllWindows().find((candidate) => candidate.webContents.getURL().startsWith(${JSON.stringify(APP_ENTRY_URL)}));
      if (window === undefined) return false;
      const deadline = Date.now() + ${MINIMIZE_WAIT_MS};
      while (!window.isMinimized() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const wasMinimized = window.isMinimized();
      if (wasMinimized) {
        window.restore();
        while (window.isMinimized() && Date.now() < deadline + ${MINIMIZE_WAIT_MS}) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      return wasMinimized;
    })()`,
    includeCommandLineAPI: true,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error('確認ウインドウの状態を調べられませんでした');
  }
  return response.result.value === true;
}

/**
 * 画面の画像を保存する。
 *
 * @param {DevToolsConnection} connection
 * @param {string} directory 保存先のフォルダ
 * @param {string} fileName ファイル名
 * @returns {Promise<string>} 保存したファイルのパス
 */
async function saveScreenshot(connection, directory, fileName) {
  const { data } = await connection.send('Page.captureScreenshot', { format: 'png' });
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, fileName);
  await writeFile(filePath, Buffer.from(data, 'base64'));
  return filePath;
}

/**
 * 機能の確認：抽出・下書き・候補・登録・ポップアップ・手入力・エラー表示。
 *
 * @param {DevToolsConnection} connection 画面への接続
 * @param {DevToolsConnection} mainConnection メインプロセスへの接続（開こうとした URL の確認に使う）
 * @param {string} screenshotDir 画像の保存先
 */
async function checkFeatures(connection, mainConnection, screenshotDir) {
  // 1. 起動直後の画面
  record('画面が表示される', (await connection.evaluate(`document.querySelector('h1')?.textContent`)) === 'カレンダー登録ツール');

  // 2. デモ文面から3つの日時を抽出する
  await replaceInputText(connection, DEMO_TEXT);
  await clickButton(connection, '日時を抽出');
  const candidates = await connection.evaluate(`[...document.querySelectorAll('.candidate-item')].map((item) => ({
    date: item.querySelector('.candidate-date').textContent,
    source: item.querySelector('.candidate-source').textContent,
  }))`);
  record('日時の候補が3件表示される', candidates.length === 3, `${candidates.length}件`);
  record(
    '1件目は「10月15日 14:00〜15:00」',
    candidates[0]?.date.includes('10月15日') && candidates[0]?.date.endsWith('14:00〜15:00'),
    candidates[0]?.date,
  );
  record(
    '元の表記が表示される',
    JSON.stringify(candidates.map((candidate) => candidate.source)) ===
      JSON.stringify(['元の表記：「10月15日(木)14時〜15時」', '元の表記：「来週火曜 午後3時半」', '元の表記：「明日」']),
  );
  const marks = await connection.evaluate(`[...document.querySelectorAll('.highlighted-text mark')].map((mark) => mark.textContent)`);
  record('文章の日時部分が3か所色付けされる', marks.length === 3, marks.join(' / '));

  // 3. 件名・場所・会議 URL の下書き
  const drafts = await connection.evaluate(`({
    title: document.querySelector('#event-title').value,
    location: document.querySelector('#event-location').value,
    meetingUrl: document.querySelector('#event-meeting-url').value,
    memo: document.querySelector('#event-memo').value,
  })`);
  record('件名が下書きされる', drafts.title === DEMO_TITLE, drafts.title);
  record('場所が下書きされる', drafts.location === DEMO_LOCATION, drafts.location);
  record('会議 URL が下書きされる', drafts.meetingUrl === DEMO_MEETING_URL, drafts.meetingUrl);
  record('メモは空のまま（元の文章を自動で入れない）', drafts.memo === '');

  // 4. 1件目（時刻あり）と3件目（明日・日付だけ）にチェックを付けて登録する
  await connection.evaluate(`document.querySelectorAll('.candidate-checkbox')[0].click()`);
  await connection.evaluate(`document.querySelectorAll('.candidate-checkbox')[2].click()`);
  await sleep(UI_SETTLE_MS);
  record('選択件数が2件になる', (await connection.evaluate(`document.querySelector('.candidate-panel .hint').textContent`)).includes('選択中：2 件'));
  record(
    '日付だけの候補は「終日」が選ばれている',
    await connection.evaluate(`document.querySelector('.time-choice input[value="allDay"]')?.checked === true`),
  );
  // 右の欄を一番上まで戻した状態でも、登録ボタンがスクロールせずに見えること（使いやすさの確認）
  record('登録ボタンがスクロールしなくても見える位置にある', await connection.evaluate(`(() => {
    const button = document.querySelector('.register-section button');
    for (let element = button.parentElement; element !== null; element = element.parentElement) {
      element.scrollTop = 0; // スクロールできる欄をすべて一番上に戻す
    }
    const rect = button.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  })()`));
  const candidatesImage = await saveScreenshot(connection, screenshotDir, '01-candidates.png');

  const expected = extractDateCandidates(DEMO_TEXT, { now: new Date() }).candidates;
  const tomorrow = addDays(getTokyoDateTime(new Date()), 1);
  await clickRegister(connection);
  // 実際に最小化されることを確かめて元に戻し、以降の登録では最小化を数えるだけにする
  const minimizedAfterRegister = await restoreMinimizedMainWindow(mainConnection);
  await replaceMinimize(mainConnection);
  const openedUrls = await getOpenedUrls(mainConnection);
  record('選んだ2件の予定作成画面を開く', openedUrls.length === 2, `${openedUrls.length}件`);
  record('すべて開いたら確認ウインドウが最小化される（ブラウザの操作の邪魔にならないように）', minimizedAfterRegister);
  const [timedQuery, allDayQuery] = openedUrls.map((url) => new URL(url).searchParams);
  record(
    '1件目：日時（開始/終了）とタイムゾーンが正しい',
    timedQuery?.get('dates') === `${formatCalendarDateTime(expected[0].start)}/${formatCalendarDateTime(expected[0].end)}` &&
      timedQuery?.get('ctz') === 'Asia/Tokyo',
    timedQuery?.get('dates'),
  );
  record(
    '1件目：件名・場所・メモ（会議 URL）が入る',
    timedQuery?.get('text') === DEMO_TITLE &&
      timedQuery?.get('location') === DEMO_LOCATION &&
      timedQuery?.get('details') === `オンライン会議：${DEMO_MEETING_URL}`,
  );
  record(
    '2件目：明日の終日の予定（終了日は翌日）',
    allDayQuery?.get('dates') === `${formatCalendarDate(tomorrow)}/${formatCalendarDate(addDays(tomorrow, 1))}`,
    allDayQuery?.get('dates'),
  );
  const registeredMessage = await connection.evaluate(`document.querySelector('.register-section .success-message')?.textContent ?? ''`);
  record(
    '登録のあと、開いた件数と「60秒操作しないとクリアする」案内が出る',
    registeredMessage.includes('予定作成画面を 2 件開きました') && registeredMessage.includes(`${AUTO_RESET_DELAY_SECONDS}秒操作しないと`),
    registeredMessage,
  );
  record(
    '登録の確認の欄（「保存した」のチェック・「カレンダーで確認」）は表示しない（依頼者の指示で削除）',
    await connection.evaluate(`document.querySelector('.register-section input[type="checkbox"]') === null &&
      ![...document.querySelectorAll('button')].some((button) => button.textContent.includes('カレンダーで確認'))`),
  );
  const registeredImage = await saveScreenshot(connection, screenshotDir, '02-registered.png');

  // 5. 日付だけの候補で「時刻を指定」に切り替える（1件目のチェックは外す）
  await connection.evaluate(`document.querySelectorAll('.candidate-checkbox')[0].click()`);
  await connection.evaluate(`document.querySelector('.time-choice input[value="specified"]').click()`);
  await sleep(UI_SETTLE_MS);
  await setInputValue(connection, '.time-choice input[type="time"]', '09:00');
  await clickRegister(connection);
  const specifiedUrl = (await getOpenedUrls(mainConnection)).at(-1);
  record(
    '「時刻を指定」で9:00を入れると 9:00〜10:00 の予定になる',
    new URL(specifiedUrl).searchParams.get('dates') ===
      `${formatCalendarDate(tomorrow)}T090000/${formatCalendarDate(tomorrow)}T100000`,
  );

  // 6. 日時のない文面 → 「日時の情報がありません」→ ポップアップの中で日時を手入力
  await replaceInputText(connection, NO_DATE_TEXT);
  await clickButton(connection, '日時を抽出');
  record('日時がないとポップアップが開く', await connection.evaluate(`document.querySelector('dialog').open`));
  record('ポップアップの文言', (await connection.evaluate(`document.querySelector('#no-date-dialog-title').textContent`)) === '日時の情報がありません');
  record(
    'ポップアップに、手入力の欄と次にすること（「追加する」）の説明がある',
    await connection.evaluate(`document.querySelector('#dialog-manual-date') !== null && document.querySelector('.dialog-step').textContent.includes('追加する')`),
  );
  record('日付を入れるまで「追加する」は押せない', await connection.evaluate(
    `[...document.querySelectorAll('dialog button')].find((button) => button.textContent.trim() === '追加する').disabled`,
  ));
  const manualDate = addDays(tomorrow, 6);
  const toDateInput = (date) => `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  await setInputValue(connection, '#dialog-manual-date', toDateInput(manualDate));
  await setInputValue(connection, '#dialog-manual-start', '09:30');
  const dialogImage = await saveScreenshot(connection, screenshotDir, '03-no-date-dialog.png');
  await clickButton(connection, '追加する');
  record('「追加する」でポップアップが閉じる', (await connection.evaluate(`document.querySelector('dialog').open`)) === false);
  record('入力した日時が、チェック付き・「時刻を指定」の候補として加わる', await connection.evaluate(
    `document.querySelectorAll('.candidate-item').length === 1 && document.querySelector('.candidate-checkbox').checked &&
     document.querySelector('.time-choice input[value="specified"]')?.checked === true`,
  ));
  await clickRegister(connection);
  const manualUrl = (await getOpenedUrls(mainConnection)).at(-1);
  record(
    '手入力した 9:30 開始の予定を開く（終了は60分後）',
    new URL(manualUrl).searchParams.get('dates') === `${formatCalendarDate(manualDate)}T093000/${formatCalendarDate(manualDate)}T103000`,
  );

  // 7. 右の欄の「日時を手入力で追加」（日付だけ → 終日の候補）
  const extraDate = addDays(manualDate, 1);
  await setInputValue(connection, '#manual-date', toDateInput(extraDate));
  await clickButton(connection, '追加');
  record('右の欄から追加した日付は、チェック付き・「終日」の候補になる', await connection.evaluate(
    `document.querySelectorAll('.candidate-item').length === 2 && document.querySelectorAll('.candidate-checkbox')[1].checked &&
     document.querySelectorAll('.candidate-item')[1].querySelector('.time-choice input[value="allDay"]')?.checked === true`,
  ));

  // 5. 長すぎる文章 → エラーを表示して待機状態に戻る
  await replaceInputText(connection, 'あ'.repeat(MAX_INPUT_LENGTH + 1));
  await clickButton(connection, '日時を抽出');
  const bannerText = await connection.evaluate(`document.querySelector('.error-banner')?.textContent ?? ''`);
  record('長すぎる文章はエラーを表示する', bannerText.includes('文章が長すぎます'), bannerText.slice(0, 30));
  record('エラーのあとは候補が消えて待機状態に戻る', (await connection.evaluate(`document.querySelectorAll('.candidate-item').length`)) === 0);
  await clickButton(connection, 'クリア');
  record(
    'クリアで入力欄とエラー表示が消える',
    await connection.evaluate(`document.querySelector('#source-text').value === '' && document.querySelector('.error-banner') === null`),
  );

  return [candidatesImage, registeredImage, dialogImage];
}

/**
 * 自動のクリアの確認：登録のあと操作しなければ表示が初期状態に戻り、先に操作すると戻らないこと（依頼者の指示）。
 * 本来は60秒待つが、確認では画面の setTimeout のうち60秒のものだけを短くする（アプリ本体に確認用のコードは入れない）。
 *
 * @param {DevToolsConnection} connection 画面への接続
 * @param {DevToolsConnection} mainConnection メインプロセスへの接続
 */
async function checkAutoReset(connection, mainConnection) {
  await connection.evaluate(`(() => {
    const originalSetTimeout = window.setTimeout;
    window.__smokeTestOriginalSetTimeout = originalSetTimeout;
    window.setTimeout = (callback, milliseconds, ...rest) =>
      originalSetTimeout(callback, milliseconds === ${AUTO_RESET_DELAY_MS} ? ${AUTO_RESET_TEST_DELAY_MS} : milliseconds, ...rest);
    return true;
  })()`);

  // 1件選んで登録し、すぐに画面を操作する（キー入力）→ 時間がたってもクリアしない
  await replaceInputText(connection, DEMO_TEXT);
  await clickButton(connection, '日時を抽出');
  await connection.evaluate(`document.querySelectorAll('.candidate-checkbox')[0].click()`);
  await sleep(UI_SETTLE_MS);
  await connection.evaluate(`document.querySelector('.register-section button').click()`);
  await waitFor(connection, `document.querySelector('.register-section .success-message') !== null`);
  await sleep(UI_SETTLE_MS); // 自動のクリアの予約（画面の useEffect）が始まるのを待つ
  await connection.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))`);
  await sleep(AUTO_RESET_TEST_DELAY_MS + UI_SETTLE_MS * 2);
  record(
    '登録のあと、その間に画面を操作した場合はクリアしない（作業中の内容を消さない）',
    await connection.evaluate(`document.querySelector('#source-text').value !== '' && document.querySelectorAll('.candidate-item').length === 3 &&
      !document.querySelector('.register-section .success-message').textContent.includes('秒操作しないと')`),
  );

  // もう一度登録し、何も操作しない → 時間がたつと表示が初期状態に戻る
  await clickRegister(connection);
  const isInputCleared = await waitForWithTimeout(
    connection,
    `document.querySelector('#source-text').value === ''`,
    AUTO_RESET_TEST_DELAY_MS + STEP_TIMEOUT_MS,
  );
  record(
    `登録のあと操作しないと、表示が初期状態に戻る（本来は${AUTO_RESET_DELAY_SECONDS}秒。確認では短くして待つ）`,
    isInputCleared &&
      (await connection.evaluate(`document.querySelectorAll('.candidate-item').length === 0 &&
        document.querySelector('#event-title').value === '' && document.querySelector('#event-location').value === '' &&
        document.querySelector('.register-section .success-message') === null && document.querySelector('.error-banner') === null`)),
  );

  await connection.evaluate(`(() => { window.setTimeout = window.__smokeTestOriginalSetTimeout; return true; })()`);
}

/**
 * セキュリティの実地確認：実際に動いている画面で、危険な操作が止められることを確かめる。
 *
 * @param {DevToolsConnection} connection
 */
async function checkSecurity(connection, mainConnection) {
  isExpectingErrors = true; // ここで起きるエラーは意図的に起こしたもの

  record(
    '画面に公開されている機能は、決めた関数だけ（登録・取り込み・画像・設定画面の8つ）',
    JSON.stringify(await connection.evaluate(`Object.keys(window.calendarApp).sort()`)) ===
      JSON.stringify(['clearCapture', 'getAppStatus', 'importImage', 'onCaptureStatus', 'openCalendarEvents', 'openScreenRecordingSettings', 'rereadCapture', 'startCapture']) &&
      (await connection.evaluate(`typeof window.ipcRenderer === 'undefined' && typeof window.electron === 'undefined'`)),
  );
  const openedBefore = (await getOpenedUrls(mainConnection)).length;
  const minimizeCountBefore = await getMinimizeCount(mainConnection);
  const invalidResults = await connection.evaluate(`Promise.all([
    window.calendarApp.openCalendarEvents('not an array'),
    window.calendarApp.openCalendarEvents([]),
    window.calendarApp.openCalendarEvents([{ title: 'x'.repeat(100000), location: '', details: '', allDay: true, start: { year: 2026, month: 10, day: 15 }, end: null }]),
    window.calendarApp.openCalendarEvents(Array.from({ length: 31 }, () => ({ title: '', location: '', details: '', allDay: true, start: { year: 2026, month: 10, day: 15 }, end: null }))),
  ]).then((results) => results.map((result) => result.ok))`);
  const invalidImportResults = await connection.evaluate(`Promise.all([
    window.calendarApp.importImage('not bytes'),
    window.calendarApp.importImage(new Uint8Array([1, 2, 3])),
    window.calendarApp.importImage(new Uint8Array(0)),
  ]).then((results) => results.map((result) => result.ok))`);
  record(
    '不正な画像の取り込み要求（形式違い・PNG でない・空）は断られる',
    JSON.stringify(invalidImportResults) === JSON.stringify([false, false, false]),
  );
  record(
    '不正な登録要求（形式違い・空・長すぎる件名・31件）はメインプロセスで断られ、何も開かず、最小化もしない',
    JSON.stringify(invalidResults) === JSON.stringify([false, false, false, false]) &&
      (await getOpenedUrls(mainConnection)).length === openedBefore &&
      (await getMinimizeCount(mainConnection)) === minimizeCountBefore,
  );

  record(
    '画面から Node.js の機能（require / process）が使えない',
    await connection.evaluate(`typeof require === 'undefined' && typeof process === 'undefined' && typeof module === 'undefined'`),
  );
  record('外部への通信（fetch）が止められる', (await connection.evaluate(
    `fetch('https://example.com/').then(() => 'allowed', () => 'blocked')`,
  )) === 'blocked');
  record('インラインスクリプトが実行されない（CSP）', (await connection.evaluate(`new Promise((resolve) => {
    const script = document.createElement('script');
    script.textContent = 'window.__inlineScriptExecuted = true';
    document.body.appendChild(script);
    setTimeout(() => resolve(window.__inlineScriptExecuted === undefined), 200);
  })`)) === true);
  record('新しいウインドウ（window.open）が開かない', (await connection.evaluate(`window.open('https://example.com/') === null`)) === true);
  await connection.evaluate(`location.href = 'https://example.com/'`);
  await sleep(1000);
  const currentUrl = await connection.evaluate('location.href');
  record('外部のページへ移動できない', currentUrl.startsWith('app://bundle/'), currentUrl);
}

/**
 * 確認を実行し、結果に応じた終了コードを返す。
 *
 * @returns {Promise<number>} すべて合格なら 0、そうでなければ 1
 */
async function main() {
  const screenshotDirIndex = process.argv.indexOf('--screenshot-dir');
  const screenshotDir =
    screenshotDirIndex !== -1 ? path.resolve(process.argv[screenshotDirIndex + 1]) : path.join(PROJECT_DIR, 'test-results');

  const { child, port, mainInspectorUrl } = await launchApp();
  let connection = null;
  let mainConnection = null;
  try {
    mainConnection = new DevToolsConnection(mainInspectorUrl);
    await mainConnection.open();
    await replaceOpenExternal(mainConnection);
    connection = await connectToMainWindow(port);
    // 画面のエラー（例外・console.error・CSP 違反などのログ）を集める
    connection.eventListeners.push((message) => {
      const isError =
        message.method === 'Runtime.exceptionThrown' ||
        (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') ||
        (message.method === 'Log.entryAdded' && message.params.entry.level === 'error');
      if (isError && !isExpectingErrors) {
        unexpectedErrors.push(JSON.stringify(message.params).slice(0, 300));
      }
    });
    await connection.send('Runtime.enable');
    await connection.send('Log.enable');
    await waitFor(connection, `document.querySelector('#source-text') !== null`);

    const images = await checkFeatures(connection, mainConnection, screenshotDir);
    await checkAutoReset(connection, mainConnection);
    images.push(...(await checkCapture(connection, mainConnection, port, screenshotDir)));
    record('機能確認の間に画面のエラーが起きていない', unexpectedErrors.length === 0, unexpectedErrors.join(' | '));
    await checkSecurity(connection, mainConnection);

    console.log(`\n画面の画像：\n  ${images.join('\n  ')}`);
  } finally {
    connection?.close();
    mainConnection?.close();
    await stopLaunchedApp();
  }

  const failedCount = results.filter((result) => !result.passed).length;
  console.log(`\n合格 ${results.length - failedCount} 件 / 不合格 ${failedCount} 件`);
  return failedCount === 0 ? 0 : 1;
}

/** アプリの終了を待つ上限（ミリ秒）。過ぎたら強制終了する */
const APP_EXIT_TIMEOUT_MS = 5_000;

/**
 * 起動したアプリを終了させる（アプリは常駐するため、閉じないと残り続け、次の確認が多重起動防止で動かなくなる）。
 * 終了の合図を送り、終わらなければ APP_EXIT_TIMEOUT_MS 後に強制終了する。
 *
 * @returns {Promise<void>} アプリが終わったら解決する
 */
function stopLaunchedApp() {
  const child = launchedApp;
  if (child === null || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const forceTimer = setTimeout(() => child.kill('SIGKILL'), APP_EXIT_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(forceTimer);
      resolve();
    });
    child.kill();
  });
}

// 制限時間を超えたら、アプリを終了させてから失敗として終了する（確認が固まったままにならないように）
const timeout = setTimeout(() => {
  console.error(`✖ ${OVERALL_TIMEOUT_MS / 1000} 秒以内に終わりませんでした（最後に合格した確認の次で止まっています）`);
  launchedApp?.kill('SIGKILL'); // すぐに終了するため、強制終了する
  process.exit(1);
}, OVERALL_TIMEOUT_MS);

// Ctrl+C で中断したときも、アプリを終了させる
process.on('SIGINT', () => {
  launchedApp?.kill('SIGKILL');
  process.exit(130);
});

main()
  .then((exitCode) => {
    clearTimeout(timeout);
    process.exit(exitCode);
  })
  .catch((error) => {
    clearTimeout(timeout);
    console.error(`✖ 確認を実行できませんでした：${error.message}`);
    process.exit(1);
  });
