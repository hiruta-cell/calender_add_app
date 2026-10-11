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
 *   登録の確認では、メインプロセスの shell.openExternal を「開こうとした URL を記録するだけ」の関数に差し替え、
 *   実際のブラウザは開かない（アプリ本体に確認用のコードは入れない）。
 *
 * 入力に使う文面はすべて架空のもの（CLAUDE.md：実際のメールを使わない）。
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { formatCalendarDate, formatCalendarDateTime } from '../src/core/calendarUrl.js';
import { MAX_INPUT_LENGTH, extractDateCandidates } from '../src/core/dateExtractor.js';
import { addDays, getTokyoDateTime } from '../src/core/dateUtils.js';

/** プロジェクトのフォルダ */
const PROJECT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 確認全体の制限時間（ミリ秒）。これを超えたら失敗として終了する（固まったままにしない） */
const OVERALL_TIMEOUT_MS = 60_000;

/** 画面の表示や接続を待つときの確認間隔（ミリ秒） */
const POLL_INTERVAL_MS = 200;

/** 画面の更新を待つ時間（ミリ秒） */
const UI_SETTLE_MS = 300;

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
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
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
      throw new Error(`画面での実行に失敗: ${response.exceptionDetails.text}`);
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
  for (;;) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const page = targets.find((target) => target.type === 'page' && target.url.startsWith('app://bundle/'));
    if (page) {
      const connection = new DevToolsConnection(page.webSocketDebuggerUrl);
      await connection.open();
      return connection;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * 画面の中で、条件の式が true になるまで待つ。
 *
 * @param {DevToolsConnection} connection
 * @param {string} conditionExpression 条件の式
 */
async function waitFor(connection, conditionExpression) {
  for (;;) {
    if (await connection.evaluate(conditionExpression)) {
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
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
 * 登録ボタンを押し、処理が終わるまで待つ。
 *
 * @param {DevToolsConnection} connection
 */
async function clickRegister(connection) {
  await connection.evaluate(`document.querySelector('.register-section button').click()`);
  await waitFor(connection, `!document.querySelector('.register-section button').textContent.includes('開いています')`);
  await sleep(UI_SETTLE_MS);
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
  const openedUrls = await getOpenedUrls(mainConnection);
  record('選んだ2件の予定作成画面を開く', openedUrls.length === 2, `${openedUrls.length}件`);
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
  record(
    '登録の確認：開いた2件が一覧に出て、未保存の件数を知らせる',
    await connection.evaluate(`document.querySelectorAll('.checklist-item').length === 2 &&
      document.querySelector('.checklist-guide')?.textContent.includes('保存した：0 / 2 件')`),
  );
  const registeredImage = await saveScreenshot(connection, screenshotDir, '02-registered.png');

  // 「カレンダーで確認」で、1件目の日の表示を開く
  await connection.evaluate(`document.querySelector('.checklist-item button').click()`);
  await sleep(UI_SETTLE_MS);
  const dayViewUrl = (await getOpenedUrls(mainConnection)).at(-1);
  record(
    '「カレンダーで確認」でその日の Googleカレンダーの表示を開く',
    dayViewUrl === `https://calendar.google.com/calendar/r/day/${expected[0].start.year}/${expected[0].start.month}/${expected[0].start.day}`,
    dayViewUrl,
  );

  // 「保存した」に2件ともチェックを付ける
  await connection.evaluate(`document.querySelectorAll('.checklist-saved input').forEach((checkbox) => checkbox.click())`);
  await sleep(UI_SETTLE_MS);
  record(
    '2件とも「保存した」にすると、すべて保存したと知らせる',
    (await connection.evaluate(`document.querySelector('.registration-checklist .success-message')?.textContent ?? ''`)).includes('すべての予定（2 件）を保存しました'),
  );

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

  // 6. 日時のない文面 → 「日時の情報がありません」→ 手入力
  await replaceInputText(connection, NO_DATE_TEXT);
  await clickButton(connection, '日時を抽出');
  record('日時がないとポップアップが開く', await connection.evaluate(`document.querySelector('dialog').open`));
  record('ポップアップの文言', (await connection.evaluate(`document.querySelector('#no-date-dialog-title').textContent`)) === '日時の情報がありません');
  const dialogImage = await saveScreenshot(connection, screenshotDir, '03-no-date-dialog.png');
  await clickButton(connection, '手入力する');
  record('「手入力する」でポップアップが閉じる', (await connection.evaluate(`document.querySelector('dialog').open`)) === false);
  record('手入力の日付欄に移る', await connection.evaluate(`document.activeElement?.id === 'manual-date'`));
  const manualDate = addDays(tomorrow, 6);
  const manualDateText = `${manualDate.year}-${String(manualDate.month).padStart(2, '0')}-${String(manualDate.day).padStart(2, '0')}`;
  await setInputValue(connection, '#manual-date', manualDateText);
  await clickButton(connection, '追加');
  record('手入力した日付が候補に追加され、チェックが付く', await connection.evaluate(
    `document.querySelectorAll('.candidate-item').length === 1 && document.querySelector('.candidate-checkbox').checked`,
  ));
  await clickRegister(connection);
  const manualUrl = (await getOpenedUrls(mainConnection)).at(-1);
  record(
    '手入力した日付を終日の予定として開く',
    new URL(manualUrl).searchParams.get('dates') === `${formatCalendarDate(manualDate)}/${formatCalendarDate(addDays(manualDate, 1))}`,
  );

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
 * セキュリティの実地確認：実際に動いている画面で、危険な操作が止められることを確かめる。
 *
 * @param {DevToolsConnection} connection
 */
async function checkSecurity(connection, mainConnection) {
  isExpectingErrors = true; // ここで起きるエラーは意図的に起こしたもの

  record(
    '画面に公開されている機能は、決めた関数だけ（openCalendarEvents・openCalendarDay）',
    JSON.stringify(await connection.evaluate(`Object.keys(window.calendarApp).sort()`)) === JSON.stringify(['openCalendarDay', 'openCalendarEvents']) &&
      (await connection.evaluate(`typeof window.ipcRenderer === 'undefined' && typeof window.electron === 'undefined'`)),
  );
  const openedBefore = (await getOpenedUrls(mainConnection)).length;
  const invalidResults = await connection.evaluate(`Promise.all([
    window.calendarApp.openCalendarEvents('not an array'),
    window.calendarApp.openCalendarEvents([]),
    window.calendarApp.openCalendarEvents([{ title: 'x'.repeat(100000), location: '', details: '', allDay: true, start: { year: 2026, month: 10, day: 15 }, end: null }]),
    window.calendarApp.openCalendarEvents(Array.from({ length: 31 }, () => ({ title: '', location: '', details: '', allDay: true, start: { year: 2026, month: 10, day: 15 }, end: null }))),
  ]).then((results) => results.map((result) => result.ok))`);
  const invalidDayResults = await connection.evaluate(`Promise.all([
    window.calendarApp.openCalendarDay('https://evil.example/'),
    window.calendarApp.openCalendarDay({ year: 2026, month: 2, day: 30 }),
    window.calendarApp.openCalendarDay(null),
  ]).then((results) => results.map((result) => result.ok))`);
  record(
    '不正な「カレンダーで確認」の要求（URL・実在しない日付・空）は断られる',
    JSON.stringify(invalidDayResults) === JSON.stringify([false, false, false]),
  );
  record(
    '不正な登録要求（形式違い・空・長すぎる件名・31件）はメインプロセスで断られ、何も開かない',
    JSON.stringify(invalidResults) === JSON.stringify([false, false, false, false]) &&
      (await getOpenedUrls(mainConnection)).length === openedBefore,
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
    record('機能確認の間に画面のエラーが起きていない', unexpectedErrors.length === 0, unexpectedErrors.join(' | '));
    await checkSecurity(connection, mainConnection);

    console.log(`\n画面の画像：\n  ${images.join('\n  ')}`);
  } finally {
    connection?.close();
    mainConnection?.close();
    child.kill();
  }

  const failedCount = results.filter((result) => !result.passed).length;
  console.log(`\n合格 ${results.length - failedCount} 件 / 不合格 ${failedCount} 件`);
  return failedCount === 0 ? 0 : 1;
}

// 制限時間を超えたら失敗として終了する（確認が固まったままにならないように）
const timeout = setTimeout(() => {
  console.error(`✖ ${OVERALL_TIMEOUT_MS / 1000} 秒以内に終わりませんでした`);
  process.exit(1);
}, OVERALL_TIMEOUT_MS);

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
