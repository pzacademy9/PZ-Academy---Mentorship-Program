# Affiliate Progress and Motivation emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Affiliates get a rich Progress email automatically when a sale turns Paid, the owner can send a Motivation email to zero-sale affiliates in one tap, and one message box adds an announcement to Progress and Accepted emails.

**Architecture:** Progress is driven by `affiliate_commissions` rows (the trigger from 0109 already creates one per Paid sale): a Supabase `pg_cron` + `pg_net` job calls a new cron route every 5 minutes, which claims unsent rows, sends one email per affiliate, and releases the claim if the send fails. Motivation is a server route the admin screen calls in chunks. Rich HTML lives in one new pure file; sending reuses `deliver` in `src/lib/affiliates/send.ts`.

**Tech Stack:** Next.js 14 (App Router), Supabase (service-role admin client), Brevo via `src/lib/brevo-affiliates.ts`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-affiliate-progress-motivation-emails-design.md` (read it first). Old behaviour reference: `Miscellaneous/Affiliates GAS` (`sendPerformanceEmail_`, `sendMotivationalEmail_`).

## Global Constraints

- Branch `affiliate-emails` (from main b56e69c9). Never push or merge without the owner's explicit yes. `gh` is not logged in.
- `npm run` is broken by the `&` in the path. Run `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`.
- Known failing tests that are not ours: landing-event-sheet, landing-hero-render, landing-polish-3, landing-route-hardening, pz-tokens, participant-recipients, participant-whatsapp-ui, gas-apply-registration-status, migrations-segment-source-dnc, participant-campaign-page-ui, registration-id-selection. `landing-registrations-list-ui` is flaky: re-run it alone.
- Never regenerate `src/lib/supabase/database.types.ts`: hand-add entries. No `eslint-disable` for `@typescript-eslint`. Check a file's line endings before editing and keep them (new files: LF).
- Migration 0113 is pasted by the owner by hand. Tables are service-role only (RLS on, zero policies).
- Colour rule for admin UI: backgrounds and borders use `pz-solid-*` or `landing-*` tokens; `pz-deep`, `pz-mid`, `pz-danger` are for text only.
- The rich emails look like the old ones (banner, stat boxes, progress bars, buttons, tables); Accepted, Dropped and Left stay plain letters. Privacy: other affiliates appear as first name + last initial + team + paid count only, never money. Commission shown is the affiliate's own only.
- Numbers: withdraw banner at balance PKR 3,500 or more; certificate at 10 paid participants; target for the progress bar is 10; WhatsApp support button text "Message us on WhatsApp"; the withdraw banner says "Message us on WhatsApp with your payment details".
- Brevo free limit 300 emails a day. Daily count = `sent` rows in `affiliate_emails` in the last 24 hours. Motivation stops at 250 in that window; Progress is never blocked by the Motivation cap.
- Owner-facing text: short plain words, no jargon. Phone-first (390px) and PC (1440px).
- Stage files by path only. Leave untracked `docs/lead-capture-go-live-guide.md` and the two 2026-11-02 plan files alone. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Brevo not set up or failing: `sendProgress` returns false, the claimed rows are released with `progress_attempts` +1, nothing throws, the Paid change is never affected.
2. Two or three of one affiliate's sales turn Paid in the same 5 minutes: exactly one email, all those rows marked sent.
3. An affiliate name or message with `<script>`, quotes, Arabic or emoji: escaped in HTML, subject unaffected, no crash.
4. Board edge cases: the only ranked affiliate, a shared rank (1,1,3), fewer than 10 ranked rows, rank 1 with no runner-up: no "overtake" crash, no empty-name line.
5. Owner double-clicks Send on Motivation, or two chunks overlap: nobody gets two emails (the claim `motivation_emailed_at` is set before sending).

---

### Task 1: Migration 0113 and hand-added types

**Files:**
- Create: `supabase/migrations/0113_affiliate_emails_progress.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add only)
- Test: `tests/migration-0113-affiliate-emails-progress.test.ts` (same style as `tests/migration-0112-affiliate-leaderboard.test.ts`: reads the SQL file, asserts text)

**Interfaces:**
- Produces (columns the later tasks read and write): `affiliate_commissions.progress_emailed_at timestamptz null`, `affiliate_commissions.progress_attempts integer not null default 0`; `affiliates.motivation_emailed_at timestamptz null`; table `affiliate_email_settings (id boolean primary key default true check (id), message text not null default '', updated_at timestamptz not null default now())` with one row inserted `on conflict do nothing`; `affiliate_emails.kind` check widened to `('accepted','dropped','left','progress','motivation')`.

