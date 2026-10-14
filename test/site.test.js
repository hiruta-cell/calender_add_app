// 目的：GitHub Pages で公開する site/ の案内ページが、外部の読み込みや危険な書き方をしていないことを確かめる。
// 方針：ページは外部のスクリプト・フォント・画像・CDN を使わない（CLAUDE.md のセキュリティ方針）。
// 実行：npm test（node:test 標準。ネットワークには接続しない）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const INDEX_HTML = readFileSync(join(SITE_DIRECTORY, "index.html"), "utf8");
const STYLES_CSS = readFileSync(join(SITE_DIRECTORY, "styles.css"), "utf8");

// 外部へのリンクとして許可するのは、このリポジトリの GitHub ページだけ
const ALLOWED_EXTERNAL_PREFIX = "https://github.com/hiruta-cell/calender_add_app";

/**
 * 関数の内容：HTML の src / href 属性の値をすべて取り出す。
 * 引数：html（HTML の文字列）。
 * 戻り値：属性の値の配列（{ attribute, value } の形）。
 * 注意：正規表現は単純な属性だけを対象にし、入れ子の量指定子を使わない（ReDoS 対策）。
 */
function collectUrlAttributes(html) {
  const pattern = /\b(src|href)="([^"]*)"/g;
  const found = [];
  for (const match of html.matchAll(pattern)) {
    found.push({ attribute: match[1], value: match[2] });
  }
  return found;
}

test("案内ページに外部スクリプト・インラインのスクリプト・スタイルがない", () => {
  assert.doesNotMatch(INDEX_HTML, /<script\b/i);
  assert.doesNotMatch(INDEX_HTML, /<style\b/i);
  // イベント属性（onclick など）も使わない
  assert.doesNotMatch(INDEX_HTML, /\son[a-z]+\s*=/i);
  // style 属性（インラインの見た目）も使わない
  assert.doesNotMatch(INDEX_HTML, /\sstyle\s*=/i);
});

test("CSP で外部への通信とスクリプトを禁止している", () => {
  const cspMatch = INDEX_HTML.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/);
  assert.ok(cspMatch, "Content-Security-Policy の meta がない");
  const policy = cspMatch[1];
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /style-src 'self'/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(policy, /script-src/);
});

test("src / href は自分のファイルか、許可した GitHub のページだけを指す", () => {
  for (const { attribute, value } of collectUrlAttributes(INDEX_HTML)) {
    if (value.startsWith("#")) continue;
    const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
    if (isExternal) {
      assert.ok(
        value.startsWith(ALLOWED_EXTERNAL_PREFIX),
        `許可していない外部の URL（${attribute}）: ${value}`,
      );
    } else {
      assert.ok(!value.startsWith("/"), `先頭が / の絶対パスは公開先で壊れる（${attribute}）: ${value}`);
      const localPath = join(SITE_DIRECTORY, value);
      assert.ok(existsSync(localPath), `参照しているファイルがない（${attribute}）: ${value}`);
    }
  }
});

test("外部のサイトへ開くリンクには rel=\"noopener noreferrer\" が付いている", () => {
  const anchors = INDEX_HTML.match(/<a\s[^>]*>/g) ?? [];
  for (const anchor of anchors) {
    if (!anchor.includes('target="_blank"')) continue;
    assert.match(anchor, /rel="noopener noreferrer"/, `rel が足りない: ${anchor}`);
  }
});

test("スタイルシートは外部の URL・取り込みを使わない", () => {
  assert.doesNotMatch(STYLES_CSS, /url\(\s*['"]?https?:/i);
  assert.doesNotMatch(STYLES_CSS, /@import/i);
  assert.doesNotMatch(STYLES_CSS, /expression\(/i);
});

test("スタイルシートは背景色と文字色の両方を指定している（ダークモード対応の土台）", () => {
  assert.match(STYLES_CSS, /:root\s*\{[^}]*--color-background:/);
  assert.match(STYLES_CSS, /body\s*\{[^}]*background:\s*var\(--color-background\)/);
  assert.match(STYLES_CSS, /prefers-color-scheme:\s*dark/);
});
