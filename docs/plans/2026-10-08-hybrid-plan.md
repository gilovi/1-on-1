# Hybrid rebuild plan: "1-on-1" (v2, revised 2026-10-09)

This file replaces `docs/plans/2026-10-08-hybrid-plan.md`.

It addresses `2026-10-08-critic-review.md` and the decisions in `2026-10-08-decisions.md` items 5–15, which are binding.

## Changes from v1 of this plan

| ID | Finding | Resolution |
|---|---|---|
| B1 | Merge logged false conflicts | **Critic's fix, refined.** Each entity carries `base` (the `{updatedAt, by}` it was edited from, unchanged across unsynced local edits). A loser counts as an *ancestor* when it is ≤ `winner.base`, or when it comes from the same device with the same base. Forms also send their opening `base`, so overwriting an unseen remote change is still logged (§3.2). New ACs are AC-M7–M10. |
| B2 | Discovery split the data across two files and caused false `remote-deleted` | **Critic's fix.** Every boot sync lists the data files and picks a deterministic winner (oldest `createdTime`, then id). Losers are merged, then trashed with `supersededBy`. A trashed cached file or a 404 runs discovery first. `remote-missing` is declared only when no live data file exists. The `everSynced=false` case is defined. ACs: AC-L5 and AC-L6. |
| B3 | Backups inherited `kind:'data'` | **Critic's fix.** Every copy sets `appProperties.kind='backup'` explicitly. Discovery also ignores files whose parents include the backups folder. The fake Drive models inheritance. The behaviour is checked against the real API in the P8c canary checklist. AC: AC-S50. |
| B4 | Autosave re-render dropped focus and the keyboard | **Better fix: a DOM morph replaces `innerHTML` swaps** (§1.2). The focused element and dirty controls are never replaced or overwritten, so autosave, remote updates and local actions keep focus, caret and the keyboard. AC-F5 now asserts `activeElement` and `selectionStart`. |
| M1 | The sync's write wasn't atomic | Every IDB doc write, including the end of a sync, runs under the `doc:` lock and bumps `meta.gen`. Dispatch compares `gen`. AC: AC-Y5. |
| M2 | A token could belong to the wrong account | After every grant, `about.permissionId` is checked before any Drive call. On a mismatch, sync stops and the app never merges across accounts. AC: AC-Y6. |
| M3 | Offline-first opening on shared computers | Per decision 10, a "מחשב משותף" checkbox at sign-in gives a memory-only doc and session-only drafts, with nothing in IDB or localStorage. AC: AC-Y7. |
| M4 | Sign-out and delete-all could lose data or leave it behind | Sign-out always runs a full pull-merge-push and then re-reads the version. Other tabs are told via broadcast and `versionchange`/`onblocked` are handled. `one-on-one:local` is deleted after the trial → Drive merge. ACs: AC-Z6 and AC-Z7. |
| M5 | Deferred renders swallowed taps; stale dirty forms blocked updates | **Removed by the morph.** There is no deferral and no `isEditing` gate: unchanged buttons are never replaced, so taps land. Drafts are flushed on `pagehide`/`hidden`. AC: AC-F9. |
| M6 | P3 depended on P4 | `periods()` and `periodKeyFor()` move into P3. P4 keeps status, adherence and stats. |
| M7 | P8 was too large and unsafe | P1 adds DOM-level characterization tests for every v1 handler, and they are re-run against v2. **The v2 app sits behind `V2_MODE` (off / canary / on)**, so everything merged to `main` is safe. P8 is split into P8a, P8b and P8c. P11 deletes v1 later. |
| M8 | CSP gaps | The exact CSP is in §4.1, including `https://oauth2.googleapis.com/revoke`. E2e ignores the known GIS inline-style violation. |
| M9 | Tombstones and conflicts kept personal data | Tombstones use an **allowlist** of kept keys. Deletes cascade to conflicts. Dismissing a conflict tombstones it. Conflicts expire after 30 days. **Students use sticky delete** (decision 14), and children of a deleted student are tombstoned on normalization. AC: AC-M11. |
| M10 | Migration correctness | Priority inference is dropped (all topics become `normal`); the `order:0` case is ambiguous. `activeFrom` = min(createdAt, first meeting, first completion), and it never changes after that. Reactivation uses `inactiveSpans`. **Adherence for migrated goals counts from the upgrade date (`countFrom`)**, per decision 11. MIG7 and MIG8 are rewritten. |
| M11 | Checkup closing was a behaviour change | Ported as in v1: any counted (non-parent) meeting closes due checkups. |
| M12 | Legacy catch-up worked on only one device | `legacy` lives in the v2 doc, so it is synced. Catch-up is add-only and stops after 30 days, followed by the scrub. The marker-doc idea was weighed and rejected (§3.6). |
| M13 | `remote-deleted` was dangerous after an accidental trash | The state is now `remote-missing`, with "שחזר מהאשפה" (untrash). "מחק גם מהמכשיר הזה" asks for confirmation. A 404 runs discovery. |
| m1 | Q6/U4 contradiction | Per decision 13, the meeting date may be a Saturday. The shift applies only to `input[data-no-saturday]`. Q6 and U4 are fixed. |
| m2 | H3/H4 not testable | Both rewritten. |
| m3 | Empty `workdays` | Falls back to Sun–Fri, and the walk is capped at 3650 days. |
| m4 | P0 typecheck fails on empty dirs | `tsconfig.strict.json` lands in P3 with the first files. |
| m5 | P2 shape mismatch | A `contacts→phones` display adapter is added for v1. The change to `vcf.test.js` is an explicit, separate commit. |
| m6 | Drafts | Moved to IDB in v2. Cleared on sign-out from P1. Checkbox restore semantics are defined, and stale ids are ignored. |
| m7 | iOS storage eviction | `navigator.storage.persist()`, plus a badge warning when edits stay unsynced for more than 24 h. |
| m8 | `settings` as one LWW entity | Settings become **one entity per key**. |
| m9 | Conflict stamps and restore bursts | Conflict stamps come only from the inputs. A restore sets `base` = the current version, so it produces no conflicts. |
| m10 | `next:{sid}` overwrite | Documented in §8 risk 8. |
| m11 | Notices ack copy | Moot: notices move to P8c, which writes straight to settings. |
| Cut | Trim P2 | Adopted. Auth mapping, sign-out/disconnect and notices move to P8c. |
| Decisions | 7, 8, 12, 14 | School-half unit; restore from the Drive backups list; canary switch; scrub ~30 days after migration. |

---

## 0. Context

**What I read:** the decisions doc, the blind plan, the comparison doc, the critic review, all of `js/`, `tests/`, `index.html`, `sw.js`, `package.json`, `.gitignore` and the README. Pages deploys from `main` (README line 42).

