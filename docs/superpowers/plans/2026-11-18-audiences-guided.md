# Audiences Guided Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Audiences page into a guided three-step page (Who, Check, Download) that shows a preview and the file contents before anything is downloaded.

**Architecture:** Keep the existing filters, count route, saved audiences, Bring in and export route. Add one read-only preview route and two step components; AudiencesPanel gains a `step` state and a progress strip.

**Tech Stack:** Next.js 14.2.5, React client components, Tailwind pz tokens, vitest + testing-library, zod.

**Spec:** `docs/superpowers/specs/2026-11-18-audiences-guided-design.md` (read it first). Stitch: project 13117286791417011091, "Audiences - Sales Hub (Desktop 1440px)" and "(Mobile 390px)" (step 1 only; steps 2 and 3 follow its card pattern).

## Global Constraints

- Write tests first. Run only focused tests: `node node_modules/vitest/vitest.mjs run tests/<file>`; `npm run` and `npx` are broken (the `&` in the path).
- Checks before each commit: `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/eslint/bin/eslint.js <changed paths>`.
- Preserve CRLF line endings. No `eslint-disable` for `@typescript-eslint`. Never touch `src/lib/supabase/database.types.ts`. No migration.
- Colours: backgrounds and borders use `pz-solid-*` or `landing-*` tokens; `pz-deep`, `pz-mid`, `pz-danger` are text only.
- Calm plain words, no exclamation marks, no jargon. Do not copy invented Stitch content (Dr. Clara Vance, HIPAA badge, 3,482 learners, Stripe, Lookalike tips).
- Never show a full email or phone on screen. Never log people's data.
- Dialogs and menus: Escape closes, focus returns to the opener.
- Never commit student data. Stage files by path only. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Leave untracked `docs/lead-capture-go-live-guide.md` and the two 2026-11-02 plan files alone.
- Branch: `audiences-guided`. Do not push.

## Review Focus

- Person with no email (phone only) or no name: preview shows a blank-safe row, never "undefined" or a crash.
- Email without `@` or very short local part: masked without throwing.
- Zero people in file: step 2 and 3 say "Nobody to download for these choices" and the download buttons stay off.
- Count changes while the owner is on step 2 or 3 (Back, change a tick): the old preview is dropped, never shown for new choices.
- Preview request fails or times out: calm error with Try again; Next stays off.
- `tooLarge` or `needsUpdate` from the server: step 2 explains it and blocks Next.

---

### Task 1: Preview helpers

**Files:**
- Create: `src/lib/crm/audience-preview.ts`
- Test: `tests/audience-guided-preview.test.ts`

**Interfaces:**
- Consumes: `AudienceContact`, `buildPlainRows`, `metaCsvFilename` from `@/lib/crm/meta-audience`; `describeAudienceFilter`, `AudienceFilter` from `@/lib/crm/audience-filter`.
- Produces:
  - `maskEmail(email: string | null): string`
  - `type PreviewPerson = { name: string; email: string; country: string }`
  - `type AudiencePreview = { people: PreviewPerson[]; inFile: number; leftOut: { noContact: number; doNotContact: number }; columns: string[]; fileName: string }`
  - `buildAudiencePreview(contacts: AudienceContact[], filter: AudienceFilter, now: Date): AudiencePreview`

- [ ] **Step 1: Write failing tests** in `tests/audience-guided-preview.test.ts`: `maskEmail("anna@gmail.com") === "a***@gmail.com"`; `maskEmail(null) === ""`; `maskEmail("x@y.com") === "x***@y.com"`; `maskEmail("nodomain") === "n***"`; `maskEmail("") === ""`. `buildAudiencePreview` with 12 usable contacts returns `people.length === 10`, `inFile === 12`; a do-not-contact contact is counted in `leftOut.doNotContact` and absent from `people`; a contact with no email and no phone counts in `leftOut.noContact`; `columns` equals `["Email","Phone","First name","Last name","Country"]`; `fileName` equals `metaCsvFilename(describeAudienceFilter(filter), now, "hashed")`; a phone-only contact gives `email: ""` and a non-empty `name`; no person object contains a full email (assert `JSON.stringify(preview.people)` has none of the input emails).
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/audience-guided-preview.test.ts`; expect FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/crm/audience-preview.ts` with the signatures above. People come from `buildPlainRows(contacts).rows` (same dedupe and privacy rules as the file), first 10; name is `fn + " " + ln` trimmed; country as given. `leftOut` comes from the same `buildPlainRows` result. Masking: first character + `***` + `@domain`; no `@` gives first character + `***`.
- [ ] **Step 4: Run test, expect PASS.** Run tsc and eslint on both files.
- [ ] **Step 5: Commit** `feat(audiences): preview helpers`.

