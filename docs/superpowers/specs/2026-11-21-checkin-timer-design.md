# Check-in page timer (design)

Date: 2026-11-21. Branch: `checkin-timer`, cut from `checkin-window-reminder-set` (e8427e37) because it uses the editable window (migration 0120, now pasted). Size: small change.

## Intent
Students open the public check-in page (`/attend/[code]`) early. Today it shows one fixed line and never changes, so they must refresh. Owner asked for a timer, and a good looking one.

## Goals
- One live countdown card on the page, owner-approved behaviour:
  - Before the window: "Check-in opens in 12:34". At zero the page unlocks by itself (no refresh).
  - While open: "Check-in closes in 08:20".
  - After it closes: "Check-in has closed", no timer.
  - Window forced open or closed by hand (`window_override` open/closed): no timer; the plain existing line stays (there is no end time to count to).
- Uses the real effective window (batch default or class override), so 30/10 counts to 30 minutes before and 10 after.
- Good looking: large tabular digits, clear label, soft progress bar, three clear states, works at 390px and 1440px, matches the page's existing green style.

## Non-goals / anti-goals
- No new screen, no new colours outside the existing `pz-*` tokens (plus the existing red used for errors).
- The server stays the only gate: `checkinWindow` still runs inside the check-in actions. The timer is display plus enabling the button; a wrong phone clock must never let anyone in.
- No timer for forced open/closed. No sound, no notifications.

## Constraints
- Phone clocks can be wrong: the timer measures time from the SERVER time sent with the page (offset against the phone clock at load), not from the raw phone clock.
- Send only plain numbers/ISO strings to the client; do not leak session rows or the batch row to the browser.
- Respect reduced motion (no animation is required; the progress bar may ease but must not animate under `prefers-reduced-motion`).
- Accessibility: the ticking digits are not announced every second; a visually hidden line updates about once a minute and on state change. Text contrast must hold.
- CRLF line endings; stage by explicit path only; never regenerate `database.types.ts`.
- Reads still work (the migration is now pasted, but keep the 15/15 fallback).

## Approaches
1. Client countdown component seeded with server time (chosen): a small `"use client"` component, ticks once per second with `setInterval`, recomputes state from `checkinWindow`, also drives the form's `disabled`. Simple, no extra requests.
2. Poll the server for state each few seconds. Heavier at class start (many students), rejected.
3. Page auto-refresh at the boundary. Flickers and loses typed email, rejected.

## Design
- Pure helper in `src/lib/attendance/rules.ts`: `checkinCountdown(startsAtIso, override, now, minutes): { state: WindowState; target: "opens" | "closes" | null; msLeft: number; msTotal: number }` (`target` null and no timer when override is open/closed or the start time is invalid). `formatCountdown(msLeft): string` gives `MM:SS`, `H:MM:SS` from one hour, and "N days H hours" from 24 hours.
- New client component `src/components/attendance/CheckinTimer.tsx` (card) and a client wrapper `CheckinPanel` that owns the live state and renders the timer plus `CheckinForm` with `disabled` following the live state. `page.tsx` passes `startsAtIso`, `override`, `win`, `serverNowIso`.
- Card look: white rounded card with thin border; small label ("Check-in opens in" / "Check-in closes in") in muted text; big digits (tabular numbers, bold, Poppins); a thin progress bar under it (fills towards opening in the before state, drains towards closing in the open state); open state uses the bright green accent; the last minute before closing turns the digits red. Closed state is a calm grey card with the text only.
- When the state flips at zero the card swaps state without a reload, and the form enables.

## Left to the builder
File names beyond the two components, exact spacing and sizes, test layout.
