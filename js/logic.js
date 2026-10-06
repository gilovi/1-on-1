// Queries and mutations over the data document. Pure functions (no DOM), unit-tested in tests/.

import { addDays, diffDays, maxDate, nextWorkday, today } from './dates.js';
import { uid } from './model.js';

/* ---------------------------------------------------------------- students & meetings */

export function activeStudents(data) {
  return data.students
    .filter((s) => s.active !== false)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'he') || a.firstName.localeCompare(b.firstName, 'he'));
}

export function getStudent(data, id) {
  return data.students.find((s) => s.id === id) || null;
}

export function studentMeetings(data, studentId) {
  return data.meetings
    .filter((m) => m.studentId === studentId)
    .sort((a, b) => (a.date === b.date ? (b.createdAt || '').localeCompare(a.createdAt || '') : b.date.localeCompare(a.date)));
}

export function lastMeetingDate(data, studentId, ref = today()) {
  let last = null;
  for (const m of data.meetings) {
    if (m.studentId === studentId && m.date <= ref && (!last || m.date > last)) last = m.date;
  }
  return last;
}

export function studentFrequency(data, student) {
  return Number(student.frequencyDays) || Number(data.settings.defaultFrequencyDays) || 30;
}

/** When should this student's next regular meeting be? */
export function studentDueDate(data, student, ref = today()) {
  if (student.nextMeeting?.date) return { date: student.nextMeeting.date, explicit: true };
  const last = lastMeetingDate(data, student.id, ref);
  if (!last) return { date: ref, explicit: false, never: true };
  return { date: addDays(last, studentFrequency(data, student)), explicit: false };
}

/* ---------------------------------------------------------------- topics */

export function studentTopics(data, studentId) {
  const all = data.topics.filter((t) => t.studentId === studentId);
  const open = all.filter((t) => !t.done).sort((a, b) => a.order - b.order);
  const done = all.filter((t) => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  return { open, done };
}

export function addTopic(data, studentId, text, { urgent = false } = {}) {
  const { open } = studentTopics(data, studentId);
  const order = urgent
    ? (open.length ? open[0].order : 0) - 1
    : (open.length ? open[open.length - 1].order : 0) + 1;
  const topic = { id: uid(), studentId, text: text.trim(), order, done: false, doneAt: null, createdAt: today() };
  data.topics.push(topic);
  return topic;
}

/** Move an open topic to a new index within the student's open topics list. */
export function reorderTopic(data, topicId, newIndex) {
  const topic = data.topics.find((t) => t.id === topicId);
  if (!topic) return;
  const { open } = studentTopics(data, topic.studentId);
  const list = open.filter((t) => t.id !== topicId);
  const idx = Math.max(0, Math.min(newIndex, list.length));
  list.splice(idx, 0, topic);
  list.forEach((t, i) => {
    t.order = i + 1;
  });
}

export function setTopicDone(data, topicId, done, date = today(), meetingId = null) {
  const topic = data.topics.find((t) => t.id === topicId);
  if (!topic) return;
  topic.done = done;
  topic.doneAt = done ? date : null;
  topic.meetingId = done ? meetingId : null;
  if (!done) {
    const { open } = studentTopics(data, topic.studentId);
    topic.order = (open.filter((t) => t.id !== topicId).at(-1)?.order ?? 0) + 1;
  }
}

/* ---------------------------------------------------------------- goals */

/** Which "targets" a goal applies to: student ids, or [null] for a class-wide goal. */
export function goalTargets(data, goal) {
  if (goal.scope === 'class') return [null];
  if (goal.scope === 'student') {
    const s = getStudent(data, goal.studentId);
    return s && s.active !== false ? [s.id] : [];
  }
  return activeStudents(data).map((s) => s.id);
}

export function goalCompletions(data, goalId, studentId) {
  return data.goalCompletions
    .filter((c) => c.goalId === goalId && (c.studentId ?? null) === (studentId ?? null))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Status of a goal for one target.
 *  done      - completed (one-time) / completed within the current period (recurring)
 *  lastDone  - date of the last completion
 *  nextDue   - for recurring goals: when it is due again; for one-time: the optional target date
 *  overdue   - not done and past its due date
 */
export function goalStatus(data, goal, studentId, ref = today()) {
  const comps = goalCompletions(data, goal.id, studentId).filter((c) => c.date <= ref);
  const lastDone = comps.length ? comps[comps.length - 1].date : null;
  if (!goal.recurring) {
    const done = comps.length > 0;
    const nextDue = goal.dueDate || null;
    return { done, lastDone, nextDue, overdue: !done && !!nextDue && nextDue < ref, count: comps.length };
  }
  const every = Number(goal.everyDays) || 30;
  // A new recurring goal gets one full period for its first completion.
  const nextDue = addDays(lastDone || goal.createdAt || ref, every);
  const done = !!lastDone && ref < nextDue;
  return { done, lastDone, nextDue, overdue: !done && nextDue < ref, count: comps.length };
}

export function goalsForStudent(data, studentId) {
  return data.goals.filter(
    (g) => !g.archived && ((g.scope === 'student' && g.studentId === studentId) || g.scope === 'everyone'),
  );
}

export function classGoals(data) {
  return data.goals.filter((g) => !g.archived && g.scope === 'class');
}

export function openGoalsCount(data, studentId, ref = today()) {
  return goalsForStudent(data, studentId).filter((g) => !goalStatus(data, g, studentId, ref).done).length;
}

export function completeGoal(data, goalId, studentId, date = today(), meetingId = null) {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal || goalStatus(data, goal, studentId, date).done) return;
  data.goalCompletions.push({ id: uid(), goalId, studentId: studentId ?? null, date, meetingId });
}

/** Check / uncheck a goal checkbox for a target. */
export function toggleGoal(data, goalId, studentId, ref = today()) {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal) return;
  const status = goalStatus(data, goal, studentId, ref);
  if (!status.done) {
    completeGoal(data, goalId, studentId, ref);
    return;
  }
  const comps = goalCompletions(data, goalId, studentId).filter((c) => c.date <= ref);
  // One-time: clear it entirely. Recurring: undo the completion of the current period only.
  const remove = new Set(goal.recurring ? [comps[comps.length - 1].id] : comps.map((c) => c.id));
  data.goalCompletions = data.goalCompletions.filter((c) => !remove.has(c.id));
}

