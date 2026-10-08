import { activeStudents, deleteGoal, getStudent, goalStats, goalStatus } from '../logic.js';
import { newGoal } from '../model.js';
import { formValues, progressBar, toast, when } from '../ui.js';
import { html, attr } from '../ui/html.js';
import { emptyState, goalBadges, goalCheckRow, ownerOptions, readRecurrence, recurrenceFields, studentLink } from './common.js';

function goalEditForm(goal) {
  return html`
    <form data-form="goals.save" data-id="${goal.id}" class="goal-edit">
      <label class="field"><span>מטרה</span><input name="title" value="${goal.title}" required></label>
      <label class="field"><span>פירוט</span><input name="description" value="${goal.description}"></label>
      ${when(goal.scope === 'student', html`<label class="field"><span>של מי</span><select name="owner">${ownerOptions(goal.owner)}</select></label>`)}
      ${recurrenceFields(goal)}
      <div class="form-actions">
        <button class="btn small" type="submit">שמירה</button>
        <button class="btn small secondary" type="button" data-action="goals.cancelEdit">ביטול</button>
      </div>
    </form>`;
}

function goalItem(ctx, data, stat) {
  const g = stat.goal;
  if (ctx.ui.editGoal === g.id) return html`<li class="goal-item">${goalEditForm(g)}</li>`;
  const students = activeStudents(data);
  return html`
    <li class="goal-item ${g.archived ? 'archived' : ''}">
      <div class="goal-item-head">
        <div>
          <strong>${g.title}</strong>
          ${when(g.scope === 'student', html` · ${studentLink(getStudent(data, g.studentId))}`)}
          <div class="badges small">${goalBadges(g)}${when(g.archived, html`<span class="badge">בארכיון</span>`)}</div>
          ${when(g.description, html`<div class="goal-desc">${g.description}</div>`)}
        </div>
        <span class="row-actions">
          <button class="icon-btn" data-action="goals.edit" data-id="${g.id}" title="עריכה" aria-label="עריכה">✎</button>
          <button class="icon-btn" data-action="goals.archive" data-id="${g.id}" title="${g.archived ? 'החזרה מהארכיון' : 'העברה לארכיון'}" aria-label="ארכיון">${g.archived ? '↺' : '🗄'}</button>
          <button class="icon-btn" data-action="goals.delete" data-id="${g.id}" title="מחיקה" aria-label="מחיקה">✕</button>
        </span>
      </div>
      ${
        g.archived
          ? ''
          : g.scope === 'everyone'
            ? html`
              <div class="bar-head small"><span class="muted">${stat.done}/${stat.targets} תלמידים${g.recurring ? ' בתקופה הנוכחית' : ''}${stat.overdue ? ` · ${stat.overdue} באיחור` : ''}</span></div>
              ${progressBar(stat.rate, { label: g.title })}
              <details class="per-student">
                <summary>סימון לפי תלמיד</summary>
                <ul class="goal-matrix">
                  ${students.map((s) => {
                    const st = goalStatus(data, g, s.id);
                    return html`<li class="${st.overdue ? 'is-overdue' : ''}"><label class="check">
                      <input type="checkbox" data-change="goal.toggle" data-goal="${g.id}" data-student="${s.id}"${attr.bool('checked', st.done)}> ${s.fullName}
                    </label></li>`;
                  })}
                </ul>
              </details>`
            : html`<ul class="goal-list">${goalCheckRow(data, g, g.scope === 'class' ? null : g.studentId, { showBadges: false, showDescription: false })}</ul>`
      }
    </li>`;
}

