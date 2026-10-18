# Landing Hero, Buttons and Mobile Fit (sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New hero (photo or poster, PC 16:9 and phone 9:16), a typed second button with a shared WhatsApp number list, a Live/Recorded dropdown on Register, and automatic mobile fit with one "Text size" choice per section.

**Architecture:** Everything stays in the existing section-descriptor system (`src/lib/landing/sections.ts` drives editor form, schema, defaults, normalizer). Three new field kinds (`choice`, `sectionRef`, `whatsapp`) plus an optional `showWhen`. Hero renderer gains three styles. Register button gains a small client dropdown that passes a pre-selected mode through the existing registration bus into the modal. One new table holds the shared WhatsApp numbers.

**Tech Stack:** Next.js 14.2.5 App Router, TypeScript, zod, Tailwind (`landing-*` tokens), Supabase (service role, RLS on, no policies), vitest.

**Spec:** `docs/superpowers/specs/2026-10-17-landing-hero-b-design.md` (decisions of 2026-10-17) and `docs/superpowers/specs/2026-10-16-landing-builder-easy-mode-design.md` section B.

## Global Constraints

- `npm run` is broken. Use `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors) and `node node_modules/vitest/vitest.mjs run tests/<file>`. Known failing test: `tests/pz-tokens.test.ts` (only SalesTeamPanel). Never run `next build` while a dev server runs. Never regenerate `database.types.ts`; hand-add the new table entry.
- Supabase MCP is read-only. A task that needs SQL writes the migration file and stops; the controller gives it to the owner to paste. Never apply it.
- Visible text uses plain words ("link", "country", "module"); never "variant", "override", "resolve", "schema", "YAML". No jargon for non-technical editors; defaults need no decisions.
- Official WhatsApp numbers (digits): `923700199429`, `923242167718`. Number validation: digits only, 8 to 15 digits (same rule as `registration/config.ts`).
- Existing pages keep today's hero look (`classic`) until someone chooses a new style. New pages default to `photo`.
- Hero images: PC 16:9, phone 9:16, served by `<picture>` so one downloads; the LCP image keeps `priority`. One image only is used for both screens (cover for `photo`, contain for `poster`).
- Public page stays static and under the bundle budget (`scripts/check-landing-bundle.mjs`); the Register dropdown is the only new client code on the page and must be tiny.
- Commits: new commits only, never amend. Trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never push or merge to main.
- Do not touch `docs/lead-capture-go-live-guide.md`.

## Review Focus

- A page saved before this change (hero with only `image`, secondary label and url, no new keys) renders and edits exactly as before, with style `classic` and secondary type `link`.
- A secondary button of type `section` whose target section was deleted or disabled: no broken anchor; the button is hidden and the checklist says so.
- A WhatsApp number stored on a page that is later removed from the shared list still works on the published page.
- Hero with only a phone image, only a PC image, or neither renders without a broken image or layout jump on both screens.
- Register dropdown with registration off, closed page, or one mode only: no dropdown, behaves as today. Pre-selected mode survives the modal's closed-then-reopened state.

---

## File Structure

- Modify `src/lib/landing/sections.ts`: field kinds, hero fields, `textSize` on every section, hero legacy normalization.
- Modify `src/lib/landing/content.ts`: hero readiness problems.
- Create `src/lib/landing/whatsapp.ts`: official numbers constant, `cleanWhatsappNumber`.
- Create `supabase/migrations/0071_landing_whatsapp_numbers.sql`, `src/lib/data/landing-whatsapp.ts`, `src/app/api/admin/landing-whatsapp/route.ts`, `src/app/api/admin/landing-whatsapp/[id]/route.ts`; modify `src/types/database.types.ts` (hand-add).
- Modify `src/components/admin/landing/FieldInput.tsx`, `SectionForm.tsx`; create `src/components/admin/landing/WhatsappNumberField.tsx`.
- Modify `src/components/landing/sections/Hero.tsx`, `LandingRenderer.tsx`, `LandingImage.tsx` (or create `LandingPicture.tsx`).
- Modify `src/components/landing/RegisterButton.tsx`; create `src/components/landing/RegisterMenu.tsx`; modify `registration/registration-bus.ts`, `RegistrationHost.tsx`, `RegistrationModal.tsx`, `StepChoose.tsx`.
- Tests: `tests/landing-hero-content.test.ts`, `tests/landing-whatsapp.test.ts`, `tests/landing-whatsapp-routes.test.ts`, `tests/landing-hero-render.test.tsx`, `tests/landing-register-menu.test.tsx`, `tests/landing-hero-editor.test.tsx`. Follow the style of the existing `tests/landing-*.test.ts(x)` files.

---

### Task 1: Content model (hero fields, field kinds, text size)

**Files:**
- Modify: `src/lib/landing/sections.ts`, `src/lib/landing/content.ts`
- Test: `tests/landing-hero-content.test.ts`

**Interfaces:**
- Produces: `FieldKind` gains `"choice" | "sectionRef" | "whatsapp"`. `FieldDef` gains `options?: { value: string; label: string }[]` and `showWhen?: { key: string; equals: string }` and `hintLength?: number` (soft recommended maximum, never blocks).
- Produces hero keys (all strings): `heroStyle` (`"photo" | "poster" | "classic"`, default `"photo"`), `imagePc`, `imagePhone` (image kind), `image` (legacy, shown only when `heroStyle` is `classic`), `secondaryCtaType` (`"section" | "link" | "whatsapp"`, default `"link"`), `secondaryCtaSection` (a section id), `secondaryCtaUrl` (existing), `secondaryCtaWhatsapp` (digits).
- Produces on EVERY section type: `textSize` (`"normal" | "small"`, default `"normal"`, kind `choice`, label "Text size"), added by a wrapper like `withModuleTags`.

- [ ] **Step 1: Write failing tests** in `tests/landing-hero-content.test.ts`:
  - `normalizeSectionData("hero", { image: "https://x/a.jpg", headline: "H" })` gives `heroStyle: "classic"`, `secondaryCtaType: "link"`, `textSize: "normal"`, `image` kept.
  - Same with no `image` gives `heroStyle: "photo"`.
  - `{ secondaryCtaLabel: "Go", secondaryCtaUrl: "https://x.com" }` (old page) gives `secondaryCtaType: "link"`; an unknown `heroStyle: "weird"` falls back to the default; unknown `textSize` falls back to `"normal"`.
  - `defaultSectionData("hero").heroStyle === "photo"`.
  - `sectionDataSchema("hero")` rejects `secondaryCtaWhatsapp: "abc"` and accepts `"923700199429"` and `""`.
  - Every `SECTION_TYPES` entry has a `textSize` field.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-hero-content.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `sections.ts`: new kinds in `FieldKind`, `fieldSchema` and `defaultForField` (choice = `z.enum` of option values, falls back to `defaultValue`; `sectionRef` = string max 64; `whatsapp` = `z.string().regex(/^(\d{8,15})?$/)`). Hero legacy rule in `normalizeSectionData`: when `type === "hero"` and the raw data has no `heroStyle` key and a non-empty `image`, force `heroStyle: "classic"`; when raw has no `secondaryCtaType` and a non-empty `secondaryCtaUrl`, force `"link"`. Hero field order: eyebrow, headline, subheadline, heroStyle, imagePc, imagePhone, image (showWhen classic), primary label, secondary label, secondaryCtaType, secondaryCtaSection / secondaryCtaUrl / secondaryCtaWhatsapp (each with `showWhen` on the type), dateLine, badges. Add `hintLength` to eyebrow (50), headline (70), subheadline (220), dateLine (60). Plain-word labels: "Hero style" with options "Photo with text on top", "Finished poster", "Picture beside text (old style)"; "Picture for computers (wide, 16:9)", "Picture for phones (tall, 9:16)"; "Second button does" with options "Go to a section", "Open a link", "Chat on WhatsApp".
- [ ] **Step 4: Run** the test, then `node node_modules/typescript/bin/tsc --noEmit` and `tests/landing-content.test.ts`, `tests/landing-data.test.ts`. Expected: PASS, tsc 0 errors. Fix fallout in existing tests only if an exact-shape assertion on hero data breaks (update the expected object, not the code).
- [ ] **Step 5: Commit** `feat(landing): hero style, second button type and text size fields`.

### Task 2: Shared WhatsApp numbers (storage + API)

**Files:**
- Create: `src/lib/landing/whatsapp.ts`, `supabase/migrations/0071_landing_whatsapp_numbers.sql`, `src/lib/data/landing-whatsapp.ts`, `src/app/api/admin/landing-whatsapp/route.ts`, `src/app/api/admin/landing-whatsapp/[id]/route.ts`
- Modify: `src/types/database.types.ts` (hand-add table)
- Test: `tests/landing-whatsapp.test.ts`, `tests/landing-whatsapp-routes.test.ts`

**Interfaces:**
- Produces `src/lib/landing/whatsapp.ts`: `OFFICIAL_WHATSAPP: readonly { label: string; number: string }[]` (the two official numbers, labels "PZ Academy main" and "PZ Academy second"); `cleanWhatsappNumber(input: string): string | null` (strips spaces, `+`, dashes, brackets; null unless 8 to 15 digits).
- Produces `listWhatsappNumbers(): Promise<WhatsappNumberRow[]>` (official first, `official: true`, no id; then saved rows `{ id, label, number, official: false }`), `addWhatsappNumber(input: { label: string; number: string }, userId: string): Promise<{ ok: true; row } | { ok: false; reason: "invalid" | "duplicate" | "error" }>`, `deleteWhatsappNumber(id: string): Promise<{ ok: boolean }>`. Adding an official number is `duplicate`.
- Produces routes (all `requireAdmin`, keep the permission check in that single helper): `GET /api/admin/landing-whatsapp` returns `{ numbers }`; `POST` body `{ label, number }` returns `{ number }` (400 plain message on invalid, 409 on duplicate); `DELETE /[id]` (404 for a non-uuid id, official numbers have no id so cannot be deleted).

- [ ] **Step 1: Failing tests.** `landing-whatsapp.test.ts`: `cleanWhatsappNumber("+92 370 0199429") === "923700199429"`, `("0370")` null, `("abc")` null, 16 digits null, `OFFICIAL_WHATSAPP` numbers equal the two digits strings. Routes test (mock `requireAdmin` and the data layer like `landing-admin-promo-routes.test.ts`): non-admin gets the auth response; POST with `"+92 300 1234567"` stores `923001234567`; bad number 400; duplicate 409; DELETE bad id 404.
- [ ] **Step 2: Run** both, expect FAIL.
- [ ] **Step 3: Implement.** Migration: table `public.landing_whatsapp_numbers (id uuid pk default gen_random_uuid(), label text not null check (char_length(label) between 1 and 60), number text not null unique check (number ~ '^[0-9]{8,15}$'), created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now())`, RLS enabled, zero policies, header comment in the style of 0070. Data layer uses `createAdminSupabase()` and `import "server-only"`; errors throw only for reads (like payment accounts). Hand-add the table's Row/Insert/Update/Relationships to `database.types.ts` following a neighbouring entry.
- [ ] **Step 4: Run** tests and tsc. Expected: PASS, 0 errors. Do NOT apply the migration.
- [ ] **Step 5: Commit** `feat(landing): shared WhatsApp number list`. Report that migration 0071 is written and waiting for the owner to run it.

### Task 3: Editor controls

**Files:**
- Modify: `src/components/admin/landing/FieldInput.tsx`, `SectionForm.tsx` (and wherever `SectionForm` gets `modules`, to also pass the page's enabled sections)
- Create: `src/components/admin/landing/WhatsappNumberField.tsx`
- Test: `tests/landing-hero-editor.test.tsx`

**Interfaces:**
- Consumes: Task 1 field kinds and `showWhen`/`hintLength`; Task 2 routes.
- Produces: `FieldInput` new optional prop `sections?: { id: string; label: string }[]` (enabled sections of the page, excluding the hero itself; label from `SECTION_DEFS[type].navLabel ?? label`). `SectionForm` hides a field whose `showWhen` does not match the current data.

- [ ] **Step 1: Failing tests**: with hero data `heroStyle: "photo"` the legacy "image" control is absent and `classic` shows it; `secondaryCtaType: "section"` shows only the section dropdown (list matches the `sections` prop); `"whatsapp"` shows the number dropdown; a text field with `hintLength` shows "Best under 70 characters" and, past it, a soft note (no `role="alert"`, never blocks typing); choice field renders a native `<select>` with the plain labels; `WhatsappNumberField` (fetch mocked) lists both official numbers first, defaults to the first when value is empty and a user picks, "Add a number" form posts and selects the new number, a removed-from-list stored value still shows as selected as "{number} (not in list)".
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement.** `choice` and `sectionRef` use the same native select styling as the `module` kind. `WhatsappNumberField` fetches `GET /api/admin/landing-whatsapp` on mount, stores digits only in the page, offers delete only on non-official saved numbers with a confirm line in plain words. Plain error text, no jargon.
- [ ] **Step 4: Run** tests, tsc, `tests/landing-admin-ui.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): editor controls for hero style, second button and WhatsApp numbers`.

### Task 4: Hero renderer

**Files:**
- Modify: `src/components/landing/sections/Hero.tsx`, `src/components/landing/LandingImage.tsx` or create `src/components/landing/LandingPicture.tsx`
- Test: `tests/landing-hero-render.test.tsx`

**Interfaces:**
- Produces: `LandingPicture({ pc, phone, alt, fit, priority, className }: { pc: string; phone: string; alt: string; fit: "cover" | "contain"; priority?: boolean; className?: string })`. Renders `<picture>` with `<source media="(min-width: 768px)" srcSet={coverProxyUrl(pc||phone)}>` and an `<img>` of the phone image (falls back to the PC one), explicit aspect-ratio box (16:9 at md and up, 9:16 below) so there is no layout shift, `fetchpriority="high"` and eager when `priority`. Both images go through `coverProxyUrl`.
- Hero behaviours: `classic` renders the current markup unchanged. `photo`: the picture fills the hero as a background with a dark fade (gradient overlay) and white text on top; with no image at all it falls back to the plain hero background and dark text. `poster`: picture shown whole (contain) with only the Register button, second button and date line below it. Second button: `section` becomes `<a href="#id">` only when that section id is in the page's enabled sections (the Hero gets this via a new optional `SectionProps.sectionIds?: string[]` filled by `LandingRenderer`); `link` as today (safe URL only); `whatsapp` becomes `https://wa.me/<digits>` opening in a new tab. A second button whose target is missing or unsafe renders nothing.