- [ ] **Step 1: Write the failing test.** Assertions on the SQL text: contains `add column if not exists progress_emailed_at`, `progress_attempts`, `motivation_emailed_at`, `create table if not exists public.affiliate_email_settings`, `enable row level security`, the five kinds in the new check, and a backfill `update public.affiliate_commissions set progress_emailed_at = now() where progress_emailed_at is null` placed before any later statement that could create rows (so old sales are never emailed).
- [ ] **Step 2: Run it, expect FAIL** (`node node_modules/vitest/vitest.mjs run tests/migration-0113-affiliate-emails-progress.test.ts`).
- [ ] **Step 3: Write the migration** (header comment like 0112: what it does, service role only, owner pastes, safe to run twice). Drop the old kind check with `alter table public.affiliate_emails drop constraint if exists affiliate_emails_kind_check;` then add the widened one by the same name (check the real constraint name in the live DB with a read-only SELECT on `pg_constraint` first, and use it). Add a partial index `affiliate_commissions_progress_pending_idx on public.affiliate_commissions (affiliate_id) where progress_emailed_at is null and voided_at is null`.
- [ ] **Step 4: Hand-add the types** for the new columns, the new table (Row/Insert/Update, no relationships), and keep every other entry untouched. `node node_modules/typescript/bin/tsc --noEmit` must stay at 0 errors.
- [ ] **Step 5: Run the test, expect PASS. Commit** (`feat(affiliates): migration 0113 for progress and motivation emails`).

---

### Task 2: Rich email builders (pure)

**Files:**
- Create: `src/lib/affiliates/rich-emails.ts`
- Test: `tests/affiliate-rich-emails.test.ts`

**Interfaces:**
- Consumes: `esc` from `src/lib/affiliates/emails.ts` (export `safeUrl` there if it is not already exported).
- Produces:
  - `type TopRow = { rank: number; publicName: string; team: string | null; paid: number; isMe: boolean }`
  - `type ProgressInput = { name: string; code: string; paid: number; commissionPkr: number; balancePkr: number; percent: number; rank: number | null; gapLine: string; top: TopRow[]; supportWa: string; message: string }`
  - `type MotivationInput = { name: string; code: string; leaderLine: string | null; top: TopRow[]; supportWa: string }`
  - `progressEmail(i: ProgressInput): { subject: string; html: string }` (subject `Performance Update - Pharmacozyme Affiliate`)
  - `motivationEmail(i: MotivationInput): { subject: string; html: string }` (subject `Start Your Affiliate Journey - Pharmacozyme`)
  - `messageBlockRich(message: string): string` and `messageBlockPlain(message: string): string` (empty string for a blank message)

- [ ] **Step 1: Write the failing tests** (names and assertions):
  - `progressEmail shows the stat boxes with paid, PKR commission, rank and percent`.
  - `progressEmail shows the green withdraw banner only when balancePkr >= 3500, with the line "Message us on WhatsApp with your payment details"` (3499.99 no, 3500 yes).
  - `progressEmail shows the certificate banner only when paid >= 10`.
  - `progressEmail marks the affiliate's own top-10 row and shows no money for other rows` (assert the html contains no `PKR` inside the table rows).
  - `progressEmail with rank null and an empty top list still builds` (shows "N/A" rank, no table crash).
  - `escapes script tags, quotes and ampersands in name, code and top names; emoji and Arabic pass through`.
  - `messageBlockRich turns an https link into a button anchor and leaves a javascript: or http: address as plain escaped text`; `messageBlockPlain writes the same link as a normal anchor, no button styling`; both return "" for blank or whitespace.
  - `motivationEmail shows the code, the earn thresholds (certificate at 10, withdrawal at PKR 3,500) and a top-5 table with no money`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement the signatures above** in one file, email-safe HTML (tables, inline styles, no scripts) following the old script's layout and copy listed in the spec ("Decisions" bullets for Progress and Motivation). Motivation banner colour green, Progress banner dark purple, as in the old script. Progress bars are two nested inline-style divs sized by `min(100, value/target*100)%`. All text values go through `esc`.
