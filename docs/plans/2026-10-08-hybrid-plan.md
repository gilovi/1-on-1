# Hybrid rebuild plan: "1-on-1" (v3, revised 2026-10-09)

This file replaces `docs/plans/2026-10-08-hybrid-plan.md`. It addresses both rounds of `2026-10-08-critic-review.md` and items 5–15 of `2026-10-08-decisions.md`, which are binding.

> **P0 is unchanged:** same scope, same AC-TL1–5, so qa's in-progress P0 work isn't affected. Round 3 changes P1 (an added sub-step order, new morph ACs, and AC-CH seeding), P3 (the AC-N1 `base` rule) and later phases.

## Changes from earlier versions of this plan

### Round 3 (critic round 2)

| ID | Finding | Resolution |
|---|---|---|
| B-1 | Ancestry compared order, not identity | **Better than the critic's fix.** The critic's exact-identity test still logs false conflicts when an idle device holds a grand-ancestor (for example, notes autosaved and synced several times on the other device). Conflicts are now detected **only for the merging device's own pending (unconfirmed) edits** (`meta.pending`). The remote is "known" only by exact identity (`R == L.base`) or by being the same device's earlier lineage. §3.2. ACs: AC-M7–M9, AC-M14, AC-M15. |
| B-2 | Form base caused false conflicts after the first autosave | After each successful save, the draft's `base` advances to the version just written. The save-time check is skipped when the current version is this device's own pending edit. AC: AC-M16. |
| B-3 | Sticky delete wasn't transitive | **Critic's fix.** Students carry an `epoch`, which a restore increments. Students are ordered by the total order `(epoch, tombstone > live, updatedAt, by, canonicalJSON)`. AC: AC-M17. |
| B-4 | Conflicts auto-expired before anyone saw them | **Critic's fix.** Undismissed conflicts never expire. `expireConflicts` is removed. AC-M13 is fixed. |
| M-A | Positional morph could move typed text to the wrong item | **Critic's fix.** A focused or dirty control is preserved only when the identity chain of its `data-key`/`data-draft` ancestors matches. `data-key` is required on repeated items, and a test enforces it. `<details>` closes when the app's own markup moves from open to closed. ACs: AC-F11–F13. |
| M-B | Discovery ran only at boot | `files.list` runs on every sync, throttled to once per 10 minutes, plus a check about 30 seconds after a first-run create. AC-L5 is aligned, and AC-Y8 is new. |
| M-C | AC-Z1 contradicted intended changes | AC-CH is seeded from a v1 JSON fixture; the v2 harness runs it through `migrateV1`. It is written **green against the current code before the morph lands**. §6 lists the intended divergences D1–D9, each with a v2 variant in its own commit. |
| M-D | AC-W4 contradicted §2.1 | Inactive spans are half-open `[from, to)` with a single rule: **a period counts only if its start day is an active day.** W4 is rewritten. |
| m-1 | Shared mode | The doc and the dirty flag go in `sessionStorage`, so they survive a reload and disappear when the tab closes. Sign-in uses `prompt:'select_account'`. Help text tells the user to also sign out of Google. `oneonone.drive.authorized` isn't written. AC-Y7 is updated. |
| m-2 | Upgrade-month period | A period straddling `countFrom` counts only if it's done. AC: AC-W6. |
| m-3 | `remote-missing` dialog | The dialog has no default button and says "ייתכן שהנתונים נמחקו ממכשיר אחר". The legacy lookup requires `trashed=false` on both the folder and the file. AC: AC-L7. |
| m-4 | `data-dirty` | Cleared when the saved value equals the control's value. AC: AC-F14. |
| m-5 | Canary rollback | Documented: rolling back and re-enabling loses v1 edits made to existing entities (§5, risk 10). |
| m-6 | P8c too large | Split into P8c-1 (sync core) and P8c-2 (lifecycle). |

### Round 2 (critic round 1), kept for reference

| ID | Resolution |
|---|---|
| B1 | Ancestry via `base`; superseded by B-1 above. |
| B2 | Deterministic discovery winner; `supersededBy`; `remote-missing` only when no live file exists. |
| B3 | Copies tagged `kind:'backup'`; discovery excludes the backups folder. |
| B4 | DOM morph instead of `innerHTML` swaps. |
| M1 | `gen` counter and the `doc:` lock on every write. |
| M2 | `permissionId` check after every grant. |
| M3 | Shared-computer mode. |
| M4 | Sign-out does a full sync; multi-tab DB deletion. |
| M5 | Morph; no deferral. |
| M6 | `periods` moved to P3. |
| M7 | Characterization tests, `V2_MODE` canary, P8 split. |
| M8 | Exact CSP including `oauth2.googleapis.com/revoke`. |
| M9 | Tombstone allowlist; cascades; sticky delete. |
| M10 | No priority inference; immutable `activeFrom`; `countFrom`. |
| M11 | Any counted meeting closes checkups. |
| M12 | Synced `legacy` record; add-only catch-up for 30 days; marker rejected. |
| M13 | `remote-missing` with untrash. |
| m1–m11 | As before: Saturday only on `data-no-saturday` inputs; H3/H4; workdays fallback; strict tsconfig from P3; P2 adapter and explicit test edit; drafts; `persist()`; per-key settings; conflict stamps from inputs; `next:{sid}` documented; notices in P8c. |
| Cut | P2 trimmed. |
| Decisions | Half-year unit, restore list, canary, scrub. |

---

## 0. Context

**What I read:** the decisions doc, the blind plan, the comparison doc, both critic rounds, all of `js/`, `tests/`, `index.html`, `sw.js`, `package.json`, `.gitignore` and the README. Pages deploys from `main` (README line 42).

