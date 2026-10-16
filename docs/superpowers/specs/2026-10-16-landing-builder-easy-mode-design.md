# Landing page builder "Easy Mode": import, variants, hero, media library

Date: 2026-10-16. Builds on the Phase 1/2 builder (branch landing-page-builder, merged). Four sub-projects, one design, planned and shipped separately in this order: **D, A, B, C** (B and C are independent of the rest).

## Why

Making a landing page is too slow and needs a technical person. Goal: a non-technical teammate gets a complete, correct page (plus its country and module links) by (1) talking to any AI with a master prompt, (2) importing the resulting `.md` file, (3) adding images. Pages must also look right on both PC and mobile without the teammate fixing CSS.

## Goals

- Non-technical teammate can go from course data to a published page set with only: AI chat, one file import, picking images, clicking Publish.
- Hero is a background image: 16:9 on PC, 9:16 on mobile.
- Country links and module links (and country + module combos) from one main page, each independently editable, without touching main.
- A shared media library with upload.
- Sections hold up on mobile (long text, cards) with almost no manual controls.

## Non-goals

- No new payment or registration engine. Registration regions/options/prices already exist (`content.registration`, `src/lib/landing/registration/config.ts`) and stay the source for price, currency, class time and payment accounts.
- No Phase 3 items (status emails, two-way sheet sync, CAPI, etc.).
- No AI call inside the builder. The AI conversation happens in the teammate's own AI tool; the builder only supplies prompts and reads the file.

## Anti-goals (failure even if it technically works)

- UI gets complicated for non-technical users. Default path must need no decisions beyond content. "Don't complicate the UI for non-tech users" is a hard rule from the owner.
- A variant silently shows wrong price/currency/payment account for its country, or a module link shows other modules' curriculum or fees.
- Editing a variant changes the main page, or the reverse in a surprising way.

## D. Variants (country, module, country + module)

**Model.** Main page = existing content document. A variant is a child of a page, identified by `(regionKey | null, moduleKey | null)`, carrying only an **override layer** (sparse field-level overrides plus per-section hidden flags and order). Rendering a variant = main published content, then overrides, then automatic filtering. Untouched fields follow main (including later edits to main); overridden fields keep their override. Variant has its own draft/published state so it can be edited and published independently. Each variant is versioned/rollback-able like pages.

**Automatic (no editing needed):**
- Region from the variant: price, currency, class time/timezone label, payment accounts, WhatsApp verify number as per `registration.regions`. Only that region is offered in the form (no region chooser).
- Module from the variant: curriculum and schedule items belonging to that module only; registration form offers only that module (option `kind: "module"`) and its price; module price per region from `prices[option][region]`.
- Hero title for a module variant defaults to the pattern the owner described ("3-Day Workshop: <module title>") and is editable as a normal override.

**Links.** Builder shows a grid: every region × (full course + each module) = possible links, each off until switched on. Switching on creates the variant with clean URL `/e/<slug>/<region>/<module>` (region and module segments optional, e.g. `/e/ppc-b3/uae`, `/e/ppc-b3/module-2`, `/e/ppc-b3/uae/module-2`). Region/module segment values must not collide with existing `/e/<slug>/status`; reserve it.

**Add a country.** Admin-friendly "Add country" in page settings: label, currency, class time, timezone label, payment accounts, price per option. This is the existing `RegionDef` + `prices`, with a simpler form and a country picker that pre-fills currency/timezone.

**Editing UX (keep simple).** Same editor, one switcher at the top: "Editing: Main page / UAE / Module 2 / UAE · Module 2". In a variant, fields show main's value; changing one shows a small "Edited for this link" badge and a "Reset to main" button. Section hide/reorder per variant. Nothing else added.

**Modules in the data model.** Curriculum items and schedule entries need a module key (and the main page a module list: key, short title, marketing format such as "3-day workshop", day count). Pages without modules behave exactly as today (no variants grid for modules).

## A. Master prompts and `.md` import

**Master prompts.** Three (course, workshop, webinar), stored in the app and shown on a "Make a page with AI" screen with a Copy button and 3 plain steps. The prompt makes any AI interview the teammate one question at a time (dates, prices per country, modules, instructor, FAQs, bullets), accept the course database as an attachment, ask each time whether to write marketing copy or keep the user's exact wording (owner's rule), and finally output a single `.md` in the fixed format below.

**File format.** One `.md`: front-matter plus fixed headings, covering: page title/slug/kind, SEO, every section's content, registration (regions, options/modules, prices, tiers, early bird end, WhatsApp numbers, payment-account keys, ref prefix, event label), list of modules, and a country list and module list for variants with any variant-specific overrides (e.g. hero title for Module 2). Exact grammar is a builder decision, but it must be: forgiving to AI formatting quirks, versioned (`format: pz-landing/1`), and round-trippable (export current page to the same format is a nice-to-have, not required).

**Import.** "Import .md" button on the pages list. It validates and shows plain-language problems ("Module 3 has no dates", "UAE has no price for Module 2"), never a raw stack. On success it creates a draft main page plus variants (all possible links created off, those the file lists switched on), with `needsReview` flags for stale-prone fields as templates do today. Images are not in the file; hero/instructor image slots stay empty and the readiness panel lists them as the only remaining to-dos.

