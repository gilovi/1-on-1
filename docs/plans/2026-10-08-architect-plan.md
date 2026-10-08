# Architect Plan: "1-on-1" (blind, independent design)

> Produced by the **architect** agent in a blind exercise: it read only `2026-10-08-thinker-spec.md`, not the existing code. Saved verbatim for comparison with the implementation.

**Input read:** only `docs/plans/2026-10-08-thinker-spec.md`. I read no other repo files, as instructed. I did no web research, so the Google API behaviour described here comes from my own knowledge and is flagged where it matters.

All dates in examples are relative to **today = 2026-10-08, a Thursday**. So 2026-10-04 is a Sunday, 2026-10-10 a Saturday and 2026-10-11 a Sunday.

---

## 1. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **None.** Vanilla ES modules plus a tiny DOM builder `h(tag, props, ...children)` that only ever uses `textContent` and `setAttribute`, never `innerHTML` with data. | GitHub Pages serves files as-is. About 8 screens with small data don't need a framework. Not having one means no CDN and no supply chain in the shipped bundle, which suits minors' data. `h()` makes XSS from student notes impossible by construction. |
| Build step | **None for shipping.** The repo root *is* the site. Dev-only tooling sits in `package.json` (devDependencies) and never ships. | No deploy pipeline to break, and Pages serves the branch directly. The service-worker precache list is maintained by hand and checked by a test (AC-S4). |
| Typing | **JSDoc + `tsc --noEmit` with `checkJs`, `strict`**. Shared types live in `js/types.d.ts`. | You get type safety without compiling. |
| Unit tests | **Vitest** (native ESM) with `happy-dom` for the few DOM tests and `fake-indexeddb` for storage. | Fast and needs no config for plain ESM. |
| E2E | **Playwright**: Chromium mobile 360×740, WebKit (a stand-in for iOS Safari), Firefox. Drive and GIS are stubbed with `page.route` plus an injected fake `google.accounts.oauth2`. | Proves RTL, offline, 3-tap and network-allowlist behaviour. |
| Lint | ESLint flat config (`no-restricted-properties` bans `innerHTML`/`outerHTML`/`insertAdjacentHTML`), plus Prettier. | Keeps the XSS rule enforced. |
| Scripts | `npm run typecheck`, `lint`, `test`, `e2e`, and `check` (all of them). A GitHub Actions workflow runs `check` on every push. Pages deploys from the branch. | Required by the user's global rules. |
| Google libs | GIS `https://accounts.google.com/gsi/client` only. **No gapi.** Drive REST calls go through `fetch`. | gapi needs `apis.google.com` and looser CSP. `fetch` is enough. |

**Alternative considered:** Vite + Preact + TypeScript, deployed through Actions. It's more ergonomic for forms, but it adds a build pipeline and a dependency tree, and there's a deploy step that can fail silently. **Rejected:** the app's complexity lives in the pure domain logic, not in rendering.

---

## 2. Folder structure

Tests sit next to code as `*.test.js`.

```
/index.html               shell, meta CSP, <html lang="he" dir="rtl">
/privacy.html             static privacy policy (needed for OAuth verification)
/manifest.webmanifest     name "1-on-1 – פגישות אישיות", start_url/scope "/1-on-1/"
/sw.js                    service worker (at root so scope = /1-on-1/)
/icons/  /fonts/          self-hosted (e.g. Assistant/Heebo woff2)
/css/app.css              logical properties only
/js/
  main.js                 boot: open account cache → render → auth → sync
  config.js               CLIENT_ID, SCOPE, APP_ID, SCHEMA_VERSION, constants
  types.d.ts
  domain/                 PURE, no DOM, no I/O, `today`/`now` injected
    dates.js              LocalDate math ('YYYY-MM-DD'), weekStart, isSaturday, shiftOffSaturday
    ids.js                newId(), completionId()
    schema.js             factories, validateDoc(), emptyDoc()
    migrations.js         migrate(doc) with ordered steps
    actions.js            all mutations: (doc, payload, ctx) → {doc, changed[]}
    recurrence.js         periods(), periodStatus(), adherence()
    cadence.js            lastMeeting(), daysSince(), dueDate(), isStale(), notMetLately()
    suggestions.js        scoreStudent(), suggest()
    stats.js              goalStats(), overallStats(), coverage()
    merge.js              mergeDocs(a, b)
  import/
    vcard.js  csv.js  pasteList.js  names.js (normalize)  match.js (re-import preview)  phones.js
  storage/
    idb.js                thin promise wrapper
    accountStore.js       per-account DB: doc, meta, drafts
  sync/
    auth.js               GIS token client wrapper + error mapping
    drive.js              REST: find/create/download/upload/copy/list/delete
    syncEngine.js         pull-merge-push state machine
    backups.js            daily snapshot + retentionPlan()
  ui/
    h.js  router.js  store.js  format.js (dates, phones, Hebrew day names)
    i18n/he.js            all strings
    components/           sheet, chips, syncBadge, reorderList, confirmDialog, toast
    views/                landing, onboarding, dashboard, students, student, recordMeeting,
                          goals, goalDetail, import, settings
/e2e/                     Playwright specs + fakes (fakeDrive.js, fakeGis.js)
```

Rule: `domain/` and `import/` never import from `ui/`, `storage/` or `sync/`. A lint rule (`no-restricted-imports`) enforces this.

---

## 3. Data schema (single `data.json`, schemaVersion 1)

**Conventions**
- Collections are **maps keyed by id**, not arrays. This makes merge O(n) and order-free.
- `id` comes from `crypto.randomUUID()`. Completions use a **deterministic id** (see below).
- Calendar dates are `LocalDate` strings `'YYYY-MM-DD'` with no time zone. Instants are ISO UTC with ms (`'2026-10-08T09:12:33.120Z'`).
- Every entity has `createdAt`, `updatedAt`, `by` (deviceId) and `deletedAt` (null or ISO).
- **Tombstone:** `deletedAt` is set and content fields are stripped. Only `id`, the timestamps, `by` and the foreign keys stay, so a deleted meeting's text doesn't persist. MVP keeps tombstones forever; they're tiny.
- `updatedAt` is generated as `max(Date.now(), maxUpdatedAtSeenInDoc + 1ms)`. This is a cheap guard against a device whose clock lags.

