/**
 * RegisterSection.jsx
 * 目的：「Googleカレンダーで開く」ボタンと、開いたあとの登録の確認（要件§5.6・§12）。
 * 右の欄の下端に固定して表示し、候補や入力欄をスクロールしても常に押せるようにする。
 */

import RegistrationChecklist from './RegistrationChecklist.jsx';

/**
 * 登録ボタンの欄。
 *
 * @param {object} props
 * @param {number} props.selectedCount チェックを付けた候補の数
 * @param {boolean} props.isRegistering ブラウザで開く処理の途中か
 * @param {Array<object>} props.openedEvents 開いた予定（登録の確認の一覧に表示する）
 * @param {() => void} props.onRegister ボタンを押したときの処理
 * @param {(id: string) => void} props.onToggleSaved 「保存した」を切り替えたときの処理
 * @param {(date: object) => void} props.onOpenDay 「カレンダーで確認」を押したときの処理
 * @returns {JSX.Element}
 */
export default function RegisterSection({
  selectedCount,
  isRegistering,
  openedEvents,
  onRegister,
  onToggleSaved,
  onOpenDay,
}) {
  return (
    <div className="register-section">
      <button
        type="button"
        className="button button-primary button-large"
        onClick={onRegister}
        disabled={selectedCount === 0 || isRegistering}
      >
        {isRegistering ? 'ブラウザで開いています…' : `選んだ ${selectedCount} 件をGoogleカレンダーで開く`}
      </button>
      {openedEvents.length === 0 && (
        <p className="field-note">
          {selectedCount === 0
            ? '登録する候補にチェックを付けてください。'
            : 'ブラウザで開いた予定作成画面で「保存」を押すと登録されます。'}
        </p>
      )}
      {openedEvents.length > 0 && (
        <RegistrationChecklist openedEvents={openedEvents} onToggleSaved={onToggleSaved} onOpenDay={onOpenDay} />
      )}
    </div>
  );
}
