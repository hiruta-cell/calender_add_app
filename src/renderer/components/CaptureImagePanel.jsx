/**
 * CaptureImagePanel.jsx
 * 目的：範囲キャプチャで取り込んだ画像と、読み取りの状態を表示する（要件§6.1：左に取り込み画像と認識テキスト）。
 *   - 読み取り中の表示
 *   - 取り込んだ画像（app://bundle/capture/〜。メモリの中の画像）
 *   - 読み取った向きと確信度、精度が低い・読み取れないときの案内
 *   - 横書き／縦書きを指定して読み直すボタン（要件§12：縦書き対応）
 */

/** 向きの表示名 */
const ORIENTATION_LABELS = Object.freeze({ horizontal: '横書き', vertical: '縦書き' });

/**
 * 取り込んだ画像の欄。
 *
 * @param {object} props
 * @param {{status: string, imageUrl: string, orientation: string, confidence: number | null, isLowConfidence: boolean, isEmpty: boolean}} props.capture 取り込みの状態
 * @param {(orientation: string) => void} props.onReread 向きを指定して読み直す処理
 * @returns {JSX.Element}
 */
export default function CaptureImagePanel({ capture, onReread }) {
  const isReading = capture.status === 'reading';

  return (
    <div className="capture-panel">
      <h2 className="section-title">取り込んだ画像</h2>
      {isReading && (
        <p className="notice" role="status">
          文字を読み取っています…
        </p>
      )}
      {capture.imageUrl !== '' && (
        <img className="capture-image" src={capture.imageUrl} alt="範囲キャプチャで取り込んだ画像" />
      )}
      {!isReading && capture.orientation !== '' && (
        <p className="field-note">
          {ORIENTATION_LABELS[capture.orientation] ?? capture.orientation}として読み取りました（確信度 {capture.confidence}）。
          読み取った文章は下の欄で直せます。
        </p>
      )}
      {!isReading && capture.isEmpty && (
        <p className="field-note field-note-error">
          文字を読み取れませんでした。向きを変えて読み直すか、範囲を選び直してください。
        </p>
      )}
      {!isReading && !capture.isEmpty && capture.isLowConfidence && (
        <p className="field-note field-note-error">
          読み取りの精度が低い可能性があります。下の欄の文章を確認して直してください。
        </p>
      )}
      <div className="button-row">
        <button type="button" className="button button-secondary button-small" onClick={() => onReread('horizontal')} disabled={isReading}>
          横書きで読み直す
        </button>
        <button type="button" className="button button-secondary button-small" onClick={() => onReread('vertical')} disabled={isReading}>
          縦書きで読み直す
        </button>
      </div>
    </div>
  );
}
