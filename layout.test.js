// P0 / AC-TL1: the legacy tests were moved next to the code; tests/ is gone.
import { it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const legacy = () => walk('js').filter((f) => /\.test\.js$/.test(f) && !/ui[\\/]html\.test\.js$/.test(f));
const countTests = (f) => (readFileSync(f, 'utf8').match(/^\s*(test|it)(\.\w+)?\(/gm) || []).length;

it('tests/ no longer exists', () => {
  expect(existsSync('tests')).toBe(false);
});

it('the legacy logic and vcf tests live under js/', () => {
  const names = legacy().map((f) => f.replace(/\\/g, '/'));
  expect(names.some((f) => /(^|\/)logic\.test\.js$/.test(f))).toBe(true);
  expect(names.some((f) => /(vcf|vcard)[^/]*\.test\.js$/.test(f))).toBe(true);
});

it('all 13 legacy test cases are still present under js/**', () => {
  const total = legacy().reduce((n, f) => n + countTests(f), 0);
  expect(total).toBeGreaterThanOrEqual(13);
});
