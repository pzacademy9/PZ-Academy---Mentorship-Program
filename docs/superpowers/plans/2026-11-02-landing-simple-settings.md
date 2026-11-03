# Landing Builder, Build 2: Simple Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page settings becomes five plain step cards, Links gets "Copy all links" and check marks, a Create account switch controls the success-message prompt, and every landing page top bar shows the real PZ Academy logo.

**Architecture:** Small pure functions carry the logic (settings card status, Copy-all-links text) so they are tested without a browser. One new setting, `settings.showCreateAccount` (default `true`), reaches the public registration widget through the existing `/api/landing/[slug]/config` response. The logo is one shared constant used by the marketing nav and the landing top bar. Existing registration setup (8-step stepper) stays as is, below the five cards.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Vitest + Testing Library. Run checks directly (no `npm run`): `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run <files>`, `node node_modules/eslint/bin/eslint.js <paths>`.

**Spec:** `docs/superpowers/specs/2026-11-02-landing-builder-upgrade-design.md` (section "Build 2: Simple settings"). Stitch (project 4651274386787527431): Page settings desktop `c59ec329b05d491ba96062fb253976a5`, mobile `e0ea550368c64351ae9096f44a0ebde0`; Links desktop `978baf02ea0b4fbf8f8b5a8f2c9a8010`, mobile `ed5668e31ce34bb5bd43b0dffaadbfea`.

**Branch:** `landing-simple-settings`, cut from `landing-builder-upgrade` (Build 1 is not merged yet and this build edits the same files: `PageSettingsPanel.tsx`, `LandingEditor.tsx`, `page-check.ts`).

## Global Constraints

