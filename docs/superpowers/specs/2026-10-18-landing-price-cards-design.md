# Landing pricing cards: real prices from the registration setup

Branch `landing-price-cards`, cut from `origin/main` (after D, A, B merged). Approved by the owner 2026-10-18 (playback in chat).

## Why

Today a pricing card's price is a typed text. The master prompt tells the AI to write "See price for your country" on multi-country pages, so the page never shows a real price, the country links all show the same placeholder, and the group discount is only a bullet. Teammates then type prices by hand, per country, and miss some. The real prices already exist in the registration setup ("Prices by country", "Group discounts", "Early Bird"). The cards should read them.

## Goals

- A card can be **linked** to something people can buy. A linked card shows its real price for the visitor's country without anyone typing it.
- Country links (`/e/<slug>/UAE`) show that country's currency and price straight away.
- Early Bird: before the cut-off, the regular price is crossed out and the Early Bird price shown with its end date; after it, only the regular price.
- The group discount is visible as its own automatic card and as a per-person example.
- The importer and the AI master prompts stop writing "See price for your country" and instead pick what each card is linked to.
- Module links no longer show the complete-course card (existing leftover from D).

## Non-goals

- No change to the registration form, its price calculation (`computeQuote`) or what is charged.
- No automatic rewrite of cards on existing pages. Cards without a link keep working exactly as today (typed price). Teammates can link them by hand.
- No new currency conversion, no promo-code prices on cards.
- No change to the page's static, cacheable delivery.

## Anti-goals (failure even if it technically works)

- A card showing a price different from what the register form will charge.
- Early Bird price shown after the cut-off date (the page is cached; a stale build must not keep advertising it).
- A visitor on a country link seeing another country's currency.
- A page's size or speed getting worse beyond the existing bundle budget (`scripts/check-landing-bundle.mjs` must still pass).
- Visible jargon: use "price", "country", "group discount", "Early Bird", "Linked to".

## What the owner decided

- **Linked card.** Each card has a "Linked to" choice listing what people can buy (from "What people can buy": Complete course, Module 1 ...), plus "All single modules" and "Group discount". A linked card's price is automatic; its name, badge and "what is included" text stay editable. An unlinked card behaves as today.
- **Country.** The main page shows the page's default country with "Prices for: Pakistan ▾" to switch. A country link shows its own country, fixed. (Owner confirmed.)
- **Early Bird.** As in Goals.
- **Single Module card.** If every module costs the same in that country, show "PKR 1,200 per module". If they differ, show "from" the lowest price.
- **Group plan.** A "Group discount" linked card appears automatically when the page has a group discount (the importer adds it; teammates can add or remove it like any card). It lists each group discount ("Group of 3 or more: 20% off") and the per-person price for the complete course in the shown country ("PKR 3,200 each"). Cards linked to the complete course also carry the per-person group line.
- **Old cards.** Unchanged unless linked.
- **Master prompts.** The AI no longer writes prices on cards; it picks what each card is for.

## Designer's calls (owner to review)

1. **Recorded.** When Recorded lectures are offered, a linked card also shows "Recorded: PKR X" (the recorded price from the existing percentage) under the Live price.
2. **Hidden when it cannot be shown.** A linked card whose item has no price in the shown country, or does not exist on that link (for example the complete course on a module link), is not shown. If registration is switched off, a linked card falls back to its typed price if it has one, otherwise it is hidden.
3. **Stale Early Bird.** Early Bird status is decided in the visitor's browser from the current time after the page loads. The first paint uses the build time. After the cut-off the card must switch to the regular price without a rebuild.
4. **Country in the register form.** When the visitor switches the country on the cards, the register form should open on the same country if that can be done without adding weight to the page bundle; if not, the form keeps its own choice and the card says nothing about it.
5. **Editor.** In the editor, a linked card shows its price as read-only text ("Automatic, from Prices by country") instead of the typed price box, and a preview of today's price for the default country.
6. **Readiness.** A linked card whose item has no price in some country adds a plain warning to the readiness list ("Module 2 has no price for the Philippines").

## Constraints and existing facts

- `LandingRenderer` passes each section only `data`, `register` and `sectionIds` (`src/components/landing/sections/types.ts`). Cards need the page's registration setup (regions, options, prices, tiers, Early Bird date, recorded percent, module mix). Variant links already narrow this setup (`resolve-variant.ts`: a country link keeps one region, a module link keeps only its module option), so cards should read the registration the renderer already has after that narrowing.
- Price math lives in `src/lib/landing/registration/pricing.ts` (`computeQuote`, `isEarlyBird`, `availableOptions`) and money format in `format.ts` (`formatMoney`). Cards must use these, not a second copy of the maths, so a card can never disagree with the form.
- Public pages are static (`generateStaticParams`) and cached; variant routes must stay cacheable (s-maxage, HIT).
- `database.types.ts` is hand-edited, never regenerated. Page content is one jsonb document; a new optional card field needs no migration.
- `npm run` is broken; use direct node commands (see memory). No jargon in visible text.

## Left to the builder

- Field name and storage of the link on a card (a new field kind in `sections.ts`), and its key names for "All single modules" and "Group discount".
- How the country switcher and Early Bird switch are built (small client island), without a second copy of the price maths.
- How the importer's `.md` grammar names the link (for example `option: full`), validation, and the exact new rules in the master prompts (`prompts.ts` must also list the allowed values).
- Editor control design, readiness wording, test plan and browser checks (PC 1280, phone 390; main page, a country link, a module link).

## More designer's calls from the builder check (owner to review)

7. **Group example.** One line per group discount, computed with the same price calculation as the form at the discount's smallest group size, Live mode, and the Early Bird price while Early Bird is on. If the calculation fails for that country (no price), that line shows the discount without a per-person amount. The "Group discount" card is shown whenever the page has at least one group discount; it never shows an amount the form would not charge.
8. **What can a card be linked to.** Every item in "What people can buy" is a choice by itself (a bundle, a module, any other workshop). The two extras are "All single modules" (every item of kind module) and "Group discount". "Complete course" is simply whichever item the teammate picks, not a special rule. On a module link, "All single modules" shows that one module's price ("PKR 1,200"), and a card linked to an item that link does not offer is hidden.
9. **Early Bird per card.** The strike-through and "ends <date>" show only when that item has its own Early Bird price for the shown country. The date is shown as a date only ("24 September 2026"), read in the time zone saved with the Early Bird date, not the visitor's zone. After the cut-off the "ends" text disappears.
10. **Country switch and weight.** The main page needs the prices of every country in the browser to switch without reloading. The builder decides how (small client island that reuses `computeQuote`/`isEarlyBird` so there is no second copy of the maths, or all countries rendered on the server with a tiny toggle). Whichever way, `scripts/check-landing-bundle.mjs` must still pass; if it does not, the toggle approach is the fallback, not raising the budget.
11. **Registration off / everything hidden.** If every card ends up hidden the pricing section disappears as it does today when it has no cards. Readiness warns when registration is off and a linked card has no typed price ("This card has no price to show").
12. **Importer.** In the `.md`, a card with `option:` is linked and the AI should not write a price. If a file has both, the link wins and the typed price is kept as the fallback for when registration is off. Unlinked cards with typed prices stay valid.
