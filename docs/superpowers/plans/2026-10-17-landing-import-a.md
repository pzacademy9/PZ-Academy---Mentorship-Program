# Landing Import (.md) and Master Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teammate gives an AI a master prompt plus their course database, gets one `.md` file, imports it on the pages list, and gets a draft page with its country/module links ready.

**Architecture:** Pure parsing and mapping modules in `src/lib/landing/import/` (no DB): split file, parse YAML, build `LandingContent` plus problems. One server function creates the page and links using existing `createLandingPage` / `ensureVariant` / `saveVariantDraft` / `setVariantEnabled`. One admin API route and a button + result dialog on the pages list. Master prompts are TypeScript constants shown on a "Make a page with AI" screen.

**Tech Stack:** Next.js App Router, TypeScript, zod 4, vitest, new dependency `yaml`.

**Spec:** `docs/superpowers/specs/2026-10-17-landing-import-format.md` (grammar, results, errors) and `docs/superpowers/specs/2026-10-16-landing-builder-easy-mode-design.md` section "A" and "Builder-check decisions".

## Global Constraints

- `npm run` is broken: use `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors) and `node node_modules/vitest/vitest.mjs run tests/<file>`. Known failing: `tests/pz-tokens.test.ts` (only SalesTeamPanel). Registration timing tests may flake under full-suite load; rerun alone.
- Never regenerate `database.types.ts`. Never run `next build` while a dev server runs.
- Visible text for teammates: say "link", "country", "module". Never "variant", "override", "resolve", "YAML", "schema", stack traces.
- Import is CREATE-ONLY: existing slug gets suffix `-2`, `-3`...; never overwrite.
- Images are never in the file; image fields stay empty.
- Format id: `format: pz-landing/1`. Pasted bullets (•, ●, ▪, –, `1.`) become `- ` lines.
- Permission via one helper `requireAdmin` (`src/lib/auth/require-admin.ts`); keep check in the route only.
- New commits only, never amend. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Reuse, do not duplicate: `SECTION_DEFS`/`normalizeSectionData` (sections.ts), `contentSchema`/`normalizeContent`/`KIND_SECTIONS` (content.ts), `registrationProblems`/`normalizeRegistration` (registration/config.ts), `MODULE_ITEM_SECTIONS`/`MODULE_KEY_RE`/`variantPath` (variants.ts), `validateSlug` (slug.ts).

## Review Focus

- AI wraps the whole file in a ```` ```markdown ```` fence or adds chatter before `---`: importer strips the outer fence and leading chatter.
- Smart quotes, tabs in YAML, `—`/`–` characters, Windows line endings (CRLF), BOM: parse without a confusing error.
- Money typed as `"1,200"` or `"AED 200"` instead of a number: warning naming the price, not a crash.
- Same module key twice, module `option` pointing at a missing option, link to a country not in regions: blocking message in plain words.
- Slug taken / invalid slug / title blank: suffix or plain message; nothing half-created if link creation fails midway (page is kept, response lists links that failed).

---

### Task 1: Split, clean and parse the file

**Files:**
- Modify: `package.json` (add `yaml` dependency, then `npm install` equivalent: `node` cannot run npm; run `npm install yaml` via Bash `npm.cmd install yaml --no-audit --no-fund` if `npm run` is the only thing broken; else add by hand and install)
- Create: `src/lib/landing/import/parse.ts`
- Test: `tests/landing-import-parse.test.ts`

**Interfaces:**
- Produces:
```ts
export interface ImportProblem { level: "error" | "warning"; message: string }
export interface ParsedFile {
  front: Record<string, unknown>;
  sections: { type: string; heading: string; data: Record<string, unknown>; line: number }[];
}
export function normalizeBullets(text: string): string;            // •●▪–·, "1." "1)" at line start -> "- "; other text untouched
export function parseImportFile(raw: string): { ok: true; file: ParsedFile } | { ok: false; problems: ImportProblem[] };
```

