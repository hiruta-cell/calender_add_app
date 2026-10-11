/**
 * detailExtractor.js
 * 目的：文章から「件名」「場所」「オンライン会議の URL」を取り出し、入力欄の下書きにする（要件§12）。
 *
 * - PC 内のルール処理だけで行い、文章を外部へ送らない（要件§5.2）。
 * - 件名・場所は、ラベル付きの行（「件名：」「【会場】」など）から取り出す。ラベルがなければ空にする。
 * - URL は https:// の部分から取り出す。Zoom・Google Meet・Teams・Webex を優先する。
 * - 取り出した内容は下書きであり、利用者が確認・修正してから登録する。
 */

import { MAX_LOCATION_TEXT_LENGTH, MAX_MEETING_URL_LENGTH, MAX_TITLE_LENGTH, sanitizeSingleLine } from './calendarUrl.js';
import { normalizeWidth } from './textNormalizer.js';

/** 件名のラベル（行の先頭にあるもの） */
const TITLE_LABELS = ['件名', '題名', 'タイトル', '会議名', 'イベント名', 'Subject', 'Title'];

/**
 * 場所のラベル。署名に多い「住所」は、相手の会社の住所を誤って入れないよう含めない。
 */
const LOCATION_LABELS = ['開催場所', '集合場所', '開催地', '場所', '会場', 'Location', 'Place', 'Venue'];

/** 会議サービスのホスト名（このホスト、またはそのサブドメインの URL を優先する） */
const MEETING_HOSTS = ['zoom.us', 'zoom.com', 'meet.google.com', 'teams.microsoft.com', 'teams.live.com', 'webex.com'];

/** ラベルの直後に値がない場合に、値を探す次の行の数（「■会場」の次の行に住所がある書き方） */
const NEXT_LINE_LOOKAHEAD = 2;

/** 件名の先頭から取り除く返信・転送の印（Re: Fw: Fwd: 返信: 転送:） */
const REPLY_PREFIX_PATTERN = /^(?:(?:re|fw|fwd|返信|転送)[ \t]*:[ \t]*)+/i;

/**
 * https の URL に一致する正規表現。URL に使える半角の文字だけを対象にし、日本語の手前で止める。
 * 長さに上限を付けて、処理が重くならないようにしている。
 */
const HTTPS_URL_PATTERN = /https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]{1,2000}/g;

/** URL の末尾にあっても URL の一部ではないことが多い記号 */
const TRAILING_PUNCTUATION = '.,;:!?\'"';

/**
 * ラベルの一覧から、行の先頭のラベルに一致する正規表現を作る。
 * 対応する書き方：「件名：値」「件名 値」「■件名：値」「【件名】値」「[件名] 値」「件名」（値は次の行）
 *
 * @param {string[]} labels ラベルの一覧
 * @returns {RegExp}
 */
function buildLabelPattern(labels) {
  const alternatives = labels.join('|');
  return new RegExp(
    String.raw`^[ \t]{0,8}(?:[■□●○◆◇▼▽▶・*#>\-]{1,3}[ \t]{0,4})?` +
      String.raw`(?:【[ \t]{0,2}(?:${alternatives})[ \t]{0,2}】|\[[ \t]{0,2}(?:${alternatives})[ \t]{0,2}\]|(?:${alternatives})(?=[ \t]{0,4}:|[ \t]|$))` +
      String.raw`[ \t]{0,4}:?[ \t]{0,4}(?<value>.*)$`,
    'i',
  );
}

/** 件名のラベルの行に一致する正規表現 */
const TITLE_LINE_PATTERN = buildLabelPattern(TITLE_LABELS);

/** 場所のラベルの行に一致する正規表現 */
const LOCATION_LINE_PATTERN = buildLabelPattern(LOCATION_LABELS);

/**
 * 文章から件名・場所・オンライン会議の URL を取り出す（このファイルの中心となる関数）。
 *
 * @param {string} text 貼り付けた文章（または OCR の結果）
 * @returns {{title: string, location: string, meetingUrl: string, isKnownMeetingService: boolean}}
 *   見つからない項目は空文字。isKnownMeetingService は URL が会議サービスのものなら true
 */
export function extractEventDetails(text) {
  const lines = normalizeWidth(text).split(/\r\n|\r|\n/);

  const meeting = findMeetingUrl(lines.join('\n'));
  const title = truncate(findLabeledValue(lines, TITLE_LINE_PATTERN).replace(REPLY_PREFIX_PATTERN, ''), MAX_TITLE_LENGTH);
  let location = findLabeledValue(lines, LOCATION_LINE_PATTERN);

  // 「場所：オンライン https://zoom.us/...」のように場所に URL が書かれていたら、URL は会議 URL の欄に任せる
  if (meeting !== null) {
    location = removeUrls(location);
  }

  return {
    title,
    location: truncate(location, MAX_LOCATION_TEXT_LENGTH),
    meetingUrl: meeting?.href ?? '',
    isKnownMeetingService: meeting?.isKnownMeetingService ?? false,
  };
}