- [ ] **Step 1: Failing tests** (render with `renderToStaticMarkup` like existing public tests): classic output equals today's markup for old data; photo with both images has one `<picture>`, a `source` with the PC image, the phone image in `img`, `fetchpriority="high"`; only phone image: no `source` for a different file, both screens use it; no images: no `<picture>`, no broken `img`; poster has contain class and no headline overlay; second button of each type; `section` target not in `sectionIds` renders no second button; unsafe URL renders none; headline has no horizontal-overflow-prone fixed width classes (assert `break-words` present).
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement** to the behaviours above. Reuse existing `landing-*` tokens; headline sizes step down on small screens and use `break-words` (word-wrap) so long words wrap.
- [ ] **Step 4: Run** tests, tsc, `tests/landing-public-polish.test.tsx`, `tests/landing-final-fixes.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): photo, poster and classic hero with typed second button`.

### Task 5: Live / Recorded dropdown on Register

**Files:**
- Create: `src/components/landing/RegisterMenu.tsx` (client)
- Modify: `src/components/landing/RegisterButton.tsx`, `src/components/landing/LandingRenderer.tsx`, `registration/registration-bus.ts`, `registration/RegistrationHost.tsx`, `registration/RegistrationModal.tsx`, `registration/StepChoose.tsx`
- Test: `tests/landing-register-menu.test.tsx`

