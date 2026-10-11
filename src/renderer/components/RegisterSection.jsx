/**
 * RegisterSection.jsx
 * 目的：「Googleカレンダーで開く」ボタンと、開いたあとの案内（要件§5.6・§12）。
 * 右の欄の下端に固定して表示し、候補や入力欄をスクロールしても常に押せるようにする。
 */

/**
 * 登録ボタンの欄。
 *
 * @param {object} props
 * @param {number} props.selectedCount チェックを付けた候補の数
 * @param {boolean} props.isRegistering ブラウザで開く処理の途中か
 * @param {number} props.registeredCount 直前に予定作成画面を開いた件数（0 なら開いたあとの案内を出さない）
 * @param {number} props.autoResetSeconds 表示を自動でクリアするまでの秒数（0 なら予約なし。操作して取り消した場合など）
 * @param {() => void} props.onRegister ボタンを押したときの処理
 * @returns {JSX.Element}
 */
export default function RegisterSection({ selectedCount, isRegistering, registeredCount, autoResetSeconds, onRegister }) {
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
      {registeredCount > 0 ? (
        <p className="success-message" role="status">
          予定作成画面を {registeredCount} 件開きました。ブラウザで「保存」を押すと登録されます。
          {autoResetSeconds > 0 && `${autoResetSeconds}秒操作しないと、次の登録に備えて画面をクリアします。`}
        </p>
      ) : (
        <p className="field-note">
          {selectedCount === 0
            ? '登録する候補にチェックを付けてください。'
            : 'ブラウザで開いた予定作成画面で「保存」を押すと登録されます。'}
        </p>
      )}
    </div>
  );
}
