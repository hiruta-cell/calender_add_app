# コード リファレンス（変数・定数・関数の一覧）

コードを追加・改名・削除したら、同じ変更の中でこの一覧も更新する（[CLAUDE.md](../CLAUDE.md) 参照）。

- 最終更新：2026-10-14（GitHub Pages で公開する案内ページ `site/` と、公開の手順 `.github/workflows/pages.yml` を追加。前回：2026-10-11 の4日目 設定画面・デスクトップのアイコン・ログイン時の自動起動）
- 「公開」は他のファイルから使えるもの（export）、「内部」はそのファイルの中だけで使うもの

## フォルダの意味

| フォルダ | 意味 |
|---|---|
| `src/` | アプリのソースコード（画面と中核ロジック） |
| `src/core/` | 日時抽出などの中核ロジック。画面や Electron に依存しない純粋な関数だけを置く（単体テストの対象） |
| `src/renderer/` | 確認ウインドウの画面（React）。利用者が操作する部分 |
| `src/renderer/components/` | 画面を構成する部品（入力欄、候補の一覧、ポップアップなど） |
| `electron/` | Electron のメインプロセス。アプリの起動、ウインドウ、セキュリティ設定など PC 側の処理 |
| `scripts/` | 開発者用の補助スクリプト（実機の自動確認、テスト用の画像やアイコンの作成） |
| `assets/icons/` | タスクトレイ（Mac はメニューバー）のアイコンと、アプリのアイコン（app.png・Windows 用 app.ico・Mac 用 app.icns）。どれもコードで描いたもの |
| `launcher/` | Mac で「デスクトップにアイコンを作る」を押すと作られる起動用の .app（デスクトップにはここへの別名を置く）。利用者ごとに場所が違うため Git には含めない |
| `demo/images/` | 読み取りテストと発表のデモに使う架空の文面の画像（日本語のメール・チャット・縦書き・英語のメール、SNS 風の告知・写真の上の文字・傾いた紙の連絡状・ライブ告知） |
| `test/` | 単体テスト（Node.js 標準の `node:test`） |
| `test/fixtures/` | テスト用の小さなファイル（app:// の配信テスト、OCR のテスト用の架空の画像） |
| `demo/texts/` | README の「まず試す」で貼り付ける架空の文面3通（日本語のメール・チャット・英語のメール） |
| `site/` | GitHub Pages で公開する案内ページ（静的な HTML と CSS と画像）。公開されるのはこのフォルダの中だけ。外部のスクリプト・フォント・CDN は使わない |
| `.github/workflows/` | GitHub Actions の手順。`pages.yml` は `site/` を GitHub Pages へ公開する（`main` への push で動く） |
| `docs/` | 説明ファイル（このファイル、受け入れ基準） |
| `docs/reports/` | Windows などで行った確認・調査の報告（Windows の Claude Code が書いて push し、Mac 側が読む。2026-10-12 依頼者の指示。ユーザー名・フォルダのパスは書かない） |
| `dist/` | ビルド結果（`npm run build` で作られる。Git には含めない） |
| `node_modules/` | インストールした部品（`npm ci` で作られる。Git には含めない） |
| `test-results/` | 実機の自動確認で保存した画面の画像（Git には含めない） |

## 各ファイルの基本機能

| ファイル | 基本機能 |
|---|---|
| `package.json` | アプリの名前、起動・テストのコマンド、使う部品とバージョン |
| `package-lock.json` | 部品のバージョンを完全に固定した記録（`npm ci` はこれに従う） |
| `.npmrc` | npm の設定（バージョンの固定、Node.js のバージョン確認、インストール時スクリプトの禁止） |
| `.gitignore` | Git に含めないファイルの指定（秘密情報・ビルド結果など） |
| `vite.config.js` | 画面のビルド設定（開発用サーバーは使わない） |
| `src/core/textNormalizer.js` | 全角の数字・記号を半角にそろえる（文字数は変えない） |
| `src/core/japaneseNumber.js` | 漢字の数字（十五、二〇二六など）を数値に変換する |
| `src/core/dateUtils.js` | 日付の計算（東京の日時、日数・分の加算、曜日、比較、差） |
| `src/core/dateExtractor.js` | 文章から日時の候補を抽出する（このアプリの中心） |
| `src/core/candidateFormatter.js` | 候補を「2026年10月15日(木) 14:00」のような表示用の文字列にする。終了の一覧の項目名（「1時間30分後（15:30）」）も作る |
| `src/core/highlight.js` | 文章の日時部分を色付けするために、文章を分割する |
| `src/core/detailExtractor.js` | 文章から件名・場所・オンライン会議の URL を取り出して下書きにする |
| `src/core/mailHeader.js` | メールの送信日・受信日・引用の見出しの行を見つける（その行の日付を候補にしないため） |
| `src/core/calendarUrl.js` | Googleカレンダーの予定作成画面の URL を組み立て、内容と URL を検証する |
| `src/core/registration.js` | 選んだ候補と入力欄の内容から、登録する予定の一覧を作る（終了は「開始から何分後」か「終日」、手入力の候補も） |
| `src/core/autoReset.js` | 登録のあと、60秒操作がなければ表示を初期状態に戻す「自動のクリア」を予約する（操作したら取り消す） |
| `src/core/ocrText.js` | OCR の結果の文章を整える（日本語の文字の間の余分な空白を除く） |
| `src/core/settings.js` | 設定（予定の既定の長さ・ホットキー）の既定値・選択肢・検証と、ホットキーの表記 |
| `src/renderer/index.html` | 確認ウインドウの土台となる HTML |
| `src/renderer/overlay.html` / `overlay.js` / `overlay.css` | 範囲選択の画面（撮影した画面を暗く表示し、ドラッグで範囲を選ぶ。Esc・右クリックで中止） |
| `src/renderer/main.jsx` | 画面の起点。App を描画し、エラーを受け止める枠で包む |
| `src/renderer/App.jsx` | 確認ウインドウ全体。貼り付け→抽出・下書き→候補の選択・追記→登録の流れを管理する |
| `src/renderer/styles.css` | 画面の見た目（ダークモード対応。余白・文字を小さめにしたコンパクトな配置） |
| `src/renderer/imageImport.js` | 貼り付け・ドラッグ＆ドロップした画像を PNG にそろえる（写真の向きの補正・大きすぎる写真の縮小） |
| `src/renderer/components/TextInputPanel.jsx` | 文章の入力欄と「日時を抽出」「クリア」ボタン |
| `src/renderer/components/HighlightedText.jsx` | 抽出に使った文章を、日時部分を色付けして表示する |
| `src/renderer/components/CandidateList.jsx` | 日時の候補をチェックボックス付きで一覧表示する |
| `src/renderer/components/TimeChoiceFields.jsx` | 候補ごとに終了（開始から30分〜23時間30分後・終日）を選ぶ欄。日付だけの候補で長さを選ぶと開始時刻の欄も出す |
| `src/renderer/components/ManualDateForm.jsx` | 日時を手入力して候補に追加する欄 |
| `src/renderer/components/EventDetailsForm.jsx` | 件名・場所・オンライン会議 URL・メモの入力欄 |
| `src/renderer/components/RegisterSection.jsx` | 「Googleカレンダーで開く」ボタンと、開いたあとの案内（右の欄の下端に固定） |
| `src/renderer/components/NoDateDialog.jsx` | 「日時の情報がありません」のポップアップ（その場で日付・時刻を手入力して「追加する」） |
| `src/renderer/components/CaptureImagePanel.jsx` | 取り込んだ画像・読み取りの状態・「横書き／縦書きで読み直す」 |
| `src/renderer/components/SettingsDialog.jsx` | 設定画面（予定の既定の長さ・ホットキー・ログイン時の自動起動・デスクトップにアイコンを作る） |
| `src/renderer/components/ErrorBanner.jsx` | エラーの内容を画面上部に表示する |
| `src/renderer/components/ErrorBoundary.jsx` | 画面の表示中のエラーを受け止め、最初の画面に戻れるようにする |
| `electron/main.js` | アプリの起動、確認ウインドウ、常駐（トレイ）、ホットキー、設定の読み込み、デスクトップのアイコン・自動起動の実行、多重起動の防止、画面との通信の受け付けの登録 |
| `electron/settingsStore.js` | 設定を userData/settings.json に保存・読み込みする（設定だけ。本人だけが読める権限で、書きかけで壊れないように保存） |
| `electron/settingsIpc.js` | 設定の読み込み・保存・デスクトップのアイコン作成の通信の受け付け（送信元・内容の検証、失敗したら元に戻す） |
| `electron/desktopIntegration.js` | デスクトップのアイコンとログイン時の自動起動の中身を作る（Mac：起動用の .app・別名・LaunchAgent、Windows：ショートカット・ログイン項目の設定） |
| `electron/tray.js` | タスクトレイ（Mac はメニューバー）のアイコンとメニュー |
| `electron/captureController.js` | 範囲キャプチャから OCR までの流れ（撮影・範囲選択・切り出し・拡大・OCR・失敗時の後始末） |
| `electron/captureGeometry.js` | 範囲選択の座標の検証と、画面の座標から画像の画素への変換 |
| `electron/captureImageStore.js` | 取り込んだ画像をメモリの中だけで持つ（app://bundle/capture/〜 で表示） |
| `electron/captureIpc.js` | 範囲キャプチャの通信の受け付け（送信元・読み直しの向きの検証） |
| `electron/clipboardImport.js` | コピーした文章（クリップボード）を読み取り、抽出に回せるかを確かめる。画面のボタンからの要求の受け付け |
| `electron/overlayPreload.cjs` | 範囲選択の画面に「選んだ範囲を送る」「中止する」の2つだけを公開する |
| `electron/screenPermission.js` | Mac の画面収録の許可がないとき、起動元のアプリ（ターミナル・VSCode など）の名前を入れて案内する |
| `electron/preload.cjs` | 確認ウインドウに、登録・範囲キャプチャ・設定に必要な関数だけを公開する |
| `electron/calendarIpc.js` | 画面からの登録要求を検証し、予定作成画面を既定のブラウザで開く |
| `electron/ocrEngine.js` | 画像から文字を読み取る（Tesseract.js。横書き・縦書き、PC 内の文字データだけを使う） |
| `electron/appProtocol.js` | 画面ファイルを app:// で配信し、CSP を付ける（配信フォルダの外は読ませない） |
| `electron/security.js` | セキュリティ設定（隔離、外部通信の遮断、権限要求の拒否、外部への移動の禁止） |
| `scripts/smoke-test.js` | アプリを実際に起動し、画面を自動操作して機能とセキュリティを確認する |
| `scripts/generate-ocr-fixtures.js` | OCR のテスト用の画像（架空の文章）を作る（開発者が一度だけ実行） |
| `scripts/ocr-diagnose.js` | OCR の診断（`npm run ocr:diagnose`）。PC の環境・文字データの指紋と、デモの架空の画像2枚を2種類の部品で読んだ結果を表示する（PC による違いの原因の切り分け） |
| `scripts/ocr-diagnose-canvas.js` | OCR の診断（`npm run ocr:diagnose:canvas`）。縦書きのデモ画像をアプリと同じ方法で画面で PNG に変換し、変換前後の画素の違いと、Electron の本体の中で読んだ結果を表示する |
| `scripts/ocr-diagnose-simd-worker.cjs` | 診断の作業スレッド。Tesseract の部品を relaxed SIMD を使わない版に差し替えて読ませる |
| `scripts/generate-icons.js` | トレイとアプリのアイコンをコードで描いて作る（開発者がアイコンを作り直すときだけ実行） |
| `scripts/generate-demo-images.js` | デモ用の架空の文面の画像を作る（開発者がデモ画像を作り直すときだけ実行） |
| `test/*.test.js` | 各ファイルの単体テスト（詳しくは末尾の「test/」の表） |
| `site/index.html` | 案内ページ本体。紹介・プライバシー・はじめかた・注意を書く。CSP（外部通信とスクリプトの禁止）を meta で設定する |
| `site/styles.css` | 案内ページの見た目。色は `:root` の変数で決め、ダークモードの色も持つ |
| `site/app.png` | 案内ページのアイコン（`assets/icons/app.png` の複製。アイコンを変えたら両方を更新する） |
| `.github/workflows/pages.yml` | `site/` だけを GitHub Pages に公開する手順。公式アクションはコミット SHA で固定する。公開先：https://hiruta-cell.github.io/calender_add_app/ |
| `README.md` | 利用者向けの説明（起動手順、使い方、対応する書き方） |
| `CLAUDE.md` | 開発のルール（セキュリティ方針、コーディング規約など） |
| `requirements-memo.md` | 要件の一次資料（決定事項と追加決定事項 §12） |
| `SECURITY.md` | 脆弱性の報告方法 |
| `LICENSE` | ライセンス（MIT） |
| `docs/CODE-REFERENCE.md` | このファイル。フォルダ・ファイル・変数・関数の説明 |
| `docs/ACCEPTANCE.md` | ゴール（受け入れ基準）と確認の記録 |
| `docs/WINDOWS-CHECK.md` | Windows での最終版の確認の手順（依頼者が実施。clone からの起動・文章からの登録・画像の読み取り・キー操作・設定・デスクトップのアイコン・自動起動。番号ごとに OK／NG を記録） |

## データの形：日時の候補（`extractDateCandidates` が返すもの）

| 項目 | 型 | 内容 |
|---|---|---|
| `id` | 文字列 | 候補の ID（`candidate-0` から順番） |
| `ranges` | `{start, end}` の配列 | 元の文章の中で、この日時が書かれていた位置（色付けに使う。同じ日時が複数回あれば複数） |
| `sourceText` | 文字列 | 元の表記（例：`10月15日(木)14時〜15時`。範囲は1つの書き方として読むが、終了の時刻は使わない） |
| `hasTime` | 真偽 | 時刻の記載があるか。false なら日付だけ（終了の選択の初めの値が「終日」になる） |
| `start` | `{year, month, day, hour, minute}` | 開始日時。`hasTime` が false なら `hour`・`minute` は null |
| `warnings` | 文字列の配列 | 警告コード（`past`：過去の日時、`ambiguousOrder`：月と日の順番、`weekdayMismatch`：曜日が日付と合わない） |

## データの形：予定（登録のとき画面からメインプロセスへ渡すもの）

| 項目 | 型 | 内容 |
|---|---|---|
| `title` | 文字列 | 件名（最大50文字） |
| `location` | 文字列 | 場所。場所が空なら会議 URL が入る（最大1000文字） |
| `details` | 文字列 | メモ。場所があるときは先頭に「オンライン会議：URL」（最大2000文字） |
| `allDay` | 真偽 | 終日の予定か |
| `start` | `{year, month, day, hour, minute}` | 開始日時（終日なら hour・minute は使わない） |
| `end` | 同上 または null | 終了日時（終日なら null。URL では翌日になる） |

メインプロセスは、この値を `validateCalendarEvent` で必ず検証してから URL を組み立てる。

---

