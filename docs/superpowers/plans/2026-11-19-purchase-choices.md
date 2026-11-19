# Purchase choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop paid people with an unrecorded purchase choice from getting the whole course, and give the admin a "Match purchase choices" card that records each label's choice once, for every course and batch.

**Architecture:** A pure label matcher suggests page options from a registration's text label. The access rules gain a `hold` action so a Paid person with a label but no recorded choice is never enrolled by guess. Two admin routes list the unmatched labels and apply a choice to all rows with that label (then queue the existing no-email enrollment sync). The sheet mirror records the choice on insert when the match is certain. A card on the Portal access screen shows it all.

**Tech Stack:** Next.js 14.2.5 App Router, Supabase service role (`createAdminSupabase()`), zod, vitest + Testing Library, Radix dialog (`@/components/ui/dialog`).

**Spec:** `docs/superpowers/specs/2026-11-19-purchase-choices-design.md`. Stitch (project 13117286791417011091): the "Match purchase choices" phone and PC screens (generated 2026-11-19; list screens by title). Use them for LAYOUT only; do not copy invented cards, statistics or sample text beyond what the spec names.

## Global Constraints

- Branch `purchase-choices` (from `portal-access`). Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage files by path only. Never push.
- No migration: `landing_registrations.option_keys` and `option_label` already exist. Never regenerate `src/lib/supabase/database.types.ts`.
- Nobody is ever emailed by matching, by the hold, or by the queued sync (use `enqueueEnrollmentSync` + the no-email background call exactly as `src/lib/landing/registration/link-student.ts` does).
- A person must never get MORE access than they bought because of this work; existing enrollments are never reduced or reverted.
- Rows with an empty label AND empty keys on a page keep today's behaviour (whole course). App-made registrations (keys recorded) are unchanged.
- Wording: short plain words, calm, no exclamation marks, no sales words. Phone-first at 390px, PC at 1440px, buttons at least 44px high on phone (`max-md:min-h-11`), no sideways scroll.
- Colours: backgrounds and borders use `pz-primary` / `pz-surface-container-*` / `pz-solid-*`; `pz-deep`, `pz-mid`, `pz-danger` are text only. No `eslint-disable` for `@typescript-eslint`. A client component must not export plain values used by server pages.
- Route gate for the new routes: `requireAdmin("enrollments")`. Never echo database messages to the client (use `portalErrorResponse` from `src/lib/data/portal-errors.ts`).
- Tests first, show RED then GREEN. Tools directly: `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/eslint/bin/eslint.js <paths>`. Source files may use CRLF: match each file.

## Review Focus

- A held person (Paid, label present, keys empty) never gets an enrollment, whether they are an individual, a group lead or a member; free and test rows are unchanged. (Task 2)
- Applying the same label twice updates 0 rows the second time and never overwrites keys already set. (Task 3)
- A key that is not one of the page's options is rejected; an empty key list is rejected; only rows of THIS page with that exact label and empty keys change. (Task 3)
- The matcher is only "confident" when every token maps to exactly one option; "Modules: M2, M3" gives both; unknown text gives no keys and not confident; the label with Live/Recorded and tier text in either dash style parses. (Task 1)
- The mirror never changes an existing row and records keys only on a confident match. (Task 4)
- Pressing Apply on a page with no options is impossible in the UI and rejected by the route. (Tasks 3, 5)

---

### Task 1: Label matcher

**Files:**
- Create: `src/lib/landing/registration/match-choice.ts`
- Test: `tests/match-choice.test.ts`

**Interfaces:**
- Produces: `type ChoiceOption = { key: string; label: string; kind: "bundle" | "module"; moduleIds: string[] }`; `suggestOptions(label: string, options: readonly ChoiceOption[]): { keys: string[]; confident: boolean }`; `splitLabel(label: string): { mode: "live" | "recorded" | null; optionText: string }` (the middle part between the mode and the tier text).

