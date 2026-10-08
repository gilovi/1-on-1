# Hybrid rebuild plan: "1-on-1" (2026-10-08)

> Produced by the **architect** agent with full code context, from `2026-10-08-decisions.md`, `2026-10-08-architect-plan.md` and `2026-10-08-comparison.md`. Saved verbatim; pending review by the critic and the user's answers to §8.

## 0. Context

**What I read:**
- The decisions doc, the blind architect plan and the comparison doc.
- All of `js/` (`app.js`, `store.js`, `storage.js`, `model.js`, `logic.js`, `dates.js`, `vcf.js`, `ui.js`, `config.js`, `views/*`).
- `tests/*`, `index.html`, `sw.js`, `manifest.webmanifest`, `privacy.html`, `package.json` and `.gitignore`.

**Facts from the code that shape this plan:**
- **The focus-reload bug is real and easy to explain.** `app.js` has a `window 'focus'` handler. It reloads from Drive whenever `store.status === 'saved'` and the remote version has changed. Typing in the meeting-form `<textarea>` never touches the store; it only changes on submit. So the status is still `saved`, `reloadFromBackend()` → `emit()` → `render()` runs, and `this.main.innerHTML = …` wipes the half-typed summary. The student-notes textarea has the same problem: it saves only on `change`.
- **Data model today.**
  - Settings: `className, defaultFrequencyDays(30), staleDays, meetingsPerDay, suggestionsCount, workdays`.
  - Collections: `students[]` (with embedded `nextMeeting{date,time,note}` and `checkups[]`), `goals[]` (`recurring`, `everyDays`, `archived`), `goalCompletions[]` (random ids, `studentId|null`, `date`, `meetingId`), `meetings[]`, `topics[]` (integer `order`, `done`).
  - **There is no `parent` meeting type.** The current types are `regular`, `checkup`, `discipline`, `academic` and `other`, so `parent` must be added.
- **Rendering.** Every view returns an escaped `html```. `app.js` writes it to `innerHTML` in 6 places.
  - `raw()` is used only for boolean attributes (`checked`, `disabled`, `hidden`, `open`, `selected`).
  - The only inline `style=` is `progressBar` in `ui.js:50`, which a strict CSP would block.
- **Drive.** Discovery is by folder name (configurable) plus `one-on-one-data.json`. Backups are re-uploaded into `גיבויים/backup-YYYY-MM-DD.json`. `ensureFolder()` **recreates the folder if it was trashed**, which would resurrect data after a delete-all. `about` doesn't fetch `permissionId`.
- **Sign-out** revokes the token and doesn't clear local data.
- **Fonts and offline.** Rubik is loaded from Google Fonts. The SW is network-first with a hand-kept `SHELL` list. Trial mode keeps data in localStorage (`oneonone.data`), and unsaved Drive edits go to `oneonone.pending`.
- **Tooling.** There is only `node --test tests/*.test.js` (13 tests). `.gitignore` ignores `*.vcf` except `tests/fixtures/*.vcf`, so it must change when the fixtures move.

**Goal:** keep every screen, feature and the look. Replace the data layer (schema v2, IndexedDB per account, merge-based sync, calendar recurrence) and close the gaps from the decisions doc.

---

## 1. Target module layout

The approach is a strangler. The new pure modules are built next to the old ones while the app keeps running on the old ones. One cutover phase (P8) switches the app over and deletes `model.js`, `logic.js`, `store.js` and `storage.js`.

| Current | Target | Fate |
|---|---|---|
| `js/app.js` (boot, router, events, render, focus handler) | `js/main.js` (side-effect entry), `js/app.js` (exports `createApp({root, store, auth})`, router, event delegation), `js/ui/renderScheduler.js` (render guard), `js/ui/shell.js` (nav, bottom nav, status badge, banners) | Refactored. The entry is split out so app.js can be tested in happy-dom. |
| `js/config.js` | Same file, plus `SCHEMA_VERSION=2`, `APP_ID`, `DATA_FILE_V2='one-on-one-data-v2.json'`, `LEGACY_DATA_FILE`, retention constants | Kept |
| `js/dates.js` | `js/domain/dates.js` (`addDays`, `diffDays`, `weekday`, `weekStart`, `monthStart`, `addMonths`, `shiftOffSaturday`, `nextWorkday`) and `js/ui/format.js` (`formatDate`, `formatHebrewDate`, `relativeDay`, `weekdayName`) | Split |
| `js/model.js` | `js/domain/schema.js` (factories, `emptyDoc`, `validateDoc`, `CONTENT_FIELDS`), `js/domain/ids.js`, `js/ui/labels.js` (`MEETING_TYPES` + `parent`, `GOAL_SCOPES`, `GOAL_OWNERS`, frequency presets) | Replaced |
| `js/logic.js` | `js/domain/tx.js` (copy-on-write transaction plus stamping), `actions.js`, `selectors.js`, `cadence.js`, `recurrence.js`, `stats.js`, `suggestions.js` | Replaced; existing behaviour is ported |
| (none) | `js/domain/merge.js`, `js/domain/migrate.js`, `js/domain/migrateV1.js` | Added |
| `js/vcf.js` | `js/import/vcard.js` (names, plus phones only when `includePhones`), `js/import/nameList.js`, `js/import/names.js` (normalize) | Refactored |
| `js/store.js` | `js/app/store.js` (`dispatch(action, payload)` → pure action → IDB write → broadcast → schedule sync → notify `{reason}`) | Replaced |
| `js/storage.js` | `js/storage/idb.js`, `js/storage/accountStore.js` (doc, meta, drafts per account), `js/sync/auth.js` (GIS, `mapAuthError`), `js/sync/drive.js` (REST), `js/sync/discovery.js` (v2 + legacy), `js/sync/syncEngine.js`, `js/sync/backups.js` (`retentionPlan`), `js/sync/locks.js` (`navigator.locks` with an in-memory fallback) | Replaced |
| `js/ui.js` | `js/ui/html.js` (`html`, `attr.bool`, `setHTML` sink; `raw` not exported), `js/ui/toast.js`, `js/ui/forms.js`, `js/ui/drafts.js`, `js/ui/i18n.js` (auth and notice strings) | Split |
| `js/views/*` | The same 7 views, ported to selectors/actions. Notices are added as a dashboard card in `views/notices.js`. | Kept, with the look unchanged |
| `tests/*.test.js`, `tests/fixtures/sample.vcf` | `js/**/X.test.js` next to code, `js/import/fixtures/sample.vcf`, `e2e/` (Playwright, `fakeDrive.js`, `fakeGis.js`) | Moved. `.gitignore` exception becomes `!js/import/fixtures/*.vcf`. |
| (none) | `package.json` scripts, `tsconfig.json` (all of `js/`, non-strict), `tsconfig.strict.json` (`domain/`, `import/`, `storage/`, `sync/`; strict), `js/types.d.ts`, `eslint.config.js`, `vitest.config.js`, `playwright.config.js`, `.github/workflows/check.yml`, `fonts/` (Rubik woff2 + OFL.txt) | Added |

