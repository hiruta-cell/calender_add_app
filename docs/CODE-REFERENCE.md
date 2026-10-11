# コード リファレンス（変数・定数・関数の一覧）

コードを追加・改名・削除したら、同じ変更の中でこの一覧も更新する（[CLAUDE.md](../CLAUDE.md) 参照）。

- 最終更新：2026-10-11（1日目：日時抽出と確認ウインドウ）
- 「公開」は他のファイルから使えるもの（export）、「内部」はそのファイルの中だけで使うもの

## 全体の構成

| フォルダ・ファイル | 役割 |
|---|---|
| `src/core/` | 日時抽出などの中核ロジック。画面や Electron に依存しない純粋な関数（単体テストの対象） |
| `src/renderer/` | 確認ウインドウの画面（React） |
| `electron/` | Electron のメインプロセス（起動、ウインドウ、セキュリティ設定） |
| `scripts/smoke-test.js` | 実際にアプリを起動して画面を自動操作する確認スクリプト |
| `test/` | 単体テスト（Node.js 標準の `node:test`） |
| `vite.config.js` | 画面のビルド設定（開発用サーバーは使わない） |

## データの形：日時の候補（`extractDateCandidates` が返すもの）

| 項目 | 型 | 内容 |
|---|---|---|
| `id` | 文字列 | 候補の ID（`candidate-0` から順番） |
| `ranges` | `{start, end}` の配列 | 元の文章の中で、この日時が書かれていた位置（色付けに使う。同じ日時が複数回あれば複数） |
| `sourceText` | 文字列 | 元の表記（例：`10月15日(木)14時〜15時`） |
| `hasTime` | 真偽 | 時刻の記載があるか。false なら日付だけ（登録時に終日か時刻指定かを尋ねる） |
| `start` | `{year, month, day, hour, minute}` | 開始日時。`hasTime` が false なら `hour`・`minute` は null |
| `end` | 同上 または null | 終了日時。`hasTime` が false なら null |
| `endInferred` | 真偽 | 終了時刻を既定の長さ（60分）で補ったか |
| `warnings` | 文字列の配列 | 警告コード（`past`：過去の日時） |

---

## src/core/textNormalizer.js（全角→半角）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `FULLWIDTH_ASCII_PATTERN` | 定数（内部） | 全角英数記号（U+FF01〜U+FF5E）に一致する正規表現 | 半角に直す文字を見つける |
| `FULLWIDTH_TO_HALFWIDTH_OFFSET` | 定数（内部） | 全角と半角の文字コードの差（0xFEE0） | 1文字ずつ半角に変換する |
| `IDEOGRAPHIC_SPACE_PATTERN` | 定数（内部） | 全角スペースに一致する正規表現 | 半角スペースに直す |
| `normalizeWidth(text)` | 関数（公開） | 全角英数記号・全角スペースを半角にする。文字数は変えない | 「１０／１５」などの表記ゆれを吸収しつつ、色付けの位置をずらさない |

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
| `addMinutes(dateTime, minutes)` | 関数（公開） | 年月日時分に分を足す | 終了時刻の計算（日付をまたぐ場合も） |
| `getMondayBasedWeekday(date)` | 関数（公開） | 曜日番号（月曜=0〜日曜=6）を返す | 月曜始まりの週の計算、曜日の表示 |
| `compareDates(a, b)` | 関数（公開） | 年月日の前後を比べる | 年の決定、過去の日付の判定 |
| `compareDateTimes(a, b)` | 関数（公開） | 年月日時分の前後を比べる | 過去の日時の判定 |

