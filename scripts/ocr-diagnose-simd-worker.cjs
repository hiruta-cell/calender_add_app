/**
 * ocr-diagnose-simd-worker.cjs
 * 目的：OCR の診断（scripts/ocr-diagnose.js）で、Tesseract の部品を「relaxed SIMD を使わない版」に差し替えて読ませるための
 * 作業スレッドのスクリプト（2026-10-12：Windows でだけ縦書きが文字化けする原因の切り分け）。
 *
 * tesseract.js は、CPU が対応していれば relaxed SIMD 版の部品（tesseract-core-relaxedsimd…）を選ぶ。
 * relaxed SIMD は、CPU の種類（Apple 製・Intel/AMD 製）で計算の結果が違ってよい命令のため、ここでは普通の SIMD 版
 * （tesseract-core-simd…）を読み込ませて、結果を比べられるようにする。
 *
 * 注意：アプリ本体は使わない（診断の時だけ使う）。読み込む部品の名前を書き換えるだけで、ほかの動きは変えない。
 */

const Module = require('node:module');
const path = require('node:path');

/** 差し替える部品の名前の先頭（relaxed SIMD 版） */
const RELAXED_SIMD_CORE_PREFIX = 'tesseract.js-core/tesseract-core-relaxedsimd';

const originalResolveFilename = Module._resolveFilename;

/**
 * 部品の名前を解決するときに、relaxed SIMD 版を普通の SIMD 版に置き換える。
 *
 * @param {string} request 読み込む部品の名前
 * @param {...unknown} rest Node.js が渡す残りの引数
 * @returns {string} 部品のファイルの場所
 */
Module._resolveFilename = function resolveWithoutRelaxedSimd(request, ...rest) {
  const target = typeof request === 'string' && request.startsWith(RELAXED_SIMD_CORE_PREFIX) ? request.replace('relaxedsimd', 'simd') : request;
  return originalResolveFilename.call(this, target, ...rest);
};

// tesseract.js 本来の作業スレッドのスクリプトを読み込む（package.json の場所から求める）
require(path.join(path.dirname(require.resolve('tesseract.js/package.json')), 'src', 'worker-script', 'node', 'index.js'));
