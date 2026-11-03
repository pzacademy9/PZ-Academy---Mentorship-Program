# Landing Builder, Build 3: Looks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three new hero styles (with a Light / Medium / Strong photo-fade control on Style 1) and a new instructor section with two layouts, without changing any page that is already published.

**Architecture:** New choices are added next to the old ones in `SECTION_DEFS` (`src/lib/landing/sections.ts`). A page saved before this build has no value for the new choices, and `normalizeSectionData` maps that missing value to the OLD look, so old pages render byte-for-byte the same. New sections get the new look through the field defaults. Each look is its own small component inside `Hero.tsx` / `Instructors.tsx`, selected by the choice value.

**Tech Stack:** Next.js App Router, React Server Components (landing sections are server-rendered), Tailwind with the `landing-*` tokens, Zod, Vitest + Testing Library. Run checks directly (no `npm run`): `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run <files>`, `node node_modules/eslint/bin/eslint.js <paths>`.

**Spec:** `docs/superpowers/specs/2026-11-02-landing-builder-upgrade-design.md` (section "Build 3: Looks"). Stitch (project 4651274386787527431): hero Style 1 desktop `89085a13055d4ed28dce8e2404c9cae8` / mobile `0d9b7753c55747ae9b20ca815365f742`; Style 2 desktop `3b4ead71456f4205926e9faf13f0653a` / mobile `4e540f688dc14a5cbd719062c41b28ee`; Style 3 desktop `64f6415c4535454abc4dc2655aac3810` / mobile `3427f2e6ac0b43f0b7b51221154a7f9d`; instructor Layout A `3c6b70d3dd2e4335a08ac50d020752df`, Layout B `fd337639a37f49449612db5e6a4f5d3b`, two instructors `76ac7bd9efcf48c691ba844bfe535da5`, mobile A `fc33ed650653435c9859a23b33d03d0f`, mobile B `f40337945bfc45428506dc953cec443f`.

**Branch:** `landing-looks`, cut from `landing-simple-settings` (Builds 1 and 2 are not merged yet; this build edits the same section files and the logo in the top bar comes from Build 2). Merge Build 1, then Build 2, then this.

## Global Constraints

- Existing published pages must render exactly the same until the owner re-publishes. Proof: the existing byte-identical fixtures in `tests/landing-hero-render.test.tsx` must still pass untouched, and Task 3 adds the same kind of fixture for the instructor section, made from the CURRENT code before it changes.
- New hero styles are added next to the old ones (`photo`, `poster`, `classic` stay selectable and unchanged). New pages default to the new Style 1.
- Plain words in every label. Banned: "CTA", "redirect URL", "endpoint", "territory", "GeoIP".
- Text always comes from the owner's fields. The text of a Stitch screen is never copied.
- Phones: every layout is one column; the hero fact lines (`badges`) show their full text (wrap, never cut with "..." and never `truncate` / `line-clamp`).
- Up to 8 instructors stay allowed (`maxItems: 8` unchanged); 5 to 8 just wrap into more cards.
- No migration. Tests use fake people only; fake image URLs only.
- Files in this repo use CRLF: use the Edit tool for existing files. When a script edits a file, open it as UTF-8 explicitly.
- Stitch parts that MUST NOT ship: hero "Masterclass" tag, "Cohort 14 Enrolling", "Limited to 45", the course-director card, "Interactive rounds" / "High-yield recall" / "CE credits awarded" captions, the small "DELIVERY / INTERACTIVITY / CREDENTIAL" labels, "CURRICULUM LAYOUT" label; instructor stats "14+ years", "2,400+", "98.4%", "4.9/5", "100% / 1:12 / 14+ Yrs / PAFP" tiles, "Cohort 14 Capped at 40", "CME ACCREDITATION ACTIVE" bar, "Upcoming Teaching Module", "Direct weekly Q&A", "Office hours", "Trials run", "Clinical tenor / Focus area" boxes, "FACULTY LEAD / RESEARCH CHAIR" photo badges, "Direct Live Mentorship / Accredited CME Credits / Interactive Case Reviews" line, the "PharmaZyme" name and logo, the "PZ + Clinical Pharmacy Education" tagline lockup, and the "Course Landing Detail" app bar on phones. The top bar, nav pills and "Register now" button in those screens are the existing page chrome, not new work.

