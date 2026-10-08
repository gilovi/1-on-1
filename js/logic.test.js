import { test, assert } from 'vitest';
import { emptyData, mergeStudents, newGoal, normalizeData } from './model.js';
import {
  addTopic, goalStats, goalStatus, recordMeeting, reorderTopic, staleStudents,
  studentTopics, suggestMeetings, toggleGoal, setTopicDone, lastMeetingDate,
} from './logic.js';
import { addDays, nextWorkday, weekday } from './dates.js';

const REF = '2026-10-06'; // a Tuesday

function classOf(names) {
  const data = emptyData();
  mergeStudents(data, names.map((n) => ({ fullName: n, firstName: n.split(' ')[0], lastName: n.split(' ')[1] || '' })));
  return data;
}

test('mergeStudents adds new students and updates existing ones by name', () => {
  const data = classOf(['משה כהן']);
  data.students[0].notes = 'הערה';
  const r = mergeStudents(data, [
    { fullName: 'משה  כהן', email: 'a@b.c', phones: [{ label: 'אמא', number: '1' }] },
    { fullName: 'יוסף לוי' },
  ]);
  assert.deepEqual(r, { added: 1, updated: 1 });
  assert.strictEqual(data.students.length, 2);
  assert.strictEqual(data.students[0].notes, 'הערה');
  assert.strictEqual(data.students[0].email, 'a@b.c');
});

test('normalizeData fills in defaults for older documents', () => {
  const d = normalizeData({ students: [{ id: 'x', fullName: 'א ב', firstName: 'א', lastName: 'ב' }] });
  assert.strictEqual(d.settings.defaultFrequencyDays, 30);
  assert.deepEqual(d.students[0].checkups, []);
  assert.deepEqual(d.topics, []);
});

test('topics: add, urgent add, reorder and mark done', () => {
  const data = classOf(['משה כהן']);
  const sid = data.students[0].id;
  const a = addTopic(data, sid, 'א');
  const b = addTopic(data, sid, 'ב');
  const c = addTopic(data, sid, 'דחוף', { urgent: true });
  assert.deepEqual(studentTopics(data, sid).open.map((t) => t.text), ['דחוף', 'א', 'ב']);
  reorderTopic(data, b.id, 0);
  assert.deepEqual(studentTopics(data, sid).open.map((t) => t.text), ['ב', 'דחוף', 'א']);
  setTopicDone(data, c.id, true, REF);
  assert.deepEqual(studentTopics(data, sid).open.map((t) => t.text), ['ב', 'א']);
  assert.strictEqual(studentTopics(data, sid).done[0].id, c.id);
  setTopicDone(data, c.id, false);
  assert.deepEqual(studentTopics(data, sid).open.map((t) => t.text), ['ב', 'א', 'דחוף']);
  assert.ok(a);
});

test('one-time goal status and toggle', () => {
  const data = classOf(['משה כהן']);
  const sid = data.students[0].id;
  const g = newGoal({ title: 'x', scope: 'student', studentId: sid, createdAt: REF, dueDate: '2026-10-01' });
  data.goals.push(g);
  assert.strictEqual(goalStatus(data, g, sid, REF).overdue, true);
  toggleGoal(data, g.id, sid, REF);
  assert.strictEqual(goalStatus(data, g, sid, REF).done, true);
  toggleGoal(data, g.id, sid, REF);
  assert.strictEqual(goalStatus(data, g, sid, REF).done, false);
  assert.strictEqual(data.goalCompletions.length, 0);
});

test('recurring goal becomes due again after its period', () => {
  const data = classOf(['משה כהן']);
  const sid = data.students[0].id;
  const g = newGoal({ title: 'שיחה עם הורים', scope: 'everyone', recurring: true, everyDays: 30, createdAt: '2026-09-01' });
  data.goals.push(g);
  // first period: due but not overdue until 30 days after creation
  assert.deepEqual(
    { done: goalStatus(data, g, sid, '2026-09-20').done, overdue: goalStatus(data, g, sid, '2026-09-20').overdue },
    { done: false, overdue: false },
  );
  assert.strictEqual(goalStatus(data, g, sid, REF).overdue, true);
  toggleGoal(data, g.id, sid, '2026-09-10');
  assert.strictEqual(goalStatus(data, g, sid, '2026-09-20').done, true);
  assert.strictEqual(goalStatus(data, g, sid, '2026-10-10').done, false);
  assert.strictEqual(goalStatus(data, g, sid, '2026-10-10').nextDue, '2026-10-10');
  // unchecking a recurring goal only removes the current period completion
  toggleGoal(data, g.id, sid, '2026-10-12');
  toggleGoal(data, g.id, sid, '2026-10-12');
  assert.strictEqual(data.goalCompletions.length, 1);
});

