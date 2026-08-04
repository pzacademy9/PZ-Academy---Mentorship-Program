# Mentorship Portal Structural Port (Spec 1 of 2)

## Problem

`PZ-Academy---Mentorship-Program-main` is a separate, already-live Next.js 14
app (own repo `pzacademy9/PZ-Academy---Mentorship-Program`, own Vercel
deployment on `main`) covering 1-on-1 mentor booking, mentor recruitment,
and a session feedback/review flow. It predates `pz-academy-platform` and
was built standalone. The platform now needs mentorship to be a peer
section next to Courses/Webinars/Workshops — `/mentorship` — inside the one
app, not a separate site a visitor has to bounce out to.

This spec is the structural port only: move the working pages/components/
API routes into the platform, wire them into the platform's shared
navigation and layout, and resolve the handful of real naming/dependency
conflicts that come from having two Next.js apps' source trees merge into
one. It does not touch how any of mentorship's data is stored.

## Explicitly out of scope (Spec 2)

- Dual-writing the booking form and mentor-recruitment form into Supabase.
- Any two-way sync between Google Sheets and Supabase for those two forms
  (`onEdit` → webhook → Supabase; admin action → write-back to Sheet).
- An admin review UI (status badges, approve/reject actions, notifications)
  for bookings or mentor applications.

These need their own brainstorming pass — open decisions (status vocab per
form, what an admin action triggers, notification behavior) that don't
block this port. The booking form and mentor-recruitment form keep posting
to their existing standalone Apps Script Web Apps
(`NEXT_PUBLIC_BOOKING_SCRIPT_URL`, `NEXT_PUBLIC_MENTOR_SCRIPT_URL`)
completely unchanged in this spec — the team's Sheets workflow for both
is not touched or put at risk by this work.

## Decisions already made

- **Backend stays on GAS/Sheets**, not migrated to Supabase — the team
  works directly in Sheets today, and this spec doesn't change that for
  any of mentorship's three GAS integrations (Feedback System, booking
  script, mentor-recruitment script).
- **Route**: `/mentorship`, matching the path already used inside
  mentorship's own source (`src/app/mentorship/...`).
- **Visual design ported as-is** — no reskin to the platform's Stitch
  design system as part of this spec. Reskin is a separate, later pass.
- **Auth unchanged** — booking/feedback/review/recruitment stay fully
  public, no login required, exactly as they work today.
- **The old standalone site is not touched or retired.** It keeps running
  at its current domain/deployment throughout and after this work. The
  ported `/mentorship` section is built and verified in the platform
  locally; the platform itself is not live to students yet (separate,
  already-tracked concern), so there's no premature exposure either way.

## 1. Route and file mapping

Direct port, not a rewrite — this is proven, working code being relocated:

| Source (mentorship repo) | Destination (platform repo) |
|---|---|
| `src/app/mentorship/**` | `src/app/mentorship/**` (same subpaths) |
| `src/app/feedback/**` | `src/app/feedback/**` |
| `src/app/review/**` | `src/app/review/**` |
| `src/app/api/feedback/route.ts` | `src/app/api/feedback/route.ts` |
| `src/app/api/cover/[fileId]/route.ts` | `src/app/api/cover/[fileId]/route.ts` |
| `src/app/api/upload-video/route.ts` | `src/app/api/upload-video/route.ts` |
| `src/app/api/share-card/[token]/route.tsx` | `src/app/api/share-card/[token]/route.tsx` |
| `src/components/{HeroSection,MentorCard,MentorProfileClient,MentorsSectionWrapper,BookingClient,RecruitmentForm,TrustBar}.tsx` | `src/components/mentorship/*.tsx` |
| `src/lib/{gas,mentors,share-card-data}.ts` | `src/lib/mentorship/*.ts` (kept apart from `src/lib/data/*`, which is Supabase-backed — this is a different backend, and mixing them in one directory would misrepresent that) |

None of these paths collide with anything that exists in the platform
today (verified: platform's `src/app/api/` has no `feedback`, `cover`,
`upload-video`, or `share-card` routes).

**Dropped, not ported**: mentorship's own root `src/app/page.tsx` (a splash
screen linking into `/mentorship` — the platform already has a real
homepage) and root `src/app/layout.tsx` (superseded by the platform's own
root layout; its font-loading needs are folded into section 4 below).

## 2. Shared navigation, not duplicate navigation

Mentorship's own `Navbar.tsx` / `Footer.tsx` are **not** ported. The ported
pages use the platform's existing `MarketingNav` / `MarketingFooter`
(already shared by `/courses`, `/webinars`, `/workshops`), so a visitor can
move between sections instead of landing on a chrome-less island. One new
entry in `src/components/marketing/MarketingNav.tsx`'s link list:

```
{ label: "Mentorship", href: "/mentorship" }
```

This is a structural navigation requirement, not part of the deferred
visual reskin — the page *content* keeps its current look; the site's
outer chrome around it does not duplicate.

## 3. GAS/env conflict

Both apps currently read an env var named `GAS_WEBAPP_URL`, but they point
at two unrelated GAS deployments:

- Platform's `GAS_WEBAPP_URL`: the JSON-body `doPost` dispatcher in
  `gas/sheets-sync/Code.gs` / `gas/payment-screenshots/Code.gs` /
  `gas/LMS.gs` (uploads, trashFile, sheets sync, LMS actions).
- Mentorship's `GAS_WEBAPP_URL`: a completely different, query-param-based
  "Feedback System" GAS project (`?page=api&action=session`), used only by
  `src/lib/gas.ts`'s `getPublicSession`.

Resolution: rename mentorship's copy to `MENTORSHIP_GAS_WEBAPP_URL` in
`src/lib/mentorship/gas.ts` and in `.env.local` / Vercel env config. The
GAS-side script itself does not change — same deployment, same Sheet,
same team workflow, just a differently-named pointer to it from the Next.js
side. `NEXT_PUBLIC_BOOKING_SCRIPT_URL` and `NEXT_PUBLIC_MENTOR_SCRIPT_URL`
carry over unchanged (no name collision with anything in the platform).

## 4. Small merges

- **`src/lib/utils.ts`**: platform's `cn()` helper is already
  byte-equivalent to mentorship's. Mentorship's `WHATSAPP_NUMBER` /
  `WHATSAPP_BASE` / `whatsappLink()` get added into
  `src/lib/mentorship/whatsapp.ts` (kept alongside the other
  mentorship-specific lib code rather than merged into the shared
  `utils.ts`, since they're mentorship-specific, not general-purpose).
- **Fonts**: platform's root layout already loads Montserrat (weights
  700/800/900) and Poppins (400/500/600). Mentorship's components use
  lighter Montserrat weights (400/500/600) and the `Allura` script font —
  both get added to the font loader calls in `src/app/layout.tsx`.
- **`public/` assets**: mentor photos, hero banners, `pz-logo.png`,
  `card-mentorship.png` — copied in verbatim. Verified zero filename
  collisions against the platform's current `public/` (which only has the
  Next.js default `next.svg` / `vercel.svg`).
- **New dependency**: `framer-motion` (mentorship uses it for page
  transitions/animation; not currently a platform dependency).

## Testing

- `tsc --noEmit` and the existing vitest suite stay clean after the move.
- Manual click-through of book → feedback → review against the real GAS
  deployments (same verification approach used for the Drive two-way sync
  work) — none of this is meaningfully mockable, since the point is
  confirming the real external calls still work identically post-port.
- Manual check: `/mentorship` reachable from `MarketingNav` on every
  marketing page, and mentorship pages link back out through the same nav
  (no dead-end chrome).
