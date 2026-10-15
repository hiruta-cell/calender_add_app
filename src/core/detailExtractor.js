/**
 * detailExtractor.js
 * 目的：文章から「件名」「場所」「オンライン会議の URL」を取り出し、入力欄の下書きにする（要件§12）。
 *
 * - PC 内のルール処理だけで行い、文章を外部へ送らない（要件§5.2）。
 * - 件名・場所は、ラベル付きの行（「件名：」「【会場】」など）から取り出す。
 *   ラベルがなければ、簡単な規則で補う（依頼者の指摘。凝りすぎない）：
 *     件名：最初の数行のうち「〜のお知らせ」「〜のご案内」「〜のご連絡」「〜開催決定！」で終わる短い行
 *     場所：「会場は〜です」「場所は〜で行います」のように「です」などで終わる文。
 *           それもなければ「住所：」「所在地：」の行、さらになければ「宮城県塩竈市本町8-1」のように
 *           都道府県＋市区町村で始まる行や、「塩竈市本町8-1」「登米市 / 芸術鑑賞」のように
 *           市区町村で始まり番地が続く（または行末・分類で終わる）行（催しの一覧のページなど。依頼者の指示 2026-10-11）。
 *           施設名だけの行（「架空市民会館」「架空国際センター 会議棟2F」など）も使い、近くに住所があれば並べる。
 *           署名らしいまとまり（メールアドレス、または会社名と TEL・FAX を含む）と「--」より後の住所は使わない
 * - URL は https:// の部分から取り出す。Zoom・Google Meet・Teams・Webex を優先する。
 *   2行に折り返された URL（「…?」の次の行に「pwd=…」など）は、つなげて1つにする（joinWrappedUrls）。
 * - 取り出した内容は下書きであり、利用者が確認・修正してから登録する。
 */

import { MAX_LOCATION_TEXT_LENGTH, MAX_MEETING_URL_LENGTH, MAX_TITLE_LENGTH, sanitizeSingleLine } from './calendarUrl.js';
import { normalizeWidth } from './textNormalizer.js';

/** 件名のラベル（行の先頭にあるもの） */
const TITLE_LABELS = ['件名', '題名', 'タイトル', '会議名', 'イベント名', 'Subject', 'Title'];

/**
 * 場所のラベル。署名に多い「住所」は、ここには含めず ADDRESS_LABELS で扱う（署名の住所を除いてから使う）。
 */
const LOCATION_LABELS = ['開催場所', '集合場所', '開催地', '場所', '会場', 'Location', 'Place', 'Venue'];

/** 住所のラベル（場所のラベル・場所の文がないときに使う。署名のまとまりの中のものは使わない） */
const ADDRESS_LABELS = ['住所', '所在地', 'Address'];

/** 都道府県名（住所らしい行を見つけるため） */
const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
  '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

/**
 * 都道府県＋市区町村で始まる行（住所らしい行）。
 *   - 行頭の空白・記号と、OCR でアイコン（地図のピンなど）が化けた文字（「Q」「暫」「9」など）を2文字まで読み飛ばす
 *   - 郵便番号（〒980-0000）があれば読み飛ばす（住所には含めない）
 *   - 都道府県の後に、市・区・町・村・郡で終わる名前（10文字まで）が必要（「宮城県子ども」のような文を除く）
 *   - value：住所から行末まで
 */
const ADDRESS_LINE_PATTERN = new RegExp(
  String.raw`^[ \t]{0,8}(?:[^ \t]{1,2}?[ \t]{0,2})??(?:〒?[ \t]?\d{3}-?\d{4}[ \t]{0,2})?(?<value>(?:${PREFECTURES.join('|')})[^ \t/|]{1,10}?(?:市|区|町|村|郡).*)$`,
  'u',
);

/**
 * 都道府県のない、市区町村で始まる行（依頼者の指示：県名のない住所の方が多い）。
 *   municipality：市区町村名（「仙台市青葉区」「塩竈市」「柴田郡大河原町」など。名前は漢字・かな・カタカナ6文字まで）
 *   rest：その後ろ（番地が続くか、行末・分類で終わるかを MUNICIPALITY_REST_PATTERN で確かめる）
 * 都道府県の行と同じく、行頭の化けた文字2文字と郵便番号は読み飛ばす。
 */
