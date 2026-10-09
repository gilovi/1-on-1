// P2 / AC-Q1 (blind AC-54 to AC-60): the minimizing vCard importer.
// Intended contract (see the qa report): parseVCard(text, { includePhones = false }) returns
//   { students: [{ firstName, lastName, contacts }], report: { skipped } }
// where `contacts` is null unless includePhones is true and at least one of the three allowed phones exists,
// and then has only the keys studentCell, motherPhone and fatherPhone. The parser has no fields at all for
// EMAIL, ADR or non-allowed phones: they are dropped during parsing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseVCard } from './vcard.js';

const sample = readFileSync(new URL('../fixtures/sample.vcf', import.meta.url), 'utf8');
const card = (...lines) => ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD', ''].join('\r\n');
const one = (text, opts) => parseVCard(text, opts).students[0];

describe('unfolding and encoding (AC-54)', () => {
  it('unfolds a CRLF folded FN into "יוסי כהן"', () => {
    const s = one(card('FN:יוסי \r\n כהן'));
    expect([s.firstName, s.lastName]).toEqual(['יוסי', 'כהן']);
  });

  it('parses LF-only input and a leading BOM identically', () => {
    const crlf = card('FN:יוסי \r\n כהן');
    const lf = crlf.replace(/\r\n/g, '\n');
    const bom = '﻿' + crlf;
    expect(parseVCard(lf)).toEqual(parseVCard(crlf));
    expect(parseVCard(bom)).toEqual(parseVCard(crlf));
    expect(parseVCard(bom).students.length).toBe(1);
  });
});

describe('names (AC-55, AC-56)', () => {
  it('reads N as last;first', () => {
    const s = one(card('N:כהן;יוסי;;;'));
    expect(s).toMatchObject({ lastName: 'כהן', firstName: 'יוסי' });
  });

  it('honours escaped separators in N', () => {
    const s = one(card('N:ab\\,c;d\\;e'));
    expect(s.lastName).toBe('ab,c');
    expect(s.firstName).toBe('d;e');
  });

  it('splits FN when N is missing, keeping a "בן" family name together', () => {
    const s = one(card('FN:דוד בן חיים'));
    expect(s.firstName).toBe('דוד');
    expect(s.lastName).toBe('בן חיים');
  });

  it('skips a card with neither N nor FN and counts it', () => {
    const r = parseVCard(card('TEL;TYPE=CELL:0500000001', 'EMAIL:a@b.com') + card('FN:דנה לוי'));
    expect(r.students.length).toBe(1);
    expect(r.report.skipped).toBe(1);
  });

  it('reports skipped = 0 when every card has a name', () => {
    expect(parseVCard(card('FN:דנה לוי')).report.skipped).toBe(0);
  });
});

describe('quoted-printable (AC-57)', () => {
  it('decodes a QP UTF-8 FN', () => {
    const s = one(card('FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D7=99=D7=95=D7=A1=D7=99'));
    expect(s.firstName).toBe('יוסי');
  });

  it('joins a QP soft line break (= at end of line)', () => {
    const s = one(card('FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D7=99=D7=95=\r\n=D7=A1=D7=99'));
    expect(s.firstName).toBe('יוסי');
  });
});