## src/core/textNormalizer.js（全角→半角）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `FULLWIDTH_ASCII_PATTERN` | 定数（内部） | 全角英数記号（U+FF01〜U+FF5E）に一致する正規表現 | 半角に直す文字を見つける |
| `FULLWIDTH_TO_HALFWIDTH_OFFSET` | 定数（内部） | 全角と半角の文字コードの差（0xFEE0） | 1文字ずつ半角に変換する |
| `IDEOGRAPHIC_SPACE_PATTERN` | 定数（内部） | 全角スペースに一致する正規表現 | 半角スペースに直す |
| `normalizeWidth(text)` | 関数（公開） | 全角英数記号・全角スペースを半角にする。文字数は変えない | 「１０／１５」などの表記ゆれを吸収しつつ、色付けの位置をずらさない |

## src/core/japaneseNumber.js（漢字の数字）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `KANJI_DIGITS` | 定数（内部） | 〇・零・一〜九と 0〜9 の対応 | 漢字の数字を読む |
| `KANJI_UNITS` | 定数（内部） | 十・百・千と 10・100・1000 の対応 | 位を使う書き方を読む |
| `ARABIC_NUMBER_PATTERN` | 定数（内部） | 半角数字だけの文字列 | 半角数字はそのまま数値にする |
| `UNIT_PATTERN` | 定数（内部） | 位の漢字を含むか | 「二〇二六」と「二千二十六」の書き方を区別する |
| `parseJapaneseNumber(text)` | 関数（公開） | 半角数字・漢字の数字を数値にする（不正なら NaN） | 十月十五日・十五時三十分などに対応する |

## src/core/dateUtils.js（日付の計算）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `CALENDAR_TIME_ZONE` | 定数（公開） | `'Asia/Tokyo'` | 要件§12：タイムゾーンを東京に固定 |
| `MINUTES_PER_HOUR` / `MINUTES_PER_DAY` | 定数（公開） | 60 / 1440 | 時刻計算の数字に名前を付ける |
| `DAYS_PER_WEEK` | 定数（公開） | 7 | 「来週」の計算 |
| `WEEKDAY_CHARACTERS` | 定数（公開） | `'月火水木金土日'`（位置が月曜=0〜日曜=6） | 曜日の漢字と曜日番号の対応 |
| `tokyoDateTimeFormatter` | 定数（内部） | 東京の年月日時分を取り出す書式 | 作成が重いので使い回す |
| `getTokyoDateTime(instant)` | 関数（公開） | ある瞬間の東京の年月日時分を返す | PC の設定に関係なく「今日」を決める |
| `isValidDate(year, month, day)` | 関数（公開） | 実在する日付か調べる | 2/30・4/31 などを候補から除く |
| `addDays(date, days)` | 関数（公開） | 年月日に日数を足す | 「明日」「来週」の計算 |
| `addMinutes(dateTime, minutes)` | 関数（公開） | 年月日時分に分を足す | 選んだ長さから終了日時を求める（日付をまたぐ場合も） |
| `getMondayBasedWeekday(date)` | 関数（公開） | 曜日番号（月曜=0〜日曜=6）を返す | 月曜始まりの週の計算、曜日の表示 |
| `compareDates(a, b)` | 関数（公開） | 年月日の前後を比べる | 年の決定、過去の日付の判定 |
| `compareDateTimes(a, b)` | 関数（公開） | 年月日時分の前後を比べる | 過去の日時の判定 |
| `MILLISECONDS_PER_MINUTE` | 定数（内部） | 60000 | 分の計算 |
| `diffMinutes(from, to)` | 関数（公開） | 2つの日時の差を分で返す | 予定の長さの確認（登録時） |

## src/core/dateExtractor.js（日時の抽出：中心となるファイル）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `MAX_INPUT_LENGTH` | 定数（公開） | 20000 | 長すぎる入力で処理が重くならないようにする |
| `MAX_CANDIDATES` | 定数（公開） | 30 | 候補で画面やブラウザのタブがあふれないようにする |
| `WARNING_PAST` | 定数（公開） | `'past'` | 「過去の日時」の警告コード |
| `WARNING_AMBIGUOUS_ORDER` | 定数（公開） | `'ambiguousOrder'` | 月と日の順番が決まらない英語の数字の日付を月/日として読んだ警告 |
| `WARNING_WEEKDAY_MISMATCH` | 定数（公開） | `'weekdayMismatch'` | 日付の後ろに書かれた曜日が本当の曜日と合わない警告（例：2026年10月15日(水)） |
| `ENGLISH_WEEKDAY_NAMES` | 定数（内部） | 英語の曜日の正式名（月曜始まり。先頭3文字が略称） | 英語の曜日と日付が合うかを確かめ、下書きの曜日を直す |
| `ENGLISH_WEEKDAY_ABBREVIATION_LENGTH` | 定数（内部） | 3 | 英語の曜日の略称（Mon など）の文字数 |
| `correctWrittenWeekdays(text, options)` | 関数（公開） | 文章の「日付＋曜日」で、日付と合わない曜日を本当の曜日に書き換える | 件名・場所の下書きの曜日を日付に合わせる（依頼者の指示） |
| `TWO_DIGIT_YEAR_BASE` | 定数（内部） | 2000 | 2桁の年（26.10.15）を 2026 年にする |
| `MONTHS_PER_YEAR` | 定数（内部） | 12 | 月と日の順番の判定 |
| `ENGLISH_MONTH_NUMBERS` / `ENGLISH_MONTH_PATTERN` | 定数（内部） | 英語の月名と数字の対応／月名の正規表現の部品 | 英語の日付を読む |
| `MAX_YEAR_LOOKAHEAD` | 定数（内部） | 4 | 年なしの 2/29 で次のうるう年まで探す |
| `MERIDIEM_AM` / `MERIDIEM_PM` | 定数（内部） | `'午前'` / `'午後'` | 午前・午後の判定 |
| `HALF_HOUR_MINUTES` | 定数（内部） | 30 | 「14時半」の「半」 |
| `DATE_PATTERN` | 定数（内部） | 日付の書き方の正規表現（10/15、10月15日、2026年10月15日、十月十五日、2026/10/15、26.10.15、10/15/2026、October 15, 2026、15 Oct、明日、tomorrow、来週火曜） | 文章から日付を探す。「再来週」「説明日程」は除外 |
| `WEEKDAY_PATTERN` | 定数（内部） | 曜日の表記（(木)、(月・祝)、木曜日、(Thu)）。曜日を名前付きグループと位置（d フラグ）で取り出す | 日付の後の曜日を読み飛ばし、日付と合うかを確かめる |
| `CONNECTOR_PATTERN` | 定数（内部） | 日付と時刻のつなぎ（空白、の、は、、、at、from、@） | 「明日の14時」「Oct 15 at 3pm」を1つの日時として読む |
| `TIME_PATTERN` | 定数（内部） | 時刻の書き方（14:00、14時30分、14時半、午前/午後、3pm・3:00 PM・PM3:00、2-3pm の「2」） | 時刻を読む（十五時三十分など漢字の数字も可）。「2時間」「一時的」「一時停止」「AMAZON」は除外 |
| `TIME_WORD_PATTERN` | 定数（内部） | 時間帯の言葉（正午・朝・昼・夕方・夜） | 時間帯の言葉を読む（要件§12） |
| `TIME_WORD_GAP_PATTERN` | 定数（内部） | 言葉と時刻の間のつなぎ（空白、の） | 「夜の7時」を1つの時刻として読む |
| `TIME_WORD_DEFAULTS` | 定数（内部） | 正午12時・朝9時・昼11時・夕方15時・夜18時 | 時刻が続かないときの開始時刻 |
| `AMBIGUOUS_HOUR_MAX` | 定数（内部） | 11 | 言葉から午前/午後を推定する上限（12時以降は書かれた時刻を優先） |
| `NOON_WORD_PM_MAX_HOUR` | 定数（内部） | 6 | 「昼1時」を13時とみなす上限 |
| `RANGE_SEPARATOR_PATTERN` | 定数（内部） | 範囲の区切り（〜、-、から、to、until など） | 開始〜終了の時刻を読む |
| `LINE_END_PATTERN` | 定数（内部） | 日付の後ろが行末か | 次の行の時刻を結び付けてよいかの判定 |
| `NEXT_LINE_TIME_LABEL_PATTERN` | 定数（内部） | 次の行の先頭の「時間：」「時刻：」「開始：」「Time:」「Start:」 | 日付と時刻が別の行のメールに対応 |
| `ADJACENT_TIME_GAP_PATTERN` | 定数（内部） | 区切りなしで続く2つ目の時刻の前の空白（0〜1個） | OCR で「〜」が抜けた「14時15時」を範囲として読む |
| `InputTooLongError` | クラス（公開） | 長すぎる文章のエラー（利用者向けの文付き） | 画面でそのまま表示できるエラーにする |
| `extractDateCandidates(text, options)` | 関数（公開） | 文章から日時の候補を抽出し `{candidates, truncated}` を返す | このアプリの中心機能（要件§5.2〜§5.7、§12） |
| `validateArguments(text, now)` | 関数（内部） | 引数を検証し、問題があれば例外を投げる | 不正な入力で誤動作しないようにする |
| `matchAt(pattern, text, index)` | 関数（内部） | 正規表現を指定した位置から一致させる | 日付の直後の曜日・時刻を読む |
| `readWrittenWeekday(text, dateMatch, date)` | 関数（内部） | 日付の直後の曜日を読み、日付の本当の曜日と合わなければ位置と正しい書き方を返す | 警告と下書きの書き換えで共通に使う |
| `toEnglishWeekdayLike(writtenText, weekday)` | 関数（内部） | 書かれた英語の曜日と同じ書き方（略称・大文字小文字）で正しい曜日を作る | 下書きの英語の曜日を直す |
| `skipPattern(pattern, text, index)` | 関数（内部） | 一致した分だけ読み取り位置を進める | 曜日・つなぎの言葉を読み飛ばす |
| `resolveDate(groups, today)` | 関数（内部） | 一致した書き方に応じて年月日と警告を決める | 書き方ごとの処理の振り分け |
| `toEnglishMonthNumber(monthName)` | 関数（内部） | 英語の月名を月の数字にする | 英語の日付を読む |
| `resolveYearLastDate(firstText, secondText, yearText)` | 関数（内部） | 年が最後の数字の日付の月と日を決める（日が13以上なら英国式、それ以外は米国式。決まらなければ警告） | 依頼者の決定（曖昧なら米国式） |
| `resolveCalendarDate(yearText, monthText, dayText, today)` | 関数（内部） | 年月日を決める。年がなければ今日以降で最も近い日 | 要件§12：年なしの日付の扱い |
| `resolveNextWeekWeekday(weekdayCharacter, today)` | 関数（内部） | 「来週◯曜」の年月日を決める | 要件§12：月曜始まりの週 |
| `matchTimeRange(text, index)` | 関数（内部） | 時刻または時刻の範囲を読む（後ろにだけ PM があれば前の時刻にも当てはめる） | 開始・終了の時刻を得る（2-3pm → 14〜15時） |
| `matchNextLineTimeRange(text, index)` | 関数（内部） | 日付が行末で、次の行が時間の見出しで始まるとき、その行の時刻を読む | 「Date:」「Time:」が別の行のメール |
| `matchTimeAt(text, index, inheritedMeridiem)` | 関数（内部） | 時刻を1つ読む（時間帯の言葉にも対応） | 「夜7時→19時」「夜→18時」の解釈 |
| `toMinutesOfDay(time)` | 関数（内部） | 時刻をその日の 0:00 からの分数にする | 区切りのない2つの時刻の前後を比べる |
| `normalizeMeridiem(text)` | 関数（内部） | 午前/午後/AM/PM/a.m./p.m. を「午前」「午後」にそろえる | 12時間表記の混在に対応 |
| `meridiemFromTimeWord(word, rawHour)` | 関数（内部） | 時間帯の言葉から午前/午後を推定する | 朝→午前、夕方・夜→午後、昼1〜6時→午後。「朝17時」など食い違う書き方は書かれた時刻を優先 |
| `parseTime(groups, inheritedMeridiem, timeWord)` | 関数（内部） | 時刻を24時間制の時・分にする | 午前/午後・半・分の解釈 |
| `applyMeridiem(hour, meridiem)` | 関数（内部） | 午前/午後を反映した「時」を返す | 午前12時→0時、午後3時→15時 |
| `buildCandidate(date, timeRange, current, dateWarnings)` | 関数（内部） | 候補の本体（開始・警告）を作る。範囲の終了の時刻は使わない | 候補の形をそろえる（終了は画面で選ぶ。2026-10-12 仕様変更） |
| `getCandidateKey(candidate)` | 関数（内部） | 同じ日時（時刻の有無と開始）を見分けるキーを作る | 重複する候補を1件にまとめる（終了が違っても開始が同じなら1件） |

## src/core/mailHeader.js（メールの送信日・受信日の行）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `findMailHeaderRanges(text)` | 関数（公開） | 送信日・受信日・引用の見出しの行の範囲（start〜end）を返す | Outlook・Thunderbird・Gmail・Apple Mail の送信日を予定と誤認しない（依頼者の指摘） |
| `isInRanges(position, ranges)` | 関数（公開） | 位置が範囲のどれかに含まれるか | 日付が除外する行にあるかの判定 |
| `QUOTE_PREFIX` | 定数（内部） | 行頭の引用記号「>」と空白の正規表現の部品 | 引用されたヘッダーも対象にする |
| `buildHeaderLabelPattern(labels)` | 関数（内部） | 行頭の「見出し:」（太字の `*From:*` も可）の正規表現を作る | 見出しの一覧から正規表現を作る |
| `SENT_DATE_LABEL_PATTERN` | 定数（内部） | Sent / Received / 送信日時 / 受信日時 など | 必ず除外する送信日・受信日の行 |
| `CONTEXT_DATE_LABEL_PATTERN` | 定数（内部） | Date / 日付 | ヘッダーのまとまりの中にあるときだけ除外（本文の「日付：10月15日」は残す） |
| `OTHER_HEADER_LABEL_PATTERN` | 定数（内部） | From / To / Cc / Subject / 差出人 / 宛先 / 件名 など | ヘッダーのまとまりかを判定する |
| `QUOTE_ATTRIBUTION_PATTERN` | 定数（内部） | 「wrote:」「書きました:」「のメール:」「<アドレス>:」で終わる行 | 返信の引用の見出しの行を見つける |
| `WRAPPED_ATTRIBUTION_FIRST_LINE_PATTERN` | 定数（内部） | 「On 」で始まる、または「<」で終わる行 | 2行に折り返された引用の見出しの1行目も除外する |
| `LINE_BREAK_PATTERN` / `BLANK_LINE_PATTERN` | 定数（内部） | 改行／空行（引用記号だけの行を含む） | 行とまとまりに分ける |
| `splitLines(text)` | 関数（内部） | 行に分け、各行の位置を求める | 範囲を位置で返すため |
| `markHeaderBlocks(lines)` | 関数（内部） | 空行で区切ったまとまりがヘッダーを含むかを調べる | 「Date:」「日付:」の判定 |

