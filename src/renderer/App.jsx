/**
 * App.jsx
 * 目的：確認ウインドウの画面全体。次の流れを管理する。
 *   文章の貼り付け → 日時の抽出（件名・場所・URL の下書きも）→ 候補の選択・追記 → Googleカレンダーの予定作成画面を開く
 */

import { useMemo, useRef, useState } from 'react';
import { CalendarEventError, buildCalendarUrl } from '../core/calendarUrl.js';
import {
  DEFAULT_DURATION_MINUTES,
  InputTooLongError,
  MAX_CANDIDATES,
  extractDateCandidates,
} from '../core/dateExtractor.js';
import { extractEventDetails } from '../core/detailExtractor.js';
import { DEFAULT_TIME_CHOICE, buildCalendarEvents, createManualCandidate } from '../core/registration.js';
import CandidateList from './components/CandidateList.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';
import EventDetailsForm from './components/EventDetailsForm.jsx';
import HighlightedText from './components/HighlightedText.jsx';
import ManualDateForm from './components/ManualDateForm.jsx';
import NoDateDialog from './components/NoDateDialog.jsx';
import RegisterSection from './components/RegisterSection.jsx';
import TextInputPanel from './components/TextInputPanel.jsx';

/** 予期しないエラーのときに表示する文（文章の内容は含めない：CLAUDE.md） */
const UNEXPECTED_ERROR_MESSAGE = '日時の抽出中にエラーが発生しました。もう一度お試しください。';

/** 登録処理で予期しないエラーが起きたときの文 */
const REGISTER_ERROR_MESSAGE = 'ブラウザを開く処理でエラーが発生しました。もう一度お試しください。';

/** 予定の内容の入力欄の初期値（メモへの元の文章の貼り付けは既定オフ：要件§6.2） */
const EMPTY_EVENT_DETAILS = Object.freeze({
  title: '',
  location: '',
  meetingUrl: '',
  memo: '',
  includeSourceText: false,
});

/**
 * 確認ウインドウの画面。
 *
 * @returns {JSX.Element}
 */
