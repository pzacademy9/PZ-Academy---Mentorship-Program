# Meta Purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a registration first becomes Paid (in the app or by a sheet edit), our server tells Meta "Purchase" once, through the Conversions API.

**Architecture:** A new `meta_purchase` job in the existing outbox (`landing_jobs`), enqueued together with the enrollment and status-email jobs. The handler claims a once-ever row in a new table `landing_meta_events` (primary key = registration id), builds the event, and POSTs it to Meta. A small pure module builds and hashes the payload; a thin module does the HTTP call. Admin detail page shows one status line.

**Tech Stack:** Next.js App Router, Supabase (service role), vitest, Meta Graph API `/{pixel_id}/events`.

**Spec:** `docs/superpowers/specs/2026-10-19-landing-registrations-phase3-design.md` (Part 5 and the "Meta Purchase fires once per registration ever" ruling) plus the owner rulings in this plan's Global Constraints.

## Global Constraints

- One Pixel for all courses (owner, 2026-10-22). Pixel ID 2299307960538116. Per-page `registration.pixelId` wins if set, else `NEXT_PUBLIC_META_PIXEL_ID`.
- Secret key lives only in env var `META_CAPI_ACCESS_TOKEN` (never in the database, code, logs, error messages or chat). Optional `META_CAPI_TEST_EVENT_CODE`: when set, events go to Meta's Test events tab and are not counted.
- Purchase fires **once per registration, ever**, on the first Paid. Paid, then Pending, then Paid again sends nothing. Never re-sent.
- **Group = one Purchase**, for the lead row, at the lead's full amount. Member rows never fire. (Owner confirmed 2026-10-22.)
- Value = `amount_received` if entered, else `expected_amount`. Currency = the lead row's `currency`.
- Skip rows that are `is_test`, status `free`, or not currently `paid`.
- Event time = the time of the first `paid` row in `landing_status_events` for that registration. If older than 7 days: do not send, record `skipped_old`.
- `event_id` is `purchase-<registration id>` (stable, so Meta de-duplicates).
- Hash with SHA-256 over lowercased, trimmed values: email, phone (digits only, no `+` or leading `00`), first name, last name. Send `fbp`, `fbc` as stored (not hashed), `external_id` = hashed registration id, `action_source` = `website`, `event_source_url` = `<NEXT_PUBLIC_APP_URL or https://pharmacozyme.com>/<page slug>`. No IP or user-agent is stored, so none is sent.
- No key set: the job throws "Meta key not set" (it shows as failed; the admin Retry works once the key is added, if still inside 7 days). Never mark such a job done.
- Meta failure (HTTP not 2xx or network): release the claim and throw, so the outbox retries. A retry must never create a second sent row.
- Do not regenerate `database.types.ts`; hand-add the new table entry.
- Tests mock the database, which hid real bugs twice before: every column, `onConflict` target and status value used in code must be checked against `supabase/migrations/`.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits only, never amend.

## Review Focus

1. A registration that goes Paid, Pending, Paid again: exactly one Purchase, ever.
2. Sheet-set Paid and app-set Paid at nearly the same moment: one Purchase (the claim row decides).
3. Group lead Paid: one event at the group total; members Paid with the lead: no extra events.
4. First Paid more than 7 days ago (for example a stale sheet scan): nothing sent, `skipped_old` recorded, no retry loop.
5. Meta down or key missing: job fails visibly, nothing recorded as sent, a later retry sends once.
6. Phone stored with `+`, spaces or dashes, or empty: still hashes correctly or is omitted (never hashes an empty string).

---

## File Structure

- `supabase/migrations/0080_meta_purchase.sql` (create): table `landing_meta_events`, new job type `meta_purchase`.
- `src/lib/meta/capi-payload.ts` (create): pure functions to hash and build the Purchase event.
- `src/lib/meta/capi-client.ts` (create): `sendMetaEvent` HTTP call to Meta.
- `src/lib/data/landing-meta-events.ts` (create): claim, mark sent, mark skipped, release, read status.
- `src/lib/landing/registration/job-handlers.ts` (modify): `metaPurchase` handler plus registry entry.
- `src/lib/data/landing-jobs.ts` (modify): job type, run order, `enqueueStatusEffects` includes the new job.
- `src/lib/data/landing-registration-admin.ts` (modify): `runJobsDirect` fallback list, detail carries Meta status.
- `src/components/admin/registrations/` (modify one detail component): one status line.
- `src/lib/supabase/database.types.ts` (modify by hand): add `landing_meta_events` and the job type.
- Tests under `tests/`.

