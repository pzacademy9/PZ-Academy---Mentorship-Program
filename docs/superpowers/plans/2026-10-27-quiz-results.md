# Quiz Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin uploads the Kahoot report for a session, reviews every problem row (rejoins, duplicates, unknown IDs, recorded students), saves the scores per session, and sees a live combined ranking per batch. A student who took the quiz but has no check-in is flagged, and one click marks them present.

**Architecture:** Upload and parsing run in a server action (file is never stored). Pure modules do the parsing, the ID matching (exact match first, then trailing-`n` strip) and the review building, so they are fully unit-tested. The review is held in the browser while the admin decides; "Save" sends the final rows, the server re-validates every person and writes the whole session in one database function (delete old rows + insert new rows in one transaction, so a failed save never leaves half a session). New service-role tables `batch_quiz_results` and `batch_quiz_decisions` hang on `batch_sessions` (plan 2) and `pz_people` (plan 1). The leaderboard is computed on read, live students only.

**Tech Stack:** Next.js App Router (server actions), Supabase (owner pastes SQL; MCP is read-only), vitest, one small spreadsheet-reading package (decided in Task 2).

**Spec:** `docs/superpowers/specs/2026-10-27-attendance-results-design.md`, part 3 plus "Further calls" (rejoin rule, re-uploads, quiz maximum). Plan 3 of 5. Plans 4 (public pages) and 5 (history import) reuse the pieces built here.

## Global Constraints

- Identity is the matched person (`pz_people`). Matching never guesses silently: exact ID or alias match wins; only if there is none, trailing `n` characters (and nothing else) are stripped and the match retried; anything else is "unknown" and goes to the review list. Suggestions are shown, never applied automatically.
- Live students only count on leaderboards. Recorded students keep their saved result (it shows in their own totals later) but are excluded from the ranking.
- A student must never silently lose a score: every row of the file ends as exactly one of: saved, merged into another row (admin chose), dropped as the lesser duplicate (admin chose), or skipped (admin chose). The review screen shows the counts and Save is blocked while any row is undecided.
- Saving a session replaces that session's earlier results (one transaction). Earlier decisions (duplicate choices, alias fixes) are remembered and pre-applied on a re-upload; the admin can still change them.
- Quiz maximum per session: admin-entered. Default suggestion = number of questions x 1,000 (questions read from the Overview tab "Played: 20 of 20" or the count of `Q<n>` columns on the Summary tab), falling back to the highest score in the file when neither is found. This changes the spec's "defaults to the highest score" because of the real file above; tell the owner. Percentage = score / maximum, capped at 100.
- Admin only. Public pages are plan 4. No emails or other personal data in any leaderboard shape (names, IDs, scores only).
- File limits: .xlsx or .csv, max 5 MB, max 5,000 data rows. Anything else gets a plain refusal message. Never show raw error text to the admin.
- New tables: RLS on, zero policies. Never regenerate `database.types.ts`: hand-add entries, including the `Functions` entry for the new RPC.
- Tools: `./node_modules/.bin/tsc --noEmit` (baseline 0 errors), `./node_modules/.bin/vitest run tests/<file>`, `./node_modules/.bin/eslint <paths>`; `npm run` also works in a cloud session. Run `npm ci` first in a fresh cloud session. No `eslint-disable` for `@typescript-eslint`. Source files often use CRLF: use the Edit tool. No `next build` while a dev server runs.
- Commit trailer from CLAUDE.md. Next migration number is 0090 (check the folder before writing).
- UI follows Stitch (CLAUDE.md): Task 7 starts by checking the Stitch projects for a quiz-results or leaderboard screen. If none exists, stop and hand the owner a generation prompt; do not improvise the design. Tasks 1 to 6 do not depend on it.

## Real sample checked (2026-10-27)

The owner sent a real report: "Anti mycobacterial Drugs" (26 Jul 2025, 54 players, 20 questions, 24 tabs). What it shows, and what the plan now does about it:

