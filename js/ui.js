// Non-templating UI helpers (templating lives in ui/html.js).

import { html } from './ui/html.js';

export const when = (cond, a, b = '') => {
  const v = cond ? a : b;
  return typeof v === 'function' ? v() : v;
};

export function percent(r) {
  return r === null || r === undefined ? '—' : `${Math.round(r * 100)}%`;
}

export function progressBar(rate, { label = '' } = {}) {
  const pct = rate === null || rate === undefined ? 0 : Math.round(rate * 100);
  const level = pct >= 75 ? 'good' : pct >= 40 ? 'mid' : 'low';
  return html`<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${label}">
    <div class="progress-fill ${level}" style="width:${pct}%"></div>
  </div>`;
}

let toastTimer = null;
export function toast(message, kind = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast';
  }, 3500);
}

export function downloadFile(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });
}

/** Read named form fields into a plain object (checkbox groups with the same name become arrays). */
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      const group = form.querySelectorAll(`input[type=checkbox][name="${CSS.escape(el.name)}"]`).length > 1 || el.dataset.group !== undefined;
      if (group) {
        out[el.name] = out[el.name] || [];
        if (el.checked) out[el.name].push(el.value);
      } else {
        out[el.name] = el.checked;
      }
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else {
      out[el.name] = el.value;
    }
  }
  return out;
}
