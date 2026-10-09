// v1 compatibility shim over js/import/*. The app itself uses the import modules directly; this keeps the
// legacy { fullName, phones, email, address, org } shape for old callers. Email, address and home/work phones
// are never produced: only the נייד / אמא / אבא phones survive.

import { contactsToPhones, readCards } from './import/vcard.js';
import { parseNameList as parseNames } from './import/nameList.js';

const legacy = (firstName, lastName, extra = {}) => ({
  firstName,
  lastName,
  fullName: [firstName, lastName].filter(Boolean).join(' '),
  phones: [],
  email: '',
  address: '',
  org: '',
  ...extra,
});

/** Parse a .vcf file's text into a list of contacts. */
export function parseVCF(text) {
  return readCards(text).cards.map((c) => legacy(c.firstName, c.lastName, { org: c.org, phones: contactsToPhones(c.phones) }));
}

/** Parse a plain list (one student per line, optionally "שם פרטי,שם משפחה" or CSV with a header). */
export function parseNameList(text) {
  return parseNames(text).students.map((s) => legacy(s.firstName, s.lastName));
}
