# Promo code engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer typing `OWNERCODE-NN%` gets NN% off (capped by an admin ceiling), a plain owner code gives its owner's plain discount, the sale is credited to the owner, and link-preview bots stop counting as views.

**Architecture:** Owner codes are ordinary rows in `landing_promo_codes` flagged `is_owner_code`. A pure module parses the `-NN%` suffix and builds an "effective" `PromoCode` that the unchanged `applyPromo` evaluates. The data layer does exact-match first, suffix second. One global ceiling lives in a one-row settings table.

**Tech Stack:** Next.js 14 route handlers, Supabase (SQL file pasted by owner), zod, vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-promo-code-engine-design.md`

## Global Constraints

- Plain code with no percent = 10% by default (`plain_percent` default 10); admin may set a person's to 0.
- Global ceiling default 30 (percent). Per-code `max_percent` may only lower it. Lower of the two wins.
- Over ceiling is refused with the message "The maximum discount is NN%." (never silently capped).
- Whole-number percents 1 to 100 in the suffix; `%` required; case-insensitive.
- Exact match is tried first so every existing code behaves as today. Stored codes keep `^[A-Z0-9_-]{2,40}$`; `%` is never stored in `code`.
- Colour tokens: backgrounds and borders use `pz-solid-*`; `pz-deep`, `pz-mid`, `pz-danger` for text only.
- Never regenerate `database.types.ts` (hand-add). No `eslint-disable` for `@typescript-eslint`. Repo files use CRLF: Read then Edit existing files; Write for new files.
- tsc must stay at 0 errors. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage by path. Do not push or merge.
- SQL is a new file `supabase/migrations/0106_promo_owner_codes.sql`; the owner pastes it. Safe to run twice.

## Review Focus

- Code typed with spaces or lowercase (`test-111 -10 %`): spaces stripped by the existing input normaliser; behaves like the clean form.
- `-0%`, `-101%`, `-10.5%`, `-10` (no percent sign): not treated as a suffix; falls through to "unknown code".
- A base owner code that is paused/expired/exhausted: the suffix form must fail the same way as the plain form.
- A normal (non-owner) promo with a suffix typed (`SUMMER-10%` where `SUMMER` is an ordinary code): must NOT work.
- An existing code that itself ends like a suffix (`PZ-MDC-20%` stored literally): exact match wins.
- Plain owner code with `plain_percent = 0`: still credits the owner, gives no discount, no crash.
- Bot or missing browser name on a `view`: not stored; a real browser still stored.

---

### Task 1: SQL and the pure suffix module

**Files:**
- Create: `supabase/migrations/0106_promo_owner_codes.sql`
- Create: `src/lib/landing/registration/promo-suffix.ts`
- Modify: `src/lib/landing/registration/promo.ts` (add `isOwnerCode`, `plainPercent`, `maxPercent` to `PromoCode`; add `"over_max"` to `PromoFailureReason`; `promoMessage(reason, maxPercent?)`)
- Modify: `src/lib/supabase/database.types.ts` (hand-add the three columns on `landing_promo_codes` Row/Insert/Update and the new settings table; do not regenerate)
- Test: `tests/landing-promo-suffix.test.ts`

**Interfaces:**
- Produces:
  - SQL: `landing_promo_codes` gets `is_owner_code boolean not null default false`, `plain_percent numeric(5,2) not null default 10 check (plain_percent between 0 and 100)`, `max_percent numeric(5,2) check (max_percent is null or max_percent between 1 and 100)`, and a check that an owner code has an owner (`not is_owner_code or owner_agent_id is not null`). New table `landing_promo_settings (id boolean primary key default true check (id), max_percent numeric(5,2) not null default 30 check (max_percent between 1 and 100))` with one seeded row, RLS enabled, no policies (service role only).
  - `parsePromoSuffix(typed: string): { base: string; percent: number } | null`: input already uppercased/space-free; matches `^(.+)-(\d{1,3})%$`, percent 1 to 100, base must satisfy `^[A-Z0-9_-]{2,40}$`.
  - `effectiveOwnerPromo(p: { owner: PromoCode; typed: string; percent: number | null; globalMax: number }): { ok: true; promo: PromoCode } | { ok: false; reason: "over_max"; max: number }` where `percent === null` means plain (uses `owner.plainPercent`). The returned promo is a copy of `owner` with `type: "percent"`, `value: percent`, `maxDiscountPercent: 0`, `code: typed`, same `id`, `ownerAgentId`, `maxUses`, `usedCount`, `oneperEmail`, `startsAt`, `endsAt`, `active`, `pageIds`, `optionKeys`. Ceiling = `Math.min(globalMax, owner.maxPercent ?? globalMax)`; a requested percent above it fails; a plain percent is also held to it.

- [ ] **Step 1: Write failing tests** in `tests/landing-promo-suffix.test.ts`: `parsePromoSuffix("TEST-111-10%")` is `{base:"TEST-111",percent:10}`; `"TEST-111-20%"` gives 20; `"TEST-111-15%"` gives 15 and `"TEST-111-25%"` gives 25 (any whole number up to the ceiling must work, not only multiples of 10); `"TEST-111-0%"`, `"-101%"`, `"TEST-111-10.5%"`, `"TEST-111-10"`, `"A-10%"` (base too short) are `null`; `effectiveOwnerPromo` with percent 10 and globalMax 30 returns `ok` with `value 10` and `id` of the owner; percent 35 returns `{ok:false,reason:"over_max",max:30}`; owner `maxPercent 15` with percent 20 fails with max 15; percent `null` with `plainPercent 10` gives value 10; `plainPercent 0` gives value 0 and still `ok`; applying the result with `applyPromo` on a 1000 total gives discount 100 and total 900.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-promo-suffix.test.ts` and confirm FAIL (module missing).
- [ ] **Step 3: Implement** `promo-suffix.ts`, extend `promo.ts` (message: `The maximum discount is ${max}%.`), write the SQL file (idempotent: `add column if not exists`, `create table if not exists`, `insert ... on conflict do nothing`), and hand-add the types. Existing places that build a `PromoCode` literal (`mapRow` in `landing-promo-codes.ts`, test fixtures) must be updated for the new fields.
- [ ] **Step 4: Run** the new test file and `node node_modules/typescript/bin/tsc --noEmit`; expect PASS and 0 errors.
- [ ] **Step 5: Commit** `feat(promo): owner codes with percent suffix, pure rules and SQL`; stage the five paths by name.

