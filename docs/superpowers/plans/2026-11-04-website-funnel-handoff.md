# Website Funnel — Session Handoff (2026-11-04)

Context for the next coding agent. Plan: `docs/superpowers/plans/2026-11-04-website-funnel.md`.

## State
- Built in a cloud session (no Supabase / Stitch / browser). Code-only, checked by vitest + tsc (0 errors) + eslint.
- Branches are **stacked**, each built on the previous: `website-funnel` (plan only) -> `website-funnel-1` -> `-2` -> `-3` -> `-4`.
  `website-funnel-4` contains everything. All pushed; **no PR opened, nothing merged to main**.
  The owner should open ONE PR from `website-funnel-4`: https://github.com/pzacademy9/pz-academy---mentorship-program/compare/main...website-funnel-4?expand=1
- **No migration, no SQL, no `database.types.ts` change.** Uses existing `banners.slot` enum values (`hero`, `mid_page`, `sidebar`, `footer`) that the admin Marketing screen (`BannersPanel`) already offered but the site never rendered (only `hero` was used).
- New/changed files are LF (the files they replace were LF).
- Full suite: only pre-existing failures — the known list plus `participant-campaign-page-ui` and `registration-id-selection`, which fail identically on main `c971bca` (not caused by this work).
- Commit trailer used: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (owner's instruction).

## The funnel idea
Ladder, cheapest first: free Webinar -> Workshop -> Course -> Mentorship. Each page has one main button and ends pointing one rung up. In-site "native ads" are our own programs, always labelled **Featured** (no fake urgency, no pop-ups, max one per spot, never the page you're on).

## Shared pieces (new)
- `src/lib/marketing/promo.ts`
  - `pickPromo({ banners, batches, exclude })` -> `Promo | null`: admin banner first, else an open live batch, else null (spot hides).
  - `isSafeHref` only allows `/path` (not `//`) or `http(s)://` — admin links like `javascript:` are dropped. Also applied to the home hero banner CTA.
  - `exclude` compares by path only (trailing slash, query and absolute URL are all normalised).
  - `batchesNotListed(batches, courseIds)` and `PROMO_AFTER = 3`.
- `src/components/marketing/PromoSlot.tsx`: `variant="banner"` renders a `<section aria-label="Featured: …">`; `variant="card"` renders an `<article aria-label="Featured: …">` for in-grid use. Has no hooks, so it works inside server and client components.
- `src/lib/marketing/sticky-cta.ts`: `stickyEnrollAction`, an exhaustive switch that mirrors `EnrollCta`:
  - signed out -> login
  - none -> `/enroll/slug` with "Enroll/Register Now"
  - reserved -> "Complete Payment"
  - rejected -> "Submit New Payment"
  - expired -> "Enroll Again"
  - active / pending / portal_closed -> null (no bar)
- `src/components/courses/StickyEnrollBar.tsx`: phone-only (`lg:hidden`) fixed bottom bar, `z-40`, safe-area padding.
- `src/components/marketing/MarketingHero.tsx`: short dark hero (not `min-h-screen`) plus `HERO_BUTTON`.
- `src/components/marketing/NextStep.tsx`: closing CTA with a primary button (this page) and a "Next: …" button (next rung).

## Page changes
- **Home `src/app/page.tsx`**
  - Hero: "Find your program" (`#paths`) + "Free webinars"; an admin hero banner's CTA replaces the first button.
  - `#paths` section: the Services cards, reordered to the ladder with step labels.
  - "Find a Mentor" now goes to `/mentorship#mentors`. Bug: it used to go to `?type=mentor#apply`, the mentor *recruitment* form.
  - Reviews moved out of the desktop-only floating hero into a "What students say" row.
  - `mid_page` banner promo (banners only; batches already have `OpenBatchStrip`).
  - Final CTA is "Find your program" + WhatsApp. It used to be Create Free Account / Browse Courses.
  - The inline footer is replaced by the shared `MarketingFooter`. Page wrapped in `<main>`.
- **`MarketingFooter`**
  - Every `#` link removed: social icons, MED-Q, Blogs, Affiliate, Ambassador, Opportunities, Our Team, Seminars, Privacy Policy.
  - Columns: Programs (Home, Webinars, Workshops, Courses, Mentorship), Account (Sign In, Create Account, Dashboard, Certificates), Contact (WhatsApp, email, pharmacozyme.com).
  - Columns are `<nav>` + `h2`; links `min-h-11`; contrast raised.
- **Courses / Workshops / Webinars list pages**
  - `MarketingHero`. Courses hero was light, so the transparent white nav was unreadable; it is now dark.
  - In-grid Featured card after the 3rd item from a `sidebar` banner, else an open batch not already listed. Hidden while searching (`CourseCatalogGrid`) or filtering (`WebinarGrid`); grid items carry `data-grid-item`.
  - Empty catalog shows "No X are open right now" + a "Watch a free webinar meanwhile" link (`emptyNext` prop).
  - `NextStep` links: webinars -> `/workshops`, workshops -> `/courses`, courses -> `/mentorship#mentors`.
  - Webinars: "Date TBD" removed; filter buttons `min-h-11` + `aria-pressed`.
  - Search box is `type="search"` with an aria-label. CourseCard "View Details" is `min-h-11`.
  - Removed on purpose: "— Seats Filling Fast" (Workshops hero) and "Back to Home" (Workshops CTA).
- **Course detail `src/app/courses/[slug]/page.tsx`**
  - Phone sticky enroll bar, plus a `lg:hidden h-28` spacer after the footer so it never covers content.
  - Sidebar has `id="enroll"`.
  - `mid_page` promo (else another course's batch; never this course or its batch).
  - One `getOpenLiveBatches()` read replaces `getOpenLiveBatch`. The banner read uses `.catch(() => [])`.
- **Mentorship**
  - `src/app/mentorship/page.tsx`: `footer` banner promo, else an open batch, above the footer.
  - `HeroSection` phone CTAs: `minHeight: 48`, font 12px (was 10px).
- **`MarketingNav` (phone menu)**
  - Closed menu: `invisible` + `aria-hidden`, and `inert` set via ref (React 18 has no inert prop).
  - Opening focuses the first link. Escape closes the menu and returns focus to the button; closing via a link tap does not move focus.
  - Toggle is `z-[200]` and `min-h-11 min-w-11`. Before, the X sat under the `z-[199]` overlay.
  - No `backdrop-blur` while open. On `alwaysSolid` pages the blur clipped the fixed overlay to the 68px bar.
  - Durations fixed: `duration-400` and `after:duration-250` did not exist; they are now arbitrary values.

## Tests added
`tests/marketing-promo.test.ts`, `marketing-promo-slot.test.tsx`, `marketing-footer.test.tsx`, `home-funnel.test.tsx`, `website-list-pages.test.tsx`, `course-detail-funnel.test.tsx` (includes a table test that the bar agrees with `EnrollCta` for every status), `marketing-nav.test.tsx`, `mentorship-funnel.test.tsx` (the HeroSection check is a source-text regex — weak; it could become a render test).

## Owner to-dos / open items
- Test on the Vercel preview of the `website-funnel-4` PR. Admin -> Marketing -> Banners with slot Mid Page / Sidebar / Footer fills the spots. Live main ignores those slots until merge, so adding test banners is safe.
- Not done:
  - Promo click counting (needs a new table — ask first).
  - Real social / Blog / Privacy Policy links to restore in the footer.
  - Admin banner zod schema (`src/lib/validations/admin-marketing.ts`) still accepts any `ctaLink` string. The site now ignores unsafe links, but the form could reject them too.
- No Stitch screen was checked (no Stitch in the cloud session). All work reuses existing components and `pz-*` tokens.
