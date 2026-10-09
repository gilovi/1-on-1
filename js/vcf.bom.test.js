// P0 review finding #1: the v1 parser stripped the literal text "FEFF" instead of the BOM character U+FEFF.
// These cases live in their own file so the 13 legacy cases in vcf.test.js stay exactly 13 (layout.test.js).
import { test, assert } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseVCF, parseNameList } from './vcf.js';

const sample = readFileSync(new URL('./fixtures/sample.vcf', import.meta.url), 'utf8');
const BOM = '﻿';

test('parseVCF strips a leading BOM', () => {
  assert.strictEqual(parseVCF(BOM + sample).length, 3);
  assert.deepEqual(parseVCF(BOM + sample).map((c) => c.fullName), parseVCF(sample).map((c) => c.fullName));
});

test('parseNameList strips a leading BOM', () => {
  assert.strictEqual(parseNameList(BOM + 'משה כהן\nדנה לוי')[0].fullName, 'משה כהן');
});

test('parseNameList strips a leading BOM before a CSV header', () => {
  assert.deepEqual(parseNameList(BOM + 'שם פרטי,שם משפחה\nמשה,כהן\n').map((c) => c.fullName), ['משה כהן']);
});

test('parseNameList keeps a name that literally starts with the text FEFF', () => {
  assert.strictEqual(parseNameList('FEFFAlice')[0].fullName, 'FEFFAlice');
});

test('parseVCF does not strip the text FEFF from the start of a card line', () => {
  const [c] = parseVCF('BEGIN:VCARD\nFN:FEFFAlice\nEND:VCARD');
  assert.strictEqual(c.fullName, 'FEFFAlice');
});