- [ ] **Step 1: Write the failing tests** (`tests/match-choice.test.ts`). Options fixture: `full` (Full Course, bundle), `m1` "Module 1", `m2` "Module 2", `m3` "Module 3", `m4` "Module 4" (kind module). Tests: `matches the old sheet full-course label to the bundle option` ("Live — Full Course – Individual" gives keys ["full"], confident); `matches Modules: M3 to Module 3` ("Recorded — Modules: M3 – Individual" gives ["m3"], confident); `matches several modules` ("Live — Modules: M2, M3 – Individual" gives ["m2","m3"], confident); `reads the app label format` ("Live - Module 2 - Individual" gives ["m2"]); `group labels still match` ("Live — Full Course – Group of 3" gives ["full"]); `an unknown option text is not confident and gives no keys` ("Live — Special bundle – Individual"); `a token matching two options is not confident` (two options both labelled with 3); `partial match returns the matched keys but not confident` ("Modules: M2, M9"); `no options gives no keys`; `splitLabel returns mode live, recorded or null`.
- [ ] **Step 2: Run, expect FAIL** (module missing).
- [ ] **Step 3: Implement** in `match-choice.ts`. Lowercase and normalise dash styles (hyphen, en dash, em dash) and spacing; strip the mode word and the tier text (Individual, Group of N, Group (N or more)); the remainder is the option text. Tokens: "full course" or "full" maps to the single `bundle` option; `m<n>`, `module <n>`, `modules: m2, m3` map to module options whose label or key contains the same standalone number; split on commas, "+" and "and". Confident only when there is at least one token and every token maps to exactly one option.
- [ ] **Step 4: Run, expect PASS.** Also `tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(choices): label matcher for purchase options`.

---

### Task 2: Safety hold

**Files:**
- Modify: `src/lib/landing/registration/access-rules.ts`, `src/lib/data/landing-enrollment.ts`, `src/lib/data/landing-batch.ts`, `src/components/admin/registrations/BatchAccessPanel.tsx`
- Test: `tests/access-rules-hold.test.ts` (new), extend `tests/landing-batch.test.ts` and `tests/batch-access-panel.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `AccessInput.hasLabelWithoutChoice: boolean`; `DesiredEnrollment.action` gains `"hold"` (union `"skip" | "grant" | "revert" | "hold"`); `SyncOutcome` gains `"needs-choice"`; `BatchResult.needsChoice: number`; `LinkResult.needsChoice: number`.

- [ ] **Step 1: Write the failing tests.** `desiredEnrollment holds a Paid row that has a label but no recorded choice` (status paid, hasLabelWithoutChoice true gives action "hold", portalOpen false); `a Paid row with a recorded choice is granted as before`; `a Paid row with no label and no choice is granted as before` (hasLabelWithoutChoice false); `free, test and no-course rows still skip even when hasLabelWithoutChoice is true`; `pending, reserved and underpaid rows still revert even when hasLabelWithoutChoice is true` (existing enrollments are never held back from reverting). Sync: `syncEnrollmentForRegistration returns needs-choice and makes no enrollment, open-module or lesson_progress write for a held row` (mock `createAdminSupabase` like the existing landing-enrollment tests; assert no insert/upsert/update call); `a group member is held when the lead's label has no choice` (members use the lead's choice, see `resolveAccess`). Batch: `finishBatch counts held people in needsChoice and does not email them`; `emailPortalLinks counts needsChoice`. UI: `BatchAccessPanel shows "N people have no recorded choice yet" when a batch or link result has needsChoice > 0`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** In `resolveAccess` compute `hasLabelWithoutChoice = lead.optionKeys.length === 0 && lead.optionLabel.trim() !== ""` (the registration record already carries `optionLabel`; check `mapRecord`) and pass it into `desiredEnrollment`. In `desiredEnrollment`, for `status === "paid"` (after the skip rules) return `{ action: "hold", status: "pending", portalOpen: false, ...base }` when `hasLabelWithoutChoice`. In `syncEnrollmentForRegistration` return `"needs-choice"` for `hold` before any write. In `landing-batch.ts` count held rows (`desired.action === "hold"`) into `needsChoice` for both results and keep them out of the opened/emailed paths. Surface the count in `BatchAccessPanel` as a calm line next to the existing result sentences. Update every other `desiredEnrollment` caller and any test fixture that builds `AccessInput` so `tsc` stays at 0.
- [ ] **Step 4: Run all four test files plus `tests/landing-enrollment*.test.ts` and anything Grep finds that imports `desiredEnrollment`; expect PASS. `tsc` clean, eslint clean on touched files.**
- [ ] **Step 5: Commit** `feat(choices): hold paid people whose purchase choice is not recorded`.

---

### Task 3: List and apply choices (data helpers and routes)

