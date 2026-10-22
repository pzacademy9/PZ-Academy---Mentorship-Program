# Payment accounts by country, and agent My links: design

Date: 2026-10-22. Plan 6 of the landing registrations project (Part 6 of `2026-10-19-landing-registrations-phase3-design.md`). Written for the builder, after talking with the owner.

## Intent and why

The owner runs paid webinar and course registrations through landing pages. Students in each country pay into a fixed set of local accounts (for example Pakistan: Faysal Bank and EasyPaisa). Those accounts are currently typed into each landing page one by one. When a bank number changes, every page has to be edited, and there is no admin screen to see or change the accounts at all.

Sales agents already get a personal short code, but they have no screen to see their links or how well they do. The owner wants agents to share links and see results, and wants a leaderboard to see who brings paying students.

Success: the owner changes an account once, on one screen, and every page for that country shows the new details. An agent opens "My links", copies a link, and sees how many people viewed, registered and paid.

## What exists today (build on it)

- Table `payment_accounts` (migration 0069): `key` text PK, `label`, `kind` (`bank`, `wallet`, `paypal`), `rows` jsonb (label/value pairs), `display_text`, `sort`, `active`. Seeded: faysal, easypaisa, mashreq, anb, pnb_ph, gcash, pnb_in, paypal. Read by `src/lib/data/landing-payment-accounts.ts` (`listPaymentAccounts(keys?)`).
- Each landing page's registration config lists regions (`RegionDef` in `src/lib/landing/registration/types.ts`: `key` such as PK, UAE, KSA, PH, IN, INTL; `label`, `currency`, `classTime`, `timezoneLabel`, `accountKeys`). The accounts a student sees come from that region's `accountKeys`, in that order. Used by the register route, `RegistrationSetup.tsx`, `AddCountryDialog.tsx`, `RegistrationFlow.tsx`, `PricingCardsLive.tsx`, `public-config.ts`, `status-email.ts`, `admin-edit.ts`, `config.ts`, `build-registration.ts` and three template data files.
- Agent links: `landing_agent_links` (one code per sales agent, link shape `/e/<page slug>?ref=<code>`), `src/lib/data/landing-agent-links.ts`, admin panel `AgentLinksPanel.tsx` (inside the promo codes admin page), route `/api/admin/landing-agent-links`.
- Promo codes are already database-backed with an admin screen. Not part of this plan.
- Registrations carry `agent_id`; `landing_funnel_events` records `view | start | step | submit` per page and session with an `agent_id`.
- Sales workspace nav lives in `src/components/dashboard/nav.ts` (sales agent items) with pages under `src/app/dashboard/sales/`. Admin pages under `src/app/dashboard/admin/`.

## Goals

1. **Admin "Payment accounts" screen**, organised by country. Countries are shown as headings; each lists its accounts in the order students see them. The owner can:
   - add, edit and hide (not delete) an account (name, type, detail rows, short description);
   - add a new country and edit an existing one (name, region key, currency);
   - reorder the accounts within a country, and move an account to another country or list it under several countries (PayPal is international and may appear in more than one).
2. **Country lists are central.** Every landing page uses the accounts of its country automatically. Changing an account or a country's list changes every page at once. This replaces per-page picking.
3. **Sales workspace "My links"**, agent-only: one row per live (published) registration page with that agent's link, a Copy button, and three numbers for that agent: views, registrations, paid.
4. **Admin agent leaderboard**: per agent, registrations, paid and revenue, with a simple time filter (last 7 days, last 30 days, all time; default all time).

## Non-goals

- No commission payouts, no ad spend or ROAS reports.
- No payment processing: accounts are details shown to students who pay by transfer.
- No deleting accounts (hide only, so history and old references never break).
- No per-page override of a country's accounts.
- No changes to promo codes.

## Anti-goals (a failure even if it works)

- A student seeing a hidden or wrong account, or a pay step with no accounts. A live page must never break because a country list is empty or a country is missing.
- An agent seeing another agent's numbers or links, or any revenue figure.
- A bank number change that silently leaves old copies on live pages or in already-built emails.

## Decisions the owner made

- Payment accounts are set per country, once, centrally, and pages follow. Editable later; more countries can be added (owner, 2026-10-22).
- Agents have no links today; "My links" is new. The existing promo code system stays as is.

## My calls (the owner has not seen these; flagged for review)

