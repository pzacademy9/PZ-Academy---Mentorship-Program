# Affiliates admin improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search and message templates to the Affiliates tab, a send History to the Emails tab, a Decided list plus required drop reason to the Applications tab, and per-tab subtitles.

**Architecture:** One migration (0115) adds `affiliates.drop_reason`, `affiliate_message_templates` and `affiliate_motivation_sends`. Pure helpers (search, template render, wa/mailto links, subtitles) sit in non-client files and are unit tested. Data layer files in `src/lib/data/`. The three tab UIs are built to the Stitch screens listed in the spec; `AffiliatesAdmin.tsx` (429 lines) is split so each new piece is its own component.

**Tech Stack:** Next.js 14.2.5, Supabase (service role, RLS on, zero policies), vitest + testing-library, zod, sonner, tailwind with pz tokens.

**Spec:** `docs/superpowers/specs/2026-11-14-affiliates-admin-improvements-design.md`

## Global Constraints

- Branch `affiliates-admin-improvements` from `origin/main`. Never push or merge without the owner's yes. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage files by path only. Leave untracked `docs/lead-capture-go-live-guide.md` and the two 2026-11-02 plan files alone.
- Run tools directly (the `&` in the path breaks `npm run`/`npx`): `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. `next build` only once at the end and only if no dev server is up.
- Never regenerate `src/lib/supabase/database.types.ts`; hand-add entries. No `eslint-disable` for `@typescript-eslint`. Preserve CRLF in files that already use it.
- Colours: backgrounds and borders use `pz-solid-*` or `landing-*` tokens; `pz-deep`, `pz-mid`, `pz-danger` are text only.
- Copy: calm, no exclamation marks, no sales words. Plain short words for the owner.
- Shared values and pure helpers live in non-client files (a server page must not import a plain value from a `"use client"` file; `tests/client-boundary-values.test.ts` guards this).
- Supabase is read-only through tools. The owner pastes migration 0115. No real affiliate is emailed in development; the test affiliate is TE324 only.
- Known failing tests that are not ours: landing-event-sheet, landing-hero-render, landing-polish-3, landing-route-hardening, pz-tokens, participant-recipients, participant-whatsapp-ui, gas-apply-registration-status, migrations-segment-source-dnc, participant-campaign-page-ui, registration-id-selection. `landing-registrations-list-ui` is flaky (re-run alone).
- Stitch screens (fetch each `htmlCode.downloadUrl` with `mcp__stitch__get_screen` or `list_screens` and port layout and copy exhaustively): project `13117286791417011091`; Affiliates mobile `dd38a258805d49308d1c30a3beb25f66`, desktop `7475cf81aa80480ead17b41ffb864736`; Emails History mobile `abcc3f9abf984363be08b2727cfca117`, desktop `30c26a02075a4d7ebef8c387029a7a01`; Applications mobile `df3b3f9e50b44933968044acaed8204e`, desktop `8fe640d0377c4f64bea0ff8992d8de82`. Reuse existing components (`Button`, `Dialog`, `EmptyState`, `useConfirm`, `useAsyncAction`); the hub already supplies the sidebar and phone bottom bar, so do not rebuild them.

## Review Focus

1. A phone typed as `0300 123 4567`, `+92 300-1234567` or `0092300...`: expected a correct digits-only number; fewer than 8 digits disables the button with the label "No valid number".
2. A name or code containing `$&`, `$1` or `{code}`: expected inserted literally, never re-expanded.
3. An affiliate with no code (dropped before acceptance): `{code}` renders as "your code", never blank or "null".
4. A drop reason of only spaces, or over 500 characters: expected refused with a plain message, in the screen and on the server.
5. A motivation send that fails completely, or is stopped between chunks: expected no empty history row; chunks of one press make ONE row; a failure to save history never fails or undoes a send.
6. Old dropped people with no reason: expected the text "No reason recorded".
7. History email HTML: expected shown inside a sandboxed iframe (`sandbox=""`, `srcDoc`), never injected into the page.
8. Search text with capitals, extra spaces or an `@`: expected matched case-insensitively on name, code and email; empty search shows everyone.

---

### Task 0: Branch

**Files:** none new (the spec and this plan are already written, untracked).

- [ ] **Step 1:** `git switch -c affiliates-admin-improvements origin/main`. Expected: new branch, the untracked spec and plan travel with it.
- [ ] **Step 2:** `git add docs/superpowers/specs/2026-11-14-affiliates-admin-improvements-design.md docs/superpowers/plans/2026-11-14-affiliates-admin-improvements.md` then commit `docs: affiliates admin improvements design and plan` with the trailer.
- [ ] **Step 3:** Create the ledger `.superpowers/sdd/affiliates-admin-improvements/progress.md` (one line per task, status). Do not commit it if `.superpowers/` is ignored; check `git status`.

### Task 1: Migration 0115 and types

**Files:**
- Create: `supabase/migrations/0115_affiliate_admin_improvements.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add)
- Test: `tests/migration-0115-affiliate-admin-improvements.test.ts` (copy the style of `tests/migrations-affiliate-payouts.test.ts`: read the file text and assert on it)