- [ ] **Step 4: Run, expect PASS. Commit** (`feat(affiliates): rich Progress and Motivation email builders`).

---

### Task 3: Message box (storage, route, Accepted email)

**Files:**
- Create: `src/lib/data/affiliate-email-settings.ts`, `src/app/api/admin/affiliates/email-message/route.ts`
- Modify: `src/lib/affiliates/emails.ts` (`acceptedEmail` gets an optional `message?: string`), `src/lib/affiliates/send.ts` (`sendAccepted` loads the message)
- Test: `tests/affiliate-email-message.test.ts`

**Interfaces:**
- Consumes: `messageBlockPlain` (Task 2), `createAdminSupabase`, `requireAdmin("sales_hub")`.
- Produces: `getEmailMessage(): Promise<string>` (returns "" if the row is missing or the read fails, never throws), `setEmailMessage(message: string): Promise<void>` (trims, max 1000 characters, throws on database error); route `PUT /api/admin/affiliates/email-message` with body `{ message: string }` returning `{ ok: true }`, 400 over 1000 characters, 401/403 through `requireAdmin`.

- [ ] **Step 1: Write the failing tests:** `getEmailMessage returns "" when the read fails`; `setEmailMessage trims and rejects more than 1000 characters`; `PUT route is admin only, validates, saves`; `acceptedEmail with a message adds it as plain text with a normal anchor and no button`; `acceptedEmail without a message is byte-identical to today's output` (guards the existing plain letter).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `sendAccepted` calls `getEmailMessage()` inside a try (a failed read means no message, the accept still goes out).
- [ ] **Step 4: Run these tests plus `tests/affiliates-emails.test.ts`, expect PASS. Commit** (`feat(affiliates): one message box for affiliate emails`).

---

### Task 4: Email kinds, daily count, send helpers

**Files:**
- Modify: `src/lib/data/affiliate-emails.ts` (`AffiliateEmailKind` adds `"progress" | "motivation"`; add `countSentLast24h()`), `src/lib/affiliates/send.ts`, `src/components/admin/affiliates/AffiliatesAdmin.tsx` (`KIND_LABEL` gets `progress: "Progress email"`, `motivation: "Motivation email"`)
- Test: `tests/affiliate-send-rich.test.ts`

**Interfaces:**
- Consumes: Task 2 builders; Task 1 kinds.
- Produces: `countSentLast24h(): Promise<number>` (counts rows with `status = 'sent'` and `created_at >= now - 24h`; on a read error it returns 300 so callers stop sending rather than overshoot); `sendProgress(a: { id: string; name: string; email: string }, input: ProgressInput): Promise<boolean>`; `sendMotivation(a: { id: string; name: string; email: string }, input: MotivationInput): Promise<boolean>`. Both use the existing `deliver` (logs, never throws).

- [ ] **Step 1: Write the failing tests:** `sendProgress logs kind "progress" and returns false without throwing when Brevo is not set up`; `sendMotivation logs kind "motivation"`; `countSentLast24h counts only sent rows from the last 24 hours`; `countSentLast24h returns 300 when the read errors`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Keep `deliver` private; add the two exports beside `sendAccepted`.
- [ ] **Step 4: Run `tests/affiliate-send-rich.test.ts tests/affiliate-email-history.test.ts tests/affiliates-admin-ui.test.tsx`, expect PASS. Commit** (`feat(affiliates): progress and motivation send helpers`).

---

### Task 5: Progress job and cron route

**Files:**
- Create: `src/lib/data/affiliate-progress.ts`, `src/app/api/cron/affiliate-progress/route.ts`
- Test: `tests/affiliate-progress-job.test.ts`, `tests/affiliate-progress-cron-route.test.ts`

**Interfaces:**
- Consumes: `getAffiliateBoard("all")`, `commissionPercent`, `splitCommissions`, `balancePkr`, `paidSoFar`, `paidInMonth`, `previousMonthKey`, `monthKey` (commission.ts), `affiliateSupportWa`, `affiliateLink` (contact.ts), `sendProgress` (Task 4), `getEmailMessage` (Task 3), `gapFor`/`gapLine` (leaderboard.ts).
- Produces: `runProgressEmails(now?: Date): Promise<{ affiliates: number; sent: number; failed: number; skipped: number }>`; cron route `GET /api/cron/affiliate-progress` with the same fail-closed `CRON_SECRET` check as `src/app/api/cron/sheet-mirror/route.ts`, `maxDuration = 60`, returns the counts only.

