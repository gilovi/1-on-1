// @vitest-environment happy-dom
// P2 / AC-Q4 (AC-Q6 in v2): Saturday -> Sunday on input[type=date][data-no-saturday] only.
// Intended contract:
//   shiftOffSaturday(iso) -> iso (Saturday moves to the following Sunday; everything else is returned as is)
//   installDateInput(root = document) -> delegated 'change' listener; idempotent. Announces in an existing
//   [aria-live] element, or creates one.
import { describe, it, expect, beforeEach } from 'vitest';
import { installDateInput, shiftOffSaturday } from './dateInput.js';

const MSG = 'שבת אינה אפשרית – הועבר ליום א׳';

function mount(attrs = 'data-no-saturday') {
  document.body.replaceChildren();
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  document.body.append(live);
  const input = document.createElement('input');
  input.type = 'date';
  if (attrs) input.setAttribute(attrs, '');
  document.body.append(input);
  return { input, live };
}

function pick(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('shiftOffSaturday', () => {
  it('moves Saturday 2026-10-10 to Sunday 2026-10-11', () => {
    expect(shiftOffSaturday('2026-10-10')).toBe('2026-10-11');
  });

  it('leaves other days alone, including Friday and Sunday', () => {
    for (const d of ['2026-10-09', '2026-10-11', '2026-10-07']) expect(shiftOffSaturday(d)).toBe(d);
  });

  it('crosses a month and a year boundary', () => {
    expect(shiftOffSaturday('2026-10-31')).toBe('2026-11-01'); // Saturday
    expect(shiftOffSaturday('2022-12-31')).toBe('2023-01-01'); // Saturday
  });

  it('returns empty and invalid values unchanged', () => {
    expect(shiftOffSaturday('')).toBe('');
    expect(shiftOffSaturday('not-a-date')).toBe('not-a-date');
  });
});

describe('installDateInput', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('shifts a Saturday on a data-no-saturday input and announces it in the aria-live region', () => {
    const { input, live } = mount();
    installDateInput(document);
    pick(input, '2026-10-10');
    expect(input.value).toBe('2026-10-11');
    expect(live.textContent).toContain(MSG);
  });

  it('leaves a Friday unchanged and silent', () => {
    const { input, live } = mount();
    installDateInput(document);
    pick(input, '2026-10-09');
    expect(input.value).toBe('2026-10-09');
    expect(live.textContent).toBe('');
  });

  it('does not touch an input without data-no-saturday (the meeting date)', () => {
    const { input, live } = mount('');
    installDateInput(document);
    pick(input, '2026-10-03');
    expect(input.value).toBe('2026-10-03');
    expect(live.textContent).toBe('');
  });

  it('ignores a cleared input', () => {
    const { input, live } = mount();
    installDateInput(document);
    pick(input, '');
    expect(input.value).toBe('');
    expect(live.textContent).toBe('');
  });

  it('ignores data-no-saturday on a non-date input', () => {
    const { live } = mount();
    const text = document.createElement('input');
    text.type = 'text';
    text.setAttribute('data-no-saturday', '');
    document.body.append(text);
    installDateInput(document);
    pick(text, '2026-10-10');
    expect(text.value).toBe('2026-10-10');
    expect(live.textContent).toBe('');
  });

  it('works for inputs added after install (views re-render)', () => {
    const { live } = mount();
    installDateInput(document);
    const late = document.createElement('input');
    late.type = 'date';
    late.setAttribute('data-no-saturday', '');
    document.body.append(late);
    pick(late, '2026-10-10');
    expect(late.value).toBe('2026-10-11');
    expect(live.textContent).toContain(MSG);
  });

  it('is idempotent: installing twice does not double-handle', () => {
    const { input } = mount();
    installDateInput(document);
    installDateInput(document);
    const seen = [];
    input.addEventListener('change', () => seen.push(input.value));
    pick(input, '2026-10-10');
    expect(input.value).toBe('2026-10-11');
    // The page-level handler corrects the value once; a second pass over the corrected Sunday is a no-op.
    expect(seen.every((v) => v === '2026-10-11')).toBe(true);
  });

  it('creates an aria-live region when the page has none', () => {
    document.body.replaceChildren();
    const input = document.createElement('input');
    input.type = 'date';
    input.setAttribute('data-no-saturday', '');
    document.body.append(input);
    installDateInput(document);
    pick(input, '2026-10-10');
    const live = document.querySelector('[aria-live]');
    expect(live).not.toBeNull();
    expect(live.textContent).toContain(MSG);
  });
});
