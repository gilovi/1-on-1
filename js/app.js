import { DEFAULT_FOLDER_NAME, GOOGLE_CLIENT_ID } from './config.js';
import { toggleGoal } from './logic.js';
import { normalizeData } from './model.js';
import { DriveBackend, LocalStorageBackend } from './storage.js';
import { store } from './store.js';
import { toast, when } from './ui.js';
import { clearHTML, html, setHTML } from './ui/html.js';
import * as dashboard from './views/dashboard.js';
import * as goals from './views/goals.js';
import * as importView from './views/import.js';
import * as settings from './views/settings.js';
import * as student from './views/student.js';
import * as students from './views/students.js';

const CONFIG_KEY = 'oneonone.config';

const routes = [
  { pattern: /^\/?$/, view: dashboard, nav: 'dashboard', title: 'לוח בקרה' },
  { pattern: /^\/students$/, view: students, nav: 'students', title: 'תלמידים' },
  { pattern: /^\/student\/([^/]+)$/, view: student, nav: 'students', title: 'דף תלמיד', params: ['id'] },
  { pattern: /^\/goals$/, view: goals, nav: 'goals', title: 'מטרות' },
  { pattern: /^\/import$/, view: importView, nav: 'import', title: 'ייבוא תלמידים' },
  { pattern: /^\/settings$/, view: settings, nav: 'settings', title: 'הגדרות' },
];

const NAV = [
  { id: 'dashboard', href: '#/', label: 'לוח בקרה' },
  { id: 'students', href: '#/students', label: 'תלמידים' },
  { id: 'goals', href: '#/goals', label: 'מטרות' },
  { id: 'import', href: '#/import', label: 'ייבוא' },
  { id: 'settings', href: '#/settings', label: 'הגדרות' },
];

const commonHandlers = {
  'goal.toggle'(ctx, el) {
    ctx.store.update((data) => toggleGoal(data, el.dataset.goal, el.dataset.student || null));
  },
  'ui.toggleRecurrence'(ctx, el) {
    const form = el.closest('form');
    const recurring = el.value === 'yes';
    form.querySelectorAll('.only-recurring').forEach((x) => (x.hidden = !recurring));
    form.querySelectorAll('.only-once').forEach((x) => (x.hidden = recurring));
    const preset = form.querySelector('[name=everyPreset]');
    form.querySelectorAll('.only-custom').forEach((x) => (x.hidden = !recurring || preset?.value !== 'custom'));
  },
  'ui.toggleCustomFreq'(ctx, el) {
    el.closest('form').querySelectorAll('.only-custom').forEach((x) => (x.hidden = el.value !== 'custom'));
  },
  'app.signIn'() {
    app.connectDrive();
  },
  'app.switchAccount'() {
    app.switchAccount();
  },
  'app.retrySave'() {
    app.reauthAndSave();
  },
  'app.conflictReload'() {
    if (confirm('לטעון את הנתונים העדכניים מ-Google Drive? השינויים האחרונים שביצעת כאן יימחקו.')) {
      store.reloadFromBackend().then(() => toast('הנתונים נטענו מחדש'));
    }
  },
  'app.conflictOverwrite'() {
    if (confirm('לשמור את הנתונים מהמכשיר הזה ולדרוס את השינויים שנעשו במכשיר האחר?')) {
      store.status = 'dirty';
      store.flush({ force: true });
    }
  },
  'welcome.local'() {
    app.saveConfig({ mode: 'local' });
    app.start();
  },
  'welcome.reset'() {
    app.saveConfig({ mode: null });
    app.showWelcome();
  },
  'welcome.drive'(ctx, form) {
    const v = Object.fromEntries(new FormData(form));
    const clientId = String(v.clientId || GOOGLE_CLIENT_ID || '').trim();
    if (!clientId) return;
    app.saveConfig({ mode: 'drive', clientId, folderName: String(v.folderName || DEFAULT_FOLDER_NAME).trim() });
    app.connectDrive();
  },
};

const handlers = {
  ...commonHandlers,
  ...dashboard.handlers,
  ...students.handlers,
  ...student.handlers,
  ...goals.handlers,
  ...importView.handlers,
  ...settings.handlers,
};

