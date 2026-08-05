# Mentorship Portal Structural Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the standalone Mentorship Portal app's working pages, components, API routes, and lib code into `pz-academy-platform` as a `/mentorship` section, wired into the platform's shared marketing nav/footer, with zero changes to how mentorship's data is stored (still Google Sheets via GAS).

**Architecture:** This is a structural port, not a rewrite. Every source file is copied byte-for-byte from `PZ-Academy---Mentorship-Program-main` into its platform destination, then patched with the minimal, verified set of changes needed to compile and render inside the platform: import paths that point at relocated lib modules, one renamed env var to resolve a naming collision, `Navbar`/`Footer` swapped for the platform's `MarketingNav`/`MarketingFooter`, and a handful of genuinely-used custom Tailwind tokens + CSS classes merged in without touching anything platform components already depend on.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, framer-motion (new dependency), Google Apps Script (unchanged, three separate existing deployments).

## Global Constraints

- Source repo for every copy in this plan: `D:/Claude Code Workspace/PZ Academy/PZ Academy LMS & Site/PZ-Academy---Mentorship-Program-main` (referred to below as `$SRC`).
- Destination repo: `D:/Claude Code Workspace/PZ Academy/PZ Academy LMS & Site/Recovered Files/pz-academy-platform` (referred to below as `$DEST` — all commands assume cwd is `$DEST` unless stated otherwise).
- Route: mentorship lives at `/mentorship`, matching the path already used in `$SRC`'s own source.
- No visual reskin. Ported pages keep their current look exactly. Only structural changes (nav/footer swap, import paths) are in scope.
- No auth changes. Booking, feedback, review, and mentor-recruitment stay fully public, no login required.
- No changes to `$SRC`'s own repo, its GAS deployments, or its live Vercel deployment. It keeps running exactly as it does today, untouched by this plan.
- No Supabase writes, no Sheets↔Supabase sync, no admin review UI for bookings/mentor applications. That is a separate, later spec — do not add it here.
- `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/not-found.tsx`, `src/components/Navbar.tsx`, `src/components/Footer.tsx`, and `src/HeroSection.tsx` (the unused root-level duplicate — confirmed zero imports reference it) in `$SRC` are **not** ported. They're either superseded by what the platform already has, or (the duplicate) dead code.
- Verification model: this plan introduces no new business logic, and `$SRC` has zero existing test coverage to preserve — so per-task verification is `tsc --noEmit` staying clean (plus the existing `vitest` suite staying green in the final task), not new unit tests. Functional correctness against the live GAS backends is checked by manual click-through in the final task, the same approach used for prior GAS-integration work in this codebase.

---

### Task 1: Dependency, Tailwind tokens, scoped CSS, fonts, and public assets

**Files:**
- Modify: `package.json`
- Modify: `tailwind.config.ts`
- Modify: `src/app/layout.tsx`
- Create: `src/app/mentorship/mentorship.css`
- Create: 12 files under `public/` (copied from `$SRC/public/`)

**Interfaces:**
- Produces: the `.diamond-texture`, `.btn-primary`, `.btn-secondary`, `.btn-nav-cta`, `.btn-whatsapp`, `.section-label`, `.input-underline`, `.container-max`, `.gold-divider`, `.gold-divider-left`, `.text-shimmer-gold`, `.levitate-1/2/3`, `.btn-shimmer-container`, `.btn-shimmer-effect`, `.animate-fade-up-1..5`, `.animate-float` CSS classes (global, available to every route since they're imported from the root layout); the Tailwind utilities `bg-brand-*`, `text-brand-*`, `border-brand-*` (and all other `brand-*` color utilities), `font-allura`, `shadow-gold-sm`, `shadow-gold-md`. All of Task 3/4/5's ported components rely on these existing by the time they're wired in.

- [ ] **Step 1: Add the `framer-motion` dependency**

Every ported component that animates depends on this. Open `package.json` and add it alphabetically (between `clsx` and `html-docx-js`) in `dependencies`:

```json
    "clsx": "^2.1.1",
    "framer-motion": "^11.3.21",
    "html-docx-js": "^0.3.1",
```

Run: `node_modules/.bin/next --version` first to confirm the working tree isn't mid-build (per this repo's rule: never run `next build` while a dev server is live — a plain version check is safe), then install:

```bash
npm install
```

Expected: `package-lock.json` updates, `node_modules/framer-motion` exists.

- [ ] **Step 2: Add the verified-used `brand` colors, `allura` font, and two `gold` shadows to Tailwind config**

These are the only mentorship-specific Tailwind theme additions actually referenced by any file this plan ports (verified by grepping the full ported file set — `card`/`card-hover`/`green`/`nav-scroll` box-shadows, the `whatsapp` color, and the custom `fontSize` scale from `$SRC`'s own tailwind config are all unused by any ported file, so they're deliberately not carried over). `colors.brand` is a new top-level key — it does not collide with the platform's existing `colors.pz` namespace. `boxShadow.gold-sm`/`gold-md` are new keys — the platform's existing bare `boxShadow.gold` key is untouched.

In `tailwind.config.ts`, inside `theme.extend`:

