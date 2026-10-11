# コード リファレンス（変数・定数・関数の一覧）

コードを追加・改名・削除したら、同じ変更の中でこの一覧も更新する（[CLAUDE.md](../CLAUDE.md) 参照）。

- 最終更新：2026-10-11（3日目：常駐・ホットキー・範囲キャプチャ・OCR・手入力の改善）
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
| `assets/icons/` | タスクトレイ（Mac はメニューバー）のアイコン（コードで描いたもの） |
| `demo/images/` | 読み取りテストと発表のデモに使う架空の文面の画像（日本語のメール・チャット・縦書き・英語のメール、SNS 風の告知・写真の上の文字・傾いた紙の連絡状・ライブ告知） |
| `test/` | 単体テスト（Node.js 標準の `node:test`） |
| `test/fixtures/` | テスト用の小さなファイル（app:// の配信テスト、OCR のテスト用の架空の画像） |
| `docs/` | 説明ファイル（このファイル、受け入れ基準） |
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
| `src/core/candidateFormatter.js` | 候補を「2026年10月15日(木) 14:00〜15:00」のような表示用の文字列にする |
| `src/core/highlight.js` | 文章の日時部分を色付けするために、文章を分割する |
| `src/core/detailExtractor.js` | 文章から件名・場所・オンライン会議の URL を取り出して下書きにする |
| `src/core/calendarUrl.js` | Googleカレンダーの予定作成画面と「その日の表示」の URL を組み立て、内容と URL を検証する |
| `src/core/registration.js` | 選んだ候補と入力欄の内容から、登録する予定の一覧を作る（終日／時刻指定、手入力の候補も） |
| `src/core/ocrText.js` | OCR の結果の文章を整える（日本語の文字の間の余分な空白を除く） |
| `src/renderer/index.html` | 確認ウインドウの土台となる HTML |
| `src/renderer/overlay.html` / `overlay.js` / `overlay.css` | 範囲選択の画面（撮影した画面を暗く表示し、ドラッグで範囲を選ぶ。Esc・右クリックで中止） |
| `src/renderer/main.jsx` | 画面の起点。App を描画し、エラーを受け止める枠で包む |
| `src/renderer/App.jsx` | 確認ウインドウ全体。貼り付け→抽出・下書き→候補の選択・追記→登録の流れを管理する |
| `src/renderer/styles.css` | 画面の見た目（ダークモード対応） |
| `src/renderer/imageImport.js` | 貼り付け・ドラッグ＆ドロップした画像を PNG にそろえる（写真の向きの補正・大きすぎる写真の縮小） |
| `src/renderer/components/TextInputPanel.jsx` | 文章の入力欄と「日時を抽出」「クリア」ボタン |
| `src/renderer/components/HighlightedText.jsx` | 抽出に使った文章を、日時部分を色付けして表示する |
| `src/renderer/components/CandidateList.jsx` | 日時の候補をチェックボックス付きで一覧表示する |
| `src/renderer/components/TimeChoiceFields.jsx` | 日付だけの候補で「終日／時刻を指定」を選ぶ欄 |
| `src/renderer/components/ManualDateForm.jsx` | 日時を手入力して候補に追加する欄 |
| `src/renderer/components/EventDetailsForm.jsx` | 件名・場所・オンライン会議 URL・メモの入力欄 |
| `src/renderer/components/RegisterSection.jsx` | 「Googleカレンダーで開く」ボタンと登録の確認（右の欄の下端に固定） |
| `src/renderer/components/RegistrationChecklist.jsx` | 開いた予定の一覧（「保存した」のチェック、「カレンダーで確認」ボタン） |
| `src/renderer/components/NoDateDialog.jsx` | 「日時の情報がありません」のポップアップ（その場で日付・時刻を手入力して「追加する」） |
| `src/renderer/components/CaptureImagePanel.jsx` | 取り込んだ画像・読み取りの状態・「横書き／縦書きで読み直す」 |
| `src/renderer/components/ErrorBanner.jsx` | エラーの内容を画面上部に表示する |
| `src/renderer/components/ErrorBoundary.jsx` | 画面の表示中のエラーを受け止め、最初の画面に戻れるようにする |
| `electron/main.js` | アプリの起動、確認ウインドウ、常駐（トレイ）、ホットキー、多重起動の防止、画面との通信の受け付けの登録 |
| `electron/tray.js` | タスクトレイ（Mac はメニューバー）のアイコンとメニュー |
| `electron/captureController.js` | 範囲キャプチャから OCR までの流れ（撮影・範囲選択・切り出し・拡大・OCR・失敗時の後始末） |
| `electron/captureGeometry.js` | 範囲選択の座標の検証と、画面の座標から画像の画素への変換 |
| `electron/captureImageStore.js` | 取り込んだ画像をメモリの中だけで持つ（app://bundle/capture/〜 で表示） |
| `electron/captureIpc.js` | 範囲キャプチャの通信の受け付け（送信元・読み直しの向きの検証） |
| `electron/overlayPreload.cjs` | 範囲選択の画面に「選んだ範囲を送る」「中止する」の2つだけを公開する |
| `electron/screenPermission.js` | Mac の画面収録の許可がないとき、起動元のアプリ（ターミナル・VSCode など）の名前を入れて案内する |
| `electron/preload.cjs` | 確認ウインドウに、登録・確認・範囲キャプチャに必要な関数だけを公開する |
| `electron/calendarIpc.js` | 画面からの登録要求・確認の要求を検証し、予定作成画面・その日の表示を既定のブラウザで開く |
| `electron/ocrEngine.js` | 画像から文字を読み取る（Tesseract.js。横書き・縦書き、PC 内の文字データだけを使う） |
| `electron/appProtocol.js` | 画面ファイルを app:// で配信し、CSP を付ける（配信フォルダの外は読ませない） |
| `electron/security.js` | セキュリティ設定（隔離、外部通信の遮断、権限要求の拒否、外部への移動の禁止） |
| `scripts/smoke-test.js` | アプリを実際に起動し、画面を自動操作して機能とセキュリティを確認する |
| `scripts/generate-ocr-fixtures.js` | OCR のテスト用の画像（架空の文章）を作る（開発者が一度だけ実行） |
| `scripts/generate-icons.js` | トレイのアイコンをコードで描いて作る（開発者がアイコンを作り直すときだけ実行） |
| `scripts/generate-demo-images.js` | デモ用の架空の文面の画像を作る（開発者がデモ画像を作り直すときだけ実行） |
| `test/*.test.js` | 各ファイルの単体テスト（詳しくは末尾の「test/」の表） |
| `README.md` | 利用者向けの説明（起動手順、使い方、対応する書き方） |
| `CLAUDE.md` | 開発のルール（セキュリティ方針、コーディング規約など） |
| `requirements-memo.md` | 要件の一次資料（決定事項と追加決定事項 §12） |
| `SECURITY.md` | 脆弱性の報告方法 |
| `LICENSE` | ライセンス（MIT） |
| `docs/CODE-REFERENCE.md` | このファイル。フォルダ・ファイル・変数・関数の説明 |
| `docs/ACCEPTANCE.md` | ゴール（受け入れ基準）と確認の記録 |
| `docs/WINDOWS-CHECK.md` | Windows での起動確認の手順（依頼者が実施） |

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

