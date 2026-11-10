# Landing dates in one place Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner types each module's dates once (Page settings, Dates box); the hero, Schedule, curriculum text and every country or module link follow, the Countdown follows the Early Bird end by a switch, and the AI import file carries the dates.

**Architecture:** Dates are stored as plain calendar dates (`YYYY-MM-DD`) on each module (`startsOn`, `endsOn`) and, for pages with no modules, in settings (`eventStartsOn`, `eventEndsOn`). Text boxes may hold markers (`{dates}`, `{dates:module-2}`, `{weekdays}`, `{weekdays:module-2}`) that one pure function, `applyAutoDates`, replaces; it runs at the end of `resolveVariant` and, for the main page, at the three places that show main content. The same function copies the Early Bird end into the countdown when the switch is on.

**Tech Stack:** Next.js 14, TypeScript, zod, vitest. Edit files with Read then Edit (CRLF repo). Run checks directly (`npm run` is broken by `&` in the path): `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`.

**Spec:** `docs/superpowers/specs/2026-11-10-landing-dates-in-one-place-design.md`

## Global Constraints

- Dates are `YYYY-MM-DD` strings with no clock time; compute weekdays and ranges in UTC so no day shifts.
- Range formats (en dash with spaces, English short months): same month `27 – 29 Nov 2026`; across months `30 Nov – 2 Dec 2026`; across years `30 Dec 2026 – 2 Jan 2027`; single day `27 Nov 2026`.
- Weekdays are listed Monday to Sunday: one `Fri`, two `Fri & Sat`, three or more `Fri, Sat & Sun`; all seven weekdays gives an empty string.
- Whole-course weekdays are the union of the weekdays inside each module's own start-to-end range.
- A module's days limit stays 0 to 60; any range up to 60 days is allowed; end date is never before the start date.
- Existing pages never change by themselves: typed text stays, and `countdownFollowsEarlyBird` is OFF when absent. New pages (`emptyContent`) and new imports set it to `true`.
- No `@typescript-eslint` disables. Never regenerate `database.types.ts`. Content is stored as JSON: no migration.
- Colours: backgrounds and borders use `pz-solid-*` or `landing-*` tokens (`pz-deep`, `pz-mid`, `pz-danger` are text only). Phone width 390px must not scroll sideways.
- Stage files by path only. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on a new branch `landing-dates`. Do not push or merge without the owner's word. Leave `docs/lead-capture-go-live-guide.md` and the two 2026-11-02 plan files untracked.

## Review Focus

- A module with start but no end (or end before start): treated as not set; Check this page fails with a plain message.
- A marker in text while no dates exist: renders as empty (never the raw marker); publish is blocked naming the box.
- `{weekdays}` empty (all 7 days): the hero text `{dates} ({weekdays})` must not leave `()` behind.
- A range crossing a month and a year boundary, and a 10-day and a 1-day module.
- A country link and a module link with their own typed hero date: markers inside those typed overrides still resolve; typed text with no markers is left untouched.
- An existing page with a typed countdown and no switch value: strip unchanged.
- Early Bird already passed while the switch is ON: the strip hides, as the countdown does today.
- An import file with no dates fields still imports exactly as today.

---

### Task 1: Data fields for dates and the countdown switch

**Files:**
- Modify: `src/lib/landing/variants.ts` (ModuleDef)
- Modify: `src/lib/landing/content.ts` (LandingSettings, DEFAULT_SETTINGS, moduleSchema, contentSchema settings, normalizeModules, normalizeContent, emptyContent)
- Test: `tests/landing-content.test.ts`

**Interfaces:**
- Produces: `ModuleDef` gains `startsOn?: string; endsOn?: string` (valid `YYYY-MM-DD` or omitted/""). `LandingSettings` gains `eventStartsOn?: string; eventEndsOn?: string; countdownFollowsEarlyBird?: boolean`. `isIsoDate(v: string): boolean` exported from `src/lib/landing/dates.ts` is NOT used here; this task validates with its own regex `/^\d{4}-\d{2}-\d{2}$/` plus `Date.parse` check.