```ts
  		fontFamily: {
  			// Brand fonts (Montserrat + Poppins + Fredoka One)
  			montserrat: ['var(--font-montserrat)', 'sans-serif'],
  			poppins:    ['var(--font-poppins)', 'sans-serif'],
  			fredoka:    ['var(--font-fredoka)', 'sans-serif'],
  			handlee:    ['var(--font-handlee)', 'cursive'],
  			// PharmaZyme Academy semantic aliases (match Stitch export class names 1:1)
  			headline:   ['var(--font-montserrat)', 'sans-serif'],
  			display:    ['var(--font-montserrat)', 'sans-serif'],
  			body:       ['var(--font-fredoka)', 'sans-serif'],
  			label:      ['var(--font-handlee)', 'cursive'],
  			// Mentorship section only
  			allura:     ['var(--font-allura)', 'cursive'],
  		},
  		boxShadow: {
  			card:    '0 4px 24px rgba(25,75,50,.10)',
  			'card-lg': '0 16px 48px rgba(25,75,50,.18)',
  			gold:    '0 4px 20px rgba(201,150,10,.25)',
  			// Mentorship section only
  			'gold-sm': '0 0 12px rgba(201,168,76,0.25)',
  			'gold-md': '0 0 20px 4px rgba(201,168,76,0.35)',
  		},
```

And, still inside `theme.extend`, add a new top-level `colors.brand` key alongside the existing `colors.pz` block (do not modify anything inside `colors.pz`):

```ts
  		colors: {
  			// Mentorship section only — do not use elsewhere, use colors.pz instead
  			brand: {
  				green:       '#1A4D2E',
  				'green-mid': '#2E7D52',
  				gold:        '#C9A84C',
  				'gold-light':'#E8C97A',
  				black:       '#0D0D0D',
  				'near-black':'#0D0D0D',
  				'off-white': '#F8F6F1',
  				'gray-text': '#6B7280',
  				'card-border':'#E5E1D8',
  			},
  			pz: {
```

(i.e. insert the `brand: {...}` block as the first key inside `colors`, immediately before the existing `pz: {` line — everything after stays exactly as it is today.)

- [ ] **Step 3: Run `tsc` to confirm the config edit didn't break anything**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors (this is a config-only change, should be a no-op for type-checking).

- [ ] **Step 4: Create the scoped mentorship CSS file**