## src/core/candidateFormatter.js（表示用の文字列）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `WARNING_MESSAGES` | 定数（公開） | 警告コードと表示文の対応表 | 警告を利用者に分かる文にする |
| `UNKNOWN_WARNING_MESSAGE` | 定数（内部） | 対応表にない警告の表示文 | 想定外の警告でも表示が崩れないようにする |
| `padTwoDigits(value)` | 関数（内部） | 数字を2桁にそろえる | 「09:05」の表示 |
| `formatDateLabel(date)` | 関数（公開） | 「2026年10月15日(木)」の形にする | 候補の表示 |
| `formatTimeLabel(time)` | 関数（公開） | 「14:00」の形にする | 候補の表示 |
| `formatCandidateLabel(candidate)` | 関数（公開） | 候補を1行の文字列にする（開始だけ。終了は画面で選ぶ） | 候補の一覧の表示 |
| `formatEndChoiceLabel(durationMinutes, start)` | 関数（公開） | 終了の一覧の1項目を「1時間30分後（15:30）」の形にする（日をまたぐと「翌日」、開始が分からなければ長さだけ） | 終了を選ぶとき、終わる時刻が分かるようにする |
| `describeWarning(warningCode)` | 関数（公開） | 警告コードを表示文にする | 警告バッジの表示 |

## src/core/highlight.js（色付け）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `splitTextByRanges(text, ranges)` | 関数（公開） | 文章を「通常の部分」と「強調する部分」に分ける（重なりはまとめる） | 日時部分の色付け。HTML として扱わないので安全 |

---

## src/core/detailExtractor.js（件名・場所・URL の下書き）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `TITLE_LABELS` | 定数（内部） | 件名のラベル（件名、題名、タイトル、会議名、イベント名、Subject、Title） | 件名の行を見つける |
| `LOCATION_LABELS` | 定数（内部） | 場所のラベル（開催場所、集合場所、開催地、場所、会場、Location、Place、Venue） | 場所の行を見つける。署名に多い「住所」は ADDRESS_LABELS で別に扱う |
| `ADDRESS_LABELS` / `ADDRESS_LABEL_LINE_PATTERN` | 定数（内部） | 住所のラベル（住所、所在地、Address）／その行の正規表現 | 場所のラベル・文がないとき、署名を除いた行から住所を取り出す |
| `PREFECTURES` | 定数（内部） | 47都道府県の名前 | 住所らしい行を見つける |
| `ADDRESS_LINE_PATTERN` | 定数（内部） | 都道府県＋市区町村で始まる行（行頭の化けた文字2文字・郵便番号は読み飛ばす） | 見出しのない住所（催しの一覧のページ・OCR）を取り出す（依頼者の指示） |
| `MUNICIPALITY_LINE_PATTERN` | 定数（内部） | 県名のない、市区町村（仙台市青葉区・塩竈市・柴田郡大河原町など）で始まる行 | 県名のない住所の取り出し（依頼者の指示） |
| `MUNICIPALITY_REST_PATTERN` | 定数（内部） | 市区町村名の後ろとして認める書き方（町名＋番地、または行末・「 / 分類」） | 「朝市10月20日」「登米市にある能舞台」のような行を住所と取り違えない |
| `FACILITY_SUFFIXES` / `FACILITY_LINE_PATTERN` | 定数（内部） | 施設名の終わり方（会館・ホール・センター・美術館・舞台・公園・会議室など）／施設名だけの行（部屋・階が続いてもよい） | 施設名だけの場所の取り出し（依頼者の指示） |
| `NOT_FACILITY_PATTERN` | 定数（内部） | 文の区切り・つながり（で・にて・にある・です など）、題名のかっこ、問い合わせの窓口、日付・時刻 | 文や題名の行を施設名と取り違えない |
| `FACILITY_ADDRESS_MAX_LINE_DISTANCE` | 定数（内部） | 3（行） | この行数以内の施設名と住所を並べる |
| `ADDRESS_TRAILING_PATTERN` | 定数（内部） | 住所の後ろの「 / 分類」、2つ以上の空白の後ろ | 「宮城県登米市 / 芸術鑑賞」→「宮城県登米市」、OCR で隣の欄が混ざった部分を除く |
| `HAS_STREET_NUMBER_PATTERN` | 定数（内部） | 数字を含むか | 番地のある住所を、地域だけの行より優先する |
| `EMAIL_ADDRESS_PATTERN` / `COMPANY_PATTERN` / `PHONE_LABEL_PATTERN` | 定数（内部） | メールアドレス／会社名（株式会社など）／TEL・FAX・電話 | 署名らしいまとまり（メールアドレス、または会社名と電話の両方）を見分ける |
| `SIGNATURE_SEPARATOR_PATTERN` | 定数（内部） | 署名の区切りの行「-- 」 | それより後を署名とみなす |
| `MEETING_HOSTS` | 定数（内部） | 会議サービスのホスト（zoom.us、meet.google.com、teams.microsoft.com など） | 会議 URL を優先する |
| `MAX_HEADING_LINES` | 定数（内部） | 5 | 見出し（件名の代わり）を探す、先頭からの行数 |
| `MAX_HEADING_LENGTH` | 定数（内部） | 40 | 見出しとみなす行の最大文字数（長い文は見出しにしない） |
| `HEADING_ENDING_PATTERN` | 定数（内部） | 「のお知らせ」「のご案内」「のご連絡」「開催決定」で終わる（末尾の記号3文字まで可） | ラベルのない見出しを件名にする（依頼者の指摘） |
| `LOCATION_SENTENCE_PATTERN` | 定数（内部） | 「会場は〜です」「場所は〜で行います」などの文。値は40文字まで、「会場」の直前に漢字・かながないこと | ラベルのない文から場所を取り出す。「場所は追って連絡します」「駐車場所は」は除く |
| `NEXT_LINE_LOOKAHEAD` | 定数（内部） | 2 | 「■会場」の次の行の値を探す行数 |
| `REPLY_PREFIX_PATTERN` | 定数（内部） | Re: Fw: Fwd: 返信: 転送: | 件名から返信・転送の印を除く |
| `HTTPS_URL_PATTERN` | 定数（内部） | https の URL（半角の URL 文字だけ） | 日本語の手前で URL を止める |
| `LEADING_SEPARATOR_PATTERN` | 定数（内部） | 値の先頭の「・」「：」「_」「|」と空白 | OCR で「場所:・オンライン」となった場合の「・」を除く |
| `TRAILING_PUNCTUATION` | 定数（内部） | URL の末尾から除く記号 | 「…/1.」の「.」などを除く |
| `TITLE_LINE_PATTERN` / `LOCATION_LINE_PATTERN` | 定数（内部） | ラベルの行に一致する正規表現 | 件名・場所の行を見つける |
| `buildLabelPattern(labels)` | 関数（内部） | ラベルの一覧から行の正規表現を作る | 「件名：」「【件名】」「■件名」などに対応 |
| `extractEventDetails(text)` | 関数（公開） | 件名・場所・会議 URL を取り出す | 入力欄の下書き（要件§12） |
| `findLabeledValue(lines, pattern)` | 関数（内部） | ラベルの行の値（なければ次の行）を返す | 件名・場所の取り出し |
| `findHeadingTitle(lines)` | 関数（内部） | 先頭の5行から「〜のお知らせ」などの短い見出しを探す | 件名のラベルがないときの件名 |
| `findLocationSentence(lines)` | 関数（内部） | 「会場は〜です」のような文から場所を取り出す | 場所のラベルがないときの場所 |
| `blankOutSignatureLines(lines)` | 関数（内部） | 署名らしい行を空行にする（「-- 」より後、署名らしいまとまり） | 署名の会社の住所を場所にしない |
| `matchMunicipalityLine(line)` | 関数（内部） | 県名のない、市区町村で始まる住所の行か確かめる | 県名のない住所の取り出し |
| `matchFacilityLine(line)` | 関数（内部） | 施設名だけの行なら施設名を返す | 施設名だけの場所の取り出し |
| `findAddressLine(lines)` | 関数（内部） | 見出しのない行から場所を取り出す（番地のある住所 → 施設名 → 地域だけの住所の順。近くの施設名と住所は並べる） | 見出しのない場所の取り出し |
| `isAnyLabelLine(line)` | 関数（内部） | 件名・場所・住所のラベルの行か | 次の行を値とみなしてよいかの判定 |
| `findMeetingUrl(text)` | 関数（内部） | 会議サービスの URL、なければ最初の https の URL を選ぶ | 会議 URL の取り出し |
| `parseMeetingUrl(text)` | 関数（公開） | URL を検証し、会議サービスかを判定する（xn-- の形に直す）。`{href, hostname, isKnownMeetingService}` を返す（hostname はフィッシングの注意でサイト名として見せる） | なりすまし URL・https 以外を弾く。入力欄の検証にも使う |
| `isMeetingHost(hostname)` | 関数（内部） | ホスト名が会議サービスか（末尾で判定） | 「zoom.us.偽サイト」を会議サービスとみなさない |
| `trimTrailingPunctuation(url)` | 関数（内部） | 末尾の句読点・対応しない閉じ括弧を除く | 「（URL）」の括弧を URL に含めない |
| `countCharacter(text, character)` | 関数（内部） | 文字の数を数える | 括弧の対応の判定 |
| `removeUrls(text)` | 関数（内部） | 文字列から URL を除く | 場所の欄に URL を重ねて入れない |
| `truncate(text, maxLength)` | 関数（内部） | 最大文字数までに切り詰める | 入力欄の上限に合わせる |

## src/core/calendarUrl.js（予定作成 URL の組み立てと検証）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `CALENDAR_BASE_URL` | 定数（公開） | `https://calendar.google.com/calendar/render` | 予定作成画面の URL |
| `ALLOWED_HOST` / `ALLOWED_PATH` | 定数（内部） | calendar.google.com ／ /calendar/render | 開いてよい URL の許可リスト |
| `MAX_TITLE_LENGTH` | 定数（公開） | 50 | 件名の上限（全角・半角とも1文字。一覧で見えるのは先頭の20〜30文字ほどのため。2026-10-11 依頼者の指示で120→50） |
| `MAX_LOCATION_TEXT_LENGTH` | 定数（公開） | 150 | 場所の入力欄の上限 |
| `MAX_MEETING_URL_LENGTH` | 定数（公開） | 1000 | 会議 URL の上限（Teams の長い URL も入る） |
| `MAX_MEMO_LENGTH` | 定数（公開） | 600 | メモの入力欄の上限 |
| `MAX_LOCATION_LENGTH` / `MAX_DETAILS_LENGTH` | 定数（公開） | 1000 ／ 2000 | 送る「場所」「メモ」の上限 |
| `MAX_CALENDAR_URL_LENGTH` | 定数（公開） | 8000 | URL が長すぎて Google 側で開けないのを防ぐ |
| `MAX_EVENT_DURATION_MINUTES` | 定数（公開） | 1440 | 予定の長さの上限（24時間） |
| `MIN_YEAR` / `MAX_YEAR` | 定数（内部） | 1970 ／ 2100 | 明らかにおかしい年を弾く |
| `UNSAFE_CHARACTER_PATTERN` | 定数（内部） | 制御文字と、表示順を入れ替える文字 | なりすまし・表示崩れを防ぐ |
| `CalendarEventError` | クラス（公開） | 登録内容のエラー（利用者向けの文付き） | 画面でそのまま表示できるエラー |
| `sanitizeSingleLine(text)` / `sanitizeMultiLine(text)` | 関数（公開） | 危険な文字を除き、改行・タブを整える | 件名・場所・メモを安全にする |
| `requireText(value, label, maxLength, sanitize)` | 関数（内部） | 文字列の項目を検証して整える | 型・長さの検証 |
| `requireDateTime(value, label, requireTime)` | 関数（内部） | 日時の項目を検証して整える | 実在する日付・時刻だけを受け付ける |
| `validateCalendarEvent(rawEvent)` | 関数（公開） | 予定の内容を検証し、整えた内容を返す | メインプロセスでの IPC の引数の検証（CLAUDE.md） |
| `pad(value, length)` | 関数（内部） | 数字の桁をそろえる | 日時の書式 |
| `formatCalendarDate(date)` / `formatCalendarDateTime(dateTime)` | 関数（公開） | YYYYMMDD ／ YYYYMMDDTHHMMSS | URL の dates の書式 |
| `buildCalendarUrl(rawEvent)` | 関数（公開） | 予定作成画面の URL を組み立てる（ctz=Asia/Tokyo、終日は翌日まで） | 要件§5.6・§5.10 |
| `isAllowedCalendarUrl(url)` | 関数（公開） | 開いてよい URL か（https・ホスト・パス・action を確認） | 許可リスト方式（CLAUDE.md） |

## src/core/autoReset.js（登録後の自動のクリア）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `MILLISECONDS_PER_SECOND` | 定数（内部） | 1000 | 秒をミリ秒に直す |
| `AUTO_RESET_DELAY_SECONDS` / `AUTO_RESET_DELAY_MS` | 定数（公開） | 60秒 ／ 60000 | 登録から表示をクリアするまでの時間（依頼者の指示） |
| `USER_ACTIVITY_EVENTS` | 定数（公開） | pointerdown・keydown・wheel・paste・drop | 「操作した」とみなすイベント（ウインドウを戻すだけでは取り消さない） |
| `scheduleAutoReset(options)` | 関数（公開） | 時間がたったら onReset、先に操作されたら onCancel を1回だけ呼ぶ。予約をやめる関数を返す | 次の登録に備えて表示を消す。作業中の内容は消さない。タイマーとイベントの相手は引数で受け取り、単体テストできる |
| `stop()` / `handleActivity()` | 関数（内部） | タイマーと監視を止める（1回目だけ効く）／操作を受けて予約を取り消す | 監視の解除し忘れを防ぐ |

## src/core/registration.js（登録内容の組み立て）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `END_CHOICE_ALL_DAY` | 定数（公開） | 'allDay' | 終了の選択の「終日」 |
| `END_DURATION_STEP_MINUTES` / `MAX_END_DURATION_MINUTES` | 定数（公開） | 30 ／ 1410（23時間30分） | 終了を選ぶ刻みと最長の長さ（2026-10-12 依頼者の仕様変更） |
| `END_DURATION_CHOICES` | 定数（公開） | 30, 60, … 1410（分）の47通り | 終了の一覧の項目 |
| `createDefaultTimeChoice(candidate, minutes)` | 関数（公開） | 終了の選択の初めの値（時刻のある候補は設定の長さ、日付だけは終日）を作る | 要件§5.4・§5.10 |
| `SOURCE_TEXT_EXCERPT_LENGTH` | 定数（公開） | 500 | メモに入れる元の文章の抜粋の長さ |
| `MEETING_URL_HEADING` / `SOURCE_TEXT_HEADING` / `OMISSION_MARK` | 定数（内部） | メモの見出しと省略の印 | メモの書式 |
| `TIME_INPUT_PATTERN` / `DATE_INPUT_PATTERN` | 定数（内部） | HH:MM ／ YYYY-MM-DD | 入力欄の値の形式 |
| `MANUAL_ID_PREFIX` | 定数（内部） | 'manual-' | 手入力の候補の ID が重ならないようにする |
| `parseTimeInput(value)` / `parseDateInput(value)` | 関数（公開） | 時刻・日付の入力欄の値を数値にする | 手入力・時刻指定 |
| `createManualCandidate(date, sequence, now)` | 関数（公開） | 手入力した日付から候補を作る（過去なら警告） | 要件§5.8 |
| `composeEventTexts(details, sourceText)` | 関数（公開） | 件名・場所・メモの文字列を作る（会議 URL の振り分け、元の文章の抜粋） | 要件§12・§6.2 |
| `buildCalendarEvents(input)` | 関数（公開） | 選んだ候補から予定の一覧とエラーを作る | 登録ボタンの処理 |
| `resolveTimedEvent(candidate, choice)` | 関数（内部） | 選んだ長さから開始・終了を決める（日付だけの候補は入力した開始時刻が必須。一覧にない長さはエラー） | 終了の選択を予定にする |
| `excerpt(text, maxLength)` | 関数（内部） | 最大文字数までにし、省略の印を付ける | メモが長くなりすぎないようにする |

