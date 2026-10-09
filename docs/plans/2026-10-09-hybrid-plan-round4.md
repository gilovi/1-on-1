# Hybrid plan: Round 4 amendments (2026-10-09)

> Produced by the **architect** agent. These amendments extend `2026-10-08-hybrid-plan.md` (v3) and resolve every Round 3 finding in `2026-10-08-critic-review.md`. **Where this file and v3 differ, this file wins.** Decisions 1–15 in `2026-10-08-decisions.md` still hold.

**Can P1 and P3 start?**
- **P1: yes, now.** Its scope gains M-1 (morph implicit keys, a wider F12, the new F15), M-3 (drafts store `baseText`) and m-6 (the AC-CH baseline and D10).
- **P3: yes, now.** Its scope gains the pending-entry shape, the `maxSeen` definition, `doc.uploads` in the schema, AC-N1 (revised) and AC-N7.
- **P6 and P7:** the design no longer blocks them. Two parts go further than the critic's fixes: confirmation through an upload vector, and the field-level rule R3. A short critic check of §3.2 is recommended before qa writes the P6 red tests.
- **P2:** already merged; affected only by D10 and the AC-CH ordering rule.

## Resolutions

| ID | Resolution | Replaces or extends | Phases |
|---|---|---|---|
| **B-5** | **Better than the critic's fix.** The critic's one-hop case (`R.base == id(L)`) is kept as rule R2. It misses multi-hop descendants: A uploads A1 and goes offline; B writes B1 (based on A1), B1 is confirmed, then B writes B2 (based on B1); A returns with A1 still pending, R2 doesn't fire, and A1 overwrites B2. The fix adds a synced per-device upload counter, `doc.uploads`. Pending ids are confirmed against it **before** merging, by identity. | §2.1 (`uploads`), §3.1, §3.2 R2, §3.3 steps 2–4. ACs: M9b, M15 (revised), Y9 (rewritten), Y10, Y11 | P3, P6, P7 |
| **B-6** | **The critic's fix, made a general rule.** New rule R0: two versions by this device never conflict (LWW). The final write becomes the pure function `finalizeSync`, which takes the user's in-sync edit on top of the merge's re-stamp. `maxSeen` covers every stamp written or merged. | §3.2 R0 and "Final write"; §3.3 step 3. ACs: M8 (restated), M8b, M8c | P6, P7 |
| **M-1** | **The critic's fix, plus implicit keys.** Repeated `label.check` items get `data-key`. F12 is widened. In the morph, a checkbox or radio is identified by `@name=value`, and an unkeyed element containing exactly one checkbox or radio uses that as its implicit key. | §1.2 Morph. ACs: F12 (revised), F15 | P1 |
| **M-2** | **More general than the critic's fix.** A pending entry records which fields its edits changed (`fields`). Rule R3 merges field by field: L's changed fields are kept, and every other field is taken from R when R is newer than L's base. The critic's `{text: bool}` is the special case. This also keeps a concurrent snooze. | §3.1 pending entry, §3.2 R3. ACs: M18, M19, N1 | P3, P6 |
| **M-3** | **The critic's first option.** Drafts store `baseText`, and the save-time check compares text, not identity. `baseText` moves forward after each save, and when the morph writes a stored value into a control the user hasn't changed. | §1.2 Drafts, §3.2 save-time check. ACs: M16 (revised), M20, F14 (revised), F4 (draft shape) | P1 (storage only), P6, P8 |
| m-1 | Confirmation is by identity plus the upload counter; the watermark is removed. `maxSeen` is defined. | §3.1. ACs: Y9, N1 | P3, P7 |
| m-2 | The rule order is explicit (R0–R4). Epoch only applies to students. | §3.2 | P6 |
| m-3 | Accepted. Outside `students`, a tombstone and a live version resolve by LWW and no conflict is recorded. | §3.2 R4. AC: M21 | P6 |
| m-4 | Restore uses `tx` stamping. | §3.2 Restore. AC: B53 | P7, P8c-2 |
| m-5 | AC-Z5 is restated: dismissing tombstones the conflict. | AC-Z5 | P8b |
| m-6 | P2's import commit (`fa4ffb3`) is already merged, so AC-CH's baseline is the branch as it stands when P1(a) starts. D7 and D8 then need no v1 variant. **D10** is added. Fixture planned and checkup dates avoid Saturday. | §6 D-list, P1/P2 rows | P1, P2 |
| m-7 | In shared mode, only one tab per session may run, enforced with a Web Lock. Upload numbers are taken as `max(local, remote) + 1`. | §3.1 shared mode. AC: Y7 | P7, P8c-1 |
| m-8 | m7 is created at T7, and its cascaded tombstone is expected at T7+1ms. | AC-M11 | P6 |
| m-9 | AC-L7 gets a case where the file is trashed but its folder is live. | AC-L7 | P7 |