**Files:**
- Create: `src/lib/data/portal-choices.ts`, `src/lib/validations/landing-choices.ts`, `src/app/api/admin/landing/portal/choices/route.ts` (GET and POST)
- Test: `tests/portal-choices-data.test.ts`, `tests/portal-choices-routes.test.ts` (style: `tests/portals-data.test.ts`, `tests/portal-routes.test.ts`)

**Interfaces:**
- Consumes: `suggestOptions`, `ChoiceOption` (Task 1); `PortalError`, `portalErrorResponse` (`src/lib/data/portal-errors.ts`); `enqueueEnrollmentSync`, `runJobsFor`, `runJobsDirect` (`src/lib/data/landing-jobs.ts`) and `runInBackground` (`src/lib/landing/registration/background.ts`) used exactly as in `link-student.ts`.
- Produces: `type ChoiceGroup = { label: string; mode: "live" | "recorded" | null; count: number; paidCount: number; suggestedKeys: string[]; confident: boolean }`; `type ChoiceOverview = { hasOptions: boolean; options: ChoiceOption[]; groups: ChoiceGroup[] }`; `listChoiceGroups(pageId: string): Promise<ChoiceOverview>` (404 PortalError for an unknown page); `applyChoice(p: { pageId: string; label: string; optionKeys: string[] }): Promise<{ updated: number; queued: number }>`. Routes: `GET .../portal/choices?pageId` returns `ChoiceOverview`; `POST` body `{ pageId, label, optionKeys }` returns `{ updated, queued }`; 400 `{ error: "Invalid input" }`, 409 calm text for refusals.

- [ ] **Step 1: Write the failing tests.** Data: `listChoiceGroups groups unmatched labels by label and mode with counts and paid counts`; `rows that already have option_keys are not listed`; `rows with an empty label are not listed`; `suggestions come from suggestOptions against the page options`; `hasOptions is false when the page has no options`; `unknown page gives a 404 PortalError`; `applyChoice sets option_keys only on rows of this page with that exact label and empty keys`; `applyChoice rejects a key that is not one of the page's options (409 PortalError) and writes nothing`; `applyChoice rejects an empty key list`; `applyChoice rejects when the page has no options`; `a second applyChoice updates 0 and queues 0`; `applyChoice queues enrollment_sync only for Paid rows that were updated` (assert the queue helper is called with those ids and no email helper exists in the call chain); `a database error is thrown, not swallowed`. Routes: `each method returns 401/403 for a non-admin and calls requireAdmin with "enrollments"` ; `GET returns 400 without a uuid pageId`; `POST returns 400 for a missing label or empty optionKeys`; `POST returns 500 with the plain message on a thrown error` (log carries detail, response does not).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the schemas (`pageId` uuid; `label` trimmed 1 to 200; `optionKeys` array of 1 to 12 trimmed strings of at most 32 chars), the helpers and the route with the signatures above. Group by `(option_label, mode)`; page options come from the page config the same way `landing-enrollment.ts` reads them (`getRegistrablePageById`, or read `published`/`draft` registration options: follow what the mirror and enrollment code already use). The update filters `page_id`, `option_label = label`, and `option_keys = '{}'` (empty). The queue call must not run when `updated` is 0.
- [ ] **Step 4: Run tests, tsc, eslint, expect clean.**
- [ ] **Step 5: Commit** `feat(choices): list and apply purchase choices`.

---

### Task 4: Mirror records the choice on a certain match

**Files:**
- Modify: `src/lib/data/landing-mirror.ts` (`doInsert`)
- Test: extend `tests/landing-mirror*.test.ts` (Grep for the existing mirror test file and follow its mock style)

**Interfaces:**
- Consumes: `suggestOptions` (Task 1) and the page's options.
- Produces: new mirrored rows carry `option_keys` when the label matches confidently; otherwise `option_keys` stays empty.

- [ ] **Step 1: Write the failing tests.** `an inserted row gets option_keys from a confident label match`; `an inserted row with an unmatched label keeps empty option_keys`; `a page with no options keeps empty option_keys`; `existing rows are never changed by the mirror`; `the page options are loaded once per run, not per row`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Load the page options once at the start of the run; in the `build` function used by `doInsert` set `option_keys: suggestOptions(row.optionLabel, options).confident ? keys : []`. Preview runs must not write.
- [ ] **Step 4: Run the mirror tests, tsc, eslint, expect clean.**
- [ ] **Step 5: Commit** `feat(choices): sheet mirror records purchase choice on a certain match`.

