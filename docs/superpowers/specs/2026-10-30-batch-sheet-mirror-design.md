# Batch sheet mirror (PPC Batch 3) - design

Date: 2026-10-30. Branch: sheet-mirror. Next free migration: 0093.

## Why

PPC Batch 3 still sells through the old landing page, which writes each sign-up into a Google sheet
(`1OEl4BIi53bsecA562n7fci659r6I6umBj2cG-t4Bcto`). The ads keep running, so that sheet stays the master until
cutover. The app already holds the 72 Paid/Free students (imported by hand once). The owner wants new sign-ups
and status changes from the sheet to appear in the app by themselves, with every status (Pending, Free, Paid,
Underpaid, Reserved), so the registrations screen is always current.

## Goals

- Read the sheet's CSV every 15 minutes and on a manual "Sync now" button.
- Add sheet rows the app does not have yet, with their sheet status and amount.
- Apply sheet status/amount changes to rows the app has not changed itself.
- Send NO email for anything that came from the sheet (the old script already emailed).
- Paid/Free rows get their permanent PZ ID through the existing database trigger.
- Reuse the existing Plan 4 sheet-sync rules (same status rules, same "sheet" source marker).

## Non-goals / anti-goals

- Never delete or hide an app row because the sheet lost it.
- Never write to the old sheet (it is a view-only link).
- Never send a Paid/welcome email, WhatsApp message or Meta event for a sheet-origin change.
- Not a replacement for Plan 4 (that syncs sheets the app builds itself; untouched).
- Not cutover: the old page keeps running.

## Owner rulings (as given)

- 15-minute check + manual button.
- Status changed IN THE APP: the normal Paid email goes out (existing path, `queueStatusFollowUps`). If the
  batch has no WhatsApp group link, show an on-screen alert at that moment.
- Status already changed IN THE SHEET: do nothing extra (no email).
- Once a row's status has been changed in the app, the mirror stops touching that row's status/amount
  (the app wins for that row; the sheet cannot be written back).

## How it works

**Setup (per page).** Migration 0093 adds to `landing_pages`: `mirror_sheet_id text`, `mirror_last_run_at
timestamptz`, `mirror_last_result jsonb`. Existing `sheet_id` (Plan 4) is not reused. Only Batch 3 has a value.
The owner (or I via SQL they paste) sets `mirror_sheet_id`. A setting on the Registrations screen is a later
nicety, not part of this build (builder's call: SQL only).

**Memory table.** Migration 0093 adds `landing_mirror_rows (page_id, row_key, registration_id, last_status,
last_amount, last_seen_at)`, key = lower(trim(email)) + "|" + submitted-time (to the minute, as an ISO string).
This lets repeat reads change nothing and handles reused Ref IDs (match on email + submitted time, never Ref ID).

**Reader.** A server module fetches `https://docs.google.com/spreadsheets/d/<id>/export?format=csv`, parses it,
and maps the columns: Name, Email, WhatsApp, Profession, Discovery, Registration Option, Consent, Row Type,
Promo Code, Voucher URL, Submitted At, Expected Amount, Group Lead Email, Payment Method, Amount,
Payment Confirmation (status), Ref ID. The Row Type "Group Lead" / "Group Member" / "Individual" maps to the
app's lead / member / individual. Members link to their lead through Group Lead Email. Mode (live/recorded) and
tier come from the option text exactly as the first import did. Unknown status text or a row with no email is
skipped and counted as a problem; the run continues.

**Per row, in order.**
1. Not in memory and not in the app by email+time: insert (details, sheet status, amount, status_source
   'sheet', email_status set so no email is ever queued), then remember it. Pending rows get no PZ ID.
2. Already in the app by email (the 72 hand-imported rows): link to memory without changing anything on the
   first run, except fill a missing status difference only if the app row's status_source is 'sheet'.
3. In memory, and the sheet status/amount differs from what was last seen: if the app row's status_source is
   'sheet' (never changed by an admin), apply through the same guarded path Plan 4 uses (`checkStatusChange`,
   `landing_apply_status`, source 'sheet', no actor) with the email/enrollment/Meta follow-ups suppressed;
   update memory. If status_source is 'app', leave status and amount alone and only update memory.
4. Sheet row gone: do nothing.
Group lead amounts follow the stored expected amount like the first import. Details (name, phone, email) of
existing rows are not changed by the mirror.

**Triggers.** pg_cron job 4 `sheet-mirror`, every 15 minutes, GET `/api/cron/sheet-mirror` with the same
vault secret as job 3. The route loops every page with a `mirror_sheet_id`. A second admin-only POST route
backs the "Sync now" button. A lock stops two runs overlapping.

**Screen.** On the Registrations screen of a mirrored page: "Synced from sheet 4 min ago - 2 new, 1 changed,
0 problems" plus a "Sync now" button; problems expand to a plain list (row, reason).

**App-side Paid alert.** When an admin sets Paid in the app and the page's options have no WhatsApp group
link (`wa-groups.ts` already knows the links), show a visible warning in the result of that action: "Paid
saved and email queued, but this batch has no WhatsApp group link, so the email has no group button." The
email still goes. (Builder: confirm how the existing Paid email handles a missing link and keep the alert to
the screen.)

## Constraints

- Supabase connection here is read-only; the owner pastes 0093 and the cron statement.
- Vercel is free (daily crons only), so the 15-minute tick is pg_cron + pg_net.
- Source files often use CRLF; database.types.ts is hand-edited, never regenerated.
- No student data in the repo, in tests or in commit messages. Tests use made-up rows.
- The Google sheet must stay "anyone with link: viewer".

## Left to the builder (my calls, mark if changed)

- Exact minute/time parsing of "Submitted At" and the key format; time zone is PKT as the old script wrote it.
- Whether the first run needs a dry-run mode; recommend the Sync button can run "preview only" first.
- Batch size and the lock mechanism (advisory lock or a row flag).

## Open question for the owner

None blocking. Pending rows will appear in the list now; they will not get a PZ ID until marked Paid/Free.

## Test plan (outline)

Unit: CSV parse (quotes, commas, newlines), status mapping, key building, per-row decision table (new / seen /
changed-by-sheet / changed-by-app / vanished / bad row). Integration with a fake CSV: run twice = no change the
second time; reused Ref ID rows stay separate; no email job ever created. Live check with the real sheet in
preview mode, then one real run, owner confirms counts.
