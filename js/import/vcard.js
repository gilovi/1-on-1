// Minimizing vCard (2.1 / 3.0 / 4.0) importer. Only names and, when asked, the three phones the app uses
// (the student's cell, the mother's and the father's) ever leave this module. Email, addresses, employers and
// every other phone are dropped while parsing; there is no field to hold them.

const MOTHER = /^(אמא|אימא|אם|mother|mom)$/i;
const FATHER = /^(אבא|אב|father|dad)$/i;
// Words that belong to a family name ("בן חיים") when a full name has to be split.
const NAME_PARTICLES = new Set(['בן', 'בת', 'אבו', 'אל', 'בר', 'דה', 'ואן', 'דל']);

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

/** @param {string} v */
function groupLabel(v) {
  return unescapeValue(v).replace(/^_\$!<(.*)>!\$_$/, '$1').trim();
}

/** Which of the three allowed phone roles a TEL line is, or null for any other phone. */
function phoneRole(tel, groupLabels) {
  const label = tel.group ? groupLabels[tel.group] : '';
  if (label) {
    if (MOTHER.test(label)) return 'motherPhone';
    if (FATHER.test(label)) return 'fatherPhone';
    return null; // any other label (grandma, work...) is not kept
  }
  return tel.types.includes('CELL') ? 'studentCell' : null;
}

/** Split a single full name; a run of family-name particles stays with the last word. */
function splitFullName(full) {
  const words = full.split(/\s+/).filter(Boolean);
  if (words.length < 2) return { firstName: words[0] || '', lastName: '' };
  let cut = words.length - 1;
  while (cut > 1 && NAME_PARTICLES.has(words[cut - 1])) cut--;
  return { firstName: words.slice(0, cut).join(' '), lastName: words.slice(cut).join(' ') };
}

/**
 * Read every card, keeping nothing but the name parts, the org (for the legacy shim) and the allowed phones.
 * @param {string} text
 */
export function readCards(text) {
  const lines = unfold(text.replace(/^﻿/, ''));
  const cards = [];
  let skipped = 0;
  let current = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (/^BEGIN:VCARD$/i.test(line)) {
      current = [];
    } else if (/^END:VCARD$/i.test(line)) {
      if (current) {
        const card = cardFromProps(current);
        if (card) cards.push(card);
        else skipped++;
      }
      current = null;
    } else if (current) {
      const p = parseLine(line);
      if (p && ['N', 'FN', 'ORG', 'TEL', 'X-ABLABEL'].includes(p.name)) current.push(p);
    }
  }
  return { cards, skipped };
}

function cardFromProps(props) {
  const groupLabels = {};
  for (const p of props) if (p.name === 'X-ABLABEL' && p.group) groupLabels[p.group] = groupLabel(p.value);
  let first = '';
  let last = '';
  let fn = '';
  let org = '';
  const phones = {};
  for (const p of props) {
    if (p.name === 'N') {
      const [l = '', f = ''] = splitUnescaped(p.value, ';');
      last = l.trim();
      first = f.trim();
    } else if (p.name === 'FN') {
      fn = unescapeValue(p.value).trim();
    } else if (p.name === 'ORG') {
      org = splitUnescaped(p.value, ';').map((s) => s.trim()).filter(Boolean).join(' - ');
    } else if (p.name === 'TEL') {
      const role = phoneRole(p, groupLabels);
      const value = p.value.trim();
      if (role && value && !phones[role]) phones[role] = value;
    }
  }
  if (!first && !last) {
    if (!fn) return null;
    ({ firstName: first, lastName: last } = splitFullName(fn));
  }
  return { firstName: first, lastName: last, org, phones };
}

/**
 * @param {string} text
 * @param {{ includePhones?: boolean }} [opts]
 * @returns {{ students: { firstName: string, lastName: string, contacts: null | { studentCell?: string, motherPhone?: string, fatherPhone?: string } }[], report: { skipped: number } }}
 */
export function parseVCard(text, { includePhones = false } = {}) {
  const { cards, skipped } = readCards(text);
  const students = cards.map((c) => ({
    firstName: c.firstName,
    lastName: c.lastName,
    contacts: includePhones && Object.keys(c.phones).length ? c.phones : null,
  }));
  return { students, report: { skipped } };
}

const digits = (p) => p.replace(/[^\d+]/g, '');

/** v1 adapter: contacts -> student.phones[] in the order נייד, אמא, אבא. */
export function contactsToPhones(contacts) {
  if (!contacts) return [];
  return [
    ['נייד', contacts.studentCell],
    ['אמא', contacts.motherPhone],
    ['אבא', contacts.fatherPhone],
  ]
    .map(([label, v]) => ({ label, number: digits(v || '') }))
    .filter((p) => p.number);
}