**Interfaces:**
- Produces: tables `affiliate_message_templates(id uuid pk, channel text check in ('whatsapp','email'), name text, subject text null, body text, sort_order int, created_at)`; `affiliate_motivation_sends(id uuid pk, created_at, subject text, html text, recipient_count int, failed_count int, recipients jsonb default '[]')`; column `affiliates.drop_reason text null`. All new tables: RLS on, zero policies. Safe to run twice (`if not exists`, `on conflict do nothing` on a unique `(channel, name)` index).

- [ ] **Step 1: Write the failing test** asserting the SQL text contains: `add column if not exists drop_reason`, both `create table if not exists` statements, `enable row level security` twice, the channel check, `unique` index on `(channel, name)`, and eight seeded template names (welcome, how to share your code, payout ready, thank you, for each channel) and that seed bodies contain `{name}` and no exclamation mark.
- [ ] **Step 2:** Run it; expect FAIL (file missing).
- [ ] **Step 3:** Write the migration. Seed bodies: calm, 2 to 4 short lines, greeting `Hello {name},`, use `{code}` in welcome and how-to-share. Email templates also carry a subject. Sign-off "Pharmacozyme Affiliate Team".
- [ ] **Step 4:** Hand-add the three table entries and `drop_reason` (Row/Insert/Update) to `database.types.ts`. Run `tsc --noEmit`; expect 0 errors.
- [ ] **Step 5:** Run the test; PASS. Commit `feat: migration 0115 for affiliate admin improvements`.

### Task 2: Pure helpers

**Files:**
- Create: `src/lib/affiliates/message-templates.ts`
- Modify: `src/lib/affiliates/hub-routes.ts`
- Test: `tests/affiliate-message-templates.test.ts`, extend `tests/affiliates-hub-nav.test.ts`

**Interfaces:**
- Produces in `message-templates.ts`:
  - `renderTemplate(text: string, v: { name: string; code: string | null }): string` replaces `{name}` and `{code}`; `{code}` with no code becomes `your code`; uses a replacer function (no `$` expansion).
  - `whatsappDigits(raw: string): string | null` digits only; leading `00` dropped; a single leading `0` becomes `92`; fewer than 8 digits returns null.
  - `whatsappHref(raw: string, text: string): string | null` returns `https://wa.me/<digits>?text=<encoded>` or null.
  - `mailtoHref(email: string, subject: string, body: string): string` encodes with `encodeURIComponent`, newlines as `%0D%0A`.
  - `searchAffiliates<T extends { name: string; email: string; code: string | null }>(rows: T[], q: string): T[]` trims, lowercases, collapses spaces; empty returns all.
- Produces in `hub-routes.ts`: `tabSubtitle(t: AffiliatesTab): string`. Copy: applications "Read each application, then accept or drop it. Accepted affiliates get their code and private link by email."; affiliates "Everyone who promotes PZ Academy. Message them from here."; payouts "Check each payout request, then pay it or turn it down."; leaderboard "See who is ahead this month and of all time."; emails "The message added to progress emails, the motivation send, and what you sent before." (Read the Payouts and Leaderboard tab files first and keep their own wording if they already state one.)

