/**
 * captureController.js
 * 目的：範囲キャプチャから OCR までの流れを進める（要件§5.1・§6.1）。
 *   1. カーソルがある画面を撮影する（確認ウインドウは一時的に隠す）
 *   2. 範囲選択の画面に撮影した画面を暗く表示し、ドラッグで範囲を選んでもらう（Esc で中止）
 *   3. 選んだ範囲を切り出し、文字が小さい画面なら拡大して、OCR にかける
 *   4. 結果を確認ウインドウに送る
 *
 * 失敗したとき（要件§5.9）：
 *   範囲選択の画面を閉じ、取り込んだ画像を消し、OCR の作業を止め、確認ウインドウにエラーの内容を送って待機状態に戻る。
 *   アプリは終了しない。画像はファイルに保存しない（メモリの中だけ）。
 */

import { app, BrowserWindow, desktopCapturer, screen, systemPreferences } from 'electron';
import { OVERLAY_ENTRY_URL, isAppUrl } from './appProtocol.js';
import { CaptureError, getUpscaleFactor, toImageRect, validateSelection } from './captureGeometry.js';
import { SCREENSHOT_IMAGE_NAME, SELECTION_IMAGE_NAME } from './captureImageStore.js';
import { ORIENTATION_AUTO, OcrError, recognizeText } from './ocrEngine.js';

/** 確認ウインドウを隠してから撮影するまでの待ち時間（ミリ秒）。隠した画面が写り込まないようにする */
const HIDE_SETTLE_MS = 200;

/** 範囲選択の画面を開いたまま放置されたときに、自動で中止するまでの時間（ミリ秒） */
const OVERLAY_TIMEOUT_MS = 120_000;

/** 確信度がこれ未満なら「精度が低い可能性がある」と知らせる（0〜100） */
export const LOW_CONFIDENCE_THRESHOLD = 40;

/** 確認ウインドウに表示する、選んだ範囲の画像の URL（版の番号を付けて表示を更新する） */
const SELECTION_IMAGE_URL = 'app://bundle/capture/selection.png';

/** 範囲選択の画面のパス（送信元の確認に使う） */
const OVERLAY_PATHNAME = '/overlay.html';

/** Mac で画面収録の許可がないときの文 */
const SCREEN_PERMISSION_MESSAGE =
  '画面を取り込む許可がありません。Mac の「システム設定」→「プライバシーとセキュリティ」→「画面収録とシステムオーディオ録音」で、' +
  'このアプリ（ターミナルから起動した場合はターミナル）を許可してから、アプリを起動し直してください。';

/** 画面を撮影できなかったときの文 */
const CAPTURE_FAILED_MESSAGE = '画面を取り込めませんでした。もう一度お試しください。';

/** 予期しないエラーのときの文（内容は含めない） */
const UNEXPECTED_ERROR_MESSAGE = '画面の取り込みでエラーが発生しました。もう一度お試しください。';

/**
 * 指定した時間だけ待つ。
 *
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * 範囲キャプチャの処理を作る。
 *
 * @param {object} dependencies
 * @param {ReturnType<import('./captureImageStore.js').createCaptureImageStore>} dependencies.imageStore 取り込んだ画像の置き場所
 * @param {() => Electron.BrowserWindow | null} dependencies.getMainWindow 確認ウインドウを返す
 * @param {() => void} dependencies.showMainWindow 確認ウインドウを表示する
 * @param {(status: object) => void} dependencies.sendStatus 進み具合と結果を確認ウインドウに送る
 * @param {string} dependencies.overlayPreloadPath 範囲選択の画面の preload のパス
 * @param {object} dependencies.webPreferences 画面の安全な設定（security.js の SECURE_WEB_PREFERENCES）
 */
