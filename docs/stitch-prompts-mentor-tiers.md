# Stitch generation prompts — Mentor Tier / Ranking System (Phase B)

Written 2026-08-25 during planning for the mentor tier ladder (standard/premium/
platinum/elite). Backend (Phase A) is shipped — see plan file
`C:\Users\hamza\.claude\plans\mentor-tier-system-plan-golden-badger.md` and memory
`pz-academy-mentor-tier-phase-a-shipped`. Nothing in the UI has been built: no tier
screen exists in any of the three known Stitch projects (11811490301995978699,
963183329053087808, 4651274386787527431 — 152 screens checked), so per the standing
Stitch-first rule these prompts must be run and the resulting screens extracted before
any badge/strip/form-section code is written.

## Extraction note (read before porting any of these to code)

Two separate palettes are in play, and each prompt below targets exactly one:

- **Prompt 1 and 2** (public `/mentorship` pages) use the `brand` palette — deep green
  `#1A4D2E`, gold `#C9A84C`, cream `#FDFCF8` background — mostly **inline hex styles**,
  not Tailwind token classes. `tailwind.config.ts` comments this palette
  *"Mentorship section only — do not use elsewhere, use colors.pz instead"*. Port these
  screens by copying the inline style values, not by mapping to `pz-*` classes.
- **Prompt 3** (admin mentor edit page) uses the `pz-*` Material-3 admin palette — same
  token-class convention as `docs/stitch-prompts-feedback-phase-2.md` describes
  (`bg-pz-surface-container-lowest`, `text-pz-on-surface-variant`, etc.). Generate this
  one in project `963183329053087808` ("PZ Academy Mentorship Portal") or
  `11811490301995978699` ("PZ Academy website", has the generic admin-dashboard
  scaffolding) so it inherits the right token set.

Known insertion points once screens exist (see the plan file's Phase B section for the
full file/line list): `MentorCard.tsx`, `MentorProfileClient.tsx`, `BookingClient.tsx`,
`MentorRegistryTable.tsx`, a new `TopMentorsStrip.tsx`, and a new "Tier & Ranking"
section in `MentorConfigForm.tsx`. All `MentorTier` imports inside `"use client"` trees
must be `import type` — `src/lib/mentor-tier.ts` has no `server-only` tag but the
convention still applies at that boundary.

---

## Prompt 1 — public mentor card + tier badge (desktop + mobile)

> Redesign the PZ Academy mentorship mentor card to carry a tier badge. Brand palette:
> deep green `#1A4D2E`, gold `#C9A84C`, cream `#FDFCF8` background, Poppins body,
> serif display headings. The card already has: a circular mentor photo with a small
> gold circular "verified" checkmark overlaid at its lower right, the mentor's name,
> an uppercase letter-spaced expertise pill in pale green (`#E8F5EE` bg, `#1A4D2E`
> text), a 5-star rating row with a review count, a two-line short bio, an
> experience/language meta row, a price line ("PKR 6,000 / session"), and a "View
> Profile" CTA.
>
> Add a **tier badge** — a small uppercase pill sitting on the same baseline as the
> expertise pill, directly under the name. Show four card variants side by side, one
> per tier: **Standard** (badge absent entirely — the card must look complete and
> unpenalised without it), **Premium** (subtle green), **Platinum** (cool silver-grey),
> **Elite** (solid gold `#C9A84C` with dark green text, clearly the most prestigious).
> The badge must never show a number — no score, no review count, no percentage. Word
> only. Keep it visibly subordinate to the mentor's name; it is a mark of standing, not
> a headline. Do not alter the existing gold verified checkmark.

## Prompt 2 — "Top Mentors" featured band (desktop + mobile)

> Design a "Top Mentors" featured band for the PZ Academy mentorship landing page. It
> sits between the trust bar and the main mentor grid, on a page with a cream `#FDFCF8`
> background. Make the band visually distinct from the grid below it so it reads as a
> highlight, not a duplicate grid — use a deep green `#1A4D2E` background with a subtle
> diamond texture, an uppercase gold section label reading "TOP RATED", a serif heading
> "Top Mentors", and a short gold divider rule beneath it.
>
> Inside, a horizontally scrolling row of 3-4 **compact** mentor cards (deliberately
> smaller and denser than the main grid cards): circular photo, name, tier badge (gold
> "ELITE" or silver "PLATINUM" pill), one-line expertise, price, and a "View Profile"
> link. Show the row containing a mix of Elite and Platinum mentors. Include a mobile
> version where the row scrolls horizontally with a partial card peeking at the right
> edge to signal scrollability.

## Prompt 3 — admin "Tier & Ranking" form section (desktop)

> Design a "Tier & Ranking" card section for the PZ Academy admin mentor edit page.
> Material-style admin theme: white/very-light surface cards with rounded corners and a
> thin outline border, a bold headline-font section title with a small medal icon and a
> divider rule under it, and small uppercase field labels above inputs.
>
> The section contains two parts. **Top: a read-only computed readout** in an inset
> panel — the label "Computed", a tier pill reading "Platinum", the text "score 84.6 /
> 100", and a small muted line beneath reading "18 public reviews · 4.71 avg · 31
> completed sessions · updated 12 Aug 2026". Include an italic muted warning line
> variant for the case where the mentor has no linked account: "No linked account —
> completed sessions can't be counted, which caps the computed tier at Premium. Pin a
> tier below to override."
>
> **Bottom: a two-column row.** Left is a "Tier Override (pin)" dropdown whose first
> option reads "Auto — follow the computed tier", followed by Standard / Premium /
> Platinum / Elite. Right is a read-only "Effective Tier" display box showing a tier
> pill plus the words "pinned by admin", with a smaller muted "(computed: Platinum)"
> beside it so the override is never silent. Below both, an italic advisory line:
> "Suggested single-session price for Elite: PKR 15,000–40,000. Guidance only — you can
> price outside it and the save will still go through."
>
> Show tier pills for all four tiers in the admin palette (Standard must be visible
> here, unlike the public site — greyed but present).
