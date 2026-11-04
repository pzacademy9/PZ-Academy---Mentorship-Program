# Stitch prompts — premium website redesign

Run these in the Stitch project **"PZ Academy website"** (`11811490301995978699`).
Paste **Prompt 0 at the start of every prompt** (it keeps all screens matching), then the page prompt.
Make each page twice: once as **Web (desktop)** and once as **Mobile**.
Order: 1 Home → 2 Courses list → 3 Course detail → 4 Workshops → 5 Webinars → 6 Mentorship.

---

## Prompt 0 — shared style (paste before every page prompt)

```
Design system for "PZ Academy by Pharmacozyme", a premium online academy for pharmacy and health-sciences students in Pakistan, UAE and KSA. Style: professional LMS like Coursera, MasterClass and Maven, with a friendly, fun touch like Duolingo and Osmosis. Clean, calm, lots of white space, confident typography. No clutter, no stock "card soup", no floating boxes over photos.

Colours: deep green #0F3D22 (dark bands, footer), forest green #194B32 (primary buttons on light), mid green #196432 (accents, links), lime #7ED957 (main call-to-action button, highlights, small dots), off-white #F7FAF5 (page background), white #FFFFFF (cards), ink #1A2E1F (body text), muted #4D6B54 (secondary text), border #D4EACC, gold #C9960A (only for certificates and "top mentor").
Fonts: Montserrat ExtraBold/Black for headings (tight letter spacing), Poppins for body text, Fredoka for small playful labels and badges.
Shapes: 24px rounded cards with a 1px border and a very soft green-tinted shadow; pill-shaped buttons at least 44px tall; small pill badges.
Buttons: main = lime #7ED957 with deep-green text; second = forest green with white text; on dark backgrounds the second button is a white outline.
Icons: thin line icons (Lucide style). Illustration motif: small molecule dots and capsule shapes, used sparingly.
Top menu: logo "PZ Academy" left; links Home, Courses, Workshops, Webinars, Mentorship; "Find my ID" and a lime "Enroll" button right. On mobile: logo + hamburger.
Footer: deep green, logo, short line "Educating with Innovation", columns Programs / Help / Contact (WhatsApp +92 370 0199429), small copyright.
Mobile rules: 16px side margins, nothing wider than the screen, one main button per screen, tap targets 44px+, text at least 15px.
```

---

## Prompt 1 — Home page

```
Home page for PZ Academy.

1. HERO (full width, no cards on top of the photo). Deep green #0F3D22 background with a soft lime glow. Left half: small pill label "Educating with Innovation"; big heading "Empowering Minds To Master The Science Of Medicine" with "To Master The Science" in lime and a hand-drawn underline; one line of text "Live webinars, hands-on workshops, certified courses and 1-on-1 mentors for pharmacy and health sciences students."; two buttons: lime "Find your program" and white-outline "Free webinars". Under the buttons a quiet trust row: 3 overlapping round mentor photos + "Taught by practising experts", and a check icon + "SECP certified program". Right half: one large photo of a smiling young female pharmacist in a white lab coat, cut out cleanly and blending into the green background (no frame, no box), with a thin lime arc shape behind her. A single slim line at the very bottom of the hero: green dot "Live batch open: Pharmacology Course — starts 30 November" + "Register" text link.
Mobile: text first, centred; the photo below the buttons, smaller, cropped from the chest up, still blending into the green; the batch line becomes a full-width slim bar.

2. NUMBERS ROW on off-white: four simple stats in one row (two by two on mobile), big Montserrat numbers with a small label: "12+ Live webinars", "2+ Active courses", "3+ Workshops", "SECP Certified program". Thin dividers, no boxes.

3. FIND YOUR PROGRAM: heading "Start free, then level up". A horizontal 4-step journey with a connecting line: 01 Webinars "Start free" (badge "Free"), 02 Workshops "Build a skill", 03 Courses "Get certified" (badge "Certificate"), 04 Mentorship "1-on-1 help". Each step: icon, title, one short sentence, text link with arrow. Mobile: vertical timeline, line on the left.

4. POPULAR PROGRAMS: heading "Popular programs", 3 course cards (cover image 16:10, type badge, "Live batch open" lime badge on one, title, teacher avatar + name, level and duration chips, price "PKR 9,000" with an Early Bird strike-through price, "View details" button). Link "See all courses". Mobile: cards swipe sideways in one row, showing a peek of the next card.

5. QUICK QUIZ (the fun part): split block. Left: label "Test yourself", heading "How sharp are you?", short text, button "Learn it in a free webinar". Right: a quiz card "Question 1 of 4 — What is the antidote for a paracetamol overdose?" with four answer options A–D, one marked correct in green with a tick, a small "+100 pts" score pill in gold, and a "Next question" button.

6. MEET YOUR MENTORS: heading "Meet your mentors", a row of 6 round portrait photos with name and title under each, button "See all mentors". Mobile: 2 per row.

7. STUDENT STORIES: heading "What students say", two large quote cards with student initials avatar, name and role ("Sara A., Pharm.D Student"). No star ratings.

8. FINAL CALL TO ACTION: deep green band, "Build the expertise that transforms careers", buttons lime "Find your program" and outline "Ask us on WhatsApp".

9. Footer.
```

---

## Prompt 2 — Courses list page

