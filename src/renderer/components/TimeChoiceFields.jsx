/**
 * TimeChoiceFields.jsx
 * 目的：日付だけの候補で「終日」か「時刻を指定」かを選ぶ欄（要件§5.10：既定は終日）。
 */

import { TIME_MODE_ALL_DAY, TIME_MODE_SPECIFIED } from '../../core/registration.js';

/**
 * 終日／時刻指定の選択と、開始・終了時刻の入力欄。
 *
 * @param {object} props
 * @param {string} props.candidateId 候補の ID（入力欄の名前・ラベルの対応に使う）
 * @param {{mode: string, startTime: string, endTime: string}} props.choice 現在の選択
 * @param {(changes: object) => void} props.onChange 選択が変わったときの処理
 * @param {number} props.defaultDurationMinutes 終了時刻が空のときの予定の長さ（分）
 * @returns {JSX.Element}
 */
export default function TimeChoiceFields({ candidateId, choice, onChange, defaultDurationMinutes }) {
  const groupName = `time-mode-${candidateId}`;

  return (
    <div className="time-choice">
      <div className="radio-row" role="radiogroup" aria-label="時刻の扱い">
        <label className="radio-label">
          <input
            type="radio"
            name={groupName}
            value={TIME_MODE_ALL_DAY}
            checked={choice.mode === TIME_MODE_ALL_DAY}
            onChange={() => onChange({ mode: TIME_MODE_ALL_DAY })}
          />
          終日
        </label>
        <label className="radio-label">
          <input
            type="radio"
            name={groupName}
            value={TIME_MODE_SPECIFIED}
            checked={choice.mode === TIME_MODE_SPECIFIED}
            onChange={() => onChange({ mode: TIME_MODE_SPECIFIED })}
          />
          時刻を指定
        </label>
      </div>
      {choice.mode === TIME_MODE_SPECIFIED && (
        <div className="time-row">
          <label className="time-label">
            開始
            <input
              type="time"
              className="text-field time-input"
              value={choice.startTime}
              onChange={(event) => onChange({ startTime: event.target.value })}
            />
          </label>
          <span aria-hidden="true">〜</span>
          <label className="time-label">
            終了
            <input
              type="time"
              className="text-field time-input"
              value={choice.endTime}
              onChange={(event) => onChange({ endTime: event.target.value })}
            />
          </label>
          <span className="field-note">終了が空なら {defaultDurationMinutes} 分</span>
        </div>
      )}
    </div>
  );
}
