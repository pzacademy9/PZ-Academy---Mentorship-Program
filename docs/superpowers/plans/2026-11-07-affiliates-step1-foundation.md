# Affiliates Step 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner chose inline execution for earlier projects) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Applicants can apply on a hidden page; admin accepts or drops them; accepting creates the code, the private token and sends the Accepted email; the 188 old affiliates are importable with their codes and opening totals.

**Architecture:** One new table `affiliates` plus a serial sequence (migration 0107, pasted by the owner). Pure rules (code building, form validation) live in `src/lib/landing/` style pure modules with injected deps, like `agent-promo.ts`. A server data layer wraps Supabase. A separate Brevo sender (`brevo-affiliates.ts`) mirrors `brevo-participants.ts`. Admin UI is a new "Affiliates" screen inside the existing `sales_hub` area.

**Tech Stack:** Next.js 14 route handlers, Supabase service role, zod, vitest, tailwind `pz-*` tokens (backgrounds/borders `pz-solid-*`; `pz-deep`, `pz-mid`, `pz-danger` for text only).

**Spec:** `docs/superpowers/specs/2026-11-07-affiliates-design.md`. Stitch screens: project "PZ Academy Platform 2" (affiliate form and admin Affiliates screens; check the wording against the spec, Stitch invented some claims).

## Global Constraints

- Repo `D:\Claude Code Workspace\PZ Academy\PZ Academy LMS & Site\Recovered Files\pz-academy-platform`. Run checks directly: `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Never `npm run`.
- Never regenerate `database.types.ts`: hand-add the new table. Never add eslint-disable for @typescript-eslint. Existing files use CRLF: Read then Edit; Write for new files.
- Supabase is read-only through tools: all SQL is a numbered migration the owner pastes. Next number: 0107.
- Never commit student or affiliate data. Tests use fake people. The import SQL (real people) is written to a git-ignored folder and never committed.
- Never push or merge without the owner's explicit yes. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Phone-first: owner checks on a phone. Tap targets 44px+, nothing wider than 390px.
- Brevo key lives only in env vars: `BREVO_API_KEY_AFFILIATES`, `BREVO_SENDER_EMAIL_AFFILIATES` (affiliates@pharmacozyme.com), `BREVO_SENDER_NAME_AFFILIATES`. Never in the repo.
- Accepted affiliates do not yet give students a discount (that is Step 2). The owner must not accept real applicants before Step 2 ships.

## Review Focus

- Two applications from the same email (case and spaces differ): refused, not duplicated.
- Two admins pressing Accept on the same applicant at once: one code, one email.
- Name with only a title ("Dr") or one word or non-Latin letters: code still valid and unique.
- Applicant text containing HTML or very long text: stored as text, never rendered as markup, capped.
- Bots posting the public form: rate limit and honeypot.
- Admin who lacks the sales_hub area cannot read applications (they contain phone numbers).
- A failed email never loses an accept: status changes, and the admin sees "email not sent" with a Resend button.

## File Structure

- Create `supabase/migrations/0107_affiliates.sql`
- Modify `src/lib/supabase/database.types.ts` (hand-add `affiliates` row/insert/update and the rpc)
- Create `src/lib/affiliates/code.ts` (pure: build code from name and serial)
- Create `src/lib/validations/affiliate-application.ts` (zod)
- Create `src/lib/data/affiliates.ts` (server data layer)
- Create `src/lib/brevo-affiliates.ts` and `src/lib/affiliates/emails.ts` (templates)
- Create `src/app/api/affiliates/apply/route.ts` and `src/app/affiliate-apply/page.tsx` + `src/components/affiliates/ApplyForm.tsx`
- Create `src/app/api/admin/affiliates/route.ts`, `src/app/api/admin/affiliates/[id]/route.ts`, `src/app/dashboard/admin/affiliates/page.tsx`, `src/components/admin/affiliates/AffiliatesManager.tsx`
- Modify `src/lib/team/areas.ts` (add `affiliates` to the `sales_hub` regex), `src/components/dashboard/nav.ts` (menu entry)
- Create `scripts/import-old-affiliates.mjs` (reads the old xlsx, writes SQL to `.local/` git-ignored)
- Tests: `tests/affiliate-code.test.ts`, `tests/affiliate-application-validation.test.ts`, `tests/affiliates-data.test.ts`, `tests/affiliates-emails.test.ts`, `tests/affiliate-apply-route.test.ts`, `tests/affiliates-admin-routes.test.ts`, `tests/affiliates-admin-ui.test.tsx`, `tests/affiliate-apply-ui.test.tsx`, `tests/migrations-affiliates.test.ts`

### Task 1: Migration 0107 and types

**Files:** Create `supabase/migrations/0107_affiliates.sql`; modify `database.types.ts`; test `tests/migrations-affiliates.test.ts`.

**Interfaces — Produces:** table `affiliates(id uuid pk default gen_random_uuid(), status text check in ('applied','accepted','dropped','left') default 'applied', name text not null, email text not null, whatsapp text not null, city_country text not null, answers jsonb not null default '{}', code text unique null, code_serial int null, token text unique null, team text null check in ('Green','White','Yellow','Blue','Pink'), commission_mode text not null default 'automatic' check in ('manual','automatic'), manual_percent numeric(4,2) null check between 8 and 10, opening_secured int not null default 0, opening_commission numeric(12,2) not null default 0, opening_withdrawn numeric(12,2) not null default 0, is_imported boolean not null default false, accepted_at, dropped_at, left_at, created_at, updated_at)`. Unique index on `lower(email)`. Sequence `affiliate_code_serial` starting at 321, and `next_affiliate_serial() returns int` (security definer, service role only). RLS enabled, no policies. Idempotent (safe to run twice).

- [ ] **Step 1:** Write `tests/migrations-affiliates.test.ts` reading the SQL file: asserts every table/column/check above, the sequence start 321, `lower(email)` unique index, RLS enabled, `create ... if not exists` idempotency, and that the function is revoked from `anon, authenticated`.
- [ ] **Step 2:** Run it. Expected: FAIL (file missing).
- [ ] **Step 3:** Write the migration. Hand-add types to `database.types.ts` (Row/Insert/Update and `Functions.next_affiliate_serial`).
- [ ] **Step 4:** Run test + `tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 5:** Commit `feat(affiliates): table, serial sequence and types (0107)`.