## Review Focus

1. A page saved before this build has `heroStyle` missing, `"photo"`, `"poster"` or `"classic"` and no `heroFade`, and an instructor section with no `layout`: all must render exactly as today, and none may show a new "Unpublished changes" or new readiness problem. (Tasks 1, 3)
2. A new hero style with no picture at all, or with only a phone picture, or only a PC picture: still readable text on a solid green background, no broken image box. (Task 2)
3. Very long headline, very long fact line, or an unbroken long word on a phone: wraps inside the screen, no sideways scroll. (Task 2)
4. Instructor with no photo, no title, no bio, or no credentials; one, two and eight instructors; a credentials list with a blank line or a line without a leading `-`. (Task 4)
5. Choosing a new style then switching back to an old one must not lose the owner's pictures or text (the choice only changes how the same fields are shown). (Task 1)

---

### Task 1: Hero fields, defaults and old-page safety

**Files:**
- Modify: `src/lib/landing/sections.ts` (`SECTION_DEFS.hero` fields, `FieldDef.showWhen`, `normalizeSectionData`)
- Modify: `src/components/admin/landing/SectionForm.tsx` (the `visible` helper at lines ~17-22)
- Test: `tests/landing-hero-styles-data.test.ts`

**Interfaces:**
- Produces: `heroStyle` choice values `"fade"` (Style 1), `"split"` (Style 2), `"editorial"` (Style 3) added to the existing `"photo" | "poster" | "classic"`; new choice `heroFade` with values `"light" | "medium" | "strong"`, default `"medium"`, shown only while `heroStyle` is `"fade"`. `FieldDef.showWhen` becomes `{ key: string; equals: string } | { key: string; oneOf: string[] }`. New hero data from `defaultSectionData("hero")` has `heroStyle: "fade"`. A stored hero with no `heroStyle` key still normalizes to `"classic"` when it has an `image`, otherwise to `"photo"` (today's behaviour).
- Picture fields by style: `fade` uses `imagePc` + `imagePhone` (like `photo`); `editorial` uses `imagePc` (wide) with `imagePhone` as its phone version; `split` uses `image` (portrait). So `image` is shown for `classic` and `split` (`oneOf`), labelled "Picture" (classic) / the same label is fine for split.

- [ ] **Step 1: Write failing tests** in `tests/landing-hero-styles-data.test.ts`: `a new hero section defaults to the fade style with medium fade` (`defaultSectionData("hero").heroStyle === "fade"`, `heroFade === "medium"`); `a stored hero with no heroStyle and no image still normalizes to photo` (`normalizeSectionData("hero", { headline: "x" }).heroStyle === "photo"`); `... with an image normalizes to classic`; `the old values photo, poster and classic survive normalization`; `the new values fade, split and editorial survive normalization`; `an unknown heroFade falls back to medium`; `switching style keeps the pictures and text` (take data with `imagePc`, `imagePhone`, `image`, `headline`, run `normalizeSectionData` with each of the six styles, assert all four fields unchanged); `SECTION_DEFS.hero.fields has heroFade only visible for fade` (export and test a pure `fieldVisible(field, data, allFields)` from `sections.ts`, moved out of `SectionForm.tsx`, covering `equals`, `oneOf` and the default-counts-when-empty rule).
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/landing-hero-styles-data.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `sections.ts`: extend the `heroStyle` options in this order with these labels — `fade` "Style 1: photo behind the text, with a fade", `split` "Style 2: text and portrait side by side", `editorial` "Style 3: big headline on green, wide photo below", then the old ones unchanged (`photo` "Photo with text on top (old)", `poster`, `classic`); change the field's `defaultValue` to `"fade"`; add `choice("heroFade", "Photo fade", [light "Light", medium "Medium", strong "Strong"], "medium", { help: "How strongly the green fade covers the photo. Light shows more of the photo.", showWhen: { key: "heroStyle", equals: "fade" } })` right after it; widen `showWhen` and set the `image` field to `showWhen: { key: "heroStyle", oneOf: ["classic", "split"] }`. In `normalizeSectionData`, when `heroStyle` is not a key of the stored data, set it to `"classic"` if `image` is a non-empty string else `"photo"` (the default is now `"fade"`, so the old fallback must be explicit). Export `fieldVisible(f, data, all)` (same logic as `SectionForm`'s `visible`, plus `oneOf`) and make `SectionForm.tsx` call it.
- [ ] **Step 4: Run** the new test, `tests/landing-hero-render.test.tsx`, `tests/landing-content.test.ts`, `tests/landing-admin-ui.test.tsx`, `tests/landing-renderer.test.tsx` and `tsc --noEmit`. Expected: PASS, 0 errors (the hero fixtures prove old pages are unchanged; fix any test that built a hero without `heroStyle` and expected `"photo"` from `defaultSectionData` by setting it explicitly).
- [ ] **Step 5: Commit** `feat(landing): new hero style choices and photo fade setting`.