## Supporting edits

**§2.1, schema.** Add the doc-level field `uploads: {[deviceId]: positive int}`. It is synced, merged by taking the maximum per key, starts as `{}` from `migrateV1`, and is checked by `validateDoc`. A restore keeps the current doc's `uploads`.

**§1.2, morph (M-1).**
- A checkbox or radio's identity chain ends with `@{name}={value}`.
- When matching unkeyed siblings, an element whose subtree contains exactly one checkbox or radio uses `@{name}={value}` as its implicit key, before positional matching is tried.
- `<option>`s are never matched on their own: `<select>.value` is synced as a whole.
- The views add `data-key` to:
  - the topic and goal `label.check` items (`js/views/student.js:63,69`), keyed by topic or goal id;
  - the workday labels (`settings.js:31`), keyed by day index;
  - static `label.field` siblings, with constant keys.

**§1.2, drafts (M-3).**
- A draft is `{fields, baseText: {[protectedField]: string}, savedAt}`. The `base` field is removed.
- `baseText[f]` is the stored value the control last showed. It is set:
  - when the form opens;
  - after each successful save or autosave, to the saved value;
  - when the morph writes a new stored value into a control that is neither focused nor dirty.
- In P1 (v1), `baseText` is only stored.

**§3.3, sync engine, steps 2–4 (replaced).**
- **Step 2.** Under `doc:` lock, take a snapshot `local0` of the doc and `meta.pending`. Download the remote if its version changed. Confirm pending ids (§3.1). Compute `M, pendingM = merge(local0, remote, ctx)`.
- **Step 3.** If `M` differs from the remote, upload it with `uploads[deviceId] = n` (see §3.1).
- **Step 4.** Under `doc:` lock:
  - `final = finalizeSync(...)` (§3.2);
  - update the bookkeeping (§3.1) and set `maxSeen`;
  - `dirty = content(final) ≠ content(uploaded or remote)`;
  - `gen+1`, then broadcast.
- If the upload fails, step 4 still writes `final` but leaves `up`, `upSeq` and `uploadSeq` unchanged.

**§7, risks (added).**
- `uploads` gains one entry per sign-in per device, about 40 bytes each, and is never pruned.
- Without If-Match, an upload overwritten in a race is detected, not prevented. The device stays pending and uploads again. Convergence needs one sync round with no race.

---

## §3.1, replacement: pending entries, `tx` stamping and confirming pending ids

This replaces these v3 parts of §3.1: the `pending`/`uploadedWatermark` and `maxSeen` meta bullets, Dispatch step 4, "`tx` stamping" and "Confirming pending ids".

**Meta fields (device-local)**
- `deviceId`: generated whenever meta is created fresh, so a new DB or a new session gets a new one.
- `uploadSeq`: the last upload number this device used.
- `maxSeen`: the largest `updatedAt` this device has written (by `tx`, re-stamp, normalization or restore) or merged in (every version in every downloaded remote or merged loser file). It is updated in the same IDB transaction as the doc write.
- `pending: {[coll:id]: PendingEntry}`, where:

```
PendingEntry = {
  fields: string[],               // top-level content fields changed by local edits in this lineage
  seen:   {[protectedField]: string[]}, // values this device has accounted for in this lineage
  up:     {updatedAt, by} | null, // identity of this key's version in the last successful upload
  upSeq:  int | null              // the upload number that first carried `up`
}
```

- **Lineage.** A lineage starts when a key enters `pending` and ends when the key leaves it.
- **Invariant:** if a key is in `pending`, then the local version of that entity has `by === deviceId`.

**Dispatch, step 4 (replaced).** Write the doc and meta: `dirty`, `editSeq+1`, `gen+1`, and the `pending` entry of every touched key, as set by `tx`.

**`tx` stamping**
- A `tx` that changes no field is a no-op: no stamp, no entry, and the doc is reference-equal.
- `updatedAt = max(now, maxSeen + 1ms)`, and then `meta.maxSeen = updatedAt`.
- `by = deviceId`.
- `base`:
  - if the key is in `pending`, keep `old.base`;
  - otherwise, `{updatedAt: old.updatedAt, by: old.by}`;
  - for a new entity, `null`.
- **When a lineage starts:**
  - `fields` = the changed fields;
  - `seen[f]` = `[old[f]]` for each protected field, or `[]` for a create;
  - `up` and `upSeq` = `null`.
- **When a lineage continues:** `fields` gains the changed fields; `seen`, `up` and `upSeq` are unchanged.
- **Creates and deletes:** `fields` = every content field.