- **The main tab is "Final Scores", not the first tab.** Tab order: Overview, Final Scores, Kahoot! Summary, "1 Quiz" to "20 Quiz", RawReportData Data. "Kahoot! Summary" also has Rank, Player and Total Score columns (plus one column per question) but no Correct/Incorrect. The parser must pick the tab that has Player + score + Correct + Incorrect headers and prefer the one named "Final Scores".
- **Headers are `Rank`, `Player`, `Total Score (points)`, `Correct Answers`, `Incorrect Answers`**, after two title rows (report name, "Final Scores"). Header matching is "contains", not equals. Numbers are stored as `17.0`. Player text carries trailing spaces.
- **This file predates the new IDs.** Players typed old-style IDs (`Rafi-SCPS194`, `Sami_FUUAST89`, `Aymen.Juw212`, `ParveshKU213`, `Haris AUP221`), plain first names (`Saira`, `Xian`, `Zeb`) and full names (`Tooba Iqbal`). None used the `n` rejoin. So the review screen, not exact matching, will carry most of the work on old files. Plan 5 loads the old IDs as aliases.
- **Real duplicate patterns:** same ID with a trailing space (`Dua-FUUAST60` twice), same ID in different case (`Zeesh-AUST184` scored 2517 and `zeesh-AUST184` scored 0), typo variants (`Jetesh-LUMS154` / `Jetesh-LUMHS154`, `behr-cust230` / `behr-CUST228`, `Zeesh-AUST1845`), and a scored row plus a 0-point ghost row (`Sidra-KU42 ` 14759 and `Sidra-KU42` 0).
- **16 of 54 rows scored 0 with 20 incorrect** (never answered a question). Skipping them one by one would be tedious.
- **Highest score (15,090) is not the maximum possible.** 20 questions at up to 1,000 points each is about 20,000. Defaulting the quiz maximum to the highest score would make the top student 100% every time.

## My calls (not confirmed by the owner)

- The "full name" backup signal from the Kahoot identifier box: if the report has a second text column (header contains `identifier` or `name`, not `player`), it is kept as `hint` and used only to rank suggestions for unknown rows.
- The "predicted top list" in the spec is delivered as: average percentage per quiz taken, and "projected total" = average score per quiz taken x number of sessions in the batch. Clearly labelled as a projection. Easy to drop if the owner dislikes it.
- Ranking order: total score descending (same as the old Combined Master), ties share a rank; the percentage column is shown beside it. The "best student over a period" formula (spec) is not built here.
- A person matched by ID who is not enrolled in this batch at all is flagged "not in this batch" and needs an admin choice (include or skip), because an ID typed wrongly can land on a real stranger.

## Review Focus

- `Hamid-4821`, `Hamid-4821n`, `hamid-4821nn`, ` HAMID - 4821 ` all resolve to the same person; the second and third are reported as rejoins. A legacy alias that itself ends in letters (for example `Sana-Dr`) matches exactly and is NOT stripped. A player named only `n` or `nnn` never strips to an empty string.
- Two rows for one person show up as a duplicate with both options (merge = add score, correct and incorrect; keep one = choose which). Three rows for one person work too. After either choice the file has one result for that person.
- Unknown rows get suggestions from `hint`/player text against names and IDs of people in this batch; suggestions never change a row until the admin clicks.
- On the real sample: `Dua-FUUAST60` twice is one duplicate; `Zeesh-AUST184` and `zeesh-AUST184` are one duplicate (2517 vs 0); "Skip all unknown with 0 points" clears the never-answered rows in one click and leaves unknown rows that scored points untouched.
- A recorded student's row is saved and tagged but absent from the leaderboard; a live student's row appears.
- Re-upload replaces: old rows for the session are gone, rows for people missing from the new file are gone, nothing doubles. A failed save leaves the old results intact (single transaction).
- A forged save request (a person id that does not exist, a negative or non-integer score, correct+incorrect nonsense, more rows than the cap, a session that does not exist) is refused with nothing written.
- A merged person (`pz_merge_people`) takes their quiz results with them; if both people have a result for the same session the higher score is kept.
- "Took quiz, no check-in" lists exactly live students with a result and no mark for that session; marking present from the list is blocked for a person who is not live enrolled; clicking twice leaves one mark.
- An empty file, a file with only a header, a file with no recognisable header, a score like `1,250` or `1250.0`, and blank player cells all produce a clear message or are skipped with a count, never a crash.

