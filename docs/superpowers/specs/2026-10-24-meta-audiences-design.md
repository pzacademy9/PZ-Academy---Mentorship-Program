# Meta audiences: retargeting and lookalikes from the CRM

Date: 2026-10-24. Status: draft for owner approval.

## Why

The owner has only ever run ads. They just learned about retargeting (showing ads to people already in the CRM) and lookalikes (Meta finds new people similar to paying students). The data exists (old paid cohorts, new landing registrations) but nothing gets it to Meta. Goal: make that possible with as little manual work as safely can be, and stop paying to advertise sales to people who already paid.

## Goals

1. Per-cohort **Download for Meta** on the Cohorts page; ticking several cohorts gives one combined file.
2. A **Close batch** button on each website batch that copies its people into the CRM as a new cohort, with a clear warning first.
3. Not-paid people from a closed batch are kept as a separate "interested, not paid" list that can be downloaded the same way.
4. Consent wording on the landing form covers ad use.
5. Step 2 (later, own plan): daily automatic sync of the same lists to Meta.

## Non-goals

- Not changing the existing Meta Purchase event.
- No new audience-builder UI. Cohorts page and existing Segments stay as they are.
- No automatic closing on batch end date (owner wants a button).
- No course-tagging fix beyond tagging the closed cohort with the batch's course.
- Meta lead-form / "Conversions API for CRM" is out: it only works with Instant Form leads, and the current ads are click-to-message.

## Anti-goals

- Never send or export people who unsubscribed or have do-not-contact set.
- Never create duplicate contacts or purchases when Close batch is pressed twice.
- Never write raw (unscrambled) personal details to logs.

## Decisions by the owner

- Reuse the Cohorts section rather than build a new Audiences page.
- Close batch is a button, with a warning that data is being copied into the CRM.
- "Paid students" = registration status `paid`. Everyone else who filled the form is "interested, not paid".
- Consent tick box stays required on the landing form.

## Calls made by the assistant (owner to check)

- Underpaid, reserved, free and pending all count as not paid.
- Not-paid people are included in the "interested" list only if `landing_registrations.consent` is true. Old rows with no consent stay out.
- Test rows (`is_test = true`) are never copied or exported.
- Close batch copies, never moves: registrations stay untouched.
- Step 1 is manual download; Step 2 sync is a separate plan after it ships.

## More calls made by the assistant after the builder check (owner to check)

- **Re-running Close batch is allowed.** New payers are added to the paid cohort. Interested cohort membership is recalculated each run. The dialog says "closed before, N new people".
- **Interested download excludes anyone who has any purchase in any cohort**, so payers never appear in it.
- **Group rows (owner ruling: members are included):** `individual`, `lead` and `member` rows are all copied. A member counts as paid when their group lead is paid, and as not paid otherwise. Members never ticked the box themselves, so for the interested list a member uses the lead's `consent`. The lead's `expected_amount` is recorded once on the lead's purchase row; member purchase rows carry no amount, so revenue is not double counted. A member without email or phone is skipped and reported.
- **Paid people** are copied as purchasers (`consent_basis = 'purchase'`, as in sheet import) whether or not the tick box was set. Interested people need `consent = true`.
- **Field mapping:** phone through the sheet-import normalizer to `phone_e164`; invalid phone means the contact is created email-only; country derived from the phone's country code, else left empty. Email/phone matching different contacts follows the existing identity-collision guard (skip and report).
- **Export reachability:** a row is exported only with identifiers from reachable channels (email blanked if email-unsubscribed or suppressed, phone blanked if WhatsApp-unsubscribed). `do_not_contact_at` drops the whole row. Brevo suppressions apply.
- **Interested cohort** needs a link between contacts and a cohort that does not use `contact_purchases`: a small new join table (`import_batch_contacts`). It is excluded from revenue and student counts. Builder confirms exact shape.
- **Meta CSV:** headers use Meta's exact field names so auto-mapping works; `fn` is the first word of the name, `ln` the rest; large cohorts stream through a route handler.
- **Batch without a course:** course left empty, still allowed. Cohort name is "<batch name> (paid)" and "<batch name> (interested)". Idempotency key uses the batch id.

## How it works

### Data already there
- `contacts` (email, `phone_e164`, name, country, unsubscribe columns), `contact_purchases` (links to `import_batches` = a cohort, `course_id`), `import_batches` (a cohort). Registrations: `landing_registrations` (email, whatsapp, name, status, consent, `is_test`).
- `src/lib/meta/capi-payload.ts` already has `sha256Lower` and `normalizePhone`; reuse for the export.

### Close batch
- Button on the batch screen (landing registrations area). Confirm dialog: how many paid, how many not paid, "This copies these people into your CRM as a new cohort. Nothing is removed from registrations."
- Paid registrations become contacts (merged by email, then phone, same rule as sheet import) plus a `contact_purchases` row under a new `import_batches` row (cohort named after the batch, `course_id` from the batch's course). Idempotent through the existing `unique (source_sheet_id, source_row_ref)`; use the registration id as the row ref and the batch id as the sheet id.
- Not-paid people (consented, not test) become contacts under a second cohort, marked as "interested, not paid", with no purchase rows. The builder decides how to mark this (a cohort kind column is the likely way; needs a migration).
- Result message: added, matched to existing, skipped (with reasons).
- Write path is a single database function so it is atomic. Reviewers check columns and enum values against the migrations and the live database.

### Download for Meta
- Per cohort row and as a multi-select combined file. Respect the 1000-row API cap by paging.
- CSV with Meta's customer-list columns: `email, phone, fn, ln, country`. Scrambled (SHA-256) values, phones as digits with country code, emails lowercased. Dedupe across cohorts. Filename holds cohort names and date.
- Excludes: unsubscribed (email and WhatsApp handled separately: a row is kept if either channel is reachable), do-not-contact, no email and no phone.
- Admin only.

### Consent wording
- Change `ConsentField` text in `src/components/landing/registration/Field.tsx` to cover communication, not ad jargon. Owner ruling: older registrations that ticked the old box (`consent = true`) are included in the interested list too; no cutoff date.
- Proposed wording (owner to approve): "I have read the registration details, payment terms and schedule. I agree that PharmaCozyme Academy may keep in touch with me about this course, future courses and updates, by email, WhatsApp and relevant messages."

## Step 2 (outline only)
- Marketing API: create one custom audience per list, add users in batches, refresh daily, remove people who became paid from the not-paid audience. Needs a Meta system-user token and ad account id as environment variables, set once by the owner with guidance.

## Left to the builder
- Cohort kind marker and migration, UI placement of the button, CSV column order beyond the list above, test strategy.