## src/core/ocrText.js（OCR の結果の整形）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `JAPANESE_CHARACTER` | 定数（内部） | 日本語の文字（漢字・かな・全角記号など）の正規表現の部品 | 余分な空白の判定 |
| `SPACE_AFTER_JAPANESE_PATTERN` / `SPACE_BEFORE_JAPANESE_PATTERN` | 定数（内部） | 日本語の文字の後ろ／前の空白 | 「10 月 15 日」の空白を除く |
| `SPACED_NUMBER_SEPARATOR_PATTERN` | 定数（内部） | 数字の間の「:」「/」の前後の空白 | 「14 : 00」を「14:00」にする |
| `EXCESS_BLANK_LINES_PATTERN` | 定数（内部） | 3行以上続く空行 | 空行を詰める |
| `cleanOcrText(text)` | 関数（公開） | OCR の結果を整える | 日時の抽出で読める形にする |

## src/core/settings.js（設定の既定値・選択肢・検証）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `DEFAULT_DURATION_MINUTES` | 定数（公開） | 60 | 要件§5.4：予定の既定の長さ（終了の初めの選択） |
| `DURATION_CHOICES` | 定数（公開） | 30・60・90・120（分） | 予定の既定の長さの選択肢（終了の30分刻みに合わせる。2026-10-12 に 15・45分を除いた） |
| `HOTKEY_MODIFIER_CHOICES` | 定数（公開） | Ctrl（Mac は Cmd）+Shift ／ +Alt ／ +Alt+Shift | Ctrl・Cmd を必ず含め、普段の文字入力を横取りしない |
| `CLIPBOARD_HOTKEY_KEY` | 定数（公開） | 'U' | コピーした文章を読み取るホットキーのキー（修飾キーは範囲キャプチャと同じ） |
| `HOTKEY_KEY_CHOICES` | 定数（公開） | A〜Z・0〜9 から U を除いた35個 | 範囲キャプチャのホットキーの文字（U は同じ組み合わせになるため除く） |
| `DEFAULT_SETTINGS` | 定数（公開） | 60分・CommandOrControl+Shift・Y | 要件§5.4・§12 の既定値 |
| `SETTING_KEYS` / `MODIFIER_LABELS` | 定数（内部） | 設定の項目名／修飾キーの表示名（Windows：Ctrl・Alt、Mac：Cmd・Option） | 検証・表記 |
| `SettingsError` | クラス（公開） | 利用者向けの文付きのエラー | 画面に表示できるエラー |
| `validateSettings(rawSettings)` | 関数（公開） | 画面から届いた設定を厳しく検証する（項目の過不足・選択肢にない値は断る） | IPC の引数の検証 |
| `normalizeStoredSettings(storedSettings)` | 関数（公開） | ファイルから読んだ設定を整える（おかしな項目は既定値、知らない項目は捨てる） | ファイルが壊れていても起動できる |
| `buildAccelerator(settings)` | 関数（公開） | Electron に登録するホットキーの表記を作る（例：CommandOrControl+Shift+Y） | ホットキーの登録 |
| `formatModifierLabel(hotkeyModifiers, isMac)` / `formatHotkeyLabel(settings, isMac)` | 関数（公開） | 利用者に見せる表記（例：Ctrl+Shift+Y、Mac は Cmd+Shift+Y） | ボタン・トレイ・設定画面の表示 |
| `buildClipboardAccelerator(settings)` / `formatClipboardHotkeyLabel(settings, isMac)` | 関数（公開） | コピーした文章を読み取るホットキーの Electron の表記／利用者に見せる表記（例：Ctrl+Shift+U） | ホットキーの登録・ボタン・トレイ・設定画面の表示 |

## src/renderer/（画面）

### main.jsx

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| （起点の処理） | 処理 | `App` を `ErrorBoundary` で包んで描画する | 画面の起動と、表示中のエラーの受け止め |

### App.jsx

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `UNEXPECTED_ERROR_MESSAGE` / `REGISTER_ERROR_MESSAGE` | 定数 | 予期しないエラーの表示文（抽出／登録） | 文章の内容を含めずにエラーを知らせる |
| `EMPTY_CAPTURE` | 定数 | 範囲キャプチャの状態の初期値（status・imageUrl・orientation・confidence・isLowConfidence・isEmpty） | 取り込みの表示 |
| `HOTKEY_UNAVAILABLE_MESSAGE` | 定数 | ホットキーを登録できなかったときの案内 | 要件§12 |
| `CAPTURE_ERROR_SCREEN_PERMISSION` | 定数 | 'screenPermission'（メインプロセスと同じ値） | 「システム設定を開く」ボタンを出す判定 |
| `EMPTY_EVENT_DETAILS` | 定数 | 予定の内容の入力欄の初期値（元の文章を入れる：オフ） | 要件§6.2 |
| `App` | コンポーネント | 確認ウインドウ全体 | 貼り付け→抽出・下書き→選択・追記→登録の流れを管理 |
| `inputText` | 状態 | 入力欄の文章 | 抽出の対象 |
| `extraction` | 状態 | 抽出結果（抽出時の文章・候補・省略の有無）。未抽出なら null | 候補と色付けの表示 |
| `manualCandidates` | 状態 | 手入力で追加した候補 | 要件§5.8 |
| `manualSequenceRef` | 参照 | 手入力の候補の通し番号 | ID が重ならないようにする |
| `selectedIds` | 状態 | チェックを付けた候補の ID の集合 | 要件§5.3：登録する候補を選ぶ |
| `timeChoices` | 状態 | 候補ごとの終了の選択（候補の ID → `{end, startTime}`。選んでいない候補は初めの値） | 終了を選ぶ（要件§5.4・§5.10） |
| `eventDetails` | 状態 | 件名・場所・会議 URL・メモ・元の文章を入れるか | 予定の内容 |
| `errorMessage` | 状態 | 画面上部に表示するエラーの文 | 要件§5.9：エラーの内容を表示 |
| `errorAction` | 状態 | エラーの帯に出す追加の操作（対象のエラーの文が表示されている間だけ有効） | 「システム設定を開く」ボタン |
| `isNoDateDialogOpen` | 状態 | 「日時の情報がありません」の表示中か | 要件§5.8 |
| `isRegistering` | 状態 | ブラウザで開く処理の途中か | 二度押しを防ぐ |
| `registeredCount` | 状態 | 直前に予定作成画面を開いた件数（0 なら案内を出さない） | 登録ボタンの下の案内 |
| `autoResetId` / `autoResetSequenceRef` | 状態・参照 | 自動のクリアの予約番号（0 なら予約なし）／その通し番号 | 登録のたびに60秒を数え直す。操作・読み取りで 0 に戻して取り消す |
| `capture` | 状態 | 範囲キャプチャの状態（EMPTY_CAPTURE の形） | 読み取り中の表示、取り込んだ画像、精度の案内 |
| `hotkeyLabel` / `clipboardHotkeyLabel` | 状態 | 範囲キャプチャ／コピーした文章の読み取りのホットキーの表記 | ボタンに表示する |
| `durationMinutes` | 状態 | 予定の既定の長さ（分。起動時に設定から読む） | 終了時刻がないときの長さ（設定画面で変えられる） |
| `isSettingsOpen` | 状態 | 設定画面を表示中か | ヘッダーの「設定」ボタン |
| `captureStatusHandlerRef` | 参照 | 読み取り結果を受け取る最新の処理 | 起動時に1回だけ登録しても最新の処理を呼ぶ |
| `resetToInitialStateRef` | 参照 | 表示を初期状態に戻す最新の処理 | 自動のクリアから呼ぶ |
| `resultPaneRef` / （抽出し直したら上に戻す処理） | 参照・処理 | 右の欄のスクロールする部分／抽出結果が変わったら一番上に戻す | 下までスクロールしたまま抽出し直しても、新しい候補が見える位置に出る |
| `allCandidates` | 計算値 | 抽出した候補と手入力の候補 | 候補の一覧・登録に使う |
| `highlightRanges` | 計算値 | すべての候補の位置をまとめたもの | 色付けに渡す |
| `isInputChangedAfterExtraction` | 計算値 | 抽出後に文章が書き換えられたか | 再抽出を促すお知らせの表示 |
| `handleExtract()` | 関数 | 入力欄の文章で extractFromText を呼ぶ | 「日時を抽出」ボタン |
| `extractFromText(text)` | 関数 | 抽出・下書きを行い、候補がなければポップアップ、エラーなら待機状態に戻す | 貼り付け・OCR の両方で使う |
| `handleCaptureStatus(status)` | 関数 | 読み取り中・結果（文章を入れて抽出）・エラー・中止・画像の消去を画面に反映 | 範囲キャプチャの結果の表示 |
| `handleOpenScreenSettings()` | 関数 | Mac の画面収録の設定画面を開いてもらう | 「システム設定を開く」 |
| （画像の貼り付け・ドロップの受け付け） | 処理 | 画像の貼り付け（文章の貼り付けは邪魔しない）・ドロップを受け、PNG にそろえて読み取ってもらう | 画像の取り込み（要件§12） |
| `handleReadClipboard()` | 関数 | コピーした文章を読み取ってもらう（文章は handleCaptureStatus の `clipboardText` で届き、入力欄に入れて抽出する） | 「コピーした文章を読み取る」ボタン |
| `handleStartCapture()` / `handleRereadCapture(orientation)` | 関数 | 範囲キャプチャを始めてもらう／向きを指定して読み直してもらう | 「画面から読み取る」「横書き／縦書きで読み直す」 |
| `resetResults()` | 関数 | 抽出結果・選択・入力欄を初期状態に戻す | エラー時・クリア時の後始末 |
| `resetToInitialState()` | 関数 | 入力・結果・エラー・取り込んだ画像・登録の案内を消し、自動のクリアの予約もやめて最初の状態に戻す | 「クリア」ボタンと、登録して60秒操作がなかったとき |
| （自動のクリアの予約） | 処理 | 予約番号が 0 でない間、scheduleAutoReset で60秒後のクリアと操作の監視を動かす | 次の登録に備える（依頼者の指示） |
| `handleToggleCandidate(candidateId)` | 関数 | 候補のチェックを切り替える | 候補の選択 |
| `handleTimeChoiceChange(candidate, changes)` | 関数 | 終了の選択（長さ／終日）と、日付だけの候補の開始時刻を変える | 終了を選ぶ |
| `handleAddManualDate(date, startTime, end)` | 関数 | 手入力した日付（と開始時刻・終了の選択）を候補に加えてチェックを付ける。開始時刻がなければ終日 | 要件§5.8 |
| `handleAddFromDialog(entry)` | 関数 | ポップアップで入れた日時を候補に加える | 手入力（依頼者の指摘で、ポップアップの中で完結する形に改善） |
| `handleDetailChange(field, value)` | 関数 | 予定の内容の入力欄を変える | 追記（要件§5.5） |
| `handleRegister()` | 関数 | 内容を確かめ、メインプロセスに予定作成画面を開いてもらう。開けたら件数を案内し、自動のクリアを予約する | 登録ボタン（要件§5.6） |
| `handleSettingsSaved(result)` | 関数 | 保存した設定（予定の長さ・ホットキーの表記）を画面に反映し、ホットキーが使えるようになったら案内を消す | 設定画面の「保存」 |

### imageImport.js（画像の取り込み）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `ACCEPTED_IMAGE_TYPES` | 定数 | PNG・JPEG | 受け付ける画像の種類 |
| `MAX_IMPORT_FILE_BYTES` / `MAX_IMPORT_LONG_SIDE` | 定数 | 20MB ／ 3000画素 | 大きすぎる画像を断る・縮める |
| `convertImageFileToPng(file)` | 関数 | 画像ファイルを、向きを直し・縮めて PNG にする | メインプロセスに渡す形にそろえる |
| `findImageFile(dataTransfer)` | 関数 | 貼り付け・ドロップのデータから最初の画像ファイルを取り出す | 画像だけを扱う |

### overlay.js（範囲選択の画面）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `MIN_SELECTION_SIZE` | 定数 | 8 | 小さすぎる範囲は選び直してもらう |
| `SCREENSHOT_URL` | 定数 | './capture/screenshot.png' | 撮影した画面（メモリの中の画像） |
| `dragStart` / `isFinished` | 変数 | ドラッグを始めた位置／送ったか | 二重に送らない |
| `toRect(start, current)` | 関数 | 2点から矩形を作る | 範囲の計算 |
| `drawSelection(rect)` | 関数 | 選んでいる範囲を描く | 外側を暗く、内側を明るく |
| `resetSelection()` | 関数 | 選び直せる状態に戻す | クリックだけ・小さすぎる範囲 |
| `cancel()` | 関数 | 中止をメインプロセスに知らせる | Esc・右クリック |

### components/