```json
{
  "app": "one-on-one",
  "schemaVersion": 1,
  "createdAt": "2026-09-01T07:00:00.000Z",
  "settings": { "id": "settings", "updatedAt": "…", "by": "dev-a",
    "defaultCadenceDays": 21, "suggestionsCount": 5, "showHebrewDates": false,
    "activeClassId": "c1", "noticesAck": { "privacy": "…", "reporting": "…" } },
  "classes":  { "c1": { "id": "c1", "name": "ט3", "schoolName": "…", "schoolYear": "תשפ״ז",
                "archived": false, "createdAt": "…", "updatedAt": "…", "by": "…", "deletedAt": null } },
  "students": { "s1": { "id": "s1", "classId": "c1", "firstName": "יוסי", "lastName": "כהן",
                "displayName": "יוסי כהן", "cadenceDays": null,
                "needsAttention": { "flag": false, "reason": "" },
                "contacts": null,
                "active": true, "activeFrom": "2026-09-01", "inactiveFrom": null,
                "source": { "importId": "imp1", "externalKey": "יוסי כהן" }, "…common": "" } },
  "meetings": { "m1": { "id": "m1", "studentId": "s1", "date": "2026-10-06",
                "type": "regular", "summary": "…", "topicIds": ["t1"],
                "completionIds": ["g1:s1:2026-10-01"], "…common": "" } },
  "planned":  { "p1": { "id": "p1", "studentId": "s1", "date": "2026-10-13", "kind": "checkup",
                "reason": "…", "status": "planned", "linkedMeetingId": null, "…common": "" } },
  "topics":   { "t1": { "id": "t1", "studentId": "s1", "text": "…", "order": 1024,
                "priority": "high", "status": "open", "doneAt": null, "doneInMeetingId": null } },
  "goals":    { "g1": { "id": "g1", "title": "…", "description": "", "scope": "everyone",
                "owner": "teacher", "classId": "c1", "studentId": null,
                "kind": "recurring",
                "rules": [ { "from": "2026-10-01", "unit": "month", "every": 1 } ],
                "startDate": "2026-10-01", "endDate": null, "dueDate": null,
                "status": "active" } },
  "completions": { "g1:s1:2026-10-01": { "id": "g1:s1:2026-10-01", "goalId": "g1",
                "subject": "s1", "periodKey": "2026-10-01", "completedOn": "2026-10-06",
                "meetingId": "m1", "note": "" } },
  "conflicts": [ { "at": "…", "entity": "meetings", "id": "m1", "lostSummary": "…", "lostUpdatedAt": "…" } ]
}
```

**Fields and rules**
- `contacts` is null unless the teacher opts in. When present, its only allowed keys are `studentCell`, `motherPhone` and `fatherPhone`.
- `subject` on a completion is a studentId, or `'class'` for class-scope goals.
- `periodKey` is the period start date for recurring goals, or `'once'` for one-time goals.
- **Completion id** = `${goalId}:${subject}:${periodKey}`. Two devices ticking the same box produce the same id, so the merge collapses them naturally. Unticking writes a tombstone; re-ticking revives the same id with a newer `updatedAt`.
- **Topic order** is a float. A move sets it to the midpoint of its new neighbours. If a gap drops below 1e-6, all topics for that student are renumbered at 1024 steps (one action, many changed entities).
- **Goal `status`** is stored as `active | dropped | ended`. "Achieved" and "overdue" for one-time goals are **derived** from completions.
- **Recurrence `rules[]`** are segments. A frequency edit appends a segment (see 5.1). `unit` is `week | month`, and `every` is ≥1 (weekly = week/1, biweekly = week/2).
- **Meeting `type`** is `regular | checkup | adhoc | parent`. Planned `kind` is `next | checkup`. The "at most one live `next` per student" rule is enforced in `actions.js`. If a merge produces two, the newest `updatedAt` wins and the other is set to `cancelled`; this is part of the post-merge normalization.

**Migrations:** `migrations = [ {to: 2, up(doc)}, … ]`. `migrate(doc)` applies the steps in order and is pure. If `doc.schemaVersion > SCHEMA_VERSION`, the app opens **read-only**, with a "רענן לגרסה החדשה" banner and no uploads. Before the first upload of a migrated doc, the app writes a backup named `backups/data-pre-migrate-v{n}-{ts}.json`.

**Size check:** 35 students × 3 years × ~40 meetings × ~600 bytes comes to about 2.5 MB at worst. That's acceptable. Splitting by school year is deferred to Phase 2 along with year rollover.

---

## 4. Storage and sync

### 4.1 Drive layout (scope `drive.file` only)

```
My Drive/1-on-1/                 folder, appProperties {app:'one-on-one', kind:'root'}
   data.json                     appProperties {app:'one-on-one', kind:'data'}
   backups/                      appProperties {kind:'backups'}
      data-2026-10-08.json
      data-pre-restore-2026-10-08T10-12-00Z.json
```

**Discovery** (works on a new device, because `drive.file` exposes files this OAuth client created):
1. Call `files.list` with `q = "appProperties has { key='app' and value='one-on-one' } and appProperties has { key='kind' and value='data' } and trashed=false"` and `fields = files(id,parents,version,createdTime)`.
2. If there are 0 results, create the folder, `data.json` and `backups/`.
3. If there is more than 1 (two devices raced through first run), keep the oldest `createdTime`, merge in the others, then trash them.

The cached `fileId`/`folderId` is used first. Discovery runs only on a 404.

**Calls**
- **Download:** `GET /drive/v3/files/{id}?alt=media`
- **Metadata:** `GET /drive/v3/files/{id}?fields=version,modifiedTime,headRevisionId,trashed`
- **Upload:** `PATCH /upload/drive/v3/files/{id}?uploadType=media` with `Content-Type: application/json`, returning `fields=version`
- **Create:** multipart upload
- **Backup:** `POST /drive/v3/files/{id}/copy` with `{name, parents:[backupsId], appProperties}`. This is server-side, so no re-upload is needed.
- **Account key:** `GET /drive/v3/about?fields=user(emailAddress,displayName,permissionId)`