## データの形：予定（登録のとき画面からメインプロセスへ渡すもの）

| 項目 | 型 | 内容 |
|---|---|---|
| `title` | 文字列 | 件名（最大120文字） |
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
| `addMinutes(dateTime, minutes)` | 関数（公開） | 年月日時分に分を足す | 終了時刻の計算（日付をまたぐ場合も） |
| `getMondayBasedWeekday(date)` | 関数（公開） | 曜日番号（月曜=0〜日曜=6）を返す | 月曜始まりの週の計算、曜日の表示 |
| `compareDates(a, b)` | 関数（公開） | 年月日の前後を比べる | 年の決定、過去の日付の判定 |
| `compareDateTimes(a, b)` | 関数（公開） | 年月日時分の前後を比べる | 過去の日時の判定 |
| `MILLISECONDS_PER_MINUTE` | 定数（内部） | 60000 | 分の計算 |
| `diffMinutes(from, to)` | 関数（公開） | 2つの日時の差を分で返す | 予定の長さの確認（登録時） |

## src/core/dateExtractor.js（日時の抽出：中心となるファイル）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `DEFAULT_DURATION_MINUTES` | 定数（公開） | 60 | 要件§5.4：終了時刻がない予定の長さ |
| `MAX_DURATION_MINUTES` | 定数（公開） | 1440 | 設定できる予定の長さの上限 |
| `MAX_INPUT_LENGTH` | 定数（公開） | 20000 | 長すぎる入力で処理が重くならないようにする |
| `MAX_CANDIDATES` | 定数（公開） | 30 | 候補で画面やブラウザのタブがあふれないようにする |
| `WARNING_PAST` | 定数（公開） | `'past'` | 「過去の日時」の警告コード |
| `WARNING_AMBIGUOUS_ORDER` | 定数（公開） | `'ambiguousOrder'` | 月と日の順番が決まらない英語の数字の日付を月/日として読んだ警告 |
| `TWO_DIGIT_YEAR_BASE` | 定数（内部） | 2000 | 2桁の年（26.10.15）を 2026 年にする |
| `MONTHS_PER_YEAR` | 定数（内部） | 12 | 月と日の順番の判定 |
| `ENGLISH_MONTH_NUMBERS` / `ENGLISH_MONTH_PATTERN` | 定数（内部） | 英語の月名と数字の対応／月名の正規表現の部品 | 英語の日付を読む |
| `MAX_YEAR_LOOKAHEAD` | 定数（内部） | 4 | 年なしの 2/29 で次のうるう年まで探す |
| `HALF_DAY_MINUTES` | 定数（内部） | 720 | 「11時〜1時」を 13時と解釈する補正 |
| `MERIDIEM_AM` / `MERIDIEM_PM` | 定数（内部） | `'午前'` / `'午後'` | 午前・午後の判定 |
| `HALF_HOUR_MINUTES` | 定数（内部） | 30 | 「14時半」の「半」 |
| `DATE_PATTERN` | 定数（内部） | 日付の書き方の正規表現（10/15、10月15日、2026年10月15日、十月十五日、2026/10/15、26.10.15、10/15/2026、October 15, 2026、15 Oct、明日、tomorrow、来週火曜） | 文章から日付を探す。「再来週」「説明日程」は除外 |
| `WEEKDAY_PATTERN` | 定数（内部） | 曜日の表記（(木)、(月・祝)、木曜日、(Thu)） | 日付の後の曜日を読み飛ばす |
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
| `validateArguments(text, now, minutes)` | 関数（内部） | 引数を検証し、問題があれば例外を投げる | 不正な入力で誤動作しないようにする |
| `matchAt(pattern, text, index)` | 関数（内部） | 正規表現を指定した位置から一致させる | 日付の直後の曜日・時刻を読む |
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
| `buildCandidate(date, timeRange, current, minutes, dateWarnings)` | 関数（内部） | 候補の本体（開始・終了・警告）を作る | 候補の形をそろえる |
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
| `formatEventLabel(event)` | 関数（公開） | 登録した予定の日時を1行にする（終日は「終日」） | 登録の確認の一覧の表示 |