### Task 2: Data layer and the two routes

**Files:**
- Modify: `src/lib/data/landing-promo-codes.ts` (COLUMNS, `mapRow`, `toRow` for the three new fields; new functions below)
- Modify: `src/app/api/landing/[slug]/quote/route.ts` and `src/app/api/landing/[slug]/register/route.ts` (use `resolvePromoCode` instead of `getPromoByCode`; show `over_max` message; credit rule below)
- Test: `tests/landing-promo-resolve.test.ts`; extend `tests/landing-registration-promo.test.ts` only if it asserts the old lookup

**Interfaces:**
- Consumes: Task 1 `parsePromoSuffix`, `effectiveOwnerPromo`, `promoMessage`.
- Produces:
  - `getPromoSettings(): Promise<{ maxPercent: number }>` reads the single settings row; falls back to 30 if the row is missing; throws on read error.
  - `resolvePromoCode(typed: string): Promise<{ promo: PromoCode | null; overMax: number | null }>`: normalise, exact `getPromoByCode`; if found and `isOwnerCode`, return the plain effective promo; if found and not owner, return it unchanged; if not found, `parsePromoSuffix`, look up base, only accept it when `isOwnerCode`, return the effective suffix promo. `overMax` is set (and `promo` null) when the ceiling blocks it. Never throws for "not found".
  - Register route credit rule: credit `promoCode.ownerAgentId` when the promo applied and (`discount > 0` or the code is an owner code), so a 0% plain owner code still credits.

- [ ] **Step 1: Write failing tests** (mock the Supabase admin client the way `tests/landing-admin-promo-routes.test.ts` does): exact non-owner code returns as-is; `SUMMER-10%` where `SUMMER` is a non-owner code returns `promo: null`; owner `TEST-111` plain returns value 10; `TEST-111-20%` returns value 20 and owner's `id`; `TEST-111-35%` returns `overMax: 30`; a stored literal code `PZ-MDC-20%`-style exact match wins over suffix reading; paused owner base with suffix returns the owner promo with `active:false` (so `applyPromo` reports "inactive").
- [ ] **Step 2: Run** the file; confirm FAIL.
- [ ] **Step 3: Implement** the functions and swap the two routes. In both routes an `overMax` result answers 422 `{ error: promoMessage("over_max", max), field: "promoCode" }` (quote route answers `promo: { ok: false, reason: "over_max", max }` in its existing shape).
- [ ] **Step 4: Run** the new test, `landing-registration-promo`, `landing-admin-promo-routes`, then tsc.
- [ ] **Step 5: Commit** `feat(promo): resolve owner codes and suffix percents at quote and register`.

