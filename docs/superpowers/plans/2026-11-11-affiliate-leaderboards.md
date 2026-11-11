# Affiliate leaderboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A competitive, motivating affiliate leaderboard: public page, own-rank card with "N more to pass X" on each private page, team competition, and an admin Leaderboard tab that shares the top three as a picture.

**Architecture:** One SQL function (`affiliate_leaderboard`, migration 0112) returns every accepted affiliate with `registered` and `paid` for a window. Ranking, ties, team rank, gap, public names and share text are pure TypeScript in `src/lib/affiliates/leaderboard.ts` (testable over plain rows, like `agent-stats-rules.ts`). A data module calls the function; three surfaces read the same model. The share picture reuses `PodiumImage`, `SharePodium` and `share-podium.ts` from the student portal.

**Tech Stack:** Next.js App Router, Supabase (service role, `createAdminSupabase`), vitest, `next/og`.

**Spec:** `docs/superpowers/specs/2026-11-11-affiliate-leaderboards-design.md`. Branch: `leaderboard-work` (one branch for the session; nothing pushed without the owner saying "push").

## Global Constraints

- Owner pastes all SQL by hand. New migration is `supabase/migrations/0112_affiliate_leaderboard.sql` (0111 is taken). Tables service-role only (RLS on, zero policies).
- Never regenerate `src/lib/supabase/database.types.ts`: hand-add the new table and function entries.
- Windows path has `&`: run `node node_modules/typescript/bin/tsc --noEmit` (must stay 0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`.
- Known failing tests that are not ours: landing-event-sheet, landing-hero-render, landing-polish-3, landing-route-hardening, pz-tokens, participant-recipients, participant-whatsapp-ui, gas-apply-registration-status, migrations-segment-source-dnc, participant-campaign-page-ui, registration-id-selection. `landing-registrations-list-ui` is flaky: re-run alone.
- No `eslint-disable` for `@typescript-eslint`. Check a file's line ending (`file <path>`) before editing; source files are often CRLF; keep it. New files: LF is fine.
- Colour rule: backgrounds and borders use `pz-solid-*` or `landing-*` tokens; `pz-deep`, `pz-mid`, `pz-danger` are for text only.
- Public routes: unguessable token, `affiliatePageCallerAllowed()` rate limit, `robots: { index: false, follow: false }`, `export const dynamic = "force-dynamic"`.
- No money anywhere on the public page or the share picture. Public rows: rank, first name + last initial, team colour, paid count. Never email, phone, code or token of anyone else.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage files by path only. Leave untracked: `docs/lead-capture-go-live-guide.md` and the two 2026-11-02 plan files.
- Subagent models set explicitly; the final whole-branch review uses opus.
- Run `next build` before pushing (new pages), never while a dev server is up.
- Owner-facing text: short plain words, no jargon.

## Rules (from the spec, restated once; every task obeys these)

- Ranked: `status = 'accepted'` affiliates only. Dropped/left are on no board and in no team total.
- **All time paid** = `opening_secured` + live (not voided) rows in `affiliate_commissions`. **This month paid** = live `affiliate_commissions` rows with `created_at >= month start (Pakistan time)`; opening sales never count. This is exactly the private page's `paidCount` / `monthPaid` (`buildPageModel`), so numbers agree.
- **registered** = `landing_registrations` rows with `affiliate_id`, `row_type in ('individual','lead')`, `is_test = false`, by `created_at` in the window (all time = no window). Opening sales are not "registered".
- Order: paid desc, then registered desc, then name (`localeCompare`). Equal paid AND equal registered share a rank (1,1,3).
- Team rank metric = team paid total / team active members; active = member with paid >= 1 in that period. Teams with zero active members rank last (metric 0), listed in fixed order Green, White, Yellow, Blue, Pink among themselves. Affiliates with no team are not in the team board.
- "This month" starts on the 1st at 00:00 Pakistan time (UTC+5, no DST).
- Gap: "N more paid sales to pass <First L.>" where the target is the nearest affiliate above with a strictly higher (paid, registered) order; N = target paid - my paid, plus 1 when paid is equal (registered then decides, so one more paid sale puts you ahead). Rank 1: "You are first, N ahead of <First L.>" (N = my paid - second's paid; "level with" when 0). No paid yet: short warm line, no number.

## Review Focus

- Empty period (no affiliate with a paid sale, or no accepted affiliates): board, team board and share action show a friendly empty state, no NaN, no crash, no "0 more to pass".
- Only one ranked affiliate: no gap line, no "ahead of" name, podium with one place.
- Ties across the podium edge (three on rank 1, two on rank 3): the picture shows at most three; rank numbers repeat correctly.
- Team with zero active members (division by zero) and a team with a single member who sold once (must not beat a 20-member team that sold 10): ordering stays sane, no NaN/Infinity.
- Non-Latin or one-word or very long names in the share picture and public list (first name + last initial, fallback when no last name, picture font is Latin only).
- Rotated public token: the old link answers exactly like a wrong token; a malformed token never reaches the database.

---

### Task 1: Pure ranking rules

**Files:**
- Create: `src/lib/affiliates/leaderboard.ts`
- Test: `tests/affiliate-leaderboard-rules.test.ts`

**Interfaces:**
- Produces (all exported from `src/lib/affiliates/leaderboard.ts`, no server imports):
  - `type BoardPeriod = "all" | "month"`
  - `type BoardRow = { affiliateId: string; name: string; team: Team | null; registered: number; paid: number }` (`Team` from `@/lib/affiliates/service`)
  - `type RankedAffiliate = BoardRow & { rank: number; publicName: string }`
  - `type TeamRank = { team: Team; rank: number; paid: number; members: number; active: number; score: number }`
  - `monthStartPkt(now: Date): Date` (00:00 on the 1st of the Pakistan-time month, as a UTC instant)
  - `windowFor(period: BoardPeriod, now: Date): Date | null` (null for "all")
  - `publicName(name: string): string` ("Ali Khan" -> "Ali K.", one word -> "Ali", titles Dr/Prof/Mr/Mrs/Ms/Miss skipped like `initials` in `lib/progress/leaderboard.ts`, collapses extra spaces, empty -> "Affiliate")
  - `rankAffiliates(rows: BoardRow[]): RankedAffiliate[]` (order and shared ranks per Rules)
  - `rankTeams(rows: BoardRow[]): TeamRank[]` (all five teams always returned)
  - `gapFor(ranked: RankedAffiliate[], affiliateId: string): GapResult | null` where `GapResult = { kind: "first"; ahead: number; of: string | null } | { kind: "chase"; more: number; target: string; rank: number } | { kind: "none" }`; null when the id is not on the board
  - `gapLine(gap: GapResult): string` (plain words: "2 more paid sales to pass Ali K." / "1 more paid sale to pass Ali K." / "You are first, 3 ahead of Bina R." / "You are first, level with Bina R." / "You are first." / "Get your first paid sale to join the race.")
  - `shareText(input: { period: BoardPeriod; top: RankedAffiliate[]; teams: TeamRank[]; boardUrl: string }): string` (WhatsApp text: title with period, up to ten lines "1. Ali K. (Blue) - 12 paid", the top team line, the board link; plain, encouraging, no money)

- [ ] **Step 1: Write the failing tests** in `tests/affiliate-leaderboard-rules.test.ts`. One `it` per rule, with these exact assertions:
  - `monthStartPkt(new Date("2026-11-30T20:00:00Z"))` equals `2026-11-30T19:00:00.000Z` (it is already 1 Dec 01:00 in Pakistan, so the month start is 30 Nov 19:00 UTC); `monthStartPkt(new Date("2026-11-15T10:00:00Z"))` equals `2026-10-31T19:00:00.000Z`; `windowFor("all", d)` is null.
  - `publicName("Dr. Ali  Khan")` is "Ali K."; `publicName("Madonna")` is "Madonna"; `publicName("   ")` is "Affiliate"; `publicName("Ali Khan-Reza")` is "Ali K.".
  - `rankAffiliates`: paid 5/reg 9, paid 5/reg 9, paid 5/reg 4, paid 2 give ranks 1,1,3,4 (the two equal rows ordered by name); every zero-paid affiliate is still returned (nobody is dropped).
  - `rankTeams`: Blue 1 active of 20 members with paid 1 does NOT beat Pink 2 active of 2 with paid 6 (score 3); a team with 0 active has score 0 and ranks after teams with score > 0; all five teams present even with empty input; rows with `team: null` are ignored.
  - `gapFor`: chasing a strictly higher paid gives `more = target.paid - me.paid`; equal paid but fewer registered gives `more = 1`; first place with a second gives `{ kind: "first", ahead, of }`; a lone first gives `{ kind: "first", ahead: 0, of: null }`; unknown id gives null; zero paid gives `{ kind: "none" }`.
  - `gapLine` returns the exact strings listed under Interfaces (singular "sale" when 1).
  - `shareText` contains the period title ("This month" / "All time"), "1. Ali K. (Blue) - 12 paid", the board URL, and contains no digit-currency pattern (`/PKR|Rs|AED|SAR|\$/`).
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/affiliate-leaderboard-rules.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the functions above in `src/lib/affiliates/leaderboard.ts`. Reuse `monthKey`'s Pakistan offset idea from `src/lib/affiliates/commission.ts` (UTC+5 constant) rather than a date library.
- [ ] **Step 4: Run** the test file again. Expected: all pass. Then run `node node_modules/typescript/bin/tsc --noEmit` and eslint on both files.
- [ ] **Step 5: Commit** `git add src/lib/affiliates/leaderboard.ts tests/affiliate-leaderboard-rules.test.ts` with message `feat(affiliates): leaderboard ranking rules`.

---

### Task 2: Migration 0112 (board function and public link token) and types

**Files:**
- Create: `supabase/migrations/0112_affiliate_leaderboard.sql`
- Create: `supabase/checks/0112_affiliate_leaderboard_check.sql` (read-only checks the owner runs after pasting, like `0110_..._check.sql`)
- Modify: `src/lib/supabase/database.types.ts` (hand-add; check its line ending first)
- Test: `tests/migration-0112-affiliate-leaderboard.test.ts` (text checks on the SQL, same style as `tests/migration-0110-affiliate-monthly-percent.test.ts`)

**Interfaces:**
- Produces SQL:
  - table `public.affiliate_board_link` (`id boolean primary key default true check (id)`, `token text not null`, `rotated_at timestamptz not null default now()`), RLS on, zero policies; seeded with one row holding `encode(gen_random_bytes(24), 'base64')` made URL-safe (replace `+`->`-`, `/`->`_, strip `=`) so it matches `^[A-Za-z0-9_-]{20,64}$`; `on conflict (id) do nothing`.
  - function `public.affiliate_leaderboard(p_from timestamptz default null)` returns `table (affiliate_id uuid, name text, team text, registered integer, paid integer)`; `language sql stable security definer set search_path = public`; `revoke all ... from public, anon, authenticated; grant execute ... to service_role`.