export function deleteGoal(data, goalId) {
  data.goals = data.goals.filter((g) => g.id !== goalId);
  data.goalCompletions = data.goalCompletions.filter((c) => c.goalId !== goalId);
}

/* ---------------------------------------------------------------- meetings */

/**
 * Record a meeting and apply its side effects:
 * marks discussed topics and achieved goals, clears the scheduled meeting / check-ups it fulfils,
 * and optionally schedules the next meeting.
 */
export function recordMeeting(data, { studentId, date, type = 'regular', summary = '', topicIds = [], goalIds = [], nextDate = null }) {
  const meeting = { id: uid(), studentId, date, type, summary: summary.trim(), createdAt: new Date().toISOString() };
  data.meetings.push(meeting);

  for (const tid of topicIds) setTopicDone(data, tid, true, date, meeting.id);
  for (const gid of goalIds) completeGoal(data, gid, studentId, date, meeting.id);

  const student = getStudent(data, studentId);
  if (student) {
    if (student.nextMeeting?.date && student.nextMeeting.date <= date) student.nextMeeting = null;
    for (const c of student.checkups || []) {
      if (!c.done && c.date <= date) {
        c.done = true;
        c.meetingId = meeting.id;
      }
    }
    if (nextDate) student.nextMeeting = { date: nextDate, time: '', note: '' };
  }
  return meeting;
}

export function deleteMeeting(data, meetingId) {
  data.meetings = data.meetings.filter((m) => m.id !== meetingId);
}

/* ---------------------------------------------------------------- dashboard */

function studentUrgency(data, student, ref) {
  const due = studentDueDate(data, student, ref);
  const last = lastMeetingDate(data, student.id, ref);
  return {
    due,
    last,
    openTopics: studentTopics(data, student.id).open.length,
    openGoals: openGoalsCount(data, student.id, ref),
  };
}

function reasonsFor(u, ref, kind) {
  const reasons = [];
  if (kind === 'suggested') {
    if (!u.last) reasons.push('טרם נפגשנו');
    else {
      const overdue = diffDays(u.due.date, ref);
      reasons.push(`פגישה אחרונה לפני ${diffDays(u.last, ref)} ימים`);
      if (overdue > 0) reasons.push(`באיחור של ${overdue} ימים`);
    }
  }
  if (u.openTopics) reasons.push(`${u.openTopics} נושאים פתוחים`);
  if (u.openGoals) reasons.push(`${u.openGoals} מטרות פתוחות`);
  return reasons;
}

/**
 * Suggested upcoming meetings.
 * Explicitly scheduled meetings and check-ups keep their dates; the remaining students are spread
 * over working days (by urgency) without exceeding the daily capacity.
 */