| ファイル | 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|---|
| TextInputPanel.jsx | `numberFormatter` | 定数 | 数字の書式（20,000） | 文字数の表示 |
| TextInputPanel.jsx | `TextInputPanel` | コンポーネント | 入力欄、文字数、「クリア」「日時を抽出」ボタン | 文章の貼り付け |
| TextInputPanel.jsx | `isTooLong` / `isEmpty` | 計算値 | 文字数超過か／空か | 文字数の警告色、ボタンの無効化 |
| TextInputPanel.jsx | `handleKeyDown(event)` | 関数 | Ctrl+Enter（Mac は Command+Enter）で抽出 | キーボードだけで操作できるようにする |
| HighlightedText.jsx | `HighlightedText` | コンポーネント | 文章を表示し、日時部分を `<mark>` で色付け | 要件§6.1：日時部分の色付け |
| HighlightedText.jsx | `segments` | 計算値 | `splitTextByRanges` の結果 | 描画する部分の一覧 |
| CandidateList.jsx | `CandidateList` | コンポーネント | 候補をチェックボックス付きで一覧表示（警告・補足のバッジ付き）。チェックを付けた候補には終了の選択の欄を出す | 要件§5.3・§5.10 |
| TimeChoiceFields.jsx | `TimeChoiceFields` | コンポーネント | 終了の一覧（開始から30分〜23時間30分後・終日）。日付だけの候補で長さを選ぶと開始時刻の欄も出す | 終了を選ぶ（2026-10-12 仕様変更） |
| TimeChoiceFields.jsx | `ALL_DAY_LABEL` / `toEndChoice(value)` | 定数・関数（内部） | 「終日」の文字／一覧の値を終了の選択の値に戻す | 一覧の値は文字列のため |
| TimeChoiceFields.jsx | `isAllDay` / `needsStartTime` / `start` | 計算値 | 終日か／開始時刻の欄が要るか／項目名に終わる時刻を添えるための開始日時 | 表示の切り替え |
| ManualDateForm.jsx | `ManualDateForm` | コンポーネント | 日付欄と「追加」ボタン、次にすることの説明 | 要件§5.8：手入力 |
| ManualDateForm.jsx | `dateValue` / `date` / `handleAdd()` | 状態・計算値・関数 | 日付欄の値／読み取った日付／候補に追加 | 手入力の候補の追加 |
| EventDetailsForm.jsx | `EventDetailsForm` | コンポーネント | 件名・場所・会議 URL・メモ・「元の文章をメモに入れる」 | 要件§5.5・§6.2・§12 |
| EventDetailsForm.jsx | `PHISHING_WARNING_MESSAGE` / `UNKNOWN_SITE_WARNING_MESSAGE` | 定数（公開） | URL を登録するときのフィッシングの注意／会議サービス以外のサイトへの強めの注意 | 偽のサイトへの誘導に気付いてもらう（依頼者の指示：注意したうえで登録する。登録は止めない） |
| EventDetailsForm.jsx | `meetingUrlText` / `meeting` | 計算値 | 入力された会議 URL／検証結果 | 不正な URL を知らせ、正しい URL ならサイト名と注意を表示する |
| EventDetailsForm.jsx | `remainingTitleLength` | 計算値 | 件名に入力できる残りの文字数 | 「50文字まで（残り N 文字）」の表示（依頼者の指示） |
| RegisterSection.jsx | `RegisterSection` | コンポーネント | 登録ボタンと、開いたあとの案内（開いた件数、「60秒操作しないとクリア」）。右の欄の下端に固定し、スクロールしなくても押せる | 要件§5.6・使いやすさ（依頼者の指摘） |
| NoDateDialog.jsx | `SUPPORTED_FORMAT_EXAMPLES` | 定数 | 対応している書き方の例 | 利用者が書き方を確かめられるようにする |
| NoDateDialog.jsx | `NoDateDialog` | コンポーネント | 「日時の情報がありません」のポップアップ。日付（必須）・開始時刻（任意）・終了（開始から何分後か）を入れて「追加する」 | 要件§5.8 |
| NoDateDialog.jsx | `dateValue` / `startTimeValue` / `endChoice` | 状態 | ポップアップの入力欄の値（終了の初めの選択は設定の長さ） | 手入力 |
| NoDateDialog.jsx | `start` / `canAdd` / `handleAdd()` | 計算値・関数 | 終了の項目名に添える開始日時／追加できるか（日付が必要）／候補に加えて閉じる | 手入力 |
| CaptureImagePanel.jsx | `ORIENTATION_LABELS` | 定数 | 向きの表示名（横書き・縦書き） | 読み取った向きの表示 |
| CaptureImagePanel.jsx | `CaptureImagePanel` | コンポーネント | 取り込んだ画像、読み取り中、向きと確信度、精度が低い・読めないときの案内、読み直しのボタン | 要件§6.1・§12 |
| NoDateDialog.jsx | `dialogRef` | 参照 | `<dialog>` 要素 | 開閉（`showModal` / `close`）を呼ぶ |
| SettingsDialog.jsx | `LOAD_ERROR_MESSAGE` / `UNEXPECTED_ERROR_MESSAGE` | 定数 | 読み込めなかった／予期しないエラーの表示文 | 内容を含めずに知らせる |
| SettingsDialog.jsx | `SettingsDialog` | コンポーネント | 設定画面のポップアップ（`<dialog>`）。開くたびに今の設定を読み込む。選択肢は settings.js の決まったものだけ | 要件§6.1・§12（ゴール G7・G8） |
| SettingsDialog.jsx | `form` / `autoStart` / `autoStartSupported` / `isMac` / `isLoaded` / `isBusy` / `errorMessage` / `desktopIconResult` | 状態 | 入力中の設定／自動起動のオン・オフ／この OS で設定できるか／Mac か（Cmd・Option と表記）／読み込み済みか／処理中か／エラーの文／アイコン作成の結果 | 設定の入力と結果の表示 |
| SettingsDialog.jsx | `handleFieldChange(field, value)` / `handleSave()` / `handleCreateDesktopIcon()` | 関数 | 1項目を変える／保存してもらい閉じる／デスクトップにアイコンを作ってもらう | 「保存」「デスクトップにアイコンを作る」 |
| ErrorBanner.jsx | `ErrorBanner` | コンポーネント | エラーの文と「閉じる」ボタン（次にすることがあるエラーは、その操作のボタンも） | 要件§5.9：エラーの内容を表示 |
| ErrorBoundary.jsx | `ErrorBoundary` | クラス | 表示中のエラーを受け止め「最初の画面に戻る」を出す | 要件§5.9：アプリを止めない |
| ErrorBoundary.jsx | `hasError` / `resetKey` | 状態 | エラー表示中か／画面を作り直すための番号 | 最初の画面への復帰 |
| ErrorBoundary.jsx | `getDerivedStateFromError()` / `componentDidCatch(error)` / `handleReset()` | 関数 | エラー状態にする／エラーの種類だけ記録／作り直す | 文章の内容をログに出さずに復帰する |

---

## electron/（メインプロセス）

### appProtocol.js（app:// の配信）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `APP_SCHEME` / `APP_HOST` | 定数（公開） | `'app'` / `'bundle'` | 画面を配信する独自の URL（app://bundle/） |
| `APP_ENTRY_URL` | 定数（公開） | `app://bundle/index.html` | 確認ウインドウで最初に開く URL |
| `OVERLAY_ENTRY_URL` | 定数（公開） | `app://bundle/overlay.html` | 範囲選択の画面の URL |
| `APP_SCHEME_PRIVILEGES` | 定数（公開） | `{standard: true, secure: true}` だけ | 必要最小限の特権（CSP の回避などは与えない） |
| `CONTENT_SECURITY_POLICY` | 定数（公開） | 自分自身のファイル以外の読み込み・通信・インラインスクリプトを禁止する設定 | 画面への不正なコードの混入を防ぐ |
| `CONTENT_TYPES` / `DEFAULT_CONTENT_TYPE` | 定数（内部） | 拡張子と Content-Type の対応 | 正しい形式で配信し、中身を推測させない |
| `INDEX_FILE_NAME` | 定数（内部） | `'index.html'` | パスの指定がないときのファイル |
| `isAppUrl(url)` | 関数（公開） | app://bundle の URL か判定 | 外部ページへの移動を防ぐ |
| `resolveAssetPath(requestUrl, rootDir)` | 関数（公開） | URL を配信フォルダ内のファイルパスに変換（外を指すものは null） | パストラバーサル対策 |
| `getContentType(filePath)` | 関数（公開） | 拡張子から Content-Type を決める | 正しい形式での配信 |
| `createEmptyResponse(status)` | 関数（内部） | 本文のないエラー応答を作る | 404 などの応答 |
| `handleAppRequest(request, rootDir, getCaptureImage)` | 関数（公開） | app:// の要求にファイルの内容で応答（CSP などのヘッダー付き）。`capture/〜` はメモリの中の取り込んだ画像を返す | `protocol.handle` に渡す処理 |

### security.js（セキュリティ設定）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `SECURE_WEB_PREFERENCES` | 定数（公開） | 隔離・サンドボックス有効、Node.js 機能・webview・スペルチェック無効など | 画面から PC の機能を使えないようにする |
| `BLOCKED_URL_PATTERNS` | 定数（公開） | http / https / ws / wss | 画面からの外部通信をすべて遮断する範囲 |
| `applySessionSecurity(session)` | 関数（公開） | 権限要求をすべて拒否、外部通信を遮断、スペルチェック無効 | 要件§5.2：文面を外部に送らない |
| `hardenWebContents(contents)` | 関数（公開） | 新しいウインドウ・外部への移動・webview を拒否 | 画面の乗っ取りを防ぐ |
| `preventExternalNavigation(event, deprecatedUrl)` | 関数（内部） | 移動先が app://bundle でなければ取り消す | 外部ページへの移動の防止 |

### calendarIpc.js（登録要求の受け付け）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `OPEN_CALENDAR_EVENTS_CHANNEL` | 定数（公開） | 'calendar:open-events' | 画面からの登録要求のチャンネル名（preload.cjs と同じ） |
| `OPEN_INTERVAL_MS` | 定数（公開） | 800 | 複数の予定を開くときの間隔 |
| `MAX_EVENTS_PER_REQUEST` | 定数（公開） | 30 | 1回の要求で開ける予定の上限 |
| `UNTRUSTED_SENDER_MESSAGE` / `BUSY_MESSAGE` / `UNEXPECTED_ERROR_MESSAGE` | 定数（内部） | 断るときの表示文 | 内容を含めずに知らせる |
| `wait(milliseconds)` | 関数（内部） | 指定時間待つ | 開く間隔 |
| `buildCalendarUrls(rawEvents)` | 関数（公開） | 予定の一覧を検証し、許可リストを通った URL の一覧を作る | URL は画面から受け取らず、ここで作る |
| `createOpenCalendarEventsHandler(dependencies)` | 関数（公開） | 送信元・引数を検証し、URL を順に開く処理を作る（二度押しは断る）。すべて開けたら `onAllOpened`（確認ウインドウの最小化）を呼ぶ | ipcMain.handle に渡す。最小化はブラウザの操作の邪魔にならないように（依頼者の指示）。途中で開けなかったときは呼ばない |

### preload.cjs（画面に公開する関数）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `OPEN_CALENDAR_EVENTS_CHANNEL` | 定数 | 'calendar:open-events' | 登録要求のチャンネル名 |
| `window.calendarApp.openCalendarEvents(events)` | 関数（画面に公開） | 予定の一覧をメインプロセスに渡す | 登録。ipcRenderer そのものは公開しない |
| `CAPTURE_START_CHANNEL` などのチャンネル名 | 定数 | captureIpc.js と同じ値 | 範囲キャプチャの通信 |
| `window.calendarApp.startCapture()` | 関数（画面に公開） | 範囲キャプチャを始めてもらう | 「画面から読み取る」 |
| `CLIPBOARD_READ_CHANNEL` / `window.calendarApp.readClipboard()` | 定数・関数（画面に公開） | 'clipboard:read'／コピーした文章を読み取ってもらう（引数なし。読むのはメインプロセス） | 「コピーした文章を読み取る」 |
| `window.calendarApp.importImage(pngBytes)` | 関数（画面に公開） | PNG にそろえた画像を読み取ってもらう | 画像の貼り付け・ドラッグ＆ドロップ |
| `window.calendarApp.rereadCapture(orientation)` | 関数（画面に公開） | 向きを指定して読み直してもらう | 「横書き／縦書きで読み直す」 |
| `window.calendarApp.clearCapture()` | 関数（画面に公開） | 取り込んだ画像を消してもらう | 「クリア」 |
| `window.calendarApp.openScreenRecordingSettings()` | 関数（画面に公開） | Mac の画面収録の設定画面を開いてもらう | 「システム設定を開く」 |
| `SETTINGS_GET_CHANNEL` / `SETTINGS_SAVE_CHANNEL` / `DESKTOP_ICON_CHANNEL` | 定数 | settingsIpc.js と同じ値 | 設定の通信 |
| `window.calendarApp.getSettings()` / `saveSettings(settings)` / `createDesktopIcon()` | 関数（画面に公開） | 今の設定を尋ねる／設定を保存してもらう／デスクトップにアイコンを作ってもらう | 設定画面（公開する関数は全部で11個。ホットキーの状態も getSettings の結果に入る） |
| `window.calendarApp.onCaptureStatus(callback)` | 関数（画面に公開） | 読み取りの進み具合と結果を受け取る（内容だけを渡す。解除する関数を返す） | 読み取り結果の表示 |

### ocrEngine.js（文字の読み取り）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `ORIENTATION_AUTO` / `ORIENTATION_HORIZONTAL` / `ORIENTATION_VERTICAL` | 定数（公開） | 'auto' ／ 'horizontal' ／ 'vertical' | 読み取りの向き（要件§12：縦書き対応） |
| `ORIENTATIONS` | 定数（公開） | 向きの一覧 | 画面から届く値の検証 |
| `OCR_TIMEOUT_MS` | 定数（公開） | 15000 | 読み取りの制限時間（両方の向きで読む場合も合計。依頼者の指示：読めないなら手入力の方が早い） |
| `SKIP_VERTICAL_CONFIDENCE` | 定数（公開） | 80 | 自動のとき、横書きの確信度がこれ以上なら縦書きを省く（待ち時間を半分に） |
| `TIMEOUT_MESSAGE` | 定数（内部） | 時間切れの表示文（手入力・範囲の選び直しを案内） | 利用者が次にすることを分かるようにする |
| `MAX_IMAGE_BYTES` | 定数（公開） | 20MB | 大きすぎる画像を受け付けない |
| `LANGUAGE_DATA_VARIANT` | 定数（内部） | '4.0.0_best_int' | 精度を保ったまま軽くした文字データ（各 約2MB） |
| `LANGUAGE_SETTINGS` | 定数（内部） | 向きごとの文字データ名・PC 内のフォルダ・文章の並びの解析方法 | 外部から文字データを取得しない |
| `OcrError` | クラス（公開） | 読み取りのエラー（利用者向けの文付き） | 画面でそのまま表示できるエラー |
| `resolveLanguageDataDir(packageName)` | 関数（内部） | node_modules の中の文字データのフォルダを探す | PC 内の文字データを使う |
| `getLanguageSettings()` | 関数（公開） | 向きごとの設定を返す | テストで設定を確かめる |
| `ignoreWorkerError()` | 関数（内部） | 作業スレッドのエラーを受け流す | Tesseract.js の例外でアプリが止まらないようにする |
| `buildWorkerOptions(setting)` | 関数（公開） | 作業スレッドの設定（PC 内のフォルダ・書き出しなし・エラー処理）を作る | 外部取得・ファイル書き出しの防止 |
| `recognizeText(image, options)` | 関数（公開） | 画像から文字を読み取る（自動：横書きで読み、確信度が低ければ縦書きでも読んで高い方。実際に読んだ向きも返す） | このファイルの中心 |
| `chooseBetterResult(horizontal, vertical)` | 関数（公開） | 確信度の高い方を選ぶ（同じなら横書き） | 縦書きの自動判定 |
| `recognizeWithOrientation(image, orientation, timeoutMs)` | 関数（内部） | 1つの向きで読み取り、必ず作業スレッドを終了する（時間切れでも） | CPU を使い続けない（要件§5.9） |