---

### Task 1: Migration 0090, tables, save function and types

**Files:**
- Create: `supabase/migrations/0090_quiz_results.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add)
- Test: `tests/migrations-quiz-results.test.ts` (same style as `tests/migrations-attendance-sessions.test.ts`: read the SQL, assert its text)

**Interfaces:**
- Produces (SQL):
  - `alter table batch_sessions add column if not exists quiz_max_score int check (quiz_max_score is null or quiz_max_score > 0)`, `quiz_file_name text`, `quiz_saved_at timestamptz`.
  - `batch_quiz_results(id uuid pk, session_id uuid not null references batch_sessions on delete cascade, person_id uuid not null references pz_people on delete cascade, score int not null check (score >= 0), correct int not null default 0 check (correct >= 0), incorrect int not null default 0 check (incorrect >= 0), player text not null default '', imported boolean not null default false, created_at timestamptz not null default now())`; unique `(session_id, person_id)`; index on `(person_id)`. `imported` is for plan 5.
  - `batch_quiz_decisions(id uuid pk, session_id uuid not null references batch_sessions on delete cascade, kind text not null check (kind in ('duplicate','alias','skip')), key text not null, choice text not null default '', person_id uuid references pz_people on delete cascade, created_at timestamptz not null default now())`; unique `(session_id, kind, key)`. `key` = the normalised player text (`duplicate`: the person's id as text; `alias` and `skip`: the normalised player text).
  - `public.batch_quiz_save(p_session uuid, p_max int, p_file text, p_rows jsonb)` returns `int` (rows saved), `security definer`, `set search_path = public, pg_temp`: in one transaction deletes the session's results, inserts one row per element of `p_rows` (`person_id`, `score`, `correct`, `incorrect`, `player`), updates the three session columns, raises on a missing session. Execute granted to `service_role` only.
  - `pz_merge_people` replaced (`create or replace`) so it also moves `batch_quiz_results` from the dropped person to the kept one: for a session both have, keep the higher score; keeps everything else from 0089 identical (copy the 0089 body, add the quiz block before the final delete).
- [ ] **Step 1: Write the failing test.** Assert the SQL contains: both `create table if not exists`, `enable row level security` for each, the `kind in ('duplicate','alias','skip')` list, `unique (session_id, person_id)`, `unique (session_id, kind, key)`, the three `add column if not exists` lines, `create or replace function public.batch_quiz_save`, `grant execute on function public.batch_quiz_save` to `service_role`, `create or replace function public.pz_merge_people` containing `batch_quiz_results`, and that it has no `drop table` and no `delete from public.landing_registrations`.
- [ ] **Step 2: Run it, expect FAIL** (file missing).
- [ ] **Step 3: Write the migration** (header comment as in 0089; safe to re-run). Hand-add both tables, the three session columns and the `batch_quiz_save` Functions entry to `database.types.ts`.
- [ ] **Step 4: Run the test, expect PASS.** `tsc --noEmit`: 0 errors.
- [ ] **Step 5: Commit** `feat: add quiz results tables and save function`.

### Task 2: Kahoot report parser

**Files:**
- Create: `src/lib/quiz/kahoot-parse.ts`
- Modify: `package.json`, `package-lock.json` (one small .xlsx reading package; prefer `read-excel-file`, fall back to `exceljs` if it cannot read the owner's file; pin an exact version at least two weeks old)
- Test: `tests/quiz-kahoot-parse.test.ts` (tests the pure grid-to-rows function; one test builds a tiny .xlsx in memory to cover the reader)

**Interfaces:**
- Produces:
  - `type KahootRow = { line: number; rank: number | null; player: string; score: number; correct: number; incorrect: number; hint: string }`
  - `type ParseResult = { ok: true; rows: KahootRow[]; skipped: number; sheetName: string } | { ok: false; message: string }`
  - `parseKahootGrid(grid: unknown[][]): ParseResult` (pure: finds the header row in the first 10 rows by case-insensitive match of `player` and `total score` or `score`; `correct`/`incorrect` optional (0 when absent); blank player rows are counted in `skipped`; numbers accept `1,250`, `1250.0`, and numeric strings; a non-numeric score makes that one row skipped with a count, not a failure)
  - `readKahootFile(name: string, bytes: Uint8Array): Promise<ParseResult & { questionCount: number | null }>` (.csv via a small quoted-field splitter; .xlsx via the package; among all sheets keeps those whose header has Player + a score column + Correct + Incorrect, prefers a sheet named "Final Scores", else the first; falls back to a sheet with only Player + score; `questionCount` from the Overview "Played" line or the `Q<n>` columns of the Summary sheet; enforces 5 MB and 5,000 rows)
- [ ] **Step 1: Write the failing tests.** Include a test file fixture built in memory that copies the real file's shape (tabs Overview, Final Scores, Kahoot! Summary in that order; two title rows; headers `Total Score (points)`, `Correct Answers`, `Incorrect Answers`; values `15090.0`; player `'Sidra-KU42 '`) and expects the Final Scores tab, 20 questions and trimmed player text kept as typed in `player` (trimming happens in matching, the raw text stays for display). Also: a grid with a title row above the header still parses; header order shuffled and extra blank columns ignored; `"1,250"`, `1250.0`, `"900"` all give numbers; blank player and non-numeric score rows are skipped and counted; no header row gives `ok: false` with a plain message; header only gives `ok: false` "no players"; a second text column named `Identifier` fills `hint`; 5,001 rows gives `ok: false` "too many rows"; a `.pdf` name gives `ok: false`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Add the package (`npm install --save-exact <pkg>`), nothing else new.
- [ ] **Step 4: Run, expect PASS.** Then run `readKahootFile` once on the owner's real file (kept outside the repo; do not commit it, it holds student names) and confirm 54 players, rank 1 = `Rafi-SCPS194` 15090 / 17 / 3, 20 questions.
- [ ] **Step 5: Commit** `feat: parse the Kahoot report file`.

### Task 3: Player-to-person matching (rejoin rule)

**Files:**
- Create: `src/lib/quiz/match.ts`
- Test: `tests/quiz-match.test.ts`

**Interfaces:**
- Consumes: `normalizePzId` from `src/lib/pzid/format.ts`.
- Produces:
  - `type AliasMap = Map<string, string>` (`alias_norm` to `person_id`)
  - `type Match = { kind: "exact"; personId: string } | { kind: "rejoin"; personId: string; stripped: number } | { kind: "unknown" }`
  - `matchPlayer(raw: string, aliases: AliasMap): Match` (normalise; exact match wins; else strip trailing `n` characters only, never leaving an empty string, and retry once; no other fuzzy step)
- [ ] **Step 1: Write the failing tests** for every example in Review Focus: `Hamid-4821` exact; `Hamid-4821n` and `hamid-4821nn` rejoin with `stripped` 1 and 2; spaces and case ignored; a legacy alias `sana-dr` matches exactly and `sana-drn` strips to it; an exact alias that ends in `n` (for example `kevin-n`... use `jon-ann` stored as an alias) is returned as exact, not stripped; `n`, `nnn` and `""` are unknown; `Hamid-4821x` is unknown; `Hamid-4821 n`, with a space, is a rejoin because spaces are removed first.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** (about 20 lines).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: match Kahoot players to permanent IDs with the rejoin rule`.

