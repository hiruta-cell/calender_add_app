/**
 * autoReset.js
 * 目的：登録のあと、一定の時間（60秒）操作がなければ確認ウインドウの表示を初期状態に戻す「自動のクリア」を予約する
 *       （次の登録に備えるため。2026-10-11 依頼者の指示）。
 *
 * - 予約中に利用者が画面を操作した（クリック・キー入力・スクロール・貼り付け・ドロップ）ら、予約を取り消す。
 *   作業中の内容を消さないため。
 * - 画面（React）から切り離し、タイマーと操作のイベントを受け取る相手を引数で受け取るため、単体テストできる。
 * - 表示を消すと、文章・取り込んだ画像などの個人情報がメモリに残る時間も短くなる（CLAUDE.md：メモリ上のみ）。
 */

/** 1秒のミリ秒数 */
const MILLISECONDS_PER_SECOND = 1000;

/** 登録してから表示を自動でクリアするまでの秒数（依頼者の指示：60秒） */
export const AUTO_RESET_DELAY_SECONDS = 60;

/** 登録してから表示を自動でクリアするまでの時間（ミリ秒） */
export const AUTO_RESET_DELAY_MS = AUTO_RESET_DELAY_SECONDS * MILLISECONDS_PER_SECOND;

/**
 * 「利用者が操作した」とみなすイベント。どれかが起きたら、自動のクリアを取り消す。
 * ウインドウを戻す・切り替えるだけ（フォーカス）は操作とみなさない。
 */
export const USER_ACTIVITY_EVENTS = Object.freeze(['pointerdown', 'keydown', 'wheel', 'paste', 'drop']);

/**
 * 自動のクリアを予約する。時間がたつと onReset を、先に操作されると onCancel を1回だけ呼ぶ。
 *
 * @param {object} options
 * @param {EventTarget} options.activityTarget 操作のイベントを受け取る相手（画面では window）
 * @param {() => void} options.onReset 時間がたったときの処理（表示を初期状態に戻す）
 * @param {() => void} options.onCancel 操作されて予約を取り消したときの処理
 * @param {number} [options.delayMs] 待つ時間（ミリ秒）
 * @param {(callback: () => void, milliseconds: number) => unknown} [options.setTimer] タイマーを始める関数（テストでは偽物を渡す）
 * @param {(timerId: unknown) => void} [options.clearTimer] タイマーを止める関数
 * @returns {() => void} 予約を取り消す関数（タイマーと操作の監視を止める。onReset・onCancel は呼ばない。何度呼んでもよい）
 */
export function scheduleAutoReset({
  activityTarget,
  onReset,
  onCancel,
  delayMs = AUTO_RESET_DELAY_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let isScheduled = true;
  let timerId = null;

  /** タイマーと操作の監視を止める（1回目だけ効く） */
  const stop = () => {
    if (!isScheduled) {
      return false;
    }
    isScheduled = false;
    clearTimer(timerId);
    for (const type of USER_ACTIVITY_EVENTS) {
      // capture はオブジェクトで指定する（Node.js の EventTarget は true だけでは外れないため。ブラウザはどちらでも外れる）
      activityTarget.removeEventListener(type, handleActivity, { capture: true });
    }
    return true;
  };

  /** 操作されたら、予約を取り消す */
  function handleActivity() {
    if (stop()) {
      onCancel();
    }
  }

  for (const type of USER_ACTIVITY_EVENTS) {
    // capture：画面の部品がイベントを止めても気付けるように。passive：スクロールなどの動きを遅らせない
    activityTarget.addEventListener(type, handleActivity, { capture: true, passive: true });
  }
  timerId = setTimer(() => {
    if (stop()) {
      onReset();
    }
  }, delayMs);

  return () => {
    stop();
  };
}
