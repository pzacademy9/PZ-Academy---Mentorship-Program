# Home-screen resume + promo polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The home-screen icon opens the last portal page the owner used, and the small promo-page leftovers are fixed.

**Architecture:** A Next `manifest.ts` sets `start_url` to `/resume`. A client tracker in the dashboard layout saves the current portal path to localStorage; `/resume` validates it and redirects. Promo fixes are small edits to existing files. No migration, no server write per page.

**Tech Stack:** Next.js 14.2.5 App Router, React, vitest, Supabase (read paths only), jsPDF (untouched).

**Spec:** `docs/superpowers/specs/2026-11-17-home-screen-resume-design.md`

## Global Constraints

- No database change, no migration, no new cron, no hosting change (Vercel free plan CPU limit).
- Only paths starting `/dashboard` are ever saved or redirected to; never a full URL, `//`, backslash, or other origin.
- Owner-facing copy: calm, no exclamation marks, no sales words.
- Preserve CRLF line endings in existing files. Never edit `src/lib/supabase/database.types.ts`. No `eslint-disable` for `@typescript-eslint`.
- Colours: no new colour classes beyond tokens already used in the file being edited.
- Shared constants must not live in "use client" files that a server page imports.
- Run tools directly (npm/npx are broken by `&` in the path): `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`.
- Write the test first; menu/dialog changes must keep Escape closing and focus returning.
- Stage files by path only. Leave untracked `docs/lead-capture-go-live-guide.md` and the two 2026-11-02 plan files alone. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Work on a new branch `home-screen-resume` made from `origin/main` (c85d55d3). Do not push.

## Review Focus

- A saved path that is hostile (`//evil.com`, `https://x`, `/\evil`, `javascript:`) must never be followed: `/resume` goes to `/dashboard`.
- localStorage unavailable or throwing (private window): tracker and `/resume` must not crash; `/resume` falls back to `/dashboard`.
- Saved path with a query string and hash is restored exactly (query kept).
- Signed out when tapping the icon: lands on login with `returnUrl`, not an error. Note: middleware only passes the path, so confirm `returnUrl` is honoured after login for a path with a query; if it drops the query, say so in the report (do not widen scope).
- Pages like `/dashboard/login`-style auth or error pages are never saved (a stale error page must not become the start page).

---

### Task 1: Promo fixes in the data and quote layers

**Files:**
- Modify: `src/app/api/landing/[slug]/quote/route.ts`
- Modify: `src/lib/landing/registration/promo-resolve.ts` (export the owner-live test)
- Modify: `src/lib/data/landing-promo-codes.ts` (`deletePromoCode`)
- Test: `tests/landing-promo-delete.test.ts`, plus the existing test that covers the quote route (find with `grep -l "quote" tests/*promo*`; if none covers the over-max answer, add `tests/landing-quote-over-max.test.ts`)

**Interfaces:**
- Produces: `export function isLiveOwnerCode(p: PromoCode): boolean` in `promo-resolve.ts` (move of the existing private const, same behaviour).

- [ ] **Step 1: Write failing tests.** (a) Quote route: a typed percent over the limit answers `{ quote, promo: { ok: false, reason: "over_max" } }` and the JSON has no `max` key anywhere. (b) `deletePromoCode`: an owner code whose `ownerAgentId` and `ownerAffiliateId` are both null (owner deleted) is deleted when it has no registrations; an owner code with a live owner still returns `{ ok: false, reason: "owner-code" }`; a code with a registration still returns `used`.
- [ ] **Step 2: Run the tests; both must fail.**
- [ ] **Step 3: Implement.** Quote route: drop `max: resolved.overMax` from the response. Check the widget that reads the quote (grep `over_max` and `promo.max` under `src/components`) and make sure nothing reads `max`. Export `isLiveOwnerCode` from `promo-resolve.ts`; in `deletePromoCode` replace `code.isOwnerCode` with `isLiveOwnerCode(code)`.
- [ ] **Step 4: Run both test files plus `tests/landing-promo-resolve.test.ts` and `tests/landing-promo-suffix.test.ts`; all pass. Run tsc (0 errors).**
- [ ] **Step 5: Commit** `fix: promo quote hides limit number, delete works when owner was removed`.

### Task 2: Promo page UI leftovers

