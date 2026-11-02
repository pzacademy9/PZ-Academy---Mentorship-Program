# Landing Builder Safety (Build 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner a "Check this page" step that proves WhatsApp links, the recorded-student portal and country links are right before publishing, with automated tests, plus working Undo/Redo and a clearer manual-Publish status.

**Architecture:** A pure check engine (`runPageChecks`) returns pass/fail/warn items. A thin `publishCheck` joins it with today's `computeReadiness`, so the existing publish gate (client and server) blocks on failures. Warnings (shared WhatsApp link) show in a popup on Publish. Undo/Redo is a pure history module wrapped by a hook around the editor's `apply`. The pasted portal link is a new page setting used by the Paid email when a page has no course.

**Tech Stack:** Next.js (App Router), React, TypeScript, Zod, Vitest, Tailwind. Tests run directly: `node node_modules/vitest/vitest.mjs run tests/<file>`; types `node node_modules/typescript/bin/tsc --noEmit` (0 errors); lint `node node_modules/eslint/bin/eslint.js <paths>`. (`npm run` is broken by the `&` in the path.)

**Spec:** `docs/superpowers/specs/2026-11-02-landing-builder-upgrade-design.md` (section "Build 1: Safety first"). Stitch screens to match for the look: Check this page `9619b2e4bbf34869bbed04beec006125` (desktop) and `83526386ba1648078e157cd922f351dc` (mobile), project `4651274386787527431`. Skip the demo parts listed in the spec.

## Global Constraints

- Plain words in every label and message; no "CTA", "endpoint", "redirect URL", "GeoIP".
- No change to pricing, the Sheet sync, migrations or the database. Build 1 adds no migration.
- Existing published pages render exactly as before; checks only affect the next publish.
- Recorded stays a price percent on the same options (owner decision). Do not split options.
- Tests use fake people and fake links only. Never commit student data.
- Do not edit `database.types.ts`. Never add eslint-disable for `@typescript-eslint`. Use the Edit tool on CRLF files.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage files by path only. Leave `docs/lead-capture-go-live-guide.md` untracked.
- Do not push or merge. Branch: `landing-builder-upgrade`.

## Review Focus

1. A page with no WhatsApp groups at all (a free class or webinar) must still publish. No "missing group link" failure there.
2. A Live-only page never needs a portal; a Recorded-only page never needs a group link; a page that offers recorded with no course and no pasted link is blocked.
3. Two options sharing one group link: warning popup naming both options, publish allowed after "Publish anyway", not blocked by the server.
4. A country link whose resolved page would show another country's price or option fails and names the country.
5. Undo/Redo: nothing to undo disables the button; fast typing is one undo step; Restore version and a save conflict clear the history so Undo cannot resurrect older content.

## File Structure

- Create `src/lib/landing/page-check.ts`: pure `runPageChecks`. Imports types from `content.ts` and `registration/*`; imports `resolveVariant` from `resolve-variant.ts`. Never imported by `content.ts` (avoids a cycle).
- Create `src/lib/landing/publish-gate.ts`: `publishCheck` = `computeReadiness` + failures from `runPageChecks`; also returns warnings and all checks.
- Create `src/lib/landing/history.ts`: pure Undo/Redo history.
- Create `src/hooks/useContentHistory.ts`: React wrapper.
- Create `src/components/admin/landing/PageCheckPanel.tsx`: the "Check this page" results sheet.
- Modify `src/lib/landing/content.ts`: add `portalLink` setting.
- Modify `src/lib/landing/registration/access-rules.ts`: add `pickPortalUrl`.
- Modify `src/lib/landing/registration/status-email.ts`: use `pickPortalUrl`.
- Modify `src/components/admin/landing/PublishSlot.tsx`, `LandingEditor.tsx`, `PageSettingsPanel.tsx`; `src/lib/data/landing-pages.ts` (server gate).
- Tests: `tests/landing-page-check.test.ts`, `tests/landing-publish-gate.test.ts`, `tests/landing-history.test.ts`, `tests/landing-portal-link.test.ts`, `tests/landing-buyer-links.test.ts`, `tests/landing-undo-redo.test.tsx`, `tests/landing-publish-warning.test.tsx`.

