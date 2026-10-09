// @vitest-environment happy-dom
// P2 / AC-Q5: progressBar uses pct-* classes (steps of 5) instead of an inline style="width:..%".
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { progressBar } from './ui.js';
import { parseSafe } from './ui/html.js';

const fill = (rate) => {
  const frag = parseSafe(progressBar(rate, { label: 'x' }));
  return { root: frag.firstElementChild, fill: frag.querySelector('.progress-fill') };
};

describe('progressBar (AC-Q5)', () => {
  it('progressBar(0.63) renders class "progress-fill mid pct-65" and no style attribute', () => {
    const out = String(progressBar(0.63));
    expect(out).toContain('class="progress-fill mid pct-65"');
    expect(out).not.toMatch(/style\s*=/i);
  });

  it('rounds to the nearest 5', () => {
    expect(fill(0.62).fill.className).toBe('progress-fill mid pct-60');
    expect(fill(0.97).fill.className).toBe('progress-fill good pct-95');
    expect(fill(0.98).fill.className).toBe('progress-fill good pct-100');
  });

  it('covers the ends: 0, 1, null and undefined', () => {
    expect(fill(0).fill.className).toBe('progress-fill low pct-0');
    expect(fill(1).fill.className).toBe('progress-fill good pct-100');
    expect(fill(null).fill.className).toBe('progress-fill low pct-0');
    expect(fill(undefined).fill.className).toBe('progress-fill low pct-0');
  });

  it('clamps a rate above 1 to pct-100', () => {
    expect(fill(1.2).fill.classList.contains('pct-100')).toBe(true);
  });

  it('keeps the exact percentage and the label for assistive tech', () => {
    const { root } = fill(0.63);
    expect(root.getAttribute('role')).toBe('progressbar');
    expect(root.getAttribute('aria-valuenow')).toBe('63');
    expect(root.getAttribute('aria-label')).toBe('x');
  });

  it('no element in the output has a style attribute', () => {
    for (const r of [0, 0.3, 0.63, 1, null]) expect(parseSafe(progressBar(r)).querySelector('[style]')).toBeNull();
  });
});

describe('css/styles.css defines the pct-* classes', () => {
  const css = readFileSync('css/styles.css', 'utf8');

  it.each(Array.from({ length: 21 }, (_, i) => i * 5))('.pct-%i is defined with the matching width', (n) => {
    const m = css.match(new RegExp(`\\.pct-${n}\\s*\\{[^}]*width:\\s*${n}%`));
    expect(m, `.pct-${n} missing or wrong width`).not.toBeNull();
  });
});