## src/core/highlight.js（色付け）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `splitTextByRanges(text, ranges)` | 関数（公開） | 文章を「通常の部分」と「強調する部分」に分ける（重なりはまとめる） | 日時部分の色付け。HTML として扱わないので安全 |

---

## src/core/detailExtractor.js（件名・場所・URL の下書き）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `TITLE_LABELS` | 定数（内部） | 件名のラベル（件名、題名、タイトル、会議名、イベント名、Subject、Title） | 件名の行を見つける |
| `LOCATION_LABELS` | 定数（内部） | 場所のラベル（開催場所、集合場所、開催地、場所、会場、Location、Place、Venue） | 場所の行を見つける。署名に多い「住所」は含めない |
| `MEETING_HOSTS` | 定数（内部） | 会議サービスのホスト（zoom.us、meet.google.com、teams.microsoft.com など） | 会議 URL を優先する |
| `NEXT_LINE_LOOKAHEAD` | 定数（内部） | 2 | 「■会場」の次の行の値を探す行数 |
| `REPLY_PREFIX_PATTERN` | 定数（内部） | Re: Fw: Fwd: 返信: 転送: | 件名から返信・転送の印を除く |
| `HTTPS_URL_PATTERN` | 定数（内部） | https の URL（半角の URL 文字だけ） | 日本語の手前で URL を止める |
| `LEADING_SEPARATOR_PATTERN` | 定数（内部） | 値の先頭の「・」「：」「_」「|」と空白 | OCR で「場所:・オンライン」となった場合の「・」を除く |
| `TRAILING_PUNCTUATION` | 定数（内部） | URL の末尾から除く記号 | 「…/1.」の「.」などを除く |
| `TITLE_LINE_PATTERN` / `LOCATION_LINE_PATTERN` | 定数（内部） | ラベルの行に一致する正規表現 | 件名・場所の行を見つける |
| `buildLabelPattern(labels)` | 関数（内部） | ラベルの一覧から行の正規表現を作る | 「件名：」「【件名】」「■件名」などに対応 |
| `extractEventDetails(text)` | 関数（公開） | 件名・場所・会議 URL を取り出す | 入力欄の下書き（要件§12） |
| `findLabeledValue(lines, pattern)` | 関数（内部） | ラベルの行の値（なければ次の行）を返す | 件名・場所の取り出し |
| `isAnyLabelLine(line)` | 関数（内部） | 件名・場所のラベルの行か | 次の行を値とみなしてよいかの判定 |
| `findMeetingUrl(text)` | 関数（内部） | 会議サービスの URL、なければ最初の https の URL を選ぶ | 会議 URL の取り出し |
| `parseMeetingUrl(text)` | 関数（公開） | URL を検証し、会議サービスかを判定する（xn-- の形に直す） | なりすまし URL・https 以外を弾く。入力欄の検証にも使う |
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
| `DAY_VIEW_BASE_URL` / `DAY_VIEW_PATH_PATTERN` | 定数（内部） | その日の表示の URL の先頭／パスの形（/calendar/r/day/年/月/日） | 登録の確認用の URL の許可リスト |
| `MAX_TITLE_LENGTH` | 定数（公開） | 120 | 件名の上限 |
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
| `buildDayViewUrl(date)` | 関数（公開） | その日の Googleカレンダーの表示の URL を作る | 「カレンダーで確認」（要件§12） |
| `isAllowedDayViewUrl(url)` | 関数（公開） | 開いてよい「その日の表示」の URL か（クエリ・フラグメントなし） | 許可リスト方式 |

