# Critic review of `2026-10-08-hybrid-plan.md`

> Produced by the **critic** agent. Saved verbatim.

## Verdict: send it back to @architect before qa starts

Most of the plan holds up. I checked its claims about the code and they are accurate. But four problems sit in the merge, discovery and typing-fix designs themselves, and the acceptance criteria (ACs) as written would lock them in. Fixing them means rewriting §1, §3, §6 and some ACs, not adding patches.

---

## Blockers

**B1. The merge creates false conflicts constantly, because it can't tell "concurrent edit" from "my newer edit".** (§3 Merge / blind §4.5; §1 typing fix; AC-P6.9)
- The rule is: same entity live on both sides, different `summary`/`notes`, different `updatedAt` → record a conflict. Nothing records which version an edit was based on.
- **Case 1, a device's own edits.** A syncs summary "A1", then edits it to "A2". B touches any other entity, so the remote version changes. A's next sync merges A2 against remote A1 and logs a conflict that "A1 was lost". It wasn't.
- **Case 2, the end of every sync.** The sync merges its result with the current IDB doc. Notes now autosave on a 300 ms debounce and sync is debounced 1500 ms. So almost every notes or summary edit made during a sync logs a conflict against its own earlier prefix.
- **Case 3, sequential edits across devices.** A writes "A1". B pulls it and edits it to "B1". A merges and logs "A1 lost", even though B saw A1 and replaced it on purpose.
- The banner "נמצאה גרסה נוספת" will show almost all the time, and conflicts keep lost text (see M9).
- **Fix:** add a per-entity `base` = the `{updatedAt, by}` of the version the edit started from. Keep it unchanged across repeated local edits of an entity that hasn't synced yet. Record a conflict only when the loser is not an ancestor of the winner (`loser.updatedAt > winner.base.updatedAt`, or the same time with a different `by`).
- **ACs to add:** "edit, sync, edit again, remote changes elsewhere → 0 conflicts"; "notes edited during a sync → 0 conflicts"; "true concurrent edit → 1 conflict".

**B2. Discovery can split the data into two files that never reconcile, and its dedup step pushes other devices into `remote-deleted`.** (§3 Discovery steps 1–3; AC-L4, AC-Y1)
- Duplicate detection only runs when there is no cached `fileId`.
- Two devices that upgrade at about the same time both see 0 appProperties files. Both migrate, both create `one-on-one-data-v2.json`, and each caches its own id. They never discover each other.
- If dedup ever does run on a third device, it trashes the "newer" file. The device that cached that file then sees `trashed:true` with `everSynced` set, goes to `remote-deleted`, and offers "מחק גם מהמכשיר הזה".
- The same thing happens if two devices both choose "העלה את העותק מהמכשיר הזה".
- **Fix:**
  - On every boot sync, run one `files.list` for data files. If there is more than one, pick a deterministic winner (oldest `createdTime`, then id). Stamp each trashed loser with appProperties `supersededBy: winnerId` so devices holding a loser follow it.
  - When the cached id is trashed or 404, always run discovery first. Declare `remote-deleted` only if no live data file exists and the root folder is trashed or gone.
  - Also define the case `everSynced=false` + trashed, which the plan leaves unspecified.
- **ACs to add:** "two creates racing → both devices converge on one file"; "loser device follows `supersededBy` and does not go to `remote-deleted`".

**B3. Backup copies probably inherit `kind:'data'`, so discovery would treat every backup as a duplicate data file and trash them all.** (§3 Backups `ensureDaily`, pre-restore copy)
- `files.copy` has patch semantics over the source metadata. The Drive docs say appProperties "entries with null values are cleared in update and copy requests", which implies they are copied by default. I haven't confirmed this against the live API.
- If they are copied, every `data-YYYY-MM-DD.json` and `pre-restore-*` carries `{app:'one-on-one', kind:'data'}`. Discovery's "more than 1 → merge and trash" would then trash all backups.
- **Fix:**
  - Every copy passes `appProperties:{app:'one-on-one', kind:'backup'}`.
  - The discovery query also requires the parent to be the root folder.
  - Verify the behaviour in P7 against the real API, not only the fake. The fake must model the inheritance.
  - Add an AC: "after `ensureDaily`, discovery still returns exactly 1 file".