---

### Task 2: The three hero styles

**Files:**
- Modify: `src/components/landing/sections/Hero.tsx` (dispatch in `Hero`, add `FadeHero`, `SplitHero`, `EditorialHero`)
- Test: `tests/landing-hero-styles-render.test.tsx`

**Interfaces:**
- Consumes: Task 1 values; the existing helpers in `Hero.tsx` (`secondaryTarget`, `SecondaryButton`, `DateLine`), `LandingPicture`, `LandingImage`, `RegisterButton`, `ctaLabel`, `rows`, `str`.
- Produces: `Hero` picks `FadeHero` for `"fade"`, `SplitHero` for `"split"`, `EditorialHero` for `"editorial"`; `photo`, `poster`, `classic` and the unknown-value fallback stay exactly as they are. Each new component reads `eyebrow`, `headline`, `subheadline`, `dateLine`, `primaryCtaLabel`, the second button fields and `badges`.
- `FadeHero` (Stitch Style 1): section `relative isolate` on `bg-landing-deep`; picture layer from `imagePc`/`imagePhone` via `LandingPicture` (cover, priority, aria-hidden) with a green fade overlay whose strength comes from `heroFade`: `light` = `from-landing-deep/80 via-landing-deep/40 to-transparent`, `medium` = `from-landing-deep/90 via-landing-deep/65 to-landing-deep/20`, `strong` = `from-landing-deep via-landing-deep/85 to-landing-deep/50` (left to right from `md`, bottom to top on phones: use `bg-gradient-to-t md:bg-gradient-to-r`); text block on the left, white headline, `DateLine` next to the buttons from `md`; facts (`badges`) in a translucent bar at the bottom, one per column from `sm`, stacked on phones, plain text with a small check mark (no invented captions or icons). Overlay class chosen by an exported pure `fadeOverlayClass(fade: string): string` (unknown value gives the medium class).
- `SplitHero` (Style 2): light background; left column eyebrow pill, dark headline, description, buttons, `DateLine`, facts as a row of small white cards (stacked on phones); right column the `image` (portrait) in a rounded frame with a soft green border and shadow; with no `image` the text column spans the full width. On phones the text comes first, the picture below it.
- `EditorialHero` (Style 3): flat `bg-landing-deep` full width, centred; eyebrow pill, headline in a serif (`font-serif`, white, `text-3xl sm:text-5xl lg:text-6xl`), centred description, centred buttons, `DateLine` as a small centred line, facts in one centred wrapping row separated by dots; below, a wide framed `LandingPicture` (`imagePc`/`imagePhone`, cover) in a max-width box; no picture means the picture box is not rendered.