/**
 * ラベル付きの行から値を取り出す。ラベルの行に値がなければ、次の行（空行は飛ばす）を値とみなす。
 *
 * @param {string[]} lines 文章の各行
 * @param {RegExp} pattern ラベルの行に一致する正規表現
 * @returns {string} 値（見つからなければ空文字）
 */
function findLabeledValue(lines, pattern) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (match === null) {
      continue;
    }
    const value = sanitizeSingleLine(match.groups.value);
    if (value !== '') {
      return value;
    }
    // 値が次の行に書かれている場合（「■会場」の次の行など）
    for (let offset = 1; offset <= NEXT_LINE_LOOKAHEAD && index + offset < lines.length; offset += 1) {
      const nextLine = sanitizeSingleLine(lines[index + offset]);
      if (nextLine === '') {
        continue;
      }
      return isAnyLabelLine(nextLine) ? '' : nextLine;
    }
    return '';
  }
  return '';
}

/**
 * 行が件名・場所のラベルの行かどうか（次の行を値とみなしてよいかの判定に使う）。
 *
 * @param {string} line
 * @returns {boolean}
 */
function isAnyLabelLine(line) {
  return TITLE_LINE_PATTERN.test(line) || LOCATION_LINE_PATTERN.test(line);
}

/**
 * 文章の中から、オンライン会議の URL を1つ選ぶ。会議サービスの URL があればそれを、なければ最初の https の URL を選ぶ。
 *
 * @param {string} text 半角にそろえた文章
 * @returns {{href: string, isKnownMeetingService: boolean} | null} 見つからなければ null
 */
function findMeetingUrl(text) {
  const urls = [];
  for (const match of text.matchAll(HTTPS_URL_PATTERN)) {
    const parsed = parseMeetingUrl(trimTrailingPunctuation(match[0]));
    if (parsed !== null) {
      urls.push(parsed);
    }
  }
  return urls.find((url) => url.isKnownMeetingService) ?? urls[0] ?? null;
}

/**
 * URL の文字列を検証し、会議サービスのものかを判定する。
 * 入力欄に利用者が書き換えた URL の検証にも使う。
 *   - https 以外、ユーザー名・パスワードを含むもの（https://zoom.us@偽サイト のようななりすまし）は不可
 *   - ホスト名にドットがないもの（本文の「https://zооm.us」が日本語以外の文字の手前で途切れた「https://z」など）は不可
 *   - 国際化ドメインは xn-- の形に直して返す（見た目が似た偽のドメインを見分けやすくする）
 *
 * @param {string} text URL の文字列
 * @returns {{href: string, isKnownMeetingService: boolean} | null} 使えない URL なら null
 */
export function parseMeetingUrl(text) {
  if (typeof text !== 'string' || text === '' || text.length > MAX_MEETING_URL_LENGTH) {
    return null;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || !url.hostname.includes('.')) {
    return null;
  }
  if (url.href.length > MAX_MEETING_URL_LENGTH) {
    return null;
  }
  return { href: url.href, isKnownMeetingService: isMeetingHost(url.hostname) };
}

/**
 * ホスト名が会議サービスのものか（サブドメインも含む）。
 * 「zoom.us.偽サイト.com」のような名前は、末尾で判定するので会議サービスとはみなさない。
 *
 * @param {string} hostname
 * @returns {boolean}
 */
function isMeetingHost(hostname) {
  return MEETING_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/**
 * URL の末尾の句読点や、対応の取れない閉じ括弧を取り除く。
 * 例：「(https://zoom.us/j/1)」→ https://zoom.us/j/1、「https://example.com.」→ https://example.com
 *
 * @param {string} url
 * @returns {string}
 */
function trimTrailingPunctuation(url) {
  let result = url;
  for (;;) {
    const lastCharacter = result.at(-1);
    const isUnbalancedParenthesis = lastCharacter === ')' && countCharacter(result, ')') > countCharacter(result, '(');
    const isUnbalancedBracket = lastCharacter === ']' && countCharacter(result, ']') > countCharacter(result, '[');
    if (TRAILING_PUNCTUATION.includes(lastCharacter) || isUnbalancedParenthesis || isUnbalancedBracket) {
      result = result.slice(0, -1);
    } else {
      return result;
    }
  }
}

/**
 * 文字列の中の、ある文字の数を数える。
 *
 * @param {string} text
 * @param {string} character
 * @returns {number}
 */
function countCharacter(text, character) {
  return text.split(character).length - 1;
}

/**
 * 文字列から https の URL を取り除き、余った空白を詰める。
 *
 * @param {string} text
 * @returns {string}
 */
function removeUrls(text) {
  return text.replace(HTTPS_URL_PATTERN, '').replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * 文字列を最大文字数までに切り詰める。
 *
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
function truncate(text, maxLength) {
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}
