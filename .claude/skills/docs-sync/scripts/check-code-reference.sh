#!/usr/bin/env bash
# check-code-reference.sh
# 目的：変更したコードのファイル名・関数・定数のうち、docs/CODE-REFERENCE.md に書かれていないもの（と、消したのに残っているもの）だけを出す。
# 使い方：check-code-reference.sh [<基準のコミット>]   … 省略時は HEAD（未コミットの変更と新しいファイルを調べる）
# 終了コード：0 漏れなし／1 漏れあり
# 注意：行の先頭にある宣言だけを調べる簡易な確認。関数の中の名前や、説明の中身が正しいかまでは調べない。

set -u
base="${1:-HEAD}"
cd "$(git rev-parse --show-toplevel)" || exit 1
reference="docs/CODE-REFERENCE.md"
missing_count=0

# 行の先頭の宣言から名前を取り出す（例：export async function name( / const NAME = ）
declaration_pattern='^(export[[:space:]]+)?(default[[:space:]]+)?(async[[:space:]]+)?(function\*?|const|let|class)[[:space:]]+[A-Za-z_$][A-Za-z0-9_$]*'
extract_names() {
  grep -o -E "${declaration_pattern}" | awk '{print $NF}' | sort -u
}

# 調べるファイル：基準からの変更と、Git にまだ入っていない新しいファイル（コードだけ。node_modules・dist は除く）
changed_files="$( { git diff --name-only "${base}"; git ls-files --others --exclude-standard; } \
  | grep -E '\.(js|jsx|cjs|mjs)$' | grep -v -E '^(node_modules|dist)/' | sort -u )"

for file in ${changed_files}; do
  if [ ! -f "${file}" ]; then
    # 消したファイル：CODE-REFERENCE.md に名前が残っていれば知らせる
    grep -q -F "$(basename "${file}")" "${reference}" && { echo "残っている（削除済みのファイル）: ${file}"; missing_count=$((missing_count + 1)); }
    continue
  fi
  grep -q -F "$(basename "${file}")" "${reference}" || { echo "ファイルが無い: ${file}"; missing_count=$((missing_count + 1)); }
  # テストのファイル（test/）は、CODE-REFERENCE.md の決まりでファイル名だけを載せるため、名前は調べない
  case "${file}" in test/*) continue ;; esac
  for name in $(extract_names < "${file}"); do
    grep -q -w -F "${name}" "${reference}" || { echo "名前が無い: ${file} ${name}"; missing_count=$((missing_count + 1)); }
  done
  # 消した名前：基準の版にあって今の版に無い名前が、CODE-REFERENCE.md に残っていないか
  old_names="$(git show "${base}:${file}" 2>/dev/null | extract_names)"
  new_names="$(extract_names < "${file}")"
  for name in $(comm -23 <(printf '%s\n' "${old_names}") <(printf '%s\n' "${new_names}")); do
    [ -n "${name}" ] && grep -q -w -F "${name}" "${reference}" && { echo "残っている（削除済みの名前）: ${file} ${name}"; missing_count=$((missing_count + 1)); }
  done
done

if [ "${missing_count}" -eq 0 ]; then
  echo "CODE-REFERENCE.md の漏れなし（調べたファイル: $(printf '%s\n' "${changed_files}" | grep -c .) 件）"
  exit 0
fi
echo "漏れ ${missing_count} 件"
exit 1