- [ ] **Step 1: Write the failing tests** in `tests/landing-content.test.ts`: `normalizeContent` keeps `startsOn`/`endsOn` of a module when both are real dates; drops a malformed one (`"27/11/2026"`, `"2026-02-31"`) to `""`; keeps `eventStartsOn`/`eventEndsOn`; `countdownFollowsEarlyBird` is `false` when absent and `true` when `true`; `emptyContent("course").settings.countdownFollowsEarlyBird === true`; `contentSchema.safeParse` accepts the new fields and still accepts content without them.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-content.test.ts`. Expected: FAIL on the new assertions.
- [ ] **Step 3: Implement** the fields in the files above. Optional in zod (`z.string().max(10).optional()`, `z.boolean().optional()`). `normalizeModules` copies `startsOn`/`endsOn` only when they are real calendar dates. `normalizeContent` sets `countdownFollowsEarlyBird: s.countdownFollowsEarlyBird === true`. `DEFAULT_SETTINGS` keeps it `false`; `emptyContent` overrides it to `true`.
- [ ] **Step 4: Run** the test file. Expected: PASS. Run tsc: 0 errors.
- [ ] **Step 5: Commit** `feat(landing): module dates and countdown switch fields`.

### Task 2: Pure date formatting and marker replacement

**Files:**
- Create: `src/lib/landing/dates.ts`
- Test: `tests/landing-dates.test.ts` (new)

**Interfaces:**
- Consumes: `LandingContent`, `ModuleDef`, `VariantRef` types.
- Produces (exact):
  - `isRealDate(v: string): boolean`
  - `formatDateRange(start: string, end: string): string`
  - `weekdayText(ranges: { start: string; end: string }[]): string`
  - `datesFor(c: LandingContent, moduleKey: string | null): { start: string; end: string } | null`: module key given: that module's range if both dates real, else null; no key: earliest start to latest end over modules with real ranges; no module ranges: the event dates from settings when both real; else null.
  - `applyAutoDates(c: LandingContent, ref: Pick<VariantRef, "moduleKey">): LandingContent`: returns a copy; replaces markers in every string inside every section's `data` (deep, arrays and objects); fills an empty schedule `items[].when` that has a non-empty `module` with `formatDateRange` of that module; when `settings.countdownFollowsEarlyBird === true` sets `settings.countdownTo = registration.earlyBirdEndsAt`. Unresolvable markers become `""`. When the weekday text is empty, a following ` ({weekdays})` or ` ({weekdays:key})` is removed together with its brackets.
  - `unfilledDateMarkers(c: LandingContent, moduleKey: string | null): { sectionId: string; sectionLabel: string }[]`: sections (enabled only) holding a marker that cannot resolve for that ref. Also lists a schedule row with module and empty `when` whose module has no dates.

- [ ] **Step 1: Write the failing tests** in `tests/landing-dates.test.ts` with these named cases and exact assertions:
  - `formatDateRange("2026-11-27","2026-11-29")` is `"27 – 29 Nov 2026"`; `("2026-11-30","2026-12-02")` is `"30 Nov – 2 Dec 2026"`; `("2026-12-30","2027-01-02")` is `"30 Dec 2026 – 2 Jan 2027"`; `("2026-11-27","2026-11-27")` is `"27 Nov 2026"`.
  - `weekdayText([{start:"2026-11-27",end:"2026-11-29"}])` is `"Fri, Sat & Sun"`; a 2-day Fri-Sat range is `"Fri & Sat"`; a one-day range is `"Fri"`; a 10-day range is `""`.
  - Whole course from the five Pharmacovigilance modules (27–29 Nov, 4–6 Dec, 11–13 Dec, 18–20 Dec, 25–27 Dec 2026): `datesFor(c, null)` is `{start:"2026-11-27", end:"2026-12-27"}` and `weekdayText` of the module ranges is `"Fri, Sat & Sun"`.
  - `applyAutoDates` on hero `dateLine: "{dates} ({weekdays})"` gives `"27 Nov – 27 Dec 2026 (Fri, Sat & Sun)"` for the main ref and `"11 – 13 Dec 2026 (Fri, Sat & Sun)"` for `{moduleKey:"module-3"}`.
  - A 10-day module hero text `"{dates} ({weekdays})"` gives `"1 – 10 Dec 2026"` (no brackets).
  - `{dates:module-2}` in a curriculum item resolves to `"4 – 6 Dec 2026"`; an unknown key resolves to `""`.
  - A schedule row `{when:"", module:"module-2"}` gets `"4 – 6 Dec 2026"`; a typed `when` is untouched.
  - Typed text with no markers is returned unchanged (deep equality of the section data).
  - Countdown: switch true and `earlyBirdEndsAt` set copies it to `settings.countdownTo`; switch false or absent leaves `countdownTo` alone; switch true and empty Early Bird gives `""`.
  - `applyAutoDates` does not mutate its input.
  - `unfilledDateMarkers` lists the hero when it holds `{dates}` and no dates exist, and lists nothing once dates exist.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-dates.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/landing/dates.ts` with the signatures above. Parse dates with `Date.UTC`; month names from a fixed English array. Marker regex: `/\{(dates|weekdays)(?::([a-z0-9]+(?:-[a-z0-9]+)*))?\}/g`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): date ranges, weekdays and marker replacement`.

### Task 3: Use the dates everywhere a page is shown

**Files:**
- Modify: `src/lib/landing/resolve-variant.ts` (end of `resolveVariant`)
- Modify: `src/app/e/[slug]/page.tsx` (main public page)
- Modify: `src/app/dashboard/admin/landing-pages/[id]/preview/page.tsx` (main draft when no `ref`)
- Modify: `src/components/admin/landing/LandingEditor.tsx` (`previewContent`, main branch)
- Test: `tests/landing-resolve-variant.test.ts`, `tests/landing-variants-public.test.tsx` (add cases)

**Interfaces:**
- Consumes: `applyAutoDates(c, {moduleKey})` from Task 2.
- Produces: `resolveVariant` returns content with markers replaced for its `ref.moduleKey`; the three main-page sites call `applyAutoDates(content, { moduleKey: null })`.

- [ ] **Step 1: Write the failing tests**: in `landing-resolve-variant.test.ts`, a main page with module dates and hero `{dates} ({weekdays})`; `resolveVariant(main, {regionKey:"uae", moduleKey:null}, emptyOverrides())` shows the whole-course range; the module link shows only the module's range; a link override whose hero `dateLine` is `"{dates}"` also resolves; a link override of plain typed text is unchanged; countdown follows Early Bird on a country link. In `landing-variants-public.test.tsx`, the public variant page renders the module's dates in the hero.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement**: call `applyAutoDates` as the last step of `resolveVariant` (after `modules`/`registration` are final) using `ref.moduleKey`. Add the three main-page calls. In `LandingEditor` change only the non-link branch of `previewContent` to `applyAutoDates(content, {moduleKey:null})`.
- [ ] **Step 4: Run** both files and `tests/landing-page-check.test.ts`. Expected: PASS. tsc 0 errors.
- [ ] **Step 5: Commit** `feat(landing): every page and link follows the module dates`.

### Task 4: Publish checks for dates

**Files:**
- Modify: `src/lib/landing/sections.ts` (schedule `when` no longer `required`)
- Modify: `src/lib/landing/content.ts` (`computeReadiness`)
- Modify: `src/lib/landing/page-check.ts` (`runPageChecks`)
- Test: `tests/landing-publish-gate.test.ts`, `tests/landing-page-check.test.ts`

**Interfaces:**
- Consumes: `unfilledDateMarkers`, `isRealDate`, `datesFor` from Task 2.
- Produces: readiness problems (blocking) and page-check items.

- [ ] **Step 1: Write the failing tests**:
  - Readiness: a hero holding `{dates}` with no dates gives a problem whose message names the section and says to fill the Dates box in Page settings; the same page with dates gives none; a schedule row with empty `when` and no module gives `"A schedule row has no date. Type one, or link the row to a module that has dates."`; a schedule row with module and dates gives none.
  - Readiness: a module with only `startsOn`, or `endsOn` before `startsOn`, gives `"<title>: the end date is before the start date, or one date is missing."`.
  - Page check (runs even when registration is disabled): `warn` when a module's day count differs from `days` (id `module-days-<key>`, detail `"<title> has <days> days but the dates cover <n> days."`); `warn` when the switch is ON and `registration.earlyBirdEndsAt` is empty (id `countdown-follows`, detail `"The countdown follows Early Bird, but no Early Bird end is set, so no countdown shows."`).
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement**: remove `required: true` from the schedule `when` field; add the problems to `computeReadiness` (main ref plus one pass per module key with dates for module-only markers) and the two warnings in `runPageChecks`, restructured so the date checks run before the `if (!r.enabled) return []` exit.
- [ ] **Step 4: Run** both files plus `tests/landing-content.test.ts`. Expected: PASS. tsc 0 errors.
- [ ] **Step 5: Commit** `feat(landing): block publishing with unfilled date markers`.

### Task 5: The Dates box and the Countdown switch in Page settings

**Files:**
- Modify: `src/components/admin/landing/PageSettingsPanel.tsx` (step 5 card)
- Modify: `src/components/admin/landing/LandingEditor.tsx` (pass what the card needs: `modules`, `onModules`, `registration` are already passed; ensure the panel receives the page kind or whether `modules.length === 0`)
- Test: `tests/landing-admin-ui.test.tsx` (add cases)

**Interfaces:**
- Consumes: `ModuleDef.startsOn/endsOn`, `LandingSettings.eventStartsOn/eventEndsOn/countdownFollowsEarlyBird`, `formatDateRange`, `weekdayText`.
- Produces: a "Dates" block inside step 5 "Countdown and start date".

- [ ] **Step 1: Write the failing UI tests**: with two modules the card shows one row per module with Start and End date inputs (`type="date"`, labelled `"<title> starts"` and `"<title> ends"`) and a "<n> days" text; changing a start date calls `onModules` with the new `startsOn`; with no modules it shows one "Event starts" / "Event ends" pair that calls `onSettings({eventStartsOn})`; the Countdown area shows a switch "Count down to the Early Bird end"; when ON the "Countdown ends" input is not rendered and the text `Follows the Early Bird end:` plus the formatted Early Bird date (Pakistan time) shows; when OFF the input shows; a button "Use automatic dates in the hero" calls the hero dateLine updater with `"{dates} ({weekdays})"`; a line `"Hero, Schedule and links follow these dates."` is present.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-admin-ui.test.tsx`. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** the block using existing `Input`, `cn`, token classes and the existing switch markup (copy the "Soft shadows" switch pattern in the same file). Inputs are `max-md:min-h-11 max-md:text-base`. End min = start. The hero button edits the main hero's `dateLine` through a new optional prop `onHeroDateLine?: (text: string) => void` that `LandingEditor` wires to its existing section-update function for the hero section on the main page; hide the button when the page has no hero.
- [ ] **Step 4: Run** the file plus `tests/landing-autosave.test.tsx`. Expected: PASS. tsc 0 errors, eslint clean on touched files.
- [ ] **Step 5: Commit** `feat(landing): Dates box and countdown switch in Page settings`.