export function suggestMeetings(data, ref = today(), count = data.settings.suggestionsCount || 10) {
  const workdays = data.settings.workdays || [];
  const capacity = Math.max(1, Number(data.settings.meetingsPerDay) || 1);
  const load = new Map();
  const bump = (date) => load.set(date, (load.get(date) || 0) + 1);
  const items = [];

  const students = activeStudents(data);
  const info = new Map(students.map((s) => [s.id, studentUrgency(data, s, ref)]));

  for (const s of students) {
    const u = info.get(s.id);
    if (s.nextMeeting?.date) {
      const date = s.nextMeeting.date;
      items.push({
        studentId: s.id,
        date,
        time: s.nextMeeting.time || '',
        note: s.nextMeeting.note || '',
        kind: 'scheduled',
        missed: date < ref,
        reasons: reasonsFor(u, ref, 'scheduled'),
      });
      bump(maxDate(date, ref));
    }
    for (const c of s.checkups || []) {
      if (c.done) continue;
      items.push({
        studentId: s.id,
        date: c.date,
        note: c.note || '',
        kind: 'checkup',
        checkupId: c.id,
        missed: c.date < ref,
        reasons: [],
      });
      bump(maxDate(c.date, ref));
    }
  }

  const unscheduled = students
    .filter((s) => !s.nextMeeting?.date)
    .map((s) => ({ s, u: info.get(s.id) }))
    .sort(
      (a, b) =>
        a.u.due.date.localeCompare(b.u.due.date) ||
        Number(!!a.u.last) - Number(!!b.u.last) ||
        b.u.openTopics + b.u.openGoals - (a.u.openTopics + a.u.openGoals) ||
        (a.u.last || '').localeCompare(b.u.last || ''),
    );

  for (const { s, u } of unscheduled) {
    let day = nextWorkday(maxDate(u.due.date, ref), workdays);
    for (let guard = 0; (load.get(day) || 0) >= capacity && guard < 3650; guard++) {
      day = nextWorkday(addDays(day, 1), workdays);
    }
    bump(day);
    items.push({ studentId: s.id, date: day, kind: 'suggested', dueDate: u.due.date, missed: false, reasons: reasonsFor(u, ref, 'suggested') });
  }

  const kindOrder = { scheduled: 0, checkup: 1, suggested: 2 };
  items.sort((a, b) => a.date.localeCompare(b.date) || kindOrder[a.kind] - kindOrder[b.kind]);
  return items.slice(0, count);
}

/** Students who haven't had a meeting within the "stale" threshold, never-met first. */
export function staleStudents(data, ref = today()) {
  const threshold = Number(data.settings.staleDays) || 30;
  return activeStudents(data)
    .map((s) => {
      const last = lastMeetingDate(data, s.id, ref);
      return { student: s, last, days: last ? diffDays(last, ref) : null };
    })
    .filter((x) => x.last === null || x.days > threshold)
    .sort((a, b) => (a.last === null ? -1 : b.last === null ? 1 : b.days - a.days));
}

export function goalStats(data, ref = today()) {
  const goals = data.goals.filter((g) => !g.archived);
  const perGoal = goals.map((g) => {
    const targets = goalTargets(data, g);
    let done = 0;
    let overdue = 0;
    for (const t of targets) {
      const st = goalStatus(data, g, t, ref);
      if (st.done) done++;
      else if (st.overdue) overdue++;
    }
    const completions = data.goalCompletions.filter((c) => c.goalId === g.id).length;
    return { goal: g, targets: targets.length, done, overdue, completions, rate: targets.length ? done / targets.length : 0 };
  });

  const sum = (arr, f) => arr.reduce((acc, x) => acc + f(x), 0);
  const oneTime = perGoal.filter((x) => !x.goal.recurring);
  const recurring = perGoal.filter((x) => x.goal.recurring);
  const ratio = (arr) => {
    const t = sum(arr, (x) => x.targets);
    return t ? sum(arr, (x) => x.done) / t : null;
  };

  const perStudent = activeStudents(data).map((s) => {
    const gs = goalsForStudent(data, s.id);
    const done = gs.filter((g) => goalStatus(data, g, s.id, ref).done).length;
    return { student: s, total: gs.length, done, rate: gs.length ? done / gs.length : null };
  });

  const byOwner = (owner) => perGoal.filter((x) => x.goal.scope === 'student' && x.goal.owner === owner);

  return {
    perGoal,
    perStudent,
    totals: {
      goals: goals.length,
      oneTimeRate: ratio(oneTime),
      recurringRate: ratio(recurring),
      overallRate: ratio(perGoal),
      overdue: sum(perGoal, (x) => x.overdue),
      teacherRate: ratio(byOwner('teacher')),
      studentRate: ratio(byOwner('student')),
    },
  };
}

export function meetingStats(data, ref = today()) {
  const students = activeStudents(data);
  const staleDays = Number(data.settings.staleDays) || 30;
  const from = addDays(ref, -staleDays);
  const recent = data.meetings.filter((m) => m.date > from && m.date <= ref);
  const metRecently = new Set(recent.map((m) => m.studentId));
  return {
    recentMeetings: recent.length,
    coverage: students.length ? students.filter((s) => metRecently.has(s.id)).length / students.length : null,
    neverMet: students.filter((s) => !data.meetings.some((m) => m.studentId === s.id)).length,
    totalMeetings: data.meetings.length,
  };
}
