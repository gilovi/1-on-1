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

/** Private: wrap trusted markup. Not exported on purpose. */
const raw = (s) => new SafeHtml(String(s));

/** @param {unknown} s */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** @param {unknown} v */
function fmt(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}

/**
 * Tagged template: interpolated values are escaped unless they are nested html`` results or arrays of them.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += fmt(values[i]);
  });
  return new SafeHtml(out);
}

export const attr = {
  /**
   * A boolean HTML attribute, with a leading space, for use inside a tag in html``.
   * @param {string} name
   * @param {unknown} cond
   */
  bool: (name, cond) => (cond ? raw(` ${name}`) : raw('')),
};

/**
 * Parse SafeHtml into a DocumentFragment (template semantics).
 * @param {unknown} safe
 * @returns {DocumentFragment}
 */
export function parseSafe(safe) {
  if (!(safe instanceof SafeHtml)) throw new TypeError('parseSafe expects the result of html``');
  const t = document.createElement('template');
  t.innerHTML = safe.s;
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
