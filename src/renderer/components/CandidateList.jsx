/**
 * CandidateList.jsx
 * 目的：抽出した日時の候補を、チェックボックス付きの一覧で表示する（要件§5.3）。
 */

import { describeWarning, formatCandidateLabel } from '../../core/candidateFormatter.js';
import { MAX_CANDIDATES } from '../../core/dateExtractor.js';

/**
 * 候補の一覧。
 *
 * @param {object} props
 * @param {boolean} props.hasExtracted 抽出を1回以上行ったか
 * @param {Array<object>} props.candidates 候補（dateExtractor.js が返す形）
 * @param {boolean} props.truncated 候補が多すぎて省いたか
 * @param {Set<string>} props.selectedIds チェックを付けた候補の ID
 * @param {(candidateId: string) => void} props.onToggle チェックを切り替えたときの処理
 * @param {number} props.defaultDurationMinutes 終了時刻がないときの予定の長さ（分）
 * @returns {JSX.Element}
 */
export default function CandidateList({
  hasExtracted,
  candidates,
  truncated,
  selectedIds,
  onToggle,
  defaultDurationMinutes,
}) {
  if (!hasExtracted) {
    return (
      <p className="placeholder">
        左の欄に文章を貼り付けて「日時を抽出」を押すと、ここに日時の候補が表示されます。
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
                <span className="candidate-source">元の表記：「{candidate.sourceText}」</span>
                <span className="badge-row">
                  {!candidate.hasTime && <span className="badge badge-info">時刻の記載なし</span>}
                  {candidate.endInferred && (
                    <span className="badge badge-info">
                      終了時刻の記載なし（{defaultDurationMinutes}分で設定）
                    </span>
                  )}
                  {candidate.warnings.map((warningCode) => (
                    <span key={warningCode} className="badge badge-warning">
                      {describeWarning(warningCode)}
                    </span>
                  ))}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {truncated && (
        <p className="notice">候補が多いため、先頭の {MAX_CANDIDATES} 件だけを表示しています。</p>
      )}
    </div>
  );
}
