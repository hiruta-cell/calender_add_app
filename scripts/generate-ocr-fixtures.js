/**
 * generate-ocr-fixtures.js（開発者用・一度だけ実行するスクリプト）
 * 目的：OCR のテストに使う画像（架空の文章を描いた PNG）を作り、test/fixtures/ocr/ に保存する。
 *
 * 使い方（Mac）：env -u ELECTRON_RUN_AS_NODE npx electron scripts/generate-ocr-fixtures.js
 *   - Electron の画面に文章を描いて撮影する。画面は表示しない。
 *   - 文章はすべて架空のもの（CLAUDE.md：実際のメールを使わない）。
 *   - このスクリプトはアプリ本体とは別に動き、アプリのセキュリティ設定とは関係しない。
 */

import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 画像の保存先 */
const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'ocr');

/** 画面の文字に近い書体（Mac・Windows の標準の日本語書体） */
const FONT_FAMILY = "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', sans-serif";

/** 架空のメール風の文章（横書き） */
const EMAIL_LINES = [
  '件名：【架空】第3回 定例会のご案内',
  '日時：10月15日(木)14時〜15時',
  '場所：オンライン（Zoom）',
  '参加URL：https://zoom.us/j/0000000000',
];

/** 架空のチャット風の文章（横書き） */
const CHAT_LINES = ['明日の15時から打ち合わせできますか？', '場所は会議室Aでお願いします。'];

/** 架空のお知らせ（縦書き。右の列から読む） */
const VERTICAL_LINES = ['定例会のお知らせ', '十月十五日（木）午後二時から', '会場は第二会議室'];

/**
 * 架空の申込完了の案内（横書き）。依頼者の画像（2026-10-15）と同じ配置で、内容はすべて架空にした。
 * 「日時：」の行の日付と、次の行の見出しのない時刻（19:00~21:00）を結び付けられるかを確かめる。
 * 見出しは大きな太字で描く。絵文字（🏢・💻）は、実際の案内と同じく OCR のごみ文字になり得るため残す。
 */
const APPLICATION_HEADING_LINES = ['第9回 架空技術勉強会', '【例題ストリート一丁目', 'in 架空大学】', '申込フォーム'];
const APPLICATION_LINES = [
  'お申し込みいただきありがとうございます。',
  '',
  '日時：2026年10月22日（木曜日）',
  '19:00~21:00',
  '',
  '【参加方法】',
  '',
  '🏢 リアル会場（架空市）※定員30名',
  '',
  '場所：架空大学　本町キャンパス',
  '架空県架空市中央区本町1丁目1-1',
  '研究棟6階',
  '',
  '──',
  '',
  '💻 オンライン（Zoom）※定員なし',
  '',
  '参加は、以下のリンクからとなります。',
  '【zoom】',
  'Zoomミーティングに参加する',
  'https://zoom.us/j/0000000000?pwd=EXAMPLE',
];

/**
 * 作る画像の一覧。
 * fontSize は画面上の文字の大きさ（等倍は Windows の拡大率 100%、2倍は Mac の Retina などに相当）。
 */
const FIXTURES = [
  { fileName: 'horizontal-email-1x.png', lines: EMAIL_LINES, fontSize: 15, width: 520, height: 150, vertical: false },
  { fileName: 'horizontal-email-2x.png', lines: EMAIL_LINES, fontSize: 30, width: 1040, height: 290, vertical: false },
  { fileName: 'horizontal-chat-2x.png', lines: CHAT_LINES, fontSize: 30, width: 1000, height: 160, vertical: false },
  { fileName: 'vertical-notice-2x.png', lines: VERTICAL_LINES, fontSize: 40, width: 330, height: 760, vertical: true },
  {
    fileName: 'horizontal-application-2x.png',
    headingLines: APPLICATION_HEADING_LINES,
    lines: APPLICATION_LINES,
    fontSize: 26,
    width: 680,
    height: 1480,
    vertical: false,
  },
];

/** 見出しの文字の大きさ（本文に対する倍率） */
const HEADING_FONT_SCALE = 1.9;

/**
 * 画像に描く HTML を作る。
 *
 * @param {{lines: string[], fontSize: number, vertical: boolean}} fixture
 * @returns {string}
 */
function buildHtml({ headingLines = [], lines, fontSize, vertical }) {
  const escapeLines = (textLines) => textLines.map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>');
  const heading = headingLines.length === 0 ? '' : `<h1>${escapeLines(headingLines)}</h1>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
    html, body { margin: 0; background: #ffffff; }
    body { padding: ${Math.round(fontSize * 0.8)}px; color: #202124; font-family: ${FONT_FAMILY};
      font-size: ${fontSize}px; line-height: 1.6; ${vertical ? 'writing-mode: vertical-rl; height: 100vh; box-sizing: border-box;' : ''} }
    h1 { margin: 0 0 ${fontSize}px; font-size: ${HEADING_FONT_SCALE}em; line-height: 1.3; }
  </style></head><body>${heading}${escapeLines(lines)}</body></html>`;
}

/**
 * 1枚の画像を作って保存する。
 * 描画用のプロセスを増やさないよう、同じ画面の中身を書き換えて撮影する。
 *
 * @param {BrowserWindow} window 撮影に使う画面
 * @param {object} fixture FIXTURES の要素
 */
async function renderFixture(window, fixture) {
  window.setContentSize(fixture.width, fixture.height);
  const html = buildHtml(fixture);
  await window.webContents.executeJavaScript(
    `document.open(); document.write(${JSON.stringify(html)}); document.close(); true;`,
  );
  await new Promise((resolve) => setTimeout(resolve, 600)); // 書体の読み込みと描画を待つ
  const image = await window.webContents.capturePage();
  await writeFile(path.join(OUTPUT_DIR, fixture.fileName), image.toPNG());
  console.log(`保存しました：${fixture.fileName}（${image.getSize().width}×${image.getSize().height}）`);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: FIXTURES[0].width,
    height: FIXTURES[0].height,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await window.loadURL('data:text/html;charset=utf-8,%3C!doctype%20html%3E');
    for (const fixture of FIXTURES) {
      // 既にある画像は上書きしない（テストの結果が変わらないように。作り直すときは消してから実行する）
      if (existsSync(path.join(OUTPUT_DIR, fixture.fileName))) {
        console.log(`既にあるため飛ばしました：${fixture.fileName}`);
        continue;
      }
      await renderFixture(window, fixture);
    }
  } catch (error) {
    console.error('画像を作れませんでした:', error);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
});
