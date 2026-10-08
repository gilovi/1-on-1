// @vitest-environment happy-dom
// P0 / AC-TL3 and AC-TL4: the single HTML sink (parseSafe) and the boolean-attribute helper.
import { describe, it, expect } from 'vitest';
import { html, attr, parseSafe } from './html.js';

describe('parseSafe (AC-TL3)', () => {
  it('throws TypeError on a plain string', () => {
    expect(() => parseSafe('<b>')).toThrow(TypeError);
  });

  it.each([[null], [undefined], [42], [{}], [['<b>']], [{ s: '<b>', toString: () => '<b>' }]])(
    'throws TypeError on non-SafeHtml value %#',
    (v) => {
      expect(() => parseSafe(v)).toThrow(TypeError);
    },
  );

  it('yields one <b> whose text is the escaped literal <i>', () => {
    const frag = parseSafe(html`<b>${'<i>'}</b>`);
    expect(frag.childNodes.length).toBe(1);
    const b = frag.firstChild;
    expect(b.nodeName).toBe('B');
    expect(b.textContent).toBe('<i>');
    expect(b.children.length).toBe(0); // no <i> element was created
  });

  it('does not create elements or handlers from hostile interpolations', () => {
    const evil = '<img src=x onerror=alert(1)>"\'&';
    const frag = parseSafe(html`<p title="${evil}">${evil}</p>`);
    expect(frag.querySelector('img')).toBeNull();
    const p = frag.firstChild;
    expect(p.textContent).toBe(evil);
    expect(p.getAttribute('title')).toBe(evil);
  });

  it('parses several top-level nodes and an empty template', () => {
    expect(parseSafe(html`<i>a</i><u>b</u>`).childNodes.length).toBe(2);
    expect(parseSafe(html``).childNodes.length).toBe(0);
  });

  it('parses table rows (template semantics, not a div)', () => {
    const frag = parseSafe(html`<tr><td>x</td></tr>`);
    expect(frag.firstChild.nodeName).toBe('TR');
  });

  it('renders nested html`` fragments and arrays unescaped, but leaf strings escaped', () => {
    const items = ['a<', 'b'].map((t) => html`<li>${t}</li>`);
    const frag = parseSafe(html`<ul>${items}</ul>`);
    const lis = frag.querySelectorAll('li');
    expect(lis.length).toBe(2);
    expect(lis[0].textContent).toBe('a<');
  });
});

describe('html tag', () => {
  it('escapes & < > " \' and drops null/undefined/false', () => {
    const out = String(html`${'&<>"\''}|${null}|${undefined}|${false}`);
    expect(out).toBe('&amp;&lt;&gt;&quot;&#39;|||');
  });
});

describe('attr.bool (AC-TL4)', () => {
  it('returns a leading-space attribute when true', () => {
    expect(String(attr.bool('checked', true))).toBe(' checked');
  });

  it('returns the empty string when false', () => {
    expect(String(attr.bool('checked', false))).toBe('');
  });

  it('is usable inside html`` without being escaped', () => {
    const on = String(html`<input type="checkbox"${attr.bool('checked', true)}>`);
    const off = String(html`<input type="checkbox"${attr.bool('checked', false)}>`);
    expect(on).toBe('<input type="checkbox" checked>');
    expect(off).toBe('<input type="checkbox">');
  });

  it('treats falsy values (0, null, undefined, "") as false', () => {
    for (const v of [0, null, undefined, '']) expect(String(attr.bool('disabled', v))).toBe('');
  });

  it('does not export raw from the module (it is private)', async () => {
    const mod = await import('./html.js');
    expect(mod.raw).toBeUndefined();
  });
});