**Key code facts (verified by the critic):**
- The focus handler (`app.js:466-478`) reloads whenever `status==='saved'`, and textareas don't touch the store until submit. That combination wipes typed text.
- There are 6 `innerHTML` writes and only one `style=` (`ui.js:50`).
- `raw()` is used only for boolean attributes.
- `ensureFolder` recreates a trashed folder.
- There is no `parent` meeting type.
- v1 closes due checkups on any meeting type.

**Goal:** keep the screens and the look. Rebuild the data layer (schema v2, IDB per account, merge sync, calendar recurrence), close the gaps from the decisions doc, and keep every commit on `main` safe for real users.

---

## 1. Target module layout

Old and new code coexist. The v1 tree stays live, apart from the P1/P2 fixes, until P11. The v2 tree is reachable only through `V2_MODE`. Modules shared by both trees are marked **(shared)**.

| Current | Target | Fate |
|---|---|---|
| `js/app.js` (boot, router, events, render) | v1: `js/app.js` exports `createApp()`; `js/main.js` is the entry. v2: `js/app/boot.js`, `js/app/router.js`, `js/app/store.js` (dispatch) | v1 refactored minimally in P1. v2 added in P8. |
| (none) | `js/main.js` **(shared)**: reads `V2_MODE` from `config.js` and `localStorage['oneonone.canary']`, then dynamically imports the v1 or v2 app | Added in P1 (v1 only), switch added in P8a |
| `js/config.js` | Adds `V2_MODE='off'`, `SCHEMA_VERSION=2`, `APP_ID`, `DATA_FILE_V2='one-on-one-data-v2.json'`, `LEGACY_DATA_FILE`, retention and scrub constants | Kept |
| `js/ui.js` | `js/ui/html.js` **(shared)**: `html`, `attr.bool`, private `raw`, `parseSafe()` (the single sink). `js/ui/morph.js` **(shared)**. `js/ui/drafts.js` **(shared)**. `js/ui/dateInput.js` **(shared)**. `js/ui/toast.js`, `forms.js`, `format.js`, `i18n.js` | Split |
| `js/dates.js`, `model.js`, `logic.js`, `store.js`, `storage.js`, `views/*` | Stay as the v1 tree | **Deleted in P11** |
| (none) | `js/domain/`: `dates`, `ids`, `schema` (factories, `KEEP_ON_TOMBSTONE`, `validateDoc`), `tx`, `selectors`, `cadence`, `periods`, `recurrence`, `stats`, `suggestions`, `actions`, `merge`, `migrate`, `migrateV1` | Added in P3–P6 |
| `js/vcf.js` | `js/import/vcard.js`, `nameList.js`, `names.js` **(shared)** | P2. v1 gets a `contacts→phones` adapter. |
| (none) | `js/storage/`: `idb.js`, `accountStore.js` (IDB), `memoryStore.js` (shared-computer mode), `locks.js` | Added in P7 |
| (none) | `js/sync/`: `auth.js` (with `mapAuthError`), `drive.js`, `discovery.js`, `syncEngine.js`, `backups.js` (`ensureDaily`, `retentionPlan`, `scrubPlan`, list and restore) | Added in P7 |
| (none) | `js/ui/views/*` (the v2 views, copied from `js/views/*` and ported) and `js/ui/views/notices.js` | Added in P8a/b. The copy is temporary until P11. |
| `tests/*` | `js/**/*.test.js` next to the code; `js/import/fixtures/sample.vcf`; `js/domain/fixtures/v1-sample.json`; `js/views/*.char.test.js` (characterization tests, run against both trees); `e2e/` | Moved in P0 |
| (none) | `package.json` scripts, `tsconfig.json` (non-strict, all of `js/`), `tsconfig.strict.json` (P3+), `js/types.d.ts`, `eslint.config.js`, `vitest.config.js` (`pool:'forks'`, `env.TZ='Asia/Jerusalem'`), `playwright.config.js`, `.github/workflows/check.yml`, `fonts/` | Added |

**Scripts:**
- `typecheck`: `tsc -p tsconfig.json`, extended to `&& tsc -p tsconfig.strict.json` from P3
- `lint`: `eslint . --max-warnings 0`
- `test`: `vitest run`
- `e2e`: `playwright test`
- `check`: all of the above except e2e

**CI** (`check.yml`): Node 22, `npm ci`, `npm run check`. From P10 there is also an e2e job with Chromium.

**ESLint** (as in v1 of this plan):
- `no-restricted-properties` bans `innerHTML`, `outerHTML` and `insertAdjacentHTML` everywhere except through an override for `js/ui/html.js`.
- `no-restricted-syntax` bans `style=` inside template literals.
- `no-restricted-imports`:
  - `raw` can only be imported in `ui/html.js`;
  - `domain/` and `import/` can't import from `ui/`, `storage/`, `sync/` or `app/`;
  - the v2 tree can't import the v1 modules (`model`, `logic`, `store`, `storage`, `views/`).

`.gitignore` gets `!js/import/fixtures/*.vcf`.

### 1.1 Rendering: keep `html```

The escaping template stays. `parseSafe(safeHtml)` is the only place HTML is parsed, through a `<template>`. It throws on anything that isn't `SafeHtml`. An XSS test renders every view with hostile strings. The `h()` rewrite and Trusted Types are rejected, for the same reasons as v1 of this plan.

### 1.2 Typing safety: morph instead of a render scheduler (resolves B4 and M5)

| | Render scheduler with deferral (v1 of this plan) | DOM morph (chosen) |
|---|---|---|
| Typing during a remote update | Deferred, with a banner | Applied immediately; the field being typed in is untouched |
| Autosave while typing (B4) | Needs `source` special-casing | Natural: the focused node is kept |
| Swallowed taps (M5) | Real risk | Unchanged nodes are kept, so clicks land |
| Abandoned dirty draft | Blocks updates | Dirty controls keep their value; everything else updates |
| `<details>`, focus and caret hacks in `render()` | Kept | Deleted |
| Cost | ~60 lines | ~150 lines plus `data-key` on repeated items |

**`morph(target, safeHtml)` (`ui/morph.js`):**
- Parse the new markup with `parseSafe`, then reconcile the children.
- **Matching:**
  - match by `data-key` when present;
  - otherwise match the same `tagName` at the same unkeyed position;
  - otherwise replace.
- **Attributes** are synced, except that existing `<details open>` is never closed.
- **Form controls** (`input`, `textarea`, `select`):
  - If the element is `document.activeElement` or has `dataset.dirty === '1'`, leave its `value`/`checked`/`selected` alone.
  - Otherwise, set the properties from the new markup.
- A delegated `input` listener sets `data-dirty` on the control. It is cleared on successful submit, reset or route change.
- **A route change does a full replace**, not a morph. Draft forms then refill from drafts.
- **Known limit:** reordering keyed nodes can move the focused node and blur it. That only happens for a remote topic reorder while a topic is being edited, which is accepted (§8).

