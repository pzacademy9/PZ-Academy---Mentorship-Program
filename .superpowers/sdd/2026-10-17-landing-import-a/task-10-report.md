# Task 10 report: dry-run of the master prompts on real course data

## Result
All three raw answers (chat summary lines + one 4-backtick markdown block) import cleanly through `buildImport`: ok === true, zero error-level problems.
Test: `tests/landing-import-fixtures.test.ts`, 12 tests green. tsc 0 errors. No src code changed.

| Fixture | kind | sections | links | needsReview | warnings |
|---|---|---|---|---|---|
| ppc-batch-3 | course | hero, stats, feature_cards, curriculum, pricing_cards, schedule, faq, final_cta | 29 possible (5+4+20), 14 on | 10 | 5x payment account, payment-check WhatsApp missing, countdown reminder |
| mdc-batch-3 | workshop | hero, stats, rich_text, feature_cards, instructors, curriculum, pricing_cards, schedule, final_cta | 2 possible, 0 on | 10 | 2x payment account, no FAQ |
| w20-diabetes | webinar | hero, rich_text, schedule, instructors, pricing_cards | 2 possible, 2 on | 5 | 2x payment account, payment-check WhatsApp missing, no FAQ |

## Classified failures
Nothing failed to import, so there are no hard (a)/(b)/(c) failures. The issues below import cleanly but are wrong, lossy or risky, classified the same way.

- (a) prompt unclear:
  - pricing_cards on multi-country pages: PPC shows only "AED 160" to all five countries; W20 shows "PKR 399 / PHP 150" in one string.
  - Live-and-Free plus Pro webinar: the Free plan became a decorative card; the registration option carries only the Pro price, so a free seat cannot be registered.
  - Document conflicts: the simulator could not ask, so it guessed (MDC dates and Early Bird day, W20 duration, PPC 15/25/28 Oct and 5 Nov).
  - "Main country" is undefined (PPC chose UAE, MDC chose PK).
  - Invented values: W20 ref_prefix "W20", derived slugs, PH-only audience line, stats and badge labels.
- (b) importer too strict or buggy: no rejection of valid input found. Softer issues:
  - The "payment checks WhatsApp" warning fires when the value is simply absent, and its text ("must be digits only") reads like a format error. Misleading.
  - Sections may appear only once (duplicates dropped with a warning), which pushed MDC and W20 to merge blocks into one rich_text with bare label lines.
  - Nested day/topic outlines cannot be represented.
  - percent_off-only tiers ARE supported (registration/pricing.ts falls back to percent), so W20 omitting totals is fine, but the prompt never says so.
- (c) simulator mistakes (minor):
  - PPC used a Pakistan-format ad number as the global chat number (disclosed).
  - PPC turned "Early Bird" into a "20% OFF" badge not in the document.
  - MDC summary used bullets rather than 5 short lines.
  - The 11500 vs 11520 Pakistan figure was handled correctly (stated total used and disclosed).

## Prioritised improvements (most important first)