### 4.2 GIS token lifecycle (`sync/auth.js`)

```js
/** @returns {{ getToken(opts?:{interactive?:boolean}):Promise<string>, invalidate():void,
 *   state: 'none'|'valid'|'expired'|'needs-gesture'|'blocked', signOut():void, disconnect():Promise<void> }} */
```

- `initTokenClient({client_id, scope: DRIVE_FILE, callback, error_callback})`. Each request passes `hint: lastAccount.email` and `prompt: ''`. The very first sign-in passes `prompt: 'consent'`.
- The token is kept **in memory only**, with `expiresAt = now + expires_in*1000`. It is renewed proactively when fewer than 5 minutes remain, and once on any 401.
- **Important correction to spec §9.6:** the GIS token model has no truly silent renewal. `requestAccessToken` opens a popup, which closes automatically when consent already exists, and **browsers block it outside a user gesture**, Safari in particular. So:
  - On boot, try a non-gesture request. If `popup_failed_to_open` comes back or nothing returns within 8 s, set `state = 'needs-gesture'`.
  - In `needs-gesture` state, the **first user click anywhere** (a capture-phase listener on `document`) calls `requestAccessToken` inside that gesture. The sync badge also shows "לחץ להתחברות מחדש".
  - Local editing is never blocked by auth state.
- After each grant, check `google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_FILE)`. Granular consent lets the user untick Drive. If that happens, the app shows `auth.scopeNotGranted`.
- **Error mapping** (pure function `mapAuthError(e) → messageKey`):

| Input | Key | Hebrew guidance (summary) |
|---|---|---|
| `admin_policy_enforced` | `auth.blockedByAdmin` | "חשבון בית הספר חוסם אפליקציות חיצוניות. התחבר עם Gmail אישי או פנה למנהל המערכת" |
| `access_denied` | `auth.denied` | consent was declined, retry button |
| `popup_failed_to_open` | `auth.popupBlocked` | "אפשר חלונות קופצים / לחץ שוב" |
| `popup_closed` | `auth.popupClosed` | quiet; retry button |
| scope not granted | `auth.scopeNotGranted` | explains the Drive checkbox |
| Drive 403 `reason: domainPolicy` / `appNotAuthorizedToFile` | `drive.blockedByDomain` | same Workspace guidance |
| Drive 403 `storageQuotaExceeded` | `drive.quota` | |
| Anything else | `auth.unknown` | includes the raw code for support |

- **Sign out** clears local state but **does not revoke**, so the next sign-in is one click. A separate setting, "נתק את האפליקציה מחשבון Google", calls `google.accounts.oauth2.revoke`.

### 4.3 Local cache (`storage/accountStore.js`)

- **localStorage** `oneOnOne.lastAccount = {permissionId, email}`. This lets the app open the right cache before any token exists.
- **IndexedDB** database `one-on-one:{permissionId}` with these stores:
  - `kv`, holding:
    - `doc`: the full current doc
    - `meta`: `{fileId, folderId, backupsId, remoteVersion, lastSyncAt, dirty, editSeq, deviceId, readOnly}`
    - `lastBackupDate`
  - `drafts`: key `meeting:{studentId}` → the form fields plus `savedAt`
- Every action writes `doc` and `meta.dirty = true, editSeq++` to IDB **immediately**, with no debounce. That makes IDB the durable "queue".

### 4.4 Sync engine (state-based, no op log)

I deliberately replace the spec's "offline queue" with **dirty-state plus merge**. The merge is convergent, so replaying ops is unnecessary.

```
sync():                                  // serialized by navigator.locks.request('sync:'+account)
  if readOnly → return
  token = auth.getToken()                // may throw NeedsGesture → status 'auth-required'
  seq0 = meta.editSeq; local = doc
  m = drive.meta(fileId)
  if m.version != meta.remoteVersion:
      remote = migrate(drive.download(fileId))
      if remote.schemaVersion > SCHEMA_VERSION → readOnly=true; status 'newer-version'; return
      merged = mergeDocs(local, remote)
      needUpload = canonical(merged) != canonical(remote)
  else:
      merged = local; needUpload = meta.dirty
  if needUpload:
      backups.ensureDaily(today)         // copy current remote data.json BEFORE overwriting
      v = drive.upload(fileId, merged).version
  else v = m.version
  if meta.editSeq == seq0: doc = merged; dirty=false
  else: doc = mergeDocs(currentLocal, merged); dirty = true   // edits arrived mid-sync
  meta.remoteVersion = v; lastSyncAt = now
```

**Triggers**
- 1500 ms after the last action (debounced)
- `visibilitychange → hidden` (best effort; the data is already safe in IDB)
- `online` event
- `focus` / `visibilitychange → visible`
- Every 60 s while visible
- After token acquisition

**Badge states:** `saved | saving | offline-pending | auth-required | error | read-only`.

**Race window:** Drive v3 has no reliable conditional (If-Match) upload, so a write from device B can land between A's metadata check and A's upload. Losses still self-heal: B keeps its entities locally, its next pull sees a changed version, merges, and finds `merged ≠ remote`, so it re-uploads. Because merge is commutative, associative and idempotent, every device converges.

**Retries:**
- 401: invalidate the token, re-acquire once, retry once.
- 429 or 5xx: exponential backoff (2 s, 4 s, 8 s up to 60 s, with jitter).
- `fetch` TypeError: status `offline`.

**Multiple tabs:** a `BroadcastChannel('one-on-one')` broadcasts `doc-changed`, and other tabs reload the doc from IDB. `navigator.locks` keeps sync to one tab at a time.

### 4.5 Merge (`domain/merge.js`)

`mergeDocs(a, b)` works collection by collection over the union of ids:
- If an id exists on only one side, take that side's entity.
- If it exists on both, the winner is the higher `updatedAt`. Ties go to the higher `by` (string compare), then to the canonical JSON (string compare). That makes the result deterministic and order-independent.
- Tombstones are ordinary entities: a delete wins only if it's newer, and an edit after a delete revives the entity.
- `settings` is a single LWW entity.
- `conflicts` is the union by `(id, lostUpdatedAt)`, sorted and capped at 200.

