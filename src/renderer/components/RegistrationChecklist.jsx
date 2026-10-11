/**
 * RegistrationChecklist.jsx
 * 目的：予定作成画面を開いたあとの「登録の確認」（要件§12）。
 *   - 開いた予定の一覧に「保存した」のチェックを付けられ、保存し忘れがないか分かる
 *   - 「カレンダーで確認」で、その日の Googleカレンダーをブラウザで開いて目で確かめられる
 * 登録の結果をアプリが自動で読み取ることはしない（要件§7：Google API・OAuth は使わない）。
 */

/**
 * 登録の確認の一覧。
 *
 * @param {object} props
 * @param {Array<{id: string, label: string, title: string, date: object, saved: boolean}>} props.openedEvents 開いた予定
 * @param {(id: string) => void} props.onToggleSaved 「保存した」を切り替えたときの処理
 * @param {(date: {year: number, month: number, day: number}) => void} props.onOpenDay 「カレンダーで確認」を押したときの処理
 * @returns {JSX.Element}
 */
export default function RegistrationChecklist({ openedEvents, onToggleSaved, onOpenDay }) {
  const totalCount = openedEvents.length;
  const savedCount = openedEvents.filter((openedEvent) => openedEvent.saved).length;
  const isAllSaved = savedCount === totalCount;

  return (
    <div className="registration-checklist" role="region" aria-label="登録の確認">
      <p className={isAllSaved ? 'success-message' : 'checklist-guide'} role="status">
        {isAllSaved
          ? `すべての予定（${totalCount} 件）を保存しました。`
          : `ブラウザで「保存」を押し、カレンダーに予定が出たら「保存した」にチェック（保存した：${savedCount} / ${totalCount} 件）`}
      </p>
      <ul className="checklist">
        {openedEvents.map((openedEvent) => (
          <li key={openedEvent.id} className="checklist-item">
            <label className="checklist-saved">
              <input
                type="checkbox"
                checked={openedEvent.saved}
                onChange={() => onToggleSaved(openedEvent.id)}
              />
              保存した
            </label>
            <span className="checklist-label">
              {openedEvent.label}
              {openedEvent.title !== '' && <span className="checklist-title">{openedEvent.title}</span>}
            </span>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => onOpenDay(openedEvent.date)}
            >
              カレンダーで確認
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