- [ ] **Step 1: Write failing tests** for each function, including the Review Focus cases 1, 2, 3 and 8 (`"0300 123 4567"` gives `923001234567`; `"+92 300-1234567"` gives `923001234567`; `"12345"` gives null; a name `"A$&B"` renders literally; code null renders `your code`; `"  SARA   kh "` finds Sara Khan; `"@example"` matches the email) and that `tabSubtitle` returns five different strings with no `!`.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement the signatures above in the named files.
- [ ] **Step 4:** Run both test files; PASS.
- [ ] **Step 5:** Commit `feat: affiliate message and search helpers`.

### Task 3: Templates and drop reason (data and API)

**Files:**
- Create: `src/lib/data/affiliate-templates.ts`, `src/app/api/admin/affiliates/templates/route.ts`
- Modify: `src/lib/data/affiliates.ts`, `src/app/api/admin/affiliates/[id]/route.ts`
- Test: `tests/affiliate-templates-data.test.ts`, extend `tests/affiliates-data.test.ts` and `tests/affiliates-admin-routes.test.ts`

**Interfaces:**
- Produces: `type AffiliateTemplate = { id: string; channel: "whatsapp" | "email"; name: string; subject: string | null; body: string }`; `listAffiliateTemplates(channel?): Promise<AffiliateTemplate[]>` ordered by `sort_order`; `GET /api/admin/affiliates/templates` (admin, `requireAdmin("sales_hub")`) returns `{ whatsapp: AffiliateTemplate[]; email: AffiliateTemplate[] }`.
- Modifies: `AffiliateRow` gains `dropReason: string | null` (add `drop_reason` to `LIST_COLUMNS`, `mapRow`); `dropAffiliate(id: string, reason: string)` stores the trimmed reason with the status change; `PATCH` drop body becomes `z.object({ action: z.literal("drop"), reason: z.string().trim().min(1).max(500) })`; a missing or blank reason returns 400 "Please give a reason for dropping." The accepted-to-dropped and applied-to-dropped paths both need it.

- [ ] **Step 1: Write failing tests** following how the existing data and route tests mock the admin client: drop without reason is 400; drop with `"  "` is 400; drop with 501 characters is 400; drop with a reason saves `drop_reason` trimmed; `listAffiliateTemplates("email")` filters by channel and orders by `sort_order`; the templates route is 401/403 for a non-admin.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement. Existing callers of `dropAffiliate` must be updated (grep for them). `getAffiliateDetail` returns `dropReason` too.
- [ ] **Step 4:** Run the three test files, then `tsc --noEmit`; PASS and 0 errors.
- [ ] **Step 5:** Commit `feat: drop reason and templates data`.

### Task 4: Motivation send history (data and API)

**Files:**
- Create: `src/lib/data/affiliate-motivation-sends.ts`, `src/app/api/admin/affiliates/motivation-sends/[id]/route.ts`
- Modify: `src/lib/data/affiliate-motivation.ts`, `src/app/api/admin/affiliates/motivation/route.ts`
- Test: `tests/affiliate-motivation-sends.test.ts`, extend `tests/affiliate-motivation.test.ts`

**Interfaces:**
- Produces: `type MotivationSendRow = { id: string; createdAt: string; subject: string; recipientCount: number; failedCount: number; recipients: { name: string; ok: boolean }[] }`; `recordMotivationSend(e: { id: string; subject: string; html: string; sent: { name: string }[]; failed: { name: string }[] }): Promise<boolean>` inserts on first call for an `id`, then adds to the counts and appends recipients on later calls with the same `id`; never throws, returns false on failure; `listMotivationSends(limit = 50): Promise<MotivationSendRow[]>` newest first, no html; `getMotivationSendHtml(id: string): Promise<string | null>`; `GET /api/admin/affiliates/motivation-sends/[id]` returns `{ html }` (admin only).
- Modifies: `sendMotivationBatch(ids, opts: { includeSent: boolean; sendId?: string })`; when `sendId` is given and at least one email was sent or failed in the call, it calls `recordMotivationSend` once at the end with the subject and html of the FIRST built email (name differs per person; the screen labels it as an example of what each person got). The POST route accepts optional `sendId` (uuid string, validated) and passes it on. The client generates one id per button press.