1. **pricing_cards on multi-country pages.** File: `src/lib/landing/import/prompts.ts` (pricing guidance near line 338) plus the pricing_cards section def. Why: one price string cannot show five currencies. Proposed wording: "On a page with more than one country, do NOT write a currency amount in the pricing_cards price field. Put plan names, features and badges there and write price: See price for your country. The page shows the real price from the registration prices." Longer term (renderer): derive the card price from the visitor's region and a `from option` field.
2. **Free + Pro webinar plans.** File: prompts.ts line ~111. Replace "one option ... free: true AND amount: 0" with: "If the webinar has a Free plan and a paid plan, write TWO options: { key: free, name: Free Plan, kind: bundle, free: true } with amount: 0 for every country, and { key: pro, name: Pro Plan, kind: bundle } with the paid price per country. Use a single free option only if everyone attends free." Check that the registration form supports two bundle options on a webinar.
3. **Document conflicts when the teammate cannot answer.** File: prompts.ts rule 6 (~line 367). Proposed: "If two blocks disagree, ask. If the teammate does not know, use the value in the event details table, never invent, and list every disagreement under 'Please check' in the summary. Never pick silently. Dates already in the past: write them as given and say so."
4. **Define the main country.** File: prompts.ts line 341. Proposed: "The main country is the one in default_region (the first or largest audience block). If the document does not say which country's time the Early Bird ends in, ask. If a date has no year, use the year of the event dates and say so."
5. **Summary cannot carry all disclosures in 5 lines.** File: prompts.ts line 387. Every run packed 6-9 items into 5 lines or broke the limit. Proposed: "Write the summary as a short list. Line 1: 'I have everything I need.' Then 'Done for you' (max 3 lines), then 'Please check before publishing' (no line limit, one short line per item): assumptions, numbers you worked out, conflicts you resolved, things left out, anything you invented (slug, ref_prefix)."
6. **Forbid or label invented values.** File: prompts.ts rule 5. Add: "slug and ref_prefix may be derived from the title; say so. eyebrow, badges, stats labels and dateLine must come from the document's words; if there are none, leave the field out."
7. **WhatsApp numbers.** Files: prompts.ts (~270, 321, 338) and `src/lib/landing/import/build-registration.ts` warning text. Prompt: "settings.whatsapp is for the chat button. Use only a number the document labels for chat or WhatsApp; add a country code only if the country is obvious and say so. verify_whatsapp: ask; if not given leave it out and say so." Importer: when absent, warn "No WhatsApp number for payment checks was given; add it in the editor." and keep the digits-only text only for a malformed value. Per-country payment numbers are not in the schema (model change, future).
8. **Group totals vs percent-only discounts.** File: prompts.ts line 338. Add: "If the document gives only a percentage ('Group of 3 or more: 20% off'), write percent_off and do NOT calculate group_totals; the page calculates. Write group_totals only when the document states them; a stated total beats a calculated one. Decimals are allowed (187.5). For 'or more' use size = the minimum and keep the document's label."
9. **Repeating rich_text and leftover content.** Files: prompts.ts section guidance; `build-content.ts` line 108 (duplicate warning). Prompt option: "Each section appears once. Use rich_text for the most important list; put other leftover blocks into feature_cards, one card per block. Do not write fake headings inside body." Importer option: let rich_text repeat (decide with Hamza).
10. **Nested outline days/topics.** File: prompts.ts curriculum guidance and rule 8. Proposed: "Curriculum: one entry per day. title = 'Day N: <day title>'; points = that day's topics as '- ' lines. Never mix day titles and topics in one flat list." Importer: warn if points hit the 1500 cap.
11. **Labels and headings in exact-wording mode.** Rule 4: "Short labels (eyebrow, badges, stat labels, section headings, FAQ questions) are structure, not marketing text. Take them from the document's words; a sales phrase may be reworded into a question for the FAQ."
12. **Staff-only vs customer-facing.** Rule 7: "A condition told to customers (for example 'Payment is non-refundable') is public. A line that tells staff what to do ('Sales team must push urgency') is never copied."
13. **module_mix, format, links defaults.** "format: use the document's own words ('3 Days'). If the document is silent on module_mix, leave it out and list it under 'Please check'. If there is no link plan, omit links and say so." PPC switched PH and IN links on without evidence.
14. **hero_subtitle / hero_title.** Define hero_subtitle in the template or remove it; state the hero_title separator ("Module 2: Name").
15. **Nits.** Quoting rule vs example (course note 18); say that "I have everything I need" does not count toward the summary limit; give a source for seo.description ("first sentence of the intro, say so").

## Tests / commit
12 tests in `tests/landing-import-fixtures.test.ts`, all passing, including exact warning-message snapshots per fixture. No `it.fails` was needed because all fixtures import cleanly.
