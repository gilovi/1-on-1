import { formatDate, relativeDay, today } from '../dates.js';
import { FREQUENCY_PRESETS, GOAL_OWNERS, GOAL_SCOPES, frequencyLabel } from '../model.js';
import { goalStatus } from '../logic.js';
import { when } from '../ui.js';
import { html, attr } from '../ui/html.js';

export function studentLink(s) {
  return s ? html`<a href="#/student/${s.id}" class="student-link">${s.fullName}</a>` : html`<span class="muted">תלמיד שנמחק</span>`;
}

export function dateLabel(iso, { relative = true, weekday = false } = {}) {
  if (!iso) return '';
  return html`<span class="date" title="${formatDate(iso, { withWeekday: true })}">${formatDate(iso, { withWeekday: weekday })}${when(
    relative,
    html` <span class="muted">(${relativeDay(iso)})</span>`,
  )}</span>`;
}

/**
 * @param {unknown} text
 * @param {unknown} [action]
 */
export function emptyState(text, action = '') {
  return html`<div class="empty">${text}${action ? html`<div class="empty-action">${action}</div>` : ''}</div>`;
}

/** Recurrence + frequency + due-date fields shared by all goal forms. */
export function recurrenceFields(goal = {}) {
  const every = Number(goal.everyDays) || 30;
  const isPreset = FREQUENCY_PRESETS.some((p) => p.days === every);
  return html`
    <div class="field-row recurrence">
      <label class="field">
        <span>סוג</span>
        <select name="recurring" data-change="ui.toggleRecurrence">
          <option value="no"${attr.bool('selected', !goal.recurring)}>חד פעמית</option>
          <option value="yes"${attr.bool('selected', goal.recurring)}>חוזרת</option>
        </select>
      </label>
      <label class="field only-recurring"${attr.bool('hidden', !goal.recurring)}>
        <span>תדירות</span>
        <select name="everyPreset" data-change="ui.toggleCustomFreq">
          ${FREQUENCY_PRESETS.map((p) => html`<option value="${p.days}"${attr.bool('selected', isPreset && every === p.days)}>${p.label}</option>`)}
          <option value="custom"${attr.bool('selected', !isPreset)}>מותאם אישית…</option>
        </select>
      </label>
      <label class="field only-custom"${attr.bool('hidden', !goal.recurring || isPreset)}>
        <span>כל כמה ימים</span>
        <input type="number" name="everyCustom" min="1" max="365" value="${every}">
      </label>
      <label class="field only-once"${attr.bool('hidden', goal.recurring)}>
        <span>תאריך יעד (רשות)</span>
        <input type="date" name="dueDate" value="${goal.dueDate || ''}">
      </label>
    </div>`;
}

export function readRecurrence(v) {
  const recurring = v.recurring === 'yes';
  const everyDays = v.everyPreset === 'custom' ? Math.max(1, Number(v.everyCustom) || 30) : Number(v.everyPreset) || 30;
  return { recurring, everyDays, dueDate: recurring ? null : v.dueDate || null };
}

export function goalBadges(goal) {
  return html`
    <span class="badge scope-${goal.scope}">${GOAL_SCOPES[goal.scope]}</span>
    ${when(goal.scope === 'student', html`<span class="badge owner-${goal.owner}">${goal.owner === 'student' ? 'של התלמיד' : 'שלי'}</span>`)}
    <span class="badge ${goal.recurring ? 'recurring' : 'once'}">${goal.recurring ? `חוזרת · ${frequencyLabel(goal.everyDays)}` : 'חד פעמית'}</span>`;
}

/** A goal checkbox row for one target (student id, or null for the class). */
export function goalCheckRow(data, goal, studentId, { showBadges = true, showDescription = true } = {}) {
  const st = goalStatus(data, goal, studentId);
  let statusText = '';
  if (goal.recurring) {
    statusText = st.done
      ? `בוצע ${formatDate(st.lastDone)} · שוב ב-${formatDate(st.nextDue)}`
      : st.lastDone
        ? `בוצע לאחרונה ${formatDate(st.lastDone)} · ${st.overdue ? 'באיחור' : `עד ${formatDate(st.nextDue)}`}`
        : `עד ${formatDate(st.nextDue)}`;
  } else if (st.done) {
    statusText = `הושלם ${formatDate(st.lastDone)}`;
  } else if (st.nextDue) {
    statusText = `יעד: ${formatDate(st.nextDue)}`;
  }
  return html`
    <li class="goal-check ${st.done ? 'is-done' : ''} ${st.overdue ? 'is-overdue' : ''} ${goal.recurring ? 'recurring' : ''}">
      <label class="check">
        <input type="checkbox" data-change="goal.toggle" data-goal="${goal.id}" data-student="${studentId ?? ''}"${attr.bool('checked', st.done)}>
        <span class="goal-title">${goal.title}</span>
      </label>
      ${when(showBadges, html`<span class="badges">${goalBadges(goal)}</span>`)}
      ${when(statusText, html`<span class="goal-status ${st.overdue ? 'overdue' : ''}">${statusText}${when(st.overdue && !goal.recurring, ' · באיחור')}</span>`)}
      ${when(showDescription && goal.description, html`<div class="goal-desc">${goal.description}</div>`)}
    </li>`;
}

export function ownerOptions(current = 'teacher') {
  return Object.entries(GOAL_OWNERS).map(([k, label]) => html`<option value="${k}"${attr.bool('selected', current === k)}>${label}</option>`);
}

export { today };