- Function logic (the same Rules as above): rows are accepted affiliates; `paid` = `(case when p_from is null then a.opening_secured else 0 end)` + count of `affiliate_commissions` with `voided_at is null` and (`p_from is null or created_at >= p_from`); `registered` as in Rules. Left join so zero rows are kept. Do not order in SQL (TypeScript orders).

- [ ] **Step 1: Write the failing migration test.** Assertions on the flattened SQL: contains `create table if not exists public.affiliate_board_link`, `enable row level security`, no `create policy`; contains `create or replace function public.affiliate_leaderboard(p_from timestamptz default null)`; the paid expression uses `voided_at is null` and `opening_secured` only inside the `p_from is null` branch; `status = 'accepted'`; `is_test = false`; `row_type in ('individual', 'lead')`; revoke from `public, anon, authenticated` and grant to `service_role`; no `drop table`, no `delete from`.
- [ ] **Step 2: Run** it. Expected: FAIL (file missing).
- [ ] **Step 3: Write the migration** with a header comment in the style of 0110 (what it does, service role only, owner pastes it, safe to run twice) and the check file (counts accepted affiliates, shows the function returns one row per accepted affiliate for `null` and for the current month start, and that the token row exists and matches the token pattern; read-only).
- [ ] **Step 4: Hand-add types** for the table (`Row/Insert/Update/Relationships`) and the function (`Functions.affiliate_leaderboard`) following the neighbouring `affiliate_link_stats` entry. Do not regenerate the file.
- [ ] **Step 5: Run** the migration test, `tsc --noEmit` (0 errors), eslint. Commit `feat(affiliates): leaderboard function and public link token (0112)`.