- [ ] **Step 1: Write failing tests** covering: valid minimal file; leading chatter + outer ```` ```markdown ```` fence stripped; CRLF and BOM; `format: pz-landing/2` and missing format -> error "This file is not in the PZ Academy page format (expected pz-landing/1)."; bad YAML in a section -> error naming the heading ("The 'FAQ' section could not be read near line N."); `## Section: nonsense` -> error naming it; section heading with no yaml block -> error; `normalizeBullets("• a\n● b\n– c\n1. d\n2) e\nplain")` equals `"- a\n- b\n- c\n- d\n- e\nplain"`; tabs in YAML reported as plain problem, not thrown.
- [ ] **Step 2: Run, expect FAIL** (`node node_modules/vitest/vitest.mjs run tests/landing-import-parse.test.ts`).
- [ ] **Step 3: Implement** `parseImportFile` with the `yaml` package: strip BOM/CRLF, strip outer fence, drop text before first `---`, parse front-matter, then split remaining text on `^## Section:\s*(\w+)` headings and parse the first ```` ```yaml ```` fence under each. Apply `normalizeBullets` to every string value inside section data (deep) after parse. Never throw.
- [ ] **Step 4: Run, expect PASS; `tsc --noEmit` clean.**
- [ ] **Step 5: Commit** `feat(landing): parse pz-landing/1 import files`.

### Task 2: Build registration and modules

**Files:**
- Create: `src/lib/landing/import/build-registration.ts`
- Test: `tests/landing-import-registration.test.ts`

**Interfaces:**
- Consumes: `ImportProblem` (Task 1).
- Produces:
```ts
export interface BuiltRegistration {
  registration: RegistrationConfig;
  modules: ModuleDef[];
  problems: ImportProblem[];
}
export function buildRegistration(front: Record<string, unknown>): BuiltRegistration;
```

- [ ] **Step 1: Failing tests** with spec example file values: regions map `code/name/currency/class_time/timezone/accounts` -> `RegionDef`; options `key/name/kind/free/wa_group` -> `OptionDef`; tiers `size` -> `minSize=maxSize`, `min/max` also accepted; prices `{ amount, early, group_totals, early_group_totals }` -> `PriceCell`; `modes`, `recorded_percent`, `default_region` (defaults to first region), `early_bird_ends`, `capacity`, `verify_whatsapp`, `event_label`, `ref_prefix`, `professions`, `discovery`, `module_mix`; `enabled: true` whenever regions and options exist. Problems: price string `"AED 200"` -> warning "The price of Full Course for UAE is not a number."; price for unknown option/country -> error "UAE has no ... " style plain; duplicate module key -> error; module `option` not in options -> error; a module option with no price in a region -> warning "UAE has no price for Module 2."; module with `days` 0 -> none. Run result through `registrationProblems()` and surface each message as warning (these are readiness-style, never blocking). Module `format` and `title` copied; `days` int.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** tolerant mapping, then `normalizeRegistration` on the result so shape is guaranteed. Region/option/module code validation uses `REGION_KEY_RE`, `ITEM_KEY_RE`, `MODULE_KEY_RE` -> errors with plain wording.
- [ ] **Step 4: PASS + tsc.**
- [ ] **Step 5: Commit** `feat(landing): map import registration and modules`.

### Task 3: Build page content, links and the full result

**Files:**
- Create: `src/lib/landing/import/build-content.ts`
- Test: `tests/landing-import-build.test.ts`

**Interfaces:**
- Consumes: `parseImportFile`, `buildRegistration`, `ImportProblem`.
- Produces:
```ts
export interface ImportLink { regionKey: string | null; moduleKey: string | null; on: boolean; heroTitle?: string; heroSubtitle?: string }
export interface BuiltImport {
  kind: PageKind; title: string; slug: string;
  content: LandingContent;           // validated with contentSchema
  links: ImportLink[];               // ALL possible links (country, module, country x module), listed ones with on/hero text
  warnings: ImportProblem[];
}
export function buildImport(raw: string): { ok: true; built: BuiltImport } | { ok: false; errors: string[] };
```

- [ ] **Step 1: Failing tests:** minimal course file builds with sections in `KIND_SECTIONS[kind]` order, absent sections omitted; `enabled: false` respected; section fields not in `SECTION_DEFS` dropped with a warning; list-item `module:` kept only if it is a defined module key (else warning, cleared); images left `""` even if the file supplies one (warning "Pictures are added in the editor"); `settings.*` and `seo.*` mapped (`whatsapp` -> `whatsappNumber`, `register_label`, `countdown_to`, `countdown_label`); title blank -> error; `kind` unknown -> error; slug missing -> derived from title via existing slug helper; `validateSlug` failure -> error; links: 1 country + 2 modules => 1 + 2 + 2 = 5 links, listed ones `on`, hero text carried; `needsReview` contains `"<sectionId>:dateLine"` for hero, `"<id>:items.<i>.when"` for each schedule item, `items.<i>.price`/`oldPrice` (when non-empty) for each pricing item, and `note` for pricing; warnings: module with no schedule entries tagged to it -> "Module 3 has no dates."; no FAQ items -> warning; `early` price without `early_bird_ends` -> warning. Final content must pass `contentSchema.safeParse`; failure -> errors in plain words (first issue path turned into the section label from `SECTION_DEFS[type].label`).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** using `normalizeSectionData` for each section (then check strings against `contentSchema`), fresh `crypto.randomUUID()` section ids (needsReview entries use these ids), `emptyContent`-style defaults for sections absent.
- [ ] **Step 4: PASS + tsc.**
- [ ] **Step 5: Commit** `feat(landing): build page content from import file`.

### Task 4: Create the page and its links

**Files:**
- Create: `src/lib/data/landing-import.ts`
- Test: `tests/landing-import-data.test.ts` (mock `createLandingPage`, `ensureVariant`, `saveVariantDraft`, `setVariantEnabled` like `tests/landing-variants-data.test.ts`)

**Interfaces:**
- Consumes: `buildImport`, `createLandingPage` (`src/lib/data/landing-pages.ts`), `ensureVariant`, `saveVariantDraft`, `setVariantEnabled` (`src/lib/data/landing-variants.ts`).
- Produces:
```ts
export type ImportResult =
  | { ok: false; errors: string[] }
  | { ok: true; pageId: string; slug: string; slugChanged: boolean; warnings: string[]; linksCreated: number; linksFailed: string[] };
