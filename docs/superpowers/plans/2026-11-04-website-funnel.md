# Website Funnel and Native Promos Plan

> **For agentic workers:** build one part per branch, task by task. Failing tests first, then code. Checks: `tsc --noEmit` 0 errors, eslint clean, focused vitest.

**Goal:** Turn the public website (Home, Courses, Workshops, Webinars, a little of Mentorship) into one clear path that guides every visitor to the thing they are most likely to buy, with in-site promos that look like part of the page.

**No database change.** Promos use the banner spots that already exist in the admin Marketing screen (`banner_slot`: `hero`, `mid_page`, `sidebar`, `footer`). Today only `hero` is shown on the site. Open live batches (`getOpenLiveBatches`) give automatic promos when no banner is set.

**No Stitch in this session.** Every change reuses existing components, `pz-*` tokens and the current look. No new style.

---

## 1. The path a visitor takes (the ladder)

Cheapest and easiest first, then step up:

1. **Free webinar recording** (first taste, no money) ->
2. **Workshop** (short, low price) ->
3. **Course** (main product, certificate) ->
4. **Mentorship** (1-on-1, premium).

Every page answers three things: *What is this? Why trust it? What do I do next?* Every page has **one** main button. Every page ends by pointing to the **next step up** the ladder.

## 2. Native promos ("house ads")

One shared `PromoSlot` component, three looks, all labelled **Featured** (honest, never fake "ad" or fake urgency):

- **Strip** — thin bar under the hero ("MDC Batch 3 starts 12 Nov — seats open ->"). Already exists as `OpenBatchStrip`; reused everywhere.
- **In-feed card** — same shape as a course/webinar card, sits inside the grid (after the 3rd card on phone, end of first row on desktop).
- **Banner** — wide card between sections (image, headline, one button).

Source order for each spot: admin banner for that slot -> open live batch -> nothing (spot hides; never an empty box).

Where they go:

| Page | Spot | Admin slot |
|---|---|---|
| Home | between "What we offer" and "Active programs" | `mid_page` |
| Webinars | in-feed card in the webinar grid | `sidebar` |
| Workshops / Courses | in-feed card in the grid | `sidebar` |
| Course detail | "Your next step" card under the content | `mid_page` |
| All pages | above the footer | `footer` |

Rules: at most one promo per screen height on phone; never covers content; no pop-ups; never shows the product the visitor is already looking at.

## 3. Page by page

### Home (`src/app/page.tsx`)
- Hero: one main button "Find your program" (scrolls to the path chooser), second quiet link "Free webinars".
- New **path chooser** right under the hero: four big tap cards — "Start free" (Webinars), "Build a skill" (Workshops), "Get certified" (Courses), "1-on-1 help" (Mentorship). Replaces nothing; uses the existing Services data.
- Open batch strip stays near the top.
- Reviews move out of the hero into their own small trust row (easier to read on phone).
- Mid-page promo. Active programs. Final call to action.
- Use the shared `MarketingFooter` (the home page has its own copy today).

### Courses, Workshops, Webinars (list pages)
- Shorter hero (not full screen) so products show on the first phone screen.
- In-feed promo card.
- Empty state never a dead end: "No workshops open right now — watch a free webinar meanwhile" with a button.
- End of page: "Next step" block pointing up the ladder (Webinars -> Workshops, Workshops -> Courses, Courses -> Mentorship).
- Webinars: hide "Date TBD" when there is no date; filter buttons 44px tall.
- Courses page uses the same heading style as Workshops/Webinars.

### Course detail (`src/app/courses/[slug]/page.tsx`)
- Phone: sticky bottom bar with price and the Enroll button (desktop keeps the sticky side box).
- "Your next step" promo under the content.

### Mentorship (light touch)
- One clear main button in the hero; entry cards from the other pages point here.
- Footer promo spot.

## 4. Quality fixes done along the way
- Dead `#` links in the footer: hidden until real links are given (social icons, MED-Q, Blogs, Affiliate, Ambassador, Opportunities, Our Team, Seminars, Privacy Policy).
- Tap targets at least 44px (buttons, filter tabs, footer links, menu button).
- Faint footer text made readable (contrast).
- Phone menu: closes with Escape, focus goes into it and back to the button.
- Reduced motion already handled site-wide in `globals.css`; new pieces add no long animations.

## 5. Branches (small, each finished on its own)
1. `website-funnel-1` — `PromoSlot` + Home page + shared footer fixes.
2. `website-funnel-2` — Courses, Workshops, Webinars list pages.
3. `website-funnel-3` — Course detail sticky bar + next-step promo.
4. `website-funnel-4` — Mentorship light touch + phone menu fixes.

## 6. Not in this plan (would need the database or live tools)
- Counting promo clicks (needs a new table — ask the owner first).
- Personal suggestions based on what a visitor bought before.
- Stitch designs for brand-new screens.

## 7. Owner steps after merge
- Admin -> Marketing -> Banners: add a banner for "Mid Page", "Sidebar" or "Footer" to fill a spot. With none set, open live batches fill it automatically; with nothing open, the spot hides.