**B4. Notes autosave on a debounced `input` re-renders the page every pause in typing, which drops focus and closes the mobile keyboard.** (§1 Drafts: "Student notes also save on a debounced input"; "'local' renders immediately")
- Each save is a `'local'` dispatch, so it renders immediately and replaces `#main`.
- The draft refill restores the value but not focus or caret. On iOS, calling `focus()` outside a user gesture won't reopen the keyboard either.
- The notes textarea is `data-change`, not `data-input` (`js/views/student.js:310`), so the existing `keepFocus` path doesn't cover it.
- AC-F5 only asserts the value, so it would pass while typing is broken. Any future autosave form has the same problem.
- **Fix:** autosave dispatches must not re-render the element that produced them, for example `notify({reason:'local', source: el})` with the scheduler skipping or deferring when the focused element is `source`. The other option is to morph the DOM instead of replacing it, which the plan never weighed against the scheduler. Then extend AC-F5: after the 300 ms save, `activeElement` is still the textarea and `selectionStart` is unchanged.

---

## Major

**M1. The end-of-sync write is not atomic with dispatch and doesn't bump `editSeq`.** (§3 Dispatch/Sync)
- Dispatch reloads from IDB only when `meta.editSeq` differs from memory. The sync's final write (`doc=merged, dirty=false`) neither changes `editSeq` nor takes the `doc:` lock.
- So tab 2 keeps a stale in-memory doc and its next dispatch overwrites the merged doc. The next sync sees the same remote version, skips the download, and uploads a doc missing the entities just merged from remote. They come back only if their origin device syncs again.
- **Fix:** do the sync's read-check-write under `doc:{acct}`, bump a generation counter on every IDB doc write (sync included), broadcast `doc-changed`, and have dispatch compare that counter. Add an AC with a sync completing between two tab-2 dispatches.

**M2. Nothing checks that the token belongs to the account whose local database is open.** (§3 Boot/Auth)
- Boot opens `one-on-one:{lastAccount.permissionId}` before any token exists.
- If GIS returns a token for a different account (the hinted account is signed out of the browser and the user picks another, or someone else is using a shared machine), the first sync merges P1's students into P2's Drive.
- **Fix:** after every token grant, call `about?fields=user(permissionId)` before any Drive call. On a mismatch, stop syncing and switch databases. Add an AC.

**M3. Opening offline-first without sign-in is a privacy regression for minors' data on shared computers.** (§3 Boot)
- Today, Drive mode can't open without Google sign-in (comparison G4). The plan renders all student data straight from IndexedDB for anyone who opens the URL on a computer where the teacher just closed the tab.
- Clearing on sign-out (§8.2) doesn't help when they never signed out.
- This needs a user decision (see Open questions). Options:
  - a "מחשב משותף" choice at sign-in, meaning session-only storage with nothing kept in IndexedDB;
  - and/or offline opening only within N hours of the last successful sign-in.

**M4. Sign-out and delete-all can lose data or leave it behind.**
- **Sign-out:** "if dirty, try one sync". After the no-If-Match race, the device whose upload was overwritten has `dirty=false` while its edits exist only in its IDB. Signing out deletes them. Sign-out should always pull, merge and push, then confirm by re-reading the version.
- **Other tabs:** `indexedDB.deleteDatabase` is blocked while other tabs hold connections, and a live tab can re-create the database on its next dispatch. Broadcast `signed-out`/`deleted`, close the connection on `versionchange`, and handle `onblocked`. Add an AC with two tabs.
- Also delete `one-on-one:local` after the trial → Drive merge.

