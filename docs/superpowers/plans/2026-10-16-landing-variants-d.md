# Landing Variants (Sub-project D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One landing page can publish country links, module links and country+module links (`/e/<slug>/uae`, `/e/<slug>/module-2`, `/e/<slug>/uae/module-2`), each with its own sparse edits on top of main, its own registration scope, and its own publish.

**Architecture:** A variant stores only an override layer (`landing_page_variants`). A pure function `resolveVariant(main, variant)` produces an ordinary `LandingContent` (overrides applied, module items filtered, registration narrowed to the variant's region/option), so `LandingRenderer`, the pricing engine and the registration widget need no knowledge of variants beyond receiving a variant path to send back to the API. Public routes, config/quote/register APIs accept a variant path and resolve server-side; region/module can never be chosen client-side.

**Tech Stack:** Next.js 14.2.5 app router (ISR), Supabase (service-role only tables + plpgsql RPCs), zod, vitest, Apps Script via clasp.

**Spec:** `docs/superpowers/specs/2026-10-16-landing-builder-easy-mode-design.md` (section D and "Builder-check decisions"). Later sub-projects A (import), B (hero), C (media) depend on this plan's `ModuleDef`, `VariantOverrides` and `resolveVariant` contracts.

## Global Constraints

- `npm run` is broken: run `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors) and `node node_modules/vitest/vitest.mjs run tests/<file>`. Known failing test: `tests/pz-tokens.test.ts` (SalesTeamPanel only). Never run `next build` while a dev server runs.
- Never regenerate `src/lib/supabase/database.types.ts`; hand-add the new table/column types.
- Variant routes stay static + cacheable: `revalidate = 3600`, `dynamicParams = true`, `generateStaticParams` returns `[]`; public pages must not read cookies/headers. `scripts/check-landing-bundle.mjs` must still PASS.
- Off/unknown/unpublished variant link returns 404. URL segment `status` is reserved (existing `/e/[slug]/status`).
- Variant regions in URLs are lower-case region keys (`uae` for `UAE`); module keys match `^[a-z0-9]+(-[a-z0-9]+)*$` (e.g. `module-2`).
- Overridable unit = one top-level field of a section (a list field is overridden as a whole list), not a path into a list. Orphaned overrides are ignored at render and listed in the editor; they never block publish.
- Module tag applies to items of: curriculum, schedule, pricing_cards, faq, feature_cards, testimonials, stats. Item `module` = "" means "all modules".
- Non-technical users: no new concepts beyond the "Editing:" switcher, "Edited for this link" badge and "Reset to main". Plain-language error text.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits only, never amend. Never push or merge to main without owner approval.

## Review Focus

- Module link must never show another module's curriculum, schedule row, price card or option; and a module with no matching items in a section hides that section rather than showing an empty heading (`resolveVariant` tests, Task 3).
- Region link for a region with no price for the module/option must not render a registrable form with an empty option list: the link is blocked at publish with a plain reason (Task 4 readiness, Task 8).
- Visitor opening `/e/<slug>/uae` while their IP country is Pakistan still sees only UAE (region locked server-side; `pickRegion` must not override) (Task 6/7 tests).
- Main page edited after variant created: untouched fields follow; overridden field keeps override; deleted section leaves orphan listed, not crash (Task 3).
- A forged `v` param (`../`, unknown region, disabled link, unpublished variant) on config/quote/register returns 404 and never writes a registration (Task 6).
- Two admins editing the same variant: second autosave gets a conflict, not an overwrite (Task 5 revision check).

## File Structure

Create:
- `src/lib/landing/variants.ts` — types (`ModuleDef`, `VariantOverrides`, `VariantRef`), `parseVariantPath`, `variantPath`, `defaultModuleHeadline`, `isReservedSegment`.
- `src/lib/landing/resolve-variant.ts` — pure `resolveVariant`, `describeOverrides` (orphans), `emptyOverrides`.
- `src/lib/landing/countries.ts` — static country list: `{ iso2, name, regionKey, currency, timezoneLabel }`.
- `src/lib/data/landing-variants.ts` — server data layer.
- `src/lib/validations/landing-variants.ts` — zod schemas for admin routes.
- `supabase/migrations/0070_landing_variants.sql`
- `src/app/e/[slug]/[...variant]/page.tsx` — public variant route.
- `src/app/api/admin/landing-pages/[id]/variants/route.ts` (GET list/grid, POST create-or-enable)
- `src/app/api/admin/landing-pages/[id]/variants/[variantId]/route.ts` (PATCH draft overrides, DELETE), `.../publish/route.ts`, `.../rollback/route.ts`
- `src/components/admin/landing/variants/VariantSwitcher.tsx`, `LinksPanel.tsx`, `AddCountryDialog.tsx`, `OverrideBadge.tsx`
- Tests: `tests/landing-variants-path.test.ts`, `tests/landing-resolve-variant.test.ts`, `tests/landing-variants-data.test.ts`, `tests/landing-variants-routes.test.ts`, `tests/landing-variants-public.test.tsx`, `tests/landing-variants-admin-ui.test.tsx`

Modify: `src/lib/landing/content.ts` (modules, readiness), `src/lib/landing/sections.ts` (module field kind), `src/components/admin/landing/{FieldInput,SectionForm,LandingEditor,PageSettingsPanel}.tsx`, `src/lib/api/landing-public-http.ts`, `src/lib/data/landing-public.ts`, `src/app/api/landing/[slug]/{config,quote,register}/route.ts`, `src/components/landing/LandingRenderer.tsx` + `registration/{RegistrationHost,RegistrationModal,submit,usePricingQuote,useRegistrationConfig}.ts(x)`, `src/lib/data/landing-registrations.ts`, `src/lib/landing/registration/sheet-row.ts`, `gas/clasp-project/Sheet Sync.js`, `src/lib/supabase/database.types.ts`, `src/lib/data/landing-pages.ts` (revalidate layout).

---

### Task 1: Module model and module-tagged items

**Files:** Modify `src/lib/landing/content.ts`, `src/lib/landing/sections.ts`, `src/components/admin/landing/FieldInput.tsx`; Create `src/lib/landing/variants.ts` (types only here); Test `tests/landing-content.test.ts` (extend).

**Interfaces:**
- Produces in `variants.ts`: `interface ModuleDef { key: string; title: string; format: string; days: number; optionKey: string }` (`format` e.g. "3-Day Workshop"; `optionKey` = the `registration.options[].key` of `kind: "module"` that sells it, "" until linked); `MODULE_KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/`; `MODULE_ITEM_SECTIONS: readonly SectionType[]`.
- Produces: `LandingContent.modules: ModuleDef[]` (default `[]`, max 12), included in `contentSchema`, `normalizeContent`, `emptyContent`.
- Produces: new `FieldKind` `"module"`; every item list field of the sections in `MODULE_ITEM_SECTIONS` gains an item field `{ key: "module", label: "Applies to", kind: "module" }` with default "" (`FieldInput` renders a select: "All modules" plus `content.modules` titles; hidden entirely when the page has no modules).

- [ ] **Step 1: Failing tests** in `tests/landing-content.test.ts`: `normalizeContent` of a document without `modules` returns `modules: []`; invalid module keys (`"Module 2"`, 13th module) are dropped/rejected by `contentSchema`; `defaultSectionData("curriculum")` items carry `module: ""`; saving old content (items without `module`) still passes `sectionDataSchema`.
- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run tests/landing-content.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement the types, schema, normalization, the `module` item field, and the select rendering. Existing pages without modules must render and edit exactly as before (no select shown).
- [ ] **Step 4:** Extend `computeReadiness` (same file) with: duplicate module keys, module `optionKey` set but missing from `registration.options`, module `optionKey` option lacking a price in a region of the page ("<Module> has no price for <Region>"). Tests: one per problem, using plain-language `Problem.message`.
- [ ] **Step 5:** Run content tests + `tsc --noEmit` (0 errors). Commit `feat(landing): module model and module-tagged items`.

---

### Task 2: Variant paths

**Files:** Modify `src/lib/landing/variants.ts`; Test `tests/landing-variants-path.test.ts`.

**Interfaces:**
- Produces: `interface VariantRef { regionKey: string | null; moduleKey: string | null }`
- Produces: `parseVariantPath(segments: string[], content: Pick<LandingContent, "modules" | "registration">): VariantRef | null` — 1 or 2 segments; region segment = lower-case match of a `registration.regions[].key`; module segment = a `modules[].key`; order region then module; `null` for anything else (unknown, 3 segments, reserved `status`, empty, case-mismatch of module, `..`).
- Produces: `variantPath(ref: VariantRef): string` (`"uae"`, `"module-2"`, `"uae/module-2"`, `""` for main) and `variantQuery(ref): string` (same value used as the `v` API param); `isReservedSegment(s: string): boolean` (`status`).

- [ ] **Step 1: Failing tests:** `parseVariantPath(["uae"], c)` → `{regionKey:"UAE", moduleKey:null}`; `["uae","module-2"]` both; `["module-2"]` module only; `["module-2","uae"]` → null; `["status"]` → null; `["nope"]`, `[]`, `["uae","module-2","x"]`, `["UAE"]` (upper-case must be 404-able: decide: accept case-insensitively for region, return canonical) — assert region accepted case-insensitively, module exact. `variantPath` round-trips.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(landing): variant path parsing`.

---

### Task 3: `resolveVariant` (pure core)

**Files:** Create `src/lib/landing/resolve-variant.ts`; Modify `src/lib/landing/variants.ts` (add `VariantOverrides`); Test `tests/landing-resolve-variant.test.ts`.

**Interfaces:**
- Consumes: `LandingContent`, `ModuleDef`, `VariantRef`.
- Produces: `interface VariantOverrides { sections: Record<string, { hidden?: boolean; fields?: Record<string, unknown> }>; order?: string[]; settings?: Partial<LandingSettings>; seo?: Partial<LandingSeo> }`; `emptyOverrides(): VariantOverrides`.
- Produces: `resolveVariant(main: LandingContent, ref: VariantRef, overrides: VariantOverrides): LandingContent`.
- Produces: `findOrphans(main: LandingContent, overrides: VariantOverrides): { sectionIds: string[]; fields: { sectionId: string; field: string }[] }`.
- Produces: `defaultModuleHeadline(m: ModuleDef): string` = `` `${m.format}: ${m.title}` `` (in `variants.ts`).

Order of resolution (document in a header comment): 1) apply `sections[id].fields` (only keys that exist in that section's `SECTION_DEFS` fields) and `hidden` (sets `enabled=false`), unknown section ids ignored; `order` reorders known ids, unknown ids dropped, sections missing from `order` keep relative position at the end; `settings`/`seo` shallow-merged. 2) module filter when `ref.moduleKey`: for sections in `MODULE_ITEM_SECTIONS`, drop list items whose `module` is non-empty and different from the key; a section whose required list becomes empty is disabled. 3) registration narrowing: when `ref.regionKey` keep only that region, set `defaultRegionKey`, prune `prices[*]` to that region, drop options with no price in it; when `ref.moduleKey` keep only the module's `optionKey` option (kind `module`), set `moduleMix.enabled=false`, and remove tiers not priced for it; drop `modules`' other entries from the output. Never mutates inputs.

- [ ] **Step 1: Failing tests** (each its own `it`): override replaces `headline` and leaves `subheadline` following main after main changes; `hidden` disables a section; unknown section id and unknown field key ignored; `order` honored; module curriculum filtered to `module-2` items plus items tagged ""; schedule filtered; price cards of other modules dropped; FAQ item tagged `module-1` absent on `module-2` link; section whose items all removed is disabled; region UAE leaves exactly one region and only UAE prices; module `module-2` leaves exactly its option and no bundle option; module `optionKey` = "" returns registration with `enabled: false`; UAE+module-2 combines; main (`{null,null}`) with empty overrides deep-equals input; input objects unchanged (deep-freeze them); `findOrphans` reports deleted section and a field key that no longer exists.
- [ ] **Step 2–4:** Run, implement, run until PASS.
- [ ] **Step 5:** Commit `feat(landing): pure variant resolver`.

---

### Task 4: Migration and types

**Files:** Create `supabase/migrations/0070_landing_variants.sql`; Modify `src/lib/supabase/database.types.ts` (hand-add); Test `tests/landing-variants-data.test.ts` begins here (types only compile check via tsc).

**Interfaces (database):**
- `landing_page_variants(id uuid pk, page_id uuid fk → landing_pages on delete cascade, region_key text null, module_key text null, enabled boolean default false, draft jsonb not null default '{"sections":{}}', published jsonb null, revision int default 1, published_at timestamptz null, created_at, updated_at)`; unique `(page_id, coalesce(region_key,''), coalesce(module_key,''))`; check at least one of region/module non-null; region matches `^[A-Z]{2,6}$`, module matches slug regex.
- `landing_variant_versions(id, variant_id fk cascade, version int, content jsonb, created_by, created_at)` unique `(variant_id, version)`.
- RLS on, zero policies (service-role only), like 0067.
- `landing_publish_variant(p_variant_id uuid, p_user uuid, p_revision int default null) returns int` and `landing_rollback_variant(p_variant_id uuid, p_version int, p_user uuid) returns int` — same locking and fixed error messages as 0068 (`landing_variant_not_found`, `landing_version_not_found`, `landing_revision_conflict`); publish refuses (`landing_main_not_published`) when the parent page has no `published`. `revoke ... from public, anon, authenticated; grant ... to service_role`.
- `alter table landing_registrations add column variant_key text not null default ''`.

- [ ] **Step 1:** Write the migration with a header comment explaining the model, mirroring 0068's style.
- [ ] **Step 2:** Hand-add `landing_page_variants`, `landing_variant_versions` Row/Insert/Update types, the RPC signatures, and `variant_key` on `landing_registrations` in `database.types.ts` (do not regenerate).
- [ ] **Step 3:** `tsc --noEmit` → 0 errors.
- [ ] **Step 4:** Give the owner the migration SQL to paste in Supabase (Supabase MCP is read-only). After they confirm, verify read-only via MCP: tables exist, `variant_key` column exists, both functions exist.
- [ ] **Step 5:** Commit `feat(landing): variants schema`.

---

### Task 5: Variants data layer

**Files:** Create `src/lib/data/landing-variants.ts`; Modify `src/lib/data/landing-pages.ts` (publish/rollback revalidation); Test `tests/landing-variants-data.test.ts`.

**Interfaces:**
- Produces types: `LandingVariant { id; pageId; ref: VariantRef; enabled; draft: VariantOverrides; published: VariantOverrides | null; revision; publishedAt: string | null }`.
- Produces functions (all server-only, service role, results shaped like `landing-pages.ts`: `{ ok: true, ... } | { ok: false, reason }`):
  - `listVariants(pageId: string): Promise<LandingVariant[]>`
  - `ensureVariant(pageId: string, ref: VariantRef, enabled: boolean): Promise<{ok:true; variant: LandingVariant} | {ok:false; reason:"not-found"|"bad-ref"|"db-error"}>` — creates if missing; on creation of a module variant seeds `draft.sections[<hero section id>].fields.headline = defaultModuleHeadline(module)` when the page has a hero section and a module with that key; validates ref against main draft's regions/modules.
  - `saveVariantDraft(variantId: string, overrides: VariantOverrides, baseRevision: number)` → `{ok:true; revision}` | conflict/not-found/db-error (same optimistic `.eq("revision", base)` pattern as `saveDraft`).
  - `setVariantEnabled(variantId, enabled)`; `deleteVariant(variantId)`.
  - `publishVariant(userId, variantId)` — checks readiness of the *resolved* draft (`resolveVariant(main.published, ref, draft)` through existing `computeReadiness` plus: region/module option has a price, else `not-ready` with plain problems) then calls the RPC, then `revalidatePath(`/e/${slug}`, "layout")`.
  - `rollbackVariant(userId, variantId, version)`; `listVariantVersions(variantId)`.
  - `getPublishedVariantPage(slug: string, segments: string[])`: loads main published, `parseVariantPath`, finds enabled+published variant, returns `{ page, content: LandingContent (resolved), ref, status }` or `null`.
- Modify `publishLandingPage`/`rollbackLandingPage`: replace `revalidatePath(`/e/${slug}`)` with `revalidatePath(`/e/${slug}`, "layout")` so main publishes refresh every variant.

- [ ] **Step 1: Failing tests** with the repo's existing Supabase mocking style (see `tests/landing-data.test.ts`): creating a module variant seeds the headline override; `ensureVariant` with unknown region → `bad-ref`; second `saveVariantDraft` with stale revision → `conflict`; `publishVariant` when main unpublished → `not-ready`/`main-not-published`; publish blocked when module's option has no price in the region; `getPublishedVariantPage` returns `null` for disabled, unpublished, unknown path; returns resolved content for enabled+published; publishing main calls `revalidatePath` with `"layout"`.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS), `tsc` 0.
- [ ] **Step 5:** Commit `feat(landing): variants data layer`.