---

### Task 5: Match purchase choices card

**Files:**
- Create: `src/components/admin/registrations/PurchaseChoicesCard.tsx`, `src/components/admin/registrations/PurchaseChoiceConfirmDialog.tsx`
- Modify: `src/components/admin/registrations/PortalAccessScreen.tsx` (render the card FIRST, above the other cards, only when the card has something to show)
- Test: `tests/purchase-choices-card.test.tsx`; extend `tests/portal-access-screen.test.tsx`

**Interfaces:**
- Consumes: `GET`/`POST .../portal/choices` (Task 3) via the existing `callPortal` helper in `src/components/admin/registrations/portal-client.ts`; the `ChoiceOverview` and `ChoiceGroup` types are imported from `src/lib/data/portal-choices.ts` as types only (no server code in the client bundle: if that file is `server-only`, put the shared types in a small non-server file such as `src/lib/landing/registration/choice-types.ts` and import them from both).
- Produces: `PurchaseChoicesCard({ pageId, registrationSetupHref }: { pageId: string; registrationSetupHref: string })`.

- [ ] **Step 1: Write the failing tests.** `shows nothing when there are no unmatched labels`; `shows the amber notice with the total held ("158 paid people have no recorded choice...")` (sum of `count` over groups; use `paidCount` for the wording about paid people); `renders one row per label with the label, count chip and mode chip`; `pre-selects the suggested options and shows a Suggested chip only when confident`; `Apply is disabled until at least one option is chosen`; `Apply opens the confirm dialog with the count and the text "Nobody is emailed."`; `Cancel posts nothing`; `Confirm posts { pageId, label, optionKeys } to /api/admin/landing/portal/choices and then shows the row as Saved with the people count`; `a 409 message from the server is shown calmly`; `when hasOptions is false it shows "Set up purchase options on the registration page first" with the link and no Apply buttons`; `Escape closes the confirm dialog and focus returns to the Apply button` (pass a `returnFocusRef`/onCloseAutoFocus like the existing Portal dialogs); `a stale list response cannot overwrite a newer one` (ticket guard like PortalAccessScreen's preview loader); `Apply and Confirm cannot be pressed twice while busy`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the card and dialog per the Stitch phone and PC screens: phone is a stack of rounded row cards, PC is a table-like row layout inside one card; multi-select as chips with a native `<select multiple>` or checkboxes (accessible, 44px targets); one lime main button per row. Fetch the overview on mount; after a successful apply re-fetch. Keep the Portal access top-level copy untouched.
- [ ] **Step 4: Run both test files and `tests/client-boundary-values.test.ts`, tsc, eslint, expect clean.**
- [ ] **Step 5: Commit** `feat(choices): Match purchase choices card on Portal access`.

---

### Task 6: Owner steps, full checks, browser check

**Files:**
- Create: `docs/superpowers/plans/2026-11-19-purchase-choices-owner-steps.md` (short plain words, one step at a time: where the card is, how to read a row, Apply once per label, what the hold means, what happens to people without an account, a read-only SQL count of held people for a page, and a read-only SQL count of enrollments on this page's course that were created while their `option_keys` were empty, so the owner can see whether any whole-course access was given wrongly earlier)
- Modify: `docs/superpowers/plans/2026-11-19-portal-access-owner-steps.md` (add one calm line near the "Move students" step: people with no recorded choice are held and need matching first; link to the new steps file)

- [ ] **Step 1:** Run `tsc --noEmit` (0), focused vitest for every test file added or changed on this branch (`git diff --name-only a10d3663..HEAD -- tests`), eslint on all changed source files, then `node node_modules/next/dist/bin/next build` once with no dev server up.
- [ ] **Step 2:** Strict-UTF-8 scan of changed files (`python -I`). Then browser check on localhost only with the admin test login from the memory file: open a campaign's `/portal` page at 390, 1280 and 1440; with no unmatched labels the card is hidden; to see the card use the page whose registrations have labels but no keys (the card reads the real data; do NOT press Apply, Confirm or any other write button; no emails). Report exactly what shows. Stop the dev server by killing only the port-3000 process.
- [ ] **Step 3:** Commit the two docs (stage by path). Final whole-branch review (opus) follows.
