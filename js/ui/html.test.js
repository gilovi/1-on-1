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

// P0 review findings #2 to #5 (docs/plans/2026-10-09-p0-review.md): SafeHtml must be unforgeable and immutable,
// html must only work as a tagged template, and attr.bool must only emit allowlisted attribute names.
const PAYLOAD = '<img src=x onerror=1>';

/** Run a forgery attempt; an attempt that throws is a rejection, which is fine. Returns the object or null. */
function attempt(make) {
  try {
    return make();
  } catch {
    return null;
  }
}

describe('SafeHtml cannot be forged (review #2)', () => {
  const forgeries = {
    'new (html``.constructor)(payload)': () => new (html``.constructor)(PAYLOAD),
    'Object.create(proto) with .s set': () => Object.assign(Object.create(Object.getPrototypeOf(html``)), { s: PAYLOAD }),
  };

  for (const [name, make] of Object.entries(forgeries)) {
    it(`parseSafe rejects ${name}`, () => {
      const forged = attempt(make);
      if (forged === null) return;
      expect(() => parseSafe(forged)).toThrow(TypeError);
    });

    it(`html escapes ${name} when interpolated`, () => {
      const forged = attempt(make);
      if (forged === null) return;
      const out = String(html`<p>${forged}</p>`);
      expect(out).not.toContain('<img');
    });
  }
});

describe('SafeHtml is immutable (review #3)', () => {
  it('assigning .s either throws or has no effect on what parseSafe creates', () => {
    const h = html`<b>x</b>`;
    try {
      h.s = PAYLOAD;
    } catch {
      return; // frozen: strict-mode assignment threw
    }
    const frag = parseSafe(h);
    expect(frag.querySelector('img')).toBeNull();
    expect(frag.querySelector('b')).not.toBeNull();
  });

  it('a minted SafeHtml is frozen', () => {
    expect(Object.isFrozen(html`<b>x</b>`)).toBe(true);
  });
});

describe('html only works as a tagged template (review #4)', () => {
  it('a plain array call throws TypeError', () => {
    expect(() => html([PAYLOAD])).toThrow(TypeError);
  });

  it('an array with a fake raw property throws TypeError', () => {
    expect(() => html(Object.assign([PAYLOAD], { raw: [PAYLOAD] }))).toThrow(TypeError);
  });

  it('a string argument throws TypeError', () => {
    expect(() => html(PAYLOAD)).toThrow(TypeError);
  });

  it('a real tagged template still works', () => {
    expect(String(html`<b>${'a'}</b>`)).toBe('<b>a</b>');
  });
});

describe('attr.bool validates the attribute name (review #5)', () => {
  it('throws TypeError for a name that smuggles another attribute', () => {
    expect(() => attr.bool('x onmouseover=alert(4)', true)).toThrow(TypeError);
  });

  it.each(['onclick', 'foo', '', 'checked disabled', 'CHECKED"'])('throws TypeError for %j', (name) => {
    expect(() => attr.bool(name, true)).toThrow(TypeError);
  });

  it('validates the name even when the condition is false', () => {
    expect(() => attr.bool('x onmouseover=alert(4)', false)).toThrow(TypeError);
  });

  it.each(['checked', 'selected', 'disabled', 'hidden', 'open', 'required', 'readonly', 'multiple'])('allows %s', (name) => {
    expect(String(attr.bool(name, true))).toBe(` ${name}`);
    expect(String(attr.bool(name, false))).toBe('');
  });
});
