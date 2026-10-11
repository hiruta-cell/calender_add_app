/**
 * RegisterSection.jsx
 * 目的：「Googleカレンダーで開く」ボタンと、登録の結果のお知らせ（要件§5.6）。
 * 右の欄の下端に固定して表示し、候補や入力欄をスクロールしても常に押せるようにする。
 */

/**
 * 登録ボタンの欄。
 *
 * @param {object} props
 * @param {number} props.selectedCount チェックを付けた候補の数
 * @param {boolean} props.isRegistering ブラウザで開く処理の途中か
 * @param {string} props.notice 登録の結果のお知らせ（なければ空文字）
 * @param {() => void} props.onRegister ボタンを押したときの処理
 * @returns {JSX.Element}
 */
export default function RegisterSection({ selectedCount, isRegistering, notice, onRegister }) {
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
      <p className="field-note">
        {selectedCount === 0
          ? '登録する候補にチェックを付けてください。'
          : 'ブラウザで開いた予定作成画面で「保存」を押すと登録されます。'}
      </p>
      {notice !== '' && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