Behaviour of `runProgressEmails` (decided here, not left open):
1. Read pending rows: `affiliate_commissions` where `progress_emailed_at is null`, `voided_at is null`, `progress_attempts < 5`; group by `affiliate_id`; process at most 40 affiliates per run, oldest first.
2. Load the all-time board once (`getAffiliateBoard("all")`) and the message once.
3. Per affiliate: read the `affiliates` row (`id, name, code, team, email, status, commission_mode, manual_percent, opening_secured, opening_commission, opening_withdrawn`) and its `affiliate_commissions` rows.
4. If status is not `accepted`, or no code: mark the pending rows `progress_emailed_at = now()` (handled, no email, no log) and count as skipped. If there is no email address: same, plus count as skipped.
5. Claim: `update ... set progress_emailed_at = now() where id in (<pending ids>) and progress_emailed_at is null returning id`. If it returns no rows, someone else has them: skip.
6. Stop the whole run when `countSentLast24h()` is already 300 or more (leave unclaimed rows for the next run).
7. Build `ProgressInput`: `paid = paidSoFar(opening_secured, live rows)`, percent from `commissionPercent` using `previousMonthKey(monthKey(now))`, commission and balance from `splitCommissions` and `balancePkr` (same as `buildPageModel`), `rank` and `gapLine` from the board row for this affiliate (`rank` null and gap line "Get your first paid sale to join the race." never happens here because the affiliate has a paid sale, but keep the null path), `top` = first 10 board rows with `paid >= 1` plus the affiliate's own row appended if outside the top 10, `isMe` set.
8. `sendProgress`; on success count `sent`; on failure release the claim (`progress_emailed_at = null`, `progress_attempts = progress_attempts + 1` on those rows) and count `failed`.

- [ ] **Step 1: Write the failing tests** (mock `createAdminSupabase`, `getAffiliateBoard`, `sendProgress`, `getEmailMessage` as `tests/affiliate-leaderboard-data.test.ts` does): `sends one email for an affiliate with three pending rows and marks all three`; `skips and marks rows of a dropped affiliate without sending`; `releases the claim and adds one attempt when the send fails`; `does not touch rows with 5 attempts`; `does not send when two runs claim the same rows (second claim returns nothing)`; `stops when the 24 hour count is 300 or more`; `puts the affiliate's own row after the top 10 when they rank below 10`; `works when the board has fewer than 10 ranked rows and when the affiliate is the only one`; `cron route returns 401 without the secret, 401 when CRON_SECRET is unset, and the counts with it`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the data function and route as described.
- [ ] **Step 4: Run both test files, expect PASS. Commit** (`feat(affiliates): automatic Progress email job`).

---

### Task 6: Motivation list and send

**Files:**
- Create: `src/lib/data/affiliate-motivation.ts`, `src/app/api/admin/affiliates/motivation/route.ts`
- Test: `tests/affiliate-motivation.test.ts`

**Interfaces:**
- Consumes: Task 2 `motivationEmail`, Task 4 `sendMotivation` and `countSentLast24h`, `getAffiliateBoard("all")`.
- Produces: `listMotivationCandidates(includeSent: boolean): Promise<{ id: string; name: string; email: string | null; sentAt: string | null }[]>` (accepted affiliates whose all-time board `paid` is 0, sorted by name; those with `motivation_emailed_at` set are left out unless `includeSent`); `sendMotivationBatch(ids: string[], opts: { includeSent: boolean }): Promise<{ sent: number; failed: number; skipped: number; limitReached: boolean; remainingToday: number }>`; route `POST /api/admin/affiliates/motivation` body `{ ids: string[]; includeSent?: boolean }` (admin only, at most 25 ids per call, 400 otherwise) returning the batch result; route `GET` with `?includeSent=1` returning the candidate list for the screen.

Behaviour: re-check every id server-side (accepted, paid 0, has an email, not already sent unless `includeSent`); claim with `update affiliates set motivation_emailed_at = now() where id = $1 and (motivation_emailed_at is null or $includeSent) returning id` before sending; on a failed send set `motivation_emailed_at` back to its previous value (null for a first send); stop at 250 in `countSentLast24h()` and report `limitReached` with `remainingToday = max(0, 250 - count)`. Leader line = top board row's public name and paid count; top = first 5 board rows with `paid >= 1`.