## src/core/registration.js（登録内容の組み立て）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `TIME_MODE_ALL_DAY` / `TIME_MODE_SPECIFIED` | 定数（公開） | 'allDay' ／ 'specified' | 日付だけの候補の時刻の扱い |
| `DEFAULT_TIME_CHOICE` | 定数（公開） | 終日、時刻は空 | 要件§5.10：既定は終日 |
| `SOURCE_TEXT_EXCERPT_LENGTH` | 定数（公開） | 500 | メモに入れる元の文章の抜粋の長さ |
| `MEETING_URL_HEADING` / `SOURCE_TEXT_HEADING` / `OMISSION_MARK` | 定数（内部） | メモの見出しと省略の印 | メモの書式 |
| `TIME_INPUT_PATTERN` / `DATE_INPUT_PATTERN` | 定数（内部） | HH:MM ／ YYYY-MM-DD | 入力欄の値の形式 |
| `MANUAL_ID_PREFIX` | 定数（内部） | 'manual-' | 手入力の候補の ID が重ならないようにする |
| `parseTimeInput(value)` / `parseDateInput(value)` | 関数（公開） | 時刻・日付の入力欄の値を数値にする | 手入力・時刻指定 |
| `createManualCandidate(date, sequence, now)` | 関数（公開） | 手入力した日付から候補を作る（過去なら警告） | 要件§5.8 |
| `composeEventTexts(details, sourceText)` | 関数（公開） | 件名・場所・メモの文字列を作る（会議 URL の振り分け、元の文章の抜粋） | 要件§12・§6.2 |
| `buildCalendarEvents(input)` | 関数（公開） | 選んだ候補から予定の一覧とエラーを作る | 登録ボタンの処理 |
| `resolveSpecifiedTime(date, choice, minutes)` | 関数（内部） | 日付だけの候補に指定の時刻を当てはめる | 時刻指定（終了が空なら既定の長さ） |
| `excerpt(text, maxLength)` | 関数（内部） | 最大文字数までにし、省略の印を付ける | メモが長くなりすぎないようにする |