---

### Task 6: Public route and registration APIs accept a variant

**Files:** Create `src/app/e/[slug]/[...variant]/page.tsx`; Modify `src/lib/api/landing-public-http.ts`, `src/lib/data/landing-public.ts`, `src/app/api/landing/[slug]/{config,quote,register}/route.ts`, `src/lib/data/landing-registrations.ts`; Test `tests/landing-variants-public.test.tsx`, `tests/landing-variants-routes.test.ts`, extend `tests/landing-route-static.test.ts`.

**Interfaces:**
- `loadPublicPage(slug, opts: { registration: boolean; variant?: string | null })`: `variant` is the raw `v` query value (`"uae/module-2"`); when present it is parsed (`split("/")`), and the gate returns the *resolved* page: `page.registration` and `page.content` come from the variant. Invalid, unknown, disabled or unpublished → 404 `Page not found`. A page still gets 404 for `v` containing anything outside `[a-z0-9/-]`, length > 80.
- `RegistrablePage` gains `variantKey: string` (the `variantPath`, "" for main).
- `createRegistration` input gains `variantKey` and stores it in `variant_key`.
- Route `src/app/e/[slug]/[...variant]/page.tsx`: same static settings as `src/app/e/[slug]/page.tsx` (`revalidate = 3600`, `dynamicParams = true`, `generateStaticParams` → `[]`); metadata from the resolved content; renders `LandingRenderer` with new optional prop `variant?: string` (the path) passed to `RegistrationHost`.