const app = {
  config: {},
  ui: {},
  route: null,
  started: false,
  main: null,

  loadConfig() {
    try {
      this.config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    } catch {
      this.config = {};
    }
    this.config.folderName = this.config.folderName || DEFAULT_FOLDER_NAME;
    return this.config;
  },

  saveConfig(patch) {
    this.config = { ...this.config, ...patch };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
  },

  get clientId() {
    return GOOGLE_CLIENT_ID || this.config.clientId || '';
  },

  ctx(params = {}, query = {}) {
    return {
      store,
      ui: this.ui,
      app: this,
      params,
      query,
      rerender: (opts) => this.render(opts),
      navigate: (hash, { replace = false } = {}) => {
        if (replace) {
          history.replaceState(null, '', hash);
          this.render();
        } else location.hash = hash;
      },
    };
  },

  async start() {
    this.loadConfig();
    if (!this.config.mode) return this.showWelcome();
    if (this.config.mode === 'local') {
      await store.init(new LocalStorageBackend());
      return this.startApp();
    }
    if (!this.clientId) return this.showWelcome();
    return this.showConnect();
  },

  showScreen(content) {
    clearHTML(document.getElementById('nav'));
    clearHTML(document.getElementById('save-status'));
    setHTML(this.main, content);
  },

  showWelcome() {
    this.showScreen(html`
      <section class="card welcome">
        <h1>שיחות אישיות עם תלמידים</h1>
        <p>כלי למחנך לניהול שיחות אחד-על-אחד: סיכומי מפגשים, נושאים לשיחה הבאה, מטרות אישיות וכיתתיות, ותזכורות למי לא נפגש לאחרונה.</p>
        <h2>שמירה ב-Google Drive (מומלץ)</h2>
        <p class="muted small">הנתונים נשמרים בתיקייה ייעודית ב-Drive שלך ונגישים מכל מכשיר. לאפליקציה יש גישה רק לקבצים שהיא יוצרת.</p>
        <form data-form="welcome.drive">
          ${when(
            !GOOGLE_CLIENT_ID,
            html`<label class="field"><span>Google OAuth Client ID</span>
              <input name="clientId" dir="ltr" required value="${this.config.clientId || ''}" placeholder="xxxxxxxx.apps.googleusercontent.com">
            </label>
            <p class="muted small">יש ליצור מזהה פעם אחת ב-Google Cloud Console – ההוראות בקובץ README.</p>`,
          )}
          <button class="btn google-btn" type="submit">${googleIcon} התחברות עם Google</button>
          <details class="small">
            <summary>אפשרויות מתקדמות</summary>
            <label class="field"><span>שם התיקייה ב-Drive</span><input name="folderName" value="${this.config.folderName}"></label>
          </details>
        </form>
        <hr>
        <h2>ניסיון ללא חשבון</h2>
        <p class="muted small">הנתונים יישמרו רק בדפדפן הזה. אפשר לעבור ל-Drive בהמשך מתוך ההגדרות, והנתונים יועברו.</p>
        <button class="btn secondary" data-action="welcome.local">כניסה במצב ניסיון</button>
        <p class="small muted footer-links"><a href="privacy.html">מדיניות פרטיות</a></p>
      </section>`);
    if (GOOGLE_CLIENT_ID) this.driveBackend().preload();
  },

  /** One DriveBackend per page; created on demand so the Google script can be preloaded. */
  driveBackend() {
    if (!this.drive || this.drive.clientId !== this.clientId) {
      this.drive = new DriveBackend({ clientId: this.clientId, folderName: this.config.folderName });
    }
    this.drive.folderName = this.config.folderName;
    return this.drive;
  },

  showConnect(error = '') {
    const backend = this.driveBackend();
    const account = backend.account;
    backend.preload();
    this.showScreen(html`
      <section class="card welcome">
        <h1>שיחות אישיות עם תלמידים</h1>
        ${when(error, html`<p class="error-text">${error}</p>`)}
        ${
          account
            ? html`<button class="btn google-btn" data-action="app.signIn">${googleIcon} המשך בתור ${account.name || account.email}</button>
                <p class="small muted">${account.email}</p>
                <p class="small"><a href="#" data-action="app.switchAccount">כניסה עם חשבון אחר</a></p>`
            : html`<p>הנתונים נשמרים ב-Google Drive שלך, בתיקייה <b>${this.config.folderName}</b>.</p>
                <button class="btn google-btn" data-action="app.signIn">${googleIcon} התחברות עם Google</button>`
        }
        <p class="small muted footer-links">
          ${when(!GOOGLE_CLIENT_ID, html`<a href="#" data-action="welcome.reset">שינוי הגדרות חיבור</a> · `)}
          <a href="privacy.html">מדיניות פרטיות</a>
        </p>
      </section>`);
  },

  switchAccount() {
    // Unsaved changes belong to the previous account; never restore them into another one.
    localStorage.removeItem('oneonone.pending');
    this.driveBackend().forgetAccount();
    this.connectDrive();
  },

  async connectDrive() {
    const backend = this.driveBackend();
    try {
      this.showScreen(html`<section class="card welcome"><p>מתחבר ל-Google Drive…</p></section>`);
      await backend.signIn();
      // Moving from trial mode: seed the new Drive file with the browser data.
      let seed = null;
      if (this.config.migrateFromLocal) {
        seed = await new LocalStorageBackend().load();
      }
      const { created } = await store.init(backend, { seed });
      if (this.config.migrateFromLocal) {
        this.saveConfig({ migrateFromLocal: false });
        toast(created && seed ? 'הנתונים הועברו ל-Google Drive' : 'נמצאו נתונים קיימים ב-Drive והם נטענו');
      }
      this.startApp();
    } catch (e) {
      console.error(e);
      this.showConnect(e.message || 'ההתחברות נכשלה');
    }
  },

  async reauthAndSave() {
    try {
      await store.backend.signIn();
      this.resumeSaving();
    } catch (e) {
      toast(e.message, 'error');
    }
  },

  /** After a fresh token: retry a save that failed for lack of authorization. */
  resumeSaving() {
    if (store.status === 'auth') {
      store.status = 'dirty';
      store.flush();
    }
  },

  switchToDrive() {
    this.saveConfig({ migrateFromLocal: true });
    if (!this.clientId) {
      this.saveConfig({ mode: null });
      this.showWelcome();
      return;
    }
    this.saveConfig({ mode: 'drive' });
    store.backend = null;
    this.started = false;
    this.showConnect();
  },

  signOut() {
    store.backend?.signOut();
    this.drive = null;
    store.backend = null;
    store.data = null;
    this.started = false;
    this.showConnect();
  },

  startApp() {
    if (!this.started) {
      this.started = true;
      store.subscribe((info) => (info?.statusOnly ? this.renderStatus() : this.render()));
    }
    this.render();
  },

  matchRoute() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, qs = ''] = hash.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs));
    for (const r of routes) {
      const m = path.match(r.pattern);
      if (m) {
        const params = {};
        (r.params || []).forEach((p, i) => (params[p] = decodeURIComponent(m[i + 1])));
        return { ...r, params, query, key: path };
      }
    }
    return { ...routes[0], params: {}, query, key: '/' };
  },

  renderNav(active) {
    const cls = store.data.settings.className;
    document.getElementById('class-name').textContent = cls ? `· ${cls}` : '';
    setHTML(
      document.getElementById('nav'),
      html`${NAV.map((n) => html`<a href="${n.href}" class="${n.id === active ? 'active' : ''}"${n.id === active ? html` aria-current="page"` : ''}>${n.label}</a>`)}`,
    );
  },

  renderStatus() {
    const el = document.getElementById('save-status');
    if (!el || !store.data) return;
    const s = store.status;
    const local = store.backend?.kind === 'local';
    const map = {
      saved: html`<span class="status ok" title="${local ? 'נשמר בדפדפן' : 'נשמר ב-Google Drive'}">✓ ${local ? 'נשמר (בדפדפן)' : 'נשמר ב-Drive'}</span>`,
      dirty: html`<span class="status pending">• שינויים ממתינים</span>`,
      saving: html`<span class="status pending">שומר…</span>`,
      error: html`<span class="status error" title="${store.error}">שגיאת שמירה – מנסה שוב</span>`,
      auth: html`<button class="status error" data-action="app.retrySave">נדרשת התחברות מחדש – לחצו לשמירה</button>`,
      conflict: html`<span class="status error">הנתונים שונו במכשיר אחר:
        <button class="link-btn" data-action="app.conflictReload">טעינה מחדש</button> /
        <button class="link-btn" data-action="app.conflictOverwrite">שמירת הגרסה שלי</button></span>`,
    };
    setHTML(el, map[s] || html``);
  },

  render({ keepFocus = false } = {}) {
    if (!store.data) return;
    const route = this.matchRoute();
    const sameRoute = this.route?.key === route.key;
    if (!sameRoute) {
      // Leaving a page resets its transient UI state.
      for (const k of ['editMeeting', 'editTopic', 'editGoal', 'meetingFormFor', 'importPreview', 'addGoalOpen']) delete this.ui[k];
    }
    this.route = route;

    // Preserve open <details>, focus and caret across re-renders of the same page.
    const openDetails = sameRoute ? [...this.main.querySelectorAll('details')].map((d) => d.open) : null;
    const active = /** @type {HTMLInputElement | null} */ (document.activeElement);
    const focusKey = keepFocus && active?.dataset?.input;
    const caret = focusKey ? [active.selectionStart, active.selectionEnd] : null;

    this.renderNav(route.nav);
    this.renderStatus();
    const ctx = this.ctx(route.params, route.query);
    setHTML(this.main, route.view.render(ctx));
    document.title = `${route.title} · שיחות אישיות`;

    if (openDetails) {
      const now = [...this.main.querySelectorAll('details')];
      if (now.length === openDetails.length) now.forEach((d, i) => (d.open = d.open || openDetails[i]));
    }
    if (focusKey) {
      const el = this.main.querySelector(`[data-input="${CSS.escape(focusKey)}"]`);
      if (el) {
        el.focus();
        el.setSelectionRange?.(...caret);
      }
    }
  },

  async handle(name, el, ev) {
    // Note: the topic drop handler is called with (topicId, index) instead of (element, event).
    const fn = handlers[name];
    if (!fn) {
      console.warn('no handler', name);
      return;
    }
    const route = this.route || this.matchRoute();
    try {
      await fn(this.ctx(route.params, route.query), el, ev);
    } catch (e) {
      console.error(e);
      toast(`שגיאה: ${e.message}`, 'error');
    }
  },

  bindEvents() {
    document.addEventListener('click', (ev) => {
      const b = store.backend;
      if (b?.kind === 'drive' && this.started && !/** @type {HTMLElement} */ (ev.target).closest('[data-action="app.retrySave"]') && b.refreshIfNeeded()) {
        b.pending?.promise.then(() => this.resumeSaving()).catch(() => {});
      }
      const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (ev.target).closest('[data-action]'));
      if (!el || el.hasAttribute('disabled')) return;
      if (el.tagName === 'A' && el.getAttribute('href') === '#') ev.preventDefault();
      this.handle(el.dataset.action, el, ev);
    });
    document.addEventListener('submit', (ev) => {
      const form = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (ev.target).closest('form[data-form]'));
      if (!form) return;
      ev.preventDefault();
      this.handle(form.dataset.form, form, ev);
    });
    document.addEventListener('change', (ev) => {
      const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (ev.target).closest('[data-change]'));
      if (el) this.handle(el.dataset.change, el, ev);
    });
    document.addEventListener('input', (ev) => {
      const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (ev.target).closest('[data-input]'));
      if (el) this.handle(el.dataset.input, el, ev);
    });

    // Drag & drop reordering of topics.
    let dragId = null;
    document.addEventListener('dragstart', (ev) => {
      const li = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (ev.target).closest?.('[data-topic]'));
      if (!li) return;
      dragId = li.dataset.topic;
      li.classList.add('dragging');
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', dragId);
    });
    document.addEventListener('dragover', (ev) => {
      const li = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (ev.target).closest?.('[data-topic]'));
      if (!dragId || !li) return;
      ev.preventDefault();
      document.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
      if (li.dataset.topic !== dragId) li.classList.add('drop-target');
    });
    document.addEventListener('drop', (ev) => {
      const li = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (ev.target).closest?.('[data-topic]'));
      if (!dragId || !li) return;
      ev.preventDefault();
      const ids = [...li.parentElement.querySelectorAll('[data-topic]')].map((x) => /** @type {HTMLElement} */ (x).dataset.topic);
      const to = ids.indexOf(li.dataset.topic);
      const id = dragId;
      dragId = null;
      if (id !== li.dataset.topic) this.handle('student.dropTopic', id, to);
    });
    document.addEventListener('dragend', () => {
      dragId = null;
      document.querySelectorAll('.dragging, .drop-target').forEach((x) => x.classList.remove('dragging', 'drop-target'));
    });

    window.addEventListener('hashchange', () => {
      if (store.data && this.started) {
        this.render();
        window.scrollTo(0, 0);
      }
    });

    window.addEventListener('beforeunload', (ev) => {
      if (store.backend?.kind === 'local' && store.dirty) {
        store.backend.save(store.data);
        return;
      }
      if (store.data && store.dirty) {
        ev.preventDefault();
        ev.returnValue = '';
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && store.data && store.status === 'dirty') store.flush();
    });

    // Pick up changes made on another device when returning to the tab.
    window.addEventListener('focus', async () => {
      const b = store.backend;
      if (!b || b.kind !== 'drive' || !b.signedIn || !b.fileId || store.status !== 'saved') return;
      try {
        const v = await b.currentVersion();
        if (v !== b.version && store.status === 'saved') {
          await store.reloadFromBackend();
          toast('הנתונים עודכנו מ-Google Drive');
        }
      } catch {
        /* ignore - will surface on next save */
      }
    });
  },
};

const googleIcon = html`<svg class="g-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-4.1-13.6-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>`;

app.main = document.getElementById('main');
app.bindEvents();
app.start();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker registration failed', e));
}

// Exposed for debugging in the console.
globalThis.oneOnOne = { app, store, normalizeData };
