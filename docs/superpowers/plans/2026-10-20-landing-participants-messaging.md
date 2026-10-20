# Campaign Participants and Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins open one campaign (landing page) inside Registrations, tick its participants, and send them an email (separate Brevo account) or WhatsApp links, with a warning when anyone is not Paid.

**Architecture:** Registrations gets a campaign list and a per-campaign page; the existing table gains client-side ticking. A "send" is a frozen set of recipient rows in new tables; email is sent inline from Next in small chunks (the existing `email_queue` edge function uses the main Brevo key, so it cannot be reused), each recipient claimed before sending so a double press never duplicates. WhatsApp reuses the Sales Hub link builders.

**Tech Stack:** Next.js App Router, Supabase (service-role admin client behind `requireAdmin`), zod, `@getbrevo/brevo`, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-20-landing-participants-messaging-design.md`

## Global Constraints

- Branch `landing-participants` (cut from `landing-batch-2b`, PR not merged yet). Never push or merge without the owner's yes. Leave untracked `docs/lead-capture-go-live-guide.md` alone. `gh` not logged in: give the owner the PR URL.
- `npm run` is broken: `node node_modules/typescript/bin/tsc --noEmit` (baseline 0, ignore `.next/types` noise); `node node_modules/vitest/vitest.mjs run tests/<file>`. Never `next build` while dev runs. Known failing, not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening*`.
- Never regenerate `src/lib/supabase/database.types.ts`; hand-add new tables alphabetically (example: `landing_email_log`, lines ~1574-1613). Supabase MCP is read-only: migrations are files the owner pastes. Smoke test uses the "results as one red error box" style of `supabase/tests/0076_batch_access_smoke.sql`.
- Non-technical users: visible text says "link", "country", "module"; never "variant", "override", "resolve", "schema", "YAML". Never show raw status words without friendly text.
- UI rule: never improvise UI. Port from Stitch project `4651274386787527431` ("PZ Academy Platform 2"). **Every UI task below is BLOCKED until the owner supplies the screen** named in it (prompts are in `2026-10-20-landing-participants-stitch-prompts.md`). Backend tasks are not blocked.
- Admin and super_admin only: `requireAdmin()` on every new API route, `requireAdminPage()` on every new page. Agents never reach any of it.
- Test registrations (`is_test`) and members of test registrations are never listed, ticked or messaged.
- The Brevo key for builder emails is `BREVO_API_KEY_PARTICIPANTS` (sender `BREVO_SENDER_EMAIL_PARTICIPANTS` / `BREVO_SENDER_NAME_PARTICIPANTS`, falling back to the main sender vars). Never read, print or commit key values; the owner sets them by hand. Do not edit `src/lib/brevo.ts`.
- Never `git commit --amend`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Send created while any recipient is not Paid and no confirmation flag: refused with 409 (Task 5). Leader Pending + member ticked counts as not Paid.
2. Client's expected count differs from the server's count at create time: refused with 409, nobody messaged (Task 5).
3. Run pressed twice at once, or after a partial failure: each recipient emailed at most once; re-run sends only unsent ones (Task 5).
4. Test registrations, members of test leads, unsubscribed emails, and duplicate emails: excluded or merged and counted, never errors (Tasks 2, 5).
5. Message uses the portal link tag on a campaign with no course: refused with a plain message (Task 5).

## File Structure

- `supabase/migrations/0077_participant_messaging.sql` (new), `supabase/tests/0077_participant_messaging_smoke.sql` (new): four tables.
- `src/lib/landing/participants/` (new): `types.ts`, `merge.ts` (tags), `recipients.ts` (pure recipient building and summary).
- `src/lib/brevo-participants.ts` (new): sender with its own client.
- `src/lib/data/participant-prefs.ts` (new): unsubscribe record. `src/app/unsubscribe/participants/[token]/page.tsx` (new).
- `src/lib/data/participant-campaigns.ts` (new): campaign list, candidate resolution. `participant-sends.ts` (new): create/run/mark/list. `participant-templates.ts` (new).
- `src/app/api/admin/participants/**` (new routes), `src/lib/validations/participants.ts` (new zod).
- Modify `src/lib/data/landing-registration-admin.ts` (extra filters, messages on detail), `src/components/admin/registrations/*` (UI tasks).
- Routes: `registrations/page.tsx` becomes the campaign list; the current flat list moves to `registrations/all/page.tsx`; campaign page at `registrations/campaign/[pageId]/page.tsx`.