**Key code facts:**
- The focus handler (`app.js:466-478`) reloads whenever `status==='saved'`, and textareas don't touch the store until submit. Together they wipe typed text.
- There are 6 `innerHTML` writes and one `style=` (`ui.js:50`).
- `raw()` is used only for boolean attributes.
- `ensureFolder` recreates a trashed folder.
- There is no `parent` meeting type.
- v1 closes due checkups on any meeting type.

**Goal:** keep the screens and the look. Rebuild the data layer and close the gaps from the decisions doc. Every commit to `main` must be safe for real users.

---

## 1. Target module layout

Old and new code coexist. The v1 tree stays live until P11; its only changes before then are the P1 and P2 fixes. The v2 tree is reachable only through `V2_MODE`. Modules marked **(shared)** are used by both trees.

| Current | Target | Fate |
|---|---|---|
| `js/app.js` | v1: `js/app.js` exports `createApp()`. v2: `js/app/boot.js`, `router.js`, `store.js` | v1 refactored minimally in P1; v2 added in P8 |
| (none) | `js/main.js` **(shared)**: reads `V2_MODE` and `localStorage['oneonone.canary']`, then dynamically imports the v1 or v2 app | P1 (v1 only), switch in P8a |
| `js/config.js` | Adds `V2_MODE='off'`, `SCHEMA_VERSION=2`, `APP_ID`, `DATA_FILE_V2='one-on-one-data-v2.json'`, `LEGACY_DATA_FILE`, retention, scrub and discovery-throttle constants | Kept |
| `js/ui.js` | `js/ui/html.js` **(shared)** (`html`, `attr.bool`, private `raw`, `parseSafe` as the only sink), `morph.js` **(shared)**, `drafts.js` **(shared)**, `dateInput.js` **(shared)**, `toast.js`, `forms.js`, `format.js`, `i18n.js` | Split |
| `js/dates.js`, `model.js`, `logic.js`, `store.js`, `storage.js`, `views/*` | v1 tree | Deleted in P11 |
| (none) | `js/domain/`: `dates`, `ids`, `schema` (`KEEP_ON_TOMBSTONE`, `validateDoc`), `tx`, `selectors`, `cadence`, `periods`, `recurrence`, `stats`, `suggestions`, `actions`, `merge`, `migrate`, `migrateV1` | P3–P6 |
| `js/vcf.js` | `js/import/vcard.js`, `nameList.js`, `names.js` **(shared)** | P2; v1 gets a `contacts→phones` adapter |
| (none) | `js/storage/`: `idb.js`, `accountStore.js`, `sessionStore.js` (shared-computer mode), `locks.js` | P7 |
| (none) | `js/sync/`: `auth.js`, `drive.js`, `discovery.js`, `syncEngine.js`, `backups.js` | P7 |
| (none) | `js/ui/views/*` (v2 copies of `js/views/*`, ported), `notices.js` | P8a/b; the copies are temporary until P11 |
| `tests/*` | `js/**/*.test.js`; `js/import/fixtures/sample.vcf`; `js/domain/fixtures/v1-sample.json`; `js/views/fixtures/v1-class.json`; `js/views/*.char.test.js`; `e2e/` | Moved in P0 (fixtures added in P1/P6) |
| (none) | `package.json` scripts, `tsconfig.json`, `tsconfig.strict.json` (P3+), `js/types.d.ts`, `eslint.config.js`, `vitest.config.js` (`pool:'forks'`, `env.TZ='Asia/Jerusalem'`), `playwright.config.js`, `.github/workflows/check.yml`, `fonts/` | Added |

**Scripts:**
- `typecheck`: `tsc -p tsconfig.json`; from P3 also `&& tsc -p tsconfig.strict.json`.
- `lint`: `eslint . --max-warnings 0`.
- `test`: `vitest run`.
- `e2e`: `playwright test`.
- `check`: typecheck, lint and test.

**CI:** Node 22, `npm ci`, `npm run check`. From P10 there's also an e2e job on Chromium.

**ESLint:**
- `no-restricted-properties` bans `innerHTML`, `outerHTML` and `insertAdjacentHTML`, with an override that allows them only in `ui/html.js`.
- `no-restricted-syntax` bans `style=` inside template literals.
- `no-restricted-imports`:
  - `raw` can be imported only in `ui/html.js`;
  - `domain/` and `import/` can't import from `ui/`, `storage/`, `sync/` or `app/`;
  - the v2 tree can't import v1 modules.

`.gitignore` gets the exception `!js/import/fixtures/*.vcf`.

### 1.1 Rendering

Keep the escaping `html``` template. `parseSafe` is the only HTML sink, and it throws on anything that isn't `SafeHtml`. An XSS test covers every view. `h()` and Trusted Types are rejected, as in v1 of this plan.

### 1.2 Typing safety: DOM morph

The morph replaces the render scheduler. It resolves B4, M5 and M-A.

**`morph(target, safeHtml)` (`ui/morph.js`):**
- **Identity.** A node's identity chain is the list of `data-key`/`data-draft` values on its ancestors up to `target`.
- **Matching.**
  - Children match by `data-key` when one is present.
  - Otherwise they match by the same `tagName` at the same unkeyed position.
  - Anything else is replaced.
- **Preserving a control.** An `input`, `textarea` or `select` keeps its `value`/`checked`/`selected` only when both hold:
  - it is `document.activeElement` or has `data-dirty="1"`, **and**
  - its old identity chain equals the identity chain of its match in the new markup.

  When the chains differ, the control is treated as a different control: its value comes from the new markup. The typed text isn't lost, because it's still in that form's draft.
- **Keys are required.**
  - Every element the views generate by mapping over a collection carries `data-key="{id}"`.
  - Every form inside a repeated item carries `data-draft` or `data-id`.
  - A test enforces both (AC-F12).
- **Attributes** are synced, with one exception for `<details>`. The morph records the `open` value that the app last rendered (`node.__renderedOpen`):
  - if that was `true`, the new markup has no `open`, and no dirty control is inside, the morph closes it;
  - otherwise it keeps the user's open/closed state.
