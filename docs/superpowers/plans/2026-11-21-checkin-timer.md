# Check-in timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live, good looking countdown on the public check-in page that opens, closes and enables the button by itself.

**Architecture:** Pure helpers in `rules.ts` compute countdown state and text. A small client panel ticks once a second from server time and renders the timer card plus the existing `CheckinForm`. The server actions remain the only real gate.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind (`pz-*` tokens), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-21-checkin-timer-design.md`

## Global Constraints

- Branch `checkin-timer`, cut from `checkin-window-reminder-set` (e8427e37). Stage by explicit path only; never `git add docs`. Commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Window minutes come from `sessionWindow(session)` (already in `rules.ts`); `checkinWindow(startsAtIso, override, now, minutes)` remains the one rule for state.
- Timer shows ONLY for `window_override === "auto"`; for "open"/"closed" the existing plain line (`windowText`) stays and no timer renders.
- Time source: server time passed from the page (`serverNowIso`); the client measures an offset against its own clock at mount and never trusts the raw phone clock.
- Only plain strings/numbers go to the client (no session or batch rows).
- Texts, exact: label before `Check-in opens in`; label open `Check-in closes in`; closed `Check-in has closed.`; digits `MM:SS`, `H:MM:SS` from one hour, `N days H hours` from 24 hours (singular `1 day`, `1 hour`).
- Looks: existing `pz-*` colour tokens only (plus the existing `text-red-700` for urgency); last 60 seconds before closing turns the digits red; no animation under `prefers-reduced-motion`; usable at 390px and 1440px.
- Accessibility: digits are not announced every second; a visually hidden `aria-live="polite"` line updates about once a minute and on state change.
- CRLF line endings. npm/npx are broken (`&` in path): `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/typescript/bin/tsc --noEmit` (ignore stale `.next/types` errors about enrollments/app/page), `node node_modules/eslint/bin/eslint.js <paths>`. No `next build` while a dev server may be up.
- Known failing tests not ours: pz-tokens, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet, classes-tabs ("action row grid ... grid-cols-[minmax(0,1fr)]").

## Review Focus

- Student phone clock is 10 minutes wrong: timer and button state still follow the server time.
- Timer reaches zero while the page is open: state flips, button enables, no reload, typed email kept.
- Window with 0 minutes (open 0 / close 0), a very far class (days away), an invalid start time, a class already finished.
- Hidden-tab throttling: when the tab wakes up the state is recomputed from the clock, not by counting ticks.
- Override open/closed: no timer, plain line, form behaves as today.

---

### Task 1: Countdown helpers

**Files:**
- Modify: `src/lib/attendance/rules.ts`
- Test: `tests/attendance-rules.test.ts`

**Interfaces:**
- Consumes: `checkinWindow`, `WindowOverride`, `WindowState`, `WindowMinutes` (already exported).
- Produces:
  - `export type Countdown = { state: WindowState; target: "opens" | "closes" | null; msLeft: number; msTotal: number }`
  - `export function checkinCountdown(startsAtIso: string, override: WindowOverride, now: Date, minutes: WindowMinutes): Countdown` — for override "open"/"closed" or an invalid start: `target: null`, `msLeft: 0`, `msTotal: 0`, `state` as `checkinWindow` returns. Auto and before the window: `target: "opens"`, `msLeft` until open time, `msTotal` = 3_600_000 (one hour; the card's bar fills as the last hour before opening runs down and stays empty when further away). Auto and open: `target: "closes"`, `msLeft` until close time, `msTotal` = total open length (`(open + close) * 60000`). Auto and closed: `target: null`, zeros.
  - `export function formatCountdown(msLeft: number): string` — rounds UP to whole seconds; `MM:SS` under one hour, `H:MM:SS` from one hour, `N days H hours` from 24 hours (`1 day`, `1 hour` singular; `0 hours` is omitted: `2 days`).

- [ ] **Step 1: Write failing tests** in `tests/attendance-rules.test.ts`: `formatCountdown(754000)` is `12:34`; `formatCountdown(500)` is `00:01` (rounds up); `formatCountdown(0)` is `00:00`; `formatCountdown(3_725_000)` is `1:02:05`; `formatCountdown(90_000_000)` is `1 day 1 hour`; `formatCountdown(172_800_000)` is `2 days`. `checkinCountdown` with start 14:00, window 15/15: at 13:30 target "opens" and `msLeft` 15 minutes; at 13:50 state "open", target "closes", `msLeft` 25 minutes; at 14:20 state "closed", target null; override "open" or "closed" gives target null; invalid start gives target null; window 0/0 at 13:59:30 is target "opens" with `msLeft` 30000 and at 14:00:00 is state "open" with `msLeft` 0 (closes at once, still "open" at the exact second; assert state only).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** both exports in `rules.ts` using `checkinWindow` for the state so there is one rule.
- [ ] **Step 4: Run `tests/attendance-rules.test.ts` and `tests/share-messages.test.ts`, expect PASS; tsc clean.**
- [ ] **Step 5: Commit** `feat: countdown helpers for check-in timer`.

### Task 2: Timer card, live panel, page wiring

**Files:**
- Create: `src/components/attendance/CheckinTimer.tsx` (card, presentational: props `countdown: Countdown`, `fallbackText: string`)
- Create: `src/components/attendance/CheckinPanel.tsx` (`"use client"`: owns the clock and renders `CheckinTimer` + `CheckinForm`)
- Modify: `src/app/attend/[code]/page.tsx` (render `CheckinPanel`; keep the existing `windowText` line only for override open/closed)
- Test: `tests/checkin-timer.test.tsx` (new), `tests/checkin-form-open-minutes.test.tsx` (keep passing)

**Interfaces:**
- Consumes: Task 1 `checkinCountdown`, `formatCountdown`, `Countdown`; `CheckinForm` props (`code`, `token?`, `personal`, `shared`, `disabled?`, `openMinutes?`); `sessionWindow`, `windowText`.
- Produces: `CheckinPanel` props `{ code: string; token?: string; personal; shared; startsAtIso: string; override: WindowOverride; open: number; close: number; serverNowIso: string }`; `CheckinTimer` props `{ countdown: Countdown; fallbackText: string }`.

- [ ] **Step 1: Write failing tests** `tests/checkin-timer.test.tsx` with fake timers: (a) before the window shows `Check-in opens in` and `15:00` style digits, button disabled; (b) advancing fake time past the open moment flips to `Check-in closes in` and the button becomes enabled without remounting (type an email first and assert it is kept); (c) in the last 60 seconds before closing the digits element has the red class (`text-red-700`); (d) after close shows `Check-in has closed.` and no digits and the button disabled; (e) override "open" and "closed" render no timer element (`data-testid="checkin-timer"` absent) and the plain `windowText` line; (f) the phone clock 10 minutes wrong: set the fake system clock 10 minutes off from `serverNowIso`, the digits follow `serverNowIso`; (g) the visually hidden live line (`data-testid="checkin-timer-live"`) does not change on each second tick but does on a state flip.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `CheckinPanel` (`useState` offset computed once in a lazy initial state from `serverNowIso` and `Date.now()`, `setInterval` 1000 ms with cleanup, `now = new Date(Date.now() + offset)`, state via `checkinCountdown`, pass `disabled={state !== "open"}` to `CheckinForm`; recompute from the clock each tick so a throttled hidden tab catches up; also listen to `visibilitychange` to recompute) and `CheckinTimer` (card: label, big `tabular-nums` digits in the Poppins heading font, thin progress bar using `msLeft/msTotal`, three states as in the spec; `role="timer"`, digits `aria-hidden`, plus the hidden live sentence updating once a minute). Wire `page.tsx`: compute `serverNowIso = new Date().toISOString()` once, pass the values; remove the duplicated `disabled` logic from the page for override auto (keep `disabled={state==="closed"}` semantics for override closed).
- [ ] **Step 4: Run the new test, `tests/checkin-form-open-minutes.test.tsx`, `tests/attendance-checkin-actions.test.ts`, `tests/classes-public-cover.test.tsx`; tsc; eslint on touched paths; expect clean.**
- [ ] **Step 5: Commit** `feat: live countdown timer on the check-in page`.

### Task 3: Browser check

- [ ] **Step 1:** Dev server on port 3000 (reuse or start with `node node_modules/next/dist/bin/next dev -p 3000`, background; never `next build`). With Playwright (screenshots only, delete them after; they land in the parent folder), open `http://localhost:3000/attend/<public_code>` for a real class on localhost (do NOT press "Mark me present"; do not type into the email field except to check it is kept, and never submit). Check at 390px and 1440px: the closed state, the before state if a future class exists, and the open state if one is open (today's class if inside its window); read the public code from a class's attendance link in the admin Classes page (admin test login on localhost only, from memory file pz-academy-test-accounts; wait for the login page to finish loading before clicking SIGN IN). Fix real layout problems (small fixes, covering tests, commit `fix: ...`). Report what was seen.