## src/core/ocrText.js（OCR の結果の整形）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `JAPANESE_CHARACTER` | 定数（内部） | 日本語の文字（漢字・かな・全角記号など）の正規表現の部品 | 余分な空白の判定 |
| `SPACE_AFTER_JAPANESE_PATTERN` / `SPACE_BEFORE_JAPANESE_PATTERN` | 定数（内部） | 日本語の文字の後ろ／前の空白 | 「10 月 15 日」の空白を除く |
| `SPACED_NUMBER_SEPARATOR_PATTERN` | 定数（内部） | 数字の間の「:」「/」の前後の空白 | 「14 : 00」を「14:00」にする |
| `EXCESS_BLANK_LINES_PATTERN` | 定数（内部） | 3行以上続く空行 | 空行を詰める |
| `cleanOcrText(text)` | 関数（公開） | OCR の結果を整える | 日時の抽出で読める形にする |

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
| `timeChoices` | 状態 | 日付だけの候補の時刻の扱い（候補の ID → 選択） | 要件§5.10 |
| `eventDetails` | 状態 | 件名・場所・会議 URL・メモ・元の文章を入れるか | 予定の内容 |
| `errorMessage` | 状態 | 画面上部に表示するエラーの文 | 要件§5.9：エラーの内容を表示 |
| `errorAction` | 状態 | エラーの帯に出す追加の操作（対象のエラーの文が表示されている間だけ有効） | 「システム設定を開く」ボタン |
| `isNoDateDialogOpen` | 状態 | 「日時の情報がありません」の表示中か | 要件§5.8 |
| `isRegistering` | 状態 | ブラウザで開く処理の途中か | 二度押しを防ぐ |
| `openedEvents` | 状態 | 予定作成画面を開いた予定（{id, label, title, date, saved}） | 登録の確認の一覧（要件§12） |
| `capture` | 状態 | 範囲キャプチャの状態（EMPTY_CAPTURE の形） | 読み取り中の表示、取り込んだ画像、精度の案内 |
| `hotkeyLabel` | 状態 | ホットキーの表記 | ボタンに表示する |
| `captureStatusHandlerRef` | 参照 | 読み取り結果を受け取る最新の処理 | 起動時に1回だけ登録しても最新の処理を呼ぶ |
| `allCandidates` | 計算値 | 抽出した候補と手入力の候補 | 候補の一覧・登録に使う |
| `highlightRanges` | 計算値 | すべての候補の位置をまとめたもの | 色付けに渡す |
| `isInputChangedAfterExtraction` | 計算値 | 抽出後に文章が書き換えられたか | 再抽出を促すお知らせの表示 |
| `handleExtract()` | 関数 | 入力欄の文章で extractFromText を呼ぶ | 「日時を抽出」ボタン |
| `extractFromText(text)` | 関数 | 抽出・下書きを行い、候補がなければポップアップ、エラーなら待機状態に戻す | 貼り付け・OCR の両方で使う |
| `handleCaptureStatus(status)` | 関数 | 読み取り中・結果（文章を入れて抽出）・エラー・中止・画像の消去を画面に反映 | 範囲キャプチャの結果の表示 |
| `handleOpenScreenSettings()` | 関数 | Mac の画面収録の設定画面を開いてもらう | 「システム設定を開く」 |
| （画像の貼り付け・ドロップの受け付け） | 処理 | 画像の貼り付け（文章の貼り付けは邪魔しない）・ドロップを受け、PNG にそろえて読み取ってもらう | 画像の取り込み（要件§12） |
| `handleStartCapture()` / `handleRereadCapture(orientation)` | 関数 | 範囲キャプチャを始めてもらう／向きを指定して読み直してもらう | 「画面から読み取る」「横書き／縦書きで読み直す」 |
| `resetResults()` | 関数 | 抽出結果・選択・入力欄を初期状態に戻す | エラー時・クリア時の後始末 |
| `handleClear()` | 関数 | 入力・結果・エラーを消して最初の状態に戻す | 「クリア」ボタン |
| `handleToggleCandidate(candidateId)` | 関数 | 候補のチェックを切り替える | 候補の選択 |
| `handleTimeChoiceChange(candidateId, changes)` | 関数 | 終日／時刻指定・時刻を変える | 要件§5.10 |
| `handleAddManualDate(date, startTime, endTime)` | 関数 | 手入力した日付（と時刻）を候補に加えてチェックを付ける。時刻があれば「時刻を指定」 | 要件§5.8 |
| `handleAddFromDialog(entry)` | 関数 | ポップアップで入れた日時を候補に加える | 手入力（依頼者の指摘で、ポップアップの中で完結する形に改善） |
| `handleDetailChange(field, value)` | 関数 | 予定の内容の入力欄を変える | 追記（要件§5.5） |
| `handleRegister()` | 関数 | 内容を確かめ、メインプロセスに予定作成画面を開いてもらい、登録の確認の一覧を作る | 登録ボタン（要件§5.6） |
| `handleToggleSaved(openedEventId)` | 関数 | 「保存した」を切り替える | 登録の確認 |
| `handleOpenDay(date)` | 関数 | その日の Googleカレンダーの表示を開いてもらう | 「カレンダーで確認」 |

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
| CandidateList.jsx | `CandidateList` | コンポーネント | 候補をチェックボックス付きで一覧表示（警告・補足のバッジ付き）。日付だけの候補は選ぶと時刻の扱いを表示 | 要件§5.3・§5.10 |
| TimeChoiceFields.jsx | `TimeChoiceFields` | コンポーネント | 「終日／時刻を指定」と開始・終了時刻の入力欄 | 要件§5.10 |
| TimeChoiceFields.jsx | `groupName` | 計算値 | ラジオボタンのグループ名（候補ごと） | 候補ごとに選択を分ける |
| ManualDateForm.jsx | `ManualDateForm` | コンポーネント | 日付欄と「追加」ボタン、次にすることの説明 | 要件§5.8：手入力 |
| ManualDateForm.jsx | `dateValue` / `date` / `handleAdd()` | 状態・計算値・関数 | 日付欄の値／読み取った日付／候補に追加 | 手入力の候補の追加 |
| EventDetailsForm.jsx | `EventDetailsForm` | コンポーネント | 件名・場所・会議 URL・メモ・「元の文章をメモに入れる」 | 要件§5.5・§6.2・§12 |
| EventDetailsForm.jsx | `meetingUrlText` / `meeting` | 計算値 | 入力された会議 URL／検証結果 | 不正な URL・会議サービス以外の URL を知らせる |
| RegisterSection.jsx | `RegisterSection` | コンポーネント | 登録ボタンと登録の確認。右の欄の下端に固定し、スクロールしなくても押せる | 要件§5.6・使いやすさ（依頼者の指摘） |
| RegistrationChecklist.jsx | `RegistrationChecklist` | コンポーネント | 開いた予定の一覧。「保存した」のチェックと「カレンダーで確認」ボタン。全件保存で完了を知らせる | 要件§12：登録の確認 |
| RegistrationChecklist.jsx | `totalCount` / `savedCount` / `isAllSaved` | 計算値 | 開いた件数／保存した件数／全件保存したか | 保存し忘れが分かるようにする |
| NoDateDialog.jsx | `SUPPORTED_FORMAT_EXAMPLES` | 定数 | 対応している書き方の例 | 利用者が書き方を確かめられるようにする |
| NoDateDialog.jsx | `NoDateDialog` | コンポーネント | 「日時の情報がありません」のポップアップ。日付（必須）・開始／終了時刻（任意）を入れて「追加する」 | 要件§5.8 |
| NoDateDialog.jsx | `dateValue` / `startTimeValue` / `endTimeValue` | 状態 | ポップアップの入力欄の値 | 手入力 |
| NoDateDialog.jsx | `isEndBeforeStart` / `canAdd` / `handleAdd()` | 計算値・関数 | 終了が開始以前か／追加できるか／候補に加えて閉じる | 入力の誤りをその場で知らせる |
| CaptureImagePanel.jsx | `ORIENTATION_LABELS` | 定数 | 向きの表示名（横書き・縦書き） | 読み取った向きの表示 |
| CaptureImagePanel.jsx | `CaptureImagePanel` | コンポーネント | 取り込んだ画像、読み取り中、向きと確信度、精度が低い・読めないときの案内、読み直しのボタン | 要件§6.1・§12 |
| NoDateDialog.jsx | `dialogRef` | 参照 | `<dialog>` 要素 | 開閉（`showModal` / `close`）を呼ぶ |
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
| `OPEN_CALENDAR_DAY_CHANNEL` | 定数（公開） | 'calendar:open-day' | 「カレンダーで確認」の要求のチャンネル名 |
| `OPEN_INTERVAL_MS` | 定数（公開） | 800 | 複数の予定を開くときの間隔 |
| `MAX_EVENTS_PER_REQUEST` | 定数（公開） | 30 | 1回の要求で開ける予定の上限 |
| `UNTRUSTED_SENDER_MESSAGE` / `BUSY_MESSAGE` / `UNEXPECTED_ERROR_MESSAGE` | 定数（内部） | 断るときの表示文 | 内容を含めずに知らせる |
| `wait(milliseconds)` | 関数（内部） | 指定時間待つ | 開く間隔 |
| `buildCalendarUrls(rawEvents)` | 関数（公開） | 予定の一覧を検証し、許可リストを通った URL の一覧を作る | URL は画面から受け取らず、ここで作る |
| `createOpenCalendarEventsHandler(dependencies)` | 関数（公開） | 送信元・引数を検証し、URL を順に開く処理を作る（二度押しは断る） | ipcMain.handle に渡す |
| `createOpenCalendarDayHandler(dependencies)` | 関数（公開） | 送信元・日付を検証し、その日の表示を開く処理を作る（URL はここで作る） | 「カレンダーで確認」 |