- [ ] **Step 1: Failing tests:** variant page renders resolved headline (override) and only that module's curriculum; `/e/slug/status` still resolves to the status page (static segment wins) — assert file layout; `config?v=uae` returns registration with exactly one region; `config?v=../x`, `v=nope`, disabled link → 404 with `no-store`; `quote` and `register` with `?v=uae/module-2` price against the narrowed config (a payload naming a different option → existing `no_option` error, not a price); a register for variant stores `variant_key = "uae/module-2"`; register without `v` stores `""`; route-static test: new route exports the static settings and does not import `next/headers` or cookies.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS), `tsc` 0, `node scripts/check-landing-bundle.mjs` PASS.
- [ ] **Step 5:** Commit `feat(landing): public variant routes and registration scope`.

---

### Task 7: Widget passes the variant and locks the choice

**Files:** Modify `src/components/landing/LandingRenderer.tsx`, `registration/RegistrationHost.tsx`, `RegistrationModal.tsx`, `RegistrationLauncher.tsx` (if it holds slug), `submit.ts`, `usePricingQuote.ts`, `useRegistrationConfig.ts`, `StepChoose.tsx`, `src/lib/landing/registration/region-pick.ts`; Test `tests/landing-registration-client.test.tsx`, `tests/landing-registration-modal.test.tsx` (extend).

