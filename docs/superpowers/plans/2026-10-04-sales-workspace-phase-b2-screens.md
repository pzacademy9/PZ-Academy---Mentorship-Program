# Sales Workspace Phase B2 (Screens and B1 Follow-ups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give sales agents their working screens (Today queue with the WhatsApp send flow, My Contacts with timeline, Add a Lead, Help & Safety, a one-time Welcome Tour) inside a sales shell, give admins the WhatsApp Safety & Limits page, and land the B1 follow-ups the UI depends on.

**Architecture:** Backend follow-ups first (Tasks 1-6): every new decision goes into a pure module (`send-limits.ts`, `followup.ts`, `validations/sales.ts`) with unit tests, then the server-only data modules and routes are adjusted and pinned by structural guard tests (the repo does not mock Supabase). The UI (Tasks 7-15) is client components under `src/components/sales/` and `src/components/admin/sales/`, fed only by the existing `/api/sales/*` and `/api/admin/sales/*` routes plus one new read-only `/api/sales/templates` route. All screen logic that decides something (which number to preselect, why the WhatsApp button is locked, countdown wording, what an admin settings save sends) lives in two client-safe pure modules (`src/lib/crm/sales-ui.ts`, `src/lib/crm/sales-admin-ui.ts`) with unit tests; components get light Testing Library tests where the repo already has that pattern (`tests/ui-*.test.tsx`). The sales shell reuses the existing dashboard `Sidebar` (desktop left nav, phone bottom nav) by adding nav items, plus a `src/app/dashboard/sales/layout.tsx` that mounts the shared budget bar, the panic button and the tour.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service-role in server code, browser client only for `auth.updateUser`), Zod, Tailwind with the repo `pz-*` tokens, lucide-react icons, sonner toasts, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-04-sales-agent-workspace-design.md` (Sections 2, 3, 5). Backend that exists: `docs/superpowers/plans/2026-10-04-sales-workspace-phase-b1-backend.md` and its ledger `.superpowers/sdd/2026-10-04-sales-workspace-phase-b1-backend/progress.md` (deferred minors and rulings). Design source: `docs/superpowers/stitch-screens/2026-10-04-sales-workspace/` (read `MANIFEST.md` first). Phase C (campaign wizard, sending session, admin agent-activity view) is a separate plan.

## Global Constraints

- `npm run` is broken by the `&` in the folder path. Type-check: `node node_modules/typescript/bin/tsc --noEmit`. Tests: `node node_modules/vitest/vitest.mjs run tests/<file>` (whole suite: `node node_modules/vitest/vitest.mjs run`). Lint: `node node_modules/next/dist/bin/next lint --dir src/components/sales --dir src/app/dashboard/sales --dir src/components/admin/sales --dir src/lib/crm`.
- Never run `next build` while the dev server runs. Do not start or stop servers. Never push, never merge. Stage explicit paths only (`git add <paths>`), never `git add -A`. Leave the untracked `docs/lead-capture-go-live-guide.md` alone.
- Never regenerate `src/lib/supabase/database.types.ts`. This plan needs no new table, column or migration (the tour flag lives in Supabase auth `user_metadata`, Decision D5). If a later change needs one: a numbered migration file is committed but NOT applied (the owner pastes it), and `database.types.ts` gets hand-added entries only.
- The Supabase MCP cannot write. Any database write needed for testing (cleanup, resets) is SQL the owner pastes. Migrations 0063 and 0064 from B1 must be applied by the owner before Task 16 (B1 Task 10); 0064 must be applied before this code is deployed.
- Do not spend separate ad hoc verification calls (standalone curl, extra tsc runs, scripts). Per task: the failing test, the passing test, `tsc`, and lint on the touched dirs. That is sufficient evidence.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Every `/api/sales/*` route calls `requireSalesAgent(` and never `requireAdmin(`; every `/api/admin/*` route calls `requireAdmin(` and never mentions `requireSalesAgent` (pinned by `tests/api-role-gates.test.ts` and `tests/sales-routes.test.ts`). Routes never import `createAdminSupabase` and never build WhatsApp links; only `requestSend` produces a link.
- Safety numbers are cautious guesses, not guarantees. No copy, label, comment, tooltip or toast may call the limits "safe", say "guarantee"/"guaranteed", "anti-ban", "100%", "risk score" or promise the number will not be restricted. The Stitch screens contain such copy; it is replaced, never ported (see the per-screen drop lists).
- Copy is plain words a non-technical agent understands ("new chats", "paused overnight", "Next message unlocks in 74s"). No jargon ("velocity", "throttle", "carrier", "SIM health", "quarantine", "algorithm").
- UI tokens: port Stitch Tailwind classes 1:1 by adding the `pz-` prefix (`bg-primary-container` -> `bg-pz-primary-container`, `text-on-surface-variant` -> `text-pz-on-surface-variant`). Stitch `bg-background` -> `bg-pz-academy-background`; Stitch `text-error`/`bg-error` -> `text-pz-academy-error`/`bg-pz-academy-error`. Never a bare Stitch token (`bg-primary` hits shadcn HSL). No raw hex, `rgb(`/`rgba(`, `bg-white`, `text-white`, `bg-black` anywhere in the files this plan creates. Stitch arbitrary shadows (`shadow-[0_...rgba(...)]`) map to `shadow-sm` (cards), `shadow-card` (selected/raised card), `shadow-md` (the big WhatsApp button). WhatsApp brand colours are not needed: no screen in scope uses the WhatsApp preview palette (the Today preview uses surface tokens).
- Dark mode: this branch's `pz-*` tokens are fixed hex; the unmerged `dark-mode-pass` branch turns them into CSS variables. So: use only `pz-*` tokens, never `dark:` variants with hex, and never use the ADAPTIVE text tokens `pz-deep`, `pz-forest`, `pz-mid`, `pz-pine`, `pz-sage`, `pz-danger` as backgrounds (they lighten in dark mode on that branch; they are for text only). Use Stitch semantic pairs for filled surfaces (`bg-pz-primary text-pz-on-primary`, `bg-pz-error-container text-pz-on-error-container`, `bg-pz-secondary-container text-pz-on-secondary-container`). Light mode must look exactly as designed.
- Radius (Decision D7): keep the Stitch class names (`rounded-lg`, `rounded-xl`, `rounded`, `rounded-full`) and accept the repo radii (repo `lg` = 0.75rem, `xl` = 16px, slightly rounder than Stitch), so the new screens match every other dashboard screen. No arbitrary `rounded-[...]` values.
- Icons: Stitch uses Material Symbols; the repo uses `lucide-react`. Mapping: checklist->`ClipboardList`, group/contacts->`Users`, person_add->`UserPlus`, help->`LifeBuoy`, chat/forum->`MessageCircle`, schedule->`Clock`, close->`X`, verified->`BadgeCheck`, hourglass_top->`Hourglass`, local_cafe->`Coffee`, bedtime->`Moon`, warning->`TriangleAlert`, security/verified_user->`ShieldCheck`, search->`Search`, expand_more->`ChevronDown`, call->`Phone`, edit_note->`NotebookPen`, block->`Ban`, lock->`Lock`, check_circle->`CheckCircle2`, ac_unit->`Snowflake`, content_paste->`ClipboardPaste`, edit->`Pencil`, arrow_back->`ArrowLeft`, info->`Info`, history->`History`, celebration->`PartyPopper`. No Material Symbols stylesheet, no WhatsApp brand SVG.
- Fonts: ported pages set `font-body` explicitly (globals default is Poppins); headings `font-headline`, small accent labels `font-label`.
- Phone and desktop are equal targets: every screen works at 360-390 px wide (single column, `max-md:min-h-11` tap targets, inputs 16px on mobile via globals) and at 1280-1440 px (two-pane where the design has two panes). Nothing scrolls horizontally at 360 px.
- Repo test convention: pure-function tests for decisions; structural (source-reading) tests for data-module and route guarantees; Testing Library component tests are allowed (pattern: `tests/ui-confirm.test.tsx`, `tests/ui-states.test.tsx`) and use `vi.stubGlobal("fetch", ...)` (pattern: `tests/leads-offline-queue.test.ts`). No Supabase mocking.
- Test account for the click-through: the dedicated test sales agent is `Bp2001073hamzaahmed@gmail.com` (supplied by the owner) and the test contact phone is `+92 330 3145940` (E.164 `+923303145940`). Admin actions use `pharmacozymeofficial@gmail.com`. Never use the two off-limits Test Data emails.

## Settled decisions

D1 is an owner ruling (2026-10-05). D2-D6 and D10 are settled. D7, D8 and D9 are assumed agreed by default; the owner may veto them (flagged on each).

- **D1 After a send, the PERSON controls the follow-up time** (owner ruling, replaces the earlier fixed "now + 2 days"). The send request body carries optional `followupInHours` (integer, one of 8 / 24 / 48 / 72, default 24). Once the send is accepted the server sets the contact's `next_followup_at` to now + `followupInHours` (pure helper `nextFollowupAfterSend(now, hours)` in `followup.ts`), so the person leaves Today until then; the card stays on screen with the four outcome buttons and a "Done for now" button. UI: a small "Bring them back in:" chip row (8 hours / 1 day / 2 days / 3 days, 1 day preselected) sits with the WhatsApp button in the send panel, and its choice is sent with the send request. Outcome-driven defaults are unchanged (Replied +1 day, Interested +2 days, Bought / Not interested clear it). Reason: there is no "no reply yet" outcome, and without a bump a sent contact stays at the top of Today and invites a second message. Phase C: the campaign wizard must expose the same follow-up choice at batch level (default 1 day), see the Phase C hand-off at the end.
- **D2 Today queue fix found while planning:** B1 treats `next_followup_at = null` as due, but Bought and Not interested set it to null, so those contacts came straight back. Due now means: a follow-up date that has passed, or no date AND no outcome yet. A Bought/Not-interested contact returns only if an admin reassigns it (which sets a date).
- **D3 Warm = last outcome is Replied or Interested** (read from the contact row, no activity scan). Contacts saved through Add a Lead still count as new chats and as cold (cautious; changing it would let a pasted chat bypass the caps).
- **D4 Agents use the shared WhatsApp templates read-only** (new `GET /api/sales/templates`) plus a built-in default message; the text stays editable before sending. Saving their own templates is Phase C.
- **D5 Tour persistence:** Supabase auth `user_metadata.sales_tour_seen_at`, written from the browser with `auth.updateUser` (no migration, follows the agent across phone and desktop), with a `localStorage` flag as a same-device fallback if the write fails.
- **D6 Restricted detail:** the detail route now returns `restricted`; the UI shows only name, owner and last outcome. The UI does not need `do_not_contact_at` for restricted contacts (agent cannot act on them anyway), so it stays nulled.
- **D7 Radius:** repo radii (see Global Constraints). Assumed agreed; owner may veto (it departs slightly from the exact Stitch radii).
- **D8 Stitch elements with no backing data are dropped, not stubbed** (assumed agreed; owner may veto, because this departs from CLAUDE.md "port exhaustively") (per-screen drop lists below): target milestone, cohort banner, queue simulator, SIM risk score, "Reassign", course/source pickers, "Remind me" date chips, supervisor phone, stock photo. Tour step 4 becomes "We bring them back" (automatic follow-ups) because manual reminders do not exist.
- **D9 Panic freeze "admin alert"** (assumed agreed; owner may veto): the Safety page shows a red banner for every paused number (with "paused by an agent" when the blocked log has a `panic_freeze` row for it); an admin alert in B2 is exactly that red banner plus the blocked-attempts log; no email or notification row.
- **D10 Blocked-attempt log throttle:** at most one row per agent + number + reason per 60 s; the panic freeze always logs.

## Review Focus

- A countdown that ends inside quiet hours (unlock at 21:01 local) must show the morning reopening time, never "in 2 min" followed by a refusal (Task 1 budget clamp test; Task 7 `sendLock` precedence test).
- Contacts marked Bought or Not interested must never reappear in Today on their own (Task 2 `isDue` tests; Task 4 `coldQueueFilter` test).
- Two fast taps on the WhatsApp button must request only one send (Task 9 double-click test).
- Dismissing the Not-interested question with Escape or the X must log nothing, and "They asked me to stop" must send `askedToStop: true` (Task 9 tests).
- A restricted contact (another agent's) must render with no phone, no timeline and no action buttons (Task 11 test).

---

### Task 1: Send-limit follow-ups (relative hourly warning, retry times, frozen flag, log throttle rule)

**Files:**
- Modify: `src/lib/crm/send-limits.ts`
- Modify: `tests/crm-send-limits.test.ts`

**Interfaces:**
- Consumes: existing `SafetySettings`, `NumberState`, `Usage`, `evaluateSend`, `budgetSummary`.
- Produces (later tasks rely on these exact names):
  - `Usage` gains optional `hourWindowOldestAt?: Date | null` (oldest new chat inside the rolling hour).
  - `BudgetSummary` gains `frozen: boolean` (true also for an indefinite admin freeze, where `frozenUntil` is null).
  - `export function effectiveHourlyCap(state: NumberState, s: SafetySettings): number` (now exported).
  - `export function hourlyWarnAt(state: NumberState, s: SafetySettings): number`
  - `export function hourlyWarningText(left: number): string`
  - `export function outsideQuietHours(at: Date, s: SafetySettings): Date`
  - `export const BLOCKED_LOG_WINDOW_MS = 60_000`
  - `export function shouldLogBlockedAttempt(lastLoggedAt: Date | null, now: Date, windowMs?: number): boolean`

- [ ] **Step 1: Write the failing tests**

In `tests/crm-send-limits.test.ts`, extend the import list:

```ts
import {
  BLOCKED_LOG_WINDOW_MS,
  DEFAULT_SETTINGS,
  budgetSummary,
  effectiveDailyCap,
  evaluateSend,
  hourlyWarnAt,
  hourlyWarningText,
  isQuietHours,
  laterFreezeEnd,
  isIndefinitelyFrozen,
  localParts,
  outsideQuietHours,
  shouldLogBlockedAttempt,
  startOfLocalDay,
  violationAfterInsert,
  warmupStartAfterFreeze,
  type NumberState,
  type Usage,
} from "@/lib/crm/send-limits";
```

Replace the existing test `"enforces the daily cap for new chats only, retrying at local midnight"` with:

```ts
  it("enforces the daily cap for new chats only, retrying when quiet hours end (09:00), not at midnight", () => {
    const full: Usage = { ...idle, newChatsToday: 60 };
    expect(base({ usage: full })).toMatchObject({
      ok: false,
      reason: "daily_cap",
      retryAt: at("2026-10-06T04:00:00.000Z"), // 09:00 local next day
    });
    expect(base({ usage: full, isNewChat: false }).ok).toBe(true);
  });
```

Replace the existing test `"enforces the hourly cap and warns from the 15th"` with:

```ts
  it("enforces the hourly cap and warns from the 15th", () => {
    expect(base({ usage: { ...idle, newChatsLastHour: 20 } })).toMatchObject({
      ok: false,
      reason: "hourly_cap",
    });
    const warn = base({ usage: { ...idle, newChatsLastHour: 14 } });
    expect(warn.ok && warn.warnings).toEqual(["5 left this hour, slow down"]);
    const quiet = base({ usage: { ...idle, newChatsLastHour: 13 } });
    expect(quiet.ok && quiet.warnings).toEqual([]);
  });
```

(unchanged wording at 5 left; it is listed so the implementer re-runs it). Append at the end of the file:

```ts
describe("B2: retry times never land in quiet hours", () => {
  it("outsideQuietHours leaves daytime alone and moves a quiet instant to 09:00", () => {
    expect(outsideQuietHours(AFTERNOON, S)).toEqual(AFTERNOON);
    expect(outsideQuietHours(at("2026-10-05T15:59:59.000Z"), S)).toEqual(at("2026-10-05T15:59:59.000Z")); // 20:59:59
    expect(outsideQuietHours(at("2026-10-05T16:00:00.000Z"), S)).toEqual(at("2026-10-06T04:00:00.000Z")); // 21:00 -> 09:00
    expect(outsideQuietHours(at("2026-10-05T21:00:00.000Z"), S)).toEqual(at("2026-10-06T04:00:00.000Z")); // 02:00 -> 09:00
  });

  it("a freeze ending at 23:00 local retries at 09:00 the next morning", () => {
    const r = base({ state: { ...oldNumber, status: "frozen", frozenUntil: at("2026-10-05T18:00:00.000Z") } });
    expect(r).toMatchObject({ ok: false, reason: "frozen", retryAt: at("2026-10-06T04:00:00.000Z") });
  });

  it("spacing that unlocks after 21:00 retries at 09:00", () => {
    const now = at("2026-10-05T15:59:00.000Z"); // 20:59 local
    const r = base({
      now,
      usage: {
        ...idle,
        lastSend: { createdAt: new Date(now.getTime() - 10_000), nextUnlockAt: at("2026-10-05T16:01:00.000Z"), burstPos: 1 },
      },
    });
    expect(r).toMatchObject({ ok: false, reason: "spacing", retryAt: at("2026-10-06T04:00:00.000Z") });
  });
});

describe("B2: hourly cap retry time", () => {
  it("retries when the oldest new chat of the hour drops out", () => {
    const r = base({
      usage: { ...idle, newChatsLastHour: 20, hourWindowOldestAt: new Date(AFTERNOON.getTime() - 40 * 60_000) },
    });
    expect(r).toMatchObject({ ok: false, reason: "hourly_cap", retryAt: new Date(AFTERNOON.getTime() + 20 * 60_000) });
  });
  it("without the oldest time it retries in one hour", () => {
    expect(base({ usage: { ...idle, newChatsLastHour: 20 } })).toMatchObject({
      reason: "hourly_cap",
      retryAt: new Date(AFTERNOON.getTime() + 3_600_000),
    });
  });
  it("an hourly retry at 21:00 or later moves to 09:00", () => {
    const now = at("2026-10-05T15:30:00.000Z"); // 20:30 local
    const r = base({ now, usage: { ...idle, newChatsLastHour: 20, hourWindowOldestAt: at("2026-10-05T15:00:00.000Z") } });
    expect(r).toMatchObject({ reason: "hourly_cap", retryAt: at("2026-10-06T04:00:00.000Z") });
  });
});

describe("B2: hourly warning relative to the number's own cap", () => {
  it("defaults warn from the 15th of 20", () => {
    expect(hourlyWarnAt(oldNumber, S)).toBe(15);
  });
  it("scales with an override and never exceeds the cap", () => {
    expect(hourlyWarnAt({ ...oldNumber, hourlyCapOverride: 10 }, S)).toBe(8);
    expect(hourlyWarnAt({ ...oldNumber, hourlyCapOverride: 40 }, S)).toBe(30);
    expect(hourlyWarnAt({ ...oldNumber, hourlyCapOverride: 1 }, S)).toBe(1);
  });
  it("warns on an overridden cap of 10 from the 8th new chat", () => {
    const state = { ...oldNumber, hourlyCapOverride: 10 };
    const r = base({ state, usage: { ...idle, newChatsLastHour: 7 } });
    expect(r.ok && r.warnings).toEqual(["2 left this hour, slow down"]);
    const none = base({ state, usage: { ...idle, newChatsLastHour: 6 } });
    expect(none.ok && none.warnings).toEqual([]);
  });
  it("says plainly when the last new chat of the hour was used, and handles 1 left", () => {
    const last = base({ usage: { ...idle, newChatsLastHour: 19 } });
    expect(last.ok && last.warnings).toEqual(["That was the last new chat for this hour. Take a break."]);
    const one = base({ usage: { ...idle, newChatsLastHour: 18 } });
    expect(one.ok && one.warnings).toEqual(["1 left this hour, slow down"]);
    expect(hourlyWarningText(3)).toBe("3 left this hour, slow down");
  });
});

describe("B2: budgetSummary", () => {
  it("uses the relative warning threshold", () => {
    const state = { ...oldNumber, hourlyCapOverride: 10 };
    const warn = budgetSummary({ now: AFTERNOON, settings: S, state, usage: { ...idle, newChatsLastHour: 8 } });
    const calm = budgetSummary({ now: AFTERNOON, settings: S, state, usage: { ...idle, newChatsLastHour: 7 } });
    expect(warn.hourlyWarning).toBe(true);
    expect(calm.hourlyWarning).toBe(false);
  });
  it("reports frozen for an indefinite freeze (no end date) and for a running timed freeze", () => {
    const indefinite = budgetSummary({ now: AFTERNOON, settings: S, state: { ...oldNumber, status: "frozen", frozenUntil: null }, usage: idle });
    expect(indefinite).toMatchObject({ frozen: true, frozenUntil: null });
    const timed = budgetSummary({ now: AFTERNOON, settings: S, state: { ...oldNumber, status: "frozen", frozenUntil: at("2026-10-06T10:00:00.000Z") }, usage: idle });
    expect(timed).toMatchObject({ frozen: true, frozenUntil: at("2026-10-06T10:00:00.000Z") });
    expect(budgetSummary({ now: AFTERNOON, settings: S, state: oldNumber, usage: idle }).frozen).toBe(false);
  });
  it("moves a next-unlock time that lands in quiet hours to the morning", () => {
    const now = at("2026-10-05T15:59:00.000Z"); // 20:59 local
    const b = budgetSummary({
      now,
      settings: S,
      state: oldNumber,
      usage: { ...idle, lastSend: { createdAt: new Date(now.getTime() - 10_000), nextUnlockAt: at("2026-10-05T16:01:00.000Z"), burstPos: 1 } },
    });
    expect(b.nextUnlockAt).toEqual(at("2026-10-06T04:00:00.000Z"));
  });
});

describe("B2: shouldLogBlockedAttempt", () => {
  it("logs the first attempt and again only after the window", () => {
    expect(BLOCKED_LOG_WINDOW_MS).toBe(60_000);
    expect(shouldLogBlockedAttempt(null, AFTERNOON)).toBe(true);
    expect(shouldLogBlockedAttempt(new Date(AFTERNOON.getTime() - 59_999), AFTERNOON)).toBe(false);
    expect(shouldLogBlockedAttempt(new Date(AFTERNOON.getTime() - 60_000), AFTERNOON)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/crm-send-limits.test.ts`
Expected: FAIL (`hourlyWarnAt is not a function` / import errors, daily-cap retryAt mismatch).

- [ ] **Step 3: Implement in `src/lib/crm/send-limits.ts`**

1. `Usage` type:

```ts
export type Usage = {
  newChatsToday: number;
  newChatsLastHour: number;
  lastSend: LastSend | null;
  /** Oldest new chat inside the rolling hour; lets the hourly block say when a slot frees up. */
  hourWindowOldestAt?: Date | null;
};
```

2. After `quietEndsAt`, add:

```ts
/** A retry or unlock time that falls inside quiet hours is moved to when quiet hours end. */
export function outsideQuietHours(at: Date, s: SafetySettings): Date {
  return isQuietHours(at, s) ? quietEndsAt(at, s) : at;
}
```

3. Make `effectiveHourlyCap` exported (`export function effectiveHourlyCap(...)`) and add below it:

```ts
/** The hourly warning scales with the number's own cap: defaults 15 of 20, an override of 10 warns at 8. */
export function hourlyWarnAt(state: NumberState, s: SafetySettings): number {
  const cap = effectiveHourlyCap(state, s);
  return Math.max(1, Math.min(cap, Math.ceil((cap * s.hourly_warn_at) / s.hourly_cap)));
}

export function hourlyWarningText(left: number): string {
  if (left <= 0) return "That was the last new chat for this hour. Take a break.";
  if (left === 1) return "1 left this hour, slow down";
  return `${left} left this hour, slow down`;
}

export const BLOCKED_LOG_WINDOW_MS = 60_000;

/** One blocked-attempt row per agent, number and reason per window, so a tapped-at locked button does not flood the log. */
export function shouldLogBlockedAttempt(
  lastLoggedAt: Date | null,
  now: Date,
  windowMs: number = BLOCKED_LOG_WINDOW_MS,
): boolean {
  return lastLoggedAt === null || now.getTime() - lastLoggedAt.getTime() >= windowMs;
}
```

4. In `evaluateSend`, change the four block returns' `retryAt`:

```ts
      retryAt: state.frozenUntil ? outsideQuietHours(state.frozenUntil, s) : null,   // frozen
```
```ts
      retryAt: outsideQuietHours(last.nextUnlockAt, s),                               // spacing
```
```ts
        retryAt: outsideQuietHours(new Date(startOfLocalDay(now, s.timezone).getTime() + DAY_MS), s), // daily_cap
```
```ts
        retryAt: outsideQuietHours(
          new Date((usage.hourWindowOldestAt ?? now).getTime() + 3_600_000),
          s,
        ),                                                                              // hourly_cap
```
(quiet_hours keeps `quietEndsAt(now, s)`).

5. Replace the warnings block at the end of `evaluateSend`:

```ts
  const warnings: string[] = [];
  if (isNewChat) {
    const usedAfter = usage.newChatsLastHour + 1;
    if (usedAfter >= hourlyWarnAt(state, s)) {
      warnings.push(hourlyWarningText(effectiveHourlyCap(state, s) - usedAfter));
    }
  }
```

6. `BudgetSummary` gains `frozen: boolean;` (put it before `frozenUntil`). In `budgetSummary` return:

```ts
    hourlyWarning: usage.newChatsLastHour >= hourlyWarnAt(state, s),
    quietHours: quiet,
    quietEndsAt: quiet ? quietEndsAt(now, s) : null,
    frozen: isFrozen(state, now),
    frozenUntil: isFrozen(state, now) ? state.frozenUntil : null,
    nextUnlockAt: unlock && unlock.getTime() > now.getTime() ? outsideQuietHours(unlock, s) : null,
```

- [ ] **Step 4: Run to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/crm-send-limits.test.ts`
Expected: PASS (all old and new tests).
Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors (the extra `frozen` field is additive; `hourWindowOldestAt` is optional).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/send-limits.ts tests/crm-send-limits.test.ts
git commit -m "fix(sales): relative hourly warning, quiet-hours-aware retry times, frozen flag

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Follow-up rules for sends, due-ness and warmth

**Files:**
- Modify: `src/lib/crm/followup.ts`
- Modify: `tests/crm-followup.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `nextFollowupFor(kind: OutcomeKind | "claimed", now: Date): Date | null` (unchanged: Replied +1 day, Interested +2 days, claimed = now, Bought / Not interested = null). It has NO "sent" case: the follow-up after a send is chosen by the person and computed by `nextFollowupAfterSend`.
  - `export const FOLLOWUP_HOUR_CHOICES = [8, 24, 48, 72] as const`, `export type FollowupHours = (typeof FOLLOWUP_HOUR_CHOICES)[number]`, `export const DEFAULT_FOLLOWUP_HOURS: FollowupHours = 24`
  - `export const FOLLOWUP_CHOICES: readonly { hours: FollowupHours; label: string }[]` = 8 "8 hours", 24 "1 day", 48 "2 days", 72 "3 days" (the chip row in the send panel renders this list)
  - `export function isFollowupHours(value: unknown): value is FollowupHours`
  - `export function followupLabel(hours: FollowupHours): string` ("8 hours" / "1 day" / "2 days" / "3 days")
  - `export function nextFollowupAfterSend(now: Date, hours: number = DEFAULT_FOLLOWUP_HOURS): Date` (now + `hours` hours; an unknown value falls back to the default so a bad caller can never fail a send that was already counted)
  - `export const WARM_OUTCOMES: readonly OutcomeKind[]` = `["replied", "interested"]`
  - `export function isWarmOutcome(lastOutcome: string | null | undefined): boolean`
  - `export function isDue(item: { next_followup_at: string | null; last_outcome?: string | null }, now: Date): boolean`
  - `QueueItem` gains optional `last_outcome?: string | null`; `rankQueue` filters with `isDue`.
  - `export function coldQueueFilter(nowIso: string): string` (PostgREST `or()` body for the cold half of Today).

- [ ] **Step 1: Write the failing tests**

Change the import in `tests/crm-followup.test.ts` to:

```ts
import {
  nextFollowupFor,
  nextFollowupAfterSend,
  FOLLOWUP_HOUR_CHOICES,
  FOLLOWUP_CHOICES,
  DEFAULT_FOLLOWUP_HOURS,
  isFollowupHours,
  followupLabel,
  rankQueue,
  OUTCOME_KINDS,
  WARM_OUTCOMES,
  isWarmOutcome,
  isDue,
  coldQueueFilter,
} from "@/lib/crm/followup";
```

Append:

```ts
describe("B2: follow-up after a send (the person chooses)", () => {
  const hoursLater = (h: number) => new Date(now.getTime() + h * 3_600_000);
  it("offers 8 hours, 1 day, 2 days and 3 days, defaulting to 1 day", () => {
    expect([...FOLLOWUP_HOUR_CHOICES]).toEqual([8, 24, 48, 72]);
    expect(DEFAULT_FOLLOWUP_HOURS).toBe(24);
    expect(FOLLOWUP_CHOICES.map((c) => c.label)).toEqual(["8 hours", "1 day", "2 days", "3 days"]);
    expect(FOLLOWUP_CHOICES.map((c) => c.hours)).toEqual([8, 24, 48, 72]);
    expect(followupLabel(24)).toBe("1 day");
  });
  it("brings the contact back after exactly the chosen hours", () => {
    expect(nextFollowupAfterSend(now, 8)).toEqual(hoursLater(8));
    expect(nextFollowupAfterSend(now, 24)).toEqual(days(1));
    expect(nextFollowupAfterSend(now, 48)).toEqual(days(2));
    expect(nextFollowupAfterSend(now, 72)).toEqual(days(3));
  });
  it("uses 1 day when nothing (or something unknown) is passed", () => {
    expect(nextFollowupAfterSend(now)).toEqual(days(1));
    expect(nextFollowupAfterSend(now, 5)).toEqual(days(1));
    expect(nextFollowupAfterSend(now, Number.NaN)).toEqual(days(1));
  });
  it("only the four listed values are valid", () => {
    for (const h of [8, 24, 48, 72]) expect(isFollowupHours(h)).toBe(true);
    for (const h of [0, 12, 24.5, 168, "24", null, undefined]) expect(isFollowupHours(h)).toBe(false);
  });
  it("outcome-driven follow-ups are unchanged", () => {
    expect(nextFollowupFor("replied", now)).toEqual(days(1));
    expect(nextFollowupFor("interested", now)).toEqual(days(2));
    expect(nextFollowupFor("bought", now)).toBeNull();
    expect(nextFollowupFor("not_interested", now)).toBeNull();
  });
});