**Upload numbering.** Each upload uses `n = max(meta.uploadSeq, remote.uploads[deviceId] ?? 0) + 1` and sets `uploads[deviceId] = n` in the uploaded doc. After it succeeds:
- `meta.uploadSeq = n`;
- for every pending key, if `up` differs from the identity of the key's version in the uploaded doc, set `up` to that identity and `upSeq = n`;
- add that version's protected-field values to `seen`.

**Confirming pending ids.** This runs in the sync engine, under `doc:` lock, **before** the merge.
- Let `U` be `remote.uploads`. If the remote's metadata version equals the version our last upload returned, `U` is the `uploads` of the doc we uploaded, and there is no download.
- An entry leaves `pending` when all three hold:
  - `up ≠ null`;
  - `U[deviceId] ≥ upSeq`;
  - the identity of the current local version equals `up`.
- **Why this is sound:** only this device writes `uploads[deviceId]`, and merging takes the maximum. So `U[deviceId] ≥ upSeq` means the remote doc descends, through merges, from our upload `upSeq`. Every version in that upload was merged in, and anything that replaced it there was produced by a merge that saw it.
- **A race fails safe.** An upload overwritten without If-Match leaves `U[deviceId] < upSeq`, so the entry stays pending and is uploaded again.

**Entries also leave `pending` during a merge (§3.2):**
- rule R2 applies (the remote descends from L);
- rule R3's result equals R's content;
- after a merge, the local version no longer has `by === deviceId` (it lost to a tombstone, a higher epoch or LWW).

**Shared mode (m-7)**
- `deviceId`, meta, the doc and drafts live in `sessionStorage`.
- At boot the tab requests the Web Lock `shared:{deviceId}` with `ifAvailable`. A duplicated tab doesn't get it. It then:
  - shows "האפליקציה פתוחה בלשונית אחרת";
  - renders no data and makes no Drive calls;
  - waits on the lock and continues once the first tab closes.
- The `max(…) + 1` upload numbering keeps upload numbers unique when tabs take turns.

---

## §3.2, replacement: Merge (`domain/merge.js`)

**Signatures**
- `merge(a, b, ctx = {deviceId, pending}) → {doc, pending}`: symmetric and pure.
- `finalizeSync({local0, cur, merged, pendingCur, pendingMerged, deviceId}) → {doc, pending}`: pure.
- No `Date.now()` is used anywhere: every stamp comes from the inputs.

**Doc-level fields**
- `uploads` is merged by per-key maximum.
- `schemaVersion` follows §2.2.

**Definitions**
- `id(V) = {updatedAt, by}`.
- `>_LWW` orders versions by `(updatedAt, by, canonicalJSON)`. A `base` (`{updatedAt, by}`) is compared on its first two keys. `null` is lower than everything.
- **Pending version L.** Of the two versions of a key, L is the one with `by === deviceId` when the key is in `ctx.pending`. R is the other. If neither version qualifies, there is no L.
- **Content** means every field except `id`, `createdAt`, `updatedAt`, `by` and `base`. Tombstones are compared on their kept keys.

**Rules for each key present on both sides, applied in this order (m-2)**

- **Same identity.** Take the `>_LWW` maximum, which is normally identical content.
- **R0, own versions (B-6).**
  - **When:** both versions have `by === deviceId`.
  - **Result:** LWW, with no conflict.
  - Normally this gives the local version. The one exception, a re-stamp made during a sync, is handled by `finalizeSync`.
- **R1, students: epoch and tombstone (B-3).**
  - **When:** the epochs differ, or exactly one version is a tombstone.
  - **Result:** the maximum of `(epoch, isTombstone)` wins.
  - **Higher-epoch restore:** if a pending live L loses to a live version with a higher epoch, then for each protected field `f` in `L.fields` where `L[f]` differs from the winner's, record a conflict with L's text, stamped from L.
  - **Tombstone winner:** no conflict (sticky delete, AC-M11).
  - **Both tombstones at the same epoch:** LWW.
  - **Both live at the same epoch:** continue to R2.
  - For other collections, a tombstone against a live version goes straight to R4.
- **R2, descendant (B-5).**
  - **When:** L exists and `R.base` equals `id(L)`.
  - **Result:** R wins, with no conflict, and the key leaves `pending`.