## src/core/dateExtractor.js（日時の抽出：中心となるファイル）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `DEFAULT_DURATION_MINUTES` | 定数（公開） | 60 | 要件§5.4：終了時刻がない予定の長さ |
| `MAX_DURATION_MINUTES` | 定数（公開） | 1440 | 設定できる予定の長さの上限 |
| `MAX_INPUT_LENGTH` | 定数（公開） | 20000 | 長すぎる入力で処理が重くならないようにする |
| `MAX_CANDIDATES` | 定数（公開） | 30 | 候補で画面やブラウザのタブがあふれないようにする |
| `WARNING_PAST` | 定数（公開） | `'past'` | 「過去の日時」の警告コード |
| `MAX_YEAR_LOOKAHEAD` | 定数（内部） | 4 | 年なしの 2/29 で次のうるう年まで探す |
| `HALF_DAY_MINUTES` | 定数（内部） | 720 | 「11時〜1時」を 13時と解釈する補正 |
| `MERIDIEM_AM` / `MERIDIEM_PM` | 定数（内部） | `'午前'` / `'午後'` | 午前・午後の判定 |
| `HALF_HOUR_MINUTES` | 定数（内部） | 30 | 「14時半」の「半」 |
| `DATE_PATTERN` | 定数（内部） | 日付の書き方の正規表現（10/15、10月15日、2026年10月15日、明日、来週火曜） | 文章から日付を探す。「再来週」「説明日程」は除外 |
| `WEEKDAY_PATTERN` | 定数（内部） | 曜日の表記（(木)、(月・祝)、木曜日） | 日付の後の曜日を読み飛ばす |
| `CONNECTOR_PATTERN` | 定数（内部） | 日付と時刻のつなぎ（空白、の、は、、） | 「明日の14時」を1つの日時として読む |
| `TIME_PATTERN` | 定数（内部） | 時刻の書き方（14:00、14時30分、14時半、午前/午後） | 時刻を読む。「2時間」は除外 |
| `RANGE_SEPARATOR_PATTERN` | 定数（内部） | 範囲の区切り（〜、-、から など） | 開始〜終了の時刻を読む |
| `InputTooLongError` | クラス（公開） | 長すぎる文章のエラー（利用者向けの文付き） | 画面でそのまま表示できるエラーにする |
| `extractDateCandidates(text, options)` | 関数（公開） | 文章から日時の候補を抽出し `{candidates, truncated}` を返す | このアプリの中心機能（要件§5.2〜§5.7、§12） |
| `validateArguments(text, now, minutes)` | 関数（内部） | 引数を検証し、問題があれば例外を投げる | 不正な入力で誤動作しないようにする |
| `matchAt(pattern, text, index)` | 関数（内部） | 正規表現を指定した位置から一致させる | 日付の直後の曜日・時刻を読む |
| `skipPattern(pattern, text, index)` | 関数（内部） | 一致した分だけ読み取り位置を進める | 曜日・つなぎの言葉を読み飛ばす |
| `resolveDate(groups, today)` | 関数（内部） | 一致した書き方に応じて年月日を決める | 書き方ごとの処理の振り分け |
| `resolveCalendarDate(yearText, monthText, dayText, today)` | 関数（内部） | 年月日を決める。年がなければ今日以降で最も近い日 | 要件§12：年なしの日付の扱い |
| `resolveNextWeekWeekday(weekdayCharacter, today)` | 関数（内部） | 「来週◯曜」の年月日を決める | 要件§12：月曜始まりの週 |
| `matchTimeRange(text, index)` | 関数（内部） | 時刻または時刻の範囲を読む | 開始・終了の時刻を得る |
| `parseTime(groups, inheritedMeridiem)` | 関数（内部） | 時刻を24時間制の時・分にする | 午前/午後・半・分の解釈 |
| `applyMeridiem(hour, meridiem)` | 関数（内部） | 午前/午後を反映した「時」を返す | 午前12時→0時、午後3時→15時 |
| `buildCandidate(date, timeRange, current, minutes)` | 関数（内部） | 候補の本体（開始・終了・警告）を作る | 候補の形をそろえる |
| `resolveEnd(start, timeRange, minutes)` | 関数（内部） | 終了日時を決める（省略時は既定の長さ、日またぎも対応） | 要件§5.4 |
| `getCandidateKey(candidate)` | 関数（内部） | 同じ日時を見分けるキーを作る | 重複する候補を1件にまとめる |

