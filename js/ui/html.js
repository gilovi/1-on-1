// The single HTML sink. Templates built with html`` escape every interpolated value; the only way to
// put markup into the DOM is parseSafe()/setHTML(), which accept nothing but a SafeHtml produced here.
// This is the only module allowed to touch innerHTML (enforced by lint).

class SafeHtml {
  /** @param {string} s */
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

// Only objects minted here are trusted; membership (not instanceof) is what makes SafeHtml unforgeable.
const minted = new WeakSet();

/** Private: wrap trusted markup. Not exported on purpose. */
const raw = (s) => {
  const v = Object.freeze(new SafeHtml(String(s)));
  minted.add(v);
  return v;
};

const isSafe = (v) => typeof v === 'object' && v !== null && minted.has(v);

const EMPTY = raw('');

/** @param {unknown} s */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** @param {unknown} v */
function fmt(v) {
  if (v === null || v === undefined || v === false) return '';
  if (isSafe(v)) return /** @type {SafeHtml} */ (v).s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}

/**
 * Tagged template: interpolated values are escaped unless they are nested html`` results or arrays of them.
 * Only usable as a tag; any other call shape throws.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 */
export function html(strings, ...values) {
  if (!Array.isArray(strings) || !Object.isFrozen(strings) || !Array.isArray(strings.raw)) {
    throw new TypeError('html must be used as a tagged template');
  }
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += fmt(values[i]);
  });
  return raw(out);
}

const BOOL_ATTRS = new Set(['checked', 'selected', 'disabled', 'hidden', 'open', 'required', 'readonly', 'multiple']);

export const attr = {
  /**
   * A boolean HTML attribute, with a leading space, for use inside a tag in html``.
   * @param {string} name one of the allowlisted boolean attributes
   * @param {unknown} cond
   */
  bool: (name, cond) => {
    if (!BOOL_ATTRS.has(name)) throw new TypeError(`attr.bool: unsupported attribute "${name}"`);
    return cond ? raw(` ${name}`) : EMPTY;
  },
};

/**
 * Parse SafeHtml into a DocumentFragment (template semantics).
 * @param {unknown} safe
 * @returns {DocumentFragment}
 */
export function parseSafe(safe) {
  if (!isSafe(safe)) throw new TypeError('parseSafe expects the result of html``');
  const t = document.createElement('template');
  t.innerHTML = /** @type {SafeHtml} */ (safe).s;
  return t.content;
}

/**
 * Replace an element's children with the parsed SafeHtml.
 * @param {Element} el
 * @param {unknown} safe
 */
export function setHTML(el, safe) {
  el.replaceChildren(parseSafe(safe));
}

/** Empty an element. */
export function clearHTML(el) {
  el.replaceChildren();
}
