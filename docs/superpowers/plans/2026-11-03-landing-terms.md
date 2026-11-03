# Landing Terms and Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every landing page can show a Terms and Conditions page: its own text if the owner pasted one for that page, otherwise one general text for the whole site. The footer and the registration checkbox link to it.

**Architecture:** Per-page text lives in the page's own settings (`settings.terms`, part of the saved page content, so preview, publish and versions already handle it; no migration). The general text lives in a new one-row table `site_terms` edited from a new admin screen. A pure `resolveTerms` picks page text first, then general, else nothing (no link anywhere). A public route `/e/<slug>/terms` shows the result.

**Tech Stack:** Next.js App Router (ISR pages, `revalidate = 3600`), Supabase (service-role only table, owner pastes the SQL), Zod, Vitest + Testing Library.

**Spec:** The owner's request in the 2026-11-03 session: terms "one per landing page and a general one", footer and registration form link to them; the owner's example text is a numbered list (1. Payment & Refund Policy ... 7. Conduct) ending with a contact line.

**Branch:** `landing-terms`, cut from `main` (all earlier builds are merged).

## Global Constraints

- Never invent legal wording: the app ships NO default Terms text. Until the owner pastes text, no link shows anywhere (old pages stay exactly as they are).
- Plain words in every label. Banned: "CTA", "redirect URL", "endpoint", "territory", "GeoIP".
- Text is shown as plain paragraphs (no HTML, no markdown). A paragraph that is one short line starting with `1. ` / `2. ` etc. is shown as a heading.
- The Terms page is public and cached like the landing page (`revalidate = 3600`); it must not read cookies or headers.
- Supabase from here is read-only; the owner pastes `0097` by hand. Run checks directly: `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run <files>`, `node node_modules/eslint/bin/eslint.js <paths>`. Never regenerate `database.types.ts` (hand-add the new table). Files use CRLF: Edit tool on existing files; Python edits open files as UTF-8.
- Tests use fake text and fake people only. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A page saved before this build (no `settings.terms`) renders and publishes exactly as today, shows no Terms link, and shows no new "Unpublished changes". (Task 1)
2. Terms text with blank lines, Windows line endings, a very long line without spaces, and characters like `<script>` and `&`: shown as plain text, wraps on a phone, nothing executed. (Tasks 1, 4)
3. No page text and no general text: `/e/<slug>/terms` is a 404 and no link shows; general text only: the page link shows and opens the general text; page text only: opens the page text. (Tasks 1, 4)
4. Only an admin can read or change the general text through the API. (Task 2)
5. Registration checkbox on a page with no terms keeps today's sentence with no link. (Task 4)

---

### Task 1: Terms data and the pure resolver

**Files:**
- Modify: `src/lib/landing/content.ts` (`LandingSettings.terms?: string`, `contentSchema.settings.terms: z.string().max(20000).optional()`, `DEFAULT_SETTINGS.terms: ""`; make sure `normalizeContent` keeps it)
- Create: `src/lib/landing/terms.ts`
- Test: `tests/landing-terms-data.test.ts`

**Interfaces:**
- Produces: `resolveTerms(pageText: string | undefined, generalText: string): { text: string; source: "page" | "general" } | null` (page text wins when it has non-space characters; else general when it has any; else `null`); `type TermsBlock = { kind: "heading" | "p"; text: string }`; `termsBlocks(text: string): TermsBlock[]` (split on blank lines after turning `\r\n` into `\n`; a block that is one line matching `^\d+\.\s+\S.{0,80}$` is a `heading`; every other block is a `p` keeping its inner line breaks; empty blocks dropped).