**Interfaces:**
- Produces: `Register` gains `modes?: Mode[]` (from `c.registration.modes`, set only when `builtIn`). `openRegistration(from?: HTMLElement | null, opts?: { mode?: Mode })`; `onOpenRegistration(listener: (opts: { mode?: Mode }) => void)`. `RegistrationModal` gains optional prop `initialMode?: Mode` applied to the form each time it opens with one. `StepChoose` gains optional `modeLocked?: boolean`; when true the "How do you want to learn?" fieldset is not rendered (the mode is already chosen).
- Behaviour: `RegisterButton` renders `RegisterMenu` instead of `RegistrationLauncher` only when `register.builtIn` and `register.modes.length > 1`. The menu is a button "Register now" that opens a small list "Join Live" / "Join Recorded Lectures"; choosing one calls `openRegistration(el, { mode })`. Keyboard: Enter/Space opens, arrows move, Escape closes and refocuses; closes on outside click. Registration off, closed page, or one mode: unchanged button.

- [ ] **Step 1: Failing tests**: two modes shows a menu with both items and picking "Recorded" opens with `{ mode: "recorded" }`; one mode renders the plain launcher; closed page renders the notice; Escape closes and returns focus; the modal with `initialMode: "recorded"` starts with that mode and does not render the mode fieldset; reopening the modal keeps typed answers but applies a newly picked mode.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement.** Keep `RegisterMenu` dependency-free (no new library) to protect the bundle budget; the existing plain-button path keeps the `href` fallback for no-JS.
- [ ] **Step 4: Run** tests, tsc, `tests/landing-registration-client.test.tsx`, `tests/landing-registration-a11y.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(landing): Live or Recorded dropdown on the Register button`.