- [ ] **Step 1: Write failing tests** in `tests/landing-hero-styles-render.test.tsx` (follow `tests/landing-hero-render.test.tsx` for the render helper and fake `register`): `fade style renders the headline, the buttons and every fact in full` (a 90-character fact line is present whole and its element has no `truncate` / `line-clamp` class); `fadeOverlayClass gives three different classes and falls back to medium`; `fade with light, medium and strong renders the matching overlay class`; `fade with no picture renders text on the green background and no picture element`; `fade with only a phone picture still renders a picture`; `split renders the portrait beside the text and no portrait box without a picture`; `editorial renders a serif headline, the wide picture below, and no picture box without one`; `a very long unbroken word in the headline wraps` (headline element has `break-words`); `the second button shows only with a label and a safe target in every new style`; `old styles are untouched` (`heroStyle: "classic"` and `"photo"` still equal `tests/fixtures/hero-classic-old.html` / the existing photo expectations: the existing file already covers this, so just re-run it); `none of the Stitch demo text is in the output` (assert the rendered text of all three styles with fake data contains none of: "Masterclass", "Cohort", "Limited to", "CE credits", "PharmaZyme").
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the three components and the dispatch per the Interfaces block, reusing `SecondaryButton`/`DateLine` (`onDark` where the background is green). Match the Stitch screens' layout and spacing with `landing-*` tokens; never copy their text.
- [ ] **Step 4: Run** the new file, `tests/landing-hero-render.test.tsx`, `tests/landing-renderer.test.tsx`, `tests/landing-public-polish.test.tsx`, `tests/landing-register-menu.test.tsx`; `tsc --noEmit`; eslint on `Hero.tsx`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(landing): three new hero styles with photo fade`.

---

### Task 3: Instructor fields and old-page safety

**Files:**
- Modify: `src/lib/landing/sections.ts` (`SECTION_DEFS.instructors`, `normalizeSectionData`)
- Create: `tests/fixtures/instructors-classic-old.html` (generated from the CURRENT renderer, before Task 4 changes it)
- Test: `tests/landing-instructors-data.test.ts`

**Interfaces:**
- Produces: instructors section field `layout` choice with values `"a"` ("Portrait and text"), `"b"` ("Dark green band") and `"classic"` ("Cards (old style)"), default `"a"`; per-person field `credentials` (textarea, `max: 600`, help "One per line, starting with -. Shown as a short list under the bio."). The existing `heading`, `items[].name`, `role` (stays the title), `bio`, `photo` and `maxItems: 8` are unchanged. A stored instructors section with no `layout` key normalizes to `"classic"`.

- [ ] **Step 1: Generate the fixture first.** With the code exactly as it is now, render `Instructors` with a fixed fake `data` (two fake people with photos, names, roles, bios; heading "Meet your instructors") through `renderToStaticMarkup` and write the result to `tests/fixtures/instructors-classic-old.html`; commit nothing yet. (This file is the proof old pages do not change.)
- [ ] **Step 2: Write failing tests** in `tests/landing-instructors-data.test.ts`: `a new instructors section defaults to layout a` (`defaultSectionData("instructors").layout === "a"`); `a stored section with no layout normalizes to classic`; `layouts a, b and classic survive normalization and an unknown one falls back to a`; `credentials is kept per person and capped at 600 characters`; `a stored person with no credentials normalizes to an empty string`; `at most 8 people are kept` (existing limit, assert it still holds).
- [ ] **Step 3: Run** the file. Expected: FAIL.
- [ ] **Step 4: Implement** the fields as above and, in `normalizeSectionData`, for `type === "instructors"` set `out.layout = "classic"` when the stored data has no `layout` key.
- [ ] **Step 5: Run** the new test plus `tests/landing-content.test.ts` and `tsc --noEmit`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(landing): instructor layout and credentials fields` (include the fixture file).

---

### Task 4: The instructor section looks

**Files:**
- Modify: `src/components/landing/sections/Instructors.tsx`
- Test: `tests/landing-instructors-render.test.tsx`

**Interfaces:**
- Consumes: Task 3 fields; `LandingImage`, `SimpleText`, `SectionHeader`, `rows`, `str`.
- Produces: `Instructors` renders by `layout`: `"classic"` is the current markup, untouched (move it into a `ClassicInstructors` function without changing a single class or element). `"a"`: ONE person: two columns from `lg` (large rounded portrait on the left, text on the right: name large in `text-landing-primary`, title in small uppercase, bio via `SimpleText`, credentials as a list of rounded check rows); phones stack portrait then text. TWO OR MORE people: side-by-side cards (2 columns from `md`, 1 on phones), each card portrait left (small, rounded) and text right on `sm` and up, stacked on phones; same fields per card; 5 to 8 people wrap into more rows. `"b"`: the same arrangement on a full-width `bg-landing-deep` band with light text (portrait on the right for one person from `lg`; cards with light backgrounds for two or more). Credentials: split `credentials` on newlines, keep non-empty lines, strip a leading `-` and spaces; render nothing when there are none. A person with no photo shows no picture box (text takes the width). Heading comes from `heading` (empty heading renders no heading), exactly like today.

