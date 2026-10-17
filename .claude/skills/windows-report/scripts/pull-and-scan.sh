#!/usr/bin/env bash
# pull-and-scan.sh
# 目的：Windows から push された報告を取り込み、読む前に、新しい・変わった docs/reports/*.md に個人情報・秘密の値が無いかを調べる。
# 使い方：pull-and-scan.sh
# 終了コード：0 当たりなし／2 必ず止めるもの（秘密・個人の言葉・ユーザー名入りのパス）あり／3 要確認（メール・電話番号）だけあり／1 pull の失敗
# 注意：当たった行は「ファイル:行番号」だけを出し、中身は出さない（個人情報を画面・ログに写さないため）。

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
scanner="${HOME}/.claude/hooks/scan-lines.sh"

before_commit="$(git rev-parse HEAD)"
git pull --ff-only --quiet || { echo "pull できませんでした（早送りできない・通信の失敗）。merge・rebase はせず依頼者へ報告"; exit 1; }

# 取り込んだ範囲で増えた・変わった報告（削除は除く）
report_files="$(git diff --name-only --diff-filter=AM "${before_commit}" HEAD -- 'docs/reports/*.md')"
if [ -z "${report_files}" ]; then
  echo "新しい報告はありません（取り込んだコミット: $(git rev-list --count "${before_commit}..HEAD") 件）"
  exit 0
fi

status=0
for file in ${report_files}; do
  # 共通の検査（秘密・個人の言葉・メール・電話番号）。中身は出さず、行番号だけにする
  scan_output="$("${scanner}" --with-review "${file}")"; scan_status=$?
  if [ "${scan_status}" -ne 0 ]; then
    printf '%s\n' "${scan_output}" | grep -o -E '^[0-9]+:' | tr -d ':' | sed "s|^|当たり（共通の検査）: ${file}:|"
    [ "${scan_status}" -gt "${status}" ] && status="${scan_status}"
  fi
  # Windows のユーザー名が入ったパス（C:\Users\<名前>。\Users\Public などの共通フォルダは除く）
  path_lines="$(grep -n -i -E '[a-z]:[\\/]+users[\\/]+[^\\/ ]+' "${file}" | grep -v -i -E 'users[\\/]+(public|default|<)' | cut -d: -f1)"
  for line in ${path_lines}; do echo "当たり（ユーザー名入りのパス）: ${file}:${line}"; status=2; done
done

[ "${status}" -eq 0 ] && echo "当たりなし。読んでよい報告: $(printf '%s ' ${report_files})"
exit "${status}"
