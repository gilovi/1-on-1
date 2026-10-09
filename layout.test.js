// P0 / AC-TL1: the legacy tests were moved next to the code; tests/ is gone.
import { it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';


const legacy = () => ['js/logic.test.js', 'js/vcf.test.js'];
const countTests = (f) => (readFileSync(f, 'utf8').match(/^\s*(test|it)(\.\w+)?\(/gm) || []).length;

it('tests/ no longer exists', () => {
  expect(existsSync('tests')).toBe(false);
});

it('the legacy logic and vcf tests live under js/', () => {
  const names = legacy().map((f) => f.replace(/\\/g, '/'));
  expect(names.some((f) => /(^|\/)logic\.test\.js$/.test(f))).toBe(true);
  expect(names.some((f) => /(vcf|vcard)[^/]*\.test\.js$/.test(f))).toBe(true);
});

it('exactly the 13 legacy test cases are in js/logic.test.js and js/vcf.test.js', () => {
  const total = legacy().reduce((n, f) => n + countTests(f), 0);
  expect(total).toBe(13);
});
