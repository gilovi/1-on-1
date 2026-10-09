// P2 / AC-Q2 (blind AC-65, AC-66): the name-list / CSV importer.
// Intended contract: parseNameList(text) returns { students: [{ firstName, lastName, contacts: null }], duplicates }.
import { describe, it, expect } from 'vitest';
import { parseNameList } from './nameList.js';

const names = (text) => parseNameList(text).students.map((s) => [s.firstName, s.lastName]);

describe('CSV (AC-65)', () => {
  it('handles a BOM, the header שם פרטי,שם משפחה and a quoted field containing a comma', () => {
    const text = '﻿שם פרטי,שם משפחה\r\nמשה,"כהן, הלוי"\r\nדנה,לוי\r\n';
    expect(names(text)).toEqual([['משה', 'כהן, הלוי'], ['דנה', 'לוי']]);
  });

  it('accepts the header first,last', () => {
    expect(names('first,last\nמשה,כהן\n')).toEqual([['משה', 'כהן']]);
  });

  it('accepts a single "name" column and splits each value', () => {
    expect(names('name\nמשה כהן\nדנה לוי\n')).toEqual([['משה', 'כהן'], ['דנה', 'לוי']]);
  });

  it('accepts swapped header order', () => {
    expect(names('שם משפחה,שם פרטי\nכהן,משה\n')).toEqual([['משה', 'כהן']]);
  });

  it('handles doubled quotes inside a quoted field', () => {
    expect(names('first,last\nמשה,"בן ""הגדול"""\n')).toEqual([['משה', 'בן "הגדול"']]);
  });

  it('students carry no contact data', () => {
    for (const s of parseNameList('first,last\nמשה,כהן\n').students) {
      expect(s.contacts ?? null).toBeNull();
      for (const k of ['email', 'address', 'phones']) expect(s).not.toHaveProperty(k);
    }
  });
});

describe('pasted list (AC-66)', () => {
  it('dedupes and reports one duplicate', () => {
    const r = parseNameList('יוסי כהן\n\n  דנה לוי \nיוסי כהן');
    expect(r.students.map((s) => `${s.firstName} ${s.lastName}`)).toEqual(['יוסי כהן', 'דנה לוי']);
    expect(r.duplicates).toBe(1);
  });

  it('treats different internal whitespace as the same name', () => {
    const r = parseNameList('יוסי כהן\nיוסי   כהן');
    expect(r.students.length).toBe(1);
    expect(r.duplicates).toBe(1);
  });

  it('reports duplicates = 0 when all names are unique', () => {
    expect(parseNameList('א ב\nג ד').duplicates).toBe(0);
  });
});

describe('existing name-list behaviour is preserved', () => {
  it('splits on the last word and keeps a multi-word first name', () => {
    expect(names('משה כהן\nיוסף בן דוד לוי\n\n')).toEqual([['משה', 'כהן'], ['יוסף בן דוד', 'לוי']]);
  });

  it('empty, whitespace-only and blank-line input gives no students', () => {
    for (const t of ['', '   ', '\n\n\r\n']) expect(parseNameList(t)).toEqual({ students: [], duplicates: 0 });
  });

  it('a single word is a first name with an empty last name', () => {
    expect(names('מושיק')).toEqual([['מושיק', '']]);
  });
});
