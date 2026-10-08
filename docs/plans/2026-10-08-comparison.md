# Blind thinker/architect plans vs. the existing implementation

The thinker (`2026-10-08-thinker-spec.md`) and architect (`2026-10-08-architect-plan.md`) worked only from the user's requirements, without seeing the code. This file compares their plans with what is built (commit `90da939`).

## Part 1 – Thinker spec vs. implementation

### Where they agree (already built)
- Static app on GitHub Pages, Google Identity Services token model, `drive.file` scope only, a visible folder in My Drive, one JSON data file, daily backups, JSON export/import.
- The three goal scopes (student / class / everyone), teacher vs. student owner, one-time vs. recurring.
- A student page with meeting history, ordered topics (drag plus up/down buttons), goal checkboxes, a next-meeting date, and checkups.
- Recording a meeting ticks discussed topics, completes goals, closes a due planned meeting and checkups, and can set the next date.
- Dashboard: suggestions with reasons, "not met lately" with never-met students first, goal statistics, coverage.
- Saturday skipped in suggestions; per-student cadence override; PWA; privacy page; login hint for returning users; version check before writing.

### Where the implementation goes further than the spec
- Hebrew calendar dates are shown now (the spec puts them in phase 2).
- Trial mode (no Google account, browser storage) with migration to Drive.
- Suggestions are spread over school days with a meetings-per-day limit, not just ranked.
- An optional time-of-day and note on the planned meeting (the spec says date only).

### Gaps: the spec asks for something the implementation lacks or does differently

| # | Area | Spec | Implementation | Impact |
|---|---|---|---|---|
| G1 | **Import minimization** | Names and class only. Phones opt-in. Never address or email. | Imports address, email and all phones by default. | Privacy of minors; easy fix |
| G2 | **Recurring-goal semantics** | Fixed calendar-aligned periods (weekly/monthly) with done / pending / **missed** history and an **adherence %**. | A rolling window: "done" until `lastDone + N days`. No record of missed periods and no adherence. | Statistics are shallower; behavior differs (a monthly goal ticked Oct 30 stays done until Nov 29) |
| G3 | **Multi-device conflicts** | Merge at the entity level with `updatedAt` and tombstones; never lose a summary. | A whole-file version check; on conflict the user picks "reload" (local edits lost) or "overwrite" (remote edits lost). | Real data-loss risk with phone plus laptop |
| G4 | **Offline / local-first** | IndexedDB cache; open and edit everything offline; queued sync. | Drive mode needs Google sign-in to open at all; only unsaved changes are kept in localStorage. | Can't use the app in a no-signal corridor |
| G5 | **"Needs attention" flag** | Per-student flag plus reason; used in suggestions and filters. | Missing. | Useful, small |
| G6 | **Topic priority** | A persistent high/normal priority flag. | "Urgent" only puts a topic at the top when it's added. | Small |
| G7 | **Record-meeting shortcuts** | Quick "checkup in 3d / 1w / 2w" chips and a "topics for next time" field in the form. | Only a next-meeting date. | Speed of the critical flow |
| G8 | **Suggestion actions** | Postpone/snooze ("not today", "next week"), and a needs-attention factor. | "Schedule" and "record meeting" only. | Medium |
| G9 | **Statistics** | Adherence per recurring goal, meetings per week (last 8 weeks), median gap. | Current-period completion rates and coverage only. | Medium |
| G10 | **Saturday on planned dates** | A planned date can never be a Saturday. | Only the suggestions skip Saturday; the date picker accepts it. | Small |
| G11 | **Re-import** | Lists students missing from the new file and offers to deactivate them. | Adds and updates only. | Small |
| G12 | **Data lifecycle** | Sign-out clears local data (with a warning), "delete all data", restore from Drive backups, backup retention (14 daily + monthly). | Sign-out keeps the local cache; no delete-all; restore only from a downloaded file; backups kept forever. | Privacy and housekeeping |
| G13 | **Notices** | A first-run privacy notice, a mandatory-reporting disclaimer, Hebrew guidance when a school Workspace admin blocks the app. | Only the privacy page; a generic sign-in error. | Low effort, matters for distribution |
| G14 | **Hardening** | Meta CSP; self-hosted fonts (no third-party requests); `dir="auto"` on user text; a newer `schemaVersion` opens read-only. | Google Fonts loaded from Google; no CSP; no `dir="auto"`; the schema version is overwritten silently. | Low effort |
| G15 | **Mobile ergonomics** | Bottom tab bar, sticky "record meeting" button, quick "+ topic" from lists, meeting form as a bottom sheet. | Top nav; the form opens inline on the student page. | UX polish |
| G16 | **Model future-proofing** | `classId` on records (multi-class later), `updatedAt` on every entity, a stable external key from import. | Single class, no per-entity timestamps. | Needed before G3 and multi-class |

## Part 2 – Architect plan vs. implementation