**M5. The deferred-render trigger can swallow taps, and dirty forms can block updates indefinitely.** (§1 render scheduler)
- **Swallowed taps:** "render on focusout that leaves no editing element" runs between `pointerdown` and `click`. Example: focus is in the add-topic input, a remote update is deferred, the user taps "הוסף". `focusout` renders, the button is replaced, and the click never lands. During `focusout`, `activeElement` is still `body`.
- **Stale page:** `isEditing` is also true for any dirty draft form. A restored, abandoned draft on a student page then holds back every remote render there until the user submits or cancels.
- **Fix:**
  - Flush the deferred render after the click settles (a `setTimeout` after `pointerup`/`click`), or only on submit, cancel or route change.
  - Make `isEditing` mean "focus is inside an editable element" only. Dirty forms that don't have focus get refilled from the draft cache, as local renders already do.
  - Add flush on `pagehide`/`visibilitychange` for the 300 ms draft debounce.

**M6. P3 depends on P4.** P3's `recordMeeting` with goal ticks, AC-P3.3 ("creates its completion") and blind AC-29 (`g1:s1:2026-10-01`) all need period keys from `recurrence.js` (P4). Move `periodKeyFor` and the periods logic into P3, or move goal ticks into P4.

**M7. P8 is too big, and P8a can't ship on its own.**
- P8a deletes `store.js` but `storage.js`/Drive mode isn't rewired until P8b. Pages deploys from `main` (README:42), so merging P8a alone leaves Drive mode broken or unsafe.
- P8a also ports about 1,200 lines of templates across 7 views. Its only safety net, AC-Z1, is written against v2, so nothing pins the old behaviour.
- **Fix:**
  - In P1, since `createApp` makes it possible, add happy-dom characterization tests for every handler in `views/*` against the old store, then re-run them at P8a.
  - Split P8a by view group.
  - State explicitly that P8a and P8b reach `main` together.
  - Put v2 sync behind a config flag so it can be canaried on the author's own account. There is no code-rollback path: after P8b, reverting the code shows the stale v1 file.

**M8. CSP gaps.**
- I downloaded `gsi/client`. `google.accounts.oauth2.revoke` makes an XHR to `https://oauth2.googleapis.com/revoke`. The blind CSP's `connect-src` doesn't allow that host, so "Disconnect" would fail silently. Add the host.
- GIS also injects an inline `<style id="googleidentityservice_button_styles">`. That causes a harmless CSP violation on every load, so e2e must not fail on console errors.
- AC-Q7 and AC-P10 test "the exact CSP string from this plan", but the plan contains no CSP string. Write the full string into §4.

**M9. Tombstones and conflicts keep personal data.** (§2.1 `CONTENT_FIELDS`, §3 conflicts)
- The denylist misses:
  - `students.source.externalKey`, which is the student's name;
  - nested `needsAttention.reason`;
  - `contacts`, which is listed but nested;
  - `conflicts.lostText`.
- Deleting a student doesn't cascade to conflict entries, and "סגור" keeps the text.
- **Fix:**
  - Define tombstones by an allowlist of kept keys: id, timestamps, `by`, `deletedAt`, foreign keys.
  - Cascade deletes to conflicts and strip `lostText`.
  - Strip `lostText` on dismiss, or after 30 days.
- An offline edit can also revive a deleted student with full personal data while their meetings stay tombstoned. Recommend sticky (delete-wins) tombstones for `students`, and selectors that hide children of a tombstoned parent. Add an AC.

**M10. Migration correctness.**
- **Priority inference is wrong.** The claim "no false positives" is false. `addTopic` (`js/logic.js:55-57`) and `setTopicDone` reopen (`:84`) give order 0 or less when only urgent topics are open, e.g. open `[-1]` + normal add → 0 → `high`. Each false `high` adds +40 to suggestion scores. Use `order <= -1`, which trades this for occasional false negatives, or infer nothing.
- **AC-MIG8 contradicts itself.** September (09-03) and October (10-05) are both done, so adherence is 2/2, not 1/1. "The current period is pending" contradicts "October done".
- **AC-MIG7 can't pass as written.** If the 08-28 completion is for s1, period clipping by `activeFrom` 09-01 removes that period, so the completion has no key. Set `activeFrom = min(createdAt, earliest meeting, earliest completion)`, and define a fallback when v1 `createdAt` is missing.
- **Reactivation is undefined.** Changing `activeFrom`/`inactiveFrom` on reactivation changes clipped period keys and orphans completions. Define it.
- **Migrated history will look worse.** Mapping rolling periods to calendar periods turns past history into retroactive "missed" periods, so adherence will look worse right after upgrade. Needs a decision (see Open questions).