- **Dirty tracking.** A delegated `input` listener sets `data-dirty`. It is cleared when:
  - a submit succeeds;
  - the form is reset;
  - the route changes;
  - or the stored value equals the control's current value (m-4).
- **Route changes** do a full replace instead of a morph, and the forms refill from drafts.
- **Known limit.** Reordering keyed nodes can move a focused node and blur it. That's accepted (§7).

**Drafts (`ui/drafts.js`):**
- Keys: `meeting:new:{sid}`, `meeting:edit:{mid}`, `notes:{sid}`, `topic:edit:{tid}`.
- A draft is `{fields, base, savedAt}`.
- Checkbox groups are stored as arrays of checked values. On restore, ids that are no longer offered are ignored.
- **When drafts are written:**
  - on every `input`, to an in-memory map;
  - 300 ms after the last `input`, to the adapter: localStorage in v1, IDB `drafts` in v2, `sessionStorage` in shared mode;
  - immediately on `pagehide` and on `visibilitychange:hidden`.
- **When drafts are deleted:** after a successful submit, on cancel, and on sign-out.
- **`base` handling (B-2).**
  - The draft's `base` is the entity version when the form opened.
  - **After each successful autosave or save, `base` becomes the version just written.**
- Student notes autosave on a debounced `input`.

---

## 2. Schema v2 and migration

### 2.1 Shape (`schemaVersion: 2`)

Collections are maps keyed by id. Every entity has these common fields:

```
id, createdAt, updatedAt /*ISO ms*/, by /*deviceId*/,
base /*{updatedAt, by} | null: the version this edit was made from*/, deletedAt /*null | ISO*/
```

A tombstone keeps only the common keys plus `KEEP_ON_TOMBSTONE[coll]`:

| Collection | Kept on tombstone |
|---|---|
| students | `classId`, `epoch` |
| meetings, planned, topics | `studentId` (planned also keeps `kind`) |
| goals | `scope`, `classId`, `studentId` |
| completions | `goalId`, `subject`, `periodKey` |
| conflicts | `coll`, `entityId`, `field` |

```
settings:  { [key]: { value } }   // one entity per key, incl. noticesAck.privacy, noticesAck.reporting, legacy
classes:   { [id]: { name, schoolName, archived } }
students:  { [id]: { classId, epoch /*int, default 0*/, firstName, lastName, fullName, notes, cadenceDays|null,
             needsAttention:{flag, reason}, snoozedUntil|null, contacts|null, active,
             activeFrom /*immutable*/, inactiveSpans:[{from, to|null}] /*half-open [from, to)*/,
             source:{kind, externalKey} } }
meetings:  { [id]: { studentId, date /*Saturday allowed*/, type, summary, topicIdsDone[], completionIds[] } }
planned:   { ['next:'+sid | uuid]: { studentId, kind, date /*never Saturday*/, time, note, status, linkedMeetingId } }
topics:    { [id]: { studentId, text, order, priority, status, doneAt, doneInMeetingId } }
goals:     { [id]: { title, description, scope, owner, classId, studentId, kind,
             rules:[{from, unit:'week'|'month'|'half', every}], startDate, endDate, dueDate, countFrom|null, archived } }
completions: { [`${goalId}:${subject}:${periodKey}`]: { goalId, subject, periodKey, completedOn, meetingId, note } }
conflicts: { [`${coll}:${entityId}:${field}:${lost.updatedAt}:${lost.by}`]: { coll, entityId, field, lostText } }
```

**Field rules:**
- `legacy` = `{fileId, folderId, migratedAt, catchUpUntil, scrubbedAt}`.
- **`unit:'half'`** has periods Sep 1–Jan 31 and Feb 1–Aug 31, and `every` is always 1.
- **Period keys** are clipped only by `goal.startDate`, the rule segment and `activeFrom`, which is immutable. So a key never changes.
- **When a period is counted** (counted periods are the ones that make up adherence; M-D, m-2). All of these must hold:
  1. its **start day is active**, meaning it isn't inside any `[from, to)` span;
  2. it isn't the current pending period;
  3. its start is on or after `countFrom`. A period that **straddles** `countFrom` is counted only if it's done.
- **Deactivation and reactivation.** Deactivating opens a span `{from: today, to: null}`. Reactivating sets `to = today`, the first day the student is active again.
- **Protected text** (only these fields can produce conflicts): `meetings.summary`, `students.notes`.

### 2.2 `migrateV1(v1, {today}) → {doc, report}`

The migration is pure and deterministic. Every entity gets `updatedAt = v1.updatedAt`, `by = 'migration-v1'`, `base = null`, and students get `epoch = 0`.

| v1 | v2 |
|---|---|
| `settings.className` | `classes['class-1']`, `activeClassId` |
| other settings | One entity per key. `workdays` minus 6; if that leaves it empty, `[0..5]` |
| `phones[]` | `contacts` from the labels `נייד`/CELL, `אמא`/Mother and `אבא`/Father, first match wins. **Every other phone, plus `email`, `address` and `org`, is dropped.** |
| `frequencyDays` | `cadenceDays` |
| `createdAt` | `activeFrom` = min(`createdAt`, first meeting, first completion). If `createdAt` is missing, the other two; failing that, `date(v1.updatedAt)` |
| `active:false` | `inactiveSpans = [{from: date(v1.updatedAt), to: null}]` |
| `nextMeeting` / `checkups[]` | `planned['next:'+sid]` / `planned[c.id]`, dates shifted off Saturday |
| topics | `priority='normal'`; open topics re-ordered as `1024·rank` |
| meetings | `type` kept; `topicIdsDone`; `completionIds` |
| goal `everyDays` | 7→week/1, 14→week/2, 30→month/1, 60→month/2, 90→month/3, 150→half/1. Custom: N<28 → week/round(N/7), otherwise month/round(N/30), each at least 1. Approximated goals are listed in the report. |
| recurring goals | `countFrom = today`; `startDate` = min(`createdAt`, first completion) |
| completions | Deterministic ids. When several collide, the earliest wins and the rest are counted as collapsed. Each meeting keeps the surviving id. Orphans are dropped and counted. |
| (doc) | `settings.legacy` (Drive only); `catchUpUntil = today + 30` |