### preload.cjs（画面に公開する関数）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `OPEN_CALENDAR_EVENTS_CHANNEL` | 定数 | 'calendar:open-events' | 登録要求のチャンネル名 |
| `OPEN_CALENDAR_DAY_CHANNEL` | 定数 | 'calendar:open-day' | 「カレンダーで確認」のチャンネル名 |
| `window.calendarApp.openCalendarEvents(events)` | 関数（画面に公開） | 予定の一覧をメインプロセスに渡す | 登録。ipcRenderer そのものは公開しない |
| `window.calendarApp.openCalendarDay(date)` | 関数（画面に公開） | 確認する日付をメインプロセスに渡す | 「カレンダーで確認」 |
| `CAPTURE_START_CHANNEL` などのチャンネル名 | 定数 | captureIpc.js と同じ値 | 範囲キャプチャの通信 |
| `window.calendarApp.startCapture()` | 関数（画面に公開） | 範囲キャプチャを始めてもらう | 「画面から読み取る」 |
| `window.calendarApp.importImage(pngBytes)` | 関数（画面に公開） | PNG にそろえた画像を読み取ってもらう | 画像の貼り付け・ドラッグ＆ドロップ |
| `window.calendarApp.rereadCapture(orientation)` | 関数（画面に公開） | 向きを指定して読み直してもらう | 「横書き／縦書きで読み直す」 |
| `window.calendarApp.clearCapture()` | 関数（画面に公開） | 取り込んだ画像を消してもらう | 「クリア」 |
| `window.calendarApp.getAppStatus()` | 関数（画面に公開） | ホットキーが使えるか、その表記を尋ねる | ホットキーが使えないときの案内 |
| `window.calendarApp.openScreenRecordingSettings()` | 関数（画面に公開） | Mac の画面収録の設定画面を開いてもらう | 「システム設定を開く」 |
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
| `ELECTRON_DIR` | 定数 | electron/ フォルダのパス | 画面ファイルなどの場所を求める |
| `RENDERER_DIST_DIR` | 定数 | dist/renderer のパス | app:// で配信してよいフォルダ |
| `PRELOAD_PATH` / `OVERLAY_PRELOAD_PATH` | 定数 | 確認ウインドウ／範囲選択の画面の preload のパス | 画面に決めた関数だけを公開する |
| `IS_MAC` | 定数 | Mac か | トレイのアイコン・ホットキーの表記を分ける |
| `TRAY_ICON_PATH` | 定数 | トレイのアイコンのパス（Mac は白黒のテンプレート画像） | 常駐の表示 |
| `CAPTURE_HOTKEY` / `CAPTURE_HOTKEY_LABEL` | 定数 | 'CommandOrControl+Shift+Y' ／ 表記（Ctrl+Shift+Y・Cmd+Shift+Y） | 要件§12：ホットキー |
| `MAIN_WINDOW_SIZE` | 定数 | ウインドウの大きさ（1120×760、最小 820×560） | 確認ウインドウの表示 |
| `mainWindow` / `tray` | 変数 | 確認ウインドウ／トレイのアイコン | 表示・常駐 |
| `isQuitting` | 変数 | 終了しようとしているか | 閉じるボタンで隠す（常駐）か、本当に閉じるかを分ける |
| `isHotkeyRegistered` | 変数 | ホットキーを登録できたか | 使えないときに確認ウインドウで知らせる |
| `captureImageStore` | 定数 | 取り込んだ画像の置き場所（メモリだけ） | app:// での表示・読み直し |
| `captureController` | 定数 | 範囲キャプチャから OCR までの処理 | ホットキー・トレイ・ボタンから呼ぶ |
| `createMainWindow()` | 関数 | 安全な設定でウインドウを作る。閉じるボタンでは隠して画像を消す | 常駐（要件§6.1） |
| `showMainWindow()` | 関数 | 確認ウインドウを表示して前面に出す（なければ作る） | トレイ・2つ目の起動・読み取り後 |
| `isTrustedSender(event)` | 関数 | IPC の送信元が確認ウインドウの最上位のフレーム（app://bundle）か | 送信元の検証（CLAUDE.md） |
| `registerIpcHandlers()` | 関数 | 登録・確認・範囲キャプチャ・範囲選択の画面の通信の受け付けを登録する | IPC の入口をまとめる |
| `startApp()` | 関数 | セキュリティ設定、app:// の登録、通信の受け付け、トレイ、ホットキー、ウインドウ作成 | 起動処理 |