### Task 4: Review model (pure)

**Files:**
- Create: `src/lib/quiz/review.ts`
- Test: `tests/quiz-review.test.ts`

**Interfaces:**
- Consumes: `KahootRow` (Task 2), `matchPlayer`, `AliasMap` (Task 3).
- Produces:
  - `type PersonInfo = { personId: string; pzId: string; name: string; mode: "live" | "recorded" | null }` (`null` = known person, not enrolled in this batch)
  - `type ReviewItem` union, one per problem group, each with the source `lines`:
    - `{ type: "duplicate"; personId; rows: KahootRow[]; choice: "merge" | { keep: number } | null }`
    - `{ type: "unknown"; row: KahootRow; suggestions: PersonInfo[]; choice: { personId: string } | "skip" | null }`
    - `{ type: "not_in_batch"; row: KahootRow; person: PersonInfo; choice: "include" | "skip" | null }`
  - `type Review = { items: ReviewItem[]; clean: { row: KahootRow; person: PersonInfo; rejoin: boolean }[]; maxScoreDefault: number }`
  - `buildReview(rows: KahootRow[], aliases: AliasMap, people: Map<string, PersonInfo>, decisions: PriorDecision[]): Review` (applies remembered decisions first; unknown rows get up to 5 suggestions from people in the batch ranked by: same letters-and-digits only form of the ID or alias (so `Sami_FUUAST89`, `Aymen.Juw212`, `ParveshKU213`, `Haris AUP221` all suggest their `-` forms), then ID prefix match, then name token overlap with `player` and `hint`, then small edit distance on the ID; a row with no suggestions has an empty list. Suggestions are never applied automatically. For a duplicate where exactly one row has a score above 0 and the others are all 0, `choice` stays `null` but `suggested` is `{ keep: <that row> }`, shown pre-highlighted so one click confirms)
  - `resolveReview(review: Review): { ok: true; rows: FinalRow[]; summary: { saved: number; merged: number; dropped: number; skipped: number } } | { ok: false; undecided: number }` where `FinalRow = { personId; score; correct; incorrect; player }`; merge adds the three numbers; keep one takes that row; every file row is accounted for in the summary (`saved + merged + dropped + skipped` equals rows in the file minus rows skipped by the parser)