### Task 6: Mobile fit and readiness checks

**Files:**
- Modify: `src/components/landing/LandingRenderer.tsx`, section components under `src/components/landing/sections/` (grid reflow only where a section does not already go to one column on phones), the landing stylesheet that defines `.landing-root` (find it with grep), `src/lib/landing/content.ts`
- Test: extend `tests/landing-hero-render.test.tsx`, `tests/landing-hero-content.test.ts`

**Interfaces:**
- Consumes: Task 1 `textSize`; Task 4 `sectionIds`.
- Behaviour: `LandingRenderer` puts `data-text-size="small"` on a section's wrapper when its `textSize` is `small`; CSS scales body text and headings in that wrapper down one step on all screens. All section text containers wrap long words (`break-words`) and no section can cause horizontal scroll at 390 px. Card grids (features, pricing, stats, testimonials, curriculum) are one column below `sm`.
- Readiness (`computeReadiness`, plain messages, `sectionId` = hero id): second button type `section` with no target or a target that is gone or disabled; `link` with a label but no safe link; `whatsapp` with a label but no number; `poster` style with no image; second button label empty while a type target is set.

- [ ] **Step 1: Failing tests**: `data-text-size="small"` appears only on sections set to small; readiness messages for each case above, and a normal old page still yields no new problems.
- [ ] **Step 2: Run**, expect FAIL.
- [ ] **Step 3: Implement.** Audit each section component for fixed multi-column grids and fixed widths; change only what overflows at 390 px.
- [ ] **Step 4: Run** the two test files, tsc, all `tests/landing-*`. Expected: PASS (only the known pz-tokens failure elsewhere).
- [ ] **Step 5: Commit** `feat(landing): text size choice, phone-safe sections and hero readiness checks`.

