/**
 * vite.config.js
 * 目的：画面（React）を dist/renderer にビルドする設定。
 *
 * 開発用サーバー（vite dev）は使わない。ビルドしたファイルをメインプロセスが app:// で配信する。
 * 開発用サーバーを使うと、localhost の通信やインラインスクリプトを許可する必要があり、
 * セキュリティ設定（CSP）を緩めることになるため（CLAUDE.md のセキュリティ方針）。
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // 画面のソースの置き場所（index.html がある場所）
  root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
  // 読み込むファイルを相対パスで書き出す（app://bundle/ のどこからでも解決できるように）
  base: './',
  // public フォルダは使わない
  publicDir: false,
  // JSX を React 17 以降の方式（import React が不要な方式）で変換する
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/renderer', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    // Electron の Chromium は modulepreload に対応しているため、補助コードを入れない
    modulePreload: { polyfill: false },
  },
});