describe('phones are opt-in (AC-58, AC-59)', () => {
  const tel = (...lines) => card('N:כהן;יוסי;;;', ...lines);

  it('item1.TEL + X-ABLabel אמא gives motherPhone, raw, only with includePhones', () => {
    const text = tel('item1.TEL:050-1234567', 'item1.X-ABLabel:אמא');
    expect(one(text, { includePhones: true }).contacts).toEqual({ motherPhone: '050-1234567' });
  });

  it('contacts is null when includePhones is false or omitted', () => {
    const text = tel('item1.TEL:050-1234567', 'item1.X-ABLabel:אמא', 'TEL;TYPE=CELL:0501111111');
    expect(one(text, { includePhones: false }).contacts).toBeNull();
    expect(one(text).contacts).toBeNull();
    expect(JSON.stringify(parseVCard(text))).not.toMatch(/\d{7}/);
  });

  it('maps אבא to fatherPhone and _$!<Mother>!$_ / _$!<Father>!$_ to mother / father', () => {
    const text = tel(
      'item1.TEL:0502222222',
      'item1.X-ABLabel:אבא',
      'item2.TEL:0503333333',
      'item2.X-ABLabel:_$!<Mother>!$_',
    );
    expect(one(text, { includePhones: true }).contacts).toEqual({ fatherPhone: '0502222222', motherPhone: '0503333333' });
    const father = tel('item1.TEL:0504444444', 'item1.X-ABLabel:_$!<Father>!$_');
    expect(one(father, { includePhones: true }).contacts).toEqual({ fatherPhone: '0504444444' });
  });

  it('drops phones under any other label', () => {
    const text = tel('item1.TEL:0505555555', 'item1.X-ABLabel:סבתא', 'TEL;TYPE=WORK:0396666666', 'TEL;TYPE=HOME:0397777777');
    const s = one(text, { includePhones: true });
    expect(JSON.stringify(s)).not.toMatch(/\d{7}/);
    expect(Object.keys(s.contacts ?? {})).toEqual([]);
  });

  it('TEL;TYPE=CELL gives studentCell, raw, including a +972 number', () => {
    const s = one(tel('TEL;TYPE=CELL:+972501234567'), { includePhones: true });
    expect(s.contacts).toEqual({ studentCell: '+972501234567' });
  });

  it('first match wins when a role appears twice', () => {
    const s = one(tel('TEL;TYPE=CELL:0501000001', 'TEL;TYPE=CELL:0501000002'), { includePhones: true });
    expect(s.contacts.studentCell).toBe('0501000001');
  });

  it('contacts only ever has the three allowed keys', () => {
    const s = one(
      tel('TEL;TYPE=CELL:0501', 'item1.TEL:0502', 'item1.X-ABLabel:אמא', 'item2.TEL:0503', 'item2.X-ABLabel:אבא', 'TEL;TYPE=HOME:0504'),
      { includePhones: true },
    );
    expect(Object.keys(s.contacts).sort()).toEqual(['fatherPhone', 'motherPhone', 'studentCell']);
  });
});

describe('data minimization (AC-60)', () => {
  const text = card(
    'N:לוי;דנה;;;',
    'ADR;TYPE=HOME:;;רחוב הדוגמה 5;תל אביב;;;',
    'EMAIL:a@b.com',
    'TEL;TYPE=HOME:021234567',
    'TEL;TYPE=WORK:039999999',
    'TEL;TYPE=CELL:0501234567',
  );

  it.each([true, false])('output (includePhones=%s) contains no email, address, home or work number', (includePhones) => {
    const out = JSON.stringify(parseVCard(text, { includePhones }));
    expect(out).not.toContain('a@b.com');
    expect(out).not.toContain('רחוב הדוגמה');
    expect(out).not.toContain('021234567');
    expect(out).not.toContain('039999999');
  });

  it('a student object has no email, address or phones fields', () => {
    const s = one(text, { includePhones: true });
    for (const k of ['email', 'address', 'phones']) expect(s).not.toHaveProperty(k);
  });
});

describe('sample.vcf (AC-Q1)', () => {
  it('with includePhones:false the output has no parent email, street, home number or any phone digits', () => {
    const out = JSON.stringify(parseVCard(sample, { includePhones: false }));
    expect(out).not.toContain('parent@example.com');
    expect(out).not.toContain('הרצל');
    expect(out).not.toContain('031111111');
    expect(out).not.toMatch(/\d{5,}/);
  });

  it('with includePhones:true moshe.contacts is exactly cell, mother and father', () => {
    const { students } = parseVCard(sample, { includePhones: true });
    expect(students.length).toBe(3);
    const moshe = students[0];
    expect(moshe.firstName).toBe('משה דוד');
    expect(moshe.lastName).toBe('כהן');
    expect(moshe.contacts).toEqual({ studentCell: '0500000001', motherPhone: '0500000001', fatherPhone: '0500000002' });
    expect(JSON.stringify(students)).not.toContain('031111111');
    expect(JSON.stringify(students)).not.toContain('parent@example.com');
  });

  it('decodes the QP vCard 2.1 card in the sample', () => {
    const avi = parseVCard(sample).students[2];
    expect([avi.firstName, avi.lastName]).toEqual(['אבי', 'שמיר']);
  });
});

describe('malformed input', () => {
  it('returns no students for empty text, whitespace and non-vCard text', () => {
    for (const t of ['', '   \n\n', 'hello world', 'FN:no begin marker']) {
      expect(parseVCard(t)).toMatchObject({ students: [], report: { skipped: 0 } });
    }
  });

  it('does not throw on an unterminated card or a line without a colon', () => {
    expect(() => parseVCard('BEGIN:VCARD\r\nFN:דנה לוי\r\n')).not.toThrow();
    expect(() => parseVCard(card('garbage line', 'FN:דנה לוי'))).not.toThrow();
    expect(parseVCard(card('garbage line', 'FN:דנה לוי')).students.length).toBe(1);
  });
});