**Drafts (`ui/drafts.js`):**
- Keys: `meeting:new:{sid}`, `meeting:edit:{mid}`, `notes:{sid}` and `topic:edit:{tid}`.
- Each draft is `{fields, base, savedAt}`.
- Checkbox groups are stored as arrays of the checked values; absent means unchecked. On restore, ids that are no longer offered are ignored.
- On `input`, the draft is written to an in-memory map and, debounced by 300 ms, to the adapter. The adapter is localStorage in v1 and IDB `drafts` (or `sessionStorage` in shared mode) in v2.
- Drafts are flushed on `pagehide` and `visibilitychange:hidden`.
- They are deleted on submit success, on cancel and on sign-out.
- Student notes autosave via a debounced `input`. The focused textarea survives thanks to the morph.

---

## 2. Schema v2 and migration

### 2.1 Shape (`schemaVersion: 2`)

Collections are maps keyed by id. Every entity has these common fields:

```
id, createdAt, updatedAt /*ISO ms*/, by /*deviceId*/,
base /*{updatedAt, by} | null*/, deletedAt /*null | ISO*/
```

A **tombstone keeps only the allowlisted keys**: the common keys plus `KEEP_ON_TOMBSTONE[coll]`:

| Collection | Extra keys kept on a tombstone |
|---|---|
| students | `classId` |
| meetings, planned, topics | `studentId` (planned also keeps `kind`) |
| goals | `scope`, `classId`, `studentId` |
| completions | `goalId`, `subject`, `periodKey` |
| conflicts | `coll`, `entityId`, `field` |

```
settings:  { [key]: { value } }   // one entity per key: defaultFrequencyDays, staleDays, meetingsPerDay,
                                   // suggestionsCount, workdays, activeClassId, noticesAck.privacy,
                                   // noticesAck.reporting, legacy
classes:   { [id]: { name, schoolName, archived } }
students:  { [id]: { classId, firstName, lastName, fullName, notes, cadenceDays|null,
             needsAttention:{flag, reason}, snoozedUntil|null, contacts|null /*studentCell,motherPhone,fatherPhone*/,
             active, activeFrom /*immutable*/, inactiveSpans:[{from, to|null}], source:{kind, externalKey} } }
meetings:  { [id]: { studentId, date /*Saturday allowed*/, type:'regular'|'checkup'|'discipline'|'academic'|'parent'|'other',
             summary, topicIdsDone[], completionIds[] } }
planned:   { ['next:'+sid | uuid]: { studentId, kind:'next'|'checkup', date /*never Saturday*/, time, note,
             status:'planned'|'done'|'cancelled', linkedMeetingId } }
topics:    { [id]: { studentId, text, order, priority:'high'|'normal', status:'open'|'done', doneAt, doneInMeetingId } }
goals:     { [id]: { title, description, scope, owner, classId, studentId, kind:'once'|'recurring',
             rules:[{from, unit:'week'|'month'|'half', every}], startDate, endDate, dueDate /*never Saturday*/,
             countFrom|null, archived } }
completions: { [`${goalId}:${subject}:${periodKey}`]: { goalId, subject, periodKey, completedOn, meetingId, note } }
conflicts: { [`${coll}:${entityId}:${field}:${lost.updatedAt}:${lost.by}`]: { coll, entityId, field, lostText } }
```

**Field rules:**
- The `legacy` setting holds `{fileId, folderId, migratedAt, catchUpUntil, scrubbedAt}`.
- **`unit:'half'`** (decision 7) has periods Sep 1–Jan 31 and Feb 1–Aug 31, and `every` must be 1.
- **`activeFrom` never changes after creation.** Period keys are clipped only by `goal.startDate`, the rule segment and `activeFrom`, so keys stay stable. Periods entirely inside `inactiveSpans`, or ending before `countFrom`, are *not counted*. Deactivating a student opens a span; reactivating closes it.
- Protected text fields (they can produce conflicts) are `meetings.summary` and `students.notes`.

### 2.2 `migrateV1(v1, {today}) → {doc, report}`

The migration is pure and deterministic. It never uses random ids or `Date.now()`. Every entity gets `updatedAt = v1.updatedAt`, `by = 'migration-v1'`, `base = null`.

| v1 | v2 |
|---|---|
| `settings.className` | `classes['class-1']`; `activeClassId = 'class-1'` |
| other settings | One entity per key. `workdays` drops 6; if the result is empty it becomes `[0..5]`. |
| `phones[]` | `contacts` from the labels `נייד`/CELL, `אמא`/Mother and `אבא`/Father (the first match wins). **Every other phone is dropped, and so are `email`, `address` and `org`.** |
| `frequencyDays` | `cadenceDays` |
| `createdAt` | `activeFrom = min(createdAt, first meeting date, first completion date)`. If `createdAt` is missing, use the other two, or else the date of `v1.updatedAt`. |
| `active:false` | `inactiveSpans = [{from: date(v1.updatedAt), to: null}]` |
| `nextMeeting` | `planned['next:'+sid]` with the date shifted off Saturday |
| `checkups[]` | `planned[c.id]` with the date shifted off Saturday; `done` with `linkedMeetingId` |
| topics | **`priority = 'normal'` for all** (M10). The open order is re-ranked to `1024·rank`. |
| meetings | `type` kept; `topicIdsDone`; `completionIds` |
| goal recurring `everyDays` | Presets: 7→week/1, 14→week/2, 30→month/1, 60→month/2, 90→month/3, **150→half/1**. Custom N<28 → week/round(N/7), otherwise month/round(N/30), both with a minimum of 1. Custom goals go into `report.approximatedGoals`. |
| goal recurring | **`countFrom = today`** (the upgrade date, decision 11). `startDate = min(createdAt, first completion)`. |
| completions | id `goal:subject:periodKey` (`subject` is the studentId, or `'class'`). If several land on one id, the earliest wins and the rest go to `report.collapsedCompletions`. Every source meeting keeps the surviving id. Orphans are dropped and counted. |
| (doc) | `settings.legacy = {fileId, folderId, migratedAt: today, catchUpUntil: today+30, scrubbedAt: null}` (only from Drive) |

`migrate(doc)`:
- v1, or arrays → `migrateV1`;
- v2 → identity;
- greater than 2 → throws `NewerSchemaError`, which makes the app read-only.

---

## 3. Sync design

### 3.1 Local storage and dispatch

- **Normal mode:** IDB `one-on-one:{permissionId}` (or `:local` for trial mode) with stores `kv` and `drafts`.
  - `meta` holds `{fileId, folderId, backupsId, remoteVersion, lastSyncAt, dirty, editSeq, gen, syncedWatermark, deviceId, maxSeen, readOnly, everSynced}`.
  - `localStorage.oneOnOne.lastAccount = {permissionId, email, name}`.
  - Call `navigator.storage.persist()` after the first sign-in. If dirty for more than 24 h, the badge warns "יש שינויים שלא נשמרו ב-Drive".