**M11. A behaviour change is presented as a port.** v1 closes due checkups on any meeting type (`js/logic.js:185-190`). The plan closes them only when `type==='checkup'`. If the teacher changes the type to "regular", the checkup stays open and shows as missed. Recommend: any counted (non-parent) meeting closes due checkups.

**M12. Legacy catch-up only works on the device that did the migration.**
- `meta.legacy` lives in that one device's IDB. Devices that find v2 through appProperties never catch up.
- **Fix:** keep `legacy:{fileId}` in the v2 doc or in appProperties on the v2 file, and stop catching up after about 60 days.
- Unfixable residual risk: an old-code tab still has `ensureFolder` (`js/storage.js:211-224`) and will re-create the folder and the v1 file after delete-all.
- Simpler alternative to evaluate: after migration, overwrite v1 with a marker doc ("הנתונים עברו לגרסה חדשה – רעננו"). Old code's version check (`storage.js:271-275`) would then raise its conflict prompt. The pre-migrate copy is the real rollback copy anyway.

**M13. `remote-deleted` is dangerous after an accidental trash.**
- Someone trashing the file in the Drive UI by mistake is more likely than delete-all. The app created the file, so it can un-trash it: offer "שחזר מהאשפה" (`PATCH {trashed:false}`).
- Put a confirmation on "מחק גם מהמכשיר הזה".
- Treat 404 as "run discovery" (B2), not as deleted.

---

## Minor

1. **AC-Q6 vs the meeting form.** The meeting-date input has `max=ref+1` (`student.js:49`). With today = 10-08, setting 10-10 there clears the field rather than giving 10-11. AC-U4 also uses a Saturday meeting date (10-03) and gets the arithmetic wrong ("Saturday + 7 = 10-10"). Resolved by Q6 below.
2. **AC-H3 can't be satisfied as stated.** Scheduled or checkup items alone can exceed capacity, so it should read "suggested items are placed only where load < capacity". The Saturday property needs a generator that only produces valid docs. AC-H4 never gives C's last meeting date.
3. **Empty `workdays`.** Settings allow it (`settings.js:76`), and migrating `[6]` → `[]` produces it. The new placement walk has no bound and would loop forever. Fall back to Sun–Fri and cap the loop, as the current code does with 3650.
4. **P0 typecheck fails.** `tsconfig.strict.json` covers `domain/ import/ storage/ sync/`, which are empty at P0, so tsc errors with TS18003. Add the config when the first file lands.
5. **P2 shape mismatch.** `vcard.js` outputs `contacts`, but the v1 model renders `phones[]` (`student.js:16-17`), so P2 needs an adapter. The existing `tests/vcf.test.js:16-19` asserts email and home phone, so P2 must say explicitly that those tests are being changed (per CLAUDE.md, never silently).
6. **Drafts.** Move localStorage drafts into IDB at P8. Clear drafts on sign-out in P1/P2. Define how unchecked checkboxes are restored. Restoring must tolerate topic ids that are no longer open.
7. **iOS Safari storage eviction.** Safari in a tab (not the installed PWA) wipes IDB after 7 days without use, losing unsynced edits and drafts. Call `navigator.storage.persist()` and warn when there are unsynced edits.
8. **`settings` is one LWW entity.** Acknowledging the notices on one device can silently wipe a `workdays` or `meetingsPerDay` change made on another. Use per-field LWW, or split out `noticesAck`.
9. **Conflict entity stamps** (`updatedAt`/`by`) must come from the inputs, never from `now`, or the merge stops being commutative and idempotent. Restoring from file will produce a burst of conflicts (every changed summary). Suppress them for restores.
10. **Deterministic `next:{sid}` id.** A meeting that closes the next can overwrite a concurrent reschedule from another device. Acceptable, but document it.
11. **P2 noticesAck.** P2 stores the ack in localStorage. At P8 it must be copied into `settings.noticesAck` at boot, or users see the notices again.

