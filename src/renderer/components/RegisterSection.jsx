/**
 * RegisterSection.jsx
 * 目的：「Googleカレンダーで開く」ボタンと、登録の結果のお知らせ（要件§5.6）。
 */

import { useEffect, useRef } from 'react';

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
  /** お知らせの要素（表示されたら見える位置まで動かすため） */
  const noticeRef = useRef(null);

  // お知らせが出たら、欄の下端で切れて見落とさないよう、見える位置まで表示を動かす
  useEffect(() => {
    if (notice !== '') {
      noticeRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [notice]);

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
        既定のブラウザで予定作成画面が開きます。ブラウザで「保存」を押すと登録されます。
      </p>
      {notice !== '' && (
        <p ref={noticeRef} className="success-message" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
