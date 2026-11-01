# Track Your Progress (Project B) Implementation Plan

**Goal:** a public page `/progress` where a student (1) finds their PZ ID by name ("My ID") and (2) types their PZ ID to see their attendance and quiz results, class by class, grouped Courses / Workshops / Webinars, then by batch. Phone-first.

**Spec:** `docs/superpowers/specs/2026-10-30-id-audience-and-progress-design.md` (Project B + the owner's later changes). **Design:** Stitch project "PZ Academy Platform 2", screen **"Track Your Progress - Mobile (390px)"** (id `8429f965eb1444b99988cf56ebb1e8ab`, owner chose this one: "Design B"). Laptop screen `09e91b4f9ef34630b728409a3abef049`.

**Branch:** `track-progress` (off main). **Owner pastes SQL by hand.** Next free migration: **0094**.

## Global Constraints

- Public, no login. A visitor sees ONE person's data only: first name, PZ ID, batch names, class titles and dates, their own marks and scores. Never a last name, email, phone, or another student's data.
- Any bad input (wrong ID, malformed ID, unknown) gives the SAME "not found" answer. Rate limit lookups per IP.
- Tests use fake people only ("Sample", "Name-0000"). Never commit student data.
- Checks run directly (`&` in the path breaks `npm run`): `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`.
- Never regenerate `database.types.ts`; hand-add entries. No `eslint-disable` for `@typescript-eslint`. CRLF files: use the Edit tool.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push/merge without the owner's yes.
- Owner is not technical: plain words in every owner-facing text.
- **Highly responsive and user-focused (owner's rule):** works from 320px wide up; no sideways scroll at any width; tap targets at least 44px; text at least 16px in inputs (no iOS zoom); results appear without leaving the page; the ID Copy button gives clear feedback; errors say what to do next; keyboard and screen-reader friendly; light and dark mode; respects reduced motion.
- Do NOT copy the Stitch demo-only parts: "Simulate registry responses", "Lookup demo states", "Test wrong ID", the fake bottom menu (Home / Batch ID / Directory / Verify), "Valid 2026", "Standing", "Target benchmark" tiles.

## Rulings (designer's calls; the owner can overrule)

1. **Attendance counts only classes that have started**, and only classes whose audience includes the student: a class with no audience set (NULL) counts for everyone; "full course" students match every class; "Module N" students match classes that include Module N (`matchAudience`, `parseOption` in `src/lib/classes/audience.ts`). A class whose label cannot be read is not counted for that student.
2. **Recorded students:** no attendance line ("Attendance is not tracked for recorded students"); results still listed, no rank.
3. **Rank** = place among LIVE students who have a saved score for that class (ties share a rank). Shown only for live students. No owner visibility switch exists yet, so rank is shown for live students.
4. **Certificate line is NOT in this first build.** Certificates are read from the live certificate database (free daily read limit, and not keyed by PZ ID), so a public lookup could use up the limit. It is added later, behind a cached read. The layout leaves room for it.
5. **Rate limit** is stored in Postgres (shared across server instances), about 30 lookups per 10 minutes per IP hash; if the database call fails the in-memory limiter is used.
6. **Which people are shown:** only enrolled people (paid or free, not test rows) of published or closed batches.

## Tasks

### Task 1: Migration 0094 (rate limit + ID-list switch), owner pastes

**Files:** create `supabase/migrations/0094_progress_lookup.sql`, `docs/superpowers/plans/2026-11-01-track-your-progress-owner-steps.md`; modify `src/lib/supabase/database.types.ts` (hand-add).

- Table `public_lookup_hits (id bigserial pk, key text not null, hit_at timestamptz not null default now())` with index on `(key, hit_at)`; RLS on, zero policies.
- Function `public_lookup_allow(p_key text, p_limit int, p_window_secs int) returns boolean`: deletes this key's hits older than the window, counts the rest, returns false if at the limit, else inserts a hit and returns true. `security definer`, `set search_path = public, pg_temp`, execute only for `service_role`.
- Column `landing_pages.ids_list_public boolean not null default false` (the per-batch "show the full ID list" switch, used by the ID-list link; added now so one paste covers both).
- Safe to run twice. Owner steps file gives the SQL to paste plus a check query.

### Task 2: Rate limiter

**Files:** create `src/lib/pzid/lookup-limit.ts`, `tests/lookup-limit.test.ts`.

- `allowLookup(ip)`: hashes the IP (sha256 with a fixed prefix), calls `public_lookup_allow` through the admin client (limit 30, window 600 s), returns its answer; on any error falls back to `allowRequest` from `src/lib/pzid/rate-limit.ts`.
- Tests: allowed / denied from the RPC; error falls back; the raw IP never goes to the database.

### Task 3: Progress builder (pure) and data loader

**Files:** create `src/lib/progress/build.ts`, `src/lib/data/progress.ts`, `tests/progress-build.test.ts`, `tests/progress-data.test.ts`.

- `build.ts` (no server imports): input is plain data (person, batches with kind and attendance minimum, sessions, audiences, marks, quiz results, option label per batch). Output:
  `{ firstName, pzId, groups: { kind: "course"|"workshop"|"webinar", batches: { title, slug, latest: boolean, mode: "live"|"recorded", attendance: { attended, held, pct, meetsMin, minPct, rows: { number, title, startsAt, state: "present"|"absent"|"upcoming", how: "check-in"|"admin"|null }[] } | null, results: { total, rows: { number, title, startsAt, score, max, rank: number|null, of: number|null }[] } }[] }[] }`.
  Groups hidden when empty; batches newest first by latest class; the batch with the most recent class has `latest: true`.
- `progress.ts` (`server-only`): `getProgressByPzId(raw)`: normalises the typed ID (`normalizePzId`), finds the person by `pz_people.pz_id` or `pz_id_aliases`, loads their enrolled registrations (paid/free, non-test, published or closed pages), the pages' sessions and marks and quiz results (all chunked at 200 ids and paged at 1000 rows), then calls the builder. Returns `null` for anything not found.
- Tests cover: module filtering, NULL audience counts for all, upcoming classes, recorded student (no attendance, no rank), ties share a rank, grouping by `kind`, hidden empty groups, first name only (never the surname), test rows excluded, unknown ID returns null.

### Task 4: My ID search (public)

**Files:** modify `src/lib/data/pz-people.ts` (add `findIdsByName`), tests in `tests/pz-people-search.test.ts`.

- `findIdsByName(query)`: at least 3 letters (`*` stripped, LIKE wildcards escaped); searches enrolled people of published or closed batches across ALL batches; returns at most 5 rows `{ firstName, pzId, batchTitle }`. No email, no last name.
- Tests: too short, wildcards literal, only enrolled people, never a last name or email in the result, cap of 5.

### Task 5: Server actions and route

**Files:** create `src/app/progress/page.tsx`, `src/app/progress/actions.ts`, `tests/progress-actions.test.ts`. Check `src/middleware.ts` so `/progress` is public like `/ids`.

- `findMyIdByName(query)` and `getMyProgress(rawId)`: both check `allowLookup` first (`rate_limited`), then return only a tagged union; every unknown or malformed input gives `{ status: "not_found" }`; unexpected errors give one generic message.
- Page is server-rendered shell with metadata (title, description), the client component below, no data in the HTML.

### Task 6: Screens (phone-first), Design B

**Files:** create `src/components/progress/` (`ProgressPage.tsx`, `MyIdSection.tsx`, `ProgressSection.tsx`, `BatchCard.tsx`, `SessionRow.tsx`), `tests/progress-ui.test.tsx`.

- Port Design B section by section: header block, "1 Find My ID" (name box, button, result card with Copy, multi-match list, not-found, rate-limited, too-short states), "2 My Progress Tracker" (ID box, button, errors), greeting, Attendance / Quiz Results tabs, category headings, collapsible batch cards (latest open), header lines, session rows with Present (check-in / admin), Absent, Upcoming tags, recorded note, privacy line.
- Copying the ID fills the ID box in step 2 (as the design says "Tap Copy to insert").
- Tests: each state renders; copy button feedback; tabs switch; collapse works; no email or surname text is ever rendered; 320px layout has no fixed widths (class check).
- Phone-width browser check on the live site before the owner merges (320, 390, 768).

### Task 7: Final whole-branch review, owner steps, memory

- One review of the whole branch against Global Constraints (privacy first: try to extract another person's data, a surname, an email).
- Update `CLAUDE.md` project state and the memory files.

## Not in this plan (next plan, needs its own Stitch screen)

**Batch ID list link:** `/ids/<batch>` gets filter chips (All, Full course, Module 1-4), copy buttons per row, and the full list only when `landing_pages.ids_list_public` is on (switch on the admin batch page, with a "Share ID list link" button). The column ships in 0094; the screens are not designed yet, so a Stitch prompt is handed over first.

## Review Focus

- A visitor must never learn anything about another person: no surname, email, phone, no list of IDs from the progress or My ID answers beyond the 5-row first-name search.
- Same "not found" answer for every bad input; no timing or message difference between "no such ID" and "bad format".
- Attendance counts must match the admin grid (`getBatchGrid`) for the same student.
