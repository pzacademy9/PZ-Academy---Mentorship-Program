# Subsystem C: Session Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn confirmed mentorship bookings into real scheduled `sessions` rows — student self-serve slot booking (primary path) plus an admin manual override, mentor weekly availability management, and real mentor-dashboard stats.

**Architecture:** Service-role data layer + route-level auth gate is the default (mirrors subsystem B). Two new `SECURITY DEFINER` RPCs only where the caller's own session needs `auth.uid()`-scoped writes: `update_own_mentor_availability` (mentor sets their weekly pattern) and `book_mentorship_sessions` (student commits N slots atomically, with a database-level uniqueness guard against double-booking). All new UI is extracted from four Stitch screens generated and approved during brainstorming — real markup/classes drive each component, translated from the Stitch project's raw M3 token names (`primary`, `on-surface-variant`, ...) to this repo's `pz-`-prefixed Tailwind tokens and from Material Symbols to `lucide-react`.

**Tech Stack:** Next.js App Router, Supabase (Postgres + `SECURITY DEFINER` RPCs), Zod, vitest, Tailwind (`pz-*` design tokens), `lucide-react`, `sonner` toasts, shadcn `Dialog`.

## Global Constraints

- Repo path contains `&` — always call binaries directly: `node_modules/.bin/tsc --noEmit`, `node_modules/.bin/vitest run`, `node_modules/.bin/eslint`. Never `npm run`.
- Never run `next build` while `next dev` is live — corrupts the dev server's `.next` cache. If a build is needed, kill the dev server first (find PID via `netstat -ano | grep LISTENING | grep :3945`, `Stop-Process -Id <pid> -Force`), then `rm -rf .next`.
- Every new `SECURITY DEFINER` RPC needs its `revoke execute ... from public, anon[, authenticated]` in the **same** migration as its `grant` — Supabase auto-grants execute to `anon`/`authenticated`/`public` by default (subsystem B shipped this as a follow-up fix migration; do it right the first time here).
- `database.types.ts` has no codegen in this repo — every new column and RPC needs a hand-edit to the `Tables`/`Functions` blocks, matching the existing hand-maintained style exactly.
- A "self-service RPC" does a full-column-replace, not a merge, per this repo's established convention (`update_own_mentor_profile`) — document this explicitly on both new RPCs.
- Never write `profiles.role` — not touched by this subsystem at all, but if any future task here is tempted to, check `isAdminRole()` first (not applicable to C, noted for safety).
- No ad hoc curl/manual verification beyond `tsc` + vitest + lint — that trio is sufficient per prior project feedback.
- No new npm dependencies — no date/timezone library exists in this repo (checked: no `date-fns`/`luxon`/`dayjs`/`moment` in `package.json`); slot computation uses only built-in `Intl.DateTimeFormat` with the `timeZone` option.
- `mentors.lead_time` (existing, free-text display column, e.g. "24 hours") is **not** machine-parseable — this plan adds a separate `lead_time_hours integer not null default 24` column for the real gating math. `lead_time` (text) is untouched.

---

## File Structure