---

### Task 1: Portal link setting for pages with no course

**Files:**
- Modify: `src/lib/landing/content.ts` (the `LandingSettings` interface ~line 19, defaults ~55, Zod schema ~72, `normalizeContent` ~131)
- Modify: `src/lib/landing/registration/access-rules.ts`
- Modify: `src/lib/landing/registration/status-email.ts` (the `portalUrl` line)
- Test: `tests/landing-portal-link.test.ts`

**Interfaces:**
- Produces: `LandingSettings.portalLink: string` (default `""`; valid when empty or a safe `https://` link, max 1000 chars, same rule as `registerUrl`).
- Produces in `access-rules.ts`: `pickPortalUrl(i: { courseSlug: string | null; hasAccount: boolean; desired: DesiredEnrollment; mode: "live" | "recorded"; status: RegistrationStatus; pastedLink: string; appUrl: string }): string | undefined`. Rules: course portal `${appUrl}/portal/${courseSlug}` when `hasAccount && courseSlug && emailGetsPortalLink(desired)` (today's behaviour). Otherwise, only when there is no `courseSlug`, `mode === "recorded"`, `status === "paid"` and `pastedLink` is a safe https link, return `pastedLink`. Otherwise `undefined`.

- [ ] **Step 1: Write failing tests** in `tests/landing-portal-link.test.ts`: `pickPortalUrl returns the course portal for a recorded paid buyer with an account`; `... returns the pasted link for a recorded paid buyer on a page with no course`; `... returns undefined for a live buyer on a page with no course even when a link is pasted`; `... returns undefined for an unpaid recorded buyer`; `... ignores an unsafe pasted link (javascript:)`; and in the same file `normalizeContent keeps a valid portalLink and blanks an invalid one`, `default settings have portalLink ""`.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-portal-link.test.ts`. Expected: FAIL (`pickPortalUrl` / `portalLink` not defined).
- [ ] **Step 3: Add `portalLink`** to the settings interface, defaults, Zod schema and `normalizeContent` exactly like `registerUrl` (use the same `safeUrlOrEmpty` helper).
- [ ] **Step 4: Implement `pickPortalUrl`** in `access-rules.ts` per the rules above; reuse `isSafeUrl` from the same module `content.ts` uses (builder: find its import path).
- [ ] **Step 5: In `status-email.ts`** replace the inline `portalUrl` expression with `pickPortalUrl({ courseSlug, hasAccount, desired, mode: lead.mode, status: person.status, pastedLink: page.content.settings.portalLink, appUrl: appUrl() })`. Keep `needsAccount` and `noCourse` as they are.
- [ ] **Step 6: Run** the new test plus `tests/landing-access-rules.test.ts tests/landing-status-emails.test.ts tests/landing-content.test.ts`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(landing): portal link setting for pages with no course`.

### Task 2: The check engine

**Files:**
- Create: `src/lib/landing/page-check.ts`
- Test: `tests/landing-page-check.test.ts`

**Interfaces:**
- Consumes: `LandingContent`, `RegistrationStepKey` (from `content.ts` / `registration/*`), `selectWaGroups` and `isValidWaGroupUrl` (`registration/wa-groups.ts`), `resolveVariant` and `emptyOverrides` (`resolve-variant.ts`, `variants.ts`).
- Produces:
  - `type CheckStatus = "pass" | "fail" | "warn"`.
  - `interface PageCheck { id: string; title: string; status: CheckStatus; detail?: string; step?: RegistrationStepKey; sectionId?: string }` (`title` is the plain sentence shown, for example "Recorded students get the portal, not a group link"; `detail` says what is wrong and where on a fail or warn).
  - `runPageChecks(c: LandingContent, ctx: { hasCourse: boolean }): PageCheck[]`, `failures(checks: PageCheck[]): PageCheck[]`, `warnings(checks: PageCheck[]): PageCheck[]`.
- Checks and ids (all skipped, returning no item, when `c.registration.enabled` is false):
  - `live-groups`: when `modes` includes live AND at least one option has a valid group link, every non-free option must have a valid one, else fail naming the options (`step: "whatsapp"`). When no option has any link, pass with title "This page has no WhatsApp groups".
  - `shared-groups`: warn when two or more options share the same trimmed group link; detail names every option in the group ("Module 1 and Full Course use the same WhatsApp group").
  - `recorded-no-group`: for every option key (alone, and all options together) `selectWaGroups(c.registration, keys, "recorded")` must be `[]`; else fail. Always passes today; it guards regressions.
  - `recorded-portal`: only when `modes` includes recorded: pass if `ctx.hasCourse` or `c.settings.portalLink` is a safe https link; else fail "Recorded students have no portal. Link this page to a course or paste a portal link." (`sectionId` is the page settings target the builder uses for `SETTINGS`).
  - `country-<KEY>` for every region: `resolveVariant(c, { regionKey: KEY, moduleKey: null }, emptyOverrides()).registration` must have exactly one region equal to KEY, `defaultRegionKey === KEY`, every `prices[option]` row containing only KEY, every kept non-free option priced in KEY, and the region's currency unchanged; else fail "The <label> link would show prices or options from another country."
  - `module-<moduleKey>` for every module in the page's modules list that has an option: the resolved module link keeps exactly that module's option; else fail.

- [ ] **Step 1: Write failing tests** with a small fake-page builder (fake course "Demo Course", regions PK and AE, options `full` bundle and `m1` module, fake `https://chat.whatsapp.com/AAA111` style links): `live groups fail names the option without a link`; `a page with no group links at all passes live-groups`; `shared link is a warning that names both options`; `recorded buyer of every option gets no group link`; `recorded offered with no course and no pasted link fails recorded-portal`; `recorded with a course passes`; `recorded with a pasted https link passes`; `live-only page has no recorded-portal item`; `UAE link passes when AE has prices for every option`; `UAE link fails when an option has no AE price` is already caught by registrationProblems, so instead assert a fabricated page whose `defaultRegionKey` mismatches fails the country check; `disabled registration returns []`.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-page-check.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `page-check.ts` per the Interfaces block. One small helper per check; messages in plain words.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): pure page checks for groups, portal and country links`.

### Task 3: Buyer outcome tests (the proof)

**Files:**
- Test: `tests/landing-buyer-links.test.ts` (tests only, no new code unless a test exposes a bug)

**Interfaces:** Consumes `selectWaGroups`, `desiredEnrollment`, `emailGetsPortalLink`, `pickPortalUrl`.

- [ ] **Step 1: Write tests** for five buyer types using the PPC-style fake config (`full` bundle with link A, `m1` module with link B, `m2` module with link C): `live full course gets only the package group (A)`; `live module 1 gets only group B, never A or C`; `live modules 1 and 2 get B and C`; `recorded full gets no group and a portal link`; `recorded module 1 gets no group and a portal link`.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-buyer-links.test.ts`. Expected: PASS (the behaviour exists). If any fails, that is a real bug: fix it in `wa-groups.ts` or `pickPortalUrl`, and say so in the commit.
- [ ] **Step 3: Commit** `test(landing): prove which links each kind of buyer gets`.