- **R3, concurrent pending edit: field merge (B-1, M-2).**
  - **When:** L exists, both versions are live and, for students, at the same epoch.
  - **Content C:**
    - fields in `pending[key].fields` take L's value;
    - every other content field takes `R[f]` if `R >_LWW L.base`, otherwise `L[f]`.
  - **Conflicts:** for each protected field `f` in `L.fields`, record a conflict when all three hold:
    - `R[f] ≠ L[f]`;
    - `R[f]` is not in `seen[f]`;
    - `R >_LWW L.base`.

    The conflict is stamped from R, and `R[f]` is then added to `seen[f]`.
  - **Result:**
    - If `C` deep-equals R's content: the result is R, and the key leaves `pending`.
    - Else, if `R ≤_LWW L.base` (R is an ancestor or a stale copy; `C` then equals L's content): the result is L, unchanged.
    - Else **re-stamp:** `C` with `updatedAt = max(L.updatedAt, R.updatedAt) + 1ms`, `by = deviceId` and `base = id(R)`. The key stays pending, and `fields` is unchanged.
  - The re-stamp's `base = id(R)` lets R's own device recognise it as a descendant (R2).
- **R4, everything else.**
  - **Result:** LWW, with no conflict.
  - This covers keys that aren't pending, and tombstone-versus-live in every collection other than `students`.
  - **Accepted behaviour (m-3).** A pending meeting edit loses to a later tombstone and its summary is dropped. A pending edit stamped after the tombstone revives the entity.

**Final write: `finalizeSync` (B-6).** For each key:
- **The key wasn't edited during the sync** (same identity in `cur` and `local0`, or absent from both): take `merged`, with `pendingMerged`'s entry.
- **The key was edited during the sync:**
  - If `merged` is absent, or has the same identity as `local0`: take `cur`.
  - Else, if `merged` has `by === deviceId` and both `merged` and `cur` are live (the sync re-stamped `local0`):
    - take `cur`'s values for `pendingCur[key].fields` and `merged`'s values for every other field;
    - stamp it `updatedAt = max(cur.updatedAt, merged.updatedAt) + 1ms`, `by = deviceId`, `base = merged.base`;
    - the entry is `pendingCur`'s, with `seen` joined with `pendingMerged`'s;
    - no new conflict is recorded, because the merge already recorded R.
  - Otherwise: `merge(cur, merged, {deviceId, pending: pendingCur})`.
- **Keys created during the sync:** take `cur`.
- **Doc-level fields:** `uploads` is the per-key maximum of all three docs; conflicts are taken by key from `merged` and `cur`.
- **Then:** run post-merge normalization on the result, and set `maxSeen = max(maxSeen, every updatedAt in the final doc)`.

**Post-merge normalization.** Unchanged from v3:
- every live child of a tombstoned student is tombstoned, including conflicts on those entities;
- the child's stamp is `updatedAt = max(child.updatedAt + 1ms, student.updatedAt)`, `by = student.by`;
- the pending invariant is then re-applied.

**Save-time check (M-3).** This applies to `editMeeting` and `setNotes`, including autosaves.
- **When:** the current stored `f` differs from both `draft.baseText[f]` and the new value.
- **Then:** write a conflict with `lostText = current[f]`, stamped from the current version.
- **The edit itself** is a normal `tx`.
- After a confirmed re-stamp, the current text is the user's own last save, which equals `baseText`, so no conflict is recorded.

**Restore (m-4)**
- A restore is one `tx` under the `doc:` lock: `updatedAt = max(now, maxSeen + 1ms)`; `base` and `pending` follow the `tx` rule.
- Restored students get `epoch = current.epoch + 1`.
- Ids missing from the backup are tombstoned.
- `uploads` is kept from the current doc.
- **No conflicts result.** An unchanged remote is the restore's base or older, so R3 keeps L. A newer epoch wins under R1.

**Conflicts**
- **Key:** `${coll}:${entityId}:${field}:${lost.updatedAt}:${lost.by}`. Stamps come only from the inputs.
- **Never expired.**
- **Removed only by:**
  - dismissal, a `tx` that tombstones the conflict and strips `lostText`; its later stamp outranks any re-derived copy, which carries the older stamp of the losing version;
  - the student cascade.

**Properties**
- `merge` is idempotent and commutative for any `ctx` that satisfies the pending invariant.
- With an empty `ctx.pending`, R0–R4 reduce to the R1 total order plus LWW, which is associative. Uploads merge by maximum; conflicts are entities under LWW.
- In the app, merges are only ever binary.

**Convergence: two devices, three devices, races and the final write**
1. **Re-stamps** happen only for this device's pending keys. Each one descends from R (`base = id(R)`) and contains every field this device changed.
2. **Pending empties once edits stop.** After a sync round with no race, every pending entry leaves. Either:
   - the device's own upload, or a doc merged from it, is the remote, so the counter confirms the entry; or
   - another device's descendant reaches it first (R2); or
   - R already contains its changes.
3. **With every `pending` empty,** merging is a join-semilattice (R1 order, LWW, maximum, union), so all devices converge after each syncs once more.
4. **Conflict counts:** a pair of concurrent text edits produces 1 conflict; three concurrent edits produce 2 (AC-Y12).
5. **Races (no If-Match).** An overwritten upload leaves `U[deviceId] < upSeq`, so its keys stay pending and are re-merged. Its non-pending versions are still in its local doc and come back through LWW on its next upload. Nothing is confirmed that the remote lacks (AC-Y11).
6. **The final write** returns one of three things:
   - `cur`;
   - a re-stamp descending from `merged`, which was already uploaded;
   - `merge(cur, merged)`.

   Any difference from the upload sets `dirty`, which starts another sync (AC-M8b, AC-M8c).
7. **The stale-remote path.** When R is older than L's base (left behind by a race), R3 keeps L's fields instead of reverting them (AC-M19).

---

## New and changed acceptance criteria

The fixtures of v3 §6 apply. Merge times are on 2026-10-08, in UTC with millisecond precision. `n0` is s1's notes at T0 = 08:00 by `dev-a`, synced, unless stated otherwise.

### P1

- **AC-CH (changed, m-6).**
  - The tests are written green against the branch at the start of P1(a). Behaviour already merged from P2 (`fa4ffb3`: D7, D8) is the baseline.
  - Any later P2 commit that changes an AC-CH assertion updates it in its own explicit commit.
  - The planned and checkup dates in `v1-class.json` are not Saturdays.
  - **D10 (v1, P2):** a Saturday entered into an `input[data-no-saturday]` becomes the next Sunday, with an announcement. One AC-CH test covers it.
- **AC-F4 (changed).** A stored draft has the shape `{fields, baseText, savedAt}`. The other expectations are unchanged.
- **AC-F12 (revised, M-1).** Render every v1 view with the fixture (and from P8a every v2 view), including a meeting form with 2 or more open topics and 2 or more open goals, the settings form, and an import preview. Assert:
  1. every element child of a `ul`, `ol` or `tbody` that has a same-tag sibling has `data-key`;
  2. every element that has a same-tag element sibling and contains an `input`, `textarea` or `select` has `data-key` (`option` elements are exempt);
  3. `data-key` values are unique among siblings;
  4. every `form` inside such an item has `data-id` or `data-draft`.
- **AC-F14 (extended, M-3).** Existing expectations are kept.
  - **Remote update to a quiet textarea:** a remote change sets the notes to "R2" while the textarea is neither focused nor dirty. The textarea shows "R2", and `draft.baseText.notes === 'R2'`.
- **AC-F15 (new, M-1).**
  - **Setup:**
    - s1 has open topics t1 "א" (order 1024) and t2 "ב" (order 2048);
    - the new-meeting form is open, and t2 is ticked with focus kept;
    - a remote change inserts t0 "ג" (order 512).
  - **Expected:**
    - the topic checkboxes are, in order, `t0, t1, t2`;
    - only t2 is checked;
    - `document.activeElement` is t2's checkbox;
    - draft `meeting:new:s1` has `fields.topicIds = ['t2']`.
  - **Variant (morph unit test, all `data-key` removed from the markup):** the same expectations hold, through the implicit key `@topicIds=t2`.

### P3

- **AC-N1 (revised, m-1, M-2).**
  - **Stamping when the clock steps back:** with `maxSeen = 10:00:00.000` and `now = 09:00`, the stamp is `10:00:00.001` and `meta.maxSeen` becomes `10:00:00.001`.
  - **A first edit starts a lineage.** Editing the notes of s1, whose version is `{08:00, 'dev-b', notes:'x'}` and whose key isn't pending, gives:
    - `base = {08:00,'dev-b'}`;
    - `pending['students:s1'] = {fields:['notes'], seen:{notes:['x']}, up:null, upSeq:null}`.
  - **A second edit continues it.** A second edit, to `snoozedUntil`, keeps the same `base`, gives `fields = ['notes','snoozedUntil']`, and leaves `seen` unchanged.
  - **A no-op edit.** Setting the notes to their current value makes no stamp, doesn't change the entry, and returns a reference-equal doc.
  - **A create.** Creating m9 gives `base = null`, `fields` = every content field of a meeting, and `seen = {summary: []}`.
  - **Unchanged:** untouched entities are reference-equal, and the input is frozen.
- **AC-N7 (new).**
  - `migrateV1(...)` produces `uploads: {}`.
  - `validateDoc` rejects `uploads` values of `0`, `-1`, `1.5` and `'2'`.

### P6

- **AC-35 (unchanged numbers, now through R3).**
  - **Setup:** L = `{T5,'dev-a', base {T3,'x'}, notes 'A'}` is pending with `fields ['notes']`. R = `{T4,'dev-b', base {T3,'x'}, notes 'B'}`.
  - **Expected:**
    - the result is 'A' at `T5+1ms`, with `base {T4,'dev-b'}`;
    - there is 1 conflict, with `lostText 'B'`, stamped `{T4,'dev-b'}`;
    - swapping the arguments gives an identical result.
- **AC-M8 (restated through `finalizeSync`).**
  - **Setup:**
    - `local0` holds "ab" `{T5,'dev-a'}`, pending, with `base {T0,'dev-a'}`;
    - the remote holds this device's earlier "a" `{T4,'dev-a'}`, so `merged` = "ab" (R0);
    - `cur` holds "abc" `{T6,'dev-a'}`.
  - **Expected:** "abc" with identity `{T6,'dev-a'}`, unchanged, and 0 conflicts.
- **AC-M8b (new, B-6).**
  - **Setup:**
    - `local0` holds "ab" `{T5,'dev-a'}`, pending, with `base {T0,'dev-a'}` and `seen {notes:['n0']}`;
    - the remote holds R = "R" `{T9,'dev-b', base {T0,'dev-a'}}` (dev-b's clock is fast);
    - `cur` holds "abc" `{T6,'dev-a'}`, typed during the sync.
  - **What `merged` must be:** "ab" at `T9+1ms`, with `base {T9,'dev-b'}`, plus a conflict "R" stamped `{T9,'dev-b'}`.
  - **The final doc:**
    - the notes are "abc", with `updatedAt = T9+2ms`, `by 'dev-a'`, `base {T9,'dev-b'}`;
    - there is exactly 1 conflict;
    - s1 stays pending, with `up = {T9+1ms,'dev-a'}`;
    - `dirty` is true;
    - `maxSeen ≥ T9+2ms`.
  - **On screen (P8c-1):** the textarea shows "abc" and keeps focus.
- **AC-M8c (new).**
  - **Setup:**
    - `local0` holds "ab" `{T5,'dev-a'}`, pending, with `seen {notes:['n0','ab']}`;
    - the remote holds R = "abX" `{T7,'dev-b', base {T5,'dev-a'}}`, so `merged` = R (R2);
    - `cur` holds "abc" `{T6,'dev-a'}`.
  - **Expected:** "abc" at `T7+1ms`, with `base {T7,'dev-b'}`; 1 conflict, "abX", stamped `{T7,'dev-b'}`; s1 stays pending.
- **AC-M9b (new, B-5).**
  - **Setup:** A1 `{T1,'dev-a', base {T0,'dev-a'}}` is in `ctx.pending`. R = B1 `{T2,'dev-b', base {T1,'dev-a'}}`.
  - **Expected:** the result is B1, with 0 conflicts, and s1 leaves `pending`. Swapping the arguments gives an identical result.
- **AC-M11 (fixed, m-8).**
  - **Setup:**
    - B tombstones s1 at T5 (epoch 0);
    - A, offline, edits the notes at T6 and creates m7 at T7.
  - **Expected, with the merge done in both orders:**
    - s1 is a tombstone;
    - m7 is a tombstone with `updatedAt = T7+1ms` and `by 'dev-b'`;
    - there are 0 conflicts;
    - A's pending entries for s1 and m7 are removed.
  - **A restore (epoch 1)** revives s1.
- **AC-M15 (revised, B-5).**
  - **Setup:**
    - B, offline, writes B1 at 09:00 with `base {T0,'dev-a'}`. It is pending, with `seen {notes:['n0']}`.
    - A writes A1 at 10:00 (`base` T0) and uploads it, then writes A2 at 10:05. A2 keeps `base` T0 (same lineage), A uploads it, and it is **unconfirmed**, with `seen {notes:['n0','A1']}`.
  - **B merges A2:**
    - the result is "B1" at `10:05:00.001`, `by dev-b`, `base {10:05,'dev-a'}`;
    - there is 1 conflict, `lostText 'A2'`, stamped `{10:05,'dev-a'}`.
  - **A merges B's upload,** in both cases giving "B1" and 0 new conflicts:
    - with A2 still in `ctx.pending`, through R2;
    - with A2 confirmed, through R4.
  - **Total:** 1 conflict. The repeated-sync form of this case is AC-Y10.
- **AC-M16 (revised, M-3).**
  - **Main case.** The notes autosave "a", "ab" and "abc", with one sync between the 1st and 2nd saves. Then:
    - there are 0 conflicts;
    - after each save, `draft.baseText.notes` equals the text just saved;
    - after the 3rd save, s1 stays pending (it isn't confirmed yet, and the local version isn't the uploaded one).
  - **Variant.** A sync between saves 2 and 3 brings in R = "R" (`dev-b`, `base` T0):
    - exactly 1 conflict, "R";
    - save 3 adds no conflict, because the current "ab" equals `baseText`;
    - the textarea shows "abc".
- **AC-M18 (new, M-2).** s1 starts as S0 = `{08:00,'dev-l', notes 'n0', snoozedUntil null}`.
  - **Setup:**
    - the phone (`dev-p`), offline, snoozes s1 at 09:00, setting `snoozedUntil` to '2026-10-09'. This version is pending, with `fields ['snoozedUntil']`.
    - the laptop writes N1 = "n1" `{10:00,'dev-l', base {08:00,'dev-l'}}`, and N1 is confirmed.
  - **The phone merges N1:**
    - the result is `{notes 'n1', snoozedUntil '2026-10-09'}` at `10:00:00.001`, `by dev-p`, `base {10:00,'dev-l'}`;
    - there are 0 conflicts.
  - **The laptop, with nothing pending, merges the phone's upload:** the same content, and 0 conflicts.
  - **Variant 1: the laptop still has N1 pending.** Through R2, the result is the phone's version, with 0 conflicts.
  - **Variant 2: the laptop has typed further.**
    - **Setup:** the laptop holds N2 = "n12" at 10:10, pending, with `seen {notes:['n0','n1']}`.
    - **Expected:** "n12" with `snoozedUntil '2026-10-09'`, at `10:10:00.001`, with `base {10:00:00.001,'dev-p'}`, and 0 conflicts.
- **AC-M19 (new, a remote older than L's base).**
  - **Setup:**
    - V1 = `{09:00,'dev-b', notes 'v1'}`;
    - V2 = `{10:00,'dev-c', base {09:00,'dev-b'}, notes 'v2', needsAttention {flag:true, reason:'x'}}`;
    - A holds V2 and snoozes s1 at 11:00. This is pending, with `fields ['snoozedUntil']`.
    - The remote, left behind by a race, holds V1.
  - **Expected:**
    - A's version is unchanged: notes 'v2', the attention flag true, and the snooze set;
    - there are 0 conflicts, and s1 stays pending;
    - swapping the arguments gives an identical result.
- **AC-M20 (new, M-3).**
  - **Main case.**
    - **Setup:**
      - the stored notes are "a" `{08:00,'dev-a'}`, confirmed, and the form opens with `baseText 'a'`;
      - autosave "ab" at 09:00;
      - a sync brings in R = "R" `{09:30,'dev-b', base {08:00,'dev-a'}}`;
      - the next sync confirms "ab"*;
      - the user types "abc", which autosaves.
    - **What the R sync produces:** a conflict "R", and "ab"* at `09:30:00.001`.
    - **Expected:** the save adds no conflict, so the total is 1.
  - **Variant.**
    - **Setup:** the user typed "ax", which is dirty but not yet autosaved. R3 = "R3" arrives with nothing pending.
    - **Expected:** the textarea keeps "ax", and `baseText` stays 'a'. The autosave of "ax" records 1 conflict, "R3".
- **AC-M21 (new, m-3).** Meeting m1 has summary "s0".
  - **Delete after the edit:** A, offline, edits the summary to "s1" at 10:00 (pending), and B tombstones m1 at 11:00. Expected: m1 is a tombstone, there are 0 conflicts, and A's pending entry is removed.
  - **Edit after the delete:** A's edit is at 12:00 instead. Expected: m1 is live with "s1" at 12:00, and there are 0 conflicts.
- **AC-M22 (new, properties).** fast-check over random versions of every collection, with a random `ctx` that satisfies the pending invariant:
  - `merge(a,b,ctx)` deep-equals `merge(b,a,ctx)`, including the returned `pending`;
  - `merge(a,a,ctx)` equals `a`;
  - with an empty `pending`, merge is associative;
  - the output doesn't depend on the mocked clock;
  - `uploads {a:2,b:1}` merged with `{a:1,c:4}` gives `{a:2,b:1,c:4}`.
- **AC-M7, M9, M10, M12–M14 and M17:** unchanged. AC-M10 now holds through `baseText`: the form opens with `baseText` = V1's text, and the 1 conflict holds V2's text.

### P7

- **AC-Y7 (extended, m-7).**
  - The v3 expectations still hold.
  - **Duplicated tab:**
    - a tab duplicated from a shared session doesn't get `shared:{deviceId}`;
    - it shows "האפליקציה פתוחה בלשונית אחרת", renders no student names, and makes 0 Drive calls;
    - after the first tab closes, it takes over;
    - if `meta.uploadSeq = 3` and `remote.uploads[dev] = 5`, its next upload carries 6.
- **AC-Y9 (rewritten, m-1, B-5).**
  - **First upload.** dev-a's first upload (with `uploadSeq 0` and remote `{}`) carries `uploads {'dev-a':1}`. s1's entry becomes `up = id(uploaded s1)`, `upSeq 1`.
  - **The next sync, with the metadata version unchanged,** makes no download, and s1 leaves `pending`.
  - **Variant: another device built on the upload.** dev-b downloaded the upload, changed m3, and uploaded `{'dev-a':1,'dev-b':1}`. dev-a downloads it, and s1 leaves `pending` before the merge.
  - **Variant: a race.**
    - **Setup:** dev-b downloaded before dev-a's upload and uploaded after it, with `{'dev-b':1}`.
    - **Expected:**
      - s1 stays pending;
      - dev-a's next upload carries `{'dev-a':2,'dev-b':1}`;
      - s1's `upSeq` stays 1, because its local version is unchanged;
      - the following sync confirms s1.
  - **Variant: edited after the upload.** If s1 was edited after the upload, it stays pending even when `U ≥ upSeq`.
  - **`maxSeen`:** after a merge that brings in a version stamped `now + 5 min`, `maxSeen` is at least that stamp, and the next edit is stamped after it.
- **AC-Y10 (new: several hops through another device, and AC-M15 at sync level).**
  - **Setup:**
    - A writes A1 at T1, uploads it (`'dev-a':1`), and goes offline;
    - B syncs, writes B1 at T2 (`base {T1,'dev-a'}`), syncs, and B1 is confirmed;
    - B writes B2 at T3 (`base {T2,'dev-b'}`) and syncs.
  - **When A comes back:**
    - A1 is confirmed before the merge, because `U['dev-a'] = 1 ≥ 1`;
    - A shows "B2", with 0 conflicts.
  - **Negative control (merge only, A1 left in `ctx.pending`):** 1 conflict. This proves confirmation must come before the merge.
  - **AC-M15's scenario run through the sync engine:**
    - after B's sync, the total is 1 conflict;
    - two more syncs on each device add 0;
    - every `pending` is empty, and the docs are deep-equal.
- **AC-Y11 (new, the race without If-Match).**
  - **Setup:**
    - s1 is n0 at T0;
    - A writes "A" at T1, and B writes "B" at T2; both are pending;
    - both download the remote (`uploads {}`); A uploads (`'dev-a':1`), then B uploads (`'dev-b':1`), overwriting A's upload.
  - **A's next sync:**
    - A isn't confirmed;
    - 1 conflict, "B", stamped `{T2,'dev-b'}`;
    - "A" at `T2+1ms`, with `base {T2,'dev-b'}`;
    - the upload carries `{'dev-a':2,'dev-b':1}`.
  - **B's next sync:** B is confirmed (`1 ≥ 1`, and its local version equals `up`), and LWW gives "A".
  - **End state:**
    - both devices show "A", with 1 conflict;
    - two more rounds add 0;
    - `pending` is empty, and the docs are deep-equal.
- **AC-Y12 (new, three devices).**
  - **Setup:** A writes "A" at T1, B writes "B" at T2 and C writes "C" at T3, all pending. Here T3 > T2+1ms.
  - **Round 1: A, B, C sync in turn.**
    - A uploads `{'dev-a':1}`;
    - B records a conflict "A" `{T1,'dev-a'}` and uploads "B" at `T2+1ms` (`base {T1,'dev-a'}`);
    - C records a conflict "B" `{T2+1ms,'dev-b'}` and uploads "C" at `T3+1ms` (`base {T2+1ms,'dev-b'}`), with `{'dev-a':1,'dev-b':1,'dev-c':1}`.
  - **Round 2:** every device is confirmed, and every device shows "C".
  - **End state:**
    - exactly 2 conflicts ("A" and "B");
    - round 3 adds 0;
    - every `pending` is empty, and the docs are deep-equal.
- **AC-L7 (extended, m-9).**
  - The v3 case is kept.
  - **New case:** the folder is live, `one-on-one-data.json` itself is trashed, and `everSynced` is false. Then:
    - there is no migration;
    - no `pre-migrate-v1-*` copy is made;
    - a fresh v2 file is created.
- **AC-B53 (revised, m-4).**
  - **Setup:** `maxSeen` is `now + 5 min`.
  - **Restore results:**
    - the restored entities are stamped `now + 5 min + 1ms`;
    - each has `base` = the previous version;
    - s1's epoch is the previous epoch + 1;
    - the missing t2 is tombstoned;
    - `uploads` is unchanged;
    - there are 0 conflicts.
  - **The next sync** against an unchanged remote also records 0 conflicts.

### P8b

- **AC-Z5 (restated, m-5).**
  - A conflict entity on m1 shows the banner on s1's page.
  - "סגור" tombstones the conflict and removes `lostText`; the banner is gone.
  - Re-deriving the same conflict on another device, stamped from the losing version, doesn't bring it back: the dismissal's later stamp wins.

### P10

- The e2e run covers AC-M8b with two browser contexts, alongside AC-M15 and AC-F11.