## src/core/candidateFormatter.js（表示用の文字列）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `WARNING_MESSAGES` | 定数（公開） | 警告コードと表示文の対応表 | 警告を利用者に分かる文にする |
| `UNKNOWN_WARNING_MESSAGE` | 定数（内部） | 対応表にない警告の表示文 | 想定外の警告でも表示が崩れないようにする |
| `padTwoDigits(value)` | 関数（内部） | 数字を2桁にそろえる | 「09:05」の表示 |
| `formatDateLabel(date)` | 関数（公開） | 「2026年10月15日(木)」の形にする | 候補の表示 |
| `formatTimeLabel(time)` | 関数（公開） | 「14:00」の形にする | 候補の表示 |
| `formatCandidateLabel(candidate)` | 関数（公開） | 候補を1行の文字列にする（日またぎは終了側にも日付） | 候補の一覧の表示 |
| `describeWarning(warningCode)` | 関数（公開） | 警告コードを表示文にする | 警告バッジの表示 |

## src/core/highlight.js（色付け）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `splitTextByRanges(text, ranges)` | 関数（公開） | 文章を「通常の部分」と「強調する部分」に分ける（重なりはまとめる） | 日時部分の色付け。HTML として扱わないので安全 |

---

## src/renderer/（画面）

### main.jsx

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| （起点の処理） | 処理 | `App` を `ErrorBoundary` で包んで描画する | 画面の起動と、表示中のエラーの受け止め |

### App.jsx

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `UNEXPECTED_ERROR_MESSAGE` | 定数 | 予期しないエラーの表示文 | 文章の内容を含めずにエラーを知らせる |
| `App` | コンポーネント | 確認ウインドウ全体 | 貼り付け→抽出→候補表示の流れを管理 |
| `inputText` | 状態 | 入力欄の文章 | 抽出の対象 |
| `extraction` | 状態 | 抽出結果（抽出時の文章・候補・省略の有無）。未抽出なら null | 候補と色付けの表示 |
| `selectedIds` | 状態 | チェックを付けた候補の ID の集合 | 要件§5.3：登録する候補を選ぶ |
| `errorMessage` | 状態 | 画面上部に表示するエラーの文 | 要件§5.9：エラーの内容を表示 |
| `isNoDateDialogOpen` | 状態 | 「日時の情報がありません」の表示中か | 要件§5.8 |
| `highlightRanges` | 計算値 | すべての候補の位置をまとめたもの | 色付けに渡す |
| `isInputChangedAfterExtraction` | 計算値 | 抽出後に文章が書き換えられたか | 再抽出を促すお知らせの表示 |
| `handleExtract()` | 関数 | 抽出し、候補がなければポップアップ、エラーなら待機状態に戻す | 「日時を抽出」ボタン |
| `handleClear()` | 関数 | 入力・結果・エラーを消して最初の状態に戻す | 「クリア」ボタン |
| `handleToggleCandidate(candidateId)` | 関数 | 候補のチェックを切り替える | 候補の選択 |

### components/