export function render(ctx) {
  const data = ctx.store.data;
  const students = activeStudents(data);
  const showArchived = !!ctx.ui.showArchivedGoals;
  const stats = goalStats(data);
  const statOf = new Map(stats.perGoal.map((x) => [x.goal.id, x]));
  const visible = data.goals.filter((g) => showArchived || !g.archived);
  const itemFor = (g) => goalItem(ctx, data, statOf.get(g.id) || { goal: g, targets: 0, done: 0, overdue: 0, rate: 0 });
  const scope = ctx.ui.newGoalScope || 'everyone';

  const classGoals = visible.filter((g) => g.scope === 'class');
  const everyoneGoals = visible.filter((g) => g.scope === 'everyone');
  const personal = visible.filter((g) => g.scope === 'student');
  const byStudent = students
    .map((s) => ({ s, goals: personal.filter((g) => g.studentId === s.id) }))
    .filter((x) => x.goals.length);
  const archivedCount = data.goals.filter((g) => g.archived).length;

  return html`
    <section class="card">
      <h2>הגדרת מטרה חדשה</h2>
      <form data-form="goals.add">
        <div class="field-row">
          <label class="field"><span>סוג מטרה</span>
            <select name="scope" data-change="goals.scope">
              <option value="class"${attr.bool('selected', scope === 'class')}>כיתתית – מטרה לכיתה כולה</option>
              <option value="everyone"${attr.bool('selected', scope === 'everyone')}>לכל תלמיד – תסומן אצל כל תלמיד בנפרד</option>
              <option value="student"${attr.bool('selected', scope === 'student')}>אישית – לתלמיד מסוים</option>
            </select>
          </label>
          ${when(
            scope === 'student',
            html`
              <label class="field"><span>תלמיד</span>
                <select name="studentId" required>
                  <option value="">בחרו תלמיד…</option>
                  ${students.map((s) => html`<option value="${s.id}"${attr.bool('selected', ctx.ui.newGoalStudent === s.id)}>${s.fullName}</option>`)}
                </select>
              </label>
              <label class="field"><span>של מי</span><select name="owner">${ownerOptions()}</select></label>`,
          )}
        </div>
        <label class="field"><span>מטרה</span><input name="title" required placeholder="${scope === 'class' ? 'למשל: לחזק את הגיבוש הכיתתי' : scope === 'everyone' ? 'למשל: לשמוע איך עבר החג' : 'למשל: לבנות תכנית למידה למבחן במתמטיקה'}"></label>
        <label class="field"><span>פירוט (רשות)</span><input name="description"></label>
        ${recurrenceFields({})}
        <button class="btn" type="submit">הוספת מטרה</button>
      </form>
    </section>

    <section class="card">
      <h2>מטרות כיתתיות <span class="count">${classGoals.length}</span></h2>
      ${classGoals.length ? html`<ul class="goal-items">${classGoals.map(itemFor)}</ul>` : emptyState('אין מטרות כיתתיות')}
    </section>

    <section class="card">
      <h2>מטרות לכל תלמיד <span class="count">${everyoneGoals.length}</span></h2>
      ${everyoneGoals.length ? html`<ul class="goal-items">${everyoneGoals.map(itemFor)}</ul>` : emptyState('אין מטרות לכל התלמידים')}
    </section>

    <section class="card">
      <h2>מטרות אישיות <span class="count">${personal.length}</span></h2>
      ${
        byStudent.length
          ? byStudent.map((x) => html`<h3>${studentLink(x.s)}</h3><ul class="goal-items">${x.goals.map(itemFor)}</ul>`)
          : emptyState('אין מטרות אישיות. אפשר להוסיף גם מדף התלמיד.')
      }
    </section>

    ${when(
      archivedCount,
      html`<label class="check small"><input type="checkbox" data-change="goals.showArchived"${attr.bool('checked', showArchived)}> הצגת מטרות בארכיון (${archivedCount})</label>`,
    )}`;
}

export const handlers = {
  'goals.scope'(ctx, el) {
    ctx.ui.newGoalScope = el.value;
    ctx.rerender();
  },
  'goals.add'(ctx, form) {
    const v = formValues(form);
    const title = v.title.trim();
    if (!title) return;
    if (v.scope === 'student' && !v.studentId) return;
    ctx.ui.newGoalStudent = v.studentId || null;
    ctx.store.update((data) =>
      data.goals.push(
        newGoal({
          title,
          description: v.description.trim(),
          scope: v.scope,
          studentId: v.scope === 'student' ? v.studentId : null,
          owner: v.scope === 'student' ? v.owner : 'teacher',
          ...readRecurrence(v),
        }),
      ),
    );
    toast('המטרה נוספה');
  },
  'goals.edit'(ctx, el) {
    ctx.ui.editGoal = el.dataset.id;
    ctx.rerender();
  },
  'goals.cancelEdit'(ctx) {
    ctx.ui.editGoal = null;
    ctx.rerender();
  },
  'goals.save'(ctx, form) {
    const v = formValues(form);
    ctx.ui.editGoal = null;
    ctx.store.update((data) => {
      const g = data.goals.find((x) => x.id === form.dataset.id);
      if (!g) return;
      Object.assign(g, { title: v.title.trim() || g.title, description: v.description.trim(), ...readRecurrence(v) });
      if (v.owner) g.owner = v.owner;
    });
  },
  'goals.archive'(ctx, el) {
    ctx.store.update((data) => {
      const g = data.goals.find((x) => x.id === el.dataset.id);
      if (g) g.archived = !g.archived;
    });
  },
  'goals.delete'(ctx, el) {
    if (!confirm('למחוק את המטרה וכל היסטוריית הביצוע שלה? (אפשר במקום זאת להעביר לארכיון)')) return;
    ctx.store.update((data) => deleteGoal(data, el.dataset.id));
  },
  'goals.showArchived'(ctx, el) {
    ctx.ui.showArchivedGoals = el.checked;
    ctx.rerender();
  },
};
