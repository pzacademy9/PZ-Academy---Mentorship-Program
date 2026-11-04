# Website premium redesign — analysis and plan

Scope: public site only — Home (`src/app/page.tsx`), Courses (`src/app/courses`, incl. `[slug]`),
Workshops (`src/app/workshops`), Webinars (`src/app/webinars`), Mentorship (`src/app/mentorship`).
Goal: a premium, trustworthy LMS look that still feels fun and alive (medical-education feel).

## 1. What the site does today (honest review)

What already works:
- Clear "ladder" idea: Webinars (free) → Workshops → Courses → Mentorship. Keep it.
- Real data on list pages (courses, webinars, mentors, open batches, admin promo spots).
- Good basics: 44px buttons, phone menu, honest copy where ratings don't exist yet.

What holds it back:
1. **Three different looks.** Home and list pages use the pz green/lime look; course cards use a
   third token set (`pz-primary`, `pz-surface-*`); Mentorship uses its own gold palette
   (`brand.*`, `mentorship.css`, many inline `style={{}}`). It feels like three websites.
2. **Every page opens the same way.** Dark green box, hex pattern, blurry circles, centred text.
   No photo, no product, no faces. Premium LMS sites show the learning itself in the first screen.
3. **Home hero is a full screen of words.** A visitor sees no course, no teacher, no date, no price
   until they scroll a long way.
4. **Weak or mixed numbers.** "2+ Active Courses" undersells; "thousands of students", "100K+ network",
   "240+ Enrolled" (fallback card) and "50+ sessions" don't agree with each other. Need real numbers.
5. **Thin proof.** Two text-only reviews with initials. No photos, no video, no university logos,
   no "where our students work".
6. **Cards say too little.** Course card: no teacher, no start date, no seats left, no Early Bird
   price. Webinar card: no date/time, no topic picture, no "add to calendar".
7. **No way to browse.** No search, no topic chips (Pharmacology, Pharmacovigilance, Dose Calc...),
   no level/format filters.
8. **Little "fun".** Animations are decoration (floating blobs) rather than meaningful moments
   (quiz score, streak, countdown, progress). MED-Q, the most fun thing PZ has, is one text card.
9. **Same long blocks on every page.** Six "benefits" cards + FAQ + CTA repeat on each list page.

## 2. Design direction: "Clinical Premium, Playful Learning"

Inspiration (what to borrow from each):
- **Coursera / Maven** — course cards with teacher face, start date, cohort feel, sticky buy card.
- **MasterClass** — big, confident photos of teachers; cinematic hero.
- **Osmosis / Lecturio / AMBOSS** — medical-education trust: clean white, clear icons, "used by
  students at...", bite-size learning.
- **Brilliant / Duolingo** — fun through *interaction*: quiz preview, streaks, progress rings,
  friendly illustrations, small celebrations.
- **Linear / Stripe** — calm spacing, sharp type, subtle motion, glass/blur used sparingly.

Visual rules:
- **One palette.** Deep forest green (trust) + lime `pz-bright` (energy) + warm off-white surfaces.
  Gold only for "certificate / premium / top mentor" moments. Mentorship moves onto these tokens.
- **Type.** Montserrat for headings (tight, bold), Poppins for body. Fredoka (already loaded) only
  for small playful labels (badges, quiz chips) — this is where the "fun" voice lives.
- **Shapes.** Rounded 20–24px cards, pill buttons, soft layered shadows (respect the existing
  "Soft shadows" switch style), one signature motif: a **capsule/pill shape** and **molecule dots**
  instead of the generic hex grid.
- **Light-first pages, dark moments.** Mostly bright white/off-white pages (feels modern and
  premium); dark green kept for the hero band and the final call-to-action only.
- **Motion with meaning.** Count-up numbers on first view, cards lift on hover, live dot pulses,
  countdown ticks, confetti only after a real action. All off for "reduce motion" users.

## 3. Page by page