---

### Task 1: Migration and table access

**Files:**
- Create: `supabase/migrations/0080_meta_purchase.sql`, `src/lib/data/landing-meta-events.ts`
- Modify: `src/lib/supabase/database.types.ts` (hand-add `landing_meta_events` Row/Insert/Update)
- Test: `tests/landing-meta-events.test.ts`

**Interfaces:**
- Produces:
  - `type MetaPurchaseState = "claimed" | "sent" | "skipped_old"`
  - `claimMetaPurchase(registrationId: string, eventId: string): Promise<boolean>` (true = caller owns the send; false = row already exists)
  - `markMetaPurchaseSent(registrationId: string, p: { value: number; currency: string }): Promise<void>`
  - `markMetaPurchaseSkipped(registrationId: string, reason: string): Promise<void>` (sets state `skipped_old`, final)
  - `releaseMetaPurchase(registrationId: string): Promise<void>` (deletes the row only when state is `claimed`)
  - `getMetaPurchase(registrationId: string): Promise<{ state: MetaPurchaseState; sentAt: string | null; detail: string } | null>`
  - `firstPaidAt(registrationId: string): Promise<string | null>` (earliest `landing_status_events.at` where `to_status = 'paid'`, else null)

- [ ] **Step 1: Write the migration.** Table `public.landing_meta_events`: `registration_id uuid primary key references public.landing_registrations(id) on delete cascade`, `event_id text not null`, `state text not null check (state in ('claimed','sent','skipped_old'))`, `value numeric(12,2)`, `currency text`, `detail text not null default ''`, `created_at timestamptz not null default now()`, `sent_at timestamptz`. Enable RLS with no policies (service role only, like `landing_email_log`; check 0069/0076 for the exact pattern and copy it). Drop and re-add `landing_jobs_type_check` with all existing types plus `'meta_purchase'` (copy the list from `0079_landing_list_actions.sql`). Safe to run twice.
- [ ] **Step 2: Write failing tests** with the mocked admin client used in `tests/landing-jobs.test.ts` as the style guide: `claimMetaPurchase` returns true on insert success, false on error code `23505`, throws on any other error; `releaseMetaPurchase` filters on `state = 'claimed'`; `firstPaidAt` orders by `at` ascending and filters `to_status = 'paid'`.
- [ ] **Step 3: Run** `node node_modules/vitest/vitest.mjs run tests/landing-meta-events.test.ts` and see it fail.
- [ ] **Step 4: Implement** the functions in `src/lib/data/landing-meta-events.ts` (same style as `landing-email-log.ts`). Hand-add the table type.
- [ ] **Step 5: Run the tests** and `node node_modules/typescript/bin/tsc --noEmit` (0 errors, ignore `.next/types` noise).
- [ ] **Step 6: Commit** `feat: meta purchase table and once-only claim`.

---

### Task 2: Build and hash the Purchase event

**Files:**
- Create: `src/lib/meta/capi-payload.ts`
- Test: `tests/meta-capi-payload.test.ts`

**Interfaces:**
- Produces:
  - `sha256Lower(value: string): string` (trim, lowercase, hex SHA-256)
  - `normalizePhone(raw: string): string` (digits only; strips a leading `00`; returns `""` if fewer than 7 digits)
  - `buildPurchaseEvent(p: { registrationId: string; email: string; whatsapp: string; name: string; fbp: string; fbc: string; value: number; currency: string; eventTimeIso: string; sourceUrl: string }): MetaEvent`
  - `type MetaEvent = { event_name: "Purchase"; event_time: number; event_id: string; action_source: "website"; event_source_url: string; user_data: Record<string, string | string[]>; custom_data: { value: number; currency: string } }`
  - `isTooOld(eventTimeIso: string, now: Date): boolean` (true when more than 7 days old)

