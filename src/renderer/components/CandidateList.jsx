/**
 * CandidateList.jsx
 * 目的：日時の候補を、チェックボックス付きの一覧で表示する（要件§5.3）。
 * チェックを付けた候補は、終了を「開始から30分〜23時間30分後」か「終日」から選べる（2026-10-12 依頼者の仕様変更）。
 */

import { describeWarning, formatCandidateLabel } from '../../core/candidateFormatter.js';
import { MAX_CANDIDATES } from '../../core/dateExtractor.js';
import { createDefaultTimeChoice } from '../../core/registration.js';
import TimeChoiceFields from './TimeChoiceFields.jsx';

/**
 * 候補の一覧。
 *
 * @param {object} props
 * @param {boolean} props.hasExtracted 抽出を1回以上行ったか
 * @param {Array<object>} props.candidates 候補（dateExtractor.js が返す形）
 * @param {boolean} props.truncated 候補が多すぎて省いたか
 * @param {Set<string>} props.selectedIds チェックを付けた候補の ID
 * @param {(candidateId: string) => void} props.onToggle チェックを切り替えたときの処理
 * @param {Record<string, object>} props.timeChoices 候補ごとの終了の選択（候補の ID → 選択。なければ初めの値）
 * @param {(candidate: object, changes: object) => void} props.onTimeChoiceChange 終了の選択を変えたときの処理
 * @param {number} props.defaultDurationMinutes 設定の予定の長さ（分。時刻のある候補の初めの選択）
 * @returns {JSX.Element}
 */
export default function CandidateList({
  hasExtracted,
  candidates,
  truncated,
  selectedIds,
  onToggle,
  timeChoices,
  onTimeChoiceChange,
  defaultDurationMinutes,
}) {
  if (!hasExtracted) {
    return (
      <p className="placeholder">
        左の欄に文章を貼り付けて「日時を抽出」を押すと、ここに日時の候補が表示されます。
        日時を手入力で追加することもできます。
      </p>
    );
  }
  if (candidates.length === 0) {
    return <p className="placeholder">日時の候補はありません。</p>;
  }

  return (
    <div className="candidate-panel">
      <p className="hint">
        登録する候補にチェックを付けてください（選択中：{selectedIds.size} 件）
      </p>
      <ul className="candidate-list">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="candidate-item">
            <label className="candidate-label">
              <input
                type="checkbox"
                className="candidate-checkbox"
                checked={selectedIds.has(candidate.id)}
                onChange={() => onToggle(candidate.id)}
              />
              <span className="candidate-body">
                <span className="candidate-date">{formatCandidateLabel(candidate)}</span>
                <span className="candidate-source">
                  {candidate.isManual ? '手入力した日付' : `元の表記：「${candidate.sourceText}」`}
                </span>
                <span className="badge-row">
                  {!candidate.hasTime && !candidate.isManual && <span className="badge badge-info">時刻の記載なし</span>}
                  {candidate.warnings.map((warningCode) => (
                    <span key={warningCode} className="badge badge-warning">
                      {describeWarning(warningCode)}
                    </span>
                  ))}
                </span>
              </span>
            </label>
            {selectedIds.has(candidate.id) && (
              <TimeChoiceFields
                candidate={candidate}
                choice={timeChoices[candidate.id] ?? createDefaultTimeChoice(candidate, defaultDurationMinutes)}
                onChange={(changes) => onTimeChoiceChange(candidate, changes)}
              />
            )}
          </li>
        ))}
      </ul>
      {truncated && (
        <p className="notice">候補が多いため、先頭の {MAX_CANDIDATES} 件だけを表示しています。</p>
      )}
    </div>
  );
}
