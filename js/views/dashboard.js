import { formatDate, relativeDay, today, weekdayName } from '../dates.js';
import { classGoals, getStudent, goalStats, meetingStats, staleStudents, suggestMeetings, activeStudents } from '../logic.js';
import { percent, progressBar, when, toast } from '../ui.js';
import { html } from '../ui/html.js';
import { emptyState, goalBadges, goalCheckRow, studentLink } from './common.js';

const KIND_LABELS = {
  scheduled: { text: 'נקבע', cls: 'kind-scheduled' },
  checkup: { text: 'מעקב', cls: 'kind-checkup' },
  suggested: { text: 'מוצע', cls: 'kind-suggested' },
};

function suggestionRow(data, item) {
  const s = getStudent(data, item.studentId);
  const kind = KIND_LABELS[item.kind];
  return html`
    <li class="suggestion ${item.missed ? 'missed' : ''}">
      <div class="suggestion-date">
        <strong>${formatDate(item.date)}</strong>
        <span class="muted">יום ${weekdayName(item.date)}${item.time ? ` · ${item.time}` : ''}</span>
        <span class="muted small">${relativeDay(item.date)}</span>
      </div>
      <div class="suggestion-main">
        <div>
          ${studentLink(s)}
          <span class="badge ${kind.cls}">${kind.text}</span>
          ${when(item.missed, html`<span class="badge danger">לא התקיים</span>`)}
        </div>
        ${when(item.note, html`<div class="small">${item.note}</div>`)}
        ${when(item.reasons.length, html`<div class="muted small">${item.reasons.join(' · ')}</div>`)}
      </div>
      <div class="suggestion-actions">
        ${when(
          item.kind === 'suggested',
          html`<button class="btn small secondary" data-action="dash.schedule" data-student="${item.studentId}" data-date="${item.date}" title="קביעת המפגש בתאריך זה">קבע</button>`,
        )}
        <a class="btn small" href="#/student/${item.studentId}?meeting=new">רשום מפגש</a>
      </div>
    </li>`;
}

const STUDENT_BARS_SHOWN = 8;

function studentBars(list) {
  const bar = (x) => html`<li>
    <div class="bar-head">${studentLink(x.student)}<span class="muted small">${x.done}/${x.total}</span></div>
    ${progressBar(x.rate, { label: x.student.fullName })}
  </li>`;
  const rest = list.slice(STUDENT_BARS_SHOWN);
  return html`<ul class="bar-list">${list.slice(0, STUDENT_BARS_SHOWN).map(bar)}</ul>
    ${when(rest.length, () => html`<details class="small"><summary>עוד ${rest.length} תלמידים</summary><ul class="bar-list">${rest.map(bar)}</ul></details>`)}`;
}