- [ ] **Step 1: Write failing tests** with assertions: `normalizePhone("+971 50-123 4567") === "971501234567"`; `normalizePhone("00971501234567")` strips the `00`; `normalizePhone("")` is `""`; `buildPurchaseEvent` gives `event_id === "purchase-" + registrationId`, `event_time` in whole seconds, `user_data.em` is an array of one 64-char hash of the lowercased email, `user_data.ph` is omitted when the phone normalises to empty, `fbp`/`fbc` are omitted when empty and unhashed when present, `fn`/`ln` come from splitting the name on the first space (single word: only `fn`), `external_id` is the hash of the registration id; `custom_data` is exactly `{ value, currency }` with `currency` upper-cased. `isTooOld` is false at 6 days 23 hours and true at 7 days 1 hour.
- [ ] **Step 2: Run, see fail. Step 3: Implement** with Node `crypto`. No other dependencies.
- [ ] **Step 4: Run tests, tsc, eslint** (`node node_modules/eslint/bin/eslint.js src/lib/meta tests/meta-capi-payload.test.ts`).
- [ ] **Step 5: Commit** `feat: build and hash the Meta Purchase event`.

---

### Task 3: Send to Meta

**Files:**
- Create: `src/lib/meta/capi-client.ts`
- Test: `tests/meta-capi-client.test.ts`

