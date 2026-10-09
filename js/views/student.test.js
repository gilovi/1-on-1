// @vitest-environment happy-dom
// P2 / divergence D7 (contact card shows only נייד/אמא/אבא) and AC-Q4 (which date inputs carry data-no-saturday).
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from './student.js';
import { recurrenceFields } from './common.js';
import { emptyData, newStudent } from '../model.js';
import { parseSafe } from '../ui/html.js';

function setup({ student = {}, ui = {}, meetings = [] } = {}) {
  const data = emptyData();
  const s = newStudent({ firstName: 'משה', lastName: 'כהן', ...student });
  data.students.push(s);
  data.meetings.push(...meetings.map((m) => ({ studentId: s.id, type: 'regular', summary: '', ...m })));
  const ctx = { store: { data }, params: { id: s.id }, query: {}, ui: { ...ui } };
  document.body.replaceChildren(parseSafe(render(ctx)));
  return { s, data, ctx };
}

beforeEach(() => document.body.replaceChildren());

describe('contact card (D7)', () => {
  const phones = [
    { label: 'בית', number: '031111111' },
    { label: 'נייד', number: '0500000001' },
    { label: 'אמא', number: '0500000002' },
    { label: 'אבא', number: '0500000003' },
    { label: 'עבודה', number: '039999999' },
    { label: 'ראשי', number: '0488888888' },
  ];

  it('lists exactly the נייד, אמא and אבא phones as tel: links', () => {
    setup({ student: { phones, email: 'parent@example.com', address: 'הרצל 1' } });
    const card = document.querySelector('details.contact');
    const links = [...card.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['tel:0500000001', 'tel:0500000002', 'tel:0500000003']);
    const text = card.textContent;
    for (const label of ['נייד', 'אמא', 'אבא']) expect(text).toContain(label);
    for (const hidden of ['031111111', '039999999', '0488888888']) expect(text).not.toContain(hidden);
  });

  it('shows no email and no address even when the student record has them', () => {
    setup({ student: { phones, email: 'parent@example.com', address: 'הרצל 1' } });
    const card = document.querySelector('details.contact');
    expect(card.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(card.textContent).not.toContain('parent@example.com');
    expect(card.textContent).not.toContain('הרצל');
    expect(document.body.textContent).not.toContain('parent@example.com');
  });

  it('shows no phones list when the student has only other phones', () => {
    setup({ student: { phones: [{ label: 'בית', number: '031111111' }] } });
    const card = document.querySelector('details.contact');
    expect(card.querySelector('a[href^="tel:"]')).toBeNull();
    expect(card.textContent).not.toContain('031111111');
  });

  it('still renders the card (name edit, delete) for a student with no phones at all', () => {
    setup();
    const card = document.querySelector('details.contact');
    expect(card).not.toBeNull();
    expect(card.querySelector('form[data-form="student.editDetails"]')).not.toBeNull();
  });
});

describe('data-no-saturday placement (AC-Q4)', () => {
  const marked = (el) => el !== null && el.hasAttribute('data-no-saturday');

  it('is on the schedule and checkup date inputs', () => {
    setup();
    expect(marked(document.querySelector('form[data-form="student.schedule"] input[name="date"]'))).toBe(true);
    expect(marked(document.querySelector('form[data-form="student.addCheckup"] input[name="date"]'))).toBe(true);
  });

  it('is on nextDate and NOT on the meeting-date input in the new-meeting form', () => {
    const data = emptyData();
    const s = newStudent({ firstName: 'משה', lastName: 'כהן' });
    data.students.push(s);
    const ctx = { store: { data }, params: { id: s.id }, query: {}, ui: { meetingFormFor: s.id } };
    document.body.replaceChildren(parseSafe(render(ctx)));
    const form = document.querySelector('form[data-form="student.addMeeting"]');
    expect(form).not.toBeNull();
    expect(marked(form.querySelector('input[name="nextDate"]'))).toBe(true);
    const meetingDate = form.querySelector('input[name="date"]');
    expect(meetingDate).not.toBeNull();
    expect(marked(meetingDate)).toBe(false);
  });

  it('is NOT on the date input when editing an existing meeting', () => {
    const data = emptyData();
    const s = newStudent({ firstName: 'משה', lastName: 'כהן' });
    data.students.push(s);
    data.meetings.push({ id: 'm1', studentId: s.id, date: '2026-10-03', type: 'regular', summary: '' });
    const ctx = { store: { data }, params: { id: s.id }, query: {}, ui: { editMeeting: 'm1' } };
    document.body.replaceChildren(parseSafe(render(ctx)));
    const input = document.querySelector('form[data-form="student.saveMeeting"] input[name="date"]');
    expect(input).not.toBeNull();
    expect(marked(input)).toBe(false);
  });

  it('is on the goal due-date input (recurrenceFields)', () => {
    document.body.replaceChildren(parseSafe(recurrenceFields({})));
    expect(marked(document.querySelector('input[name="dueDate"]'))).toBe(true);
  });
});