const MUNICIPALITY_LINE_PATTERN =
  /^[ \t]{0,8}(?:[^ \t]{1,2}?[ \t]{0,2})??(?:〒?[ \t]?\d{3}-?\d{4}[ \t]{0,2})?(?<value>(?<municipality>[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ヶヵ々]{1,6}?(?:市|区|郡|町|村)(?:[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ヶヵ々]{1,6}?(?:区|町|村))?)(?<rest>.*))$/u;

/**
 * 市区町村名の後ろとして認める書き方（どちらか）。
 *   1. 町名など（漢字・カタカナと「ヶ」「の」「が」だけ。「で」「にある」のような文のつながりは除く）に続く番地：
 *      数字＋「-」「丁目」「番地」「号」、または日付・時刻でない数字（「10月」「10日」「14:00」は除く）、「丁目」「番地」
 *      例：「本町8-1講習室」「一番町1-2-3」「中央123番地」
 *   2. 何もない（行末）か、「 / 分類」（催しの一覧の地域の表示。例：「登米市 / 芸術鑑賞」）
 */
const MUNICIPALITY_REST_PATTERN =
  /^(?:[\p{Script=Han}\p{Script=Katakana}ヶヵケ々のが]{0,12}?(?:\d{1,5}(?:[-‐−ー－の]\d|丁目|番地?|号|(?![\d月日年時:/.]))|丁目|番地)|[ \t]*(?:[/|｜／].*)?$)/u;

/**
 * 施設名の終わり方（施設名だけの行を見つけるため）。長い言葉を先に並べる（「市民会館」を「館」より先に試す）。
 */
const FACILITY_SUFFIXES = [
  '文化会館', '市民会館', '公民館', '美術館', '博物館', '体育館', '図書館', '記念館', '資料館', '交流館', '科学館',
  '水族館', '動物園', '植物園', '幼稚園', '保育園', '会館', 'ホール', 'センター', 'プラザ', 'ドーム', 'スタジアム',
  'アリーナ', '競技場', '劇場', '舞台', '公園', '広場', 'ホテル', '旅館', '会議室', '講習室', '研修室', '研修所',
  '講堂', '大学', '高等学校', '高校', '中学校', '小学校', '学園', '市役所', '役場', '庁舎', '神社', '教会', '駅',
  'ビル', 'モール', '館', '園', '寺',
];

/**
 * 施設名だけの行。
 *   - 行頭の記号（■●◆・など）は読み飛ばす
 *   - 施設名（40文字まで）が FACILITY_SUFFIXES のどれかで終わる
 *   - その後ろに、空白と部屋・階（「会議棟2F」「3階」「第1会議室」「大ホール」など。15文字まで）が続いてもよい
 *   value：施設名（と部屋・階）
 */
const FACILITY_LINE_PATTERN = new RegExp(
  String.raw`^[ 	]{0,8}(?:[■□●○◆◇▼▽▶・*#\-][ 	]{0,4})?(?<value>[^ 	]{0,40}?(?:${FACILITY_SUFFIXES.join('|')})(?:[ 	]{1,3}[^ 	]{1,15}?(?:室|階|F|棟|ホール|ルーム))?)[ 	]*$`,
  'u',
);

/**
 * 施設名の行にあってはいけないもの（あれば施設名とみなさない）：
 *   文の終わりや区切り（。、！？）、文のつながり（で・にて・にある・にあり・へ・を・です・ます・から・まで・ください）、
 *   題名のかっこ（「」『』【】）、問い合わせの窓口（お客様センター・サポートセンターなど）、
 *   日付・時刻（10/20、10月、20日、14:00、14時）
 */
const NOT_FACILITY_PATTERN = /[。、！？!?「」『』【】]|で|にて|にある|にあり|へ|を|です|ます|から|まで|ください|お客様|コール|サポート|サービス|問い?合わせ|窓口|事務局|\d{1,4}[/月年]|\d{1,2}日|\d{1,2}:\d{2}|\d{1,2}時/u;

/** 施設名と住所を並べてよい、行の離れ具合（この行数以内なら同じ催しの情報とみなす） */
const FACILITY_ADDRESS_MAX_LINE_DISTANCE = 3;