export function render(ctx) {
  const data = ctx.store.data;
  const students = activeStudents(data);
  if (!students.length) {
    return html`
      <section class="card welcome-card">
        <h2>ברוכים הבאים!</h2>
        <p>כדי להתחיל, טענו את רשימת התלמידים של הכיתה (קובץ אנשי קשר ‎.vcf, קובץ CSV או רשימת שמות).</p>
        <a class="btn" href="#/import">טעינת רשימת תלמידים</a>
      </section>`;
  }

  const ref = today();
  const suggestions = suggestMeetings(data, ref);
  const stale = staleStudents(data, ref);
  const gstats = goalStats(data, ref);
  const mstats = meetingStats(data, ref);
  const cgoals = classGoals(data);
  const staleDays = data.settings.staleDays;

  return html`
    <div class="stats-row">
      <div class="stat"><span class="stat-value">${students.length}</span><span class="stat-label">תלמידים</span></div>
      <div class="stat"><span class="stat-value">${mstats.recentMeetings}</span><span class="stat-label">מפגשים ב-${staleDays} הימים האחרונים</span></div>
      <div class="stat"><span class="stat-value">${percent(mstats.coverage)}</span><span class="stat-label">מהתלמידים נפגשו לאחרונה</span></div>
      <div class="stat"><span class="stat-value">${percent(gstats.totals.overallRate)}</span><span class="stat-label">ביצוע מטרות</span></div>
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>המפגשים הבאים</h2>
        <p class="muted small">מפגשים שנקבעו, שיחות מעקב, והצעות שיבוץ לפי תדירות המפגשים (עד ${data.settings.meetingsPerDay} ביום).</p>
        ${suggestions.length ? html`<ul class="suggestions">${suggestions.map((i) => suggestionRow(data, i))}</ul>` : emptyState('אין מפגשים מתוכננים')}
      </section>

      <section class="card">
        <h2>לא נפגשו לאחרונה <span class="count">${stale.length}</span></h2>
        <p class="muted small">תלמידים שלא נפגשו ביותר מ-${staleDays} ימים.</p>
        ${
          stale.length
            ? html`<ul class="simple-list">
                ${stale.map(
                  (x) => html`<li>
                    ${studentLink(x.student)}
                    <span class="${x.last ? 'muted' : 'badge warning'}">${x.last ? `לפני ${x.days} ימים` : 'טרם נפגשנו'}</span>
                  </li>`,
                )}
              </ul>`
            : emptyState('כל התלמידים נפגשו לאחרונה 👏')
        }
      </section>
    </div>

    <section class="card">
      <h2>סטטיסטיקת מטרות</h2>
      ${
        gstats.perGoal.length
          ? html`
            <div class="stats-row compact">
              <div class="stat"><span class="stat-value">${gstats.totals.goals}</span><span class="stat-label">מטרות פעילות</span></div>
              <div class="stat"><span class="stat-value">${percent(gstats.totals.oneTimeRate)}</span><span class="stat-label">מטרות חד פעמיות שהושלמו</span></div>
              <div class="stat"><span class="stat-value">${percent(gstats.totals.recurringRate)}</span><span class="stat-label">מטרות חוזרות בזמן</span></div>
              <div class="stat ${gstats.totals.overdue ? 'warn' : ''}"><span class="stat-value">${gstats.totals.overdue}</span><span class="stat-label">באיחור</span></div>
              <div class="stat"><span class="stat-value">${percent(gstats.totals.teacherRate)}</span><span class="stat-label">מטרות אישיות שלי</span></div>
              <div class="stat"><span class="stat-value">${percent(gstats.totals.studentRate)}</span><span class="stat-label">מטרות של התלמידים</span></div>
            </div>
            ${when(
              cgoals.length,
              html`<h3>מטרות כיתתיות</h3><ul class="goal-list">${cgoals.map((g) => goalCheckRow(data, g, null, { showDescription: false }))}</ul>`,
            )}
            <div class="grid-2">
              <div>
                <h3>לפי מטרה</h3>
                <ul class="bar-list">
                  ${gstats.perGoal
                    .filter((x) => x.goal.scope !== 'student')
                    .map(
                      (x) => html`<li>
                        <div class="bar-head"><span>${x.goal.title}</span><span class="muted small">${x.done}/${x.targets}${x.overdue ? ` · ${x.overdue} באיחור` : ''}</span></div>
                        <div class="badges small">${goalBadges(x.goal)}</div>
                        ${progressBar(x.rate, { label: x.goal.title })}
                      </li>`,
                    )}
                </ul>
              </div>
              <div>
                <h3>לפי תלמיד</h3>
                ${studentBars(gstats.perStudent.filter((x) => x.total).sort((a, b) => a.rate - b.rate))}
              </div>
            </div>`
          : emptyState('עדיין לא הוגדרו מטרות.', html`<a class="btn secondary" href="#/goals">הגדרת מטרות</a>`)
      }
    </section>`;
}

export const handlers = {
  'dash.schedule'(ctx, el) {
    const { student: id, date } = el.dataset;
    ctx.store.update((data) => {
      const s = getStudent(data, id);
      if (s) s.nextMeeting = { date, time: '', note: '' };
    });
    toast(`המפגש נקבע ל-${formatDate(date)}`);
  },
};

