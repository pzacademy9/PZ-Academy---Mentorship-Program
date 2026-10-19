# Landing pricing cards: real prices from the registration setup, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pricing card can be linked to something people can buy and then shows its real price for the visitor's country (Early Bird, recorded, group discount included), and the importer and AI prompts use the link instead of typed prices.

**Architecture:** One pure module computes what a card shows by calling the existing `computeQuote` / `isEarlyBird` / `formatMoney`, so a card can never disagree with the form. `PricingCards` stays a plain server component unless a card is linked; linked cards render through one small client island that holds the country switcher and decides Early Bird from the browser clock. The link is a new item field kind on the pricing card; no migration (content is one jsonb document).

**Tech Stack:** Next.js 14 App Router, React server and client components, vitest (jsdom for `.tsx`), existing landing editor and importer.

**Spec:** `docs/superpowers/specs/2026-10-18-landing-price-cards-design.md` (including "designer's calls" 1-12). Branch `landing-price-cards` (from `origin/main`).

## Global Constraints

- `npm run` is broken. Type check: `node node_modules/typescript/bin/tsc --noEmit` (baseline 0, ignore `.next/types` noise). Tests: `node node_modules/vitest/vitest.mjs run tests/<file>`. Known failing: `tests/pz-tokens.test.ts`.
- Never regenerate `src/lib/supabase/database.types.ts`. No migration is needed.
- Never run `next build` while a dev server runs (Task 5 stops the dev server first).
- No second copy of the price maths: cards call `computeQuote`, `isEarlyBird`, `availableOptions` from `src/lib/landing/registration/pricing.ts` and `formatMoney` from `format.ts`.
- Cards without a link behave exactly as today (typed price, same markup).
- Visible words: "price", "country", "group discount", "Early Bird", "Linked to", "Automatic". Never "variant", "override", "resolve", "schema", "YAML", "key".
- Link values: `""` (unlinked), an option key from "What people can buy", `"all:modules"`, `"group:discount"`. The two extras contain a colon so they can never equal an option key (`ITEM_KEY_RE` is `^[a-z0-9_]{1,32}$`).
- Public pages stay static and cacheable; `node scripts/check-landing-bundle.mjs` must still pass (the modal-only strings must stay out of the page bundle).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits only, never amend. Do not touch untracked `docs/lead-capture-go-live-guide.md`.

## Review Focus

- A card's amount always equals what the form would charge (`computeQuote` total/perPerson) for the same country, mode and time: pinned in Task 1 by comparing against `computeQuote` directly.
- After the Early Bird cut-off the card shows only the regular price and no "ends" text, even if the page was built before the cut-off: Task 1 (time passed in) and Task 3 (client clock switch).
- A country link shows only its own country and currency and no switcher; a module link hides cards linked to items it does not offer: Task 3.
- Registration off: a linked card falls back to its typed price, else is hidden, and readiness warns: Tasks 2 and 3.
- Option keys that look like object members (`constructor`, `__proto__`) or a link to a deleted option never crash and simply hide the card: Task 1.

---

## File Structure

- Create `src/lib/landing/registration/card-price.ts`: link constants, `priceLinkChoices`, `cardPrice` (pure).
- Modify `src/lib/landing/sections.ts`: field kind `"priceLink"` and the `option` item field on pricing cards.
- Modify `src/components/admin/landing/FieldInput.tsx` (+ `SectionForm.tsx`, `LandingEditor.tsx` to pass the registration): the "Linked to" select and the automatic-price note.
- Modify `src/lib/landing/content.ts`: readiness warnings for linked cards.
- Modify `src/components/landing/sections/types.ts`, `src/components/landing/LandingRenderer.tsx`: pass `registration` to sections.
- Modify `src/components/landing/sections/PricingCards.tsx`; create `src/components/landing/sections/PricingCardsLive.tsx` (client island).
- Modify `src/lib/landing/import/build-content.ts`, `src/lib/landing/import/prompts.ts` and import fixtures/tests.

---

### Task 1: Pure card price calculation

**Files:**
- Create: `src/lib/landing/registration/card-price.ts`
- Test: `tests/landing-card-price.test.ts`