export async function importLandingPage(userId: string, raw: string): Promise<ImportResult>;
```

- [ ] **Step 1: Failing tests:** happy path creates page then every link off via `ensureVariant(pageId, ref, false)`; links with `on` get `setVariantEnabled(id, true)`; links with hero text get `saveVariantDraft(variantId, overrides, revision)` writing the hero section `fields.headline`/`subheadline` (merge with the default headline `ensureVariant` seeds; only override what the file gave); slug taken -> retry `slug-2`, `slug-3`... up to 20 then error, `slugChanged: true`; one `ensureVariant` failure -> import still `ok` with that link in `linksFailed` (plain label like "UAE, Module 2"); build errors -> `{ ok: false }` and `createLandingPage` never called.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** `importLandingPage`; warning strings are `ImportProblem.message`s; hero section id found by `type === "hero"` in `built.content.sections`.
- [ ] **Step 4: PASS + tsc.**
- [ ] **Step 5: Commit** `feat(landing): create page and links from import`.

### Task 5: API route

**Files:**
- Create: `src/app/api/admin/landing-pages/import/route.ts`
- Test: `tests/landing-import-route.test.ts` (copy mocking style of `tests/landing-variants-admin-routes.test.ts`)

**Interfaces:**
- Consumes: `importLandingPage`, `requireAdmin`.
- Produces: `POST` body `{ markdown: string }` (zod: string, 1..400_000). 401/403 via `requireAdmin`; 400 `{ errors: string[] }` for blocking problems or bad body; 201 `{ pageId, slug, slugChanged, warnings, linksCreated, linksFailed }`.

- [ ] **Step 1: Failing tests:** non-admin blocked; invalid body 400; build error 400 with `errors`; success 201 shape; response never includes stack text.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS + tsc.**
- [ ] **Step 5: Commit** `feat(landing): import API route`.

### Task 6: "Import .md" button and result dialog

**Files:**
- Modify: `src/components/admin/landing/LandingPagesList.tsx`
- Create: `src/components/admin/landing/ImportPageDialog.tsx`
- Test: `tests/landing-import-ui.test.tsx` (style of `tests/landing-admin-ui.test.tsx`)

**Interfaces:**
- Consumes: `POST /api/admin/landing-pages/import`.
- Produces: `ImportPageDialog({ onClose }: { onClose: () => void })`.

- [ ] **Step 1: Failing tests:** button "Import .md" opens dialog with file chooser (`.md`/`.txt`) and a paste box; submit sends `{ markdown }`; on 400 the list of `errors` shows in plain text, nothing navigates; on 201 shows "Page created as a draft", the new slug, "Link name changed to <slug> because the old one was taken" only when `slugChanged`, each warning in a "Check these" list, and failed links; button "Open page" goes to `/dashboard/admin/landing-pages/<pageId>`. Also a "Make a page with AI" link beside it to `/dashboard/admin/landing-pages/ai`.
- [ ] **Step 2: FAIL. Step 3: Implement** matching existing design tokens in `LandingPagesList` (see `tests/pz-tokens.test.ts` rules: no raw hex). **Step 4: PASS + tsc. Step 5: Commit** `feat(landing): import .md button and result dialog`.

### Task 7: Pasted bullets become `- ` lists

**Files:**
- Modify: the textarea field component used by the section editor (find with `grep -rn "kind === \"textarea\"" src/components/admin/landing`), reusing `normalizeBullets` from `src/lib/landing/import/parse.ts` (move it to `src/lib/landing/import/bullets.ts` and re-export from parse.ts if that avoids pulling `yaml` into the client bundle; the bundle budget `scripts/check-landing-bundle.mjs` is public-page only but keep the client import light).
- Test: `tests/landing-bullet-paste.test.tsx`

- [ ] **Step 1: Failing test:** paste event on a textarea field with clipboard text `"• a\n● b\n1. c"` sets value `"- a\n- b\n- c"`; pasted plain text without bullets unchanged; typing is not affected.
- [ ] **Step 2: FAIL. Step 3: Implement** `onPaste` handler inserting normalized text at the cursor. **Step 4: PASS + tsc. Step 5: Commit** `feat(landing): convert pasted bullets to lists`.

### Task 8: Master prompts

**Files:**
- Create: `src/lib/landing/import/prompts.ts`
- Test: `tests/landing-import-prompts.test.ts`

**Interfaces:**
- Produces:
```ts
export const IMPORT_FORMAT_ID = "pz-landing/1";
export function masterPrompt(kind: PageKind): string;   // one self-contained prompt per kind
```

- [ ] **Step 1: Failing tests:** each kind's prompt contains `pz-landing/1`; lists exactly the section types in `KIND_SECTIONS[kind]` with their field keys derived from `SECTION_DEFS` (so it can never drift); includes the interview rules text: ask ONE question at a time; ask the teammate EVERY time whether to write marketing copy or keep their exact wording; never invent prices/dates; mention that images are not included; output a single ```` ```markdown ```` block with nothing else after the interview ends; includes a full worked example file that passes `buildImport` (test imports the example and expects `ok: true`); no jargon words "variant", "override", "resolve", "schema" in the teammate-facing instructions.
- [ ] **Step 2: FAIL. Step 3: Implement** shared core builder plus a per-kind block (course: modules/curriculum; workshop: modules possible, short dates; webinar: single event, no curriculum). **Step 4: PASS + tsc. Step 5: Commit** `feat(landing): master prompts for course, workshop, webinar`.