export default function App() {
  /** 入力欄の文章 */
  const [inputText, setInputText] = useState('');
  /** 抽出結果 { text: 抽出したときの文章, candidates: 候補, truncated: 候補を省いたか }。未抽出なら null */
  const [extraction, setExtraction] = useState(null);
  /** 手入力で追加した候補 */
  const [manualCandidates, setManualCandidates] = useState([]);
  /** 手入力の候補の通し番号（ID が重ならないようにする） */
  const manualSequenceRef = useRef(0);
  /** チェックを付けた候補の ID の集合 */
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  /** 日付だけの候補の時刻の扱い（候補の ID → {mode, startTime, endTime}） */
  const [timeChoices, setTimeChoices] = useState({});
  /** 予定の内容（件名・場所・会議 URL・メモ・元の文章を入れるか） */
  const [eventDetails, setEventDetails] = useState(EMPTY_EVENT_DETAILS);
  /** 画面上部に表示するエラーの文（なければ空文字） */
  const [errorMessage, setErrorMessage] = useState('');
  /** 「日時の情報がありません」の表示中かどうか */
  const [isNoDateDialogOpen, setIsNoDateDialogOpen] = useState(false);
  /** ブラウザで開く処理の途中かどうか（二度押しを防ぐ） */
  const [isRegistering, setIsRegistering] = useState(false);
  /** 登録の結果のお知らせ（なければ空文字） */
  const [registerNotice, setRegisterNotice] = useState('');
  /** 手入力の日付欄（「手入力する」を押したときに選択状態にする） */
  const manualDateInputRef = useRef(null);
  /** ダイアログが閉じたら手入力の日付欄に移るか */
  const shouldFocusManualDateRef = useRef(false);

  /** 表示する候補（抽出した候補の後に手入力の候補） */
  const allCandidates = useMemo(
    () => [...(extraction?.candidates ?? []), ...manualCandidates],
    [extraction, manualCandidates],
  );

  /** 色付けする範囲（すべての候補の位置をまとめたもの） */
  const highlightRanges = useMemo(
    () => (extraction === null ? [] : extraction.candidates.flatMap((candidate) => candidate.ranges)),
    [extraction],
  );

  /** 抽出した後に入力欄の文章が書き換えられたか */
  const isInputChangedAfterExtraction = extraction !== null && extraction.text !== inputText;

  /**
   * 「日時を抽出」：入力欄の文章から日時の候補を抽出し、件名・場所・URL を下書きする。
   * 候補がなければ「日時の情報がありません」を表示する（要件§5.8）。
   */
  function handleExtract() {
    setErrorMessage('');
    setRegisterNotice('');
    try {
      const result = extractDateCandidates(inputText, {
        now: new Date(),
        defaultDurationMinutes: DEFAULT_DURATION_MINUTES,
      });
      const drafts = extractEventDetails(inputText);
      setExtraction({ text: inputText, candidates: result.candidates, truncated: result.truncated });
      // 新しい文章に合わせて、選択・時刻の扱い・手入力・入力欄をすべて置き換える（前の文章の内容を残さない）
      setManualCandidates([]);
      setSelectedIds(new Set()); // 要件§5.3：登録するものは利用者がチェックを付けて選ぶ
      setTimeChoices({});
      setEventDetails({ ...EMPTY_EVENT_DETAILS, title: drafts.title, location: drafts.location, meetingUrl: drafts.meetingUrl });
      if (result.candidates.length === 0) {
        setIsNoDateDialogOpen(true);
      }
    } catch (error) {
      // 処理を中断して待機状態（未抽出の状態）に戻し、エラーの内容を表示する（要件§5.9）
      resetResults();
      if (error instanceof InputTooLongError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(UNEXPECTED_ERROR_MESSAGE);
        console.error('日時の抽出に失敗しました:', error?.name); // 文章の内容はログに出さない
      }
    }
  }

  /**
   * 抽出結果・選択・入力欄を初期状態に戻す（入力欄の文章は残す）。
   */
  function resetResults() {
    setExtraction(null);
    setManualCandidates([]);
    setSelectedIds(new Set());
    setTimeChoices({});
    setEventDetails(EMPTY_EVENT_DETAILS);
    setRegisterNotice('');
  }

  /**
   * 「クリア」：入力欄・結果・エラーを消して、最初の状態に戻す。
   */
  function handleClear() {
    setInputText('');
    resetResults();
    setErrorMessage('');
  }

  /**
   * 候補のチェックを付ける／外す。
   *
   * @param {string} candidateId 候補の ID
   */
  function handleToggleCandidate(candidateId) {
    setSelectedIds((previousIds) => {
      const nextIds = new Set(previousIds);
      if (nextIds.has(candidateId)) {
        nextIds.delete(candidateId);
      } else {
        nextIds.add(candidateId);
      }
      return nextIds;
    });
  }

  /**
   * 日付だけの候補の、時刻の扱い（終日／時刻を指定、開始・終了時刻）を変える。
   *
   * @param {string} candidateId 候補の ID
   * @param {object} changes 変える項目（mode / startTime / endTime）
   */
  function handleTimeChoiceChange(candidateId, changes) {
    setTimeChoices((previous) => ({
      ...previous,
      [candidateId]: { ...(previous[candidateId] ?? DEFAULT_TIME_CHOICE), ...changes },
    }));
  }

  /**
   * 手入力した日付を候補に追加し、チェックを付ける（要件§5.8）。
   *
   * @param {{year: number, month: number, day: number}} date 手入力した日付
   */
  function handleAddManualDate(date) {
    manualSequenceRef.current += 1;
    const candidate = createManualCandidate(date, manualSequenceRef.current, new Date());
    setManualCandidates((previous) => [...previous, candidate]);
    setSelectedIds((previousIds) => new Set(previousIds).add(candidate.id));
  }

  /**
   * 「日時の情報がありません」から「手入力する」を選んだ。ダイアログが閉じたら手入力の日付欄に移る。
   */
  function handleStartManualEntry() {
    shouldFocusManualDateRef.current = true;
  }

  /**
   * 「日時の情報がありません」が閉じた。「手入力する」を選んでいれば、手入力の日付欄に移る。
   * （ダイアログは閉じるときに元の場所へフォーカスを戻すため、閉じた後に移す）
   */
  function handleNoDateDialogClose() {
    setIsNoDateDialogOpen(false);
    if (shouldFocusManualDateRef.current) {
      shouldFocusManualDateRef.current = false;
      manualDateInputRef.current?.focus();
    }
  }

  /**
   * 予定の内容の入力欄を変える。
   *
   * @param {string} field 項目名（title / location / meetingUrl / memo / includeSourceText）
   * @param {string | boolean} value 新しい値
   */
  function handleDetailChange(field, value) {
    setEventDetails((previous) => ({ ...previous, [field]: value }));
  }

  /**
   * 「Googleカレンダーで開く」：選んだ候補の予定作成画面を、既定のブラウザで順に開く（要件§5.6・§6.2）。
   * 画面で内容を確かめてから、メインプロセスに頼む（メインプロセスでも改めて検証する）。
   */
  async function handleRegister() {
    setErrorMessage('');
    setRegisterNotice('');

    const { events, errors } = buildCalendarEvents({
      candidates: allCandidates,
      selectedIds,
      timeChoices,
      details: eventDetails,
      sourceText: extraction?.text ?? '',
      defaultDurationMinutes: DEFAULT_DURATION_MINUTES,
    });
    if (errors.length > 0) {
      setErrorMessage(errors.join('\n'));
      return;
    }
    try {
      events.forEach((event) => buildCalendarUrl(event)); // 長すぎる内容などを、ここで先に知らせる
    } catch (error) {
      if (error instanceof CalendarEventError) {
        setErrorMessage(error.message);
        return;
      }
      throw error;
    }

    if (window.calendarApp === undefined) {
      setErrorMessage('登録の機能を利用できません。アプリを再起動してください。');
      return;
    }

    setIsRegistering(true);
    try {
      const result = await window.calendarApp.openCalendarEvents(events);
      if (result.ok) {
        setRegisterNotice(
          `${result.openedCount} 件の予定作成画面をブラウザで開きました。内容を確認して「保存」を押すと登録されます。`,
        );
      } else {
        setErrorMessage(result.message);
      }
    } catch (error) {
      setErrorMessage(REGISTER_ERROR_MESSAGE);
      console.error('登録処理に失敗しました:', error?.name);
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>カレンダー登録ツール</h1>
      </header>

      {errorMessage !== '' && <ErrorBanner message={errorMessage} onDismiss={() => setErrorMessage('')} />}

      <main className="app-main">
        <section className="pane" aria-label="文章の入力">
          <TextInputPanel
            value={inputText}
            onChange={setInputText}
            onExtract={handleExtract}
            onClear={handleClear}
          />
          {extraction !== null && (
            <div className="preview">
              <h2 className="section-title">認識した日時（色付きの部分）</h2>
              {isInputChangedAfterExtraction && (
                <p className="notice">
                  文章が変更されています。もう一度「日時を抽出」を押してください。
                </p>
              )}
              <HighlightedText text={extraction.text} ranges={highlightRanges} />
            </div>
          )}
        </section>

        <section className="pane" aria-label="日時の候補と予定の内容">
          <div>
            <h2 className="section-title">日時の候補</h2>
            <CandidateList
              hasExtracted={extraction !== null || manualCandidates.length > 0}
              candidates={allCandidates}
              truncated={extraction?.truncated ?? false}
              selectedIds={selectedIds}
              onToggle={handleToggleCandidate}
              timeChoices={timeChoices}
              onTimeChoiceChange={handleTimeChoiceChange}
              defaultDurationMinutes={DEFAULT_DURATION_MINUTES}
            />
            <ManualDateForm
              inputRef={manualDateInputRef}
              onAdd={handleAddManualDate}
              disabled={allCandidates.length >= MAX_CANDIDATES}
            />
          </div>

          <EventDetailsForm
            details={eventDetails}
            onChange={handleDetailChange}
            hasSourceText={extraction !== null && extraction.text.trim() !== ''}
          />

          <RegisterSection
            selectedCount={selectedIds.size}
            isRegistering={isRegistering}
            notice={registerNotice}
            onRegister={handleRegister}
          />
        </section>
      </main>

      <NoDateDialog
        open={isNoDateDialogOpen}
        onClose={handleNoDateDialogClose}
        onManualEntry={handleStartManualEntry}
      />
    </div>
  );
}
