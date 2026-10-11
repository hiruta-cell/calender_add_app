/**
 * capture.test.js
 * 目的：範囲キャプチャの座標の計算（electron/captureGeometry.js）と、
 *       取り込んだ画像の置き場所（electron/captureImageStore.js）を確かめる。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CaptureError,
  MIN_SELECTION_SIZE,
  getUpscaleFactor,
  toImageRect,
  validateSelection,
} from '../electron/captureGeometry.js';
import {
  SCREENSHOT_IMAGE_NAME,
  SELECTION_IMAGE_NAME,
  createCaptureImageStore,
  getCaptureImageName,
} from '../electron/captureImageStore.js';

/** 範囲選択の画面の大きさ（テスト用） */
const VIEWPORT = { width: 1440, height: 900 };

describe('validateSelection：範囲選択の検証', () => {
  test('画面の中の範囲はそのまま', () => {
    assert.deepEqual(validateSelection({ x: 10, y: 20, width: 300, height: 100 }, VIEWPORT), { x: 10, y: 20, width: 300, height: 100 });
  });

  test('画面の外にはみ出した部分は切り詰める', () => {
    assert.deepEqual(validateSelection({ x: -50, y: 800, width: 200, height: 300 }, VIEWPORT), { x: 0, y: 800, width: 150, height: 100 });
  });

  test(`幅・高さが ${MIN_SELECTION_SIZE} 未満なら CaptureError（範囲が小さすぎる）`, () => {
    assert.throws(() => validateSelection({ x: 10, y: 10, width: MIN_SELECTION_SIZE - 1, height: 100 }, VIEWPORT), CaptureError);
    assert.throws(() => validateSelection({ x: 1439, y: 10, width: 100, height: 100 }, VIEWPORT), CaptureError);
  });

  test('形式が正しくない値は CaptureError', () => {
    for (const bad of [null, 'rect', { x: 1, y: 2, width: 'a', height: 4 }, { x: Number.NaN, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: Infinity, height: 100 }]) {
      assert.throws(() => validateSelection(bad, VIEWPORT), CaptureError);
    }
  });
});

describe('toImageRect：画面の座標 → 画像の画素', () => {
  test('Retina（2倍）の画面では座標が2倍になる', () => {
    assert.deepEqual(
      toImageRect({ x: 10, y: 20, width: 300, height: 100 }, VIEWPORT, { width: 2880, height: 1800 }),
      { x: 20, y: 40, width: 600, height: 200 },
    );
  });

  test('拡大率 125% の画面（端数）は、範囲が欠けないよう外側に丸める', () => {
    assert.deepEqual(
      toImageRect({ x: 1, y: 1, width: 3, height: 3 }, { width: 100, height: 100 }, { width: 125, height: 125 }),
      { x: 1, y: 1, width: 4, height: 4 },
    );
  });

  test('画像の外にははみ出さない', () => {
    assert.deepEqual(
      toImageRect({ x: 1400, y: 850, width: 40, height: 50 }, VIEWPORT, { width: 1440, height: 900 }),
      { x: 1400, y: 850, width: 40, height: 50 },
    );
  });
});

describe('getUpscaleFactor：OCR の前の拡大', () => {
  test('等倍の画面（Windows 100% など）は2倍に拡大し、Retina（2倍）は拡大しない', () => {
    assert.equal(getUpscaleFactor(VIEWPORT, { width: 1440 }), 2);
    assert.equal(getUpscaleFactor(VIEWPORT, { width: 1800 }), 2); // 125%
    assert.equal(getUpscaleFactor(VIEWPORT, { width: 2880 }), 1);
  });
});

describe('createCaptureImageStore：取り込んだ画像の置き場所（メモリだけ）', () => {
  test('置く・取り出す・消す。置くたびに版が上がる', () => {
    const store = createCaptureImageStore();
    const first = store.set(SELECTION_IMAGE_NAME, Buffer.from('a'));
    const second = store.set(SELECTION_IMAGE_NAME, Buffer.from('b'));
    assert.ok(second > first);
    assert.equal(store.get(SELECTION_IMAGE_NAME).toString(), 'b');
    store.delete(SELECTION_IMAGE_NAME);
    assert.equal(store.get(SELECTION_IMAGE_NAME), null);
  });

  test('clear ですべて消える', () => {
    const store = createCaptureImageStore();
    store.set(SCREENSHOT_IMAGE_NAME, Buffer.from('a'));
    store.set(SELECTION_IMAGE_NAME, Buffer.from('b'));
    store.clear();
    assert.equal(store.get(SCREENSHOT_IMAGE_NAME), null);
    assert.equal(store.get(SELECTION_IMAGE_NAME), null);
  });

  test('決めた名前以外・画像でない値は置けない', () => {
    const store = createCaptureImageStore();
    assert.throws(() => store.set('../secret.png', Buffer.from('a')), TypeError);
    assert.throws(() => store.set(SELECTION_IMAGE_NAME, 'text'), TypeError);
  });
});

describe('getCaptureImageName：配信する画像の URL の判定', () => {
  test('決めた名前の画像だけを受け付ける（版の番号は無視）', () => {
    assert.equal(getCaptureImageName('app://bundle/capture/selection.png?v=3'), SELECTION_IMAGE_NAME);
    assert.equal(getCaptureImageName('app://bundle/capture/screenshot.png'), SCREENSHOT_IMAGE_NAME);
  });

  test('それ以外は null', () => {
    for (const url of [
      'app://bundle/capture/other.png',
      'app://bundle/capture/../index.html',
      'app://bundle/capture/selection.png/extra',
      'app://bundle/index.html',
      'not a url',
    ]) {
      assert.equal(getCaptureImageName(url), null, url);
    }
  });
});