### main.js（起動・確認ウインドウ・常駐・ホットキー）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `ELECTRON_DIR` / `APP_DIR` | 定数 | electron/ フォルダ／プロジェクトのフォルダのパス | 画面ファイル・アイコンの場所、アイコンから起動するときに渡すアプリの場所 |
| `RENDERER_DIST_DIR` | 定数 | dist/renderer のパス | app:// で配信してよいフォルダ |
| `PRELOAD_PATH` / `OVERLAY_PRELOAD_PATH` | 定数 | 確認ウインドウ／範囲選択の画面の preload のパス | 画面に決めた関数だけを公開する |
| `IS_MAC` / `IS_WINDOWS` | 定数 | Mac か／Windows か | トレイのアイコン・ホットキーの表記・アイコンと自動起動の作り方を分ける |
| `ICONS_DIR` / `APP_ICON_PNG_PATH` / `APP_ICON_ICNS_PATH` / `APP_ICON_ICO_PATH` | 定数 | assets/icons と、アプリのアイコン（Dock 用 PNG・Mac 用 icns・Windows 用 ico）のパス | Dock・デスクトップのアイコン |
| `MAC_LAUNCHER_DIR` | 定数 | プロジェクトの launcher/ フォルダ | Mac の起動用の .app を置く場所（Git に含めない） |
| `START_HIDDEN` | 定数 | `--hidden` 付きで起動したか | ログイン時の自動起動では、最初のウインドウを出さずに常駐する |
| `appStarted` / `showMainWindowWhenStarted()` | 定数・関数 | 起動処理（startApp）の結果（Promise）／起動処理が終わってから確認ウインドウを表示する | 設定の読み込みを待つ間の2つ目の起動を取りこぼさず、準備前にウインドウを作らない（2つできるのを防ぐ）。起動中の Dock の activate は捨てる（最初の起動でも届くことがあり、自動起動でウインドウが出てしまうため） |
| `TRAY_ICON_PATH` | 定数 | トレイのアイコンのパス（Mac は白黒のテンプレート画像） | 常駐の表示 |
| `MAIN_WINDOW_SIZE` | 定数 | ウインドウの大きさ（980×660、最小 760×500） | 確認ウインドウの表示（2026-10-11 依頼者の指示で画面をコンパクトにし、小さくした） |
| `mainWindow` / `trayController` | 変数 | 確認ウインドウ／トレイ（アイコンとメニューの表記の変更） | 表示・常駐 |
| `isQuitting` | 変数 | 終了しようとしているか | 閉じるボタンで隠す（常駐）か、本当に閉じるかを分ける |
| `registeredAccelerator` / `registeredClipboardAccelerator` | 変数 | 実際に登録できた範囲キャプチャ／コピーした文章の読み取りのホットキー（できなければ null） | 使えないときの案内、設定で変えるときの解除 |
| `currentSettings` / `settingsStore` | 変数 | 今の設定／設定の保存先 | 設定の読み込み・保存 |
| `captureImageStore` | 定数 | 取り込んだ画像の置き場所（メモリだけ） | app:// での表示・読み直し |
| `captureController` | 定数 | 範囲キャプチャから OCR までの処理 | ホットキー・トレイ・ボタンから呼ぶ |
| `createMainWindow({show})` | 関数 | 安全な設定でウインドウを作る（show が false なら読み込み後も出さない）。閉じるボタンでは隠して画像を消す | 常駐（要件§6.1） |
| `showMainWindow()` | 関数 | 確認ウインドウを表示して前面に出す（なければ作る。まだ読み込み中なら読み込み後に表示し、白い画面を出さない）。起動処理が終わってから呼ぶ | トレイ・2つ目の起動・読み取り後 |
| `minimizeMainWindow()` | 関数 | 確認ウインドウを最小化する（ウインドウがなければ何もしない） | 予定作成画面をすべて開いたあと、ブラウザの操作の邪魔にならないように（依頼者の指示） |
| `registerHotkey(accelerator, onPressed)` | 関数 | ホットキーを1つ登録し、できたら accelerator、できなければ null を返す | 2つのホットキーで共通に使う |
| `registerHotkeys(captureAccelerator, clipboardAccelerator)` / `unregisterHotkeys()` | 関数 | 範囲キャプチャとコピーした文章の読み取りのホットキーを登録する／2つとも解除する | 起動時・設定の変更時 |
| `changeCaptureHotkey(nextSettings)` | 関数 | 今のホットキーを外して新しいものを登録する（範囲キャプチャのキーを登録できなければ元に戻す）。トレイの表記も変える | 設定画面でのホットキーの変更 |
| `getHotkeyStatus()` | 関数 | 2つのホットキーが使えるか・その表記を返す | 画面の案内 |
| `sendCaptureStatus(status)` | 関数 | 取り込み・読み取りの結果を確認ウインドウに送る（読み込み中なら読み込み後に送る） | 範囲キャプチャとコピーした文章の読み取りで共通に使う |
| `importClipboardText()` | 関数（非同期） | 確認ウインドウを出し、コピーした文章を読んで送る（範囲の選択・読み取りの途中なら断る。前に取り込んだ画像は消す） | ホットキー・トレイ・ボタンからのコピーした文章の読み取り |
| `createDesktopIcon()` | 関数 | Mac は起動用の .app を作ってデスクトップに別名を置く。Windows はデスクトップにショートカットを作る（同じ名前の利用者のショートカットは上書きしない） |
| `writeCurrentMacLauncher()` / `getMacLaunchAgentsDir()` | 関数 | 今の場所で起動用の .app を書き出す／~/Library/LaunchAgents | アイコンと自動起動で同じ内容を使う（重複をなくす） |
| `readWindowsShortcut(shortcutPath)` | 関数 | 既存のショートカットを読む（読めなければ null） | このアプリが作ったものかの見分け | 「デスクトップにアイコンを作る」（ゴール G7） |
| `autoStart` | 定数（オブジェクト） | `isSupported` / `isEnabled` / `setEnabled`。Mac は LaunchAgent、Windows はログイン項目。状態は OS の登録そのものを正とする | ログイン時の自動起動（ゴール G8） |
| `isTrustedSender(event)` | 関数 | IPC の送信元が確認ウインドウの最上位のフレーム（app://bundle）か | 送信元の検証（CLAUDE.md） |
| `registerIpcHandlers()` | 関数 | 登録・範囲キャプチャ・範囲選択の画面・設定の通信の受け付けを登録する | IPC の入口をまとめる |
| `startApp()` | 関数 | セキュリティ設定、app:// の登録、設定の読み込み、通信の受け付け、トレイ、Dock のアイコン、設定どおりのホットキー、ウインドウ作成 | 起動処理 |

### tray.js（タスクトレイ）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `createAppTray(options)` | 関数（公開） | アイコンとメニュー（範囲を選んで読み取る／コピーした文章を読み取る／確認ウインドウを開く／終了）を作る。Windows は左クリックで確認ウインドウ。`{tray, setHotkeyLabels(captureLabel, clipboardLabel)}` を返す | 常駐（要件§6.1）。設定でホットキーを変えたらメニューの表記も変える |

### settingsStore.js（設定の保存）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `SETTINGS_FILE_NAME` | 定数（公開） | 'settings.json' | 設定のファイル名（userData の中） |
| `MAX_SETTINGS_FILE_BYTES` | 定数（公開） | 4096 | これより大きいファイルは読まない（壊れた・書き換えられたファイル対策） |
| `SETTINGS_FILE_MODE` | 定数（内部） | 0o600 | 本人だけが読み書きできる権限 |
| `createSettingsStore(directory)` | 関数（公開） | `{filePath, load(), save(settings)}` を作る。load は失敗しても例外を出さず既定値を返す。load は大きすぎるファイルを読む前に断る。save は3項目だけを一時ファイルに書き、権限を 600 にしてから名前を変える（前回の一時ファイルが残っていても 600 になる） | 設定だけを保存（文章・画像は保存しない）。書きかけで壊れないようにする |

### settingsIpc.js（設定の通信の受け付け）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `SETTINGS_GET_CHANNEL` / `SETTINGS_SAVE_CHANNEL` / `DESKTOP_ICON_CHANNEL` | 定数（公開） | 'settings:get' ／ 'settings:save' ／ 'settings:create-desktop-icon' | チャンネル名（preload.cjs と同じ） |
| `UNTRUSTED_SENDER_MESSAGE` / `BUSY_MESSAGE` / `INVALID_REQUEST_MESSAGE` / `HOTKEY_UNAVAILABLE_MESSAGE` / `AUTO_START_FAILED_MESSAGE` / `AUTO_START_UNSUPPORTED_MESSAGE` / `SAVE_FAILED_MESSAGE` / `DESKTOP_ICON_FAILED_MESSAGE` / `DESKTOP_ICON_CREATED_MESSAGE` | 定数（内部） | 表示文 | ファイルのパスなどを含めずに知らせる |
| `parseSaveRequest(rawRequest)` | 関数（公開） | 保存の要求を検証し `{settings, autoStart}` にする | IPC の引数の検証 |
| `createSettingsHandlers(dependencies)` | 関数（公開） | `{handleGet, handleSave, handleCreateDesktopIcon}` を作る。保存は、何も変えない確かめ（検証・自動起動の状態の読み取り・対応 OS か）を先に済ませ、ホットキー→自動起動→ファイルの順に変える。途中で失敗したら前の変更を元に戻す。自動起動は変わったときだけ登録を変え、オフのまま保存したときは古い登録を消す（失敗しても保存は続ける）。取得（handleGet）は、自動起動の状態を読めなくても設定とホットキーの状態を返す。起動時に登録できなかったキーは、同じ組み合わせで保存すると登録し直す。保存中の重ねた要求は断る | 設定画面の入口。中途半端な状態を残さない |

### desktopIntegration.js（デスクトップのアイコンと自動起動）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `APP_DISPLAY_NAME` | 定数（公開） | 'カレンダー登録ツール' | アイコン・ショートカットの名前 |
| `HIDDEN_START_ARGUMENT` | 定数（公開） | '--hidden' | 自動起動のときウインドウを出さない合図 |
| `MAC_LAUNCHER_BUNDLE_NAME` / `MAC_LAUNCHER_BUNDLE_ID` / `MAC_LAUNCHER_EXECUTABLE_NAME` / `MAC_ICON_FILE_NAME` | 定数 | 起動用の .app の名前・識別子（local.calendar-add-app.launcher）・中のスクリプト名・アイコン名 | Mac の起動用の .app |
| `MAC_LAUNCH_AGENT_LABEL` / `MAC_LAUNCH_AGENT_FILE_NAME` / `MAC_OPEN_COMMAND` | 定数 | 'local.calendar-add-app' ／ その .plist ／ /usr/bin/open | Mac の自動起動（~/Library/LaunchAgents） |
| `WINDOWS_SHORTCUT_FILE_NAME` / `WINDOWS_SHORTCUT_DESCRIPTION` | 定数（公開） | 'カレンダー登録ツール.lnk' ／ ショートカットの説明 | Windows のショートカット。説明は、このアプリが作ったものかの見分けにも使う |
| `EXECUTABLE_FILE_MODE` / `READABLE_FILE_MODE` | 定数（内部） | 0o755 ／ 0o644 | 作るファイルの権限 |
| `CONTROL_CHARACTER_PATTERN` / `WINDOWS_FULL_PATH_PATTERN` | 定数（内部） | 改行などの制御文字／Windows の完全なパス（ドライブ名か、ネットワークの場所から始まる） | スクリプト・plist の行を壊すパスや、場所が定まらないパスを断る |
| `DesktopIntegrationError` | クラス（公開） | 利用者向けの文付きのエラー（パスは文に含めない） | 個人の情報を表示しない |
| `assertSafeAbsolutePath(value, style)` | 関数（公開） | 制御文字のない絶対パスか確かめる（Windows は完全なパスに限る） | 書き込む内容の検証 |
| `quoteForPosixShell(value)` / `escapeXml(value)` / `quoteWindowsArgument(value)` | 関数（公開） | sh 用に囲む／XML 用に置き換える／Windows のショートカットの引数として二重引用符で囲む（二重引用符や末尾の円記号は断る） | パスに空白・記号があっても別の命令にならないようにする |
| `assertWindowsArgumentPath(value)` | 関数（公開） | Windows の引数に使えるパスかを確かめ、同じパスを返す（囲まない。二重引用符・末尾の円記号は断る） | 自動起動の args を Electron に囲ませ、二重引用符にしないため |
| `buildMacLauncherScript({electronPath, appPath})` | 関数（公開） | 起動用のスクリプト（ELECTRON_RUN_AS_NODE を外し、Electron にプロジェクトの場所を渡して exec） | アイコンから起動する |
| `buildMacInfoPlist()` / `buildMacLaunchAgentPlist({launcherPath})` / `buildPlist(dictBody)` | 関数 | .app の Info.plist／自動起動の plist（open -a 起動用の .app --args --hidden。ログイン時に実行）／plist の共通部分 | Mac のアイコン・自動起動 |
| `writeMacLauncher(options)` | 関数（公開） | launcher/ に起動用の .app を書く（スクリプト・Info.plist・アイコン。消すことはしない） | Mac のアイコン |
| `createMacDesktopAlias({desktopDir, launcherPath})` | 関数（公開） | デスクトップに起動用の .app への別名を置く（同じ名前の別のファイルがあれば上書きせず断る） | 利用者のファイルを壊さない |
| `enableMacAutoStart` / `disableMacAutoStart` / `isMacAutoStartEnabled` | 関数（公開） | LaunchAgent の plist を置く／消す／今の場所の起動用 .app を指しているか確かめる | Mac の自動起動（ゴール G8）。フォルダを移動したらオフと表示し、オンにして保存すれば今の場所で作り直す |
| `isReplaceableWindowsShortcut(existingShortcut)` | 関数（公開） | 同じ名前のショートカットが、このアプリが前に作ったもの（説明が同じ）か | 利用者のショートカットを上書きしない |
| `buildWindowsShortcutOptions(options)` | 関数（公開） | `shell.writeShortcutLink` に渡す内容（Electron・引用符で囲んだプロジェクトの場所・アイコン） | Windows のアイコン（ゴール G7） |
| `buildWindowsLoginItemSettings(options)` | 関数（公開） | `app.setLoginItemSettings` に渡す内容（引用符で囲まないプロジェクトの場所と --hidden。囲むのは Electron） | Windows の自動起動（ゴール G8）。2026-10-12 の確認で、二重に囲むとログイン時に起動できなかったため変更 |

### captureGeometry.js（範囲の座標）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `MIN_SELECTION_SIZE` | 定数（公開） | 8 | 小さすぎる範囲は読み取れないため断る |
| `UPSCALE_PIXEL_RATIO_THRESHOLD` / `UPSCALE_FACTOR` | 定数（公開） | 2 ／ 2 | 文字が小さい画面（等倍・125% など）は2倍に拡大して OCR |
| `CaptureError` | クラス（公開） | 範囲キャプチャのエラー（利用者向けの文と、特別な案内のための理由 reason 付き） | 画面でそのまま表示できるエラー |
| `CAPTURE_ERROR_SCREEN_PERMISSION` | 定数（公開） | 'screenPermission' | 画面収録の許可がないエラーの理由（「システム設定を開く」ボタンを出す） |
| `clamp(value, min, max)` | 関数（内部） | 値を範囲に収める | 画面の外にはみ出さないようにする |
| `validateSelection(rawSelection, viewport)` | 関数（公開） | 範囲選択の画面から届いた矩形を検証し、画面の中に収める | IPC の引数の検証 |
| `toImageRect(selection, displaySize, imageSize)` | 関数（公開） | 画面の座標を撮影した画像の画素に変換する（外側に丸める） | Retina・拡大率の違いへの対応 |
| `getUpscaleFactor(displaySize, imageSize)` | 関数（公開） | OCR の前の拡大の倍率を決める | 等倍の画面でも読み取れるようにする |

### captureImageStore.js（取り込んだ画像の置き場所）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `SCREENSHOT_IMAGE_NAME` / `SELECTION_IMAGE_NAME` | 定数（公開） | 'screenshot.png'（範囲選択の背景。選んだらすぐ消す）／'selection.png'（確認ウインドウに表示） | 配信する画像の名前 |
| `IMAGE_NAMES` / `CAPTURE_PATH_PREFIX` | 定数 | 配信してよい名前の一覧／'/capture/' | 決めた画像以外を配信しない |
| `createCaptureImageStore()` | 関数（公開） | メモリの中に画像を置く・取り出す・消す（置くたびに版が上がる） | ファイルに保存しない（CLAUDE.md） |
| `getCaptureImageName(requestUrl)` | 関数（公開） | URL が取り込んだ画像を指していれば名前を返す | app:// での配信 |