---

### Task 3: Data module

**Files:**
- Create: `src/lib/data/affiliate-leaderboard.ts`
- Test: `tests/affiliate-leaderboard-data.test.ts`

**Interfaces:**
- Consumes: `windowFor`, `rankAffiliates`, `rankTeams`, `BoardRow`, `BoardPeriod`, `RankedAffiliate`, `TeamRank` from Task 1; `affiliate_leaderboard` and `affiliate_board_link` from Task 2.
- Produces (server-only, `import "server-only"`):
  - `type AffiliateBoard = { period: BoardPeriod; rows: RankedAffiliate[]; teams: TeamRank[] }`
  - `getAffiliateBoard(period: BoardPeriod, now?: Date): Promise<AffiliateBoard>` (rpc with `p_from: windowFor(...)?.toISOString() ?? null`; maps numbers with `Number(...)`; throws on rpc error)
  - `getBoardToken(): Promise<string>` (reads the single `affiliate_board_link` row)
  - `rotateBoardToken(): Promise<string>` (writes a new 24-byte base64url token with `crypto.randomBytes(24).toString("base64url")`, sets `rotated_at = now()`, returns it)
  - `isBoardToken(token: string): Promise<boolean>` (shape check `^[A-Za-z0-9_-]{20,64}$` BEFORE any query; then constant-time compare with the stored token via `crypto.timingSafeEqual` on equal-length buffers)
  - `getAffiliateRank(affiliateId: string, now?: Date): Promise<{ all: OwnRank | null; month: OwnRank | null }>` where `OwnRank = { rank: number; of: number; paid: number; line: string; teamRank: number | null; team: Team | null }` (`line` = `gapLine(gapFor(...))`); null when the affiliate is not on the board. Built on `getAffiliateBoard` for both periods.