- **Shared-computer mode** (decision 10, checkbox at sign-in):
  - `memoryStore` holds the doc in memory; drafts go to `sessionStorage`.
  - Nothing is written to localStorage or IDB.
  - `beforeunload` warns if dirty. A reload requires signing in again, and there is no offline use.
- **Dispatch:**
  1. Take the lock `doc:{acct}`.
  2. If `meta.gen ≠ memory.gen`, reload the doc from IDB.
  3. Apply the pure action.
  4. Write the doc and `meta{dirty: true, editSeq+1, gen+1}`.
  5. Broadcast `doc-changed` and debounce sync by 1500 ms.
  6. Notify, which morphs the view.
- **`tx` stamping:**
  - `updatedAt = max(now, maxSeen + 1ms)`.
  - `base`:
    - if `old.by === deviceId && old.updatedAt > syncedWatermark` (an unsynced own edit), keep `old.base`;
    - otherwise `{updatedAt: old.updatedAt, by: old.by}`;
    - for new entities, `null`.

### 3.2 Merge (`domain/merge.js`)

The merge runs per collection over the union of ids.
- An id on one side only is taken from that side.
- Otherwise the winner is the max of `(updatedAt, by, canonicalJSON)`.
- **Students use sticky delete:** a live version beats a tombstone `T` only if `live.base ≥ (T.updatedAt, T.by)`, meaning it saw the delete, which only a restore can do. Otherwise the tombstone wins.

**Conflicts.** A conflict is recorded when both sides are live, a protected field differs, and the loser is **not an ancestor** of the winner. The loser is an ancestor when either:
- `winner.base ≠ null` and `(loser.updatedAt, loser.by) ≤ (winner.base.updatedAt, winner.base.by)`, **or**
- `loser.by === winner.by` and `loser.base` deep-equals `winner.base`, meaning the same device in the same unsynced lineage.

A conflict entity's stamps all come from the loser: `createdAt = updatedAt = loser.updatedAt`, `by = loser.by`. Its id is deterministic. A dismissed (tombstoned) conflict outranks a re-derived one, because the dismiss time is newer.

**Form base.** Edit forms and notes drafts carry the `base` they opened from. `editMeeting`/`setNotes` check it:
- if the current entity's version differs from the form's base and its text differs, a local conflict is written with the current text as `lostText`;
- this covers a remote change that arrived while the user was typing.

A restore sets `base` = the current version, so it produces no conflicts.

**Post-merge normalization** (deterministic):
- Every live child of a tombstoned student is tombstoned. Children are meetings, topics, planned items, completions with that subject, `scope:'student'` goals, and conflicts on those entities.
- The child's stamp is `updatedAt = max(child.updatedAt + 1ms, student.updatedAt)`, `by = student.by`.

`expireConflicts(now)` runs as an action after each sync and tombstones conflicts older than 30 days. Tombstoning strips `lostText`.

The merge is idempotent, commutative and associative, which property tests check.

### 3.3 Sync engine

The engine follows blind §4.4 under `sync:{acct}`, with these differences:
- It runs `resolveDataFile()` (§3.4) first.
- **The final write runs under `doc:{acct}`:** `cur = IDB doc`, `final = merge(cur, mergedRemote)`, write with `gen+1`, and broadcast. `dirty = (cur.editSeq ≠ seq0) || final ≠ uploaded`.
- After any sync where local equals remote, `syncedWatermark` = the max `updatedAt` in the uploaded or downloaded doc.

**Triggers:** debounce, `online`, `focus`/visible, every 60 s while visible, and after a token grant. The v1 focus handler is not ported.

**Account check (M2):** after every token grant, call `about?fields=user(permissionId, emailAddress, displayName)` before any Drive call. If the permissionId differs from the open DB:
- if the open DB is clean, switch to that account's DB;
- if it's dirty, show a modal: "נכנסת כ-X; לחשבון Y יש שינויים שלא נשמרו" with [התחבר שוב כ-Y] or [עבור ל-X, השינויים של Y יישארו במכשיר].

The app never merges across accounts.

### 3.4 Discovery (B2, B3 and M13)

```
resolveDataFile():
  if meta.fileId:
     m = getMeta(fileId, fields: trashed, appProperties, parents)
     if trashed && m.appProperties.supersededBy: switch fileId → supersededBy, merge (no prompt)
     if 404 or trashed (no supersededBy): fall through to discovery
  L = list(app='one-on-one', kind='data', trashed=false), excluding files whose parents include backupsId
  if |L| ≥ 1: winner = minBy(createdTime, id)
     for each loser: download → migrate → merge into local
     upload the winner; then PATCH each loser {trashed:true, appProperties:{supersededBy: winner.id}}
  if |L| = 0:
     if meta.everSynced: state 'remote-missing'
        if a trashed data file exists → offer [שחזר מהאשפה] (PATCH trashed:false on file and folder)
        also offer [העלה את העותק מהמכשיר הזה] and [מחק גם מהמכשיר הזה] (confirm dialog)
     else (first run, including everSynced=false with a trashed cached id):
        legacy lookup (§3.6) → migrate + create, or create fresh;
        then re-list immediately and dedup if |L| > 1
```

- `files.list` runs on **every boot sync**: one call.
- **Every `files.copy` sets `appProperties: {app:'one-on-one', kind:'backup'}`** explicitly.
- A race to create the root folder at first run can leave an empty duplicate folder. It's harmless and documented.

### 3.5 Backups, restore and scrub

- **Daily backups:** `ensureDaily` copies the pre-upload remote file to `גיבויים/data-YYYY-MM-DD.json`.
- **Retention:** `retentionPlan` follows blind §4.6 and treats legacy `backup-*.json` names as dailies.
- **Restore from the Drive backups list** (decision 8):
  1. Settings → "שחזור מגיבוי ב-Drive" lists the backups folder (name, `createdTime`, size), newest first.
  2. Choosing one downloads it, runs `migrate` and `validateDoc`, and shows the counts for confirmation.
  3. The current remote file is copied to `pre-restore-{ts}` (with `kind:'backup'`).
  4. The doc is replaced: every restored entity is re-stamped with `updatedAt = now` and `base` = the current version of that id, and every live id that is missing from the backup is tombstoned.
- **Restore from a local file** uses the same path.
- **Scrub** (decision 14; `scrubPlan`, pure): it runs when `today ≥ legacy.migratedAt + 30` **and** at least 14 v2 dailies exist **and** `V2_MODE === 'on'`.
  - **Permanent `DELETE`** of every legacy `backup-*.json`, every `pre-migrate-v1-*` file and the v1 data file.
  - Then set `legacy.scrubbedAt`.

### 3.6 Legacy v1 file

