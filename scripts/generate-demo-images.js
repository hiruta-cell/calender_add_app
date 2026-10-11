/**
 * generate-demo-images.js（開発者用・デモ画像を作り直すときだけ実行するスクリプト）
 * 目的：読み取りテストと発表のデモに使う画像（架空の文面）を作り、demo/images/ に保存する。
 *
 * 使い方（Mac）：env -u ELECTRON_RUN_AS_NODE npx electron scripts/generate-demo-images.js
 *   - 文面はすべて架空のもの（CLAUDE.md：実際のメール・実在の人名や会社名を使わない）。
 *   - 日付は発表日（2026-10-16）より後にしている（発表当日に「過去の日時」にならないように）。
 *   - 画面の文字に近づけるため、2倍の大きさで描く（Retina の画面と同じ細かさ）。
 *   - このスクリプトはアプリ本体とは別に動き、アプリのセキュリティ設定とは関係しない。
 */

import { app, BrowserWindow } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 画像の保存先 */
const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'demo', 'images');

/** 画面の文字に近い書体（Mac・Windows の標準の日本語書体） */
const FONT_FAMILY = "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', sans-serif";

/** 共通の見た目（画像の土台） */
const BASE_STYLE = `
  html, body { margin: 0; background: #f3f4f6; }
  body { padding: 40px; font-family: ${FONT_FAMILY}; color: #202124; }
  .card { background: #ffffff; border: 2px solid #dadce0; border-radius: 16px; padding: 36px 44px; }
`;

/**
 * 作る画像の一覧（ファイル名・大きさ・HTML の本文と追加の見た目）。
 */
const DEMO_IMAGES = [
  {
    fileName: '1-mail-ja.png',
    width: 1300,
    height: 860,
    style: `
      .card { font-size: 30px; line-height: 1.75; }
      .header { color: #5f6368; font-size: 26px; border-bottom: 2px solid #e8eaed; padding-bottom: 18px; margin-bottom: 22px; }
      .subject { color: #202124; font-size: 34px; font-weight: 700; }
    `,
    body: `
      <div class="card">
        <div class="header">
          <div class="subject">件名：【架空】秋の勉強会のご案内</div>
          <div>差出人：架空コミュニティ事務局</div>
        </div>
        <div>いつもお世話になっております。</div>
        <div>次回の勉強会を、下記のとおり開催します。</div>
        <br>
        <div>日時：10月22日(木)14時〜15時30分</div>
        <div>場所：オンライン（Zoom）</div>
        <div>参加URL：https://zoom.us/j/0000000000</div>
        <br>
        <div>ご参加をお待ちしております。</div>
      </div>`,
  },
  {
    fileName: '2-chat-ja.png',
    width: 1200,
    height: 720,
    style: `
      .chat { display: flex; flex-direction: column; gap: 26px; font-size: 30px; line-height: 1.6; }
      .row { display: flex; }
      .row.me { justify-content: flex-end; }
      .bubble { max-width: 820px; padding: 18px 26px; border-radius: 26px; background: #ffffff; border: 2px solid #dadce0; }
      .me .bubble { background: #d2f8d2; border-color: #b7e4b7; }
      .name { font-size: 22px; color: #5f6368; margin: 0 0 6px 10px; }
    `,
    body: `
      <div class="chat">
        <div><div class="name">架空 花子</div><div class="row"><div class="bubble">お疲れさまです！明日の15時から打ち合わせできますか？</div></div></div>
        <div class="row me"><div class="bubble">大丈夫です。場所はどこにしましょう？</div></div>
        <div><div class="name">架空 花子</div><div class="row"><div class="bubble">会議室Aでお願いします。1時間ほどの予定です。</div></div></div>
      </div>`,
  },
  {
    fileName: '3-notice-vertical.png',
    width: 640,
    height: 1100,
    style: `
      .card { height: 100%; box-sizing: border-box; writing-mode: vertical-rl; font-size: 44px; line-height: 1.9; }
      .title { font-weight: 700; }
    `,
    body: `
      <div class="card">
        <div class="title">定例会のお知らせ</div>
        <div>十月二十九日（木）午後二時から</div>
        <div>会場は第二会議室です</div>
      </div>`,
  },
  {
    fileName: '4-mail-en.png',
    width: 1300,
    height: 760,
    style: `
      .card { font-size: 30px; line-height: 1.75; }
      .subject { font-size: 34px; font-weight: 700; border-bottom: 2px solid #e8eaed; padding-bottom: 18px; margin-bottom: 22px; }
      .label { color: #5f6368; display: inline-block; width: 170px; }
    `,
    body: `
      <div class="card">
        <div class="subject">Subject: [Fictional] Weekly Sync</div>
        <div><span class="label">Date:</span>Thursday, October 29, 2026</div>
        <div><span class="label">Time:</span>2:00–3:00 PM</div>
        <div><span class="label">Location:</span>Room 101</div>
        <div><span class="label">Zoom:</span>https://zoom.us/j/1111111111</div>
        <br>
        <div>Looking forward to seeing you there.</div>
      </div>`,
  },
];

/**
 * 1枚の画像を作って保存する（描画用のプロセスを増やさないよう、同じ画面の中身を書き換えて撮影する）。
 *
 * @param {BrowserWindow} window 撮影に使う画面
 * @param {object} demoImage DEMO_IMAGES の要素
 */
async function renderDemoImage(window, demoImage) {
  window.setContentSize(demoImage.width, demoImage.height);
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${BASE_STYLE}${demoImage.style}</style></head><body>${demoImage.body}</body></html>`;
  await window.webContents.executeJavaScript(`document.open(); document.write(${JSON.stringify(html)}); document.close(); true;`);
  await new Promise((resolve) => setTimeout(resolve, 700)); // 書体の読み込みと描画を待つ
  const image = await window.webContents.capturePage();
  await writeFile(path.join(OUTPUT_DIR, demoImage.fileName), image.toPNG());
  console.log(`保存しました：${demoImage.fileName}（${image.getSize().width}×${image.getSize().height}）`);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: DEMO_IMAGES[0].width,
    height: DEMO_IMAGES[0].height,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  try {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await window.loadURL('data:text/html;charset=utf-8,%3C!doctype%20html%3E');
    for (const demoImage of DEMO_IMAGES) {
      await renderDemoImage(window, demoImage);
    }
  } catch (error) {
    console.error('画像を作れませんでした:', error);
    process.exitCode = 1;
  } finally {
    window.destroy();
    app.quit();
  }
});
