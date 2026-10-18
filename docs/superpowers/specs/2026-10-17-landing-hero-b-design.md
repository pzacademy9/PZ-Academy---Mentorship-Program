# Landing builder sub-project B: hero, buttons, mobile fit

Date: 2026-10-17. Branch `landing-hero` (cut from `landing-easy-mode`). Parent design: `2026-10-16-landing-builder-easy-mode-design.md`, section B. All decisions there stand; this file only adds the owner's answers of 2026-10-17 and the builder-facing summary.

## Intent

Non-technical teammates must get a hero that looks right on PC and phone without touching CSS, and buttons that do the usual things without typing links or numbers. Hard rule: no new complexity in the UI for non-technical users.

## Scope (from the parent spec, unchanged)

1. **Hero background.** Two styles: *Photo with text on top* (default for new pages) and *Finished poster* (image whole, register button and date line below). PC image 16:9, phone image 9:16, served per screen via `<picture>` so only one loads; LCP keeps `priority`. One image only = used for both (cover for text-on-top, contain for poster). Automatic dark fade. Existing pages keep today's beside-text hero ("Classic") until new images are supplied.
2. **Second button type.** Go to a section (list of the page's enabled sections), open a link, or chat on WhatsApp. Typed label.
3. **Register dropdown.** When registration offers both Live and Recorded, the Register button opens a small dropdown "Join Live / Recorded Lectures", pre-selects the mode and skips the mode step in the modal. One mode = straight to the form.
4. **Mobile fit.** Headline scales down, long words wrap, no horizontal overflow; one "Text size: Normal / Smaller" choice per section; live phone preview in the editor; card grids go to one column on phones; character-length hints on fields likely to break layout.

## Owner answers, 2026-10-17 (WhatsApp)

- Official numbers: **+92 370 0199429** (`923700199429`) and **+92 324 2167718** (`923242167718`). The WhatsApp button picks from a dropdown, first number is the default.
- Editors can **add more numbers**. Added numbers go to one **shared list** visible in the dropdown on every page; add once, pick anywhere. The two official numbers are always at the top and cannot be removed.

## Builder calls (designer's, for owner review)

- Shared list = a small table (name, digits-only number, created by); the two official numbers are a code constant, not rows. New migration, owner pastes the SQL (Supabase MCP is read-only). Reads and writes go through the existing admin gate helper.
- Numbers validated as digits only with country code (same rule as `registration/config.ts`, 8 to 15 digits); the editor may type "+92 300 1234567" and it is cleaned.
- A page stores the chosen number itself, not a list id, so deleting a number from the list never breaks a published page.

## Non-goals

Media library (sub-project C); picking hero images from a library (B uses the existing upload field, twice). No change to registration engine, prices or payment accounts.

## Anti-goals

Text overflowing on a 390 px phone; wrong image loaded on a screen (both download); LCP regression or bundle budget (`scripts/check-landing-bundle.mjs`) failure; editor forced to decide anything beyond content.

## Left to the builder

Exact content-field shape and migration of old `image`; breakpoint value between the two images; section-list wording; Text size mapping; browser verification plan (PC 1280, phone 390).

## Reader-facing wording rule

Visible text uses plain words ("link", "country", "module"); never "variant", "override", "resolve", "schema", "YAML".