export function createCaptureController({
  imageStore,
  getMainWindow,
  showMainWindow,
  sendStatus,
  overlayPreloadPath,
  webPreferences,
}) {
  /** 範囲の選択または読み取りの途中か（重ねて始めないようにする） */
  let isBusy = false;
  /** 範囲選択の画面（開いていなければ null） */
  let overlayWindow = null;
  /** 範囲の選択の結果を待っている状態（待っていなければ null）{resolve, reject, timer, display} */
  let pendingSelection = null;
  /** 確認ウインドウに表示中の画像の版（読み直しでも同じ画像を表示する） */
  let selectionVersion = 0;

  /**
   * IPC の送信元が、範囲選択の画面（最上位のフレーム、app://bundle/overlay.html）かを調べる。
   *
   * @param {Electron.IpcMainInvokeEvent} event
   * @returns {boolean}
   */
  function isOverlaySender(event) {
    const frame = event.senderFrame;
    if (overlayWindow === null || overlayWindow.isDestroyed() || event.sender !== overlayWindow.webContents) {
      return false;
    }
    return frame !== null && frame.parent === null && isAppUrl(frame.url) && new URL(frame.url).pathname === OVERLAY_PATHNAME;
  }

  /**
   * 範囲の選択の待ちを終える。
   *
   * @param {object | null | Error} value 選んだ範囲、中止なら null、失敗ならエラー
   */
  function settleSelection(value) {
    if (pendingSelection === null) {
      return;
    }
    const { resolve, reject, timer } = pendingSelection;
    clearTimeout(timer);
    pendingSelection = null;
    if (value instanceof Error) {
      reject(value);
    } else {
      resolve(value);
    }
  }

  /** 範囲選択の画面を閉じる（画面に暗い表示を残さない） */
  function closeOverlay() {
    if (overlayWindow !== null && !overlayWindow.isDestroyed()) {
      overlayWindow.destroy();
    }
    overlayWindow = null;
  }

  /**
   * Mac の画面収録の許可を確かめる。
   *
   * @param {'before' | 'after'} stage 撮影の前（拒否されていれば止める）か、後（許可されていなければ止める）か
   */
  function ensureScreenPermission(stage) {
    if (process.platform !== 'darwin') {
      return;
    }
    const status = systemPreferences.getMediaAccessStatus('screen');
    const isDenied = stage === 'before' ? status === 'denied' || status === 'restricted' : status !== 'granted';
    if (isDenied) {
      throw new CaptureError(SCREEN_PERMISSION_MESSAGE);
    }
  }

  /**
   * 画面を撮影する。
   *
   * @param {Electron.Display} display 撮影する画面
   * @returns {Promise<Electron.NativeImage>}
   */
  async function captureDisplay(display) {
    const thumbnailSize = {
      width: Math.round(display.bounds.width * display.scaleFactor),
      height: Math.round(display.bounds.height * display.scaleFactor),
    };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
    const source =
      sources.find((candidate) => candidate.display_id === String(display.id)) ??
      (sources.length === 1 ? sources[0] : undefined);
    if (source === undefined || source.thumbnail.isEmpty()) {
      throw new CaptureError(CAPTURE_FAILED_MESSAGE);
    }
    return source.thumbnail;
  }

  /**
   * 範囲選択の画面を開き、範囲が選ばれるか中止されるまで待つ。
   *
   * @param {Electron.Display} display 範囲選択の画面を出す画面
   * @returns {Promise<{x: number, y: number, width: number, height: number} | null>} 中止なら null
   */
  function selectRegion(display) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => settleSelection(null), OVERLAY_TIMEOUT_MS); // 放置されたら中止
      pendingSelection = { resolve, reject, timer, display };

      const window = new BrowserWindow({
        ...display.bounds,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        enableLargerThanScreen: true,
        show: false,
        backgroundColor: '#000000',
        title: '読み取る範囲を選択',
        webPreferences: { ...webPreferences, preload: overlayPreloadPath },
      });
      overlayWindow = window;
      window.setAlwaysOnTop(true, 'screen-saver');
      window.once('ready-to-show', () => {
        if (window.isDestroyed()) return;
        window.show();
        if (process.platform === 'darwin') {
          app.focus({ steal: true }); // ほかのアプリの上で Esc キーを受け取れるようにする
        }
        window.focus();
      });
      window.on('closed', () => {
        if (overlayWindow === window) overlayWindow = null;
        settleSelection(null); // 何らかの理由で閉じられたら中止として扱う
      });
      window.loadURL(OVERLAY_ENTRY_URL).catch(() => settleSelection(new CaptureError(CAPTURE_FAILED_MESSAGE)));
    });
  }

  /**
   * 撮影した画像から選んだ範囲を切り出し、文字が小さい画面なら拡大する。
   *
   * @param {Electron.NativeImage} screenshot 撮影した画像
   * @param {{x: number, y: number, width: number, height: number}} selection 選んだ範囲（画面の座標）
   * @param {Electron.Display} display 撮影した画面
   * @returns {Electron.NativeImage}
   */
  function cropForOcr(screenshot, selection, display) {
    const displaySize = { width: display.bounds.width, height: display.bounds.height };
    const imageSize = screenshot.getSize();
    const rect = toImageRect(selection, displaySize, imageSize);
    if (rect.width < 1 || rect.height < 1) {
      throw new CaptureError('範囲が小さすぎます。もう少し大きく選んでください。');
    }
    const cropped = screenshot.crop(rect);
    const factor = getUpscaleFactor(displaySize, imageSize);
    return factor === 1
      ? cropped
      : cropped.resize({ width: rect.width * factor, height: rect.height * factor, quality: 'best' });
  }

  /**
   * 画像を OCR にかけ、結果を確認ウインドウに送る。
   *
   * @param {Buffer} png 選んだ範囲の画像
   * @param {string} orientation 読み取りの向き
   */
  async function runOcr(png, orientation) {
    sendStatus({ state: 'reading' });
    const result = await recognizeText(png, { orientation });
    sendStatus({
      state: 'done',
      text: result.text,
      orientation: result.orientation,
      confidence: Math.round(result.confidence),
      isLowConfidence: result.confidence < LOW_CONFIDENCE_THRESHOLD,
      imageUrl: `${SELECTION_IMAGE_URL}?v=${selectionVersion}`,
    });
  }

  /**
   * 失敗したときの後始末をして、エラーの内容を確認ウインドウに送る（要件§5.9）。
   *
   * @param {unknown} error 起きたエラー
   * @param {{keepSelection?: boolean}} [options] 読み直しの失敗なら、画像は残して別の向きで読み直せるようにする
   * @returns {{ok: false, message: string}}
   */
  function fail(error, { keepSelection = false } = {}) {
    closeOverlay();
    if (keepSelection) {
      imageStore.delete(SCREENSHOT_IMAGE_NAME);
    } else {
      imageStore.clear();
      selectionVersion = 0;
    }
    showMainWindow();
    const isExpected = error instanceof CaptureError || error instanceof OcrError;
    if (!isExpected) {
      console.error('範囲キャプチャに失敗しました:', error?.name); // 画像や文章の内容は記録しない
    }
    const message = isExpected ? error.message : UNEXPECTED_ERROR_MESSAGE;
    sendStatus({ state: 'error', message });
    return { ok: false, message };
  }

  return {
    /** 範囲の選択または読み取りの途中か */
    isBusy() {
      return isBusy;
    },

    /**
     * 範囲キャプチャを始める（ホットキー・トレイのメニュー・確認ウインドウのボタンから呼ぶ）。
     *
     * @returns {Promise<{ok: boolean, cancelled?: boolean, message?: string}>}
     */
    async startCapture() {
      if (isBusy) {
        if (overlayWindow !== null && !overlayWindow.isDestroyed()) overlayWindow.focus();
        return { ok: false, message: '範囲の選択または読み取りの途中です。' };
      }
      isBusy = true;
      const mainWindow = getMainWindow();
      const wasMainWindowVisible = mainWindow !== null && !mainWindow.isDestroyed() && mainWindow.isVisible();
      try {
        ensureScreenPermission('before');
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        if (wasMainWindowVisible) {
          mainWindow.hide(); // 確認ウインドウが写り込まないように隠す
          await delay(HIDE_SETTLE_MS);
        }
        const screenshot = await captureDisplay(display);
        ensureScreenPermission('after');
        imageStore.set(SCREENSHOT_IMAGE_NAME, screenshot.toPNG());

        const selection = await selectRegion(display);
        closeOverlay();
        imageStore.delete(SCREENSHOT_IMAGE_NAME); // 範囲を選んだら、画面全体の画像はすぐ消す
        if (selection === null) {
          if (wasMainWindowVisible) showMainWindow();
          sendStatus({ state: 'cancelled' });
          return { ok: true, cancelled: true };
        }

        const png = cropForOcr(screenshot, selection, display).toPNG();
        selectionVersion = imageStore.set(SELECTION_IMAGE_NAME, png);
        showMainWindow();
        await runOcr(png, ORIENTATION_AUTO);
        return { ok: true };
      } catch (error) {
        return fail(error);
      } finally {
        closeOverlay();
        settleSelection(null);
        imageStore.delete(SCREENSHOT_IMAGE_NAME);
        isBusy = false;
      }
    },

    /**
     * 取り込んだ画像を、向きを指定して読み直す（「横書き／縦書きで読み直す」）。
     *
     * @param {string} orientation 'auto' / 'horizontal' / 'vertical'
     * @returns {Promise<{ok: boolean, message?: string}>}
     */
    async rereadSelection(orientation) {
      if (isBusy) {
        return { ok: false, message: '範囲の選択または読み取りの途中です。' };
      }
      const png = imageStore.get(SELECTION_IMAGE_NAME);
      if (png === null) {
        const message = '読み直す画像がありません。範囲を選び直してください。';
        sendStatus({ state: 'error', message });
        return { ok: false, message };
      }
      isBusy = true;
      try {
        await runOcr(png, orientation);
        return { ok: true };
      } catch (error) {
        return fail(error, { keepSelection: true });
      } finally {
        isBusy = false;
      }
    },

    /** 取り込んだ画像をすべて消す（クリア・確認ウインドウを閉じたとき・終了時） */
    clearCapture() {
      imageStore.clear();
      selectionVersion = 0;
    },

    /** IPC の送信元が範囲選択の画面か（isOverlaySender の説明を参照） */
    isOverlaySender,

    /**
     * 範囲選択の画面から届いた範囲を検証し、待っている処理に渡す。
     *
     * @param {Electron.IpcMainInvokeEvent} event
     * @param {unknown} rawSelection 範囲選択の画面の座標の矩形
     * @returns {{ok: boolean}}
     */
    handleOverlaySelect(event, rawSelection) {
      if (!isOverlaySender(event) || pendingSelection === null) {
        return { ok: false };
      }
      const { display } = pendingSelection;
      try {
        settleSelection(validateSelection(rawSelection, { width: display.bounds.width, height: display.bounds.height }));
      } catch (error) {
        settleSelection(error);
      }
      return { ok: true };
    },

    /**
     * 範囲選択の画面から中止が届いた。
     *
     * @param {Electron.IpcMainInvokeEvent} event
     * @returns {{ok: boolean}}
     */
    handleOverlayCancel(event) {
      if (!isOverlaySender(event)) {
        return { ok: false };
      }
      settleSelection(null);
      return { ok: true };
    },
  };
}