```
Courses list page for PZ Academy.

1. SHORT HERO (not full screen): deep green band, label "Certified Courses", heading "Explore Our Courses" ("Courses" in lime), one line "Expert-led pharmacy modules with SECP-certified completion." Inside the hero a large rounded white search box "Search courses, e.g. dose calculations" with a lime search button, and under it topic chips: All, Pharmacology, Clinical Pharmacy, Dose Calculations, Pharmacovigilance, Regulatory.
2. FILTER BAR (sticks to top when scrolling): Level (Beginner / Intermediate / Advanced), Format (Live / Recorded), Price (Free / Paid), and "12 courses" count on the right. Mobile: one "Filters" button that opens a bottom sheet.
3. COURSE GRID: 3 columns desktop, 1 column mobile. Card: cover image, type badge, "Live batch open" badge, title, one-line tagline, teacher avatar + name + title, chips (level, duration, "Starts 30 Nov"), "8 seats left" small orange text, price with Early Bird strike-through, "View details" button. One card in the grid is a dark green "Featured" promo card.
4. WHY STUDY WITH US: three compact items in a row with icons: "Expert-led faculty", "Clinically relevant", "SECP certificate".
5. FAQ: 5 questions in an accordion ("Who are these courses for?", "Live or recorded?", "Will I get a certificate?", "How do I secure my spot?", "Do I need prior knowledge?").
6. NEXT STEP band: "Want 1-on-1 guidance too?" with buttons "Explore courses" and "Next: 1-on-1 Mentorship".
7. Footer.
```

---

## Prompt 3 — Course detail page

```
Course detail page for "Mastering Dose Calculations" at PZ Academy.

1. TITLE BAND (deep green): breadcrumb "Courses / Dose Calculations"; badges "Course" and "Live batch open"; big title; one-line promise "Build clinical confidence with pediatric, renal and weight-based dosing."; teacher row (photo, "Dr Imad Khan, Clinical Pharmacist"); facts row with icons: "8 weeks", "Beginner friendly", "Live + recorded", "SECP certificate".
2. RIGHT SIDE STICKY ENROLL CARD (desktop): course cover image or short video with play button, price "PKR 9,000" and strike-through "PKR 12,000", "Early Bird ends in 3d 4h 12m" countdown, "Starts 30 November", "8 seats left", big lime "Enroll now" button, small "Ask on WhatsApp" link, list "What's included" (live classes, recordings, notes, quizzes, certificate).
Mobile: no side card; a slim sticky bottom bar with price and a lime "Enroll" button.
3. MAIN COLUMN sections: "What you'll learn" (6 ticks in two columns); "Curriculum" (accordion of modules with lesson counts and durations); "Your teacher" (photo, bio, credentials); "Your certificate" (image of a certificate with gold seal); "What students say" (2 quote cards); "FAQ" accordion.
4. Footer.
```

---

## Prompt 4 — Workshops list page

```
Workshops list page for PZ Academy, same layout as the Courses list page but for short hands-on workshops.
Hero label "Live Workshops", heading "Learn by doing" ("doing" in lime), line "Short, intensive, hands-on sessions guided by industry experts." Search box "Search workshops" and chips: All, Clinical Skills, Research, Career, Industry.
Workshop cards highlight the date and time strongly: a date block on the cover ("30 NOV · 7:00 PM"), title, teacher avatar + name, duration chip "3 hours", "Limited seats" badge, price or "Free", "Reserve seat" button.
Then three compact benefit items ("Hands-on practice", "Certificate of completion", "Lifetime resources"), and a next-step band "Ready for the full course?" with "Next: Courses".
```

---

## Prompt 5 — Webinars list page

```
Webinars list page for PZ Academy (free expert talks).
Short deep green hero: label "Webinar Series", heading "Expert insights, free" ("free" in lime), line "Join live or watch recordings any time." Tabs as pills: All, Upcoming, Recorded.
Section "Upcoming": wide cards with a big date block ("12 DEC · 8:00 PM PKT"), speaker photo, speaker name and title, webinar topic, "Free" badge, buttons lime "Register free" and outline "Add to calendar".
Section "Recorded": grid of video cards with a 16:9 thumbnail, round play button, duration label "1:12:30", speaker avatar + name, topic, "Watch recording" link.
Mobile: upcoming cards stack, recorded cards in one column.
Next-step band: "Ready for hands-on practice?" with "Next: Workshops".
```

---

## Prompt 6 — Mentorship page

```
Mentorship page for PZ Academy, using exactly the same colours and fonts as the rest of the site (no separate gold theme; gold only for the "Top mentor" badge).
1. HERO (deep green): heading "Find your mentor" with "mentor" in lime, line "1-on-1 sessions with verified pharmacists, doctors and researchers." A search box "What do you need help with?" with chips: Career, Board exams, Research, Industry jobs, Studying abroad. On the right a neat mosaic of 5 round mentor portraits with soft lime rings.
2. TRUST ROW: "50+ sessions booked", "100% verified experts", "Trusted across Pakistan".
3. MENTOR GRID: 3 columns (1 on mobile). Card: portrait photo, name, title, "Top mentor" gold badge on some, 3 skill chips, "From PKR 3,000 / session", "Next free slot: Tomorrow", buttons "View profile" and lime "Book".
4. HOW IT WORKS: 4 steps on a line: Submit booking → Payment verified → Get meeting link → Attend session.
5. BECOME A MENTOR: light green band with short text and button "Apply to mentor".
6. Footer.
```