### Task 2: Code building (pure)

**Files:** Create `src/lib/affiliates/code.ts`; test `tests/affiliate-code.test.ts`.

**Interfaces — Produces:** `buildAffiliateCode(name: string, serial: number): string`; `initialsFor(name: string): string`.

Rules: strip titles (Dr, Mr, Ms, Mrs, Miss, Prof, Professor, Engr, Engineer, Sir, Madam, with or without a dot, any case); remove non-letters; initials are first letter of first and of last remaining word; one word uses its first two letters; fewer than two Latin letters falls back to `AF`; uppercase; code = initials + serial.

- [ ] **Step 1:** Tests: `"Dr. Ayesha Khan",321 -> "AK321"`; `"Prof Dr Ali Raza Shah",322 -> "AS322"`; `"Zainab",323 -> "ZA323"`; `"Dr",324 -> "AF324"`; `"عائشہ",325 -> "AF325"`; `"  mr.  bilal  ahmed ",326 -> "BA326"`; `"Ayesha-Noor Khan",327 -> "AK327"`.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** implement. **Step 4:** run, expect PASS. **Step 5:** commit.

### Task 3: Application validation (zod)

**Files:** Create `src/lib/validations/affiliate-application.ts`; test `tests/affiliate-application-validation.test.ts`.

