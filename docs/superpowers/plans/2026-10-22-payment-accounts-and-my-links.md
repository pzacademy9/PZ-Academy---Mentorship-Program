# Payment Accounts by Country and Agent My Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One admin screen where payment accounts are organised by country and every landing page follows it; a "My links" screen for sales agents; an admin agent leaderboard.

**Architecture:** Two new tables (`payment_countries`, `payment_country_accounts`) hold the central, ordered account list per region key. One server function resolves a page region's accounts (central active list, else the region's old `accountKeys` filtered to active) and is used by the public config route, the register route and the status emails. Admin CRUD goes through admin-only API routes using the service-role client. Agent numbers come from one data module that reads `landing_funnel_events`, `landing_registrations` and `landing_status_events`.

**Tech Stack:** Next.js App Router, Supabase (service role, RLS on, no policies), zod, vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-payment-accounts-and-my-links-design.md`

## Global Constraints

- Branch `payment-accounts-my-links` (from main e234c39). Never merge or push to main without the owner's yes. Leave untracked `docs/lead-capture-go-live-guide.md` alone.
- Central lists own **only the accounts**. A page region keeps its own label, currency, class time and timezone. A page region whose key has no central country keeps its own `accountKeys`.
- Resolver rule: central list for the region key, **active accounts only**, in `sort` order; if that is empty (no row, all hidden, or the new tables do not exist yet), use the region's old `accountKeys` filtered to active accounts. A hidden account is never shown. The code must work before the migration is pasted (Postgres error code `42P01` on the new tables = "no central list").
- Accounts are never deleted: hide = `payment_accounts.active = false`.
- Account `key` rule (existing, migration 0069): `^[a-z0-9_]{2,40}$`; `kind` in `bank`, `wallet`, `paypal`. Region key rule: `^[A-Z]{2,6}$` (matches PK, UAE, KSA, PH, IN, INTL).
- One sale = the lead row or individual row (`row_type in ('individual','lead')`), `is_test = false`. Member rows are never counted. Revenue = `amount_received` if set, else `expected_amount`, for Paid sales, grouped per `currency` (never converted).
- Agents see counts only (views, registrations, paid), never revenue. Views = distinct `session_id` with a `view` event carrying that agent's id for that page.
- Leaderboard window: registrations by `created_at`; paid and revenue by the earliest `landing_status_events.at` where `to_status = 'paid'` for that registration; a sale not currently `paid` is not counted as paid. Windows: 7 days, 30 days, all time (default all time).
- "My links" lists main pages with `landing_pages.status = 'published'` only (not drafts, closed, or country variants), for `sales_agent` role only. The agent's code comes from the existing `getOrCreateAgentLink(agentId)` called on the server; link shape `/e/<slug>?ref=<code>` on `NEXT_PUBLIC_APP_URL` (default `https://pharmacozyme.com`).
- Migrations are files; the owner pastes the SQL (Supabase MCP is read-only). Next number is `0081`. Never regenerate `database.types.ts`; hand-add the new tables.
- RLS enabled with no policies on both new tables (service role only, same as `landing_email_log` / `landing_meta_events`). Admin-only writes via `requireAdmin()`.
- Mocked DB tests hid real bugs twice: check every column, `onConflict` target and status value against `supabase/migrations`.
- `npm run` is broken: `node node_modules/typescript/bin/tsc --noEmit` (baseline 0; ignore `.next/types`), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Never add `eslint-disable @typescript-eslint` comments. No `next build` while dev runs. Known failing tests not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening.test.ts` (currently failing before this plan; do not make it worse), `tests/gas-apply-registration-status.test.ts`, `tests/landing-event-sheet.test.ts` (two), `tests/participant-campaign-page-ui.test.tsx`.
- Do not invent UI: screens (Tasks 6 and 7) are built only from the owner's Stitch screens. Admin and agent copy in plain, non-technical words.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits only, never amend.

## Review Focus

1. A page region with no central country, or a central country with every account hidden: the pay step still shows the region's old active accounts and never a hidden one.
2. The migration not yet applied (`42P01`): public config, register and emails still work from the old `accountKeys`.
3. Register route accepts a `paymentMethod` that is in the **resolved** list and rejects one that is hidden or from another country.
4. A group lead and its members, a Paid then Pending then Paid sale, and a sale paid before the window: leaderboard counts each sale once, by the rules above.
5. An agent opening "My links" with no code yet gets one; another agent's numbers never appear in their data call.
6. Two currencies for one agent: revenue shown per currency, no mixed total.

---

## File Structure

- `supabase/migrations/0081_payment_countries.sql` (create): tables, seed.
- `src/lib/data/landing-payment-countries.ts` (create): list countries with accounts, resolver, country writes.
- `src/lib/data/landing-payment-accounts.ts` (modify): account create, update, hide.
- `src/lib/validations/landing-payment.ts` (create): zod schemas for the admin routes.
- `src/lib/data/landing-agent-stats.ts` (create): link stats per agent and leaderboard.
- `src/app/api/landing/[slug]/config/route.ts`, `src/app/api/landing/[slug]/register/route.ts`, `src/lib/landing/registration/status-email.ts` (modify): use the resolver.
- `src/lib/landing/registration/config.ts`, `src/components/admin/landing/registration/RegistrationSetup.tsx`, `src/components/admin/landing/variants/AddCountryDialog.tsx`, `src/app/dashboard/admin/landing-pages/[id]/page.tsx` (modify): drop the per-page account picker and the "choose at least one account" rule.
- `src/app/api/admin/payment-accounts/**`, `src/app/api/admin/payment-countries/**` (create): admin routes.
- `src/app/dashboard/admin/payment-accounts/page.tsx` + `src/components/admin/payments/*` (create): admin screen.
- `src/app/dashboard/sales/my-links/page.tsx` + component (create); `src/app/dashboard/admin/agent-leaderboard/page.tsx` + component (create); `src/components/dashboard/nav.ts` (modify).
- `docs/superpowers/stitch-prompts-payment-accounts-my-links.md` (create).

---

### Task 1: Stitch prompts for the three screens (owner gate for Tasks 6 and 7)

**Files:** Create `docs/superpowers/stitch-prompts-payment-accounts-my-links.md`. Style guide: `docs/superpowers/stitch-prompts-landing-page-builder.md`. Stitch project `11811490301995978699` is the design source; use the existing admin/sales look (same sidebar, headings, cards, tables). Also search the Stitch project for any existing screen to reuse before writing a prompt (none found for these topics on 2026-10-22).

**Interfaces:** Produces the screen list the owner generates in Stitch. Tasks 6 and 7 consume the resulting screens.

- [ ] **Step 1: Write three prompts**, each with desktop and mobile notes and plain copy: (a) Admin "Payment accounts": country headings (Pakistan, UAE, Saudi Arabia, Philippines, India, International), each with its ordered account cards (name, type chip, detail rows, hidden toggle, move up/down, Edit), an "Add account" and "Add country" action, an edit dialog, and an empty-country warning "No accounts yet: pages use their own list"; (b) Sales "My links": a card or row per published page with the full link, Copy button, and three counts (Views, Registered, Paid), plus an empty state; (c) Admin "Agent leaderboard": time filter (7 days, 30 days, All time), table with agent, registrations, paid, and revenue per currency, plus an empty state.
- [ ] **Step 2: Commit** `docs: Stitch prompts for payment accounts, My links and the leaderboard`. The controller then asks the owner to generate the screens and gives them the file. Tasks 6 and 7 do not start until the owner confirms the screens exist.

---

### Task 2: Tables, seed and the resolver

**Files:**
- Create: `supabase/migrations/0081_payment_countries.sql`, `src/lib/data/landing-payment-countries.ts`
- Modify: `src/lib/supabase/database.types.ts` (hand-add both tables)
- Test: `tests/landing-payment-countries.test.ts`

**Interfaces:**
- Produces:
  - `type PaymentCountry = { regionKey: string; name: string; sort: number; active: boolean; accounts: { key: string; label: string; kind: PaymentAccountKind; active: boolean; sort: number }[] }`
  - `listPaymentCountries(): Promise<PaymentCountry[]>` (all countries ordered by `sort`, each with ALL its accounts including hidden, ordered by link `sort`)
  - `centralAccountKeys(regionKeys: string[]): Promise<Record<string, string[]>>` (region key to ordered ACTIVE account keys; a region with none, or a missing table, is absent from the result)
  - `resolveRegionAccountKeys(regions: { key: string; accountKeys: string[] }[]): Promise<Record<string, string[]>>` (region key to final ordered keys per the Resolver rule; old keys are filtered to active accounts)

- [ ] **Step 1: Migration.** `payment_countries(region_key text primary key check (region_key ~ '^[A-Z]{2,6}$'), name text not null check (char_length(name) between 1 and 80), sort integer not null default 0, active boolean not null default true, created_at, updated_at)` and `payment_country_accounts(region_key text not null references payment_countries(region_key) on update cascade on delete cascade, account_key text not null references payment_accounts(key) on update cascade on delete cascade, sort integer not null default 0, primary key (region_key, account_key))`. RLS enabled, no policies. Seed with `on conflict do nothing`: PK Pakistan (faysal 10, easypaisa 20), UAE United Arab Emirates (mashreq), KSA Saudi Arabia (anb), PH Philippines (pnb_ph 10, gcash 20), IN India (pnb_in), INTL International (paypal). Builder confirms each region's account order against `src/lib/landing/templates-data/*.ts` and the legacy accounts' own `sort`, and notes any difference. Safe to run twice.
- [ ] **Step 2: Failing tests** with the mocked admin client used in `tests/landing-jobs.test.ts`: `centralAccountKeys` returns only active accounts in sort order and omits an all-hidden country; error code `42P01` returns `{}` instead of throwing; any other error throws; `resolveRegionAccountKeys` prefers the central list, falls back to the region's `accountKeys` filtered to active accounts, and a region with neither returns `[]`.
- [ ] **Step 3: Run** `node node_modules/vitest/vitest.mjs run tests/landing-payment-countries.test.ts` and see it fail.
- [ ] **Step 4: Implement** the three functions (resolver reuses `listPaymentAccounts()` for the active filter). Hand-add the table types.
- [ ] **Step 5: Run the tests, tsc, eslint.** Commit `feat: central payment accounts per country and the resolver`.

---

### Task 3: Write functions and validation

**Files:**
- Modify: `src/lib/data/landing-payment-accounts.ts`, `src/lib/data/landing-payment-countries.ts`
- Create: `src/lib/validations/landing-payment.ts`
- Test: `tests/landing-payment-admin-data.test.ts`

**Interfaces:**
- Produces (all throw on database error; return a result union on a rule failure):
  - `createPaymentAccount(input: { label: string; kind: PaymentAccountKind; rows: {label: string; value: string}[]; displayText: string }): Promise<{ ok: true; key: string } | { ok: false; reason: "invalid" }>` (key generated from the label: lower-case, `_` separators, unique by suffixing `_2`, `_3`)
  - `updatePaymentAccount(key: string, patch: { label?: string; kind?: PaymentAccountKind; rows?: ...; displayText?: string; active?: boolean }): Promise<{ ok: boolean }>`
  - `createPaymentCountry(input: { regionKey: string; name: string }): Promise<{ ok: true } | { ok: false; reason: "invalid" | "exists" }>`
  - `updatePaymentCountry(regionKey: string, patch: { name?: string; active?: boolean }): Promise<{ ok: boolean }>`
  - `setCountryAccounts(regionKey: string, accountKeys: string[]): Promise<{ ok: boolean }>` (replaces the list: order = array order, `sort` = index*10; keys must exist in `payment_accounts`; an account may appear under several countries; the whole replace is one transaction, so builder uses an RPC or delete-then-insert guarded so a failure never leaves the country empty)
  - zod schemas `accountCreateSchema`, `accountPatchSchema`, `countryCreateSchema`, `countryPatchSchema`, `countryAccountsSchema` (rows max 8 pairs, label max 80, value max 200, at most 12 accounts per country, no duplicate keys).

- [ ] **Step 1: Failing tests** (mock admin client): key generation and de-duplication (`Faysal Bank` -> `faysal_bank`, existing -> `faysal_bank_2`); hide sets `active=false` and never deletes; `createPaymentCountry` rejects a bad key (`pk`, `TOOLONG1`) and a duplicate (`23505` -> `exists`); `setCountryAccounts` writes `sort` 0, 10, 20 in array order and rejects an unknown account key; schemas reject duplicate keys and 13 accounts.
- [ ] **Step 2: Run, see fail. Step 3: Implement. Step 4: Run tests, tsc, eslint.**
- [ ] **Step 5: Commit** `feat: add, edit and hide payment accounts and countries`.

---

### Task 4: Pages follow the central list

**Files:**
- Modify: `src/app/api/landing/[slug]/config/route.ts`, `src/app/api/landing/[slug]/register/route.ts`, `src/lib/landing/registration/status-email.ts`, `src/lib/landing/registration/public-config.ts` (only if the resolved keys must be carried), `src/lib/landing/registration/config.ts` (drop the "Choose at least one payment account" rule at line ~293; keep the reserved-key and key-shape checks on legacy keys), `src/components/admin/landing/registration/RegistrationSetup.tsx` (remove the per-region account checklist; leave one read-only line per region: "Payment accounts for <country> are managed on the Payment accounts screen"), `src/components/admin/landing/variants/AddCountryDialog.tsx` (stop requiring accounts; save `accountKeys: []`; after saving, show "Add this country's accounts on the Payment accounts screen" when it has no central list), `src/app/dashboard/admin/landing-pages/[id]/page.tsx` (stop passing the accounts list if no longer used).
- Test: extend `tests/landing-registration-*.test.ts*` files that cover these routes and the config rule (Grep `accountKeys` and `Choose at least one payment account` in `tests/`); create `tests/landing-resolved-accounts.test.ts` if no fitting file exists.

**Interfaces:** Consumes `resolveRegionAccountKeys` from Task 2.

Behaviour: the config route builds the response config with each region's `accountKeys` replaced by the resolved keys and loads those accounts (`listPaymentAccounts(allResolvedKeys)`), so `RegistrationFlow.tsx` needs no change. The register route checks `payload.paymentMethod` against the resolved keys of the chosen region. `emailContext` lists accounts for the resolved keys of the lead's region.

- [ ] **Step 1: Failing tests** covering Review Focus 1 to 3: the config route returns the central accounts for PK and never a hidden one; with the central table missing (`42P01`) it returns the page's own active accounts; the register route accepts a paymentMethod from the resolved list and rejects a hidden account and one from another region (400, field `paymentMethod`); the status email lists the central accounts; publishing a config whose region has `accountKeys: []` no longer fails validation.
- [ ] **Step 2: Run, see fail. Step 3: Implement. Step 4: Run these tests plus `tests/landing-registration-client.test.tsx`, `tests/landing-promo-admin.test.tsx` and anything else importing the touched files; tsc; eslint.**
- [ ] **Step 5: Commit** `feat: landing pages follow the central payment accounts`.

---

### Task 5: Agent numbers

**Files:**
- Create: `src/lib/data/landing-agent-stats.ts`
- Test: `tests/landing-agent-stats.test.ts`

**Interfaces:**
- Produces:
  - `type LinkStat = { pageId: string; views: number; registered: number; paid: number }`
  - `getAgentLinkStats(agentId: string): Promise<LinkStat[]>` (one entry per page the agent has any data for; the page filter is applied by the caller)
  - `type LeaderRow = { agentId: string; name: string; registered: number; paid: number; revenue: { currency: string; amount: number }[] }`
  - `getLeaderboard(range: "7d" | "30d" | "all", now?: Date): Promise<LeaderRow[]>` (every sales agent, including those with zeros, sorted by paid then registered, both descending)
  - `listPublishedLinkPages(): Promise<{ id: string; slug: string; title: string }[]>` (main pages, `status = 'published'`)

- [ ] **Step 1: Failing tests** with fixtures for Review Focus 4 to 6: members never counted; a sale paid, set Pending, then Paid again is dated by its first Paid; a sale currently Pending is not paid; two currencies give two revenue entries, no total; revenue uses `amount_received` else `expected_amount`; views count distinct `session_id` of `view` events for that agent; test rows excluded; `7d` excludes a registration made 8 days ago and a Paid first made 8 days ago; an agent with no data appears with zeros in the leaderboard; `getAgentLinkStats(a)` never returns data from agent `b`.
- [ ] **Step 2: Run, see fail. Step 3: Implement.** Builder chooses SQL (an RPC in the same `0081` migration file or a new `0082`) or JS aggregation; if an RPC is added it is `security definer`, granted to `service_role` only. Check columns against `0069` (`landing_funnel_events.agent_id`, `landing_registrations.agent_id`, `landing_status_events.at`).
- [ ] **Step 4: Run tests, tsc, eslint. Step 5: Commit** `feat: per-agent link numbers and the leaderboard`.

---

### Task 6: Admin "Payment accounts" screen (needs the Stitch screen)

**Files:**
- Create: `src/app/api/admin/payment-accounts/route.ts` (POST create), `src/app/api/admin/payment-accounts/[key]/route.ts` (PATCH), `src/app/api/admin/payment-countries/route.ts` (POST create), `src/app/api/admin/payment-countries/[regionKey]/route.ts` (PATCH name/active), `src/app/api/admin/payment-countries/[regionKey]/accounts/route.ts` (PUT list), `src/app/dashboard/admin/payment-accounts/page.tsx` (+ `loading.tsx`), components under `src/components/admin/payments/`.
- Modify: `src/components/dashboard/nav.ts` (admin item "Payment Accounts", same role list and style as "Promo Codes"), `tests/landing-route-hardening.test.ts` (register each new route and page so a refused gate leaves them untouched, following the existing pattern there).
- Test: `tests/payment-accounts-routes.test.ts`, `tests/payment-accounts-screen.test.tsx`.

**Interfaces:** Consumes Tasks 2 and 3. All routes: `requireAdmin()` first, zod parse, 400 with `firstIssue` shape (see `landing-agent-links/route.ts`), 404/409 for missing or duplicate, 500 with a plain message.

- [ ] **Step 1: Read the owner's Stitch screen** for this page (the controller supplies its id) and build to it: country headings, ordered account cards, hide toggle, move up/down, edit dialog, add account, add country, empty-country note. Reuse components in `src/components/ui` and existing admin table/dialog patterns.
- [ ] **Step 2: Failing tests:** each route returns 401/403 shape when the gate refuses and does not call the data function; valid calls call the right data function with parsed input; the screen renders countries with accounts in order, a hidden account marked as hidden, and the empty-country note; saving calls the matching route.
- [ ] **Step 3: Run, see fail. Step 4: Implement.** After each save the screen refreshes its data (`router.refresh()` like the registrations pages). A hidden account still appears in the admin list so it can be shown again.
- [ ] **Step 5: Run tests, tsc, eslint on touched files. Commit** `feat: admin Payment accounts screen by country`.

---

### Task 7: Sales "My links" and admin leaderboard (needs the Stitch screens)

**Files:**
- Create: `src/app/dashboard/sales/my-links/page.tsx` (+ `loading.tsx`), `src/components/sales/MyLinks.tsx`, `src/app/dashboard/admin/agent-leaderboard/page.tsx` (+ `loading.tsx`), `src/components/admin/landing/AgentLeaderboard.tsx`
- Modify: `src/components/dashboard/nav.ts` (sales item "My Links" for `sales_agent`; admin item "Agent Leaderboard"), `tests/landing-route-hardening.test.ts` if it lists admin pages.
- Test: `tests/sales-my-links.test.tsx`, `tests/agent-leaderboard.test.tsx`

**Interfaces:** Consumes Task 5, `getOrCreateAgentLink` (`landing-agent-links.ts`), `requireSalesAgentPage` (`src/lib/auth/require-sales.ts`), `requireAdminPage`. The leaderboard reads `?range=7d|30d|all` from the URL (default `all`); anything else is `all`.

- [ ] **Step 1: Read the owner's Stitch screens** for these two pages and build to them. My links: the page calls `getOrCreateAgentLink(user.id)` and `listPublishedLinkPages()`, joins `getAgentLinkStats(user.id)`, and renders a row per published page with the full link (`<NEXT_PUBLIC_APP_URL or https://pharmacozyme.com>/e/<slug>?ref=<code>`), a Copy button that falls back gracefully when the clipboard is blocked, and Views, Registered, Paid. No revenue anywhere on this page. Leaderboard: range filter, table, revenue per currency, empty state.
- [ ] **Step 2: Failing tests:** the My links page for an agent shows only their own numbers and never a revenue figure; an unpublished page is not listed; an agent with no code gets one; the Copy button copies the exact link; the leaderboard renders one revenue line per currency and treats a bad `range` as `all`; a non-admin cannot reach the leaderboard (gate test as in the existing pages).
- [ ] **Step 3: Run, see fail. Step 4: Implement. Step 5: Run tests, tsc, eslint; run the full vitest once in the background (about 3 minutes) and report any new failure beyond the known list.**
- [ ] **Step 6: Commit** `feat: sales My links and the admin agent leaderboard`.

---

## Rollout (owner steps after merge review)

1. Owner pastes `0081_payment_countries.sql` (and `0082` if Task 5 added one) into the Supabase SQL editor before the code goes live; the code also works without it (falls back to each page's own list).
2. Open Admin, Payment Accounts: check each country shows the right accounts in the right order; try hiding then showing an account on a test page's pay step.
3. Open a sales agent account (the owner's own test agent): My Links shows published pages and a working link.
4. Never test on a real student's registration.

## Self-review

- Spec goals 1 to 4: Tasks 2, 3, 6 (accounts and countries screen), 4 (pages follow), 5 and 7 (My links, leaderboard).
- Spec "my calls": fallback rule (Tasks 2 and 4), first-Paid date, one-sale unit, views by session, revenue per currency, agents counts only (Task 5 constraints and Task 7 tests), Stitch gate (Task 1).
- Anti-goals: hidden account never shown (Task 2 resolver and Task 4 tests); another agent's data (Task 5 test); empty list never breaks a page (Task 4 fallback test).
- Types: `PaymentCountry`, `centralAccountKeys`, `resolveRegionAccountKeys`, `createPaymentAccount`, `updatePaymentAccount`, `createPaymentCountry`, `updatePaymentCountry`, `setCountryAccounts`, `LinkStat`, `getAgentLinkStats`, `LeaderRow`, `getLeaderboard`, `listPublishedLinkPages` are named identically in every task.
- Left to the builder: table naming details inside the migration, whether the leaderboard queries are an RPC or JS, screen layout from the Stitch screens.