---

### Task 1: Migration 0077, smoke test, types

**Files:**
- Create: `supabase/migrations/0077_participant_messaging.sql`, `supabase/tests/0077_participant_messaging_smoke.sql`, `tests/migrations-participant-messaging.test.ts`
- Modify: `src/lib/supabase/database.types.ts` (hand-add four tables)

**Interfaces:**
- Produces tables (all RLS enabled, zero policies, idempotent `create table if not exists`):
  - `participant_templates(id uuid pk default gen_random_uuid(), name text not null, subject text not null default '', email_body text not null default '', whatsapp_body text not null default '', created_by uuid references profiles(id), created_at timestamptz default now(), updated_at timestamptz default now())`
  - `participant_sends(id uuid pk, page_id uuid not null references landing_pages(id), channel text not null check in ('email','whatsapp'), subject text not null default '', body text not null, template_id uuid references participant_templates(id) on delete set null, recipient_count int not null, not_paid_count int not null default 0, not_paid_confirmed boolean not null default false, created_by uuid references profiles(id), created_at timestamptz default now())`
  - `participant_send_recipients(id uuid pk, send_id uuid not null references participant_sends(id) on delete cascade, registration_id uuid not null references landing_registrations(id) on delete cascade, is_member boolean not null default false, name text not null, email text not null default '', phone text not null default '', status_at_send text not null, state text not null default 'pending' check in ('pending','claimed','sent','failed','skipped'), reason text not null default '', claimed_at timestamptz, sent_at timestamptz, unique(send_id, registration_id))`, index on `(send_id, state)`, and index on `(registration_id)`
  - `participant_email_prefs(email text primary key (lowercase, check email = lower(email)), token uuid not null unique default gen_random_uuid(), unsubscribed_at timestamptz, created_at timestamptz default now())`

- [ ] **Step 1: Write the failing test** `tests/migrations-participant-messaging.test.ts` (style of `tests/migrations-landing-registration.test.ts`): reads the .sql text and asserts each of the four `create table if not exists public.<name>`, `enable row level security` for each, the state check list `'pending','claimed','sent','failed','skipped'`, `unique (send_id, registration_id)`, and the lowercase email check.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/migrations-participant-messaging.test.ts`. Expected: FAIL (file missing).
- [ ] **Step 3: Write the migration** per the Interfaces block (header comment, idempotent). Write the smoke test in the 0076 style: inserts a page, a registration, a send, two recipients; asserts the unique `(send_id, registration_id)` rejects a duplicate, the state check rejects `'bogus'`, and the email-prefs lowercase check rejects `'A@B.com'`; ends with the rollback raise.
- [ ] **Step 4: Hand-add the four tables** to `database.types.ts` in alphabetical position with Row/Insert/Update/Relationships.
- [ ] **Step 5: Run** the migration test and `node node_modules/typescript/bin/tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 6: Commit** `feat: migration 0077 participant messaging tables`. The controller hands the owner the migration and smoke test to paste (one red error box with PASS lines).

---

### Task 2: Pure message library (tags, recipients, summary)

**Files:**
- Create: `src/lib/landing/participants/types.ts`, `merge.ts`, `recipients.ts`; tests `tests/participant-merge.test.ts`, `tests/participant-recipients.test.ts`