/** 住所の後ろの「 / 芸術鑑賞」のような分類、または2つ以上の空白の後ろ（画面の別の欄）を切り捨てる */
const ADDRESS_TRAILING_PATTERN = /[ \t]*[/|｜／].*$|[ \t]{2,}.*$/u;

/** 番地（数字）を含むか。含む住所は、市町村だけのもの（催しの一覧の地域の表示）より優先する */
const HAS_STREET_NUMBER_PATTERN = /\d/;

/** 署名らしいまとまりの印1：メールアドレス（これがあるまとまりは署名とみなす） */
const EMAIL_ADDRESS_PATTERN = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}\.[A-Za-z0-9.-]{1,190}/;

/** 署名らしいまとまりの印2：会社名（電話・FAX と両方あるまとまりを署名とみなす。催しの案内の「TEL」だけでは除かない） */
const COMPANY_PATTERN = /株式会社|有限会社|合同会社|\(株\)|\(有\)|Co\.,?[ \t]?Ltd|Inc\.|Corporation/i;

/** 署名らしいまとまりの印3：電話・FAX の見出し */
const PHONE_LABEL_PATTERN = /TEL|FAX|電話|携帯/i;

/** 署名の区切りの行（メールの慣習の「-- 」） */
const SIGNATURE_SEPARATOR_PATTERN = /^--[ \t]?$/;

/** 会議サービスのホスト名（このホスト、またはそのサブドメインの URL を優先する） */
const MEETING_HOSTS = ['zoom.us', 'zoom.com', 'meet.google.com', 'teams.microsoft.com', 'teams.live.com', 'webex.com'];

/** 見出し（件名の代わり）を探す、文章の先頭からの行数 */
const MAX_HEADING_LINES = 5;

/** 見出しとみなす行の最大文字数（長い文は見出しにしない） */
const MAX_HEADING_LENGTH = 40;

/**
 * 見出しとみなす行の終わり方（件名のラベルがないお知らせ・告知の1行目など）。
 * 末尾の記号（「!」「】」「◆」など、文字と数字以外）は3文字まで許す。
 * 文章は半角にそろえた後なので、全角の「！」は「!」になっている。
 */
const HEADING_ENDING_PATTERN = /(?:のお知らせ|のご案内|のご連絡|開催決定)[^\p{L}\p{N}]{0,3}$/u;

/**
 * 場所を表す文（「会場は第二会議室です」「場所はZoomで行います」）。値は「。」「、」をまたがない40文字まで。
 *   - 「です」「で行います」などの終わり方と、その後の「。」・空白・行末が必要
 *     （「場所は追って連絡します」「会場は〜ですが」のような文から場所を取り出さないため）
 *   - 「会場」などの直前に漢字・ひらがな・カタカナがないこと（「駐車場所は」「この場所は」を除くため）
 */
const LOCATION_SENTENCE_PATTERN =
  /(?<![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])(?:開催場所|集合場所|会場|場所)は[、, \t]{0,2}(?<value>[^。、]{1,40}?)(?:です|でございます|で行います|で開催します|にて開催します|にて行います|となります)(?=[。.! \t]|$)/u;

/** ラベルの直後に値がない場合に、値を探す次の行の数（「■会場」の次の行に住所がある書き方） */
const NEXT_LINE_LOOKAHEAD = 2;

/** 件名の先頭から取り除く返信・転送の印（Re: Fw: Fwd: 返信: 転送:） */
const REPLY_PREFIX_PATTERN = /^(?:(?:re|fw|fwd|返信|転送)[ \t]*:[ \t]*)+/i;

/**
 * https の URL に一致する正規表現。URL に使える半角の文字だけを対象にし、日本語の手前で止める。
 * 長さに上限を付けて、処理が重くならないようにしている。
 */
const HTTPS_URL_PATTERN = /https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]{1,2000}/g;

/** 値の先頭の区切り記号や記号のごみ（OCR で「：」が「・」に読まれた「場所:・オンライン」、「Location: _ Room 101」など） */
const LEADING_SEPARATOR_PATTERN = /^[・･:：_|\s]+/;

