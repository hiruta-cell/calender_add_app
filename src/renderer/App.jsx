/**
 * App.jsx
 * 目的：確認ウインドウの画面全体。次の流れを管理する。
 *   文章の貼り付け → 日時の抽出（件名・場所・URL の下書きも）→ 候補の選択・追記 → Googleカレンダーの予定作成画面を開く
 *   → 60秒操作がなければ、次の登録に備えて表示を初期状態に戻す（依頼者の指示）
 * 文章は、貼り付けのほか、範囲キャプチャ＋OCR（ホットキー・トレイ・「画面から読み取る」ボタン）や、
 * コピーした文章の読み取り（ホットキー・トレイ・「コピーした文章を読み取る」ボタン）でも入れられる。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AUTO_RESET_DELAY_SECONDS, scheduleAutoReset } from '../core/autoReset.js';
import { CalendarEventError, buildCalendarUrl } from '../core/calendarUrl.js';
import { InputTooLongError, MAX_CANDIDATES, correctWrittenWeekdays, extractDateCandidates } from '../core/dateExtractor.js';
import { extractEventDetails } from '../core/detailExtractor.js';
import {
  DEFAULT_TIME_CHOICE,
  TIME_MODE_SPECIFIED,
  buildCalendarEvents,
  createManualCandidate,
} from '../core/registration.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import CandidateList from './components/CandidateList.jsx';
import CaptureImagePanel from './components/CaptureImagePanel.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';
import EventDetailsForm from './components/EventDetailsForm.jsx';
import HighlightedText from './components/HighlightedText.jsx';
import ManualDateForm from './components/ManualDateForm.jsx';
import NoDateDialog from './components/NoDateDialog.jsx';
import RegisterSection from './components/RegisterSection.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import TextInputPanel from './components/TextInputPanel.jsx';
import { convertImageFileToPng, findImageFile } from './imageImport.js';

/** 予期しないエラーのときに表示する文（文章の内容は含めない：CLAUDE.md） */
const UNEXPECTED_ERROR_MESSAGE = '日時の抽出中にエラーが発生しました。もう一度お試しください。';

/** 登録処理で予期しないエラーが起きたときの文 */
const REGISTER_ERROR_MESSAGE = 'ブラウザを開く処理でエラーが発生しました。もう一度お試しください。';

/** 範囲キャプチャの状態の初期値（取り込んだ画像がない状態） */
const EMPTY_CAPTURE = Object.freeze({
  status: 'idle', // 'idle'：待機中　'reading'：文字を読み取り中
  imageUrl: '', // 取り込んだ画像の URL（app://bundle/capture/〜）
  orientation: '', // 読み取った向き（'horizontal' / 'vertical'）
  confidence: null, // 確信度（0〜100）
  isLowConfidence: false, // 確信度が低いか
  isEmpty: false, // 文字を読み取れなかったか
});

/** エラーの理由：Mac の画面収録の許可がない（メインプロセスの captureGeometry.js の値と同じ） */
const CAPTURE_ERROR_SCREEN_PERMISSION = 'screenPermission';

