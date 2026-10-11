/**
 * ErrorBoundary.jsx
 * 目的：画面の表示中に予期しないエラーが起きても、アプリを止めずに「最初の画面に戻る」を選べるようにする（要件§5.9）。
 *
 * React でエラーを受け止める仕組み（Error Boundary）はクラスで書く必要があるため、ここだけクラスを使う。
 */

import { Component, Fragment } from 'react';

/**
 * 子の画面で起きたエラーを受け止める枠。
 */
export default class ErrorBoundary extends Component {
  /**
   * @param {{children: React.ReactNode}} props
   */
  constructor(props) {
    super(props);
    /**
     * hasError：エラーが起きて、代わりの画面を表示中か
     * resetKey：この値を変えると子の画面が作り直され、入力内容などが初期状態に戻る
     */
    this.state = { hasError: false, resetKey: 0 };
    this.handleReset = this.handleReset.bind(this);
  }

  /**
   * エラーが起きたら、代わりの画面を表示する状態にする（React が呼ぶ）。
   *
   * @returns {{hasError: boolean}}
   */
  static getDerivedStateFromError() {
    return { hasError: true };
  }

  /**
   * エラーの種類だけを記録する（React が呼ぶ）。文章の内容が含まれうるため、メッセージは記録しない。
   *
   * @param {Error} error 起きたエラー
   */
  componentDidCatch(error) {
    console.error('画面の表示中にエラーが発生しました:', error?.name);
  }

  /**
   * 「最初の画面に戻る」：エラー表示を消し、子の画面を作り直す。
   */
  handleReset() {
    this.setState((previousState) => ({ hasError: false, resetKey: previousState.resetKey + 1 }));
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fatal-error" role="alert">
          <h1>画面の表示中にエラーが発生しました</h1>
          <p>入力中の内容は破棄されました。下のボタンで最初の画面に戻れます。</p>
          <button type="button" className="button button-primary" onClick={this.handleReset}>
            最初の画面に戻る
          </button>
        </div>
      );
    }
    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}
