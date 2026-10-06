import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVCF, parseNameList } from '../js/vcf.js';

const sample = readFileSync(new URL('./fixtures/sample.vcf', import.meta.url), 'utf8');

test('parses names, contact details and labeled parent phones', () => {
  const contacts = parseVCF(sample);
  assert.equal(contacts.length, 3);
  const [moshe, yosef] = contacts;
  assert.equal(moshe.firstName, 'משה דוד');
  assert.equal(moshe.lastName, 'כהן');
  assert.equal(moshe.fullName, 'משה דוד כהן');
  assert.equal(moshe.org, 'בית ספר לדוגמה ט1');
  assert.equal(moshe.email, 'parent@example.com');
  assert.equal(moshe.address, 'הרצל 1/2 מיקוד 1234567, עיר לדוגמה');
  assert.deepEqual(moshe.phones, [
    { label: 'בית', number: '031111111' },
    { label: 'נייד', number: '0500000001' },
    { label: 'אמא', number: '0500000001' },
    { label: 'אבא', number: '0500000002' },
  ]);
  assert.equal(yosef.email, '');
  assert.equal(yosef.phones.length, 2);
});

test('decodes quoted-printable vCard 2.1 entries', () => {
  const avi = parseVCF(sample)[2];
  assert.equal(avi.fullName, 'אבי שמיר');
  assert.equal(avi.firstName, 'אבי');
  assert.equal(avi.lastName, 'שמיר');
  assert.deepEqual(avi.phones, [{ label: 'נייד', number: '0500000004' }]);
});

test('handles folded lines and CRLF', () => {
  const text = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:דני\r\n  רון\r\nEND:VCARD\r\n';
  const [c] = parseVCF(text);
  assert.equal(c.fullName, 'דני רון');
});

test('parses a plain name list and a CSV with header', () => {
  assert.deepEqual(
    parseNameList('משה כהן\nיוסף בן דוד לוי\n\n').map((c) => [c.firstName, c.lastName]),
    [['משה', 'כהן'], ['יוסף בן דוד', 'לוי']],
  );
  assert.deepEqual(
    parseNameList('שם משפחה,שם פרטי\nכהן,משה\n').map((c) => c.fullName),
    ['משה כהן'],
  );
});
