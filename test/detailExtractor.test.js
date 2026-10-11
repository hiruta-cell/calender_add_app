/**
 * detailExtractor.test.js
 * 目的：件名・場所・オンライン会議 URL の下書き（src/core/detailExtractor.js）を確かめる。文面はすべて架空。
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
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

  test('ラベルだけの行なら次の行を使う（■会場 の次の行）', () => {
    assert.equal(extractEventDetails('■会場\n\n架空市中央1-2-3 架空ビル\n■持ち物').location, '架空市中央1-2-3 架空ビル');
  });

  test('次の行が別のラベルなら空', () => {
    assert.equal(extractEventDetails('場所：\n件名：定例会').location, '');
  });

  test('署名の「住所」は場所にしない', () => {
    assert.equal(extractEventDetails('住所：架空県架空市1-1').location, '');
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
