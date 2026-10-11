/**
 * overlay.js
 * 目的：範囲選択の画面の動作。ドラッグで範囲を選び、メインプロセスに送る。Esc・右クリックで中止する。
 *
 * メインプロセスとのやり取りは、preload（electron/overlayPreload.cjs）が公開する
 * window.captureOverlay.select / cancel の2つだけを使う。
 */

import './overlay.css';

/** 選べる範囲の最小の幅・高さ（electron/captureGeometry.js の MIN_SELECTION_SIZE と同じ値） */
const MIN_SELECTION_SIZE = 8;

/** 撮影した画面の画像（メモリの中にあり、app:// で配信される） */
const SCREENSHOT_URL = './capture/screenshot.png';

const screenshotElement = document.getElementById('screenshot');
const maskElement = document.getElementById('mask');
const selectionElement = document.getElementById('selection');
const guideElement = document.getElementById('guide');

/** ドラッグを始めた位置（ドラッグ中でなければ null） */
let dragStart = null;

/** 選び終えて送ったか（二重に送らないようにする） */
let isFinished = false;

/**
 * ドラッグの開始位置と現在位置から、範囲の矩形を作る。
 *
 * @param {{x: number, y: number}} start 開始位置
 * @param {{x: number, y: number}} current 現在位置
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function toRect(start, current) {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

/**
 * 選んでいる範囲を画面に描く。
 *
 * @param {{x: number, y: number, width: number, height: number}} rect
 */
function drawSelection(rect) {
  selectionElement.style.left = `${rect.x}px`;
  selectionElement.style.top = `${rect.y}px`;
  selectionElement.style.width = `${rect.width}px`;
  selectionElement.style.height = `${rect.height}px`;
}

/**
 * 範囲の選択をやり直せる状態に戻す（小さすぎる範囲を選んだときなど）。
 */
function resetSelection() {
  dragStart = null;
  selectionElement.hidden = true;
  maskElement.hidden = false;
  guideElement.hidden = false;
}

/**
 * 中止して、メインプロセスに知らせる（範囲選択の画面はメインプロセスが閉じる）。
 */
function cancel() {
  if (isFinished) {
    return;
  }
  isFinished = true;
  window.captureOverlay.cancel();
}

window.addEventListener('pointerdown', (event) => {
  if (isFinished) {
    return;
  }
  if (event.button !== 0) {
    cancel(); // 右クリックなどは中止
    return;
  }
  dragStart = { x: event.clientX, y: event.clientY };
  maskElement.hidden = true;
  guideElement.hidden = true;
  selectionElement.hidden = false;
  drawSelection(toRect(dragStart, dragStart));
});

window.addEventListener('pointermove', (event) => {
  if (dragStart !== null && !isFinished) {
    drawSelection(toRect(dragStart, { x: event.clientX, y: event.clientY }));
  }
});

window.addEventListener('pointerup', (event) => {
  if (dragStart === null || isFinished) {
    return;
  }
  const rect = toRect(dragStart, { x: event.clientX, y: event.clientY });
  if (rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
    resetSelection(); // クリックしただけ・小さすぎる範囲は、選び直してもらう
    return;
  }
  isFinished = true;
  window.captureOverlay.select(rect);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    cancel();
  }
});

window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  cancel();
});

screenshotElement.src = SCREENSHOT_URL;