### Where they agree (already built)
- No framework and no build step: vanilla ES modules served as-is from GitHub Pages, hash routing.
- GIS token model with plain `fetch` to Drive REST (no gapi); `drive.file`; one JSON document; version check before upload; a daily backup.
- Pure, date-injectable domain logic kept separate from the UI.
- Token renewal inside a user click (the architect's §4.2 "first click reconnects" is what `refreshIfNeeded` does), with `login_hint` and `prompt: ''` for returning users.
- Hebrew dates via `Intl` (the architect also moves them to the MVP); Saturday shifted to Sunday in scheduling.
- PWA with a service worker that never caches Google APIs.

### Differences

| # | Area | Architect | Implementation | Assessment |
|---|---|---|---|---|
| A1 | **Rendering & XSS** | A `h()` DOM builder using only `textContent`; ESLint bans `innerHTML`. | An escaping `html` tagged template written to `innerHTML`, with a `raw()` escape hatch. Safe by convention, not by construction. | Medium. Works today, but one misplaced `raw()` is an XSS hole in student notes. |
| A2 | **Typing text during background updates** | Open forms aren't re-rendered by store updates; meeting drafts are saved to IndexedDB on every keystroke. | The whole view re-renders on any store change. **Real bug:** if the app reloads data from Drive when the tab regains focus (another device saved meanwhile), a half-typed meeting summary is wiped. No drafts. | **High.** Directly contradicts "never lose typed text". |
| A3 | **Schema** | Collections are maps keyed by id; every entity has `updatedAt`/`by`/`deletedAt` (tombstones); `classes`; deterministic completion ids `goal:subject:period`; float topic order. | Arrays, no per-entity timestamps or tombstones, no `classId`; completions use random ids. | The prerequisite for A4 and G2. A migration is needed. |
| A4 | **Sync** | IndexedDB per Google account as the durable copy; a pull → merge → push engine with a commutative merge, a conflict log for meeting summaries, multi-tab locks, and backoff. | localStorage "pending" copy only; a whole-file conflict prompt (reload or overwrite); no multi-tab coordination. | **High.** The same as thinker G3/G4. |
| A5 | **Recurrence** | Calendar periods built from rule segments (frequency edits keep history), done/pending/missed status, adherence, per-student activity windows. | A rolling "done until last + N days" window. | The same as thinker G2. |
| A6 | **Suggestions** | A weighted score with reason chips, snooze via planned date, parent meetings don't count. | Due-date ordering spread over days with a daily limit, plus reason text; parent meetings count. | Different philosophy. The daily-limit spreading is a plus the architect lacks; snooze and weights are missing here. |
| A7 | **Staleness threshold** | Dropped; "stale" = past the student's cadence. | A separate "staleDays" setting. | Minor; the architect's is simpler. |
| A8 | **Tooling** | JSDoc + `tsc --checkJs` typecheck, ESLint (with the `innerHTML` ban and layering rules), Vitest unit tests next to code, Playwright e2e with fake Drive/GIS committed to the repo, a CI workflow, `npm run check`. | `node --test` unit tests in `tests/` only; the Playwright/fake-Drive scripts used during development were never committed; no lint/typecheck scripts or CI. | Required by the global CLAUDE.md. |
| A9 | **Auth errors** | `mapAuthError` to specific Hebrew messages (blocked by admin, popup blocked, scope not granted via `hasGrantedAllScopes`, domain policy, quota). | A generic error message; it doesn't detect the user unticking the Drive checkbox on the consent screen. | Medium for distribution. |
| A10 | **Sign-out vs. disconnect** | Sign-out clears local data but **doesn't revoke** (the next sign-in stays one click); a separate "disconnect" revokes. "Delete all" deletes the Drive folder. | Sign-out revokes the token and forgets the consent, so the next sign-in shows the consent screen again; local data isn't cleared; no delete-all. | Small fix, better UX and privacy. |
| A11 | **Backups** | Server-side `files.copy` of the pre-upload file, retention (14 daily + 12 monthly + 5 pre-restore), restore from Drive backups with a pre-restore snapshot. | Re-uploads a snapshot once a day, keeps everything forever, restore only from a downloaded file. | Medium. |
| A12 | **Drive discovery** | `appProperties` markers; handles two devices racing through first run (duplicate data files). | Search by folder/file name; duplicates are not handled. | Low. |
| A13 | **CSP & fonts** | A strict meta CSP, self-hosted fonts. | Google Fonts; no CSP; inline `style="width:…"` on progress bars would need changing for a strict CSP. | Low effort. |
| A14 | **Record-meeting UX** | A bottom sheet on mobile, a sticky CTA, 3 taps from the dashboard, quick checkup chips and new-topics field. | An inline form on the student page (also reachable from the dashboard in 2 taps), next-date only. | The same as thinker G7/G15. |
| A15 | **Acceptance criteria** | 77 concrete criteria ready for a qa agent. | 13 unit tests. | Can be reused as the regression suite whichever way we go. |

## Part 4 – Overall verdict
- The **feature surface** of the implementation matches both plans well, and in a few places (Hebrew dates, trial mode, daily-capacity scheduling) goes beyond them.
- The **foundation** is where the plans are clearly stronger: per-entity timestamps + merge + IndexedDB (no lost data across devices or while offline), calendar-period recurrence (meaningful goal statistics), and no-`innerHTML` rendering with form drafts (no lost typing).
- The quickest wins are small: import minimization, sign-out without revoke, Saturday shift on date pickers, notices and auth-error messages, CSP and self-hosted fonts, lint/typecheck scripts.
- The foundation items (A2–A5) touch most of the data layer and are best done as a planned rewrite of `model`/`logic`/`store`/`storage` with a migration from the current file format, driven by the architect's acceptance criteria.

## Part 3 – Process gaps (vs. the global CLAUDE.md rules)
- No `lint` or `typecheck` scripts in `package.json` (only `test`). The code is plain JS, so a typecheck would mean adding JSDoc + `tsc --checkJs` or moving to TypeScript.
- Tests live in `tests/`, not next to the code they cover.
- The app was built without the thinker → architect → critic → qa → builder → reviewer pipeline.
