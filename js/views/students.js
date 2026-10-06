import { today } from '../dates.js';
import { mergeStudents } from '../model.js';
import { lastMeetingDate, openGoalsCount, studentDueDate, studentTopics } from '../logic.js';
import { formValues, html, toast, when } from '../ui.js';
import { dateLabel, emptyState } from './common.js';

export function render(ctx) {
  const data = ctx.store.data;
  const ref = today();
  const filter = (ctx.ui.studentFilter || '').trim();
  const showInactive = !!ctx.ui.showInactive;
  const students = data.students
    .filter((s) => (showInactive ? true : s.active !== false))
    .filter((s) => !filter || s.fullName.includes(filter))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'he') || a.firstName.localeCompare(b.firstName, 'he'));
  const inactiveCount = data.students.filter((s) => s.active === false).length;

  return html`
    <section class="card">
      <div class="card-head">
        <h2>תלמידים <span class="count">${data.students.filter((s) => s.active !== false).length}</span></h2>
        <div class="toolbar">
          <input type="search" placeholder="חיפוש תלמיד…" value="${filter}" data-input="students.filter" aria-label="חיפוש תלמיד">
          <a class="btn secondary" href="#/import">ייבוא רשימה</a>
        </div>
      </div>
      ${
        students.length
          ? html`<div class="table-wrap"><table class="table">
              <thead><tr>
                <th>שם</th><th>מפגש אחרון</th><th>מפגש הבא</th><th>נושאים פתוחים</th><th>מטרות פתוחות</th>
              </tr></thead>
              <tbody>
                ${students.map((s) => {
                  const last = lastMeetingDate(data, s.id, ref);
                  const due = studentDueDate(data, s, ref);
                  const topics = studentTopics(data, s.id).open.length;
                  const goals = openGoalsCount(data, s.id, ref);
                  return html`<tr class="${s.active === false ? 'inactive' : ''}">
                    <td><a href="#/student/${s.id}" class="student-link">${s.fullName}</a>${when(s.active === false, html` <span class="badge">לא פעיל</span>`)}</td>
                    <td data-label="מפגש אחרון">${last ? dateLabel(last) : html`<span class="badge warning">טרם נפגשנו</span>`}</td>
                    <td data-label="מפגש הבא">${due.explicit ? html`${dateLabel(due.date)} <span class="badge kind-scheduled">נקבע</span>` : due.never ? html`<span class="muted">בהקדם</span>` : html`<span class="${due.date < ref ? 'overdue' : 'muted'}">${dateLabel(due.date)}</span>`}</td>
                    <td data-label="נושאים פתוחים">${topics || html`<span class="muted">—</span>`}</td>
                    <td data-label="מטרות פתוחות">${goals || html`<span class="muted">—</span>`}</td>
                  </tr>`;
                })}
              </tbody>
            </table></div>`
          : emptyState(filter ? 'לא נמצאו תלמידים' : 'אין עדיין תלמידים', when(!filter, html`<a class="btn" href="#/import">טעינת רשימת תלמידים</a>`))
      }
      ${when(
        inactiveCount,
        html`<label class="check small"><input type="checkbox" data-change="students.showInactive"${showInactive ? html` checked` : ''}> הצגת תלמידים לא פעילים (${inactiveCount})</label>`,
      )}
    </section>

    <section class="card">
      <h2>הוספת תלמיד</h2>
      <form data-form="students.add" class="field-row">
        <label class="field"><span>שם פרטי</span><input name="firstName" required></label>
        <label class="field"><span>שם משפחה</span><input name="lastName"></label>
        <button class="btn" type="submit">הוספה</button>
      </form>
    </section>`;
}

export const handlers = {
  'students.filter'(ctx, el) {
    ctx.ui.studentFilter = el.value;
    ctx.rerender({ keepFocus: true });
  },
  'students.showInactive'(ctx, el) {
    ctx.ui.showInactive = el.checked;
    ctx.rerender();
  },
  'students.add'(ctx, form) {
    const v = formValues(form);
    const firstName = v.firstName.trim();
    const lastName = v.lastName.trim();
    if (!firstName) return;
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const r = ctx.store.update((data) => mergeStudents(data, [{ firstName, lastName, fullName }]));
    toast(r.added ? `${fullName} נוסף/ה לרשימה` : `${fullName} כבר ברשימה`);
  },
};