- [ ] **Step 1: Write the failing tests:** `candidates are accepted affiliates with zero paid, sorted, without those already sent`; `includeSent shows them again`; `a person who now has a paid sale is skipped even if the screen still lists them`; `a failed send leaves motivation_emailed_at as it was`; `a second identical call right after the first sends nothing (claim)`; `stops at 250 and says limitReached`; `rejects more than 25 ids`; `route is admin only`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS. Commit** (`feat(affiliates): Motivation email list and send`).

---

### Task 7: Admin "Emails" tab (needs Stitch screens first)

**Files:**
- Create: `src/components/admin/affiliates/AffiliateEmailsTab.tsx`
- Modify: `src/components/admin/affiliates/AffiliatesAdmin.tsx` (new tab `"emails"` labelled "Emails"), `src/app/dashboard/admin/affiliates/page.tsx` (loads the message with `getEmailMessage()`; a failed read must not break the other tabs)
- Test: `tests/affiliate-emails-tab-ui.test.tsx`

**Interfaces:**
- Consumes: `PUT /api/admin/affiliates/email-message`, `GET` and `POST /api/admin/affiliates/motivation` (Tasks 3 and 6).

- [ ] **Step 1: STOP and hand the owner the two Stitch prompts** already written in `docs/superpowers/plans/2026-11-12-affiliate-emails-owner-steps.md` (created with this plan; the owner can run them in Stitch while Tasks 1 to 6 are built). The screen is "Emails" tab on the admin Affiliates page. Phone (390px) and PC (1440px) prompt, both required. Wait for the owner's screens; if `edit_screens` times out, check `get_screen` for a new file name, do not retry blindly. Build the layout from the screens, copying them exhaustively.
- [ ] **Step 2: Write the failing UI tests:** the tab shows a message box with a "Save message" button and a 1000 character counter; saving calls the PUT route and shows "Saved"; clearing it and saving sends an empty message; the Motivation list shows every candidate ticked, a "Send to N people" button and a switch "Also show people who already got it" (off); sending chunks the ticked ids by 25, shows "Sent 25 of 60" progress, and ends with "Done. Sent N." or "Daily limit reached. N people left for tomorrow."; with no candidates it shows an empty state ("Everyone has at least one paid sale."); touch targets at least 44px on phone.
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement** the tab and wiring. Plain words only.
- [ ] **Step 5: Run the new test and `tests/affiliates-admin-ui.test.tsx`, expect PASS. Commit** (`feat(affiliates): Emails tab for the message box and Motivation send`).

---

### Task 8: Owner steps, checks, review

**Files:**
- Modify: `docs/superpowers/plans/2026-11-12-affiliate-emails-owner-steps.md` (plain words; it already holds the two Stitch prompts)

- [ ] **Step 1: Add the owner steps above the prompts:** (1) paste 0113; (2) save one `CRON_SECRET` check: confirm Vercel already has `CRON_SECRET` and the Vault secret `session_cron_secret` exists (the sheet-mirror job uses both); (3) paste the `cron.schedule('affiliate-progress','*/5 * * * *', ...)` statement copied from the sheet-mirror owner steps with the URL `https://pz-academy.pharmacozyme.com/api/cron/affiliate-progress`, plus how to stop it (`cron.unschedule`); (4) how to do one real test: use a test affiliate only, never the real list, send one Motivation email to the owner's own address, check the inbox versus Promotions, then turn one registration Paid and wait 5 minutes; (5) the two Stitch prompts (phone 390px and PC 1440px) for the Emails tab; (6) what the owner will see and the limits (300 a day, 250 for Motivation).
- [ ] **Step 2: Run all checks:** tsc (0 errors), eslint on every changed file, every new test file, plus `tests/affiliates-admin-ui.test.tsx tests/affiliates-emails.test.ts tests/affiliate-page-ui.test.tsx`. `npx next build` only when no dev server is running (it is safe here: none is running).
- [ ] **Step 3: Final whole-branch review** with a subagent on opus (set `model: "opus"` explicitly) against the spec and this plan; apply its fixes; report the result to the owner.
- [ ] **Step 4: Commit** the owner steps (`docs: affiliate emails owner steps`). Do not push until the owner says "push"; then give the compare link `https://github.com/pzacademy9/PZ-Academy---Mentorship-Program/compare/main...affiliate-emails`.