### Task 2: Preview route

**Files:**
- Create: `src/app/api/admin/crm/audiences/preview/route.ts`
- Test: `tests/audience-guided-preview-route.test.ts` (copy the mocking style of `tests/audience-routes.test.ts`)

**Interfaces:**
- Consumes: `buildAudiencePreview` (Task 1), `parseAudienceFilter`, `loadAudienceFile` from `@/lib/data/audience-query`, `requireAdmin(["sales_hub","crm"])`.
- Produces: `POST /api/admin/crm/audiences/preview` with the filter as the JSON body. 200 returns an `AudiencePreview` (Task 1). Error shapes match the export route: `{ error: string }` with status 400 (bad filter, all courses gone), 401/403 from the guard, 409 `needsUpdate`, 413 `tooLarge`, 500 generic.

- [ ] **Step 1: Write failing tests:** not-admin returns the guard response and never calls `loadAudienceFile`; bad body returns 400 `{error}`; good body returns 200 with `people` of at most 10 and the masked email; `tooLarge` gives 413; `needsUpdate` gives 409; `allCoursesGone` gives 400 and never widens to everyone; thrown error gives 500 with the generic text `"Something went wrong. Please try again."` and the response body contains no email.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the route, `export const maxDuration = 60`, mirroring the export route's guard, parsing and error texts (reuse the same wording), then `buildAudiencePreview(file.contacts, filter, new Date())`. Header `Cache-Control: no-store`.
- [ ] **Step 4: Run test, tsc, eslint; expect PASS.**
- [ ] **Step 5: Commit** `feat(audiences): preview route`.

### Task 3: Step shell, progress strip, plain sentence

**Files:**
- Create: `src/components/admin/crm/AudienceStepper.tsx` (progress strip), `src/components/admin/crm/AudienceSummary.tsx` (the "You are choosing" card with the count)
- Modify: `src/components/admin/crm/AudiencesPanel.tsx`, `src/components/admin/crm/AudienceResultCard.tsx` (becomes the summary/next card; keep the number, the left-out lines and the stale-number note; remove the download buttons from it)
- Test: `tests/audience-guided-steps.test.tsx`; update `tests/audiences-panel.test.tsx` and `tests/audience-picker-ui.test.tsx` where they assert the old single-page layout

**Interfaces:**
- Consumes: `describeAudienceFilter`, existing `count` state and `runCount` in AudiencesPanel.
- Produces: `AudienceStepper({ step: 1 | 2 | 3, onGo: (s: 1 | 2 | 3) => void, maxStep: 1 | 2 | 3 })`, `AudienceSummary({ filter, count, currentKey, onNext, onReset, nextLabel })`. AudiencesPanel gets `step` state (default 1); `maxStep` is 1 until a count for the current key is done, then 3.

- [ ] **Step 1: Write failing tests** in `tests/audience-guided-steps.test.tsx`: the strip shows "1 Who", "2 Check", "3 Download" with `aria-current="step"` on the current one; steps after `maxStep` are disabled; the summary reads "You are choosing: " followed by the `describeAudienceFilter` lines and the people count; with default filter it reads "Everyone who registered or bought"; Next is disabled while counting and enabled after a done count with `inFile > 0`; changing a filter while on step 2 returns to step 1 and clears `maxStep`; the old download links are gone from step 1.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the stepper and summary; wire `step` into AudiencesPanel: step 1 renders the existing `AudienceFilters` cards plus the summary (right column on PC, sticky bar on phone, reusing the current sticky classes). Keep Saved audiences, Bring in, Reset filters. Loading a saved audience calls `setStep(2)` after its count runs. Style per the Stitch step-1 screen: rounded white cards, green primary button, progress strip as one card.
- [ ] **Step 4: Update the two older test files** so their assertions follow the new layout (same behaviour, new places). Run all three test files, tsc, eslint; expect PASS.
- [ ] **Step 5: Commit** `feat(audiences): three-step shell with progress strip and plain summary`.