**Interfaces:** optional prop `variant?: string` threaded `LandingRenderer → RegistrationHost → RegistrationModal → config/quote/register fetches`, appended as `?v=<encodeURIComponent(variant)>` only when non-empty (main page URLs unchanged). Config with exactly one region: region chooser hidden (already true for `regions.length > 1`), `pickRegion` result = that region regardless of IP country or `?region=`. Config with exactly one option: option step shows it pre-selected and non-toggleable.

- [ ] **Step 1: Failing tests:** with `variant="uae/module-2"` the three fetch URLs include `?v=uae%2Fmodule-2`; without it none include `v`; visitor country `PK` with a UAE-only config selects `UAE`; single-option config shows the module name and no "mix modules" control.
- [ ] **Step 2–4:** Run, implement, run (PASS), `tsc` 0.
- [ ] **Step 5:** Commit `feat(landing): registration widget variant scope`.

---

### Task 8: Sheet column and GAS

**Files:** Modify `src/lib/landing/registration/sheet-row.ts` (`SHEET_HEADERS` append `"Link"`; `SheetRegistration.variantKey`; `toSheetRow` appends it, empty string for main), `src/lib/data/landing-event-sheet.ts` (pass the field), `gas/clasp-project/Sheet Sync.js`; Test `tests/landing-registration-sheet-row.test.ts`, `tests/landing-event-sheet.test.ts` (extend).