**New:**
- `supabase/migrations/0031_mentorship_sessions.sql` — schema + both RPCs + grants/revokes in one migration (learn from B's split-into-two-migrations mistake).
- `src/lib/data/session-slots.ts` — pure slot-computation logic (`computeAvailableSlots`, `resolveSessionsTotal`), zero Supabase imports, fully unit-testable.
- `src/lib/validations/mentor-availability.ts` — Zod schema for the weekly pattern.
- `src/lib/validations/mentorship-sessions.ts` — Zod schemas for the student booking submission and the admin schedule-session submission.
- `src/lib/data/mentor-availability.ts` — mentor's own availability read/write (mirrors `mentor-self.ts`).
- `src/lib/data/mentorship-sessions.ts` — service-role session data layer (admin override, dashboard stats, session lists, student booking RPC wrapper).
- `src/app/api/mentor/availability/route.ts` — PATCH, mentor self-service.
- `src/app/api/admin/mentorship/sessions/route.ts` — POST, admin manual override.
- `src/app/api/mentor/sessions/[id]/route.ts` — PATCH (mark completed / cancel), mentor + admin.
- `src/app/api/sessions/book/route.ts` — POST, student self-serve booking.
- `src/app/dashboard/mentor/availability/page.tsx` + `src/components/mentor/AvailabilityForm.tsx`.
- `src/components/admin/mentorship/ScheduleSessionModal.tsx`.
- `src/components/sessions/BookSessionsStepper.tsx`.
- `src/components/mentor/UpcomingSessionsList.tsx`, `src/components/mentor/MyStudentsList.tsx`.
- `tests/session-slots.test.ts`, `tests/mentor-availability.schema.test.ts`, `tests/mentorship-sessions.schema.test.ts`.

**Modified:**
- `src/lib/supabase/database.types.ts` — new columns (`sessions.booking_id`, `mentorship_bookings.sessions_total`, `mentors.lead_time_hours`) + two new `Functions` entries.
- `src/app/dashboard/mentor/page.tsx` — real stat cards, upcoming sessions, my students (replaces B's placeholder zeros).
- `src/app/dashboard/sessions/page.tsx` — adds the "Book Your Sessions" entry point on confirmed-but-unscheduled bookings.
- `src/app/dashboard/admin/mentorship/page.tsx` — wires `ScheduleSessionModal` onto confirmed booking rows.
- `src/components/dashboard/Sidebar.tsx` — adds the "Availability" nav item for mentors.

---

### Task 1: Migration — schema + RPCs

**Files:**
- Create: `supabase/migrations/0031_mentorship_sessions.sql`

**Interfaces:**
- Produces: columns `sessions.booking_id`, `mentorship_bookings.sessions_total`, `mentors.lead_time_hours`; partial unique index `sessions_mentor_slot_unique`; RPCs `update_own_mentor_availability(p_timezone text, p_weekly_ranges jsonb) returns boolean` and `book_mentorship_sessions(p_booking_id uuid, p_slots timestamptz[]) returns integer` (returns the count of sessions created).

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 0031: Mentorship session lifecycle (subsystem C)
-- Run AFTER 0030. SQL Editor → New query → Run
-- ============================================================
-- See docs/superpowers/specs/2026-08-12-mentorship-session-lifecycle-design.md.
-- Activates public.sessions (0001), unused until now. Two SECURITY DEFINER
-- RPCs, both with their revoke in THIS migration (not a follow-up fix, per
-- the footgun subsystem B hit): update_own_mentor_availability (mentor sets
-- their weekly pattern) and book_mentorship_sessions (student commits all
-- of a package's session slots in one atomic call).

-- ─── Schema ────────────────────────────────────────────────
alter table public.sessions
  add column booking_id uuid references public.mentorship_bookings(id) on delete set null;

alter table public.mentorship_bookings
  add column sessions_total integer;

-- Free-text lead_time ("24 hours") already exists for display; this is the
-- machine-usable counterpart for real slot-gating math. Not exposed to any
-- UI in this subsystem — fixed default only.
alter table public.mentors
  add column lead_time_hours integer not null default 24;

-- Prevents two students racing for the same mentor+time from both winning.
-- Partial (excludes cancelled) so a cancelled session frees the slot for
-- rebooking.
create unique index sessions_mentor_slot_unique
  on public.sessions (mentor_id, scheduled_at)
  where status <> 'cancelled';

-- ─── update_own_mentor_availability ───────────────────────
-- Mirrors update_own_mentor_profile's shape exactly: full-column-replace,
-- not a merge. p_weekly_ranges is a jsonb array of
-- {day: 0-6, start: "HH:MM", end: "HH:MM"}, wrapped into
-- {"weeklyRanges": [...]} on write so the stored shape is self-describing.
create or replace function public.update_own_mentor_availability(
  p_timezone      text,
  p_weekly_ranges jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.mentors
  set
    timezone         = p_timezone,
    availability_json = jsonb_build_object('weeklyRanges', coalesce(p_weekly_ranges, '[]'::jsonb))
  where profile_id = auth.uid();

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

grant execute on function public.update_own_mentor_availability(text, jsonb) to authenticated;
revoke execute on function public.update_own_mentor_availability(text, jsonb) from public, anon;

-- ─── book_mentorship_sessions ─────────────────────────────
-- Caller must be the booking's own student. Resolves sessions_total (frozen
-- on the booking on first call, via the same package-name lookup the app
-- layer uses — see resolveSessionsTotal in session-slots.ts, kept in sync
-- manually since there is no shared-language procedure layer here) and
-- requires the submitted slot count to match exactly — the whole
-- "book all N sessions in one sitting" flow, not a partial book. All N
-- inserts happen in this one function invocation, so a unique-constraint
-- violation on any slot (sessions_mentor_slot_unique) aborts the entire
-- call — no partial booking of N-1 sessions.
create or replace function public.book_mentorship_sessions(
  p_booking_id uuid,
  p_slots      timestamptz[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking      record;
  v_mentor       record;
  v_target_count integer;
  v_slot         timestamptz;
  v_created      integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id, student_id, mentor_slug, package_name, status, sessions_total
  into v_booking
  from public.mentorship_bookings
  where id = p_booking_id and student_id = auth.uid();

  if v_booking.id is null then
    raise exception 'booking not found or not yours';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'booking is not confirmed';
  end if;

  select id, profile_id, session_duration_minutes, lead_time_hours
  into v_mentor
  from public.mentors
  where slug = v_booking.mentor_slug;

  if v_mentor.id is null or v_mentor.profile_id is null then
    raise exception 'mentor is not linked to an account yet';
  end if;

  v_target_count := v_booking.sessions_total;
  if v_target_count is null then
    select coalesce((pkg->>'sessions')::integer, 1)
    into v_target_count
    from public.mentors m, jsonb_array_elements(m.packages) pkg
    where m.id = v_mentor.id and pkg->>'name' = v_booking.package_name
    limit 1;

    if v_target_count is null then
      v_target_count := 1;
    end if;

    update public.mentorship_bookings set sessions_total = v_target_count where id = p_booking_id;
  end if;

  if array_length(p_slots, 1) is distinct from v_target_count then
    raise exception 'expected % session slot(s), got %', v_target_count, coalesce(array_length(p_slots, 1), 0);
  end if;

  foreach v_slot in array p_slots loop
    if v_slot < now() + (v_mentor.lead_time_hours || ' hours')::interval then
      raise exception 'slot % is inside the mentor''s % hour lead time', v_slot, v_mentor.lead_time_hours;
    end if;

    insert into public.sessions (student_id, mentor_id, status, scheduled_at, duration_min, booking_id)
    values (auth.uid(), v_mentor.profile_id, 'confirmed', v_slot, v_mentor.session_duration_minutes, p_booking_id);

    v_created := v_created + 1;
  end loop;

  return v_created;
exception
  when unique_violation then
    raise exception 'one of the selected slots was just booked by someone else — please pick again';
end;
$$;

grant execute on function public.book_mentorship_sessions(uuid, timestamptz[]) to authenticated;
revoke execute on function public.book_mentorship_sessions(uuid, timestamptz[]) from public, anon;
```

- [ ] **Step 2: Apply the migration**

Run via the Supabase MCP `apply_migration` tool (or the SQL Editor per the file's header comment) against the project (`whqdasotjlhvrjmgiffk`).

- [ ] **Step 3: Verify with advisors**

Run the Supabase MCP `get_advisors` (type: security) tool. Expected: no new findings — both RPCs must show `anon`/`public` unable to execute, only `authenticated`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0031_mentorship_sessions.sql
git commit -m "feat(db): add session lifecycle schema and RPCs (subsystem C)"
```

---

### Task 2: `database.types.ts` hand-edit

**Files:**
- Modify: `src/lib/supabase/database.types.ts:906-1006` (mentors block), `:1017-1075` (mentorship_bookings block), `:1334-1390` (sessions block), `:1434-1492` (Functions block)

**Interfaces:**
- Produces: typed columns and RPC signatures every later task's Supabase calls rely on.

- [ ] **Step 1: Add `mentors.lead_time_hours` to Row/Insert/Update**

In the `mentors` block (`database.types.ts:904`), add `lead_time_hours: number` to `Row`, `lead_time_hours?: number` to `Insert` and `Update`, alphabetically after `lead_time`:

```ts
          lead_time: string | null
          lead_time_hours: number
```
(and the `?:` variants in `Insert`/`Update` in the same position).

- [ ] **Step 2: Add `mentorship_bookings.sessions_total`**

In the `mentorship_bookings` block (`database.types.ts:1017`), add after `phone`:

```ts
          sessions_total: number | null
```
(and `sessions_total?: number | null` in `Insert`/`Update`, same alphabetical slot).

- [ ] **Step 3: Add `sessions.booking_id`**

In the `sessions` block (`database.types.ts:1334`), add after `booked_at`:

```ts
          booking_id: string | null
```
(and `booking_id?: string | null` in `Insert`/`Update`). Add to `Relationships`:

```ts
          {
            foreignKeyName: "sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "mentorship_bookings"
            referencedColumns: ["id"]
          },
```

- [ ] **Step 4: Add both RPCs to the `Functions` block**

In `database.types.ts:1434`, add alongside the existing entries (alphabetical order, so `book_mentorship_sessions` before `check_quiz_answer`, `update_own_mentor_availability` before `update_own_mentor_profile`):

```ts
      book_mentorship_sessions: {
        Args: { p_booking_id: string; p_slots: string[] }
        Returns: number
      }
```
and
```ts
      update_own_mentor_availability: {
        Args: { p_timezone: string | null; p_weekly_ranges: Json | null }
        Returns: boolean
      }
```

- [ ] **Step 5: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors (existing baseline errors, if any, unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "chore(types): hand-add session lifecycle columns and RPC signatures"
```

---

### Task 3: Pure slot-computation logic (TDD)

**Files:**
- Create: `src/lib/data/session-slots.ts`
- Test: `tests/session-slots.test.ts`

**Interfaces:**
- Produces: `computeAvailableSlots(input: SlotComputationInput): string[]`, `resolveSessionsTotal(packageName: string, packages: MentorPackage[]): number`, and the exported `WeeklyRange`/`AvailabilityPattern`/`SlotComputationInput` types — consumed by both the booking API route (Task 9) and, conceptually, mirrored in the RPC's own SQL fallback (Task 1) since Postgres can't call TypeScript.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/session-slots.test.ts
import { describe, it, expect } from "vitest";
import { computeAvailableSlots, resolveSessionsTotal } from "@/lib/data/session-slots";

describe("resolveSessionsTotal", () => {
  const packages = [
    { name: "Single Consultation", sessions: 1, price: 5000 },
    { name: "3-Session Mastery", sessions: 3, price: 12000 },
  ];

  it("returns the matching package's session count", () => {
    expect(resolveSessionsTotal("3-Session Mastery", packages)).toBe(3);
  });

  it("falls back to 1 when the package name has no match", () => {
    expect(resolveSessionsTotal("Renamed Package", packages)).toBe(1);
  });

  it("falls back to 1 for an empty packages array", () => {
    expect(resolveSessionsTotal("Anything", [])).toBe(1);
  });
});

describe("computeAvailableSlots", () => {
  // Wednesday 2026-08-12 is used as "now" throughout — a known, fixed
  // reference point so the tests don't depend on the real clock.
  const now = new Date("2026-08-12T03:00:00.000Z"); // 08:00 Asia/Karachi

  const baseInput = {
    availability: {
      weeklyRanges: [
        { day: 3, start: "09:00", end: "11:00" }, // Wednesday, 2 slots of 60min
      ],
    },
    timezone: "Asia/Karachi", // UTC+5, no DST
    durationMinutes: 60,
    leadTimeHours: 24,
    bookedSlots: [] as string[],
    now,
    daysAhead: 7,
  };

  it("generates slots only within the configured weekly window", () => {
    const slots = computeAvailableSlots(baseInput);
    // 09:00 and 10:00 Asia/Karachi on the next Wednesday (2026-08-19,
    // since 2026-08-12 itself is inside the lead time below)
    expect(slots).toEqual(["2026-08-19T04:00:00.000Z", "2026-08-19T05:00:00.000Z"]);
  });

  it("excludes slots inside the lead time", () => {
    const soon = { ...baseInput, now: new Date("2026-08-19T03:30:00.000Z"), leadTimeHours: 24 };
    // now is 1 hour before the 09:00 Karachi slot on the 19th — inside a
    // 24h lead time, so that whole day's slots are excluded, next
    // Wednesday (26th) is offered instead.
    const slots = computeAvailableSlots(soon);
    expect(slots).toEqual(["2026-08-26T04:00:00.000Z", "2026-08-26T05:00:00.000Z"]);
  });

  it("excludes slots already present in bookedSlots", () => {
    const slots = computeAvailableSlots({
      ...baseInput,
      bookedSlots: ["2026-08-19T04:00:00.000Z"],
    });
    expect(slots).toEqual(["2026-08-19T05:00:00.000Z"]);
  });

  it("returns an empty array when weeklyRanges is empty", () => {
    expect(computeAvailableSlots({ ...baseInput, availability: { weeklyRanges: [] } })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest run tests/session-slots.test.ts`
Expected: FAIL — `Cannot find module '@/lib/data/session-slots'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/data/session-slots.ts
import type { MentorPackage } from "@/lib/data/mentors";

export interface WeeklyRange {
  day: number; // 0 = Sunday .. 6 = Saturday, in the mentor's own timezone
  start: string; // "HH:MM", 24h
  end: string; // "HH:MM", 24h, exclusive
}

export interface AvailabilityPattern {
  weeklyRanges: WeeklyRange[];
}

export interface SlotComputationInput {
  availability: AvailabilityPattern;
  timezone: string; // IANA, e.g. "Asia/Karachi"
  durationMinutes: number;
  leadTimeHours: number;
  bookedSlots: string[]; // ISO timestamps already occupied for this mentor
  now: Date;
  daysAhead?: number;
}

/**
 * The package-count lookup the booking flow needs before a student can pick
 * slots. Falls back to 1 (not an error) when the booking's frozen
 * package_name no longer matches anything in the mentor's current packages
 * array — the package may have been renamed/removed by an admin edit since
 * the booking was made. Mirrored in SQL inside book_mentorship_sessions
 * (migration 0031) since Postgres can't call this function directly; keep
 * both in sync if this logic ever changes.
 */
export function resolveSessionsTotal(packageName: string, packages: MentorPackage[]): number {
  const match = packages.find((p) => p.name === packageName);
  return match?.sessions ?? 1;
}

/**
 * Returns the mentor-local weekday (0-6) and "HH:MM" time-of-day a given
 * UTC instant falls on, using Intl.DateTimeFormat rather than a date
 * library — this repo has none installed and doesn't need one for this.
 */
function localWeekdayAndTime(instant: Date, timezone: string): { day: number; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { day: WEEKDAYS.indexOf(weekdayShort), time: `${hour}:${minute}` };
}

/**
 * Generates candidate slot start times for the next `daysAhead` days
 * (default 14), filtered to the mentor's weekly pattern, minus anything in
 * `bookedSlots`, minus anything inside `leadTimeHours` of `now`. Walks in
 * `durationMinutes` increments in UTC and re-derives the mentor-local
 * weekday/time for each candidate — correct across DST boundaries in
 * `timezone` without needing a date library, since Intl does the timezone
 * math.
 */
export function computeAvailableSlots(input: SlotComputationInput): string[] {
  const { availability, timezone, durationMinutes, leadTimeHours, bookedSlots, now, daysAhead = 14 } = input;

  if (availability.weeklyRanges.length === 0) return [];

  const booked = new Set(bookedSlots);
  const earliest = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);
  const horizon = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const stepMs = durationMinutes * 60 * 1000;

  const rangesByDay = new Map<number, WeeklyRange[]>();
  for (const range of availability.weeklyRanges) {
    const list = rangesByDay.get(range.day) ?? [];
    list.push(range);
    rangesByDay.set(range.day, list);
  }

  const slots: string[] = [];
  // Start scanning from the top of the current UTC hour so results are
  // stable within a test/render pass, then walk forward in duration steps.
  let cursor = new Date(Math.floor(now.getTime() / stepMs) * stepMs);

  while (cursor < horizon) {
    if (cursor >= earliest) {
      const { day, time } = localWeekdayAndTime(cursor, timezone);
      const dayRanges = rangesByDay.get(day) ?? [];
      const withinRange = dayRanges.some((r) => time >= r.start && time < r.end);

      if (withinRange) {
        const iso = cursor.toISOString();
        if (!booked.has(iso)) slots.push(iso);
      }
    }
    cursor = new Date(cursor.getTime() + stepMs);
  }

  return slots;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run tests/session-slots.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/session-slots.ts tests/session-slots.test.ts
git commit -m "feat: add pure slot-computation logic for mentorship scheduling"
```

---

### Task 4: Validation schemas (TDD)

**Files:**
- Create: `src/lib/validations/mentor-availability.ts`, `src/lib/validations/mentorship-sessions.ts`
- Test: `tests/mentor-availability.schema.test.ts`, `tests/mentorship-sessions.schema.test.ts`

**Interfaces:**
- Consumes: nothing new (Zod only).
- Produces: `mentorAvailabilitySchema` (`{ timezone: string; weeklyRanges: {day, start, end}[] }`), `MentorAvailabilityInput` type; `bookSessionsSchema` (`{ bookingId: string; slots: string[] }`), `scheduleSessionSchema` (`{ bookingId: string; scheduledAt: string }`), and their inferred types — consumed by the three new API routes (Tasks 6, 8, 9).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/mentor-availability.schema.test.ts
import { describe, it, expect } from "vitest";
import { mentorAvailabilitySchema } from "@/lib/validations/mentor-availability";

describe("mentorAvailabilitySchema", () => {
  const valid = {
    timezone: "Asia/Karachi",
    weeklyRanges: [{ day: 1, start: "09:00", end: "17:00" }],
  };

  it("accepts a valid weekly pattern", () => {
    expect(mentorAvailabilitySchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an empty weeklyRanges array (mentor turned everything off)", () => {
    expect(mentorAvailabilitySchema.safeParse({ ...valid, weeklyRanges: [] }).success).toBe(true);
  });

  it("rejects day outside 0-6", () => {
    const r = mentorAvailabilitySchema.safeParse({ ...valid, weeklyRanges: [{ day: 7, start: "09:00", end: "17:00" }] });
    expect(r.success).toBe(false);
  });

  it("rejects end time not after start time", () => {
    const r = mentorAvailabilitySchema.safeParse({ ...valid, weeklyRanges: [{ day: 1, start: "17:00", end: "09:00" }] });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed time string", () => {
    const r = mentorAvailabilitySchema.safeParse({ ...valid, weeklyRanges: [{ day: 1, start: "9am", end: "17:00" }] });
    expect(r.success).toBe(false);
  });

  it("rejects an empty timezone", () => {
    expect(mentorAvailabilitySchema.safeParse({ ...valid, timezone: "" }).success).toBe(false);
  });
});
```

```ts
// tests/mentorship-sessions.schema.test.ts
import { describe, it, expect } from "vitest";
import { bookSessionsSchema, scheduleSessionSchema } from "@/lib/validations/mentorship-sessions";

describe("bookSessionsSchema", () => {
  it("accepts a booking id with one or more ISO slots", () => {
    const r = bookSessionsSchema.safeParse({
      bookingId: "11111111-1111-1111-1111-111111111111",
      slots: ["2026-09-01T04:00:00.000Z", "2026-09-08T04:00:00.000Z"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects zero slots", () => {
    const r = bookSessionsSchema.safeParse({
      bookingId: "11111111-1111-1111-1111-111111111111",
      slots: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid bookingId", () => {
    const r = bookSessionsSchema.safeParse({ bookingId: "not-a-uuid", slots: ["2026-09-01T04:00:00.000Z"] });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed slot string", () => {
    const r = bookSessionsSchema.safeParse({
      bookingId: "11111111-1111-1111-1111-111111111111",
      slots: ["not-a-date"],
    });
    expect(r.success).toBe(false);
  });
});

describe("scheduleSessionSchema", () => {
  it("accepts a booking id and an ISO date-time", () => {
    const r = scheduleSessionSchema.safeParse({
      bookingId: "11111111-1111-1111-1111-111111111111",
      scheduledAt: "2026-09-01T04:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing scheduledAt", () => {
    const r = scheduleSessionSchema.safeParse({ bookingId: "11111111-1111-1111-1111-111111111111" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest run tests/mentor-availability.schema.test.ts tests/mentorship-sessions.schema.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Write the implementations**

```ts
// src/lib/validations/mentor-availability.ts
import { z } from "zod";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const weeklyRangeSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: z.string().regex(TIME_RE, "Expected HH:MM"),
    end: z.string().regex(TIME_RE, "Expected HH:MM"),
  })
  .refine((r) => r.start < r.end, { message: "end must be after start", path: ["end"] });

export const mentorAvailabilitySchema = z.object({
  timezone: z.string().trim().min(1).max(100),
  weeklyRanges: z.array(weeklyRangeSchema).max(70), // 7 days * up to 10 ranges/day, generous ceiling
});

export type MentorAvailabilityInput = z.infer<typeof mentorAvailabilitySchema>;
```

```ts
// src/lib/validations/mentorship-sessions.ts
import { z } from "zod";

export const bookSessionsSchema = z.object({
  bookingId: z.string().uuid(),
  slots: z.array(z.string().datetime()).min(1).max(20),
});
export type BookSessionsInput = z.infer<typeof bookSessionsSchema>;

export const scheduleSessionSchema = z.object({
  bookingId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
});
export type ScheduleSessionInput = z.infer<typeof scheduleSessionSchema>;

export const sessionStatusUpdateSchema = z.object({
  status: z.enum(["completed", "cancelled"]),
});
export type SessionStatusUpdateInput = z.infer<typeof sessionStatusUpdateSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run tests/mentor-availability.schema.test.ts tests/mentorship-sessions.schema.test.ts`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/mentor-availability.ts src/lib/validations/mentorship-sessions.ts tests/mentor-availability.schema.test.ts tests/mentorship-sessions.schema.test.ts
git commit -m "feat: add validation schemas for availability and session booking"
```

---

### Task 5: Mentor availability data layer + API route

**Files:**
- Create: `src/lib/data/mentor-availability.ts`, `src/app/api/mentor/availability/route.ts`

**Interfaces:**
- Consumes: `mentorAvailabilitySchema`/`MentorAvailabilityInput` (Task 4), `requireMentor()` (`src/lib/auth/require-mentor.ts`, existing).
- Produces: `getOwnMentorAvailability(profileId: string): Promise<{ timezone: string; weeklyRanges: WeeklyRange[] } | null>`, `updateOwnMentorAvailability(supabase, input: MentorAvailabilityInput): Promise<{ ok: true } | { ok: false; reason: "not-found" | "db-error" }>` — consumed by the availability page (Task 6) and its API route.

- [ ] **Step 1: Write the data layer**

```ts
// src/lib/data/mentor-availability.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import type { WeeklyRange } from "@/lib/data/session-slots";
import type { MentorAvailabilityInput } from "@/lib/validations/mentor-availability";

/**
 * Mirrors mentor-self.ts's split exactly: the read goes through the
 * service-role client (the caller is already gated by requireMentor() at
 * its own route boundary); the write goes through the caller's own session
 * client so update_own_mentor_availability's `where profile_id = auth.uid()`
 * resolves to the real caller.
 */

export interface OwnAvailability {
  timezone: string;
  weeklyRanges: WeeklyRange[];
}

export async function getOwnMentorAvailability(profileId: string): Promise<OwnAvailability | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("mentors")
    .select("timezone, availability_json")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!data) return null;

  const raw = data.availability_json as { weeklyRanges?: WeeklyRange[] } | null;
  return {
    timezone: data.timezone ?? "",
    weeklyRanges: raw?.weeklyRanges ?? [],
  };
}

export type UpdateOwnAvailabilityResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export async function updateOwnMentorAvailability(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  input: MentorAvailabilityInput,
): Promise<UpdateOwnAvailabilityResult> {
  const { data, error } = await supabase.rpc("update_own_mentor_availability", {
    p_timezone: input.timezone,
    p_weekly_ranges: input.weeklyRanges,
  });

  if (error) return { ok: false, reason: "db-error" };
  if (data !== true) return { ok: false, reason: "not-found" };
  return { ok: true };
}
```

- [ ] **Step 2: Write the API route**

```ts
// src/app/api/mentor/availability/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { mentorAvailabilitySchema } from "@/lib/validations/mentor-availability";
import { updateOwnMentorAvailability } from "@/lib/data/mentor-availability";

/**
 * Saves the mentor's own weekly availability pattern. Full replace, not a
 * merge — see update_own_mentor_availability in migration 0031. A caller
 * that omits weeklyRanges from the payload turns availability off entirely,
 * it does not leave the existing pattern untouched.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const parsed = mentorAvailabilitySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateOwnMentorAvailability(auth.supabase, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "No mentor profile is linked to your account." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not save availability" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/mentor-availability.ts src/app/api/mentor/availability/route.ts
git commit -m "feat: add mentor availability data layer and API route"
```

---

### Task 6: Availability page UI (extracted from Stitch)

**Files:**
- Create: `src/app/dashboard/mentor/availability/page.tsx`, `src/components/mentor/AvailabilityForm.tsx`
- Modify: `src/components/dashboard/Sidebar.tsx`

**Interfaces:**
- Consumes: `requireMentorPage()`, `getOwnMentorAvailability` (Task 5), `WeeklyRange` (Task 3), `computeAvailableSlots` (Task 3, for the live preview panel).
- Produces: the "Availability" nav entry and page other tasks link to.

Source: Stitch screen `projects/11811490301995978699/screens/62dc9f15679443768e05b6927c33c586` ("Mentor: Manage Availability"). Structure (weekly toggle rows, timezone select, live-preview sidebar, "Save Availability" button) and classes translated 1:1 from the extracted `availability.html` — M3 token names (`primary`, `on-surface-variant`, `surface-container-lowest`, ...) become this repo's `pz-`-prefixed equivalents; Material Symbols icons become `lucide-react`; the toggle's vanilla-JS `innerHTML` swap becomes React state.

- [ ] **Step 1: Write `AvailabilityForm`**

```tsx
// src/components/mentor/AvailabilityForm.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Plus, Trash2, Save, CalendarClock } from "lucide-react";
import { MENTOR_TIMEZONES } from "@/lib/validations/admin-mentor";
import { computeAvailableSlots, type WeeklyRange } from "@/lib/data/session-slots";
import type { OwnAvailability } from "@/lib/data/mentor-availability";

const DAYS: { day: number; label: string }[] = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];

const inputClass =
  "bg-white border border-pz-outline-variant rounded-md px-3 py-2 text-pz-on-surface focus:ring-2 focus:ring-pz-primary focus:outline-none font-body w-32 shadow-sm";

function groupPreview(slots: string[], timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });
  const byDay = new Map<string, string[]>();
  for (const iso of slots) {
    const date = new Date(iso);
    const key = fmt.format(date);
    const list = byDay.get(key) ?? [];
    list.push(timeFmt.format(date));
    byDay.set(key, list);
  }
  return Array.from(byDay.entries());
}

export function AvailabilityForm({ availability }: { availability: OwnAvailability }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [timezone, setTimezone] = useState(availability.timezone || MENTOR_TIMEZONES[0]);
  const [ranges, setRanges] = useState<WeeklyRange[]>(availability.weeklyRanges);

  const preview = useMemo(() => {
    const slots = computeAvailableSlots({
      availability: { weeklyRanges: ranges },
      timezone,
      durationMinutes: 60,
      leadTimeHours: 24,
      bookedSlots: [],
      now: new Date(),
      daysAhead: 14,
    });
    return groupPreview(slots, timezone);
  }, [ranges, timezone]);

  function rangesForDay(day: number) {
    return ranges.filter((r) => r.day === day);
  }

  function toggleDay(day: number, enabled: boolean) {
    if (enabled) {
      setRanges((prev) => [...prev, { day, start: "09:00", end: "17:00" }]);
    } else {
      setRanges((prev) => prev.filter((r) => r.day !== day));
    }
  }

  function addRange(day: number) {
    setRanges((prev) => [...prev, { day, start: "09:00", end: "17:00" }]);
  }

  function removeRange(day: number, index: number) {
    const dayRanges = rangesForDay(day);
    const target = dayRanges[index];
    setRanges((prev) => prev.filter((r) => r !== target));
  }

  function updateRange(day: number, index: number, patch: Partial<WeeklyRange>) {
    const dayRanges = rangesForDay(day);
    const target = dayRanges[index];
    setRanges((prev) => prev.map((r) => (r === target ? { ...r, ...patch } : r)));
  }

  function save() {
    startTransition(async () => {
      const res = await fetch("/api/mentor/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, weeklyRanges: ranges }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not save availability.");
        return;
      }
      toast.success("Availability saved.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      <div className="flex-1 flex flex-col gap-6 w-full">
        <div className="bg-white rounded-xl shadow-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-pz-on-surface-variant">
            <Globe className="w-5 h-5 text-pz-primary" />
            <span className="font-body font-medium">Current Timezone</span>
          </div>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
            {MENTOR_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl shadow-card overflow-hidden">
          <div className="p-6 border-b border-pz-outline-variant flex justify-between items-center">
            <h3 className="font-headline font-bold text-pz-on-surface">Weekly Hours</h3>
          </div>
          <div className="flex flex-col">
            {DAYS.map(({ day, label }) => {
              const dayRanges = rangesForDay(day);
              const enabled = dayRanges.length > 0;
              return (
                <div
                  key={day}
                  className={`flex flex-col sm:flex-row p-6 border-b border-pz-outline-variant last:border-b-0 ${enabled ? "" : "bg-pz-surface-container-low opacity-75"}`}
                >
                  <div className="flex items-center w-full sm:w-40 mb-4 sm:mb-0 shrink-0 gap-4">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => toggleDay(day, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-pz-surface-dim peer-checked:bg-pz-primary rounded-full transition-colors" />
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                    </label>
                    <span className={`font-headline font-bold ${enabled ? "text-pz-on-surface" : "text-pz-on-surface-variant line-through"}`}>
                      {label}
                    </span>
                  </div>
                  {enabled ? (
                    <div className="flex-1 flex flex-col gap-3">
                      {dayRanges.map((range, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-3">
                          <input
                            type="time"
                            value={range.start}
                            onChange={(e) => updateRange(day, i, { start: e.target.value })}
                            className={inputClass}
                          />
                          <span className="text-pz-on-surface-variant">-</span>
                          <input
                            type="time"
                            value={range.end}
                            onChange={(e) => updateRange(day, i, { end: e.target.value })}
                            className={inputClass}
                          />
                          <button
                            type="button"
                            onClick={() => removeRange(day, i)}
                            className="text-pz-outline hover:text-pz-danger transition-colors p-2 rounded-full hover:bg-pz-danger/10 ml-auto sm:ml-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addRange(day)}
                        className="text-pz-primary hover:text-pz-on-primary-container font-body font-medium flex items-center gap-1 w-max transition-colors text-sm"
                      >
                        <Plus className="w-4 h-4" /> Add another range
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center">
                      <span className="font-body text-pz-on-surface-variant italic">Unavailable</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="bg-pz-lime hover:bg-pz-mint text-pz-forest px-8 py-3 rounded-lg font-headline font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save Availability"}
            <Save className="w-4 h-4" />
          </button>
        </div>
      </div>

      <aside className="w-full xl:w-[350px] shrink-0">
        <div className="bg-white rounded-xl shadow-card overflow-hidden sticky top-8 flex flex-col max-h-[700px]">
          <div className="p-6 border-b border-pz-outline-variant flex justify-between items-center">
            <h3 className="font-headline font-bold text-pz-on-surface">Live Preview</h3>
            <CalendarClock className="w-5 h-5 text-pz-tertiary" />
          </div>
          <p className="px-6 py-4 text-sm font-body text-pz-on-surface-variant border-b border-pz-outline-variant">
            Next 14 days of generated slots based on your schedule.
          </p>
          <div className="p-6 overflow-y-auto flex-1">
            {preview.length === 0 ? (
              <p className="font-body text-sm text-pz-on-surface-variant italic">No slots yet — turn on the days you're available.</p>
            ) : (
              preview.map(([date, times]) => (
                <div key={date} className="mb-6 last:mb-0">
                  <h4 className="font-headline font-bold text-pz-on-surface-variant mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-pz-primary-container" />
                    {date}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {times.map((t) => (
                      <span key={t} className="px-3 py-1.5 bg-pz-tertiary-fixed text-pz-on-tertiary-fixed-variant rounded-md font-body text-sm font-medium border border-pz-outline-variant shadow-sm">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/dashboard/mentor/availability/page.tsx
import { requireMentorPage } from "@/lib/auth/require-mentor";
import { getOwnMentorAvailability } from "@/lib/data/mentor-availability";
import { AvailabilityForm } from "@/components/mentor/AvailabilityForm";

export const metadata = { title: "Manage Availability — PZ Academy" };

export default async function MentorAvailabilityPage() {
  const { user } = await requireMentorPage();
  const availability = await getOwnMentorAvailability(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-montserrat font-bold text-2xl text-pz-forest">Manage Availability</h1>
        <p className="text-pz-muted text-sm mt-1">
          Set your recurring weekly schedule. Bookable slots are generated automatically in your local timezone.
        </p>
      </div>

      {availability ? (
        <AvailabilityForm availability={availability} />
      ) : (
        <div className="bg-white rounded-xl shadow-card p-6">
          <p className="text-pz-muted text-sm">No mentor profile is linked to your account yet. Contact an admin to get set up.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the sidebar nav entry**

In `src/components/dashboard/Sidebar.tsx:6-9`, add `Clock` to the `lucide-react` import list. In `NAV_ITEMS` (`:21-40`), add after the `"My Students"` mentor entry (`:29`):

```ts
  { label: "Availability", href: "/dashboard/mentor/availability", icon: Clock, roles: ["mentor"] },
```

- [ ] **Step 4: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/mentor/availability/page.tsx src/components/mentor/AvailabilityForm.tsx src/components/dashboard/Sidebar.tsx
git commit -m "feat: add mentor availability management page"
```

---

### Task 7: Mentorship-sessions data layer (admin/service-role side)

**Files:**
- Create: `src/lib/data/mentorship-sessions.ts`

**Interfaces:**
- Consumes: `resolveSessionsTotal` (Task 3), `MentorPackage` (`src/lib/data/mentors.ts`, existing).
- Produces: `createSessionForBooking`, `listSessionsForBooking`, `listUpcomingSessionsForMentor`, `listStudentsForMentor`, `getMentorDashboardStats`, `setSessionStatus` — consumed by the admin schedule route (Task 8), the mentor dashboard (Task 11), and the mentor session-status route.

- [ ] **Step 1: Write the data layer**

```ts
// src/lib/data/mentorship-sessions.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { resolveSessionsTotal } from "@/lib/data/session-slots";
import type { MentorPackage } from "@/lib/data/mentors";

export type SessionStatus = Database["public"]["Enums"]["session_status"];

export interface SessionRow {
  id: string;
  bookingId: string | null;
  studentId: string;
  mentorId: string;
  status: SessionStatus;
  scheduledAt: string | null;
  durationMin: number | null;
}

function toSessionRow(row: {
  id: string;
  booking_id: string | null;
  student_id: string;
  mentor_id: string;
  status: SessionStatus;
  scheduled_at: string | null;
  duration_min: number | null;
}): SessionRow {
  return {
    id: row.id,
    bookingId: row.booking_id,
    studentId: row.student_id,
    mentorId: row.mentor_id,
    status: row.status,
    scheduledAt: row.scheduled_at,
    durationMin: row.duration_min,
  };
}

const SELECT = "id, booking_id, student_id, mentor_id, status, scheduled_at, duration_min";

export async function listSessionsForBooking(bookingId: string): Promise<SessionRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("sessions").select(SELECT).eq("booking_id", bookingId).order("scheduled_at");
  return (data ?? []).map(toSessionRow);
}

export type CreateSessionResult =
  | { ok: true; sessionsTotal: number; created: number }
  | { ok: false; reason: "booking-not-found" | "not-confirmed" | "mentor-not-linked" | "student-not-linked" | "already-scheduled" | "db-error" };

/**
 * The admin manual-override path (service-role, no RPC — the caller's own
 * session isn't what's being written, so there's nothing auth.uid()-scoped
 * about this write). Creates session #1 already dated; sessions 2..N (if
 * the package has more) are created with scheduled_at = null, status =
 * 'pending', to be dated individually later via a future "Set date" action
 * on this table (not built in this subsystem — see the design spec's
 * out-of-scope list for rescheduling).
 */
export async function createSessionForBooking(params: {
  bookingId: string;
  scheduledAt: string;
}): Promise<CreateSessionResult> {
  const admin = createAdminSupabase();

  const { data: booking } = await admin
    .from("mentorship_bookings")
    .select("id, student_id, mentor_slug, package_name, status, sessions_total")
    .eq("id", params.bookingId)
    .maybeSingle();

  if (!booking) return { ok: false, reason: "booking-not-found" };
  if (booking.status !== "confirmed") return { ok: false, reason: "not-confirmed" };
  if (!booking.student_id) return { ok: false, reason: "student-not-linked" };

  const { count: existingCount } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id);
  if ((existingCount ?? 0) > 0) return { ok: false, reason: "already-scheduled" };

  const { data: mentor } = await admin
    .from("mentors")
    .select("id, profile_id, packages, session_duration_minutes")
    .eq("slug", booking.mentor_slug)
    .maybeSingle();

  if (!mentor || !mentor.profile_id) return { ok: false, reason: "mentor-not-linked" };

  const sessionsTotal =
    booking.sessions_total ?? resolveSessionsTotal(booking.package_name, (mentor.packages as unknown as MentorPackage[]) ?? []);

  if (booking.sessions_total === null) {
    await admin.from("mentorship_bookings").update({ sessions_total: sessionsTotal }).eq("id", booking.id);
  }

  const rows = Array.from({ length: sessionsTotal }, (_, i) => ({
    student_id: booking.student_id as string,
    mentor_id: mentor.profile_id as string,
    booking_id: booking.id,
    status: i === 0 ? ("confirmed" as const) : ("pending" as const),
    scheduled_at: i === 0 ? params.scheduledAt : null,
    duration_min: mentor.session_duration_minutes,
  }));

  const { error, data: inserted } = await admin.from("sessions").insert(rows).select("id");
  if (error) return { ok: false, reason: "db-error" };

  return { ok: true, sessionsTotal, created: inserted?.length ?? 0 };
}

export type SetSessionStatusResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export async function setSessionStatus(sessionId: string, status: "completed" | "cancelled"): Promise<SetSessionStatusResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("sessions").update({ status }).eq("id", sessionId).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}

export interface UpcomingSession {
  id: string;
  studentId: string;
  studentName: string;
  scheduledAt: string;
  sessionNumber: number;
  sessionsTotal: number;
  packageName: string;
}

/** Upcoming (confirmed, future) sessions for a mentor's own dashboard, newest-first by date ascending. */
export async function listUpcomingSessionsForMentor(mentorProfileId: string): Promise<UpcomingSession[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("sessions")
    .select("id, student_id, scheduled_at, booking_id, profiles!sessions_student_id_fkey(full_name)")
    .eq("mentor_id", mentorProfileId)
    .eq("status", "confirmed")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (!data || data.length === 0) return [];

  const bookingIds = Array.from(new Set(data.map((s) => s.booking_id).filter((id): id is string => id !== null)));
  const { data: bookings } = await admin.from("mentorship_bookings").select("id, package_name, sessions_total").in("id", bookingIds);
  const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));

  const results: UpcomingSession[] = [];
  for (const row of data) {
    const booking = row.booking_id ? bookingById.get(row.booking_id) : undefined;
    const siblingsForBooking = data.filter((s) => s.booking_id === row.booking_id);
    const sessionNumber = siblingsForBooking.findIndex((s) => s.id === row.id) + 1;

    results.push({
      id: row.id,
      studentId: row.student_id,
      studentName: (row.profiles as unknown as { full_name: string } | null)?.full_name ?? "Student",
      scheduledAt: row.scheduled_at as string,
      sessionNumber,
      sessionsTotal: booking?.sessions_total ?? 1,
      packageName: booking?.package_name ?? "",
    });
  }
  return results;
}

export interface MentorStudent {
  studentId: string;
  studentName: string;
  completedCount: number;
  totalCount: number;
}

/** Distinct students this mentor has any session with, most-recently-active first. */
export async function listStudentsForMentor(mentorProfileId: string): Promise<MentorStudent[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("sessions")
    .select("student_id, status, profiles!sessions_student_id_fkey(full_name)")
    .eq("mentor_id", mentorProfileId)
    .in("status", ["confirmed", "completed"]);

  if (!data) return [];

  const byStudent = new Map<string, MentorStudent>();
  for (const row of data) {
    const existing = byStudent.get(row.student_id) ?? {
      studentId: row.student_id,
      studentName: (row.profiles as unknown as { full_name: string } | null)?.full_name ?? "Student",
      completedCount: 0,
      totalCount: 0,
    };
    existing.totalCount += 1;
    if (row.status === "completed") existing.completedCount += 1;
    byStudent.set(row.student_id, existing);
  }
  return Array.from(byStudent.values());
}

export interface MentorDashboardStats {
  activeStudents: number;
  sessionsThisMonth: number;
  pendingBookings: number;
}

export async function getMentorDashboardStats(mentorSlug: string, mentorProfileId: string): Promise<MentorDashboardStats> {
  const admin = createAdminSupabase();

  const students = await listStudentsForMentor(mentorProfileId);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const { count: sessionsThisMonth } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("mentor_id", mentorProfileId)
    .in("status", ["confirmed", "completed"])
    .gte("scheduled_at", monthStart)
    .lt("scheduled_at", monthEnd);

  const { data: confirmedBookings } = await admin
    .from("mentorship_bookings")
    .select("id, sessions_total")
    .eq("mentor_slug", mentorSlug)
    .eq("status", "confirmed");

  let pendingBookings = 0;
  for (const booking of confirmedBookings ?? []) {
    const { count: scheduledCount } = await admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking.id)
      .not("scheduled_at", "is", null);
    const total = booking.sessions_total ?? 1;
    if ((scheduledCount ?? 0) < total) pendingBookings += 1;
  }

  return {
    activeStudents: students.length,
    sessionsThisMonth: sessionsThisMonth ?? 0,
    pendingBookings,
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/mentorship-sessions.ts
git commit -m "feat: add service-role session data layer for admin and dashboard"
```

---

### Task 8: Admin manual override — API route + modal (extracted from Stitch)

**Files:**
- Create: `src/app/api/admin/mentorship/sessions/route.ts`, `src/components/admin/mentorship/ScheduleSessionModal.tsx`
- Modify: `src/app/dashboard/admin/mentorship/page.tsx`

**Interfaces:**
- Consumes: `scheduleSessionSchema` (Task 4), `createSessionForBooking` (Task 7), `requireAdmin()` (existing).
- Produces: the "Schedule" action wired onto confirmed booking rows.

Source: Stitch screen `projects/11811490301995978699/screens/cecd1220635244f497bdd692ba8bd1db` ("Admin: Schedule Mentorship Session"). Uses this repo's existing shadcn `Dialog` (`@/components/ui/dialog`) rather than the raw overlay markup Stitch generated, matching `MentorshipReviewActions`'s established pattern; the summary block, date input, time select, and helper-note copy are extracted verbatim from `admin-schedule-modal.html`.

- [ ] **Step 1: Write the API route**

```ts
// src/app/api/admin/mentorship/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { scheduleSessionSchema } from "@/lib/validations/mentorship-sessions";
import { createSessionForBooking } from "@/lib/data/mentorship-sessions";

const REASON_MESSAGES: Record<string, string> = {
  "booking-not-found": "Booking not found.",
  "not-confirmed": "This booking isn't confirmed yet.",
  "mentor-not-linked": "This mentor has no linked account yet — link one from the mentor's edit page first.",
  "student-not-linked": "This booking has no matched student account.",
  "already-scheduled": "This booking already has sessions scheduled.",
  "db-error": "Could not schedule this session.",
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = scheduleSessionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await createSessionForBooking({
    bookingId: parsed.data.bookingId,
    scheduledAt: parsed.data.scheduledAt,
  });

  if (!result.ok) {
    const status = result.reason === "booking-not-found" ? 404 : result.reason === "db-error" ? 500 : 400;
    return NextResponse.json({ error: REASON_MESSAGES[result.reason] }, { status });
  }

  return NextResponse.json({ ok: true, sessionsTotal: result.sessionsTotal, created: result.created });
}
```

- [ ] **Step 2: Write the modal**

```tsx
// src/components/admin/mentorship/ScheduleSessionModal.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Info } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ScheduleSessionModal({
  bookingId,
  studentName,
  mentorName,
  packageName,
}: {
  bookingId: string;
  studentName: string;
  mentorName: string;
  packageName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!date || !time) {
      toast.error("Pick both a date and a time.");
      return;
    }
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

    startTransition(async () => {
      const res = await fetch("/api/admin/mentorship/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, scheduledAt }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not schedule this session.");
        return;
      }

      setOpen(false);
      toast.success(`Session 1 scheduled for ${studentName}.`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-headline font-bold text-pz-primary hover:bg-pz-primary/10 transition-colors"
      >
        <CalendarClock className="w-3.5 h-3.5" />
        Schedule
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Schedule Session</DialogTitle>
          </DialogHeader>

          <div className="bg-pz-surface-container p-3 rounded-lg flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="font-label text-pz-on-surface-variant">Student</span>
              <span className="font-body font-medium text-pz-on-surface">{studentName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-label text-pz-on-surface-variant">Mentor</span>
              <span className="font-body font-medium text-pz-on-surface">{mentorName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-label text-pz-on-surface-variant">Package</span>
              <span className="font-body font-medium text-pz-on-surface">{packageName}</span>
            </div>
          </div>

          <h3 className="font-headline font-semibold text-sm text-pz-on-surface border-b border-pz-outline-variant pb-1.5">Session 1</h3>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="session-date" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
              Date
            </label>
            <input
              id="session-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="session-time" className="font-headline text-xs font-semibold uppercase tracking-wide text-pz-on-surface-variant">
              Time
            </label>
            <input
              id="session-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-pz-outline-variant bg-white focus:border-pz-primary focus:ring-2 focus:ring-pz-primary/20 outline-none font-body text-sm"
            />
          </div>

          <div className="flex gap-2 items-start bg-pz-surface-container p-3 rounded-lg">
            <Info className="w-4 h-4 text-pz-tertiary shrink-0 mt-0.5" />
            <p className="font-label text-xs text-pz-tertiary leading-relaxed">
              Sessions 2 and beyond (if this package has more) will be created as unscheduled — set their dates later from this table.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50"
            >
              {isPending ? "Working…" : "Create Sessions"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Wire it into the admin mentorship page**

In `src/app/dashboard/admin/mentorship/page.tsx`, add the import:

```tsx
import { ScheduleSessionModal } from "@/components/admin/mentorship/ScheduleSessionModal";
```

In the bookings table's Actions cell (`:115-119`), add the modal next to `MentorshipReviewActions` when a booking is confirmed:

```tsx
                      <td className="py-4 px-6">
                        <div className="flex justify-end items-center gap-2">
                          {b.status === "confirmed" && (
                            <ScheduleSessionModal
                              bookingId={b.id}
                              studentName={b.fullName}
                              mentorName={b.mentorName}
                              packageName={b.packageName}
                            />
                          )}
                          <MentorshipReviewActions kind="booking" id={b.id} status={b.status} name={b.fullName} />
                        </div>
                      </td>
```

- [ ] **Step 4: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/mentorship/sessions/route.ts src/components/admin/mentorship/ScheduleSessionModal.tsx src/app/dashboard/admin/mentorship/page.tsx
git commit -m "feat: add admin manual session scheduling override"
```

---

### Task 9: Student self-serve booking — RPC wrapper + API route

**Files:**
- Create: `src/app/api/sessions/book/route.ts`
- Modify: `src/lib/data/mentorship-sessions.ts` (add the RPC wrapper)

**Interfaces:**
- Consumes: `bookSessionsSchema` (Task 4), `book_mentorship_sessions` RPC (Task 1/2).
- Produces: `bookMentorshipSessions(supabase, input: BookSessionsInput): Promise<BookSessionsResult>` — consumed by the booking API route and, indirectly, the stepper UI (Task 10).

- [ ] **Step 1: Add the RPC wrapper to the data layer**

Append to `src/lib/data/mentorship-sessions.ts`:

```ts
import type { createServerSupabase } from "@/lib/supabase/server";
import type { BookSessionsInput } from "@/lib/validations/mentorship-sessions";

export type BookSessionsResult = { ok: true; created: number } | { ok: false; message: string };

/**
 * The student's own self-serve booking commit. Goes through the caller's
 * own session client (not admin) so book_mentorship_sessions's
 * `student_id = auth.uid()` ownership check resolves to the real caller —
 * same convention as updateOwnMentorProfile/updateOwnMentorAvailability.
 */
export async function bookMentorshipSessions(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  input: BookSessionsInput,
): Promise<BookSessionsResult> {
  const { data, error } = await supabase.rpc("book_mentorship_sessions", {
    p_booking_id: input.bookingId,
    p_slots: input.slots,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, created: data ?? 0 };
}
```

- [ ] **Step 2: Write the API route**

```ts
// src/app/api/sessions/book/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { bookSessionsSchema } from "@/lib/validations/mentorship-sessions";
import { bookMentorshipSessions } from "@/lib/data/mentorship-sessions";

/**
 * Public route, login-only (no role gate) — any authenticated student can
 * book sessions on their own confirmed bookings. Matches the inline
 * auth.getUser() pattern used by /api/notifications/read rather than a
 * dedicated requireStudent() helper, since no such helper exists in this
 * repo and the real security boundary is the RPC's own
 * `student_id = auth.uid()` check, not this route.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bookSessionsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await bookMentorshipSessions(supabase, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, created: result.created });
}
```

- [ ] **Step 3: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/mentorship-sessions.ts src/app/api/sessions/book/route.ts
git commit -m "feat: add student self-serve session booking API route"
```

---

### Task 10: Book Your Sessions stepper (extracted from Stitch) + `/dashboard/sessions` wiring

**Files:**
- Create: `src/components/sessions/BookSessionsStepper.tsx`
- Modify: `src/app/dashboard/sessions/page.tsx`, `src/lib/data/mentorship-bookings.ts` (small addition: a booking-needs-scheduling flag)

**Interfaces:**
- Consumes: `computeAvailableSlots` — but slot computation needs the mentor's availability + already-booked slots, which the client doesn't have; this task adds a small read API (`GET /api/mentors/[slug]/slots`) rather than shipping availability data to the client directly.
- Produces: the "Book Your Sessions" flow on confirmed-but-unscheduled bookings.

Source: Stitch screen `projects/11811490301995978699/screens/511756cff8594e5984d836a42c9c5ec3` ("Book Your Sessions: Step 1"). The two-column layout (calendar grid left, time-slot chips right), stepper header with progress dots, mentor summary card, and lead-time info banner are extracted from `book-sessions.html`; the "Join Room" action seen in the sibling dashboard mockup is dropped — no session-link/room-URL data exists in this subsystem's scope.

- [ ] **Step 1: Add a slots-lookup API route**

```ts
// src/app/api/mentors/[slug]/slots/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { computeAvailableSlots } from "@/lib/data/session-slots";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminSupabase();

  const { data: mentor } = await admin
    .from("mentors")
    .select("id, profile_id, timezone, session_duration_minutes, lead_time_hours, availability_json")
    .eq("slug", slug)
    .maybeSingle();

  if (!mentor || !mentor.profile_id) {
    return NextResponse.json({ error: "Mentor not available for scheduling" }, { status: 404 });
  }

  const { data: booked } = await admin
    .from("sessions")
    .select("scheduled_at")
    .eq("mentor_id", mentor.profile_id)
    .not("status", "eq", "cancelled")
    .not("scheduled_at", "is", null);

  const availability = (mentor.availability_json as { weeklyRanges?: { day: number; start: string; end: string }[] } | null) ?? {
    weeklyRanges: [],
  };

  const slots = computeAvailableSlots({
    availability: { weeklyRanges: availability.weeklyRanges ?? [] },
    timezone: mentor.timezone ?? "UTC",
    durationMinutes: mentor.session_duration_minutes,
    leadTimeHours: mentor.lead_time_hours,
    bookedSlots: (booked ?? []).map((b) => b.scheduled_at as string),
    now: new Date(),
    daysAhead: 30,
  });

  return NextResponse.json({ slots, timezone: mentor.timezone ?? "UTC" });
}
```

- [ ] **Step 2: Write the stepper**

```tsx
// src/components/sessions/BookSessionsStepper.tsx
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  bookingId: string;
  mentorSlug: string;
  mentorName: string;
  packageName: string;
  sessionsNeeded: number;
}

function groupBySlotDay(slots: string[], timezone: string) {
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const map = new Map<string, string[]>();
  for (const iso of slots) {
    const key = dayFmt.format(new Date(iso));
    const list = map.get(key) ?? [];
    list.push(iso);
    map.set(key, list);
  }
  return map;
}

export function BookSessionsStepper({ bookingId, mentorSlug, mentorName, packageName, sessionsNeeded }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [allSlots, setAllSlots] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/mentors/${mentorSlug}/slots`)
      .then((r) => r.json())
      .then((data: { slots: string[]; timezone: string }) => {
        setAllSlots(data.slots);
        setTimezone(data.timezone);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Could not load available slots.");
        setLoading(false);
      });
  }, [mentorSlug]);

  const remaining = useMemo(() => allSlots.filter((s) => !selected.includes(s)), [allSlots, selected]);
  const byDay = useMemo(() => groupBySlotDay(remaining, timezone), [remaining, timezone]);
  const days = useMemo(() => Array.from(byDay.keys()), [byDay]);
  const currentDay = activeDay ?? days[0] ?? null;
  const dayFmtLong = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "short", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });

  const sessionIndex = selected.length; // 0-based index of the slot being picked now
  const done = selected.length === sessionsNeeded;

  function pickSlot(iso: string) {
    setSelected((prev) => [...prev, iso]);
    setActiveDay(null);
  }

  function confirmAll() {
    startTransition(async () => {
      const res = await fetch("/api/sessions/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, slots: selected }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not book these sessions.");
        setSelected([]);
        return;
      }
      toast.success("All sessions booked.");
      router.refresh();
    });
  }

  if (loading) {
    return <div className="bg-white rounded-xl shadow-card p-8 text-center font-body text-pz-on-surface-variant">Loading available times…</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-card overflow-hidden flex flex-col">
      <div className="border-b border-pz-outline-variant p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-headline font-bold text-pz-on-surface">Schedule Your Sessions</h2>
          <p className="font-body text-sm text-pz-on-surface-variant mt-1">
            {mentorName} — {packageName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-headline font-bold text-sm text-pz-primary">
            Session {Math.min(sessionIndex + 1, sessionsNeeded)} of {sessionsNeeded}
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: sessionsNeeded }, (_, i) => (
              <div key={i} className={`w-8 h-2 rounded-full ${i < selected.length ? "bg-pz-primary" : "bg-pz-surface-container-highest"}`} />
            ))}
          </div>
        </div>
      </div>

      {done ? (
        <div className="p-8 flex flex-col gap-4">
          <h3 className="font-headline font-bold text-pz-on-surface">Review your sessions</h3>
          <ul className="flex flex-col gap-2">
            {selected.map((iso, i) => (
              <li key={iso} className="flex items-center gap-2 font-body text-sm text-pz-on-surface">
                <span className="font-headline font-bold text-pz-primary">Session {i + 1}:</span>
                {dayFmtLong.format(new Date(iso))} at {timeFmt.format(new Date(iso))}
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setSelected([])}
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg border-2 border-pz-outline-variant text-pz-on-surface font-headline font-bold hover:bg-pz-surface-container-low transition-colors disabled:opacity-50"
            >
              Start Over
            </button>
            <button
              type="button"
              onClick={confirmAll}
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold shadow-md hover:bg-pz-on-primary-container transition-all disabled:opacity-50"
            >
              {isPending ? "Booking…" : "Confirm All Sessions"}
            </button>
          </div>
        </div>
      ) : days.length === 0 ? (
        <div className="p-8 text-center font-body text-pz-on-surface-variant">
          No available slots in the next 30 days — check back later or contact support.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-pz-outline-variant">
          <div className="p-6">
            <h3 className="font-headline font-bold text-pz-on-surface mb-4">Pick a day</h3>
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setActiveDay(day)}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-colors text-left ${
                    day === currentDay
                      ? "border-pz-primary bg-pz-primary/10 text-pz-primary font-bold"
                      : "border-pz-outline-variant text-pz-on-surface hover:bg-pz-surface-container-low"
                  }`}
                >
                  <span className="font-body text-sm">{dayFmtLong.format(new Date(byDay.get(day)![0]))}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
          <div className="p-6">
            <h3 className="font-headline font-bold text-pz-on-surface mb-4">Available times</h3>
            {currentDay ? (
              <div className="grid grid-cols-2 gap-3">
                {byDay.get(currentDay)!.map((iso) => (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => pickSlot(iso)}
                    className="border border-pz-outline-variant rounded-lg py-3 font-headline font-bold text-pz-on-surface hover:border-pz-primary hover:bg-pz-primary/5 transition-all"
                  >
                    {timeFmt.format(new Date(iso))}
                  </button>
                ))}
              </div>
            ) : (
              <p className="font-body text-sm text-pz-on-surface-variant flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Pick a day first
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add a "needs scheduling" indicator to the bookings data layer**

In `src/lib/data/mentorship-bookings.ts`, extend `MentorshipBookingRow` and `toRow`/`SELECT` to carry `sessionsTotal` and a computed `needsScheduling` flag. Add after the `status` field in the interface (`:23`):

```ts
  sessionsTotal: number | null;
  scheduledCount: number;
```

Update `SELECT` (`:61-62`) to include `sessions_total`, and add a helper that annotates rows with `scheduledCount` from a joined `sessions` count — since this is only needed on `/dashboard/sessions`, add a dedicated function rather than changing `listMyBookings`'s shared shape:

```ts
export interface MyBookingWithScheduling extends MentorshipBookingRow {
  scheduledCount: number;
}

/** listMyBookings plus each booking's scheduled-session count, for the "Book Your Sessions" CTA on /dashboard/sessions. */
export async function listMyBookingsWithScheduling(studentId: string): Promise<MyBookingWithScheduling[]> {
  const bookings = await listMyBookings(studentId);
  const admin = createAdminSupabase();

  const results: MyBookingWithScheduling[] = [];
  for (const booking of bookings) {
    const { count } = await admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking.id)
      .not("scheduled_at", "is", null);
    results.push({ ...booking, scheduledCount: count ?? 0 });
  }
  return results;
}
```

(This N+1's per booking, acceptable at this scale — a student's own booking list is small. Add `import { createAdminSupabase } from "@/lib/supabase/admin";` at the top if not already present — it is not, `mentorship-bookings.ts` currently only imports it for the admin-facing functions, confirm the import exists once at the top of the file rather than duplicating.)

Also add `sessionsTotal: row.sessions_total` to `toRow` and `sessions_total` to the `SELECT`/`RawBookingRow` — mirror the existing fields' pattern exactly (see `:43-62`).

- [ ] **Step 4: Wire the stepper into the sessions page**

Rewrite `src/app/dashboard/sessions/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Calendar } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { listMyBookingsWithScheduling } from "@/lib/data/mentorship-bookings";
import { MentorshipStatusBadge } from "@/components/admin/mentorship/MentorshipStatusBadge";
import { BookSessionsStepper } from "@/components/sessions/BookSessionsStepper";
import { formatDate } from "@/lib/format";

export const metadata = { title: "My Sessions — PZ Academy" };

export default async function MySessionsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const bookings = await listMyBookingsWithScheduling(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">My Sessions</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Track your mentorship session bookings.
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
          <Calendar className="w-10 h-10 text-pz-outline-variant mb-3" />
          <p className="font-body text-pz-on-surface-variant text-sm">No sessions booked yet.</p>
          <a href="/mentorship" className="mt-3 font-label text-pz-primary text-sm font-bold hover:underline">
            Browse mentors →
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {bookings.map((b) => {
            const needsScheduling = b.status === "confirmed" && b.scheduledCount < (b.sessionsTotal ?? 1);
            return (
              <div key={b.id} className="flex flex-col gap-4">
                <div className="p-5 rounded-xl bg-pz-surface-container border border-pz-outline-variant/10 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-headline font-bold text-pz-on-surface">{b.mentorName}</p>
                    <p className="font-body text-sm text-pz-on-surface-variant">{b.packageName}</p>
                    <p className="font-body text-xs text-pz-on-surface-variant mt-1">Booked {formatDate(b.createdAt)}</p>
                    {b.status === "cancelled" && b.cancellationReason && (
                      <p className="font-body text-xs text-pz-danger mt-1">{b.cancellationReason}</p>
                    )}
                  </div>
                  <MentorshipStatusBadge kind="booking" status={b.status} />
                </div>
                {needsScheduling && (
                  <BookSessionsStepper
                    bookingId={b.id}
                    mentorSlug={b.mentorSlug}
                    mentorName={b.mentorName}
                    packageName={b.packageName}
                    sessionsNeeded={(b.sessionsTotal ?? 1) - b.scheduledCount}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mentors/[slug]/slots/route.ts src/components/sessions/BookSessionsStepper.tsx src/app/dashboard/sessions/page.tsx src/lib/data/mentorship-bookings.ts
git commit -m "feat: add student self-serve session booking UI"
```

---

### Task 11: Mentor dashboard — real stats (extracted from Stitch)

**Files:**
- Create: `src/components/mentor/UpcomingSessionsList.tsx`, `src/components/mentor/MyStudentsList.tsx`
- Modify: `src/app/dashboard/mentor/page.tsx`, `src/app/api/mentor/sessions/[id]/route.ts` (new)

**Interfaces:**
- Consumes: `getMentorDashboardStats`, `listUpcomingSessionsForMentor`, `listStudentsForMentor`, `setSessionStatus` (Task 7).
- Produces: the finished mentor dashboard — the last piece of subsystem C.

Source: Stitch screen `projects/11811490301995978699/screens/b76eab1b90aa487fa1fa641f959d807c` ("Mentor Dashboard: Overview"). Stat-card row, session-number badge (`Session N of M`), and "Mark Completed" action extracted from `mentor-dashboard.html`; "Join Room" dropped (out of scope, no room-link data model in this subsystem).

- [ ] **Step 1: Write the mark-completed API route**

```ts
// src/app/api/mentor/sessions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { sessionStatusUpdateSchema } from "@/lib/validations/mentorship-sessions";
import { setSessionStatus } from "@/lib/data/mentorship-sessions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = sessionStatusUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await setSessionStatus(id, parsed.data.status);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason === "not-found" ? "Session not found" : "Could not update session" }, {
      status: result.reason === "not-found" ? 404 : 500,
    });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write `UpcomingSessionsList`**

```tsx
// src/components/mentor/UpcomingSessionsList.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, CheckCircle2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { UpcomingSession } from "@/lib/data/mentorship-sessions";

export function UpcomingSessionsList({ sessions }: { sessions: UpcomingSession[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function markCompleted(sessionId: string) {
    startTransition(async () => {
      const res = await fetch(`/api/mentor/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) {
        toast.error("Could not mark this session completed.");
        return;
      }
      toast.success("Session marked completed.");
      router.refresh();
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Calendar className="w-10 h-10 text-pz-border mb-3" />
        <p className="text-pz-muted text-sm">No sessions scheduled.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sessions.map((s) => {
        const isPast = new Date(s.scheduledAt) < new Date();
        return (
          <div key={s.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-pz-outline-variant/30">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-label text-xs px-2 py-0.5 bg-pz-surface-container rounded text-pz-on-surface-variant">
                  Session {s.sessionNumber} of {s.sessionsTotal}
                </span>
              </div>
              <p className="font-headline font-bold text-pz-forest truncate">{s.studentName}</p>
              <p className="font-body text-xs text-pz-muted">{formatDateTime(s.scheduledAt)}</p>
            </div>
            {isPast && (
              <button
                type="button"
                onClick={() => markCompleted(s.id)}
                disabled={isPending}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-pz-outline-variant text-pz-forest font-headline text-xs font-bold hover:bg-pz-surface-container-low transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark Completed
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Write `MyStudentsList`**

```tsx
// src/components/mentor/MyStudentsList.tsx
import { GraduationCap } from "lucide-react";
import { initials } from "@/lib/format";
import type { MentorStudent } from "@/lib/data/mentorship-sessions";

export function MyStudentsList({ students }: { students: MentorStudent[] }) {
  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <GraduationCap className="w-10 h-10 text-pz-border mb-3" />
        <p className="text-pz-muted text-sm">No active students yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {students.map((s) => (
        <div key={s.studentId} className="flex items-center gap-3">
          <span className="w-9 h-9 shrink-0 rounded-full bg-pz-lime/30 text-pz-forest grid place-items-center font-headline font-bold text-xs">
            {initials(s.studentName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-headline font-bold text-pz-forest text-sm truncate">{s.studentName}</p>
            <p className="font-body text-xs text-pz-muted">
              {s.completedCount} of {s.totalCount} sessions done
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the mentor dashboard page**

```tsx
// src/app/dashboard/mentor/page.tsx
import { requireMentorPage } from "@/lib/auth/require-mentor";
import { getOwnMentorProfile } from "@/lib/data/mentor-self";
import {
  getMentorDashboardStats,
  listUpcomingSessionsForMentor,
  listStudentsForMentor,
} from "@/lib/data/mentorship-sessions";
import { StatCard } from "@/components/dashboard/StatCard";
import { MentorSelfProfileForm } from "@/components/mentor/MentorSelfProfileForm";
import { UpcomingSessionsList } from "@/components/mentor/UpcomingSessionsList";
import { MyStudentsList } from "@/components/mentor/MyStudentsList";
import { GraduationCap, Calendar, DollarSign, Clock3 } from "lucide-react";

export const metadata = { title: "Mentor Dashboard — PZ Academy" };

export default async function MentorDashboard() {
  const { user, supabase } = await requireMentorPage();

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const firstName = profile?.full_name?.split(" ")[0] ?? "Mentor";

  const mentor = await getOwnMentorProfile(user.id);
  const stats = mentor ? await getMentorDashboardStats(mentor.slug, user.id) : null;
  const upcomingSessions = mentor ? await listUpcomingSessionsForMentor(user.id) : [];
  const students = mentor ? await listStudentsForMentor(user.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-montserrat font-bold text-2xl text-pz-forest">Welcome back, {firstName}</h1>
        <p className="text-pz-muted text-sm mt-1">Manage your students and sessions from here.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Active Students" value={stats?.activeStudents ?? 0} icon={GraduationCap} />
        <StatCard label="Sessions This Month" value={stats?.sessionsThisMonth ?? 0} icon={Calendar} iconBg="bg-pz-pine/10" />
        <StatCard label="Earnings (PKR)" value="—" icon={DollarSign} iconBg="bg-pz-lime/20" />
        <StatCard label="Pending Bookings" value={stats?.pendingBookings ?? 0} icon={Clock3} iconBg="bg-pz-frost" />
      </div>

      {mentor ? (
        <MentorSelfProfileForm mentor={mentor} />
      ) : (
        <div className="bg-white rounded-xl shadow-card p-6">
          <p className="text-pz-muted text-sm">
            No mentor profile is linked to your account yet. Contact an admin to get set up.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-card p-6">
          <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">Upcoming Sessions</h2>
          <UpcomingSessionsList sessions={upcomingSessions} />
        </div>
        <div className="bg-white rounded-xl shadow-card p-6">
          <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">My Students</h2>
          <MyStudentsList students={students} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mentor/sessions/[id]/route.ts src/components/mentor/UpcomingSessionsList.tsx src/components/mentor/MyStudentsList.tsx src/app/dashboard/mentor/page.tsx
git commit -m "feat: wire real session data into mentor dashboard"
```

---

### Task 12: Full-branch verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full type/test/lint gate**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/vitest run && node_modules/.bin/eslint .`
Expected: all clean.

- [ ] **Step 2: Live click-through**

Using the user's own allowlisted test account (`hamzaansari4you@gmail.com`):
1. As mentor: set a weekly availability pattern on `/dashboard/mentor/availability`, confirm the live preview updates.
2. As student: on a confirmed booking at `/dashboard/sessions`, book all N sessions via the stepper.
3. As admin: on `/dashboard/admin/mentorship`, confirm the new sessions show up (spot-check via Supabase table view or a follow-up read), and exercise the manual "Schedule" override on a different confirmed booking with no student account matched (expect the disabled/blocked state).
4. As mentor: on `/dashboard/mentor`, confirm stat cards, Upcoming Sessions, and My Students reflect the booked sessions; mark one completed.

- [ ] **Step 3: Report results to the user**

No further action if all green — this closes out subsystem C per `docs/superpowers/specs/2026-08-12-mentorship-session-lifecycle-design.md`.
