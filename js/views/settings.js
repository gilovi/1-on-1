import { today } from '../dates.js';
import { FREQUENCY_PRESETS } from '../model.js';
import { downloadFile, formValues, readFileText, toast, when } from '../ui.js';
import { html, attr } from '../ui/html.js';

const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export function render(ctx) {
  const { settings } = ctx.store.data;
  const backend = ctx.store.backend;
  const cfg = ctx.app.config;
  return html`
    <section class="card">
      <h2>הגדרות כיתה</h2>
      <form data-form="settings.save">
        <label class="field"><span>שם הכיתה</span><input name="className" value="${settings.className}" placeholder="למשל: ט׳3"></label>
        <div class="field-row">
          <label class="field"><span>תדירות מפגש לכל תלמיד (ברירת מחדל)</span>
            <select name="defaultFrequencyDays">
              ${FREQUENCY_PRESETS.map((p) => html`<option value="${p.days}"${attr.bool('selected', Number(settings.defaultFrequencyDays) === p.days)}>${p.label}</option>`)}
            </select>
          </label>
          <label class="field"><span>"לא נפגשו לאחרונה" – אחרי כמה ימים</span><input type="number" min="1" max="365" name="staleDays" value="${settings.staleDays}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>מספר מפגשים מקסימלי ביום (לשיבוץ ההצעות)</span><input type="number" min="1" max="20" name="meetingsPerDay" value="${settings.meetingsPerDay}"></label>
          <label class="field"><span>כמה מפגשים להציג בלוח</span><input type="number" min="1" max="100" name="suggestionsCount" value="${settings.suggestionsCount}"></label>
        </div>
        <fieldset><legend>ימי פעילות</legend>
          <div class="days">${DAYS.map(
            (d, i) => html`<label class="check"><input type="checkbox" name="workdays" value="${i}" data-group${attr.bool('checked', settings.workdays.includes(i))}> ${d}</label>`,
          )}</div>
        </fieldset>
        <button class="btn" type="submit">שמירת הגדרות</button>
      </form>
    </section>

    <section class="card">
      <h2>אחסון הנתונים</h2>
      ${
        backend.kind === 'drive'
          ? html`
            ${when(backend.account, () => html`<p>מחובר/ת כ-<b>${backend.account.name || ''}</b> <span class="muted" dir="ltr">${backend.account.email}</span></p>`)}
            <p>הנתונים נשמרים ב-Google Drive שלך, בתיקייה <b>${cfg.folderName}</b>, בקובץ אחד בפורמט JSON. בכל יום נשמר גם גיבוי בתת-התיקייה "גיבויים".</p>
            <p class="muted small">אפשר להעביר את התיקייה לכל מקום ב-Drive – האפליקציה תמשיך למצוא אותה. לאפליקציה יש גישה רק לקבצים שהיא עצמה יצרה.</p>
            <div class="toolbar">
              ${when(backend.folderUrl, html`<a class="btn secondary" href="${backend.folderUrl}" target="_blank" rel="noopener">פתיחת התיקייה ב-Drive</a>`)}
              <button class="btn secondary" data-action="settings.signOut">התנתקות מ-Google</button>
            </div>`
          : html`
            <p><b>מצב ניסיון:</b> הנתונים נשמרים רק בדפדפן הזה ועלולים להימחק עם ניקוי נתוני הגלישה.</p>
            <button class="btn" data-action="settings.toDrive">מעבר לשמירה ב-Google Drive</button>`
      }
    </section>

    <section class="card">
      <h2>גיבוי ושחזור</h2>
      <div class="toolbar">
        <button class="btn secondary" data-action="settings.export">הורדת גיבוי (JSON)</button>
        <label class="btn secondary file-btn">שחזור מגיבוי…<input type="file" accept=".json,application/json" data-change="settings.import" hidden></label>
      </div>
      <p class="muted small">שחזור מגיבוי מחליף את כל הנתונים הנוכחיים.</p>
    </section>`;
}

export const handlers = {
  'settings.save'(ctx, form) {
    const v = formValues(form);
    const clamp = (n, lo, hi, d) => Math.min(hi, Math.max(lo, Number(n) || d));
    ctx.store.update((data) => {
      Object.assign(data.settings, {
        className: v.className.trim(),
        defaultFrequencyDays: Number(v.defaultFrequencyDays) || 30,
        staleDays: clamp(v.staleDays, 1, 365, 30),
        meetingsPerDay: clamp(v.meetingsPerDay, 1, 20, 2),
        suggestionsCount: clamp(v.suggestionsCount, 1, 100, 10),
        workdays: (v.workdays || []).map(Number),
      });
    });
    toast('ההגדרות נשמרו');
  },
  'settings.export'(ctx) {
    downloadFile(`one-on-one-backup-${today()}.json`, JSON.stringify(ctx.store.data, null, 2));
  },
  async 'settings.import'(ctx, el) {
    const file = el.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await readFileText(file));
      if (!Array.isArray(data.students)) throw new Error('הקובץ אינו גיבוי תקין');
      if (!confirm(`לשחזר את הגיבוי (${data.students.length} תלמידים, ${(data.meetings || []).length} מפגשים)? כל הנתונים הנוכחיים יוחלפו.`)) return;
      ctx.store.replaceData(data);
      toast('הגיבוי שוחזר');
    } catch (e) {
      toast(`השחזור נכשל: ${e.message}`, 'error');
    } finally {
      el.value = '';
    }
  },
  'settings.toDrive'(ctx) {
    ctx.app.switchToDrive();
  },
  'settings.signOut'(ctx) {
    if (!confirm('להתנתק מ-Google? הנתונים נשארים ב-Drive.')) return;
    ctx.app.signOut();
  },
};