- [ ] **Step 1: Failing tests:** header list ends with `"Link"`; row for variant registration has `"uae/module-2"` in the last column; main page registration has `""`; existing columns A–W unchanged (assert indexes).
- [ ] **Step 2–4:** Implement; make the GAS header setup/append logic tolerate the new final column (existing sheets get the header added without disturbing data; check how GAS currently writes headers and extend it, do not rewrite columns).
- [ ] **Step 5:** Deploy GAS with clasp from `gas/clasp-project/` (never the web editor "New version"; see memory note on clasp deploy). Report to the owner the deployment version for the ledger. Commit `feat(landing): Link column in registration sheet`.

---

### Task 9: Admin API

**Files:** Create `src/lib/validations/landing-variants.ts` and the four route files listed in File Structure; Test `tests/landing-variants-routes.test.ts` (admin section).

**Interfaces:** All under `requireAdmin()`. `GET /variants` → `{ variants: LandingVariant[]; grid: { ref: VariantRef; label: string; path: string; variantId: string | null; enabled: boolean; published: boolean }[] }` where `grid` is every `regions × (null + modules)` plus `null × modules` combination built from main **draft** (labels like "UAE", "Module 2", "UAE · Module 2"). `POST /variants` body `{ regionKey: string|null; moduleKey: string|null; enabled: boolean }` → `ensureVariant`. `PATCH /variants/[variantId]` body `{ overrides: VariantOverrides; baseRevision: number }` (zod strict shape; size cap 100 KB; 409 on conflict). `DELETE`, `POST .../publish` (returns problems list on `not-ready`), `POST .../rollback` `{ version }`.