### Task 4: The publish gate

**Files:**
- Create: `src/lib/landing/publish-gate.ts`
- Modify: `src/lib/data/landing-pages.ts` (~line 182, the publish readiness call)
- Test: `tests/landing-publish-gate.test.ts`

**Interfaces:**
- Produces: `publishCheck(c: LandingContent, page: { title: string; slug: string; hasCourse: boolean }): { ready: boolean; problems: Problem[]; warnings: PageCheck[]; checks: PageCheck[] }` where `problems` = `computeReadiness(...).problems` plus one `Problem` per failure (`message` = failure detail; `sectionId` mapped from `step` with `registrationTarget`, or the settings target for portal). `ready` is `problems.length === 0`. Warnings never affect `ready`.

- [ ] **Step 1: Write failing tests**: `ready page returns ready true with checks`; `a failure becomes a problem with a plain message`; `a shared-link warning leaves ready true and appears in warnings`; `a page with computeReadiness problems keeps them`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** `publish-gate.ts`.
- [ ] **Step 4: In `landing-pages.ts`** call `publishCheck(page.draft, { title, slug, hasCourse: page.courseId !== null })` (builder: use the real course field name on the page row) in place of `computeReadiness`; keep the 422 `problems` response shape unchanged.
- [ ] **Step 5: Run** the new test plus the existing publish/landing tests: `node node_modules/vitest/vitest.mjs run tests/landing-publish-gate.test.ts tests/landing-content.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(landing): publish is blocked by failed page checks`.