`migrate`:
- v1 → `migrateV1`;
- v2 → returned unchanged;
- greater than 2 → `NewerSchemaError`, and the app goes read-only.

---

## 3. Sync design

### 3.1 Local storage and dispatch

**Normal mode**
- IDB `one-on-one:{permissionId}` (or `:local` for trial mode), with the stores `kv` and `drafts`.
- `meta` holds:
  - `fileId`, `folderId`, `backupsId`;
  - `remoteVersion`, `lastSyncAt`, `lastListAt`;
  - `dirty`, `editSeq`, `gen`;
  - **`pending: {[coll:id]: true}`** and `uploadedWatermark`;
  - `deviceId`, `maxSeen`, `readOnly`, `everSynced`.
- `localStorage.oneOnOne.lastAccount` is written.
- `navigator.storage.persist()` is requested. If the doc stays dirty for more than 24 hours, the badge shows a warning.

**Shared-computer mode** (decision 10, m-1)
- `sessionStore` keeps the doc, meta and drafts in `sessionStorage`. They survive a reload and are gone when the tab closes.
- If `sessionStorage` exceeds its quota, the store falls back to memory only and shows a warning.
- Nothing is written to IDB or `localStorage`; that includes `lastAccount` and `oneonone.drive.authorized`.
- Sign-in always uses `prompt:'select_account'`.
- The help text reads: "בסיום, צאו מהאפליקציה וגם מחשבון Google בדפדפן".
- There's no offline boot in this mode.

**Dispatch**
1. Take the lock `doc:{acct}`.
2. If `meta.gen` differs from the in-memory `gen`, reload from storage.
3. Apply the action.
4. Write the doc and meta: `dirty`, `editSeq+1`, `gen+1`, and add every touched id to `pending`.
5. Broadcast `doc-changed`.
6. Debounce sync by 1500 ms.
7. Morph.

**`tx` stamping**
- `updatedAt = max(now, maxSeen + 1ms)`.
- `base`:
  - if the id is in `pending`, keep `old.base` (the same unsynced lineage);
  - otherwise, `{updatedAt: old.updatedAt, by: old.by}`;
  - for a new entity, `null`.

**Confirming pending ids** (done by the sync engine). An id leaves `pending` when either:
- a downloaded remote contains exactly the local version (same `updatedAt` and `by`); or
- the remote metadata version still equals the version our last upload returned, and the local version has `updatedAt ≤ uploadedWatermark`.

An id also leaves `pending` when, after a merge, the local version no longer has `by === deviceId` (it lost to a tombstone or a higher epoch).

### 3.2 Merge (`domain/merge.js`)

**Signature:** `merge(a, b, ctx = {deviceId, pending})`. The function is symmetric in `a` and `b`.

**A version is *pending*** when its id is in `ctx.pending` and its `by === ctx.deviceId`. Only the merging device's own unconfirmed edits can be pending.