### clipboardImport.js（コピーした文章の読み取り）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `CLIPBOARD_READ_CHANNEL` | 定数（公開） | 'clipboard:read' | 画面のボタンからの要求のチャンネル名 |
| `CLIPBOARD_EMPTY_MESSAGE` | 定数（公開） | コピーした文章がないときの案内 | コピーし直すよう案内する |
| `UNTRUSTED_SENDER_MESSAGE` / `CLIPBOARD_READ_FAILED_MESSAGE` | 定数（内部） | 送信元を確認できない／クリップボードを読めないときの文 | エラーの表示（中身を含めない） |
| `readClipboardForExtraction(readText)` | 関数（公開・非同期） | クリップボードの文章を読み（Electron 44 の readText は Promise を返すため待つ）、空・長すぎる（20000文字超）・読めないときは断る | 抽出に回す前の確認 |
| `createClipboardHandlers({isTrustedSender, importClipboardText})` | 関数（公開） | 送信元を確かめてから読み取りを始める `handleRead` を作る | 「コピーした文章を読み取る」ボタン |

### captureIpc.js（範囲キャプチャの通信の受け付け）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `CAPTURE_START_CHANNEL` / `CAPTURE_REREAD_CHANNEL` / `CAPTURE_CLEAR_CHANNEL` | 定数（公開） | 確認ウインドウ → メインプロセスのチャンネル名 | 取り込み開始・読み直し・画像を消す（状態の問い合わせ app:get-status は、画面が使わなくなったので 2026-10-11 に削除） |
| `CAPTURE_IMPORT_CHANNEL` | 定数（公開） | 'capture:import-image' | 貼り付け・ドラッグ＆ドロップした画像の読み取り |
| `PNG_SIGNATURE` | 定数（内部） | PNG の先頭の8バイト | PNG だけを受け付ける |
| `validateImportedImage(bytes)` | 関数（公開） | 届いた画像が PNG で20MB以下かを確かめる | IPC の引数の検証 |
| `CAPTURE_STATUS_CHANNEL` | 定数（公開） | メインプロセス → 確認ウインドウのチャンネル名 | 読み取りの進み具合と結果 |
| `OVERLAY_SELECT_CHANNEL` / `OVERLAY_CANCEL_CHANNEL` | 定数（公開） | 範囲選択の画面 → メインプロセスのチャンネル名 | 選んだ範囲・中止 |
| `OPEN_SCREEN_SETTINGS_CHANNEL` | 定数（公開） | 'system:open-screen-settings' | 「システム設定を開く」のチャンネル名 |
| `SCREEN_RECORDING_SETTINGS_URL` | 定数（公開） | Mac の画面収録の設定画面の固定の URL | 許可リストに加えた唯一の Mac の設定画面の URL |
| `UNTRUSTED_SENDER_MESSAGE` | 定数（内部） | 送信元を確認できないときの文 | 不正な要求を断る |
| `createCaptureHandlers(dependencies)` | 関数（公開） | 送信元・向きを検証して、取り込みの処理を呼ぶ関数をまとめて作る（途中なら重ねて始めない） | IPC の引数の検証（CLAUDE.md） |
| `createOpenScreenSettingsHandler(dependencies)` | 関数（公開） | 送信元を検証し、Mac でだけ決まった設定画面の URL を開く処理を作る | 「システム設定を開く」 |

### captureController.js（範囲キャプチャから OCR まで）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `HIDE_SETTLE_MS` | 定数（内部） | 200 | 確認ウインドウを隠してから撮影するまでの待ち（写り込み防止） |
| `OVERLAY_TIMEOUT_MS` | 定数（内部） | 120000 | 範囲選択の画面を放置したときに自動で中止する |
| `LOW_CONFIDENCE_THRESHOLD` | 定数（公開） | 40 | これ未満なら「精度が低い可能性」と知らせる |
| `SELECTION_IMAGE_URL` / `OVERLAY_PATHNAME` | 定数（内部） | 表示する画像の URL／範囲選択の画面のパス | 表示・送信元の確認 |
| `CAPTURE_FAILED_MESSAGE` / `UNEXPECTED_ERROR_MESSAGE` | 定数（内部） | 撮影できない・予期しないエラーの文（許可がないときの文は screenPermission.js で作る） | 失敗時の案内（要件§5.9） |
| `delay(milliseconds)` | 関数（内部） | 指定時間待つ | 撮影前の待ち |
| `createCaptureController(dependencies)` | 関数（公開） | 範囲キャプチャの処理を作る | main.js から使う |
| `isOverlaySender(event)` | 関数 | IPC の送信元が範囲選択の画面（最上位のフレーム、/overlay.html）か | 送信元の検証 |
| `settleSelection(value)` | 関数（内部） | 範囲の選択の待ちを終える（範囲・中止・エラー） | 範囲選択の画面との受け渡し |
| `closeOverlay()` | 関数（内部） | 範囲選択の画面を閉じる | 暗い表示を残さない（要件§5.9） |
| `ensureScreenPermission()` | 関数（内部） | Mac の画面収録の許可を、撮影を試みたあとに確かめる（前に確かめると macOS の一覧に起動元のアプリが追加されないため） | 許可がないときに手順を案内する |
| `captureDisplay(display)` | 関数（内部） | カーソルがある画面を撮影する | 取り込み |
| `selectRegion(display)` | 関数（内部） | 範囲選択の画面を開き、範囲が選ばれるか中止されるまで待つ | 要件§6.1：範囲選択 |
| `cropForOcr(screenshot, selection, display)` | 関数（内部） | 選んだ範囲を切り出し、必要なら2倍に拡大する | OCR の精度を上げる |
| `runOcr(png, orientation)` | 関数（内部） | OCR にかけ、結果を確認ウインドウに送る | 読み取り |
| `fail(error, options)` | 関数（内部） | 後始末（画面を閉じる・画像を消す）をしてエラーを送る | 要件§5.9 |
| `isBusy()` / `startCapture()` / `importImage(png)` / `rereadSelection(orientation)` / `clearCapture()` | 関数（公開） | 途中か／取り込み開始／貼り付けた画像の読み取り／読み直し／画像を消す | ホットキー・トレイ・画面から呼ぶ |
| `handleOverlaySelect(event, rawSelection)` / `handleOverlayCancel(event)` | 関数（公開） | 範囲選択の画面から届いた範囲・中止を検証して受け取る | IPC の入口 |

### screenPermission.js（画面収録の許可の案内）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `APP_NAMES_BY_BUNDLE_ID` | 定数（内部） | macOS のアプリの識別子と名前の対応（ターミナル・Visual Studio Code・iTerm・Electron） | 起動元のアプリの判別 |
| `APP_NAMES_BY_TERM_PROGRAM` | 定数（内部） | TERM_PROGRAM とアプリの名前の対応 | 識別子がないときの判別 |
| `getScreenPermissionAppName(environment)` | 関数（公開） | 起動元のアプリの名前を環境変数から判別する（判別できなければ null） | どのアプリを許可すればよいかを示す |
| `buildScreenPermissionMessage(appName)` | 関数（公開） | 許可の手順と、起動し直す対象を案内する文を作る | npm 起動では起動元のアプリに許可が求められるため |

### overlayPreload.cjs（範囲選択の画面に公開する関数）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `OVERLAY_SELECT_CHANNEL` / `OVERLAY_CANCEL_CHANNEL` | 定数 | captureIpc.js と同じ値 | チャンネル名 |
| `window.captureOverlay.select(rect)` / `cancel()` | 関数（画面に公開） | 選んだ範囲を送る／中止を送る | 公開するのはこの2つだけ |

---

## scripts/smoke-test.js（実機の自動確認）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `PROJECT_DIR` | 定数 | プロジェクトのフォルダ | アプリの起動 |
| `IDLE_TIMEOUT_MS` / `STEP_TIMEOUT_MS` / `POLL_INTERVAL_MS` / `UI_SETTLE_MS` | 定数 | 確認が進まないまま30秒で失敗終了（全体の時間の上限ではない。正常なら全体で約27秒）／1つの待ちの上限 10秒／確認間隔／画面の更新待ち | 止まったらすぐ知らせる（依頼者の指示：操作がまったくないまま30秒） |
| `MINIMIZE_WAIT_MS` | 定数 | 3秒 | 登録のあと確認ウインドウが最小化される（元に戻る）のを待つ上限。Mac は最小化の動きに時間がかかる |
| `AUTO_RESET_TEST_DELAY_MS` | 定数 | 自動のクリアの確認で、60秒の代わりに待つ時間（1秒） | 確認全体の時間を短くする |
| `HIDDEN_START_SETTLE_MS` | 定数 | 1秒 | `--hidden` で起動したあと、ウインドウが出てこないことを確かめるまで待つ時間 |
| `userDataDir` / `removeTemporaryUserData()` | 変数・関数 | 確認専用の一時的な設定フォルダ（--user-data-dir で渡す）／終了時にそれを消す | 利用者の本当の設定を書き換えない |
| `CAPTURE_FIXTURE_PATH` / `IMPORT_FIXTURE_PATH` | 定数 | 範囲キャプチャで「撮影した画面」とする画像／貼り付けに使う画像（架空） | 画面収録の許可なしで確認する |
| `APP_EXIT_TIMEOUT_MS` / `launchedApp` | 定数・変数 | アプリの終了を待つ上限 5秒／起動したアプリ | 常駐するアプリを必ず閉じる |
| `DEMO_TITLE` / `DEMO_LOCATION` / `DEMO_MEETING_URL` | 定数 | デモ文面の件名・場所・会議 URL（架空） | 下書き・登録内容の確認 |
| `DEMO_TEXT` / `NO_DATE_TEXT` | 定数 | 架空のデモ文面（日時3つ・件名・場所・URL 付き）／日時のない文面 | 画面操作の入力 |
| `results` / `unexpectedErrors` / `isExpectingErrors` | 変数 | 確認結果／画面のエラー／意図的なエラーを数えない期間か | 合否の判定 |
| `idleTimer` / `restartIdleTimer()` | 変数・関数 | 止まったことを見張るタイマー／それを最初から数え直す（開始時と、確認の結果が出るたび） | 進まないまま30秒たったら、アプリを終了させて失敗終了する |
| `record(name, passed, detail)` | 関数 | 確認結果を記録・表示し、止まったことの見張りを数え直す | 結果の一覧 |
| `sleep(milliseconds)` | 関数 | 指定時間待つ | 画面の更新待ち |
| `DevToolsConnection` | クラス | DevTools への接続（`open` / `send` / `handleMessage` / `evaluate(式, {commandLineApi})` / `close`）。commandLineApi はメインプロセスで require を使う式のとき | 画面・メインプロセスを外から操作する |
| `FIND_MAIN_WINDOW_EXPRESSION` / `DEFAULT_ACCELERATOR` | 定数 | メインプロセスで確認ウインドウを探す式／既定のホットキー（buildAccelerator(DEFAULT_SETTINGS)） | 同じ式・値を何か所にも書かない |
| `SETTINGS_TEST_ACCELERATOR` / `CLIPBOARD_ACCELERATOR` | 定数 | 設定画面の確認で選ぶホットキー（Ctrl/Cmd+Shift+K）／コピーした文章を読み取るホットキー（Ctrl/Cmd+Shift+U） | ホットキーの登録の確認 |
| `replaceClipboardText(mainConnection, text)` / `restoreClipboardText(mainConnection)` | 関数 | メインプロセスの clipboard.readText を決めた文章を返す関数に差し替える／元に戻す | 利用者のクリップボードを読まず・書き換えずに、コピーした文章の読み取りを確かめる |
| `isHotkeyRegistered(mainConnection, accelerator)` | 関数 | メインプロセスでホットキーが登録されているか調べる | 範囲キャプチャ・設定・--hidden の確認で共通に使う |
| `launchApp(appArguments)` | 関数 | 確認用の接続口（画面用・メインプロセス用）と一時的な設定フォルダを付けて Electron を起動（`--hidden` などを追加で渡せる） | アプリの起動 |
| `preventFocusStealing(mainConnection)` / `showMainWindowWithoutFocus(mainConnection)` | 関数 | ウインドウの表示・前面化を「選択しないで表示」に差し替える／確認ウインドウを選択せずに表示する（できるまで待つ） | 確認中に、利用者が別のアプリで打っている文字を横取りしない |
| `setFieldValue(connection, selector, value, kind)` / `setSelectValue(...)` | 関数 | React が管理する欄に、要素の本来の setter で値を入れてイベントを送る（共通）／選択欄（change）用 | 設定画面の操作の再現 |
| `connectToMainWindow(port)` | 関数 | 確認ウインドウに接続 | 操作対象の取得 |
| `waitFor(connection, expression)` | 関数 | 条件が満たされるまで待つ | 画面の準備待ち |
| `replaceInputText(connection, text)` | 関数 | 入力欄の文章を入れ替える | 貼り付けの再現 |
| `clickButton(connection, label)` | 関数 | 文字が一致するボタンを押す | ボタン操作の再現 |
| `setInputValue(connection, selector, value)` | 関数 | 日付・時刻などの入力欄に値を入れる | 手入力・時刻指定の再現 |
| `replaceOpenExternal(mainConnection)` | 関数 | メインプロセスの shell.openExternal を、URL を記録するだけの関数に差し替える | 実際のブラウザを開かずに登録を確認する |
| `getOpenedUrls(mainConnection)` | 関数 | メインプロセスが開こうとした URL の一覧を受け取る | 登録内容の確認 |
| `clickRegister(connection)` | 関数 | 登録ボタンを押し、処理が終わるまで待つ | 登録の再現 |
| `restoreMinimizedMainWindow(mainConnection)` | 関数 | 確認ウインドウが最小化されるのを待って元に戻す | 最初の登録で最小化を確かめる。戻さないと続く確認・画面の画像が取れないため |
| `replaceMinimize(mainConnection)` / `getMinimizeCount(mainConnection)` | 関数 | 確認ウインドウの最小化を、回数を数えるだけの関数に差し替える／その回数を受け取る | 2回目以降の登録で最小化の動きを待たない。不正な登録要求で最小化しないことの確認 |
| `saveScreenshot(connection, directory, fileName)` | 関数 | 画面の画像を保存 | 見た目の確認 |
| `checkFeatures(connection, mainConnection, screenshotDir)` | 関数 | 抽出し直すと右の欄が一番上に戻ること・件名の上限と残りの文字数・URL のフィッシングの注意（会議サービス・それ以外。画面の画像 07-event-details.png）・抽出・下書き・候補・登録（最小化・開いたあとの案内）・時刻指定・ポップアップでの手入力・曜日が日付と合わないときの警告と件名の下書きの直し・メールの送信日を候補にしないこと・コピーした文章の読み取り（ボタン・空のとき）・エラー表示を確認 | 機能の確認 |
| `checkAutoReset(connection, mainConnection)` | 関数 | 登録のあと、操作するとクリアせず、操作しないと初期状態に戻ることを確認（画面の setTimeout の60秒だけを短くする） | 自動のクリアの確認（依頼者の指示） |
| `replaceScreenCapture(mainConnection)` | 関数 | 画面の撮影を、架空の画像を返す関数に差し替える | 利用者の画面を撮影しない |
| `connectToOverlay(port, connection)` / `waitForOverlayClosed(port)` | 関数 | 範囲選択の画面に接続する／閉じるまで待つ（上限付き） | 範囲選択の確認 |
| `dragWholeOverlay(overlayConnection)` | 関数 | 範囲選択の画面でドラッグする。離す操作は、画面がすぐ閉じるため命令の返事を待たない | 範囲選択の再現（返事を待って止まるのを防ぐ） |
| `waitForWithTimeout(connection, expression, timeoutMs)` | 関数 | 条件を満たすまで待つ（上限付き。満たさなければ false） | 不合格を記録して先に進む |
| `checkCapture(connection, mainConnection, port, screenshotDir)` | 関数 | ホットキー・撮影・範囲選択・OCR・抽出・読み直し・Esc での中止・小さすぎる範囲を確認 | 範囲キャプチャの確認 |
| `checkSettings(connection, mainConnection, screenshotDir)` | 関数 | 設定画面で長さ・ホットキーを変えて保存し、ホットキーの登録・ボタンの表記・settings.json の中身・抽出に使う長さを確かめ、元に戻す | 設定画面の確認（ゴール G7・G8） |
| `checkHiddenStart()` | 関数 | `--hidden` で起動し直し、ウインドウが出ないこととホットキーが使えることを確認 | 自動起動のときの起動の仕方の確認（ゴール G8） |
| `stopLaunchedApp()` | 関数 | アプリを終了させる（終わらなければ強制終了） | 次の確認が多重起動防止で動かなくならないように |
| `checkSecurity(connection, mainConnection)` | 関数 | 公開する関数が決めた10個だけか、不正な登録要求が断られ最小化もしないか、不正な設定の保存が断られ設定が変わらないか、Node.js 機能・外部通信・インラインスクリプト・新規ウインドウ・外部移動の遮断を確認 | セキュリティの実地確認 |
| `main()` | 関数 | 確認全体を実行し、終了コードを返す | 確認の実行 |