| ファイル | 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|---|
| TextInputPanel.jsx | `numberFormatter` | 定数 | 数字の書式（20,000） | 文字数の表示 |
| TextInputPanel.jsx | `TextInputPanel` | コンポーネント | 入力欄、文字数、「クリア」「日時を抽出」ボタン | 文章の貼り付け |
| TextInputPanel.jsx | `isTooLong` / `isEmpty` | 計算値 | 文字数超過か／空か | 文字数の警告色、ボタンの無効化 |
| TextInputPanel.jsx | `handleKeyDown(event)` | 関数 | Ctrl+Enter（Mac は Command+Enter）で抽出 | キーボードだけで操作できるようにする |
| HighlightedText.jsx | `HighlightedText` | コンポーネント | 文章を表示し、日時部分を `<mark>` で色付け | 要件§6.1：日時部分の色付け |
| HighlightedText.jsx | `segments` | 計算値 | `splitTextByRanges` の結果 | 描画する部分の一覧 |
| CandidateList.jsx | `CandidateList` | コンポーネント | 候補をチェックボックス付きで一覧表示（警告・補足のバッジ付き） | 要件§5.3：候補の選択 |
| NoDateDialog.jsx | `SUPPORTED_FORMAT_EXAMPLES` | 定数 | 対応している書き方の例 | 利用者が書き方を確かめられるようにする |
| NoDateDialog.jsx | `NoDateDialog` | コンポーネント | 「日時の情報がありません」のポップアップ（HTML 標準の `<dialog>`） | 要件§5.8 |
| NoDateDialog.jsx | `dialogRef` | 参照 | `<dialog>` 要素 | 開閉（`showModal` / `close`）を呼ぶ |
| ErrorBanner.jsx | `ErrorBanner` | コンポーネント | エラーの文と「閉じる」ボタン | 要件§5.9：エラーの内容を表示 |
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
| `APP_SCHEME_PRIVILEGES` | 定数（公開） | `{standard: true, secure: true}` だけ | 必要最小限の特権（CSP の回避などは与えない） |
| `CONTENT_SECURITY_POLICY` | 定数（公開） | 自分自身のファイル以外の読み込み・通信・インラインスクリプトを禁止する設定 | 画面への不正なコードの混入を防ぐ |
| `CONTENT_TYPES` / `DEFAULT_CONTENT_TYPE` | 定数（内部） | 拡張子と Content-Type の対応 | 正しい形式で配信し、中身を推測させない |
| `INDEX_FILE_NAME` | 定数（内部） | `'index.html'` | パスの指定がないときのファイル |
| `isAppUrl(url)` | 関数（公開） | app://bundle の URL か判定 | 外部ページへの移動を防ぐ |
| `resolveAssetPath(requestUrl, rootDir)` | 関数（公開） | URL を配信フォルダ内のファイルパスに変換（外を指すものは null） | パストラバーサル対策 |
| `getContentType(filePath)` | 関数（公開） | 拡張子から Content-Type を決める | 正しい形式での配信 |
| `createEmptyResponse(status)` | 関数（内部） | 本文のないエラー応答を作る | 404 などの応答 |
| `handleAppRequest(request, rootDir)` | 関数（公開） | app:// の要求にファイルの内容で応答（CSP などのヘッダー付き） | `protocol.handle` に渡す処理 |

### security.js（セキュリティ設定）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `SECURE_WEB_PREFERENCES` | 定数（公開） | 隔離・サンドボックス有効、Node.js 機能・webview・スペルチェック無効など | 画面から PC の機能を使えないようにする |
| `BLOCKED_URL_PATTERNS` | 定数（公開） | http / https / ws / wss | 画面からの外部通信をすべて遮断する範囲 |
| `applySessionSecurity(session)` | 関数（公開） | 権限要求をすべて拒否、外部通信を遮断、スペルチェック無効 | 要件§5.2：文面を外部に送らない |
| `hardenWebContents(contents)` | 関数（公開） | 新しいウインドウ・外部への移動・webview を拒否 | 画面の乗っ取りを防ぐ |
| `preventExternalNavigation(event, deprecatedUrl)` | 関数（内部） | 移動先が app://bundle でなければ取り消す | 外部ページへの移動の防止 |

