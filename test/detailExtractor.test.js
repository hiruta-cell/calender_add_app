/**
 * detailExtractor.test.js
 * 目的：件名・場所・オンライン会議 URL の下書き（src/core/detailExtractor.js）を確かめる。文面はすべて架空。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MAX_TITLE_LENGTH } from '../src/core/calendarUrl.js';
import { extractEventDetails, parseMeetingUrl } from '../src/core/detailExtractor.js';

describe('件名', () => {
  test('「件名：」「Subject:」「【件名】」「■タイトル」の行から取り出す', () => {
    assert.equal(extractEventDetails('件名：【架空】定例会のご案内').title, '【架空】定例会のご案内');
    assert.equal(extractEventDetails('Subject: Weekly sync').title, 'Weekly sync');
    assert.equal(extractEventDetails('【件名】第3回 勉強会').title, '第3回 勉強会');
    assert.equal(extractEventDetails('■タイトル：秋の交流会').title, '秋の交流会');
  });

  test('返信・転送の印（Re: Fw: 転送:）を取り除く', () => {
    assert.equal(extractEventDetails('件名: Re: Fw: 定例会').title, '定例会');
    assert.equal(extractEventDetails('件名：転送：定例会').title, '定例会');
  });

  test('ラベルがなければ空。文の途中の「件名は」は使わない', () => {
    assert.equal(extractEventDetails('定例会のご案内です').title, '');
    assert.equal(extractEventDetails('件名は追って連絡します').title, '');
  });
});

describe('場所', () => {
  test('「場所：」「会場：」「開催場所：」「Location:」の行から取り出す', () => {
    assert.equal(extractEventDetails('場所：会議室A').location, '会議室A');
    assert.equal(extractEventDetails('会場: 架空ホール 3F').location, '架空ホール 3F');
    assert.equal(extractEventDetails('開催場所：オンライン').location, 'オンライン');
    assert.equal(extractEventDetails('Location: Room 101').location, 'Room 101');
  });

  test('値の先頭の「・」「：」「_」を除く（OCR で記号が入った場合など）', () => {
    assert.equal(extractEventDetails('場所:・オンライン(Zoom)').location, 'オンライン(Zoom)');
    assert.equal(extractEventDetails('Location: _ Room 101').location, 'Room 101');
  });

  test('ラベルだけの行なら次の行を使う（■会場 の次の行）', () => {
    assert.equal(extractEventDetails('■会場\n\n架空市中央1-2-3 架空ビル\n■持ち物').location, '架空市中央1-2-3 架空ビル');
  });

  test('次の行が別のラベルなら空', () => {
    assert.equal(extractEventDetails('場所：\n件名：定例会').location, '');
  });

  test('「住所：」「所在地：」の行は、場所の見出しがないときに使う', () => {
    assert.equal(extractEventDetails('秋の観察会\n住所：宮城県架空市中央1-2-3').location, '宮城県架空市中央1-2-3');
    assert.equal(extractEventDetails('所在地：架空市中央1-1 架空公民館').location, '架空市中央1-1 架空公民館');
    assert.equal(extractEventDetails('会場：架空ホール\n住所：宮城県架空市中央1-2-3').location, '架空ホール');
  });

  test('署名のまとまり（メールアドレス、または会社名と TEL）の「住所」は場所にしない', () => {
    const mail = ['10月20日(火) 14時にお伺いします。', '', '架空商事株式会社 例田', '住所：宮城県架空市中央1-1', 'TEL：000-0000-0000'].join('\n');
    assert.equal(extractEventDetails(mail).location, '');
    const withEmail = ['10月20日(火) 14時', '', '例田 太郎', '宮城県架空市中央1-1', 'taro@example.com'].join('\n');
    assert.equal(extractEventDetails(withEmail).location, '');
    const afterSeparator = ['10月20日(火) 14時', '--', '例田 太郎', '宮城県架空市中央1-1'].join('\n');
    assert.equal(extractEventDetails(afterSeparator).location, '');
  });
});

describe('場所：見出しのない住所（催しの一覧のページ・OCR）', () => {
  test('都道府県＋市区町村で始まる行を使う。「 / 分類」は除く', () => {
    const text = ['架空の音楽祭2026', '宮城県登米市 / 芸術鑑賞・自然観賞', '開催中', '2026年10月11日(日)'].join('\n');
    assert.equal(extractEventDetails(text).location, '宮城県登米市');
  });

  test('番地のある住所を、地域だけの行より優先する', () => {
    const text = ['こども探偵事務所', '宮城県塩竈市 / 芸術鑑賞・自然観賞 , ものづくり・学び体験', '2026年10月11日(日)', '宮城県塩竈市本町8-1講習室'].join('\n');
    assert.equal(extractEventDetails(text).location, '宮城県塩竈市本町8-1講習室');
  });

  test('OCR でアイコンが化けた文字（Q・暫・9）や郵便番号を読み飛ばし、画面の別の欄（2つ以上の空白の後）は除く', () => {
    assert.equal(extractEventDetails('Q宮城県登米市/芸術鑑賞・自然観賞て大人気!').location, '宮城県登米市');
    assert.equal(extractEventDetails('暫宮城県塩竈市本町8-1講習室').location, '宮城県塩竈市本町8-1講習室');
    assert.equal(extractEventDetails('〒980-0000 宮城県仙台市青葉区架空町1-1').location, '宮城県仙台市青葉区架空町1-1');
    assert.equal(extractEventDetails('宮城県仙台市若林区架空1-1    屋内で遊ぼう').location, '宮城県仙台市若林区架空1-1');
  });

  test('文の途中の都道府県名や、市区町村が続かないものは使わない', () => {
    assert.equal(extractEventDetails('この音楽祭は宮城県登米市にある能舞台で開催します').location, '');
    assert.equal(extractEventDetails('宮城県子ども・親子おでかけ情報').location, '');
    assert.equal(extractEventDetails('10月20日(火) 14時 定例会').location, '');
  });

  test('県名のない住所：市区町村で始まり、番地が続く行', () => {
    assert.equal(extractEventDetails('塩竈市本町8-1講習室').location, '塩竈市本町8-1講習室');
    assert.equal(extractEventDetails('仙台市青葉区架空町1-2-3 架空ビル').location, '仙台市青葉区架空町1-2-3 架空ビル');
    assert.equal(extractEventDetails('柴田郡大河原町架空1-1').location, '柴田郡大河原町架空1-1');
    assert.equal(extractEventDetails('さいたま市中央区架空1丁目').location, 'さいたま市中央区架空1丁目');
    assert.equal(extractEventDetails('架空市中央123番地').location, '架空市中央123番地');
  });

  test('県名のない住所：市区町村だけで行末・「 / 分類」で終わる行（催しの一覧の地域の表示）', () => {
    assert.equal(extractEventDetails('登米市 / 芸術鑑賞・自然観賞').location, '登米市');
    assert.equal(extractEventDetails('Q登米市/芸術鑑賞').location, '登米市');
    assert.equal(extractEventDetails('9仙台市若林区/自然体験').location, '仙台市若林区');
    const list = ['こども探偵事務所', '塩竈市 / 芸術鑑賞・自然観賞', '2026年10月11日(日)', '塩竈市本町8-1講習室'].join('\n');
    assert.equal(extractEventDetails(list).location, '塩竈市本町8-1講習室');
  });

  test('県名のない住所と取り違えやすい行は使わない（日付・時刻・文のつながりが続く）', () => {
    for (const text of ['朝市10月20日', '朝市 10月20日', '登米市にある能舞台', '仙台市で10-20歳が対象', '仙台市民会館で開催', '仙台市内 14:00', '市民センターで集合', '町内会の集まり']) {
      assert.equal(extractEventDetails(text).location, '', text);
    }
  });

  test('署名のまとまりの県名のない住所も使わない', () => {
    const mail = ['10月20日(火) 14時にお伺いします。', '', '架空商事株式会社 例田', '架空市中央1-1', 'TEL：000-0000-0000'].join('\n');
    assert.equal(extractEventDetails(mail).location, '');
  });

  test('施設名だけの行（会館・センター・美術館・舞台など。部屋・階が続いてもよい）', () => {
    assert.equal(extractEventDetails('架空市民会館').location, '架空市民会館');
    assert.equal(extractEventDetails('架空国際センター 会議棟2F').location, '架空国際センター 会議棟2F');
    assert.equal(extractEventDetails('■架空美術館').location, '架空美術館');
    assert.equal(extractEventDetails('架空の森舞台').location, '架空の森舞台');
    const notice = ['定例会のお知らせ', '10月20日(火) 14時', '架空公民館 第1会議室'].join('\n');
    assert.equal(extractEventDetails(notice).location, '架空公民館 第1会議室');
  });

  test('施設名の近くに住所があれば並べる（番地のある住所・地域だけの住所）', () => {
    assert.equal(extractEventDetails('架空市民会館\n架空市中央1-1').location, '架空市民会館 架空市中央1-1');
    assert.equal(extractEventDetails('架空ホール\n登米市 / 芸術鑑賞').location, '架空ホール 登米市');
    const far = ['架空ホール', 'a', 'b', 'c', 'd', '架空市中央1-1'].join('\n');
    assert.equal(extractEventDetails(far).location, '架空市中央1-1');
  });

  test('施設名と取り違えやすい行は使わない（文・題名・日付・問い合わせの窓口）', () => {
    for (const text of ['架空センターで開催します', '新しい図書館ができました。', '10月20日 架空ホール', '「森の美術館」へ行こう', 'お客様センター', 'サポートセンターからのお知らせ', '定例会のご案内']) {
      assert.equal(extractEventDetails(text).location, '', text);
    }
  });

  test('署名のまとまりの施設名（会社名と TEL）も使わない', () => {
    const mail = ['10月20日(火) 14時にお伺いします。', '', '架空商事株式会社 架空センター', 'TEL：000-0000-0000'].join('\n');
    assert.equal(extractEventDetails(mail).location, '');
  });

  test('「場所：」「会場は〜です」があればそちらを優先する', () => {
    assert.equal(extractEventDetails('場所：架空ホール\n宮城県架空市中央1-1').location, '架空ホール');
    assert.equal(extractEventDetails('会場は架空公民館です。\n宮城県架空市中央1-1').location, '架空公民館');
  });

  test('長い文章でも処理が重くならない', () => {
    const text = `${'宮城県'.repeat(3000)}\n${'Q'.repeat(10000)}`;
    const startedAt = performance.now();
    extractEventDetails(text);
    assert.ok(performance.now() - startedAt < 500);
  });

  test('場所に書かれた URL は会議 URL の欄に任せ、場所からは除く', () => {
    const details = extractEventDetails('場所：オンライン https://zoom.us/j/0000000000');
    assert.equal(details.location, 'オンライン');
    assert.equal(details.meetingUrl, 'https://zoom.us/j/0000000000');
  });
});

describe('オンライン会議の URL', () => {
  test('会議サービスの URL を優先する（他の URL より後にあっても）', () => {
    const text = '詳細：https://example.com/info\n参加URL：https://us02web.zoom.us/j/0000000000?pwd=example';
    const details = extractEventDetails(text);
    assert.equal(details.meetingUrl, 'https://us02web.zoom.us/j/0000000000?pwd=example');
    assert.equal(details.isKnownMeetingService, true);
  });

  test('Google Meet・Teams も会議サービスとして扱う', () => {
    assert.equal(extractEventDetails('https://meet.google.com/aaa-bbbb-ccc').isKnownMeetingService, true);
    assert.equal(extractEventDetails('https://teams.microsoft.com/l/meetup-join/xyz').isKnownMeetingService, true);
  });

  test('会議サービスがなければ最初の https の URL（会議サービスではない印付き）', () => {
    const details = extractEventDetails('申込：https://example.com/form');
    assert.equal(details.meetingUrl, 'https://example.com/form');
    assert.equal(details.isKnownMeetingService, false);
  });

  test('日本語や句読点・括弧の手前で止める', () => {
    assert.equal(extractEventDetails('https://zoom.us/j/1からご参加ください').meetingUrl, 'https://zoom.us/j/1');
    assert.equal(extractEventDetails('（https://zoom.us/j/1）').meetingUrl, 'https://zoom.us/j/1');
    assert.equal(extractEventDetails('URL: https://zoom.us/j/1.').meetingUrl, 'https://zoom.us/j/1');
  });

  test('http の URL・なりすましの URL は使わない', () => {
    assert.equal(extractEventDetails('http://zoom.us/j/1').meetingUrl, '');
    assert.equal(extractEventDetails('https://zoom.us@evil.example/j/1').meetingUrl, '');
    const lookalike = extractEventDetails('https://zoom.us.evil.example/j/1');
    assert.equal(lookalike.isKnownMeetingService, false);
  });

  test('見た目の似た国際化ドメイン（о はキリル文字）は本文から取り出さない。入力欄では xn-- の形にする', () => {
    assert.equal(extractEventDetails('https://zооm.us/j/1').meetingUrl, '');
    const parsed = parseMeetingUrl('https://zооm.us/j/1');
    assert.match(parsed.href, /^https:\/\/xn--/);
    assert.equal(parsed.isKnownMeetingService, false);
  });

  test('URL がなければ空', () => {
    assert.equal(extractEventDetails('明日の会議').meetingUrl, '');
  });
});

describe('parseMeetingUrl：入力欄の URL の検証', () => {
  test('https の URL だけを受け付ける', () => {
    assert.equal(parseMeetingUrl('https://zoom.us/j/1')?.isKnownMeetingService, true);
    assert.equal(parseMeetingUrl('javascript:alert(1)'), null);
    assert.equal(parseMeetingUrl('ftp://example.com'), null);
    assert.equal(parseMeetingUrl(''), null);
    assert.equal(parseMeetingUrl(`https://example.com/${'a'.repeat(1000)}`), null);
  });

  test('サイト名（ホスト名）を返す。国際化ドメインは xn-- の形（フィッシングの注意で見せる）', () => {
    assert.equal(parseMeetingUrl('https://us02web.zoom.us/j/1')?.hostname, 'us02web.zoom.us');
    assert.equal(parseMeetingUrl('https://Example.COM/a')?.hostname, 'example.com');
    const lookalike = parseMeetingUrl('https://zооm.us/j/1'); // о はキリル文字（見た目が似た偽のドメイン）
    assert.ok(lookalike?.hostname.startsWith('xn--'));
    assert.equal(lookalike?.isKnownMeetingService, false);
  });
});

describe('件名の上限（依頼者の指示：50文字）', () => {
  test('上限は50文字', () => {
    assert.equal(MAX_TITLE_LENGTH, 50);
  });

  test('長い件名の下書きは50文字で切る（全角も1文字と数える）', () => {
    const longTitle = `【架空】${'あ'.repeat(80)}`;
    const { title } = extractEventDetails(`件名：${longTitle}\n日時：10月15日 14時`);
    assert.equal(title.length, MAX_TITLE_LENGTH);
    assert.equal(title, longTitle.slice(0, MAX_TITLE_LENGTH));
  });

  test('50文字ちょうどの件名は切らない', () => {
    const title = 'い'.repeat(MAX_TITLE_LENGTH);
    assert.equal(extractEventDetails(`件名：${title}`).title, title);
  });
});

describe('見出しのラベルがないお知らせ（依頼者の指摘）', () => {
  test('縦書きのお知らせ：見出しを件名に、「会場は〜です」から場所を取り出す', () => {
    const details = extractEventDetails('定例会のお知らせ\n十月二十九日(木)午後二時から\n会場は第二会議室です');
    assert.equal(details.title, '定例会のお知らせ');
    assert.equal(details.location, '第二会議室');
  });

  test('「場所は〜で行います」「集合場所は〜です。」も場所にする。文の途中にあってもよい', () => {
    assert.equal(extractEventDetails('場所はZoomで行います').location, 'Zoom');
    assert.equal(extractEventDetails('集合場所は架空駅の東口です。').location, '架空駅の東口');
    assert.equal(extractEventDetails('日時は10月29日、会場は第二会議室です。お気軽にどうぞ。').location, '第二会議室');
  });

  test('場所を言い切っていない文や、別の言葉の一部の「場所は」からは取り出さない', () => {
    assert.equal(extractEventDetails('場所は追って連絡します').location, '');
    assert.equal(extractEventDetails('会場は第二会議室ですが、変更になるかもしれません').location, '');
    assert.equal(extractEventDetails('駐車場所は近くの駐車場です').location, '');
    assert.equal(extractEventDetails('会場は第二会議室、持ち物は筆記用具です').location, '');
  });

  test('「開催決定！」「のご案内」で終わる短い行も件名にする（全角の！は半角になる）。挨拶の文は件名にしない', () => {
    assert.equal(extractEventDetails('勉強会 開催決定！\n11月7日(土)').title, '勉強会 開催決定!');
    assert.equal(extractEventDetails('お世話になっております。\n秋の交流会のご案内').title, '秋の交流会のご案内');
    assert.equal(extractEventDetails('◆防災訓練のお知らせ◆').title, '◆防災訓練のお知らせ◆');
    assert.equal(extractEventDetails('お世話になっております。\nよろしくお願いします。').title, '');
  });

  test('見出しを探すのは先頭の5行まで。長すぎる行は見出しにしない', () => {
    assert.equal(extractEventDetails('1行目\n2行目\n3行目\n4行目\n5行目\n定例会のお知らせ').title, '');
    assert.equal(extractEventDetails(`${'あ'.repeat(40)}のお知らせ`).title, '');
  });

  test('見出しの先頭の Re: も取り除く', () => {
    assert.equal(extractEventDetails('Re: 定例会のご連絡').title, '定例会のご連絡');
  });

  test('ラベル付きの行があれば、そちらを優先する', () => {
    const details = extractEventDetails('件名：第3回 定例会\n定例会のお知らせ\n場所：会議室A\n会場は第二会議室です');
    assert.equal(details.title, '第3回 定例会');
    assert.equal(details.location, '会議室A');
  });

  test('長い入力でも時間がかからない（ReDoS 対策）', () => {
    const started = performance.now();
    extractEventDetails(`会場は${'あ'.repeat(19990)}`);
    extractEventDetails('場所は'.repeat(6000));
    assert.ok(performance.now() - started < 1000);
  });
});

describe('総合：架空のメール', () => {
  test('件名・場所・URL をまとめて取り出す', () => {
    const text = [
      '件名：【架空】第3回 定例会のご案内',
      '日時：10月15日(木)14時〜15時',
      '場所：オンライン（Zoom）',
      '参加URL：https://zoom.us/j/0000000000?pwd=example',
    ].join('\n');
    assert.deepEqual(extractEventDetails(text), {
      title: '【架空】第3回 定例会のご案内',
      location: 'オンライン(Zoom)',
      meetingUrl: 'https://zoom.us/j/0000000000?pwd=example',
      isKnownMeetingService: true,
    });
  });
});
