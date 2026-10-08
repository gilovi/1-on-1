# PRD: "1-on-1" – Teacher–Student One-on-One Meetings Manager (Hebrew, Google Drive-backed)

> Produced by the **thinker** agent in a blind exercise: it saw only the user's original request and later constraints, not the existing code. Saved verbatim for comparison with the implementation.

**Status:** Draft for `@architect`. I could not interview the user in this blind exercise, so every ambiguity is settled with a stated recommended interpretation, marked **[ASSUMPTION]**. The open questions are in section 13.
**Hosting:** `https://gilovi.github.io/1-on-1/`. GitHub Pages, static files only, no backend.
**Primary user:** a homeroom teacher (מחנך) of a 9th-grade class at an Israeli yeshiva high school. The school week runs Sunday to Friday. The app is later shared with other teachers.

---

## 1. Problem and goals

### Problem
A homeroom teacher of about 23 students wants a regular, intentional 1-on-1 with every student. The meetings serve to build a relationship, to make the teacher someone students come to with their needs, to handle educational and discipline issues, and to run regular check-ins. Today the work is scattered: notes go in notebooks or WhatsApp, follow-ups get forgotten, and some students quietly go months without a conversation, often the quiet ones who need it most.

### Product goals (measurable)
1. **Coverage:** every student gets a meeting within the teacher's chosen cycle (default: once every 3 weeks). The dashboard shows who has been missed.
2. **Continuity:** before each meeting, the teacher sees in under 10 seconds what was said last time, what to raise now, and which goals are open.
3. **Intentionality:** the teacher can set goals (personal, class-wide, for everyone) and see how they are progressing.
4. **Zero-ops distribution:** another teacher can open the URL, sign in with Google once, import a class, and start working. No server, no account to create, and the data stays in *their* Drive.

### Non-goals
- No student-facing or parent-facing app. Students never log in.
- No school-wide or admin view, and no shared data between teachers in the MVP.
- No grading, attendance, or replacement of school systems (Mashov, Smart School, etc.).
- No messaging or SMS to students or parents.

---

## 2. Challenges to the request (pushback and reframes)

1. **"Goals for the teacher and for the student" are two different things.** A *teacher goal* is about the teacher's own practice ("find out what Yossi does after school"). A *student goal* is a commitment by the student ("submit homework on time for 2 weeks"). They belong to the same entity with an `owner` field (`teacher` | `student`), but the UI must label them clearly. Student goals usually need follow-up across several meetings. Teacher goals are often done in a single conversation.

2. **"General goals for class" vs "personal goals for everyone" is easy to confuse.** Recommended interpretation:
   - **Class goal:** one shared goal tracked once at class level, e.g. "improve the atmosphere in prayer", "every student knows the class trip plan". It has a single status. Meetings can optionally record a note or contribution toward it.
   - **"For everyone" goal (template goal):** a goal that is **instantiated per student** and tracked per student, e.g. "ask every student how the shift to high school went", "ask about his chavruta". Statistics show X of 23 completed.
   - **Personal goal:** one student, one goal.
   This distinction drives the statistics, so the architect must model it explicitly.

3. **Recurring goals: what counts as "done"?** A recurring goal is never fully done. It has *periods*, and each period is satisfied or missed. Example: "check in on emotional state, monthly" means each month is satisfied or missed. Recommendation: recurring goals produce **occurrences** (period windows), and checking the box marks the *current* occurrence as done. History gives an adherence rate. Without this, the "goal statistics" requirement has no meaning.

4. **"Change schedule for next meeting" assumes the app keeps a calendar. It shouldn't be a full one.** The teacher does not book time slots. Teachers grab students in breaks. Recommendation: each student has a **target cadence** and an optional **planned date** for the next meeting, plus optional **checkup** entries (a short follow-up with a date and reason). No time-of-day, rooms, or Google Calendar sync in the MVP, because that needs an extra sensitive OAuth scope.

5. **"Suggested next meetings" should be a ranked list with explanations, not a black box.** Each suggestion shows *why*, for example "34 days since the last meeting · checkup planned for today · 2 high-priority topics".