**Meeting protection:** if both sides have the same meeting live, with different `summary` and different `updatedAt`, the losing summary is appended to `conflicts`. The UI shows a banner on the student page: "נמצאה גרסה נוספת של סיכום — הצג". The spec's "never lose a meeting summary" therefore holds even for same-meeting edits.

**Post-merge normalization:** this enforces the single-`next` rule. It is deterministic, so it doesn't break commutativity.

### 4.6 Backups and retention (`sync/backups.js`)

- **`ensureDaily(today)`:** if `lastBackupDate != today` and `backups/data-{today}.json` doesn't exist, copy the *pre-upload remote* `data.json` there.
- **`retentionPlan(files, today) → {keep[], delete[]}`** is a pure function. It keeps:
  - the 14 most recent daily backups;
  - the earliest daily backup of each of the last 12 calendar months, including the current one;
  - the 5 most recent `pre-restore`/`pre-migrate` files.

  Everything else is deleted. Retention runs at most once a day, after the daily backup.
- **Restore:** list the backups, download the chosen file, validate and migrate it, and show counts (students, meetings, goals). Then write a `pre-restore` backup and replace the doc. The restored doc gets every entity re-stamped `updatedAt = now`, so other devices don't merge it away.
- **JSON import** uses the same path, with `validateDoc` (a hand-written validator; no library).

---

## 5. Core algorithms (all pure; `today: LocalDate` injected)

### 5.1 Recurrence periods and status (`recurrence.js`)

- **`periods(goal, subjectWindow, today) → Period[]`**, where `Period = {key, start, end}` and both bounds are inclusive.
  - **Segment** *i* covers `[rules[i].from, rules[i+1].from − 1]`, and the last segment runs to `min(goal.endDate, today's period end)`.
  - **Week units:** the anchor is the Sunday on or before `rule.from`. Periods are `[anchor + k·7·every, anchor + (k+1)·7·every − 1]`.
  - **Month units:** periods are calendar months stepped by `every` from the month containing `rule.from`.
  - Every period is **clipped** to `[max(goal.startDate, segment.from, subjectWindow.from), min(segment.end, goal.endDate, subjectWindow.to)]`. Clipped periods that come out empty are discarded.
  - `key` = the clipped start, which keeps completion ids stable.
- **Subject window:**
  - `everyone` scope: `[student.activeFrom, student.inactiveFrom − 1 or ∞]`
  - `student` scope: the student's window
  - `class` scope: unbounded
- **`periodStatus`:** `done` if a live completion exists with that `periodKey`. Otherwise `pending` if `start ≤ today ≤ end`, `missed` if `end < today`, or `future` beyond that (not generated).
- **Ticking** creates the completion with `periodKey = key of the period containing completedOn`. `completedOn` is the meeting date when ticked from a meeting form, otherwise today. A meeting back-dated to Oct 30 and recorded on Nov 1 therefore completes October.
- **`adherence = done / (done + missed)`.** A pending current period is excluded until it's done or over. With no counted periods the result is `null`, displayed as "—".
- **Frequency edit on date E:**
  1. Let P be the old rule's period containing E.
  2. Append `{from: P.start, unit, every}`.
  3. Completions keyed to P.start stay valid, because the new segment's first period starts at P.start.

  Past periods keep their keys, and so their status. **Assumption:** a new segment at `from = X` re-anchors weeks to the Sunday on or before X and months to X's month, with clipping.
- **One-time goals:** `achieved` if a live completion `periodKey='once'` exists for the subject. Else `overdue` if `dueDate < today`, else `open`. For `everyone`, this is computed per active student.
- **Dropped goals** are excluded from all statistics and suggestions. **Deleting a goal** tombstones the goal and all of its completions.

### 5.2 Cadence and due dates (`cadence.js`)

- **`countedMeetings(student)`** are live meetings with `type ≠ 'parent'`. This is my pushback: a parent meeting is not a 1-on-1 with the student.
- **`lastMeetingDate`** is the max `date` among counted meetings, or null.
- **`daysSince`** is the calendar-day difference `today − last`, or null if the student has never been met.
- **Effective cadence** is `student.cadenceDays ?? settings.defaultCadenceDays`.
- **`isStale`** is true if the student was never met or `daysSince > cadence`. I drop the separate `staleThresholdDays` setting (pushback below).
- **`dueDate`**, in order of precedence:
  1. the live planned `next` with status `planned`;
  2. `shiftOffSaturday(last + cadence)`;
  3. `today`, if never met.
- **`notMetLately`:** active and stale students in the active class. Never-met students come first, ordered by name (`Intl.Collator('he')`), then by `daysSince` descending, then by name.
- **`shiftOffSaturday(d)`:** if `d` is a Saturday, return `d + 1`. Every planned-date setter goes through it: actions, Postpone and the date pickers.

### 5.3 Suggestions (`suggestions.js`)

**Eligibility:**
- The student is active and in the active class.
- They were not met today.
- They are **not snoozed**: there's no live planned `next` with `date > today`.

**Score:** the sum of these components. Each one that applies emits a reason chip.

| Component | Points | Reason chip (he) |
|---|---|---|
| Most urgent live planned item (`next` or `checkup`, status `planned`): overdue by d days | `1000 + 10·min(d,30)` | "פגישת מעקב באיחור של d ימים" / "פגישה מתוכננת באיחור" |
| …dated today | `800` | "מתוכנן להיום" |
| Never met | `400` | "טרם נפגשתם" |
| Otherwise, overdue ratio r = daysSince / cadence | `200·min(r,3)` | shown only if r ≥ 1: "{daysSince} ימים מאז הפגישה האחרונה" |
| Needs attention flag | `150` | "דורש תשומת לב" |
| Open high-priority topics (n) | `40·min(n,3)` | "{n} נושאים חשובים" |
| Goal work (count k): recurring student/everyone goal pending with ≤ 3 days to period end, or an overdue one-time goal | `30·min(k,3)` | "{k} יעדים ממתינים" |

