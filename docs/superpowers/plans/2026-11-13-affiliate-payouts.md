# Affiliate Payouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an affiliate with a balance of PKR 3,500 or more request their whole balance from their private page, and let the owner mark it paid or reject it from a new Payouts section, with emails to the affiliate on both outcomes.

**Architecture:** A new service-role table `affiliate_payouts` is the single record. Balance shown anywhere = existing `balancePkr()` minus payouts that are pending or paid, so a rejection returns the money with no extra step. Request is a token-guarded API route; admin actions are an admin-guarded API route; both go through one data module.

**Tech Stack:** Next.js 14 App Router, Supabase (service role, hand-pasted SQL), Brevo email, vitest + Testing Library, zod.

**Spec:** `docs/superpowers/specs/2026-11-13-affiliate-payouts-design.md` (read it first; it holds the owner's rulings).

## Global Constraints

- Branch `affiliate-payouts` (already cut from origin/main, spec committed). Never push or merge without the owner's explicit yes. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage files by path only. Leave untracked `docs/lead-capture-go-live-guide.md` and the two 2026-11-02 plan files alone.
- Checks run directly (the `&` in the path breaks `npm run`): `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Known failing test files, not ours: landing-event-sheet, landing-hero-render, landing-polish-3, landing-route-hardening, pz-tokens, participant-recipients, participant-whatsapp-ui, gas-apply-registration-status, migrations-segment-source-dnc, participant-campaign-page-ui, registration-id-selection. `landing-registrations-list-ui` is flaky: re-run alone.
- Never regenerate `database.types.ts`: hand-add entries. No `eslint-disable` for `@typescript-eslint`. Preserve line endings (many files are CRLF). Colours: backgrounds and borders use `pz-solid-*` or `landing-*` tokens; `pz-deep`, `pz-mid`, `pz-danger` are text only.
- Supabase project whqdasotjlhvrjmgiffk is read-only SELECT through tools; the owner pastes all write SQL. Never email real affiliates during development; never commit affiliate data. No dev server unless asked; never `next build` while one runs.
- Threshold `WITHDRAW_PKR = 3500`, whole balance only, one pending request per affiliate, no partial amounts, no undo.
- Email wording: calm, no exclamation marks, no sales words; Progress-email design (use `wrap()` in `src/lib/affiliates/rich-emails.ts`).
- Port Stitch layouts (project 13117286791417011091, screen ids in the spec) with real copy only; leave out everything the spec lists as non-goals. Fetch HTML with `mcp__stitch__download_file` (name `projects/13117286791417011091/screens/<id>/fileEntries/html`).
- Phone-first; the owner checks on a phone.

## Review Focus

- Two taps, or two tabs, on Request payout: exactly one pending row (test in Task 3).
- Balance 3,499.99 refused, 3,500.00 accepted; foreign-currency "waiting" amounts never counted (Tasks 2, 3).
- A bookmarked or mistyped `?tab=` value, or none at all: the page opens on Applications, never blank (Task 8).
- Account number typed with spaces or dashes ("0300-123 4567"): accepted and stored clean; letters in a wallet number refused (Task 2).
- Admin presses Mark paid or Reject twice, or on an already-decided row: second press changes nothing and says so (Task 3, Task 7).
- Email fails to send after Mark paid or Reject: the decision stays, the admin is told, the failure is logged (Task 6, Task 7).
- A dropped or left affiliate with a pending request: admin can still decide it; their page stays closed (Task 7).

---

### Task 1: Migration 0114 and database types

**Files:**
- Create: `supabase/migrations/0114_affiliate_payouts.sql`
- Modify: `src/lib/supabase/database.types.ts` (add `affiliate_payouts` Row/Insert/Update by hand)
- Test: `tests/migrations-affiliate-payouts.test.ts`

**Interfaces:**
- Produces: table `public.affiliate_payouts(id uuid pk default gen_random_uuid(), affiliate_id uuid not null references affiliates(id), amount_pkr numeric(12,2) not null, method text not null, account_title text not null, account_number text not null, status text not null default 'pending', reject_reason text, requested_at timestamptz not null default now(), decided_at timestamptz)`; email kinds `payout_paid`, `payout_rejected` accepted by `affiliate_emails_kind_check`.

- [ ] **Step 1: Write the failing test.** Read the SQL file as text and assert: it creates the table with the columns above; check constraints `method in ('jazzcash','easypaisa','bank')`, `status in ('pending','paid','rejected')`, `amount_pkr >= 3500`, and "rejected requires reject_reason"; a partial unique index `... (affiliate_id) where status = 'pending'`; `enable row level security` with no `create policy`; both new kinds appear in the replaced kind check; the file uses `if not exists` / drop-then-add so a second paste is safe.
- [ ] **Step 2: Run it to see it fail** (`vitest run tests/migrations-affiliate-payouts.test.ts`): file missing.
- [ ] **Step 3: Write the migration** following the replace-constraint pattern of `supabase/migrations/0113_affiliate_emails_progress.sql` for the kind check (copy its existing kinds plus the two new ones). Add the `affiliate_payouts` types to `database.types.ts` by hand.
- [ ] **Step 4: Run the test and `tsc --noEmit`**: pass, 0 errors.
- [ ] **Step 5: Commit** `feat(affiliates): payouts table migration 0114`.

### Task 2: Payout rules (pure)

**Files:**
- Create: `src/lib/affiliates/payouts.ts`
- Modify: `src/lib/affiliates/rich-emails.ts` (import `WITHDRAW_PKR` from the new file instead of its local constant)
- Test: `tests/affiliate-payout-rules.test.ts`

**Interfaces:**
- Produces:
  - `export const WITHDRAW_PKR = 3500`
  - `export type PayoutMethod = "jazzcash" | "easypaisa" | "bank"`; `export type PayoutStatus = "pending" | "paid" | "rejected"`
  - `export function validatePayoutDetails(i: { method: string; title: string; number: string }): { ok: true; method: PayoutMethod; title: string; number: string } | { ok: false; error: string }` (title 2 to 80 chars trimmed; wallet number: strip spaces and dashes, must match `^03\d{9}$`; bank: strip spaces, upper-case, must match `^PK\d{2}[A-Z0-9]{20}$`; `number` returned cleaned; errors are plain sentences)
  - `export function maskAccount(number: string): string` (last four characters only, e.g. `•••• 4567`)
  - `export function availableBalance(balancePkr: number, heldPkr: number): number` (rounded to 2 places, never below 0)
  - `export function canRequest(available: number): boolean` (`available >= WITHDRAW_PKR`)

- [ ] **Step 1: Write the failing tests** with these assertions: `canRequest(3499.99)` false, `canRequest(3500)` true; `availableBalance(5000, 1500.5)` is `3499.5`; `availableBalance(100, 500)` is `0`; `validatePayoutDetails({method:"jazzcash",title:"Ali Khan",number:"0300-123 4567"})` returns number `"03001234567"`; letters in a wallet number refused; a 23-character IBAN refused; lower-case `pk36...` bank number accepted and upper-cased; unknown method refused; title `"A"` refused; `maskAccount("03001234567")` is `"•••• 4567"`.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the signatures above in `payouts.ts`; point `rich-emails.ts` at the shared constant.
- [ ] **Step 4: Run these tests plus `tests/affiliate-rich-emails.test.ts`**: all pass.
- [ ] **Step 5: Commit** `feat(affiliates): payout rules`.

### Task 3: Payouts data module

**Files:**
- Create: `src/lib/data/affiliate-payouts.ts`
- Test: `tests/affiliate-payouts-data.test.ts` (mock `createAdminSupabase` the way the other `tests/affiliate-*` data tests do)

**Interfaces:**
- Consumes: Task 1 table; Task 2 `PayoutMethod`, `PayoutStatus`, `WITHDRAW_PKR`, `maskAccount`.
- Produces (all server-only):
  - `export type PayoutRow = { id: string; affiliateId: string; affiliateName: string; affiliateCode: string | null; amountPkr: number; method: PayoutMethod; accountTitle: string; accountNumber: string; status: PayoutStatus; rejectReason: string | null; requestedAt: string; decidedAt: string | null }`
  - `export type HistoryRow = { id: string; amountPkr: number; method: PayoutMethod; accountMask: string; status: PayoutStatus; rejectReason: string | null; requestedAt: string; decidedAt: string | null }`
  - `export async function listAffiliateHistory(affiliateId: string): Promise<HistoryRow[]>` (newest first; throws on read error)
  - `export async function listAdminPayouts(): Promise<PayoutRow[]>` (joins affiliate name and code; throws on read error)
  - `export async function requestPayout(a: { affiliateId: string; available: number; method: PayoutMethod; title: string; number: string }): Promise<{ ok: true; amountPkr: number } | { ok: false; reason: "below-minimum" | "already-pending" | "error" }>` (refuses `available < WITHDRAW_PKR`; inserts one pending row for the whole `available`; a unique-violation (23505) means `already-pending`)
  - `export async function decidePayout(id: string, d: { action: "paid" } | { action: "reject"; reason: string }): Promise<{ ok: true; row: PayoutRow } | { ok: false; reason: "not-found" | "not-pending" | "error" }>` (conditional update `where id = ? and status = 'pending'`, sets `decided_at`; zero rows updated and the row exists means `not-pending`)

- [ ] **Step 1: Write the failing tests:** `requestPayout` with `available: 3499.99` returns `below-minimum` and inserts nothing; with `3500` inserts amount `3500`; a mocked 23505 error returns `already-pending`; `decidePayout` on an already-paid row returns `not-pending` and sends no second update; `decidePayout` reject stores the reason; `listAffiliateHistory` returns only masked numbers (no full account number anywhere in the result).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** with `createAdminSupabase()`; log real database errors with `console.error` and return `reason: "error"`.
- [ ] **Step 4: Run the tests**: pass.
- [ ] **Step 5: Commit** `feat(affiliates): payouts data module`.

### Task 4: Balance subtracts payouts (page model and Progress email)

**Files:**
- Modify: `src/lib/data/affiliate-page.ts` (`PageModelInput`, `AffiliatePageModel`, `buildPageModel`, `getAffiliatePageModel`)
- Modify: `src/lib/data/affiliate-progress.ts` (balance at the `ProgressInput` build, about line 146)
- Test: `tests/affiliate-page-payouts-model.test.ts`; update `tests/affiliate-progress-job.test.ts` if its mocks need the new read

**Interfaces:**
- Consumes: Task 2 `availableBalance`, `canRequest`, `WITHDRAW_PKR`; Task 3 `listAffiliateHistory`, `HistoryRow`.
- Produces: `PageModelInput.payouts: HistoryRow[]`; `AffiliatePageModel.balancePkr` now means available balance (`availableBalance(balancePkr(...), sum of amountPkr over pending and paid rows)`); new `AffiliatePageModel.payout: { minimum: number; canRequest: boolean; pendingPkr: number | null; history: HistoryRow[] }`.

- [ ] **Step 1: Write the failing tests** on `buildPageModel`: with opening commission 5,000 and a pending payout of 5,000 the model balance is `0`, `canRequest` false, `pendingPkr` is `5000`; same inputs with that payout `rejected` give balance `5000`, `canRequest` true, `pendingPkr` null; `paid` payouts also reduce the balance; foreign-currency waiting amounts do not change the balance.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** `getAffiliatePageModel` reads history with `listAffiliateHistory(row.id)` (a read error is thrown like its other reads). In `affiliate-progress.ts` subtract held payouts with a single query (pending and paid sums) before the `ProgressInput` balance is set; a failed read must not stop the email: fall back to held `0` and `console.error`.
- [ ] **Step 4: Run** the new test, `tests/affiliate-progress-job.test.ts`, and the existing affiliate page tests: pass.
- [ ] **Step 5: Commit** `feat(affiliates): balance takes payouts off`.

### Task 5: Request API

**Files:**
- Create: `src/app/api/affiliates/payout/route.ts`
- Test: `tests/affiliate-payout-request-route.test.ts`

**Interfaces:**
- Consumes: `affiliatePageCallerAllowed()` from `@/lib/pzid/caller-allowed` (rate limit), `getAffiliatePageModel(token)`, Task 2 `validatePayoutDetails`, `canRequest`, Task 3 `requestPayout`.
- Produces: `POST /api/affiliates/payout` body `{ token: string; method: string; title: string; number: string }` returning `200 { ok: true, amountPkr }` or `{ error: string }` with 400 (bad details), 404 (unknown, dropped or left affiliate: same answer as the closed page), 409 (below minimum, or a request already pending), 429 (rate limit), 500.

- [ ] **Step 1: Write the failing tests:** unknown token returns 404; bad IBAN returns 400 with the plain sentence; balance 3,499.99 returns 409; success returns the amount and calls `requestPayout` with `available` equal to the model balance; `already-pending` returns 409; over the rate limit returns 429 without reading the database.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** with a zod body schema. Do not return the token or any account number in responses.
- [ ] **Step 4: Run the test**: pass.
- [ ] **Step 5: Commit** `feat(affiliates): request payout route`.

### Task 6: Payout emails and the Progress email change

**Files:**
- Modify: `src/lib/affiliates/rich-emails.ts` (add `payoutPaidEmail`, `payoutRejectedEmail`; add `pageUrl` to `ProgressInput`; change the withdrawal block)
- Modify: `src/lib/affiliates/send.ts` (add `sendPayoutPaid`, `sendPayoutRejected`)
- Modify: `src/lib/data/affiliate-emails.ts` (`AffiliateEmailKind` gains `"payout_paid" | "payout_rejected"`)
- Modify: `src/lib/data/affiliate-progress.ts` (set `pageUrl` with `affiliateLink(token)`; add `token` to its affiliate select if missing)
- Test: `tests/affiliate-rich-emails.test.ts`, `tests/affiliate-send-rich.test.ts`

**Interfaces:**
- Produces:
  - `payoutPaidEmail(i: { name: string; amountPkr: number; method: PayoutMethod; paidOn: string; pageUrl: string; supportWa: string }): { subject: string; html: string }`, subject `"${name}, your payout of PKR ${amount} has been sent"`
  - `payoutRejectedEmail(i: { name: string; amountPkr: number; reason: string; pageUrl: string; supportWa: string }): { subject: string; html: string }`, subject `"${name}, an update on your payout request"`; body states the reason and that the amount is back in the balance
  - `sendPayoutPaid(a: { id: string; name: string; email: string }, input: Parameters<typeof payoutPaidEmail>[0]): Promise<boolean>` and `sendPayoutRejected(...)` likewise, both through the existing `deliver()` so each attempt is logged
- Progress email: when the balance is at least `WITHDRAW_PKR`, the block says to open the page and press Request payout and carries a link button "Open my page" to `pageUrl`; it no longer says "Please send your payment details on WhatsApp".

- [ ] **Step 1: Write the failing tests:** both new emails escape the reason (`<script>` becomes `&lt;script&gt;`), contain no `!`, include the amount, and the rejected one contains the reason text; the Progress email at balance 3,500 contains `href` equal to `pageUrl` and does not contain the old WhatsApp payment-details line; at 3,499.99 it contains neither block; `sendPayoutPaid` logs a row with kind `payout_paid` (mock as `affiliate-send-rich.test.ts` does).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** using `wrap()` and the calm wording rules; update the existing tests that asserted the old WhatsApp withdrawal wording.
- [ ] **Step 4: Run** the three test files above and `tests/affiliate-progress-job.test.ts`: pass.
- [ ] **Step 5: Commit** `feat(affiliates): payout emails and withdrawal pointer`.

### Task 7: Admin Payouts tab and decision route

**Files:**
- Create: `src/app/api/admin/affiliates/payouts/[id]/route.ts`
- Create: `src/components/admin/affiliates/AffiliatePayoutsTab.tsx`
- Modify: `src/components/admin/affiliates/AffiliatesAdmin.tsx` (new `"payouts"` section; its tab strip is removed in Task 8; props gain `payouts: PayoutRow[]` and `payoutsFailed: boolean`)
- Modify: `src/app/dashboard/admin/affiliates/page.tsx` (load `listAdminPayouts()` in try/catch; on failure pass `[]` and `payoutsFailed: true`)
- Test: `tests/affiliate-payout-decision-route.test.ts`, `tests/affiliate-payouts-tab-ui.test.tsx`

**Interfaces:**
- Consumes: Task 3 `decidePayout`, `PayoutRow`; Task 6 `sendPayoutPaid`, `sendPayoutRejected`; `requireAdmin("sales_hub")` from `@/lib/auth/require-admin`.
- Produces: `PATCH /api/admin/affiliates/payouts/[id]` body `{ action: "paid" } | { action: "reject"; reason: string }` (zod; reason trimmed, 3 to 300 characters) returning `200 { ok: true, emailSent: boolean }`, `404`, `409 { error: "This payout was already decided." }`, `400`, `500`. After a successful decision it sends the email; a failed email leaves the decision in place and returns `emailSent: false`.
- Component: `AffiliatePayoutsTab({ initial, failed }: { initial: PayoutRow[]; failed: boolean })`.

- [ ] **Step 1: Write the failing tests.** Route: non-admin gets the guard response; `paid` on a pending row returns `emailSent: true` and calls `sendPayoutPaid`; a send that returns `false` still returns 200 with `emailSent: false`; `reject` without a reason returns 400; a second call on a decided row returns 409 and sends no email; a payout whose affiliate is dropped can still be decided. UI: filter chips show counts and default to Pending; search filters by name and code; each pending card shows the affiliate name beside the account title and a copy button; Reject opens a form that disables Confirm until a reason is typed; after Mark paid the card moves to Paid without a reload; a load failure shows a "Could not load" notice.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** porting the layouts of the two admin Payouts Stitch screens (phone cards, PC table; the PC screen id is in the spec) with only the real parts. Quick-reason chips: "Account title does not match the name", "Wrong account number", "Other".
- [ ] **Step 4: Run** both test files plus `tests/affiliates-admin-ui.test.tsx`: pass.
- [ ] **Step 5: Commit** `feat(affiliates): admin Payouts tab`.

### Task 8: Affiliates hub navigation (sidebar and bottom bar)

**Files:**
- Modify: `src/components/dashboard/nav.ts` (add `AFFILIATES_HUB_ITEMS` and `AFFILIATES_HUB_BACK`), `src/components/dashboard/Sidebar.tsx` (hub mode), `src/components/admin/affiliates/AffiliatesAdmin.tsx` (read the section from a prop, remove the tab strip), `src/app/dashboard/admin/affiliates/page.tsx` (read `searchParams.tab`)
- Create: `src/lib/affiliates/hub-routes.ts`
- Test: `tests/affiliates-hub-nav.test.ts`, `tests/affiliates-hub-sidebar.test.tsx` (model on `tests/sales-hub-nav.test.ts` and `tests/sales-hub-sidebar.test.tsx`)

**Interfaces:**
- Produces: `AFFILIATES_HUB_BASE = "/dashboard/admin/affiliates"`; `export type AffiliatesTab = "applications" | "affiliates" | "payouts" | "leaderboard" | "emails"`; `export function parseAffiliatesTab(v: string | undefined): AffiliatesTab` (unknown or missing gives `"applications"`); `export function affiliatesTabHref(t: AffiliatesTab): string`; `export function isAffiliatesHubPath(pathname: string): boolean`; `AFFILIATES_HUB_ITEMS: NavItem[]` in the order Applications, Affiliates, Payouts, Leaderboard, Emails with `href` from `affiliatesTabHref`; `AFFILIATES_HUB_BACK` (label "Back to Admin", shortLabel "Admin", href `/dashboard/admin`). `AffiliatesAdmin` gains prop `tab: AffiliatesTab`.

- [ ] **Step 1: Write the failing tests:** `parseAffiliatesTab("payouts")` is `"payouts"`, `parseAffiliatesTab("x")` and `undefined` are `"applications"`; `isAffiliatesHubPath` true for the base and for `/dashboard/admin/affiliates/anything`, false for `/dashboard/admin` and `/dashboard/admin/affiliates-x`; rendering `Sidebar` with role admin at `/dashboard/admin/affiliates?tab=payouts` shows "Back to Admin" and the five items and NOT the normal admin items, and the Payouts item is marked current while Applications is not; at `/dashboard/admin/courses` the normal admin nav shows; the phone bar shows four items plus More, and More lists the rest; a manager without the `sales_hub` area does not get hub mode items (the page itself stays guarded as today).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** In `Sidebar.tsx` active state for hub items comes from `useSearchParams().get("tab")` through `parseAffiliatesTab`, since `activeHrefFor` only sees the path; keep the Sales Hub branch untouched. Update `AffiliatesAdmin` and the page to use the `tab` prop and drop the in-page tab strip; keep the `unmount on leave` saved-message behaviour that `savedMessage` state already handles.
- [ ] **Step 4: Run** both new tests, `tests/sales-hub-sidebar.test.tsx`, `tests/dashboard-nav.test.ts`, `tests/affiliates-admin-ui.test.tsx`, `tests/affiliate-admin-page-message.test.tsx`: pass (update the admin tests that clicked tab buttons to pass the `tab` prop instead).
- [ ] **Step 5: Commit** `feat(affiliates): Affiliates hub navigation`.

### Task 9: Affiliate page UI

**Files:**
- Modify: `src/components/affiliates/AffiliatePage.tsx` (Balance card states, request sheet/dialog, history list)
- Create: `src/components/affiliates/PayoutRequestSheet.tsx`
- Test: `tests/affiliate-page-payout-ui.test.tsx`

**Interfaces:**
- Consumes: Task 4 `AffiliatePageModel.payout` and `balancePkr`; Task 5 route; Task 2 `validatePayoutDetails`.
- Produces: `PayoutRequestSheet({ token, amountPkr, onDone }: { token: string; amountPkr: number; onDone: () => void })`. `AffiliatePage` needs the token to post: pass it from `src/app/affiliate/[token]/page.tsx` as a prop (it already has it from `params`).

- [ ] **Step 1: Write the failing tests:** balance 1,850: disabled button and the text "Available from PKR 3,500"; balance 4,120: enabled "Request payout of PKR 4,120"; pending model: balance 0 and "Payout of PKR 4,120 requested"; the sheet shows three method choices, an account title box, an account number box and the line "The whole balance is paid in one go"; Confirm posts `{ token, method, title, number }` to `/api/affiliates/payout` once even when tapped twice (button disabled while sending); a 409 or 400 error sentence is shown in the sheet; history shows Pending, Paid, and Rejected with its reason, and only the masked account.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** porting the Stitch screens "Affiliate Balance & Payout States" (phone) and "Affiliate Portal - Desktop"; keep this app's tokens; leave out the preview toggles, "Partner Tier", conversion tiles and the 24 to 48 hours line.
- [ ] **Step 4: Run** the new test and the existing `tests/affiliate-page*.test.tsx` files: pass; then `tsc --noEmit` and eslint on all touched paths.
- [ ] **Step 5: Commit** `feat(affiliates): payout request on the affiliate page`.

### Task 10: Owner steps and final checks

**Files:**
- Create: `docs/superpowers/plans/2026-11-13-affiliate-payouts-owner-steps.md`

- [ ] **Step 1:** Write the owner steps in plain short words: paste `0114_affiliate_payouts.sql` after the code is live; test on the owner's own test affiliate (code TE324, email hamzaansari4you@gmail.com): insert a test commission by SQL so the balance reaches 3,500, request on the page, check the admin card, Mark paid, check the paid email's tab, request again, Reject with a reason, check the balance returned and the rejected email; then clean-up SQL for the test rows (the owner pastes it). Never use a real affiliate.
- [ ] **Step 2:** Run the full set once: `tsc --noEmit`, eslint on `src/lib/affiliates src/lib/data src/components/affiliates src/components/admin/affiliates src/app/api src/app/dashboard/admin/affiliates tests`, and every test file touched by Tasks 1 to 9. Owner steps also include a phone check of the Affiliates bottom bar. Report anything failing that is not in the known-failing list.
- [ ] **Step 3: Commit** `docs: affiliate payouts owner steps`.
