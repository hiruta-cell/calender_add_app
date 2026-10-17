---
name: verify
description: このアプリ（Electron）を実際に起動し、DevTools 経由で画面を操作して変更を確かめる手順
---

# 実機での確かめ方（/verify 用）

## 起動（利用者の設定を汚さない）

```bash
npm run build                          # 画面のビルド（dist/renderer）
UD=$(mktemp -d)                        # 確認専用の設定フォルダ（settings.json はここに書かれる）
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron . --user-data-dir="$UD" --remote-debugging-port=9333 &
```

- 多重起動防止は設定フォルダごとなので、`--user-data-dir` を分ければ手動で起動中のアプリと重ならない
- 画面のページは `http://127.0.0.1:9333/json/list` の `app://bundle/index.html`。Node 24 の `WebSocket` で接続して `Runtime.evaluate` / `Input.insertText` / `Input.dispatchMouseEvent` / `Page.captureScreenshot` を使う
- 自動起動と同じ起動は `--hidden` を付ける。ウインドウが出ていないことは `document.visibilityState` では分からない（visible のまま）。OS の画面上のウインドウ一覧（Swift の `CGWindowListCopyWindowInfo`、所有者名 Electron）で確かめる
- 終わったら起動したプロセスを終了する（常駐するので、閉じるだけでは残る）

## 確かめる価値のある流れ

- README「まず試す」：`demo/texts/1-mail-ja.txt` を貼り付け →「日時を抽出」→ 候補・件名・場所・URL・件名の残り文字数・URL の注意（サイト名）
- 件名に 60 文字を `Input.insertText` で入れる → 50 文字で止まる
- URL 欄：キリル文字の `https://zооm.us/...`（xn-- で表示・強めの注意）、`javascript:`、`https://zoom.us@evil.example/`（どちらも注意の箱は出ずエラー）
- 終了の選択（2026-10-12 の仕様変更）：候補にチェック → 「終了」の一覧（30分後〜23時間30分後の47項目＋終日。項目に終わる時刻）。時刻ありは設定の長さ、日付だけは終日が初めの選択。日付だけで長さを選ぶと「開始」の欄が出る。「14時〜15時」でも候補は 14:00 だけ
- 設定：長さ（30・60・90・120分）・キーを変えて保存 → ボタンの表記、`$UD/settings.json`（権限 600）、デモ2の候補の「終了」の初めの選択が変わる。再起動しても残る。壊れた settings.json・15分や45分の保存値でも既定値で起動する
- 画面から `window.calendarApp.saveSettings(不正な値)` → 断られ、ファイルは変わらない

## npm run test:smoke の仕組み（CLAUDE.md から移した）

- ブラウザを開く処理（shell.openExternal）と画面の撮影（desktopCapturer.getSources）をメインプロセスで差し替える
- 設定は確認専用の一時フォルダ（`--user-data-dir`）に書いて終了後に消し、ウインドウは選択しないで表示する（利用者の設定・文字入力を邪魔しない）。本物の自動起動の登録やデスクトップのアイコンは作らない
- 確認の最後と時間切れのときに必ずアプリを終了させる（常駐するため）。新しい確認を足すときもこれを守る
- 実際のキーボード入力（Esc など）はウインドウが選択されていないため届かない。画面の中でイベントを起こして流れを確かめ、実際のキー操作は依頼者が手動で確かめる

## 注意

- 「Googleカレンダーで開く」は実際のブラウザを開く。押す場合はメインプロセス側で shell.openExternal を差し替える（scripts/smoke-test.js の replaceOpenExternal を参照）
- 「デスクトップにアイコンを作る」と自動起動のオンは、本物のデスクトップ・~/Library/LaunchAgents に書き込むので、依頼者の了承なしに押さない
- 年のない日付・「来週」は実行した日から数えるので、結果の日付は日によって変わる
