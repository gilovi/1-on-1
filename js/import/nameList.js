// Name-list / CSV importer: names only, deduplicated. Accepts a pasted list (one name per line, split on the
// last word), a CSV with a "שם פרטי,שם משפחה" / "first,last" header (either order), or a single "name" column.

/** Parse delimited text into rows of cells. Handles quoted fields with commas, doubled quotes and newlines. */
function parseRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some(Boolean)) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"' && !cell.trim()) {
      quoted = true;
      cell = '';
    } else if (c === ',' || c === '\t') {
      endCell();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += c;
    }
  }
  endRow();
  return rows;
}

function splitLastWord(full) {
  const words = full.split(/\s+/).filter(Boolean);
  const lastName = words.length > 1 ? words.pop() : '';
  return { firstName: words.join(' '), lastName };
}

const FIRST = /^(שם פרטי|first ?name|first)$/i;
const LAST = /^(שם משפחה|last ?name|last|surname)$/i;
const FULL = /^(שם|שם מלא|name|full ?name)$/i;

/**
 * @param {string} text
 * @returns {{ students: { firstName: string, lastName: string, contacts: null }[], duplicates: number }}
 */
export function parseNameList(text) {
  const rows = parseRows(text.replace(/^\uFEFF/, ''));
  let toStudent = (cells) => (cells.length >= 2 ? { firstName: cells[0], lastName: cells[1] } : splitLastWord(cells[0]));
  if (rows.length) {
    const head = rows[0];
    const fi = head.findIndex((h) => FIRST.test(h));
    const li = head.findIndex((h) => LAST.test(h));
    const ni = head.length === 1 && FULL.test(head[0]) ? 0 : -1;
    if (fi >= 0 && li >= 0) {
      rows.shift();
      toStudent = (cells) => ({ firstName: cells[fi] || '', lastName: cells[li] || '' });
    } else if (ni >= 0) {
      rows.shift();
      toStudent = (cells) => splitLastWord(cells[0]);
    }
  }
  const seen = new Set();
  const students = [];
  let duplicates = 0;
  for (const cells of rows) {
    const { firstName, lastName } = toStudent(cells);
    const key = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();
    if (!key) continue;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    students.push({ firstName: firstName.replace(/\s+/g, ' ').trim(), lastName: lastName.replace(/\s+/g, ' ').trim(), contacts: null });
  }
  return { students, duplicates };
}