6. **Contact details (parents' phones, address) are the most sensitive data and serve none of the four requested features.** I push back on importing them by default. Recommendation: import names and class only. Parent phones are **opt-in** at import time ("import parents' phone numbers too"), and when included they are shown on the student page as tap-to-call or WhatsApp links. Home address and email are **not imported** in the MVP.

7. **School Google Workspace accounts may block this app.** Many Israeli schools use managed Workspace accounts where admins restrict third-party OAuth apps. The app must show a clear error for that case and recommend using a personal Gmail account (or asking the school IT admin). This is the biggest risk to "frictionless".

8. **"Stored in Google Drive" plus "frictionless login" plus "no server" creates real tension.** Without a backend there is no refresh token. Google Identity Services issues ~1-hour access tokens, and silent renewal works only while the user is signed into Google in that browser. Design for this (see section 9). Don't promise "never log in again".

9. **A per-student "mood or flag" field is missing from the request and is high-value.** After 20 meetings the teacher wants to filter "who did I mark as needing attention". I suggest a simple **"needs attention" flag** with an optional reason, not a mood score. A score on minors invites misuse and false precision.

10. **Mandatory reporting.** In 1-on-1s with minors, a teacher may hear disclosures (abuse, self-harm) that create a legal reporting obligation in Israel. The app must not act as a case-management tool for this. It should show a one-time notice: "This app does not replace reporting obligations. Do not record sensitive details beyond what is necessary." Product scope: a notice only, no workflow.

---

## 3. Personas and context

- **Primary: the homeroom teacher (מחנך).** Uses a phone in the corridor or right after a conversation, and a laptop in the evening for planning and review. Hebrew-native. Moderately tech-savvy. Has very little time, so a meeting summary must be enterable in under 1 minute on mobile.
- **Secondary: other teachers** who receive the link. They may have a different class size and a different number of classes, and a personal or school Google account.
- **Environment:** the week runs Sunday to Friday, and Friday is a short day. There is no school on Shabbat or holidays. The school year runs September to June. Each class has roughly 20 to 35 students.

---

## 4. Domain model (conceptual; the architect owns the schema)

| Entity | Key fields | Notes |
|---|---|---|
| **Workspace** | schemaVersion, settings, createdAt | One per teacher, i.e. one Drive data folder. |
| **Settings** | defaultCadenceDays (21), staleThresholdDays (= cadence), suggestionsCount (5), schoolDays (Sun–Fri), weekStart (Sunday), showHebrewDates (bool) | |
| **Class** | id, name (e.g. "ט3"), schoolName, schoolYear (e.g. "תשפ״ז"), archived | MVP UI: one active class, but the model supports several (teachers who teach multiple classes; year rollover). |
| **Student** | id, classId, firstName, lastName, displayName, cadenceDays (override), needsAttention {flag, reason}, contacts? {studentCell, motherPhone, fatherPhone} (opt-in), active (bool, for students who leave), source {importId, externalKey} | Stable `id`, independent of the name. |
| **Meeting** | id, studentId, date, type (`regular` \| `checkup` \| `ad-hoc` \| `parent`), summary (free text), topicIdsDiscussed[], goalOccurrencesCompleted[], followUpCreated?, createdAt, updatedAt | Dated summary. Time-of-day is optional. |
| **PlannedMeeting** | id, studentId, date, type (`next` \| `checkup`), reason, status (`planned` \| `done` \| `cancelled`), linkedMeetingId | At most one `next` per student. Any number of `checkup` entries. |
| **Topic** | id, studentId, text, order (sortable), priority (`high` \| `normal`), status (`open` \| `done`), createdAt, doneAt, doneInMeetingId | "Topics for next conversation". Topics are manually ordered. Priority is a separate flag that sorts high-priority topics above normal ones. |
| **Goal** | id, title, description, scope (`student` \| `class` \| `everyone`), owner (`teacher` \| `student`), studentId (scope=student), classId, recurrence {type: `once` \| `recurring`, everyNDays OR frequency (`weekly` \| `biweekly` \| `monthly` \| custom N weeks), startDate, endDate?}, dueDate? (once), status (`active` \| `achieved` \| `dropped`), createdAt | |
| **GoalCompletion** | id, goalId, studentId? (for `everyone`), periodStart (recurring), completedAt, meetingId?, note | Gives per-student and per-period tracking. A one-time goal has exactly one completion. |

**Derived (not stored):** last meeting date per student, days since the last meeting, next suggested date, goal occurrence windows, and statistics.

---

## 5. Business rules

### 5.1 Goal semantics
- **One-time goal:** open until a completion exists, then *achieved*. It may have a due date, and past the due date without a completion it is *overdue*. It can be *dropped* (excluded from statistics).
- **Recurring goal:** periods are generated from `startDate` with the given frequency (aligned to Sunday-start weeks or calendar months). In each period the goal is:
  - `done` if there is a completion with `completedAt` inside the period,
  - `pending` if this is the current period and there is no completion yet,
  - `missed` if the period is past and has no completion.
  Checking the box on the student page creates a completion for the **current period**. Unchecking deletes it. The box resets automatically when a new period starts.
- **Scope `everyone`:** applies to every *active* student in the class, including students added later, from the time they are added. Completion is per student.
- **Scope `class`:** a single status. Checking happens on the class or goals screen (or from any meeting).
- **Owner** affects labels and filters only, not the logic.
- Editing a recurring goal's frequency applies from the current period onward. Past periods keep their computed status. [ASSUMPTION]
- Deleting a goal needs confirmation and removes its completions. Prefer *drop* or *archive*.

### 5.2 Student meeting cadence and staleness
- Each student has an effective cadence: `student.cadenceDays ?? settings.defaultCadenceDays`.
- `daysSinceLast` = school days, or calendar days [ASSUMPTION: **calendar days** for simplicity, plus an optional later setting for holidays].
- A student is **"not met lately"** if `daysSinceLast > staleThreshold` or they have never been met. Students never met sort first.
- **Due date** = `plannedNext.date` if set, else `lastMeeting.date + cadence`, else "now" for students never met.

### 5.3 Suggested next meetings (ranking)
The score is transparent and the architect may tune weights. Inputs, in priority order:
1. **Planned items due:** a checkup or planned next meeting dated today or overdue. Strongest signal; overdue planned items go to the top.
2. **Overdue ratio:** `daysSinceLast / cadence`. Never met counts as a high constant.
3. **"Needs attention" flag.**
4. **Open high-priority topics** (count).
5. **Due goal work:** active recurring student or `everyone` goals in a `pending` period that is near its end, and overdue one-time goals.

Output: the top N students (default 5), each with **reason chips**, and the actions "Record meeting", "Postpone" (sets the planned date: tomorrow or next week), and "Open page". Saturday never appears as a suggested or planned date. A planned date that falls on Saturday moves to Sunday. Snoozed students drop out of the suggestions until their new date.

### 5.4 Recording a meeting (key automation)
When a meeting is saved:
- Open topics the teacher ticked as "discussed" → `done`, with a link to the meeting.
- Goal checkboxes ticked in the meeting form → completions linked to the meeting.
- A planned `next` meeting for this student, dated on or before today → `done` and linked. The next due date is then recalculated from the cadence.
- An optional "Schedule a checkup in X days" field (quick chips: 3 days, 1 week, 2 weeks) creates a planned checkup.
- An optional "Topics for next time" field creates new open topics.

### 5.5 Statistics (dashboard "Goals" panel)
- **Per goal:**
  - one-time personal → achieved, open, or overdue;
  - `everyone` → completed students / active students, as % with a progress bar and a list of who is still open;
  - recurring → adherence = done periods / elapsed periods (per student for `everyone`, for the student or class otherwise);
  - class → current status and adherence.
- **Overall:** active goals by scope and owner; one-time goals achieved this month or school year; average adherence across recurring goals.
- **Meeting coverage (strongly recommended to add, beyond the request):** students met within cadence / total; meetings per week (last 8 weeks); median days between meetings.
- **Per student (on the student page):** the number of meetings, the last meeting, and goal progress.

---

## 6. Key flows

1. **First run / onboarding:** open the URL → Hebrew landing page with a privacy explanation → "Sign in with Google" → consent (one non-sensitive scope) → the app creates the Drive folder and data file → "Import a class" (vCard, CSV, or paste a list of names, or add students manually) → name the class → set the default meeting cadence → dashboard.
2. **Returning user:** open the app (installed PWA or URL) → silent token renewal → the cached data shows instantly → it syncs with Drive in the background.
3. **Before a meeting:** dashboard → suggestion → student page shows the last summary, open topics in order, and open goals.
4. **During or right after a meeting:** "Record meeting" → date (default today) → summary → tick topics discussed and goals completed → optional checkup and topics for next time → save. Must work offline.
5. **Planning:** the teacher adds a topic to a student whenever something comes up (from the dashboard or student list via a quick "+ topic" without opening the page), drags to reorder, and marks it as important.
6. **Goal setup:** Goals screen → new goal → choose scope (student, class, everyone) → owner → one-time or recurring with frequency → save.
7. **Re-import or class update:** import a new vCard → matching against existing students (see 7.2) → preview showing new, matched, and missing students → confirm. Missing students are never deleted automatically; they are offered for deactivation.
8. **New school year:** archive the class (read-only) → import the new class. [Phase 2]
9. **Export and backup:** "Export everything (JSON)" and "Print or export student page (PDF via the browser)".

---

## 7. Import specification

### 7.1 vCard 3.0 parser requirements
- Encoding: UTF-8 (Hebrew). Tolerate a BOM, CRLF or LF, and folded lines (a continuation line starts with a space or tab). Handle `ENCODING=QUOTED-PRINTABLE` and `CHARSET=` parameters defensively, since some Israeli exports use these.
- Several cards per file (`BEGIN:VCARD` … `END:VCARD`).
- Field mapping:
  - `N` → last and first name (components split by `;`; unescape `\,`, `\;`, `\\`).
  - `FN` → display name. Use it as a fallback if `N` is empty.
  - `ORG` → school name and class. Heuristic: the last whitespace-separated token matching a Hebrew grade-and-number pattern (e.g. `ט3`, `י'2`) is the class name; the rest is the school. Offer the result as an editable suggestion for the class name, not as truth.
  - `TEL;TYPE=CELL` → student mobile (opt-in).
  - `itemN.TEL` + `itemN.X-ABLabel` → label "אמא" (mother) or "אבא" (father) maps to the mother or father phone. Other labels are kept as generic labeled contacts or dropped [ASSUMPTION: drop in MVP].
  - `TEL;TYPE=HOME`, `ADR`, `EMAIL` → **not imported** in the MVP (data minimization). This is a stated product decision.
- Empty values are ignored. Phone numbers are normalized for display and kept raw for `tel:` links.
- A card without any name is skipped and reported in the preview.

### 7.2 Matching on re-import
Match on normalized full name (trim, collapse spaces, strip niqqud and gershayim variants). Exact match → update opt-in contacts. No match → new student. Students present in the app but absent from the file → listed as "not in the file", with the option to deactivate.

### 7.3 Other inputs
- Paste a list of names, one per line ("first last").
- CSV with header row (`שם פרטי`, `שם משפחה`; also accept `first`, `last`, `name`).
- Manual add, edit, and deactivate.

The imported file is **parsed entirely in the browser** and never uploaded anywhere. The original file is not stored in Drive.

---

## 8. Screens (Hebrew, RTL)

1. **Landing / sign-in:** what the app does, where data is stored ("only in your Google Drive, in the folder '1-on-1'"), the sign-in button, and a link to the privacy policy.
2. **Dashboard (לוח):**
   - **Suggested next meetings:** top N with reason chips and quick actions.
   - **Not met lately:** list sorted by days since the last meeting, never-met students first, with the count shown in a badge.
   - **Upcoming planned and checkups:** this week, grouped by day (Sunday to Friday).
   - **Goal statistics:** per section 5.5.
   - **Coverage summary:** e.g. "17/23 met in the last cycle".
3. **Students list:** search by name, sort (name, last meeting, due), filters (needs attention, has open topics, inactive), and quick "+ topic" / "record meeting" actions.
4. **Student page:**
   - Header: name, class, needs-attention flag, contact buttons (if imported), days since the last meeting, and cadence (editable).
   - **Next meeting and checkups:** planned date (editable, date picker, Saturday disabled), "add checkup" with date and reason, cancel or complete.
   - **Topics for next conversation:** add, inline edit, drag to reorder (with up and down arrows as an accessible and mobile alternative), priority toggle, done checkbox, and a collapsed "done" section.
   - **Goals:** personal goals plus the student's instances of `everyone` goals, each with a checkbox (current period for recurring goals), owner badge, frequency label, and a small adherence indicator. "Add personal goal".
   - **Meetings timeline:** dated summaries, newest first, expandable. Edit and delete with confirmation.
   - "Record meeting" as the primary CTA (fixed at the bottom on mobile).
5. **Record meeting form:** a bottom sheet on mobile, a modal on desktop (section 6, flow 4).
6. **Goals screen:** all goals, grouped by scope, with filters (owner, active, achieved, dropped), create and edit, and per-goal detail with per-student or per-period breakdown.
7. **Import screen:** upload or paste → preview table → options (class name, include parent phones) → confirm.
8. **Settings:** default cadence, number of suggestions, Hebrew dates toggle, Drive folder link ("open in Drive"), export JSON, restore from JSON or backup, sign out, delete all data (strong confirmation), and the privacy notice.

---

## 9. Non-functional requirements

### 9.1 Language and layout
- The whole UI is in Hebrew with `dir="rtl"` and `lang="he"`. Use logical CSS properties. Icons that indicate direction (back, next) must be mirrored.
- Dates display as `dd/mm/yyyy` with Hebrew day names (יום א׳ … יום ו׳). Showing Hebrew calendar dates is optional and later.
- Mixed text (a Hebrew summary with English or numbers) must render correctly, using `dir="auto"` on user text fields.
- The UI and data files use Hebrew. Code and schema keys are in English.

### 9.2 Mobile-first and PWA
- Primary target: a phone (360px+). Also responsive for desktop.
- Installable PWA (manifest, icons, Hebrew name, `start_url` and `scope` = `/1-on-1/`).
- Touch-friendly drag and drop plus button alternatives.
- Recording a meeting takes 3 taps or fewer from the dashboard.

### 9.3 Storage: Google Drive is the source of truth
- **Scope:** `https://www.googleapis.com/auth/drive.file` only. It is non-sensitive and needs only brand verification, not a security assessment. The app can see only files it created.
  - Rejected: `drive.appdata` (hidden folder; the user explicitly wants a designated *visible* location they own) and full `drive` (restricted scope, needs a CASA security assessment).
- **Designated location:** a folder named `1-on-1` (Hebrew alias in the UI) in the user's My Drive root, created by the app. It holds:
  - `data.json`: the single workspace document;
  - `backups/`: rolling snapshots.
  The folder ID is remembered locally and found again by searching app-created files with an `appProperties` marker, so the app works on a new device.
- **[ASSUMPTION] A single JSON document, not one file per student.** At ~23 to 35 students × ~30 meetings a year, the file is well under 1 MB, and atomic consistency is simpler. The architect should confirm and design a split if multi-class or multi-year growth demands it (e.g. one file per school year).
- **Schema versioning:** a `schemaVersion` field with forward migrations in the client. Never silently downgrade. If the file's version is newer than the app's, open it read-only and show a refresh prompt.
- **Writes:** debounced autosave (e.g. 1 to 2 seconds after the last change) plus save on `visibilitychange` or hidden. A visible sync status shows saved, saving, offline with pending changes, or error.

### 9.4 Multi-device and concurrency
- The same teacher may use a phone and a laptop. Before writing, check the remote `version` / `modifiedTime`. If it changed since the last read, **merge at entity level** using per-entity `updatedAt` and tombstones for deletes (last-writer-wins per entity, not per file). This must never lose a meeting summary written on another device.
- Pull on app focus and periodically while visible (e.g. every 60 seconds).

### 9.5 Offline
- The app shell is cached by a service worker. Data is cached locally (IndexedDB).
- All read and write flows work offline, and changes queue and sync on reconnect. Uploading the queued data must handle an expired token (see 9.6).
- The local cache is per Google account. Signing out clears it, and the teacher must be warned first if unsynced changes exist.

### 9.6 Authentication and distribution (static hosting)
- Use **Google Identity Services**, OAuth 2.0 token model, browser-only. There is no client secret and no backend. Authorized JavaScript origin: `https://gilovi.github.io`.
- Frictionless behavior:
  - First visit: one consent screen.
  - Later visits: try silent token acquisition (no prompt, `login_hint` = remembered email) and fall back to a one-click button if the browser blocks it (third-party-cookie or ITP restrictions, especially Safari on iOS).
  - Tokens last ~1 hour. Renew silently before expiry and on any 401. The UI stays usable with local data while auth is pending, so the user never loses typed text because of token expiry.
- **The OAuth consent screen must be published "In production"**, not "Testing". Testing mode is limited to 100 manually listed test users, and their authorizations expire after 7 days.
  - Brand verification requires: app name, logo, a privacy-policy URL and a homepage hosted on the same verified domain or path (GitHub Pages works with Search Console verification of `gilovi.github.io`), and a support email.
  - With `drive.file` only, the unverified-app warning screen should not appear once brand verification is done. Until then, users see the "unverified app" warning, which counts as friction and must be called out in the release plan.
- Managed Workspace accounts where the admin blocks the app → detect the `admin_policy_enforced` or `access_denied` error and show Hebrew guidance.

### 9.7 Privacy and security (minors' data)
- Data is stored **only** in the teacher's own Drive and the local browser cache. No analytics, no third-party scripts beyond Google's auth and API libraries, no telemetry, no error reporting to external services. Fonts should be self-hosted.
- Data minimization: names and class by default. Parent and student phones are opt-in. Addresses and emails are not imported.
- A content-security policy appropriate for static hosting (meta CSP) that restricts connections to Google APIs.
- In-app notices:
  - first-run privacy notice (Hebrew);
  - mandatory-reporting disclaimer (see 2.10);
  - a warning if the teacher chooses to share the Drive folder.
- Privacy policy page (also needed for OAuth verification): what is stored, where, that the developer has no access, and how to delete (delete the Drive folder plus revoke access at myaccount.google.com).
- Compliance: this is for awareness, not a legal opinion. Israel's Privacy Protection Law (including Amendment 13, in force since Aug 2025) and Ministry of Education guidance on student data may apply to the teacher as a holder of the data. The app's job is to make compliance easy: minimization, owner control, deletion. Flag to the user to check school or ministry policy on storing student notes in a personal Google account.
- Optional later: a client-side encryption passphrase. Rejected for the MVP because a forgotten passphrase means total data loss.

### 9.8 Backups and recovery
- Daily snapshot (on first save of the day) to `backups/data-YYYY-MM-DD.json`. Keep the last 14 daily snapshots plus 1 per month for the current school year.
- Drive's own revision history is a second safety net.
- Settings → Restore: list the backups → preview counts → restore (which itself first creates a backup of the current state).
- Manual JSON export and import. The import validates the schema.

### 9.9 Performance and quality
- First load under 2 seconds on 4G after the first visit (cached shell). Dashboard calculation under 100 ms for 50 students × 3 years of data.
- Accessibility: WCAG 2.1 AA basics (contrast, labels, keyboard and screen-reader support for reordering).
- Supported browsers: current Chrome (Android and desktop), Safari iOS 16+, Edge, and Firefox.

---

## 10. Explicitly out of scope (MVP)
- Google Calendar sync or reminders and push notifications (calendar needs an extra scope, and push needs a server or complexity). Possible later: an "add to calendar" `.ics` download, which needs no scope.
- Multi-teacher collaboration or shared students (e.g. homeroom teacher plus counselor).
- Attachments, voice notes, and AI summarization of meeting notes. AI is especially excluded: sending minors' data to an LLM API is a privacy issue.
- Holiday-aware calendars (Phase 2).
- Native app-store apps.
- Parent meetings as a separate module (only as a meeting `type` in the MVP).

---

## 11. MVP vs later phases

### MVP (Phase 1)
- Google sign-in (GIS, `drive.file`), Drive folder plus `data.json`, local cache, offline queue, entity-level merge, daily backups, JSON export.
- Import: vCard (names, class, opt-in phones), pasted list, manual add. Re-import matching.
- Single active class (the model supports several).
- Student page: meetings timeline, topics (add, reorder, priority, done), goal checkboxes, planned next meeting plus checkups, needs-attention flag, cadence override.
- Record meeting flow with automations (5.4).
- Goals: all three scopes, both owners, one-time and recurring (weekly, biweekly, monthly, every N weeks).
- Dashboard: suggestions with reasons, not met lately, this week's planned meetings, goal statistics, coverage.
- Hebrew RTL, mobile-first PWA, privacy page, onboarding, settings, sign-out and delete-all.
- Published OAuth app with brand verification.

### Phase 2
- Several classes with a switcher, and school-year archive and rollover.
- Israeli holiday or vacation calendar (exclude from staleness), Hebrew dates.
- `.ics` export for planned meetings.
- Meeting templates or guided questions (e.g. the first-meeting questionnaire).
- Tags or categories on meetings (social, academic, discipline, family) and statistics by category.
- Restore from a backup UI with diff, and printable class report.

### Phase 3 (needs validation)
- Optional client-side encryption.
- Shared access with a co-teacher or counselor (permission model, conflict handling).
- Optional local reminders (notification API while the app is installed).

---

## 12. Acceptance criteria (high level, for architect and QA to expand)
1. A new user on a fresh browser can go from the URL to a dashboard with 23 imported students in under 3 minutes, with one Google consent.
2. Importing the described vCard gives 23 students with correct Hebrew first and last names, the class name suggested from ORG, and no addresses or emails stored. Parent phones are stored only if the teacher opts in.
3. Folded lines, empty fields, a missing `N`, and `itemN` labels "אמא"/"אבא" parse correctly (unit tests with synthetic fixtures; no real student data in the repo).
4. A recurring monthly goal checked on Oct 30 shows unchecked on Nov 1, and October counts as done in adherence. A month with no check counts as missed once it is over.
5. An "everyone" goal created with 23 students and then a 24th student added shows 0/24 and includes the new student.
6. Recording a meeting marks the ticked topics as done, completes the ticked goals for the current period, closes a due planned meeting, and moves the student out of "not met lately".
7. Never-met students are always at the top of "not met lately" and appear in the suggestions before students within their cadence.
8. A planned date can never be set to Saturday.
9. Edits made offline on device A, while device B made other edits, both survive after sync. Concurrent edits to the same entity resolve by latest `updatedAt`.
10. Token expiry during a long session does not lose the meeting text being typed.
11. Every text and layout is RTL-correct on a 360px-wide phone screen and on desktop.
12. No network requests go to any domain other than Google auth and APIs (verified in DevTools and enforced by CSP).
13. "Delete all data" removes the Drive folder (after a typed confirmation) and clears the local cache.

---

## 13. Open questions for the user (with recommended defaults)

| # | Question | Recommended default |
|---|---|---|
| 1 | What is the target cadence — how often should each student be met? | Every 21 days, overridable per student |
| 2 | Does "personal goals for everyone" mean one goal tracked per student (my interpretation), or something else? | Per-student instances |
| 3 | Should parent and student phone numbers be imported at all? Address and email? | Phones opt-in. Address and email never in MVP |
| 4 | Will you or other teachers use school-managed Google accounts? | Expect personal accounts and handle the blocked-admin case |
| 5 | Is one class enough for v1, or do some teachers (e.g. ram/maggid shiur plus homeroom) need several? | Single class in the UI, multi-class model |
| 6 | Do you want meeting categories (social, academic, discipline, family) for statistics? | Phase 2, free text in the MVP |
| 7 | Is a planned meeting just a date, or do you need a time and place? | Date only |
| 8 | Should holidays and vacations pause the "not met lately" clock? | Not in MVP; Phase 2 |
| 9 | Should recurring goals have an end date (e.g. end of semester)? | Optional end date |
| 10 | Is the Drive folder name "1-on-1" fine, and should the teacher be able to choose or move it? | Fixed name, created in My Drive root; moving it in Drive is fine (found by ID or marker) |
| 11 | Has the school or Ministry given guidance on keeping student notes in personal cloud storage? | The user should check; the app provides minimization and deletion |
| 12 | Who maintains the Google Cloud project, OAuth client, and verification (support email, privacy policy)? | gilovi, under a dedicated project |
| 13 | Should meeting notes be editable forever or locked after some time? | Editable, with `updatedAt` shown |
| 14 | Any need for parent meetings to be tracked separately? | Only as a meeting type |

---

## 14. Risks
- **OAuth friction:** Safari or iOS blocks silent renewal, the unverified-app warning shows before brand verification, and admins block Workspace accounts. Mitigation: a published and verified app, a local-first UI, and clear Hebrew errors.
- **Data loss** from multi-device overwrites. Mitigation: entity-level merge, tombstones, daily backups, and Drive revisions.
- **Privacy incident:** the teacher shares the folder, or a lost phone with a cached session. Mitigation: minimization, sign-out clearing, warnings, and an optional app lock later.
- **Scope creep** into a full calendar or CRM. Mitigation: the MVP boundary in section 11.
