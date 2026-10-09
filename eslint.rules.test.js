// P0 / AC-TL2: the lint rules that guard the single HTML sink and the layering.
// Runs the real eslint.config.js through the ESLint Node API.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { ESLint } from 'eslint';

const eslint = () => new ESLint({ overrideConfigFile: 'eslint.config.js' });

async function errors(code, filePath, ruleId) {
  const [res] = await eslint().lintText(code, { filePath });
  const fatal = res.messages.filter((m) => m.fatal);
  expect(fatal, JSON.stringify(fatal)).toEqual([]);
  return res.messages.filter((m) => m.severity === 2 && (!ruleId || m.ruleId === ruleId));
}

it('eslint.config.js exists at the repo root', () => {
  expect(existsSync('eslint.config.js')).toBe(true);
});

describe('innerHTML ban (AC-TL2)', () => {
  const code = 'export function f(el, x) { el.innerHTML = x; }\n';

  it('reports an error in a view', async () => {
    const e = await errors(code, 'js/views/x.js', 'no-restricted-properties');
    expect(e.length).toBe(1);
  });

  it('does not report in js/ui/html.js', async () => {
    expect(await errors(code, 'js/ui/html.js', 'no-restricted-properties')).toEqual([]);
  });

  it('also bans outerHTML and insertAdjacentHTML in views', async () => {
    const e1 = await errors('export const f = (el, x) => { el.outerHTML = x; };\n', 'js/views/x.js', 'no-restricted-properties');
    const e2 = await errors("export const f = (el, x) => el.insertAdjacentHTML('beforeend', x);\n", 'js/views/x.js', 'no-restricted-properties');
    expect(e1.length).toBe(1);
    expect(e2.length).toBe(1);
  });

  it('bans innerHTML outside views too (everywhere except html.js)', async () => {
    expect((await errors(code, 'js/app.js', 'no-restricted-properties')).length).toBe(1);
  });

  it('allows ordinary DOM code in a view', async () => {
    const ok = 'export const f = (el) => { el.textContent = "a"; return el.children.length; };\n';
    expect(await errors(ok, 'js/views/x.js')).toEqual([]);
  });
});

describe('raw import ban (AC-TL2)', () => {
  const imp = "import { raw } from '../ui/html.js';\nexport const f = () => raw('x');\n";

  it('reports an error when a view imports raw', async () => {
    const e = await errors(imp, 'js/views/x.js', 'no-restricted-imports');
    expect(e.length).toBe(1);
  });

  it('allows importing html and attr from html.js in a view', async () => {
    const ok = "import { html, attr } from '../ui/html.js';\nexport const f = () => html`<b${attr.bool('x', true)}></b>`;\n";
    expect(await errors(ok, 'js/views/x.js')).toEqual([]);
  });

  it('does not forbid raw inside js/ui/html.js itself', async () => {
    const own = 'class Raw {}\nconst raw = (s) => new Raw(s);\nexport const f = () => raw("x");\n';
    expect(await errors(own, 'js/ui/html.js')).toEqual([]);
  });
});

// Active from P3 (js/domain/ appears). Unskip then.
describe.skip('domain -> ui import ban (active from P3, AC-TL2)', () => {
  it.each(['../ui/html.js', '../storage/idb.js', '../sync/drive.js', '../app/boot.js'])(
    'reports an error when js/domain imports %s',
    async (spec) => {
      const e = await errors(`import * as m from '${spec}';\nexport default m;\n`, 'js/domain/x.js', 'no-restricted-imports');
      expect(e.length).toBe(1);
    },
  );

  it('allows js/domain to import another domain module', async () => {
    expect(await errors("import { a } from './dates.js';\nexport default a;\n", 'js/domain/x.js')).toEqual([]);
  });
});

// Active from P2 (style= lint rule).
describe('style= in template literals (active from P2)', () => {
  it('reports an error for style= inside an html`` template', async () => {
    const code = "import { html } from '../ui/html.js';\nexport const f = (n) => html`<div style=\"width:${n}%\"></div>`;\n";
    const e = await errors(code, 'js/views/x.js', 'no-restricted-syntax');
    expect(e.length).toBe(1);
  });

  it('allows templates without style=', async () => {
    const code = "import { html } from '../ui/html.js';\nexport const f = (n) => html`<div class=\"pct-${n}\"></div>`;\n";
    expect(await errors(code, 'js/views/x.js')).toEqual([]);
  });
});
