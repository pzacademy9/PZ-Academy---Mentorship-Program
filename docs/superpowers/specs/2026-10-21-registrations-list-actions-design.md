# Registrations list: row actions design

Date: 2026-10-21. Builds on Plans 1 to 4 (Registrations screen, status emails, participants messaging, sheet sync). Branch to cut: `registrations-list-actions` from main.

## Why

Today the admin must open every person's page to do small jobs. The list (all registrations, and each campaign's list) shows no voucher and has no buttons. Names, emails and WhatsApp numbers cannot be edited in the app at all (they are fixed in the Google Sheet and flow back). A status email goes out once automatically and can never be sent again. The owner wants to do these small jobs straight from the list.

## Owner's words (rulings)

1. Do the small changes from the list, not from inside each person's page.
2. A **status email** option in the list: Paid, Pending, Reserved, Underpaid. It must be possible to send one **again** even if it was already sent.
3. **Send email** and **Send WhatsApp** buttons for a custom message to one person. The tools already on the campaign page (tick some or all people, write, send) stay; the same writer should open for one person straight from their row.
4. The **voucher** must be visible in the list.
5. **Edit** name, email and WhatsApp from the list. When the app changes them, the **Google Sheet must be updated too** so the two never disagree.

## Goals

- Every list row (admin all-registrations list and each campaign's list, desktop and mobile) has: a voucher thumbnail that opens the full voucher; an Edit details action (name, email, WhatsApp); a Status email action; Send email; Send WhatsApp.
- A resent status email is allowed, clearly confirmed first ("This person already got this email on <date>. Send again?"), and recorded so the history shows every send, including repeats.
- A custom email or WhatsApp from a row reuses the existing campaign writer and sender (same safeguards, same history) with that one person chosen.
- An edit in the app reaches the Google Sheet row and the sheet-sync snapshot stays correct.

## Non-goals

- No bulk status email from the list (bulk custom messages already exist in the campaign tools).
- No editing of other fields (profession, discovery, option, price, agent). Status changes keep using the existing Change status flow.
- Sales agents do not get these actions in this project (my call; admin only). Agents keep their own list as is.
- No new email wording: status emails use the existing builders.

## Anti-goals

- Never email someone twice by accident: a repeat send needs an explicit confirm and goes only to the person chosen.
- Never lose or fight a change: an edit made in the app must not be undone by the next sheet scan, and an edit made in the sheet must not be undone by the app.
- Never send to a malformed email or a WhatsApp number that fails the existing check.
- Never show a voucher to anyone who is not an admin.

## Constraints

- UI comes only from Stitch (project "PZ Academy Platform 2", id 4651274386787527431): if no screen fits, the owner gets a Stitch prompt and the build stops for that part. Existing screens to reuse for look: Admin Registrations, Page Registrations, Campaign Registrations, Registration Detail.
- Plain words for a non-technical owner; no "snapshot", "webhook", "variant", "override", "schema".
- Supabase MCP is read-only: SQL is a migration file the owner pastes. Never regenerate `database.types.ts`; hand-add. Apps Script changes go only through clasp (`gas/clasp-project/`) and only after the owner says yes; the script mirror `gas/sheets-sync/Code.gs` must stay byte-identical to `gas/clasp-project/Sheet Sync.js`.
- `npm run` is broken here: use `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. No `eslint-disable @typescript-eslint/...` comments.
- Test only with the owner's own rows (page "Diabetes Management & Pharmacotherapy - Batch 1": hamzaansari4you@gmail.com has an invalid phone, dit.pharmacozyme@gmail.com is valid). Never send to real students while testing.
- Every new route checks admin on the server first; every new table has RLS on.

## Lessons from sheet sync that apply here (must hold)

- The sheet-sync "last written" record for a row (landing_sheet_snapshots) must only move after a push that actually found its sheet row (the Apps Script returns `missing` for rows it did not find). Otherwise the next scan treats the app's own edit as a human sheet edit and may apply an old value, including a stale Paid with email and enrollment.
- The sheet row is found by Ref ID plus the email the sheet currently shows. When an edit changes the **email**, the push must find the row by the OLD email (the last-written value), then write the new one.
- A name/email/WhatsApp edit in the app must go through the same validation as the form and as sheet sync (email format, unique within the page, WhatsApp digits 8 to 15), with plain error text.

## Calls I made (mine, not the owner's)

- Admin only (not sales agents).
- Group members: each member row is its own person and can be edited and emailed on their own; the lead's status email stays the lead's. A status email can be sent to a member from their own row.
- A resend is recorded as its own history entry; the original once-only guard for the automatic emails is unchanged.
- The status email picker offers any of the four types regardless of the person's current status, with the confirm dialog warning when it does not match ("This person is Pending but you are sending the Paid email").
- Voucher thumbnail: shown only when a voucher exists; PDFs show a document icon; click opens it in a new tab.
- Whether editing is a dialog from the row or cells editable in place is left to the Stitch design.

## Left to the builder

Table or column shape for repeat sends and their history, how the Apps Script writes name/email/WhatsApp (new action vs extending the existing one), route shapes, how the one-person writer is opened from a row, test strategy.

## Calls made after the builder check (mine, not the owner's)

- **Email edit and accounts:** an email edit changes the registration row only. The link to a student account (and any enrollment) is left exactly as it is, the same rule sheet sync uses ("Email changed; account link unchanged"). The edit is refused with a plain message when another registration on the same page already uses that email. The dialog tells the admin the person's account is not changed.
- **Sheet push fails or the sheet is down:** the edit is saved in the app anyway and the sheet update is queued with retries through the existing outbox (a new job type); the row shows "Sheet update waiting" until it lands. The sheet-sync scan already treats "app changed, push not landed yet" as app wins, so the edit is not undone meanwhile; the builder must keep that true, including the old-email lookup.
- **Voucher thumbnail:** vouchers are Drive links already shared "anyone with the link" by the upload. Use the Drive thumbnail form (`/thumbnail?id=<file id from the link>`, as the project notes require), which also gives a first-page preview for PDFs; if the thumbnail fails to load, show a document icon. No new column, no migration, no backfill, no Apps Script change. It is shown only on admin pages.
- **"Pending" email:** the Pending option sends the existing "registration received" email (the log kind for it is the builder's choice). **Group members:** a member's row offers Pending (the member version of that email) and Paid (the existing "covered by your group" Paid email); Reserved and Underpaid are offered on lead and individual rows only.
- **Resend is email text only:** it sends the chosen email again and records it. It never triggers enrollment, portal opening, the Meta hook or a status change. The once-only guard for automatic emails stays; the builder picks how repeats are logged (a repeat-friendly kind or a separate log) and writes the migration for the owner to paste.
- **WhatsApp from a row:** WhatsApp in this app is a click-to-chat link the admin opens and then marks as sent (no automatic sending). A row with a missing or invalid number shows the button disabled with the existing wording ("No phone number" / "Number not valid"). A one-person send is recorded like a campaign send under that registration's page, so history and the "Messages sent" list keep working; the builder decides whether that is a tiny campaign record or a direct send record.
