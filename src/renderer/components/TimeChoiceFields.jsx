/**
 * TimeChoiceFields.jsx
 * 目的：候補ごとに、予定の終了を「開始から30分〜23時間30分後（30分刻み）」か「終日」から選ぶ欄
 * （2026-10-12 依頼者の仕様変更。終了は文章・画像から読み取らない）。
 * 日付だけの候補で長さを選んだときは、開始時刻の入力欄も出す（初めの選択は終日。要件§5.10）。
 */

import { formatEndChoiceLabel } from '../../core/candidateFormatter.js';
import { END_CHOICE_ALL_DAY, END_DURATION_CHOICES, parseTimeInput } from '../../core/registration.js';

/** 終了の一覧に出す「終日」の文字 */
const ALL_DAY_LABEL = '終日';

/**
 * 一覧で選んだ値（文字列）を、終了の選択の値（END_CHOICE_ALL_DAY か長さ（分））に戻す。
 *
 * @param {string} value <select> の値
 * @returns {string | number}
 */
function toEndChoice(value) {
  return value === END_CHOICE_ALL_DAY ? END_CHOICE_ALL_DAY : Number(value);
}

/**
 * 終了の選択（と、日付だけの候補の開始時刻）の欄。
 *
 * @param {object} props
 * @param {{id: string, hasTime: boolean, start: object}} props.candidate 候補
 * @param {{end: string | number, startTime: string}} props.choice 現在の選択
 * @param {(changes: object) => void} props.onChange 選択が変わったときの処理（end / startTime）
 * @returns {JSX.Element}
 */
export default function TimeChoiceFields({ candidate, choice, onChange }) {
  const isAllDay = choice.end === END_CHOICE_ALL_DAY;
  const needsStartTime = !candidate.hasTime && !isAllDay;

  // 一覧の各項目に終了時刻を添えるための開始日時（日付だけの候補では、開始時刻が入力されてから）
  let start = null;
  if (candidate.hasTime) {
    start = candidate.start;
  } else {
    const startTime = parseTimeInput(choice.startTime);
    start = startTime === null ? null : { ...candidate.start, ...startTime };
  }

  return (
    <div className="time-choice">
      <div className="time-row">
        {needsStartTime && (
          <label className="time-label">
            開始
            <input
              type="time"
              className="text-field time-input"
              value={choice.startTime}
              onChange={(event) => onChange({ startTime: event.target.value })}
            />
          </label>
        )}
        <label className="time-label">
          終了
          <select
            className="select-field end-choice"
            value={String(choice.end)}
            onChange={(event) => onChange({ end: toEndChoice(event.target.value) })}
          >
            {END_DURATION_CHOICES.map((minutes) => (
              <option key={minutes} value={String(minutes)}>
                {formatEndChoiceLabel(minutes, start)}
              </option>
            ))}
            <option value={END_CHOICE_ALL_DAY}>{ALL_DAY_LABEL}</option>
          </select>
        </label>
        {needsStartTime && choice.startTime === '' && <span className="field-note">開始時刻を入れてください</span>}
      </div>
    </div>
  );
}
