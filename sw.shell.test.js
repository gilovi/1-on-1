// P0 / AC-TL5 (blind AC-49): the service worker's SHELL list equals the shipped files.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [relative(root, p).split(sep).join('/')];
  });
}

const isTestOrFixture = (f) => /\.test\.js$/.test(f) || /(^|\/)fixtures\//.test(f) || /\.d\.ts$/.test(f);

function shell() {
  const src = readFileSync(join(root, 'sw.js'), 'utf8');
  const m = src.match(/const SHELL = \[([\s\S]*?)\];/);
  expect(m, 'SHELL array not found in sw.js').not.toBeNull();
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('sw.js SHELL (AC-TL5)', () => {
  const all = shell();
  const entries = all.filter((e) => e !== './');
  const shipped = [
    'index.html',
    'privacy.html',
    'manifest.webmanifest',
    ...walk(join(root, 'css')),
    ...walk(join(root, 'js')),
    ...walk(join(root, 'icons')),
    ...walk(join(root, 'fonts')),
  ].filter((f) => !isTestOrFixture(f));

  it('has no duplicates and includes the start URL', () => {
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('./');
  });

  it('lists only files that exist', () => {
    expect(entries.filter((e) => !existsSync(join(root, e)))).toEqual([]);
  });

  it('lists no test files or fixtures', () => {
    expect(entries.filter(isTestOrFixture)).toEqual([]);
  });

  it('equals the shipped files (no missing, no extra)', () => {
    expect([...entries].sort()).toEqual([...shipped].sort());
  });
});