### main.js（起動とウインドウ）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `ELECTRON_DIR` | 定数 | electron/ フォルダのパス | 画面ファイルの場所を求める |
| `RENDERER_DIST_DIR` | 定数 | dist/renderer のパス | app:// で配信してよいフォルダ |
| `MAIN_WINDOW_SIZE` | 定数 | ウインドウの大きさ（1120×760、最小 820×560） | 確認ウインドウの表示 |
| `mainWindow` | 変数 | 確認ウインドウ（なければ null） | 前面に出す・作り直す |
| `createMainWindow()` | 関数 | 安全な設定でウインドウを作り、画面を読み込む | 確認ウインドウの表示 |
| `focusMainWindow()` | 関数 | 2つ目の起動時に既存のウインドウを前面に出す | 多重起動の防止 |
| `startApp()` | 関数 | 画面ファイルの確認、セキュリティ設定、app:// の登録、ウインドウ作成 | 起動処理 |

---

## scripts/smoke-test.js（実機の自動確認）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `PROJECT_DIR` | 定数 | プロジェクトのフォルダ | アプリの起動 |
| `OVERALL_TIMEOUT_MS` / `POLL_INTERVAL_MS` / `UI_SETTLE_MS` | 定数 | 制限時間 60秒 / 確認間隔 / 画面の更新待ち | 確認が固まらないようにする |
| `DEMO_TEXT` / `NO_DATE_TEXT` | 定数 | 架空のデモ文面（日時3つ）／日時のない文面 | 画面操作の入力 |
| `results` / `unexpectedErrors` / `isExpectingErrors` | 変数 | 確認結果／画面のエラー／意図的なエラーを数えない期間か | 合否の判定 |
| `record(name, passed, detail)` | 関数 | 確認結果を記録・表示 | 結果の一覧 |
| `sleep(milliseconds)` | 関数 | 指定時間待つ | 画面の更新待ち |
| `DevToolsConnection` | クラス | DevTools への接続（`open` / `send` / `handleMessage` / `evaluate` / `close`） | 画面を外から操作する |
| `launchApp()` | 関数 | 確認用の接続口付きで Electron を起動 | アプリの起動 |
| `connectToMainWindow(port)` | 関数 | 確認ウインドウに接続 | 操作対象の取得 |
| `waitFor(connection, expression)` | 関数 | 条件が満たされるまで待つ | 画面の準備待ち |
| `replaceInputText(connection, text)` | 関数 | 入力欄の文章を入れ替える | 貼り付けの再現 |
| `clickButton(connection, label)` | 関数 | 文字が一致するボタンを押す | ボタン操作の再現 |
| `saveScreenshot(connection, directory, fileName)` | 関数 | 画面の画像を保存 | 見た目の確認 |
| `checkFeatures(connection, screenshotDir)` | 関数 | 抽出・候補・チェック・ポップアップ・エラー表示を確認 | 機能の確認 |
| `checkSecurity(connection)` | 関数 | Node.js 機能・外部通信・インラインスクリプト・新規ウインドウ・外部移動の遮断を確認 | セキュリティの実地確認 |
| `main()` | 関数 | 確認全体を実行し、終了コードを返す | 確認の実行 |
| `timeout` | 変数 | 制限時間のタイマー | 時間切れで失敗終了する |

## test/（単体テスト）

| ファイル | 主な名前 | 機能 | 目的 |
|---|---|---|---|
| dateExtractor.test.js | `NOW`、`extract()`、`extractSingle()`、`dateTime()` | 基準日時を 2026-10-11(日) 10:00 に固定して抽出を確かめる | 要件の書き方・年の決定・誤認防止・処理時間 |
| dateUtils.test.js | — | 日付計算と全角→半角の確認 | 繰り上がり・曜日・東京時間 |
| display.test.js | `NOW`、`firstCandidate()` | 表示文字列と色付けの分割の確認 | 表示の正しさ、HTML を解釈しないこと |
| electronSecurity.test.js | `FIXTURE_ROOT`、`isInsideRoot()`、`createFakeSession()`、`createFakeContents()`、`createFakeEvent()` | セキュリティ設定と app:// の配信を偽物のオブジェクトで確認 | 設定を誤って緩めたら失敗させる |
| fixtures/ | — | app:// のテスト用ファイル（`outside-secret.txt` は配信フォルダの外） | パストラバーサル対策の確認 |
