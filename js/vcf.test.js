import { test, assert } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseVCF, parseNameList } from './vcf.js';

const sample = readFileSync(new URL('./fixtures/sample.vcf', import.meta.url), 'utf8');

test('parses names, contact details and labeled parent phones', () => {
  const contacts = parseVCF(sample);
  assert.strictEqual(contacts.length, 3);
  const [moshe, yosef] = contacts;
  assert.strictEqual(moshe.firstName, 'משה דוד');
  assert.strictEqual(moshe.lastName, 'כהן');
  assert.strictEqual(moshe.fullName, 'משה דוד כהן');
  assert.strictEqual(moshe.org, 'בית ספר לדוגמה ט1');
  assert.strictEqual(moshe.email, 'parent@example.com');
  assert.strictEqual(moshe.address, 'הרצל 1/2 מיקוד 1234567, עיר לדוגמה');
  assert.deepEqual(moshe.phones, [
    { label: 'בית', number: '031111111' },
    { label: 'נייד', number: '0500000001' },
    { label: 'אמא', number: '0500000001' },
    { label: 'אבא', number: '0500000002' },
  ]);
  assert.strictEqual(yosef.email, '');
  assert.strictEqual(yosef.phones.length, 2);
});

test('decodes quoted-printable vCard 2.1 entries', () => {
  const avi = parseVCF(sample)[2];
  assert.strictEqual(avi.fullName, 'אבי שמיר');
  assert.strictEqual(avi.firstName, 'אבי');
  assert.strictEqual(avi.lastName, 'שמיר');
  assert.deepEqual(avi.phones, [{ label: 'נייד', number: '0500000004' }]);
});

test('handles folded lines and CRLF', () => {
  const text = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:דני\r\n  רון\r\nEND:VCARD\r\n';
  const [c] = parseVCF(text);
  assert.strictEqual(c.fullName, 'דני רון');
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