### Task 9: "Make a page with AI" screen

**Files:**
- Create: `src/app/dashboard/admin/landing-pages/ai/page.tsx`, `src/components/admin/landing/MakeWithAi.tsx`
- Test: `tests/landing-make-with-ai.test.tsx`

**Interfaces:**
- Consumes: `masterPrompt(kind)`; `requireAdminPage`.

- [ ] **Step 1: Failing tests:** three kind choices (Course / Workshop / Webinar); three numbered plain steps ("1. Copy the instructions. 2. Paste them in your AI chat (ChatGPT, Claude, Gemini) and attach your course document. 3. Answer its questions, then save the file it gives you and use Import .md."); Copy button writes `masterPrompt(kind)` to clipboard and shows "Copied"; link back to pages list.
- [ ] **Step 2: FAIL. Step 3: Implement** (server page, client component). **Step 4: PASS + tsc. Step 5: Commit** `feat(landing): make-a-page-with-ai screen`.

### Task 10: Dry-run the prompts against the real databases

**Files:**
- Create: `tests/fixtures/landing-import/ppc-batch-3.md`, `mdc-batch-3.md`, `w20-diabetes.md`
- Test: `tests/landing-import-fixtures.test.ts`
- Source data (read-only): `D:\Claude Code Workspace\PZ Academy\PZ Academy LMS & Site\Landing pages\{Course\Data Base (PPC-B3).md, Workshop\MDC3 Database.md, Webinar\_Webinar_20_Database_Document.md}`

- [ ] **Step 1:** For each kind, dispatch a fresh subagent given ONLY `masterPrompt(kind)` and the matching database file; it plays the AI, answers its own interview questions by choosing "keep my exact wording", and writes the resulting `.md`. Save outputs as the fixtures (do not hand-edit; if broken, fix the prompt or the importer, then regenerate).
- [ ] **Step 2: Test:** `buildImport(fixture)` returns `ok: true` for all three; sections for the kind exist; PPC has 4 modules and a UAE price for `full` and each module; no warning mentions a parse problem; record remaining warnings in the ledger.
- [ ] **Step 3:** Run the test; if it fails, classify (prompt unclear vs importer too strict) and fix in a new task commit; rerun.
- [ ] **Step 4: Commit** `test(landing): dry-run master prompts on real course data`.

### Task 11: Verify end-to-end and record status

- [ ] **Step 1:** `tsc --noEmit` = 0 errors; run all `tests/landing-*.test.*` files individually; `tests/pz-tokens.test.ts` shows only the known SalesTeamPanel failure.
- [ ] **Step 2:** Browser check on a dev server (PC 1280): import the PPC fixture through the UI, open the draft, confirm sections, registration, links grid (listed on, rest off), readiness lists empty image slots and `needsReview` fields; import again and confirm slug suffix message. Delete the test pages afterwards (user pastes SQL).
- [ ] **Step 3:** Update memory `pz-academy-landing-easy-mode-status.md`; final whole-branch review by an opus reviewer.
