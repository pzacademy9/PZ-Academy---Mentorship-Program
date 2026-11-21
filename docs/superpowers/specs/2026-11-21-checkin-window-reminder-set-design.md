# Check-in window + "Reminder set" status (design)

Date: 2026-11-21. Branch: `checkin-window-reminder-set`, cut from `history-and-copy-messages` (491dd1fb) because `attendanceMessage` in `src/lib/classes/share-messages.ts` only exists there. Size: small project (two linked jobs, one branch).

## Intent
Owner (non-technical) wants (A) the check-in window to be editable instead of the fixed 15 before / 15 after, and (B) the Classes page to say clearly when a reminder email is set, instead of "Reminder email not sent yet".

## Goals
- A: one batch default (starts 15 and 15) plus an optional per-class override. Real numbers used by `checkinWindow`, the public `/attend/[code]` page text, the Attendance tab note, and `attendanceMessage` (it already takes `openMinutes` / `closeMinutes`).
- B: `emailStatusLine` (Links and emails tab, Edit class box) and the empty state of "Who got the emails" (`ClassEmailHistory`) show "Reminder set" plus the send time when the reminder is on, has an audience, and its time is still ahead.

## Non-goals / anti-goals
- No change to the auto / open / closed switch (`window_override`).
- No new Stitch screens; build in the existing style.
- No change to the left class cards (they already show `reminderLine`).
- Must never break check-in if the migration is not yet pasted: fall back to 15 and 15.

## Constraints
- Owner pastes SQL by hand. Next free migration number: 0120 (last is 0119_portal_access.sql). Hand-add `database.types.ts` entries; never regenerate.
- CRLF line endings. Stage by explicit path only; never `git add docs`.
- Phone (390px) and PC (1440px) browser check before done. Do not write live data while testing.

## Approaches
1. Plain integer columns: batch default on the page/batch record, nullable per-class override on `batch_sessions` (null = follow batch). Simple, checkable, easy to fall back. **Chosen** (builder's pick; owner approved the plan).
2. A JSON blob of settings. Flexible but harder to validate and test. Rejected.

## Design
- Migration `0120_checkin_window.sql`: batch-level open/close minutes (default 15/15, check 0-180) and `batch_sessions.checkin_open_minutes` / `checkin_close_minutes` nullable (check 0-180 when set). Builder decides exactly where the batch default lives (next to the existing class defaults stored by `storeDefaults` in setup-actions) and may reuse that store.
- `rules.ts`: `checkinWindow(startsAtIso, override, now, openMinutes = 15, closeMinutes = 15)`; keep `CHECKIN_OPEN_MINUTES` / `CHECKIN_CLOSE_MINUTES` as the defaults. Add one pure helper `effectiveWindow(session, batchDefault)` returning `{ open, close }`.
- Callers (`attend/[code]/page.tsx`, `attend/[code]/actions.ts` x2, `AttendanceTab`) pass the effective numbers. Public page text "Check-in opens N minutes before the class."
- UI: Setup page defaults box gets "Check-in window: opens __ min before, closes __ min after". Edit class box gets "Check-in window" with "Same as the batch" or own numbers. Validation 0-180 whole numbers, plain error words.
- Share message callers feed real numbers into `attendanceMessage`.
- B: make `emailStatusLine` time-aware (takes `now` and `starts_at`/`email_lead_minutes`), reusing the logic of `reminderLine`. Texts: "Reminder set. Goes out <PKT time>" (switch on, audience chosen, send time ahead); "Reminder is due and goes out within a few minutes" (time passed, not sent); other lines unchanged. `ClassEmailHistory` empty state: "Reminder set for <PKT time>. Nothing sent yet." when set, else the old text.

## Left to the builder
Exact column placement for the batch default, naming, test layout, and where `now` comes from in B (use the same ticking clock the cards use).