**Interfaces:**
- Consumes: `MetaEvent` from Task 2.
- Produces: `sendMetaEvent(pixelId: string, event: MetaEvent): Promise<void>`. Reads `META_CAPI_ACCESS_TOKEN` and optional `META_CAPI_TEST_EVENT_CODE` from `process.env`. Throws `Error("Meta key not set")` when the token is empty. POSTs JSON `{ data: [event], access_token, test_event_code? }` to `https://graph.facebook.com/v21.0/${pixelId}/events` (builder's call on the version: pick a current stable one and keep it a single constant). Throws on non-2xx with a message of the form `Meta rejected the event (HTTP <status>)`; the message must never contain the token or the response body's user data. A 10-second timeout via `AbortSignal.timeout`.

- [ ] **Step 1: Failing tests** with a mocked `fetch`: token missing throws "Meta key not set" and never calls fetch; success posts to the right URL with the pixel id and the token in the body, not in the URL; test code is included only when set; HTTP 400 throws the message above and the thrown message does not contain the token; a network error is rethrown.
- [ ] **Step 2: Run, see fail. Step 3: Implement. Step 4: Run tests, tsc, eslint.**
- [ ] **Step 5: Commit** `feat: send events to the Meta Conversions API`.

---

### Task 4: The `meta_purchase` job

**Files:**
- Modify: `src/lib/landing/registration/job-handlers.ts` (add `metaPurchase`, registry entry), `src/lib/data/landing-jobs.ts` (`JobType` adds `"meta_purchase"`; add it to `JOB_TYPES` after `email_status`; add it to the `enqueueStatusEffects` upsert array), `src/lib/data/landing-registration-admin.ts` (`queueStatusFollowUps` direct fallback list adds `"meta_purchase"`)
- Test: extend `tests/landing-job-handlers.test.ts` and `tests/landing-jobs.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: `JOB_HANDLERS.meta_purchase(registrationId)`. The id passed is the lead (or individual) id, the same id the other status-effect jobs receive.

Handler rules, in order (each is a test):
1. Load the bundle and page (`load`). Missing: return.
2. Return without doing anything when `lead.isTest`, `lead.status !== "paid"`, or `lead.rowType === "member"`.
3. Read `fbp` and `fbc` for the lead with a direct select on `landing_registrations` (the `RegistrationRecord` type does not carry them; do not widen that shared type).
4. `firstPaidAt(lead.id)`; fall back to `lead.statusChangedAt`. If `isTooOld`: `claimMetaPurchase`, and if it returns true call `markMetaPurchaseSkipped(..., "older than 7 days")`; return.
5. `claimMetaPurchase(lead.id, "purchase-" + lead.id)`; false means already handled, return.
6. Pixel id = `page.registration.pixelId || process.env.NEXT_PUBLIC_META_PIXEL_ID`. Empty: release the claim and throw `Error("Meta Pixel ID not set")`.
7. Value = `lead.amountReceived ?? lead.expectedAmount ?? 0`. Value 0 or less: release and throw `Error("Meta Purchase has no amount")`.
8. Build the event, `sendMetaEvent`. On any throw: `releaseMetaPurchase` (swallow a release failure with a warning log), rethrow. On success: `markMetaPurchaseSent` (if this write fails, log a warning and do not throw: the row stays `claimed`, which still blocks a second send, same as the email log).

- [ ] **Step 1: Failing tests** for each rule above, plus: Paid, Pending, Paid again with the claim already existing sends nothing (second call returns false from claim); two simultaneous calls where the second `claimMetaPurchase` returns false send once; the group case reads only the lead row's amount; the job type list contains `meta_purchase` and `enqueueStatusEffects` upserts three job rows.
- [ ] **Step 2: Run, see fail. Step 3: Implement. Step 4: Run** `tests/landing-job-handlers.test.ts tests/landing-jobs.test.ts` and the whole file set from Tasks 1 to 3, tsc, eslint.
- [ ] **Step 5: Commit** `feat: send one Meta Purchase when a registration first becomes Paid`.

---

### Task 5: Show it to the admin

**Files:**
- Modify: `src/lib/data/landing-registration-admin.ts` (`getRegistrationDetail` returns `metaPurchase: { state: "sent" | "skipped_old" | "waiting" | "none"; at: string | null }`; admins only, agents get `none`), the existing registration detail component under `src/components/admin/registrations/` that already lists emails and status history (find it with Grep on `emails`)
- Test: extend the existing detail test file for `getRegistrationDetail` (Grep `getRegistrationDetail` in `tests/`)

**Interfaces:** Consumes `getMetaPurchase` from Task 1.

Mapping: no row = `none` always (rows Paid before this feature shipped have no row and no job); `claimed` = `waiting`; `sent` = `sent`; `skipped_old` = `skipped_old`.

- [ ] **Step 1: Failing tests** for the mapping and that a sales agent never receives Meta data.
- [ ] **Step 2: Implement.** One plain text line in the detail view, same typography as the neighbouring lines (no new component, no new colors): "Meta Purchase: Sent on <date>", "Meta Purchase: Waiting to send", "Meta Purchase: Not sent (older than 7 days)". Show nothing for `none`.
- [ ] **Step 3: Run tests, tsc, eslint** on touched files. Run the full vitest in the background (about 3 minutes); known failures not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening.test.ts`.
- [ ] **Step 4: Commit** `feat: show Meta Purchase status on the registration detail`.

---

## Rollout (owner steps, after merge review; nothing here is automatic)

1. Owner pastes `0080_meta_purchase.sql` in the Supabase SQL editor.
2. Owner adds `META_CAPI_ACCESS_TOKEN` and `META_CAPI_TEST_EVENT_CODE` (from Events Manager, Test events tab) in Vercel environment variables, then redeploys. The token is never pasted into chat.
3. Live check with the owner's own "DIT Test" row: set Pending, then Paid. Expect one event in the Test events tab, and the detail line says "Sent". Setting Pending and Paid again sends nothing more. Note: the row was Paid before this feature, so its first-Paid time is the earlier test (inside 7 days: it sends; older: it shows "Not sent (older than 7 days)", then use a fresh own test registration instead).
4. Owner deletes `META_CAPI_TEST_EVENT_CODE` and redeploys to go live.
5. Never test on a real student's row.

## Self-review

- Spec Part 5: server Purchase on real Paid, real value and currency, once per registration, status-history guard (the claim table plus first-Paid time from `landing_status_events`), hashed email and phone, stored `fbp`/`fbc`, works for app and sheet (both call `queueStatusFollowUps`, which enqueues `enqueueStatusEffects`), 7-day limit logged: Tasks 1 to 4.
- Owner ruling "Paid changed back: Meta Purchase never re-sent": the primary-key claim.
- Types: `claimMetaPurchase`, `markMetaPurchaseSent`, `markMetaPurchaseSkipped`, `releaseMetaPurchase`, `getMetaPurchase`, `firstPaidAt`, `buildPurchaseEvent`, `isTooOld`, `sendMetaEvent` are named the same in every task.
- Not included on purpose: browser Purchase event (the server event is the only Purchase), a backfill of old Paid rows, IP and user-agent capture.