- [ ] **Step 1: Failing tests:** 401/403 for non-admin on every route; grid has expected count for 2 regions × 4 modules (2 + 4 + 8 = 14 combos plus none for main); PATCH conflict → 409; publish not-ready returns `problems`; malformed overrides (non-object field map, > cap) → 400.
- [ ] **Step 2–4:** Run, implement, run (PASS), `tsc` 0.
- [ ] **Step 5:** Commit `feat(landing): variants admin API`.

---

### Task 10: Editor — switcher, overrides, reset

**Files:** Create `src/components/admin/landing/variants/VariantSwitcher.tsx`, `OverrideBadge.tsx`; Modify `LandingEditor.tsx`, `SectionForm.tsx`, `SectionList.tsx`, `PreviewFrame.tsx`, `src/hooks/useAutosaveDraft.ts` (generalize target: page or variant); Test `tests/landing-variants-admin-ui.test.tsx`.

**Interfaces:** `VariantSwitcher({ options: { id: string | null; label: string }[]; value: string | null; onChange })` rendered at the top of the editor, label "Editing:"; options = main + enabled variants only (the Links panel enables more). `OverrideBadge({ overridden: boolean; onReset: () => void })` shows "Edited for this link" with a "Reset to main" button, rendered next to a field only while a variant is selected. While a variant is selected: `SectionForm` shows main's value for non-overridden fields and writes changes into the variant's `overrides.sections[id].fields[key]`; per-section toggle "Hide on this link" and move up/down write `hidden` / `order`; the page-level Settings/Registration tabs are read-only with a note "These apply to all links. Edit them on the main page."; preview loads the variant path through the existing preview route extended with `?v=` (draft overrides applied via `resolveVariant`); orphans appear as a collapsed notice "N edits no longer apply" with a Remove button. Autosave goes to `PATCH .../variants/[variantId]` with the variant's own revision.

