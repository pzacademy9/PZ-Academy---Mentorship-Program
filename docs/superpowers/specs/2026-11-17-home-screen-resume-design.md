# Home-screen app opens on the last page (short design)

Date: 2026-11-17. Approved by the owner in chat ("ok").

## Intent and why
The owner saves the site to the phone home screen. Today the icon is only a shortcut to one saved page, so each launch lands on the public page and the owner taps Portal, then navigates back to where they were. They want the icon to open the exact page they last used.

## Goals
- Tapping the icon opens the last portal page the owner was on (path and query).
- Signed out: login shows, then returns to that same page (middleware already sends `returnUrl`).
- No saved page: open `/dashboard`.

## Non-goals / anti-goals
- No database change, no server write per page (Vercel free plan CPU limit).
- Never remember or redirect to anything outside the site (no open redirect).
- No change to hosting, cron, or the public pages.

## Approaches
1. (Picked) Web app manifest with `start_url` `/resume`; a small client tracker saves the current portal path in localStorage; `/resume` reads it and redirects.
2. Save last page in the database. Rejected: a write per page hurts the free plan.
3. Only point the icon at `/dashboard`. Rejected: not the exact page.

## Design
- `src/app/manifest.ts`: name PZ Academy, `display` standalone, `start_url` `/resume`, icons from `pz-logo.png`.
- `src/lib/resume-path.ts`: pure helpers. `isRememberablePath(path)` (must start `/dashboard`, no `//`, no scheme, not `/dashboard/login`-like auth pages) and `pickResumeTarget(saved)` returning the saved path or `/dashboard`.
- `src/components/ResumeTracker.tsx` ("use client"): on pathname/search change, store the path in localStorage (try/catch). Mounted in the dashboard layout.
- `src/app/resume/page.tsx` ("use client"): reads storage, validates with the helper, `router.replace`. Falls back to `/dashboard`. Middleware keeps handling login and role redirects.
- Owner step: delete the old home-screen icon and add it again once.

## Left to the builder
Icon sizing (use existing logo; add apple touch icon metadata), exact file names, test layout.