### Task 5: Undo/Redo history (pure)

**Files:**
- Create: `src/lib/landing/history.ts`
- Test: `tests/landing-history.test.ts`

**Interfaces:**
- Produces: `interface History<T> { past: T[]; future: T[]; lastAt: number }`; `emptyHistory<T>(): History<T>`; `record<T>(h: History<T>, before: T, now: number, opts?: { coalesceMs?: number; limit?: number }): History<T>` (push `before` onto `past`, clear `future`; when `now - h.lastAt < coalesceMs` (default 1000) and `past` is non-empty, keep the older base and only update `lastAt`; cap `past` at `limit`, default 100); `undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null` (null when `past` is empty); `redo<T>` likewise; `canUndo`, `canRedo`.

- [ ] **Step 1: Write failing tests**: `undo returns the previous value and makes redo possible`; `redo reapplies it`; `a new edit after undo clears redo`; `edits within 1000ms are one undo step`; `an edit after the window is a new step`; `history is capped at 100`; `undo on empty history returns null`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `history.ts` (pure, no React, no Date calls inside; time is passed in).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): pure undo and redo history`.

### Task 6: Undo/Redo in the editor

**Files:**
- Create: `src/hooks/useContentHistory.ts`
- Modify: `src/components/admin/landing/LandingEditor.tsx` (`apply` ~line 187, header buttons, restore handler)
- Test: `tests/landing-undo-redo.test.tsx`

**Interfaces:**
- Produces: `useContentHistory(): { record(before: LandingContent): void; undo(current: LandingContent): LandingContent | null; redo(current: LandingContent): LandingContent | null; clear(): void; canUndo: boolean; canRedo: boolean }` (state in `useState`; time from `Date.now()` at call).
- Editor wiring: `apply(next)` records `contentRef.current` as `before` for user edits; a separate internal `applyWithoutHistory(next)` does what `apply` does now (set ref, set state, clear server problems, `schedule(next)`) and is used by Undo/Redo and by the module re-prune effect. Undo/Redo buttons (icon buttons with accessible names "Undo" and "Redo") sit in the top bar before the Publish controls; disabled when `canUndo`/`canRedo` is false. Ctrl+Z and Ctrl+Shift+Z (and Ctrl+Y) run Undo/Redo only when focus is not in an input, textarea or contenteditable (the browser handles typing undo itself). `clear()` runs when a version is restored (`onRestored`) and when the save state becomes `conflict`. Undo/Redo cover the main page draft only; link-override edits are not recorded.

- [ ] **Step 1: Write failing tests** (renderHook for the hook; a small harness for buttons): `undo restores the content before the last edit`; `redo returns it`; `canUndo is false on a fresh editor`; `clear empties both stacks`; `typing twice within a second is one undo`; `Ctrl+Z inside a text input is ignored by the editor handler`.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-undo-redo.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the hook on top of `history.ts`.
- [ ] **Step 4: Wire** the editor as described; no other behaviour change.
- [ ] **Step 5: Run** the new test plus `tests/landing-autosave.test.tsx`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(landing): undo and redo in the page builder`.

### Task 7: Publish popup for warnings and clearer manual-publish status