- [ ] **Step 1: Write failing tests** (mock the admin client like `affiliate-motivation.test.ts`): two chunks with the same `sendId` produce one row with summed counts and both name lists; a call where nothing was attempted (all skipped) writes no row; a thrown save error leaves the returned counts unchanged; no `sendId` writes nothing; the POST route rejects a `sendId` that is not a string.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement as specified.
- [ ] **Step 4:** Run both test files plus `tsc --noEmit`; PASS and 0 errors.
- [ ] **Step 5:** Commit `feat: save motivation send history`.

### Task 5: Affiliates tab UI

**Files:**
- Create: `src/components/admin/affiliates/AffiliatesList.tsx`, `src/components/admin/affiliates/AffiliateMessagePicker.tsx`
- Modify: `src/components/admin/affiliates/AffiliatesAdmin.tsx` (use the new list for tab `affiliates`; keep Detail in place), `src/app/dashboard/admin/affiliates/page.tsx` (load templates with a failure fallback like the other extra tabs; pass `templates` and `templatesFailed`; use `tabSubtitle(tab)` in the header, which also fixes the subtitle bug for every tab)
- Test: `tests/affiliates-list-ui.test.tsx`, extend `tests/affiliate-admin-page-message.test.tsx`

**Interfaces:**
- Consumes: `searchAffiliates`, `renderTemplate`, `whatsappHref`, `mailtoHref`, `tabSubtitle` (Task 2); `AffiliateTemplate` (Task 3).
- Produces: `AffiliatesList({ rows, templates, onOpen }: { rows: AffiliateRow[]; templates: { whatsapp: AffiliateTemplate[]; email: AffiliateTemplate[] } | null; onOpen: (id: string) => void })`; `AffiliateMessagePicker({ channel, row, templates, onClose })` shows the template list, an editable text box (subject box for email), "Open WhatsApp" (opens `whatsappHref` in a new tab) or "Open email" (sets `window.location.href` to `mailtoHref`). A person with no valid number has the WhatsApp button disabled with the label "No valid number".

- [ ] **Step 1: Write failing tests**: typing in the search box filters cards by name, code and email; "No one matches your search" shows for no match; the WhatsApp button opens the picker listing only WhatsApp templates; picking a template fills the box with the person's name and code; editing the box then pressing Open uses the edited text; the Email button lists only email templates and builds a `mailto:` with the subject; a number under 8 digits disables WhatsApp; templates failing to load shows "Messages could not be loaded." and keeps the rest of the row working; tapping the card body still opens the detail sheet, tapping a toolbar button does not.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Build to the Affiliates screens (mobile bottom sheet, desktop table with centred dialog). Buttons at least 44px tall on phone.
- [ ] **Step 4:** Run the two test files, `tsc --noEmit`, and eslint on the touched files.
- [ ] **Step 5:** Commit `feat: affiliates tab search and message picker`.

### Task 6: Emails tab History UI

**Files:**
- Create: `src/components/admin/affiliates/AffiliateEmailHistory.tsx`
- Modify: `src/components/admin/affiliates/AffiliateEmailsTab.tsx` (Send / History switch, History default stays Send), `AffiliatesAdmin.tsx` (pass `sends`), `page.tsx` (load `listMotivationSends()` with a failure fallback; `sends`, `sendsFailed`); the send button creates `crypto.randomUUID()` once per press and posts it as `sendId` in every chunk; after the press finishes, refresh history.
- Test: `tests/affiliate-email-history-ui.test.tsx`, extend `tests/affiliate-emails-tab-ui.test.tsx`