### tray.js（タスクトレイ）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `createAppTray(options)` | 関数（公開） | アイコンとメニュー（範囲を選んで読み取る／確認ウインドウを開く／終了）を作る。Windows は左クリックで確認ウインドウ | 常駐（要件§6.1） |

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

### captureIpc.js（範囲キャプチャの通信の受け付け）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `CAPTURE_START_CHANNEL` / `CAPTURE_REREAD_CHANNEL` / `CAPTURE_CLEAR_CHANNEL` / `APP_STATUS_CHANNEL` | 定数（公開） | 確認ウインドウ → メインプロセスのチャンネル名 | 取り込み開始・読み直し・画像を消す・状態の問い合わせ |
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
| `OVERALL_TIMEOUT_MS` / `STEP_TIMEOUT_MS` / `POLL_INTERVAL_MS` / `UI_SETTLE_MS` | 定数 | 全体の制限 30秒（正常なら約16秒）／1つの待ちの上限 10秒／確認間隔／画面の更新待ち | 止まったらすぐ知らせる（依頼者の指示） |
| `CAPTURE_FIXTURE_PATH` / `IMPORT_FIXTURE_PATH` | 定数 | 範囲キャプチャで「撮影した画面」とする画像／貼り付けに使う画像（架空） | 画面収録の許可なしで確認する |
| `APP_EXIT_TIMEOUT_MS` / `launchedApp` | 定数・変数 | アプリの終了を待つ上限 5秒／起動したアプリ | 常駐するアプリを必ず閉じる |
| `DEMO_TITLE` / `DEMO_LOCATION` / `DEMO_MEETING_URL` | 定数 | デモ文面の件名・場所・会議 URL（架空） | 下書き・登録内容の確認 |
| `DEMO_TEXT` / `NO_DATE_TEXT` | 定数 | 架空のデモ文面（日時3つ・件名・場所・URL 付き）／日時のない文面 | 画面操作の入力 |
| `results` / `unexpectedErrors` / `isExpectingErrors` | 変数 | 確認結果／画面のエラー／意図的なエラーを数えない期間か | 合否の判定 |
| `record(name, passed, detail)` | 関数 | 確認結果を記録・表示 | 結果の一覧 |
| `sleep(milliseconds)` | 関数 | 指定時間待つ | 画面の更新待ち |
| `DevToolsConnection` | クラス | DevTools への接続（`open` / `send` / `handleMessage` / `evaluate` / `close`） | 画面を外から操作する |
| `launchApp()` | 関数 | 確認用の接続口（画面用・メインプロセス用）付きで Electron を起動 | アプリの起動 |
| `connectToMainWindow(port)` | 関数 | 確認ウインドウに接続 | 操作対象の取得 |
| `waitFor(connection, expression)` | 関数 | 条件が満たされるまで待つ | 画面の準備待ち |
| `replaceInputText(connection, text)` | 関数 | 入力欄の文章を入れ替える | 貼り付けの再現 |
| `clickButton(connection, label)` | 関数 | 文字が一致するボタンを押す | ボタン操作の再現 |
| `setInputValue(connection, selector, value)` | 関数 | 日付・時刻などの入力欄に値を入れる | 手入力・時刻指定の再現 |
| `replaceOpenExternal(mainConnection)` | 関数 | メインプロセスの shell.openExternal を、URL を記録するだけの関数に差し替える | 実際のブラウザを開かずに登録を確認する |
| `getOpenedUrls(mainConnection)` | 関数 | メインプロセスが開こうとした URL の一覧を受け取る | 登録内容の確認 |
| `clickRegister(connection)` | 関数 | 登録ボタンを押し、処理が終わるまで待つ | 登録の再現 |
| `saveScreenshot(connection, directory, fileName)` | 関数 | 画面の画像を保存 | 見た目の確認 |
| `checkFeatures(connection, mainConnection, screenshotDir)` | 関数 | 抽出・下書き・候補・登録・登録の確認・時刻指定・ポップアップでの手入力・エラー表示を確認 | 機能の確認 |
| `replaceScreenCapture(mainConnection)` | 関数 | 画面の撮影を、架空の画像を返す関数に差し替える | 利用者の画面を撮影しない |
| `connectToOverlay(port, connection)` / `waitForOverlayClosed(port)` | 関数 | 範囲選択の画面に接続する／閉じるまで待つ（上限付き） | 範囲選択の確認 |
| `dragWholeOverlay(overlayConnection)` | 関数 | 範囲選択の画面でドラッグする | 範囲選択の再現 |
| `waitForWithTimeout(connection, expression, timeoutMs)` | 関数 | 条件を満たすまで待つ（上限付き。満たさなければ false） | 不合格を記録して先に進む |
| `checkCapture(connection, mainConnection, port, screenshotDir)` | 関数 | ホットキー・撮影・範囲選択・OCR・抽出・読み直し・Esc での中止・小さすぎる範囲を確認 | 範囲キャプチャの確認 |
| `stopLaunchedApp()` | 関数 | アプリを終了させる（終わらなければ強制終了） | 次の確認が多重起動防止で動かなくならないように |
| `checkSecurity(connection, mainConnection)` | 関数 | 公開機能が1つだけか、不正な登録要求が断られるか、Node.js 機能・外部通信・インラインスクリプト・新規ウインドウ・外部移動の遮断を確認 | セキュリティの実地確認 |
| `main()` | 関数 | 確認全体を実行し、終了コードを返す | 確認の実行 |
| `timeout` | 変数 | 制限時間のタイマー | 時間切れで失敗終了する |