**A remote version R is *known* to a pending local version L** when either:
- R's identity equals `L.base` exactly; or
- `R.by === L.by` and `R.base` deep-equals `L.base` (R is the same device's earlier edit in the same lineage).

**Rules for each id present on both sides:**
1. **Students: total order** (B-3). Pick the max of `(epoch, isTombstone, updatedAt, by, canonicalJSON)`, where a tombstone ranks above a live version at the same epoch.
   - A delete always wins within its epoch.
   - Only a restore, which bumps `epoch`, revives a student.
   - If a pending live version loses to a higher-epoch live version and a protected field differs, a conflict records the pending version's text.
2. **Concurrent pending text edit** (B-1). This applies when:
   - both versions are live and at the same epoch;
   - one of them is pending (L) and the other (R) is not known to it;
   - and a protected field differs.

   Then:
   - **L wins and is re-stamped:** `updatedAt = max(L.updatedAt, R.updatedAt) + 1ms`, `by = deviceId`, `base` = R's identity. It stays pending.
   - **R's text goes to a conflict entity** whose stamps come from R.
   - The result is deterministic and is simply a new local edit, so other devices converge through plain last-writer-wins.
3. **Everything else:** last-writer-wins on `(updatedAt, by, canonicalJSON)`, with no conflict. That covers non-pending versions, known ancestors, and edits that touch no protected field.

**Why no conflict for non-pending versions:** an idle device's synced copy (a grand-ancestor) is never reported as "lost". The device that owned the losing edit detects the conflict when it merges, because that edit was pending there.

**Save-time check** (`editMeeting`, `setNotes`; B-2). A local conflict, with the current text as `lostText`, is written only when all three hold:
- the current version differs from the form's or draft's `base`;
- the current version is **not** this device's pending edit;
- the text differs.

**Restore:**
- Restored students get `epoch = current + 1`.
- Every restored entity gets `base` = the current version and is added to `pending`.
- Because the current version is known, the restore itself creates no conflicts.

**Post-merge normalization** (deterministic):
- Every live child of a tombstoned student is tombstoned, including conflicts on those entities.
- The child's stamp is `updatedAt = max(child.updatedAt + 1ms, student.updatedAt)`, `by = student.by`.

**Conflicts** (B-4):
- They are **never expired automatically**.
- They are removed only by:
  - dismissal, which tombstones the entry and strips `lostText`;
  - or the cascade when their entity or student is deleted.
- When conflicts merge, the dismissed tombstone outranks a re-derived copy, because it has a later `updatedAt`.

**Properties:**
- Idempotent and commutative for any `ctx`.
- Associative when `ctx.pending` is empty.
- The conflict set is a union.

Merges in the app are always binary (local × remote), and with pending edits the rule-2 result is a new edit, so convergence relies only on the last-writer-wins part.

### 3.3 Sync engine

The engine follows blind plan §4.4, run under the lock `sync:{acct}`, with these changes:

1. **Find the file.** Run `resolveDataFile()` (§3.4).
2. **Merge.** Merge the remote into local with `ctx = {deviceId, pending}`.
3. **Final write.** Under the lock `doc:{acct}`:
   - read the current doc `cur` from IDB;
   - compute `final = merge(cur, mergedRemote, ctx)`;
   - write it with `gen+1` and broadcast `doc-changed`;
   - set `dirty = (cur.editSeq ≠ seq0) || final ≠ uploaded`.
4. **Bookkeeping.** Confirm pending ids (§3.1). After each upload, record `uploadedWatermark` and the version the upload returned.

**Triggers:**
- the 1500 ms debounce after an edit;
- `online`;
- `focus` or the tab becoming visible;
- every 60 s while visible;
- a token grant.

**Account check:** after every token grant, call `about.permissionId` before any Drive call. On a mismatch:
- if the open DB is clean, switch to the other account's DB;
- if it's dirty, show the modal.

The app never merges across accounts.

### 3.4 Discovery

```
resolveDataFile():
  if meta.fileId:
     m = getMeta(fileId)
     if trashed && m.appProperties.supersededBy: switch to supersededBy; merge local in (no prompt)
     if 404, or trashed without supersededBy: list now (ignore the throttle)
  list if (now - meta.lastListAt ≥ 10 min) or (meta.recheckAt and now ≥ meta.recheckAt) or forced:
     L = list(app, kind='data', trashed=false), excluding files whose parents include backupsId
     if |L| > 1: winner = minBy(createdTime, id)
        merge each loser into local; upload to the winner;
        PATCH each loser {trashed:true, appProperties:{supersededBy: winner.id}}
     if |L| = 1 and it isn't the cached file: switch to it and merge
     if |L| = 0:
        if meta.everSynced: state 'remote-missing' (below)
        else: legacy lookup (§3.6) or create fresh; then set meta.recheckAt = now + 30 s
```

**`remote-missing` dialog (m-3)**
- Text: "קובץ הנתונים לא נמצא ב-Drive. ייתכן שהנתונים נמחקו ממכשיר אחר."
- **No button is the default:** none has autofocus, and Enter does nothing.
- Options:
  - [שחזר מהאשפה], shown only if a trashed data file exists;
  - [העלה את העותק מהמכשיר הזה];
  - [מחק גם מהמכשיר הזה], which asks for confirmation.

**Backup copies:** every `files.copy` sets `appProperties: {app, kind:'backup'}`.

**Duplicate root folder:** if two devices both create the root folder at first run, an empty duplicate may remain. That's harmless.

### 3.5 Backups, restore and scrub

Unchanged from v2 of this plan:
- daily `files.copy`;
- `retentionPlan`, which also recognizes the legacy `backup-*` names;
- restore from the Drive backups list or from a file, with a `pre-restore` copy, re-stamping and tombstoning (§3.2 for `epoch` and `base`);
- scrub, which permanently `DELETE`s legacy backups, `pre-migrate-v1-*` and the v1 file once all three hold: `migratedAt + 30` days have passed, there are at least 14 v2 daily backups, and `V2_MODE` is `on`.

### 3.6 Legacy v1 file

- **Lookup:** the cached `oneonone.drive.folderId` or a search by folder name, **with `trashed=false` on both the folder and `one-on-one-data.json`** (m-3).
- **First migration:**
  1. Copy the v1 file to `pre-migrate-v1-*` with `kind:'backup'`.
  2. Run `migrateV1`.
  3. Merge in the IDB doc and `oneonone.pending`.
  4. Create the v2 file in the same folder and tag it.
- **The v1 file is never written.**
- **Catch-up:** add-only and synced through `settings.legacy`. It runs on any device until `catchUpUntil`.
- **Marker doc:** rejected. It would break canary rollback.

### 3.7 Auth and lifecycle (P8c-2)

Unchanged from v2 of this plan:
- **Sign-out:**
  1. Full sync, then re-read the version.
  2. Broadcast to other tabs; close DB connections on `versionchange` and handle `onblocked`.
  3. Delete the database.
  4. Keep `authorized` (normal mode only). The next sign-in uses `select_account`. No revoke.
- **Disconnect:** revoke, then sign out.
- **Delete all:** the user types "מחק"; the folder is trashed; other tabs are told by broadcast; local data is cleared.
- **Trial → Drive:** a confirmation showing counts and duplicate names; then `one-on-one:local` is deleted.
- **Read-only:** for a doc with `schemaVersion` greater than 2.

---

## 4. Feature additions

Unchanged from v2 of this plan:
- needs-attention;
- ★ topic priority;
- snooze;
- meeting-form checkup chips and a new-topics field;
- parent meetings don't count;
- the Saturday shift on planned, checkup, snooze and due dates only (`data-no-saturday`);
- stats: adherence counted per §2.1, an SVG chart of meetings per week, coverage;
- calendar frequency presets including the half-year unit;
- mobile bottom nav and a sticky CTA;
- notices and auth errors (P8c-2);
- CSP and self-hosted fonts (P2);
- suggestion placement with a 3650-day cap and Sun–Fri as the fallback for empty workdays.

### 4.1 Exact CSP (meta tag in `index.html` and `privacy.html`)

```
default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style; font-src 'self'; img-src 'self' data:; connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/ https://oauth2.googleapis.com/revoke; frame-src https://accounts.google.com/gsi/; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
```

- The GIS inline-style violation is expected. E2E allowlists exactly that one console message.
- That `alt=media` downloads stay on `www.googleapis.com` is verified on the canary.

---

## 5. Phases

`V2_MODE` stays `'off'` until P10. The v1 tree changes only in P1 and P2.

| # | Phase | Contents | Depends on |
|---|---|---|---|
| P0 | Tooling | **Unchanged.** | none |
| P1 | Safety net and typing fix (v1) | **In order:**<br>(a) `main.js` + `createApp()`; `js/views/fixtures/v1-class.json`; **AC-CH written and green against the current code**.<br>(b) AC-F1 reproduction (red).<br>(c) `ui/morph.js` with identity preservation; `data-key`/`data-draft` across the views; the keying test.<br>(d) `ui/drafts.js` (base advancing, dirty clearing); notes autosave. | P0 |
| P2 | Quick wins (v1) | As in v2 of this plan: import, the `vcf.test.js` change as a separate commit, `dateInput`, fonts, CSP, `pct-*`. Also the D-list commit for AC-CH (phones display). | P0, parallel to P1 |
| P3 | Domain core | As in v2 of this plan; `tx` uses `pending`; `epoch` in the schema. | P0 |
| P4 | Recurrence and stats | Counting rule from §2.1. | P3 |
| P5 | Suggestions | | P3, P4 |
| P6 | Migration and merge | §3.2 rules; property tests. | P3, P4 |
| P7 | Storage and sync (fakes) | `sessionStore`, pending confirmation, throttled discovery. | P6 |
| P8a | v2 shell, local mode, views part 1 | AC-CH running on v2 via `migrateV1`, with the D-list variants. | P1, P5, P7 |
| P8b | Views part 2 | Conflict UI, read-only banner. | P8a |
| **P8c-1** | **v2 sync core (canary)** | Auth, account check, `resolveDataFile`, legacy migration and catch-up, sync-engine wiring, shared-computer mode. Canary checklist: copy `appProperties`, `alt=media` host, `supersededBy`, iOS GIS. | P8b |
| **P8c-2** | **v2 lifecycle (canary)** | Sign-out, disconnect, delete-all, `remote-missing` dialog and untrash, restore list, scrub, notices. | P8c-1 |
| P9 | UX additions (v2) | | P8b |
| P10 | E2E and rollout | ≥7-day canary, then `V2_MODE='on'`. | P8c-2, P9 |
| P11 | Cleanup | | P10 + 30 days |

**Rollback during the canary:** remove the canary key. v1 reads the untouched v1 file, and the canary edits stay in v2.

**Re-enabling after a rollback (m-5):** v1 edits made while rolled back reach v2 only through the add-only catch-up. **Edits to existing entities made in v1 during the rollback are lost.** Avoid editing in v1 between rollback and re-enable, or keep the rollback period short. After `on`, only roll forward.

---

## 6. Acceptance criteria

**Fixtures:** today is 2026-10-08 (Thursday), TZ is Asia/Jerusalem, workdays are Sun–Fri, capacity is 2, cadence is 21 and `staleDays` is 21.

### P0 (AC-TL): unchanged
1. `npm run check` exits 0. The 13 existing tests pass in their new `js/**` locations, and `tests/` no longer exists.
2. ESLint `innerHTML`:
   - errors in `js/views/x.js`;
   - is allowed in `js/ui/html.js`;
   - importing `raw` in a view errors;
   - `domain` → `ui` errors (from P3).
3. `parseSafe('<b>')` throws `TypeError`. `parseSafe(html`<b>${'<i>'}</b>`)` produces one `<b>` whose text is `<i>`.
4. `attr.bool('checked', true)` returns ` checked`, and with `false` it returns `''`.
5. Blind AC-49: the SW `SHELL` list equals the shipped files.

### P1 (AC-CH, AC-F)

**AC-CH (M-C).**
- **Seed.** `js/views/fixtures/v1-class.json` is a synthetic v1 doc: 3 students; topics, including an urgent one; one goal of each kind; a scheduled next meeting; checkups; meetings; settings.
- **Harnesses.** The v1 harness loads the fixture into a `LocalStorageBackend`. The v2 harness (P8a) seeds IDB with `migrateV1(fixture, {today})`.
- **Scope.** Every `data-action`, `data-form` and `data-change` handler gets a DOM-level test: clicks, fills and submits, asserting visible text, counts and badges.
- **Order.** The tests are written **green against the current code** before step P1(c).

**Intended divergences.** Each one gets a v2 variant test **in its own commit**. The v1 assertion stays in the v1 runner.

| # | Divergence | Phase |
|---|---|---|
| D1 | Recurring-goal status text: "בוצע … שוב ב-…" becomes the period/adherence text | v2 |
| D2 | "בראש הרשימה" becomes "חשוב" with a ★ badge | v2 |
| D3 | The Saturday workday checkbox is removed | v2 |
| D4 | Goal frequency options: "כל N ימים" becomes N weeks/months; "פעם במחצית" becomes half | v2 |
| D5 | Dashboard suggestion order and reason texts; the label "מטרות חוזרות בזמן" becomes "עמידה ממוצעת" | v2 |
| D6 | Save-status badge texts (new states) | v2 |
| D7 | Contact card shows only נייד/אמא/אבא; no email or address | v1 in P2, v2 inherits |
| D8 | Import preview has the phones checkbox | v1 in P2 |
| D9 | Unticking a recurring goal affects only the current period | v2 |

**AC-F (typing safety).**
1. **AC-F1** (the reproduction; red on the current code). Setup:
   - the fake backend reports a new version, and `load()` adds meeting m9;
   - the user types "סיכום חלקי" into a new meeting form and stays focused;
   - a `focus` event fires.

   Expected: the value is unchanged, the textarea is still `activeElement`, `selectionStart` is 10, and m9 is listed.
2. **AC-F2–F10:** unchanged from v2 of this plan:
   - submit; tick while dirty; reload restores the draft (stale ids ignored); notes autosave keeps focus and caret; edit form; search focus; `<details>` stays open; no swallowed taps; `pagehide` flush; sign-out clears drafts.
3. **AC-F11 (M-A).** Setup:
   - the edit form for m1 is open;
   - "טקסט" is typed into it, with focus kept;
   - a remote meeting m9, dated later, is inserted *above* m1.

   Expected:
   - m1's textarea, keyed `m1`, still holds "טקסט" and still has focus;
   - m9's item contains no form;
   - no other textarea contains "טקסט".

   Variant: the same, but m1 is deleted remotely. The form disappears, and draft `meeting:edit:m1` still holds "טקסט".
4. **AC-F12 (keying).** Every v1 view (and from P8a every v2 view) is rendered with the fixture. Assert:
   - every element child of `ul`, `ol` or `tbody` that has a sibling with the same tag has `data-key`;
   - every `form` inside such an item has `data-id` or `data-draft`.
5. **AC-F13.** Two cases:
   - The add-goal `<details>` is rendered open (`ui.addGoalOpen`). After a successful submit, the new markup drops `open` and has no dirty control, and the element is closed.
   - A `<details>` that the user opened, whose markup never had `open`, stays open after a morph.
6. **AC-F14 (m-4).**
   - After the notes autosave stores "abc" and the textarea blurs, `data-dirty` is gone.
   - A later remote change to the notes, made while the textarea isn't focused, updates its value.

### P2 (AC-Q): unchanged from v2 of this plan (Q1–Q5)

### P3 (blind AC-D, AC-C, AC-K; AC-N)
1. Unchanged from v2 of this plan: blind AC-1–5, AC-18–23, AC-29 and AC-30, the M11 checkup rule, and the parent-meeting rule.
2. **AC-N1 (`tx`, revised):**
   - `updatedAt = max(now, maxSeen + 1ms)`;
   - untouched entities are reference-equal, and the input is frozen;
   - **`base`:** editing a version `{T1, 'B'}` whose id isn't in `pending` gives `base = {T1, 'B'}`, and the id joins `pending`. Editing it again while still pending keeps `base = {T1, 'B'}`.
3. **AC-N2–N6:** unchanged. N2's allowlist now includes the student's `epoch`.

### P4 (blind AC-R, AC-G; AC-W)
1. Blind AC-6–17; AC-W1–W3; AC-W5 (unchanged).
2. **AC-W4 (rewritten, M-D):**
   - A weekly everyone-goal from 2026-09-06, with `inactiveSpans = [{from:'2026-09-20', to:'2026-10-07'}]`, no completions, today 2026-10-12.
   - Counted: the weeks starting 09-06 and 09-13, both missed.
   - Not counted: the weeks starting 09-20, 09-27 and 10-04, because each start is inside `[09-20, 10-07)`, and the week of 10-11, which is pending.
   - Adherence is 0/2. Every period key equals the key computed without the span.
   - **Variant:** with `to: '2026-10-04'`, the week of 10-04 is counted (half-open), giving adherence 0/3.
3. **AC-W6 (m-2).** A monthly goal with `countFrom = '2026-10-08'` and no October completion:
   - on 2026-11-02, October straddles `countFrom` and isn't done, so it isn't counted; November is pending; adherence is `null` (shown "—");
   - on 2026-12-02, November is missed, giving 0/1.

### P5 (AC-H): unchanged from v2 of this plan (H1–H4)

### P6 (AC-MIG, AC-M, AC-V)
1. **MIG1–MIG9** and blind AC-31–34, AC-36 and AC-38–40: unchanged from v2 of this plan.
2. **Blind AC-35, restated.** On device A, local L is `{T5, 'A', base: T3}` and pending; remote R is `{T4, 'B', base: T3, by: 'dev-b'}`, which isn't known to L. Expected:
   - the result is 'A' with `updatedAt = T5 + 1ms` and `base = {T4, 'dev-b'}`;
   - there is 1 conflict, with `lostText 'B'`, `updatedAt T4` and `by 'dev-b'`;
   - with the arguments swapped, the result is identical.
3. **AC-M7.** Edit "A1", sync, edit "A2" (still pending; same base); then another device changes a different entity. Next sync: **0 conflicts**.
4. **AC-M8.** "ab" is uploaded during a sync while local has moved on to "abc" (same device, same base). The final merge gives "abc" and **0 conflicts**.
5. **AC-M9.** A writes "A1" at T1. B pulls it and writes "B1" with `base = T1`. A, with nothing pending, merges and gets "B1" with **0 conflicts**.
6. **AC-M10.** An edit form is opened at V1. Remote V2, with a different summary, merges in; nothing is pending. The user saves "mine". Result: "mine", and **1 conflict** holding V2's text.
7. **AC-M11 (sticky delete).**
   - Device B tombstones s1 at T5 (epoch 0).
   - Device A, offline, edits the notes at T6 (epoch 0) and adds m7.
   - Merged in both orders: s1 stays tombstoned; m7 is tombstoned with `updatedAt ≥ T6 + 1ms`; **no conflict is kept for the deleted student**.
   - A restore (epoch 1) revives s1.
8. **AC-M12:** settings per key (unchanged).
9. **AC-M13 (revised, B-4).**
   - Dismissing a conflict tombstones it and removes `lostText`.
   - A conflict 400 days old and undismissed still exists after any number of syncs.
   - Deleting s1 tombstones the conflicts on s1 and on its meetings.
10. **AC-M14 (the grand-ancestor case).**
    - Device A holds synced "A1" and has nothing pending.
    - Device B writes "B1" with `base` = A1, syncs, then writes "B2" with `base` = B1.
    - A merges: "B2", **0 conflicts**.
11. **AC-M15 (the critic's B-1 case).**
    - Device B, offline, writes "B1" at 09:00 with `base` = T0. It's pending.
    - Meanwhile device A wrote "A1" at 10:00 (`base` = T0), synced, then wrote "A2" with `base` = A1.
    - B merges with the remote (A2): **1 conflict** with `lostText 'A2'`, and B's notes read "B1", re-stamped later than A2.
    - A then merges B's upload: "B1", no new conflict.
    - Total across both devices: exactly 1 conflict.
12. **AC-M16 (B-2).**
    - The notes autosave three times ("a", "ab", "abc") with one sync between the 1st and 2nd saves, and nothing remote changes: **0 conflicts**, and the draft's `base` after each save equals the version just written.
    - Variant: a remote "R" arrives between saves 2 and 3. Exactly **1 conflict**, with `lostText 'R'`, and the textarea still shows the user's text.
13. **AC-M17 (B-3).**
    - Versions of s1: tombstone T@8 (epoch 0), restore Rs@9 (epoch 1, live), offline edit E@10 (epoch 0, live, `base` @3).
    - All 6 orders of pairwise merging, with an empty `ctx`, give Rs's content, live, at epoch 1.
    - fast-check: for random student versions, merge is associative and commutative with an empty `ctx`.

### P7 (AC-S, AC-L, AC-Y, AC-B)
1. **Unchanged from v2 of this plan:** blind AC-41–47 and AC-52, AC-S50, AC-L1–L3, AC-L6, AC-Y1–Y3, AC-Y5, AC-Y6, AC-B53, AC-B54.
2. **AC-L5 (aligned, M-B).**
   - Devices X and Y both migrate from the legacy file and both create a v2 file.
   - Each device's next list runs at `recheckAt`, 30 s after its create.
   - After that, both have cached the older file; the loser is trashed with `supersededBy`; the two docs are deep-equal.
3. **AC-L7 (m-3).**
   - The legacy folder is trashed while `one-on-one-data.json` is live, and `everSynced` is false: no migration happens and a fresh v2 file is created.
   - In the `remote-missing` dialog, no button has `autofocus`, pressing Enter triggers nothing, and the text includes "ייתכן שהנתונים נמחקו ממכשיר אחר".
4. **AC-Y7 (revised, m-1).**
   - Sign in with "מחשב משותף" and edit.
   - After a reload of the same session store, the doc and the dirty flag are restored without a network call.
   - After the session ends (a new store instance with an empty `sessionStorage`), there is no data.
   - IDB has no `one-on-one:*` databases, and `localStorage` has neither `oneOnOne.lastAccount` nor `oneonone.drive.authorized`.
   - The sign-in request used `prompt:'select_account'`.
5. **AC-Y8 (M-B).**
   - Two syncs 2 minutes apart make 1 `files.list` call; syncs 11 minutes apart make 2.
   - A cached file that returns 404 forces a list even inside the throttle window.
6. **AC-Y9 (pending confirmation).**
   - After an upload, if the next sync's metadata version still equals the uploaded version, the uploaded ids leave `pending`.
   - If another device wrote in between, the ids leave `pending` only when the downloaded doc contains exactly the local version.

### P8 (AC-Z)
1. **AC-Z1 (revised).** Every AC-CH test passes on v2, seeded through `migrateV1`. The exceptions are the tests marked D1–D9, whose v2 variants pass instead.
2. **AC-Z2–Z9:** unchanged from v2 of this plan. Z6, Z7 and Z8 now live in P8c-2. Z9 (the canary switch) lives in P8a.

### P9 (AC-U): unchanged from v2 of this plan (U1–U9)

### P10: unchanged from v2 of this plan
Also: an e2e run of AC-F11, and of AC-M15 with two browser contexts.

---

## 7. Risks

1. **Old-code tabs.** v2 never writes the v1 file. Catch-up from it is add-only for 30 days. An old tab can still re-create v1 data after delete-all or the scrub, and that can't be fixed.
2. **The migration is lossy.** Rollback during the canary relies on the untouched v1 file. After `on`, it relies on `pre-migrate` until the scrub runs.
3. **Drive API behaviours not yet verified for real:** copy inheriting `appProperties`, the `alt=media` host, untrash, and `supersededBy`. All are on the P8c-1 canary checklist, and the fake is pessimistic about them.
4. **The morph.** Moving a focused keyed node blurs it. The keying test (F12) is the guard against a view missing `data-key`.
5. **Two view trees** until P11.
6. **Shared mode keeps data in `sessionStorage`.** A browser's "reopen closed tab" can restore the session, including the doc. The help text says to sign out. Docs above the quota fall back to memory only.
7. **GIS on iOS and clock skew.** Clock skew affects only last-writer-wins order. It can't hide a concurrent pending edit, because detection is based on pending ids, not timestamps.
8. **`next:{sid}` overwrite.** The deterministic id means a meeting closing the next on one device can overwrite a concurrent reschedule on another (LWW).
9. **Size.** `base` and `epoch` add about 70 bytes per entity. `pending` lives in device-local `meta`.
10. **Canary rollback and re-enable** loses edits made in v1 to existing entities during the rollback (§5).
11. **Pending-wins rule.** When two devices edit the same text concurrently, the device that merges second keeps its own text on screen, and the other text goes to the conflict banner. That's intended. It's reversible, because the other text is kept in the conflict until the user dismisses it.

## 8. Open questions

None are blocking. Before P10, the user should confirm the canary duration. I propose at least 7 days on both phone and laptop, including one deliberate offline concurrent edit.

---

> **Note on "unchanged from v2 of this plan" references:** the full v2 text (round 2) is in git history at commit `1a56f72` (`docs/plans/2026-10-08-hybrid-plan.md`). It holds the detail for the sections and ACs referenced here as unchanged (e.g. AC-F2–F10, AC-Q1–Q5, AC-H1–H4, AC-MIG1–9, AC-U1–U9, §3.5, §3.7, §4).
