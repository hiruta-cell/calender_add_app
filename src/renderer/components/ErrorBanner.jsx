/**
 * ErrorBanner.jsx
 * 目的：処理を中断したときに、エラーの内容を画面上部に表示する（要件§5.9）。
 */

/**
 * エラー表示の帯。
 *
 * @param {object} props
 * @param {string} props.message 表示する文（文章の内容は含めないこと）
 * @param {() => void} props.onDismiss 「閉じる」を押したときの処理
 * @returns {JSX.Element}
 */
export default function ErrorBanner({ message, onDismiss }) {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-message">{message}</span>
      <button type="button" className="button button-secondary" onClick={onDismiss}>
        閉じる
      </button>
    </div>
  );
}
