/**
 * EventDetailsForm.jsx
 * 目的：予定の内容（件名・場所・オンライン会議 URL・メモ）の入力欄（要件§5.5・§12）。
 * 抽出のときに、文章から取り出した件名・場所・URL が下書きとして入る。
 *
 * - 件名は50文字まで。残りの文字数を表示する（依頼者の指示）。
 * - URL を入れたときは、フィッシング（偽のサイトへの誘導）の注意とサイト名を必ず表示する。
 *   登録は止めない（依頼者の指示：注意したうえで登録する）。サイト名は国際化ドメインを xn-- の形で見せ、
 *   見た目の似た偽のドメインを見分けやすくする。
 */

import {
  MAX_LOCATION_TEXT_LENGTH,
  MAX_MEETING_URL_LENGTH,
  MAX_MEMO_LENGTH,
  MAX_TITLE_LENGTH,
} from '../../core/calendarUrl.js';
import { parseMeetingUrl } from '../../core/detailExtractor.js';

/** URL を登録するときのフィッシングの注意（会議サービスの URL） */
export const PHISHING_WARNING_MESSAGE =
  '注意：URL は、偽のサイトへ誘導するもの（フィッシング）の可能性があります。送り主が信頼できるか、サイト名が正しいかを確かめてから登録してください。';

/** 会議サービス以外の URL を登録するときの、強めの注意 */
export const UNKNOWN_SITE_WARNING_MESSAGE =
  '注意：会議サービス（Zoom・Meet・Teams・Webex）以外のサイトです。偽のサイトへ誘導するもの（フィッシング）の可能性があります。送り主が信頼できるかを確かめ、不要なら消してください。';

/**
 * 予定の内容の入力欄。
 *
 * @param {object} props
 * @param {{title: string, location: string, meetingUrl: string, memo: string, includeSourceText: boolean}} props.details 入力欄の内容
 * @param {(field: string, value: string | boolean) => void} props.onChange 入力が変わったときの処理
 * @param {boolean} props.hasSourceText 元の文章があるか（「元の文章をメモに入れる」を使えるか）
 * @returns {JSX.Element}
 */
export default function EventDetailsForm({ details, onChange, hasSourceText }) {
  const meetingUrlText = details.meetingUrl.trim();
  const meeting = meetingUrlText === '' ? null : parseMeetingUrl(meetingUrlText);
  /** 件名に入力できる残りの文字数 */
  const remainingTitleLength = MAX_TITLE_LENGTH - details.title.length;

  return (
    <div className="event-details-form">
      <h2 className="section-title">予定の内容</h2>
      <p className="hint">文章から取り出した内容が入っています。確認して、必要なら直してください。</p>

      <label htmlFor="event-title" className="field-label">件名</label>
      <input
        id="event-title"
        aria-describedby="event-title-count"
        type="text"
        className="text-field"
        value={details.title}
        maxLength={MAX_TITLE_LENGTH}
        onChange={(event) => onChange('title', event.target.value)}
      />
      <p id="event-title-count" className={remainingTitleLength <= 0 ? 'field-note field-note-error' : 'field-note'}>
        {MAX_TITLE_LENGTH}文字まで（残り {Math.max(remainingTitleLength, 0)} 文字）
      </p>

      <label htmlFor="event-location" className="field-label">場所</label>
      <input
        id="event-location"
        type="text"
        className="text-field"
        value={details.location}
        maxLength={MAX_LOCATION_TEXT_LENGTH}
        onChange={(event) => onChange('location', event.target.value)}
      />

      <label htmlFor="event-meeting-url" className="field-label">オンライン会議URL</label>
      <input
        id="event-meeting-url"
        type="url"
        className="text-field"
        value={details.meetingUrl}
        maxLength={MAX_MEETING_URL_LENGTH}
        spellCheck={false}
        placeholder="https://"
        onChange={(event) => onChange('meetingUrl', event.target.value)}
      />
      {meetingUrlText !== '' && meeting === null && (
        <p className="field-note field-note-error">https:// で始まる正しい URL を入力してください。</p>
      )}
      {meeting !== null && (
        <div id="event-meeting-warning" className="url-warning" role="note">
          <p className="url-warning-site">
            登録する URL のサイト：<strong>{meeting.hostname}</strong>
          </p>
          <p className="url-warning-message">
            {meeting.isKnownMeetingService ? PHISHING_WARNING_MESSAGE : UNKNOWN_SITE_WARNING_MESSAGE}
          </p>
        </div>
      )}
      <p className="field-note">場所が空のときは「場所」に、場所があるときは「メモ」の先頭に入ります。</p>

      <label htmlFor="event-memo" className="field-label">メモ</label>
      <textarea
        id="event-memo"
        className="text-field memo-field"
        value={details.memo}
        maxLength={MAX_MEMO_LENGTH}
        rows={2}
        onChange={(event) => onChange('memo', event.target.value)}
      />

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={details.includeSourceText}
          disabled={!hasSourceText}
          onChange={(event) => onChange('includeSourceText', event.target.checked)}
        />
        元の文章をメモに入れる（文章は Google に送られます）
      </label>
    </div>
  );
}