### Home
1. **Split hero** (left: headline + 2 buttons + trust line; right: a live "learning collage" —
   a real course cover, a teacher photo, a floating "Live class tonight 8pm" chip, a mini quiz
   card "Q3: Which drug... ✓ +100 pts", an SECP certificate chip). Phone: text first, collage below
   as a short swipe row.
2. **Trust strip**: "Students from" university names/logos + SECP badge + real count numbers.
3. **Next live batch bar** (from `getOpenLiveBatches`): countdown, seats left, Early Bird price.
4. **Choose your path** — the ladder as a visual journey (4 connected steps with a progress line),
   each step shows 1 real item (next webinar, next workshop...).
5. **Popular programs carousel** — real course cards from the catalogue (not the fallback).
6. **MED-Q fun block** — a playable 1-question quiz on the page (pick an answer, get instant
   feedback + "Play more on MED-Q"). This is the "fun and engaging" hook.
7. **Meet the mentors** — 6 faces strip linking to Mentorship.
8. **Student stories** — photo cards (with permission), optional short video, outcomes ("passed
   board exam", "got a job at ...").
9. **Short FAQ** + **final CTA** (dark green, WhatsApp + Find your program).

### Courses / Workshops / Webinars (one shared catalogue template)
- Short hero with **search box + topic chips** right in it (results show on first phone screen).
- Filter row: topic, level, format (live / recorded), price (free / paid). Sticky on scroll.
- **New rich card**: cover image, type badge, teacher avatar + name, start date or "Recorded",
  duration, level, seats-left chip, price with Early Bird strike-through, one clear button.
- Webinar card: date + time, topic picture with ▶ overlay for recordings, "Add to calendar" for
  upcoming.
- Skeleton loaders (already have `loading.tsx` files) restyled to match new cards.
- Benefits cut from 6 cards to a compact 3-item row; FAQ only on Courses.
- Friendly illustrated empty state ("New batch coming soon — get notified on WhatsApp").

### Course detail (`/courses/[slug]`)
- Coursera/Maven layout: big title band with teacher, rating (only when real), start date;
  right side **sticky enroll card** (price, Early Bird timer, seats, Enroll button; phone keeps the
  existing bottom enroll bar).
- Sections: What you'll learn (checklist), Curriculum (existing accordion, restyled),
  Your teacher, Certificate preview image, Student reviews, FAQ.

### Mentorship
- Move onto the shared tokens/components (drop most inline styles and the separate gold palette).
- Hero: mentor face mosaic + search ("I need help with: career / exams / research").
- Filter chips by field; mentor cards show photo, title, top skills, price from, "next free slot".
- "How it works" as a 4-step timeline (keep content), plus "Become a mentor" kept lower down.

## 4. Build phases (each its own branch + PR)

| Phase | What | Size |
|---|---|---|
| 0 | Shared kit: `Section`, `SectionHeader`, `Button`, `Badge`, `ProgramCard`, `StatCounter`, motion helpers; unify tokens; mentorship palette mapped to pz tokens | Medium |
| 1 | Home page redesign | Large |
| 2 | Catalogue template (Courses, Workshops, Webinars) + search/filters + new cards | Large |
| 3 | Course detail page | Medium |
| 4 | Mentorship page onto the new kit | Medium |
| 5 | Delight pass: MED-Q quiz widget, confetti, empty-state illustrations, reduced-motion, speed check (images via `next/image`) | Medium |

Rules kept: no database changes expected (search/filter run on data we already load); existing
tests kept passing; new tests for each new component; phone-first; 44px tap targets.

## 5. What I need from the owner
- **Designs:** CLAUDE.md says Stitch is the design source. This cloud session can't reach Stitch.
  Option: I write one Stitch prompt per page, owner generates screens, I build from them.
- **Real numbers:** students taught, webinars held, cities/countries, universities.
- **Proof:** 4–6 student stories with photo permission; university names/logos allowed.
- **Photos:** teacher photos for courses/workshops (mentor photos already in `public/`).
