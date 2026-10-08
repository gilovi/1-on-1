# Decisions after the blind-plan comparison (2026-10-08)

Taken by the user after reading `2026-10-08-comparison.md`.

1. **Approach: hybrid rebuild.** Keep the existing screens and features. Rebuild the data layer (schema, sync/merge, IndexedDB local copy, recurrence) following `2026-10-08-architect-plan.md`, with a migration from the current `one-on-one-data.json` format. Work goes through the pipeline: architect (hybrid plan, with code context) → critic → qa (red) → builder (green) → reviewer.
2. **Scope of the next round:** all four groups.
   - **Data safety:** fix the typing-loss bug, meeting drafts, IndexedDB local copy + offline use, entity-level merge across devices.
   - **Goals & stats:** calendar-period recurring goals with missed periods and adherence, meetings-per-week trend, coverage.
   - **Privacy & distribution:** names-only import (phones opt-in; no address/email), sign-out without revoking consent + a separate disconnect, delete-all, first-run privacy and mandatory-reporting notices, Hebrew auth-error messages, CSP, self-hosted fonts.
   - **UX additions:** needs-attention flag, persistent topic priority, snooze on suggestions, checkup chips and new-topics field in the meeting form, Saturday → Sunday shift on all date inputs, mobile bottom nav / sticky "record meeting".
3. **Parent meetings do not count** as meeting the student: they're logged but don't reset the "not met lately" clock or the cadence.
4. **"Delete all data" moves the Drive folder to the trash** (recoverable for 30 days), after a typed confirmation, and clears local data.
