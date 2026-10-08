// Persistence back-ends. Both expose: load() -> data|null, save(data), and optional backup(data).

import { BACKUPS_FOLDER_NAME, DATA_FILE_NAME } from './config.js';
import { today } from './dates.js';

export class AuthError extends Error {}
export class ConflictError extends Error {}

/* ------------------------------------------------------------------ browser-only storage */

const LOCAL_KEY = 'oneonone.data';

export class LocalStorageBackend {
  constructor() {
    this.kind = 'local';
  }

  async load() {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  async save(data) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  }
}

/* ------------------------------------------------------------------ Google Drive */

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

let gisPromise = null;
function loadGIS() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve(undefined);
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('טעינת שירותי ההתחברות של Google נכשלה. בדקו את החיבור לאינטרנט.'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

function q(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class DriveBackend {
  constructor({ clientId, folderName }) {
    this.kind = 'drive';
    this.clientId = clientId;
    this.folderName = folderName;
    this.token = null;
    this.expiresAt = 0;
    this.folderId = localStorage.getItem('oneonone.drive.folderId') || null;
    this.fileId = null;
    this.version = null;
    this.pending = null;
  }

  get folderUrl() {
    return this.folderId ? `https://drive.google.com/drive/folders/${this.folderId}` : null;
  }

  get signedIn() {
    return !!this.token && Date.now() < this.expiresAt;
  }

  /** True when the access token is missing or about to expire (tokens last ~1 hour). */
  get needsRefresh() {
    return !this.token || Date.now() > this.expiresAt - 10 * 60 * 1000;
  }

  /** The Google account used last time, so returning users skip the account chooser. */
  get account() {
    try {
      return JSON.parse(localStorage.getItem('oneonone.drive.account')) || null;
    } catch {
      return null;
    }
  }

  /**
   * Get an access token. Opens a Google popup, so it must run inside a user gesture (click).
   * For a returning user (consent already given, account known) the popup closes by itself.
   */
  async signIn() {
    await loadGIS();
    if (!this.tokenClient) {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPE,
        callback: (resp) => {
          const p = this.pending;
          this.pending = null;
          if (!p) return;
          if (resp.error) p.reject(new AuthError(resp.error_description || resp.error));
          else {
            this.token = resp.access_token;
            this.expiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;
            localStorage.setItem('oneonone.drive.authorized', '1');
            p.resolve(undefined);
          }
        },
        error_callback: (err) => {
          const p = this.pending;
          this.pending = null;
          p?.reject(new AuthError(err?.type === 'popup_closed' ? 'חלון ההתחברות נסגר' : err?.message || 'ההתחברות נכשלה'));
        },
      });
    }
    if (this.pending) return this.pending.promise;
    const returning = !!localStorage.getItem('oneonone.drive.authorized');
    const promise = new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.tokenClient.requestAccessToken({
        prompt: returning ? '' : 'consent',
        ...(this.account?.email ? { login_hint: this.account.email } : {}),
      });
    });
    this.pending.promise = promise;
    await promise;
    if (!this.account) await this.fetchAccount().catch(() => {});
    return promise;
  }

  async fetchAccount() {
    const res = await this.request(`${API}/about?fields=user(emailAddress,displayName)`);
    const { user } = await res.json();
    localStorage.setItem('oneonone.drive.account', JSON.stringify({ email: user.emailAddress, name: user.displayName }));
  }

  /** Start loading Google's sign-in script early so the first click can open the popup at once. */
  preload() {
    loadGIS().catch(() => {});
  }

  forgetAccount() {
    localStorage.removeItem('oneonone.drive.account');
    localStorage.removeItem('oneonone.drive.authorized');
    localStorage.removeItem('oneonone.drive.folderId');
  }

  /** Refresh the token while the user is active, so saves never hit an expired token. */
  refreshIfNeeded() {
    if (this.needsRefresh && !this.pending && globalThis.google?.accounts?.oauth2) {
      this.signIn().catch((e) => console.warn('token refresh failed', e));
      return true;
    }
    return false;
  }

  signOut() {
    if (this.token && globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(this.token, () => {});
    this.token = null;
    this.expiresAt = 0;
    localStorage.removeItem('oneonone.drive.authorized');
    localStorage.removeItem('oneonone.drive.account');
  }

  async request(url, options = {}) {
    if (!this.signedIn) throw new AuthError('נדרשת התחברות מחדש ל-Google');
    const res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${this.token}`, ...(options.headers || {}) },
    });
    if (res.status === 401) {
      this.token = null;
      throw new AuthError('נדרשת התחברות מחדש ל-Google');
    }
    if (!res.ok) {
      let msg = `${res.status}`;
      try {
        msg = (await res.json()).error?.message || msg;
      } catch {
        /* ignore */
      }
      throw Object.assign(new Error(`שגיאת Google Drive: ${msg}`), { status: res.status });
    }
    return res;
  }

  async findOne(query, fields = 'id,name,version') {
    const url = `${API}/files?q=${encodeURIComponent(query)}&spaces=drive&orderBy=createdTime&fields=files(${fields})`;
    const res = await this.request(url);
    const { files } = await res.json();
    return files[0] || null;
  }

  async createFolder(name, parentId) {
    const res = await this.request(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
    });
    return (await res.json()).id;
  }

  async ensureFolder() {
    if (this.folderId) {
      try {
        const res = await this.request(`${API}/files/${this.folderId}?fields=id,trashed`);
        const f = await res.json();
        if (!f.trashed) return this.folderId;
      } catch (e) {
        if (e instanceof AuthError) throw e;
      }
    }
    const found = await this.findOne(`mimeType='${FOLDER_MIME}' and name='${q(this.folderName)}' and trashed=false`);
    this.folderId = found ? found.id : await this.createFolder(this.folderName);
    localStorage.setItem('oneonone.drive.folderId', this.folderId);
    return this.folderId;
  }

  async load() {
    const folderId = await this.ensureFolder();
    const file = await this.findOne(`name='${DATA_FILE_NAME}' and '${folderId}' in parents and trashed=false`);
    if (!file) {
      this.fileId = null;
      this.version = null;
      return null;
    }
    this.fileId = file.id;
    const res = await this.request(`${API}/files/${file.id}?alt=media`);
    const data = await res.json();
    this.version = await this.currentVersion();
    return data;
  }

  async currentVersion() {
    const res = await this.request(`${API}/files/${this.fileId}?fields=version`);
    return (await res.json()).version;
  }

  async multipartCreate(name, parentId, data) {
    const boundary = `b${Math.random().toString(36).slice(2)}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify({ name, parents: [parentId], mimeType: 'application/json' })}\r\n` +
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(data)}\r\n--${boundary}--`;
    const res = await this.request(`${UPLOAD}/files?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return res.json();
  }

  /** Save the document. Throws ConflictError if the file was changed elsewhere since it was loaded. */
  async save(data, { force = false } = {}) {
    const folderId = await this.ensureFolder();
    if (!this.fileId) {
      const created = await this.multipartCreate(DATA_FILE_NAME, folderId, data);
      this.fileId = created.id;
      this.version = created.version;
      return;
    }
    if (!force) {
      const remote = await this.currentVersion();
      if (this.version && remote !== this.version) {
        throw new ConflictError('הנתונים ב-Google Drive השתנו ממכשיר אחר מאז שנטענו.');
      }
    }
    const res = await this.request(`${UPLOAD}/files/${this.fileId}?uploadType=media&fields=id,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(data),
    });
    this.version = (await res.json()).version;
  }

  /** Keep one snapshot per day in a backups sub-folder. */
  async backup(data) {
    const key = 'oneonone.drive.lastBackup';
    if (localStorage.getItem(key) === today()) return;
    const folderId = await this.ensureFolder();
    const found = await this.findOne(`mimeType='${FOLDER_MIME}' and name='${q(BACKUPS_FOLDER_NAME)}' and '${folderId}' in parents and trashed=false`);
    const backupsId = found ? found.id : await this.createFolder(BACKUPS_FOLDER_NAME, folderId);
    const name = `backup-${today()}.json`;
    const exists = await this.findOne(`name='${name}' and '${backupsId}' in parents and trashed=false`);
    if (!exists) await this.multipartCreate(name, backupsId, data);
    localStorage.setItem(key, today());
  }
}
