import { mergeStudents } from '../model.js';
import { parseNameList } from '../import/nameList.js';
import { contactsToPhones, parseVCard } from '../import/vcard.js';
import { formValues, readFileText, toast, when } from '../ui.js';
import { html } from '../ui/html.js';

const withFullName = (s) => ({ ...s, fullName: [s.firstName, s.lastName].filter(Boolean).join(' ') });

/** Parse any supported input into preview rows. Phones are parsed here but only kept if the box is ticked at confirm. */
function parseAny(text, filename = '') {
  if (/\.vcf$/i.test(filename) || /BEGIN:VCARD/i.test(text)) {
    return parseVCard(text, { includePhones: true }).students.map(withFullName);
  }
  return parseNameList(text).students.map(withFullName);
}

export function render(ctx) {
  const data = ctx.store.data;
  const preview = ctx.ui.importPreview;
  const existing = new Set(data.students.map((s) => s.fullName.replace(/\s+/g, ' ').trim()));
  return html`
    <section class="card">
      <h2>טעינת רשימת תלמידים</h2>
      <p>אפשר לטעון קובץ אנשי קשר (<b>‎.vcf</b>, למשל ייצוא מ"משוב"/"מנבס" או מאנשי הקשר בטלפון), קובץ <b>CSV</b> עם עמודות "שם פרטי" ו"שם משפחה", או להדביק רשימת שמות – שם בכל שורה.</p>
      <p class="muted small">תלמידים שכבר קיימים ברשימה (לפי שם מלא) לא יתווספו שוב – הסיכומים, הנושאים והמטרות שלהם נשמרים. מיובאים שמות בלבד; טלפונים (נייד, אמא, אבא) רק אם תסמנו זאת בתצוגה המקדימה.</p>
      <div class="field-row">
        <label class="btn secondary file-btn">
          בחירת קובץ…
          <input type="file" accept=".vcf,.csv,.txt,text/vcard,text/csv,text/plain" data-change="import.file" hidden>
        </label>
      </div>
      <form data-form="import.paste">
        <label class="field"><span>או הדביקו רשימת שמות</span><textarea name="text" rows="5" placeholder="משה כהן&#10;יוסף לוי&#10;…"></textarea></label>
        <button class="btn secondary small" type="submit">תצוגה מקדימה</button>
      </form>
    </section>

    ${when(
      preview,
      () => html`
        <section class="card">
          <h2>תצוגה מקדימה <span class="count">${preview.length}</span></h2>
          ${
            preview.length
              ? html`<form data-form="import.confirm">
                  <div class="toolbar">
                    <button class="btn small secondary" type="button" data-action="import.selectAll" data-value="1">סימון הכל</button>
                    <button class="btn small secondary" type="button" data-action="import.selectAll" data-value="0">ניקוי הסימון</button>
                  </div>
                  ${when(
                    preview.some((c) => c.contacts),
                    html`<label class="check"><input type="checkbox" name="includePhones"><span>ייבוא טלפונים (נייד, אמא, אבא)</span></label>`,
                  )}
                  <ul class="import-list">
                    ${preview.map(
                      (c, i) => html`<li><label class="check">
                        <input type="checkbox" name="idx" value="${i}" data-group checked>
                        <span><b>${c.fullName}</b>
                        ${when(existing.has(c.fullName.replace(/\s+/g, ' ').trim()), html`<span class="badge">קיים – יעודכן</span>`)}
                        </span>
                      </label></li>`,
                    )}
                  </ul>
                  <div class="form-actions">
                    <button class="btn" type="submit">ייבוא התלמידים המסומנים</button>
                    <button class="btn secondary" type="button" data-action="import.cancel">ביטול</button>
                  </div>
                </form>`
              : html`<p>לא נמצאו שמות בקובץ.</p>`
          }
        </section>`,
    )}`;
}

export const handlers = {
  async 'import.file'(ctx, el) {
    const file = el.files?.[0];
    if (!file) return;
    try {
      const text = await readFileText(file);
      ctx.ui.importPreview = parseAny(text, file.name);
    } catch (e) {
      toast(`קריאת הקובץ נכשלה: ${e.message}`, 'error');
    }
    ctx.rerender();
  },
  'import.paste'(ctx, form) {
    ctx.ui.importPreview = parseAny(formValues(form).text);
    ctx.rerender();
  },
  'import.selectAll'(ctx, el) {
    document.querySelectorAll('.import-list input[type=checkbox]').forEach((cb) => {
      /** @type {HTMLInputElement} */ (cb).checked = el.dataset.value === '1';
    });
  },
  'import.cancel'(ctx) {
    ctx.ui.importPreview = null;
    ctx.rerender();
  },
  'import.confirm'(ctx, form) {
    const { idx = [], includePhones } = formValues(form);
    const chosen = idx
      .map((i) => ctx.ui.importPreview[Number(i)])
      .filter(Boolean)
      .map((c) => ({ ...c, phones: includePhones ? contactsToPhones(c.contacts) : [] }));
    if (!chosen.length) return;
    const r = ctx.store.update((data) => {
      return mergeStudents(data, chosen);
    });
    ctx.ui.importPreview = null;
    toast(`נוספו ${r.added} תלמידים${r.updated ? `, עודכנו ${r.updated}` : ''}`);
    ctx.navigate('#/students');
  },
};