- **Order:** score descending, then `daysSince` descending (never-met counts as +∞), then by name, then by id. Take the top `suggestionsCount`.
- **Output:** `{studentId, score, reasons: [{code, label, points}] sorted by points desc}`. The UI shows the top 3 chips.
- **Postpone:**
  - "מחר" → `shiftOffSaturday(today + 1)`
  - "שבוע הבא" → `shiftOffSaturday(today + 7)`

  Either option upserts the planned `next`, which also snoozes the student.

### 5.4 Record meeting action (`actions.recordMeeting(doc, input, ctx)`)

The input is `{studentId, date, type, summary, topicIdsDone[], goalTicks[{goalId}], checkupInDays?, checkupReason?, newTopics[]}`. One action, applied atomically:

1. Create the meeting.
2. Set each ticked topic to `status='done', doneAt=now, doneInMeetingId`.
3. Upsert a completion for each goal tick (periodKey from `date`), with `meetingId`.
4. If a live planned `next` exists with `date ≤ input.date`, set it to `status='done'` and `linkedMeetingId`. Planned checkups on or before the date are handled the same way, but only when `type = 'checkup'`.
5. If `checkupInDays` is set, create a checkup dated `shiftOffSaturday(date + n)`.
6. Create the new topics, appended at `max(order) + 1024`, priority normal.
7. Delete the draft (done by the UI after the action succeeds).

### 5.5 Statistics (`stats.js`)

- **Per goal:**
  - Once/student: `achieved | open | overdue`.
  - Once/everyone: `{done, total: active students in class, pct, openStudents[]}`.
  - Recurring/student or class: adherence plus current-period status.
  - Recurring/everyone: per-student adherence, a mean adherence across students, and "current period: x/N done".
  - Class/once: status.
- **Overall:**
  - Active goals counted by `scope × owner`.
  - One-time completions with `completedOn` in the current month, and in the current school year (Sept 1 to Aug 31, containing today).
  - Mean adherence over active recurring goals with non-null adherence.
- **Coverage:** `{met: active students with daysSince ≤ cadence, total: active}`, rendered as "17/23 נפגשו במחזור האחרון".
- **Meetings per week:** counted meetings for the 8 Sunday-start weeks ending with the current (partial) week. The result is an array of 8 `{weekStart, count}`, oldest first.
- **Median gap:** for each student, sort the counted meeting dates and take consecutive gaps in days, keeping only gaps whose later meeting falls within the last 365 days. The result is the median of all such gaps (the mean of the two middle values when the count is even), or null if there are none.
- **Per student:** meeting count, last date, and the list of goals with their status and adherence.
- **Performance:** a selector cache keyed by `doc` identity. Every action yields a new doc object, and all derivations run once per change.

---

## 6. UI architecture

- **Routing:** hash routes, because Pages has no SPA fallback and hash routes work offline from the SW:
  - `#/` dashboard, `#/students`, `#/student/:id`, `#/student/:id/record`
  - `#/goals`, `#/goals/:id`, `#/import`, `#/settings`, `#/welcome`
- **State:** `ui/store.js` holds `{doc, meta, syncStatus, authState}`. `dispatch(actionName, payload)` calls the pure action, persists to IDB, broadcasts, schedules sync and notifies subscribers. There's no other mutable global state.
- **Rendering:** each view is `render(state, params) → Node`. When the store changes, the router re-renders the *current view region*.
  - **Forms are uncontrolled and exempt.** An open sheet or dialog isn't re-rendered by store updates; it reads from the store only on open and on submit. This prevents focus or text loss during background sync.
  - **Meeting drafts** are written to IDB `drafts` on every `input` event (debounced 300 ms) and restored when the form reopens. This satisfies "token expiry never loses typed text", and survives a reload or crash.
- **Mobile:** the record form is a bottom sheet (`<dialog>` styled as a sheet) on narrow screens and a modal at ≥768 px. "רשום פגישה" is a sticky CTA. Dashboard suggestion → "רשום פגישה" → type summary → "שמור" is 3 taps.
- **RTL:**
  - `<html lang="he" dir="rtl">`, logical CSS properties (`margin-inline-start` and so on), and `dir="auto"` on every user-text input and display node.
  - Directional icons are mirrored with `:dir(rtl) .icon-dir { transform: scaleX(-1) }`.
  - Dates are formatted `dd/mm/yyyy` with day names from a fixed list (יום א׳ to שבת).
  - Hebrew dates come from `Intl.DateTimeFormat('he-u-ca-hebrew')`. It's free, so the toggle can ship in the MVP.
- **Date inputs:** native `<input type="date">` **cannot disable weekdays**. On change, a Saturday is shifted to Sunday and the app announces "שבת אינה אפשרית — הועבר ליום א׳" through `aria-live`. The domain layer also enforces this.
- **Accessibility:**
  - Every control has a label.
  - Each topic has "הזז למעלה/למטה" buttons, with an `aria-live` announcement such as "הועבר למקום 2 מתוך 5". Drag uses Pointer Events, and the buttons are the accessible path.
  - Focus is trapped in dialogs and returned on close. Contrast is ≥ 4.5:1, and touch targets are ≥ 44 px.
- **PWA / service worker (`sw.js`):**
  - `const VERSION = '…'` and `PRECACHE = [...]`, listing every shell file.
  - Shell requests are cache-first. Requests to `googleapis.com`/`accounts.google.com` are network-only and never cached; the GIS script is not cached either, and the app boots without it.
  - On a new version, the SW waits and shows a toast, "גרסה חדשה זמינה — רענן". Clicking it posts `SKIP_WAITING`.
  - The manifest uses `scope`/`start_url` `/1-on-1/`, `dir: rtl`, `lang: he`, and 192/512/maskable icons.

---

## 7. Security and privacy

- **Meta CSP** in `index.html` (and the equivalent in `privacy.html`):

  ```
  default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client;
  connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/;
  frame-src https://accounts.google.com/gsi/; style-src 'self' https://accounts.google.com/gsi/style;
  img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'
  ```

  - There is no `unsafe-inline` or `unsafe-eval`.
  - `frame-ancestors` can't be set by meta; that's a documented limitation of GitHub Pages.
  - `tel:` and `https://wa.me/` are navigations, not fetches, so they aren't governed by connect-src.