test('class goals have a single class-wide target', () => {
  const data = classOf(['משה כהן', 'יוסף לוי']);
  const g = newGoal({ title: 'אווירה', scope: 'class', createdAt: REF });
  data.goals.push(g);
  toggleGoal(data, g.id, null, REF);
  const stats = goalStats(data, REF);
  assert.strictEqual(stats.perGoal[0].targets, 1);
  assert.strictEqual(stats.perGoal[0].done, 1);
});

test('recordMeeting applies its side effects', () => {
  const data = classOf(['משה כהן']);
  const s = data.students[0];
  const t = addTopic(data, s.id, 'נושא');
  const g = newGoal({ title: 'x', scope: 'student', studentId: s.id, owner: 'student', createdAt: REF });
  data.goals.push(g);
  s.nextMeeting = { date: REF, time: '', note: '' };
  s.checkups.push({ id: 'c1', date: '2026-10-05', note: '', done: false }, { id: 'c2', date: '2026-11-01', note: '', done: false });
  recordMeeting(data, { studentId: s.id, date: REF, summary: ' סיכום ', topicIds: [t.id], goalIds: [g.id], nextDate: '2026-11-03' });
  assert.strictEqual(data.meetings[0].summary, 'סיכום');
  assert.strictEqual(studentTopics(data, s.id).open.length, 0);
  assert.strictEqual(goalStatus(data, g, s.id, REF).done, true);
  assert.deepEqual(s.nextMeeting, { date: '2026-11-03', time: '', note: '' });
  assert.deepEqual(s.checkups.map((c) => c.done), [true, false]);
  assert.strictEqual(lastMeetingDate(data, s.id, REF), REF);
});

test('suggestMeetings spreads unscheduled students by capacity, skipping Saturdays', () => {
  const data = classOf(['א א', 'ב ב', 'ג ג', 'ד ד', 'ה ה', 'ו ו']);
  data.settings.meetingsPerDay = 2;
  const [s1, s2] = data.students;
  // s1 met recently -> due in the future; s2 has an explicit meeting
  recordMeeting(data, { studentId: s1.id, date: '2026-10-01' });
  s2.nextMeeting = { date: '2026-10-08', time: '10:00', note: '' };
  s2.checkups.push({ id: 'c', date: '2026-10-07', note: 'מעקב', done: false });

  const items = suggestMeetings(data, REF, 20);
  const byStudent = (id) => items.filter((i) => i.studentId === id);
  assert.strictEqual(byStudent(s2.id).length, 2);
  assert.strictEqual(byStudent(s1.id)[0].date, nextWorkday(addDays('2026-10-01', 30), data.settings.workdays));

  const perDay = {};
  for (const i of items) perDay[i.date] = (perDay[i.date] || 0) + 1;
  for (const [day, n] of Object.entries(perDay)) {
    assert.ok(n <= 2, `${day} has ${n}`);
    assert.notStrictEqual(weekday(day), 6, 'no meetings on Saturday');
  }
  // never-met students are suggested starting today
  assert.strictEqual(items[0].date, REF);
  // sorted by date
  assert.deepEqual(items.map((i) => i.date), [...items.map((i) => i.date)].sort());
});

test('staleStudents lists never-met first then the longest gap', () => {
  const data = classOf(['א א', 'ב ב', 'ג ג']);
  const [a, b, c] = data.students;
  recordMeeting(data, { studentId: a.id, date: '2026-08-01' });
  recordMeeting(data, { studentId: b.id, date: '2026-10-01' });
  const stale = staleStudents(data, REF);
  assert.deepEqual(stale.map((x) => x.student.id), [c.id, a.id]);
  assert.strictEqual(stale[1].days, 66);
});