/** ホットキーを登録できなかったときの案内 */
const HOTKEY_UNAVAILABLE_MESSAGE =
  'ホットキーを登録できませんでした（ほかのアプリが使っている可能性があります）。画面のボタンか、トレイのメニューを使ってください。';

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
  /** 右の欄（候補と予定の内容）のスクロールする部分。抽出し直したら一番上に戻す */
  const resultPaneRef = useRef(null);
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
  /**
   * エラーの帯に出す追加の操作。{forMessage: 対象のエラーの文, type: 'openScreenSettings'}。
   * 対象のエラーの文が表示されている間だけボタンを出す（別のエラーに変わったら出さない）
   */
  const [errorAction, setErrorAction] = useState(null);
  /** 「日時の情報がありません」の表示中かどうか */
  const [isNoDateDialogOpen, setIsNoDateDialogOpen] = useState(false);
  /** ブラウザで開く処理の途中かどうか（二度押しを防ぐ） */
  const [isRegistering, setIsRegistering] = useState(false);
  /** 直前に予定作成画面を開いた件数（登録ボタンの下の案内に使う。0 なら表示しない） */
  const [registeredCount, setRegisteredCount] = useState(0);
  /** 自動のクリアの予約番号（0 なら予約なし）。登録のたびに新しい番号にして、60秒を数え直す */
  const [autoResetId, setAutoResetId] = useState(0);
  /** 自動のクリアの予約番号の通し番号（番号が重ならないようにする） */
  const autoResetSequenceRef = useRef(0);
  /** 範囲キャプチャの状態（EMPTY_CAPTURE の説明を参照） */
  const [capture, setCapture] = useState(EMPTY_CAPTURE);
  /** ホットキーの表記（例：Ctrl+Shift+Y）。メインプロセスから受け取る */
  const [hotkeyLabel, setHotkeyLabel] = useState('');
  /** コピーした文章を読み取るホットキーの表記（例：Ctrl+Shift+U）。メインプロセスから受け取る */
  const [clipboardHotkeyLabel, setClipboardHotkeyLabel] = useState('');
  /** 予定の既定の長さ（分）。終了時刻が書かれていないときに使う。設定から受け取る（要件§5.4・§6.1） */
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_SETTINGS.durationMinutes);
  /** 設定画面の表示中かどうか */
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  /** 取り込み・読み取りの結果を受け取る処理（常に最新の処理を呼ぶための参照） */
  const captureStatusHandlerRef = useRef(null);
  /** 表示を初期状態に戻す処理（自動のクリアから、常に最新の処理を呼ぶための参照） */
  const resetToInitialStateRef = useRef(null);

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
   * 「日時を抽出」：入力欄の文章から日時の候補を抽出する。
   */
  function handleExtract() {
    extractFromText(inputText);
  }

  /**
   * 文章から日時の候補を抽出し、件名・場所・URL を下書きする（貼り付け・OCR の両方で使う）。
   * 候補がなければ「日時の情報がありません」を表示する（要件§5.8）。
   *
   * @param {string} text 抽出する文章
   */
  function extractFromText(text) {
    setErrorMessage('');
    setRegisteredCount(0);
    setAutoResetId(0); // 新しい内容を、自動のクリアで消さない
    try {
      const now = new Date();
      const result = extractDateCandidates(text, { now, defaultDurationMinutes: durationMinutes });
      const drafts = extractEventDetails(text);
      setExtraction({ text, candidates: result.candidates, truncated: result.truncated });
      // 新しい文章に合わせて、選択・時刻の扱い・手入力・入力欄をすべて置き換える（前の文章の内容を残さない）
      setManualCandidates([]);
      setSelectedIds(new Set()); // 要件§5.3：登録するものは利用者がチェックを付けて選ぶ
      setTimeChoices({});
      // 件名・場所の下書きに日付と合わない曜日があれば、日付の本当の曜日に直す（依頼者の指示。候補には警告を出す）
      setEventDetails({
        ...EMPTY_EVENT_DETAILS,
        title: correctWrittenWeekdays(drafts.title, { now }),
        location: correctWrittenWeekdays(drafts.location, { now }),
        meetingUrl: drafts.meetingUrl,
      });
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
    setRegisteredCount(0);
  }

  /**
   * 表示を最初の状態に戻す：入力欄・結果・エラー・取り込んだ画像・登録の案内を消し、自動のクリアの予約もやめる。
   * 「クリア」ボタンと、登録して60秒操作がなかったとき（自動のクリア）に使う。
   */
  function resetToInitialState() {
    setInputText('');
    resetResults();
    setErrorMessage('');
    setErrorAction(null);
    setIsNoDateDialogOpen(false);
    setAutoResetId(0);
    setCapture(EMPTY_CAPTURE);
    window.calendarApp?.clearCapture(); // 取り込んだ画像をメインプロセスのメモリからも消す
  }
  resetToInitialStateRef.current = resetToInitialState;

  /**
   * 取り込み・読み取りの進み具合と結果を受け取ったときの処理。
   *   reading：読み取り中の表示　done：読み取った文章を入力欄に入れて日時を抽出する
   *   error：エラーの内容を表示して待機状態に戻る（要件§5.9）　cancelled：何もしない　cleared：画像の表示を消す
   *
   * @param {{state: string, text?: string, orientation?: string, confidence?: number, isLowConfidence?: boolean, imageUrl?: string, message?: string}} status
   */
  function handleCaptureStatus(status) {
    // 読み取りが始まった・終わったら、自動のクリアは取り消す（ホットキーなどで取り込んだ新しい内容を消さない）
    if (status?.state !== 'cleared') {
      setAutoResetId(0);
    }
    switch (status?.state) {
      case 'reading':
        setErrorMessage('');
        setCapture((previous) => ({ ...previous, status: 'reading' }));
        break;
      case 'done': {
        const text = typeof status.text === 'string' ? status.text : '';
        setCapture({
          status: 'idle',
          imageUrl: typeof status.imageUrl === 'string' ? status.imageUrl : '',
          orientation: typeof status.orientation === 'string' ? status.orientation : '',
          confidence: Number.isFinite(status.confidence) ? status.confidence : null,
          isLowConfidence: status.isLowConfidence === true,
          isEmpty: text.trim() === '',
        });
        setInputText(text);
        if (text.trim() !== '') {
          extractFromText(text);
        } else {
          resetResults();
        }
        break;
      }
      case 'error': {
        const message = typeof status.message === 'string' ? status.message : UNEXPECTED_ERROR_MESSAGE;
        setCapture((previous) => ({ ...previous, status: 'idle' }));
        setErrorMessage(message);
        // 画面収録の許可がないときは、エラーの帯に「システム設定を開く」ボタンを出す
        setErrorAction(status.reason === CAPTURE_ERROR_SCREEN_PERMISSION ? { forMessage: message, type: 'openScreenSettings' } : null);
        break;
      }
      case 'cleared':
        setCapture(EMPTY_CAPTURE);
        break;
      case 'clipboardText': {
        // コピーした文章（ホットキー・トレイ・ボタン）：入力欄に入れて、そのまま抽出する
        const text = typeof status.text === 'string' ? status.text : '';
        setErrorMessage('');
        setInputText(text);
        extractFromText(text);
        break;
      }
      default: // cancelled など
        setCapture((previous) => ({ ...previous, status: 'idle' }));
        break;
    }
  }
  captureStatusHandlerRef.current = handleCaptureStatus;

  // 画像の貼り付け（Ctrl/Cmd+V）・ドラッグ＆ドロップを受け付ける（文章の貼り付けは、これまでどおり入力欄に入る）
  useEffect(() => {
    if (window.calendarApp === undefined) {
      return undefined;
    }
    /** 画像ファイルを PNG にそろえて、メインプロセスに読み取ってもらう */
    const importImageFile = async (file) => {
      setErrorMessage('');
      try {
        const pngBytes = await convertImageFileToPng(file);
        const result = await window.calendarApp.importImage(pngBytes);
        if (!result.ok) {
          setErrorMessage(result.message);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '画像を読み込めませんでした。');
      }
    };
    const handlePaste = (event) => {
      const file = findImageFile(event.clipboardData);
      if (file !== null) {
        event.preventDefault(); // 画像のときだけ。文章の貼り付けは邪魔しない
        importImageFile(file);
      }
    };
    const handleDragOver = (event) => {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault(); // ファイルのドロップを受け付ける
      }
    };
    const handleDrop = (event) => {
      if (!event.dataTransfer?.types.includes('Files')) {
        return;
      }
      event.preventDefault(); // ファイルを開く動き（ページの移動）をさせない
      const file = findImageFile(event.dataTransfer);
      if (file === null) {
        setErrorMessage('読み取れるのは PNG・JPEG の画像だけです。');
        return;
      }
      importImageFile(file);
    };
    window.addEventListener('paste', handlePaste);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // 登録のあと：60秒操作がなければ、次の登録に備えて表示を初期状態に戻す（依頼者の指示）。先に操作したら取り消す
  useEffect(() => {
    if (autoResetId === 0) {
      return undefined;
    }
    return scheduleAutoReset({
      activityTarget: window,
      onReset: () => resetToInitialStateRef.current?.(),
      onCancel: () => setAutoResetId(0),
    });
  }, [autoResetId]);

  // 抽出し直したら（抽出結果が変わったら）、右の欄を一番上に戻す。
  // 下までスクロールしたまま別の文章を抽出すると、新しい候補が見えない位置に出てしまうため（実機の確認で見つけた使いにくさ）
  useEffect(() => {
    if (extraction !== null && resultPaneRef.current !== null) {
      resultPaneRef.current.scrollTop = 0;
    }
  }, [extraction]);

  // 起動時：取り込みの結果の受け取りを登録し、設定（予定の既定の長さ）とホットキーが使えるかを1回で受け取る
  // （受け取れなければ、既定の60分・既定のキーの表記のまま）
  useEffect(() => {
    if (window.calendarApp === undefined) {
      return undefined;
    }
    const unsubscribe = window.calendarApp.onCaptureStatus((status) => captureStatusHandlerRef.current?.(status));
    window.calendarApp
      .getSettings()
      .then((result) => {
        if (!result.ok) return;
        setDurationMinutes(result.settings.durationMinutes);
        setHotkeyLabel(result.hotkeyLabel);
        setClipboardHotkeyLabel(result.clipboardHotkeyLabel);
        if (!result.hotkeyRegistered || !result.clipboardHotkeyRegistered) {
          setErrorMessage(HOTKEY_UNAVAILABLE_MESSAGE);
        }
      })
      .catch(() => {});
    return unsubscribe;
  }, []);

  /**
   * 設定画面で保存できたとき：予定の長さとホットキーの表記を新しい設定にする。
   * ホットキーを登録できるようになったら、「登録できませんでした」の表示を消す。
   *
   * @param {{settings: {durationMinutes: number}, hotkeyRegistered: boolean, hotkeyLabel: string, clipboardHotkeyRegistered: boolean, clipboardHotkeyLabel: string}} result 保存の結果
   */
  function handleSettingsSaved(result) {
    setDurationMinutes(result.settings.durationMinutes);
    setHotkeyLabel(result.hotkeyLabel);
    setClipboardHotkeyLabel(result.clipboardHotkeyLabel);
    if (result.hotkeyRegistered && result.clipboardHotkeyRegistered && errorMessage === HOTKEY_UNAVAILABLE_MESSAGE) {
      setErrorMessage('');
    }
  }

  /**
   * 「画面から読み取る」：範囲キャプチャを始めてもらう（結果は handleCaptureStatus に届く）。
   */
  async function handleStartCapture() {
    setErrorMessage('');
    try {
      const result = await window.calendarApp.startCapture();
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    } catch (error) {
      setErrorMessage('画面の取り込みを始められませんでした。もう一度お試しください。');
      console.error('範囲キャプチャを始められませんでした:', error?.name);
    }
  }

  /**
   * 「コピーした文章を読み取る」：クリップボードの文章を読んでもらう（結果は handleCaptureStatus の clipboardText に届く）。
   */
  async function handleReadClipboard() {
    setErrorMessage('');
    try {
      const result = await window.calendarApp.readClipboard();
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    } catch (error) {
      setErrorMessage('コピーした文章を読み取れませんでした。もう一度お試しください。');
      console.error('コピーした文章を読み取れませんでした:', error?.name); // 文章の内容はログに出さない
    }
  }

  /**
   * 「システム設定を開く」：Mac の画面収録の設定画面を開いてもらう（開く URL はメインプロセスで決まっている）。
   */
  async function handleOpenScreenSettings() {
    try {
      const result = await window.calendarApp.openScreenRecordingSettings();
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    } catch (error) {
      setErrorMessage('システム設定を開けませんでした。手順に沿って、システム設定から開いてください。');
      console.error('システム設定を開けませんでした:', error?.name);
    }
  }

  /**
   * 「横書き／縦書きで読み直す」：取り込んだ画像を、向きを指定して読み直してもらう。
   *
   * @param {'horizontal' | 'vertical'} orientation 読み取りの向き
   */
  async function handleRereadCapture(orientation) {
    setErrorMessage('');
    try {
      const result = await window.calendarApp.rereadCapture(orientation);
      if (!result.ok) {
        setErrorMessage(result.message);
      }
    } catch (error) {
      setErrorMessage('読み直しを始められませんでした。もう一度お試しください。');
      console.error('読み直しを始められませんでした:', error?.name);
    }
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
   * 手入力した日付（と時刻）を候補に追加し、チェックを付ける（要件§5.8）。
   * 開始時刻があれば「時刻を指定」、なければ「終日」の候補になる。
   *
   * @param {{year: number, month: number, day: number}} date 手入力した日付
   * @param {string} [startTime] 開始時刻（HH:MM。空なら終日）
   * @param {string} [endTime] 終了時刻（HH:MM。空なら既定の長さ）
   */
  function handleAddManualDate(date, startTime = '', endTime = '') {
    manualSequenceRef.current += 1;
    const candidate = createManualCandidate(date, manualSequenceRef.current, new Date());
    setManualCandidates((previous) => [...previous, candidate]);
    setSelectedIds((previousIds) => new Set(previousIds).add(candidate.id));
    if (startTime !== '') {
      setTimeChoices((previous) => ({ ...previous, [candidate.id]: { mode: TIME_MODE_SPECIFIED, startTime, endTime } }));
    }
  }

  /**
   * 「日時の情報がありません」のポップアップで日時を入れて「追加する」を押した。
   *
   * @param {{date: object, startTime: string, endTime: string}} entry 入力した日時
   */
  function handleAddFromDialog({ date, startTime, endTime }) {
    handleAddManualDate(date, startTime, endTime);
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
    setRegisteredCount(0);

    const { events, errors } = buildCalendarEvents({
      candidates: allCandidates,
      selectedIds,
      timeChoices,
      details: eventDetails,
      sourceText: extraction?.text ?? '',
      defaultDurationMinutes: durationMinutes,
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
        // 開いた件数を知らせ、60秒操作がなければ表示を初期状態に戻す予約をする（登録のたびに数え直す）
        setRegisteredCount(events.length);
        autoResetSequenceRef.current += 1;
        setAutoResetId(autoResetSequenceRef.current);
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
        <button type="button" className="button button-secondary" onClick={() => setIsSettingsOpen(true)}>
          設定
        </button>
      </header>

      {errorMessage !== '' && (
        <ErrorBanner
          message={errorMessage}
          onDismiss={() => setErrorMessage('')}
          {...(errorAction?.forMessage === errorMessage && errorAction.type === 'openScreenSettings'
            ? { actionLabel: 'システム設定を開く', onAction: handleOpenScreenSettings }
            : {})}
        />
      )}

      <main className="app-main">
        <section className="pane" aria-label="文章の入力">
          <div className="capture-row">
            <button
              type="button"
              className="button button-secondary"
              onClick={handleStartCapture}
              disabled={capture.status === 'reading'}
            >
              画面から読み取る{hotkeyLabel !== '' && `（${hotkeyLabel}）`}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleReadClipboard}
              disabled={capture.status === 'reading'}
            >
              コピーした文章を読み取る{clipboardHotkeyLabel !== '' && `（${clipboardHotkeyLabel}）`}
            </button>
            <span className="field-note">
              ほかのアプリで文章をコピーしてから {clipboardHotkeyLabel || 'ホットキー'} を押すと、そのまま抽出します。
              「画面から読み取る」は範囲を選んで文字を読み取ります（実験機能）。画像の貼り付け（{hotkeyLabel.startsWith('Cmd') ? 'Cmd' : 'Ctrl'}+V）やドラッグ＆ドロップでも読み取れます
            </span>
          </div>
          {(capture.imageUrl !== '' || capture.status === 'reading') && (
            <CaptureImagePanel capture={capture} onReread={handleRereadCapture} />
          )}
          <TextInputPanel
            value={inputText}
            onChange={setInputText}
            onExtract={handleExtract}
            onClear={resetToInitialState}
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

        {/* 右の欄：候補と入力欄はスクロールし、登録ボタンの欄は下端に固定して常に見えるようにする */}
        <section className="pane pane-with-footer" aria-label="日時の候補と予定の内容">
          <div className="pane-body" ref={resultPaneRef}>
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
                defaultDurationMinutes={durationMinutes}
              />
              <ManualDateForm
                onAdd={(date) => handleAddManualDate(date)}
                disabled={allCandidates.length >= MAX_CANDIDATES}
              />
            </div>

            <EventDetailsForm
              details={eventDetails}
              onChange={handleDetailChange}
              hasSourceText={extraction !== null && extraction.text.trim() !== ''}
            />
          </div>

          <RegisterSection
            selectedCount={selectedIds.size}
            isRegistering={isRegistering}
            registeredCount={registeredCount}
            autoResetSeconds={autoResetId !== 0 ? AUTO_RESET_DELAY_SECONDS : 0}
            onRegister={handleRegister}
          />
        </section>
      </main>

      <NoDateDialog
        open={isNoDateDialogOpen}
        onClose={() => setIsNoDateDialogOpen(false)}
        onAddManual={handleAddFromDialog}
        defaultDurationMinutes={durationMinutes}
      />

      <SettingsDialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSaved={handleSettingsSaved} />
    </div>
  );
}
