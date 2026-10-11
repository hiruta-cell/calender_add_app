/**
 * HighlightedText.jsx
 * 目的：抽出に使った文章を表示し、日時と認識した部分を色付けする（要件§6.1）。
 *
 * 文章は React の通常の文字列として描画する（dangerouslySetInnerHTML は使わない）。
 * そのため、文章に HTML のタグが含まれていても、タグとして解釈・実行されない。
 */

import { useMemo } from 'react';
import { splitTextByRanges } from '../../core/highlight.js';

/**
 * 色付きの文章。
 *
 * @param {object} props
 * @param {string} props.text 表示する文章
 * @param {Array<{start: number, end: number}>} props.ranges 色付けする範囲
 * @returns {JSX.Element}
 */
export default function HighlightedText({ text, ranges }) {
  const segments = useMemo(() => splitTextByRanges(text, ranges), [text, ranges]);

  return (
    <div className="highlighted-text">
      {segments.map((segment) =>
        segment.highlighted ? (
          <mark key={segment.start}>{segment.text}</mark>
        ) : (
          <span key={segment.start}>{segment.text}</span>
        ),
      )}
    </div>
  );
}