### Task 3: Admin screen and API for owner codes and the ceiling

**Files:**
- Modify: `src/lib/validations/landing-promo.ts` (fields `isOwnerCode`, `plainPercent` 0 to 100, `maxPercent` 1 to 100 nullable; issue "An owner code needs an owner." when `isOwnerCode` and no `ownerAgentId`)
- Modify: `src/lib/landing/registration/promo-form.ts` (draft fields, `draftToInput` carries them; PromoDraft stays plain data)
- Modify: `src/components/admin/landing/promo/PromoCodesManager.tsx` (Read it first): an "Owner code" toggle that reveals owner (sales agent picker already used for agent links), "Discount when typed plain (%)" default 10, optional "This person's own maximum (%)"; and a small "Highest percent anyone may type" box bound to the global ceiling
- Create: `src/app/api/admin/landing-promo-settings/route.ts` (`GET` returns `{ maxPercent }`, `PATCH` body `{ maxPercent: number 1..100 }`, both `requireAdmin("landing_pages")`)
- Modify: `src/lib/data/landing-promo-codes.ts`: `setPromoSettings(maxPercent: number): Promise<void>`
- Test: extend `tests/landing-promo-form.test.ts`, `tests/landing-admin-promo-routes.test.ts`, `tests/landing-promo-admin.test.tsx`

**Interfaces:** Consumes Task 2 `getPromoSettings`; Produces the admin routes above.

- [ ] **Step 1: Write failing tests:** schema rejects `isOwnerCode:true` without owner; accepts plainPercent 0; rejects plainPercent 101 and maxPercent 0; settings route refuses non-admin (401/403 like the neighbours), rejects 0 and 101, saves 25; form draft round-trips the three fields; manager renders the owner fields only when the toggle is on and shows the ceiling box.
- [ ] **Step 2: Run** the three files; confirm FAIL.
- [ ] **Step 3: Implement** as listed; reuse existing field/label components in the manager and follow the colour rule.
- [ ] **Step 4: Run** the three files plus tsc plus `node node_modules/eslint/bin/eslint.js` on the touched paths; expect PASS and clean.
- [ ] **Step 5: Commit** `feat(promo): admin owner-code fields and global maximum`.

### Task 4: Stop bot visits counting as views

**Files:**
- Create: `src/lib/landing/bot-agent.ts`
- Modify: `src/app/api/landing/[slug]/event/route.ts`
- Test: `tests/landing-bot-agent.test.ts`; extend the existing event-route test if one exists (otherwise add `tests/landing-event-route-bots.test.ts`)

**Interfaces:** Produces `isBotUserAgent(ua: string | null | undefined): boolean`: true for null/empty, and for names containing (case-insensitive) bot, crawl, spider, preview, headless, lighthouse, facebookexternalhit, whatsapp, telegram, slack, discord, linkedin, twitterbot, curl, wget, python-requests, node-fetch; false for normal Chrome/Safari/Firefox strings.

- [ ] **Step 1: Write failing tests:** a normal Chrome Android string is false; `HeadlessChrome`, `WhatsApp/2.23`, `facebookexternalhit/1.1`, `Googlebot`, empty and null are true; the event route answers 204 without inserting for a bot name and inserts for a normal one.
- [ ] **Step 2: Run** and confirm FAIL.
- [ ] **Step 3: Implement** the function and, in the route, read `req.headers.get("user-agent")` and return 204 before `recordFunnelEvent` when it is a bot (the browser never sees a difference).
- [ ] **Step 4: Run** both tests and tsc.
- [ ] **Step 5: Commit** `fix(landing): do not count bot or preview visits as views`.

### Task 5: Whole-branch check

- [ ] Run tsc (0 errors), eslint on touched paths, and every new/changed test file alone; re-run any failing UI file alone before calling it a failure (known unrelated failures are listed in the owner's standing rules).
- [ ] Tell the owner the SQL file to paste (0106) and ask before any live test with a test agent code. Then one fresh opus review of the whole branch, one fix pass (failing test first), then ask whether to push.