- **First migration:**
  1. Find the folder (cached `oneonone.drive.folderId` or a name search) and `one-on-one-data.json` in it.
  2. Copy it to `pre-migrate-v1-{ts}` (with `kind:'backup'`).
  3. Run `migrateV1`, then merge in the IDB doc and `oneonone.pending` (migrated too).
  4. Create the v2 file in the same folder and tag the folder and the backups folder.
  5. **The v1 file is never written.**
- **Catch-up:** while `today ≤ legacy.catchUpUntil`, any device's boot sync checks the v1 version. If it changed, the device downloads it, migrates it and merges **add-only**: only ids missing from v2 are added.
- **Marker doc, considered and rejected.** The idea is to overwrite v1 with a "please refresh" doc.
  - For: it signals old tabs.
  - Against: it shows an empty class in old tabs, and it **breaks code rollback during the canary**, because v1 code would read the marker.
- **Residual risk:** an old-code tab left open after delete-all or the scrub can re-create the v1 folder or file (§8 risk 1).

### 3.7 Auth, sign-out, disconnect, delete-all and the trial merge (P8c)

- **Auth:** `auth.js` keeps "first click refreshes the token" and adds `hasGrantedAllScopes` and `mapAuthError` (blind §4.2), with the Hebrew strings in `ui/i18n.js`.
- **Sign-out:**
  1. Run a full sync (pull, merge, push), then re-read `version`, which must equal the uploaded version. If anything fails, confirm with "יש שינויים שלא נשמרו…".
  2. Broadcast `signed-out`. Other tabs close their DB connection (`onversionchange` → `db.close()`) and show the connect screen.
  3. `deleteDatabase`. If `onblocked` fires, show "סגרו לשונות אחרות של האפליקציה" and retry.
  4. Clear drafts and `lastAccount`. Keep `authorized`. The next sign-in uses `prompt:'select_account'`. **No revoke.**
- **Disconnect:** revoke (POST to `oauth2.googleapis.com/revoke` via GIS), then sign out, then clear `authorized`.
- **Delete all:**
  1. The user types "מחק".
  2. `PATCH folder {trashed:true}`.
  3. Broadcast `deleted`, then delete the IDB DB and the `oneonone.*` keys.
  4. Show the 30-day message.
- **Trial → Drive:** a confirmation shows the counts and the duplicate names, compared with `normalizeName`. Then merge, and delete `one-on-one:local`.
- **Read-only:** as in v1 of this plan, a `schemaVersion > 2` blocks dispatch and uploads.

---

## 4. Feature additions

| Feature | Domain | UI (v2, P9 unless noted) |
|---|---|---|
| Needs-attention | `setNeedsAttention`; it makes the student due today | Header toggle and reason; list filter; badge |
| Topic priority | `setTopicPriority`; adding with "חשוב" sets `high` and puts the topic first | ★ toggle with `aria-pressed` |
| Snooze | `snooze(sid, 'tomorrow'|'nextWeek')`, shifted off Saturday; cleared by a counted meeting | "לא היום" and "שבוע הבא" on suggested rows |
| Meeting form | `recordMeeting` adds `checkupInDays`, `checkupReason` and `newTopics[]`. **Any counted meeting closes due checkups (M11).** A `parent` meeting doesn't close the next meeting or count toward cadence, but it can tick topics and goals. | Chips 3d/1w/2w with a reason; a "נושאים לפעם הבאה" textarea; the "שיחה עם הורים" type |
| Saturday | `shiftOffSaturday` in every action that stores a planned, checkup, snooze or `dueDate` value. **The meeting date is stored as entered.** Suggestions never fall on day 6. Empty workdays fall back to Sun–Fri. | `ui/dateInput.js` (P2) acts on `input[type=date][data-no-saturday]`. It is added to the schedule, checkup, goal due-date and next-date inputs, **not** the meeting date. |
| Stats | Adherence counted from `countFrom`, with `inactiveSpans` excluded; `meetingsPerWeek(8)`; coverage using counted meetings | Mean adherence; SVG weekly chart; the goal row "תקופה נוכחית … · עמידה x% (a/b)" and its "היסטוריה" details (pre-upgrade completions shown as history) |
| Goal frequency | Calendar rules; editing appends a segment; `half` | Presets including "פעם במחצית" = half/1 |
| Mobile | (none) | Bottom nav and a sticky CTA (CSS; checked visually in light and dark) |
| Notices (P8c) | `settings['noticesAck.privacy'/'noticesAck.reporting']` | Dashboard card; the welcome screen's "מומלץ חשבון Gmail אישי"; a share warning |
| Auth errors (P8c) | `mapAuthError` | Connect screen and badge |
| CSP and fonts (P2) | (none) | Self-hosted Rubik in `fonts/` with OFL; `pct-*` classes |

**Suggestions:** unchanged from v1 of this plan (day-spreading with scores). One addition: the day walk skips Saturday and non-workdays, and stops after 3650 days.

### 4.1 Exact CSP (meta tag in `index.html` and `privacy.html`)

```
default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style; font-src 'self'; img-src 'self' data:; connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/ https://oauth2.googleapis.com/revoke; frame-src https://accounts.google.com/gsi/; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
```

- GIS injects an inline `<style id="googleidentityservice_button_styles">`. The resulting violation is expected and harmless. E2e allowlists that one console message.
- `alt=media` downloads must not redirect off `www.googleapis.com`. Verify in the P8c canary checklist.

---

## 5. Phases

Every merge to `main` is safe for real users: `V2_MODE='off'` until P10, and v1 changes are limited to P1 and P2.

