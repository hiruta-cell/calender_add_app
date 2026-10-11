/**
 * generate-demo-images.js（開発者用・デモ画像を作り直すときだけ実行するスクリプト）
 * 目的：読み取りテストと発表のデモに使う画像（架空の文面）を作り、demo/images/ に保存する。
 *   画面のきれいな文字（メール・チャット）のほか、OCR の想定である SNS の背景付きの画像や、
 *   カメラで撮った連絡状のような画像（傾き・影・ぼかし）も作る。
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
  // ---- SNS の画像・写真のような、背景や飾りのある画像（OCR の想定：依頼者の説明による） ----
  {
    fileName: '5-sns-flyer.png',
    width: 1080,
    height: 1080,
    style: `
      body { padding: 0; }
      .poster { width: 1080px; height: 1080px; box-sizing: border-box; padding: 110px 90px;
        background: linear-gradient(135deg, #ff9a8b 0%, #ff6a88 55%, #ff99ac 100%); position: relative; overflow: hidden;
        font-family: 'Hiragino Maru Gothic ProN', ${FONT_FAMILY}; color: #ffffff; text-shadow: 0 4px 10px rgb(120 0 40 / 45%); }
      .circle { position: absolute; border-radius: 50%; background: rgb(255 255 255 / 18%); }
      .title { font-size: 104px; font-weight: 700; line-height: 1.2; margin-bottom: 70px; }
      .line { font-size: 66px; line-height: 1.5; }
    `,
    body: `
      <div class="poster">
        <div class="circle" style="width:420px;height:420px;right:-120px;top:-100px"></div>
        <div class="circle" style="width:260px;height:260px;left:-80px;bottom:-60px"></div>
        <div class="title">秋のマルシェ<br>開催！</div>
        <div class="line">10月25日(日)</div>
        <div class="line">10:00〜16:00</div>
        <div class="line">架空公園 中央広場</div>
      </div>`,
  },
  {
    fileName: '6-sns-photo-text.png',
    width: 1080,
    height: 1080,
    style: `
      body { padding: 0; }
      .photo { width: 1080px; height: 1080px; position: relative; overflow: hidden; }
      .photo svg { position: absolute; inset: 0; }
      .text { position: absolute; left: 80px; right: 80px; top: 300px; color: #ffffff; font-weight: 700;
        text-shadow: 0 3px 8px rgb(0 0 0 / 70%); font-size: 70px; line-height: 1.55; }
      .big { font-size: 96px; }
    `,
    body: `
      <div class="photo">
        <svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="7"/>
              <feColorMatrix values="0.35 0.2 0.1 0 0.15  0.25 0.35 0.15 0 0.18  0.15 0.2 0.45 0 0.22  0 0 0 0 1"/></filter>
          </defs>
          <rect width="1080" height="1080" filter="url(#noise)"/>
          <rect width="1080" height="1080" fill="rgb(0 0 0 / 25%)"/>
        </svg>
        <div class="text"><div class="big">勉強会 開催決定！</div>11月7日(土) 13:30〜<br>オンライン開催</div>
      </div>`,
  },
  {
    fileName: '7-photo-notice.png',
    width: 1300,
    height: 1000,
    style: `
      body { padding: 0; background: radial-gradient(circle at 30% 30%, #8a8378, #4a453e); height: 1000px; overflow: hidden; }
      .paper { position: absolute; left: 150px; top: 120px; width: 1000px; height: 740px; box-sizing: border-box; padding: 70px 80px;
        background: linear-gradient(160deg, #fbf8f0 0%, #ece6d6 70%, #d9d1bd 100%); transform: rotate(-4deg);
        box-shadow: 0 30px 60px rgb(0 0 0 / 45%); filter: blur(0.6px);
        font-family: 'Hiragino Mincho ProN', 'Yu Mincho', serif; color: #2b2b2b; font-size: 44px; line-height: 1.9; }
      .title { font-size: 60px; text-align: center; margin-bottom: 40px; letter-spacing: 6px; }
    `,
    body: `
      <div class="paper">
        <div class="title">保護者会のお知らせ</div>
        <div>日時：十一月五日（水）午後二時〜三時</div>
        <div>場所：本校体育館</div>
        <div>持ち物：上履き</div>
      </div>`,
  },
  {
    fileName: '8-live-flyer.png',
    width: 1080,
    height: 1350,
    style: `
      body { padding: 0; }
      .flyer { width: 1080px; height: 1350px; position: relative; overflow: hidden; background: #0b0b18; }
      .flyer svg { position: absolute; inset: 0; }
      .text { position: absolute; left: 90px; right: 90px; top: 380px; color: #ffd84d; font-weight: 800;
        font-family: ${FONT_FAMILY}; text-shadow: 0 0 18px rgb(255 160 0 / 60%); }
      .title { font-size: 120px; letter-spacing: 8px; margin-bottom: 60px; }
      .line { font-size: 72px; line-height: 1.6; color: #ffffff; }
    `,
    body: `
      <div class="flyer">
        <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="light" cx="50%" cy="20%" r="70%"><stop offset="0%" stop-color="#5a2a8a"/><stop offset="100%" stop-color="#0b0b18"/></radialGradient>
            <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.08 0"/></filter>
          </defs>
          <rect width="1080" height="1350" fill="url(#light)"/>
          <rect width="1080" height="1350" filter="url(#grain)"/>
        </svg>
        <div class="text">
          <div class="title">LIVE 2026</div>
          <div class="line">11月14日(土)</div>
          <div class="line">開場 18:00／開演 18:30</div>
          <div class="line">架空ホール</div>
        </div>
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