**Scripts:**
- `typecheck`: `tsc -p tsconfig.json && tsc -p tsconfig.strict.json`
- `lint`: `eslint . --max-warnings 0`
- `test`: `vitest run` (with `pool: 'forks'` and `env: {TZ: 'Asia/Jerusalem'}`)
- `e2e`: `playwright test`
- `check`: typecheck + lint + test

**Dev dependencies:** `typescript`, `eslint`, `@eslint/js`, `globals`, `vitest`, `happy-dom`, `fake-indexeddb`, `fast-check`, `@playwright/test`. None of them ship to the site.

**CI:** `check.yml` runs on push and PR with Node 22: `npm ci` then `npm run check`. A second job runs `npx playwright install chromium` then `npm run e2e`, starting from P10.

**ESLint rules (beyond recommended):**
- `no-restricted-properties`: bans `innerHTML`, `outerHTML` and `insertAdjacentHTML`. The single sink file `js/ui/html.js` is exempted through a config override, not inline disables.
- `no-restricted-syntax`:
  - `TemplateElement[value.raw=/style\s*=/]`, so no inline style attributes in templates;
  - `CallExpression[callee.name='eval']`.
- `no-restricted-imports`:
  - `js/domain/**` and `js/import/**` can't import from `ui/`, `storage/`, `sync/` or `app/`;
  - nothing outside `ui/html.js` can import `raw`.
- Globals: `serviceworker` for `sw.js`, `node` for config files and tests.

### Rendering decision: keep `html```, make it a guarded sink (no `h()` migration)

| | Keep escaping `html``` + guarded sink | Migrate to `h()` builder |
|---|---|---|
| Diff size | ~30 lines (`setHTML`, `attr.bool`, remove `raw`) | Rewrite ~1,200 lines of templates across 7 views |
| XSS safety | By construction for text. The only bypass (`raw`) becomes private, `setHTML` throws on anything but `SafeHtml`, lint bans other sinks, and an XSS test renders every view with hostile strings | By construction |
| Focus/typing loss | Not fixed by either. Needs a render guard plus drafts anyway. | Same |
| Risk to "keep the look" | None | High: markup drift, regressions |

**Decision:** keep the template.
- `setHTML(el, SafeHtml)` is the only `innerHTML` write in the codebase.
- `attr.bool(name, cond)` replaces every `raw(' checked')`-style use.
- `href` values never interpolate free user text: they're ids, digit-only phones or Drive ids. A test asserts phones are normalized to `[+\d]`.
- **Trusted Types: considered and rejected for now.** The GIS library and the dynamic `<script src>` load would need TT policies. Breaking sign-in isn't worth it when the lint guard and XSS test already cover the sink.

### Typing-loss fix (applies to both the bug and the design)

**1. Render scheduler (`ui/renderScheduler.js`).** Store notifications carry a `reason`: `'local' | 'remote' | 'status'`.
- `'status'` re-renders only the badge.
- `'remote'` covers sync merges, other-tab broadcasts and legacy catch-up. If `isEditing(main)` is true, the render is deferred: a small banner says "עודכנו נתונים ממכשיר אחר – יוצגו בסיום העריכה" and the render runs on the next `submit`, `cancel` or `focusout` that leaves no editing element. `isEditing` is true when:
  - `document.activeElement` is an `input`/`textarea`/`select` inside `#main` (excluding checkboxes and search), **or**
  - any `form[data-draft]` has `data-dirty`.
