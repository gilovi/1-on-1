// P2 / AC-Q5: CSP meta tag (v3 plan section 4.1), self-hosted fonts, no inline styles, dateInput wiring.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const CSP =
  "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style; font-src 'self'; img-src 'self' data:; connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/ https://oauth2.googleapis.com/revoke; frame-src https://accounts.google.com/gsi/; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";

const read = (f) => readFileSync(f, 'utf8');

describe.each(['index.html', 'privacy.html'])('%s CSP', (file) => {
  const src = read(file);

  it('has exactly one CSP meta tag with the section 4.1 string, byte for byte', () => {
    const tags = src.match(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/gi) || [];
    expect(tags.length).toBe(1);
    expect(tags[0]).toContain(`content="${CSP}"`);
  });

  it('puts the CSP meta before any script, stylesheet or font link', () => {
    const meta = src.search(/http-equiv="Content-Security-Policy"/i);
    expect(meta).toBeGreaterThan(-1);
    for (const re of [/<script/i, /<link\b/i]) {
      const at = src.search(re);
      if (at >= 0) expect(meta).toBeLessThan(at);
    }
  });

  it('has no inline script, style element, style attribute or inline event handler (the CSP would block them)', () => {
    expect(src).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(src).not.toMatch(/<style\b/i);
    expect(src).not.toMatch(/\sstyle\s*=/i);
    expect(src).not.toMatch(/\son[a-z]+\s*=/i);
  });
});

describe('fonts are self-hosted', () => {
  const GOOGLE_FONTS = ['fonts.google' + 'apis', 'fonts.g' + 'static'];

  const walk = (dir) =>
    readdirSync(dir).flatMap((n) => {
      if (['node_modules', '.git', 'docs', 'coverage'].includes(n)) return [];
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const textFiles = () => walk('.').filter((f) => /\.(html|css|js|json|webmanifest|md|yml)$/.test(f) && !/\.test\.js$/.test(f) && !/package-lock/.test(f));

  it('no shipped file references Google Fonts', () => {
    const hits = textFiles().filter((f) => GOOGLE_FONTS.some((h) => read(f).includes(h)));
    expect(hits).toEqual([]);
  });

  it('css/styles.css declares Rubik @font-face rules for 400, 500 and 700, with font-display: swap', () => {
    const css = read('css/styles.css');
    const faces = css.match(/@font-face\s*\{[^}]*\}/g) || [];
    expect(faces.length).toBeGreaterThan(0);
    const weights = new Set();
    for (const f of faces) {
      expect(f).toMatch(/font-family:\s*['"]?Rubik['"]?/);
      expect(f).toMatch(/font-display:\s*swap/);
      const w = f.match(/font-weight:\s*(\d+)/);
      if (w) weights.add(Number(w[1]));
    }
    for (const w of [400, 500, 700]) expect(weights.has(w), `weight ${w}`).toBe(true);
  });

  it('every @font-face url() is a local woff2 file that exists', () => {
    const css = read('css/styles.css');
    const urls = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].flatMap((m) => [...m[0].matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((u) => u[1]));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u, 'no remote font urls').not.toMatch(/^(https?:)?\/\//);
      expect(u).toMatch(/\.woff2$/);
      expect(existsSync(resolve(dirname('css/styles.css'), u)), u).toBe(true);
    }
  });

  it('ships the OFL licence text next to the fonts', () => {
    expect(existsSync('fonts')).toBe(true);
    const names = readdirSync('fonts');
    expect(names.some((n) => /^(OFL|LICEN[CS]E)/i.test(n))).toBe(true);
    expect(names.some((n) => /\.woff2$/.test(n))).toBe(true);
  });
});

describe('no inline style= in app code', () => {
  it('no non-test file under js/ contains a style= attribute in a template', () => {
    const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const hits = walk('js')
      .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
      .filter((f) => /\bstyle\s*=/.test(read(f)));
    expect(hits).toEqual([]);
  });
});

describe('dateInput is wired into the app', () => {
  it('js/app.js imports ui/dateInput.js and installs it', () => {
    const app = read('js/app.js');
    expect(app).toMatch(/from\s+['"]\.\/ui\/dateInput\.js['"]/);
    expect(app).toMatch(/installDateInput\s*\(/);
  });
});
