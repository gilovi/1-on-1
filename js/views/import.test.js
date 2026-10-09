// @vitest-environment happy-dom
// P2 / AC-Q1 and AC-Q3, divergence D8: the import preview has an unchecked phones opt-in checkbox, and
// confirming without it stores students with no phones, email or address (v1 shape: student.phones[]).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, handlers } from './import.js';
import { emptyData } from '../model.js';
import { parseSafe } from '../ui/html.js';

const sample = readFileSync('js/fixtures/sample.vcf', 'utf8');

function makeCtx() {
  const data = emptyData();
  return {
    data,
    store: {
      data,
      update: (fn) => fn(data),
    },
    ui: { importPreview: null },
    rerender: vi.fn(),
    navigate: vi.fn(),
  };
}

function pasteForm(text) {
  const form = document.createElement('form');
  const ta = document.createElement('textarea');
  ta.name = 'text';
  ta.value = text;
  form.append(ta);
  return form;
}

/** Render the view into the document and return the confirm form. */
function mountConfirm(ctx) {
  document.body.replaceChildren(parseSafe(render(ctx)));
  return document.querySelector('form[data-form="import.confirm"]');
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('preview checkbox (D8, AC-Q3)', () => {
  it('is absent before there is a preview', () => {
    const ctx = makeCtx();
    document.body.replaceChildren(parseSafe(render(ctx)));
    expect(document.querySelector('input[name="includePhones"]')).toBeNull();
  });

  it('is present, unchecked and labelled "ייבוא טלפונים" once a vCard is previewed', () => {
    const ctx = makeCtx();
    handlers['import.paste'](ctx, pasteForm(sample));
    const form = mountConfirm(ctx);
    const cb = form.querySelector('input[type="checkbox"][name="includePhones"]');
    expect(cb).not.toBeNull();
    expect(cb.checked).toBe(false);
    expect(cb.closest('label').textContent).toContain('ייבוא טלפונים');
  });

  it('is not part of the student selection group (name is not idx)', () => {
    const ctx = makeCtx();
    handlers['import.paste'](ctx, pasteForm(sample));
    const form = mountConfirm(ctx);
    expect(form.querySelectorAll('input[name="idx"]').length).toBe(3);
    expect(form.querySelector('input[name="includePhones"]').getAttribute('name')).not.toBe('idx');
  });
});

describe('what the preview holds (AC-Q1)', () => {
  it('previews the three students without email, address or home phone', () => {
    const ctx = makeCtx();
    handlers['import.paste'](ctx, pasteForm(sample));
    expect(ctx.ui.importPreview.length).toBe(3);
    const dump = JSON.stringify(ctx.ui.importPreview);
    expect(dump).not.toContain('parent@example.com');
    expect(dump).not.toContain('הרצל');
    expect(dump).not.toContain('031111111');
    const shown = mountConfirm(ctx).textContent;
    expect(shown).not.toContain('parent@example.com');
    expect(shown).not.toContain('031111111');
  });

  it('a pasted name list previews names and shows the plain list', () => {
    const ctx = makeCtx();
    handlers['import.paste'](ctx, pasteForm('יוסי כהן\nדנה לוי\nיוסי כהן'));
    expect(ctx.ui.importPreview.length).toBe(2);
  });
});

describe('confirm', () => {
  function confirm({ phones }) {
    const ctx = makeCtx();
    handlers['import.paste'](ctx, pasteForm(sample));
    const form = mountConfirm(ctx);
    form.querySelector('input[name="includePhones"]').checked = phones;
    handlers['import.confirm'](ctx, form);
    return ctx;
  }

  it('without the checkbox stores three students with no phones, email or address', () => {
    const { data } = confirm({ phones: false });
    expect(data.students.length).toBe(3);
    for (const s of data.students) {
      expect(s.phones).toEqual([]);
      expect(s.email).toBe('');
      expect(s.address).toBe('');
    }
    const dump = JSON.stringify(data);
    expect(dump).not.toContain('parent@example.com');
    expect(dump).not.toContain('הרצל');
    expect(dump).not.toMatch(/\d{7}/);
  });

  it('with the checkbox stores only נייד, אמא and אבא (in that order) and never the home phone', () => {
    const { data } = confirm({ phones: true });
    const moshe = data.students.find((s) => s.firstName === 'משה דוד');
    expect(moshe.phones).toEqual([
      { label: 'נייד', number: '0500000001' },
      { label: 'אמא', number: '0500000001' },
      { label: 'אבא', number: '0500000002' },
    ]);
    const yosef = data.students.find((s) => s.lastName === 'לוי');
    expect(yosef.phones).toEqual([
      { label: 'נייד', number: '0500000003' },
      { label: 'אמא', number: '0500000003' },
    ]);
    const dump = JSON.stringify(data);
    expect(dump).not.toContain('031111111');
    expect(dump).not.toContain('parent@example.com');
    expect(dump).not.toContain('הרצל');
  });

  it('navigates to the students list and clears the preview', () => {
    const ctx = confirm({ phones: false });
    expect(ctx.ui.importPreview).toBeNull();
    expect(ctx.navigate).toHaveBeenCalledWith('#/students');
  });

  it('a pasted names-only list stores students with no phones even when the box is ticked', () => {
    const ctx = makeCtx();
    handlers['import.paste'](ctx, pasteForm('יוסי כהן\nדנה לוי'));
    const form = mountConfirm(ctx);
    const cb = form.querySelector('input[name="includePhones"]');
    if (cb) cb.checked = true;
    handlers['import.confirm'](ctx, form);
    expect(ctx.data.students.map((s) => s.phones)).toEqual([[], []]);
  });
});
