/**
 * NoDateDialog.jsx
 * 目的：日時が見つからなかったときに「日時の情報がありません」と知らせ、その場で日時を手入力できるようにする（要件§5.8）。
 *   - 日付（必須）・開始時刻（任意）・終了時刻（任意）を入れて「追加する」を押すと、候補にチェック付きで加わる
 *   - 時刻を入れなければ終日、終了時刻を空にすると開始から既定の長さ（60分）になる
 * 次に何をすればよいかが分かるよう、入力欄と説明をポップアップの中にまとめている（依頼者の指摘）。
 *
 * HTML 標準の <dialog> を使う。開いている間は後ろの画面を操作できず、Esc キーでも閉じられる。
 */

import { useEffect, useRef, useState } from 'react';
import { parseDateInput, parseTimeInput } from '../../core/registration.js';

/** 対応している書き方の例（利用者が書き方を確かめられるように表示する） */
const SUPPORTED_FORMAT_EXAMPLES = ['10/15 14:00', '10月15日(木)14時〜15時', '2026/10/15', '明日', '来週火曜', 'Oct 15 at 3pm'];

/**
 * 「日時の情報がありません」のポップアップ（手入力の欄付き）。
 *
 * @param {object} props
 * @param {boolean} props.open 表示するか
 * @param {() => void} props.onClose 閉じたときの処理
 * @param {(entry: {date: {year: number, month: number, day: number}, startTime: string, endTime: string}) => void} props.onAddManual
 *   「追加する」を押したときの処理（このあとダイアログを閉じる）
 * @param {number} props.defaultDurationMinutes 終了時刻が空のときの予定の長さ（分）
 * @returns {JSX.Element}
 */
export default function NoDateDialog({ open, onClose, onAddManual, defaultDurationMinutes }) {
  /** <dialog> 要素への参照（showModal / close を呼ぶため） */
  const dialogRef = useRef(null);
  /** 日付欄の値（YYYY-MM-DD） */
  const [dateValue, setDateValue] = useState('');
  /** 開始時刻の欄の値（HH:MM。空なら終日） */
  const [startTimeValue, setStartTimeValue] = useState('');
  /** 終了時刻の欄の値（HH:MM。空なら既定の長さ） */
  const [endTimeValue, setEndTimeValue] = useState('');

  // open の値に合わせて、ダイアログを開く／閉じる。開くときは入力欄を空にする
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      setDateValue('');
      setStartTimeValue('');
      setEndTimeValue('');
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const date = parseDateInput(dateValue);
  const startTime = parseTimeInput(startTimeValue);
  const endTime = parseTimeInput(endTimeValue);
  /** 終了時刻が開始時刻以前になっているか（その場で知らせる） */
  const isEndBeforeStart =
    startTime !== null && endTime !== null && endTime.hour * 60 + endTime.minute <= startTime.hour * 60 + startTime.minute;
  const canAdd = date !== null && !isEndBeforeStart;

  /** 「追加する」：入力した日時を候補に加えて、ダイアログを閉じる */
  function handleAdd() {
    if (!canAdd) {
      return;
    }
    onAddManual({ date, startTime: startTime === null ? '' : startTimeValue, endTime: startTime === null || endTime === null ? '' : endTimeValue });
    dialogRef.current?.close();
  }

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} aria-labelledby="no-date-dialog-title">
      <h2 id="no-date-dialog-title" className="dialog-title">
        日時の情報がありません
      </h2>
      <p>文章から日付・時刻を見つけられませんでした。</p>
      <p className="dialog-step">日時を入れて「追加する」を押すと、候補に加わります。</p>

      <div className="dialog-fields">
        <label className="dialog-field">
          日付（必須）
          <input
            id="dialog-manual-date"
            type="date"
            className="text-field"
            value={dateValue}
            onChange={(event) => setDateValue(event.target.value)}
          />
        </label>
        <label className="dialog-field">
          開始時刻（任意）
          <input
            id="dialog-manual-start"
            type="time"
            className="text-field"
            value={startTimeValue}
            onChange={(event) => setStartTimeValue(event.target.value)}
          />
        </label>
        <label className="dialog-field">
          終了時刻（任意）
          <input
            id="dialog-manual-end"
            type="time"
            className="text-field"
            value={endTimeValue}
            disabled={startTime === null}
            onChange={(event) => setEndTimeValue(event.target.value)}
          />
        </label>
      </div>
      <p className="field-note">
        時刻を入れなければ終日の予定になります。終了時刻が空なら、開始から {defaultDurationMinutes} 分です。
      </p>
      {isEndBeforeStart && <p className="field-note field-note-error">終了時刻は開始時刻より後にしてください。</p>}

      <p className="dialog-note">文章で認識できる書き方の例：{SUPPORTED_FORMAT_EXAMPLES.join('、')}</p>
      <div className="button-row button-row-end">
        <button type="button" className="button button-secondary" onClick={() => dialogRef.current?.close()}>
          閉じる
        </button>
        <button type="button" className="button button-primary" onClick={handleAdd} disabled={!canAdd}>
          追加する
        </button>
      </div>
    </dialog>
  );
}
