// Dates are stored as local calendar dates in 'YYYY-MM-DD' form.
// All arithmetic is done in UTC so daylight-saving changes never shift a day.

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today() {
  return toISODate(new Date());
}

function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isValidDate(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(toUTC(iso));
}

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * DAY_MS);
}

/** Number of days from a to b (positive when b is later). */
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(iso) {
  return new Date(toUTC(iso)).getUTCDay();
}

export function isWorkday(iso, workdays) {
  return workdays.includes(weekday(iso));
}

/** First date on or after iso that is a working day. */
export function nextWorkday(iso, workdays) {
  if (!workdays || workdays.length === 0) return iso;
  let d = iso;
  for (let i = 0; i < 7 && !isWorkday(d, workdays); i++) d = addDays(d, 1);
  return d;
}

export function maxDate(...dates) {
  return dates.filter(Boolean).reduce((a, b) => (a > b ? a : b), null);
}

const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function weekdayName(iso) {
  return WEEKDAYS_HE[weekday(iso)];
}

export function formatDate(iso, { withWeekday = false } = {}) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const s = `${Number(d)}.${Number(m)}.${y}`;
  return withWeekday ? `יום ${weekdayName(iso)}, ${s}` : s;
}

export function formatHebrewDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(
      new Date(toUTC(iso) + 12 * 60 * 60 * 1000),
    );
  } catch {
    return '';
  }
}

/** Human friendly relative description: "היום", "מחר", "לפני 3 ימים", "בעוד שבוע"... */
export function relativeDay(iso, ref = today()) {
  const n = diffDays(ref, iso);
  if (n === 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === -1) return 'אתמול';
  if (n === 2) return 'מחרתיים';
  if (n === -2) return 'שלשום';
  const abs = Math.abs(n);
  let span;
  if (abs < 14) span = `${abs} ימים`;
  else if (abs < 60) span = `${Math.round(abs / 7)} שבועות`;
  else span = `${Math.round(abs / 30)} חודשים`;
  return n > 0 ? `בעוד ${span}` : `לפני ${span}`;
}
