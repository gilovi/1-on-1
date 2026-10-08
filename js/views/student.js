import { addDays, formatDate, formatHebrewDate, nextWorkday, today } from '../dates.js';
import { FREQUENCY_PRESETS, MEETING_TYPES, newGoal, uid, frequencyLabel } from '../model.js';
import {
  addTopic, deleteMeeting, getStudent, goalStatus, goalsForStudent, lastMeetingDate, recordMeeting,
  reorderTopic, setTopicDone, studentDueDate, studentFrequency, studentMeetings, studentTopics,
} from '../logic.js';
import { formValues, toast, when } from '../ui.js';
import { html, attr } from '../ui/html.js';
import { dateLabel, emptyState, goalCheckRow, ownerOptions, readRecurrence, recurrenceFields } from './common.js';

function contactCard(s) {
  return html`
    <details class="contact">
      <summary>פרטי קשר ועריכה</summary>
      <div class="contact-body">
        ${when(
          s.phones.length,
          html`<ul class="phones">${s.phones.map((p) => html`<li><span class="muted">${p.label}:</span> <a href="tel:${p.number}" dir="ltr">${p.number}</a></li>`)}</ul>`,
        )}
        ${when(s.email, html`<div><span class="muted">דוא"ל:</span> <a href="mailto:${s.email}" dir="ltr">${s.email}</a></div>`)}
        ${when(s.address, html`<div><span class="muted">כתובת:</span> ${s.address}</div>`)}
        ${when(s.org, html`<div><span class="muted">מסגרת:</span> ${s.org}</div>`)}
        <form data-form="student.editDetails" class="field-row">
          <label class="field"><span>שם פרטי</span><input name="firstName" value="${s.firstName}" required></label>
          <label class="field"><span>שם משפחה</span><input name="lastName" value="${s.lastName}"></label>
          <button class="btn small secondary" type="submit">שמירת שם</button>
        </form>
        <div class="danger-zone">
          ${
            s.active === false
              ? html`<button class="btn small secondary" data-action="student.setActive" data-value="1">החזרה לרשימת התלמידים הפעילים</button>`
              : html`<button class="btn small secondary" data-action="student.setActive" data-value="0">העברה ללא פעיל (עזב את הכיתה)</button>`
          }
          <button class="btn small danger" data-action="student.delete">מחיקת התלמיד וכל הנתונים שלו</button>
        </div>
      </div>
    </details>`;
}

function meetingForm(data, s, ref) {
  const { open } = studentTopics(data, s.id);
  const goals = goalsForStudent(data, s.id).filter((g) => !goalStatus(data, g, s.id, ref).done);
  const suggestedNext = nextWorkday(addDays(ref, studentFrequency(data, s)), data.settings.workdays);
  const hasCheckupToday = (s.checkups || []).some((c) => !c.done && c.date <= ref);
  return html`
    <section class="card meeting-form" id="meeting-form">
      <h2>רישום מפגש חדש</h2>
      <form data-form="student.addMeeting">
        <div class="field-row">
          <label class="field"><span>תאריך</span><input type="date" name="date" value="${ref}" required max="${addDays(ref, 1)}"></label>
          <label class="field"><span>סוג המפגש</span>
            <select name="type">${Object.entries(MEETING_TYPES).map(([k, v]) => html`<option value="${k}"${attr.bool('selected', k === (hasCheckupToday ? 'checkup' : 'regular'))}>${v}</option>`)}</select>
          </label>
        </div>
        <label class="field"><span>סיכום המפגש</span>
          <textarea name="summary" rows="6" placeholder="על מה דיברנו, מה עלה, תובנות, התחייבויות, דברים לבדוק…"></textarea>
        </label>
        ${when(
          open.length,
          html`<fieldset><legend>נושאים שנדונו (יסומנו כבוצעו)</legend>
            ${open.map((t) => html`<label class="check"><input type="checkbox" name="topicIds" value="${t.id}" data-group> ${t.text}</label>`)}
          </fieldset>`,
        )}
        ${when(
          goals.length,
          html`<fieldset><legend>מטרות שהושגו במפגש</legend>
            ${goals.map((g) => html`<label class="check"><input type="checkbox" name="goalIds" value="${g.id}" data-group> ${g.title}</label>`)}
          </fieldset>`,
        )}
        <div class="field-row">
          <label class="field"><span>קביעת המפגש הבא (רשות)</span><input type="date" name="nextDate" min="${ref}"></label>
          <p class="muted small hint">ללא תאריך, המפגש הבא יוצע אוטומטית לפי התדירות (בסביבות ${formatDate(suggestedNext)}).</p>
        </div>
        <div class="form-actions">
          <button class="btn" type="submit">שמירת המפגש</button>
          <button class="btn secondary" type="button" data-action="student.closeMeeting">ביטול</button>
        </div>
      </form>
    </section>`;
}

function scheduleCard(data, s, ref) {
  const due = studentDueDate(data, s, ref);
  const freq = studentFrequency(data, s);
  const freqIsPreset = FREQUENCY_PRESETS.some((p) => p.days === s.frequencyDays);
  const checkups = [...(s.checkups || [])].sort((a, b) => a.date.localeCompare(b.date));
  const openCheckups = checkups.filter((c) => !c.done);
  const doneCheckups = checkups.filter((c) => c.done);
  return html`
    <section class="card">
      <h2>המפגש הבא</h2>
      <div class="next-meeting">
        ${
          due.explicit
            ? html`<div><strong>נקבע ל-${formatDate(due.date, { withWeekday: true })}${s.nextMeeting.time ? ` בשעה ${s.nextMeeting.time}` : ''}</strong>
                ${when(due.date < ref, html` <span class="badge danger">התאריך עבר</span>`)}
                ${when(s.nextMeeting.note, html`<div class="small">${s.nextMeeting.note}</div>`)}</div>`
            : due.never
              ? html`<div>טרם נפגשנו – מומלץ להיפגש בהקדם.</div>`
              : html`<div>לפי התדירות: ${dateLabel(due.date)}</div>`
        }
      </div>
      <form data-form="student.schedule" class="field-row">
        <label class="field"><span>תאריך</span><input type="date" name="date" value="${s.nextMeeting?.date || ''}" required></label>
        <label class="field narrow"><span>שעה</span><input type="time" name="time" value="${s.nextMeeting?.time || ''}"></label>
        <label class="field"><span>הערה</span><input name="note" value="${s.nextMeeting?.note || ''}" placeholder="למשל: בהפסקה הגדולה"></label>
        <button class="btn small" type="submit">${due.explicit ? 'עדכון' : 'קביעה'}</button>
        ${when(due.explicit, html`<button class="btn small secondary" type="button" data-action="student.clearSchedule">ביטול המועד</button>`)}
      </form>
      <label class="field inline">
        <span>תדירות מפגשים</span>
        <select data-change="student.frequency">
          <option value=""${attr.bool('selected', !s.frequencyDays)}>ברירת המחדל של הכיתה (${frequencyLabel(Number(data.settings.defaultFrequencyDays))})</option>
          ${FREQUENCY_PRESETS.map((p) => html`<option value="${p.days}"${attr.bool('selected', s.frequencyDays === p.days)}>${p.label}</option>`)}
          ${when(s.frequencyDays && !freqIsPreset, html`<option value="${s.frequencyDays}" selected>${frequencyLabel(freq)}</option>`)}
        </select>
      </label>

      <h3>שיחות מעקב</h3>
      ${
        openCheckups.length
          ? html`<ul class="simple-list">${openCheckups.map(
              (c) => html`<li class="${c.date < ref ? 'overdue' : ''}">
                <span>${dateLabel(c.date)}${when(c.note, html` – ${c.note}`)}</span>
                <span class="row-actions">
                  <button class="icon-btn" data-action="student.checkupDone" data-id="${c.id}" title="סימון כבוצע" aria-label="סימון כבוצע">✓</button>
                  <button class="icon-btn" data-action="student.checkupDelete" data-id="${c.id}" title="מחיקה" aria-label="מחיקה">✕</button>
                </span>
              </li>`,
            )}</ul>`
          : html`<p class="muted small">אין שיחות מעקב מתוכננות.</p>`
      }
      <form data-form="student.addCheckup" class="field-row">
        <label class="field"><span>תאריך</span><input type="date" name="date" required value="${addDays(ref, 7)}"></label>
        <label class="field"><span>מה לבדוק</span><input name="note" placeholder="למשל: לבדוק איך הלך המבחן"></label>
        <button class="btn small secondary" type="submit">הוספת מעקב</button>
      </form>
      ${when(
        doneCheckups.length,
        html`<details class="small"><summary>מעקבים שבוצעו (${doneCheckups.length})</summary>
          <ul class="simple-list">${doneCheckups.map((c) => html`<li class="is-done"><span>${formatDate(c.date)}${when(c.note, ` – ${c.note}`)}</span>
            <button class="icon-btn" data-action="student.checkupUndo" data-id="${c.id}" title="החזרה לפתוח" aria-label="החזרה לפתוח">↺</button></li>`)}</ul>
        </details>`,
      )}
    </section>`;
}

function topicsCard(ctx, data, s) {
  const { open, done } = studentTopics(data, s.id);
  return html`
    <section class="card">
      <h2>נושאים לשיחה הבאה <span class="count">${open.length}</span></h2>
      <form data-form="student.addTopic" class="field-row">
        <label class="field grow"><span class="sr-only">נושא חדש</span><input name="text" placeholder="נושא חדש לשיחה…" required></label>
        <label class="check small"><input type="checkbox" name="urgent"> בראש הרשימה</label>
        <button class="btn small" type="submit">הוספה</button>
      </form>
      ${
        open.length
          ? html`<ol class="topics" data-dropzone="topics">
              ${open.map((t, i) =>
                ctx.ui.editTopic === t.id
                  ? html`<li class="topic editing">
                      <form data-form="student.saveTopic" data-id="${t.id}" class="field-row">
                        <input name="text" value="${t.text}" required aria-label="עריכת נושא">
                        <button class="btn small" type="submit">שמירה</button>
                        <button class="btn small secondary" type="button" data-action="student.cancelTopic">ביטול</button>
                      </form>
                    </li>`
                  : html`<li class="topic" draggable="true" data-topic="${t.id}">
                      <span class="drag-handle" title="גררו לשינוי הסדר" aria-hidden="true">⋮⋮</span>
                      <label class="check grow"><input type="checkbox" data-change="student.topicDone" data-id="${t.id}"> <span>${t.text}</span></label>
                      <span class="row-actions">
                        <button class="icon-btn" data-action="student.topicMove" data-id="${t.id}" data-to="${i - 1}"${attr.bool('disabled', i === 0)} title="העלאה" aria-label="העלאה">▲</button>
                        <button class="icon-btn" data-action="student.topicMove" data-id="${t.id}" data-to="${i + 1}"${attr.bool('disabled', i === open.length - 1)} title="הורדה" aria-label="הורדה">▼</button>
                        <button class="icon-btn" data-action="student.editTopic" data-id="${t.id}" title="עריכה" aria-label="עריכה">✎</button>
                        <button class="icon-btn" data-action="student.deleteTopic" data-id="${t.id}" title="מחיקה" aria-label="מחיקה">✕</button>
                      </span>
                    </li>`,
              )}
            </ol>`
          : html`<p class="muted small">אין נושאים פתוחים.</p>`
      }
      ${when(
        done.length,
        html`<details class="small"><summary>נושאים שבוצעו (${done.length})</summary>
          <ul class="simple-list">${done.map(
            (t) => html`<li class="is-done"><label class="check"><input type="checkbox" checked data-change="student.topicDone" data-id="${t.id}"> ${t.text}</label>
              <span class="muted">${formatDate(t.doneAt)}</span></li>`,
          )}</ul>
        </details>`,
      )}
    </section>`;
}

function goalsCard(ctx, data, s) {
  const goals = goalsForStudent(data, s.id);
  const personal = goals.filter((g) => g.scope === 'student');
  const general = goals.filter((g) => g.scope === 'everyone');
  const teacher = personal.filter((g) => g.owner !== 'student');
  const student = personal.filter((g) => g.owner === 'student');
  const group = (title, list) =>
    when(list.length, html`<h3>${title}</h3><ul class="goal-list">${list.map((g) => goalCheckRow(data, g, s.id, { showBadges: false }))}</ul>`);
  return html`
    <section class="card">
      <h2>מטרות</h2>
      ${goals.length ? '' : html`<p class="muted small">אין מטרות עדיין.</p>`}
      ${group('המטרות שלי מול התלמיד', teacher)}
      ${group('המטרות של התלמיד', student)}
      ${group('מטרות לכל התלמידים', general)}
      <details class="add-goal"${attr.bool('open', ctx.ui.addGoalOpen)}>
        <summary>הוספת מטרה אישית</summary>
        <form data-form="student.addGoal">
          <div class="field-row">
            <label class="field grow"><span>מטרה</span><input name="title" required placeholder="למשל: לשפר הגעה בזמן לתפילה"></label>
            <label class="field"><span>של מי</span><select name="owner">${ownerOptions()}</select></label>
          </div>
          <label class="field"><span>פירוט (רשות)</span><input name="description"></label>
          ${recurrenceFields({})}
          <button class="btn small" type="submit">הוספה</button>
        </form>
      </details>
      <p class="small"><a href="#/goals">ניהול כל המטרות ←</a></p>
    </section>`;
}

function meetingsCard(ctx, data, s) {
  const meetings = studentMeetings(data, s.id);
  return html`
    <section class="card">
      <h2>סיכומי מפגשים <span class="count">${meetings.length}</span></h2>
      ${
        meetings.length
          ? html`<ul class="meetings">${meetings.map((m) =>
              ctx.ui.editMeeting === m.id
                ? html`<li class="meeting editing">
                    <form data-form="student.saveMeeting" data-id="${m.id}">
                      <div class="field-row">
                        <label class="field"><span>תאריך</span><input type="date" name="date" value="${m.date}" required></label>
                        <label class="field"><span>סוג</span><select name="type">${Object.entries(MEETING_TYPES).map(([k, v]) => html`<option value="${k}"${attr.bool('selected', k === m.type)}>${v}</option>`)}</select></label>
                      </div>
                      <label class="field"><span>סיכום</span><textarea name="summary" rows="6">${m.summary}</textarea></label>
                      <div class="form-actions">
                        <button class="btn small" type="submit">שמירה</button>
                        <button class="btn small secondary" type="button" data-action="student.cancelMeeting">ביטול</button>
                      </div>
                    </form>
                  </li>`
                : html`<li class="meeting">
                    <div class="meeting-head">
                      <strong>${formatDate(m.date, { withWeekday: true })}</strong>
                      <span class="muted small">${formatHebrewDate(m.date)}</span>
                      <span class="badge type-${m.type}">${MEETING_TYPES[m.type] || m.type}</span>
                      <span class="row-actions">
                        <button class="icon-btn" data-action="student.editMeeting" data-id="${m.id}" title="עריכה" aria-label="עריכה">✎</button>
                        <button class="icon-btn" data-action="student.deleteMeeting" data-id="${m.id}" title="מחיקה" aria-label="מחיקה">✕</button>
                      </span>
                    </div>
                    ${m.summary ? html`<div class="meeting-summary">${m.summary}</div>` : html`<div class="muted small">ללא סיכום</div>`}
                    ${meetingExtras(data, m)}
                  </li>`,
            )}</ul>`
          : emptyState('עדיין לא נרשמו מפגשים.')
      }
    </section>`;
}

function meetingExtras(data, m) {
  const topics = data.topics.filter((t) => t.meetingId === m.id);
  const goals = data.goalCompletions.filter((c) => c.meetingId === m.id).map((c) => data.goals.find((g) => g.id === c.goalId)).filter(Boolean);
  if (!topics.length && !goals.length) return '';
  return html`<div class="meeting-extras small">
    ${when(topics.length, html`<div><span class="muted">נושאים:</span> ${topics.map((t) => t.text).join(' · ')}</div>`)}
    ${when(goals.length, html`<div><span class="muted">מטרות שהושגו:</span> ${goals.map((g) => g.title).join(' · ')}</div>`)}
  </div>`;
}

export function render(ctx) {
  const data = ctx.store.data;
  const s = getStudent(data, ctx.params.id);
  if (!s) return emptyState('התלמיד לא נמצא.', html`<a class="btn" href="#/students">לרשימת התלמידים</a>`);
  const ref = today();
  const last = lastMeetingDate(data, s.id, ref);
  if (ctx.query.meeting === 'new' && ctx.ui.meetingFormFor !== s.id) ctx.ui.meetingFormFor = s.id;
  const showForm = ctx.ui.meetingFormFor === s.id;

  return html`
    <section class="card student-head">
      <div class="student-title">
        <div>
          <h1>${s.fullName}${when(s.active === false, html` <span class="badge">לא פעיל</span>`)}</h1>
          <div class="muted">${last ? html`מפגש אחרון: ${dateLabel(last)}` : 'טרם נפגשנו'}</div>
        </div>
        ${when(!showForm, html`<button class="btn" data-action="student.openMeeting">+ רישום מפגש</button>`)}
      </div>
      ${contactCard(s)}
    </section>

    ${when(showForm, meetingForm(data, s, ref))}

    <div class="grid-2 student-grid">
      <div class="col">
        ${topicsCard(ctx, data, s)}
        ${goalsCard(ctx, data, s)}
        ${scheduleCard(data, s, ref)}
      </div>
      <div class="col">
        ${meetingsCard(ctx, data, s)}
        <section class="card">
          <h2>הערות כלליות</h2>
          <textarea class="notes" data-change="student.notes" rows="6" placeholder="תחביבים, משפחה, חוזקות, קשיים, דברים שחשוב לזכור…" aria-label="הערות כלליות">${s.notes}</textarea>
          <p class="muted small">נשמר אוטומטית ביציאה מהשדה.</p>
        </section>
      </div>
    </div>`;
}

const student = (ctx, data) => getStudent(data, ctx.params.id);

export const handlers = {
  'student.openMeeting'(ctx) {
    ctx.ui.meetingFormFor = ctx.params.id;
    ctx.rerender();
    document.getElementById('meeting-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'student.closeMeeting'(ctx) {
    ctx.ui.meetingFormFor = null;
    ctx.navigate(`#/student/${ctx.params.id}`, { replace: true });
  },
  'student.addMeeting'(ctx, form) {
    const v = formValues(form);
    ctx.ui.meetingFormFor = null;
    ctx.store.update((data) =>
      recordMeeting(data, {
        studentId: ctx.params.id,
        date: v.date,
        type: v.type,
        summary: v.summary,
        topicIds: v.topicIds || [],
        goalIds: v.goalIds || [],
        nextDate: v.nextDate || null,
      }),
    );
    toast('המפגש נשמר');
    ctx.navigate(`#/student/${ctx.params.id}`, { replace: true });
  },
  'student.editMeeting'(ctx, el) {
    ctx.ui.editMeeting = el.dataset.id;
    ctx.rerender();
  },
  'student.cancelMeeting'(ctx) {
    ctx.ui.editMeeting = null;
    ctx.rerender();
  },
  'student.saveMeeting'(ctx, form) {
    const v = formValues(form);
    ctx.ui.editMeeting = null;
    ctx.store.update((data) => {
      const m = data.meetings.find((x) => x.id === form.dataset.id);
      if (m) Object.assign(m, { date: v.date, type: v.type, summary: v.summary.trim() });
    });
  },
  'student.deleteMeeting'(ctx, el) {
    if (!confirm('למחוק את סיכום המפגש?')) return;
    ctx.store.update((data) => deleteMeeting(data, el.dataset.id));
  },

  'student.addTopic'(ctx, form) {
    const v = formValues(form);
    if (!v.text.trim()) return;
    ctx.store.update((data) => addTopic(data, ctx.params.id, v.text, { urgent: v.urgent }));
    form.reset();
    /** @type {HTMLElement | null} */ (document.querySelector('[data-form="student.addTopic"] input[name=text]'))?.focus();
  },
  'student.topicDone'(ctx, el) {
    ctx.store.update((data) => setTopicDone(data, el.dataset.id, el.checked));
  },
  'student.topicMove'(ctx, el) {
    ctx.store.update((data) => reorderTopic(data, el.dataset.id, Number(el.dataset.to)));
  },
  'student.editTopic'(ctx, el) {
    ctx.ui.editTopic = el.dataset.id;
    ctx.rerender();
    /** @type {HTMLElement | null} */ (document.querySelector('.topic.editing input'))?.focus();
  },
  'student.cancelTopic'(ctx) {
    ctx.ui.editTopic = null;
    ctx.rerender();
  },
  'student.saveTopic'(ctx, form) {
    const text = formValues(form).text.trim();
    ctx.ui.editTopic = null;
    ctx.store.update((data) => {
      const t = data.topics.find((x) => x.id === form.dataset.id);
      if (t && text) t.text = text;
    });
  },
  'student.deleteTopic'(ctx, el) {
    ctx.store.update((data) => {
      data.topics = data.topics.filter((t) => t.id !== el.dataset.id);
    });
  },
  'student.dropTopic'(ctx, topicId, index) {
    ctx.store.update((data) => reorderTopic(data, topicId, index));
  },

  'student.addGoal'(ctx, form) {
    const v = formValues(form);
    if (!v.title.trim()) return;
    ctx.ui.addGoalOpen = false;
    ctx.store.update((data) =>
      data.goals.push(
        newGoal({ title: v.title.trim(), description: v.description.trim(), scope: 'student', studentId: ctx.params.id, owner: v.owner, ...readRecurrence(v) }),
      ),
    );
    toast('המטרה נוספה');
  },

  'student.schedule'(ctx, form) {
    const v = formValues(form);
    ctx.store.update((data) => {
      student(ctx, data).nextMeeting = { date: v.date, time: v.time || '', note: v.note.trim() };
    });
    toast(`המפגש נקבע ל-${formatDate(v.date)}`);
  },
  'student.clearSchedule'(ctx) {
    ctx.store.update((data) => {
      student(ctx, data).nextMeeting = null;
    });
  },
  'student.frequency'(ctx, el) {
    ctx.store.update((data) => {
      student(ctx, data).frequencyDays = el.value ? Number(el.value) : null;
    });
  },
  'student.addCheckup'(ctx, form) {
    const v = formValues(form);
    ctx.store.update((data) => {
      student(ctx, data).checkups.push({ id: uid(), date: v.date, note: v.note.trim(), done: false });
    });
    toast(`שיחת מעקב נקבעה ל-${formatDate(v.date)}`);
  },
  'student.checkupDone'(ctx, el) {
    ctx.store.update((data) => {
      const c = student(ctx, data).checkups.find((x) => x.id === el.dataset.id);
      if (c) c.done = true;
    });
  },
  'student.checkupUndo'(ctx, el) {
    ctx.store.update((data) => {
      const c = student(ctx, data).checkups.find((x) => x.id === el.dataset.id);
      if (c) c.done = false;
    });
  },
  'student.checkupDelete'(ctx, el) {
    ctx.store.update((data) => {
      const s = student(ctx, data);
      s.checkups = s.checkups.filter((x) => x.id !== el.dataset.id);
    });
  },

  'student.notes'(ctx, el) {
    ctx.store.update((data) => {
      student(ctx, data).notes = el.value;
    });
  },
  'student.editDetails'(ctx, form) {
    const v = formValues(form);
    ctx.store.update((data) => {
      const s = student(ctx, data);
      s.firstName = v.firstName.trim();
      s.lastName = v.lastName.trim();
      s.fullName = [s.firstName, s.lastName].filter(Boolean).join(' ');
    });
    toast('הפרטים נשמרו');
  },
  'student.setActive'(ctx, el) {
    ctx.store.update((data) => {
      student(ctx, data).active = el.dataset.value === '1';
    });
  },
  'student.delete'(ctx) {
    const s = student(ctx, ctx.store.data);
    if (!confirm(`למחוק את ${s.fullName} ואת כל המפגשים, הנושאים והמטרות שלו? לא ניתן לבטל פעולה זו.`)) return;
    const id = s.id;
    ctx.store.update((data) => {
      data.students = data.students.filter((x) => x.id !== id);
      data.meetings = data.meetings.filter((x) => x.studentId !== id);
      data.topics = data.topics.filter((x) => x.studentId !== id);
      const goalIds = new Set(data.goals.filter((g) => g.scope === 'student' && g.studentId === id).map((g) => g.id));
      data.goals = data.goals.filter((g) => !goalIds.has(g.id));
      data.goalCompletions = data.goalCompletions.filter((c) => c.studentId !== id && !goalIds.has(c.goalId));
    });
    ctx.navigate('#/students');
  },
};

