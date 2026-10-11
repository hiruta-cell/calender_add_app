/**
 * autoReset.test.js
 * 目的：登録のあとの「自動のクリア」の予約（src/core/autoReset.js）が、時間がたつとクリアし、
 *       先に操作されると取り消すことを確かめる（偽のタイマーと、Node.js の EventTarget を使う）。
 */

import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { describe, test } from 'node:test';
import {
  AUTO_RESET_DELAY_MS,
  AUTO_RESET_DELAY_SECONDS,
  USER_ACTIVITY_EVENTS,
  scheduleAutoReset,
} from '../src/core/autoReset.js';

/**
 * 操作のイベントの監視が、いくつ残っているかを数える（解除し忘れの確認）。
 *
 * @param {EventTarget} target
 * @returns {number}
 */
function countActivityListeners(target) {
  return USER_ACTIVITY_EVENTS.reduce((total, type) => total + getEventListeners(target, type).length, 0);
}

/**
 * 偽のタイマーと、呼ばれた回数の記録を用意して予約する。
 *
 * @returns {{target: EventTarget, calls: {reset: number, cancel: number}, timer: object, cancelSchedule: () => void}}
 */
function scheduleWithFakeTimer() {
  const target = new EventTarget();
  const calls = { reset: 0, cancel: 0 };
  const timer = { callback: null, delay: null, cleared: false };
  const cancelSchedule = scheduleAutoReset({
    activityTarget: target,
    onReset: () => { calls.reset += 1; },
    onCancel: () => { calls.cancel += 1; },
    setTimer: (callback, delay) => {
      timer.callback = callback;
      timer.delay = delay;
      return 'timer-1';
    },
    clearTimer: (timerId) => {
      if (timerId === 'timer-1') timer.cleared = true;
    },
  });
  return { target, calls, timer, cancelSchedule };
}

describe('自動のクリアの予約（依頼者の指示：登録から60秒）', () => {
  test('待つ時間は60秒', () => {
    assert.equal(AUTO_RESET_DELAY_SECONDS, 60);
    assert.equal(AUTO_RESET_DELAY_MS, 60_000);
    assert.equal(scheduleWithFakeTimer().timer.delay, AUTO_RESET_DELAY_MS);
  });

  test('時間がたつとクリアを1回だけ呼び、その後の操作では何も起きない', () => {
    const { target, calls, timer } = scheduleWithFakeTimer();
    timer.callback();
    target.dispatchEvent(new Event('keydown'));
    timer.callback(); // 万一2回呼ばれても、クリアは1回だけ
    assert.deepEqual(calls, { reset: 1, cancel: 0 });
    assert.equal(countActivityListeners(target), 0);
  });

  test('先に操作すると取り消し、タイマーも止める（クリアしない）', () => {
    for (const type of USER_ACTIVITY_EVENTS) {
      const { target, calls, timer } = scheduleWithFakeTimer();
      target.dispatchEvent(new Event(type));
      target.dispatchEvent(new Event(type)); // 2回目の操作では何も起きない
      timer.callback(); // 止めたタイマーが遅れて動いても、クリアしない
      assert.deepEqual(calls, { reset: 0, cancel: 1 }, type);
      assert.equal(timer.cleared, true, type);
      assert.equal(countActivityListeners(target), 0, type);
    }
  });

  test('ウインドウを戻すだけ（focus）やマウスを動かすだけでは取り消さない', () => {
    const { target, calls, timer } = scheduleWithFakeTimer();
    target.dispatchEvent(new Event('focus'));
    target.dispatchEvent(new Event('mousemove'));
    timer.callback();
    assert.deepEqual(calls, { reset: 1, cancel: 0 });
  });

  test('返した関数で予約をやめると、クリアも取り消しの知らせも呼ばない（何度呼んでもよい）', () => {
    const { target, calls, timer, cancelSchedule } = scheduleWithFakeTimer();
    assert.equal(countActivityListeners(target), USER_ACTIVITY_EVENTS.length); // 予約中は監視している
    cancelSchedule();
    assert.equal(countActivityListeners(target), 0);
    cancelSchedule();
    target.dispatchEvent(new Event('pointerdown'));
    timer.callback();
    assert.deepEqual(calls, { reset: 0, cancel: 0 });
    assert.equal(timer.cleared, true);
  });

  test('本物のタイマーでも、時間がたつとクリアする', async () => {
    const target = new EventTarget();
    let resetCount = 0;
    await new Promise((resolve) => {
      scheduleAutoReset({
        activityTarget: target,
        onReset: () => { resetCount += 1; resolve(); },
        onCancel: () => {},
        delayMs: 10,
      });
    });
    assert.equal(resetCount, 1);
  });
});