- `'local'` (the user's own click) renders immediately. Open draft forms are refilled from the in-memory draft cache, so a topic tick doesn't wipe the meeting form.

**2. Drafts (`ui/drafts.js`).**
- Forms marked `data-draft="meeting:new:{sid}" | "meeting:edit:{mid}" | "notes:{sid}" | "topic:edit:{tid}"`.
- On every `input`, the draft goes into an in-memory map and, debounced by 300 ms, to the storage adapter. That adapter is localStorage in P1 and the IDB `drafts` store from P8.
- Drafts are restored when the form renders and deleted after the action succeeds.
- Student notes also save on a debounced `input`, not only on `change`.

---

## 2. Schema v2 and migration

### 2.1 Shape (`schemaVersion: 2`)

- **Collections are maps keyed by id.**
- **Every entity carries common fields:** `id`, `createdAt`, `updatedAt` (ISO ms), `by` (deviceId) and `deletedAt` (null or ISO).
- **Tombstones** strip the fields in `CONTENT_FIELDS[collection]`: names, notes, contacts, summary, text, title, description, note and reason.
- **`updatedAt` is generated** as `max(now, meta.maxSeen + 1ms)`.

```
{ app:'one-on-one', schemaVersion:2, createdAt,
  settings: { id:'settings', updatedAt, by, defaultFrequencyDays, staleDays, meetingsPerDay,
              suggestionsCount, workdays /*0..5, Saturday never*/, activeClassId,
              noticesAck:{privacy:null|ISO, reporting:null|ISO} },
  classes:  { [id]: { name, schoolName, archived } },
  students: { [id]: { classId, firstName, lastName, fullName, notes, cadenceDays:null|n,
              needsAttention:{flag:false, reason:''}, snoozedUntil:null|LocalDate,
              contacts:null|{studentCell?, motherPhone?, fatherPhone?},
              active, activeFrom, inactiveFrom, source:{kind, externalKey} } },
  meetings: { [id]: { studentId, date, type:'regular'|'checkup'|'discipline'|'academic'|'parent'|'other',
              summary, topicIdsDone:[], completionIds:[] } },
  planned:  { ['next:'+studentId | uuid]: { studentId, kind:'next'|'checkup', date, time, note,
              status:'planned'|'done'|'cancelled', linkedMeetingId } },
  topics:   { [id]: { studentId, text, order /*float*/, priority:'high'|'normal',
              status:'open'|'done', doneAt, doneInMeetingId } },
  goals:    { [id]: { title, description, scope:'student'|'everyone'|'class', owner, classId, studentId,
              kind:'once'|'recurring', rules:[{from, unit:'week'|'month', every}],
              startDate, endDate, dueDate, archived } },
  completions: { [`${goalId}:${subject}:${periodKey}`]: { goalId, subject /*studentId|'class'*/,
              periodKey /*period start | 'once'*/, completedOn, meetingId, note } },
  conflicts: { [`${coll}:${entityId}:${field}:${loserUpdatedAt}:${loserBy}`]:
              { coll, entityId, field, lostText, lostUpdatedAt, lostBy, dismissedAt } } }
```

**Deviations from the blind plan, and why:**
- **The planned `next` has the deterministic id `next:{studentId}`.** There is one per student by construction, so the blind plan's "two live next" normalization (AC-M37) goes away.
- **`time`/`note` on planned items are kept.** That's an existing feature.
- **Existing meeting types are kept**, and `parent` is added.
- **`archived` is kept**, matching the current goals UI.
- **`staleDays` and `meetingsPerDay` are kept**, because current features depend on them.
- **`conflicts` is a map of entities**, so it merges like everything else (dismiss is LWW).
- **Protected text fields** are `meetings.summary` and `students.notes`.

### 2.2 `migrateV1(v1, {deviceId}) → {doc, report}`: pure and deterministic

Determinism matters because two devices may migrate the same v1 file independently, and they must produce identical docs. So:
- ids are derived from v1 data, never random;
- timestamps come from the data, never from `Date.now()`;
- `by` = `'migration-v1'`;
- every entity gets `updatedAt` = `v1.updatedAt` (the file-level value). `createdAt` = the v1 `createdAt` if it's ISO, else `${date}T00:00:00.000Z`.

| v1 | v2 |
|---|---|
| `settings.className` | `classes['class-1'] = {name}`, `settings.activeClassId='class-1'`, and every student gets `classId='class-1'` |
| other settings | copied. `workdays` loses 6 (Saturday). |
| student `phones[]` | `contacts`:<br>• label `נייד` / CELL → `studentCell`<br>• `אמא` / `Mother` → `motherPhone`<br>• `אבא` / `Father` → `fatherPhone`<br>• the first match wins per key<br>• **all other labels (בית, עבודה, ראשי, טלפון, custom) are dropped**<br>• `null` if nothing maps |
| `email`, `address`, `org` | **dropped** (`org` goes to `classes.schoolName` only if every student shares it) |
| `frequencyDays` | `cadenceDays` |
| `createdAt` (LocalDate) | `activeFrom` |
| `active:false` | `inactiveFrom` = the migration's `v1.updatedAt` date |
| `nextMeeting{date,time,note}` | `planned['next:'+sid]`, status `planned`, `date = shiftOffSaturday(date)` |
| `checkups[]` | `planned[c.id]` kind `checkup`; `done` maps to `done` with `linkedMeetingId=c.meetingId`; Saturday shifted |
| topics | `status` from `done`. `order`: open topics per student are ranked by v1 order and set to `1024·rank`. `priority='high'` iff v1 `order < 1`, because only the "urgent" add produces it and any reorder renumbers to 1..n, so there are no false positives. `meetingId` → `doneInMeetingId` |
| meetings | `type` kept. `topicIdsDone` = topics with `meetingId == m.id`. `completionIds` is filled below. |
| goal `recurring:false` | `kind:'once'`, `rules:[]` |
| goal `recurring:true, everyDays:N` | `kind:'recurring'`, `rules=[{from:startDate, …map(N)}]`:<br>• presets: 7→week/1, 14→week/2, 30→month/1, 60→month/2, 90→month/3, 150→month/5<br>• custom N<28 → week/max(1,round(N/7)), else month/max(1,round(N/30))<br>• non-preset goals are listed in `report.approximatedGoals` |
| goal `createdAt` | `startDate` = min(`createdAt`, earliest completion date for that goal) |
| completion `{goalId, studentId, date, meetingId}` | `subject = studentId ?? 'class'`. `periodKey` = 'once' for one-time goals, or the key of the v2 period containing `date` (§5.1). id = `goal:subject:periodKey`. When several v1 completions land on one id, **the earliest `date` wins**; the others are counted in `report.collapsedCompletions`. Each source meeting still lists the surviving id in `completionIds`, so "goals achieved in this meeting" still shows. Orphans (goal or student missing) are dropped and counted. |

**Effect of the rolling → calendar change:** a monthly goal ticked on Oct 30 used to read "done until Nov 29". It now reads October done and November pending. After the first migration, a one-time notice explains this and lists `report.approximatedGoals`.

`migrate(doc)` is the router:
- v1, or no `schemaVersion` with `students` as an array → `migrateV1`;
- v2 → unchanged;
- greater than 2 → throw `NewerSchemaError`, which puts the app into read-only.

`validateDoc` is hand-written and returns error paths.

---

## 3. Sync design

This reuses blind §4 with the following hybrid specifics.

- **Local copy:**
  - IDB `one-on-one:{permissionId}`, or `one-on-one:local` for trial mode.
  - Stores: `kv` (`doc`, `meta{fileId, folderId, backupsId, remoteVersion, lastSyncAt, dirty, editSeq, deviceId, maxSeen, readOnly, everSynced, legacy:{fileId, version}|null, lastBackupDate, lastRetentionDate}`) and `drafts`.
  - `localStorage.oneOnOne.lastAccount = {permissionId, email, name}`. `about` now requests `permissionId`.
- **Boot is offline-first.**
  - If `lastAccount.permissionId` exists, open that DB and render right away. Auth happens in the background.
  - First boot after the upgrade has no `permissionId`, so it needs one click (the existing "המשך בתור …" button).
- **Dispatch:**
  - It runs under the lock `doc:{acct}`.
  - If IDB `meta.editSeq` differs from memory (another tab wrote), reload the doc and re-apply the pure action.
  - Then write `doc` and `meta{dirty:true, editSeq+1}`, post `BroadcastChannel('one-on-one:{acct}')` `{type:'doc-changed'}`, debounce sync by 1500 ms and notify `{reason:'local'}`.
- **Sync engine:**
  - It follows blind §4.4 under the lock `sync:{acct}`: metadata → (download → `migrate` → `mergeDocs`) → `ensureDaily` copy → upload → reconcile mid-sync edits by merging with the current IDB doc.
  - If the merge changed local, notify `{reason:'remote'}`.
  - Triggers: debounce, `online`, `focus`/visible, every 60 s while visible, after a token arrives, and `hidden` (best effort).
  - **The old focus handler is deleted**, because `focus` now only triggers a sync whose result goes through the render guard.
- **Merge:** blind §4.5 with these differences:
  - conflicts are produced for **both** `meetings.summary` and `students.notes`;
  - there is no single-next normalization (it's no longer needed);
  - `conflicts` is merged as an ordinary collection.
- **Conflict UI:** a banner on the student page when there are undismissed conflicts for that student: "נמצאה גרסה נוספת של סיכום/הערות – הצג". The panel offers "העתק", "שחזר כטקסט נוסף" (appends the lost text) and "סגור" (sets `dismissedAt`).
- **Discovery (`sync/discovery.js`):**
  1. **Cached `fileId`:** read its metadata. If it's trashed or 404, and `meta.everSynced` is set, go to state **`remote-deleted`**. **Never auto-create.** A banner offers "מחק גם מהמכשיר הזה" or "העלה את העותק מהמכשיר הזה" (the second creates a new folder and file).
  2. **No cached id:** run `files.list` on `appProperties {app:'one-on-one', kind:'data'}`, not trashed.
     - 1 result: use it.
     - More than 1: keep the oldest, merge the rest in, and trash them.
  3. **0 results, so try legacy:** use the folder from `localStorage['oneonone.drive.folderId']` or a name search (`config.folderName`), then look for `one-on-one-data.json` in it. If found:
     - `files.copy` it to `backups/pre-migrate-v1-{ts}.json`;
     - `migrateV1`, then merge with local (the IDB doc, plus `oneonone.pending` migrated if present);
     - create `one-on-one-data-v2.json` in **the same folder** with appProperties, and tag the folder (`kind:'root'`) and `גיבויים` (`kind:'backups'`);
     - set `meta.legacy = {fileId, version}`.
     - **The v1 file is never modified or renamed.** An old-code tab left open keeps writing to v1 and never sees v2 (that's §7 risk 1).
  4. **Nothing found:** create the folder, the v2 file and `גיבויים`.
- **Legacy catch-up:** at boot sync, if `meta.legacy` is set and its version changed, download it, `migrateV1` it and **merge add-only**: only ids absent from the v2 doc are added; existing entities are never overwritten. Then toast "נוספו שינויים ממכשיר עם גרסה ישנה".
- **Backups:**
  - `ensureDaily` makes a `files.copy` of the pre-upload remote into `גיבויים/data-YYYY-MM-DD.json`.
  - `retentionPlan` follows blind §4.6 and also recognizes the legacy `backup-YYYY-MM-DD.json` names as dailies. `pre-migrate-*` and `pre-restore-*` share the "keep 5 newest" bucket.
  - Retention runs at most once a day.
- **Restore from file (kept):**
  - `migrate`, then `validateDoc`, then confirm with counts.
  - `files.copy` the current remote to `pre-restore-{ts}`.
  - Replace the doc, **re-stamping every restored entity** with `updatedAt=now`, and **tombstoning every current live id absent from the restored doc**. Without that, merge would resurrect them from other devices.
- **Sign-out (no revoke):**
  - If dirty, try one sync. If that fails, confirm "יש שינויים שלא נשמרו ב-Drive – לצאת בכל זאת?".
  - Delete this account's IDB DB and `lastAccount`, and drop the token.
  - Keep `oneonone.drive.authorized`, so the next sign-in skips consent. The next sign-in uses `prompt:'select_account'`.
- **Disconnect** (a separate button in Settings): `google.accounts.oauth2.revoke`, then sign out, then clear `authorized`.
- **Delete all:**
  - The user must type "מחק" exactly.
  - `PATCH files/{folderId} {trashed:true}` trashes the folder with the v1 file, the v2 file and the backups.
  - Then delete the IDB DB, `lastAccount`, `oneonone.*` keys and drafts.
  - Show "הנתונים הועברו לאשפה ב-Drive ויימחקו לצמיתות תוך 30 יום". Other devices hit `remote-deleted`.
- **Auth (`sync/auth.js`):**
  - Keeps the current "first click refreshes" model (`refreshIfNeeded` on a capture-phase click).
  - Adds `hasGrantedAllScopes`, `mapAuthError` (blind §4.2 table, with Hebrew in `ui/i18n.js`) and states `none | valid | needs-gesture | blocked`.
  - Local editing is never blocked.
- **Read-only:** if the remote has `schemaVersion > 2`, set `meta.readOnly`, show a banner, block dispatch and never upload.

---

## 4. Feature additions (where they land)

| Feature | Domain | UI |
|---|---|---|
| Needs-attention | `student.needsAttention`; action `setNeedsAttention(sid, flag, reason)` | Student header toggle plus reason input; badge in the students table and suggestions; students-list filter "רק דורשי תשומת לב" |
| Topic priority | `topic.priority`; `setTopicPriority`. The add option "חשוב" sets `high` and places the topic first. | ★/☆ toggle per topic (`aria-pressed`); the add form's "בראש הרשימה" checkbox is renamed "חשוב" |
| Snooze | `student.snoozedUntil`. Actions: `snooze(sid, 'tomorrow'|'nextWeek')` → `shiftOffSaturday(nextWorkday(today+1))` / `shiftOffSaturday(today+7)`. Cleared by any counted meeting. | "לא היום" / "שבוע הבא" buttons on `suggested` rows |
| Meeting form | `recordMeeting` input gains `checkupInDays?`, `checkupReason?`, `newTopics[]` | Chips "מעקב בעוד: 3 ימים · שבוע · שבועיים" plus a reason field; a "נושאים לפעם הבאה" textarea (one per line); the next-date field is kept |
| Parent meetings don't count | `countedMeetings` = live meetings with `type !== 'parent'`. They're used by `lastMeetingDate`, stale, coverage, the weekly trend and snooze clearing. A parent meeting **doesn't** close the planned `next` (it still closes checkups only if `type==='checkup'`), but it **can** tick goals and topics. | New type "שיחה עם הורים" in the select, with a distinct badge |
| Saturday shift | `shiftOffSaturday` is enforced in every action that stores a date (planned, checkup, snooze, goal `dueDate`, meeting date). Suggestions never use day 6. The ש׳ checkbox is removed from settings. | `ui/dateInput.js`: a delegated `change` listener on every `input[type=date]` shifts a Saturday to Sunday and announces "שבת אינה אפשרית – הועבר ליום א׳" in an `aria-live` region. If the shift passes `max`, the value is cleared with a message. |
| Stats | `recurrence.adherence`, `stats.goalStats` (adherence, current period x/N, missed list), `stats.meetingsPerWeek(8)`, `coverage` (counted meetings) | Dashboard: "עמידה ממוצעת" replaces "מטרות חוזרות בזמן"; the weekly chart is an **SVG** (`<rect height>` attributes, so it's CSP-safe); goal rows read "תקופה נוכחית: ממתין · עמידה 75% (3/4)" with `<details>` "תקופות שהוחמצו" |
| Goal frequency | Calendar rules; a frequency edit appends a segment (blind §5.1) | `recurrenceFields`: presets שבועי/דו-שבועי/חודשי/דו-חודשי/כל 3 חודשים/פעם במחצית, plus custom "כל N [שבועות/חודשים]" |
| Mobile nav / CTA | n/a | CSS only. At ≤640px `#nav` becomes a fixed bottom bar with `padding-bottom: env(safe-area-inset-bottom)` and `body` gets bottom padding. The student page gets a sticky "+ רישום מפגש"; while the form is open, "שמירת המפגש" is sticky. Verified visually in light and dark (no TDD for layout). |
| Notices | `settings.noticesAck` | Dashboard card(s) until acknowledged: the privacy notice, and the mandatory-reporting text from spec §2.10. The welcome screen adds "מומלץ חשבון Gmail אישי". The Settings Drive link adds a sharing warning. |
| Auth errors | `mapAuthError` | The connect screen and status badge show the mapped Hebrew message (the raw code goes in `title` for `auth.unknown`) |
| CSP and fonts | n/a | Rubik woff2 in `fonts/` with `@font-face` in `styles.css`; the Google Fonts `<link>`s are removed. `progressBar` uses classes `pct-0…pct-100` (step 5, 21 CSS rules) instead of `style=`. Meta CSP as in blind §7 but with `form-action 'self'`. Fonts are added to the SW precache. `privacy.html` gets the same CSP and updated sections on deletion and sign-out. |

**Suggestions (hybrid):** this keeps the current day-spreading with capacity and replaces urgency ordering with blind-style scores.

*Items:*
- A live `next` with status `planned` produces a `scheduled` item.
- Each live planned checkup produces a `checkup` item.
- Students with no planned `next` become candidates. Each candidate's `earliest` is `max(today, due, snoozedUntil)`, where `due` is:
  - `today` if the student has never been met or `needsAttention` is set;
  - otherwise `shiftOffSaturday(last + cadence)`.

*Score:*
- never met: 400;
- otherwise `200·min(daysSince/cadence, 3)`;
- needs attention: +150;
- high-priority open topics: `40·min(n, 3)`;
- goal work: `30·min(k, 3)`.

Reason chips follow the blind §5.3 codes.

*Placement:* walk the days from today, skipping non-workdays and Saturday. On each day, fill `capacity − load(day)` slots with the eligible unplaced candidates ranked by (score desc, daysSince desc with never-met = ∞, he-collator name, id).

*Output:* sort by (date, kind order scheduled < checkup < suggested, score desc) and take `slice(count)`.

---

## 5. Phases

Every phase ends with `npm run check` green. Bug fix → reproduction test first. New logic: qa writes the listed ACs red, then builder makes them green.

| # | Phase | Files | Depends on |
|---|---|---|---|
| P0 | Tooling, relocated tests, CI, HTML sink | `package.json`, `package-lock.json`, `tsconfig*.json`, `js/types.d.ts`, `eslint.config.js`, `vitest.config.js`, `.github/workflows/check.yml`, `.gitignore`; move tests (converted to Vitest `test`/`expect`); `js/ui/html.js` (`setHTML`, `attr.bool`), with all `innerHTML` writes in `app.js` and the `raw` uses in views routed through it | none |
| P1 | **Focus-reload bug + drafts** (on the current architecture) | `js/main.js` split from `app.js` (`createApp`), `js/ui/renderScheduler.js`, `js/ui/drafts.js` (localStorage adapter); `data-draft` on the meeting, edit-meeting, notes and topic-edit forms; `index.html` and `sw.js` entry updated | P0 |
| P2 | Quick privacy/UX wins on current code | `js/import/vcard.js`, `nameList.js` (names-only, phones opt-in checkbox on the import view); `js/sync/auth.js` `mapAuthError` + `ui/i18n.js` wired into the current `DriveBackend`; sign-out without revoke plus Disconnect; `ui/dateInput.js` Saturday shift; notices card (ack in localStorage until P8); self-hosted fonts, CSP meta, `pct-*` classes and the `style=` lint rule | P0; parallel with P1 |
| P3 | Domain v2 core | `domain/dates.js`, `ids.js`, `schema.js`, `tx.js`, `selectors.js`, `cadence.js`, `actions.js` (all mutations ported from `logic.js`/views plus needs-attention, priority, snooze, parent rule, `recordMeeting` with chips and new topics) | P0 |
| P4 | Recurrence and stats | `domain/recurrence.js`, `stats.js` | P3 |
| P5 | Hybrid suggestions | `domain/suggestions.js` | P3, P4 |
| P6 | Migration, validation and merge | `domain/migrateV1.js`, `migrate.js`, `merge.js` (+ fast-check property tests) | P3, P4 (period keys) |
| P7 | Storage and sync (with fakes) | `storage/idb.js`, `accountStore.js`, `sync/drive.js`, `discovery.js`, `syncEngine.js`, `backups.js`, `locks.js`; `e2e/fakeDrive.js` doubles as a unit fake | P6 |
| P8a | **Cutover, local/trial mode** | `app/store.js`; views ported to selectors/actions; drafts adapter moved to IDB; one-time `oneonone.data` → `migrateV1` → `one-on-one:local`; multi-tab broadcast; conflict banner; read-only banner; **delete `model.js`, `logic.js`, `store.js`, `ui.js`** | P1, P5, P7 |
| P8b | **Cutover, Drive mode (riskiest)** | Boot flow with lastAccount/IDB, discovery + legacy migration + `oneonone.pending`, remote-deleted, sign-out clearing IDB, delete-all, restore-from-file semantics, trial → Drive merge; **delete `storage.js`** | P8a |
| P9 | UX additions on v2 | Needs-attention UI and filter, ★ priority, snooze buttons, meeting-form chips and new-topics field, parent type, stats UI (adherence, missed periods, SVG weekly chart), calendar frequency UI, mobile bottom nav and sticky CTA (CSS) | P8a (P9 can start once P8a lands) |
| P10 | E2E and devices | `playwright.config.js`, `e2e/*.spec.js` with `fakeGis.js`/`fakeDrive.js`; CI e2e job; manual run on Android Chrome, iOS Safari (tab + installed PWA) and desktop with two browsers on one account | P8b, P9 |

P1 and P2 ship user value before the rebuild, and P2's modules (`vcard`, `mapAuthError`, `dateInput`, fonts/CSP) carry over unchanged.

---

## 6. Acceptance criteria

**Shared fixtures:**
- today = 2026-10-08 (Thursday);
- `TZ=Asia/Jerusalem`;
- workdays Sun–Fri;
- `meetingsPerDay` 2;
- default cadence 21 and `staleDays` 21, unless stated otherwise.

"Blind AC-n" means the blind plan's criterion n (`2026-10-08-architect-plan.md` §9), adopted verbatim unless an adaptation is noted.

### P0 Tooling (AC-TL)
1. `npm run check` exits 0. The 13 existing tests pass from their new `js/**` locations, and `tests/` no longer exists.
2. The ESLint Node API run on the snippet `el.innerHTML = x` in virtual file `js/views/x.js` reports `no-restricted-properties`. The same snippet in `js/ui/html.js` reports nothing.
3. A template literal containing `style="width:1px"` in `js/views/x.js` reports an error (active from P2). `import { raw } from '../ui/html.js'` in a view reports `no-restricted-imports`. `js/domain/x.js` importing `../ui/html.js` reports an error.
4. `setHTML(div, '<b>x</b>')` (a plain string) throws `TypeError`. `setHTML(div, html`<b>${'<i>'}</b>`)` yields one `<b>` with text `<i>`.
5. `attr.bool('checked', true)` renders ` checked`, and `false` renders the empty string.
6. Blind AC-49, adapted: the `sw.js` `SHELL` list equals the set of shipped files (`index.html`, `privacy.html`, manifest, `css/`, `js/**/*.js` excluding `*.test.js` and fixtures, `icons/` and `fonts/` from P2).

### P1 Focus-reload bug (AC-F). F1 is written first and must fail on the current code.
1. Bug reproduction (happy-dom, `createApp` with a fake Drive backend whose `currentVersion()` returns a changed version and whose `load()` returns a doc with an extra meeting):
   - render `#/student/s1?meeting=new`;
   - type "סיכום חלקי" into `textarea[name=summary]` via input events, with focus kept;
   - dispatch `window` `focus` and await.

   Expected: the textarea value is still "סיכום חלקי", it is still `document.activeElement`, and the "עודכנו נתונים ממכשיר אחר" banner is visible. **On the current code the value is "", which is the red result.**
2. Continuing F1, submitting the form saves the meeting with summary "סיכום חלקי". After that the deferred render runs, and the remote extra meeting is listed.
3. Same as F1, but the user clicks the topic checkbox `t1` (a local action) instead of focus. The topic is marked done and the summary text survives.
4. Type into the meeting form, then destroy the app instance and create a new one on the same storage. Reopening the form shows the exact text. After a successful save, `drafts.get('meeting:new:s1')` is `undefined`. After "ביטול", the draft is also removed.
5. Notes: type "abc" into the student notes without blurring, then a remote reload happens. The value is still "abc". After 300 ms the debounced save stores `notes === 'abc'`.
6. The edit-meeting form behaves like F1 (draft key `meeting:edit:{mid}`).
7. Regression: typing in the students search keeps focus and caret (the existing `keepFocus` behaviour).
8. The guard doesn't block non-editing renders: with focus on a `<button>`, a remote reload renders immediately.

### P2 Quick wins (AC-Q, plus blind AC-I, AC-A and AC-X)
1. Blind AC-54–60 against `js/import/vcard.js`. AC-58/59 apply with `includePhones`. For the existing `sample.vcf`, the output with `includePhones:false` contains no `parent@example.com`, no `הרצל`, no `031111111` and no phone digits at all. With `true`, `moshe.contacts` is `{studentCell:'0500000001', motherPhone:'0500000001', fatherPhone:'0500000002'}`.
2. Blind AC-65–66 against `nameList.js` (quoted CSV and dedup are new behaviour). The existing name-list tests still pass.
3. The import preview has an unchecked "ייבוא טלפונים (נייד, אמא, אבא)" checkbox. Confirming without it stores students with no phones.
4. Blind AC-50, using `ui/i18n.js`. Also: `mapAuthError({type:'popup_closed'})` → `auth.popupClosed`, an unknown `{error:'xyz'}` → `auth.unknown`, and the message includes "xyz".
5. Sign-out doesn't call `google.accounts.oauth2.revoke` and keeps `oneonone.drive.authorized`. Disconnect calls revoke once and removes it.
6. Setting `2026-10-10` on any `input[type=date]` in any view (schedule, checkup, meeting date, goal due date) gives value `2026-10-11` and announces "שבת אינה אפשרית – הועבר ליום א׳" in the `aria-live` region. `2026-10-09` is unchanged.
7. `index.html` contains the exact CSP string from this plan. No file in the repo references `fonts.googleapis.com` or `fonts.gstatic.com`. `progressBar(0.63)` renders `class="progress-fill mid pct-65"` with no `style` attribute.
8. With no ack, the notices card renders once with both texts. After "הבנתי", a reload doesn't show it again.

### P3 Domain core (blind AC-D, AC-C and AC-K, plus AC-N)
1. Blind AC-1–5. AC-4 applies to the snooze options, and AC-5 to all date-storing actions, including the meeting date and goal `dueDate`.
2. Blind AC-18–23 with cadence 21 and `staleDays` 21. Additionally:
   - `staleDays` is independent of cadence: with `staleDays` 30, a student whose last meeting was 28 days ago is not in `notMetLately`, but their due date is still `2026-10-01`.
3. Blind AC-29–30 with the `planned['next:s1']` id. Additionally:
   - `recordMeeting({type:'parent', date:'2026-10-08'})` for a student with planned next 2026-10-08 leaves the next `planned` and `lastMeetingDate` unchanged;
   - a goal ticked in that parent meeting creates its completion.
4. AC-N1 (tx stamping): every entity the action touches gets `updatedAt` = `max(now, maxSeen + 1ms)` and `by = deviceId`. With `now` = T and `maxSeen` = T+5ms, the result is T+6ms. Untouched entities are reference-equal to the input, and the input doc isn't mutated (`Object.freeze` test).
5. AC-N2: deleting student s1 tombstones s1 and all of its meetings, topics, planned items, personal goals and completions. No tombstone contains `firstName`, `notes`, `summary` or `text`.
6. AC-N3: `setNeedsAttention('s1', true, 'קושי')` stores the flag. `setTopicPriority('t2','high')` persists. Adding a topic "X" with priority high and open topics at orders [1024, 2048] gives X order 512.
7. AC-N4: `snooze('s1','tomorrow')` on 2026-10-09 (Friday) gives `snoozedUntil` 2026-10-11, and `'nextWeek'` on 2026-10-08 gives 2026-10-15. A `regular` meeting clears `snoozedUntil`, and a `parent` meeting doesn't.
8. AC-N5: when a topic move leaves a gap below 1e-6, all of that student's open topics are renumbered at 1024 steps, preserving order.

### P4 Recurrence and stats (blind AC-R and AC-G, plus AC-W)
1. Blind AC-6–17 verbatim. The per-student window is `activeFrom`.
2. AC-W1: `meetingsPerWeek(doc, '2026-10-08')` returns 8 entries, oldest first, from `weekStart` 2026-08-16 to 2026-10-04. A `parent` meeting on 2026-10-06 is not counted.
3. AC-W2: coverage with 23 active students, 17 of whom had a counted meeting within `staleDays` → `{met:17, total:23}`. A student whose only meeting is a parent meeting counts as not met.
4. AC-W3: `goalStats` for an archived goal excludes it. `overall.meanAdherence` averages only non-null adherences: [1, 0.5, null] → 0.75.

### P5 Suggestions (AC-H, replacing blind AC-24–28)

Scenario: capacity 2, cadence 21.
- A: never met.
- B: last met 2026-09-10.
- D: last met 2026-10-03, needs attention, 2 high-priority topics.
- G: last met 2026-09-25.
- E: planned next 2026-10-12.
- F: last met 2026-10-08.
- H: never met, snoozed until 2026-10-11.

1. `suggest(doc, today, 10)` returns, in order:

   | # | Student | Date | Kind | Score |
   |---|---|---|---|---|
   | 1 | A | 10-08 | suggested | 400 |
   | 2 | D | 10-08 | suggested | ≈277.6 |
   | 3 | B | 10-09 | suggested | ≈266.7 |
   | 4 | H | 10-11 | suggested | 400 |
   | 5 | E | 10-12 | scheduled | n/a |
   | 6 | G | 10-16 | suggested | |
   | 7 | F | 10-29 | suggested | |

   No item is dated 10-10.
2. D's reasons include the codes `needsAttention` and `highTopics` with the label "2 נושאים חשובים". A's include `neverMet`.
3. Property test: no item is ever on a Saturday, even when `workdays` includes 6. No date has more than `capacity` items, counting scheduled and checkup items toward that day's load. Shuffling the input order gives the same output.
4. A checkup planned 2026-10-06 for C gives a `checkup` item with `missed:true`, dated 10-06. C also appears as a suggested candidate, as today.

### P6 Migration and merge (AC-MIG, plus blind AC-M and AC-V)

The fixture `js/domain/fixtures/v1-sample.json` is the synthetic v1 doc described in §2.2, with:
- `updatedAt` '2026-10-07T10:00:00.000Z';
- student s1 with home, cell, mother and work phones, an email, an address, `frequencyDays` 14, `nextMeeting` 2026-10-10 10:00, and checkup c1 done in m1;
- topics t1 (order -1, open), t2 (order 1, open) and t3 (done in m1);
- goals:
  - g1: everyone, recurring 30, created 2026-09-01;
  - g2: student once, due 2026-10-01;
  - g3: class recurring 7, created 2026-09-02;
  - g4: recurring custom 10;
- completions:
  - g1/s1 on 09-03, 09-28 and 10-05 (in m1);
  - g3/null on 09-08.

1. `migrateV1(v1)` returns `schemaVersion` 2 and `classes['class-1'].name` 'ט3'. Student s1 has:
   - `contacts {studentCell, motherPhone}` with the right digits and no other phone;
   - `cadenceDays` 14 and `activeFrom` '2026-09-01'.

   `JSON.stringify(doc)` doesn't contain the email, the address, the home number or the work number.
2. Planned items: `planned['next:s1']` has date **'2026-10-11'** (shifted from Saturday), time '10:00' and status planned. `planned.c1` has status done and `linkedMeetingId` 'm1'.
3. Topics:
   - t1: priority high, order 1024;
   - t2: priority normal, order 2048;
   - t3: status done, `doneInMeetingId` m1.

   `meetings.m1.topicIdsDone` is ['t3'].
4. g1 has `rules [{from:'2026-09-01', unit:'month', every:1}]`. The completions are `g1:s1:2026-09-01` (completedOn 09-03) and `g1:s1:2026-10-01` (completedOn 10-05, meetingId m1). `report.collapsedCompletions` is 1, and `meetings.m1.completionIds` contains `g1:s1:2026-10-01`.
5. g3 gives `rules [{from:'2026-09-02', unit:'week', every:1}]` and completion `g3:class:2026-09-06`. g4 gives `{unit:'week', every:1}`, and `report.approximatedGoals` is ['g4'].
6. Every entity has `updatedAt` '2026-10-07T10:00:00.000Z', `by` 'migration-v1' and `deletedAt` null. Two runs with different stubbed `Date.now` and `Math.random`/`randomUUID` give deep-equal outputs. `migrate(migrate(v1))` deep-equals `migrate(v1)`.
7. A completion whose v1 date (2026-08-28) is before goal `createdAt` (2026-09-01) gives `startDate` 2026-08-28 and is not dropped. A completion for a deleted goal is dropped, and `report.orphans` is 1.
8. On the migrated fixture with today 2026-10-08, the student page goal row for g1 shows October done and adherence 100% (1/1). The current period is pending, so it's excluded until done or over.
9. Blind AC-31–36 on v2 docs. AC-35 also applies to `students.notes`, and the conflict id format is as in §2.1. Blind AC-37 is replaced by: two devices setting `next:s1` to 10-12 and 10-14 merge to a single entity with the newer date.
10. Blind AC-38–40 with current = 2. `migrate({schemaVersion:3})` throws `NewerSchemaError`. `validateDoc` rejects a v2 meeting with `date '08/10/2026'` at path `meetings.m1.date`.

### P7 Storage and sync (blind AC-S and AC-B, plus AC-L and AC-Y)
1. Blind AC-41–47 and AC-52 against `syncEngine`/`backups` with the fake Drive. AC-44 is adapted: the copy goes to `גיבויים/data-2026-10-08.json`. AC-52 also treats `backup-2026-09-03.json` as a daily.
2. AC-L1: the fake Drive has only a legacy folder with `one-on-one-data.json` (the v1 fixture) and no appProperties files. First sync makes exactly:
   - 1 `copy` to `pre-migrate-v1-*`;
   - 1 create of `one-on-one-data-v2.json` in the same folder with `appProperties {app, kind:'data'}`;
   - 0 writes to the v1 file.

   Afterwards `meta.legacy.fileId` is set.
3. AC-L2: the v1 file is then modified by an "old client" (adds meeting m9 and edits s1's notes). The next boot sync adds m9 and leaves s1's notes as they were in v2.
4. AC-L3: with `oneonone.pending` holding a v1 doc (`updatedAt` newer, with an extra meeting m8), the migrated doc contains m8, `pending` is removed, and `dirty` is true until upload.
5. AC-L4: two v2 data files found by appProperties → the older is kept, the other is merged in and trashed (blind AC-48).
6. AC-Y1: cached `fileId` returns `trashed:true` with `everSynced` set → status `remote-deleted`, with 0 creates and 0 uploads.
7. AC-Y2: two `createStore` instances share fake-indexeddb, a BroadcastChannel and the in-memory lock. Tab 1 adds meeting a, tab 2 (stale) adds meeting b. The IDB doc contains both, and tab 1 receives `reason:'remote'`.
8. AC-Y3: accounts P1 and P2 use separate DBs. After signing in as P2, P1's students are not readable from P2's store.
9. AC-Y4: a 403 `domainPolicy` from Drive gives status `error` with key `drive.blockedByDomain`. The doc stays dirty.

### P8 Cutover (blind AC-53, AC-69, AC-74, AC-75 and AC-76, plus AC-Z)
1. AC-Z1 (parity): every existing handler in `views/*` has a test that dispatches the equivalent v2 action and renders. The old tests' scenarios (topics add/urgent/reorder, goal toggle, `recordMeeting` side effects, stale order) pass through v2 selectors.
2. AC-Z2 (trial): `localStorage['oneonone.data']` (the v1 fixture) on boot gives the IDB `one-on-one:local` doc equal to `migrateV1(fixture)`, the key is removed, and the dashboard renders s1.
3. AC-Z3 (offline boot): with `lastAccount.permissionId` set and IDB populated, and GIS failing to load, the dashboard renders from IDB and the badge shows `auth-required`/`offline-pending`.
4. Blind AC-74, adapted: the warning appears; afterwards DB `one-on-one:{pid}` is gone; **revoke isn't called**.
5. Blind AC-75, adapted: deletion requires typing exactly "מחק" (other text keeps the button disabled). It calls `PATCH files/{folderId}` with `{trashed:true}` and **no DELETE and no revoke**, clears IDB and `oneonone.*`, and shows the 30-day message.
6. Blind AC-53, plus: restoring a file without topic t2 leaves t2 tombstoned with `updatedAt` ≥ the restore time.
7. Blind AC-76 is extended: every view rendered with all user strings set to `<img src=x onerror=alert(1)>"'` gives `main.querySelectorAll('img,script').length === 0`, and the text appears literally.
8. AC-Z4: a remote doc with `schemaVersion 3` makes `dispatch` throw `ReadOnlyError`, shows the banner, and leaves 0 uploads.
9. AC-Z5: a conflict entry for meeting m1 shows the banner on s1's page. "סגור" sets `dismissedAt`, and the banner is gone after the merge.
10. AC-F1–F8 still pass on the v2 store (the drafts adapter is now IDB).

### P9 UX (AC-U)
1. The student header toggle sets `needsAttention`. The students-list filter shows only flagged students, and the badge "דורש תשומת לב" appears in the suggestion row.
2. ★ toggles `priority` with `aria-pressed` reflecting the state. Blind AC-71 (keyboard reorder and announcement) holds.
3. "לא היום" on a suggested row for A (2026-10-08) removes A from 10-08 and places A on 10-09.
4. In the meeting form, chip "שבוע" plus reason "מבחן" with date 2026-10-03 (Saturday + 7 = 10-10) gives a checkup on **2026-10-11**. A "נושאים לפעם הבאה" value of "א\n\nב" gives 2 new open topics.
5. The meeting type select includes "שיחה עם הורים". Recording one for a never-met student keeps them in "לא נפגשו לאחרונה".
6. The dashboard shows an SVG with 8 `<rect>`, no element has a `style` attribute, and the mean adherence stat equals `overall.meanAdherence`.
7. Changing a goal from monthly to weekly in the edit form on 2026-10-08 appends the rule `{from:'2026-10-01', unit:'week', every:1}` (blind AC-12).
8. Visual check: at 360×740, light and dark, the bottom nav is visible on every route with no horizontal overflow (blind AC-67). The sticky CTA doesn't cover the last list item.

### P10 E2E (Playwright, with fake GIS and Drive)
Blind AC-67, AC-68 (adapted to 3 taps: suggestion "רשום מפגש" → type → "שמור"), AC-69, AC-70, AC-72 and AC-73 (CSP string and network allowlist). Plus:
- an e2e version of AC-F1 using a second page that writes to the fake Drive while the first page has typed text, followed by a `focus` event;
- a two-context test (two "devices") that edits different students offline, then reconnects, and both converge.

---

## 7. Risks

1. **An old-code tab open across the deploy.** Old `normalizeData` would turn v2 maps into `[]` and could upload an empty doc. This is the reason v2 lives in a **new file** and the v1 file is never touched (AC-L1/L2). The residual risk: edits made by the old tab after migration reach v2 only as add-only (edits to existing entities are lost, but stay in the v1 file).
2. **Migration is lossy by design:**
   - Rolling → calendar changes what users see.
   - Collapsed completions are counted, not kept.
   - Custom frequencies are approximated.
   - Dropped address, email and home/work phones are gone from v2. They **remain in `pre-migrate-v1-*` and old daily backups** until retention prunes them.
   - The pre-migrate copy is the rollback path: a restore from file accepts v1.
3. **The P8b cutover is the largest and riskiest step:** boot, auth, discovery and legacy all change at once. Mitigation: P7 is fully tested against fakes first, P8a ships the views on v2 in trial mode before Drive is touched, and devices are tested manually before release.
4. **`drive.file` and appProperties.** I'm assuming `files.list` with an `appProperties` query and `PATCH {trashed:true}` on the app-created folder both work under `drive.file`. I believe they do, but I didn't verify against the live API; confirm in P8b on a real account.
5. **Delete-all is trash, not delete.** A device that is offline at the time keeps its local copy until it syncs and sees `remote-deleted`. The banner makes the user choose; nothing is re-uploaded silently.
6. **GIS on iOS standalone** is unchanged from today ("first tap reconnects"). Still verify on a device.
7. **Clock skew and the no-If-Match race** are as in blind §4.4, covered by the property tests and the two-context e2e.
8. **Strict typecheck** applies only to the new layers. Views stay non-strict, a known gap.
9. **Tests next to code ship to Pages** (synthetic fixtures only). This is harmless, but the SW list must exclude them (AC-TL6).

## 8. Decisions needed from the user

1. **`staleDays`:** keep it as a separate setting (my default, so no regression), or drop it in favour of per-student cadence as the blind plan suggested?
2. **Sign-out clears this device's local copy** after a dirty-check warning. That's my default, for shared school computers. The alternative is to keep it for faster re-entry.
3. **"פעם במחצית" mapping:** month/5 from the goal start (my default; it drifts across school years), or a new unit aligned to the school halves (Sept–Jan, Feb–Jun)?
4. **Old backups that contain address/email:** let retention prune them (the default: dailies are pruned per the 14-daily/12-monthly rules, `pre-migrate` after 5 newer snapshots), or scrub them actively after migration?
5. **Needs-attention makes the student eligible today**, not just a score boost. Confirm.
6. **"All date inputs" includes the meeting date:** a past meeting can't be recorded as a Saturday, and the ש׳ workday checkbox is removed. Confirm.
7. **Trial → Drive when Drive already has data:** merge both (my default, with a confirm) instead of today's silent "Drive wins".
8. **Out of scope this round unless you say otherwise:**
   - re-import "missing students → deactivate" (G11);
   - restore from the Drive backups list (only restore from file is kept);
   - the meeting form as a bottom sheet (the inline form plus sticky CTA instead);
   - median gap stat.