**Interfaces — Produces:** `affiliateApplicationSchema` (zod) and `type AffiliateApplication`. Fields: `name` (2-80), `email` (valid, lowercased, trimmed), `whatsapp` (7-20 digits after stripping spaces, +, -), `city` and `country` (1-60 each), `status` ("student"|"professional"), `organization` (1-120), `field` (1-120), `commissionExperience` {yes: boolean, details: string max 600}, `eventsManaged` {...}, `promotingPrograms` boolean, `onlineSales` boolean, `ratings` {marketing, eventPromotion, onlineEngagement, communication} each int 1-5, `hoursPerWeek` ("1-3"|"4-6"|"7-10"|"10+"), `linkedin` (optional, must start with https:// when present, max 200), `why` (10-1000), `website` (honeypot, must be empty). Details required (min 3 chars) when yes is true.

- [ ] Tests: a full valid object passes; each required field missing fails; rating 0 and 6 fail; `yes:true` with empty details fails; honeypot filled fails; email is lowercased and trimmed; text over its cap fails.
- [ ] Run RED, implement, run GREEN, commit.

### Task 4: Data layer

**Files:** Create `src/lib/data/affiliates.ts`; test `tests/affiliates-data.test.ts` (same fake-supabase chain approach as `tests/agent-promo-summary.test.ts`; pure orchestration with injected deps where possible).

**Interfaces — Produces:**
- `createApplication(input: AffiliateApplication): Promise<{ok:true;id:string}|{ok:false;reason:"duplicate"|"db-error"}>`
- `listAffiliates(filter: {status?: ...}): Promise<AffiliateRow[]>` (never returns `token` to the applications list; returns it only to the detail used for the copy-link button)
- `acceptApplication(id, opts:{code?: string; team?: Team|null}): Promise<{ok:true;code:string;token:string;email:string;name:string}|{ok:false;reason:"not-found"|"not-applied"|"code-taken"|"invalid-code"|"db-error"}>` — only an `applied` row can be accepted (atomic update `where status='applied'`, so two admins cannot both win); gets the serial from `next_affiliate_serial()` only when no code is given; token = 24 random bytes base64url; a clash on `code` returns `code-taken`.
- `dropApplication(id)`, `markLeft(id)`, `updateAffiliate(id, patch:{team?, commissionMode?, manualPercent?, status?})` (manual percent must be 8 to 10 when mode is manual).

- [ ] Tests: duplicate email (different case/spaces) gives `duplicate`; accept on `applied` returns code `AK321`-style built from the serial and a 32-char token; accept on an already accepted row returns `not-applied` and calls the serial function zero times; a given code that exists returns `code-taken`; a given code outside `[A-Z]{1,3}\d{1,4}` returns `invalid-code`; manual percent 7 and 11 are refused; list for applications never includes `token`.
- [ ] RED, implement, GREEN, commit.

### Task 5: Separate Brevo sender and the three emails

**Files:** Create `src/lib/brevo-affiliates.ts` (copy the `brevo-participants.ts` pattern with the three `_AFFILIATES` env vars; no fallback to the main sender), `src/lib/affiliates/emails.ts`; test `tests/affiliates-emails.test.ts`.

**Interfaces — Produces:** `sendAffiliateEmail({to,toName,subject,htmlContent})` (same result shape as `sendParticipantEmail`; "not set up" when the key is missing); `acceptedEmail({name, code, team, link, supportWa, groupWa}): {subject, html}`, `droppedEmail({name})`, `leftEmail({name})`.

Copy the tone and content of the old script's selection, dropped and left emails (see `Miscellaneous/Affiliates GAS`, `sendSelectionEmail_` and friends), updated to the new rules: commission 8 to 10 percent, plain code gives students 10% off, payout from PKR 3,500, certificate at 10 paid participants, link is the private link. All text from users is HTML-escaped.

- [ ] Tests: accepted email contains the code, the link, "8%" and "PKR 3,500", escapes `<script>` in the name; with `BREVO_API_KEY_AFFILIATES` unset `sendAffiliateEmail` returns `{ok:false}` without throwing and without calling the main sender.
- [ ] RED, implement, GREEN, commit.

### Task 6: Public apply route and page

**Files:** Create `src/app/api/affiliates/apply/route.ts`, `src/app/affiliate-apply/page.tsx`, `src/components/affiliates/ApplyForm.tsx`; tests `tests/affiliate-apply-route.test.ts`, `tests/affiliate-apply-ui.test.tsx`.

POST: rate limit per IP using the existing limiter in `src/lib/pzid/` (see `lookup-limit.ts` for how it is keyed), validate with Task 3, honeypot field `website` returns 200 without saving, duplicate returns 409 "You have already applied with this email.", success 201. Page: `robots: noindex, nofollow`, not in the main menu or sitemap, no site navigation (logo only). Form follows the Stitch screen "Pharmacozyme Affiliate Programme - Mobile (390px) Application & Success" with the corrected wording from the spec.

- [ ] Tests: honeypot filled returns 200 and `createApplication` not called; invalid body 400 with a field message; duplicate 409; the 31st request in the window from one IP is 429; page metadata has noindex; form shows an inline error for a bad email, disables submit while sending, and shows the success text after a 201.
- [ ] RED, implement, GREEN, commit.

### Task 7: Admin routes and screen

**Files:** Create the admin routes and page/component listed above; modify `areas.ts` and `nav.ts`; tests `tests/affiliates-admin-routes.test.ts`, `tests/affiliates-admin-ui.test.tsx`; extend the team-coverage expectations if the suite needs it.

Routes (all gated by `requireAdmin("sales_hub")`): `GET /api/admin/affiliates?status=`, `PATCH /api/admin/affiliates/[id]` with `{action:"accept"|"drop"|"leave"|"update"|"resend", ...}`. Accept sends the Accepted email; the response carries `emailSent: boolean` so the screen can show "Accepted. Email not sent, press Resend." A failed email never undoes the accept. Page: tabs Applications and Affiliates (Payouts and Leaderboard tabs are added in Steps 2 and 3, not shown now); Applications cards open a detail sheet with all answers, editable code field (prefilled with the next suggested code from the name and next serial), team picker, Accept and Drop; Affiliates tab lists name, code, team, status with a detail sheet: copy private link, commission mode and percent, mark as left, drop. Follow the Stitch screens for layout, not their invented features.

- [ ] Tests: a user without `sales_hub` gets 403 on both routes; accept with a taken code returns 409 with a plain message; accept twice returns 409 and sends one email; `emailSent:false` shows the Resend button; the applications list response contains no `token`; the card list renders at 390px without overflow classes that cause horizontal scroll (class check), Drop asks for confirmation.
- [ ] RED, implement, GREEN. Run `tests/team-coverage.test.ts`. Commit.

### Task 8: Old-affiliate import script

**Files:** Create `scripts/import-old-affiliates.mjs`; add `.local/` to `.gitignore` if missing; test `tests/affiliate-import-parse.test.ts` with a tiny fake sheet fixture (fake people only).

The script reads `Miscellaneous/V2.0-Affiliate Marketing Team Recruitment Form .xlsx` (sheet "Affiliate Marketers", header on row 2) with Node's zip + XML (no new dependency if `node:zlib` suffices, else ask before adding one) and writes `.local/old-affiliates-import.sql`: `insert ... on conflict (lower(email)) do nothing` rows with `status` from the sheet (SELECTED to accepted, dropped to dropped, left to left), `code` exactly as in the sheet, `is_imported = true`, team color, `opening_secured` (Secured), `opening_commission` (Amount or commission column), `opening_withdrawn` (column "Comission Withdral"), a generated private token each. Rows with no valid email, duplicate emails, or odd codes (like `RF283 10%`) are not imported but printed in a report. **Before writing SQL, print a summary (counts by status, total opening commission, rows skipped and why) and stop for the owner to approve.** The owner pastes the SQL; it is never committed.

- [ ] Tests (fixture): parses a code, status, team, secured; skips a row without an email; reports a duplicate email; keeps `AS47` unchanged; never writes a row when the code is not letters+digits.
- [ ] RED, implement, GREEN, commit (script and test only).

### Task 9: Whole-branch checks and handover

- [ ] Run `tsc --noEmit`, eslint on every touched path, the full vitest suite (compare against the known-failing list in the standing rules; re-run any other failing UI file alone).
- [ ] One fresh Opus review of the whole branch (Review Focus pasted into the prompt), one fix pass with failing tests first.
- [ ] Report to the owner: paste `0107`, set the three `BREVO_*_AFFILIATES` env vars on Vercel, push decision. Browser check at phone width after the owner pastes 0107 (use a fake applicant; the owner deletes it with one SQL line that I provide).
