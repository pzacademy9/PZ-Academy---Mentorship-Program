# Affiliate leaderboards - design

Date: 2026-11-11. Owner: PZ Academy owner (not technical). Part of the affiliates program (see
`2026-11-07-affiliates-design.md`, "Build in 3 steps", Step 2 piece 3). Branch: `leaderboard-work`.

## Why

Affiliates earn commission on paid sales. The owner wants the board to feel **competitive and
motivating**, so affiliates push for more paid sales. The old Sheets system had no board. Two things matter
most to the owner: each affiliate sees exactly how close they are to the next rank, and the admin can
post the top three as a picture, the same way the student progress page already does.

## Goals

1. **Public leaderboard page**, no login, shareable link (secret token, `noindex`, rate limited, same
   pattern as the private affiliate page). Periods: "All time" and "This month".
2. **Each affiliate's private page** (`/affiliate/<token>`) shows their own rank and the gap:
   "2 more paid sales to pass <first name + last initial>". Also their team's rank.
3. **Team competition.** Teams are Green, White, Yellow, Blue, Pink (`affiliates.team`). Teams are ranked
   too, on the public page, on private pages and in the admin tab.
4. **Admin Leaderboard tab** (the tab already named in the affiliates design) with the period toggle, the
   board, a **share picture** (square 1080x1080 and story 1080x1920, top three) and **Copy for WhatsApp**
   text. This reuses the student portal pieces: `SharePodium`, `PodiumImage`, the
   `api/progress-podium` route, `lib/progress/share-podium` and `lib/progress/leaderboard`.
5. Same look as the student progress portal (podium, list). Use the existing design tokens; do not
   invent a new design. If a new screen has no existing look to copy (the "your rank" card on the private
   page), stop and hand the owner a phone (390px) and a PC (1440px) Stitch prompt.

## Rules (owner confirmed unless marked "my call")

- Who ranks: accepted affiliates only.
- Order: most paid sales first. Ties: more registered first, then name (my call). Same tie rule as the
  existing agent leaderboard (`sortLeaders`).
- A "paid sale" is a landing registration, not a test row, of type individual or lead, credited to the
  affiliate, whose status is Paid right now. Count the way the agent leaderboard does
  (`src/lib/landing/agent-stats-rules.ts`, `landing_leaderboard` in migration 0083/0111) so the numbers
  agree.
- "This month" starts on the 1st at 00:00 Pakistan time (my call, same clock as the commission percent
  rule). A paid sale is dated by its earliest Paid status event, else its created_at (same as agents).
- **Team rank = paid sales per active member** (my call, after the owner approved the idea). Active =
  one or more paid sales in that period. Reason: accepted members are very uneven (Blue 54, Yellow 38,
  White 36, Green 34, Pink 2, checked 2026-11-11), so a plain total would let Pink never win. Teams with
  no paid sale in the period are listed last with 0. Affiliates with no team are not in the team ranking.
- **No money anywhere on the public page.** Public rows show: rank, first name + last initial, team
  colour, paid count (the existing design says this). The admin tab may show registered counts too.
- Gap text on the private page: "N more paid sales to pass X" where N = the next-above affiliate's paid
  count minus yours, plus 1 if that would only tie (my call: passing means strictly more; a tie is
  broken by registered count, so say "to pass" only when N makes you strictly ahead). If the affiliate is
  first: "You are first. <N> ahead of <name>." If they have no paid sales yet: show how many the person in
  last place with at least one has, or a plain "Get your first paid sale to join the board" (builder's
  call on wording; keep it short and warm).
- Privacy: other affiliates are shown by first name + last initial only, never email, phone or code.

## Owner ruling after the builder check

- Imported "opening" sales (`affiliates.opening_secured`, sales from the old Sheets system) COUNT on
  "All time": paid count = live paid sales + `opening_secured`. "This month" counts live paid sales only
  (opening sales have no date). The private page, the public page and the admin tab all use this same rule.
  Team "active member" for All time = one or more paid sales including opening ones.

## Calls made after the builder check (my calls, owner to check)

- Public link: ONE shared token for the whole board (posted once in WhatsApp groups), stored in the
  database, with an admin button to change it. Not one link per affiliate.
- Dropped or left affiliates are excluded from every board and from team totals.
- The board's paid count must use the same filters as the private page's count (migration 0109). If they
  differ today, the plan includes a step that makes them agree.

## Non-goals

- Progress and Motivation emails (Step 2 piece 4). Payouts (Step 3). Both stay paused.
- Money amounts, PKR conversion, commission on the board.
- Affiliate logins or accounts.
- Changing the sales-agent leaderboard (only its revenue bug, already fixed in migration 0111).

## Anti-goals (a failure even if it "works")

- Showing a name that is too revealing or any money on the public page.
- A slow page: the board is computed in SQL (the Supabase client returns at most 1000 rows per
  request), one query per period, not one per affiliate.
- Numbers that disagree with the agent leaderboard or with the private page counts.

## Constraints

- The owner pastes every SQL by hand (migration `0112_...`; check the folder for the next free number).
  Tables are service role only. Never regenerate `database.types.ts`: hand-add the new function.
- Windows path has `&`: run checks directly (tsc, vitest, eslint), not `npm run`.
- Run `next build` before pushing (adds a page): not while a dev server runs.
- Colour rule: backgrounds and borders use `pz-solid-*` or `landing-*` tokens; `pz-deep`, `pz-mid`,
  `pz-danger` are for text only. Source files often use CRLF: check before editing and keep it.
- Public routes are keyed by an unguessable token, rate limited, `noindex`.
- Team colours are the five values in the `affiliates.team` check constraint.

## Left to the builder

- The public token: reuse a per-affiliate token or add one shared leaderboard token (the existing design
  says "keyed by an unguessable token"). Pick the simplest that cannot reveal private data; say which.
- SQL function shapes, caching, file layout, component names.
- Exact wording of the gap lines and the WhatsApp text (short, plain, encouraging, in the style of the
  student "Copy for WhatsApp").
- How the share picture shows team colours.
- Tests: ranking rules written over plain rows, like `agent-stats-rules.ts`, checked against the SQL.

## Open for the owner (not blocking the build)

- Whether to show "last month's winners" later. Not in this build.