- [ ] **Step 1: Write failing tests** `tests/landing-terms-data.test.ts`: `resolveTerms prefers page text, then general, then null` (blank page text "  \n" counts as none); `termsBlocks turns numbered one-line paragraphs into headings and keeps other paragraphs` (use the owner's example structure with fake wording; a paragraph `"Questions? WhatsApp us"` stays `p`; a paragraph of two lines starting with `1. ` stays `p`); `termsBlocks handles Windows line endings and extra blank lines`; `a page saved without terms normalizes with terms empty and equals the same content normalized twice` (use `normalizeContent` on an old-shaped object); `hasUnpublishedChanges is false for an old page` (compare `normalizeContent(old)` with itself); `settings.terms over 20000 characters is rejected by contentSchema and 20000 is accepted`.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-terms-data.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the type/schema/default change and `terms.ts`. Check `normalizeContent`/`normalizeSettings` in `content.ts` keep `terms` as a string (default `""`).
- [ ] **Step 4: Run** the new file, `tests/landing-content.test.ts`, `tests/landing-renderer.test.tsx`, `tests/landing-templates.test.ts`; `tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(landing): per-page terms setting and resolver`.

---

### Task 2: The general terms (table, API, admin screen)

**Files:**
- Create: `supabase/migrations/0097_site_terms.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add `site_terms` Row/Insert/Update; no regeneration)
- Create: `src/lib/data/site-terms.ts` (server-only)
- Create: `src/lib/validations/site-terms.ts`
- Create: `src/app/api/admin/site-terms/route.ts`
- Create: `src/app/dashboard/admin/terms/page.tsx`, `src/components/admin/terms/GeneralTermsEditor.tsx`
- Modify: `src/components/dashboard/nav.ts` (admin nav item "Terms and Conditions" next to "Payment Accounts")
- Test: `tests/site-terms.test.ts`, `tests/general-terms-editor.test.tsx`

**Interfaces:**
- Produces: table `public.site_terms(key text primary key check (key = 'general'), body text not null default '' check (char_length(body) <= 20000), updated_at timestamptz not null default now())`, RLS on with no policies, one seeded row `('general', '')`; `getGeneralTerms(): Promise<string>` (returns `""` when the row is missing; throws on a database error); `saveGeneralTerms(body: string): Promise<void>`; `siteTermsSchema = z.object({ body: z.string().max(20000) })`; route `GET` returns `{ body }`, `PUT` takes `{ body }` and returns `{ ok: true }`, both behind `requireAdmin()` exactly like `src/app/api/admin/payment-accounts/route.ts`; `GeneralTermsEditor({ initial }: { initial: string })` — a labelled textarea "General Terms and Conditions" (help: "Shown on every landing page that has no Terms of its own."), a Save button, success and failure toast via `sonner`, and a plain-words note that a page's own Terms win over this one.
- The page uses the same admin gate and layout as `src/app/dashboard/admin/payment-accounts/page.tsx`.

- [ ] **Step 1: Write failing tests**: `siteTermsSchema accepts 20000 characters and rejects 20001 and a non-string`; `getGeneralTerms returns "" when there is no row` and `returns the stored body` (mock `createAdminSupabase` the way `tests/` for `landing-payment-accounts` do; find the existing pattern with `grep -l "createAdminSupabase" tests`); `saveGeneralTerms upserts key general`; `the route refuses a non-admin on GET and PUT` and `PUT with a bad body gives 400` (follow how the payment-accounts route tests mock `requireAdmin`); `the editor shows the saved text, saves what is typed, and tells the owner when saving failed`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the files per the Interfaces block. The migration is idempotent (`create table if not exists`, `insert ... on conflict do nothing`).
- [ ] **Step 4: Run** the two new files, `tests/landing-route-hardening.test.ts` (it lists every `/api/admin` landing route; if it fails ONLY because it already failed before this build, say so in the ledger and do not touch it), `tsc --noEmit`, eslint on new files. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(admin): general terms and conditions screen`.

---

### Task 3: The per-page box in Page settings

**Files:**
- Modify: `src/components/admin/landing/PageSettingsPanel.tsx` (a sixth card), `src/lib/landing/settings-status.ts` (or wherever `settingsCardStatus` lives; read `StepCard.tsx` for the status values)
- Test: `tests/landing-terms-settings-ui.test.tsx`

**Interfaces:**
- Consumes: Task 1 `settings.terms`; the existing `updateSettings` helper and the other cards' change handlers in `PageSettingsPanel.tsx`.
- Produces: a sixth `StepCard` "Terms and Conditions" (blurb "Optional. The rules students agree to. If you leave it empty, the general Terms from the Terms screen are used."), holding one textarea labelled "Terms and Conditions for this page" (max 20000, help "Plain text. Start each part with 1. 2. 3. and a short title on its own line.") and a link "Edit the general Terms" to `/dashboard/admin/terms`. Its status follows the optional card pattern (done when text is present, otherwise the same neutral/optional status the countdown card uses when empty). The five existing statuses and the Ready-to-publish check are unchanged.

- [ ] **Step 1: Write failing tests**: `the Terms card shows the stored text and typing updates settings.terms`; `an empty box is an optional card, not a problem` (readiness and `runPageChecks` do not gain a problem); `the card links to the general Terms screen`; `the existing five cards keep their statuses` (reuse an existing settings-status test fixture if present).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the card and its status.
- [ ] **Step 4: Run** the new file, `tests/landing-admin-ui.test.tsx`, `tests/landing-settings-cards.test.tsx` (use `ls tests | grep -i settings` for the real names), `tsc --noEmit`, eslint. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(landing): Terms and Conditions box in Page settings`.

---

### Task 4: The public Terms page, footer link and registration link

**Files:**
- Create: `src/app/e/[slug]/terms/page.tsx`, `src/components/landing/TermsDocument.tsx`
- Modify: `src/app/e/[slug]/page.tsx` and `src/app/e/[slug]/[...variant]/page.tsx` (fetch `getGeneralTerms()`, compute `termsHref` with `resolveTerms`, pass it down), `src/components/landing/LandingRenderer.tsx` (new optional prop `termsHref?: string`, passed to the footer and to `RegistrationHost`), `src/components/landing/LandingFooter.tsx` (a "Terms and Conditions" link in the Contact column when `termsHref` is given), `src/components/landing/registration/RegistrationHost.tsx` and the steps that render `ConsentField` (`StepDetails.tsx`, `StepUpload.tsx`; follow the existing props chain), `src/components/landing/registration/Field.tsx` (`ConsentField` gets optional `termsHref`)
- Test: `tests/landing-terms-public.test.tsx`

**Interfaces:**
- Consumes: Task 1 `resolveTerms`, `termsBlocks`; Task 2 `getGeneralTerms`.
- Produces: route `/e/<slug>/terms` (`revalidate = 3600`, `notFound()` for an unknown or unpublished slug, and when `resolveTerms` gives `null`); `TermsDocument({ title, text }: { title: string; text: string })` renders the page title, "Terms and Conditions" as the heading, and `termsBlocks` as `<h2>` / `<p>` with `whitespace-pre-line break-words`; as React text nodes only (no `dangerouslySetInnerHTML`). `LandingFooter` gets `termsHref?: string`. `ConsentField` gets `termsHref?: string`: with it, the words "payment terms" in the sentence become a link "Terms and Conditions" opening in a new tab (`target="_blank" rel="noopener noreferrer"`); without it the sentence is exactly as today.

- [ ] **Step 1: Write failing tests** `tests/landing-terms-public.test.tsx`: `TermsDocument shows numbered titles as headings and keeps paragraphs`; `TermsDocument shows <script> and & as plain text, never as markup` (output contains `&lt;script&gt;` and no `<script`); `a very long unbroken word has break-words`; `LandingFooter shows the Terms link only when termsHref is given`; `ConsentField without termsHref keeps today's exact sentence and has no link`; `ConsentField with termsHref has a Terms and Conditions link that opens in a new tab`; `the terms page gives 404 with no page text and no general text, shows the page text when only that exists, shows the general text when only that exists, and the page text wins when both exist` (mock `getPublishedLandingPage` and `getGeneralTerms`); `the landing page passes no termsHref when there is no text at all` (render `LandingRenderer` and check no "Terms and Conditions" text).
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** per the Interfaces block.
- [ ] **Step 4: Run** the new file, `tests/landing-renderer.test.tsx`, `tests/landing-footer.test.tsx` (from the footer fix, if merged; otherwise skip), `tests/landing-registration-*.test.tsx` (registration form tests), `tsc --noEmit`, eslint on changed files. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(landing): public Terms page with footer and form links`.

---

### Task 5: Whole-build verification and notes

- [ ] **Step 1:** `tsc --noEmit` → 0 errors. **Step 2:** eslint on every created/changed file → clean. **Step 3:** run every test file named above plus `tests/landing-admin-ui.test.tsx`; known unrelated failing files: pz-tokens, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet, migrations-segment-source-dnc (re-run slow UI files alone before calling a failure).
- [ ] **Step 4:** Add memory file `pz-academy-landing-terms-status.md` and its index line.
- [ ] **Step 5:** Hand the owner: paste `0097_site_terms.sql` in Supabase, open Admin > Terms and Conditions and paste the general text, optionally paste page text in Page settings, publish, then check the footer link, the Terms page and the checkbox link on a phone.

---

## Rulings made while planning (the owner can overrule)

- **No built-in Terms wording.** You supply the text; until then no link shows, so nothing legal is invented and old pages do not change.
- **A page's own Terms win over the general ones.** Empty page text means "use the general text".
- **One Terms page per landing page address** (`/e/<slug>/terms`); country and module links of a page use their main page's Terms.
- **Plain text only.** Numbered one-line titles become headings; no bold, links or pictures inside Terms.
- **The Refund Policy is a section inside the Terms** (as in your example), not a separate page.
- **The general text is edited on its own admin screen**, next to Payment Accounts, and saved to the database, so you can change it without me.
- **Pages are cached up to one hour**, so a changed Terms text can take up to an hour to show on the public page.