- Follow the mocking style of `tests/affiliate-page-data.test.ts` (mock `@/lib/supabase/admin`).

- [ ] **Step 1: Write the failing tests:** the rpc is called with `p_from: null` for "all" and the Pakistan month start ISO string for "month" (pass a fixed `now`); string numbers from the rpc become numbers and rows come back ranked; an rpc error throws; `isBoardToken("short")` and `isBoardToken("has spaces and is long enough!!")` are false WITHOUT any database call; the right token is true, a same-length wrong token is false; `rotateBoardToken` returns a token matching the shape regex and writes it; `getAffiliateRank` returns null for an id not on the board and a `line` string for one that is.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the module per the signatures.
- [ ] **Step 4: Run** the file, `tsc`, eslint. Expected: pass / 0 errors.
- [ ] **Step 5: Commit** `feat(affiliates): leaderboard data module`.

---

### Task 4: Public leaderboard page

**Files:**
- Create: `src/app/affiliate-board/[token]/page.tsx`, `src/components/affiliates/AffiliateBoard.tsx` (client component: period switch, podium, list, team standings)
- Test: `tests/affiliate-board-page.test.tsx`

**Interfaces:**
- Consumes: `isBoardToken`, `getAffiliateBoard` (Task 3); `affiliatePageCallerAllowed` from `@/lib/pzid/caller-allowed`; `AffiliateClosed` from `src/components/affiliates/AffiliateClosed.tsx` for every refusal (over the limit, bad token, rotated token all answer identically, like `src/app/affiliate/[token]/page.tsx`).
- Produces: route `/affiliate-board/<token>`. The page loads BOTH periods on the server and passes `{ all: AffiliateBoard, month: AffiliateBoard }` to `AffiliateBoard` (props use only `publicName`, `rank`, `team`, `paid`; the component must never receive `affiliateId`, `name` (full), registered, email, code or token). Default period "This month".
- Look: same as the student progress portal (`src/components/progress/portal/Leaderboard.tsx`: podium of three, ranked list, a "more" section), with `landing-*`/`pz-solid-*` tokens per the colour rule, team colour dot beside each name, a team standings strip ("Team race") with the metric shown as "paid per active member" in plain words. Phone-first (390px) and PC (1440px). Empty period shows a friendly "No paid sales yet this month. Be the first." message.