### Task 4: Check step and Download step

**Files:**
- Create: `src/components/admin/crm/AudienceCheckStep.tsx`, `src/components/admin/crm/AudienceDownloadStep.tsx`
- Modify: `src/components/admin/crm/AudiencesPanel.tsx`
- Test: `tests/audience-guided-check-download.test.tsx`

**Interfaces:**
- Consumes: `AudiencePreview` (Task 1), `POST /api/admin/crm/audiences/preview` (Task 2), `encodeAudienceFilter`, `EXPORT_URL = "/api/admin/crm/audiences/export"` links as the old result card built them (`?f=<key>` and `&format=plain`; keep the existing `aria-describedby` privacy note on the plain link).
- Produces: `AudienceCheckStep({ filter, filterKey, onBack, onNext })` fetches the preview itself, keyed by `filterKey`, aborting older requests; `AudienceDownloadStep({ filter, filterKey, preview, onBack })`. AudiencesPanel owns the fetched `preview` so Step 3 reuses it.

- [ ] **Step 1: Write failing tests:** step 2 shows "A few people from this list" with up to 10 rows (name, masked email, country); shows "Only people with an email or phone can go to Meta: {inFile} of {total}" style line using `inFile` and the left-out lines ("{n} cannot be used: no email or phone", "{n} asked not to be contacted"); while loading shows "Loading the list…"; on a failed request shows the error text and a Try again button, Next disabled; with `inFile === 0` shows "Nobody to download for these choices." and Next disabled; `tooLarge`/409/413 error text shown and Next disabled; step 3 shows file name, "{inFile} people", the five column names, the left-out lines, then "Download for Meta" (href contains `/audiences/export?f=` and has `download`) and "Download plain version" (href has `format=plain`) with the privacy note "Plain file: keep it private."; both buttons are inert when `inFile === 0`; a preview fetched for an old key is never shown after the key changes.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** both components in the Stitch card style, and render them for `step === 2` and `step === 3` in AudiencesPanel with Back and Next buttons (Back returns to the previous step and keeps choices). The panel keeps its 400 ms count debounce; the preview is fetched only when step 2 opens.
- [ ] **Step 4: Run all audience tests touched so far, tsc, eslint; expect PASS.**
- [ ] **Step 5: Commit** `feat(audiences): check and download steps with preview before download`.

### Task 5: Finish, phone check, build

**Files:**
- Modify: `docs/superpowers/plans/2026-11-18-audiences-guided-owner-steps.md` (create; owner steps: none to paste, how to look, what to check)
- Test: run the audience test group

- [ ] **Step 1:** Run `node node_modules/vitest/vitest.mjs run tests/audience-guided-preview.test.ts tests/audience-guided-preview-route.test.ts tests/audience-guided-steps.test.tsx tests/audience-guided-check-download.test.tsx tests/audiences-panel.test.tsx tests/audience-picker-ui.test.tsx tests/audience-routes.test.ts tests/audience-query.test.ts tests/meta-audience.test.ts` and `tests/client-boundary-values.test.ts`; expect PASS (report any known unrelated failure by name).
- [ ] **Step 2:** `node node_modules/typescript/bin/tsc --noEmit` (0 errors) and eslint on all changed paths.
- [ ] **Step 3:** Start no dev server if one is running; otherwise run `node node_modules/next/dist/bin/next build` once; expect success.
- [ ] **Step 4:** In a browser at 390px and 1440px, signed in as the test admin, walk steps 1 to 3 without pressing a download (read-only); confirm no horizontal scroll, the sticky bar clears the bottom nav, and no full email shows. Report what was seen.
- [ ] **Step 5:** Write the owner steps file and commit `docs(audiences): owner steps for the guided page`.