| # | Phase | Contents | Depends on |
|---|---|---|---|
| P0 | Tooling | Scripts, `tsconfig.json`, ESLint, Vitest, CI, moved tests, `ui/html.js` sink, `attr.bool` | (none) |
| P1 | **Safety net and typing fix (v1)** | `main.js` plus `createApp()`. **DOM-level characterization tests for every handler in `js/views/*`** (these define the parity contract). The AC-F1 reproduction, written red first. `ui/morph.js` replaces the `innerHTML` swaps and the `keepFocus`/`details` hacks. `data-key` on lists. `ui/drafts.js` (localStorage, cleared on sign-out). Notes autosave. | P0 |
| P2 | Quick wins (v1, trimmed) | `import/*` (names only; phones opt-in) with the v1 `contacts→phones` adapter. **A separate commit changes `vcf.test.js` lines 16–19** (email and home phone are no longer imported; per CLAUDE.md, this is an explicit test change). `dateInput` with `data-no-saturday`. Fonts, CSP, `pct-*`, the `style=` lint rule. | P0, parallel to P1 |
| P3 | Domain core | `dates`, `ids`, `schema`, `tx` (`base`, watermark), `selectors`, `cadence`, **`periods`/`periodKeyFor` (week, month, half)**, `actions`. `tsconfig.strict.json` lands here. | P0 |
| P4 | Recurrence status and stats | `recurrence` (status, adherence, `countFrom`, `inactiveSpans`), `stats` | P3 |
| P5 | Suggestions | `suggestions` | P3, P4 |
| P6 | Migration and merge | `migrateV1`, `migrate`, `merge` (ancestry, sticky delete, normalization, conflicts), property tests | P3, P4 |
| P7 | Storage and sync (with fakes) | `storage/*`, `sync/*`. The fake Drive models copy inheritance, `supersededBy`, trash and 404. | P6 |
| P8a | v2 shell, local mode, views part 1 | Switch in `main.js`; `app/*`; IDB; trial migration; `ui/views` dashboard and students; characterization tests run on v2 | P1, P5, P7 |
| P8b | Views part 2 | Student, goals, import, settings; conflict UI; read-only banner | P8a |
| P8c | v2 Drive (canary only) | Auth, account check, discovery and legacy, shared mode, sign-out, disconnect, delete-all, restore list, scrub, notices. **Canary checklist on real Drive:** copy `appProperties`, `alt=media` host, untrash, `supersededBy`, iOS GIS | P8b |
| P9 | UX additions (v2) | §4 UI | P8b (parallel to P8c) |
| P10 | E2E and rollout | Playwright with fake GIS and Drive; CI job. The author runs canary on phone and laptop for ≥7 days, then sets `V2_MODE='on'`. | P8c, P9 |
| P11 | Cleanup (after the scrub window) | Delete the v1 tree and the switch; drop the v1 characterization runner | P10 + 30 days |

**Rollback:**
- **During the canary:** remove the `oneonone.canary` key. The v1 code still reads the untouched v1 file, and the canary edits stay in the v2 file.
- **After `on`:** roll forward only. Before the scrub, the v1 file is stale but intact.

---

## 6. Acceptance criteria

**Fixtures:** today = 2026-10-08 (Thursday), TZ Asia/Jerusalem, workdays Sun–Fri, capacity 2, cadence 21, `staleDays` 21. "Blind AC-n" means the blind plan's criterion n.

### P0 (AC-TL)
1. `npm run check` exits 0. All 13 existing tests pass from their `js/**` locations, and `tests/` no longer exists.
2. ESLint on `el.innerHTML = x` in `js/views/x.js` reports an error, and the same code in `js/ui/html.js` doesn't. Importing `raw` in a view reports an error. `js/domain/x.js` importing from `ui/` reports an error (rule active from P3).
3. `parseSafe('<b>')` (a plain string) throws `TypeError`. `parseSafe(html`<b>${'<i>'}</b>`)` yields one `<b>` with the text `<i>`.
4. `attr.bool('checked', true)` gives ` checked`, and `false` gives the empty string.
5. Blind AC-49: the `sw.js` `SHELL` list equals the shipped files, excluding `*.test.js` and fixtures.

### P1 Characterization and typing fix (AC-CH, AC-F)
1. AC-CH: for every `data-action`, `data-form` and `data-change` handler in `js/views/*`, a happy-dom test drives the DOM (clicks, fills, submits) and asserts the visible result: text, counts and badges. This includes:
   - topics add, urgent, move and done;
   - goal toggle;
   - schedule and clear;
   - checkup add, done, undo and delete;
   - add, edit and delete meeting;
   - edit details;
   - set active;
   - delete a student;
   - settings save;
   - import preview and confirm.

   These tests contain no references to internal data shapes, so they run unchanged against v2 in P8.
2. **AC-F1 (reproduction, red on the current code):**
   - **Setup:** a fake backend's `currentVersion()` reports a change, and `load()` adds meeting m9.
   - **Steps:** on `#/student/s1?meeting=new`, type "סיכום חלקי" into the summary, then dispatch the `window` `focus` event.
   - **Expected:** the value is unchanged, the textarea is `activeElement`, `selectionStart === 10`, **and m9 is already listed** (no deferral).
3. AC-F2: submitting the form saves the meeting with "סיכום חלקי" and clears the draft and `data-dirty`.
4. AC-F3: the summary is typed but focus has moved to the topic `t1` checkbox. Ticking `t1` marks it done, and the summary still reads "סיכום חלקי" (it's dirty, so it's preserved).
5. AC-F4: type, then destroy and recreate the app on the same storage. The form shows the exact text again. A checkbox group draft `{topicIds:['t1','tX']}`, where `tX` no longer exists, restores `t1` checked and doesn't throw. Cancel deletes the draft.
6. **AC-F5:** type "abc" into the notes and stay focused. After 300 ms the note is saved (`notes === 'abc'`), **`activeElement` is the same node, and `selectionStart === 3`**. A remote reload at that point changes nothing in the textarea.
7. AC-F6: the edit-meeting form behaves like F1.
8. AC-F7: typing in the students search keeps focus and caret.
9. AC-F8: an open `<details>` stays open after a morph.
10. **AC-F9 (no swallowed taps):** focus is in the add-topic input with text "X". A remote reload runs, then a `pointerdown`/`click` on "הוספה". Topic "X" is added, and the button node is the same object before and after.
11. AC-F10: after typing, `pagehide` flushes the draft to storage synchronously, so it is present without waiting 300 ms. Sign-out clears the drafts.

### P2 (AC-Q)
1. Blind AC-54–60 against `vcard.js`. With `includePhones: false`, the `sample.vcf` output contains no `parent@example.com`, no `הרצל` and no phone digits. With `true`, `moshe.contacts` is `{studentCell:'0500000001', motherPhone:'0500000001', fatherPhone:'0500000002'}`. The v1 student page then shows exactly these 3 phones, labelled נייד/אמא/אבא.
2. Blind AC-65 and AC-66 against `nameList.js`.
3. The import has an unchecked "ייבוא טלפונים" box, and confirming without it stores no phones.
4. **AC-Q6 (fixed):** setting 2026-10-10 on the schedule, checkup, goal due-date or next-date input gives 2026-10-11 and the `aria-live` announcement. Setting the **meeting-date** input to 2026-10-03 (Saturday) keeps 2026-10-03 with no announcement.
5. `index.html` contains the §4.1 CSP string byte for byte. Nothing references `fonts.googleapis`/`gstatic`. `progressBar(0.63)` gives `class="progress-fill mid pct-65"` with no `style`.

### P3 Domain core (blind AC-D, AC-C, AC-K; AC-N)
1. Blind AC-1–5. AC-5 applies to planned, checkup, snooze and `dueDate`. `recordMeeting({date: '2026-10-10'})` stores `2026-10-10`.
2. Blind AC-18–23. In addition, `staleDays` 30 with a last meeting 28 days ago → not in `notMetLately`, but due 2026-10-01.
3. Blind AC-29 and AC-30 with `planned['next:s1']`. In addition:
   - a `regular` meeting on 10-08 closes a checkup dated 10-06 (M11);
   - a `parent` meeting on 10-08 closes neither the next meeting nor the checkup, doesn't change `lastMeetingDate`, but does create the completion for a ticked goal.