- [ ] **Step 1: Write failing tests** in `tests/landing-instructors-render.test.tsx`: `classic layout equals the saved fixture byte for byte` (same fake data as the fixture, `readFileSync("tests/fixtures/instructors-classic-old.html")`); `layout a with one person shows portrait, name, title, bio and credentials` (credentials text "- First line\n\n- Second line\nThird line" renders three list items `First line`, `Second line`, `Third line`); `layout a with two people shows two cards side by side` (a grid container with `md:grid-cols-2`); `layout a with eight people renders eight cards`; `layout b renders on the deep green band` (a wrapper with `bg-landing-deep`); `a person with no photo renders no image and keeps the text`; `a person with only a name renders without a title, bio or credentials list`; `an empty credentials value renders no list`; `no Stitch demo text` (output contains none of "14+", "2,400", "98.4", "Cohort", "PharmaZyme", "Office hours", "Trials run").
- [ ] **Step 2: Run** the file. Expected: FAIL except the classic fixture test, which must already pass once the old markup is kept (if it fails, the old markup was changed: stop and fix that first).
- [ ] **Step 3: Implement** per the Interfaces block with `landing-*` tokens, matching the Stitch Layout A / Layout B / two-instructor screens' arrangement and spacing; never copy their text, stats or badges.
- [ ] **Step 4: Run** the new file, `tests/landing-renderer.test.tsx`, `tests/landing-content.test.ts`, `tests/landing-instructors-data.test.ts`; `tsc --noEmit`; eslint on `Instructors.tsx`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `feat(landing): new instructor section layouts`.

---

### Task 5: Whole-build verification and notes

**Files:** none new.

- [ ] **Step 1: Run** `node node_modules/typescript/bin/tsc --noEmit`. Expected: 0 errors.
- [ ] **Step 2: Run** eslint on every file this plan created or changed. Expected: clean (the old MediaPicker warning is not ours).
- [ ] **Step 3: Run** all test files named in Tasks 1 to 4 plus `tests/landing-hero-render.test.tsx`, `tests/landing-admin-ui.test.tsx`, `tests/landing-create-account.test.tsx`. Expected: PASS. (Known unrelated failing files: pz-tokens, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet, migrations-segment-source-dnc. A full-suite run can show timeouts under load: re-run any failing UI file alone before calling it a failure.)
- [ ] **Step 4: Update the memory file** `pz-academy-landing-builder-upgrade-status.md` and its index line.
- [ ] **Step 5: Hand the owner** a short list: how to pick each hero style and the Photo fade on a COPY of a real page, how to switch the instructor layout, what to look at on a phone, and that old pages stay as they are until Publish.

---

## Rulings made while planning (the owner can overrule)

- **Photo fade is a dropdown with three choices** ("Light", "Medium", "Strong"), and the live preview is the builder's existing preview pane, which already updates as you change a setting. No new slider control.
- **Style 3's serif headline uses the system serif font** (`font-serif`). No new web font is added, so nothing slows down every landing page. If you want a specific font, that is a separate small change.
- **Old pages keep the old look through a hidden rule:** a page saved before this build has no value for the new choices, so it is treated as "old photo / classic" for the hero and "Cards (old style)" for instructors. New pages start on Style 1 and Layout A.
- **Instructor Layout B (dark band) works for any number of people** (cards on the band for two or more), so the layout choice never changes meaning when you add a second person.
- **Instructor credentials are a plain list in one box** (one per line starting with `-`), the same way "What is included" works on the price cards, so no new kind of field is needed.
- **Style 2 uses the "Picture" box for its portrait; Style 1 and Style 3 use the existing computer and phone picture boxes.** The builder only shows the boxes that style uses.
- **Build 3 is cut from `landing-simple-settings`** because Builds 1 and 2 are not merged and this build builds on the top bar logo from Build 2.
