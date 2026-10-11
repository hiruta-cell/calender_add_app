/**
 * NoDateDialog.jsx
 * 目的：日時が見つからなかったときに「日時の情報がありません」と知らせ、手入力へ進めるようにする（要件§5.8）。
 *
 * HTML 標準の <dialog> を使う。開いている間は後ろの画面を操作できず、Esc キーでも閉じられる。
 */

import { useEffect, useRef } from 'react';

/** 対応している書き方の例（利用者が書き方を確かめられるように表示する） */
const SUPPORTED_FORMAT_EXAMPLES = ['10/15 14:00', '10月15日(木)14時〜15時', '2026年10月15日', '明日', '来週火曜'];

/**
 * 「日時の情報がありません」のポップアップ。
 *
 * @param {object} props
 * @param {boolean} props.open 表示するか
 * @param {() => void} props.onClose 閉じたときの処理
 * @param {() => void} props.onManualEntry 「手入力する」を押したときの処理（このあとダイアログを閉じる）
 * @returns {JSX.Element}
 */
export default function NoDateDialog({ open, onClose, onManualEntry }) {
  /** <dialog> 要素への参照（showModal / close を呼ぶため） */
  const dialogRef = useRef(null);

  // open の値に合わせて、ダイアログを開く／閉じる
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} aria-labelledby="no-date-dialog-title">
      <h2 id="no-date-dialog-title" className="dialog-title">
        日時の情報がありません
      </h2>
      <p>文章から日付・時刻を見つけられませんでした。</p>
      <p>日時を手入力して登録することもできます。</p>
      <p className="dialog-note">対応している書き方：{SUPPORTED_FORMAT_EXAMPLES.join('、')}</p>
      <div className="button-row button-row-end">
        <button type="button" className="button button-secondary" onClick={() => dialogRef.current?.close()}>
          閉じる
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => {
            onManualEntry();
            dialogRef.current?.close();
          }}
        >
          手入力する
        </button>
      </div>
    </dialog>
  );
}
