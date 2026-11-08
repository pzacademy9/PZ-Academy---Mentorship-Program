# Affiliates Step 2 (Earning): credit, commission, private page. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the owner chose inline execution for Step 1) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An accepted affiliate's code and link credit sales to them, the commission of every sale is fixed at the moment it becomes Paid, and each affiliate has a private page (no login) showing their numbers.

**Architecture:** Affiliates plug in beside sales agents: new `affiliate_id` columns next to the `agent_id` ones, an owner promo code per accepted affiliate (the engine from PR #109 is reused), and one database trigger on `landing_registrations` that snapshots commission whenever a sale turns Paid or stops being Paid (every status path already goes through `landing_apply_status`, so one trigger covers the app, the sheet and the mirror). The private page is a public route keyed by the affiliate's secret token.

**Tech Stack:** Next.js 14.2.5 App Router, Supabase (service role, RLS on, no policies), zod, vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-affiliates-design.md` (Step 1 plan beside it: `docs/superpowers/plans/2026-11-07-affiliates-step1-foundation.md`). Branch `affiliates-step2-earning`, cut from main after PR #114.

Pieces 3 (leaderboards) and 4 (Progress and Motivation emails) are NOT in this plan: separate branches later. Step 3 (payouts) later still.

## Global Constraints

- Commission 8% to 10% of the amount the student actually paid (`coalesce(amount_received, expected_amount)`, already after discount), counted only when the sale is Paid. Automatic mode: 8% until `opening_secured + paid sales so far` reaches 10, then 10% for later sales. Manual mode: `manual_percent` (8 to 10). Percent is fixed in the snapshot and never recalculated.
- Group registrations: one group is one sale (lead row amount); member rows never earn. Test rows (`is_test = true`) never earn.
- Money is never converted. A commission is saved in the sale's own currency. Only PKR commission counts in the PKR balance. A foreign (AED, SAR...) commission is shown on its own line "waiting to be converted"; the owner converts it by hand to PKR later (the admin entry screen for that belongs to Step 3; the column `commission_pkr` is created now and stays empty for foreign sales). Owner ruling 2026-11-08.
- Balance = `opening_commission - opening_withdrawn + sum(commission_pkr of non-voided snapshots)`. Step 3 subtracts payouts.
- Credit goes to one party only: an agent link, else an affiliate link, else the owner of the promo code used (agent or affiliate). Never both `agent_id` and `affiliate_id` on one row.
- Attribution must never block a registration: every credit lookup or write failure is swallowed and logged without personal data.
- Dropped or left affiliates: their promo code is switched off (`active = false`, no new credit or discount); old commission stays. Only `accepted` affiliates get a private page; anyone else gets "This page is no longer active."
- Private page and its data route: `noindex`, rate-limited by the existing `public_lookup_allow` rpc (prefix `pz-affiliate-page:`), the token is the only key, `Cache-Control: no-store`. Never show other affiliates' money.
- Public wording rules from Step 1 still apply: never "official", "ambassador", "encrypted", review times, "instant", "weekly", Raast, tiers, a percent other than 8 to 10.
- Colours: backgrounds and borders use `pz-solid-*` tokens; `pz-deep`, `pz-mid`, `pz-danger` for text only. Phone-first (390px).
- Never regenerate `database.types.ts`: hand-add entries. No `eslint-disable` for `@typescript-eslint`. CRLF files: Read then Edit existing; Write for new. Tests: `node node_modules/vitest/vitest.mjs run tests/<file>`; also `node node_modules/typescript/bin/tsc --noEmit` (0 errors) and `node node_modules/eslint/bin/eslint.js <paths>`.
- Next migration number is 0109. The owner pastes it; Claude never applies it. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A sale moves Paid, then Pending, then Paid again: one snapshot, voided in between, restored, not doubled (test in Task 2's migration text test plus Task 1 rules).
2. A group registration: members carry the lead's affiliate and must not create commissions or count as sales (Task 2 trigger text test, Task 6 counts).
3. A code typed in a different case or with spaces/`-NN%` still credits the same affiliate (Task 4).
4. A dropped affiliate's code or link: no discount, no credit, and the registration still succeeds (Task 4, Task 5).
5. Two sales turning Paid at the same moment for the same affiliate: percent steps once, not twice (trigger locks the affiliate row; Task 2 text test).
6. A token that is wrong, too long, or of a dropped affiliate: same neutral answer, no detail about which (Task 7).

---

### Task 1: Commission rules (pure)

**Files:**
- Create: `src/lib/affiliates/commission.ts`
- Test: `tests/affiliate-commission.test.ts`

**Interfaces:**
- Produces:
  - `export const AUTO_LOW = 8; export const AUTO_HIGH = 10; export const AUTO_STEP = 10;`
  - `export function commissionPercent(a: { mode: "manual" | "automatic"; manualPercent: number | null; paidSoFar: number }): number` (manual returns `manualPercent` clamped to 8..10, or 8 when null; automatic returns 10 when `paidSoFar >= 10` else 8).
  - `export function commissionAmount(amountPaid: number, percent: number): number` (rounded to 2 decimals, never negative, 0 for non-finite).
  - `export function paidSoFar(openingSecured: number, liveSnapshots: number): number`.
  - `export function balancePkr(a: { openingCommission: number; openingWithdrawn: number; pkrCommissions: number[] }): number`.
  - `export function splitCommissions(rows: { currency: string; commission: number; commissionPkr: number | null; voided: boolean }[]): { earnedPkr: number; waiting: { currency: string; amount: number }[] }` (voided rows ignored; PKR rows add to `earnedPkr`; a non-PKR row with `commissionPkr` set adds that to `earnedPkr`; a non-PKR row with `commissionPkr` null goes to `waiting`, summed per currency, sorted by currency).

- [ ] **Step 1: Write the failing test** `tests/affiliate-commission.test.ts` with these cases (exact values): automatic with 0, 9 paid gives 8; with 10 and 40 gives 10; manual 9.5 gives 9.5; manual 12 clamps to 10; manual null gives 8; `commissionAmount(9999, 8)` is 799.92; `commissionAmount(-5, 8)` and `commissionAmount(NaN, 8)` are 0; `paidSoFar(164, 3)` is 167 and `paidSoFar(0, 0)` is 0; `balancePkr({openingCommission: 54032, openingWithdrawn: 4032, pkrCommissions: [800, 200.5]})` is 51000.5; `splitCommissions` ignores a voided row, puts `{PKR, 800}` in earned, keeps `{AED, 30}` and `{AED, 10}` as one `{currency: "AED", amount: 40}` in `waiting`, and moves an AED row with `commissionPkr: 2200` into `earnedPkr`.
- [ ] **Step 2: Run it to see it fail.** Run: `node node_modules/vitest/vitest.mjs run tests/affiliate-commission.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the five exports** in `src/lib/affiliates/commission.ts` (plain functions, no imports).
- [ ] **Step 4: Run it to see it pass.** Expected: all green.
- [ ] **Step 5: Commit** `feat(affiliates): commission rules`.

---

### Task 2: Migration 0109 (columns, commission table, trigger, stats, backfill)

**Files:**
- Create: `supabase/migrations/0109_affiliate_earning.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add)
- Test: `tests/migration-0109-affiliate-earning.test.ts` (reads the SQL file as text, like `tests/migrations-affiliates.test.ts`)

**Interfaces:**
- Produces (database):
  - `landing_promo_codes.owner_affiliate_id uuid references affiliates(id) on delete set null`.
  - `landing_registrations.affiliate_id` and `landing_funnel_events.affiliate_id`, both `uuid references affiliates(id) on delete set null`, partial indexes where not null; check on registrations: `agent_id is null or affiliate_id is null`.
  - Table `affiliate_commissions (id uuid pk, registration_id uuid unique references landing_registrations on delete cascade, affiliate_id uuid not null references affiliates on delete cascade, currency text not null, amount_paid numeric(12,2) not null, percent numeric(4,2) not null, commission numeric(12,2) not null, commission_pkr numeric(12,2), voided_at timestamptz, created_at timestamptz default now())`, index on `(affiliate_id, created_at desc)`, RLS on, no policies.
  - Function `affiliate_snapshot_commission()` and trigger `landing_registrations_affiliate_commission` (`after update of status on landing_registrations`, `for each row when (old.status is distinct from new.status)`).
  - Function `affiliate_link_stats(p_affiliate_id uuid) returns table (page_id uuid, views integer, registered integer, paid integer)` mirroring `landing_agent_link_stats` (0083) but on `affiliate_id`, service_role only.
  - Backfill: one owner promo code per accepted affiliate (`code` = affiliate code, `type 'percent'`, `value 0`, `is_owner_code true`, `plain_percent 10`, `owner_affiliate_id`), `on conflict (code) do nothing`.
- Types: hand-add `affiliate_commissions` Row/Insert/Update, the three new columns, and the `affiliate_link_stats` `Functions` entry.

- [ ] **Step 1: Write the failing test.** Assertions on the SQL text: contains each new column, the check `agent_id is null or affiliate_id is null`, `create table if not exists public.affiliate_commissions`, `registration_id uuid not null unique` (or `unique` on registration_id), `enable row level security`, `after update of status`, `when (old.status is distinct from new.status)`, a `for update` lock on the affiliate row, the constants `8` and `10` in the percent logic, the row filter `row_type in ('individual', 'lead')` and `is_test = false` and `affiliate_id is not null`, handling of leaving paid (`voided_at = now()`) and of returning to paid (`voided_at = null`, no second insert: `on conflict (registration_id)`), the revoke/grant lines for both functions (service_role only), and the backfill `insert into public.landing_promo_codes` filtered on `status = 'accepted'` with `on conflict`. Also asserts the file is safe to run twice (uses `if not exists` / `create or replace` / `drop trigger if exists`).
- [ ] **Step 2: Run to see it fail.** Expected: FAIL, file not found.
- [ ] **Step 3: Write the migration.** Trigger logic: when `new.status = 'paid'` and `old.status <> 'paid'` and the row is a countable sale with an affiliate: lock the affiliate `for update`; if a snapshot for the registration exists set `voided_at = null` and stop; otherwise count live snapshots of that affiliate (`voided_at is null`) plus `opening_secured`, pick percent (manual: `manual_percent`, else 10 when the count is 10 or more, else 8), amount = `coalesce(new.amount_received, new.expected_amount)`, commission = `round(amount * percent / 100, 2)`, `commission_pkr = commission` when `new.currency = 'PKR'` else null, insert. When `old.status = 'paid'` and `new.status <> 'paid'`: `update affiliate_commissions set voided_at = now() where registration_id = new.id and voided_at is null`. The function is `security definer`, `set search_path = public`.
- [ ] **Step 4: Hand-add the types**, then run `node node_modules/typescript/bin/tsc --noEmit` (0 errors) and the new test (green).
- [ ] **Step 5: Commit** `feat(affiliates): migration 0109 earning tables, trigger and stats`.

---

### Task 3: Promo engine knows affiliate owners

**Files:**
- Modify: `src/lib/landing/registration/promo.ts` (add `ownerAffiliateId: string | null` to `PromoCode`), `promo-resolve.ts` (`isLiveOwnerCode` true when `ownerAgentId !== null || ownerAffiliateId !== null`), `src/lib/data/landing-promo-codes.ts` (COLUMNS, `mapRow`, `toRow` carry `owner_affiliate_id`), `src/lib/landing/registration/promo-form.ts` (an owner code that already has an affiliate owner validates without choosing an agent and keeps that owner on save), any fixture or caller that builds a `PromoCode` literal (fix the type errors tsc reports).
- Test: `tests/promo-affiliate-owner.test.ts`, plus the existing `promo-resolve` and `promo-form` tests must stay green.

**Interfaces:**
- Consumes: `PromoCode`, `resolvePromoWith`, `draftToInput`.
- Produces: `PromoCode.ownerAffiliateId: string | null`; `PromoCodeInput` carries it; `resolvePromoWith` treats an affiliate-owned owner code exactly like an agent-owned one (plain code gives plain percent, `CODE-NN%` gives NN% up to the ceiling).

- [ ] **Step 1: Write the failing test.** Cases: an owner code with `ownerAffiliateId: "aff1"` and `ownerAgentId: null` typed plain resolves to a 10% promo; typed `AB321-15%` resolves to 15%; typed `AB321-45%` returns `overMax` 30; an owner code with neither owner behaves as an ordinary code (as today); `draftToInput` for an owner-code draft with an affiliate owner returns ok and keeps `ownerAffiliateId`; `mapRow` round-trip keeps `owner_affiliate_id` (test through `getPromoByCode` with the supabase mock helper `tests/helpers/supabase-mock`).
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement the listed edits.** Admin promo list/edit screens show "Affiliate" as the owner label when only `ownerAffiliateId` is set (find the owner dropdown component with a grep on `ownerAgentId` in `src/components`).
- [ ] **Step 4: Run** the new test, the existing promo tests (`tests/promo-*.test.ts`, `tests/landing-promo*.test.ts`), tsc, eslint on touched files. Expected: green, 0 errors.
- [ ] **Step 5: Commit** `feat(affiliates): promo engine accepts affiliate owners`.

---

### Task 4: Credit by link and code

**Files:**
- Create: `src/lib/landing/registration/credit.ts` (pure), `src/lib/data/affiliate-credit.ts`
- Modify: `src/app/api/landing/[slug]/register/route.ts` (step 7), `src/app/api/landing/[slug]/event/route.ts`, `src/lib/data/landing-funnel.ts` (accept `affiliateId`), `src/lib/validations/landing-public.ts` only if a code under 3 characters must pass (affiliate codes are 4 to 6, so no change expected: verify and leave)
- Test: `tests/affiliate-credit.test.ts`, extend the existing register-route and event-route tests only where a signature changed

**Interfaces:**
- Consumes: `resolveAgentCode(code): Promise<{ agentId } | null>` (existing), `PromoCode`.
- Produces:
  - `export type Credit = { agentId: string | null; affiliateId: string | null }`
  - `export function pickCredit(a: { isTest: boolean; agentLink: string | null; affiliateLink: string | null; promoCounts: boolean; promoOwnerAgentId: string | null; promoOwnerAffiliateId: string | null }): Credit` (test rows get neither; agent link wins; then affiliate link; then the promo owner when `promoCounts`; never returns both).
  - `export async function resolveAffiliateCode(code: string): Promise<{ affiliateId: string } | null>` in `affiliate-credit.ts`: uppercase and trim, match `affiliates.code` where `status = 'accepted'`, never throws (returns null on any error).
  - `export async function creditRegistration(registrationId: string, affiliateId: string): Promise<void>`: `update landing_registrations set affiliate_id = ... where id = ... and agent_id is null`; logs a code only, never throws.

- [ ] **Step 1: Write the failing tests.** `pickCredit` table: test row gives both null; agent link beats affiliate link; affiliate link beats promo owner; promo owner agent and promo owner affiliate each work when `promoCounts`; nothing set gives both null; never both non-null. `resolveAffiliateCode`: mixed-case `as47` finds `AS47` accepted; a dropped affiliate gives null; db error gives null; empty string gives null.
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement** the three exports. In the register route replace the step-7 agent line with `pickCredit`, passing the resolved agent link, the affiliate link (looked up only when no agent link matched), and the promo owner fields (`promoCounts` keeps today's rule: `promo && (promo.discount > 0 || promoCode?.isOwnerCode)`). Create the registration as today with `agentId`; after success call `creditRegistration(leadId, affiliateId)` when an affiliate won (the atomic RPC is not changed). In the event route resolve the agent link first, then the affiliate link, and record `affiliateId` on the funnel event.
- [ ] **Step 4: Run** the new test plus the existing register and event route tests, tsc, eslint. Expected: green.
- [ ] **Step 5: Commit** `feat(affiliates): credit sales by affiliate link and code`.

---

### Task 5: Accept makes the code, drop and leave switch it off

**Files:**
- Modify: `src/lib/data/affiliates.ts` (acceptApplication, dropAffiliate, markAffiliateLeft), possibly `src/lib/affiliates/service.ts`
- Create: `src/lib/data/affiliate-promo.ts`
- Test: `tests/affiliate-promo-sync.test.ts`; existing `affiliates-data` and `affiliate-service` tests stay green

**Interfaces:**
- Consumes: `createPromoCode`, `updatePromoCode` (landing-promo-codes), `acceptApplication`.
- Produces: `export async function ensureAffiliatePromo(a: { id: string; code: string }): Promise<"ok" | "failed">` (creates the owner code if none exists for that affiliate, otherwise makes sure it is active); `export async function deactivateAffiliatePromo(id: string): Promise<void>`; the owner code is `{ type: "percent", value: 0, isOwnerCode: true, plainPercent: 10, ownerAgentId: null, ownerAffiliateId: id, active: true }`.

- [ ] **Step 1: Write the failing test.** Accept creates one owner promo with the affiliate's code and `ownerAffiliateId`; accepting twice (retry) does not create a second; a promo failure does not undo the accept and the result still carries `ok: true` with `promoFailed: true` (the admin screen shows "Code saved, discount not active yet: press Resend"); drop and leave set `active = false` on that affiliate's code; a dropped affiliate has no code, no error.
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement.** `ensureAffiliatePromo` is called after the atomic accept; `resend` also calls it (so a failed code can be repaired from the admin screen); drop/leave call `deactivateAffiliatePromo`. Surface `promoFailed` in the PATCH route response and show it in `AffiliatesAdmin.tsx` next to the existing email notice.
- [ ] **Step 4: Run** the new test, `affiliates-data`, `affiliate-service`, `affiliates-admin-routes`, `affiliates-admin-ui`, tsc, eslint. Expected: green.
- [ ] **Step 5: Commit** `feat(affiliates): accept creates the promo code, drop and leave switch it off`.

---

### Task 6: Affiliate numbers (data layer)

**Files:**
- Create: `src/lib/data/affiliate-page.ts`
- Test: `tests/affiliate-page-data.test.ts`

**Interfaces:**
- Consumes: `commission.ts` (Task 1), `affiliate_link_stats` rpc and `affiliate_commissions` table (Task 2), `listPublishedLinkPages` (landing-agent-stats), `affiliateLink`/contact helpers.
- Produces:
  - `export type AffiliatePageModel = { name: string; code: string; team: string | null; percent: number; paidCount: number; toNextStep: number | null; earnedPkr: number; balancePkr: number; waiting: { currency: string; amount: number }[]; totals: { views: number; registered: number; paid: number }; links: { pageId: string; title: string; url: string; views: number; registered: number; paid: number }[]; supportWa: string }`
  - `export async function getAffiliatePageModel(token: string): Promise<AffiliatePageModel | null>`: null unless the token matches an `accepted` affiliate. `toNextStep` is `10 - paidCount` while automatic and below 10, else null. `url` is `${base}/e/${slug}?ref=${code.toLowerCase()}` with `base` from `NEXT_PUBLIC_APP_URL` or `https://pharmacozyme.com` (same as `my-links/page.tsx`).
  - `export function buildPageModel(input): AffiliatePageModel` (pure assembly, tested without a database).

- [ ] **Step 1: Write the failing test.** `buildPageModel`: automatic affiliate with `opening_secured` 8 and 2 live snapshots shows `paidCount` 10, `percent` 10, `toNextStep` null; with 3 paid shows 8% and `toNextStep` 7; manual 9% shows 9 and `toNextStep` null; balance equals opening minus withdrawn plus PKR commissions; an AED snapshot with no PKR value appears in `waiting` and not in the balance; one link row per published page including pages with zero numbers; totals add the link rows. `getAffiliatePageModel`: unknown token, dropped affiliate and empty string all return null (supabase mock).
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement** both functions; one read each for the affiliate, snapshots, stats rpc and published pages; token compared exactly, length capped at 100 before the query.
- [ ] **Step 4: Run** the new test, tsc, eslint. Expected: green.
- [ ] **Step 5: Commit** `feat(affiliates): affiliate numbers for the private page`.

---

### Task 7: Private page `/affiliate/[token]`

**Files:**
- Create: `src/app/affiliate/[token]/page.tsx`, `src/app/affiliate/[token]/layout.tsx` (noindex metadata, same Inter font as `affiliate-apply/layout.tsx`), `src/components/affiliates/AffiliatePage.tsx` (client: copy buttons), `src/lib/pzid/lookup-limit.ts` (add `allowAffiliatePage`)
- Test: `tests/affiliate-page-ui.test.tsx`, `tests/affiliate-page-route.test.ts`

**Interfaces:**
- Consumes: `getAffiliatePageModel(token)`, `allowAffiliatePage(ip): Promise<boolean>` (prefix `pz-affiliate-page:`, 60 per 10 minutes, fails closed like `allowAffiliateApply`).
- Produces: the page; `<AffiliatePage model={AffiliatePageModel} />`.

Design source: no Stitch screen exists for this page (checked 2026-11-08). The owner decides: generate one from a prompt this plan's executor hands over, or build on the My links layout (`src/components/sales/MyLinks.tsx`) like the quiz-results precedent. Do not start this task until that answer is recorded in the ledger.

- [ ] **Step 1: Write the failing tests.** UI: shows the name, the code with a copy button, "Your commission: 8%" (or 10%), "N more paid participants to reach 10%" only when `toNextStep` is set, earned and balance as `PKR 51,000`, a "Waiting to be converted" line only when `waiting` is not empty (for example `AED 40`), one card per course with the link, a copy button, and views, registered, paid; the course list is empty-state friendly ("No open courses right now"); no leaderboard, no payout button yet; no banned words (`official|ambassador|instant|weekly|raast|encrypted`); every colour class is a `pz-solid-*`, `landing-*` token or text-only token. Route: a wrong or too-long token and a dropped affiliate both render the same "This page is no longer active. Message us on WhatsApp." with status 200 and `robots: noindex`; a rate-limited caller gets the same neutral page; the page is `force-dynamic`.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the page (server component calls the limiter with the caller's IP the same way the `/progress` actions do, then `getAffiliatePageModel`) and the client component (copy-to-clipboard with the existing toast pattern). `metadata.robots = { index: false, follow: false }`.
- [ ] **Step 4: Run** both tests, tsc, eslint, and `npx next build` is NOT run here (CLAUDE.md allows it only when no dev server is up: run it once at Task 8).
- [ ] **Step 5: Commit** `feat(affiliates): private affiliate page`.

---

### Task 8: Whole-branch checks, review, owner steps

**Files:**
- Create: `docs/superpowers/plans/2026-11-08-affiliates-step2-owner-steps.md` (plain words: paste 0109, what it does, how to live-check, the order to accept real applicants)

- [ ] **Step 1:** Run every new test file together plus the touched existing ones, `tsc --noEmit`, eslint on `src/lib/affiliates src/lib/data src/app/affiliate src/components/affiliates src/lib/landing/registration`. Expected: all green, 0 errors; the known-failing list in CLAUDE.md is unchanged.
- [ ] **Step 2:** `npx next build` once (no dev server running). Expected: success.
- [ ] **Step 3:** One fresh Opus review of the whole branch (`review-package` from the merge base, explicit model), then one fix pass, each fix with a failing test first.
- [ ] **Step 4:** Write the owner-steps file. It must tell the owner: paste 0109; live check with a test registration crediting `TP`-style code; confirm a Paid change makes one commission row; and that real applicants can be accepted only after 0109 is pasted and the deploy is live.
- [ ] **Step 5:** Commit, then ask the owner whether to push (never push without a yes).