- **Import minimization:**
  - The parser *output type* has no fields for ADR, EMAIL or HOME phone; they're dropped during parsing, not filtered later.
  - Phones are copied into `contacts` only when the "ייבא טלפונים" checkbox is ticked.
  - Files are read with `FileReader` and never uploaded or stored.
- **No third parties:** no analytics or error reporting, self-hosted fonts.
- **Sign-out:**
  - If `meta.dirty` is true, try one sync first. If it still fails, show "יש שינויים שלא נשמרו ב-Drive — לצאת בכל זאת?".
  - Then delete the IDB database `one-on-one:{permissionId}` and the localStorage keys, drop the in-memory token and `google.accounts.id.disableAutoSelect()` if used, and go to `#/welcome`.
- **Delete all data:** the user must type "מחק" to confirm. The app then calls `files.delete(folderId)`, which permanently deletes the descendants the user owns, then revokes the token, clears local data and shows instructions for myaccount.google.com.
- **Notices:**
  - The first-run privacy and mandatory-reporting notices are acknowledged into `settings.noticesAck`.
  - A share warning appears next to "פתח ב-Drive".
- **Blocked Workspace:** handled with the mapping in §4.2. The landing page proactively says "מומלץ חשבון Gmail אישי".

---

## 8. Phased implementation

Each phase leaves `npm run check` green.

| # | Phase | Files | Verify |
|---|---|---|---|
| 0 | Tooling | `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.js`, `playwright.config.js`, `.github/workflows/check.yml` | `npm run check` passes on empty test suites |
| 1 | Domain core, TDD | `domain/dates, ids, schema, actions, recurrence, cadence, suggestions, stats, merge, migrations` | AC-D*, AC-R*, AC-C*, AC-G*, AC-T*, AC-M* green; merge property tests (fast-check, dev-only) |
| 2 | Import, TDD | `import/*` | AC-I* green with synthetic fixtures in `js/import/fixtures/` |
| 3 | Local-only app shell | `ui/*`, `storage/*`, `index.html`, `css/` | Dev flag `?local=1` runs the full UI on IDB only; Playwright RTL, 3-tap and draft ACs |
| 4 | **Auth + Drive + sync (riskiest)** | `sync/*` | AC-S*, AC-A* against fakes; then **manual test on real devices**: Android Chrome, iOS Safari (installed PWA and tab), desktop |
| 5 | PWA, CSP, privacy page, onboarding, notices | `sw.js`, manifest, `privacy.html`, `views/welcome, onboarding` | AC-P*, AC-X*; Lighthouse installable |
| 6 | Settings: export, restore, delete all, sign-out | `views/settings`, `sync/backups.js` | AC-B*, AC-X3/4 |
| 7 | Google Cloud publishing | (console) | Brand verification passes; new account sees no "unverified" screen |

Phases 1 and 2 can run in parallel. Phase 3 depends on 1. Phase 4 depends on 1 and 3.

### Spec decisions I'd push back on

1. **"Silent token renewal"** isn't silent in the GIS token model: it's a popup that needs a user gesture, especially on Safari. Plan for "first tap reconnects" and say so in the onboarding copy. A code-flow-with-refresh-token design needs a backend, which is out of scope.
2. **"Offline queue"**: replace it with persisted dirty state plus convergent merge. It's simpler, and there's no replay ordering to get wrong.
3. **Parent meetings shouldn't reset staleness.**
4. **`staleThresholdDays` is redundant** with per-student cadence. Drop it, or make it a multiplier later.
5. **"Concurrent edits to the same meeting resolve by LWW"** contradicts "never lose a summary". Add the `conflicts` log.
6. **Backup retention** "1 per month for the current school year" deletes last year's history in September. Keep 12 rolling months instead.
7. **"Saturday disabled in the date picker"**: native pickers can't do this. Use shift-plus-notice instead (or build a custom picker in Phase 2).
8. **Sign-out shouldn't revoke consent.** Revoking re-triggers the consent screen, which adds friction. Revocation becomes a separate "disconnect" action.
9. **"Delete all"**: make it permanent (not trash) with a typed confirmation. If the user prefers recoverability, trash it and tell them it stays for 30 days. This needs a decision.
10. **Hebrew dates** cost nearly nothing through `Intl`, so move them to the MVP.
11. **Brand verification on `gilovi.github.io`:** `github.io` is on the Public Suffix List, so verifying the `gilovi.github.io` property in Search Console should work. If Google rejects it, the fallback is a custom domain. Confirm this early, because it gates frictionless distribution.

---

## 9. Acceptance criteria (for qa)

Unless stated otherwise, today = 2026-10-08 (Thu), default cadence = 21, and the student is active.

**Dates (AC-D)**
1. `weekStart('2026-10-08')` → `'2026-10-04'`. `weekStart('2026-10-04')` → `'2026-10-04'`. `weekStart('2026-10-10')` → `'2026-10-04'`.
2. `shiftOffSaturday('2026-10-10')` → `'2026-10-11'`. `shiftOffSaturday('2026-10-09')` → `'2026-10-09'`.
3. `addDays('2026-03-26', 3)` → `'2026-03-29'`, with no DST drift; the test runs with `TZ=Asia/Jerusalem`.
4. Postpone "מחר" on 2026-10-09 (Fri) sets planned next `'2026-10-11'`. "שבוע הבא" on 2026-10-08 sets `'2026-10-15'`.
5. Every action that sets a planned date, given `'2026-10-10'`, stores `'2026-10-11'`. No stored planned date is ever a Saturday (property test over random inputs).

**Recurrence (AC-R)**
6. Monthly goal starting 2026-10-01, completion `completedOn` 2026-10-30, today 2026-11-01:
   - the current period `2026-11-01` is `pending`, so the box is unchecked;
   - period `2026-10-01` is `done`;
   - adherence = 1/1 = 100%.
7. Same goal, no November completion, today 2026-12-02: November is `missed` and adherence = 1/2 = 50%.
8. Weekly goal starting 2026-10-07 (Wed), today 2026-10-12, no completions:
   - periods are `[10-07..10-10]` (missed) and `[10-11..10-17]` (pending);
   - adherence = 0/1 = 0.
