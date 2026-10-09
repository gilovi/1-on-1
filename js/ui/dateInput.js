// Date inputs marked data-no-saturday never keep a Saturday (no school meetings on Shabbat): the value moves to
// the following Sunday and the change is announced. The meeting date itself is deliberately not marked.

const MESSAGE = 'שבת אינה אפשרית – הועבר ליום א׳';
const installed = new WeakSet();

/** @param {string} iso YYYY-MM-DD; Saturday returns the next day, anything else is returned unchanged. */
export function shiftOffSaturday(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCDay() !== 6) return iso;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function announce(doc, message) {
  let live = doc.querySelector('[aria-live]');
  if (!live) {
    live = doc.createElement('div');
    live.setAttribute('aria-live', 'polite');
    live.className = 'sr-only';
    doc.body.append(live);
  }
  live.textContent = message;
}

/** Install one delegated, idempotent (capturing) change listener for input[type=date][data-no-saturday]. */
export function installDateInput(root = document) {
  if (installed.has(root)) return;
  installed.add(root);
  // Capture phase: the value is corrected before any other handler on the input sees it.
  root.addEventListener(
    'change',
    (e) => {
      const t = /** @type {HTMLInputElement} */ (e.target);
      if (!t?.matches?.('input[type=date][data-no-saturday]') || !t.value) return;
      const shifted = shiftOffSaturday(t.value);
      if (shifted === t.value) return;
      t.value = shifted;
      announce(t.ownerDocument, MESSAGE);
    },
    true,
  );
}