## scripts/generate-ocr-fixtures.js（OCR のテスト用の画像を作る）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `OUTPUT_DIR` | 定数 | test/fixtures/ocr | 画像の保存先 |
| `FONT_FAMILY` | 定数 | Mac・Windows の標準の日本語書体 | 画面の文字に近い画像にする |
| `EMAIL_LINES` / `CHAT_LINES` / `VERTICAL_LINES` | 定数 | 架空のメール・チャット・縦書きのお知らせ | 画像に描く文章 |
| `FIXTURES` | 定数 | 作る画像の一覧（等倍・2倍、横書き・縦書き） | 画面の拡大率の違いを再現する |
| `buildHtml(fixture)` | 関数 | 画像に描く HTML を作る | 文章の描画 |
| `renderFixture(window, fixture)` | 関数 | 1枚の画像を作って保存する（同じ画面を書き換えて撮影） | 画像の作成 |

## scripts/generate-icons.js（トレイとアプリのアイコンを作る）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `OUTPUT_DIR` | 定数 | assets/icons | 保存先 |
| `TEMPLATE_COLOR` / `BRAND_COLOR` / `WHITE_COLOR` | 定数 | 黒（Mac のテンプレート画像）／青 #1a73e8（Windows・アプリのアイコンの地）／白（アプリのアイコンのカレンダー） | アイコンの色 |
| `APP_ICON_MARGIN_RATIO` / `APP_ICON_CORNER_RATIO` / `APP_ICON_CALENDAR_RATIO` | 定数 | アプリのアイコンの余白・角の丸み・カレンダーの大きさの割合 | どの大きさでも同じ形に描く |
| `ICO_SIZES` / `ICNS_ENTRIES` / `DOCK_ICON_SIZE` | 定数 | app.ico に入れる大きさ（16〜256）／app.icns に入れる種類と大きさ（16〜1024）／app.png の大きさ（512） | Windows・Mac のアイコン |
| `setPixel()` / `drawCalendar()` / `drawCalendarIcon(size, color)` | 関数 | 画素を塗る／カレンダーの形を描く／トレイのアイコンの画素を作る | 外部の画像素材を使わない |
| `drawAppIcon(size)` / `renderAppIconPng(size)` | 関数 | 青い角丸の四角に白いカレンダーを描く／PNG にする | アプリのアイコン |
| `buildIco(images)` / `buildIcns(entries)` | 関数 | PNG をまとめて .ico ／ .icns の形式にする（部品を増やさず自前で組み立てる） | Windows・Mac のアイコンのファイル |
| `saveIcon(fileName, size, color)` | 関数 | PNG で保存する | アイコンの作成 |

## scripts/generate-demo-images.js（デモ用の画像を作る）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `OUTPUT_DIR` | 定数 | demo/images | 保存先 |
| `FONT_FAMILY` / `BASE_STYLE` | 定数 | 標準の日本語書体／共通の見た目 | 画面の文字に近い画像にする |
| `DEMO_IMAGES` | 定数 | 作る画像の一覧（日本語のメール・チャット・縦書きのお知らせ・英語のメール・SNS 風の告知・写真の上の文字・傾いた紙の連絡状・ライブ告知。日付は発表日より後） | 読み取りテスト・発表のデモ |
| `renderDemoImage(window, demoImage)` | 関数 | 1枚の画像を作って保存する | 画像の作成 |

## test/（単体テスト）

| ファイル | 主な名前 | 機能 | 目的 |
|---|---|---|---|
| dateExtractor.test.js | `NOW`、`extract()`、`extractSingle()`、`dateTime()` | 基準日時を 2026-10-11(日) 10:00 に固定して抽出を確かめる | 要件の書き方・年の決定・誤認防止・処理時間 |
| mailHeader.test.js | `NOW`、`BODY`、`extractLabels()` | メーラーごとの架空の文面で、送信日・受信日・引用の見出しの日付を候補にしないことを確かめる | 送信日の誤認防止（予定の日付は外さない） |
| japaneseNumber.test.js | — | 漢字の数字の変換の確認 | 位を使う書き方・1桁ずつの書き方・不正な書き方 |
| dateUtils.test.js | — | 日付計算と全角→半角の確認 | 繰り上がり・曜日・東京時間 |
| display.test.js | `NOW`、`firstCandidate()` | 表示文字列と色付けの分割の確認 | 表示の正しさ、HTML を解釈しないこと |
| detailExtractor.test.js | — | 件名・場所・会議 URL の下書きの確認 | ラベルの書き方、次の行の値、ラベルのない見出し・「会場は〜です」、住所の行（見出しあり・なし・OCR）と署名の除外、URL の優先順位・なりすまし対策 |
| calendarUrl.test.js | `timedEvent()`、`allDayEvent()`、`queryOf()` | 予定作成 URL の組み立て・検証・許可リストの確認 | dates・ctz・エンコード・長さ・危険な文字、予定作成画面以外（日の表示など）を開かない |
| autoReset.test.js | `countActivityListeners()`、`scheduleWithFakeTimer()` | 自動のクリアの予約の確認（偽のタイマーと EventTarget を使う） | 60秒、時間がたつとクリア、操作で取り消し、監視の解除し忘れがないこと |
| registration.test.js | `NOW`、`emptyDetails()`、`candidatesOf()` | 登録内容の組み立ての確認 | 終日／時刻指定、手入力、会議 URL の振り分け、元の文章の抜粋 |
| calendarIpc.test.js | `sampleEvent()`、`createTestHandler()` | 登録要求の処理の確認（偽のブラウザを開く関数を使う） | 送信元・引数の検証、順に開く、二度押し、すべて開けたときだけ最小化、preload との整合（削除した「カレンダーで確認」を公開していない） |
| electronSecurity.test.js | `FIXTURE_ROOT`、`isInsideRoot()`、`createFakeSession()`、`createFakeContents()`、`createFakeEvent()` | セキュリティ設定と app:// の配信を偽物のオブジェクトで確認 | 設定を誤って緩めたら失敗させる |
| ocrText.test.js | — | OCR の結果の整形の確認 | 空白の除去、整形後に日時を抽出できること |
| capture.test.js | `VIEWPORT` | 範囲の座標の検証・変換、拡大の判定、画像の置き場所 | Retina・拡大率への対応、小さすぎる範囲、メモリだけで持つこと |
| screenPermission.test.js | — | 起動元のアプリの判別と案内文の確認 | ターミナル・VSCode・判別できない場合 |
| captureIpc.test.js | `createTestHandlers()` | 範囲キャプチャの通信の受け付けと preload の確認 | 送信元・向きの検証、重ねて始めない、公開する関数が決めたものだけ |
| demoTexts.test.js | `DEMO_TEXT_DIR`、`PRESENTATION_NOW`、`runDemo()`、`openedQueries()` | デモの文面3通を、今日を発表日（10/16）に固定して抽出し、README の「まず試す」どおりの候補・下書き・予定作成 URL になるか確かめる | 文面や規則を変えて README と食い違ったら気付けるようにする |
| ocrEngine.test.js | `FIXTURE_DIR`、`NOW`、`readFixture()` | 架空の画像で実際に読み取る | 横書き・縦書きの自動判定、PC 内の文字データの使用、ファイルを書き出さない、時間切れ |
| settings.test.js | — | 設定の選択肢・検証・ファイルから読んだ値の整え方・表記の確認 | 選択肢にない値・余分な項目を断る、壊れた値は既定値、Ctrl・Cmd を必ず含む |
| settingsStore.test.js | — | 設定の保存・読み込みの確認（一時フォルダを使う） | 3項目だけ保存、権限 600、壊れた・大きすぎるファイルでも既定値で動く |
| settingsIpc.test.js | — | 設定の通信の確認（偽のホットキー・自動起動・保存先を使う） | 送信元・内容の検証、失敗したら元に戻す、重ねた保存を断る、preload と一致 |
| clipboardImport.test.js | — | コピーした文章の読み取りの確認（クリップボードを読む関数を差し替える） | 空・長すぎる・読めないときの案内、送信元の検証、preload と一致 |
| desktopIntegration.test.js | — | アイコン・自動起動の中身の確認（一時フォルダ、空白や引用符を含む名前を使う） | 起動用スクリプトを偽の Electron で実際に動かす、plist の検証（Mac は plutil）、利用者のファイルを上書きしない、Windows の引数 |
| site.test.js | `INDEX_HTML`、`STYLES_CSS`、`collectUrlAttributes()` | 案内ページに外部スクリプト・インラインのスタイル・外部の URL がなく、CSP が設定されていることを確かめる（ネットワークには接続しない） | 外部リソースの混入を防ぐ（CLAUDE.md のセキュリティ方針）。参照先のファイルがあるかも確認 |
| fixtures/ | — | app:// のテスト用ファイル（`outside-secret.txt` は配信フォルダの外） | パストラバーサル対策の確認 |
| fixtures/ocr/ | — | OCR のテスト用の架空の画像（横書きのメール 等倍・2倍、チャット、縦書きのお知らせ） | 文字の読み取りの確認 |

## scripts/ocr-diagnose.js（OCR の診断）

2026-10-12：Windows でだけ縦書きのデモ画像が文字化けする件の切り分けのため。読むのは demo/images の架空の画像だけで、引数で画像を受け取らない。

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `PROJECT_DIR` | 定数 | リポジトリのフォルダ | 画像・作業スレッドのスクリプトの場所 |
| `DIAGNOSE_IMAGES` | 定数 | 読む画像と向き（1-mail-ja.png 横書き・3-notice-vertical.png 縦書き） | 架空の画像だけを読む |
| `CORE_VARIANTS` | 定数 | 部品の種類（標準／relaxed SIMD を使わない） | CPU による計算の違いを比べる |
| `ELECTRON_OPTION` | 定数 | `--electron` | 同じ診断を Electron の中で動かす指定 |
| `TEXT_PREVIEW_LENGTH` / `DIAGNOSE_NOW` | 定数 | 読んだ文章を表示する長さ（60文字）／候補を数える基準日時 | 表示を短くし、結果を日によって変えない |
| `describeFile(filePath)` | 関数 | ファイルの大きさと SHA-256 の先頭16文字を返す | PC の間で文字データが同じかを比べる |
| `printEnvironment()` | 関数 | OS・CPU・Node.js・Electron・V8・tesseract.js の版、SIMD・relaxed SIMD の対応、文字データの情報を表示 | 環境の違いを見る |
| `diagnoseOne(target, variant)` | 関数 | 1枚の画像を1つの部品で読み、確信度・時間・読んだ文章の先頭・日時の候補の数を表示 | 結果の比較 |
| `diagnoseAppFunction()` | 関数 | アプリと同じ読み取りの関数（recognizeText。自動・縦書き）で縦書きの画像を読み、結果を表示 | アプリの読み取りの流れでの違いを見る |
| `rerunInElectronIfRequested()` | 関数 | `--electron` のとき、このスクリプトを Electron の中（ELECTRON_RUN_AS_NODE=1）で動かし直す | Electron の新しい V8 での違いを見る |
| `main()` | 関数 | 診断の全体 | 入口 |

## scripts/ocr-diagnose-simd-worker.cjs（診断の作業スレッド）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `RELAXED_SIMD_CORE_PREFIX` | 定数 | `tesseract.js-core/tesseract-core-relaxedsimd` | 差し替える部品の名前 |
| `resolveWithoutRelaxedSimd(request, ...rest)` | 関数 | 部品の名前を解決するときに relaxed SIMD 版を普通の SIMD 版に置き換える | relaxed SIMD を使わずに読ませる |

## scripts/ocr-diagnose-canvas.js（画面での変換の診断）

2026-10-12：Windows でだけ縦書きが文字化けする件で、Node.js・Electron の中の読み取りは正しいと分かったため、残る「画面での変換」を確かめる。見えないウインドウ（中身のない data: のページ）を1つ開くだけで、外部の内容は読み込まない。

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `PROJECT_DIR` / `IMAGE_PATH` / `IMAGE_IMPORT_SOURCE_PATH` | 定数 | リポジトリ／縦書きのデモ画像／アプリの変換の処理のファイル | 読むものを架空の画像に限る。処理を書き写さない |
| `TEXT_PREVIEW_LENGTH` / `DIAGNOSE_NOW` | 定数 | 読んだ文章を表示する長さ／候補を数える基準日時 | 表示を短くし、結果を日によって変えない |
| `convertLikeApp(original)` | 関数 | imageImport.js の処理を見えない画面の中で動かし、変換後の PNG を受け取る | アプリと同じ変換を再現する |
| `comparePixels(before, after)` | 関数 | 変換前後の画素を比べ、違う割合と最大の差を返す | 変換で画像が変わったかを見る |
| `printDisplayAndGpu()` | 関数 | 画面の解像度・拡大率・色の情報と、GPU の使われ方（2D の描画など）を表示する | PC を直接操作したときとリモートデスクトップのときの違いを比べる |
| `printRecognition(label, image)` | 関数 | 画像を自動・縦書きで読み、結果を表示する | 変換の前後で読み取りの結果を比べる |
| `main()` | 関数 | 診断の全体。終わったら Electron を終了する | 入口 |
