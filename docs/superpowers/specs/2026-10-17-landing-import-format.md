# Landing import: `.md` format `pz-landing/1` (sub-project A)

Decisions (owner, 2026-10-17): YAML-in-markdown grammar; links list with optional hero title/subtitle only;
blocking errors vs warnings; prompts in code; image slots created empty; create-only import.

## File shape

```
---
format: pz-landing/1
kind: course | workshop | webinar
title: Practical Pharmacology Course – Batch 3
slug: ppc-batch-3
seo: { title: "...", description: "..." }
settings:
  register_label: Register now
  whatsapp: "923700199429"        # chat button number, digits
  countdown_to: 2026-10-25T23:59:00+04:00
  countdown_label: Early Bird ends in
registration:
  modes: [live, recorded]
  recorded_percent: 60
  default_region: UAE
  early_bird_ends: 2026-10-25T23:59:00+04:00
  capacity: 0
  verify_whatsapp: "923700199429"
  event_label: PPC Batch 3
  ref_prefix: PPC
  professions: [Pharmacist, Doctor, Nurse]
  discovery: [Instagram, Facebook, Friend]
  regions:
    - { code: UAE, name: UAE, currency: AED, class_time: "6:30 PM – 7:30 PM", timezone: UAE time, accounts: [uae_bank] }
  options:
    - { key: full, name: Full Course (4 Modules), kind: bundle }
    - { key: m1, name: Module 1, kind: module }
  module_mix: { enabled: true, bundle: full }
  tiers:
    - { key: g3, label: Group of 3, size: 3, percent_off: 20 }
  prices:
    full:
      UAE: { amount: 200, early: 160, group_totals: { g3: 480 }, early_group_totals: { g3: 384 } }
modules:
  - { key: module-1, title: Foundations of Clinical Pharmacology, format: 3-Day Workshop, days: 3, option: m1 }
links:
  - { country: UAE, on: true }
  - { module: module-2, on: true, hero_title: "Module 2: Therapeutics", hero_subtitle: "..." }
  - { country: UAE, module: module-2, on: false }
---

## Section: hero
```yaml
eyebrow: ...
headline: ...
```
```

- Front-matter is YAML; every key above optional except `format`, `kind`, `title`.
- `## Section: <type>` headings (types in `SECTION_TYPES`); each followed by one fenced `yaml` block holding that
  section's field keys exactly as in `SECTION_DEFS` (e.g. `heading`, `items:`); list items may carry `module: <module key>`.
  Absent section = not created. Sections created in the kind's standard order; `enabled: false` allowed per block.
- Images never in file; image fields stay empty. Readiness lists them.
- Bullets inside any text value (•, ●, ▪, –, `1.`) are normalised to `- ` lines.
- Region and option codes follow existing rules (`REGION_KEY_RE`, `ITEM_KEY_RE`).

## Importer result

`{ ok: false, errors[] }` (blocking, nothing created) or `{ ok: true, pageId, slug, slugChanged, warnings[] (strings), linksCreated, linksFailed[] (names of links that could not be created) }`.
A module's `days` may be written as a number or a quoted number ("3"); link `hero_title` / `hero_subtitle` longer than the hero headline (120) / subheadline (400) limits block the import.
Messages are plain words, naming the heading, module or country. No jargon (link / country / module only).

Blocking: wrong `format`, bad YAML (names the heading), unknown kind or section type, duplicate codes (countries, options, modules, group discounts), price for a
country/option that does not exist, link to a country/module that does not exist, content that fails the page schema.
Warnings (import still happens; each stale-prone field also added to `needsReview`): module with no dates, missing price,
no FAQ, Early Bird price with no end date, country with no payment account.
`needsReview` fields: hero `dateLine`, all schedule `when`, all pricing_cards `price`/`oldPrice`/`note`, countdown.

## Create-only

Slug exists → append `-2`, `-3`... and set `slugChanged`. Never overwrites. Page created as draft.
Every possible link (each country, each module, each country x module) is created off via `ensureVariant(pageId, ref, false)`
(per easy-mode spec); links listed with `on: true` are switched on and get their hero title/subtitle as the stored override.