describe("B2: isDue", () => {
  it("a past or present follow-up date is due, a future one is not", () => {
    expect(isDue({ next_followup_at: days(-1).toISOString(), last_outcome: "replied" }, now)).toBe(true);
    expect(isDue({ next_followup_at: now.toISOString(), last_outcome: null }, now)).toBe(true);
    expect(isDue({ next_followup_at: days(1).toISOString(), last_outcome: null }, now)).toBe(false);
  });
  it("no date is due only when there is no outcome yet", () => {
    expect(isDue({ next_followup_at: null, last_outcome: null }, now)).toBe(true);
    expect(isDue({ next_followup_at: null }, now)).toBe(true);
    expect(isDue({ next_followup_at: null, last_outcome: "bought" }, now)).toBe(false);
    expect(isDue({ next_followup_at: null, last_outcome: "not_interested" }, now)).toBe(false);
  });
  it("an admin re-assignment (date set) brings a closed contact back", () => {
    expect(isDue({ next_followup_at: now.toISOString(), last_outcome: "not_interested" }, now)).toBe(true);
  });
});

describe("B2: warmth", () => {
  it("only Replied and Interested are warm", () => {
    expect([...WARM_OUTCOMES]).toEqual(["replied", "interested"]);
    expect(isWarmOutcome("replied")).toBe(true);
    expect(isWarmOutcome("interested")).toBe(true);
    expect(isWarmOutcome("bought")).toBe(false);
    expect(isWarmOutcome(null)).toBe(false);
    expect(isWarmOutcome(undefined)).toBe(false);
  });
});

describe("B2: rankQueue drops closed contacts", () => {
  it("filters Bought / Not interested with no date", () => {
    const items = [
      { id: "a", next_followup_at: null, warm: false, last_outcome: "bought" },
      { id: "b", next_followup_at: null, warm: false, last_outcome: null },
      { id: "c", next_followup_at: null, warm: false, last_outcome: "not_interested" },
    ];
    expect(rankQueue(items, now).map((i) => i.id)).toEqual(["b"]);
  });
});