**Lists/bullets.** Pasted bullets (•, ●, ▪, –, "1." numbering) auto-convert to the builder's `- ` list markup in every textarea; the importer produces the same markup.

## B. Hero and mobile fit

**Hero.** Two styles, switch in hero settings: **Photo with text on top** (default, owner's choice A) and **Finished poster** (image shown whole, only register button/date line below). Both take a PC image (16:9) and a phone image (9:16), served per screen via `<picture>`/media queries so only the right one loads; LCP image keeps `priority`. If only one is provided it is used for both (cover-cropped for text-on-top, contain for poster). Automatic dark fade keeps text readable. Existing fixed 3:2 beside-text hero is replaced; existing pages migrate by mapping the old `image` into both slots (builder decides migration detail).

**Buttons.** Secondary button gets a type: go to a section (list of the page's enabled sections), open a link, or chat on WhatsApp; label is typed. Register button: when registration offers both Live and Recorded, the button opens a small dropdown "Join Live / Recorded Lectures" (as in the old PPC/MDC HTML pages) and pre-selects the mode, skipping the mode step in the modal; with one mode it goes straight to the form.

**Mobile fit.** Owner's worst pain: hero text breaking on mobile. Headline scales down automatically, long words wrap, no horizontal overflow; one "Text size: Normal / Smaller" choice per section as the only manual control. Editor shows a live phone preview beside the text. Card grids reflow to one column on phones. Add a character-length hint in editor fields where text is likely to break layout.

## C. Media library

One shared library for all teammates: upload (reusing the existing Drive-backed upload path and `compressImage`), search, simple folders (Heroes, Instructors, Misc), anyone can upload, **only admin can delete**. Every image field in the builder gets "Choose from library" plus "Upload new" (upload also adds to the library). Records store orientation/dimensions so the hero picker can suggest 16:9 vs 9:16 images. Drive image URLs must go through the existing `/api/cover` proxy path (see LandingImage) — Drive `uc?export=view` URLs are blocked by CORP.

## Constraints and existing facts

- Page content is one jsonb document in `landing_pages` (draft/published/versions); migrations 0067/0068. `database.types.ts` must be hand-edited, never regenerated.
- Public route `/e/[slug]` is statically generated with `generateStaticParams` (fix 0085eb9); variant routes must stay cacheable (s-maxage, HIT), and the page bundle budget (`scripts/check-landing-bundle.mjs`) must still pass.
- Registration widget and sheet/ops pipeline key off the page id/slug; a variant registration must record which variant link it came from (attribution) while still writing to the parent page's registrations/sheet. Details left to the builder.
- `npm run` is broken; use direct node invocations (see memory).

## Decided by the owner

- Variant = country × (full | each module), grid with per-link on/off, clean path URLs, override-layer editing, ability to add countries.
- Hero style A default plus B as option; PC 16:9 / mobile 9:16; secondary button; Live/Recorded dropdown on Register.
- AI always asks the teammate whether to write copy or keep their wording.
- Media library shared; admin-only delete.
- Build order D, A, B, C.

## Left to the builder

- Exact override storage shape and migration; URL segment spelling for regions/modules; reserved words.
- Exact `.md` grammar and error messages; where prompts live (code vs table).
- Library schema and folder defaults; hero migration of existing pages; breakpoint specifics.
- Test strategy; browser verification plan (PC 1280, phone 390).

## Builder-check decisions (calls made by the designer; owner to review)

- **Caching (D).** Switching a link on/off or publishing a variant or main triggers on-demand revalidation of every affected variant path. A link that is off or unknown returns 404. Main publish revalidates all of its variants.
- **Inheritance.** Overrides key on stable section ids and field paths (sections already have stable ids). If main deletes a section or module an override pointed at, the orphaned override is ignored at render and shown in the editor as "no longer applies" with a Remove button; it never blocks publish.
- **Variant publish.** Variants render live from main's published content plus their own overrides. A variant's versions and rollback cover its overrides only. Variant cannot be published while main is unpublished.
- **Module leakage.** Optional module key on items in curriculum, schedule, pricing cards, FAQ, feature cards, testimonials and stats. Free-text sections (hero subtitle, instructor bio, rich text) are handled by per-variant override or hide. Importer fills module keys. Readiness panel warns on a module variant if text still contains another module's name or any fee that is not its own.
- **Registration.** Builder reads the existing registration config and maps module keys onto `options[].key` of `kind: "module"`; inconsistent existing data is reported, not silently migrated.
- **Attribution.** Add a nullable `variant_key` column to landing registrations and append one column at the end of the Google Sheet (GAS deployed via clasp, per project rule).
- **Import.** Create-only. If the slug exists the importer appends a suffix and says so. No overwrite.
- **Existing pages.** Keep the current beside-text hero ("Classic" style) until someone supplies new hero images; new pages default to Photo with text on top. Avoids bad crops of old 3:2 images.
- **Prompts** live in code (deploy to change). **Country picker** uses a bundled static list; a country with no payment account configured blocks publishing of that region in the readiness panel. **Library delete** is blocked while an image is still used by a page.

## Owner answer: roles

Teammates are admin accounts today; more roles may come later. Media library and import use the existing admin gate (`requireAdmin`) but keep the permission check in one helper so a new role can be allowed later. Because every user is admin, "only admin can delete" is effectively "anyone using the library can delete"; the referenced-image delete block is therefore the main safeguard.