- [ ] **Step 1: Failing tests:** switching to "Module 2" shows main values; typing in headline shows the badge and calls PATCH with `{sections:{[id]:{fields:{headline:"…"}}}}`; Reset removes just that key; "Hide on this link" patches `hidden:true` and leaves main unchanged (no main save call); main selected → badge never shown; registration tab read-only in a variant; orphan notice with Remove.
- [ ] **Step 2–4:** Run, implement, run (PASS), `tsc` 0.
- [ ] **Step 5:** Commit `feat(landing): edit variants in the page editor`.

---

### Task 11: Links panel, Add country, variant publish

**Files:** Create `LinksPanel.tsx`, `AddCountryDialog.tsx`, `src/lib/landing/countries.ts`; Modify `LandingEditor.tsx` (new "Links" tab beside Settings), `PageSettingsPanel.tsx` (modules editor: title, format, days, linked option), `VersionsPanel.tsx` (variant versions + restore); Test `tests/landing-variants-admin-ui.test.tsx` (extend).

**Interfaces:** `LinksPanel` renders the `grid` from `GET /variants` as rows: label, URL (copy button, full public URL), a switch (on/off = `enabled`), a "Publish" button (disabled until main is published; shows plain problems on `not-ready`), published badge. `AddCountryDialog({ onAdd: (r: RegionDef, prices: …) => void })`: pick country from `COUNTRIES` (search), pre-fills `key`, `currency`, `timezoneLabel`; admin enters class time, picks payment accounts from the existing account list, and a price per existing option; a country with no payment account cannot be added (plain message), writes into `content.registration.regions` and `prices`. Modules editor lives under page Settings ("Modules"), only for course/workshop pages.

- [ ] **Step 1: Failing tests:** grid shows 14 rows for 2 regions × 4 modules with all switches off; switching on calls `POST /variants`; Publish disabled while main is draft with tooltip text "Publish the main page first"; AddCountryDialog refuses when no payment account chosen, otherwise adds region + prices and the grid gains rows; copy button copies `https://<host>/e/<slug>/uae/module-2`.
- [ ] **Step 2–4:** Run, implement, run (PASS), `tsc` 0, `lint` clean on touched files.
- [ ] **Step 5:** Commit `feat(landing): links panel, add country, variant publish`.

---

### Task 12: End-to-end check and notes

- [ ] **Step 1:** Run `tsc` (0), vitest for all `tests/landing-*.test.ts*` (only the known `pz-tokens` failure may remain), `node scripts/check-landing-bundle.mjs` (PASS).
- [ ] **Step 2:** Browser check on a dev server (check `netstat` first; Playwright MCP): create a course page from the PPC template with 4 modules and UAE + PK regions; enable `uae`, `module-2`, `uae/module-2`; publish main then each; verify on desktop 1280 and phone 390: module link shows only Module 2 curriculum and a "3-Day Workshop: …" hero, registration modal shows only Module 2 in AED, a Pakistan-IP visit to `/uae` stays UAE (set `?` header is not possible: assert via config response), `/status` still works, off link 404, `x-nextjs-cache: HIT` on second hit. Use the admin's own test mode registration and confirm `variant_key` and the sheet "Link" column. Remove all test rows afterwards via SQL the owner pastes.
- [ ] **Step 3:** Add a "Status" section at the end of this plan and update the memory file `pz-academy-landing-page-builder-status.md`. Commit `docs: variants status`.