4. AC-N1 (`tx`):
   - `updatedAt = max(now, maxSeen + 1ms)`.
   - Untouched entities are reference-equal, and the input stays frozen.
   - **base:** editing a synced entity (`v={T1, 'B'}`, watermark ≥ T1) gives `base={T1, 'B'}`. Editing it again before sync (`by` = me, `updatedAt` > watermark) keeps `base={T1, 'B'}`.
5. AC-N2: deleting s1 tombstones s1 and its children. **The JSON of every tombstone has exactly the allowlisted keys**: no names, notes, contacts, `externalKey`, `needsAttention`, summary, text or `lostText`.
6. AC-N3: priority and needs-attention persist. Adding "X" as high-priority when the open topics are at [1024, 2048] gives order 512.
7. AC-N4: snooze on Friday 10-09 'tomorrow' → 10-11; 'nextWeek' on 10-08 → 10-15. A regular meeting clears it; a parent meeting doesn't.
8. AC-N5: renumbering when a gap is below 1e-6.
9. AC-N6 (periods): `half` periods for a goal from 2026-10-01 are [10-01..01-31] and [02-01..08-31]. A week rule from 2026-09-02 gives the first key `2026-09-02` and the next `2026-09-06`.

### P4 (blind AC-R and AC-G, plus AC-W)
1. Blind AC-6–17, with `countFrom=null` for non-migrated goals.
2. AC-W1–W3 as in v1 of this plan. In addition:
   - **AC-W4:** a weekly everyone-goal from 2026-09-06 for a student with `inactiveSpans=[{from:'2026-09-20', to:'2026-10-04'}]` and no completions, today 10-12: the counted periods are the weeks of 09-06 and 09-13 (missed), and the week of 10-04 is excluded because its start falls inside the span. Adherence is 0/2. The keys of every period stay unchanged after reactivation.
   - **AC-W5:** a monthly goal with `countFrom='2026-10-08'` and completions on 09-03 and 10-05, today 10-08: September shows "בוצע" as history but isn't counted, October is done, and adherence is 1/1. On 2026-12-02 with no November completion, November is missed and adherence is 1/2.

### P5 Suggestions (AC-H)
1. The H1 table is unchanged from v1 of this plan: A 10-08, D 10-08, B 10-09, H 10-11, E 10-12 (scheduled), G 10-16, F 10-29.
2. H2 is unchanged.
3. **AC-H3 (fixed):** a fast-check generator builds valid docs only (every planned date is off Saturday, workdays ⊂ 0..5). Properties:
   - no item falls on day 6;
   - a `suggested` item is placed on day d only if `load(d)` before placing it is below capacity (scheduled and checkup items alone may exceed capacity);
   - shuffling the input gives the same output;
   - `workdays=[]` behaves as Sun–Fri and terminates.
4. **AC-H4 (fixed):** the only student is C, last met **2026-09-20** with a checkup planned on 2026-10-06. Output: `[{C, 2026-10-06, checkup, missed: true}, {C, 2026-10-11, suggested}]`. 10-11 is the due date 09-20+21.

### P6 Migration and merge (AC-MIG, AC-M, AC-V)

Uses the fixture from v1 of this plan, plus a completion for g1/s1 on 2026-08-28. The migration runs with `today = '2026-10-08'`.

1. MIG1–MIG3 as in v1 of this plan, **except that t1 and t2 both get `priority:'normal'`**.
2. MIG4: g1 has the rule month/1, `countFrom '2026-10-08'`, and the completions `g1:s1:2026-08-28`, `g1:s1:2026-09-01` and `g1:s1:2026-10-01`. `collapsedCompletions` is 1 (09-28 folds into September).
3. MIG5: g3 → `g3:class:2026-09-06`. g4 → week/1 and is listed as approximated. **A goal with `everyDays:150` → `{unit:'half', every:1}`.**
4. MIG6: determinism and idempotence as in v1 of this plan (with `today` injected).
5. **AC-MIG7 (fixed):** s1's `activeFrom` is `2026-08-28` (the earliest completion is before `createdAt` 09-01), and g1's `startDate` is `2026-08-28`. The 08-28 completion keeps its key `2026-08-28`. A completion for a deleted goal is dropped, and `orphans` is 1.
6. **AC-MIG8 (fixed):** on the migrated doc with today 2026-10-08, g1/s1 shows August and September as history, October as done, and adherence 1/1. No period is reported as missed.
7. MIG9: `settings.legacy` has `catchUpUntil '2026-11-07'`. `workdays [6]` → `[0,1,2,3,4,5]`.
8. Blind AC-31–34 and AC-36 on v2. Blind AC-35, restated with base: local `{T5, 'A', base: T3}` and remote `{T4, 'B', base: T3}` → 'A' wins, and there is 1 conflict with `lostText` 'B', `updatedAt` T4 and `by` = the remote's `by`.
9. **AC-M7:** edit "A1", sync, edit "A2", then another device changes a different entity. Next sync: **0 conflicts**.
10. **AC-M8:** notes "ab" are uploaded during a sync while the local doc has moved on to "abc" (same device, same base). The final merge gives "abc" and **0 conflicts**.
11. **AC-M9:** device A writes "A1" at T1. B pulls it and writes "B1" at T2 with base T1. A merges: "B1", **0 conflicts**.
12. **AC-M10:** a meeting edit form is opened at version V1. A remote V2 with a different summary merges in, and the user saves "mine". The result is "mine", and there is 1 conflict with V2's text.
13. **AC-M11 (sticky delete):**
    - B tombstones s1 at T5. A, offline, edits s1's notes at T6 with base T1 and adds meeting m7.
    - Merge (both orders): s1 is tombstoned, and m7 is tombstoned with `updatedAt ≥ T6+1ms`.
    - A restore with `base ≥ T5` revives s1.
    - Property tests stay commutative and idempotent, including tombstones and normalization.
14. AC-M12: settings per key. Device A sets `workdays` and device B sets `noticesAck.privacy`: both survive the merge.
15. AC-M13: dismissing a conflict tombstones it with no `lostText`. A conflict 31 days old is expired by `expireConflicts`. Deleting s1 tombstones conflicts on s1 and on its meetings.
16. Blind AC-38–40 with current = 2.