**Files:**
- Modify: `src/components/admin/landing/promo/PromoDownloads.tsx`
- Modify: `src/components/admin/landing/promo/PromoCodesManager.tsx` (toolbar row, around line 193)
- Test: `tests/landing-promo-downloads.test.tsx`, `tests/landing-promo-admin.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write failing tests.** (a) After choosing "Share in a group" or "For me" in the dialog, focus ends on the "Download PDF" button once the job finishes (the button is disabled while the file is made, so the current focus call is lost): assert `document.activeElement` is the button after the job settles, for both choices. (b) With no used codes, the toolbar row renders no empty `<p>`. (c) The menu content gets 16px collision padding from the screen edge: assert the prop/attribute the component passes (`collisionPadding={16}`) via the rendered content's props or a source-level check in the existing style of that test file.
- [ ] **Step 2: Run them; expect FAIL.**
- [ ] **Step 3: Implement.** Focus: after the job's `finally`, call `opener.current?.focus()` when the dialog opener is the menu button (do not rely on `onCloseAutoFocus` while the button is disabled); keep Escape and focus return for the dialog and menu working. Toolbar: render the help `<p>` only when its text is non-empty. Menu: add `collisionPadding={16}` to `DropdownMenuContent`.
- [ ] **Step 4: Run the two test files and `tests/landing-promo-owner-admin.test.tsx`; eslint on the two components; tsc.**
- [ ] **Step 5: Commit** `fix: promo page focus, empty toolbar line, phone menu edge`.

### Task 3: Resume path helpers

**Files:**
- Create: `src/lib/resume-path.ts`
- Test: `tests/resume-path.test.ts`

**Interfaces:**
- Produces: `export const RESUME_KEY = "pz:last-portal-path"`, `export const RESUME_HOME = "/dashboard"`, `export function isRememberablePath(path: string): boolean`, `export function pickResumeTarget(saved: string | null | undefined): string`.

- [ ] **Step 1: Write failing tests** with these cases. Rememberable: `/dashboard`, `/dashboard/admin/landing-promo-codes`, `/dashboard/courses?x=1#top`. Not rememberable: `""`, `/`, `/login`, `/dashboard/../login`? (reject any `..` segment), `//evil.com`, `/dashboard//evil.com`? (reject `//` anywhere), `https://x/dashboard`, `/\\evil`, `javascript:alert(1)`, `/dashboard\\x`, `/dashboards`, a path longer than 500 chars, a path containing a control character. `pickResumeTarget(null)` and `(undefined)` and `("")` return `/dashboard`; a good saved path returns itself; a hostile one returns `/dashboard`.
- [ ] **Step 2: Run; expect FAIL (module missing).**
- [ ] **Step 3: Implement** both functions: a path is rememberable only if it equals `/dashboard` or starts with `/dashboard/` or `/dashboard?`, is at most 500 chars, and has no `//`, `\`, `..`, or control characters.
- [ ] **Step 4: Run test; PASS. tsc and eslint on the files.**
- [ ] **Step 5: Commit** `feat: resume path helpers`.

### Task 4: Manifest, tracker and /resume page

**Files:**
- Create: `src/app/manifest.ts`
- Create: `src/components/ResumeTracker.tsx` ("use client")
- Create: `src/app/resume/page.tsx` ("use client")
- Modify: `src/app/dashboard/layout.tsx` (mount `<ResumeTracker />` once, inside the returned tree)
- Modify: `src/app/layout.tsx` (add `appleWebApp: { capable: true, title: "PZ Academy", statusBarStyle: "default" }` and an apple touch icon pointing at `/pz-logo.png` to `metadata`)
- Test: `tests/resume-tracker.test.tsx`, `tests/resume-page.test.tsx`, `tests/manifest.test.ts`

**Interfaces:**
- Consumes: `RESUME_KEY`, `RESUME_HOME`, `isRememberablePath`, `pickResumeTarget` from `@/lib/resume-path`.
- Produces: `default function manifest(): MetadataRoute.Manifest` with `name: "PZ Academy"`, `short_name: "PZ Academy"`, `start_url: "/resume"`, `scope: "/"`, `display: "standalone"`, `background_color` and `theme_color` equal to the existing brand/background values found in `globals.css` (use hex), and `icons` built from `/pz-logo.png` with its real pixel size (read the file to get it; if smaller than 192px, report this and still ship the manifest).

- [ ] **Step 1: Write failing tests.** Manifest: `start_url` is `/resume`, `display` is `standalone`, at least one icon. Tracker: with `usePathname`/`useSearchParams` mocked to `/dashboard/courses` and `a=1`, it stores `/dashboard/courses?a=1` under `RESUME_KEY`; a non-rememberable path stores nothing; a `localStorage.setItem` that throws does not throw out of the component. Page: with stored `/dashboard/courses?a=1` it calls `router.replace` with exactly that; with a hostile stored value, with nothing stored, and with `localStorage.getItem` throwing, it calls `router.replace("/dashboard")`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.** Tracker renders `null`; effect on pathname and search params; wrap storage in try/catch; wrap `useSearchParams` consumer in `<Suspense>` inside the layout mount if the build requires it. `/resume` page: in an effect read storage in try/catch, `router.replace(pickResumeTarget(saved))`; render a calm one-line "Opening your portal…" and a plain link to `/dashboard` as a fallback. Middleware already sends signed-out users to login with `returnUrl`; make no middleware change. Add `export const metadata = { title: "Opening — PZ Academy" }` only if the page is a server wrapper around a client component (a "use client" page cannot export metadata).
- [ ] **Step 4: Run the three test files, `tests/client-boundary-values.test.ts`, tsc (0 errors), eslint on all touched files. Then run `node node_modules/next/dist/bin/next build` once (only if no dev server is running; check first) and confirm `/resume` and `/manifest.webmanifest` build.**
- [ ] **Step 5: Commit** `feat: home-screen icon opens the last portal page`.

---

## Owner steps (after merge, not code)
1. On the phone, delete the old home-screen icon.
2. Open the site in the browser, sign in once, open any portal page, and add to home screen again.
3. Open a deep page, close the app, tap the icon: it should open on that page. If login shows, sign in once; it should return to the same page.
