---
name: docs-sync
description: コードを変えた後、CODE-REFERENCE.md・README.md・ACCEPTANCE.md の更新漏れを調べる手順。コミットの前、関数・定数・ファイルを追加・改名・削除したとき、毎日の作業の終わり（ACCEPTANCE の更新）に使う。
---

# 説明書の更新漏れの確認

依頼者への報告・経過のログは日本語で書く。

## 1. CODE-REFERENCE.md の漏れをスクリプトで調べる

```bash
.claude/skills/docs-sync/scripts/check-code-reference.sh          # 前のコミットからの変更（未コミットを含む）
.claude/skills/docs-sync/scripts/check-code-reference.sh <基準>   # 例：origin/main からの変更
```

- 変更した `.js` `.jsx` `.cjs` のファイル名と、そのファイルの関数・定数（行の先頭にある `function` `const` `export`）のうち、CODE-REFERENCE.md に名前が無いものだけを出す
- 消した名前が CODE-REFERENCE.md に残っていないかも出す
- 漏れは CODE-REFERENCE.md を全部読まずに、`grep -n '<ファイル名>' docs/CODE-REFERENCE.md` で表の場所を探して足す（形は「ファイル / 名前 / 種別 / 機能 / 目的」）

## 2. README.md（変えたときだけ）

- 起動手順・Mac の画面取り込みの許可・対応する日付の書き方（requirements-memo.md §8）に関わる変更なら更新する

## 3. ACCEPTANCE.md（毎日の作業の終わり）

- 合否と証拠（テストの件数・実機確認・画像）を更新する。件数はスキル `test-verify-debug` の結果をそのまま写す
- 実機でしか確かめられない項目は「未検証」のままにする。基準そのものを変えるときは依頼者の承認を得る

## 4. 報告

- 「CODE-REFERENCE に N 件追加・M 件削除」のように件数で書く
