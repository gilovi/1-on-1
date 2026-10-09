// Minimal vCard (2.1 / 3.0 / 4.0) parser for importing a class contact list.

const TYPE_LABELS = {
  CELL: 'נייד',
  HOME: 'בית',
  WORK: 'עבודה',
  MAIN: 'ראשי',
  VOICE: 'טלפון',
};

function unfold(text) {
  // RFC 6350 folding: CRLF followed by a space or tab continues the previous line.
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else if (out.length && /ENCODING=QUOTED-PRINTABLE/i.test(out[out.length - 1]) && out[out.length - 1].endsWith('=')) {
      // Quoted-printable soft line break (vCard 2.1, common in Android exports).
      out[out.length - 1] = out[out.length - 1].slice(0, -1) + line;
    } else {
      out.push(line);
    }
  }
  return out;
}

function decodeQuotedPrintable(value, charset = 'utf-8') {
  const bytes = [];
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(c));
    }
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
}

function unescapeValue(v) {
  return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

/** Split on separator characters that are not backslash-escaped. */
function splitUnescaped(v, sep) {
  const parts = [];
  let cur = '';
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && i + 1 < v.length) {
      cur += v[i] + v[i + 1];
      i++;
    } else if (v[i] === sep) {
      parts.push(cur);
      cur = '';
    } else {
      cur += v[i];
    }
  }
  parts.push(cur);
  return parts.map(unescapeValue);
}

function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  let value = line.slice(colon + 1);
  const [nameWithGroup, ...paramParts] = head.split(';');
  let group = null;
  let name = nameWithGroup;
  const dot = nameWithGroup.indexOf('.');
  if (dot >= 0) {
    group = nameWithGroup.slice(0, dot);
    name = nameWithGroup.slice(dot + 1);
  }
  const params = {};
  const types = [];
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq < 0) {
      types.push(p.toUpperCase()); // vCard 2.1 bare types, e.g. TEL;CELL:
      continue;
    }
    const k = p.slice(0, eq).toUpperCase();
    const v = p.slice(eq + 1);
    if (k === 'TYPE') types.push(...v.split(',').map((t) => t.replace(/"/g, '').toUpperCase()));
    else params[k] = v;
  }
  if ((params.ENCODING || '').toUpperCase() === 'QUOTED-PRINTABLE') {
    value = decodeQuotedPrintable(value, params.CHARSET || 'utf-8');
  }
  return { group, name: name.toUpperCase(), params, types, value };
}

function normalizePhone(p) {
  return (p || '').replace(/[^\d+]/g, '');
}

function cardToContact(props) {
  const groupLabels = {};
  for (const p of props) {
    if (p.name === 'X-ABLABEL' && p.group) groupLabels[p.group] = unescapeValue(p.value).replace(/^_\$!<(.*)>!\$_$/, '$1');
  }

  const contact = { firstName: '', lastName: '', fullName: '', phones: [], email: '', address: '', org: '' };

  for (const p of props) {
    switch (p.name) {
      case 'N': {
        const [last = '', first = ''] = splitUnescaped(p.value, ';');
        contact.lastName = last.trim();
        contact.firstName = first.trim();
        break;
      }
      case 'FN':
        contact.fullName = unescapeValue(p.value).trim();
        break;
      case 'ORG':
        contact.org = splitUnescaped(p.value, ';').map((s) => s.trim()).filter(Boolean).join(' - ');
        break;
      case 'EMAIL': {
        const v = unescapeValue(p.value).trim();
        if (v && !contact.email) contact.email = v;
        break;
      }
      case 'ADR': {
        const parts = splitUnescaped(p.value, ';').map((s) => s.trim()).filter(Boolean);
        if (parts.length && !contact.address) contact.address = parts.join(', ');
        break;
      }
      case 'TEL': {
        const number = normalizePhone(p.value);
        if (!number) break;
        const label =
          (p.group && groupLabels[p.group]) ||
          p.types.map((t) => TYPE_LABELS[t]).find(Boolean) ||
          'טלפון';
        contact.phones.push({ label, number });
        break;
      }
      default:
        break;
    }
  }

  if (!contact.fullName) contact.fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  if (!contact.firstName && !contact.lastName && contact.fullName) {
    const words = contact.fullName.split(/\s+/);
    contact.lastName = words.length > 1 ? words.pop() : '';
    contact.firstName = words.join(' ');
  }

  // Drop exact duplicate phone entries, but keep the same number under different labels
  // (e.g. the student's cell that is also listed as "אמא").
  const seen = new Set();
  contact.phones = contact.phones.filter((ph) => {
    const key = `${ph.label}|${ph.number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return contact;
}

/** Parse a .vcf file's text into a list of contacts. */
export function parseVCF(text) {
  const lines = unfold(text.replace(/^﻿/, ''));
  const contacts = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (/^BEGIN:VCARD$/i.test(line)) {
      current = [];
    } else if (/^END:VCARD$/i.test(line)) {
      if (current) {
        const c = cardToContact(current);
        if (c.fullName) contacts.push(c);
      }
      current = null;
    } else if (current) {
      const p = parseLine(line);
      if (p) current.push(p);
    }
  }
  return contacts;
}

/** Parse a plain list (one student per line, optionally "שם פרטי,שם משפחה" or CSV with a header). */
export function parseNameList(text) {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(/[,\t]/).map((s) => s.trim());
  const firstIdx = header.findIndex((h) => /^(שם פרטי|first ?name)$/i.test(h));
  const lastIdx = header.findIndex((h) => /^(שם משפחה|last ?name|surname)$/i.test(h));
  const hasHeader = firstIdx >= 0 && lastIdx >= 0;
  const rows = hasHeader ? lines.slice(1) : lines;
  return rows
    .map((line) => {
      const cells = line.split(/[,\t]/).map((s) => s.trim());
      let firstName;
      let lastName;
      if (hasHeader) {
        firstName = cells[firstIdx] || '';
        lastName = cells[lastIdx] || '';
      } else if (cells.length >= 2) {
        [firstName, lastName] = cells;
      } else {
        const words = cells[0].split(/\s+/);
        lastName = words.length > 1 ? words.pop() : '';
        firstName = words.join(' ');
      }
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      return { firstName, lastName, fullName, phones: [], email: '', address: '', org: '' };
    })
    .filter((c) => c.fullName);
}
