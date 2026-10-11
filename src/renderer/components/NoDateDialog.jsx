/**
 * NoDateDialog.jsx
 * 目的：日時が見つからなかったときに「日時の情報がありません」と知らせ、その場で日時を手入力できるようにする（要件§5.8）。
 *   - 日付（必須）・開始時刻（任意）・終了（開始から何分後か）を入れて「追加する」を押すと、候補にチェック付きで加わる
 *   - 時刻を入れなければ終日。終了は開始から30分〜23時間30分後（30分刻み）か終日を選ぶ（初めは設定の長さ）
 * 次に何をすればよいかが分かるよう、入力欄と説明をポップアップの中にまとめている（依頼者の指摘）。
 *
 * HTML 標準の <dialog> を使う。開いている間は後ろの画面を操作できず、Esc キーでも閉じられる。
 */

import { useEffect, useRef, useState } from 'react';
import { formatEndChoiceLabel } from '../../core/candidateFormatter.js';
import { END_CHOICE_ALL_DAY, END_DURATION_CHOICES, parseDateInput, parseTimeInput } from '../../core/registration.js';

/** 対応している書き方の例（利用者が書き方を確かめられるように表示する） */
const SUPPORTED_FORMAT_EXAMPLES = ['10/15 14:00', '10月15日(木)14時', '2026/10/15', '明日', '来週火曜', 'Oct 15 at 3pm'];

/**
 * 「日時の情報がありません」のポップアップ（手入力の欄付き）。
 *
 * @param {object} props
 * @param {boolean} props.open 表示するか
 * @param {() => void} props.onClose 閉じたときの処理
 * @param {(entry: {date: {year: number, month: number, day: number}, startTime: string, end: string | number}) => void} props.onAddManual
 *   「追加する」を押したときの処理（このあとダイアログを閉じる）。開始時刻が空なら end は終日
 * @param {number} props.defaultDurationMinutes 設定の予定の長さ（分。終了の初めの選択）
 * @returns {JSX.Element}
 */
export default function NoDateDialog({ open, onClose, onAddManual, defaultDurationMinutes }) {
  /** <dialog> 要素への参照（showModal / close を呼ぶため） */
  const dialogRef = useRef(null);
  /** 日付欄の値（YYYY-MM-DD） */
  const [dateValue, setDateValue] = useState('');
  /** 開始時刻の欄の値（HH:MM。空なら終日） */
  const [startTimeValue, setStartTimeValue] = useState('');
  /** 終了の選択（END_CHOICE_ALL_DAY か開始からの長さ（分）） */
  const [endChoice, setEndChoice] = useState(defaultDurationMinutes);

  // open の値に合わせて、ダイアログを開く／閉じる。開くときは入力欄を空にする
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      setDateValue('');
      setStartTimeValue('');
      setEndChoice(defaultDurationMinutes);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, defaultDurationMinutes]);

  const date = parseDateInput(dateValue);
  const startTime = parseTimeInput(startTimeValue);
  /** 一覧の各項目に終了時刻を添えるための開始日時（日付と開始時刻がそろってから） */
  const start = date !== null && startTime !== null ? { ...date, ...startTime } : null;
  const canAdd = date !== null;

  /** 「追加する」：入力した日時を候補に加えて、ダイアログを閉じる */
  function handleAdd() {
    if (!canAdd) {
      return;
    }
    onAddManual({ date, startTime: startTime === null ? '' : startTimeValue, end: startTime === null ? END_CHOICE_ALL_DAY : endChoice });
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
          終了
          <select
            id="dialog-manual-end"
            className="text-field"
            value={String(endChoice)}
            disabled={startTime === null}
            onChange={(event) =>
              setEndChoice(event.target.value === END_CHOICE_ALL_DAY ? END_CHOICE_ALL_DAY : Number(event.target.value))
            }
          >
            {END_DURATION_CHOICES.map((minutes) => (
              <option key={minutes} value={String(minutes)}>
                {formatEndChoiceLabel(minutes, start)}
              </option>
            ))}
            <option value={END_CHOICE_ALL_DAY}>終日</option>
          </select>
        </label>
      </div>
      <p className="field-note">
        開始時刻を入れなければ終日の予定になります。終了は、開始から何時間後かを選びます。
      </p>

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