**Interfaces:**
- Consumes: `MotivationSendRow` (Task 4). `AffiliateEmailHistory({ sends, failed }: { sends: MotivationSendRow[]; failed: boolean })`.

- [ ] **Step 1: Write failing tests**: History lists cards newest first with date, subject, "Sent to N people", and "N failed" only when failed above 0; empty state "No motivation emails sent yet"; tapping a card fetches `/api/admin/affiliates/motivation-sends/<id>` and shows the html inside an `iframe` with `sandbox=""` and `srcDoc`; recipient names are listed; a failed fetch shows "Could not open this email."; every chunk POST in a single send press carries the same `sendId`.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Build to the Emails History screens (mobile full-screen sheet, desktop two columns).
- [ ] **Step 4:** Run the test files, `tsc --noEmit`, eslint.
- [ ] **Step 5:** Commit `feat: emails tab history`.

### Task 7: Applications tab UI and drop reason

**Files:**
- Create: `src/components/admin/affiliates/AffiliateApplicationsTab.tsx`, `src/components/admin/affiliates/DropReasonDialog.tsx`
- Modify: `AffiliatesAdmin.tsx` (use the new tab for `applications`; both Drop buttons in `Detail` open the reason dialog instead of `confirm`, then send `{ action: "drop", reason }`; remove the top-level "Clear old email history" block and move that action into the new tab as a quiet link at the foot, same confirm text and endpoint)
- Test: `tests/affiliate-applications-tab-ui.test.tsx`, update `tests/affiliates-admin-ui.test.tsx`

**Interfaces:**
- Produces: `AffiliateApplicationsTab({ rows, onOpen, onClearOld })`; count strip tiles Waiting, Accepted, Dropped (Left is not a tile; Left rows appear only in Decided); a Waiting list; a Decided list newest decision first (`droppedAt`, `leftAt`, or `acceptedAt`) with filter All / Accepted / Dropped / Left, each row showing name, email, result, date, code (accepted), reason (dropped; "No reason recorded" when empty). `DropReasonDialog({ name, open, onCancel, onConfirm(reason: string) })` with a required textarea (trimmed, 1 to 500, counter), helper text "This is saved for your records. They will get an email saying their status is Dropped.", buttons Cancel and Drop; Drop is disabled until the reason has text.

- [ ] **Step 1: Write failing tests**: counts match the rows; Waiting empty state "No applications waiting. New ones show up here."; Decided shows reasons and "No reason recorded"; filter buttons narrow the list; the Drop dialog blocks a blank or spaces-only reason and a 501-character reason; confirming sends `{ action: "drop", reason }` with the trimmed text; the old top-level clear button is gone from the Affiliates tab and the quiet link is present on Applications and still confirms before calling `DELETE /api/admin/affiliates/emails?olderThanDays=90`.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Build to the Applications screens.
- [ ] **Step 4:** Run the test files, `tsc --noEmit`, eslint.
- [ ] **Step 5:** Commit `feat: applications tab decided list and drop reason`.

### Task 8: Whole-branch checks

- [ ] **Step 1:** `tsc --noEmit` (0 errors); eslint on all touched paths; run every affiliate and hub test file named above plus `tests/client-boundary-values.test.ts`, `tests/affiliates-hub-nav.test.ts`, `tests/affiliates-hub-sidebar.test.tsx`; confirm only the known unrelated failures remain.
- [ ] **Step 2:** If no dev server is up, run `node node_modules/next/dist/bin/next build` once; expect success.
- [ ] **Step 3:** Write the owner steps file `docs/superpowers/plans/2026-11-14-affiliates-admin-improvements-owner-steps.md` (paste 0115 one statement at a time; how to look at each tab; the TE324-only test of a drop reason and a motivation send, each asked first). Commit it.
- [ ] **Step 4:** Update the memory file for this build. Do not push. Hand the owner the compare link `https://github.com/pzacademy9/PZ-Academy---Mentorship-Program/compare/main...affiliates-admin-improvements` only after the owner says "push".