### Task 6: The AI import file carries the dates

**Files:**
- Modify: `src/lib/landing/import/build-registration.ts` (module lines: `starts`, `ends`)
- Modify: `src/lib/landing/import/build-content.ts` (`event_starts`, `event_ends`, countdown switch, needs-review rule)
- Modify: `src/lib/landing/import/prompts.ts` (questions list, front-matter guide, hero and schedule examples, day numbering)
- Test: `tests/landing-import-build.test.ts`, `tests/landing-import-registration.test.ts`, `tests/landing-import-prompts.test.ts`

**Interfaces:**
- Consumes: `isRealDate` from Task 2.
- Produces: front matter module line `{ key, title, format, days, option, starts: 2026-11-27, ends: 2026-11-29 }`; settings `event_starts`, `event_ends`; imports set `countdownFollowsEarlyBird: true` unless `settings.countdown_to` is given (then `false`).

- [ ] **Step 1: Write the failing tests**: a module with `starts`/`ends` becomes `startsOn`/`endsOn`; a bad date or end before start is an import error naming the module; a file with no dates fields builds exactly as before (existing fixtures still pass); `event_starts`/`event_ends` land in settings; the hero `dateLine` or a schedule `when` that contains `{dates` is not added to `needsReview` (typed ones still are); a file with `countdown_to` keeps the switch false; the prompt text contains `starts:`, `{dates} ({weekdays})`, asks for each module's dates in the questions list, and says each module's days are numbered from Day 1 and the outline holds no typed dates.
- [ ] **Step 2: Run** the three files. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement** the parsing and the prompt edits. Prompt wording stays plain; the schedule example for module rows leaves `when` empty with `module: module-1`.
- [ ] **Step 4: Run** the three files and `tests/landing-import-fixtures.test.ts`, `tests/landing-import-data.test.ts`, `tests/landing-import-price-cards.test.ts`. Expected: PASS. tsc 0 errors.
- [ ] **Step 5: Commit** `feat(landing): import file carries module dates and day numbers`.

