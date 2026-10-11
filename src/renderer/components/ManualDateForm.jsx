/**
 * ManualDateForm.jsx
 * 目的：日時を手入力して候補に追加する欄（要件§5.8）。抽出で見つからなかった日時を補うときにも使う。
 */

import { useState } from 'react';
import { parseDateInput } from '../../core/registration.js';

/**
 * 手入力の日付欄と「追加」ボタン。追加した日付は「日付だけの候補」になり、終日か時刻指定かを選べる。
 *
 * @param {object} props
 * @param {(date: {year: number, month: number, day: number}) => void} props.onAdd 追加したときの処理
 * @param {boolean} props.disabled 候補が最大件数に達して、これ以上追加できないか
 * @returns {JSX.Element}
 */
export default function ManualDateForm({ onAdd, disabled }) {
  /** 日付欄の値（YYYY-MM-DD。未入力なら空文字） */
  const [dateValue, setDateValue] = useState('');
  const date = parseDateInput(dateValue);

  /** 「追加」：日付を候補に加え、日付欄を空に戻す */
  function handleAdd() {
    if (date === null) {
      return;
    }
    onAdd(date);
    setDateValue('');
  }

  return (
    <div className="manual-date-form">
      <label htmlFor="manual-date" className="field-label">
        日時を手入力で追加
      </label>
      <div className="manual-date-row">
        <input
          id="manual-date"
          type="date"
          className="text-field manual-date-input"
          value={dateValue}
          onChange={(event) => setDateValue(event.target.value)}
          disabled={disabled}
        />
        <button type="button" className="button button-secondary" onClick={handleAdd} disabled={disabled || date === null}>
          追加
        </button>
      </div>
      <p className="field-note">
        {disabled
          ? '候補が上限に達したため、これ以上追加できません。'
          : '日付を選んで「追加」を押すと、候補に加わります（時刻は、そのあと「終了」で長さを選ぶと入れられます）。'}
      </p>
    </div>
  );
}