- [ ] **Step 1: Write the failing tests:** a wrong/malformed token renders `AffiliateClosed` and never calls `getAffiliateBoard`; over the rate limit renders `AffiliateClosed`; a valid token renders the first names with last initial and paid counts for both periods (switching shows month vs all-time data); the rendered HTML of a board containing a row with full name "Ali Khan", email and code contains "Ali K." and NOT "Khan", "@", or the code; page metadata has `robots: { index: false, follow: false }`; empty period shows the empty message; one-row board renders one podium place without errors.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the page and component. Read `src/components/progress/portal/Leaderboard.tsx` and copy its structure and classes; do not invent a new design.
- [ ] **Step 4: Run** the file, `tsc`, eslint.
- [ ] **Step 5: Commit** `feat(affiliates): public leaderboard page`.

---

### Task 5: Own rank card on the private page

**Gate (do this first, before any code):** this card has no Stitch design. Stop and hand the owner TWO Stitch prompts (phone 390px and PC 1440px) for a "Your rank" card: rank number big, "of N affiliates", the gap line, small team rank, a "See the full board" link, competitive and motivating tone, both periods (This month / All time). Search the Stitch project `4651274386787527431` ("Your Affiliate Page - Mobile (390px)" 7e4509f0…, "Desktop (1440px)" 467d3f60…) first and say whether a card already exists. Wait for the owner's design or "build it simple like the other cards" before Step 3.

**Files:**
- Modify: `src/lib/data/affiliate-page.ts` (add `rank` to `AffiliatePageModel`; check line endings first), `src/components/affiliates/AffiliatePage.tsx`
- Create: `src/components/affiliates/YourRank.tsx`
- Test: extend `tests/affiliate-page-data.test.ts`, `tests/affiliate-page-ui.test.tsx`

**Interfaces:**
- Consumes: `getAffiliateRank(affiliateId)` (Task 3), `getBoardToken()` (for the "See the full board" link `${baseUrl}/affiliate-board/${token}`).
- Produces: `AffiliatePageModel.rank: { all: OwnRank | null; month: OwnRank | null; boardUrl: string }`. `buildPageModel` stays pure: `PageModelInput` gets `rank` passed in; `getAffiliatePageModel` fetches it. A failure to load the rank must NOT break the private page: catch, log, and pass `{ all: null, month: null, boardUrl: "" }` (the card then hides).

- [ ] **Step 1: Write the failing tests:** `buildPageModel` passes `rank` through; page shows "You are 3rd of 54" style text and the `line` string for This month and All time; an affiliate with `rank.month === null` shows the "join the race" prompt, no crash; the board link is present only when `boardUrl` is non-empty.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** `rank` in the model and loader, and `YourRank` placed near the top of `AffiliatePage` (under the name/code, above links). Colour rule applies.
- [ ] **Step 4: Run** `tests/affiliate-page-data.test.ts`, `tests/affiliate-page-ui.test.tsx`, `tests/affiliate-page-route.test.tsx`, `tsc`, eslint.
- [ ] **Step 5: Commit** `feat(affiliates): your rank card on the private page`.

---

### Task 6: Admin Leaderboard tab, share picture, WhatsApp text, rotate link

