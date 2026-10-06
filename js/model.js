// Data model: a single JSON document holding everything. Pure functions only (no DOM).

import { today } from './dates.js';

export const SCHEMA_VERSION = 1;

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const DEFAULT_SETTINGS = {
  className: '',
  defaultFrequencyDays: 30, // how often each student should get a 1:1 meeting
  staleDays: 30, // "no meeting lately" threshold
  meetingsPerDay: 2, // capacity used when spreading suggested meetings
  suggestionsCount: 10,
  workdays: [0, 1, 2, 3, 4, 5], // Sunday-Friday
};

export function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    students: [],
    goals: [],
    goalCompletions: [],
    meetings: [],
    topics: [],
  };
}

/** Bring a loaded document up to the current shape, filling in any missing fields. */
export function normalizeData(raw) {
  const d = { ...emptyData(), ...(raw || {}) };
  d.settings = { ...DEFAULT_SETTINGS, ...(raw?.settings || {}) };
  for (const key of ['students', 'goals', 'goalCompletions', 'meetings', 'topics']) {
    if (!Array.isArray(d[key])) d[key] = [];
  }
  d.students = d.students.map((s) => ({
    phones: [],
    email: '',
    address: '',
    org: '',
    notes: '',
    active: true,
    frequencyDays: null,
    nextMeeting: null,
    checkups: [],
    ...s,
  }));
  d.schemaVersion = SCHEMA_VERSION;
  return d;
}

export function newStudent(contact) {
  return {
    id: uid(),
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    fullName: contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(' '),
    phones: contact.phones || [],
    email: contact.email || '',
    address: contact.address || '',
    org: contact.org || '',
    notes: '',
    active: true,
    frequencyDays: null, // null = use the class default
    nextMeeting: null, // { date, time, note } explicitly scheduled by the teacher
    checkups: [], // [{ id, date, note, done }]
    createdAt: today(),
  };
}

function normName(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

/**
 * Merge imported contacts into the student list.
 * Existing students (matched by full name) get their contact details refreshed; notes etc. are kept.
 * Returns { added, updated } counts.
 */
export function mergeStudents(data, contacts) {
  let added = 0;
  let updated = 0;
  const byName = new Map(data.students.map((s) => [normName(s.fullName), s]));
  for (const c of contacts) {
    const key = normName(c.fullName);
    if (!key) continue;
    const existing = byName.get(key);
    if (existing) {
      for (const f of ['firstName', 'lastName', 'email', 'address', 'org']) {
        if (c[f]) existing[f] = c[f];
      }
      if (c.phones?.length) existing.phones = c.phones;
      existing.active = true;
      updated++;
    } else {
      const s = newStudent(c);
      data.students.push(s);
      byName.set(key, s);
      added++;
    }
  }
  return { added, updated };
}

export const GOAL_SCOPES = {
  student: 'אישית לתלמיד',
  everyone: 'אישית לכל תלמיד',
  class: 'כיתתית',
};

export const GOAL_OWNERS = {
  teacher: 'מטרה שלי (המחנך)',
  student: 'מטרה של התלמיד',
};

export const FREQUENCY_PRESETS = [
  { days: 7, label: 'כל שבוע' },
  { days: 14, label: 'כל שבועיים' },
  { days: 30, label: 'כל חודש' },
  { days: 60, label: 'כל חודשיים' },
  { days: 90, label: 'כל שלושה חודשים' },
  { days: 150, label: 'פעם במחצית' },
];

export function frequencyLabel(days) {
  const preset = FREQUENCY_PRESETS.find((p) => p.days === days);
  return preset ? preset.label : `כל ${days} ימים`;
}

export function newGoal(fields) {
  return {
    id: uid(),
    title: '',
    description: '',
    scope: 'everyone', // 'student' | 'everyone' | 'class'
    studentId: null, // for scope === 'student'
    owner: 'teacher', // for scope === 'student': 'teacher' | 'student'
    recurring: false,
    everyDays: 30,
    dueDate: null, // optional target date for one-time goals
    archived: false,
    createdAt: today(),
    ...fields,
  };
}

export const MEETING_TYPES = {
  regular: 'שיחה אישית',
  checkup: 'שיחת מעקב',
  discipline: 'שיחה משמעתית',
  academic: 'שיחה לימודית',
  other: 'אחר',
};