/**
 * 行末で終わる https の URL（後ろの空白は除いた行に使う）。折り返された URL の1行目を見つける。
 * 先頭が固定の「https://」で、量指定子は1つだけ（上限付き）なので、処理が重くならない。
 */
const URL_AT_LINE_END_PATTERN = /https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]{1,2000}$/;

/** URL の折り返しの続きの行（URL に使える半角の文字だけでできた行。前後の少しの空白は許す） */
const URL_CONTINUATION_LINE_PATTERN = /^[ \t]{0,8}([A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]{1,2000})[ \t]{0,8}$/;

/** URL の1行目の末尾がこの記号なら、続きがある（「…/j/123?」の次の行に「pwd=…」など） */
const URL_CONTINUES_AFTER_PATTERN = /[?&=/#]$/;

/** 続きの行の先頭がこの記号なら、前の行の URL の続き（「…/j/123」の次の行に「?pwd=…」など） */
const URL_CONTINUATION_START_PATTERN = /^[?&#/]/;

/** 折り返しをつなげる行の数の上限（1つの URL が何行に分かれていてもよいように、ただし無制限にはしない） */
const MAX_URL_CONTINUATION_LINES = 3;

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

/** 住所のラベルの行に一致する正規表現 */
const ADDRESS_LABEL_LINE_PATTERN = buildLabelPattern(ADDRESS_LABELS);

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
  const labeledTitle = findLabeledValue(lines, TITLE_LINE_PATTERN);
  const title = truncate(
    (labeledTitle !== '' ? labeledTitle : findHeadingTitle(lines)).replace(REPLY_PREFIX_PATTERN, ''),
    MAX_TITLE_LENGTH,
  );
  const labeledLocation = findLabeledValue(lines, LOCATION_LINE_PATTERN);
  let location = labeledLocation !== '' ? labeledLocation : findLocationSentence(lines);
  if (location === '') {
    // 場所の見出し・文がなければ、署名のまとまりを除いた行から住所を探す
    const linesWithoutSignature = blankOutSignatureLines(lines);
    location = findLabeledValue(linesWithoutSignature, ADDRESS_LABEL_LINE_PATTERN) || findAddressLine(linesWithoutSignature);
  }

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
    const value = sanitizeSingleLine(match.groups.value).replace(LEADING_SEPARATOR_PATTERN, '');
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
 * 件名のラベルがないとき、文章の先頭の数行から見出し（「定例会のお知らせ」など）を探す。
 *
 * @param {string[]} lines 文章の各行
 * @returns {string} 見出し（見つからなければ空文字）
 */
function findHeadingTitle(lines) {
  const headLines = lines.map(sanitizeSingleLine).filter((line) => line !== '').slice(0, MAX_HEADING_LINES);
  return headLines.find((line) => line.length <= MAX_HEADING_LENGTH && HEADING_ENDING_PATTERN.test(line)) ?? '';
}

/**
 * 場所のラベルがないとき、「会場は〜です」のような文から場所を取り出す。
 *
 * @param {string[]} lines 文章の各行
 * @returns {string} 場所（見つからなければ空文字）
 */
function findLocationSentence(lines) {
  for (const line of lines) {
    const match = sanitizeSingleLine(line).match(LOCATION_SENTENCE_PATTERN);
    if (match !== null) {
      return match.groups.value.trim();
    }
  }
  return '';
}

/**
 * 署名らしい行を空行に置き換える（行の数は変えない）。
 *   - 「-- 」の行より後はすべて署名とみなす
 *   - 空行で区切られたまとまりに、メールアドレスがある、または会社名と電話・FAX の両方があれば、そのまとまりを署名とみなす
 *
 * @param {string[]} lines 文章の各行
 * @returns {string[]} 署名の行を空にした各行
 */
function blankOutSignatureLines(lines) {
  const result = [...lines];
  const separatorIndex = lines.findIndex((line) => SIGNATURE_SEPARATOR_PATTERN.test(line));
  if (separatorIndex !== -1) {
    result.fill('', separatorIndex);
  }
  let blockStart = 0;
  for (let index = 0; index <= result.length; index += 1) {
    if (index < result.length && result[index].trim() !== '') {
      continue;
    }
    const block = result.slice(blockStart, index).join('\n');
    const isSignature =
      EMAIL_ADDRESS_PATTERN.test(block) || (COMPANY_PATTERN.test(block) && PHONE_LABEL_PATTERN.test(block));
    if (isSignature) {
      result.fill('', blockStart, index);
    }
    blockStart = index + 1;
  }
  return result;
}

/**
 * 都道府県のない、市区町村で始まる住所の行か確かめる（市区町村名の後ろに番地が続くか、行末・分類で終わるもの）。
 * 例：「塩竈市本町8-1講習室」「登米市 / 芸術鑑賞」は住所。「朝市10月20日」「登米市にある能舞台」は住所ではない。
 *
 * @param {string} line 1行の文字列
 * @returns {RegExpMatchArray | null} 住所なら一致結果（groups.value が住所）、違えば null
 */
function matchMunicipalityLine(line) {
  const match = line.match(MUNICIPALITY_LINE_PATTERN);
  return match !== null && MUNICIPALITY_REST_PATTERN.test(match.groups.rest) ? match : null;
}

/**
 * 施設名だけの行か確かめる。
 *
 * @param {string} line 1行の文字列
 * @returns {string} 施設名（違えば空文字）
 */
function matchFacilityLine(line) {
  if (NOT_FACILITY_PATTERN.test(line)) {
    return '';
  }
  return line.match(FACILITY_LINE_PATTERN)?.groups.value ?? '';
}

/**
 * 見出しのない行から場所を取り出す（住所の行と施設名の行）。
 *   1. 番地のある住所があれば、それを使う。近く（3行以内）に施設名があれば「施設名 住所」にする
 *   2. なければ施設名を使う。近くに地域だけの住所（「登米市 / 芸術鑑賞」など）があれば「施設名 地域」にする
 *   3. なければ地域だけの住所を使う
 * 例：「宮城県登米市 / 芸術鑑賞・自然観賞」→「宮城県登米市」、「Q宮城県塩竈市本町8-1講習室」（OCR）→「宮城県塩竈市本町8-1講習室」、
 *     「架空市民会館」＋次の行「架空市中央1-1」→「架空市民会館 架空市中央1-1」
 *
 * @param {string[]} lines 文章の各行（署名の行は空にしたもの）
 * @returns {string} 場所（見つからなければ空文字）
 */
function findAddressLine(lines) {
  const addresses = []; // {index, text, hasStreetNumber}
  const facilities = []; // {index, text}
  lines.forEach((line, index) => {
    const singleLine = sanitizeSingleLine(line);
    const match = singleLine.match(ADDRESS_LINE_PATTERN) ?? matchMunicipalityLine(singleLine);
    if (match !== null) {
      const text = match.groups.value.replace(ADDRESS_TRAILING_PATTERN, '').trim();
      addresses.push({ index, text, hasStreetNumber: HAS_STREET_NUMBER_PATTERN.test(text) });
      return;
    }
    const facility = matchFacilityLine(singleLine);
    if (facility !== '') {
      facilities.push({ index, text: facility });
    }
  });

  /** 指定した行の近くにある、もう一方の候補を探す */
  const findNear = (candidates, index) =>
    candidates.find((candidate) => Math.abs(candidate.index - index) <= FACILITY_ADDRESS_MAX_LINE_DISTANCE);

  const streetAddress = addresses.find((address) => address.hasStreetNumber);
  if (streetAddress !== undefined) {
    const facility = findNear(facilities, streetAddress.index);
    return facility !== undefined && !streetAddress.text.includes(facility.text)
      ? `${facility.text} ${streetAddress.text}`
      : streetAddress.text;
  }
  if (facilities.length > 0) {
    const area = findNear(addresses, facilities[0].index);
    return area !== undefined ? `${facilities[0].text} ${area.text}` : facilities[0].text;
  }
  return addresses[0]?.text ?? '';
}

/**
 * 行が件名・場所のラベルの行かどうか（次の行を値とみなしてよいかの判定に使う）。
 *
 * @param {string} line
 * @returns {boolean}
 */
function isAnyLabelLine(line) {
  return TITLE_LINE_PATTERN.test(line) || LOCATION_LINE_PATTERN.test(line) || ADDRESS_LABEL_LINE_PATTERN.test(line);
}

/**
 * 文章の中から、オンライン会議の URL を1つ選ぶ。会議サービスの URL があればそれを、なければ最初の https の URL を選ぶ。
 *
 * @param {string} text 半角にそろえた文章
 * @returns {{href: string, isKnownMeetingService: boolean} | null} 見つからなければ null
 */
function findMeetingUrl(text) {
  const urls = [];
  for (const match of joinWrappedUrls(text).matchAll(HTTPS_URL_PATTERN)) {
    const parsed = parseMeetingUrl(trimTrailingPunctuation(match[0]));
    if (parsed !== null) {
      urls.push(parsed);
    }
  }
  return urls.find((url) => url.isKnownMeetingService) ?? urls[0] ?? null;
}

/**
 * 行の途中で折り返された URL を、1行につなげる（画面の幅が狭いメール・スマートフォンの画面の写しなど）。
 * 例：「https://zoom.us/j/0000000000?」の次の行が「pwd=EXAMPLE」→ https://zoom.us/j/0000000000?pwd=EXAMPLE
 *
 * 誤ってつながないよう、次の条件をすべて満たすときだけつなげる。
 *   - 行が URL で終わる
 *   - 次の行が URL に使える半角の文字だけでできている（空白・日本語を含まない）。https:// で始まる行（別の URL）は除く
 *   - 1行目が「? & = / #」で終わる、次の行が「? & # /」で始まる、または次の行に「=」がある（クエリの続きらしい）
 *
 * @param {string} text 半角にそろえた文章
 * @returns {string} 折り返しをつなげた文章（URL を探すためだけに使う。入力欄の文章は変えない）
 */
function joinWrappedUrls(text) {
  const lines = text.split(/\r?\n/);
  const joinedLines = [];
  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    let joinedCount = 0;
    while (joinedCount < MAX_URL_CONTINUATION_LINES && index + 1 < lines.length) {
      const continuation = findUrlContinuation(line, lines[index + 1]);
      if (continuation === null) {
        break;
      }
      line = line.trimEnd() + continuation;
      index += 1;
      joinedCount += 1;
    }
    joinedLines.push(line);
  }
  return joinedLines.join('\n');
}

/**
 * 次の行が、この行の末尾の URL の続きなら、その続きの文字列を返す。
 *
 * @param {string} line URL で終わるかを調べる行
 * @param {string} nextLine 次の行
 * @returns {string | null} 続きの文字列。続きでなければ null
 */
function findUrlContinuation(line, nextLine) {
  const urlMatch = URL_AT_LINE_END_PATTERN.exec(line.trimEnd());
  if (urlMatch === null) {
    return null; // 行が URL で終わっていない
  }
  const continuationMatch = URL_CONTINUATION_LINE_PATTERN.exec(nextLine);
  if (continuationMatch === null) {
    return null; // 次の行に空白・日本語がある、または空行
  }
  const continuation = continuationMatch[1];
  if (/^https?:/i.test(continuation)) {
    return null; // 別の URL
  }
  const looksContinued =
    URL_CONTINUES_AFTER_PATTERN.test(urlMatch[0]) ||
    URL_CONTINUATION_START_PATTERN.test(continuation) ||
    continuation.includes('=');
  return looksContinued ? continuation : null;
}

/**
 * URL の文字列を検証し、会議サービスのものかを判定する。
 * 入力欄に利用者が書き換えた URL の検証にも使う。
 *   - https 以外、ユーザー名・パスワードを含むもの（https://zoom.us@偽サイト のようななりすまし）は不可
 *   - ホスト名にドットがないもの（本文の「https://zооm.us」が日本語以外の文字の手前で途切れた「https://z」など）は不可
 *   - 国際化ドメインは xn-- の形に直して返す（見た目が似た偽のドメインを見分けやすくする）
 *
 * @param {string} text URL の文字列
 * @returns {{href: string, hostname: string, isKnownMeetingService: boolean} | null} 使えない URL なら null。
 *   hostname は画面でサイト名として見せる（フィッシングの注意。国際化ドメインは xn-- の形）
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
  return { href: url.href, hostname: url.hostname, isKnownMeetingService: isMeetingHost(url.hostname) };
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
