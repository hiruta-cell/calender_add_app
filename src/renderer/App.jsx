/**
 * App.jsx
 * 目的：確認ウインドウの画面全体。「文章の貼り付け → 日時の抽出 → 候補の表示」の流れを管理する。
 *
 * 1日目の範囲：抽出・色付け・候補の一覧（チェック）まで。
 * 件名・場所・メモの追記とカレンダー登録は2日目に追加する。
 */

import { useMemo, useState } from 'react';
import {
  DEFAULT_DURATION_MINUTES,
  InputTooLongError,
  extractDateCandidates,
} from '../core/dateExtractor.js';
import CandidateList from './components/CandidateList.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';
import HighlightedText from './components/HighlightedText.jsx';
import NoDateDialog from './components/NoDateDialog.jsx';
import TextInputPanel from './components/TextInputPanel.jsx';

/** 予期しないエラーのときに表示する文（文章の内容は含めない：CLAUDE.md） */
const UNEXPECTED_ERROR_MESSAGE = '日時の抽出中にエラーが発生しました。もう一度お試しください。';

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
  /** チェックを付けた候補の ID の集合 */
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  /** 画面上部に表示するエラーの文（なければ空文字） */
  const [errorMessage, setErrorMessage] = useState('');
  /** 「日時の情報がありません」の表示中かどうか */
  const [isNoDateDialogOpen, setIsNoDateDialogOpen] = useState(false);

  /** 色付けする範囲（すべての候補の位置をまとめたもの） */
  const highlightRanges = useMemo(
    () => (extraction === null ? [] : extraction.candidates.flatMap((candidate) => candidate.ranges)),
    [extraction],
  );

  /** 抽出した後に入力欄の文章が書き換えられたか */
  const isInputChangedAfterExtraction = extraction !== null && extraction.text !== inputText;

  /**
   * 「日時を抽出」：入力欄の文章から日時の候補を抽出する。
   * 候補がなければ「日時の情報がありません」を表示する（要件§5.8）。
   */
  function handleExtract() {
    setErrorMessage('');
    try {
      const result = extractDateCandidates(inputText, {
        now: new Date(),
        defaultDurationMinutes: DEFAULT_DURATION_MINUTES,
      });
      setExtraction({ text: inputText, candidates: result.candidates, truncated: result.truncated });
      setSelectedIds(new Set()); // 要件§5.3：登録するものは利用者がチェックを付けて選ぶ
      if (result.candidates.length === 0) {
        setIsNoDateDialogOpen(true);
      }
    } catch (error) {
      // 処理を中断して待機状態（未抽出の状態）に戻し、エラーの内容を表示する（要件§5.9）
      setExtraction(null);
      setSelectedIds(new Set());
      if (error instanceof InputTooLongError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(UNEXPECTED_ERROR_MESSAGE);
        console.error('日時の抽出に失敗しました:', error?.name); // 文章の内容はログに出さない
      }
    }
  }

  /**
   * 「クリア」：入力欄と抽出結果を消して、最初の状態に戻す。
   */
  function handleClear() {
    setInputText('');
    setExtraction(null);
    setSelectedIds(new Set());
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

        <section className="pane" aria-label="日時の候補">
          <h2 className="section-title">日時の候補</h2>
          <CandidateList
            hasExtracted={extraction !== null}
            candidates={extraction?.candidates ?? []}
            truncated={extraction?.truncated ?? false}
            selectedIds={selectedIds}
            onToggle={handleToggleCandidate}
            defaultDurationMinutes={DEFAULT_DURATION_MINUTES}
          />
        </section>
      </main>

      <NoDateDialog open={isNoDateDialogOpen} onClose={() => setIsNoDateDialogOpen(false)} />
    </div>
  );
}