**Files:**
- Modify: `src/components/admin/landing/PublishSlot.tsx` (the `publish` action and the status area)
- Modify: `src/components/admin/landing/LandingEditor.tsx` (top bar line)
- Test: `tests/landing-publish-warning.test.tsx`

**Interfaces:** Consumes `publishCheck` (Task 4) and `useConfirm` (check its option names; it already offers `title`, `description`, `confirmLabel`, `destructive`; add a cancel label only if it exposes one, else keep the default Cancel and name the safe button in the description).

- [ ] **Step 1: Write failing tests**: `shared-link warning shows a popup naming both options and blocks the request until confirmed`; `choosing Publish anyway sends the publish request`; `choosing Go back sends nothing`; `no warnings means no popup`; `status text reads "Unpublished changes" when the draft differs from the published copy`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: In `PublishSlot`** replace the local `computeReadiness` calls with `publishCheck(content, { title, slug, hasCourse })`; before the publish request, if `warnings` is non-empty, `await confirm({ title: "Two options use the same WhatsApp group", description: <warning details>, confirmLabel: "Publish anyway" })` and stop on a negative answer ("Go back and fix").
- [ ] **Step 4: Add the line** "Students see the last published version until you press Publish." under the top bar (small, always visible while the page has a published version).
- [ ] **Step 5: Run** the new test and `tests/landing-content.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(landing): warn before publishing shared WhatsApp groups`.

### Task 8: "Check this page" sheet and the portal setting in Page settings

**Files:**
- Create: `src/components/admin/landing/PageCheckPanel.tsx`
- Modify: `src/components/admin/landing/LandingEditor.tsx` (a "Check this page" button next to Versions, opening the sheet)
- Modify: `src/components/admin/landing/PageSettingsPanel.tsx` (a "Portal for recorded students" card)
- Test: extend `tests/landing-publish-warning.test.tsx` or create `tests/landing-page-check-panel.test.tsx`

**Interfaces:** `PageCheckPanel({ checks, onGoto }: { checks: PageCheck[]; onGoto: (sectionId: string, field?: string) => void })` renders each check with a green tick, a yellow note (warn) or a red note with a "Fix this" button (fail), and a heading line such as "1 thing must be fixed before this page can be published." Match the Stitch Check screen's look; skip the checkout-preview panel. `PageSettingsPanel` gets two props, `hasCourse: boolean` and `courseTitle: string | null`; when `hasCourse` it shows "Recorded students get the portal for <courseTitle>." (read-only); otherwise a link field bound to `settings.portalLink` with help text "Where recorded students open their lessons. Must start with https://." Shown only when the page offers recorded.

- [ ] **Step 1: Write failing tests**: `a failing check renders its message and a Fix this button that calls onGoto`; `passing checks render ticks`; `Page settings shows the portal field only when recorded is offered and the page has no course`; `typing a portal link updates settings.portalLink`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the panel, the button and the settings card. Words: "Check this page", "Fix this", "Portal for recorded students".
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): Check this page sheet and portal setting`.

### Task 9: Whole-build verification

**Files:** none new.

- [ ] **Step 1: Run** `node node_modules/typescript/bin/tsc --noEmit`. Expected: 0 errors.
- [ ] **Step 2: Run** `node node_modules/eslint/bin/eslint.js` on every file this plan created or changed. Expected: clean.
- [ ] **Step 3: Run** the seven test files above plus `tests/landing-access-rules.test.ts tests/landing-status-emails.test.ts tests/landing-content.test.ts tests/landing-autosave.test.tsx tests/landing-registration-wa-groups.test.ts`. Expected: all PASS. (Known unrelated failing files: pz-tokens, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet, migrations-segment-source-dnc.)
- [ ] **Step 4: Update the memory status file** `pz-academy-landing-builder-upgrade-status.md` with what shipped and what is pending, and add it to the memory index.
- [ ] **Step 5: Hand the owner** a short list: how to open Check this page, how to test Undo/Redo, how to test the shared-link popup on a copy of a real page, and the compare link for the branch (do not push until told).