**Interfaces:**
- Consumes: `firstNameOf` from `@/lib/crm/whatsapp-link`; `RegistrationStatus` from `@/lib/landing/registration/config`.
- Produces in `types.ts`: `type Channel = "email" | "whatsapp"`; `type Candidate = { registrationId: string; leadId: string; isMember: boolean; name: string; email: string; phone: string; refId: string; status: RegistrationStatus }` (member candidates carry the lead's `refId` and `status`); `type SkipReason = "no_email" | "no_phone" | "unsubscribed" | "merged"`; `type Summary = { total: number; byStatus: Record<RegistrationStatus, number>; notPaid: number; skipped: Record<SkipReason, number>; members: number }`.
- `merge.ts`: `type TagContext = { name: string; refId: string; portalUrl: string | null }`; `renderParticipantTags(template: string, ctx: TagContext, mode: "html" | "text"): string`. Tags (same `{{ tag }}` syntax as `merge-tags.ts`): `first_name` (fallback "there"), `full_name`, `ref_id`, `portal_link`. Unknown tags stay verbatim. `html` mode HTML-escapes values; `text` mode does not. `export const PARTICIPANT_TAGS: readonly string[]`; `usesPortalLink(template: string): boolean`.
- `recipients.ts`: `planRecipients(candidates: Candidate[], channel: Channel, unsubscribed: Set<string>): { send: Candidate[]; skipped: { candidate: Candidate; reason: SkipReason }[] }`; `summarize(plan, channel): Summary`.

- [ ] **Step 1: Write failing tests.** `participant-merge.test.ts`: `{{ first_name }}` with name "Dr Sara Khan" gives "Dr"... use `firstNameOf` result; blank name gives "there"; `{{ref_id}}` and `{{ portal_link }}` render; unknown `{{ zoom }}` untouched; `<b>` in a name is escaped in html mode and not in text mode; `usesPortalLink("x {{ portal_link }}")` true. `participant-recipients.test.ts`: two candidates with the same email in different case merge to one (first kept, other `merged`); empty email skipped `no_email` for email channel but kept for whatsapp; empty phone skipped `no_phone` for whatsapp; email in the unsubscribed set skipped `unsubscribed` for email only; `summarize` counts `notPaid` = every non-`paid` status (pending, reserved, underpaid, free) and counts members.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures above. Emails compare lowercased and trimmed. `free` counts as not Paid (the owner's Paid-only concern); note this in a one-line comment.
- [ ] **Step 4: Run** both files. Expected: PASS.
- [ ] **Step 5: Commit** `feat: participant tags and recipient planning`.

---

### Task 3: Campaign list, candidate resolution, extra filters

**Files:**
- Create: `src/lib/data/participant-campaigns.ts`; test `tests/participant-campaigns-data.test.ts`
- Modify: `src/lib/data/landing-registration-admin.ts` (filters `region`, `optionLabel`), `tests/landing-registration-admin-data.test.ts`

**Interfaces:**
- Consumes: `createAdminSupabase`, `RegistrationListFilters`, `Candidate` (Task 2).
- Produces: `listCampaigns(): Promise<{ pageId: string; title: string; pageStatus: "draft" | "published" | "closed"; total: number; counts: Record<RegistrationStatus, number> }[]>` (only pages with at least one non-test head row; heads = `row_type in ('individual','lead')`; newest registration first).
- `listCampaignFilterOptions(pageId: string): Promise<{ regions: string[]; optionLabels: string[] }>` (distinct non-empty values among that page's head rows).
- `resolveCandidates(input: { pageId: string; ids?: string[]; filters?: RegistrationListFilters }): Promise<Candidate[]>`: with `ids`, loads those head registrations; with `filters`, loads all heads matching (no paging, same filter logic as `listRegistrations`); in both cases only that page and `is_test=false`, then expands each head to itself plus its member rows (members use the lead's `refId` and `status`, own name/email/whatsapp, skipped if the member row has `is_test`). Throws if any given id is not a head row of that page.
- `RegistrationListFilters` gains `region?: string` and `optionLabel?: string`, applied as equals in `listRegistrations`.

- [ ] **Step 1: Write failing tests** (mock via `tests/helpers/supabase-mock.ts`): `listCampaigns` omits a page whose only row is `is_test`; counts per status; `resolveCandidates` with filters `{status:"paid"}` returns lead plus its two members, members carrying status "paid" and the lead's `refId`; a Pending lead's members come back `pending`; an `ids` entry from another page throws; `listRegistrations` with `region:"UAE"` only returns UAE rows (add to the existing data test).
- [ ] **Step 2: Run** the two files. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures. Reuse the filter-building code in `listRegistrations` through a small shared internal helper rather than copying it.
- [ ] **Step 4: Run** the two files plus `tests/landing-registrations-list-ui.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: campaign list and recipient resolution`.

---

### Task 4: Builder email sender and unsubscribe

**Files:**
- Create: `src/lib/brevo-participants.ts`, `src/lib/data/participant-prefs.ts`, `src/lib/landing/participants/email-html.ts`, `src/app/unsubscribe/participants/[token]/page.tsx`; tests `tests/participant-prefs.test.ts`, `tests/participant-email-html.test.ts`, `tests/participant-brevo.test.ts`
- Check: how `/unsubscribe/*` is kept public (look at the middleware/proxy matcher and the public-route list) and make the new path public the same way.

**Interfaces:**
- Produces: `sendParticipantEmail(opts: { to: string; toName?: string; subject: string; htmlContent: string }): Promise<{ ok: true } | { ok: false; error: string }>` (own `BrevoClient` created lazily from `process.env.BREVO_API_KEY_PARTICIPANTS`; returns `{ok:false, error:"Participant email is not set up"}` when the key is missing; never throws; never logs the key).
- `getOrCreateToken(email: string): Promise<string>`; `listUnsubscribed(emails: string[]): Promise<Set<string>>` (lowercase); `unsubscribeParticipantByToken(token: string): Promise<"ok" | "already" | "not-found">`.
- `buildParticipantHtml(opts: { bodyText: string; unsubscribeUrl: string }): string`: the body is plain text, HTML-escaped, newlines to `<br>`, `https://` links turned into anchors, wrapped with `buildCampaignHtml` from `@/lib/crm/campaign-email`.
- The page `/unsubscribe/participants/[token]`: `force-dynamic`, calls `unsubscribeParticipantByToken`, shows plain "You are unsubscribed" / "You were already unsubscribed" / "This link is not valid". Match the look of `src/app/unsubscribe/[token]/page.tsx`.

- [ ] **Step 1: Write failing tests.** Prefs (mock admin client): `getOrCreateToken("A@B.com")` upserts lowercase and returns the stored token; `unsubscribeParticipantByToken` returns `ok` then `already`, `not-found` for unknown. HTML: a body with `<script>` is escaped, `https://x.com/z` becomes an anchor, newline becomes `<br>`, output contains the unsubscribe URL. Brevo: with the env key unset returns `{ok:false}` without throwing (mock `@getbrevo/brevo`).
- [ ] **Step 2: Run** the three files. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the new env names to the env notes in the plan's final task only (no `.env` edits).
- [ ] **Step 4: Run** the three files and tsc. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat: builder email sender and unsubscribe`.

---

### Task 5: Sends data layer (create, run, mark, retry)

**Files:**
- Create: `src/lib/data/participant-sends.ts`; test `tests/participant-sends-data.test.ts`

**Interfaces:**
- Consumes: Tasks 2-4 (`resolveCandidates`, `planRecipients`, `summarize`, `renderParticipantTags`, `buildParticipantHtml`, `sendParticipantEmail`, `getOrCreateToken`, `listUnsubscribed`), `pool` helper used in `landing-batch.ts`, `appUrl()` helper used by `job-handlers.ts`.
- Produces:
  - `previewSend(input: { pageId; channel: Channel; ids?: string[]; filters?: RegistrationListFilters }): Promise<{ summary: Summary; count: number }>` (read-only; same planning as create).
  - `createSend(input: { pageId; channel; ids?; filters?; subject: string; body: string; templateId?: string | null; expectedCount: number; confirmNotPaid: boolean; actorId: string }): Promise<{ ok: true; sendId: string; count: number } | { ok: false; code: "count_changed" | "not_paid_unconfirmed" | "no_recipients" | "no_course_for_portal_link" | "not_set_up"; message: string; summary?: Summary }>`. Order: resolve, plan, count must equal `expectedCount` (else `count_changed`), `summary.notPaid > 0 && !confirmNotPaid` is `not_paid_unconfirmed`, body using the portal link tag on a page without `course_id` is `no_course_for_portal_link`, email channel with no `BREVO_API_KEY_PARTICIPANTS` is `not_set_up`, then insert the send and one `participant_send_recipients` row per planned recipient (`pending`) and per skipped one (`skipped` with `reason`). The recipient set is frozen here.
  - `runEmailSend(sendId: string, limit = 40): Promise<{ sent: number; failed: number; pending: number }>`: takes up to `limit` `pending` rows, claims each (`update ... set state='claimed' where id=? and state='pending'`; skip if no row updated), sends through `pool(…, 5)`, then sets `sent` + `sent_at` or `failed` + `reason`; a `failed` row goes back to `pending` only through `retryFailed`. Returns remaining `pending` count so the caller loops. Rows stuck in `claimed` over 15 minutes are treated as `pending` at the start of a run.
  - `retryFailed(sendId: string): Promise<number>`; `markWhatsAppSent(sendId: string, recipientId: string, sent: boolean): Promise<void>`; `listSends(pageId: string): Promise<SendRow[]>`; `getSend(sendId: string): Promise<{ send: SendRow; recipients: SendRecipientRow[] } | null>`; `listMessagesForRegistrations(registrationIds: string[]): Promise<{ registrationId; channel; subject; state; sentAt; sendCreatedAt }[]>` (for the detail card in Task 9).
  - Email test sends: `sendTestToMe(input: { subject; body; toEmail: string; pageId: string }): Promise<{ ok: boolean; error?: string }>` renders with a sample context and `[TEST]` subject prefix and the `/unsubscribe/participants/preview` footer URL, writes no rows.

- [ ] **Step 1: Write failing tests** (Review Focus 1-5): create refused with `not_paid_unconfirmed` when a pending lead's member is in the set, and allowed with `confirmNotPaid:true` (row `not_paid_confirmed=true`); `count_changed` when `expectedCount` differs and no rows were inserted; `no_course_for_portal_link`; test-lead members never appear; unsubscribed email stored `skipped/unsubscribed` and not sent; `runEmailSend` called twice concurrently (`Promise.all`) calls the sender once per recipient; a failing sender marks `failed` with reason and a later run does not resend `sent` rows; `retryFailed` makes only failed rows pending; `runEmailSend` with 3 pending and `limit=2` returns `pending: 1`; rendered body has per-recipient `{{ first_name }}` and the portal URL; every email body contains that recipient's unsubscribe URL.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the signatures. Portal URL is `${appUrl()}/portal/${courseSlug}` (find the slug the way `job-handlers.ts` does, around line 266). WhatsApp sends use `participant_send_recipients.state` `sent` via `markWhatsAppSent`; no external call.
- [ ] **Step 4: Run** the file and tsc. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat: participant sends data layer`.

---

### Task 6: Templates data layer

**Files:**
- Create: `src/lib/data/participant-templates.ts`; test `tests/participant-templates-data.test.ts`

**Interfaces:**
- Produces: `type TemplateRow = { id; name; subject; emailBody; whatsappBody; updatedAt }`; `listTemplates(): Promise<TemplateRow[]>` (by name); `saveTemplate(input: { id?: string; name: string; subject: string; emailBody: string; whatsappBody: string; actorId: string }): Promise<TemplateRow>`; `deleteTemplate(id: string): Promise<void>`.

- [ ] **Step 1: Write failing tests:** save without id inserts and returns the row; save with id updates and bumps `updated_at`; blank name rejected with an error "Give the template a name"; delete removes it; list sorted by name.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: participant message templates`.

---

### Task 7: Admin API routes

**Files:**
- Create under `src/app/api/admin/participants/`: `preview/route.ts` (POST), `sends/route.ts` (POST create, GET `?pageId=`), `sends/[id]/route.ts` (GET), `sends/[id]/run/route.ts` (POST), `sends/[id]/retry/route.ts` (POST), `sends/[id]/recipients/[recipientId]/route.ts` (PATCH mark sent), `test/route.ts` (POST), `templates/route.ts` (GET, POST), `templates/[id]/route.ts` (PUT, DELETE); `src/lib/validations/participants.ts`; test `tests/participant-routes.test.ts`
- Modify: `tests/landing-route-hardening.test.ts` route list only if it enumerates `/api/admin` files (it is already failing; add the new routes to its list, do not fix its other problem).

**Interfaces:**
- Consumes: Tasks 5-6. Each route: `requireAdmin()` first, then zod `safeParse` (400 `{error:"Invalid input"}`), then the data function. `sends` POST maps `createSend` failures to 409 with `{ error: message, code, summary }`. `run` route exports `maxDuration = 60`, returns `runEmailSend` result. zod schemas: `previewBodySchema`, `createSendBodySchema` (exactly one of `ids` / `filters`; `expectedCount` int >= 1; `confirmNotPaid` boolean), `templateBodySchema`, `markSentBodySchema {sent: boolean}`, `testBodySchema {pageId, subject, body}` (the test goes to the signed-in admin's own email taken from `auth.user.email`, never from the body).

- [ ] **Step 1: Write failing tests** in the style of `tests/landing-whatsapp-routes.test.ts`: every route returns 401 when `requireAdmin` says not authenticated and 403 for a non-admin (table-driven over all handlers); create returns 409 with code `not_paid_unconfirmed`; test route ignores any `toEmail` in the body.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run** file and tsc. Expected: PASS.
- [ ] **Step 5: Commit** `feat: admin routes for participant messaging`.

---

### Task 8: Registrations routes and campaign list page (UI, BLOCKED on Stitch screen P1 "Campaign list")

**Files:**
- Modify: `src/app/dashboard/admin/enrollments/registrations/page.tsx` (becomes the campaign list), `src/components/admin/registrations/EnrollmentSourceTabs.tsx` (if its link target changes)
- Create: `src/app/dashboard/admin/enrollments/registrations/all/page.tsx` (the current flat list, moved with its `BASE_PATH` updated), `src/components/admin/registrations/CampaignList.tsx`; tests `tests/participant-campaign-list-ui.test.tsx`
- Update every link and test that points at the old flat list path (search for `enrollments/registrations`, `BASE_PATH`, `registrationHref`, detail back-links, the batch-access page back link).

**Interfaces:** Consumes `listCampaigns` (Task 3). Produces: campaign list rows linking to `/dashboard/admin/enrollments/registrations/campaign/<pageId>`, a link "All registrations" to `/dashboard/admin/enrollments/registrations/all`.

- [ ] **Step 1: Fetch Stitch screen P1** (`mcp__stitch__get_screen`); if the owner has not supplied it, stop and say so.
- [ ] **Step 2: Write failing tests:** each campaign shows its title and status counts and links to its campaign page; "All registrations" link present; a campaign with zero Paid shows "0 paid" not blank; existing tests for the flat list still pass at the new path.
- [ ] **Step 3: Implement** the list page and the move. **Step 4: Run** `tests/participant-campaign-list-ui.test.tsx tests/landing-registrations-list-ui.test.tsx tests/landing-registration-detail-ui.test.tsx` and tsc. Expected: PASS.
- [ ] **Step 5: Commit** `feat: registrations campaign list`.

---

### Task 9: Campaign page with ticking and send bar (UI, BLOCKED on Stitch screen P2 "Campaign page")

**Files:**
- Create: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/page.tsx`, `src/components/admin/registrations/CampaignRegistrations.tsx` (client: selection state, send bar), `SelectableRegistrationsTable.tsx` (client wrapper over the same row rendering as `RegistrationsTable`); test `tests/participant-campaign-page-ui.test.tsx`
- Modify: `src/components/admin/registrations/RegistrationFilters.tsx` (add "Country" and "What they bought" selects, shown on the campaign page only, fed by `listCampaignFilterOptions`), `query.ts` (`region`, `optionLabel` params)

**Interfaces:** Consumes `listRegistrations`, `listCampaignFilterOptions`, `listSends` (Tasks 3, 5). Selection model: either a set of ticked ids on the current page, or "all N in this filter" (stores the current `filters`); never both. Produces props handed to the builder: `{ pageId, pageTitle, selection: { mode: "ids"; ids: string[] } | { mode: "filter"; filters: RegistrationListFilters }, count: number }`. Test registrations are never present. Status editing control stays as it is.

- [ ] **Step 1: Fetch Stitch screen P2**; stop if absent.
- [ ] **Step 2: Write failing tests:** header checkbox ticks the visible rows; "Select all 57 in this filter" switches to filter mode and shows 57; unticking one row leaves filter mode; the send bar shows the count and both buttons only when something is selected; no ticking UI renders on the agent page (agent page untouched, assert `RegistrationsTable` still has no checkboxes); campaign name is the heading.
- [ ] **Step 3: Implement.** **Step 4: Run** the new test plus the list/detail UI tests and tsc. Expected: PASS.
- [ ] **Step 5: Commit** `feat: campaign page with selection`.

---

### Task 10: Email builder, templates and send summary (UI, BLOCKED on Stitch screen P3 "Email builder")

**Files:**
- Create: `src/components/admin/registrations/MessageBuilder.tsx` (client; email mode), `SendSummary.tsx`; test `tests/participant-builder-ui.test.tsx`

**Interfaces:** Consumes the Task 9 props and routes from Task 7. Flow: template picker (loads `GET /api/admin/participants/templates`, "Save as template"), subject + body fields, tag chips from `PARTICIPANT_TAGS`, "Send test to me", "Review and send" which calls `POST preview` and shows `SendSummary` (campaign name, exact count, count by status, members included, skipped counts, and the warning), then "Confirm and send" calls `POST sends` (with `expectedCount` = the previewed count and `confirmNotPaid` true only after a separate tick of the warning box), then loops `POST sends/[id]/run` until `pending` is 0, showing sent/failed counts. Warning text (plain words): "N people have not paid (Pending 2, Underpaid 1). They will get this message too." Confirm button disabled while a run is in progress.

- [ ] **Step 1: Fetch Stitch screen P3**; stop if absent.
- [ ] **Step 2: Write failing tests** (fetch stubbed): warning shown with the exact not-paid numbers and the confirm box required before the send button enables; no warning when everyone is Paid; a 409 `count_changed` shows "The list changed. Review it again." and does not run; run loops until `pending: 0` and shows final counts; double click sends one create request; picking a template fills subject and body.
- [ ] **Step 3: Implement.** **Step 4: Run** the new test and tsc. Expected: PASS.
- [ ] **Step 5: Commit** `feat: email builder and send summary`.

---

### Task 11: WhatsApp links list (UI, BLOCKED on Stitch screen P4 "WhatsApp list")

**Files:**
- Create: `src/components/admin/registrations/WhatsAppSendList.tsx`; test `tests/participant-whatsapp-ui.test.tsx`
- Modify: `MessageBuilder.tsx` (WhatsApp mode: one message field, same summary and warning flow, then the list)

**Interfaces:** Consumes `buildWhatsAppLink`-family helpers (`src/lib/crm/whatsapp-link.ts`, `whatsapp-mode.ts`, `phone.ts`; the participant message uses `renderParticipantTags(..., "text")` first, then `buildWhatsAppLink(phoneE164, renderedText, "")` with the rendered text passed as the template). Phone normalized with `normalizePhone`; unusable phones were already stored `skipped/no_phone` by Task 5 and show as "No phone number". Each row: name, link button (honours the saved web/app choice), "Mark sent" calling the PATCH route; sent rows show the time.

- [ ] **Step 1: Fetch Stitch screen P4**; stop if absent.
- [ ] **Step 2: Write failing tests:** link text contains the per-person rendered message URL-encoded; a skipped row shows "No phone number" and no link; Mark sent calls PATCH once and shows "Sent"; rows already sent stay sent after reload.
- [ ] **Step 3: Implement.** **Step 4: Run** the new test plus `tests/crm-whatsapp-link.test.ts` and tsc. Expected: PASS.
- [ ] **Step 5: Commit** `feat: whatsapp link list for participants`.

---

### Task 12: Messages sent list and per-person history (UI, BLOCKED on Stitch screen P5 "Messages sent")

**Files:**
- Create: `src/components/admin/registrations/MessagesSentList.tsx`; test `tests/participant-history-ui.test.tsx`
- Modify: `campaign/[pageId]/page.tsx` (render the list), `landing-registration-admin.ts` (`RegistrationDetail.messages`, admin scope only, `[]` for agent scope, from `listMessagesForRegistrations` for lead + member ids), `RegistrationEmailsCard.tsx` (add the builder messages under the existing automatic emails, same card, heading unchanged), `tests/landing-registration-admin-data.test.ts`, `tests/landing-registration-detail-ui.test.tsx`

**Interfaces:** Consumes `listSends`, `getSend`, `listMessagesForRegistrations`. Campaign page list: one row per send (when, channel, subject or first words of the WhatsApp text, who sent, counts sent/failed/skipped, link to a detail view listing each recipient with state and reason; "Resend failed" button calls the retry route and loops run).

- [ ] **Step 1: Fetch Stitch screen P5**; stop if absent.
- [ ] **Step 2: Write failing tests:** list shows counts; a failed recipient shows its reason in plain words; "Resend failed" calls retry then run; detail card shows a builder email with subject and time and a WhatsApp mark; agent-scope detail has `messages: []` and renders no messages.
- [ ] **Step 3: Implement.** **Step 4: Run** the three test files and tsc. Expected: PASS.
- [ ] **Step 5: Commit** `feat: messages sent list and history`.

---

### Task 13: Wrap-up

**Files:** Create `docs/participant-messaging-setup.md` (plain steps for the owner).

- [ ] **Step 1:** Write the setup note: paste migration 0077 and run the smoke test; add `BREVO_API_KEY_PARTICIPANTS`, `BREVO_SENDER_EMAIL_PARTICIPANTS`, `BREVO_SENDER_NAME_PARTICIPANTS` in Vercel and local env by hand (the sender address must be verified in the second Brevo account); how to send a test to yourself first.
- [ ] **Step 2: Run** tsc and the full vitest suite. Expected: 0 errors; only the two known failing test files fail.
- [ ] **Step 3: Commit** `docs: participant messaging setup note`.
