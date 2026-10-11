/**
 * ErrorBanner.jsx
 * 目的：処理を中断したときに、エラーの内容を画面上部に表示する（要件§5.9）。
 * 次にすることがあるエラー（画面収録の許可がないなど）には、その操作のボタンも表示する。
 */

/**
 * エラー表示の帯。
 *
 * @param {object} props
 * @param {string} props.message 表示する文（文章の内容は含めないこと）
 * @param {() => void} props.onDismiss 「閉じる」を押したときの処理
 * @param {string} [props.actionLabel] 追加のボタンの文字（例：システム設定を開く）。なければボタンを出さない
 * @param {() => void} [props.onAction] 追加のボタンを押したときの処理
 * @returns {JSX.Element}
 */
export default function ErrorBanner({ message, onDismiss, actionLabel, onAction }) {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-message">{message}</span>
      <div className="button-row">
        {actionLabel !== undefined && onAction !== undefined && (
          <button type="button" className="button button-primary" onClick={onAction}>
            {actionLabel}
          </button>
        )}
        <button type="button" className="button button-secondary" onClick={onDismiss}>
          閉じる
        </button>
      </div>
    </div>
  );
}