### P7 Storage and sync (AC-S, AC-L, AC-Y, AC-B)
1. Blind AC-41–47 and AC-52. AC-44 targets `גיבויים/data-2026-10-08.json`.
2. **AC-S50 (B3):** the fake Drive models copy inheriting `appProperties`. After `ensureDaily` and a pre-restore copy, the copies carry `kind:'backup'`, and discovery returns exactly 1 data file.
3. AC-L1–L3 as in v1 of this plan. In addition: L2 (catch-up) runs on a **second device** that found v2 through appProperties, and **doesn't run after `catchUpUntil`**.
4. **AC-L5 (B2):** devices X and Y both start from the legacy file and run discovery at the same time; the fake lets both create a v2 file. After each device's next sync:
   - both cache the same `fileId` (the older `createdTime`);
   - the loser is trashed with `supersededBy`;
   - both docs deep-equal each other.
5. **AC-L6:** a device caching the loser id sees `trashed + supersededBy`. It switches to the winner, merges its local edits, and its status is **not** `remote-missing`.
6. AC-Y1 (revised): the cached file is 404 and discovery finds a live data file → use it. The cached file is trashed, there are no live files, a trashed data file exists and `everSynced` is set → `remote-missing` with the untrash option. Untrashing then gives a normal sync. "מחק גם מהמכשיר הזה" requires a confirmation.
7. AC-Y2 (two tabs) and AC-Y3 (separate account DBs) as in v1 of this plan.
8. **AC-Y5 (M1):** tab 2 dispatches action a. Tab 1's sync then merges in remote meeting r1 and writes with `gen+1`. Tab 2 dispatches action b. The IDB doc contains a, b and r1, and the next upload contains r1.
9. **AC-Y6 (M2):** the open DB is P1 and the token's `about.permissionId` is P2. There are 0 Drive data calls under P1's DB. If P1 is dirty, the mismatch modal is shown. If P1 is clean, the app opens P2's DB. P1's students never appear in P2's upload.
10. **AC-Y7 (shared mode):** sign in with "מחשב משותף", edit, then close the store. The IDB database list has no `one-on-one:*` entries, `localStorage` has no `oneOnOne.lastAccount`, and drafts exist only in `sessionStorage`.
11. AC-B53 (restore, revised): the list shows backups newest first. Choosing one creates `pre-restore-*` with `kind:'backup'`. Restored entities have `updatedAt ≥` the restore time and `base` = the previous version. A missing topic t2 is tombstoned. **0 conflicts** are recorded.
12. **AC-B54 (scrub):**
    - `scrubPlan` with `migratedAt 2026-10-08`, today 2026-11-08, 14 v2 dailies and `V2_MODE` on → delete every `backup-*`, every `pre-migrate-v1-*` and the v1 data file.
    - With today 2026-11-06, or with 13 dailies, or in canary mode → nothing is deleted.
    - It uses `DELETE`, not trash.

### P8 Cutover (AC-Z)
1. AC-Z1: every AC-CH test passes against v2 (`V2_MODE=on` in the test harness).
2. AC-Z2 (trial migration) and AC-Z3 (offline boot in normal mode) as in v1 of this plan.
3. AC-Z4 (read-only) and AC-Z5 (conflict banner) as in v1 of this plan.
4. Blind AC-76 (XSS, all v2 views).
5. **AC-Z6 (sign-out, M4):**
   - Simulate the race: the remote no longer contains the local edit, but `dirty=false`.
   - Sign-out pulls, merges and re-uploads, and the re-read version matches. Only then is the DB deleted.
   - A second tab receives `signed-out`, closes its connection and shows the connect screen. `deleteDatabase` succeeds without `onblocked`.
   - Revoke isn't called.
6. **AC-Z7:** after the trial → Drive merge is confirmed (the dialog listed duplicates "יוסי כהן" ≈ "יוֹסִי כהן"), `one-on-one:local` no longer exists.
7. AC-Z8: delete-all needs the exact text "מחק". It sends `PATCH {trashed:true}` with no `DELETE` and no revoke, then broadcasts `deleted`, clears IDB and the `oneonone.*` keys, and shows the 30-day message.
8. AC-Z9 (canary switch): with `V2_MODE='off'` and no canary key, `main.js` loads the v1 app and makes 0 requests for v2 modules. With `localStorage['oneonone.canary']='1'` and `'canary'`, it loads v2. With `'on'`, it always loads v2.
9. Blind AC-50 (`mapAuthError`, Hebrew strings) and AC-Q5 from v1 of this plan (sign-out without revoke, disconnect revokes via the GIS mock) now live here.

### P9 UX (AC-U)
1. U1–U3 as in v1 of this plan.
2. **AC-U4 (fixed):** a meeting dated **2026-10-03** (Saturday, stored as-is) with chip "שבוע" and reason "מבחן" → a checkup on 2026-10-10 shifted to **2026-10-11**. "נושאים לפעם הבאה" = "א\n\nב" → 2 new open topics.
3. U5–U8 as in v1 of this plan.
4. AC-U9: the goal frequency select contains "פעם במחצית", and saving it gives the rule `{unit:'half', every:1}`.

### P10 E2E
Blind AC-67, AC-68 (3 taps), AC-69, AC-70 (on `data-no-saturday` inputs), AC-72 and AC-73. In addition:
- the e2e version of AC-F1;
- two contexts editing offline and converging;
- an AC-L5 race against the e2e fake;
- console errors fail the test, **except** the single GIS inline-style CSP violation.

---

## 7. Risks

1. **Old-code tabs.** v2 never writes the v1 file. Edits from an old tab reach v2 add-only for 30 days. An old tab left open across delete-all or the scrub can re-create v1 data. That needs a tab open across a deploy plus one of those actions, and can't be fixed from new code.
2. **Lossy migration** (collapsed completions, approximated frequencies, dropped contact fields). Rollback during the canary is the untouched v1 file. After `on`, the rollback is `pre-migrate` until the scrub deletes it (decision 14 accepts this).
3. **The real Drive API isn't verified for:** `appProperties` inheritance on copy, `alt=media` host, untrash of an app-created folder, and `supersededBy` on a trashed file. All are in the P8c canary checklist and modelled pessimistically in the fake.
4. **The morph** must cover the edge cases in the existing views. AC-CH and AC-F pin them down. Moving a focused keyed node blurs it, which is accepted (rare: a remote reorder during a topic edit).
5. **Two view trees until P11** mean duplicated effort for any v1 hotfix. That's why P2 was trimmed and v1 is frozen after P2.
6. **Shared mode** depends on `sessionStorage`. Some browsers' "reopen closed tab" restores it, which affects drafts only, not the doc. This is noted in the sign-in help text.
7. **GIS on iOS and clock skew** are as in v1 of this plan.
8. **The deterministic `next:{sid}`:** a meeting closing the next on device A can overwrite a concurrent reschedule on device B (LWW). This is documented, and the user sees the next as "done" and reschedules.
9. **`base` adds ~60 bytes per entity**, about 10% of the doc size, which is acceptable.

## 8. Open questions

None blocking. Decisions 5–15 are all reflected above. One item for the user to confirm before P10: the canary duration (I propose ≥7 days on phone and laptop, with one deliberate offline-conflict test).