- [ ] **Step 1: Write the failing tests.** Add `bulkSkipZero(review): Review` (sets `"skip"` on every undecided `unknown` item whose score is 0; does not touch duplicates or not-in-batch items) with a test, and one test from the real file: `Sidra-KU42 ` (14759) + `Sidra-KU42` (0) form one duplicate suggesting keep-the-first. Then: two rows for one person (exact + `n`) produce one `duplicate` item; resolving `merge` adds scores, `{ keep: 1 }` keeps the second row; three rows for one person; an unknown row with hint "Hamid Khan" suggests the batch person named Hamid Khan first; a person not in `people` as live/recorded but known to aliases becomes `not_in_batch`; an undecided item makes `resolveReview` return `{ ok: false, undecided: n }`; a remembered `duplicate` decision is pre-applied; a remembered `alias` decision resolves an unknown row without asking; the summary counts add up for a 10-row file with one merge, one drop, one skip.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Keep matching logic in `match.ts`; this file only groups, suggests and resolves.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: quiz review model with duplicates, unknown IDs and suggestions`.

### Task 5: Quiz data layer

**Files:**
- Create: `src/lib/data/quiz-results.ts` (server-only, `createAdminSupabase()`)
- Test: `tests/quiz-results-data.test.ts` (mock `createAdminSupabase` the way `tests/attendance-data.test.ts` does)

**Interfaces:**
- Consumes: `buildReview`, `PersonInfo`, `PriorDecision` (Task 4); `getSessionById`, `markPresent`, `isLiveEnrolled` (plan 2); `normalizePzId`.
- Produces:
  - `loadReviewContext(sessionId: string): Promise<{ aliases: AliasMap; people: Map<string, PersonInfo>; decisions: PriorDecision[]; pageId: string } | null>` (aliases: the whole `pz_id_aliases` table read in pages of 1000 and keyed by `alias_norm`; people: batch people from `landing_registrations` (paid/free, non-test) plus anyone the aliases point to, read in chunks of 200; `mode` is `live` if any live registration)
  - `saveQuizResults(sessionId: string, input: { maxScore: number; fileName: string; rows: FinalRow[]; decisions: PriorDecision[]; adminId: string }): Promise<{ ok: true; saved: number } | { ok: false; message: string }>` (validates in code first: session exists, `maxScore` is a positive integer and at least the highest score, rows at most 5,000, scores and counts are non-negative integers, no repeated `personId`, every `personId` exists in `pz_people` (one chunked read); then `rpc("batch_quiz_save")`; then replaces the session's `batch_quiz_decisions` (delete + insert); alias decisions also insert into `pz_id_aliases` with `source = 'review'` using `onConflict` do nothing, and an alias that already points to a different person is reported in the message, never overwritten)
  - `type LeaderRow = { rank: number; personId: string; pzId: string; name: string; total: number; quizzes: number; avgPct: number | null; projectedTotal: number | null }`
  - `getBatchLeaderboard(pageId: string): Promise<{ rows: LeaderRow[]; sessionCount: number }>` (live students only; `total` = sum of scores; `avgPct` = mean of score/max over the quizzes that have a max; ties share a rank; `projectedTotal` = round(total / quizzes x number of sessions in the batch), null when `quizzes` is 0)
  - `getSessionQuiz(sessionId: string): Promise<{ saved: boolean; maxScore: number | null; fileName: string | null; savedAt: string | null; rows: { personId; pzId; name; mode; score; correct; incorrect }[] }>` (all saved rows including recorded, tagged by mode)
  - `listQuizWithoutCheckin(sessionId: string): Promise<{ personId: string; pzId: string; name: string }[]>` (live enrolled people with a result and no mark)
  - `markPresentFromQuiz(sessionId: string, personId: string, adminId: string): Promise<{ ok: boolean; message?: string }>` (checks `isLiveEnrolled` for the session's batch first because `markPresent` does not, then `markPresent(sessionId, personId, 'admin', adminId)`)
- [ ] **Step 1: Write the failing tests:** `saveQuizResults` refuses (writes nothing, no RPC call) for a negative score, a fractional score, a repeated person, `maxScore` below the top score, an unknown person id, 5,001 rows; a valid save calls the RPC once with the rows and then writes decisions; an alias decision pointing at a person who already owns that alias elsewhere is not overwritten and is reported; leaderboard excludes a recorded person, ranks 300/250/250/100 as 1/2/2/4, and computes `avgPct` and `projectedTotal` for a worked example (scores 80 and 60 of max 100 over 2 of 4 sessions: avg 70, projected 280); `listQuizWithoutCheckin` returns only live people with a result and no mark; `markPresentFromQuiz` refuses a recorded-only person and writes nothing.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Small local paging helper as in `attendance.ts` (do not export it from there).
- [ ] **Step 4: Run, expect PASS**; `tsc --noEmit` 0 errors.
- [ ] **Step 5: Commit** `feat: quiz results data layer and live leaderboard`.

### Task 6: Admin server actions

**Files:**
- Create: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/quiz-actions.ts`
- Test: `tests/quiz-admin-actions.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5; the admin guard pattern in `sessions/actions.ts` (copy it).
- Produces (all require admin, all return plain messages, never raw errors):
  - `uploadKahootReport(pageId: string, sessionId: string, formData: FormData): Promise<{ ok: true; review: Review; skipped: number; fileName: string } | { ok: false; message: string }>` (checks the session belongs to the batch; reads one `file` field; size and type checks before parsing)
  - `saveReview(pageId: string, sessionId: string, input: { maxScore: number; fileName: string; review: Review }): Promise<{ ok: true; saved: number; summary: ...; noCheckin: number } | { ok: false; message: string }>` (the server calls `resolveReview` itself on the review the client sends, so the client cannot send rows that skip the undecided check, then `saveQuizResults`; the decisions to remember are derived from the review choices, not sent separately)
  - `markFromQuiz(pageId: string, sessionId: string, personId: string)`
  - `loadQuizPanel(pageId: string, sessionId: string)` (saved results, no-check-in list, leaderboard)
- [ ] **Step 1: Write the failing tests:** every action refuses a non-admin and writes nothing; an upload with a session from a different batch is refused; a 6 MB file is refused before parsing; `saveReview` with one undecided item is refused and `saveQuizResults` is not called; a decided review is saved and the response carries the summary; `markFromQuiz` for a recorded-only person returns `ok: false`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `export const maxDuration` is not needed; parsing 5,000 rows is fast.
- [ ] **Step 4: Run, expect PASS**; `tsc` and eslint clean on the new files.
- [ ] **Step 5: Commit** `feat: admin actions for quiz upload, review and save`.

### Task 7: Admin quiz screen (Stitch check first)

**Files:**
- Create: `src/components/admin/quiz/QuizPanel.tsx`, `src/components/admin/quiz/QuizReview.tsx`, `src/components/admin/quiz/BatchLeaderboard.tsx`
- Modify: `src/components/admin/attendance/SessionsPanel.tsx` (a "Quiz results" button per session that opens the panel) and `sessions/page.tsx` (a "Ranking" block under the attendance grid)
- Test: `tests/quiz-review-ui.test.tsx` (React Testing Library, like the existing `participant-whatsapp-ui` style)

**Interfaces:**
- Consumes: Task 6 actions.
- [ ] **Step 1: Stitch check (CLAUDE.md rule).** Look through the three listed Stitch projects (and `mcp__stitch__list_projects`) for a quiz results, upload review or leaderboard screen. If one exists, fetch its code from `htmlCode.downloadUrl` and port every section. If none exists, STOP this task and hand the owner a generation prompt (do not run `generate_screen_from_text`; it times out on this account). The prompt must describe: an upload box for a Kahoot file; a review list with three problem types (duplicate: merge or keep one; unknown ID: suggestions to click; not in this batch: include or skip) and a counter of undecided items; a button "Skip all unknown players with 0 points"; a quiz-maximum field with a suggested value; a saved-results table with a "Recorded" tag; a "took quiz, no check-in" list with a "Mark present" button; a batch ranking table with rank, name, ID, total, quizzes, average percent, projected total. Tasks 1 to 6 are mergeable without this task.
- [ ] **Step 2: Write the failing UI tests:** Save is disabled while any item is undecided and enabled when all are decided; the counter shows the number undecided; clicking a suggestion sets that choice; a recorded row shows the "Recorded" tag; the ranking never renders an email.
- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement** from the Stitch screen. Plain words for a non-technical owner (for example "Same student twice: add the scores together, or keep one?").
- [ ] **Step 5: Run, expect PASS**; `tsc` and eslint clean.
- [ ] **Step 6: Commit** `feat: admin quiz upload, review and ranking screen`.

### Task 8: Whole-branch check, owner steps, notes

**Files:**
- Create: `docs/superpowers/plans/2026-10-27-quiz-results-owner-steps.md`
- Modify: `CLAUDE.md` (Project state: plan 3 done or Task 7 waiting on a Stitch screen; next free migration 0091)

- [ ] **Step 1:** `tsc --noEmit` (0 errors), `eslint` on every changed path (clean), `vitest run` on every new test file plus `tests/attendance-*.test.ts`, `tests/pz-*.test.ts`, `tests/session-cron.test.ts` (only the known failing files may fail).
- [ ] **Step 2:** Owner steps doc, plain words, short: paste migration 0090 in the Supabase SQL editor; then try one real session: upload the Kahoot file, fix the problem rows, save, check the ranking. Mention that saving again replaces the session.
- [ ] **Step 3:** Browser check by the controller on the dev server with a made-up report: one rejoin, one duplicate, one unknown, one recorded student; save; see the ranking; upload again and confirm nothing doubled.
- [ ] **Step 4:** Final whole-branch review, then give the owner the PR link (no merge or push to `main` without the owner's yes).
- [ ] **Step 5: Commit** `docs: quiz results owner steps and project state`.
