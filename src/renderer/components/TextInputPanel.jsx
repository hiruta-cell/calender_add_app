/**
 * TextInputPanel.jsx
 * 目的：文章を貼り付ける入力欄と、「日時を抽出」「クリア」ボタンを表示する。
 */

import { MAX_INPUT_LENGTH } from '../../core/dateExtractor.js';

/** 文字数の表示に使う数字の書式（例：20,000） */
const numberFormatter = new Intl.NumberFormat('ja-JP');

/**
 * 文章の入力欄。
 *
 * @param {object} props
 * @param {string} props.value 入力欄の文章
 * @param {(value: string) => void} props.onChange 文章が変わったときの処理
 * @param {() => void} props.onExtract 「日時を抽出」を押したときの処理
 * @param {() => void} props.onClear 「クリア」を押したときの処理
 * @returns {JSX.Element}
 */
export default function TextInputPanel({ value, onChange, onExtract, onClear }) {
  const isTooLong = value.length > MAX_INPUT_LENGTH;
  const isEmpty = value.trim() === '';

  /**
   * Ctrl+Enter（Mac は Command+Enter）でも抽出できるようにする。
   *
   * @param {React.KeyboardEvent<HTMLTextAreaElement>} event
   */
  function handleKeyDown(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !isEmpty) {
      event.preventDefault();
      onExtract();
    }
  }

  return (
    <div className="text-input-panel">
      <label htmlFor="source-text" className="section-title">
        メールやメッセージの文章を貼り付けてください（画面から読み取った文章もここに入ります）
      </label>
      <textarea
        id="source-text"
        className="source-text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={10}
        spellCheck={false}
        placeholder="例：10月15日(木)14時〜15時に打ち合わせをお願いします。"
      />
      <div className="text-input-footer">
        <span className={isTooLong ? 'char-count char-count-over' : 'char-count'}>
          {numberFormatter.format(value.length)} / {numberFormatter.format(MAX_INPUT_LENGTH)} 文字
        </span>
        <div className="button-row">
          <button type="button" className="button button-secondary" onClick={onClear} disabled={value === ''}>
            クリア
          </button>
          <button type="button" className="button button-primary" onClick={onExtract} disabled={isEmpty}>
            日時を抽出
          </button>
        </div>
      </div>
    </div>
  );
}