### Task 7: Whole-branch verification

**Files:** none new.

- [ ] **Step 1:** `node node_modules/typescript/bin/tsc --noEmit` (0 errors); `node node_modules/eslint/bin/eslint.js src/lib/landing src/components/admin/landing src/app/e src/app/dashboard/admin/landing-pages`; run every `tests/landing-*.test.*` file. Only the known failing files from the repo notes may fail (`landing-route-hardening`, `landing-event-sheet`, `landing-hero-render`, `landing-polish-3`, `participant-campaign-page-ui`, `landing-registrations-list-ui` flaky: re-run alone).
- [ ] **Step 2:** With the owner's okay to start the dev server, open a test landing page in the browser on PC (1440px) and phone (390px): set module dates, see hero, Schedule and a module link follow; flip the countdown switch; confirm no sideways scroll on phone.
- [ ] **Step 3:** Update the memory file for this project, then hand the branch to the owner. Push only after the owner says "push".

---

## Self-review notes

- Spec coverage: goals 1 (Task 5), 2–3 (Tasks 2–3), 4 (Task 2), 5 (Tasks 1–2 range up to 60 days), 6 (Task 6), 7 (Tasks 3, 5), 8 (Tasks 1, 2, 5). Non-goals respected: no session, email or gap-day work.
- Differences from the spec, chosen for safety: (a) for existing pages the countdown switch is OFF when absent, including pages with no countdown date, so no live page grows a new strip by itself (the spec said ON for those); (b) the per-link "Use automatic dates" button is the existing "Reset to main" control, and the new button sits in the Dates card and edits only the main hero.