**Files:**
- Modify: `src/components/admin/affiliates/AffiliatesAdmin.tsx` (add tab `"leaderboard"`; check line endings; file is UTF-8 with non-ASCII), `src/app/dashboard/admin/affiliates/page.tsx` (load both boards and the public link), `src/components/progress/portal/PodiumImage.tsx` (add optional `unit?: string` and `heading?: string` props, default = today's student text so student output is unchanged)
- Create: `src/components/admin/affiliates/AffiliateLeaderboardTab.tsx`, `src/app/api/admin/affiliates/podium/route.tsx` (GET `?size=square|story&period=all|month`), `src/app/api/admin/affiliates/board-link/route.ts` (POST = rotate; returns `{ url }`)
- Test: `tests/affiliate-podium-route.test.tsx`, `tests/affiliate-board-link-route.test.ts`, extend `tests/affiliates-admin-ui.test.tsx`, extend `tests/progress-podium-route.test.tsx` only to confirm the student picture is unchanged

**Interfaces:**
- Consumes: `getAffiliateBoard`, `getBoardToken`, `rotateBoardToken` (Task 3); `shareText`, `publicName`, `parsePodiumSize`/`PODIUM_SIZES` (existing, `src/lib/progress/leaderboard.ts`); `SharePodium` (existing, currently takes `slug`, `title`, `pick`, `label` and builds the URL with `podiumImageUrl`): add an optional `imageUrl?: (size: PodiumSize) => string` and `fileBase?: string` prop so the affiliate board can point it at `/api/admin/affiliates/podium?period=...&size=...`; default behaviour for the student portal must not change.
- Guards: both routes `requireAdmin("sales_hub")` (same as `src/app/api/admin/affiliates/route.ts`).
- Podium route: top three of the chosen period (`rankAffiliates` order, first three rows with paid >= 1), entries `{ name: publicName, rank, score: paid }` passed to `PodiumImage` with `unit: "paid sales"`, `heading: "Affiliate leaderboard · This month" | "· All time"`; non-Latin names fall back through the existing `podiumImageEntry` (drawn as "Student #rank" today: add an affiliate wording override via the `unit`/`heading` props or a `fallbackLabel` prop so it reads "Affiliate #rank"). 404 text "No paid sales yet." when nobody qualifies; 400 for a bad size/period; 500 text "We could not make this picture right now. Please try again in a minute." (nothing thrown leaves the server). No team colour is needed on the picture (my call: keep the picture simple; add later if the owner asks).
- Tab content: period switch (This month default / All time); the board (full list with registered and paid, team colour); Team race standings; `SharePodium` button; "Copy for WhatsApp" button (copies `shareText(...)` with the public board URL, with a "Copied" confirmation); "Public link" row with the full URL, a copy button, and "Change link" (POST board-link, confirm in plain words first: "The old link will stop working. Continue?").

- [ ] **Step 1: Write the failing tests:** podium route returns 401/403 shape for non-admin (same as existing admin route tests), `image/png` for admin, 400 for `period=week`, 404 text for an empty board, and never includes a full name, email or money in the entries passed to `PodiumImage`; board-link POST rotates and the old token no longer passes `isBoardToken`; admin UI shows the Leaderboard tab, the period switch changes the list, "Copy for WhatsApp" writes the share text to the clipboard (mock `navigator.clipboard`), "Change link" asks before posting; the existing student `tests/progress-podium-route.test.tsx` and `tests/progress-share-podium.test.ts` still pass unchanged.
- [ ] **Step 2: Run** the new/changed test files. Expected: FAIL.
- [ ] **Step 3: Implement** the props on `PodiumImage`/`SharePodium` first (defaults keep the student output byte-identical), then the routes, then the tab and the page wiring.
- [ ] **Step 4: Run** all of: `tests/affiliate*.test*`, `tests/affiliates-*.test*`, `tests/progress-*.test*`, `tests/agent-leaderboard.test.tsx`, then `tsc` and eslint on touched paths. Expected: pass (except the known failing list).
- [ ] **Step 5: Commit** `feat(affiliates): admin leaderboard tab with share picture`.

---

### Task 7: Whole-branch check and owner steps

**Files:**
- Create: `docs/superpowers/plans/2026-11-11-affiliate-leaderboards-owner-steps.md` (plain words: paste 0111 then 0112, run the 0112 check file, open the admin Affiliates > Leaderboard tab, copy the public link, share the picture, change the link; what to look at on a phone)

- [ ] **Step 1:** Run `tsc --noEmit` (0 errors), eslint on all touched paths, all new test files, all `tests/affiliate*` and `tests/progress-*` and `tests/agent-leaderboard.test.tsx`. Report failures that are not in the known-failing list.
- [ ] **Step 2:** `next build` only if no dev server is running (check first); the new pages must prerender/compile. Fix any client-boundary error (keep shared values in non-client files; `tests/client-boundary-values.test.ts` guards this).
- [ ] **Step 3:** Whole-branch review by a fresh subagent on opus (`model: "opus"`), scoped to the diff of `leaderboard-work` vs `origin/main`, with the spec and the Review Focus list. Fix real findings.
- [ ] **Step 4:** Write the owner-steps file, commit `docs: affiliate leaderboards owner steps`. Do NOT push. Tell the owner the branch is ready and wait for "push".