- Plain words in every label, button and message. Banned words: "CTA", "redirect URL", "endpoint", "territory routing", "GeoIP".
- Existing published pages must render exactly the same until the owner re-publishes. The one exception the owner asked for: the landing top bar logo changes everywhere at once (logo only).
- `showCreateAccount` defaults to `true` (today's behaviour). Create account off hides only the "See this registration in your account" card in the success message. The Paid email to recorded students still explains how to create an account (do not touch `status-email.ts` or the email templates).
- No migration. Never regenerate `database.types.ts`. Tests use fake people only.
- Files in this repo use CRLF: use the Edit tool, not whole-file rewrites of existing files.
- Stitch parts that MUST NOT ship: "PharmaZyme" name/logo, "Auto-login credentials ... Clinical Vault" hint, "PharmaZyme Engine / Auto-save" box, "Interactive canvas" preview panel (the builder already has a preview), "Accredited 32 CME", "120 Seats", the left page outline (the builder already has one), "Course Funnel Engine", "Traffic distribution", "Live visitor device sandbox", "Stripe / JazzCash / GeoIP / Live DNS Route" wording, and any demo URL like `pz.academy/c/...`.

## Review Focus

1. Old saved pages have no `showCreateAccount`: they must load with it `true`, and a published page must not show "Unpublished changes" because of the new key. (Task 1)
2. Switch off: the success message has no account card, but the "Check your registration status" link and the "Done" button remain. (Task 1)
3. Copy all links when nothing is published or the main page is not live: the text must not list dead links. (Task 3)
4. A page whose `registration.modes` is `[]` (possible today): no mode card is selected and the card says "Needs attention". Choosing Live only must keep `recordedPercentOfRegular` and every option untouched. (Task 4, Task 5)
5. Logo image fails to load or is slow: the top bar keeps an accessible name ("PZ Academy") and the page title still shows; no leftover "PZ" letter block. (Task 2)

---

### Task 1: Create account switch (setting, public config, success message)

**Files:**
- Modify: `src/lib/landing/content.ts` (`LandingSettings`, `DEFAULT_SETTINGS`, zod `settings`, `normalizeContent`)
- Modify: `src/lib/landing/import/build-content.ts`, `src/lib/landing/templates-data/mdc-batch-3.ts`, `ppc-batch-3.ts`, `w20-diabetes.ts` (each builds a full settings object; add the key)
- Modify: `src/components/landing/registration/types.ts` (`PublicConfig`), `src/app/api/landing/[slug]/config/route.ts`
- Modify: `src/components/landing/registration/RegistrationModal.tsx`, `RegistrationFlow.tsx`, `SuccessScreen.tsx`
- Test: `tests/landing-create-account.test.tsx`; extend `tests/landing-registration-success.test.tsx` only if its fixtures break

**Interfaces:**
- Produces: `LandingSettings.showCreateAccount: boolean` (default `true`); `PublicConfig.showCreateAccount: boolean`; `SuccessScreenProps.showCreateAccount?: boolean` (undefined means `true`).

- [ ] **Step 1: Write failing tests** in `tests/landing-create-account.test.tsx`:
  `default settings have showCreateAccount true` (`emptyContent("course").settings.showCreateAccount === true`);
  `normalizeContent keeps false and treats a missing key as true` (`normalizeContent({ settings: {} }).settings.showCreateAccount === true`, `{ settings: { showCreateAccount: false } }` gives `false`, a non-boolean like `"no"` gives `true`);
  `SuccessScreen shows the account card for a guest by default` (reuse the `base` props from `tests/landing-registration-success.test.tsx`, copy the few lines it needs);
  `SuccessScreen hides the account card when showCreateAccount is false` (no "Create account" link, no "Log in" link; "Check your registration status" and "Done" still present).
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-create-account.test.tsx`. Expected: FAIL (property missing).
- [ ] **Step 3: Add `showCreateAccount`** to `LandingSettings` (doc comment: "Show the Create account prompt in the success message."), `DEFAULT_SETTINGS`, the zod settings object as `z.boolean().optional()`, and `normalizeContent` as `typeof s.showCreateAccount === "boolean" ? s.showCreateAccount : true`. Add `showCreateAccount: true` to the three template settings objects and to `build-content.ts`.
- [ ] **Step 4: Thread it to the screen.** `config/route.ts` adds `showCreateAccount: page.content.settings.showCreateAccount` to the JSON; `PublicConfig` gains the field; `RegistrationFlow` passes `showCreateAccount={config.showCreateAccount}` to `SuccessScreen` (look at how `RegistrationModal` hands `cfg.config` to the flow; no new prop is needed if `config` is already passed). In `SuccessScreen`, the account section renders only when `isGuest && !testMode && showCreateAccount !== false`.
- [ ] **Step 5: Run** the new test, `tests/landing-registration-success.test.tsx`, `tests/landing-content.test.ts` and `tests/landing-registration-client.test.tsx`; then `tsc --noEmit`. Expected: PASS, 0 errors. Fix any test fixture that builds a `PublicConfig` by adding `showCreateAccount: true`.
- [ ] **Step 6: Commit** `feat(landing): Create account switch setting and success message`.

---

### Task 2: One site-wide logo

**Files:**
- Create: `src/lib/site-logo.ts`
- Modify: `src/components/marketing/MarketingNav.tsx` (use the constants), `src/components/landing/LandingRenderer.tsx` (top bar, lines ~80-84)
- Test: extend `tests/landing-renderer.test.tsx`

**Interfaces:**
- Produces: `SITE_LOGO_URL: string` (the current `https://pharmacozyme.com/wp-content/uploads/2026/04/PZ-Academy-logo.png`), `SITE_LOGO_ALT = "PZ Academy"`.

- [ ] **Step 1: Write failing tests** in `tests/landing-renderer.test.tsx` (follow that file's existing render helper): `top bar shows the site logo image` (an `img` with alt "PZ Academy" and `src` containing the logo file name, inside the `nav` named "Page"); `top bar no longer shows the PZ letter block` (no element whose text is exactly "PZ"); `top bar still shows the page title` (title passed in is visible).
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-renderer.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 3: Create `site-logo.ts`** with the two constants. In `MarketingNav.tsx` replace the hard-coded `src` and `alt` with them. In `LandingRenderer.tsx` replace the `PZ` `<span>` with the logo (`next/image` like MarketingNav, height 32 on phone and 40 from `md`, `w-auto`, `alt={SITE_LOGO_ALT}`); keep the title `<span>`. If the title is empty it already falls back to "PZ Academy": then show only the logo and not a second "PZ Academy" word (render the title span only when `title` is non-empty).
- [ ] **Step 4: Run** `tests/landing-renderer.test.tsx tests/landing-hero-render.test.tsx tests/landing-register-menu.test.tsx tests/landing-public-polish.test.tsx`. Expected: PASS (update any older assertion that looked for the "PZ" block).
- [ ] **Step 5: Commit** `feat(landing): use the PZ Academy logo in the landing top bar`.

---

### Task 3: Copy all links, check marks on Links

**Files:**
- Create: `src/lib/landing/links-text.ts`
- Modify: `src/components/admin/landing/variants/LinksPanel.tsx`, `src/components/admin/landing/LandingEditor.tsx` (pass `pageTitle` and `checks` to `LinksPanel`)
- Test: `tests/landing-links-text.test.ts`, `tests/landing-links-panel.test.tsx`

**Interfaces:**
- Produces: `buildLinksText(i: { pageTitle: string; origin: string; slug: string; mainLive: boolean; rows: Pick<VariantGridRow, "label" | "path" | "enabled" | "published">[] }): string` — first line is `pageTitle`; then, when `mainLive`, `• Main page: <origin>/e/<slug>`; then one `• <label>: <url>` per row where `row.enabled && row.published`, using `publicLinkUrl(origin, slug, row.path)` (exported from `LinksPanel.tsx`; move it to `links-text.ts` and re-export from `LinksPanel.tsx` so existing imports keep working); when no link line exists, the last line is `No links are live yet.`
- Produces: `rowCheck(row: Pick<VariantGridRow, "ref">, checks: PageCheck[]): PageCheck | null` — the check with id `country-<regionKey>` for a country-only row, `module-<moduleKey>` for a module-only row, otherwise `null` (a country-with-module row has no single check).
- Consumes: `PageCheck` from `src/lib/landing/page-check.ts`; `LinksPanel` gets two new props `pageTitle: string` and `checks: PageCheck[]`.

- [ ] **Step 1: Write failing tests.** `tests/landing-links-text.test.ts`: `lists the page name, the main page and only published links` (rows: one published+enabled, one enabled but not published, one off; expect exactly two link lines and the title first); `omits the main page when it is not live`; `says no links are live yet when nothing is published and the main page is not live`; `rowCheck finds the country and module checks and returns null for a combined row`. `tests/landing-links-panel.test.tsx`: `Copy all links shows a preview of the text and Copy copies it` (mock `copyText` from `@/components/admin/landing/copy-text`; click "Copy all links", see the preview `pre`, click "Copy text", expect `copyText` called with the exact `buildLinksText` string); `a passing check shows a tick and a failing check shows its message on the row`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** `links-text.ts` as specified. In `LinksPanel`: add a primary button "Copy all links" next to "Add a country"; clicking toggles a preview block (`<pre>` with the text, a hint "This is what will be copied for your sales team.", and a "Copy text" button using the existing `copy`/`copyText` flow and the toast "Links copied"). On each row show `rowCheck` as a small tick with `aria-label="Checked"` when it passes, or the check's `detail` in the existing yellow problem style when it fails. In `LandingEditor.tsx` pass `pageTitle={title}` and `checks={pageChecks}` (already computed for the Check this page sheet).
- [ ] **Step 4: Run** both test files plus `tests/landing-variants-admin-ui.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): Copy all links and check marks on the Links screen`.

---

### Task 4: Settings card status (pure)

**Files:**
- Create: `src/lib/landing/settings-cards.ts`
- Test: `tests/landing-settings-cards.test.ts`

**Interfaces:**
- Produces: `type CardStatus = "ready" | "attention"`; `type SettingsCardId = "who" | "button" | "after" | "links" | "dates"`; `settingsCardStatus(c: LandingContent, ctx: { hasCourse: boolean }): Record<SettingsCardId, CardStatus>`; `readyCount(s: Record<SettingsCardId, CardStatus>): number`.
- Consumes: `runPageChecks` and `failures`/`warnings` from `page-check.ts`; `isHttpsUrl` from `simple-text.ts`.
- Rules: `who` is `attention` when `registration.enabled` and `modes` is empty, else `ready`. `button` is `attention` when `registerLabel` is blank, or when `registration.enabled` is false and `registerUrl` is not a clean https link; else `ready`. `after` is always `ready`. `links` is `attention` when any check with id `live-groups`, `recorded-no-group`, `recorded-portal` or `shared-groups` is not `pass` (all four run only when registration is enabled; when it is not, `ready`). `dates` is always `ready`.

- [ ] **Step 1: Write failing tests** (fake content via `emptyContent("course")` and the registration helper shape used in `tests/landing-page-check.test.ts`): `empty modes needs attention`; `a blank button label needs attention`; `registration off with no https link needs attention, on is ready`; `a missing group link on a live paid option makes links need attention`; `a shared group link makes links need attention`; `recorded with no course and no portal link makes links need attention`; `a fully set page is ready on all five and readyCount is 5`.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-settings-cards.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** per the Rules above.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): pure status for the five settings cards`.

---

### Task 5: Page settings as five step cards

**Files:**
- Create: `src/components/admin/landing/StepCard.tsx`, `src/components/admin/landing/ModeChoice.tsx`
- Modify: `src/components/admin/landing/PageSettingsPanel.tsx`, `src/components/admin/landing/registration/RegistrationSetup.tsx` (remove the two mode checkboxes from `BuyStep`; keep the "Recorded price, % of the regular price" field)
- Modify: `src/components/admin/landing/LandingEditor.tsx` (pass `statuses` to both `PageSettingsPanel` uses)
- Test: `tests/landing-settings-cards-ui.test.tsx`; update the tests that click the old checkboxes (`tests/landing-recorded-only-ui.test.tsx`, `tests/landing-admin-ui.test.tsx`)

**Interfaces:**
- Produces: `StepCard({ number: number; title: string; blurb: string; status: CardStatus; defaultOpen?: boolean; children })` — a card with a numbered badge, title, one-line blurb, a tag (`Ready` or `Needs attention`) and an expand/collapse button (`aria-expanded`, accessible name `Open <title>` / `Close <title>`). `ModeChoice({ modes: Mode[]; onChange(modes: Mode[]): void })` — three radio cards "Live only" / "Recorded only" / "Both" (hints: "Live classes only", "Recorded lessons only", "Students pick when they register"); `["live"]`, `["recorded"]`, `["live","recorded"]` (any order) select the matching card, `[]` selects none; choosing sets exactly those modes.
- `PageSettingsPanel` gains optional `statuses?: Record<SettingsCardId, CardStatus>` (when omitted all cards show Ready) and renders, in this order: header "Page settings" with `"{readyCount} of 5 ready"`; Card 1 "Who can register" (only when `registration?.enabled`; blurb "Decide if students join live classes, watch recordings, or choose either."; `ModeChoice`); Card 2 "Register button" (blurb "Choose what the main button says and where it goes."; field "Button text" bound to `registerLabel`; when `registration?.enabled` a note "The button opens the built-in registration form. Turn the form on or off in Registration setup below." else the "What the button does" link field bound to `registerUrl`); Card 3 "After registering" (blurb "Choose what students see right after they register."; a switch labelled "Offer to create an account" with hint "Shown in the thank-you message after registering." bound to `showCreateAccount`; `role="switch"`, `aria-checked`); Card 4 "WhatsApp and portal links" (blurb "Connect students to their group or their portal."; the existing WhatsApp chat number field, the existing "Portal for recorded students" content from Build 1 (relabel "Which portal they get"), and when registration is enabled a read-only list of each option with `Valid link` / `No link` and a button "Edit group links" that calls `onRegistrationStep("whatsapp")` and scrolls to `#registration-setup`); Card 5 "Countdown and start date" (blurb "Optional. A strip at the top and the start date on the website."; the existing countdown label, countdown end and batch start fields). Then, unchanged, the Modules editor and `RegistrationSetup` under a heading "Registration setup", then the existing "Google & WhatsApp previews" card collapsed inside a `<details>` named "Sharing preview".

- [ ] **Step 1: Write failing tests** in `tests/landing-settings-cards-ui.test.tsx`: `ModeChoice selects Both for live and recorded and none for empty`; `choosing Live only keeps the recorded percent and every option` (render `PageSettingsPanel` with a registration whose `recordedPercentOfRegular` is 80, click "Live only", assert `onRegistration` called with `modes: ["live"]`, `recordedPercentOfRegular: 80` and the same options array); `a card shows its tag and toggles open and closed`; `the header counts ready cards` (statuses with two attention gives "3 of 5 ready"); `the Create account switch writes showCreateAccount` (`onSettings` called with `{ showCreateAccount: false }` when switched off); `card 4 lists each option's link state and Edit group links jumps to the WhatsApp step`; `card 2 shows the link field only when the registration form is off`.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-settings-cards-ui.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Build `StepCard` and `ModeChoice`** to the Interfaces block, match the Stitch Page settings look (rounded cards, numbered badge, green "Ready" tag, amber "Needs attention" tag, radio cards with a check on the selected one; project tokens `pz-*`; every control at least 44px high on phones; cards stack in one column on phones). Do not copy any Stitch demo text.
- [ ] **Step 4: Restructure `PageSettingsPanel`** to the order above, reusing the existing field components and handlers. Remove the two mode checkboxes in `BuyStep`; `ModeChoice` now owns them. Pass `statuses={settingsCardStatus(content, { hasCourse })}` from `LandingEditor` (editable use; the read-only link-view use passes the same).
- [ ] **Step 5: Update** the older tests that toggled "Live sessions" / "Recorded lectures" to use the new radio cards. Run `landing-settings-cards-ui`, `landing-recorded-only-ui`, `landing-admin-ui`, `landing-page-check-panel`, `landing-registration-admin`, `landing-undo-redo` and `tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 6: Commit** `feat(landing): Page settings as five step cards`.

---

### Task 6: Whole-build verification and notes

**Files:** none new.

- [ ] **Step 1: Run** `node node_modules/typescript/bin/tsc --noEmit`. Expected: 0 errors.
- [ ] **Step 2: Run** `node node_modules/eslint/bin/eslint.js` on every file this plan created or changed. Expected: clean (the old MediaPicker warning is not ours).
- [ ] **Step 3: Run** all test files named in Tasks 1 to 5. Expected: PASS. (Known unrelated failing files: pz-tokens, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet, migrations-segment-source-dnc. A full-suite run can show timeouts under load: re-run any failing UI file alone before calling it a failure.)
- [ ] **Step 4: Update the memory file** `pz-academy-landing-builder-upgrade-status.md` and its index line with what shipped and what is pending.
- [ ] **Step 5: Hand the owner** a short list: how to open Page settings and read the five cards, how to turn Create account off and see the success message without the card, how to use Copy all links, where to see the new logo, plus the phone-width check still owed.

---

## Rulings made while planning (the owner can overrule)

- **Logo has no settings screen.** It is one shared constant, defaulting to the existing PZ Academy logo, used by the website nav and every landing page. Changing it later means a one-line code change. Reason: no migration and no new admin screen for something that changes once a year.
- **"End of the form" prompt does not exist.** The code review found the Create account prompt only in the success message, so the switch controls that one place.
- **Links keeps its on/off switch and its Publish button.** They do two different jobs (a link existing vs. its content going live); the Stitch screen shows only a switch, but folding them together would change publish behaviour.
- **Registration setup stays as the existing 8-step stepper** under the five cards. The Stitch screens do not redesign it.
- **Build 2 is cut from `landing-builder-upgrade`** because Build 1 is not merged and both touch the same files; merge Build 1 first.