describe("B2: coldQueueFilter", () => {
  it("matches new contacts with no date, new contacts that are due, and closed contacts given a due date", () => {
    expect(coldQueueFilter("2026-10-05T10:00:00.000Z")).toBe(
      "and(last_outcome.is.null,next_followup_at.is.null)," +
        "and(last_outcome.is.null,next_followup_at.lte.2026-10-05T10:00:00.000Z)," +
        "and(last_outcome.in.(bought,not_interested),next_followup_at.lte.2026-10-05T10:00:00.000Z)",
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/crm-followup.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 3: Implement in `src/lib/crm/followup.ts`**

Replace the file body below `const DAY_MS = 86_400_000;` with:

```ts
const HOUR_MS = 3_600_000;

/** How long after a send the person can ask to have the contact brought back (owner ruling, decision D1). */
export const FOLLOWUP_HOUR_CHOICES = [8, 24, 48, 72] as const;
export type FollowupHours = (typeof FOLLOWUP_HOUR_CHOICES)[number];
export const DEFAULT_FOLLOWUP_HOURS: FollowupHours = 24;

/** Plain-words labels for the "Bring them back in" chips, in display order. */
export const FOLLOWUP_CHOICES: readonly { hours: FollowupHours; label: string }[] = [
  { hours: 8, label: "8 hours" },
  { hours: 24, label: "1 day" },
  { hours: 48, label: "2 days" },
  { hours: 72, label: "3 days" },
];

export function isFollowupHours(value: unknown): value is FollowupHours {
  return typeof value === "number" && (FOLLOWUP_HOUR_CHOICES as readonly number[]).includes(value);
}

export function followupLabel(hours: FollowupHours): string {
  return FOLLOWUP_CHOICES.find((c) => c.hours === hours)!.label;
}

/**
 * When a contact who was just messaged comes back to Today if nobody taps an outcome:
 * now + the hours the person picked. An unknown value falls back to the default, so a bad
 * caller can never make the data layer throw after a send was already counted.
 */
export function nextFollowupAfterSend(now: Date, hours: number = DEFAULT_FOLLOWUP_HOURS): Date {
  const h = isFollowupHours(hours) ? hours : DEFAULT_FOLLOWUP_HOURS;
  return new Date(now.getTime() + h * HOUR_MS);
}

/** When a contact is next due after an outcome or a claim. null = no follow-up. (After a send: nextFollowupAfterSend.) */
export function nextFollowupFor(kind: OutcomeKind | "claimed", now: Date): Date | null {
  switch (kind) {
    case "replied":
      return new Date(now.getTime() + DAY_MS);
    case "interested":
      return new Date(now.getTime() + 2 * DAY_MS);
    case "claimed":
      return new Date(now.getTime());
    case "bought":
    case "not_interested":
      return null;
  }
}

/** Outcomes that mean a two-way conversation is going: ranked first in Today (spec 5.8). */
export const WARM_OUTCOMES: readonly OutcomeKind[] = ["replied", "interested"];

export function isWarmOutcome(lastOutcome: string | null | undefined): boolean {
  return lastOutcome != null && (WARM_OUTCOMES as readonly string[]).includes(lastOutcome);
}

/**
 * Due for Today: a follow-up date that has passed, or no date at all for a contact
 * with no outcome yet. Bought and Not interested clear the date, and must not come
 * straight back, so "no date" alone is not enough.
 */
export function isDue(item: { next_followup_at: string | null; last_outcome?: string | null }, now: Date): boolean {
  if (item.next_followup_at === null) return (item.last_outcome ?? null) === null;
  return Date.parse(item.next_followup_at) <= now.getTime();
}

export type QueueItem = { id: string; next_followup_at: string | null; warm: boolean; last_outcome?: string | null };

/** Today queue: only due contacts, warm first, then oldest due first, then id for stability. */
export function rankQueue<T extends QueueItem>(items: T[], now: Date): T[] {
  const dueAt = (i: T) => (i.next_followup_at === null ? 0 : Date.parse(i.next_followup_at));
  return items
    .filter((i) => isDue(i, now))
    .sort((a, b) => {
      if (a.warm !== b.warm) return a.warm ? -1 : 1;
      const d = dueAt(a) - dueAt(b);
      if (d !== 0) return d;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** PostgREST or() body for the cold half of Today (no outcome yet, or closed but re-dated by an admin). */
export function coldQueueFilter(nowIso: string): string {
  return [
    "and(last_outcome.is.null,next_followup_at.is.null)",
    `and(last_outcome.is.null,next_followup_at.lte.${nowIso})`,
    `and(last_outcome.in.(bought,not_interested),next_followup_at.lte.${nowIso})`,
  ].join(",");
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/crm-followup.test.ts`
Expected: PASS (old rankQueue tests still pass: items without `last_outcome` behave as before).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/followup.ts tests/crm-followup.test.ts
git commit -m "fix(sales): closed contacts stay out of Today; follow-up after a send

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Data layer and send route: hour-window usage, throttled blocked log, chosen follow-up after a send

**Files:**
- Modify: `src/lib/data/sales-numbers.ts`
- Modify: `src/lib/data/sales-send.ts`
- Modify: `src/lib/validations/sales.ts` (`sendRequestSchema`)
- Modify: `src/app/api/sales/contacts/[id]/send/route.ts`
- Modify: `tests/sales-data-guards.test.ts`, `tests/sales-validations.test.ts`, `tests/sales-routes.test.ts`

**Interfaces:**
- Consumes: Task 1 `outsideQuietHours`, `shouldLogBlockedAttempt`; Task 2 `nextFollowupAfterSend`, `DEFAULT_FOLLOWUP_HOURS`, `isFollowupHours`.
- Produces:
  - `getNumberUsage(...)` returns `Usage` including `hourWindowOldestAt`.
  - `logBlockedAttempt(row, opts?: { now?: Date; throttle?: boolean }): Promise<void>` (throttle defaults to true).
  - `requestSend` success: `nextUnlockAt` in the response is the display time (moved out of quiet hours); the stored `next_unlock_at` is unchanged. Contact `next_followup_at` is moved to `nextFollowupAfterSend(now, followupInHours)` (now + the hours the person chose, default 24).
  - `requestSend` args gain `followupInHours?: number`.
  - `sendRequestSchema` body: `{ numberId, messageTemplate, followupInHours? }` where `followupInHours` is an integer, one of 8 / 24 / 48 / 72, default 24 (anything else is a 400). The send route passes `parsed.data.followupInHours` to `requestSend`.

- [ ] **Step 1: Write the failing guard tests**

Append inside `describe("data layer guards", ...)` in `tests/sales-data-guards.test.ts`:

```ts
  it("usage reports the oldest new chat in the rolling hour", () => {
    const body = fnBody(numbers, "getNumberUsage");
    expect(body).toContain("hourWindowOldestAt");
    expect(body).toContain('.order("created_at", { ascending: true })');
  });

  it("blocked attempts are throttled, but the panic freeze always logs", () => {
    expect(fnBody(numbers, "logBlockedAttempt")).toContain("shouldLogBlockedAttempt(");
    expect(fnBody(numbers, "freezeNumber")).toContain("throttle: false");
  });

  it("an accepted send moves the follow-up by the chosen hours, only after the race re-check passed", () => {
    const body = fnBody(send, "requestSend");
    expect(body).toContain("nextFollowupAfterSend(now, followupInHours)");
    expect(body).not.toContain('nextFollowupFor("sent"');
    expect(body.indexOf("violationAfterInsert(")).toBeLessThan(body.indexOf("nextFollowupAfterSend(now, followupInHours)"));
    expect(body).toContain("outsideQuietHours(");
  });
```

Append to `tests/sales-validations.test.ts` (it already imports `sendRequestSchema` and defines `uuid`):

```ts
describe("B2: sendRequestSchema followupInHours", () => {
  const base = { numberId: uuid, messageTemplate: "Hi {{first_name}}" };
  it("defaults to 24 hours (1 day) when the field is missing", () => {
    const r = sendRequestSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.followupInHours).toBe(24);
  });
  it("accepts 8, 24, 48 and 72", () => {
    for (const h of [8, 24, 48, 72]) {
      const r = sendRequestSchema.safeParse({ ...base, followupInHours: h });
      expect(r.success, String(h)).toBe(true);
      if (r.success) expect(r.data.followupInHours).toBe(h);
    }
  });
  it("rejects anything else", () => {
    for (const h of [0, 12, 24.5, 96, 168, -24, "24", null]) {
      expect(sendRequestSchema.safeParse({ ...base, followupInHours: h }).success, String(h)).toBe(false);
    }
  });
});
```

Append to `describe("sales route files", ...)` in `tests/sales-routes.test.ts`:

```ts
  it("the send route passes the chosen follow-up hours to requestSend", () => {
    const src = readFileSync(join(salesRoot, "contacts", "[id]", "send", "route.ts"), "utf8");
    expect(src).toContain("followupInHours: parsed.data.followupInHours");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-guards.test.ts`
Expected: FAIL on the three new guard tests. Also run `node node_modules/vitest/vitest.mjs run tests/sales-validations.test.ts tests/sales-routes.test.ts` -> FAIL on the new follow-up tests.

- [ ] **Step 3: Implement**

`src/lib/data/sales-numbers.ts`:

1. Add `shouldLogBlockedAttempt` to the `@/lib/crm/send-limits` import.
2. In `getNumberUsage`, add a fourth query to the `Promise.all` and return it:

```ts
  const [newChatsToday, newChatsLastHour, lastRes, oldestRes] = await Promise.all([
    countNewChats(numberId, dayStart),
    countNewChats(numberId, hourAgo),
    db
      .from("contact_activities")
      .select("created_at, next_unlock_at, burst_pos")
      .eq("number_id", numberId)
      .eq("kind", "sent")
      .order("created_at", { ascending: false })
      .limit(1),
    db
      .from("contact_activities")
      .select("created_at")
      .eq("number_id", numberId)
      .eq("kind", "sent")
      .eq("is_new_chat", true)
      .gte("created_at", hourAgo)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);
  if (lastRes.error) throw lastRes.error;
  if (oldestRes.error) throw oldestRes.error;
  const row = lastRes.data?.[0];
  const oldest = oldestRes.data?.[0];
  return {
    newChatsToday,
    newChatsLastHour,
    hourWindowOldestAt: oldest ? new Date(oldest.created_at) : null,
    lastSend:
      row && row.next_unlock_at
        ? {
            createdAt: new Date(row.created_at),
            nextUnlockAt: new Date(row.next_unlock_at),
            burstPos: row.burst_pos ?? 1,
          }
        : null,
  };
```

3. Replace `logBlockedAttempt`:

```ts
export async function logBlockedAttempt(
  row: { numberId: string | null; agentId: string | null; contactId: string | null; reason: string },
  opts: { now?: Date; throttle?: boolean } = {},
): Promise<void> {
  const db = createAdminSupabase();
  const now = opts.now ?? new Date();
  if (opts.throttle !== false && row.agentId && row.numberId) {
    const { data: last, error: lastErr } = await db
      .from("whatsapp_blocked_attempts")
      .select("created_at")
      .eq("agent_id", row.agentId)
      .eq("number_id", row.numberId)
      .eq("reason", row.reason)
      .order("created_at", { ascending: false })
      .limit(1);
    // On a read error, log anyway: a missing row is worse than a duplicate.
    if (!lastErr && !shouldLogBlockedAttempt(last?.[0] ? new Date(last[0].created_at) : null, now)) return;
  }
  const { error } = await db.from("whatsapp_blocked_attempts").insert({
    number_id: row.numberId,
    agent_id: row.agentId,
    contact_id: row.contactId,
    reason: row.reason,
  });
  if (error) console.error("[sales-numbers] could not log blocked attempt", error);
}
```

4. In `freezeNumber`, change the log call to:

```ts
    await logBlockedAttempt({ numberId, agentId: userId, contactId: null, reason: "panic_freeze" }, { throttle: false });
```

`src/lib/data/sales-send.ts`:

1. Imports: add `outsideQuietHours` to the send-limits import; add `import { nextFollowupAfterSend } from "@/lib/crm/followup";`. Add `followupInHours?: number;` to the `requestSend` args type (after `messageTemplate`) and destructure it: `const { actor, contactId, numberId, messageTemplate, followupInHours } = args;` (undefined means the helper's 24-hour default).
2. Pass `now` to both `logBlockedAttempt` calls: `await logBlockedAttempt({ ... }, { now });`.
3. In the race-violation return, change `retryAt` to:

```ts
        retryAt:
          violation === "spacing" && conflict
            ? outsideQuietHours(new Date(conflict.next_unlock_at), settings).toISOString()
            : null,
```

4. Before the final success `return`, insert:

```ts
    // The person leaves Today until the time THEY chose (plan decision D1, default 1 day).
    // A failure here must not hide a send that was already counted, so it is logged, not thrown.
    const { error: bumpErr } = await db
      .from("contacts")
      .update({ next_followup_at: nextFollowupAfterSend(now, followupInHours).toISOString() })
      .eq("id", contactId);
    if (bumpErr) console.error("[sales-send] could not move the follow-up after a send", contactId, bumpErr);
```

5. In the success return use the display time:

```ts
      nextUnlockAt: outsideQuietHours(decision.nextUnlockAt, settings).toISOString(),
```

`src/lib/validations/sales.ts`: add `import { DEFAULT_FOLLOWUP_HOURS, isFollowupHours } from "@/lib/crm/followup";` and replace `sendRequestSchema` with:

```ts
export const sendRequestSchema = z.object({
  numberId: z.string().uuid(),
  messageTemplate: text(1000),
  // How long until the contact comes back to Today if they do not answer: 8 hours, 1 day, 2 days or 3 days.
  followupInHours: z
    .number()
    .int()
    .refine((h) => isFollowupHours(h), "Pick 8 hours, 1 day, 2 days or 3 days.")
    .default(DEFAULT_FOLLOWUP_HOURS),
});
```

`src/app/api/sales/contacts/[id]/send/route.ts`: add one line to the `requestSend({ ... })` call, after `messageTemplate`:

```ts
    followupInHours: parsed.data.followupInHours,
```

- [ ] **Step 4: Run to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-guards.test.ts tests/sales-data-exports.test.ts tests/sales-validations.test.ts tests/sales-routes.test.ts`
Expected: PASS.
Run: `node node_modules/typescript/bin/tsc --noEmit` -> no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/sales-numbers.ts src/lib/data/sales-send.ts src/lib/validations/sales.ts "src/app/api/sales/contacts/[id]/send/route.ts" tests/sales-data-guards.test.ts tests/sales-validations.test.ts tests/sales-routes.test.ts
git commit -m "fix(sales): hourly retry data, throttle blocked log, follow-up after a send at the chosen time

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Today queue: warm-first split before the limit, bounded activity reads

**Files:**
- Modify: `src/lib/data/sales-contacts.ts` (`getTodayQueue` and constants only)
- Modify: `tests/sales-data-guards.test.ts`

**Interfaces:**
- Consumes: Task 2 `rankQueue`, `isWarmOutcome`, `WARM_OUTCOMES`, `coldQueueFilter`.
- Produces: `getTodayQueue(actor, now?)` unchanged signature and `QueueCard` shape; `remaining` = total due (warm + cold), `items` = at most 50, warm first.

- [ ] **Step 1: Write the failing guard test**

Append inside `describe("data layer guards", ...)`:

```ts
  it("Today splits warm and cold before limiting, and every activity read is bounded", () => {
    const queue = fnBody(contacts, "getTodayQueue");
    expect(queue).toContain("WARM_OUTCOMES");
    expect(queue).toContain("coldQueueFilter(");
    expect(queue).not.toContain(".limit(200)");
    expect(queue.match(/\.limit\(ACTIVITY_READ_LIMIT\)/g)?.length).toBe(2);
    expect(queue).not.toContain('"replied", "interested", "bought"]'); // no unbounded warm scan of activities
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-guards.test.ts`
Expected: FAIL on the new test.

- [ ] **Step 3: Implement**

In `src/lib/data/sales-contacts.ts`:

```ts
import {
  coldQueueFilter,
  isWarmOutcome,
  nextFollowupFor,
  rankQueue,
  WARM_OUTCOMES,
  type OutcomeKind,
} from "@/lib/crm/followup";
```

Add next to the other constants:

```ts
/** PostgREST returns at most 1000 rows; activity reads below are capped at it explicitly. */
const ACTIVITY_READ_LIMIT = 1000;
```

Replace `getTodayQueue` with:

```ts
export async function getTodayQueue(
  actor: Actor,
  now: Date = new Date(),
): Promise<{ ok: true; items: QueueCard[]; remaining: number } | Fail<"db-error" | "not-allowed">> {
  if (!canUseSales(actor)) return { ok: false, reason: "not-allowed" };
  if (actor.id === "") return { ok: true, items: [], remaining: 0 };
  try {
    const db = createAdminSupabase();
    const nowIso = now.toISOString();
    const owned = () =>
      db
        .from("contacts")
        .select("id, full_name, phone_e164, last_outcome, next_followup_at", { count: "exact" })
        .eq("owner_id", actor.id)
        .is("do_not_contact_at", null)
        .is("whatsapp_unsubscribed_at", null)
        .not("phone_e164", "is", null);

    // Warm first (spec 5.8). The limit applies to each half separately, so a long cold
    // backlog can never push people who already replied out of the list.
    const [warmRes, coldRes] = await Promise.all([
      owned()
        .in("last_outcome", [...WARM_OUTCOMES])
        .lte("next_followup_at", nowIso)
        .order("next_followup_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(QUEUE_LIMIT),
      owned()
        .or(coldQueueFilter(nowIso))
        .order("next_followup_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true })
        .limit(QUEUE_LIMIT),
    ]);
    if (warmRes.error) throw warmRes.error;
    if (coldRes.error) throw coldRes.error;
    const remaining = (warmRes.count ?? 0) + (coldRes.count ?? 0);

    const ranked = rankQueue(
      [...(warmRes.data ?? []), ...(coldRes.data ?? [])].map((r) => ({ ...r, warm: isWarmOutcome(r.last_outcome) })),
      now,
    ).slice(0, QUEUE_LIMIT);
    if (ranked.length === 0) return { ok: true, items: [], remaining };
    const ids = ranked.map((r) => r.id);

    const [recentRes, noteRes] = await Promise.all([
      db
        .from("contact_activities")
        .select("contact_id")
        .in("contact_id", ids)
        .eq("kind", "sent")
        .gte("created_at", new Date(now.getTime() - DAY_MS).toISOString())
        .limit(ACTIVITY_READ_LIMIT),
      db
        .from("contact_activities")
        .select("contact_id, body")
        .in("contact_id", ids)
        .eq("kind", "note")
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_READ_LIMIT),
    ]);
    for (const r of [recentRes, noteRes]) if (r.error) throw r.error;
    const recent = new Set((recentRes.data ?? []).map((r) => r.contact_id));
    const lastNote = new Map<string, string>();
    for (const n of noteRes.data ?? []) {
      if (!lastNote.has(n.contact_id) && n.body) lastNote.set(n.contact_id, n.body);
    }

    return {
      ok: true,
      remaining,
      items: ranked.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        phone_e164: r.phone_e164 as string,
        last_outcome: r.last_outcome,
        next_followup_at: r.next_followup_at,
        last_note: lastNote.get(r.id) ?? null,
        warm: r.warm,
        recently_contacted: recent.has(r.id),
      })),
    };
  } catch (e) {
    return dbError("getTodayQueue", e);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-guards.test.ts tests/crm-followup.test.ts`
Expected: PASS (including the existing "never includes do-not-contact" guard, whose strings are inside `owned()`).
Run: `node node_modules/typescript/bin/tsc --noEmit` -> no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/sales-contacts.ts tests/sales-data-guards.test.ts
git commit -m "fix(sales): Today ranks warm first before limiting, bounded activity reads

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Contacts: no phone existence probe, duplicate id null, detail returns `restricted`

**Files:**
- Modify: `src/lib/validations/sales.ts`
- Modify: `src/lib/data/sales-contacts.ts` (`listContacts`, `addLead`)
- Modify: `src/app/api/sales/contacts/[id]/route.ts`
- Modify: `tests/sales-validations.test.ts`, `tests/sales-data-guards.test.ts`, `tests/sales-routes.test.ts`

**Interfaces:**
- Consumes: existing `sanitizeSearch`.
- Produces:
  - `export function phoneNeedle(term: string): string`
  - `export function contactSearchFilter(q: string, viewer: { id: string; isAdmin: boolean; tab: "mine" | "unclaimed" | "all" }): string | null`
  - `addLead` duplicate branch: `{ ok: false; reason: "duplicate"; contactId: string | null; ownerName: string | null }`.
  - `GET /api/sales/contacts/[id]` JSON: `{ contact, timeline, canAct, restricted }`.
  - `POST /api/sales/leads` 409 JSON: `{ error, reason: "duplicate", contactId: string | null, ownerName: string | null }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/sales-validations.test.ts` (add `contactSearchFilter, phoneNeedle` to its import from `@/lib/validations/sales`):

```ts
describe("B2: contact search", () => {
  const me = "11111111-1111-4111-8111-111111111111";
  it("turns typed phone digits into a needle inside +E.164", () => {
    expect(phoneNeedle("0300 1234")).toBe("3001234");
    expect(phoneNeedle("+92 300")).toBe("92300");
    expect(phoneNeedle("Ayesha")).toBe("");
  });
  it("searches name only when the term has fewer than 3 digits", () => {
    expect(contactSearchFilter("Ayesha", { id: me, isAdmin: false, tab: "all" })).toBe("full_name.ilike.%Ayesha%");
  });
  it("on the All tab an agent's phone search only matches unclaimed or own contacts", () => {
    expect(contactSearchFilter("0300", { id: me, isAdmin: false, tab: "all" })).toBe(
      `full_name.ilike.%0300%,and(phone_e164.ilike.%300%,or(owner_id.is.null,owner_id.eq.${me}))`,
    );
  });
  it("admins and the Mine/Unclaimed tabs search phones freely", () => {
    expect(contactSearchFilter("0300", { id: me, isAdmin: true, tab: "all" })).toBe(
      "full_name.ilike.%0300%,phone_e164.ilike.%300%",
    );
    expect(contactSearchFilter("0300", { id: me, isAdmin: false, tab: "mine" })).toBe(
      "full_name.ilike.%0300%,phone_e164.ilike.%300%",
    );
  });
  it("an empty id can only match unclaimed phones; blank input gives no filter", () => {
    expect(contactSearchFilter("0300", { id: "", isAdmin: false, tab: "all" })).toBe(
      "full_name.ilike.%0300%,and(phone_e164.ilike.%300%,owner_id.is.null)",
    );
    expect(contactSearchFilter("  (,)  ", { id: me, isAdmin: false, tab: "all" })).toBeNull();
  });
});
```

Append inside `describe("data layer guards", ...)` in `tests/sales-data-guards.test.ts`:

```ts
  it("list search goes through contactSearchFilter and duplicates never carry an empty id", () => {
    expect(fnBody(contacts, "listContacts")).toContain("contactSearchFilter(");
    expect(fnBody(contacts, "listContacts")).not.toContain("phone_e164.ilike");
    expect(fnBody(contacts, "addLead")).not.toContain('contactId: ""');
  });
```

Append to `describe("sales route files", ...)` in `tests/sales-routes.test.ts`:

```ts
  it("the contact detail route passes the restricted flag through", () => {
    const src = readFileSync(join(salesRoot, "contacts", "[id]", "route.ts"), "utf8");
    expect(src).toContain("restricted: result.restricted");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-validations.test.ts tests/sales-data-guards.test.ts tests/sales-routes.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

Append to `src/lib/validations/sales.ts`:

```ts
/** The digits a person types for a phone, matched inside +E.164: "0300 123" -> "300123". */
export function phoneNeedle(term: string): string {
  return term.replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * PostgREST or() body for contact search. On the All tab a sales agent sees other
 * agents' contacts with the phone masked, so matching on their phone would reveal that
 * the person exists; phone matches there are limited to unclaimed and own contacts.
 */
export function contactSearchFilter(
  q: string,
  viewer: { id: string; isAdmin: boolean; tab: "mine" | "unclaimed" | "all" },
): string | null {
  const term = sanitizeSearch(q);
  if (!term) return null;
  const parts = [`full_name.ilike.%${term}%`];
  const needle = phoneNeedle(term);
  if (needle.length >= 3) {
    const phone = `phone_e164.ilike.%${needle}%`;
    if (viewer.tab === "all" && !viewer.isAdmin) {
      parts.push(
        viewer.id === ""
          ? `and(${phone},owner_id.is.null)`
          : `and(${phone},or(owner_id.is.null,owner_id.eq.${viewer.id}))`,
      );
    } else {
      parts.push(phone);
    }
  }
  return parts.join(",");
}
```

In `src/lib/data/sales-contacts.ts`:
- import: `import { contactSearchFilter } from "@/lib/validations/sales";` (replace the `sanitizeSearch` import; it is no longer used here).
- In `listContacts`, replace the two `term` lines with:

```ts
    const filter = query.q
      ? contactSearchFilter(query.q, { id: actor.id, isAdmin: isAdminRole(actor), tab: query.tab })
      : null;
    if (filter) q = q.or(filter);
```

- In `addLead`'s return type change the duplicate member to `{ ok: false; reason: "duplicate"; contactId: string | null; ownerName: string | null }`, and the 23505 branch to:

```ts
      if (error.code === "23505") return { ok: false, reason: "duplicate", contactId: null, ownerName: null };
```

In `src/app/api/sales/contacts/[id]/route.ts` change the success line to:

```ts
  return NextResponse.json({
    contact: result.contact,
    timeline: result.timeline,
    canAct: result.canAct,
    restricted: result.restricted,
  });
```

(`src/app/api/sales/leads/route.ts` already forwards `result.contactId`; it now carries `null` instead of `""`. No edit needed.)

- [ ] **Step 4: Run to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-validations.test.ts tests/sales-data-guards.test.ts tests/sales-routes.test.ts`
Expected: PASS.
Run: `node node_modules/typescript/bin/tsc --noEmit` -> no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/sales.ts src/lib/data/sales-contacts.ts "src/app/api/sales/contacts/[id]/route.ts" tests/sales-validations.test.ts tests/sales-data-guards.test.ts tests/sales-routes.test.ts
git commit -m "fix(sales): no phone existence probe on All, null duplicate id, restricted flag in detail

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Read-only WhatsApp templates for agents

**Files:**
- Create: `src/app/api/sales/templates/route.ts`
- Modify: `tests/sales-routes.test.ts`

**Interfaces:**
- Consumes: `listTemplates(channel: "whatsapp"): Promise<TemplateRow[]>` from `src/lib/data/admin-crm-templates.ts`.
- Produces: `GET /api/sales/templates` -> `200 { templates: { id: string; name: string; body: string }[] }`; `401/403` from the gate.

- [ ] **Step 1: Write the failing test**

In `tests/sales-routes.test.ts`, add `"/src/app/api/sales/templates/route.ts",` to the expected sorted list in `"exist in the expected number"`, and append to the describe:

```ts
  it("the templates route is read-only", () => {
    const src = readFileSync(join(salesRoot, "templates", "route.ts"), "utf8");
    expect(src).toContain('listTemplates("whatsapp")');
    expect(src).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(src).not.toContain("createTemplate");
    expect(src).not.toContain("deleteTemplate");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-routes.test.ts`
Expected: FAIL (file missing).

- [ ] **Step 3: Implement**

Create `src/app/api/sales/templates/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { listTemplates } from "@/lib/data/admin-crm-templates";

/** Shared WhatsApp templates, read-only for agents (plan decision D4). */
export async function GET() {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  try {
    const templates = await listTemplates("whatsapp");
    return NextResponse.json({ templates: templates.map((t) => ({ id: t.id, name: t.name, body: t.body })) });
  } catch {
    return NextResponse.json({ error: "Could not load saved messages." }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-routes.test.ts tests/api-role-gates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sales/templates/route.ts tests/sales-routes.test.ts
git commit -m "feat(sales): read-only WhatsApp templates route for agents

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client-safe screen helpers (`sales-ui.ts`)

**Files:**
- Create: `src/lib/crm/sales-ui.ts`
- Create: `tests/sales-ui.test.ts`

**Interfaces:**
- Consumes: `OutcomeKind` from `@/lib/crm/followup`; `formatDateTime`, `formatTime` from `@/lib/format`. Must NOT import anything `server-only`.
- Produces (exact names used by Tasks 8-15):

```ts
export type BudgetJson = {
  dailyUsed: number; dailyCap: number; hourlyUsed: number; hourlyCap: number;
  hourlyWarning: boolean; quietHours: boolean; quietEndsAt: string | null;
  frozen: boolean; frozenUntil: string | null; nextUnlockAt: string | null;
};
export type AgentBudgetJson = { number: { id: string; label: string; phone_e164: string | null }; budget: BudgetJson };
export type QueueCardJson = {
  id: string; full_name: string; phone_e164: string; last_outcome: string | null;
  next_followup_at: string | null; last_note: string | null; warm: boolean; recently_contacted: boolean;
};
export type ContactRowJson = {
  id: string; full_name: string; phone_e164: string | null; owner_id: string | null; owner_name: string | null;
  last_outcome: string | null; next_followup_at: string | null; do_not_contact_at: string | null;
};
export type TimelineEntryJson = { id: string; kind: string; body: string | null; agent_name: string | null; created_at: string };
export type ContactDetailJson = {
  contact: ContactRowJson & { email: string | null; profession: string | null };
  timeline: TimelineEntryJson[]; canAct: boolean; restricted: boolean;
};
export type TemplateJson = { id: string; name: string; body: string };
export type SendOkJson = { link: string; nextUnlockAt: string; warnings: string[]; isNewChat: boolean; budget: BudgetJson };
export type ApiErrorJson = { error?: string; reason?: string; retryAt?: string | null };
export type SendLock =
  | { kind: "loading" } | { kind: "ready" } | { kind: "no-number" }
  | { kind: "frozen"; until: string | null } | { kind: "quiet"; until: string | null }
  | { kind: "wait"; until: string } | { kind: "daily-cap" } | { kind: "hourly-cap" };
export const DEFAULT_MESSAGE: string;
export const OUTCOME_BUTTONS: readonly { kind: OutcomeKind; label: string }[];
export function pickDefaultNumber(budgets: AgentBudgetJson[]): string | null;
export function secondsUntil(iso: string, now: Date): number;
export function formatWait(seconds: number, untilIso: string): string;
export function sendLock(input: { budgets: AgentBudgetJson[] | null; selected: AgentBudgetJson | null; warm: boolean; now: Date }): SendLock;
export function lockCopy(lock: SendLock, now: Date): { button: string; detail: string | null };
export function budgetLine(b: BudgetJson): string;
export function hourLine(b: BudgetJson): string;
export function explainSendError(body: ApiErrorJson | null, now: Date): string;
export function activityLabel(kind: string): string;
export function outcomeLabel(lastOutcome: string | null): string;
export function greetingFor(hour: number): string;
export function leadPayload(f: { phone: string; name: string; email: string; profession: string; note: string }): Record<string, string>;
export function recentlySent(timeline: TimelineEntryJson[], now: Date): boolean;
```

- [ ] **Step 1: Write the failing tests**

Create `tests/sales-ui.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_MESSAGE,
  OUTCOME_BUTTONS,
  activityLabel,
  budgetLine,
  explainSendError,
  formatWait,
  greetingFor,
  hourLine,
  leadPayload,
  lockCopy,
  outcomeLabel,
  pickDefaultNumber,
  recentlySent,
  secondsUntil,
  sendLock,
  type AgentBudgetJson,
  type BudgetJson,
} from "@/lib/crm/sales-ui";

const NOW = new Date("2026-10-05T10:00:00.000Z");
const plus = (s: number) => new Date(NOW.getTime() + s * 1000).toISOString();
const budget = (over: Partial<BudgetJson> = {}): BudgetJson => ({
  dailyUsed: 12, dailyCap: 60, hourlyUsed: 2, hourlyCap: 20, hourlyWarning: false,
  quietHours: false, quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null, ...over,
});
const num = (id: string, label: string, b: BudgetJson = budget()): AgentBudgetJson => ({
  number: { id, label, phone_e164: null }, budget: b,
});

describe("pickDefaultNumber", () => {
  it("prefers the open number with the most new chats left, then label", () => {
    expect(pickDefaultNumber([num("a", "A", budget({ dailyUsed: 50 })), num("b", "B", budget({ dailyUsed: 10 }))])).toBe("b");
    expect(pickDefaultNumber([num("b", "Beta"), num("a", "Alpha")])).toBe("a");
  });
  it("skips a frozen number even if it has more left", () => {
    expect(pickDefaultNumber([num("a", "A", budget({ frozen: true, dailyUsed: 0 })), num("b", "B", budget({ dailyUsed: 59 }))])).toBe("b");
  });
  it("still selects one when all are frozen (so the screen can explain), null when none", () => {
    expect(pickDefaultNumber([num("a", "A", budget({ frozen: true }))])).toBe("a");
    expect(pickDefaultNumber([])).toBeNull();
  });
});

describe("countdown wording", () => {
  it("rounds up to whole seconds and never goes negative", () => {
    expect(secondsUntil(plus(73.2), NOW)).toBe(74);
    expect(secondsUntil(plus(-5), NOW)).toBe(0);
  });
  it("seconds up to 2 minutes, then minutes, then a clock time", () => {
    expect(formatWait(74, plus(74))).toBe("in 74s");
    expect(formatWait(120, plus(120))).toBe("in 120s");
    expect(formatWait(600, plus(600))).toBe("in 10 min");
    expect(formatWait(7200, plus(7200))).toMatch(/^at \d\d:\d\d$/);
  });
});

describe("sendLock (why the WhatsApp button is locked)", () => {
  const sel = (b: BudgetJson) => ({ budgets: [num("a", "A", b)], selected: num("a", "A", b), warm: false, now: NOW });
  it("loading before budgets arrive; no-number when the agent has none", () => {
    expect(sendLock({ budgets: null, selected: null, warm: false, now: NOW })).toEqual({ kind: "loading" });
    expect(sendLock({ budgets: [], selected: null, warm: false, now: NOW })).toEqual({ kind: "no-number" });
  });
  it("frozen beats quiet beats wait beats caps", () => {
    const all = budget({ frozen: true, quietHours: true, quietEndsAt: plus(3600), nextUnlockAt: plus(60), dailyUsed: 60 });
    expect(sendLock(sel(all)).kind).toBe("frozen");
    expect(sendLock(sel({ ...all, frozen: false })).kind).toBe("quiet");
    expect(sendLock(sel({ ...all, frozen: false, quietHours: false }))).toEqual({ kind: "wait", until: plus(60) });
    expect(sendLock(sel({ ...all, frozen: false, quietHours: false, nextUnlockAt: null })).kind).toBe("daily-cap");
  });
  it("an unlock time in the past is ready", () => {
    expect(sendLock(sel(budget({ nextUnlockAt: plus(-1) })))).toEqual({ kind: "ready" });
  });
  it("caps do not lock a warm contact (replies are not new chats)", () => {
    const capped = budget({ dailyUsed: 60, hourlyUsed: 20 });
    expect(sendLock({ ...sel(capped), warm: true })).toEqual({ kind: "ready" });
    expect(sendLock(sel(budget({ hourlyUsed: 20 }))).kind).toBe("hourly-cap");
  });
});

describe("lockCopy", () => {
  it("uses the spec wording for the countdown", () => {
    expect(lockCopy({ kind: "wait", until: plus(74) }, NOW).button).toBe("Next message unlocks in 74s");
  });
  it("explains each lock in plain words", () => {
    expect(lockCopy({ kind: "ready" }, NOW)).toEqual({ button: "Message on WhatsApp", detail: null });
    expect(lockCopy({ kind: "no-number" }, NOW).detail).toMatch(/ask your admin/i);
    expect(lockCopy({ kind: "frozen", until: null }, NOW).detail).toMatch(/admin/i);
    expect(lockCopy({ kind: "quiet", until: plus(3600) }, NOW).button).toBe("Paused overnight");
    expect(lockCopy({ kind: "daily-cap" }, NOW).detail).toMatch(/already replied/i);
  });
  it("never claims anything is safe or guaranteed", () => {
    const kinds = [
      { kind: "ready" }, { kind: "loading" }, { kind: "no-number" }, { kind: "frozen", until: plus(99) },
      { kind: "quiet", until: plus(99) }, { kind: "wait", until: plus(400) }, { kind: "daily-cap" }, { kind: "hourly-cap" },
    ] as const;
    for (const k of kinds) {
      const c = lockCopy(k, NOW);
      expect(`${c.button} ${c.detail ?? ""}`).not.toMatch(/\bsafe\b|guarantee/i);
    }
  });
});

describe("budget lines and errors", () => {
  it("formats the visible budget", () => {
    expect(budgetLine(budget())).toBe("12 of 60 new chats used today");
    expect(hourLine(budget())).toBe("2 of 20 this hour");
  });
  it("adds when to try again", () => {
    expect(explainSendError({ error: "Wait a moment before the next message.", retryAt: plus(74) }, NOW)).toBe(
      "Wait a moment before the next message. Try again in 74s.",
    );
    expect(explainSendError(null, NOW)).toBe("Could not send this message.");
  });
});

describe("labels", () => {
  it("outcome buttons follow the spec order", () => {
    expect(OUTCOME_BUTTONS.map((o) => o.label)).toEqual(["Replied", "Interested", "Bought", "Not interested"]);
  });
  it("labels timeline kinds and outcomes", () => {
    expect(activityLabel("sent")).toBe("Messaged on WhatsApp");
    expect(activityLabel("released")).toBe("Released to unclaimed");
    expect(activityLabel("mystery")).toBe("mystery");
    expect(outcomeLabel("not_interested")).toBe("Not interested");
    expect(outcomeLabel(null)).toBe("New");
  });
  it("greets by local hour", () => {
    expect(greetingFor(9)).toBe("Good morning");
    expect(greetingFor(13)).toBe("Good afternoon");
    expect(greetingFor(19)).toBe("Good evening");
  });
  it("the default message uses the merge tag and offers an opt-out", () => {
    expect(DEFAULT_MESSAGE).toContain("{{first_name}}");
    expect(DEFAULT_MESSAGE).toMatch(/STOP/);
  });
});

describe("leadPayload", () => {
  it("trims and drops blank optional fields (the email schema rejects empty strings)", () => {
    expect(leadPayload({ phone: " 0300 1234567 ", name: " Ayesha ", email: " ", profession: "", note: "wants fees" })).toEqual({
      phone: "0300 1234567",
      name: "Ayesha",
      note: "wants fees",
    });
  });
});

describe("recentlySent", () => {
  it("is true when a sent row is within 24 hours", () => {
    expect(recentlySent([{ id: "1", kind: "sent", body: null, agent_name: null, created_at: plus(-3600) }], NOW)).toBe(true);
    expect(recentlySent([{ id: "1", kind: "sent", body: null, agent_name: null, created_at: plus(-90_000) }], NOW)).toBe(false);
    expect(recentlySent([{ id: "1", kind: "note", body: "x", agent_name: null, created_at: plus(-60) }], NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-ui.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/crm/sales-ui.ts`**

```ts
// Client-safe helpers for the Sales Workspace screens. Pure: no I/O, `now` injected.
// Never import server-only modules here; components import this file.
import type { OutcomeKind } from "@/lib/crm/followup";
import { formatDateTime, formatTime } from "@/lib/format";

/* Types listed in the plan's Interfaces block go here verbatim:
   BudgetJson, AgentBudgetJson, QueueCardJson, ContactRowJson, TimelineEntryJson,
   ContactDetailJson, TemplateJson, SendOkJson, ApiErrorJson, SendLock. */

const DAY_MS = 86_400_000;

export const DEFAULT_MESSAGE =
  "Hi {{first_name}}, this is PZ Academy. You asked us about our courses. Is now a good time to share the details? Reply STOP if you would rather not hear from us.";

export const OUTCOME_BUTTONS: readonly { kind: OutcomeKind; label: string }[] = [
  { kind: "replied", label: "Replied" },
  { kind: "interested", label: "Interested" },
  { kind: "bought", label: "Bought" },
  { kind: "not_interested", label: "Not interested" },
];

const left = (b: BudgetJson) => b.dailyCap - b.dailyUsed;

export function pickDefaultNumber(budgets: AgentBudgetJson[]): string | null {
  if (budgets.length === 0) return null;
  const open = budgets.filter((b) => !b.budget.frozen);
  const pool = open.length > 0 ? open : budgets;
  return [...pool].sort((a, b) => left(b.budget) - left(a.budget) || a.number.label.localeCompare(b.number.label))[0]
    .number.id;
}

export function secondsUntil(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now.getTime()) / 1000));
}

export function formatWait(seconds: number, untilIso: string): string {
  if (seconds <= 120) return `in ${seconds}s`;
  if (seconds < 3600) return `in ${Math.ceil(seconds / 60)} min`;
  return `at ${formatTime(untilIso)}`;
}

export function sendLock(input: {
  budgets: AgentBudgetJson[] | null;
  selected: AgentBudgetJson | null;
  warm: boolean;
  now: Date;
}): SendLock {
  const { budgets, selected, warm, now } = input;
  if (budgets === null) return { kind: "loading" };
  if (budgets.length === 0 || !selected) return { kind: "no-number" };
  const b = selected.budget;
  if (b.frozen) return { kind: "frozen", until: b.frozenUntil };
  if (b.quietHours) return { kind: "quiet", until: b.quietEndsAt };
  if (b.nextUnlockAt && Date.parse(b.nextUnlockAt) > now.getTime()) return { kind: "wait", until: b.nextUnlockAt };
  if (!warm && b.dailyUsed >= b.dailyCap) return { kind: "daily-cap" };
  if (!warm && b.hourlyUsed >= b.hourlyCap) return { kind: "hourly-cap" };
  return { kind: "ready" };
}

export function lockCopy(lock: SendLock, now: Date): { button: string; detail: string | null } {
  switch (lock.kind) {
    case "loading":
      return { button: "Checking your limits…", detail: null };
    case "ready":
      return { button: "Message on WhatsApp", detail: null };
    case "no-number":
      return {
        button: "No WhatsApp number yet",
        detail: "Ask your admin to give you a WhatsApp number. You cannot send until then.",
      };
    case "frozen":
      return {
        button: "This number is paused",
        detail: lock.until
          ? `Paused until ${formatDateTime(lock.until)}. Ask your admin if you need it sooner.`
          : "Your admin paused this number. Ask them when it will be back.",
      };
    case "quiet":
      return {
        button: "Paused overnight",
        detail: lock.until ? `Messaging opens again at ${formatTime(lock.until)}.` : "Messaging is paused overnight.",
      };
    case "wait": {
      const s = secondsUntil(lock.until, now);
      return {
        button: `Next message unlocks ${formatWait(s, lock.until)}`,
        detail:
          s > 240
            ? "Break time. After a run of messages the app pauses for a few minutes."
            : "The app leaves a gap between messages so your sending looks less like a bulk sender.",
      };
    }
    case "daily-cap":
      return {
        button: "Today's new chats are used up",
        detail: "You can still message people who already replied. New chats open again tomorrow morning.",
      };
    case "hourly-cap":
      return {
        button: "This hour's new chats are used up",
        detail: "Take a short break. New chats open again within the hour.",
      };
  }
}

export function budgetLine(b: BudgetJson): string {
  return `${b.dailyUsed} of ${b.dailyCap} new chats used today`;
}

export function hourLine(b: BudgetJson): string {
  return `${b.hourlyUsed} of ${b.hourlyCap} this hour`;
}

export function explainSendError(body: ApiErrorJson | null, now: Date): string {
  const base = body?.error ?? "Could not send this message.";
  if (!body?.retryAt) return base;
  return `${base} Try again ${formatWait(secondsUntil(body.retryAt, now), body.retryAt)}.`;
}

const ACTIVITY_LABELS: Record<string, string> = {
  sent: "Messaged on WhatsApp",
  replied: "Replied",
  interested: "Interested",
  bought: "Bought",
  not_interested: "Not interested",
  note: "Note",
  claimed: "Claimed",
  reassigned: "Assigned by admin",
  released: "Released to unclaimed",
};

export function activityLabel(kind: string): string {
  return ACTIVITY_LABELS[kind] ?? kind;
}

export function outcomeLabel(lastOutcome: string | null): string {
  return OUTCOME_BUTTONS.find((o) => o.kind === lastOutcome)?.label ?? "New";
}

export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function leadPayload(f: { phone: string; name: string; email: string; profession: string; note: string }): Record<string, string> {
  const out: Record<string, string> = { phone: f.phone.trim() };
  for (const key of ["name", "email", "profession", "note"] as const) {
    const v = f[key].trim();
    if (v) out[key] = v;
  }
  return out;
}

export function recentlySent(timeline: TimelineEntryJson[], now: Date): boolean {
  return timeline.some((t) => t.kind === "sent" && now.getTime() - Date.parse(t.created_at) < DAY_MS);
}
```

(Write the type block from the Interfaces list in place of the comment; every type is exported.)

- [ ] **Step 4: Run to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-ui.test.ts`
Expected: PASS.
Run: `node node_modules/typescript/bin/tsc --noEmit` -> no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/sales-ui.ts tests/sales-ui.test.ts
git commit -m "feat(sales): client-safe helpers for send locks, countdowns and labels

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sales shell: nav, layout, shared budget bar and panic button, UI guard tests

**Files:**
- Modify: `src/components/dashboard/nav.ts`
- Modify: `tests/dashboard-nav.test.ts`
- Create: `src/app/dashboard/sales/layout.tsx`
- Create: `src/components/sales/SalesBudgetProvider.tsx`
- Create: `src/components/sales/BudgetBar.tsx`
- Create: `src/components/sales/PanicButton.tsx`
- Create: `src/components/sales/useNow.ts`
- Create: `tests/sales-ui-guards.test.ts`
- Create: `tests/sales-shell-components.test.tsx`

**Interfaces:**
- Consumes: Task 7 types and `pickDefaultNumber`, `budgetLine`, `hourLine`, `lockCopy`, `sendLock`; `GET /api/sales/budget` -> `{ budgets: AgentBudgetJson[] }`; `POST /api/sales/numbers/[id]/freeze` -> `{ ok: true, changed: true, frozenUntil: string } | { ok: true, changed: false, frozenUntil: null, alreadyFrozen: "indefinitely" } | { error, reason }`.
- Produces:
  - `export type SalesBudgetValue = { budgets: AgentBudgetJson[] | null; loadError: boolean; selectedId: string | null; selected: AgentBudgetJson | null; select(id: string): void; refresh(): Promise<void>; applyBudget(numberId: string, budget: BudgetJson): void }`
  - `export const SalesBudgetContext: React.Context<SalesBudgetValue | null>`
  - `export function SalesBudgetProvider({ children }: { children: React.ReactNode })`
  - `export function useSalesBudget(): SalesBudgetValue` (throws outside the provider)
  - `export function BudgetBar()` (no props), `export function PanicButton({ className }: { className?: string })`
  - `export function useNow(intervalMs?: number): Date` (ticks every second by default)
  - Nav hrefs: `/dashboard/sales`, `/dashboard/sales/contacts`, `/dashboard/sales/add-lead`, `/dashboard/sales/help`; admin `/dashboard/admin/sales-safety`.
  - `src/app/dashboard/sales/layout.tsx` renders `<WelcomeTour role={role} metadataSeen={...} />` from Task 14. Until Task 14 lands, this task leaves that line out; Task 14 adds it.

- [ ] **Step 1: Write the failing tests**

In `tests/dashboard-nav.test.ts` replace the sales test with:

```ts
it("sales_agent sees Today, Contacts, Add lead, Help, then alerts and settings, nothing under /dashboard/admin", () => {
  const items = navForRole("sales_agent");
  expect(items.map((i) => i.href)).toEqual([
    "/dashboard/sales",
    "/dashboard/sales/contacts",
    "/dashboard/sales/add-lead",
    "/dashboard/sales/help",
    "/dashboard/notifications",
    "/dashboard/settings",
  ]);
  const { bar } = splitMobileNav(items, undefined);
  expect(bar.map((i) => i.shortLabel ?? i.label)).toEqual(["Today", "Contacts", "Add lead", "Help"]);
  expect(items.some((i) => i.href.startsWith("/dashboard/admin"))).toBe(false);
  expect(activeHrefFor(items, "/dashboard/sales/contacts")).toBe("/dashboard/sales/contacts");
});

it("admins get the WhatsApp Safety page, others do not", () => {
  expect(navForRole("admin").map((i) => i.href)).toContain("/dashboard/admin/sales-safety");
  expect(navForRole("super_admin").map((i) => i.href)).toContain("/dashboard/admin/sales-safety");
  expect(navForRole("sales_agent").map((i) => i.href)).not.toContain("/dashboard/admin/sales-safety");
});
```

Create `tests/sales-ui-guards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(n) ? [p] : [];
  });
}
const files = [
  ...walk(join(ROOT, "src", "components", "sales")),
  ...walk(join(ROOT, "src", "app", "dashboard", "sales")),
  ...walk(join(ROOT, "src", "app", "dashboard", "admin", "sales-safety")),
  ...walk(join(ROOT, "src", "components", "admin", "sales")).filter((f) => !f.endsWith("SalesTeamPanel.tsx")),
  ...["sales-ui.ts", "sales-admin-ui.ts", "sales-help-copy.ts"]
    .map((n) => join(ROOT, "src", "lib", "crm", n))
    .filter(existsSync),
];
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");

describe("sales UI guards", () => {
  it("no raw colours: hex, rgb(), white/black utilities", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/);
      expect(src, rel(f)).not.toMatch(/rgba?\(/);
      expect(src, rel(f)).not.toMatch(/\b(?:bg|text|border)-(?:white|black)\b/);
    }
  });

  it("Stitch tokens always carry the pz- prefix", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(
        /(?<![\w-])(?:bg|text|border|ring|fill|from|to|divide)-(?:primary|secondary|tertiary|surface|on-|outline|error|inverse|background)/,
      );
    }
  });

  it("adaptive text tokens are never used as backgrounds", () => {
    for (const f of files) {
      expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/\bbg-pz-(?:deep|forest|mid|pine|sage|danger)\b/);
    }
  });

  it("no Material Symbols and no arbitrary radii (repo radii decision D7)", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toContain("material-symbols");
      expect(src, rel(f)).not.toMatch(/rounded(?:-[a-z]+)?-\[/);
    }
  });

  it("copy never promises safety", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toMatch(/\bsafe\b(?!-area)/i);
      expect(src, rel(f)).not.toMatch(/\bsafely\b|guarantee|anti-ban|risk score|100%/i);
    }
  });
});
```

Create `tests/sales-shell-components.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetProvider } from "@/components/sales/SalesBudgetProvider";
import { BudgetBar } from "@/components/sales/BudgetBar";
import type { AgentBudgetJson, BudgetJson } from "@/lib/crm/sales-ui";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const budget = (over: Partial<BudgetJson> = {}): BudgetJson => ({
  dailyUsed: 12, dailyCap: 60, hourlyUsed: 2, hourlyCap: 20, hourlyWarning: false,
  quietHours: false, quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null, ...over,
});
const num = (id: string, label: string, b = budget()): AgentBudgetJson => ({ number: { id, label, phone_e164: null }, budget: b });

function mockFetch(budgets: AgentBudgetJson[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/sales/budget")) return { ok: true, json: async () => ({ budgets }) };
    if (url.includes("/freeze")) return { ok: true, json: async () => ({ ok: true, changed: true, frozenUntil: "2026-10-07T10:00:00.000Z" }) };
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderBar = () =>
  render(
    <ConfirmProvider>
      <SalesBudgetProvider>
        <BudgetBar />
      </SalesBudgetProvider>
    </ConfirmProvider>,
  );

describe("BudgetBar", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("shows the visible budget for the preselected number (most left)", async () => {
    mockFetch([num("a", "Shared 1", budget({ dailyUsed: 50 })), num("b", "My phone", budget({ dailyUsed: 12 }))]);
    renderBar();
    expect(await screen.findByText("12 of 60 new chats used today")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /send from/i })).toBeTruthy();
  });

  it("explains when the agent has no number", async () => {
    mockFetch([]);
    renderBar();
    expect(await screen.findByText(/no whatsapp number yet/i)).toBeTruthy();
  });

  it("the panic button names the selected number and freezes only that one", async () => {
    const fetchMock = mockFetch([num("a", "Shared 1", budget({ dailyUsed: 50 })), num("b", "My phone")]);
    renderBar();
    fireEvent.click(await screen.findByRole("button", { name: /my whatsapp warns or restricts me/i }));
    expect(await screen.findByText("Pause My phone?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause this number" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/sales/numbers/b/freeze", expect.objectContaining({ method: "POST" })),
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/dashboard-nav.test.ts tests/sales-ui-guards.test.ts tests/sales-shell-components.test.tsx`
Expected: FAIL (nav expectations; component modules missing). The guard test passes vacuously on existing files until components exist; that is fine.

- [ ] **Step 3: Implement**

`src/components/dashboard/nav.ts`: add `Users, LifeBuoy, ShieldCheck` to the lucide import; replace the single `Today` entry with:

```ts
  { label: "Today", href: "/dashboard/sales", icon: ClipboardList, roles: ["sales_agent"] },
  { label: "My Contacts", shortLabel: "Contacts", href: "/dashboard/sales/contacts", icon: Users, roles: ["sales_agent"] },
  { label: "Add a Lead", shortLabel: "Add lead", href: "/dashboard/sales/add-lead", icon: UserPlus, roles: ["sales_agent"] },
  { label: "Help & Safety", shortLabel: "Help", href: "/dashboard/sales/help", icon: LifeBuoy, roles: ["sales_agent"] },
```

and after the `Sales Team` entry:

```ts
  { label: "WhatsApp Safety", shortLabel: "Safety", href: "/dashboard/admin/sales-safety", icon: ShieldCheck, roles: ["admin", "super_admin"] },
```

`src/components/sales/useNow.ts`:

```ts
"use client";
import { useEffect, useState } from "react";

/** Current time, re-rendered every `intervalMs` (drives countdowns). */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
```

`src/components/sales/SalesBudgetProvider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { pickDefaultNumber, type AgentBudgetJson, type BudgetJson } from "@/lib/crm/sales-ui";

export type SalesBudgetValue = {
  budgets: AgentBudgetJson[] | null;
  loadError: boolean;
  selectedId: string | null;
  selected: AgentBudgetJson | null;
  select: (id: string) => void;
  refresh: () => Promise<void>;
  applyBudget: (numberId: string, budget: BudgetJson) => void;
};

export const SalesBudgetContext = createContext<SalesBudgetValue | null>(null);

const POLL_MS = 60_000;

export function SalesBudgetProvider({ children }: { children: React.ReactNode }) {
  const [budgets, setBudgets] = useState<AgentBudgetJson[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/budget", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { budgets: AgentBudgetJson[] };
      setBudgets(data.budgets);
      setLoadError(false);
      setSelectedId((cur) => (cur && data.budgets.some((b) => b.number.id === cur) ? cur : pickDefaultNumber(data.budgets)));
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const applyBudget = useCallback((numberId: string, budget: BudgetJson) => {
    setBudgets((cur) => cur?.map((b) => (b.number.id === numberId ? { ...b, budget } : b)) ?? cur);
  }, []);

  const value = useMemo<SalesBudgetValue>(
    () => ({
      budgets,
      loadError,
      selectedId,
      selected: budgets?.find((b) => b.number.id === selectedId) ?? null,
      select: setSelectedId,
      refresh,
      applyBudget,
    }),
    [budgets, loadError, selectedId, refresh, applyBudget],
  );
  return <SalesBudgetContext.Provider value={value}>{children}</SalesBudgetContext.Provider>;
}

export function useSalesBudget(): SalesBudgetValue {
  const ctx = useContext(SalesBudgetContext);
  if (!ctx) throw new Error("useSalesBudget must be used inside <SalesBudgetProvider>");
  return ctx;
}
```

`src/components/sales/PanicButton.tsx`:

```tsx
"use client";

import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSalesBudget } from "./SalesBudgetProvider";

export function PanicButton({ className }: { className?: string }) {
  const { selected, refresh } = useSalesBudget();
  const confirm = useConfirm();
  const { run, pending } = useAsyncAction(async () => {
    if (!selected) return;
    const ok = await confirm({
      title: `Pause ${selected.number.label}?`,
      description:
        "Use this if WhatsApp shows a warning, asks you to verify, or limits your account. Sending from this number stops for everyone who uses it (48 hours unless your admin changed it), and your admin is told. Please also stop messaging new people from this phone outside the app.",
      confirmLabel: "Pause this number",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/sales/numbers/${selected.number.id}/freeze`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { changed?: boolean; frozenUntil?: string | null; error?: string }
        | null;
      if (!res.ok) {
        toast.error(body?.error ?? "Could not pause this number.");
        return;
      }
      toast.success(
        body?.changed === false || !body?.frozenUntil
          ? "This number was already paused by your admin."
          : `Paused until ${formatDateTime(body.frozenUntil)}. Your admin has been told.`,
      );
      await refresh();
    } catch {
      toast.error("Could not pause this number.");
    }
  });
  if (!selected) return null;
  return (
    <Button
      type="button"
      variant="bare"
      size="bare"
      loading={pending}
      onClick={() => void run()}
      className={cn(
        "gap-2 px-3.5 py-2 max-md:min-h-11 rounded-lg bg-pz-error-container text-pz-on-error-container font-headline text-xs font-bold hover:shadow-sm transition-all",
        className,
      )}
    >
      <TriangleAlert className="w-4 h-4" />
      My WhatsApp warns or restricts me
    </Button>
  );
}
```

`src/components/sales/BudgetBar.tsx` (port the meter blocks of `today-queue-desktop.html` header, "Right: Real-time WhatsApp Meters" and the number switcher chip; drop "Anti-Ban Shield Active", "Pacing healthy", "Safe window", "Amber at 15 • Red at 20"):

```tsx
"use client";

import { Snowflake, Moon } from "lucide-react";
import { budgetLine, hourLine } from "@/lib/crm/sales-ui";
import { formatDateTime, formatTime } from "@/lib/format";
import { useSalesBudget } from "./SalesBudgetProvider";
import { PanicButton } from "./PanicButton";

const pct = (used: number, cap: number) => (cap <= 0 ? 100 : Math.min(100, Math.round((used / cap) * 100)));

export function BudgetBar() {
  const { budgets, loadError, selected, select } = useSalesBudget();

  if (budgets === null) {
    return (
      <div className="h-20 rounded-xl bg-pz-surface-container-low animate-pulse" aria-hidden="true" />
    );
  }
  if (budgets.length === 0) {
    return (
      <section className="bg-pz-surface-container-lowest rounded-xl p-4 shadow-sm font-body text-sm text-pz-on-surface">
        You have no WhatsApp number yet. Ask your admin to give you one before you start messaging.
      </section>
    );
  }
  if (!selected) return null;
  const b = selected.budget;

  return (
    <section
      aria-label="Your sending budget"
      className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 font-body"
    >
      <div className="flex flex-col gap-2 min-w-0">
        {budgets.length > 1 ? (
          <label className="inline-flex items-center gap-2 text-xs font-headline font-medium text-pz-on-surface">
            <span>Send from</span>
            <select
              aria-label="Send from"
              value={selected.number.id}
              onChange={(e) => select(e.target.value)}
              className="bg-pz-surface-container-low rounded-lg px-3 py-1.5 max-md:min-h-11 text-sm font-body text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
            >
              {budgets.map((n) => (
                <option key={n.number.id} value={n.number.id}>
                  {n.number.label} ({n.budget.dailyCap - n.budget.dailyUsed} left today{n.budget.frozen ? ", paused" : ""})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-xs font-headline font-medium text-pz-on-surface">
            Using: <strong className="font-semibold">{selected.number.label}</strong>
            {selected.number.phone_e164 ? ` (${selected.number.phone_e164})` : ""}
          </span>
        )}
        {b.frozen && (
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-pz-academy-error">
            <Snowflake className="w-4 h-4" />
            {b.frozenUntil ? `Paused until ${formatDateTime(b.frozenUntil)}` : "Paused by your admin"}
          </p>
        )}
        {!b.frozen && b.quietHours && (
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-pz-on-surface-variant">
            <Moon className="w-4 h-4" />
            Paused overnight{b.quietEndsAt ? `, opens at ${formatTime(b.quietEndsAt)}` : ""}
          </p>
        )}
        {loadError && <p className="text-xs text-pz-academy-error">Could not refresh your budget. Showing the last known numbers.</p>}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
        <div className="bg-pz-surface-container-low rounded-lg p-3.5 flex flex-col gap-2 sm:min-w-[220px]">
          <span className="text-xs font-headline font-bold text-pz-on-surface">{budgetLine(b)}</span>
          <div className="w-full h-2 bg-pz-surface-container-highest rounded-full overflow-hidden">
            <div className="h-full bg-pz-primary rounded-full transition-all duration-500" style={{ width: `${pct(b.dailyUsed, b.dailyCap)}%` }} />
          </div>
        </div>
        <div className="bg-pz-surface-container-low rounded-lg p-3.5 flex flex-col gap-2 sm:min-w-[200px]">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-headline font-bold text-pz-on-surface">{hourLine(b)}</span>
            {b.hourlyWarning && (
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-pz-secondary-container text-pz-on-secondary-container">
                Slow down
              </span>
            )}
          </div>
          <div className="w-full h-2 bg-pz-surface-container-highest rounded-full overflow-hidden">
            <div
              className={b.hourlyWarning ? "h-full bg-pz-secondary rounded-full" : "h-full bg-pz-primary-container rounded-full"}
              style={{ width: `${pct(b.hourlyUsed, b.hourlyCap)}%` }}
            />
          </div>
        </div>
        <PanicButton />
      </div>
    </section>
  );
}
```

(`sm:min-w-[220px]` is an arbitrary width, not radius or colour; allowed.)

`src/app/dashboard/sales/layout.tsx`:

```tsx
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { SalesBudgetProvider } from "@/components/sales/SalesBudgetProvider";
import { BudgetBar } from "@/components/sales/BudgetBar";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  await requireSalesAgentPage();
  return (
    <SalesBudgetProvider>
      <div className="space-y-6 font-body">
        <BudgetBar />
        {children}
      </div>
    </SalesBudgetProvider>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/dashboard-nav.test.ts tests/sales-ui-guards.test.ts tests/sales-shell-components.test.tsx tests/sales-shell.test.ts`
Expected: PASS.
Run: `node node_modules/typescript/bin/tsc --noEmit` and the lint command from Global Constraints -> clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/nav.ts tests/dashboard-nav.test.ts src/app/dashboard/sales/layout.tsx src/components/sales/SalesBudgetProvider.tsx src/components/sales/BudgetBar.tsx src/components/sales/PanicButton.tsx src/components/sales/useNow.ts tests/sales-ui-guards.test.ts tests/sales-shell-components.test.tsx
git commit -m "feat(sales): workspace shell with nav, shared budget bar and panic button

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The send panel and outcome buttons (shared by Today and My Contacts)

**Files:**
- Create: `src/components/sales/SendPanel.tsx`
- Create: `src/components/sales/OutcomeButtons.tsx`
- Create: `src/components/sales/NotInterestedDialog.tsx`
- Create: `tests/sales-send-panel.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`FOLLOWUP_CHOICES`, `DEFAULT_FOLLOWUP_HOURS`, `followupLabel`, type `FollowupHours`), Task 7 (`sendLock`, `lockCopy`, `explainSendError`, `OUTCOME_BUTTONS`, `DEFAULT_MESSAGE`, `TemplateJson`, `SendOkJson`, `ApiErrorJson`), Task 8 (`useSalesBudget`, `useNow`), `renderWhatsAppMessage(template, fullName)` from `@/lib/crm/whatsapp-link` (client-safe), routes `POST /api/sales/contacts/[id]/send` (body `{ numberId, messageTemplate, followupInHours }`, hours one of 8 / 24 / 48 / 72), `POST /api/sales/contacts/[id]/outcome` (body `{ kind, askedToStop? }` -> `{ ok, nextFollowupAt }`), `POST /api/sales/contacts/[id]/note` (body `{ body }` -> 201).
- Produces:

```ts
export type SendPanelContact = { id: string; full_name: string; phone_e164: string | null; warm: boolean; recently_contacted: boolean };
export function SendPanel(props: {
  contact: SendPanelContact;
  templates: TemplateJson[];
  onSent?: (contactId: string) => void;
  onOutcome: (contactId: string, kind: OutcomeKind, nextFollowupAt: string | null) => void;
  onNoteSaved?: (contactId: string) => void;
  openLink?: (url: string) => void; // default: window.location.assign
}): JSX.Element;
export function OutcomeButtons(props: {
  contactId: string;
  onLogged: (kind: OutcomeKind, nextFollowupAt: string | null) => void;
  disabled?: boolean;
}): JSX.Element;
export function NotInterestedDialog(props: {
  open: boolean;
  onChoose: (choice: "stop" | "not-interested") => void;
  onCancel: () => void;
}): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

Create `tests/sales-send-panel.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { SendPanel } from "@/components/sales/SendPanel";
import type { AgentBudgetJson, BudgetJson } from "@/lib/crm/sales-ui";
import { toast } from "sonner";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const budget = (over: Partial<BudgetJson> = {}): BudgetJson => ({
  dailyUsed: 12, dailyCap: 60, hourlyUsed: 2, hourlyCap: 20, hourlyWarning: false,
  quietHours: false, quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null, ...over,
});
const num = (b = budget()): AgentBudgetJson => ({ number: { id: "n1", label: "My phone", phone_e164: null }, budget: b });
const contact = { id: "c1", full_name: "Ayesha Tariq", phone_e164: "+923001234567", warm: false, recently_contacted: false };

function setup(budgets: AgentBudgetJson[] | null, extra: Partial<SalesBudgetValue> = {}) {
  const value: SalesBudgetValue = {
    budgets,
    loadError: false,
    selectedId: budgets?.[0]?.number.id ?? null,
    selected: budgets?.[0] ?? null,
    select: vi.fn(),
    refresh: vi.fn(async () => {}),
    applyBudget: vi.fn(),
    ...extra,
  };
  const onOutcome = vi.fn();
  const openLink = vi.fn();
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={value}>
        <SendPanel contact={contact} templates={[]} onOutcome={onOutcome} openLink={openLink} />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );
  return { onOutcome, openLink, value };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.unstubAllGlobals();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/send")) {
      return { ok: true, json: async () => ({ link: "whatsapp://send?phone=923001234567&text=hi", nextUnlockAt: new Date(Date.now() + 90_000).toISOString(), warnings: [], isNewChat: true, budget: budget({ dailyUsed: 13 }) }) };
    }
    if (url.endsWith("/outcome")) return { ok: true, json: async () => ({ ok: true, nextFollowupAt: null, echo: init?.body }) };
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

describe("SendPanel", () => {
  it("sends from the selected number with the edited message and opens WhatsApp", async () => {
    const { openLink, value } = setup([num()]);
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(openLink).toHaveBeenCalledWith("whatsapp://send?phone=923001234567&text=hi"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/sales/contacts/c1/send");
    expect(JSON.parse(init.body)).toEqual({ numberId: "n1", messageTemplate: expect.stringContaining("{{first_name}}"), followupInHours: 24 });
    expect(value.applyBudget).toHaveBeenCalledWith("n1", expect.objectContaining({ dailyUsed: 13 }));
  });

  it("offers 'Bring them back in' chips with 1 day chosen, and sends the chosen hours", async () => {
    setup([num()]);
    const group = screen.getByRole("group", { name: "Bring them back in" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["8 hours", "1 day", "2 days", "3 days"]);
    expect(screen.getByRole("button", { name: "1 day" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "3 days" }));
    expect(screen.getByRole("button", { name: "3 days" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "1 day" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).followupInHours).toBe(72);
    expect((await screen.findByRole("status")).textContent).toContain("3 days");
    // The choice is spent once the message is sent.
    expect((screen.getByRole("button", { name: "8 hours" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("two fast taps request only one send", async () => {
    setup([num()]);
    const btn = screen.getByRole("button", { name: "Message on WhatsApp" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("is locked with an explanation when the agent has no number", () => {
    setup([]);
    const btn = screen.getByRole("button", { name: "No WhatsApp number yet" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/ask your admin/i)).toBeTruthy();
  });

  it("shows the countdown while spacing is running", () => {
    setup([num(budget({ nextUnlockAt: new Date(Date.now() + 74_000).toISOString() }))]);
    expect(screen.getByRole("button", { name: /^Next message unlocks in 7[34]s$/ })).toBeTruthy();
  });

  it("a server refusal shows when to try again and refreshes the budget", async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      json: async () => ({ error: "That is the limit for this hour. Take a short break.", reason: "hourly_cap", retryAt: new Date(Date.now() + 600_000).toISOString() }),
    }));
    const { value } = setup([num()]);
    fireEvent.click(screen.getByRole("button", { name: "Message on WhatsApp" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Try again in 10 min\.$/)));
    expect(value.refresh).toHaveBeenCalled();
  });
});

describe("Not interested", () => {
  it("Escape logs nothing", async () => {
    setup([num()]);
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("'They asked me to stop' sends askedToStop", async () => {
    const { onOutcome } = setup([num()]);
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(await screen.findByRole("button", { name: "They asked me to stop" }));
    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith("c1", "not_interested", null));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/sales/contacts/c1/outcome");
    expect(JSON.parse(init.body)).toEqual({ kind: "not_interested", askedToStop: true });
  });

  it("'Just not interested' does not mark do-not-contact", async () => {
    setup([num()]);
    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));
    fireEvent.click(await screen.findByRole("button", { name: "Just not interested" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ kind: "not_interested" });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-send-panel.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/components/sales/NotInterestedDialog.tsx`:

```tsx
"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function NotInterestedDialog({
  open,
  onChoose,
  onCancel,
}: {
  open: boolean;
  onChoose: (choice: "stop" | "not-interested") => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md font-body">
        <DialogTitle className="pr-8 font-headline text-lg text-pz-on-surface">Did they ask you to stop messaging them?</DialogTitle>
        <DialogDescription className="text-pz-on-surface-variant">
          If they asked you to stop, nobody will be able to message them again from the app.
        </DialogDescription>
        <div className="flex flex-col gap-2 pt-2">
          <Button type="button" variant="bare" size="bare" onClick={() => onChoose("stop")}
            className="w-full min-h-11 px-4 rounded-lg bg-pz-error-container text-pz-on-error-container font-headline font-bold text-sm">
            They asked me to stop
          </Button>
          <Button type="button" variant="bare" size="bare" onClick={() => onChoose("not-interested")}
            className="w-full min-h-11 px-4 rounded-lg bg-pz-surface-container-low text-pz-on-surface font-headline font-semibold text-sm">
            Just not interested
          </Button>
          <Button type="button" variant="bare" size="bare" onClick={onCancel}
            className="w-full min-h-11 px-4 rounded-lg text-pz-on-surface-variant font-headline text-sm">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

`src/components/sales/OutcomeButtons.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Star, PartyPopper, X } from "lucide-react";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { OUTCOME_BUTTONS } from "@/lib/crm/sales-ui";
import type { OutcomeKind } from "@/lib/crm/followup";
import { NotInterestedDialog } from "./NotInterestedDialog";

const ICONS = { replied: MessageCircle, interested: Star, bought: PartyPopper, not_interested: X } as const;
// Hover pairs ported 1:1 from the Stitch outcome pills (today-queue-desktop.html, "Quick Outcome Logger Pills").
const HOVER: Record<OutcomeKind, string> = {
  replied: "hover:bg-pz-primary-container hover:text-pz-on-primary-container",
  interested: "hover:bg-pz-secondary-fixed hover:text-pz-on-secondary-fixed",
  bought: "hover:bg-pz-tertiary-fixed hover:text-pz-on-tertiary-fixed",
  not_interested: "hover:bg-pz-error-container hover:text-pz-on-error-container",
};
const DONE: Record<OutcomeKind, string> = {
  replied: "Saved. They come back to your list tomorrow.",
  interested: "Saved. They come back to your list in 2 days.",
  bought: "Saved. Well done!",
  not_interested: "Saved. They leave your list.",
};

export function OutcomeButtons({
  contactId,
  onLogged,
  disabled,
}: {
  contactId: string;
  onLogged: (kind: OutcomeKind, nextFollowupAt: string | null) => void;
  disabled?: boolean;
}) {
  const [askOpen, setAskOpen] = useState(false);
  const { run: log, pending } = useAsyncAction(async (kind: OutcomeKind, askedToStop?: boolean) => {
    try {
      const res = await fetch(`/api/sales/contacts/${contactId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(askedToStop ? { kind, askedToStop: true } : { kind }),
      });
      const body = (await res.json().catch(() => null)) as { nextFollowupAt?: string | null; error?: string } | null;
      if (!res.ok) {
        toast.error(body?.error ?? "Could not save that.");
        return;
      }
      toast.success(askedToStop ? "Saved. They will not be messaged again." : DONE[kind]);
      onLogged(kind, body?.nextFollowupAt ?? null);
    } catch {
      toast.error("Could not save that.");
    }
  });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-headline font-semibold text-pz-on-surface-variant">What happened?</span>
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        {OUTCOME_BUTTONS.map(({ kind, label }) => {
          const Icon = ICONS[kind];
          return (
            <button
              key={kind}
              type="button"
              disabled={disabled || pending}
              onClick={() => (kind === "not_interested" ? setAskOpen(true) : void log(kind))}
              className={`min-h-11 px-3.5 py-2 rounded-lg bg-pz-surface-container-low text-xs font-headline font-semibold text-pz-on-surface transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 ${HOVER[kind]}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
      <NotInterestedDialog
        open={askOpen}
        onCancel={() => setAskOpen(false)}
        onChoose={(choice) => {
          setAskOpen(false);
          void log("not_interested", choice === "stop");
        }}
      />
    </div>
  );
}
```

`src/components/sales/SendPanel.tsx` (port "WhatsApp Direct Action Box" from `today-queue-desktop.html`: header row, "Message Template" select, "Live Preview" bubble, the big `h-14 rounded-xl bg-primary` button, outcome pills, "Agent Notes" textarea; drop "Compose WhatsApp Dispatch" title -> "Message", drop "Safe buffer: Pacing shield verified", "0 delays", "Auto-personalized", "Auto-saves to student CRM"):

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { renderWhatsAppMessage } from "@/lib/crm/whatsapp-link";
import {
  DEFAULT_MESSAGE,
  explainSendError,
  lockCopy,
  sendLock,
  type ApiErrorJson,
  type SendOkJson,
  type TemplateJson,
} from "@/lib/crm/sales-ui";
import {
  DEFAULT_FOLLOWUP_HOURS,
  FOLLOWUP_CHOICES,
  followupLabel,
  type FollowupHours,
  type OutcomeKind,
} from "@/lib/crm/followup";
import { useSalesBudget } from "./SalesBudgetProvider";
import { useNow } from "./useNow";
import { OutcomeButtons } from "./OutcomeButtons";

export type SendPanelContact = { id: string; full_name: string; phone_e164: string | null; warm: boolean; recently_contacted: boolean };

const defaultOpen = (url: string) => window.location.assign(url);

export function SendPanel({
  contact,
  templates,
  onSent,
  onOutcome,
  onNoteSaved,
  openLink = defaultOpen,
}: {
  contact: SendPanelContact;
  templates: TemplateJson[];
  onSent?: (contactId: string) => void;
  onOutcome: (contactId: string, kind: OutcomeKind, nextFollowupAt: string | null) => void;
  onNoteSaved?: (contactId: string) => void;
  openLink?: (url: string) => void;
}) {
  const { budgets, selected, refresh, applyBudget } = useSalesBudget();
  const now = useNow();
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [message, setMessage] = useState<string>(templates[0]?.body ?? DEFAULT_MESSAGE);
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState("");
  // The person decides when this contact comes back to Today if they do not answer (decision D1).
  const [followupHours, setFollowupHours] = useState<FollowupHours>(DEFAULT_FOLLOWUP_HOURS);

  // A new contact resets the panel.
  useEffect(() => {
    setSent(false);
    setNote("");
    setFollowupHours(DEFAULT_FOLLOWUP_HOURS);
  }, [contact.id]);

  const lock = sendLock({ budgets, selected, warm: contact.warm, now });
  const copy = lockCopy(lock, now);
  const preview = useMemo(() => renderWhatsAppMessage(message, contact.full_name), [message, contact.full_name]);

  // When a pause or quiet hours ends, fetch fresh numbers once.
  const until = lock.kind === "frozen" || lock.kind === "quiet" ? lock.until : null;
  useEffect(() => {
    if (until && Date.parse(until) <= now.getTime()) void refresh();
  }, [until, now, refresh]);

  const { run: send, pending: sending } = useAsyncAction(async () => {
    if (!selected || lock.kind !== "ready") return;
    try {
      const res = await fetch(`/api/sales/contacts/${contact.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numberId: selected.number.id, messageTemplate: message, followupInHours: followupHours }),
      });
      const body = (await res.json().catch(() => null)) as SendOkJson | ApiErrorJson | null;
      if (!res.ok) {
        toast.error(explainSendError(body as ApiErrorJson | null, new Date()));
        await refresh();
        return;
      }
      const ok = body as SendOkJson;
      applyBudget(selected.number.id, ok.budget);
      for (const w of ok.warnings) toast.warning(w);
      setSent(true);
      onSent?.(contact.id);
      openLink(ok.link);
    } catch {
      toast.error("Could not send this message.");
    }
  });

  const { run: saveNote, pending: savingNote } = useAsyncAction(async () => {
    const body = note.trim();
    if (!body) return;
    try {
      const res = await fetch(`/api/sales/contacts/${contact.id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as ApiErrorJson | null;
        toast.error(err?.error ?? "Could not save the note.");
        return;
      }
      toast.success("Note saved.");
      setNote("");
      onNoteSaved?.(contact.id);
    } catch {
      toast.error("Could not save the note.");
    }
  });

  const locked = lock.kind !== "ready";

  return (
    <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-5 font-body">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-pz-primary" />
          <h3 className="text-base font-headline font-bold text-pz-on-surface">Message</h3>
        </div>
        {contact.recently_contacted && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-headline font-bold bg-pz-secondary-fixed text-pz-on-secondary-fixed">
            <Clock className="w-3.5 h-3.5" /> Messaged in the last 24 hours
          </span>
        )}
      </div>

      {templates.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`tpl-${contact.id}`} className="text-xs font-headline font-semibold text-pz-on-surface-variant">
            Saved message
          </label>
          <select
            id={`tpl-${contact.id}`}
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setMessage(templates.find((t) => t.id === e.target.value)?.body ?? DEFAULT_MESSAGE);
            }}
            className="w-full bg-pz-surface-container-low rounded-lg px-3.5 py-3 text-sm font-body text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
          >
            {/* "" keeps the select valid when templates arrive after the panel mounted (My Contacts loads them separately). */}
            <option value="">Default message</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`msg-${contact.id}`} className="text-xs font-headline font-semibold text-pz-on-surface-variant">
          Your message ({"{{first_name}}"} becomes their first name)
        </label>
        <textarea
          id={`msg-${contact.id}`}
          rows={4}
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-pz-surface-container-low text-pz-on-surface text-sm rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 resize-none font-body"
        />
        <span className="text-xs font-headline font-semibold text-pz-on-surface-variant">What they will see</span>
        <div className="bg-pz-surface-container-low rounded-xl p-4">
          <p className="bg-pz-surface-container-lowest rounded-lg p-4 shadow-sm text-sm text-pz-on-surface leading-relaxed whitespace-pre-wrap max-w-lg">
            {preview}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div role="group" aria-label="Bring them back in" className="flex flex-col gap-1.5">
          <span className="text-xs font-headline font-semibold text-pz-on-surface-variant">Bring them back in:</span>
          <div className="flex flex-wrap gap-2">
            {FOLLOWUP_CHOICES.map(({ hours, label }) => (
              <button
                key={hours}
                type="button"
                aria-pressed={followupHours === hours}
                disabled={sent || sending}
                onClick={() => setFollowupHours(hours)}
                className={`min-h-11 px-3.5 py-2 rounded-lg text-xs font-headline font-semibold transition-colors disabled:opacity-50 ${
                  followupHours === hours
                    ? "bg-pz-primary text-pz-on-primary"
                    : "bg-pz-surface-container-low text-pz-on-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="bare"
          size="bare"
          disabled={locked || sending}
          loading={sending}
          onClick={() => void send()}
          className="w-full h-14 rounded-xl bg-pz-primary hover:bg-pz-primary/95 text-pz-on-primary font-headline font-bold text-base flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.99] disabled:opacity-50"
        >
          <MessageCircle className="w-6 h-6" />
          {copy.button}
        </Button>
        {copy.detail && <p className="text-xs text-center text-pz-on-surface-variant">{copy.detail}</p>}
        {!locked && !copy.detail && (
          <p className="text-[11px] text-center text-pz-on-surface-variant">
            Opens WhatsApp with the message filled in. Check it, then press send in WhatsApp.
          </p>
        )}
        {sent && (
          <p role="status" className="text-xs text-center font-semibold text-pz-primary">
            Sent. They come back to your list in {followupLabel(followupHours)} if you hear nothing. When they answer, tap what happened below.
          </p>
        )}
      </div>

      <OutcomeButtons contactId={contact.id} onLogged={(kind, next) => onOutcome(contact.id, kind, next)} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`note-${contact.id}`} className="text-xs font-headline font-semibold text-pz-on-surface-variant">
          Note (your team can see it)
        </label>
        <textarea
          id={`note-${contact.id}`}
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Asked about weekend classes"
          className="w-full bg-pz-surface-container-low text-pz-on-surface text-sm rounded-lg p-3 placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 resize-none font-body"
        />
        <Button
          type="button"
          variant="bare"
          size="bare"
          disabled={note.trim().length === 0}
          loading={savingNote}
          onClick={() => void saveNote()}
          className="self-end px-4 py-2 max-md:min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-xs"
        >
          Save note
        </Button>
      </div>
    </div>
  );
}
```

Note: the template's merge tag is `{{first_name}}` (repo `renderWhatsAppMessage`), not the spec's `{name}`; the `{name}` chip is a Phase C campaign concern.

- [ ] **Step 4: Run to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-send-panel.test.tsx tests/sales-ui-guards.test.ts`
Expected: PASS.
Run tsc and lint -> clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/sales/SendPanel.tsx src/components/sales/OutcomeButtons.tsx src/components/sales/NotInterestedDialog.tsx tests/sales-send-panel.test.tsx
git commit -m "feat(sales): send panel with locks and countdown, outcome buttons, stop path

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Today screen

**Files:**
- Create: `src/components/sales/TodayQueue.tsx`
- Create: `src/components/sales/QueueCard.tsx`
- Modify: `src/app/dashboard/sales/page.tsx`
- Modify: `src/app/dashboard/sales/loading.tsx`
- Create: `tests/sales-today.test.tsx`

**Interfaces:**
- Consumes: `GET /api/sales/today` -> `{ items: QueueCardJson[]; remaining: number }`; `GET /api/sales/templates` -> `{ templates: TemplateJson[] }`; Task 9 `SendPanel`; Task 7 `outcomeLabel`, `greetingFor`; `firstNameOf` from `@/lib/crm/whatsapp-link`; `localParts`, `DEFAULT_SETTINGS` from `@/lib/crm/send-limits`; `initials` from `@/lib/format`; `EmptyState`, `ErrorState`.
- Produces:
  - `export function TodayQueue({ greeting, firstName }: { greeting: string; firstName: string })`
  - `export function QueueCard(props: { item: QueueCardJson; selected: boolean; sent: boolean; onSelect(): void; onSkip(): void; onDone(): void })`

**Port source:** `docs/superpowers/stitch-screens/2026-10-04-sales-workspace/today-queue-desktop.html` (layout: header card + `grid grid-cols-1 lg:grid-cols-12 gap-8`; left `lg:col-span-5` "Priority Outreach Today" list of `article` cards; right `lg:col-span-7` contact identity card + WhatsApp action box). Phone layout (no Stitch phone screen for Today): single column, the selected contact's identity card + `SendPanel` first, then an "Up next" list, as in the on-brand `outreach-desk-mobile.html` (structure only: focus card on top, "Up next in queue" list with "Select" buttons below; its bottom nav is NOT ported, the app Sidebar provides it).
**Mapping rules:** prefix every Stitch token with `pz-`; selected card = Stitch Card 1 (`shadow-card` instead of the inline rgba box-shadow, `absolute left-0 top-0 bottom-0 w-1.5 bg-pz-primary` stripe); other cards = Stitch Card 2. "Why today" tag: `warm` -> "Replied before" (`bg-pz-primary-container/30 text-pz-on-primary-container`), `last_outcome === null` -> "New", else "Follow-up due" (`bg-pz-secondary-fixed text-pz-on-secondary-fixed`). Last-touchpoint strip shows `last_note` (truncate) or "No notes yet". List card actions: "Select" (primary, `h-12`) and "Skip" (Stitch Skip button). Queue header: "Message next" + chip "{n} left today".
**Drop list (no backing data or forbidden copy):** Queue Mode Simulator bar, Morning Shift chip, date chip, "Anti-Ban Shield Active", meters (now in `BudgetBar`), filter tabs New Leads/Follow-ups/Urgent, sort button, "Verified Clinician", hospital line, Lead Metadata Strip "Target Program/Inquiry Received/Cohort Availability", call/profile buttons (keep only phone text), all three state banners (their states are covered by `lockCopy` detail text and `BudgetBar`).

- [ ] **Step 1: Write the failing test**

Create `tests/sales-today.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { TodayQueue } from "@/components/sales/TodayQueue";
import type { QueueCardJson } from "@/lib/crm/sales-ui";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const card = (id: string, full_name: string, over: Partial<QueueCardJson> = {}): QueueCardJson => ({
  id, full_name, phone_e164: "+923001234567", last_outcome: null, next_followup_at: null,
  last_note: null, warm: false, recently_contacted: false, ...over,
});

const budgetValue: SalesBudgetValue = {
  budgets: [], loadError: false, selectedId: null, selected: null,
  select: vi.fn(), refresh: vi.fn(async () => {}), applyBudget: vi.fn(),
};

function mockApi(items: QueueCardJson[], remaining = items.length) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith("/api/sales/today")) return { ok: true, json: async () => ({ items, remaining }) };
    if (url.startsWith("/api/sales/templates")) return { ok: true, json: async () => ({ templates: [] }) };
    if (url.endsWith("/outcome")) return { ok: true, json: async () => ({ ok: true, nextFollowupAt: null }) };
    return { ok: false, json: async () => ({}) };
  }));
}

const renderToday = () =>
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={budgetValue}>
        <TodayQueue greeting="Good morning" firstName="Sara" />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );

beforeEach(() => vi.unstubAllGlobals());

describe("TodayQueue", () => {
  it("greets, counts and selects the first card", async () => {
    mockApi([card("a", "Ayesha Tariq", { warm: true }), card("b", "Bilal Khan")], 7);
    renderToday();
    expect(await screen.findByText("Good morning, Sara")).toBeTruthy();
    expect(screen.getByText("7 left today")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Ayesha Tariq" })).toBeTruthy();
    expect(screen.getByText("Replied before")).toBeTruthy();
  });

  it("logging an outcome removes the card and lowers the counter", async () => {
    mockApi([card("a", "Ayesha Tariq"), card("b", "Bilal Khan")], 2);
    renderToday();
    fireEvent.click(await screen.findByRole("button", { name: "Replied" }));
    await waitFor(() => expect(screen.getByText("1 left today")).toBeTruthy());
    expect(screen.getByRole("heading", { level: 2, name: "Bilal Khan" })).toBeTruthy();
  });

  it("skip moves a card to the end", async () => {
    mockApi([card("a", "Ayesha Tariq"), card("b", "Bilal Khan")]);
    renderToday();
    fireEvent.click((await screen.findAllByRole("button", { name: "Skip" }))[0]);
    expect(screen.getByRole("heading", { level: 2, name: "Bilal Khan" })).toBeTruthy();
  });

  it("shows All caught up with a link to claim more when the list is empty", async () => {
    mockApi([], 0);
    renderToday();
    expect(await screen.findByRole("heading", { name: "All caught up" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Claim more contacts" }).getAttribute("href")).toBe(
      "/dashboard/sales/contacts?tab=unclaimed",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-today.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/components/sales/TodayQueue.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { initials } from "@/lib/format";
import type { QueueCardJson, TemplateJson } from "@/lib/crm/sales-ui";
import { QueueCard } from "./QueueCard";
import { SendPanel } from "./SendPanel";

export function TodayQueue({ greeting, firstName }: { greeting: string; firstName: string }) {
  const [items, setItems] = useState<QueueCardJson[] | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [templates, setTemplates] = useState<TemplateJson[]>([]);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(false);
    try {
      const [q, t] = await Promise.all([
        fetch("/api/sales/today", { cache: "no-store" }),
        fetch("/api/sales/templates", { cache: "no-store" }),
      ]);
      if (!q.ok) throw new Error(String(q.status));
      const data = (await q.json()) as { items: QueueCardJson[]; remaining: number };
      setItems(data.items);
      setRemaining(data.remaining);
      if (t.ok) setTemplates(((await t.json()) as { templates: TemplateJson[] }).templates);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const visible = useMemo(() => {
    if (!items) return [];
    const order = (id: string) => skipped.indexOf(id);
    return [...items].sort((a, b) => order(a.id) - order(b.id)); // not-skipped (-1) first, keeps server order
  }, [items, skipped]);
  const selected = visible.find((i) => i.id === selectedId) ?? visible[0] ?? null;

  const removeCard = (id: string) => {
    setItems((cur) => cur?.filter((i) => i.id !== id) ?? cur);
    setRemaining((r) => Math.max(0, r - 1));
    setSelectedId(null);
  };

  if (error) return <ErrorState onRetry={() => void load()} />;
  if (items === null) return <div className="h-64 rounded-xl bg-pz-surface-container-low animate-pulse" aria-hidden="true" />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl lg:text-3xl font-headline font-black text-pz-on-surface tracking-tight">
        {firstName ? `${greeting}, ${firstName}` : greeting}
      </h1>

      {visible.length === 0 ? (
        <section className="bg-pz-surface-container-lowest rounded-xl shadow-sm">
          <EmptyState
            icon={CheckCircle2}
            title="All caught up"
            description="Nobody is due a message right now. Claim more contacts to keep going."
            action={{ label: "Claim more contacts", href: "/dashboard/sales/contacts?tab=unclaimed" }}
          />
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Focus pane: first on phone, right column on desktop */}
          {selected && (
            <section className="lg:col-span-7 lg:order-2 flex flex-col gap-5">
              <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-full bg-pz-primary/10 text-pz-primary flex items-center justify-center font-headline font-black text-xl shrink-0">
                  {initials(selected.full_name)}
                </div>
                <div className="flex flex-col min-w-0">
                  <h2 className="text-xl font-headline font-bold text-pz-on-surface truncate">{selected.full_name || "No name"}</h2>
                  <span className="text-xs text-pz-on-surface-variant font-mono font-medium">{selected.phone_e164}</span>
                  {selected.last_note && <span className="text-xs text-pz-on-surface-variant truncate mt-0.5">{selected.last_note}</span>}
                </div>
              </div>
              <SendPanel
                contact={selected}
                templates={templates}
                onSent={(id) => setSentIds((s) => new Set(s).add(id))}
                onOutcome={(id) => removeCard(id)}
              />
            </section>
          )}

          <section className="lg:col-span-5 lg:order-1 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-headline font-bold text-pz-on-surface">Message next</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-headline font-bold bg-pz-primary/10 text-pz-primary">
                {remaining} left today
              </span>
            </div>
            <div className="flex flex-col gap-3.5">
              {visible.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  selected={item.id === selected?.id}
                  sent={sentIds.has(item.id)}
                  onSelect={() => {
                    setSelectedId(item.id);
                    window.scrollTo?.({ top: 0, behavior: "smooth" });
                  }}
                  onSkip={() => {
                    setSkipped((s) => [...s.filter((x) => x !== item.id), item.id]);
                    if (item.id === selected?.id) setSelectedId(null);
                  }}
                  onDone={() => removeCard(item.id)}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
```

Note the skip sort: `skipped.indexOf` is -1 for unskipped items (they stay first, in server order since `Array.prototype.sort` is stable), skipped items follow in the order they were skipped.

`src/components/sales/QueueCard.tsx`: port Stitch Card 1 / Card 2 markup with the mapping rules above. Required content and accessible names:
- `<article>` with avatar initials, `<h3>` name (truncate), phone (`font-mono`), the "Why today" tag (text exactly "Replied before" / "New" / "Follow-up due"), the last-note strip, and when `sent` a chip "Sent" (`bg-pz-tertiary-fixed text-pz-on-tertiary-fixed`).
- Buttons: when `!sent`: "Select" (`h-12 flex-1 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-xs sm:text-sm`) and "Skip" (Stitch Skip classes with `pz-`); when `sent`: "Done for now" (same style as Skip, calls `onDone`) next to "Select".
- If `item.recently_contacted`: small `Clock` + "Messaged in the last 24 hours" line in `text-pz-secondary`.

```tsx
"use client";

import { Clock } from "lucide-react";
import { initials } from "@/lib/format";
import type { QueueCardJson } from "@/lib/crm/sales-ui";

const whyToday = (i: QueueCardJson) =>
  i.warm
    ? { text: "Replied before", cls: "bg-pz-primary-container/30 text-pz-on-primary-container" }
    : i.last_outcome === null
      ? { text: "New", cls: "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed" }
      : { text: "Follow-up due", cls: "bg-pz-secondary-fixed text-pz-on-secondary-fixed" };

export function QueueCard({
  item, selected, sent, onSelect, onSkip, onDone,
}: {
  item: QueueCardJson; selected: boolean; sent: boolean;
  onSelect: () => void; onSkip: () => void; onDone: () => void;
}) {
  const tag = whyToday(item);
  return (
    <article
      className={`bg-pz-surface-container-lowest rounded-xl p-4 transition-all relative overflow-hidden ${selected ? "shadow-card" : "shadow-sm hover:shadow-md"}`}
    >
      {selected && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-pz-primary" />}
      <div className="flex items-start justify-between gap-3 pl-1.5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-full bg-pz-primary/15 text-pz-primary flex items-center justify-center font-headline font-bold text-base shrink-0">
            {initials(item.full_name)}
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="text-sm font-headline font-bold text-pz-on-surface truncate">{item.full_name || "No name"}</h3>
            <span className="text-xs text-pz-on-surface-variant font-mono font-medium">{item.phone_e164}</span>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded text-[11px] font-headline font-bold shrink-0 ${sent ? "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed" : tag.cls}`}>
          {sent ? "Sent" : tag.text}
        </span>
      </div>
      <div className="mt-3.5 flex items-center gap-1.5 text-xs text-pz-on-surface-variant bg-pz-surface-container-low rounded-lg p-2.5">
        <span className="truncate">{item.last_note ?? "No notes yet"}</span>
      </div>
      {item.recently_contacted && (
        <p className="mt-2 flex items-center gap-1 text-xs text-pz-secondary">
          <Clock className="w-3.5 h-3.5" /> Messaged in the last 24 hours
        </p>
      )}
      <div className="mt-3.5 flex items-center gap-2">
        <button type="button" onClick={onSelect}
          className="flex-1 h-12 rounded-lg bg-pz-primary hover:bg-pz-primary/95 text-pz-on-primary font-headline font-bold text-xs sm:text-sm transition-all shadow-sm active:scale-[0.99]">
          Select
        </button>
        <button type="button" onClick={sent ? onDone : onSkip}
          className="h-12 px-3.5 rounded-lg bg-pz-surface-container text-pz-on-surface-variant hover:text-pz-on-surface hover:bg-pz-surface-container-high transition-colors font-headline text-xs font-semibold shrink-0">
          {sent ? "Done for now" : "Skip"}
        </button>
      </div>
    </article>
  );
}
```

`src/app/dashboard/sales/page.tsx` (keeps `requireSalesAgentPage()` for `tests/sales-shell.test.ts`):

```tsx
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { TodayQueue } from "@/components/sales/TodayQueue";
import { firstNameOf } from "@/lib/crm/whatsapp-link";
import { DEFAULT_SETTINGS, localParts } from "@/lib/crm/send-limits";
import { greetingFor } from "@/lib/crm/sales-ui";

export const metadata = { title: "Today — Sales Workspace" };

export default async function SalesWorkspacePage() {
  const { user, supabase } = await requireSalesAgentPage();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const greeting = greetingFor(localParts(new Date(), DEFAULT_SETTINGS.timezone).hour);
  return <TodayQueue greeting={greeting} firstName={firstNameOf(profile?.full_name ?? "")} />;
}
```

`src/app/dashboard/sales/loading.tsx`: replace with `import { DetailSkeleton } from "@/components/ui/skeletons"; export default function Loading() { return <DetailSkeleton sections={3} />; }`.

The greeting test expects "Good morning, Sara" (no exclamation, no emoji; the Stitch wave emoji is dropped).

- [ ] **Step 4: Run to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-today.test.tsx tests/sales-shell.test.ts tests/sales-ui-guards.test.ts`
Expected: PASS. Then tsc and lint -> clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/sales/TodayQueue.tsx src/components/sales/QueueCard.tsx src/app/dashboard/sales/page.tsx src/app/dashboard/sales/loading.tsx tests/sales-today.test.tsx
git commit -m "feat(sales): Today queue screen (desktop two-pane, phone stacked)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: My Contacts with timeline pane

**Files:**
- Create: `src/app/dashboard/sales/contacts/page.tsx`
- Create: `src/app/dashboard/sales/contacts/loading.tsx`
- Create: `src/components/sales/ContactsWorkspace.tsx`
- Create: `src/components/sales/ContactDetailPane.tsx`
- Create: `src/components/sales/Timeline.tsx`
- Create: `tests/sales-contacts.test.tsx`

**Interfaces:**
- Consumes: `GET /api/sales/contacts?tab=&q=&page=` -> `{ rows: ContactRowJson[]; total: number; pageSize: number }`; `GET /api/sales/contacts/[id]` -> `ContactDetailJson`; `POST /api/sales/contacts/[id]/claim` -> `{ ok }` | 409 `{ error, reason: "already-claimed" }`; `GET /api/sales/templates`; Task 9 `SendPanel`; Task 7 `activityLabel`, `outcomeLabel`, `recentlySent`, `isWarmOutcome` (from followup).
- Produces:
  - `export function ContactsWorkspace(props: { viewerId: string; initialTab: "mine" | "unclaimed" | "all"; initialOpenId: string | null })`
  - `export function ContactDetailPane(props: { contactId: string; viewerId: string; templates: TemplateJson[]; onClose(): void; onChanged(): void })`
  - `export function Timeline({ entries }: { entries: TimelineEntryJson[] })`

**Port source:** `my-contacts-timeline-desktop.html`: left column "My Contacts" header with count chip, tab pills (Mine / Unclaimed / All), search input, contact cards (assigned / unclaimed with "Claim Contact to My Queue" / locked "Owned by ..." variants); right column contact header, "Message ... on WhatsApp" block, "Record Call / Chat Outcome" pills, "Sales Note" box, "Activity Timeline" list with dot icons. Desktop: `grid lg:grid-cols-12`, list `lg:col-span-5`, pane `lg:col-span-7`. Phone (no Stitch screen): list full width; the pane opens as a full-screen sheet `fixed inset-0 z-[60] overflow-y-auto bg-pz-surface p-4 lg:static lg:z-auto lg:p-0 lg:bg-transparent` with a "Back to contacts" button (`ArrowLeft`, `lg:hidden`).
**Mapping rules:** `pz-` prefix; the Stitch "Message ... on WhatsApp" block + outcome pills + note box are replaced by `<SendPanel>` (same component as Today); the locked card variant (`opacity-60`, `Lock` icon, "Owned by X") is used for rows where `owner_id` is neither null nor the viewer; masked phone shows "Phone hidden".
**Drop list:** "Follow-ups due" / "Interested" filter tabs (no API), "Reassign" button, Course Interest / Source / Created tiles, "Remind me to follow up" chips (D8), "+ Asked for Syllabus" tag chips, "Real-time sync", "Audit Trail", "Live Outreach", "Target 18/25", "1-Tap Auto Sync", "Enrolled" (our label is "Bought").

- [ ] **Step 1: Write the failing test**

Create `tests/sales-contacts.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SalesBudgetContext, type SalesBudgetValue } from "@/components/sales/SalesBudgetProvider";
import { ContactsWorkspace } from "@/components/sales/ContactsWorkspace";
import type { ContactDetailJson, ContactRowJson } from "@/lib/crm/sales-ui";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const ME = "me-1";
const row = (id: string, full_name: string, over: Partial<ContactRowJson> = {}): ContactRowJson => ({
  id, full_name, phone_e164: "+923001234567", owner_id: ME, owner_name: "Sara", last_outcome: null,
  next_followup_at: null, do_not_contact_at: null, ...over,
});
const budgetValue: SalesBudgetValue = {
  budgets: [], loadError: false, selectedId: null, selected: null,
  select: vi.fn(), refresh: vi.fn(async () => {}), applyBudget: vi.fn(),
};

function mockApi(rows: ContactRowJson[], details: Record<string, ContactDetailJson>, claim?: { ok: boolean; status?: number }) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/sales/contacts?")) return { ok: true, json: async () => ({ rows, total: rows.length, pageSize: 30 }) };
    if (url.startsWith("/api/sales/templates")) return { ok: true, json: async () => ({ templates: [] }) };
    if (url.endsWith("/claim") && init?.method === "POST")
      return { ok: claim?.ok ?? true, status: claim?.status ?? 200, json: async () => (claim?.ok === false ? { error: "Someone else already claimed this contact." } : { ok: true }) };
    const m = url.match(/^\/api\/sales\/contacts\/([^/?]+)$/);
    if (m) return { ok: true, json: async () => details[m[1]] };
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", f);
  return f;
}

const renderWs = (initialOpenId: string | null = null, initialTab: "mine" | "unclaimed" | "all" = "all") =>
  render(
    <ConfirmProvider>
      <SalesBudgetContext.Provider value={budgetValue}>
        <ContactsWorkspace viewerId={ME} initialTab={initialTab} initialOpenId={initialOpenId} />
      </SalesBudgetContext.Provider>
    </ConfirmProvider>,
  );

beforeEach(() => vi.unstubAllGlobals());

describe("ContactsWorkspace", () => {
  it("shows owner state and masked phones on the All tab", async () => {
    mockApi([row("a", "Ayesha"), row("b", "Bilal", { owner_id: "other", owner_name: "Hina", phone_e164: null }), row("c", "Chand", { owner_id: null, owner_name: null })], {});
    renderWs();
    expect(await screen.findByText("Owned by Hina")).toBeTruthy();
    expect(screen.getByText("Phone hidden")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Claim" })).toBeTruthy();
  });

  it("a restricted contact shows no phone, no timeline and no actions", async () => {
    mockApi([], {
      x: {
        contact: { id: "x", full_name: "Bilal", phone_e164: null, owner_id: "other", owner_name: "Hina", last_outcome: "interested", next_followup_at: null, do_not_contact_at: null, email: null, profession: null },
        timeline: [],
        canAct: false,
        restricted: true,
      },
    });
    renderWs("x");
    expect(await screen.findByText(/belongs to another agent/i)).toBeTruthy();
    expect(screen.queryByText("+923001234567")).toBeNull();
    expect(screen.queryByRole("button", { name: /message on whatsapp/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Timeline" })).toBeNull();
  });

  it("claiming an unclaimed contact posts and reloads", async () => {
    const f = mockApi([row("c", "Chand", { owner_id: null, owner_name: null })], {});
    renderWs(null, "unclaimed");
    fireEvent.click(await screen.findByRole("button", { name: "Claim" }));
    await waitFor(() => expect(f).toHaveBeenCalledWith("/api/sales/contacts/c/claim", expect.objectContaining({ method: "POST" })));
  });

  it("an own contact with do-not-contact shows the stop banner and no send panel", async () => {
    mockApi([], {
      d: {
        contact: { id: "d", full_name: "Dua", phone_e164: "+923001234567", owner_id: ME, owner_name: "Sara", last_outcome: "not_interested", next_followup_at: null, do_not_contact_at: "2026-10-01T10:00:00.000Z", email: null, profession: null },
        timeline: [{ id: "t1", kind: "not_interested", body: "Asked me to stop", agent_name: "Sara", created_at: "2026-10-01T10:00:00.000Z" }],
        canAct: true,
        restricted: false,
      },
    });
    renderWs("d");
    expect(await screen.findByText(/asked not to be contacted/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /message on whatsapp/i })).toBeNull();
    expect(screen.getByRole("heading", { name: "Timeline" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-contacts.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/app/dashboard/sales/contacts/page.tsx`:

```tsx
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { ContactsWorkspace } from "@/components/sales/ContactsWorkspace";

export const metadata = { title: "My Contacts — Sales Workspace" };

const TABS = ["mine", "unclaimed", "all"] as const;
type Tab = (typeof TABS)[number];

// Same searchParams convention as src/app/dashboard/admin/crm/page.tsx (a Promise, awaited).
export default async function SalesContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; open?: string }>;
}) {
  const { user } = await requireSalesAgentPage();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "mine";
  const open = sp.open && /^[0-9a-f-]{36}$/i.test(sp.open) ? sp.open : null;
  return <ContactsWorkspace viewerId={user.id} initialTab={tab} initialOpenId={open} />;
}
```

(The test passes `initialOpenId="x"`/"d" directly to the component; the uuid check lives only in the page.)

`loading.tsx`: `import { TableSkeleton } from "@/components/ui/skeletons"; export default function Loading() { return <TableSkeleton cols={3} />; }`

`src/components/sales/ContactsWorkspace.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Lock, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { initials } from "@/lib/format";
import { outcomeLabel, type ContactRowJson, type TemplateJson } from "@/lib/crm/sales-ui";
import { ContactDetailPane } from "./ContactDetailPane";

type Tab = "mine" | "unclaimed" | "all";
const TAB_LABELS: Record<Tab, string> = { mine: "Mine", unclaimed: "Unclaimed", all: "All" };

export function ContactsWorkspace({
  viewerId,
  initialTab,
  initialOpenId,
}: {
  viewerId: string;
  initialTab: Tab;
  initialOpenId: string | null;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: ContactRowJson[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [templates, setTemplates] = useState<TemplateJson[]>([]);

  // Debounce search typing.
  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const load = useCallback(async () => {
    setError(false);
    try {
      const params = new URLSearchParams({ tab, page: String(page) });
      if (q) params.set("q", q);
      const res = await fetch(`/api/sales/contacts?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setError(true);
    }
  }, [tab, q, page]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    void fetch("/api/sales/templates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates: TemplateJson[] }) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, []);

  // Keep the URL shareable without a navigation.
  useEffect(() => {
    const params = new URLSearchParams({ tab });
    if (openId) params.set("open", openId);
    window.history.replaceState(null, "", `/dashboard/sales/contacts?${params.toString()}`);
  }, [tab, openId]);

  const { run: claim, pendingKey } = useAsyncAction(
    async (id: string) => {
      try {
        const res = await fetch(`/api/sales/contacts/${id}/claim`, { method: "POST" });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) toast.error(body?.error ?? "Could not claim this contact.");
        else toast.success("Claimed. They are in your Today list now.");
      } catch {
        toast.error("Could not claim this contact.");
      }
      await load();
    },
    { getKey: (id) => id },
  );

  const owner = (r: ContactRowJson) =>
    r.owner_id === null ? "unclaimed" : r.owner_id === viewerId ? "mine" : "other";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
      <section className="lg:col-span-5 flex flex-col gap-4">
        {/* Header, tabs and search: port from my-contacts-timeline-desktop.html (pz- prefix). */}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-headline font-bold text-pz-on-surface">My Contacts</h1>
          {data && (
            <span className="px-2 py-0.5 rounded-full text-xs font-headline font-bold bg-pz-primary/10 text-pz-primary">
              {data.total} {data.total === 1 ? "contact" : "contacts"}
            </span>
          )}
        </div>
        <div role="tablist" aria-label="Which contacts" className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              type="button"
              onClick={() => { setTab(t); setPage(1); }}
              className={`px-3 py-1.5 max-md:min-h-11 rounded-lg text-xs font-headline shrink-0 ${
                tab === t ? "font-semibold bg-pz-primary text-pz-on-primary shadow-sm" : "font-medium bg-pz-surface-container-lowest text-pz-on-surface-variant hover:text-pz-on-surface"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <label className="relative flex items-center">
          <Search className="absolute left-3 w-5 h-5 text-pz-on-surface-variant" />
          <span className="sr-only">Search by name or phone</span>
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search by name or phone"
            className="w-full pl-10 pr-4 py-2 max-md:min-h-11 text-sm bg-pz-surface-container-lowest text-pz-on-surface placeholder:text-pz-on-surface-variant/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-pz-primary/20 shadow-sm"
          />
        </label>

        {error ? (
          <ErrorState onRetry={() => void load()} />
        ) : data === null ? (
          <div className="h-48 rounded-xl bg-pz-surface-container-low animate-pulse" aria-hidden="true" />
        ) : data.rows.length === 0 ? (
          <EmptyState icon={Users} title="No contacts here" description={q ? "Nothing matches that search." : tab === "mine" ? "Claim contacts from the Unclaimed tab to start." : "Nothing to show yet."} />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.rows.map((r) => {
              const o = owner(r);
              return (
                <li key={r.id}>
                  {/* Card variants ported from the Stitch list: assigned / unclaimed / locked. */}
                  <div className={`bg-pz-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col gap-3 ${openId === r.id ? "ring-2 ring-pz-primary" : ""} ${o === "other" ? "opacity-70" : ""}`}>
                    <button type="button" onClick={() => setOpenId(r.id)} className="flex items-start gap-3 text-left min-w-0">
                      <span className="w-11 h-11 rounded-full bg-pz-primary/15 text-pz-primary flex items-center justify-center font-headline font-bold shrink-0">
                        {initials(r.full_name)}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm font-headline font-bold text-pz-on-surface truncate">{r.full_name || "No name"}</span>
                        <span className="text-xs text-pz-on-surface-variant font-mono">{r.phone_e164 ?? "Phone hidden"}</span>
                        <span className="text-xs text-pz-on-surface-variant mt-0.5">
                          {o === "mine" ? "Yours" : o === "unclaimed" ? "Unclaimed" : (
                            <span className="inline-flex items-center gap-1"><Lock className="w-3.5 h-3.5" />{`Owned by ${r.owner_name || "another agent"}`}</span>
                          )}
                          {` · ${outcomeLabel(r.last_outcome)}`}
                          {r.do_not_contact_at ? " · Do not contact" : ""}
                        </span>
                      </span>
                    </button>
                    {o === "unclaimed" && (
                      <button
                        type="button"
                        disabled={pendingKey === r.id}
                        onClick={() => void claim(r.id)}
                        className="w-full min-h-11 rounded-lg bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm disabled:opacity-50"
                      >
                        Claim
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between text-xs font-headline">
            <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-2 max-md:min-h-11 rounded-lg bg-pz-surface-container-lowest disabled:opacity-50">Previous</button>
            <span className="text-pz-on-surface-variant">Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
            <button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)} className="px-3 py-2 max-md:min-h-11 rounded-lg bg-pz-surface-container-lowest disabled:opacity-50">Next</button>
          </div>
        )}
      </section>

      {openId && (
        <section className="lg:col-span-7 fixed inset-0 z-[60] overflow-y-auto bg-pz-surface p-4 lg:static lg:z-auto lg:p-0 lg:bg-transparent">
          <ContactDetailPane
            contactId={openId}
            viewerId={viewerId}
            templates={templates}
            onClose={() => setOpenId(null)}
            onChanged={() => void load()}
          />
        </section>
      )}
    </div>
  );
}
```

`src/components/sales/ContactDetailPane.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Ban, Lock } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { initials } from "@/lib/format";
import { isWarmOutcome } from "@/lib/crm/followup";
import { outcomeLabel, recentlySent, type ContactDetailJson, type TemplateJson } from "@/lib/crm/sales-ui";
import { SendPanel } from "./SendPanel";
import { Timeline } from "./Timeline";

export function ContactDetailPane({
  contactId,
  viewerId,
  templates,
  onClose,
  onChanged,
}: {
  contactId: string;
  viewerId: string;
  templates: TemplateJson[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ContactDetailJson | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(`/api/sales/contacts/${contactId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setDetail(await res.json());
    } catch {
      setError(true);
    }
  }, [contactId]);
  useEffect(() => { setDetail(null); void load(); }, [load]);

  const { run: claim, pending: claiming } = useAsyncAction(async () => {
    try {
      const res = await fetch(`/api/sales/contacts/${contactId}/claim`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) toast.error(body?.error ?? "Could not claim this contact.");
      else toast.success("Claimed. They are in your Today list now.");
    } catch {
      toast.error("Could not claim this contact.");
    }
    await load();
    onChanged();
  });

  const back = (
    <button type="button" onClick={onClose} className="lg:hidden inline-flex items-center gap-2 min-h-11 text-sm font-headline font-semibold text-pz-on-surface">
      <ArrowLeft className="w-4 h-4" /> Back to contacts
    </button>
  );

  if (error) return <div className="flex flex-col gap-4">{back}<ErrorState onRetry={() => void load()} /></div>;
  if (!detail) return <div className="flex flex-col gap-4">{back}<div className="h-64 rounded-xl bg-pz-surface-container-low animate-pulse" aria-hidden="true" /></div>;

  const c = detail.contact;
  const unclaimed = c.owner_id === null;
  const header = (
    <div className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex items-center gap-3.5">
      <div className="w-14 h-14 rounded-full bg-pz-primary/10 text-pz-primary flex items-center justify-center font-headline font-black text-xl shrink-0">
        {initials(c.full_name)}
      </div>
      <div className="flex flex-col min-w-0">
        <h2 className="text-xl font-headline font-bold text-pz-on-surface truncate">{c.full_name || "No name"}</h2>
        <span className="text-xs text-pz-on-surface-variant">
          {unclaimed ? "Unclaimed" : c.owner_id === viewerId ? "Yours" : `Owned by ${c.owner_name || "another agent"}`}
          {` · ${outcomeLabel(c.last_outcome)}`}
        </span>
        {!detail.restricted && c.phone_e164 && <span className="text-xs text-pz-on-surface-variant font-mono mt-0.5">{c.phone_e164}</span>}
        {!detail.restricted && c.profession && <span className="text-xs text-pz-on-surface-variant mt-0.5">{c.profession}</span>}
        {!detail.restricted && c.email && <span className="text-xs text-pz-on-surface-variant mt-0.5 truncate">{c.email}</span>}
      </div>
    </div>
  );

  if (detail.restricted) {
    return (
      <div className="flex flex-col gap-4 font-body">
        {back}
        {header}
        <p className="bg-pz-surface-container-low rounded-lg p-4 text-sm text-pz-on-surface-variant flex items-start gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          This contact belongs to another agent. Ask your admin if it should be moved to you.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 font-body">
      {back}
      {header}
      {c.do_not_contact_at && (
        <p className="bg-pz-error-container text-pz-on-error-container rounded-lg p-4 text-sm flex items-start gap-2">
          <Ban className="w-4 h-4 mt-0.5 shrink-0" /> Asked not to be contacted. Nobody can message them from the app.
        </p>
      )}
      {unclaimed && (
        <button type="button" disabled={claiming} onClick={() => void claim()}
          className="w-full h-12 rounded-xl bg-pz-primary text-pz-on-primary font-headline font-bold text-base shadow-md disabled:opacity-50">
          Claim to my list
        </button>
      )}
      {detail.canAct && !unclaimed && !c.do_not_contact_at && c.phone_e164 && (
        <SendPanel
          contact={{
            id: c.id,
            full_name: c.full_name,
            phone_e164: c.phone_e164,
            warm: isWarmOutcome(c.last_outcome),
            recently_contacted: recentlySent(detail.timeline, new Date()),
          }}
          templates={templates}
          onSent={() => void load()}
          onOutcome={() => { void load(); onChanged(); }}
          onNoteSaved={() => void load()}
        />
      )}
      <Timeline entries={detail.timeline} />
    </div>
  );
}
```

`src/components/sales/Timeline.tsx` (port "Activity Timeline" from the Stitch file: vertical line, coloured dot per kind, time, agent, label chip, quoted body):

```tsx
import { MessageCircle, NotebookPen, UserPlus, Star, PartyPopper, X, History } from "lucide-react";
import { activityLabel, type TimelineEntryJson } from "@/lib/crm/sales-ui";
import { formatDateTime, relativeTime } from "@/lib/format";

const ICON: Record<string, typeof History> = {
  sent: MessageCircle, replied: MessageCircle, interested: Star, bought: PartyPopper,
  not_interested: X, note: NotebookPen, claimed: UserPlus, reassigned: UserPlus, released: UserPlus,
};

export function Timeline({ entries }: { entries: TimelineEntryJson[] }) {
  return (
    <section className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
      <h3 className="text-base font-headline font-bold text-pz-on-surface">Timeline</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-pz-on-surface-variant">Nothing has happened with this contact yet.</p>
      ) : (
        <ol className="relative flex flex-col gap-4 border-l border-pz-outline-variant pl-5">
          {entries.map((e) => {
            const Icon = ICON[e.kind] ?? History;
            return (
              <li key={e.id} className="relative">
                <span className="absolute -left-[29px] top-0.5 w-6 h-6 rounded-full bg-pz-primary-container text-pz-on-primary-container flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <p className="text-xs text-pz-on-surface-variant">
                  <time dateTime={e.created_at} title={formatDateTime(e.created_at)}>{relativeTime(e.created_at)}</time>
                  {e.agent_name ? ` · ${e.agent_name}` : ""}
                </p>
                <p className="text-sm font-headline font-semibold text-pz-on-surface">{activityLabel(e.kind)}</p>
                {e.body && <p className="text-sm text-pz-on-surface-variant whitespace-pre-wrap">{e.body}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
```

(`-left-[29px]` is a position offset, not a radius; allowed.)

- [ ] **Step 4: Run to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-contacts.test.tsx tests/sales-ui-guards.test.ts`
Expected: PASS. Then tsc and lint -> clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/sales/contacts src/components/sales/ContactsWorkspace.tsx src/components/sales/ContactDetailPane.tsx src/components/sales/Timeline.tsx tests/sales-contacts.test.tsx
git commit -m "feat(sales): My Contacts with tabs, search, claim and timeline pane

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Add a Lead

**Files:**
- Create: `src/app/dashboard/sales/add-lead/page.tsx`
- Create: `src/app/dashboard/sales/add-lead/loading.tsx`
- Create: `src/components/sales/AddLeadForm.tsx`
- Create: `tests/sales-add-lead.test.tsx`

**Interfaces:**
- Consumes: `extractEmail`, `extractPhone`, `extractName`, `extractProfession` from `@/lib/leads/extract`; `leadPayload` (Task 7); `POST /api/sales/leads` -> 201 `{ ok, contactId }` | 409 `{ error, reason: "duplicate", contactId: string | null, ownerName: string | null }` | 400 `{ error, reason? }`.
- Produces: `export function AddLeadForm()`.

**Port source:** `add-a-lead-desktop.html`: page header ("Add a Lead" + subtitle), mode switch ("Paste a WhatsApp Chat" / "Type it in"), left card "1 Paste the chat" textarea + "Read it & fill in details" button + tips list, right card "2 Check and save" form (Full name, WhatsApp phone, plus our Email, Profession, Note) + "Save to My Contacts" / "Clear"; success state card ("Lead Saved to Contacts!" block at top of the HTML) with "Go to Today" and "Add another". Desktop two columns `lg:grid-cols-2`; phone stacked (paste first, then form).
**Drop list:** "AI", "Fastest • AI Auto-Fill", "Extracted in 0.8s • 100% confidence", "Clinician Identified", Inquiry Source, Target Course / Program select, "AI Synthesized", "Recommended Next Action", "Intake Pulse", "Agent Response Time", "Cohort Fill Rate", "Pro-Tip ... 85%", simulator links, "Academic Candidate Privacy Protocol" (replace with one line: "Only the details you see in the form are saved. The pasted chat is not stored.").

- [ ] **Step 1: Write the failing test**

Create `tests/sales-add-lead.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { AddLeadForm } from "@/components/sales/AddLeadForm";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const CHAT = "Name: Ayesha Tariq\nMy number is 0300 1234567\nayesha@example.com";

function mockLeads(status: number, body: unknown) {
  const f = vi.fn(async () => ({ ok: status < 300, status, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
}
beforeEach(() => vi.unstubAllGlobals());

describe("AddLeadForm", () => {
  it("extracts details from a pasted chat and saves only filled fields", async () => {
    const f = mockLeads(201, { ok: true, contactId: "c1" });
    render(<AddLeadForm />);
    fireEvent.change(screen.getByLabelText(/paste the chat/i), { target: { value: CHAT } });
    fireEvent.click(screen.getByRole("button", { name: /read it/i }));
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Ayesha Tariq");
    expect((screen.getByLabelText("WhatsApp phone") as HTMLInputElement).value).toBe("+923001234567");
    fireEvent.click(screen.getByRole("button", { name: "Save to My Contacts" }));
    await waitFor(() => expect(screen.getByText(/saved to your contacts/i)).toBeTruthy());
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body).toEqual({ phone: "+923001234567", name: "Ayesha Tariq", email: "ayesha@example.com" });
    expect(screen.getByRole("link", { name: "Go to Today" }).getAttribute("href")).toBe("/dashboard/sales");
  });

  it("a duplicate with an id links to the contact and names the owner", async () => {
    mockLeads(409, { error: "This person is already in the CRM.", reason: "duplicate", contactId: "c9", ownerName: "Hina" });
    render(<AddLeadForm />);
    fireEvent.change(screen.getByLabelText("WhatsApp phone"), { target: { value: "03001234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to My Contacts" }));
    expect(await screen.findByText(/Hina already has this person/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open contact" }).getAttribute("href")).toBe("/dashboard/sales/contacts?tab=all&open=c9");
  });

  it("a duplicate without an id shows no link", async () => {
    mockLeads(409, { error: "This person is already in the CRM.", reason: "duplicate", contactId: null, ownerName: null });
    render(<AddLeadForm />);
    fireEvent.change(screen.getByLabelText("WhatsApp phone"), { target: { value: "03001234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to My Contacts" }));
    expect(await screen.findByText(/already in the CRM/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open contact" })).toBeNull();
  });

  it("shows the server's phone error inline", async () => {
    mockLeads(400, { error: "Enter a valid phone number (e.g. 03001234567).", reason: "invalid-phone" });
    render(<AddLeadForm />);
    fireEvent.change(screen.getByLabelText("WhatsApp phone"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to My Contacts" }));
    expect(await screen.findByText("Enter a valid phone number (e.g. 03001234567).")).toBeTruthy();
  });

  it("save stays disabled without a phone", () => {
    render(<AddLeadForm />);
    expect((screen.getByRole("button", { name: "Save to My Contacts" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-add-lead.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/app/dashboard/sales/add-lead/page.tsx`:

```tsx
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { AddLeadForm } from "@/components/sales/AddLeadForm";

export const metadata = { title: "Add a Lead — Sales Workspace" };

export default async function AddLeadPage() {
  await requireSalesAgentPage();
  return <AddLeadForm />;
}
```

`loading.tsx`: `import { FormSkeleton } from "@/components/ui/skeletons"; export default function Loading() { return <FormSkeleton fields={5} />; }`

`src/components/sales/AddLeadForm.tsx` (state machine and handlers in full; port card/field markup from the Stitch file with the mapping rules; inputs reuse the SalesTeamPanel input class string with `pz-` tokens):

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardPaste, Pencil, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { extractEmail, extractName, extractPhone, extractProfession } from "@/lib/leads/extract";
import { leadPayload, type ApiErrorJson } from "@/lib/crm/sales-ui";

const inputClass =
  "w-full bg-pz-surface-container-low rounded-lg px-3.5 py-3 text-sm max-md:text-base max-md:min-h-11 font-body text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20";
const labelClass = "block font-headline text-xs font-semibold text-pz-on-surface-variant mb-1.5";

type Result =
  | { kind: "saved"; contactId: string }
  | { kind: "duplicate"; contactId: string | null; ownerName: string | null; message: string };

const EMPTY = { name: "", phone: "", email: "", profession: "", note: "" };

export function AddLeadForm() {
  const [mode, setMode] = useState<"paste" | "type">("paste");
  const [raw, setRaw] = useState("");
  const [fields, setFields] = useState(EMPTY);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  function extract() {
    const found = {
      name: extractName(raw),
      phone: extractPhone(raw),
      email: extractEmail(raw),
      profession: extractProfession(raw),
    };
    setFields((f) => ({
      ...f,
      name: found.name ?? f.name,
      phone: found.phone ?? f.phone,
      email: found.email ?? f.email,
      profession: found.profession ?? f.profession,
    }));
    setHint(found.phone ? "Check the details, then save." : "We could not find a phone number. Type it in below.");
  }

  function reset() {
    setRaw("");
    setFields(EMPTY);
    setHint(null);
    setError(null);
    setResult(null);
  }

  const { run: save, pending } = useAsyncAction(async () => {
    setError(null);
    try {
      const res = await fetch("/api/sales/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadPayload(fields)),
      });
      const body = (await res.json().catch(() => null)) as
        | ({ contactId?: string | null; ownerName?: string | null } & ApiErrorJson)
        | null;
      if (res.status === 201 && body?.contactId) {
        setResult({ kind: "saved", contactId: body.contactId });
        return;
      }
      if (res.status === 409 && body?.reason === "duplicate") {
        setResult({
          kind: "duplicate",
          contactId: body.contactId ?? null,
          ownerName: body.ownerName ?? null,
          message: body.error ?? "This person is already in the CRM.",
        });
        return;
      }
      setError(body?.error ?? "Could not save this lead.");
    } catch {
      setError("Could not save this lead.");
    }
  });

  if (result?.kind === "saved") {
    return (
      <section className="bg-pz-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col gap-4 font-body">
        <h1 className="text-xl font-headline font-bold text-pz-on-surface flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-pz-primary" /> Saved to your contacts
        </h1>
        <p className="text-sm text-pz-on-surface-variant">They are at the top of your Today list.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link href="/dashboard/sales" className="min-h-11 px-4 inline-flex items-center justify-center rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-sm">Go to Today</Link>
          <button type="button" onClick={reset} className="min-h-11 px-4 rounded-lg bg-pz-surface-container-low text-pz-on-surface font-headline font-semibold text-sm">Add another</button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6 font-body">
      <header>
        <h1 className="text-2xl lg:text-3xl font-headline font-black text-pz-on-surface tracking-tight">Add a Lead</h1>
        <p className="text-sm text-pz-on-surface-variant mt-1">Paste a WhatsApp chat or type the details in. The lead goes straight to your list.</p>
      </header>

      <div role="tablist" aria-label="How to add" className="flex gap-2">
        <button role="tab" aria-selected={mode === "paste"} type="button" onClick={() => setMode("paste")}
          className={`min-h-11 px-4 rounded-lg font-headline text-sm inline-flex items-center gap-2 ${mode === "paste" ? "bg-pz-primary text-pz-on-primary font-bold" : "bg-pz-surface-container-lowest text-pz-on-surface-variant font-medium"}`}>
          <ClipboardPaste className="w-4 h-4" /> Paste a WhatsApp chat
        </button>
        <button role="tab" aria-selected={mode === "type"} type="button" onClick={() => setMode("type")}
          className={`min-h-11 px-4 rounded-lg font-headline text-sm inline-flex items-center gap-2 ${mode === "type" ? "bg-pz-primary text-pz-on-primary font-bold" : "bg-pz-surface-container-lowest text-pz-on-surface-variant font-medium"}`}>
          <Pencil className="w-4 h-4" /> Type it in
        </button>
      </div>

      {result?.kind === "duplicate" && (
        <div role="alert" className="bg-pz-secondary-fixed text-pz-on-secondary-fixed rounded-xl p-4 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <span>{result.ownerName ? `${result.ownerName} already has this person.` : result.message}</span>
          {result.contactId && (
            <Link href={`/dashboard/sales/contacts?tab=all&open=${result.contactId}`} className="min-h-11 px-4 inline-flex items-center justify-center rounded-lg bg-pz-surface-container-lowest font-headline font-bold">
              Open contact
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {mode === "paste" && (
          <section className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-3">
            <label htmlFor="lead-chat" className="font-headline font-bold text-pz-on-surface">1. Paste the chat</label>
            <textarea id="lead-chat" rows={10} value={raw} onChange={(e) => setRaw(e.target.value)}
              placeholder="Copy the messages from WhatsApp and paste them here."
              className={`${inputClass} resize-y`} />
            <Button type="button" variant="bare" size="bare" disabled={raw.trim().length === 0} onClick={extract}
              className="min-h-11 px-4 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-sm">
              Read it and fill in the details
            </Button>
            <p className="text-xs text-pz-on-surface-variant flex items-start gap-1.5">
              <Info className="w-4 h-4 shrink-0" /> Only the details you see in the form are saved. The pasted chat is not stored.
            </p>
          </section>
        )}

        <section className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
          <h2 className="font-headline font-bold text-pz-on-surface">{mode === "paste" ? "2. Check and save" : "Their details"}</h2>
          {hint && <p role="status" className="text-xs text-pz-on-surface-variant">{hint}</p>}
          <div><label htmlFor="lead-name" className={labelClass}>Full name</label><input id="lead-name" value={fields.name} onChange={set("name")} className={inputClass} /></div>
          <div><label htmlFor="lead-phone" className={labelClass}>WhatsApp phone</label><input id="lead-phone" inputMode="tel" value={fields.phone} onChange={set("phone")} placeholder="03001234567" className={inputClass} /></div>
          <div><label htmlFor="lead-email" className={labelClass}>Email (optional)</label><input id="lead-email" type="email" value={fields.email} onChange={set("email")} className={inputClass} /></div>
          <div><label htmlFor="lead-prof" className={labelClass}>Profession (optional)</label><input id="lead-prof" value={fields.profession} onChange={set("profession")} className={inputClass} /></div>
          <div><label htmlFor="lead-note" className={labelClass}>Note (optional)</label><textarea id="lead-note" rows={3} value={fields.note} onChange={set("note")} placeholder="e.g. Wants the weekend batch" className={`${inputClass} resize-none`} /></div>
          {error && <p role="alert" className="text-sm text-pz-academy-error">{error}</p>}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="bare" size="bare" loading={pending} disabled={fields.phone.trim().length === 0}
              onClick={() => void save()}
              className="min-h-11 px-4 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-sm shadow-md">
              Save to My Contacts
            </Button>
            <button type="button" onClick={reset} className="min-h-11 px-4 rounded-lg bg-pz-surface-container-low text-pz-on-surface font-headline font-semibold text-sm">
              Clear
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
```

Check against the test: the email label is "Email (optional)", the test only reads "Full name" and "WhatsApp phone" by exact label; the extract test's chat line "My number is 0300 1234567" gives `+923001234567` via `extractPhone`, and "Name: Ayesha Tariq" via the first `extractName` pattern. If `extractProfession` matches nothing, `profession` stays blank and is dropped by `leadPayload`.

- [ ] **Step 4: Run to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-add-lead.test.tsx tests/sales-ui-guards.test.ts`
Expected: PASS. Then tsc and lint -> clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/sales/add-lead src/components/sales/AddLeadForm.tsx tests/sales-add-lead.test.tsx
git commit -m "feat(sales): Add a Lead (paste chat, check, save, duplicate handling)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Help & Safety page

**Files:**
- Create: `src/lib/crm/sales-help-copy.ts`
- Create: `src/app/dashboard/sales/help/page.tsx`
- Create: `src/app/dashboard/sales/help/loading.tsx`
- Create: `src/components/sales/HelpFaq.tsx`
- Create: `src/components/sales/MyNumbersCard.tsx`
- Create: `tests/sales-help-copy.test.ts`

**Interfaces:**
- Consumes: `SafetySettings`, `DEFAULT_SETTINGS` (send-limits); `getSafetySettings()` (server-only data module; called from the server page inside try/catch, display only); Task 8 `useSalesBudget`, Task 7 `budgetLine`.
- Produces:
  - `export type FaqItem = { id: string; question: string; answer: string[] }`
  - `export function helpFaq(s: SafetySettings): FaqItem[]`
  - `export const HONEST_NOTE: string`
  - `export const GOLDEN_RULES: readonly { title: string; body: string }[]`
  - `export const TOUR_STEPS: readonly { title: string; body: string }[]` (used by Task 14)
  - `export function HelpFaq({ items }: { items: FaqItem[] })`, `export function MyNumbersCard()`

**Port source:** `help-and-safety-faq-desktop.html`: breadcrumb + title "Help & WhatsApp Safety" + subtitle; "Honest Note on Safety Limits" card (`bg-pz-primary-container/20`-style card with `ShieldCheck`); "Frequent Safety Inquiries" accordion (`button aria-expanded` + rotating `ChevronDown`); "Did this answer your question? Yes / No" (local thank-you only, as in Stitch); right column "Active Connection" card -> `MyNumbersCard` (real numbers and budgets), "3 Golden Rules" card. Desktop `lg:grid-cols-12` (FAQ `lg:col-span-8`, side `lg:col-span-4`); phone stacked.
**Drop list:** "safe from carrier blocks" subtitle (replace: "Short answers about sending limits and what to do if WhatsApp warns you."), "Queue Protection: Active", "Emergency Unfreeze" phone and supervisor ping (no data), "#ProtectsYourSIM", "100% EXCELLENT", "Monthly Disciplinary Status", "Warmup Velocity Stage Tier 3", "0% risk", stock photo card, "Slack channel", "IT Support".

- [ ] **Step 1: Write the failing test**

Create `tests/sales-help-copy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/crm/send-limits";
import { GOLDEN_RULES, HONEST_NOTE, TOUR_STEPS, helpFaq } from "@/lib/crm/sales-help-copy";

const all = (s = DEFAULT_SETTINGS) =>
  [HONEST_NOTE, ...GOLDEN_RULES.flatMap((r) => [r.title, r.body]), ...TOUR_STEPS.flatMap((t) => [t.title, t.body]),
    ...helpFaq(s).flatMap((f) => [f.question, ...f.answer])].join("\n");

describe("help copy", () => {
  it("states the real limits from settings", () => {
    const text = helpFaq({ ...DEFAULT_SETTINGS, daily_cap: 45, hourly_cap: 12, spacing_min_s: 100, spacing_max_s: 200 })
      .flatMap((f) => f.answer).join(" ");
    expect(text).toContain("45 new chats a day");
    expect(text).toContain("12 in any hour");
    expect(text).toContain("100 to 200 seconds");
  });
  it("covers the spec's FAQ topics and the personal-number warning", () => {
    const ids = helpFaq(DEFAULT_SETTINGS).map((f) => f.id);
    expect(ids).toEqual(["wait", "daily", "break", "quiet", "warns", "outside", "who"]);
    expect(all()).toMatch(/personal number/i);
    expect(all()).toMatch(/My WhatsApp warns or restricts me/);
    expect(all()).toMatch(/outside the app/i);
  });
  it("never promises safety", () => {
    expect(all()).not.toMatch(/\bsafe\b|\bsafely\b|guarantee|anti-ban/i);
  });
  it("has exactly four tour steps, the last about automatic follow-ups", () => {
    expect(TOUR_STEPS.map((t) => t.title)).toEqual([
      "Start with your Today list",
      "Send a message",
      "Tap what happened",
      "We bring them back",
    ]);
  });
  it("formats quiet hours as clock times", () => {
    expect(helpFaq(DEFAULT_SETTINGS).find((f) => f.id === "quiet")!.answer.join(" ")).toContain("between 21:00 and 09:00");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-help-copy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/crm/sales-help-copy.ts`:

```ts
// Plain-words copy for Help & Safety and the Welcome Tour. Numbers come from the
// live settings so the page never disagrees with what the server enforces.
import type { SafetySettings } from "@/lib/crm/send-limits";

export type FaqItem = { id: string; question: string; answer: string[] };

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export const HONEST_NOTE =
  "WhatsApp does not publish its limits. The limits in this app are our cautious guesses. They lower the risk to your number but cannot remove it.";

export function helpFaq(s: SafetySettings): FaqItem[] {
  return [
    {
      id: "wait",
      question: "Why do I have to wait between messages?",
      answer: [
        `After each message the next one unlocks after a random gap of ${s.spacing_min_s} to ${s.spacing_max_s} seconds.`,
        "Sending lots of first messages quickly is one of the things WhatsApp watches for. Spacing them out lowers the risk.",
      ],
    },
    {
      id: "daily",
      question: "What is the daily limit?",
      answer: [
        `Each WhatsApp number can start up to ${s.daily_cap} new chats a day and ${s.hourly_cap} in any hour. You get a warning when the hour is nearly used up.`,
        "Messages to people who already replied to you do not count.",
        `A new number, or one coming back from a pause, starts at ${s.warmup_start} a day and goes up by ${s.warmup_step} each day.`,
        "If several people share one number, they share its limit.",
      ],
    },
    {
      id: "break",
      question: "What does the break mean?",
      answer: [`After ${s.burst_size} messages in a row the app pauses for ${s.burst_break_min} minutes. Use the break to write your notes.`],
    },
    {
      id: "quiet",
      question: "Why can't I send at night?",
      answer: [`No messages between ${hh(s.quiet_start_hour)} and ${hh(s.quiet_end_hour)}. People are more likely to block or report a message that arrives late.`],
    },
    {
      id: "warns",
      question: "What if WhatsApp warns me?",
      answer: [
        "Stop messaging straight away.",
        `Tap "My WhatsApp warns or restricts me" at the top of the screen. It pauses that number for ${s.freeze_hours} hours and tells your admin.`,
        "Your personal number can be restricted too, so the same rules apply when you send from it.",
      ],
    },
    {
      id: "outside",
      question: "Can I message people straight from my phone?",
      answer: [
        "Please do not message new people outside the app. The app can only count messages sent through it, so messages sent outside it use up your number's limit without anyone seeing.",
      ],
    },
    {
      id: "who",
      question: "Who do I ask?",
      answer: ["Ask your admin about moving contacts, your WhatsApp number, or anything that looks wrong."],
    },
  ];
}

export const GOLDEN_RULES: readonly { title: string; body: string }[] = [
  { title: "Check the name before you send", body: "Read the message in WhatsApp before you press send." },
  { title: "Tap what happened straight away", body: "Replied, Interested, Bought or Not interested. It keeps your list right." },
  { title: "Never work around the timer", body: "Do not message new people from your phone while the app is counting down." },
];

export const TOUR_STEPS: readonly { title: string; body: string }[] = [
  {
    title: "Start with your Today list",
    body: "Every morning the people due a message are waiting here, with people who already replied at the top. Start from the top.",
  },
  {
    title: "Send a message",
    body: "Tap Message on WhatsApp. WhatsApp opens with the message filled in. Check it and press send. The app then waits a little before the next one unlocks.",
  },
  {
    title: "Tap what happened",
    body: "When they answer, tap Replied, Interested, Bought or Not interested. No forms to fill.",
  },
  {
    title: "We bring them back",
    body: "Replied comes back tomorrow and Interested in 2 days. When you message someone you choose when they come back if you hear nothing: 8 hours, 1 day (the usual), 2 days or 3 days. Bought and Not interested leave your list.",
  },
];
```

`src/app/dashboard/sales/help/page.tsx`:

```tsx
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { getSafetySettings } from "@/lib/data/sales-numbers";
import { DEFAULT_SETTINGS, type SafetySettings } from "@/lib/crm/send-limits";
import { helpFaq, HONEST_NOTE, GOLDEN_RULES } from "@/lib/crm/sales-help-copy";
import { HelpFaq } from "@/components/sales/HelpFaq";
import { MyNumbersCard } from "@/components/sales/MyNumbersCard";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Help & Safety — Sales Workspace" };

export default async function SalesHelpPage() {
  await requireSalesAgentPage();
  // Display only: enforcement reads settings itself. A read failure shows the defaults.
  let settings: SafetySettings = DEFAULT_SETTINGS;
  try {
    settings = await getSafetySettings();
  } catch {
    settings = DEFAULT_SETTINGS;
  }
  return (
    <div className="flex flex-col gap-6 font-body">
      <header>
        <h1 className="text-2xl lg:text-3xl font-headline font-black text-pz-on-surface tracking-tight">Help & WhatsApp Safety</h1>
        <p className="text-sm text-pz-on-surface-variant mt-1">Short answers about sending limits and what to do if WhatsApp warns you.</p>
      </header>
      <div className="bg-pz-primary-container/20 rounded-xl p-4 sm:p-5 flex items-start gap-3">
        <ShieldCheck className="w-6 h-6 text-pz-primary shrink-0" />
        <div>
          <h2 className="font-headline font-bold text-pz-on-surface text-sm">An honest note about the limits</h2>
          <p className="text-sm text-pz-on-surface-variant mt-1">{HONEST_NOTE}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8"><HelpFaq items={helpFaq(settings)} /></div>
        <aside className="lg:col-span-4 flex flex-col gap-6">
          <MyNumbersCard />
          <section className="bg-pz-surface-container-lowest rounded-xl p-5 shadow-sm">
            <h2 className="font-headline font-bold text-pz-on-surface">3 golden rules</h2>
            <ol className="mt-3 flex flex-col gap-3">
              {GOLDEN_RULES.map((r, i) => (
                <li key={r.title} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-pz-primary-container text-pz-on-primary-container flex items-center justify-center text-xs font-headline font-bold shrink-0">{i + 1}</span>
                  <span><strong className="block text-sm font-headline text-pz-on-surface">{r.title}</strong><span className="text-xs text-pz-on-surface-variant">{r.body}</span></span>
                </li>
              ))}
            </ol>
          </section>
          <Link href="/dashboard/sales?tour=1" className="min-h-11 inline-flex items-center justify-center rounded-lg bg-pz-surface-container-lowest shadow-sm font-headline font-semibold text-sm text-pz-on-surface">
            Show the welcome tour again
          </Link>
        </aside>
      </div>
    </div>
  );
}
```

`loading.tsx`: `DetailSkeleton sections={3}` as in Task 10.

`src/components/sales/HelpFaq.tsx`: client accordion. One `<section>` card titled "Questions people ask" with `{items.length} answers` chip; each item is a `<div>` with a `<button aria-expanded={open} aria-controls={id}>` showing the question and a `ChevronDown` that gets `rotate-180` when open, and a `<div id={id} hidden={!open}>` with each answer paragraph. First item open by default (as in Stitch). Footer "Did this answer your question?" with Yes/No buttons that replace themselves with "Thanks!" locally.

```tsx
"use client";

import { useState } from "react";
import { ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react";
import type { FaqItem } from "@/lib/crm/sales-help-copy";

export function HelpFaq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  const [voted, setVoted] = useState(false);
  return (
    <section className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-headline font-bold text-pz-on-surface">Questions people ask</h2>
        <span className="text-xs text-pz-on-surface-variant">{items.length} answers</span>
      </div>
      {items.map((f) => {
        const isOpen = open === f.id;
        return (
          <div key={f.id} className="rounded-lg bg-pz-surface-container-low">
            <button type="button" aria-expanded={isOpen} aria-controls={`faq-${f.id}`} onClick={() => setOpen(isOpen ? null : f.id)}
              className="w-full min-h-11 px-4 py-3 flex items-center justify-between gap-3 text-left font-headline font-semibold text-sm text-pz-on-surface">
              {f.question}
              <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            <div id={`faq-${f.id}`} hidden={!isOpen} className="px-4 pb-4 flex flex-col gap-2 text-sm text-pz-on-surface-variant">
              {f.answer.map((p) => <p key={p}>{p}</p>)}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3 pt-2 text-sm">
        <span className="text-pz-on-surface-variant">Did this answer your question?</span>
        {voted ? (
          <span className="font-semibold text-pz-primary">Thanks!</span>
        ) : (
          <span className="flex gap-2">
            <button type="button" onClick={() => setVoted(true)} className="min-h-11 px-3 rounded-lg bg-pz-surface-container-low inline-flex items-center gap-1"><ThumbsUp className="w-4 h-4" />Yes</button>
            <button type="button" onClick={() => setVoted(true)} className="min-h-11 px-3 rounded-lg bg-pz-surface-container-low inline-flex items-center gap-1"><ThumbsDown className="w-4 h-4" />No</button>
          </span>
        )}
      </div>
    </section>
  );
}
```

`src/components/sales/MyNumbersCard.tsx`: client; `useSalesBudget()`; title "Your WhatsApp numbers"; for each budget: label, phone, `budgetLine`, status line ("Paused until …" / "Paused by your admin" / "Warming up: {dailyCap} a day today" when `dailyCap` is below the plain daily cap is unknown on the client, so show only paused/active), and when `budgets.length === 0` the line "No number yet. Ask your admin." Include the line "Shared numbers share one limit."

```tsx
"use client";

import { budgetLine } from "@/lib/crm/sales-ui";
import { formatDateTime } from "@/lib/format";
import { useSalesBudget } from "./SalesBudgetProvider";

export function MyNumbersCard() {
  const { budgets } = useSalesBudget();
  return (
    <section className="bg-pz-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col gap-3">
      <h2 className="font-headline font-bold text-pz-on-surface">Your WhatsApp numbers</h2>
      {budgets === null ? (
        <div className="h-16 rounded-lg bg-pz-surface-container-low animate-pulse" aria-hidden="true" />
      ) : budgets.length === 0 ? (
        <p className="text-sm text-pz-on-surface-variant">No number yet. Ask your admin.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {budgets.map(({ number, budget }) => (
            <li key={number.id} className="rounded-lg bg-pz-surface-container-low p-3 text-sm">
              <p className="font-headline font-semibold text-pz-on-surface">{number.label}</p>
              {number.phone_e164 && <p className="text-xs font-mono text-pz-on-surface-variant">{number.phone_e164}</p>}
              <p className="text-xs text-pz-on-surface-variant mt-1">{budgetLine(budget)}</p>
              {budget.frozen && (
                <p className="text-xs font-semibold text-pz-academy-error mt-1">
                  {budget.frozenUntil ? `Paused until ${formatDateTime(budget.frozenUntil)}` : "Paused by your admin"}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-pz-on-surface-variant">If several people share a number, they share its limit.</p>
    </section>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-help-copy.test.ts tests/sales-ui-guards.test.ts`
Expected: PASS. Then tsc and lint -> clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/sales-help-copy.ts src/app/dashboard/sales/help src/components/sales/HelpFaq.tsx src/components/sales/MyNumbersCard.tsx tests/sales-help-copy.test.ts
git commit -m "feat(sales): Help & Safety page with live limits and honest copy

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: One-time Welcome Tour

**Files:**
- Create: `src/components/sales/WelcomeTour.tsx`
- Create: `src/lib/crm/tour.ts`
- Modify: `src/app/dashboard/sales/layout.tsx`
- Create: `tests/sales-tour.test.tsx`

**Interfaces:**
- Consumes: `TOUR_STEPS` (Task 13); `createBrowserSupabase()` from `@/lib/supabase/client`; `Role` from `@/lib/roles`; `Dialog`, `DialogContent`, `DialogTitle`, `DialogDescription`.
- Produces:
  - `export const TOUR_LOCAL_KEY = "pz-sales-tour-seen"`
  - `export function shouldShowTour(i: { role: Role; metadataSeen: boolean; localSeen: boolean; forced: boolean }): boolean`
  - `export function WelcomeTour({ role, metadataSeen, markSeen }: { role: Role; metadataSeen: boolean; markSeen?: () => Promise<void> })` (`markSeen` injectable for tests; default writes `user_metadata.sales_tour_seen_at` then the local flag).

**Port source:** `welcome-tour-desktop.html`: modal card with eyebrow "Quick 4-step tour", title "Welcome to your sales desk", subtitle, 4 step tabs (active `bg-pz-primary text-pz-on-primary`, inactive `bg-pz-surface-container-low text-pz-on-surface-variant`, the Stitch tab classes from its script), step panel with a small static illustration on the left and text on the right, "Upcoming steps" preview row, footer "Skip tour" / dots / "Step n of 4" / "Back" / "Next: <next title>" (last: "Get started"). Phone: the dialog is near full screen (`max-md:h-[100dvh] max-md:max-w-none max-md:rounded-none` is NOT allowed (arbitrary radius rule); use `max-md:h-full max-md:w-full overflow-y-auto`), tabs become a horizontal scroll row, illustration above text.
**Drop list:** "Algorithm sorting by enrollment odds", "98% Match", "#1 Priority", "Daily Pacing is Active ... manages safe intervals and carrier compliance automatically", brochure attachment / PDF chip (we cannot attach files), "Zero Manual Template Swapping", "Instant Pipeline Sync ... leaderboard", "Set Reminder" chips, "Enrolled" (use "Bought"). Step texts come only from `TOUR_STEPS`.

- [ ] **Step 1: Write the failing test**

Create `tests/sales-tour.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { shouldShowTour } from "@/lib/crm/tour";
import { WelcomeTour } from "@/components/sales/WelcomeTour";

vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabase: () => ({ auth: { updateUser: vi.fn(async () => ({ error: null })) } }) }));

describe("shouldShowTour", () => {
  it("shows once for sales agents only, unless forced", () => {
    expect(shouldShowTour({ role: "sales_agent", metadataSeen: false, localSeen: false, forced: false })).toBe(true);
    expect(shouldShowTour({ role: "sales_agent", metadataSeen: true, localSeen: false, forced: false })).toBe(false);
    expect(shouldShowTour({ role: "sales_agent", metadataSeen: false, localSeen: true, forced: false })).toBe(false);
    expect(shouldShowTour({ role: "admin", metadataSeen: false, localSeen: false, forced: false })).toBe(false);
    expect(shouldShowTour({ role: "admin", metadataSeen: true, localSeen: true, forced: true })).toBe(true);
  });
});

describe("WelcomeTour", () => {
  beforeEach(() => { try { localStorage.clear(); } catch {} window.history.replaceState(null, "", "/dashboard/sales"); });

  it("walks through four steps and marks the tour seen at the end", async () => {
    const markSeen = vi.fn(async () => {});
    render(<WelcomeTour role="sales_agent" metadataSeen={false} markSeen={markSeen} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next: Send a message" }));
    fireEvent.click(screen.getByRole("button", { name: "Next: Tap what happened" }));
    fireEvent.click(screen.getByRole("button", { name: "Next: We bring them back" }));
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(markSeen).toHaveBeenCalledTimes(1);
  });

  it("Skip tour also marks it seen", async () => {
    const markSeen = vi.fn(async () => {});
    render(<WelcomeTour role="sales_agent" metadataSeen={false} markSeen={markSeen} />);
    fireEvent.click(await screen.findByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(markSeen).toHaveBeenCalledTimes(1));
  });

  it("does not show again once seen, but ?tour=1 replays it", async () => {
    const { unmount } = render(<WelcomeTour role="sales_agent" metadataSeen={true} markSeen={vi.fn(async () => {})} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    window.history.replaceState(null, "", "/dashboard/sales?tour=1");
    render(<WelcomeTour role="sales_agent" metadataSeen={true} markSeen={vi.fn(async () => {})} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-tour.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/crm/tour.ts`:

```ts
import type { Role } from "@/lib/roles";

export const TOUR_LOCAL_KEY = "pz-sales-tour-seen";

/** One-time tour for sales agents (decision D5); Help can replay it with ?tour=1 for anyone. */
export function shouldShowTour(i: { role: Role; metadataSeen: boolean; localSeen: boolean; forced: boolean }): boolean {
  if (i.forced) return true;
  return i.role === "sales_agent" && !i.metadataSeen && !i.localSeen;
}
```

`src/components/sales/WelcomeTour.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { TOUR_STEPS } from "@/lib/crm/sales-help-copy";
import { shouldShowTour, TOUR_LOCAL_KEY } from "@/lib/crm/tour";
import type { Role } from "@/lib/roles";

async function defaultMarkSeen() {
  try {
    await createBrowserSupabase().auth.updateUser({ data: { sales_tour_seen_at: new Date().toISOString() } });
  } catch {
    // fall through to the local flag
  }
  try {
    localStorage.setItem(TOUR_LOCAL_KEY, "1");
  } catch {
    // private mode: the tour may show again on this device, which is harmless
  }
}

function readLocalSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_LOCAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function WelcomeTour({
  role,
  metadataSeen,
  markSeen = defaultMarkSeen,
}: {
  role: Role;
  metadataSeen: boolean;
  markSeen?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Decide after mount (localStorage and the URL are browser-only; avoids a hydration mismatch).
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("tour") === "1";
    setOpen(shouldShowTour({ role, metadataSeen, localSeen: readLocalSeen(), forced }));
  }, [role, metadataSeen]);

  const finish = () => {
    setOpen(false);
    setStep(0);
    void markSeen();
  };

  const last = step === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[step];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className="sm:max-w-3xl max-md:h-full max-md:w-full overflow-y-auto font-body bg-pz-surface-container-lowest">
        <p className="text-xs font-headline font-semibold text-pz-primary uppercase tracking-wide">Quick 4-step tour</p>
        <DialogTitle className="text-2xl font-headline font-black text-pz-on-surface">Welcome to your sales desk</DialogTitle>
        <DialogDescription className="text-sm text-pz-on-surface-variant">Here is how a day works, in under two minutes.</DialogDescription>

        <div role="tablist" aria-label="Tour steps" className="flex gap-2 overflow-x-auto pb-1">
          {TOUR_STEPS.map((s, i) => (
            <button
              key={s.title}
              role="tab"
              aria-selected={i === step}
              type="button"
              onClick={() => setStep(i)}
              className={`text-left p-3 rounded-xl min-w-[140px] flex items-center gap-2.5 transition-all ${
                i === step ? "bg-pz-primary text-pz-on-primary shadow-sm" : "bg-pz-surface-container-low text-pz-on-surface-variant hover:bg-pz-surface-container"
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-pz-surface-container-lowest/20 flex items-center justify-center text-xs font-headline font-bold shrink-0">{i + 1}</span>
              <span className="text-xs font-headline font-semibold">{s.title}</span>
            </button>
          ))}
        </div>

        {/* Step panel: port the Stitch step panel; the left illustration is a small static mock built from pz tokens. */}
        <section className="bg-pz-surface-container-low rounded-xl p-4 sm:p-6 flex flex-col gap-2">
          <p className="text-xs font-headline font-semibold text-pz-secondary">Step {step + 1}</p>
          <h3 className="text-xl font-headline font-bold text-pz-on-surface">{current.title}</h3>
          <p className="text-sm text-pz-on-surface-variant">{current.body}</p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button type="button" onClick={finish} className="min-h-11 px-3 text-sm font-headline text-pz-on-surface-variant">Skip tour</button>
          <span className="text-xs text-pz-on-surface-variant">Step {step + 1} of {TOUR_STEPS.length}</span>
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="min-h-11 px-4 rounded-lg bg-pz-surface-container-low font-headline font-semibold text-sm text-pz-on-surface">Back</button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : setStep((s) => s + 1))}
              className="min-h-11 px-4 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-sm"
            >
              {last ? "Get started" : `Next: ${TOUR_STEPS[step + 1].title}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

(`min-w-[140px]` is a width, not a radius; allowed. The Stitch illustrations per step (mini queue list, message bubble, outcome pills, "comes back" card) are ported as static markup inside the step panel's left column at `md:` widths using only `pz-` tokens and sample first names; they carry no numbers or claims.)

`src/app/dashboard/sales/layout.tsx` becomes:

```tsx
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { SalesBudgetProvider } from "@/components/sales/SalesBudgetProvider";
import { BudgetBar } from "@/components/sales/BudgetBar";
import { WelcomeTour } from "@/components/sales/WelcomeTour";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireSalesAgentPage();
  const metadataSeen = Boolean((user.user_metadata as Record<string, unknown> | undefined)?.sales_tour_seen_at);
  return (
    <SalesBudgetProvider>
      <div className="space-y-6 font-body">
        <BudgetBar />
        {children}
      </div>
      <WelcomeTour role={role} metadataSeen={metadataSeen} />
    </SalesBudgetProvider>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-tour.test.tsx tests/sales-ui-guards.test.ts`
Expected: PASS. Then tsc and lint -> clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/sales/WelcomeTour.tsx src/lib/crm/tour.ts src/app/dashboard/sales/layout.tsx tests/sales-tour.test.tsx
git commit -m "feat(sales): one-time welcome tour, remembered on the account

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Admin WhatsApp Safety & Limits page

**Files:**
- Create: `src/lib/crm/sales-admin-ui.ts`
- Create: `tests/sales-admin-ui.test.ts`
- Create: `src/app/dashboard/admin/sales-safety/page.tsx`
- Create: `src/app/dashboard/admin/sales-safety/loading.tsx`
- Create: `src/components/admin/sales/SafetyLimitsPanel.tsx`
- Create: `src/components/admin/sales/NumbersSection.tsx`
- Create: `src/components/admin/sales/SettingsSection.tsx`
- Create: `src/components/admin/sales/BlockedLog.tsx`
- Create: `tests/sales-admin-panel.test.tsx`

**Interfaces:**
- Consumes: routes `GET/POST /api/admin/sales/numbers` (`{ numbers: NumberAdminJson[] }`, create body `{ label, phoneE164?, dailyCap?, hourlyCap?, agentIds }`), `PATCH /api/admin/sales/numbers/[id]` (body `{ label?, phoneE164?, dailyCap?, hourlyCap?, agentIds?, unfreeze?: true }`), `GET/PUT /api/admin/sales/settings` (`{ settings: SafetySettings }`, PUT body = changed keys only), `GET /api/admin/sales/blocked-attempts` (`{ rows: BlockedAttemptRow[] }`), `GET /api/sales/budget` (admins pass `requireSalesAgent` and get every number's budget), `POST /api/sales/numbers/[id]/freeze` (admin "Pause now"). `listSalesAgents()` server-side for the agent picker. Task 7 `budgetLine`, `BudgetJson`, `AgentBudgetJson`.
- Produces:

```ts
export type NumberAdminJson = {
  id: string; label: string; phone_e164: string | null; status: string; frozen_until: string | null;
  warmup_started_on: string; daily_cap: number | null; hourly_cap: number | null; created_at: string;
  agents: { id: string; name: string }[];
};
export type BlockedAttemptJson = { id: string; reason: string; created_at: string; number_label: string | null; agent_name: string | null; contact_name: string | null };
export function settingsPatch(stored: SafetySettings, draft: SafetySettings): Partial<SafetySettings>;
export function quietSegments(start: number, end: number): { from: number; to: number; quiet: boolean }[];
export function blockedReasonLabel(reason: string): string;
export function numberStatusLabel(row: NumberAdminJson, budget: BudgetJson | null, plainDailyCap: number): string;
export function pausedNumbers(numbers: NumberAdminJson[], log: BlockedAttemptJson[], now: Date): { id: string; label: string; until: string | null; byAgent: string | null }[];
export const ADMIN_BATCH_NOTE: string;
export function SafetyLimitsPanel({ agents }: { agents: { id: string; fullName: string }[] }): JSX.Element;
```

**Port source:** `whatsapp-safety-and-limits-admin-desktop.html` (sections in order: page header with "Add WhatsApp number" and "Save settings"; advisory card; "Connected numbers" table with columns Number & label / Status / Today's new chats / Agents / Actions; "Team-wide rules" four cards: 1 Daily & hourly, 2 Spacing & breaks, 3 Quiet hours with the 24-hour bar, 4 Warm-up & pause; sticky bottom save bar). Phone reference: `whatsapp-safety-and-limits-admin-mobile.html` (numbers as stacked cards, rules cards stacked, bottom sticky "Save settings" bar above the app bottom nav: `sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0`). Plus a "Blocked attempts" log section (not in Stitch; style it like the numbers table).
**Copy replacements:** title "WhatsApp Safety & Limits"; subtitle "Set how fast agents may start new chats, per WhatsApp number."; advisory card text = `HONEST_NOTE` from `sales-help-copy.ts` plus `ADMIN_BATCH_NOTE`; field help in plain words ("New chats per day, per number", "New chats per hour", "Warn the agent from", "Gap between messages (seconds): from / to", "Break after N messages, for M minutes", "Quiet hours (no sending): from / to", "New numbers start at N a day and add M a day", "Panic pause lasts N hours"). Footer text "Changes apply to the next message an agent sends."
**Drop list:** "Meta Cloud API • Carrier Governance Tier 2", "WA API Status Tier 2 Active • Safe", "Sim Risk Score / 99%", "Health sync refreshed", "Avg pace", "Day 2 of 7 in ramp schedule" (replace with `numberStatusLabel`), "Recommended baseline for Pakistani telco SIMs", "Forces 100% compliance via agent browser lock", "Emergency Killswitch", "Universal Compliance Engine Active", "12 sales advisor desks", "Inbound lead responses are permitted 24/7" (replace: "Replies to people who wrote first are still blocked at night; only the caps ignore them."). Phase C: a link to each agent's activity goes in this page's header later; not in B2.

- [ ] **Step 1: Write the failing tests**

Create `tests/sales-admin-ui.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/crm/send-limits";
import {
  ADMIN_BATCH_NOTE,
  blockedReasonLabel,
  numberStatusLabel,
  pausedNumbers,
  quietSegments,
  settingsPatch,
  type NumberAdminJson,
} from "@/lib/crm/sales-admin-ui";
import type { BudgetJson } from "@/lib/crm/sales-ui";

const NOW = new Date("2026-10-05T10:00:00.000Z");
const row = (over: Partial<NumberAdminJson> = {}): NumberAdminJson => ({
  id: "n1", label: "DMC 2", phone_e164: null, status: "active", frozen_until: null,
  warmup_started_on: "2026-01-01", daily_cap: null, hourly_cap: null, created_at: "2026-01-01T00:00:00Z", agents: [], ...over,
});
const budget = (over: Partial<BudgetJson> = {}): BudgetJson => ({
  dailyUsed: 0, dailyCap: 60, hourlyUsed: 0, hourlyCap: 20, hourlyWarning: false, quietHours: false,
  quietEndsAt: null, frozen: false, frozenUntil: null, nextUnlockAt: null, ...over,
});

describe("settingsPatch", () => {
  it("sends only changed keys", () => {
    expect(settingsPatch(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, daily_cap: 40, timezone: "Asia/Karachi" })).toEqual({ daily_cap: 40 });
    expect(settingsPatch(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual({});
  });
});

describe("quietSegments", () => {
  it("splits a wrapping window into night / day / night", () => {
    expect(quietSegments(21, 9)).toEqual([
      { from: 0, to: 9, quiet: true },
      { from: 9, to: 21, quiet: false },
      { from: 21, to: 24, quiet: true },
    ]);
  });
  it("handles a non-wrapping window and an empty one", () => {
    expect(quietSegments(1, 6)).toEqual([
      { from: 0, to: 1, quiet: false },
      { from: 1, to: 6, quiet: true },
      { from: 6, to: 24, quiet: false },
    ]);
    expect(quietSegments(5, 5)).toEqual([{ from: 0, to: 24, quiet: false }]);
  });
});

describe("labels", () => {
  it("explains blocked reasons", () => {
    expect(blockedReasonLabel("panic_freeze")).toBe("Agent pressed \"My WhatsApp warns or restricts me\"");
    expect(blockedReasonLabel("hourly_cap")).toBe("Hourly limit reached");
    expect(blockedReasonLabel("weird")).toBe("weird");
  });
  it("describes a number's state", () => {
    expect(numberStatusLabel(row(), budget(), 60)).toBe("Active");
    expect(numberStatusLabel(row(), budget({ dailyCap: 20 }), 60)).toBe("Warming up: 20 a day today");
    expect(numberStatusLabel(row({ daily_cap: 30 }), budget({ dailyCap: 30 }), 60)).toBe("Active");
    expect(numberStatusLabel(row({ status: "frozen" }), budget({ frozen: true }), 60)).toBe("Paused (no end date)");
    expect(numberStatusLabel(row({ status: "frozen", frozen_until: "2026-10-07T10:00:00.000Z" }), budget({ frozen: true, frozenUntil: "2026-10-07T10:00:00.000Z" }), 60)).toMatch(/^Paused until /);
  });
  it("the admin batch note says batches are not counted", () => {
    expect(ADMIN_BATCH_NOTE).toMatch(/not counted/i);
  });
});

describe("pausedNumbers", () => {
  it("lists running pauses and who pressed the panic button", () => {
    const numbers = [
      row({ id: "a", label: "A", status: "frozen", frozen_until: "2026-10-06T10:00:00.000Z" }),
      row({ id: "b", label: "B", status: "frozen", frozen_until: "2026-10-01T10:00:00.000Z" }), // expired
      row({ id: "c", label: "C", status: "frozen", frozen_until: null }),
      row({ id: "d", label: "D" }),
    ];
    const log = [{ id: "l1", reason: "panic_freeze", created_at: "2026-10-05T09:00:00.000Z", number_label: "A", agent_name: "Sara", contact_name: null }];
    expect(pausedNumbers(numbers, log, NOW)).toEqual([
      { id: "a", label: "A", until: "2026-10-06T10:00:00.000Z", byAgent: "Sara" },
      { id: "c", label: "C", until: null, byAgent: null },
    ]);
  });
});
```

Create `tests/sales-admin-panel.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SafetyLimitsPanel } from "@/components/admin/sales/SafetyLimitsPanel";
import { DEFAULT_SETTINGS } from "@/lib/crm/send-limits";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const numbers = [
  { id: "n1", label: "DMC 2", phone_e164: "+923001234567", status: "frozen", frozen_until: "2099-01-01T00:00:00.000Z",
    warmup_started_on: "2026-01-01", daily_cap: null, hourly_cap: null, created_at: "2026-01-01T00:00:00Z", agents: [{ id: "ag1", name: "Sara" }] },
];
const budgets = [{ number: { id: "n1", label: "DMC 2", phone_e164: "+923001234567" }, budget: {
  dailyUsed: 14, dailyCap: 60, hourlyUsed: 4, hourlyCap: 20, hourlyWarning: false, quietHours: false, quietEndsAt: null,
  frozen: true, frozenUntil: "2099-01-01T00:00:00.000Z", nextUnlockAt: null } }];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.unstubAllGlobals();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/admin/sales/numbers" && !init?.method) return { ok: true, json: async () => ({ numbers }) };
    if (url.startsWith("/api/sales/budget")) return { ok: true, json: async () => ({ budgets }) };
    if (url === "/api/admin/sales/settings" && !init?.method) return { ok: true, json: async () => ({ settings: DEFAULT_SETTINGS }) };
    if (url === "/api/admin/sales/settings" && init?.method === "PUT") return { ok: true, json: async () => ({ settings: { ...DEFAULT_SETTINGS, daily_cap: 40 } }) };
    if (url.startsWith("/api/admin/sales/blocked-attempts")) return { ok: true, json: async () => ({ rows: [] }) };
    if (url === "/api/admin/sales/numbers/n1" && init?.method === "PATCH") return { ok: true, json: async () => ({ ok: true }) };
    return { ok: false, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

const renderPanel = () =>
  render(<ConfirmProvider><SafetyLimitsPanel agents={[{ id: "ag1", fullName: "Sara" }]} /></ConfirmProvider>);

describe("SafetyLimitsPanel", () => {
  it("shows usage, the paused banner and the admin batch note", async () => {
    renderPanel();
    expect(await screen.findByText("14 of 60 new chats used today")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/DMC 2/);
    expect(screen.getByText(/not counted/i)).toBeTruthy();
  });

  it("saves only the changed settings", async () => {
    renderPanel();
    const input = await screen.findByLabelText("New chats per day, per number");
    fireEvent.change(input, { target: { value: "40" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save settings" })[0]);
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([u, i]) => u === "/api/admin/sales/settings" && i?.method === "PUT");
      expect(put && JSON.parse(put[1].body)).toEqual({ daily_cap: 40 });
    });
  });

  it("unpausing asks first and then patches unfreeze", async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Unpause DMC 2" }));
    fireEvent.click(await screen.findByRole("button", { name: "Unpause" }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([u, i]) => u === "/api/admin/sales/numbers/n1" && i?.method === "PATCH");
      expect(patch && JSON.parse(patch[1].body)).toEqual({ unfreeze: true });
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-admin-ui.test.ts tests/sales-admin-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/crm/sales-admin-ui.ts`:

```ts
// Client-safe helpers for the admin WhatsApp Safety & Limits page. Pure.
import type { SafetySettings } from "@/lib/crm/send-limits";
import type { BudgetJson } from "@/lib/crm/sales-ui";
import { formatDateTime } from "@/lib/format";

export type NumberAdminJson = {
  id: string; label: string; phone_e164: string | null; status: string; frozen_until: string | null;
  warmup_started_on: string; daily_cap: number | null; hourly_cap: number | null; created_at: string;
  agents: { id: string; name: string }[];
};
export type BlockedAttemptJson = {
  id: string; reason: string; created_at: string;
  number_label: string | null; agent_name: string | null; contact_name: string | null;
};

export const ADMIN_BATCH_NOTE =
  "Batches sent from CRM > WhatsApp are not counted against these limits. Avoid using a number for an admin batch on a day agents are sending from it.";

export function settingsPatch(stored: SafetySettings, draft: SafetySettings): Partial<SafetySettings> {
  const out: Partial<SafetySettings> = {};
  for (const key of Object.keys(stored) as (keyof SafetySettings)[]) {
    if (draft[key] !== stored[key]) (out as Record<string, unknown>)[key] = draft[key];
  }
  return out;
}

export function quietSegments(start: number, end: number): { from: number; to: number; quiet: boolean }[] {
  if (start === end) return [{ from: 0, to: 24, quiet: false }];
  if (start > end) {
    return [
      { from: 0, to: end, quiet: true },
      { from: end, to: start, quiet: false },
      { from: start, to: 24, quiet: true },
    ].filter((s) => s.to > s.from);
  }
  return [
    { from: 0, to: start, quiet: false },
    { from: start, to: end, quiet: true },
    { from: end, to: 24, quiet: false },
  ].filter((s) => s.to > s.from);
}

const REASONS: Record<string, string> = {
  frozen: "Number was paused",
  quiet_hours: "Tried to send at night",
  daily_cap: "Daily limit reached",
  hourly_cap: "Hourly limit reached",
  spacing: "Sent too soon after the last message",
  panic_freeze: 'Agent pressed "My WhatsApp warns or restricts me"',
};
export function blockedReasonLabel(reason: string): string {
  return REASONS[reason] ?? reason;
}

export function numberStatusLabel(row: NumberAdminJson, budget: BudgetJson | null, plainDailyCap: number): string {
  if (budget?.frozen || row.status === "frozen") {
    const until = budget?.frozenUntil ?? row.frozen_until;
    if (budget && !budget.frozen) return "Active";
    return until ? `Paused until ${formatDateTime(until)}` : "Paused (no end date)";
  }
  const cap = row.daily_cap ?? plainDailyCap;
  if (budget && budget.dailyCap < cap) return `Warming up: ${budget.dailyCap} a day today`;
  return "Active";
}

export function pausedNumbers(
  numbers: NumberAdminJson[],
  log: BlockedAttemptJson[],
  now: Date,
): { id: string; label: string; until: string | null; byAgent: string | null }[] {
  return numbers
    .filter((n) => n.status === "frozen" && (n.frozen_until === null || Date.parse(n.frozen_until) > now.getTime()))
    .map((n) => {
      const panic = log.find((l) => l.reason === "panic_freeze" && l.number_label === n.label);
      return { id: n.id, label: n.label, until: n.frozen_until, byAgent: panic?.agent_name ?? null };
    });
}
```

Note: `numberStatusLabel` for a frozen row whose timed freeze expired (`budget.frozen === false`) returns "Active"; the test's frozen cases pass `budget.frozen: true`.

`src/app/dashboard/admin/sales-safety/page.tsx`:

```tsx
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listSalesAgents } from "@/lib/data/sales-agents";
import { SafetyLimitsPanel } from "@/components/admin/sales/SafetyLimitsPanel";

export const metadata = { title: "WhatsApp Safety & Limits — PZ Academy" };

export default async function AdminSalesSafetyPage() {
  await requireAdminPage();
  const agents = await listSalesAgents();
  return (
    <div className="space-y-6 font-body">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-on-surface">WhatsApp Safety & Limits</h1>
        <p className="text-pz-on-surface-variant text-sm mt-1">Set how fast agents may start new chats, per WhatsApp number.</p>
      </div>
      <SafetyLimitsPanel agents={agents.map((a) => ({ id: a.id, fullName: a.fullName || a.email }))} />
    </div>
  );
}
```

`loading.tsx`: `TableSkeleton cols={5}`.

`src/components/admin/sales/SafetyLimitsPanel.tsx` (loads everything, owns refresh, renders the four parts):

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Info, Snowflake } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import type { SafetySettings } from "@/lib/crm/send-limits";
import type { AgentBudgetJson, BudgetJson } from "@/lib/crm/sales-ui";
import { HONEST_NOTE } from "@/lib/crm/sales-help-copy";
import { ADMIN_BATCH_NOTE, pausedNumbers, type BlockedAttemptJson, type NumberAdminJson } from "@/lib/crm/sales-admin-ui";
import { formatDateTime } from "@/lib/format";
import { NumbersSection } from "./NumbersSection";
import { SettingsSection } from "./SettingsSection";
import { BlockedLog } from "./BlockedLog";

type Loaded = {
  numbers: NumberAdminJson[];
  budgets: Map<string, BudgetJson>;
  settings: SafetySettings;
  log: BlockedAttemptJson[];
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return (await res.json()) as T;
}

export function SafetyLimitsPanel({ agents }: { agents: { id: string; fullName: string }[] }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [n, b, s, l] = await Promise.all([
        getJson<{ numbers: NumberAdminJson[] }>("/api/admin/sales/numbers"),
        getJson<{ budgets: AgentBudgetJson[] }>("/api/sales/budget"),
        getJson<{ settings: SafetySettings }>("/api/admin/sales/settings"),
        getJson<{ rows: BlockedAttemptJson[] }>("/api/admin/sales/blocked-attempts"),
      ]);
      setData({
        numbers: n.numbers,
        budgets: new Map(b.budgets.map((x) => [x.number.id, x.budget])),
        settings: s.settings,
        log: l.rows,
      });
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const paused = useMemo(() => (data ? pausedNumbers(data.numbers, data.log, new Date()) : []), [data]);

  if (error) return <ErrorState onRetry={() => void load()} />;
  if (!data) return <div className="h-64 rounded-xl bg-pz-surface-container-low animate-pulse" aria-hidden="true" />;

  return (
    <div className="flex flex-col gap-6">
      {paused.length > 0 && (
        <div role="alert" className="bg-pz-error-container text-pz-on-error-container rounded-xl p-4 text-sm flex flex-col gap-1">
          {paused.map((p) => (
            <p key={p.id} className="flex items-center gap-2">
              <Snowflake className="w-4 h-4 shrink-0" />
              <span>
                <strong>{p.label}</strong> is paused {p.until ? `until ${formatDateTime(p.until)}` : "with no end date"}
                {p.byAgent ? `. ${p.byAgent} reported a WhatsApp warning.` : "."}
              </span>
            </p>
          ))}
        </div>
      )}
      <div className="bg-pz-secondary-fixed/40 rounded-xl p-4 flex items-start gap-3 text-sm text-pz-on-surface">
        <Info className="w-5 h-5 shrink-0 text-pz-secondary" />
        <div className="flex flex-col gap-1">
          <p>{HONEST_NOTE}</p>
          <p>{ADMIN_BATCH_NOTE}</p>
        </div>
      </div>
      <NumbersSection numbers={data.numbers} budgets={data.budgets} agents={agents} plainDailyCap={data.settings.daily_cap} onChanged={load} />
      <SettingsSection settings={data.settings} onSaved={(settings) => setData((d) => (d ? { ...d, settings } : d))} />
      <BlockedLog rows={data.log} />
    </div>
  );
}
```

`src/components/admin/sales/SettingsSection.tsx` (four Stitch rule cards; one draft state; save sends `settingsPatch`; Discard resets; the save button exists twice (top of section and sticky bottom bar), both named "Save settings"):

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { SafetySettings } from "@/lib/crm/send-limits";
import { quietSegments, settingsPatch } from "@/lib/crm/sales-admin-ui";

type NumKey = Exclude<keyof SafetySettings, "timezone">;
const FIELDS: { card: string; items: { key: NumKey; label: string; help?: string }[] }[] = [
  { card: "1. New chats per day and hour", items: [
    { key: "daily_cap", label: "New chats per day, per number", help: "Replies to people who already answered do not count." },
    { key: "hourly_cap", label: "New chats per hour, per number" },
    { key: "hourly_warn_at", label: "Warn the agent from this many in an hour" },
  ] },
  { card: "2. Gaps and breaks", items: [
    { key: "spacing_min_s", label: "Gap between messages, from (seconds)" },
    { key: "spacing_max_s", label: "Gap between messages, to (seconds)" },
    { key: "burst_size", label: "Break after this many messages" },
    { key: "burst_break_min", label: "Break length (minutes)" },
  ] },
  { card: "3. Quiet hours (no sending)", items: [
    { key: "quiet_start_hour", label: "Quiet from (hour, 0-23)" },
    { key: "quiet_end_hour", label: "Quiet until (hour, 0-23)" },
  ] },
  { card: "4. New numbers and panic pause", items: [
    { key: "warmup_start", label: "New numbers start at (new chats a day)" },
    { key: "warmup_step", label: "Then add this many each day" },
    { key: "freeze_hours", label: "Panic pause lasts (hours)" },
  ] },
];

const inputClass =
  "w-full bg-pz-surface-container-low rounded-lg px-3 py-2 max-md:min-h-11 text-sm font-body text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20";

export function SettingsSection({ settings, onSaved }: { settings: SafetySettings; onSaved: (s: SafetySettings) => void }) {
  const [draft, setDraft] = useState<SafetySettings>(settings);
  useEffect(() => setDraft(settings), [settings]);
  const patch = settingsPatch(settings, draft);
  const dirty = Object.keys(patch).length > 0;

  const { run: save, pending } = useAsyncAction(async () => {
    try {
      const res = await fetch("/api/admin/sales/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => null)) as { settings?: SafetySettings; error?: string } | null;
      if (!res.ok || !body?.settings) {
        toast.error(body?.error ?? "Could not save the settings.");
        return;
      }
      toast.success("Saved. Changes apply to the next message an agent sends.");
      onSaved(body.settings);
    } catch {
      toast.error("Could not save the settings.");
    }
  });

  const saveButton = (
    <Button type="button" variant="bare" size="bare" disabled={!dirty} loading={pending} onClick={() => void save()}
      className="min-h-11 px-4 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-sm shadow-sm">
      Save settings
    </Button>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline font-bold text-lg text-pz-on-surface">Team-wide rules</h2>
        {saveButton}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {FIELDS.map((group) => (
          <div key={group.card} className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-5 shadow-sm flex flex-col gap-3">
            <h3 className="font-headline font-bold text-pz-on-surface">{group.card}</h3>
            {group.items.map((f) => (
              <div key={f.key}>
                <label htmlFor={`set-${f.key}`} className="block text-xs font-headline font-semibold text-pz-on-surface-variant mb-1">{f.label}</label>
                <input id={`set-${f.key}`} type="number" inputMode="numeric" value={draft[f.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) }))} className={inputClass} />
                {f.help && <p className="text-xs text-pz-on-surface-variant mt-1">{f.help}</p>}
              </div>
            ))}
            {group.card.startsWith("3.") && (
              <>
                <div className="flex h-3 rounded-full overflow-hidden" aria-hidden="true">
                  {quietSegments(draft.quiet_start_hour, draft.quiet_end_hour).map((s) => (
                    <div key={s.from} className={s.quiet ? "bg-pz-inverse-surface" : "bg-pz-primary-container"} style={{ width: `${((s.to - s.from) / 24) * 100}%` }} />
                  ))}
                </div>
                <label htmlFor="set-timezone" className="block text-xs font-headline font-semibold text-pz-on-surface-variant">Time zone</label>
                <input id="set-timezone" value={draft.timezone} onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))} className={inputClass} />
                <p className="text-xs text-pz-on-surface-variant">Replies to people who wrote first are still blocked at night; only the daily and hourly limits ignore them.</p>
              </>
            )}
          </div>
        ))}
      </div>
      {dirty && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 bg-pz-surface-container-lowest rounded-xl shadow-md p-3 flex items-center justify-between gap-3">
          <span className="text-sm text-pz-on-surface-variant">Changes apply to the next message an agent sends.</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setDraft(settings)} className="min-h-11 px-4 rounded-lg bg-pz-surface-container-low font-headline font-semibold text-sm text-pz-on-surface">Discard</button>
            {saveButton}
          </span>
        </div>
      )}
    </section>
  );
}
```

(The test clicks the first "Save settings"; it exists without the sticky bar. Server-side validation errors from the PUT, such as "The warning must come at or before the hourly limit", surface through `body.error` in the toast.)

`src/components/admin/sales/NumbersSection.tsx`: ONE DOM node per number (no duplicated desktop table + mobile cards, which would double every button in tests and for screen readers). Each row is a `<li>` styled as a stacked card below `lg` (port the mobile HTML number cards) and as a 5-column grid row on `lg` (`lg:grid lg:grid-cols-[2fr_1fr_1.5fr_1fr_auto] lg:items-center`, porting the desktop "Connected Lines" columns Number & label / Status / Today's new chats / Agents / Actions; a header row `hidden lg:grid` carries the column titles). Per row: label, phone, `numberStatusLabel(row, budgets.get(row.id) ?? null, plainDailyCap)`, `budgetLine(budget)` with a progress bar, agent chips, actions:
- "Edit" toggles an inline form: label, phone, daily cap override (blank = team default), hourly cap override, agents (checkbox list from `agents`). Save -> `PATCH /api/admin/sales/numbers/${id}` with `{ label, phoneE164: phone || null, dailyCap: daily === "" ? null : Number(daily), hourlyCap: ..., agentIds }`.
- Frozen rows: button with accessible name `Unpause ${label}` -> `confirm({ title: \`Unpause ${label}?\`, description: "It restarts its warm-up from today, so it starts at the new-number level again.", confirmLabel: "Unpause" })` -> `PATCH` body `{ unfreeze: true }` -> `onChanged()`.
- Active rows: button `Pause ${label}` -> confirm (`destructive`, confirmLabel "Pause now") -> `POST /api/sales/numbers/${id}/freeze` -> `onChanged()`.
- Header button "Add WhatsApp number" toggles the same form empty; Save -> `POST /api/admin/sales/numbers` with `{ label, phoneE164?, dailyCap?, hourlyCap?, agentIds }` (omit blank optional fields) -> `onChanged()`.
- Empty state: `EmptyState` icon `Phone`, "No WhatsApp numbers yet", "Add the numbers your agents send from. Each one gets its own daily limit."

Handler code (write exactly this; markup per the port rules):

```tsx
  const confirm = useConfirm();
  const { run: unpause } = useAsyncAction(async (row: NumberAdminJson) => {
    const ok = await confirm({
      title: `Unpause ${row.label}?`,
      description: "It restarts its warm-up from today, so it starts at the new-number level again.",
      confirmLabel: "Unpause",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/sales/numbers/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unfreeze: true }),
    });
    if (!res.ok) toast.error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not unpause.");
    else toast.success(`${row.label} is active again.`);
    onChanged();
  });

  const { run: pauseNow } = useAsyncAction(async (row: NumberAdminJson) => {
    const ok = await confirm({
      title: `Pause ${row.label}?`,
      description: "Agents cannot send from it until the pause ends or you unpause it.",
      confirmLabel: "Pause now",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/sales/numbers/${row.id}/freeze`, { method: "POST" });
    if (!res.ok) toast.error("Could not pause this number.");
    else toast.success(`${row.label} is paused.`);
    onChanged();
  });

  async function saveNumber(id: string | null, f: { label: string; phone: string; daily: string; hourly: string; agentIds: string[] }) {
    const capOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
    const body = id
      ? { label: f.label.trim(), phoneE164: f.phone.trim() || null, dailyCap: capOrNull(f.daily), hourlyCap: capOrNull(f.hourly), agentIds: f.agentIds }
      : {
          label: f.label.trim(),
          ...(f.phone.trim() ? { phoneE164: f.phone.trim() } : {}),
          ...(f.daily.trim() ? { dailyCap: Number(f.daily) } : {}),
          ...(f.hourly.trim() ? { hourlyCap: Number(f.hourly) } : {}),
          agentIds: f.agentIds,
        };
    const res = await fetch(id ? `/api/admin/sales/numbers/${id}` : "/api/admin/sales/numbers", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not save this number.");
      return false;
    }
    toast.success(id ? "Number updated." : "Number added. It starts warming up today.");
    onChanged();
    return true;
  }
```

Props: `{ numbers: NumberAdminJson[]; budgets: Map<string, BudgetJson>; agents: { id: string; fullName: string }[]; plainDailyCap: number; onChanged: () => void }`.

`src/components/admin/sales/BlockedLog.tsx`: section "Blocked attempts (latest 100)"; one `<li>` per row, a 5-column grid on `lg` (When / Number / Agent / Contact / What happened, header row `hidden lg:grid`) and stacked below `lg` (same single-DOM rule as NumbersSection); `formatDateTime(created_at)`, `blockedReasonLabel(reason)`, dashes for nulls; empty: "Nothing blocked yet." Note under title: "Repeated taps are logged once a minute."

- [ ] **Step 4: Run to verify they pass**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-admin-ui.test.ts tests/sales-admin-panel.test.tsx tests/sales-ui-guards.test.ts tests/api-role-gates.test.ts`
Expected: PASS. Then tsc and lint -> clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/sales-admin-ui.ts tests/sales-admin-ui.test.ts src/app/dashboard/admin/sales-safety src/components/admin/sales/SafetyLimitsPanel.tsx src/components/admin/sales/NumbersSection.tsx src/components/admin/sales/SettingsSection.tsx src/components/admin/sales/BlockedLog.tsx tests/sales-admin-panel.test.tsx
git commit -m "feat(sales): admin WhatsApp Safety & Limits page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Full verification and browser click-through (owner-assisted)

**Files:**
- No code changes expected. Any bug found becomes a fix commit in the owning file with a regression test, following that task's style.

**Interfaces:**
- Consumes: everything above; a running dev server started by the owner; the owner-supplied test account `Bp2001073hamzaahmed@gmail.com` and test contact phone `+92 330 3145940`; B1 migrations 0063 and 0064 applied.
- Produces: a short written result in the SDD ledger (`.superpowers/sdd/<this plan's ledger>/progress.md`): pass/fail per checklist line, with the viewport.

- [ ] **Step 1: Full suite, types and lint**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: all files pass.
Run: `node node_modules/typescript/bin/tsc --noEmit` -> no errors.
Run the lint command from Global Constraints -> no errors.

- [ ] **Step 2: Owner prerequisites (ask, do not do)**

Ask the owner to confirm, in one message:
1. 0063 and 0064 are applied (B1 Task 10).
2. The dev server is running (give the URL); the controller must not start it.

Already settled (do not ask): the test sales agent is `Bp2001073hamzaahmed@gmail.com` and the test contact phone is `+92 330 3145940` (E.164 `+923303145940`); it receives a real WhatsApp only if someone presses send inside WhatsApp, the app itself only opens the chat. Never use the two off-limits Test Data emails.

- [ ] **Step 3: Admin setup (as `pharmacozymeofficial@gmail.com`, desktop 1440x900)**

Using the browser tools (Playwright or Chrome DevTools MCP):
1. Sales Team page: invite the test agent; the owner completes the password email.
2. WhatsApp Safety page: "Add WhatsApp number" -> label "Test number", daily cap override 3, hourly cap override 2, assign the test agent. Check: the row shows "Warming up: 3 a day today" or "Active", "0 of 3 new chats used today".
3. Settings: confirm the defaults show (60/20/15/90/180/10/10/21/9/10/10/48/Asia/Karachi). Change nothing yet.

- [ ] **Step 4: Agent click-through, phone (390x844) then desktop (1440x900)**

Log in as the test agent. For each viewport check and record:
1. First login shows the tour; Next x3 then "Get started" closes it; reload: it does not come back. Help -> "Show the welcome tour again" replays it.
2. Bottom nav (phone) shows Today, Contacts, Add lead, Help, More; desktop sidebar shows the same plus Alerts/Settings. Visiting `/dashboard/admin/sales-safety` redirects to `/dashboard/sales`.
3. Budget bar reads "0 of 3 new chats used today" and "0 of 2 this hour"; panic button visible.
4. Add a Lead: paste "Name: Test Person\n+92 330 3145940" -> "Read it and fill in the details" fills name and phone -> Save -> success card -> "Go to Today". Add the same phone again -> duplicate message with "Open contact".
5. Today: the new contact is the focus card, "1 left today". Tap "Message on WhatsApp": WhatsApp opens (or the browser asks to open an app); the button turns into "Next message unlocks in …s" counting down; budget bar "1 of 3". The card shows "Sent" and "Done for now". Before sending, the "Bring them back in:" chips show 8 hours / 1 day / 2 days / 3 days with "1 day" selected; pick "8 hours" once and check the "Sent. They come back to your list in 8 hours..." line; the chips lock after the send.
6. Tap "Replied": card leaves, toast "Saved. They come back to your list tomorrow." Empty state "All caught up" with "Claim more contacts".
7. My Contacts: Mine tab shows the contact; open it: timeline lists Claimed, Note (if any), Messaged on WhatsApp, Replied; add a note -> appears in the timeline. Phone: the detail opens full screen with "Back to contacts".
8. Not interested -> Escape: nothing logged (timeline unchanged). Not interested -> "They asked me to stop": banner "Asked not to be contacted", no send panel.
9. All tab: a contact owned by another agent (owner assigns one via admin CRM, or skip if none exists) shows "Owned by …" and "Phone hidden"; opening it shows only name/owner/outcome. Searching its phone digits on the All tab does not find it.
10. Panic button: confirm dialog names "Test number"; after confirming, the budget bar shows "Paused until …" and the WhatsApp button reads "This number is paused". As admin, the Safety page shows the red banner "Test number is paused … reported a WhatsApp warning." and the log row "Agent pressed …". Unpause from the admin page.
11. Quiet hours: as admin set quiet hours to cover the current hour (e.g. from the current hour to the next), save; as agent the button reads "Paused overnight" with the reopening time. Restore 21 / 9 and save.
12. Hourly cap: claim/add two more test contacts with the owner's numbers only if the owner agrees; otherwise skip and rely on unit tests.
13. Light mode looks like the Stitch screens (allowing the repo radii); nothing scrolls sideways at 390 px; tap targets are at least 44 px.

- [ ] **Step 5: Cleanup SQL for the owner (hand over, do not run)**

```sql
-- Remove click-through data for the test agent (Bp2001073hamzaahmed@gmail.com) and the test contact (+923303145940).
-- (profiles has no email column; the email lives in auth.users.)
delete from public.contact_activities
  where agent_id in (select id from auth.users where email = 'Bp2001073hamzaahmed@gmail.com');
delete from public.whatsapp_blocked_attempts
  where agent_id in (select id from auth.users where email = 'Bp2001073hamzaahmed@gmail.com');
delete from public.contact_activities
  where contact_id in (select id from public.contacts where phone_e164 = '+923303145940');
delete from public.contacts where phone_e164 = '+923303145940';
delete from public.whatsapp_numbers where label = 'Test number';
```

(The owner runs it; nothing here is run by the implementer. If the stored email casing differs, use `lower(email) = lower('Bp2001073hamzaahmed@gmail.com')`.)

- [ ] **Step 6: Record and commit any fixes**

Write the checklist result into the ledger. Each fix found is its own commit (`fix(sales): ...`) with a regression test in the owning task's test file, trailer as in Global Constraints.

---

## Phase C hand-off notes

- **Follow-up choice at batch level (D1):** the campaign wizard and the sending session must expose the same "Bring them back in" choice (8 hours / 1 day / 2 days / 3 days, default 1 day), chosen once per batch and passed as `followupInHours` on every send in that batch. Reuse `FOLLOWUP_CHOICES`, `DEFAULT_FOLLOWUP_HOURS`, `isFollowupHours` and `nextFollowupAfterSend` from `src/lib/crm/followup.ts`; the server rule lives in `requestSend` (never a fixed 2 days).

## Self-review notes (done while writing)

- Spec coverage: Today (Tasks 9-10), My Contacts with timeline and right pane (11), Add lead (12), Help (13), tour (14), phone bottom nav / desktop left nav (8), visible budget on every agent screen (8, layout), panic button + freeze + admin alert (8, 15), "Asked me to stop" (9), recently-contacted warning (9, 10), warm first (2, 4), number picker + preselect + no-number explanation (7, 8, 9), countdown (7, 9), quiet hours/cap/freeze explanations (7, 9), admin numbers/usage/caps/hours/warm-up/unfreeze/blocked log (15), personal-number warning and "don't message outside the CRM" (13). Phase C items (campaigns, admin agent-activity link, agent-saved templates, `{name}` chip, message variety rule) are out of scope by design.
- B1 deferred minors covered: duplicate `""` -> null (5); relative hourly warning + wording at cap (1); hourly retryAt + quiet-hours-aware retryAt (1, 3); send -> outcome prompt + follow-up at the person's chosen time, default 1 day (2, 3, 9, D1); Today cap after warm ranking + bounded reads (4); blocked-log throttle (1, 3); admin batches bypass note (15); All-tab phone existence probe (5); restricted `do_not_contact_at` (D6) and the missing `restricted` field in the route (5). Also found and fixed: closed contacts re-entering Today (D2), indefinite freeze invisible in the budget (`frozen` flag, Task 1).
- Type names used across tasks: `BudgetJson`, `AgentBudgetJson`, `QueueCardJson`, `ContactRowJson`, `ContactDetailJson`, `TimelineEntryJson`, `TemplateJson`, `SendOkJson`, `ApiErrorJson`, `SendLock`, `SalesBudgetValue`, `SalesBudgetContext`, `NumberAdminJson`, `BlockedAttemptJson` — each defined once (Task 7, 8 or 15) and imported elsewhere.