9. Biweekly goal starting 2026-10-07: the periods are `[10-07..10-17]` and `[10-18..10-31]`.
10. A meeting dated 2026-10-30 but recorded with today = 2026-11-01, ticking the monthly goal, creates completion id `g:s:2026-10-01`.
11. Ticking twice on two devices produces one completion id. Unticking tombstones it, and `periodStatus` returns `pending`. Re-ticking revives the same id.
12. Monthly goal since 2026-09-01 with a September completion, changed to weekly on 2026-10-08:
    - `rules` gains `{from:'2026-10-01', unit:'week', every:1}`;
    - the September status stays `done`;
    - the next periods are `[10-01..10-03]` and `[10-04..10-10]`.
13. Recurring goal with `endDate` 2026-10-15, today 2026-11-01: no period after 10-15 is generated.
14. One-time goal with `dueDate` 2026-10-05 and no completion → `overdue`. With a completion → `achieved`. A dropped goal is excluded from `overallStats`.

**Everyone goals (AC-G)**
15. A one-time everyone goal with 23 active students and 0 completions shows `{done:0,total:23}`. After adding a 24th student it shows `{done:0,total:24}`, and `openStudents` includes the new student.
16. The same goal with 3 completions, plus one student added → `{done:3,total:24}`. Deactivating a completed student → `{done:2,total:23}`.
17. A weekly everyone goal starting 2026-10-04, with a student whose `activeFrom` is 2026-10-20: that student's first period is `[10-20..10-24]`, and earlier periods don't count as missed.

**Cadence (AC-C)**
18. Last meeting 2026-09-10 → `daysSince` 28, stale, due `2026-10-01`.
19. Last meeting 2026-09-20 → 18, not stale, due `2026-10-11`. Last 2026-09-19 → due `2026-10-11` (shifted from Sat 10-10).
20. Cadence override 30 with last 2026-09-10 → not stale.
21. Only a `parent` meeting on 2026-10-07 → the student is still never-met and stale.
22. A planned next 2026-10-20 overrides the due date to `2026-10-20`.
23. Not-met-lately order, for students A (never met, "אבי"), B (28 days), C (40 days), Z (never met, "צבי"): `[A, Z, C, B]`, and the badge count = 4.

**Suggestions (AC-T)**
24. Scenario:
    - A: never met.
    - B: last met 28 days ago.
    - C: last met 18 days ago, with a checkup planned 2026-10-06.
    - D: last met 5 days ago, needs attention, 2 high-priority topics.
    - E: planned next 2026-10-12.
    - F: met today.

    With N=3, `suggest()` returns `[C (1191.4), A (400), D (277.6)]`. B scores 266.7. E and F are excluded.
25. C's reasons start with the code `plannedOverdue` and the label containing "2". A's reasons include `neverMet`.
26. A planned next dated today scores ≥ 800 and ranks above every student without a planned item.
27. Any never-met student outranks every student with r ≤ 1 and no other signals (property test).
28. Ties are broken deterministically: equal scores give the same order on repeated runs and under shuffled input.

**Record meeting (AC-K)**
29. Student s1 has open topics t1 and t2, a planned next on 2026-10-08, and a monthly goal g1. `recordMeeting({date:'2026-10-08', topicIdsDone:['t1'], goalTicks:[g1], checkupInDays:2, newTopics:['X']})` produces:
    - t1 done with `doneInMeetingId`, t2 still open;
    - completion `g1:s1:2026-10-01` with `meetingId`;
    - the planned next `done` and linked;
    - a new checkup dated `2026-10-11` (10-10 shifted);
    - a new open topic "X";
    - s1 no longer in `notMetLately`, and due `2026-10-29`.
30. A planned next dated 2026-10-15 is **not** closed by a meeting on 2026-10-08.

**Merge (AC-M)**
31. Local adds meeting m1 and remote adds m2: the merged doc has both, and `merge(a,b)` deep-equals `merge(b,a)`.
32. Student s1 is local `updatedAt` T2 "יוסי" and remote T1 "יוסף" → "יוסי".
33. A remote tombstone at T3 against a local edit at T2 → deleted, and the tombstone has no `summary`/`text`. A local edit at T4 against that tombstone → live.
34. Equal `updatedAt` with `by` "dev-a" vs "dev-b" → dev-b wins on both argument orders.
35. The same meeting with different summaries (local T5 "A", remote T4 "B") → the summary is "A", and `conflicts` has one entry with `lostSummary` "B".
36. Property tests on random docs: merge is idempotent (`merge(a,a)=a`), commutative and associative.
37. Two live `next` planned items for one student after a merge → exactly one remains `planned` (the newest), and the other is `cancelled`.

**Migrations (AC-V)**
38. `migrate({schemaVersion:1,…})` with current = 1 → unchanged.
39. A doc with `schemaVersion: 99` puts the sync engine in `readOnly`, no upload happens, and the status is `read-only`.
40. `validateDoc` rejects a doc missing `students` and one whose meeting has `date: '08/10/2026'`, returning error paths.

**Sync engine (AC-S, fake Drive + fake auth)**
41. Remote version equal to cached and local dirty → exactly one upload, zero downloads, dirty = false.
42. Remote version changed and local dirty → one download, one upload of the merged doc, and the new version is stored.
43. Remote changed, local clean, and the merge equals remote → zero uploads.
44. The first upload on 2026-10-08 calls `copy` once to `data-2026-10-08.json` *before* the upload. A second sync the same day makes no copy.
45. The upload returns 401 and the refresh succeeds → retried once and succeeds. If the refresh throws NeedsGesture → status `auth-required`, the IDB doc stays dirty, and no data is lost.
46. `fetch` rejects with TypeError → status `offline-pending`. A later `online` event triggers a sync, which uploads.
47. An action dispatched while an upload is in flight → after the sync, dirty = true and the new edit is present in the next upload.
48. A 404 on the cached fileId runs discovery. With two data files found, it keeps the oldest, merges the other in and trashes it.
49. `sw.js` `PRECACHE` lists exactly the shell files present in the repo (a test reads both).