- Roll-out safety: a page region uses the central list for its region key. If the central list for that key is empty or missing, it falls back to the region's old `accountKeys` so no live page breaks. The old per-page picker is removed from the admin page setup once central lists are seeded; the stored `accountKeys` stay in the data and are no longer edited.
- Migration seeds the central country lists from the data the three legacy templates already carry (PK: faysal, easypaisa; UAE: mashreq; KSA: anb; PH: pnb_ph, gcash; IN: pnb_in; INTL: paypal), in the order those templates use. The builder confirms the exact order against the template files.
- "Hide" means `payment_accounts.active = false`; hidden accounts disappear from student pages and from new emails.
- Agent numbers: views = `view` events with that agent's id for that page; registrations = people registered through that agent (rows with `agent_id`, excluding test rows); paid = those with status `paid`. Revenue on the leaderboard = `amount_received` if set, else `expected_amount`, for paid rows, in each row's own currency, shown per currency (no currency conversion).
- Agents see counts only, never revenue. Only sales agents see "My links"; the leaderboard is admin only.
- Member rows of a group are counted as people but the lead's row carries the money (matches the Meta Purchase rule: one amount per group).
- Central lists own **only the accounts**. A page region keeps its own label, currency, class time and timezone, so prices and expected amounts never change. The country screen therefore has no currency field: a country is a name plus its region key (PK, UAE, KSA, PH, IN, INTL, or a new one). Adding a country here only creates its account list; a page region whose key has no central country keeps using its own `accountKeys`. `AddCountryDialog` (page variants) is a different thing and stays as it is.
- Emails are built at send time from the current accounts, so a change shows in every email sent afterwards. An email already sent cannot change. Nothing stores rendered account text; the builder confirms this and, if something does, snapshots it only for display of history.
- Fallback when a country's central list has no **active** accounts (empty, or all hidden): use the region's old `accountKeys`, still filtered to active accounts, so a hidden account is never shown. The code must also work if the new tables do not exist yet (owner pastes the migration by hand): treat a missing central list as "no list". The old per-page account picker is removed in this plan, after the seed data exists.
- Leaderboard time filter: "registrations" count by the date the person registered; "paid" and "revenue" count by the date of the first change to Paid in `landing_status_events` (no new column needed; Paid then Pending then Paid keeps the first date, and a registration currently not Paid is not counted).
- Counting unit: one sale = the lead row or individual row. Member rows are not counted separately, so "registrations", "paid" and revenue are per sale and group size never inflates an agent's numbers.
- "My links": sales agents only (an admin who is not a sales agent does not see it). The agent's code is created on first visit through the existing `getOrCreateAgentLink` on the server (service role), so no agent-role write path is needed. Pages listed: main landing pages that are published and accept registrations (not drafts, not closed, not per-country variants; the variant links remain the admin's tool).
- Views = distinct sessions with a `view` event carrying that agent's id for that page, not raw page loads.
- Design: no Stitch screens exist yet for payment accounts, My links or the leaderboard. Per the project rule (do not invent UI), the plan produces Stitch generation prompts for the owner and the build waits for the screens.

## Constraints

- Work on a new branch from main (e234c39 or later). Never merge or push to main without the owner's yes. Leave untracked `docs/lead-capture-go-live-guide.md` alone.
- `npm run` is broken: use `node node_modules/typescript/bin/tsc --noEmit` (baseline 0, ignore `.next/types`), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Never run `next build` while the dev server runs.
- Never regenerate `database.types.ts`; hand-add entries. The Supabase MCP is read-only: migrations are written as files and the owner pastes the SQL.
- Row-level security and server-side checks on every new table and route. Admin-only writes to payment accounts and countries. Agents read only their own rows.
- Mocked database tests have hidden real bugs twice: check every column, `onConflict` target and status value against `supabase/migrations`.
- Known failing tests not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening.test.ts`, plus the four noted on 2026-10-22 (gas byte-identical tests and `participant-campaign-page-ui`).
- Admin and student copy in plain, non-technical words.

## Left to the builder

- Table shape for countries and the account-to-country lists (a country table plus an ordered link table is the obvious shape).
- How a page region resolves its accounts (a data function used by the register route, the public config and the status emails).
- How views, registrations and paid are counted efficiently per agent and page.
- Screen layout once the Stitch screens exist; route names; sidebar labels and icons.
