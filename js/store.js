// Application state + save orchestration (debounced autosave, offline cache, conflict handling).

import { normalizeData } from './model.js';
import { AuthError, ConflictError } from './storage.js';

const PENDING_KEY = 'oneonone.pending';
const SAVE_DELAY_MS = 1200;

export const store = {
  data: null,
  backend: null,
  /** 'saved' | 'dirty' | 'saving' | 'error' | 'auth' | 'conflict' */
  status: 'saved',
  error: null,
  listeners: new Set(),
  timer: null,
  rev: 0,
  saving: false,

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  emit() {
    for (const fn of this.listeners) fn();
  },

  setStatus(status, error = null) {
    this.status = status;
    this.error = error;
    for (const fn of this.listeners) fn({ statusOnly: true });
  },

  /** Load the document. `seed` is used to create a new file when none exists yet. */
  async init(backend, { seed = null } = {}) {
    this.backend = backend;
    this.rev = 0;
    const loaded = await backend.load();
    let data = loaded || seed;
    // Unsaved changes from a previous session (e.g. the browser was closed while offline).
    const pendingRaw = localStorage.getItem(PENDING_KEY);
    if (pendingRaw && backend.kind === 'drive') {
      try {
        const pending = JSON.parse(pendingRaw);
        if ((pending.updatedAt || '') > (data?.updatedAt || '')) {
          if (confirm('נמצאו שינויים שלא נשמרו ב-Google Drive מהפעם הקודמת. לשחזר אותם?')) {
            data = pending;
            this.data = normalizeData(data);
            this.status = 'dirty';
            this.scheduleSave(0);
            return { created: false };
          }
        }
      } catch {
        /* ignore a corrupt cache */
      }
      localStorage.removeItem(PENDING_KEY);
    }
    this.data = normalizeData(data);
    this.status = 'saved';
    if (!loaded) {
      await backend.save(this.data);
      return { created: true };
    }
    backend.backup?.(this.data).catch((e) => console.warn('backup failed', e));
    return { created: false };
  },

  /** Mutate the document and schedule a save. */
  update(fn) {
    const result = fn(this.data);
    this.rev++;
    this.data.updatedAt = new Date().toISOString();
    if (this.backend?.kind === 'drive') {
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(this.data));
      } catch {
        /* storage full - Drive is still the source of truth */
      }
    }
    if (!this.saving && this.status !== 'auth' && this.status !== 'conflict') this.status = 'dirty';
    this.scheduleSave();
    this.emit();
    return result;
  },

  replaceData(data) {
    this.data = normalizeData(data);
    this.update(() => {});
  },

  scheduleSave(delay = SAVE_DELAY_MS) {
    clearTimeout(this.timer);
    if (this.status === 'auth' || this.status === 'conflict') return;
    this.timer = setTimeout(() => this.flush(), delay);
  },

  async flush({ force = false } = {}) {
    clearTimeout(this.timer);
    if (!this.backend) return;
    if (this.saving) {
      this.scheduleSave();
      return;
    }
    const rev = this.rev;
    this.saving = true;
    this.setStatus('saving');
    try {
      await this.backend.save(this.data, { force });
      this.saving = false;
      if (this.rev !== rev) {
        // Changes were made while the request was in flight.
        this.setStatus('dirty');
        this.scheduleSave();
      } else {
        if (this.backend.kind === 'drive') localStorage.removeItem(PENDING_KEY);
        this.setStatus('saved');
      }
    } catch (e) {
      this.saving = false;
      console.error(e);
      if (e instanceof AuthError) this.setStatus('auth', e.message);
      else if (e instanceof ConflictError) this.setStatus('conflict', e.message);
      else {
        this.setStatus('error', e.message);
        this.timer = setTimeout(() => this.flush(), 15000);
      }
    }
  },

  /** After a conflict: discard local changes and take the remote copy. */
  async reloadFromBackend() {
    const data = await this.backend.load();
    localStorage.removeItem(PENDING_KEY);
    this.data = normalizeData(data);
    this.setStatus('saved');
    this.emit();
  },

  get dirty() {
    return this.status !== 'saved';
  },
};