**Auth (AC-A)**
50. `mapAuthError({type:'popup_failed_to_open'})` → `auth.popupBlocked`; `{error:'admin_policy_enforced'}` → `auth.blockedByAdmin`; `{error:'access_denied'}` → `auth.denied`. A grant without drive.file → `auth.scopeNotGranted`. A Drive 403 `domainPolicy` → `drive.blockedByDomain`. Each key has a non-empty Hebrew string in `he.js`.
51. A token with `expires_in: 3600` triggers proactive renewal at 55 min. In `needs-gesture` state, the next document click calls `requestAccessToken` synchronously inside the handler.

**Backups (AC-B)**
52. `retentionPlan` input:
    - daily backups 2026-09-01 through 2026-10-08 (38 files);
    - `data-2026-06-01.json`, `data-2025-09-01.json`;
    - 7 pre-restore files.

    It deletes 09-02 to 09-24 (23 files), `2025-09-01` and the 2 oldest pre-restore files. It keeps 09-25 to 10-08, 09-01 and 2026-06-01.
53. A restore first creates a `pre-restore` backup and then replaces the doc, and every restored entity has `updatedAt ≥` the restore time.

**Import (AC-I)**
54. `"FN:יוסי \r\n כהן"` unfolds to FN `"יוסי כהן"`. LF-only input and a leading BOM parse identically.
55. `N:כהן;יוסי;;;` → `{lastName:'כהן', firstName:'יוסי'}`. `N:ab\,c;d\;e` → last `ab,c`, first `d;e`.
56. Missing N with `FN:דוד בן חיים` → first `דוד`, last `בן חיים`. A card with neither → skipped, with `report.skipped = 1`.
57. `FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D7=99=D7=95=D7=A1=D7=99` → `"יוסי"`. A QP soft line break (`=` at end of line) is joined.
58. `item1.TEL:050-1234567` + `item1.X-ABLabel:אמא` → `motherPhone` raw `050-1234567` **only when** `includePhones = true`, and `contacts === null` otherwise. The label `אבא` maps to `fatherPhone`, and `_$!<Mother>!$_` maps to mother. Any other label is dropped.
59. `TEL;TYPE=CELL:+972501234567` → `studentCell` (opt-in). It displays as `050-123-4567` and its `tel:` href is `+972501234567`.
60. A card containing `ADR`, `EMAIL:a@b.com` and `TEL;TYPE=HOME:02…` → the output JSON contains none of `a@b.com`, the address text or the home number.
61. ORG suggestions:
    - `ORG:ישיבת נווה ט3` → school `ישיבת נווה`, class `ט3`.
    - `ORG:ישיבת נווה;י'2` → class `י'2`.
    - `ORG:ישיבה` → class suggestion null.
62. A file with 23 synthetic cards → 23 students with correct names, and a class suggestion taken from the most frequent ORG class token.
63. `normalizeName('  יוֹסִי   כֹּהֵן ')` equals `normalizeName('יוסי כהן')`, and `"צ׳רלי"` equals `"צ'רלי"` equals `"צרלי"`.
64. Re-import preview, given existing {יוסי כהן, דנה לוי} and a file {יוֹסִי כהן, משה רז} → `matched:[יוסי כהן]`, `new:[משה רז]`, `missing:[דנה לוי]`. Confirming does not deactivate דנה unless she was explicitly selected.
65. CSV with BOM and header `שם פרטי,שם משפחה`, including a quoted field `"כהן, הלוי"` → the last name is `כהן, הלוי`. The headers `first,last` and a single `name` column are also accepted.
66. Pasted list `"יוסי כהן\n\n  דנה לוי \nיוסי כהן"` → 2 unique students, with 1 duplicate reported.

**UI / PWA / Security (AC-P, AC-X; Playwright at 360×740 and 1280×800)**
67. `document.documentElement` has `dir="rtl"` and `lang="he"`. No element has horizontal overflow at 360 px on any route.
68. From the dashboard with a suggestion: tap "רשום פגישה" → type a summary → tap "שמור". That's 3 taps, after which the meeting exists and the student leaves "not met lately".
69. Type a summary, reload the page (or make the fake token expire and fail) → reopening the form restores the text exactly.
70. Choosing Saturday 2026-10-10 in the planned-date input stores `2026-10-11` and announces a notice in an `aria-live` region.
71. Topic reorder works with the keyboard alone through the up/down buttons, and the screen-reader announcement text changes.
72. Offline mode (`context.setOffline(true)`) after the first load: the app shell loads, recording a meeting works, and the badge shows the offline-pending state. Going back online → one upload.
73. Every network request recorded across all e2e flows goes to the origin, `accounts.google.com` or `www.googleapis.com`. `index.html` contains the exact CSP in §7. Grep finds no `innerHTML` in `js/` (lint rule).
74. Sign-out with dirty state and a failing sync shows the warning dialog. After confirming, IDB `one-on-one:{id}` no longer exists and `oneOnOne.lastAccount` is removed.
75. "Delete all" requires typing "מחק", calls `DELETE files/{folderId}` and revoke, and clears local storage.
76. A student summary containing `<img src=x onerror=alert(1)>` renders as literal text.
77. With `noticesAck` unset, the privacy and mandatory-reporting notices show once. After acknowledging, they don't show again on reload.

---

## Risks and open questions

- **iOS Safari plus the GIS popup** (installed PWA in standalone mode especially) is the biggest uncertainty and must be tested on a device in phase 4. In the worst case, every session starts with one tap to reconnect.
- **The Drive race window** (no If-Match) depends on the self-healing argument in §4.4. It's covered by AC-M36 and needs a two-browser manual test.
- **Clock skew** beyond the `maxSeen + 1` guard can still make an older edit win. That's acceptable for the MVP.
- **Brand verification of a `github.io` subdomain** is unconfirmed. A custom domain is the fallback.
- **Decisions needed from the user:**
  - permanent delete or trash for "Delete all";
  - whether parent meetings should reset staleness (I recommend no);
  - 12-month monthly backup retention instead of school-year retention;
  - whether keeping tombstones forever is acceptable (privacy: content is stripped, ids remain).