### Task 7: Controller verification (no new code unless a bug is found)

- [ ] **Step 1:** Full run of all `tests/landing-*` files and tsc.
- [ ] **Step 2:** Stop any dev server (netstat for the PID, stop that PID only). Run `node node_modules/next/dist/bin/next build` then `node scripts/check-landing-bundle.mjs`. Expected: PASS. Restart dev only afterwards.
- [ ] **Step 3:** Owner pastes `0071_landing_whatsapp_numbers.sql`. Browser check on port 3945 with the admin login from memory: PC 1280 and phone 390, hero in all three styles, old page still classic, second button of all three types, WhatsApp add/pick, Register dropdown with both modes (pre-selected mode, mode step skipped), Text size, no horizontal scroll. Any bug goes to a subagent as a new commit.
- [ ] **Step 4:** Update memory `pz-academy-landing-easy-mode-status.md` with B status.

## Self-review notes

- Spec coverage: hero styles and images (T1, T4), migration of old pages (T1), secondary button (T1, T3, T4), WhatsApp list and official numbers (T2, T3), Live/Recorded dropdown (T5), mobile fit, text size, hints, phone preview (T3 hints, T6; the editor's existing Phone preview in `PreviewFrame.tsx` already satisfies "live phone preview", verified in T7), bundle budget (T7).
- Imported pages (branch `landing-import`) only write old hero keys; they normalize to `classic`/`link` and keep working after both branches merge.
- Merge risk: `landing-import` touches hero content builders only through `normalizeSectionData`; no file conflicts expected beyond `sections.ts`.