**Interfaces:**
- Produces:
  - `export const LINK_ALL_MODULES = "all:modules"; export const LINK_GROUP = "group:discount";`
  - `export function priceLinkChoices(config: RegistrationConfig): { value: string; label: string }[]`: one entry per option (`value` = option key, `label` = option label or key), then `all:modules` ("All single modules", only when at least one module option exists), then `group:discount` ("Group discount", only when `config.tiers.length > 0`).
  - `export type CardPrice = { kind: "price"; current: string; strike: string | null; earlyEnds: string | null; recorded: string | null; suffix: "per module" | "from" | null; groupLines: string[] } | { kind: "group"; lines: string[] }`
  - `export function cardPrice(config: RegistrationConfig, link: string, regionKey: string, now: Date): CardPrice | null`

- [ ] **Step 1: Write failing tests** in `tests/landing-card-price.test.ts` using a config like the Diabetes page (regions PK/UAE, options `full` bundle + `m1`..`m4` modules, tier `g3` min 3 max 50 20% off, prices as in the spec's example: full PK 4000 early 3200, UAE 180 early 150; each module PK 1200 / UAE 50, `earlyBirdEndsAt: "2026-09-24T23:59:00+05:00"`, `modes: ["live","recorded"]`, `recordedPercentOfRegular: 85`). Assertions: (a) `cardPrice(cfg,"full","PK", before)` gives `current "PKR 3,200"`, `strike "PKR 4,000"`, `earlyEnds "24 September 2026"`, `recorded "PKR 3,400"`, and `current` equals `formatMoney(computeQuote({...,optionKeys:["full"],mode:"live",tierKey:"individual",groupSize:1,now}).perPerson,"PKR")`; (b) same call with `now` after the cut-off gives `current "PKR 4,000"`, `strike null`, `earlyEnds null`; (c) `groupLines` for `full` is `["Group of 3 or more: 20% off · PKR 2,560 each"]` before the cut-off (matches `computeQuote` tierKey `g3`, groupSize 3) and the regular `PKR 3,200 each` after; (d) `"all:modules"` for PK gives `current "PKR 1,200"`, `suffix "per module"`, and with one module priced differently gives `suffix "from"` and the lowest price; (e) `"group:discount"` returns `{kind:"group", lines:[...]}` using the bundle (`moduleMix.bundleOptionKey`, else the first bundle priced in that country) and, when no such price exists, lines without the per-person amount; (f) a link to a missing option, `"constructor"`, `"__proto__"`, a country with no price for it, or a config with no regions returns `null`; (g) a free option (`free: true`, amount 0) gives `current "Free"`; (h) `modes: ["recorded"]` only: `current` is the recorded price and `recorded` is `null`; (i) `priceLinkChoices` lists options in order, then the two extras only when they apply.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-card-price.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `card-price.ts` per the signatures. Use `computeQuote` with `mode` = `"live"` when the config offers live else `"recorded"`; Early Bird `strike`/`earlyEnds` only when that quote has `earlyBirdApplied`; `earlyEnds` is the date part of `earlyBirdEndsAt` written as "24 September 2026" (month names from a local array, no `Date` timezone conversion); `recorded` line from a recorded-mode quote when both modes are offered; group lines for every tier at `minSize` (tier key = `tierKey`), Live, individual unaffected; a failed quote drops the amount from that line only. File must stay pure (no `server-only`, no React) because the page bundle imports it.
- [ ] **Step 4: Run** the test and tsc. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(landing-cards): card price calculation`.

---

### Task 2: The "Linked to" field, editor control and readiness warnings

**Files:**
- Modify: `src/lib/landing/sections.ts` (FieldKind adds `"priceLink"`; pricing_cards item list gets `{ key: "option", label: "Linked to", kind: "priceLink" }` after `name`; `price` stays but is no longer `required` when linked)
- Modify: `src/components/admin/landing/FieldInput.tsx`, `SectionForm.tsx`, `LandingEditor.tsx` (pass `content.registration` down as a new optional prop `registration?: RegistrationConfig`)
- Modify: `src/lib/landing/content.ts` (readiness)
- Test: `tests/landing-price-cards-editor.test.tsx`, extend `tests/landing-content.test.ts`

**Interfaces:**
- Consumes: `priceLinkChoices`, `cardPrice`, `LINK_*` from Task 1.
- Produces: item data key `option` (string) on pricing card items; `FieldDef.kind === "priceLink"`.

- [ ] **Step 1: Write failing tests.** Editor: a pricing card row renders a "Linked to" select whose options are "Not linked (type a price)" followed by `priceLinkChoices`; choosing one calls `onChange` with the value; when linked, the typed "Price" box is replaced by the read-only text "Automatic, from Prices by country" plus a preview such as "Today for Pakistan: PKR 3,200"; unlinked rows look and behave as before. Readiness (in `landing-content.test.ts`): (a) registration off + linked card with no typed price gives the problem "The card \"Complete Course\" has no price to show. Switch the registration form on or type a price." with that section's `sectionId`; (b) registration on + a card linked to a deleted option gives "The card \"X\" is linked to something that no longer exists."; (c) registration on + linked card whose item has no price in a country gives "Module 2 has no price for Philippines." (use region label); (d) a fully priced linked card and any unlinked card give no problem.
- [ ] **Step 2: Run both files.** Expected: FAIL.
- [ ] **Step 3: Implement** the field kind (normalization must keep `option` through `normalizeContent`), the select in `FieldInput` (new `registration` prop threaded from `LandingEditor` through `SectionForm`), and `priceCardProblems(c, problems)` in `content.ts` called from `computeReadiness`. In the editor the default-country preview comes from `cardPrice(registration, link, registration.defaultRegionKey || first region, new Date())`.
- [ ] **Step 4: Run** both files, `tests/landing-admin-ui.test.tsx`, `tests/landing-hero-editor.test.tsx`, `tests/landing-final-fixes.test.tsx`, and tsc. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(landing-cards): Linked to field, editor preview and readiness`.

---

### Task 3: Render linked cards, country switcher and Early Bird switch

**Files:**
- Modify: `src/components/landing/sections/types.ts` (`SectionProps` gains `registration?: RegistrationConfig`), `src/components/landing/LandingRenderer.tsx` (pass `c.registration` and a build-time `nowIso` to every section)
- Modify: `src/components/landing/sections/PricingCards.tsx`
- Create: `src/components/landing/sections/PricingCardsLive.tsx` (`"use client"`)
- Test: `tests/landing-price-cards-render.test.tsx`

**Interfaces:**
- Consumes: `cardPrice`, `CardPrice` (Task 1); `option` item key (Task 2); `pickRegion` is NOT used (the page default region decides the first paint).
- Produces: `PricingCardsLive({ cards, registration, nowIso, register })` where `cards` are the card items already read by `PricingCards` (`name, price, oldPrice, badge, features, option`).

- [ ] **Step 1: Write failing tests.** (a) A page with no linked card renders exactly today's markup (snapshot-free: same text, no "Prices for" switcher, no client island marker). (b) A linked card on a main page with 2 regions renders the default country's price, a `Prices for:` select listing both countries, and changing it re-prices every linked card to the other currency without a network call. (c) A country link (registration narrowed to one region) shows that currency and no switcher. (d) A module link (registration narrowed to one module option) hides a card linked to `full`, shows the "All single modules" card with that module's price. (e) With `nowIso` before the cut-off the card shows `PKR 3,200`, the struck `PKR 4,000` and "Early Bird ends 24 September 2026"; mounting with the system clock after the cut-off (fake timers) switches it to `PKR 4,000` with no strike or "ends" text. (f) The group card lists "Group of 3 or more: 20% off · PKR 2,560 each". (g) `registration.enabled === false`: a linked card with a typed price shows the typed price, without one it is hidden; when every card is hidden the whole section renders `null`. (h) A "Recorded: PKR 3,400" line appears only when both modes are offered.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** `PricingCards` stays a server component: it reads items, and when none has a non-empty `option` it renders today's markup unchanged. Otherwise it renders `PricingCardsLive`, passing only the data the island needs (items, `registration` regions/options/prices/tiers/moduleMix/modes/recordedPercentOfRegular/earlyBirdEndsAt/defaultRegionKey, `nowIso`). The island keeps `region` state (initial = `defaultRegionKey` if it is one of the regions, else the first), `now` state (initial `new Date(nowIso)`, set to `new Date()` in a mount effect so Early Bird ends on time without a rebuild), shows the `Prices for:` select only when more than one region and at least one linked card, and for each card uses `cardPrice` (card hidden when `null`, falling back to the typed price when registration is off). Reuse the existing card markup classes from today's `PricingCards`; the group card renders its lines as a list.
- [ ] **Step 4: Run** the new test, `tests/landing-public-polish.test.tsx`, all `tests/landing-*` and tsc. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(landing-cards): linked price cards with country switcher`.

---

### Task 4: Importer and master prompts

**Files:**
- Modify: `src/lib/landing/import/build-content.ts` (accept `option` on pricing items), `src/lib/landing/import/prompts.ts`
- Modify: any import fixture or test that asserts "See price for your country" (grep `tests/` and `tests/fixtures/landing-import/`)
- Test: `tests/landing-import-price-cards.test.ts`

**Interfaces:**
- Consumes: `LINK_ALL_MODULES`, `LINK_GROUP` (Task 1); the `option` item key (Task 2).
- Produces: imported cards carry `option` when valid.

- [ ] **Step 1: Write failing tests.** Import the owner's real shape (inline `.md`): cards `option: full`, `option: all:modules`, `option: group:discount` with no `price` lines, registration prices as in Task 1. Assert: the built cards have those `option` values; a card with `option: nope` imports unlinked and the result warns "The card \"X\" is linked to \"nope\", which is not one of the things people can buy, so it was left unlinked."; a card with both `option` and `price` keeps both; a card with no `option` and a `price` imports as today; the generated master prompt text no longer contains "See price for your country", lists the allowed link values (`full`-style option codes the file defines, `all:modules`, `group:discount`), tells the AI to add a group discount card when it defines group discounts, and still says one-country pages may type the amount.
- [ ] **Step 2: Run it** plus the existing import tests. Expected: new FAIL; update stale expectations in existing ones in Step 3.
- [ ] **Step 3: Implement.** Field line for kind `priceLink` in `prompts.ts` (`option: optional, an option code, all:modules or group:discount`); rewrite the pricing_cards example block (lines near 205-213) and the rule near line 382 to use `option:`; validate the value in `build-content.ts` against `content.registration.options` keys and the two extras (needs registration built first); drop the "needs review" flag for a linked card's `price` only when the price is empty. Keep the format version `pz-landing/1` unchanged (the key is optional, old files stay valid).
- [ ] **Step 4: Run** all `tests/landing-import*` and `tests/landing-make-with-ai*`, then tsc. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(landing-cards): importer and prompts link cards`.

---

### Task 5: Build, bundle check and browser check (controller with a verifier subagent)

**Files:** none (notes go in the gitignored ledger `.superpowers/sdd/2026-10-18-landing-price-cards/progress.md`).

- [ ] **Step 1:** With no dev server running, `node node_modules/next/dist/bin/next build`, then `node scripts/check-landing-bundle.mjs`. Expected: PASS (if it fails because the island pulls modal-only strings or grows past the budget, rule per spec call 10: use the server-render-all-countries-with-toggle fallback, do not raise the budget).
- [ ] **Step 2:** Start the dev server (`node node_modules/next/dist/bin/next dev -p 3945`). On a throwaway draft page (never the live Diabetes page), import the owner's `diabetes-management-and-pharmacotherapy.md` edited to use `option:` cards; check at 1280 and 390 wide: the main page shows Pakistan prices with a working "Prices for" switch; the UAE link shows AED and no switch; a module link hides the complete-course card; Early Bird strike-through shows before and not after (temporarily set the Early Bird date in the past in the throwaway page); the group card shows "PKR 2,560 each"; the Register button still opens the form.
- [ ] **Step 3:** Delete the throwaway page, stop the dev server, update memory.