---

## Cut or defer

- **P2 does work twice.** It wires `mapAuthError`, sign-out/disconnect and notices into `storage.js`/the old store, and P8b deletes all of that. Keep P2 to import minimization, CSP/fonts and `dateInput`, and move the rest to P8b. That's unless the user wants them shipped early.
- **Legacy catch-up:** use the marker approach from M12, or put a time limit on it.
- **Alternatives not weighed:** a DOM morph for `setHTML` was never compared with the render scheduler. It could replace most of the scheduler and B4's special-casing.

---

## What holds up

- **Code claims:** all verified.
  - 6 `innerHTML` writes in `app.js`.
  - `raw()` is used only for boolean attributes.
  - The only `style=` is `ui.js:50`.
  - `ensureFolder` re-creates a trashed folder.
  - `about` doesn't request `permissionId`.
  - `signOut` revokes and keeps local data.
  - There are 13 tests.
  - The `.gitignore` exception is as described.
  - The focus-handler bug explanation is correct (`app.js:466-478`, `store.js:133-139`).
- **Numbers I recomputed, all correct:** the P5 suggestion table (A 400, D 277.6, B 266.7, H on 10-11, G 10-16, F 10-29, no item on 10-10), AC-P3.2, AC-N4, AC-W1, AC-MIG2, AC-MIG4 and AC-MIG5 (key 2026-09-06).
- **Sound decisions:**
  - Keeping the escaping template behind a guarded sink.
  - A new v2 file instead of overwriting v1.
  - Deterministic completion ids.
  - The conflict set stays associative.
  - Re-stamping and tombstoning on restore.
- **Google APIs:** an appProperties query, `PATCH trashed` on an app-created folder and `about.permissionId` all work under `drive.file`. `files.copy` works too, with the B3 caveat.

---

## §8 recommendations

1. **`staleDays`:** keep it. Users have configured it, and dropping it would be a regression.
2. **Sign-out clears the local copy:** yes, but it isn't enough on its own. Add the shared-device mode from M3.
3. **"פעם במחצית":** add a school-half unit (Sep–Jan, Feb–Aug). It's a few lines in `periods()`. month/5 already drifts in the first year: Sep–Jan, Feb–Jun, then Jul–Nov.
4. **Old backups with address/email:** scrub actively with a time limit. Delete the legacy `backup-*.json` files and `pre-migrate-*` about 30 days after migration, once 14 v2 dailies exist. Otherwise monthly backups keep addresses for up to 12 months, and pre-migrate keeps them forever, since it's pruned only after 5 newer snapshots and restores are rare.
5. **Needs-attention eligible today:** yes. Capacity spreading still applies.
6. **Saturday shift on all dates:** split it. Yes for planned, checkup, snooze and due dates. No for the meeting date: it records history, school weekends (שבת כיתתית) are real, and it causes the AC-Q6 contradiction.
7. **Trial → Drive:** merge with a confirmation that shows counts and warns about duplicate names (normalized). Trial ids are random, so the same class entered twice produces duplicate students. Delete the trial database afterwards.
8. **Out of scope:** agree with all four.

---

## Open questions for the user

- **Shared computers (M3):** add a "shared computer" mode with session-only storage, a time limit on opening offline, or accept the risk?
- **Migrated recurring goals (M10):** count adherence for periods before the migration, which will show retroactive "missed" periods, or only from the migration date on?
- **Deleting a student:** should it win over concurrent offline edits (sticky delete)? I recommend yes for minors' data.
- **Rollout:** is a feature-flag canary on your own account acceptable before v2 sync goes live for everyone?