## scripts/generate-ocr-fixtures.js（OCR のテスト用の画像を作る）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `OUTPUT_DIR` | 定数 | test/fixtures/ocr | 画像の保存先 |
| `FONT_FAMILY` | 定数 | Mac・Windows の標準の日本語書体 | 画面の文字に近い画像にする |
| `EMAIL_LINES` / `CHAT_LINES` / `VERTICAL_LINES` | 定数 | 架空のメール・チャット・縦書きのお知らせ | 画像に描く文章 |
| `FIXTURES` | 定数 | 作る画像の一覧（等倍・2倍、横書き・縦書き） | 画面の拡大率の違いを再現する |
| `buildHtml(fixture)` | 関数 | 画像に描く HTML を作る | 文章の描画 |
| `renderFixture(window, fixture)` | 関数 | 1枚の画像を作って保存する（同じ画面を書き換えて撮影） | 画像の作成 |

## scripts/generate-icons.js（トレイのアイコンを作る）

| 名前 | 種別 | 機能 | 目的 |
|---|---|---|---|
| `OUTPUT_DIR` | 定数 | assets/icons | 保存先 |
| `TEMPLATE_COLOR` / `BRAND_COLOR` | 定数 | 黒（Mac のテンプレート画像）／青 #1a73e8（Windows） | アイコンの色 |
| `drawCalendarIcon(size, color)` | 関数 | カレンダーの形の画素を作る | 外部の画像素材を使わない |
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
| japaneseNumber.test.js | — | 漢字の数字の変換の確認 | 位を使う書き方・1桁ずつの書き方・不正な書き方 |
| dateUtils.test.js | — | 日付計算と全角→半角の確認 | 繰り上がり・曜日・東京時間 |
| display.test.js | `NOW`、`firstCandidate()` | 表示文字列と色付けの分割の確認 | 表示の正しさ、HTML を解釈しないこと |
| detailExtractor.test.js | — | 件名・場所・会議 URL の下書きの確認 | ラベルの書き方、次の行の値、URL の優先順位・なりすまし対策 |
| calendarUrl.test.js | `timedEvent()`、`allDayEvent()`、`queryOf()` | 予定作成 URL の組み立て・検証・許可リストの確認 | dates・ctz・エンコード・長さ・危険な文字 |
| registration.test.js | `NOW`、`emptyDetails()`、`candidatesOf()` | 登録内容の組み立ての確認 | 終日／時刻指定、手入力、会議 URL の振り分け、元の文章の抜粋 |
| calendarIpc.test.js | `sampleEvent()`、`createTestHandler()` | 登録要求の処理の確認（偽のブラウザを開く関数を使う） | 送信元・引数の検証、順に開く、二度押し、preload との整合 |
| electronSecurity.test.js | `FIXTURE_ROOT`、`isInsideRoot()`、`createFakeSession()`、`createFakeContents()`、`createFakeEvent()` | セキュリティ設定と app:// の配信を偽物のオブジェクトで確認 | 設定を誤って緩めたら失敗させる |
| ocrText.test.js | — | OCR の結果の整形の確認 | 空白の除去、整形後に日時を抽出できること |
| capture.test.js | `VIEWPORT` | 範囲の座標の検証・変換、拡大の判定、画像の置き場所 | Retina・拡大率への対応、小さすぎる範囲、メモリだけで持つこと |
| screenPermission.test.js | — | 起動元のアプリの判別と案内文の確認 | ターミナル・VSCode・判別できない場合 |
| captureIpc.test.js | `createTestHandlers()` | 範囲キャプチャの通信の受け付けと preload の確認 | 送信元・向きの検証、重ねて始めない、公開する関数が決めたものだけ |
| ocrEngine.test.js | `FIXTURE_DIR`、`NOW`、`readFixture()` | 架空の画像で実際に読み取る | 横書き・縦書きの自動判定、PC 内の文字データの使用、ファイルを書き出さない、時間切れ |
| fixtures/ | — | app:// のテスト用ファイル（`outside-secret.txt` は配信フォルダの外） | パストラバーサル対策の確認 |
| fixtures/ocr/ | — | OCR のテスト用の架空の画像（横書きのメール 等倍・2倍、チャット、縦書きのお知らせ） | 文字の読み取りの確認 |