This is `$SRC/src/app/globals.css` lines 49–262 only (the `@layer components` block through the animations at the end of the file) — deliberately excluding lines 1–47 (the `@tailwind` directives, already loaded once by the platform's own `globals.css`; the `:root { --dark-green: ... }` custom properties, confirmed unused by every file this plan ports; and the `@layer base` block, which resets `html`/`body`/`*`/`::selection`/`::-webkit-scrollbar` globally and would leak mentorship's visual identity onto every other page on the platform if included — the platform's own `globals.css` already owns those selectors).

Create `src/app/mentorship/mentorship.css`:

```css
/*
 * Mentorship-section-only CSS. Ported from the standalone Mentorship
 * Portal's globals.css (@layer components + animations only — NOT the
 * @tailwind directives, :root vars, or @layer base reset, which are either
 * redundant with or would leak into the rest of the platform's styling).
 * Imported once from the root layout so it also reaches /feedback and
 * /review, which sit outside the /mentorship route segment but still use
 * a few of these classes.
 */

@layer components {

  /* Primary CTA — gold bg, dark green text, glow on hover */
  .btn-primary {
    @apply inline-flex items-center justify-center gap-2 px-8 py-4;
    font-family: var(--font-montserrat), 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: #C9A84C;
    color: #1A4D2E;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    transition: background 0.25s ease, box-shadow 0.3s ease, transform 0.2s ease;
  }
  .btn-primary:hover {
    background: #E8C97A;
    box-shadow: 0 0 20px 4px rgba(201, 168, 76, 0.35);
    transform: translateY(-1px);
  }
  .btn-primary:focus-visible {
    outline: 2px solid #C9A84C;
    outline-offset: 3px;
  }

  /* Secondary CTA — outlined gold */
  .btn-secondary {
    @apply inline-flex items-center justify-center gap-2 px-8 py-4;
    font-family: var(--font-montserrat), 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: transparent;
    color: #C9A84C;
    border: 2px solid #C9A84C;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.25s ease, box-shadow 0.3s ease, transform 0.2s ease;
  }
  .btn-secondary:hover {
    background: rgba(201, 168, 76, 0.1);
    box-shadow: 0 0 20px 4px rgba(201, 168, 76, 0.2);
    transform: translateY(-1px);
  }

  /* Navbar pill CTA */
  .btn-nav-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 10px 24px;
    font-family: var(--font-montserrat), 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: #C9A84C;
    color: #1A4D2E;
    border-radius: 50px;
    border: none;
    cursor: pointer;
    transition: background 0.25s ease, box-shadow 0.3s ease;
    white-space: nowrap;
  }
  .btn-nav-cta:hover {
    background: #E8C97A;
    box-shadow: 0 0 20px 6px rgba(201, 168, 76, 0.4);
  }

  /* WhatsApp button */
  .btn-whatsapp {
    @apply inline-flex items-center justify-center gap-2 px-8 py-4;
    font-family: var(--font-montserrat), 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: #25D366;
    color: #fff;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.25s ease, box-shadow 0.3s ease;
  }
  .btn-whatsapp:hover {
    background: #1fba58;
    box-shadow: 0 0 20px 4px rgba(37, 211, 102, 0.3);
  }

  /* Section label pill */
  .section-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-poppins), 'Poppins', sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #C9A84C;
    border: 1px solid rgba(201, 168, 76, 0.5);
    border-radius: 50px;
    padding: 5px 14px;
    margin-bottom: 16px;
  }

  /* Diamond texture background */
  .diamond-texture {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cpolygon points='30,0 60,30 30,60 0,30' fill='none' stroke='rgba(201,168,76,0.07)' stroke-width='1'/%3E%3C/svg%3E");
    background-size: 60px 60px;
  }

  /* Input underline style */
  .input-underline {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 2px solid #E5E1D8;
    padding: 12px 0;
    font-family: var(--font-poppins), 'Poppins', sans-serif;
    font-size: 16px;
    color: #0D0D0D;
    outline: none;
    transition: border-color 0.2s ease;
  }
  .input-underline::placeholder { color: #9CA3AF; }
  .input-underline:focus { border-bottom-color: #C9A84C; }

  /* Container */
  .container-max { max-width: 1280px; margin-left: auto; margin-right: auto; }

  /* Gold divider line */
  .gold-divider { width: 60px; height: 3px; background: #C9A84C; margin: 12px auto 0; }
  .gold-divider-left { width: 60px; height: 3px; background: #C9A84C; margin-top: 12px; }
}

/* ─── Animations ─────────────────────────────────────────── */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes shimmerGold {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 0   0 rgba(201,168,76,0); }
  50%       { box-shadow: 0 0 20px 8px rgba(201,168,76,0.3); }
}

@keyframes floatY {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-12px); }
}

.animate-fade-up-1 { animation: fadeUp 0.7s ease both; animation-delay: 0.1s; }
.animate-fade-up-2 { animation: fadeUp 0.7s ease both; animation-delay: 0.3s; }
.animate-fade-up-3 { animation: fadeUp 0.7s ease both; animation-delay: 0.5s; }
.animate-fade-up-4 { animation: fadeUp 0.7s ease both; animation-delay: 0.7s; }
.animate-fade-up-5 { animation: fadeUp 0.7s ease both; animation-delay: 0.9s; }
.animate-float     { animation: floatY 4s ease-in-out infinite; }

/* Gold shimmer on text */
@keyframes goldShimmer {
  0%   { background-position: -200% center; }
  100% { background-position:  200% center; }
}
.text-shimmer-gold {
  background: linear-gradient(90deg, #A8892A 0%, #C9A84C 30%, #F5D98E 50%, #C9A84C 70%, #A8892A 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: goldShimmer 4s linear infinite;
  filter: drop-shadow(0 2px 8px rgba(140, 95, 0, 0.18));
}

/* Floating stat card levitate */
@keyframes levitate1 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-10px)} }
@keyframes levitate2 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-8px)}  }
@keyframes levitate3 { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-12px)} }
.levitate-1 { animation: levitate1 3.5s ease-in-out infinite; }
.levitate-2 { animation: levitate2 4.2s ease-in-out infinite 0.8s; }
.levitate-3 { animation: levitate3 3.8s ease-in-out infinite 1.4s; }

/* Button shimmer animation */
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.btn-shimmer-container {
  position: relative;
  overflow: hidden;
}
.btn-shimmer-effect {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.3) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  animation: shimmer 3s infinite;
  animation-delay: 2s; /* Delayed shimmer */
}
```

- [ ] **Step 5: Add the missing Montserrat weights, the Allura font, and import the scoped CSS in the root layout**

The platform's Montserrat currently only loads weights 700/800/900; the ported mentorship components use 400/500/600 too. `Allura` isn't loaded at all yet.

In `src/app/layout.tsx`, replace:

```tsx
import type { Metadata } from "next";
import { Montserrat, Poppins, Fredoka, Handlee } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-montserrat",
});
```

with:

```tsx
import type { Metadata } from "next";
import { Montserrat, Poppins, Fredoka, Handlee, Allura } from "next/font/google";
import "./globals.css";
import "./mentorship/mentorship.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
});

const allura = Allura({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-allura",
  display: "swap",
});
```

Then, further down in the same file, add `allura.variable` to the `cn(...)` call inside `<body>`:

```tsx
        className={cn(
          montserrat.variable,
          poppins.variable,
          fredoka.variable,
          handlee.variable,
          allura.variable,
          "font-fredoka bg-white text-pz-ink dark:bg-[#101412] dark:text-[#e0e3df] antialiased",
        )}
```

- [ ] **Step 6: Copy the public assets**

Run from `$DEST`:

```bash
cp "$SRC/public/mentor-aftab-alam.jpeg" "public/mentor-aftab-alam.jpeg"
cp "$SRC/public/mentor-dr-maheen-waseem.jpeg" "public/mentor-dr-maheen-waseem.jpeg"
cp "$SRC/public/mentor-dr-roha.png" "public/mentor-dr-roha.png"
cp "$SRC/public/mentor-ghazal-naqvi.jpeg" "public/mentor-ghazal-naqvi.jpeg"
cp "$SRC/public/mentor-hamza-ansari.jpeg" "public/mentor-hamza-ansari.jpeg"
cp "$SRC/public/mentor-imad-khan.png" "public/mentor-imad-khan.png"
cp "$SRC/public/mentor-laiq-ur-rehman.jpeg" "public/mentor-laiq-ur-rehman.jpeg"
cp "$SRC/public/mentor-mehwish-kanwal.jpeg" "public/mentor-mehwish-kanwal.jpeg"
cp "$SRC/public/card-mentorship.png" "public/card-mentorship.png"
cp "$SRC/public/hero-banner-mobile.png" "public/hero-banner-mobile.png"
cp "$SRC/public/hero-banner-pc.jpeg" "public/hero-banner-pc.jpeg"
cp "$SRC/public/pz-logo.png" "public/pz-logo.png"
```

Where `$SRC` = `D:/Claude Code Workspace/PZ Academy/PZ Academy LMS & Site/PZ-Academy---Mentorship-Program-main` (set it as a shell variable first: `SRC="D:/Claude Code Workspace/PZ Academy/PZ Academy LMS & Site/PZ-Academy---Mentorship-Program-main"`).

Expected: `ls public/` shows all 12 new files alongside the existing `next.svg`/`vercel.svg`.

- [ ] **Step 7: Verify and commit**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean (no errors).

```bash
git add package.json package-lock.json tailwind.config.ts src/app/layout.tsx src/app/mentorship/mentorship.css public/mentor-*.jpeg public/mentor-*.png public/card-mentorship.png public/hero-banner-mobile.png public/hero-banner-pc.jpeg public/pz-logo.png
git commit -m "$(cat <<'EOF'
chore: add mentorship section deps, Tailwind tokens, scoped CSS, assets

Foundation for the mentorship portal port: framer-motion dependency,
the brand/allura/gold-sm/gold-md Tailwind tokens actually used by the
ported components (verified against the full source file set — nothing
unused carried over), a scoped mentorship.css (components + animations
only, not the base-layer reset, so it can't leak into the rest of the
site), and the mentor photo / hero banner / logo public assets.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Port the lib layer

**Files:**
- Create: `src/lib/mentorship/mentors.ts`
- Create: `src/lib/mentorship/gas.ts`
- Create: `src/lib/mentorship/share-card-data.ts`
- Create: `src/lib/mentorship/whatsapp.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `mentors: Mentor[]`, `getMentorBySlug(slug): Mentor | undefined`, `formatPrice(price): string` from `mentors.ts`; `getPublicSession`, `PublicSession`, `getShareView`, `ShareView`, `ShareSession`, `SharePerQuestion`, `ShareResponse` from `gas.ts`; `fetchShareCardData` from `share-card-data.ts`; `whatsappLink(message): string` from `whatsapp.ts`. Tasks 3, 4, and 5 import all of these by their new `@/lib/mentorship/*` paths.

- [ ] **Step 1: Copy `mentors.ts` verbatim (no changes needed)**

```bash
SRC="D:/Claude Code Workspace/PZ Academy/PZ Academy LMS & Site/PZ-Academy---Mentorship-Program-main"
cp "$SRC/src/lib/mentors.ts" "src/lib/mentorship/mentors.ts"
```

- [ ] **Step 2: Copy `gas.ts` and rename its env var**

```bash
cp "$SRC/src/lib/gas.ts" "src/lib/mentorship/gas.ts"
```

Then in `src/lib/mentorship/gas.ts`, replace:

```ts
const GAS_URL = process.env.GAS_WEBAPP_URL ?? '';
```

with:

```ts
const GAS_URL = process.env.MENTORSHIP_GAS_WEBAPP_URL ?? '';
```

(This resolves the collision with the platform's own `GAS_WEBAPP_URL`, which points at a completely different GAS deployment. The GAS-side script and Sheet are unchanged — only this Next.js-side pointer is renamed.)

- [ ] **Step 3: Copy `share-card-data.ts` and rename its env var**

```bash
cp "$SRC/src/lib/share-card-data.ts" "src/lib/mentorship/share-card-data.ts"
```

Then in `src/lib/mentorship/share-card-data.ts`, replace:

```ts
  const GAS_URL = process.env.GAS_WEBAPP_URL ?? '';
```

with:

```ts
  const GAS_URL = process.env.MENTORSHIP_GAS_WEBAPP_URL ?? '';
```

- [ ] **Step 4: Create `whatsapp.ts`**

Create `src/lib/mentorship/whatsapp.ts`:

```ts
const WHATSAPP_NUMBER = "923700199429";
const WHATSAPP_BASE = `https://wa.me/${WHATSAPP_NUMBER}`;

export function whatsappLink(message: string): string {
  return `${WHATSAPP_BASE}?text=${encodeURIComponent(message)}`;
}
```

(The platform's own `src/lib/utils.ts` already has a byte-equivalent `cn()` — that one is untouched and still used directly by ported components for `cn`. Only the WhatsApp helpers, which are mentorship-specific, get their own file here.)

- [ ] **Step 5: Verify and commit**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean.

```bash
git add src/lib/mentorship
git commit -m "$(cat <<'EOF'
feat: port mentorship lib layer (mentors, feedback GAS client, whatsapp)

Ported verbatim from the standalone Mentorship Portal, except gas.ts and
share-card-data.ts now read MENTORSHIP_GAS_WEBAPP_URL instead of
GAS_WEBAPP_URL, which the platform already uses for a different GAS
deployment.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Port the components

**Files:**
- Create: `src/components/mentorship/HeroSection.tsx`
- Create: `src/components/mentorship/MentorCard.tsx`
- Create: `src/components/mentorship/MentorProfileClient.tsx`
- Create: `src/components/mentorship/MentorsSectionWrapper.tsx`
- Create: `src/components/mentorship/BookingClient.tsx`
- Create: `src/components/mentorship/RecruitmentForm.tsx`
- Create: `src/components/mentorship/TrustBar.tsx`

**Interfaces:**
- Consumes: `Mentor`, `formatPrice`, `mentors`, `getMentorBySlug` from `@/lib/mentorship/mentors` (Task 2); `whatsappLink` from `@/lib/mentorship/whatsapp` (Task 2); `cn` from `@/lib/utils` (already exists in the platform, untouched).
- Produces: default-exported React components `HeroSection`, `MentorCard` (+ named `ComingSoonCard`), `MentorProfileClient`, `MentorsSectionWrapper`, `BookingClient`, `RecruitmentForm`, `TrustBar`. Task 5's pages import these from `@/components/mentorship/*`.

- [ ] **Step 1: Copy the three components with zero internal imports to fix**

`RecruitmentForm.tsx`, `MentorsSectionWrapper.tsx`, and `TrustBar.tsx` only import `react`, `framer-motion`, and `lucide-react` — no `@/` imports at all, so these are a straight copy with no edits:

```bash
SRC="D:/Claude Code Workspace/PZ Academy/PZ Academy LMS & Site/PZ-Academy---Mentorship-Program-main"
cp "$SRC/src/components/RecruitmentForm.tsx" "src/components/mentorship/RecruitmentForm.tsx"
cp "$SRC/src/components/MentorsSectionWrapper.tsx" "src/components/mentorship/MentorsSectionWrapper.tsx"
cp "$SRC/src/components/TrustBar.tsx" "src/components/mentorship/TrustBar.tsx"
cp "$SRC/src/components/HeroSection.tsx" "src/components/mentorship/HeroSection.tsx"
```

(`HeroSection.tsx` also has zero `@/` imports — confirmed by the same import audit — so it's included here too.)

- [ ] **Step 2: Copy `MentorCard.tsx` and fix its import**

```bash
cp "$SRC/src/components/MentorCard.tsx" "src/components/mentorship/MentorCard.tsx"
```

In `src/components/mentorship/MentorCard.tsx`, replace:

```ts
import { type Mentor, formatPrice } from "@/lib/mentors";
```

with:

```ts
import { type Mentor, formatPrice } from "@/lib/mentorship/mentors";
```

- [ ] **Step 3: Copy `MentorProfileClient.tsx` and fix its imports**

```bash
cp "$SRC/src/components/MentorProfileClient.tsx" "src/components/mentorship/MentorProfileClient.tsx"
```

In `src/components/mentorship/MentorProfileClient.tsx`, replace:

```ts
import { type Mentor, formatPrice } from "@/lib/mentors";
import { whatsappLink } from "@/lib/utils";
```

with:

```ts
import { type Mentor, formatPrice } from "@/lib/mentorship/mentors";
import { whatsappLink } from "@/lib/mentorship/whatsapp";
```

- [ ] **Step 4: Copy `BookingClient.tsx` and fix its imports**

```bash
cp "$SRC/src/components/BookingClient.tsx" "src/components/mentorship/BookingClient.tsx"
```

In `src/components/mentorship/BookingClient.tsx`, replace:

```ts
import { type Mentor, formatPrice } from "@/lib/mentors";
import { whatsappLink } from "@/lib/utils";
import { cn } from "@/lib/utils";
```

with:

```ts
import { type Mentor, formatPrice } from "@/lib/mentorship/mentors";
import { whatsappLink } from "@/lib/mentorship/whatsapp";
import { cn } from "@/lib/utils";
```

(`cn` stays pointed at the platform's own `@/lib/utils` — no change to that line.)

- [ ] **Step 5: Verify and commit**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean. (If `BOOKING_SCRIPT_URL`/`MENTOR_SCRIPT_URL` show as unused-env-var lint warnings, that's expected — `RecruitmentForm.tsx`/`BookingClient.tsx` reference `process.env.NEXT_PUBLIC_BOOKING_SCRIPT_URL`/`NEXT_PUBLIC_MENTOR_SCRIPT_URL` directly, unchanged from `$SRC`, and those aren't set yet — that's a `.env.local` step in Task 6, not a code problem.)

```bash
git add src/components/mentorship
git commit -m "$(cat <<'EOF'
feat: port mentorship UI components

HeroSection, MentorCard, MentorProfileClient, MentorsSectionWrapper,
BookingClient, RecruitmentForm, TrustBar — ported verbatim from the
standalone Mentorship Portal with import paths repointed at the
relocated lib modules from the previous task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Port the API routes

**Files:**
- Create: `src/app/api/feedback/route.ts`
- Create: `src/app/api/cover/[fileId]/route.ts`
- Create: `src/app/api/upload-video/route.ts`
- Create: `src/app/api/share-card/[token]/route.tsx`

**Interfaces:**
- Consumes: `fetchShareCardData` from `@/lib/mentorship/share-card-data` (Task 2), used by `share-card/[token]/route.tsx`.
- Produces: `GET`/`POST` handlers at each of these four routes, used by the pages in Task 5 (client-side fetches to `/api/feedback`, `/api/upload-video`) and by external consumers (`/api/cover/[fileId]` proxies a Drive-hosted video cover image; `/api/share-card/[token]` generates an OG image).

- [ ] **Step 1: Copy `cover/[fileId]/route.ts` verbatim**

No `@/` imports in this file (confirmed) — straight copy:

```bash
SRC="D:/Claude Code Workspace/PZ Academy/PZ Academy LMS & Site/PZ-Academy---Mentorship-Program-main"
mkdir -p "src/app/api/cover/[fileId]"
cp "$SRC/src/app/api/cover/[fileId]/route.ts" "src/app/api/cover/[fileId]/route.ts"
```

- [ ] **Step 2: Copy `feedback/route.ts` and rename its env var (including the error message)**

```bash
cp "$SRC/src/app/api/feedback/route.ts" "src/app/api/feedback/route.ts"
```

In `src/app/api/feedback/route.ts`, replace:

```ts
const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
```

with:

```ts
const GAS_URL = process.env.MENTORSHIP_GAS_WEBAPP_URL ?? "";
```

and replace:

```ts
    return NextResponse.json({ ok: false, error: "GAS_WEBAPP_URL not configured." }, { status: 500 });
```

with:

```ts
    return NextResponse.json({ ok: false, error: "MENTORSHIP_GAS_WEBAPP_URL not configured." }, { status: 500 });
```

- [ ] **Step 3: Copy `upload-video/route.ts` and rename its env var (including the error message)**

```bash
cp "$SRC/src/app/api/upload-video/route.ts" "src/app/api/upload-video/route.ts"
```

In `src/app/api/upload-video/route.ts`, replace:

```ts
const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
```

with:

```ts
const GAS_URL = process.env.MENTORSHIP_GAS_WEBAPP_URL ?? "";
```

and replace:

```ts
      { ok: false, error: "GAS_WEBAPP_URL not configured." },
```

with:

```ts
      { ok: false, error: "MENTORSHIP_GAS_WEBAPP_URL not configured." },
```

- [ ] **Step 4: Copy `share-card/[token]/route.tsx` and fix its import**

```bash
mkdir -p "src/app/api/share-card/[token]"
cp "$SRC/src/app/api/share-card/[token]/route.tsx" "src/app/api/share-card/[token]/route.tsx"
```

In `src/app/api/share-card/[token]/route.tsx`, replace:

```ts
import { fetchShareCardData } from '@/lib/share-card-data';
```

with:

```ts
import { fetchShareCardData } from '@/lib/mentorship/share-card-data';
```

- [ ] **Step 5: Verify and commit**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean.

```bash
git add src/app/api/feedback src/app/api/cover src/app/api/upload-video src/app/api/share-card
git commit -m "$(cat <<'EOF'
feat: port mentorship feedback/video/share-card API routes

feedback, cover/[fileId], upload-video, share-card/[token] — ported
verbatim, GAS_WEBAPP_URL references renamed to MENTORSHIP_GAS_WEBAPP_URL
to resolve the collision with the platform's own unrelated GAS
deployment.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Port the pages

**Files:**
- Create: `src/app/mentorship/page.tsx`
- Create: `src/app/mentorship/book/[slug]/page.tsx`
- Create: `src/app/mentorship/mentors/[slug]/page.tsx`
- Create: `src/app/mentorship/thank-you/page.tsx`
- Create: `src/app/feedback/[id]/page.tsx`
- Create: `src/app/feedback/[id]/FeedbackClient.tsx`
- Create: `src/app/review/[token]/page.tsx`
- Create: `src/app/review/[token]/ReviewClient.tsx`
- Create: `src/app/review/[token]/opengraph-image.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 2, 3, and 4, plus the platform's existing `MarketingNav`/`MarketingFooter` (`@/components/marketing/MarketingNav`, `@/components/marketing/MarketingFooter`, both no-prop named exports).
- Produces: the live routes `/mentorship`, `/mentorship/book/[slug]`, `/mentorship/mentors/[slug]`, `/mentorship/thank-you`, `/feedback/[id]`, `/review/[token]`.

- [ ] **Step 1: Copy the four `/feedback` and `/review` files with no `Navbar`/`Footer` to swap**

None of these five import `Navbar`/`Footer` (confirmed — feedback and review are standalone pages without the site chrome). `FeedbackClient.tsx` and `ReviewClient.tsx`/`page.tsx` (review) need their `@/lib/gas` import repointed; `opengraph-image.tsx` needs its `@/lib/share-card-data` import repointed.

```bash
SRC="D:/Claude Code Workspace/PZ Academy/PZ Academy LMS & Site/PZ-Academy---Mentorship-Program-main"
mkdir -p "src/app/feedback/[id]" "src/app/review/[token]"
cp "$SRC/src/app/feedback/[id]/page.tsx" "src/app/feedback/[id]/page.tsx"
cp "$SRC/src/app/feedback/[id]/FeedbackClient.tsx" "src/app/feedback/[id]/FeedbackClient.tsx"
cp "$SRC/src/app/review/[token]/page.tsx" "src/app/review/[token]/page.tsx"
cp "$SRC/src/app/review/[token]/ReviewClient.tsx" "src/app/review/[token]/ReviewClient.tsx"
cp "$SRC/src/app/review/[token]/opengraph-image.tsx" "src/app/review/[token]/opengraph-image.tsx"
```

In `src/app/feedback/[id]/page.tsx`, replace:
```ts
import { getPublicSession } from "@/lib/gas";
```
with:
```ts
import { getPublicSession } from "@/lib/mentorship/gas";
```

In `src/app/feedback/[id]/FeedbackClient.tsx`, replace:
```ts
import type { PublicSession } from "@/lib/gas";
```
with:
```ts
import type { PublicSession } from "@/lib/mentorship/gas";
```

In `src/app/review/[token]/page.tsx`, replace:
```ts
import { getShareView } from '@/lib/gas';
import type { ShareView } from '@/lib/gas';
```
with:
```ts
import { getShareView } from '@/lib/mentorship/gas';
import type { ShareView } from '@/lib/mentorship/gas';
```

In `src/app/review/[token]/ReviewClient.tsx`, replace:
```ts
import type { ShareView, ShareSession, SharePerQuestion, ShareResponse } from '@/lib/gas';
```
with:
```ts
import type { ShareView, ShareSession, SharePerQuestion, ShareResponse } from '@/lib/mentorship/gas';
```

In `src/app/review/[token]/opengraph-image.tsx`, replace:
```ts
import { fetchShareCardData } from '@/lib/share-card-data';
```
with:
```ts
import { fetchShareCardData } from '@/lib/mentorship/share-card-data';
```

- [ ] **Step 2: Copy `mentorship/page.tsx` and swap its imports**

```bash
mkdir -p "src/app/mentorship/book/[slug]" "src/app/mentorship/mentors/[slug]" "src/app/mentorship/thank-you"
cp "$SRC/src/app/mentorship/page.tsx" "src/app/mentorship/page.tsx"
```

In `src/app/mentorship/page.tsx`, replace:

```tsx
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HeroSection from "@/components/HeroSection";
import TrustBar from "@/components/TrustBar";
import MentorCard, { ComingSoonCard } from "@/components/MentorCard";
import RecruitmentForm from "@/components/RecruitmentForm";
import { mentors } from "@/lib/mentors";
```

with:

```tsx
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import HeroSection from "@/components/mentorship/HeroSection";
import TrustBar from "@/components/mentorship/TrustBar";
import MentorCard, { ComingSoonCard } from "@/components/mentorship/MentorCard";
import RecruitmentForm from "@/components/mentorship/RecruitmentForm";
import { mentors } from "@/lib/mentorship/mentors";
```

Then find every `<Navbar />` in the file and replace with `<MarketingNav />`, and every `<Footer />` with `<MarketingFooter />` (each appears exactly once in this file — one opening `<>`-wrapped page body with the nav at the top and footer at the bottom, matching the pattern already used in `src/app/courses/page.tsx`).

- [ ] **Step 3: Copy `mentorship/book/[slug]/page.tsx` and swap its imports**

```bash
cp "$SRC/src/app/mentorship/book/[slug]/page.tsx" "src/app/mentorship/book/[slug]/page.tsx"
```

Replace:

```tsx
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookingClient from "@/components/BookingClient";
import { getMentorBySlug, mentors } from "@/lib/mentors";
```

with:

```tsx
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import BookingClient from "@/components/mentorship/BookingClient";
import { getMentorBySlug, mentors } from "@/lib/mentorship/mentors";
```

Then replace `<Navbar />` with `<MarketingNav />` and `<Footer />` with `<MarketingFooter />` (one of each in this file).

- [ ] **Step 4: Copy `mentorship/mentors/[slug]/page.tsx` and swap its imports**

```bash
cp "$SRC/src/app/mentorship/mentors/[slug]/page.tsx" "src/app/mentorship/mentors/[slug]/page.tsx"
```

Replace:

```tsx
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MentorProfileClient from "@/components/MentorProfileClient";
import { getMentorBySlug, mentors } from "@/lib/mentors";
```

with:

```tsx
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import MentorProfileClient from "@/components/mentorship/MentorProfileClient";
import { getMentorBySlug, mentors } from "@/lib/mentorship/mentors";
```

Then replace `<Navbar />` with `<MarketingNav />` and `<Footer />` with `<MarketingFooter />` (one of each in this file).

- [ ] **Step 5: Copy `mentorship/thank-you/page.tsx` and swap its imports**

```bash
cp "$SRC/src/app/mentorship/thank-you/page.tsx" "src/app/mentorship/thank-you/page.tsx"
```

Replace:

```tsx
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { whatsappLink } from "@/lib/utils";
```

with:

```tsx
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { whatsappLink } from "@/lib/mentorship/whatsapp";
```

Then replace `<Navbar />` with `<MarketingNav />` and `<Footer />` with `<MarketingFooter />` (one of each in this file).

- [ ] **Step 6: Verify**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/mentorship src/app/feedback src/app/review
git commit -m "$(cat <<'EOF'
feat: port mentorship, feedback, and review pages

Ported verbatim from the standalone Mentorship Portal. /mentorship's
four pages swap their own Navbar/Footer for the platform's shared
MarketingNav/MarketingFooter so visitors can navigate to the rest of
the site; /feedback and /review had no site chrome to swap. All five
files' lib imports repointed at the relocated @/lib/mentorship/* modules.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire up navigation, environment variables, and final verification

**Files:**
- Modify: `src/components/marketing/MarketingNav.tsx`
- Modify: `.env.local` (not committed — gitignored)

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a reachable `/mentorship` link in the site's global nav; a fully functional mentorship section.

- [ ] **Step 1: Add the Mentorship nav link**

In `src/components/marketing/MarketingNav.tsx`, replace:

```tsx
const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Courses", href: "/courses" },
  { label: "Webinars", href: "/webinars" },
  { label: "Workshops", href: "/workshops" },
];
```

with:

```tsx
const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Courses", href: "/courses" },
  { label: "Webinars", href: "/webinars" },
  { label: "Workshops", href: "/workshops" },
  { label: "Mentorship", href: "/mentorship" },
];
```

- [ ] **Step 2: Add the three mentorship env vars — manual, human step**

This step cannot be automated — the real values are secrets that only exist in wherever the standalone Mentorship Portal's environment was configured (its Vercel project → Settings → Environment Variables is the authoritative source if they aren't saved anywhere else locally).

Add three keys to `$DEST/.env.local` (this file is gitignored — never commit it):

```
MENTORSHIP_GAS_WEBAPP_URL=<the value $SRC's Vercel project has saved as GAS_WEBAPP_URL>
NEXT_PUBLIC_BOOKING_SCRIPT_URL=<the value $SRC's Vercel project has saved as NEXT_PUBLIC_BOOKING_SCRIPT_URL>
NEXT_PUBLIC_MENTOR_SCRIPT_URL=<the value $SRC's Vercel project has saved as NEXT_PUBLIC_MENTOR_SCRIPT_URL>
```

Do not proceed to Step 3 until this is done — the manual smoke test below needs real values to hit the real GAS backends.

- [ ] **Step 3: Restart the dev server and run full verification**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean.

Run: `node_modules/.bin/vitest run`
Expected: same pass count as before this plan started — this plan adds no new tests (nothing new to unit-test in a structural port), so the existing suite should be untouched and green.

Restart the dev server (kill any existing one first, then `node_modules/.bin/next dev`), then manually check, in a browser:

1. `/courses`, `/webinars`, or `/workshops` — confirm the nav bar now shows a "Mentorship" link, and it goes to `/mentorship`.
2. `/mentorship` — confirm the hero section, mentor cards, and trust bar render with the mentorship-specific styling (gold/green brand colors, shimmer/levitate animations visible) — this is the real signal that the scoped CSS and Tailwind tokens from Task 1 are actually wired up, not just present in source.
3. From `/mentorship`, click through to a mentor's profile (`/mentorship/mentors/[slug]`) and confirm it renders.
4. From a mentor profile, click through to the booking flow (`/mentorship/book/[slug]`), fill the form, and submit — confirm it succeeds (this hits the real `NEXT_PUBLIC_BOOKING_SCRIPT_URL` GAS endpoint) and lands on `/mentorship/thank-you`.
5. Submit the mentor-recruitment form on `/mentorship` (this hits the real `NEXT_PUBLIC_MENTOR_SCRIPT_URL` GAS endpoint) — confirm it succeeds.
6. Check the real Google Sheets behind both scripts to confirm the two new test submissions actually landed there — this is the only way to confirm `MENTORSHIP_GAS_WEBAPP_URL`/the booking/mentor script URLs are correctly wired, since a client-side fetch failure to a misconfigured URL can silently no-op depending on how each form handles errors.
7. Visit `/feedback/[id]` and `/review/[token]` for a real session ID/token from the Feedback System sheet, if one exists — confirm they render (these two routes have no site nav, so there's nothing to click through to reach them; they need to be visited directly).

If any of these fail, stop and diagnose — do not proceed to commit with a broken flow.

- [ ] **Step 4: Commit**

```bash
git add src/components/marketing/MarketingNav.tsx
git commit -m "$(cat <<'EOF'
feat: add Mentorship link to the marketing nav

Completes the mentorship portal port — /mentorship is now reachable
from every marketing page's nav bar, alongside Courses/Webinars/Workshops.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
