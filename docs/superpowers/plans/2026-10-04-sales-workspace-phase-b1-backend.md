# Sales Workspace Phase B1 (Backend and WhatsApp Safety Layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything a sales agent's screens will call: the activity timeline, follow-up rules, the Today queue, claiming, outcomes, add-lead, the server-enforced WhatsApp send limits, and the admin controls for numbers and limits. No UI in this plan.

**Architecture:** Pure, unit-tested rule modules (`followup.ts`, `send-limits.ts`) hold every decision. Thin server-only data modules (`src/lib/data/sales-*.ts`, service-role client, `{ ok, reason }` unions that never throw) apply those rules to the database. Route files under `/api/sales/*` call `requireSalesAgent()`; route files under `/api/admin/sales/*` call `requireAdmin()`. The send limits are enforced in one place, `requestSend`, which is the only code that produces a WhatsApp link. A send is counted when the link is requested, not when WhatsApp opens (the app cannot see inside WhatsApp), which errs on the cautious side.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (service-role client in server code), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-sales-agent-workspace-design.md` (Sections 3 and 5). Phase A plan: `docs/superpowers/plans/2026-10-04-sales-workspace-phase-a.md` (done). Phase B2 (screens from Stitch) and Phase C (campaign wizard, admin activity view) are separate plans.

## Global Constraints

- `npm run` is broken by the `&` in the folder path. Run `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/vitest/vitest.mjs run` (single file: `node node_modules/vitest/vitest.mjs run tests/<file>`).
- Never edit or regenerate `src/lib/supabase/database.types.ts` wholesale. Hand-add only the entries named in Task 1, copying the format of an existing table entry such as `crm_message_templates` (Row, Insert, Update, Relationships).
- Never `next build` while the dev server runs. Do not start or stop servers. Never push. Stage explicit paths only. Leave the untracked `docs/lead-capture-go-live-guide.md` alone.
- Do not apply migrations to any database in Tasks 1-9. Applying 0063 is Task 10 and needs the owner.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Repo test convention: pure-function tests only, no Supabase mocking. Anything with a decision in it lives in a pure module and is tested there. Data modules are checked by `tsc` and by the structural tests in Task 9.
- New tables have RLS enabled and NO policies (service-role only), like the other CRM tables. All access goes through server code, so every sales route must call `requireSalesAgent()` and every contact action must go through `canActOnContact` / `canClaimContact` (`src/lib/crm/ownership.ts`).
- Every `/api/admin/*` route must call `requireAdmin(` and must not mention `requireSalesAgent` (pinned by `tests/api-role-gates.test.ts`). Every `/api/sales/*` route must call `requireSalesAgent(`.
- Route handlers: mirror `src/app/api/admin/crm/whatsapp/batches/[id]/route.ts` for the dynamic-segment `params` signature and `src/app/api/admin/crm/manual-conversions/route.ts` for the body, error and status shape (`{ error: string }`, 201 on create).
- Safety defaults (admin-adjustable, owner-tuned 2026-10-04): 60 new chats per day per number; 20 per rolling hour with a warning from the 15th; random 90-180 s between sends; a 10-minute break after every 10 sends; quiet hours 21:00-09:00 in `Asia/Karachi`; warm-up starts at 10 a day and rises by 10 a day; panic freeze 48 hours. These are cautious guesses, not guarantees: no copy, comment or message may call them "safe" or "guaranteed".
- Migration number: `0063`. Timezone constant lives in the settings row (`timezone`, default `Asia/Karachi`); no code hard-codes it except `DEFAULT_SETTINGS`.

## Review Focus

- Quiet hours cross midnight (21:00-09:00): 20:59:59 allowed, 21:00:00 blocked, 08:59:59 blocked, 09:00:00 allowed (Task 3 tests).
- Local-day boundary: the daily count resets at local midnight, not UTC midnight (Task 3 tests with `startOfLocalDay`).
- Warm-up arithmetic: day 0 is 10, day 5 reaches 60, a per-number override below the ramp wins, a warm-up start date in the future never goes negative (Task 3 tests).
- A freeze that has expired must not block; a freeze with no end date must block (Task 3 tests).
- Spacing is inclusive: a send exactly at `nextUnlockAt` is allowed (Task 3 tests).
- The burst counter resets after a long gap and the 10th send locks for the break, not the 90-180 s spacing (Task 3 tests).
- Replies and known two-way contacts are not "new chats": they ignore the caps but still obey frozen, quiet hours and spacing (Task 3 tests).
- Two taps racing on a shared number must not both pass; after inserting, the send is re-verified and rolled back if it broke a limit (Task 3 `violationAfterInsert` tests, Task 7 code).
- A contact with `do_not_contact_at` or `whatsapp_unsubscribed_at` never reaches the queue or a send (Task 6 and 7 code, structural test in Task 9).
- Search input can carry commas, parentheses and `%`, which break PostgREST `or()` filters (Task 4 `sanitizeSearch` tests).
- An actor with an empty id must never own anything (already pinned in Phase A; Task 9 asserts the data modules go through the helpers).

---

### Task 1: Migration 0063 and type entries

**Files:**
- Create: `supabase/migrations/0063_sales_workspace_core.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand edits only)
- Create: `tests/migrations-sales-workspace.test.ts`

**Interfaces:**
- Consumes: `public.contacts`, `public.profiles` (existing).
- Produces: tables `whatsapp_numbers`, `whatsapp_number_agents`, `whatsapp_safety_settings`, `whatsapp_blocked_attempts`, `contact_activities`; columns `contacts.next_followup_at`, `contacts.last_outcome`, `contacts.do_not_contact_at`. Later tasks use exactly these names.

- [ ] **Step 1: Write the failing test**

Create `tests/migrations-sales-workspace.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0063_sales_workspace_core.sql"),
  "utf8",
);
const types = readFileSync(
  join(process.cwd(), "src", "lib", "supabase", "database.types.ts"),
  "utf8",
);

describe("0063 sales workspace core", () => {
  it("creates the five tables idempotently with RLS enabled", () => {
    for (const t of [
      "whatsapp_numbers",
      "whatsapp_number_agents",
      "whatsapp_safety_settings",
      "whatsapp_blocked_attempts",
      "contact_activities",
    ]) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`, "i"));
      expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, "i"));
    }
  });

  it("creates no policies", () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it("adds the contact columns", () => {
    expect(sql).toMatch(/add column if not exists next_followup_at timestamptz/i);
    expect(sql).toMatch(/add column if not exists last_outcome text/i);
    expect(sql).toMatch(/add column if not exists do_not_contact_at timestamptz/i);
  });

  it("restricts activity kinds", () => {
    for (const k of [
      "sent", "replied", "interested", "bought", "not_interested",
      "note", "claimed", "reassigned", "released",
    ]) {
      expect(sql).toContain(`'${k}'`);
    }
  });

  it("indexes the queue and the limit counters", () => {
    expect(sql).toMatch(/contacts_owner_followup_idx/i);
    expect(sql).toMatch(/contact_activities_number_kind_created_idx/i);
    expect(sql).toMatch(/contact_activities_contact_created_idx/i);
  });

  it("seeds exactly one settings row with the owner defaults", () => {
    expect(sql).toMatch(/insert into public\.whatsapp_safety_settings/i);
    expect(sql).toMatch(/on conflict \(id\) do nothing/i);
    expect(sql).toMatch(/daily_cap\s+integer not null default 60/i);
    expect(sql).toMatch(/hourly_cap\s+integer not null default 20/i);
    expect(sql).toMatch(/'Asia\/Karachi'/);
  });
});

describe("database.types.ts hand edits for 0063", () => {
  it("has the new tables", () => {
    for (const t of [
      "whatsapp_numbers",
      "whatsapp_number_agents",
      "whatsapp_safety_settings",
      "whatsapp_blocked_attempts",
      "contact_activities",
    ]) {
      expect(types).toContain(`      ${t}: {`);
    }
  });

  it("has the new contact columns in Row, Insert and Update", () => {
    const contacts = types.slice(types.indexOf("      contacts: {"), types.indexOf("      courses: {"));
    for (const col of ["next_followup_at", "last_outcome", "do_not_contact_at"]) {
      expect(contacts.match(new RegExp(`${col}\\??: string \\| null`, "g"))?.length).toBe(3);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/migrations-sales-workspace.test.ts`
Expected: FAIL (ENOENT, the migration file does not exist).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0063_sales_workspace_core.sql`:

```sql
-- Migration 0063: sales workspace core (activity timeline, follow-ups,
-- WhatsApp numbers and the safety settings / blocked-attempt log).
-- No existing enum is altered, so this can run in one transaction.
-- All new tables: RLS on, no policies (service-role access only), like the
-- other CRM tables.

-- Contacts: follow-up scheduling, last outcome, permanent do-not-contact.
alter table public.contacts
  add column if not exists next_followup_at timestamptz,
  add column if not exists last_outcome text
    check (last_outcome in ('replied', 'interested', 'bought', 'not_interested')),
  add column if not exists do_not_contact_at timestamptz;

create index if not exists contacts_owner_followup_idx
  on public.contacts (owner_id, next_followup_at);

-- Sending WhatsApp numbers. One shared budget per number.
create table if not exists public.whatsapp_numbers (
  id               uuid primary key default gen_random_uuid(),
  label            text not null,
  phone_e164       text,
  status           text not null default 'active' check (status in ('active', 'frozen')),
  frozen_until     timestamptz,
  warmup_started_on date not null default ((now() at time zone 'Asia/Karachi')::date),
  daily_cap        integer check (daily_cap is null or daily_cap > 0),
  hourly_cap       integer check (hourly_cap is null or hourly_cap > 0),
  created_at       timestamptz not null default now()
);
alter table public.whatsapp_numbers enable row level security;

create table if not exists public.whatsapp_number_agents (
  number_id  uuid not null references public.whatsapp_numbers(id) on delete cascade,
  agent_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (number_id, agent_id)
);
alter table public.whatsapp_number_agents enable row level security;
create index if not exists whatsapp_number_agents_agent_idx
  on public.whatsapp_number_agents (agent_id);

-- Single-row admin-editable defaults (id is always true).
create table if not exists public.whatsapp_safety_settings (
  id               boolean primary key default true check (id),
  daily_cap        integer not null default 60 check (daily_cap > 0),
  hourly_cap       integer not null default 20 check (hourly_cap > 0),
  hourly_warn_at   integer not null default 15 check (hourly_warn_at > 0),
  spacing_min_s    integer not null default 90 check (spacing_min_s >= 0),
  spacing_max_s    integer not null default 180 check (spacing_max_s >= spacing_min_s),
  burst_size       integer not null default 10 check (burst_size > 0),
  burst_break_min  integer not null default 10 check (burst_break_min >= 0),
  quiet_start_hour integer not null default 21 check (quiet_start_hour between 0 and 23),
  quiet_end_hour   integer not null default 9 check (quiet_end_hour between 0 and 23),
  warmup_start     integer not null default 10 check (warmup_start > 0),
  warmup_step      integer not null default 10 check (warmup_step >= 0),
  freeze_hours     integer not null default 48 check (freeze_hours > 0),
  timezone         text not null default 'Asia/Karachi',
  updated_at       timestamptz not null default now()
);
alter table public.whatsapp_safety_settings enable row level security;
insert into public.whatsapp_safety_settings (id) values (true) on conflict (id) do nothing;

-- Append-only timeline. Also the source of truth for the send limits.
create table if not exists public.contact_activities (
  id             uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references public.contacts(id) on delete cascade,
  agent_id       uuid references public.profiles(id) on delete set null,
  kind           text not null check (kind in (
    'sent', 'replied', 'interested', 'bought', 'not_interested',
    'note', 'claimed', 'reassigned', 'released'
  )),
  body           text,
  number_id      uuid references public.whatsapp_numbers(id) on delete set null,
  is_new_chat    boolean not null default false,
  burst_pos      integer,
  next_unlock_at timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.contact_activities enable row level security;
create index if not exists contact_activities_contact_created_idx
  on public.contact_activities (contact_id, created_at desc);
create index if not exists contact_activities_number_kind_created_idx
  on public.contact_activities (number_id, kind, created_at desc);
create index if not exists contact_activities_agent_kind_created_idx
  on public.contact_activities (agent_id, kind, created_at desc);

-- Log of sends the server refused (and panic freezes), for the admin page.
create table if not exists public.whatsapp_blocked_attempts (
  id         uuid primary key default gen_random_uuid(),
  number_id  uuid references public.whatsapp_numbers(id) on delete set null,
  agent_id   uuid references public.profiles(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  reason     text not null,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_blocked_attempts enable row level security;
create index if not exists whatsapp_blocked_attempts_created_idx
  on public.whatsapp_blocked_attempts (created_at desc);
```

- [ ] **Step 4: Hand-add the type entries**

In `src/lib/supabase/database.types.ts`, inside `Database["public"]["Tables"]`, add one entry per new table, in alphabetical position among the existing entries, using the same Row / Insert / Update / Relationships layout as `crm_message_templates`. Field lists (Row type; Insert makes columns with defaults optional; Update makes everything optional):

- `contact_activities`: `id: string`, `contact_id: string`, `agent_id: string | null`, `kind: string`, `body: string | null`, `number_id: string | null`, `is_new_chat: boolean`, `burst_pos: number | null`, `next_unlock_at: string | null`, `created_at: string`. Relationships: `contact_activities_contact_id_fkey` (contact_id -> contacts.id), `contact_activities_agent_id_fkey` (agent_id -> profiles.id), `contact_activities_number_id_fkey` (number_id -> whatsapp_numbers.id).
- `whatsapp_numbers`: `id: string`, `label: string`, `phone_e164: string | null`, `status: string`, `frozen_until: string | null`, `warmup_started_on: string`, `daily_cap: number | null`, `hourly_cap: number | null`, `created_at: string`. Relationships: `[]`.
- `whatsapp_number_agents`: `number_id: string`, `agent_id: string`, `created_at: string`. Relationships: `whatsapp_number_agents_number_id_fkey` (number_id -> whatsapp_numbers.id), `whatsapp_number_agents_agent_id_fkey` (agent_id -> profiles.id).
- `whatsapp_safety_settings`: `id: boolean`, `daily_cap: number`, `hourly_cap: number`, `hourly_warn_at: number`, `spacing_min_s: number`, `spacing_max_s: number`, `burst_size: number`, `burst_break_min: number`, `quiet_start_hour: number`, `quiet_end_hour: number`, `warmup_start: number`, `warmup_step: number`, `freeze_hours: number`, `timezone: string`, `updated_at: string`. Relationships: `[]`.
- `whatsapp_blocked_attempts`: `id: string`, `number_id: string | null`, `agent_id: string | null`, `contact_id: string | null`, `reason: string`, `created_at: string`. Relationships: `whatsapp_blocked_attempts_number_id_fkey`, `..._agent_id_fkey` (-> profiles.id), `..._contact_id_fkey` (-> contacts.id).

In the `contacts` entry add `next_followup_at: string | null`, `last_outcome: string | null`, `do_not_contact_at: string | null` to Row, and the optional form (`?:`) to Insert and Update, directly after `owner_id`.

- [ ] **Step 5: Run the test and tsc**

Run: `node node_modules/vitest/vitest.mjs run tests/migrations-sales-workspace.test.ts` then `node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS and no new tsc errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0063_sales_workspace_core.sql src/lib/supabase/database.types.ts tests/migrations-sales-workspace.test.ts
git commit -m "feat(db): sales workspace core tables and contact follow-up columns"
```

---

### Task 2: Follow-up rules and queue ranking (pure)

**Files:**
- Create: `src/lib/crm/followup.ts`
- Test: `tests/crm-followup.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type OutcomeKind = "replied" | "interested" | "bought" | "not_interested"`
  - `const OUTCOME_KINDS: readonly OutcomeKind[]`
  - `nextFollowupFor(kind: OutcomeKind | "claimed", now: Date): Date | null`
  - `type QueueItem = { id: string; next_followup_at: string | null; warm: boolean }`
  - `rankQueue<T extends QueueItem>(items: T[], now: Date): T[]`

- [ ] **Step 1: Write the failing test**

Create `tests/crm-followup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nextFollowupFor, rankQueue, OUTCOME_KINDS } from "@/lib/crm/followup";

const now = new Date("2026-10-05T10:00:00.000Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("nextFollowupFor", () => {
  it("replied is due in 1 day", () => {
    expect(nextFollowupFor("replied", now)).toEqual(days(1));
  });
  it("interested is due in 2 days", () => {
    expect(nextFollowupFor("interested", now)).toEqual(days(2));
  });
  it("bought and not_interested clear the follow-up", () => {
    expect(nextFollowupFor("bought", now)).toBeNull();
    expect(nextFollowupFor("not_interested", now)).toBeNull();
  });
  it("a newly claimed contact is due immediately", () => {
    expect(nextFollowupFor("claimed", now)).toEqual(now);
  });
  it("lists the four outcomes", () => {
    expect([...OUTCOME_KINDS]).toEqual(["replied", "interested", "bought", "not_interested"]);
  });
});

describe("rankQueue", () => {
  const item = (id: string, next: string | null, warm = false) => ({
    id,
    next_followup_at: next,
    warm,
  });

  it("drops contacts that are not due yet", () => {
    const out = rankQueue([item("a", "2026-10-06T10:00:00.000Z"), item("b", null)], now);
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });

  it("treats a contact due exactly now as due", () => {
    expect(rankQueue([item("a", now.toISOString())], now)).toHaveLength(1);
  });

  it("puts warm contacts before cold ones", () => {
    const out = rankQueue(
      [item("cold", "2026-10-01T00:00:00.000Z"), item("warm", "2026-10-04T00:00:00.000Z", true)],
      now,
    );
    expect(out.map((i) => i.id)).toEqual(["warm", "cold"]);
  });

  it("orders by oldest due first within a group, null follow-up counting as oldest", () => {
    const out = rankQueue(
      [
        item("c", "2026-10-03T00:00:00.000Z"),
        item("a", null),
        item("b", "2026-10-02T00:00:00.000Z"),
      ],
      now,
    );
    expect(out.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("is stable on ties by id and does not mutate the input", () => {
    const input = [item("z", null), item("m", null)];
    const copy = [...input];
    expect(rankQueue(input, now).map((i) => i.id)).toEqual(["m", "z"]);
    expect(input).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/crm-followup.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/crm/followup.ts`:

```ts
// Follow-up scheduling rules for the Sales Workspace. Pure: no I/O, `now` is injected.

export type OutcomeKind = "replied" | "interested" | "bought" | "not_interested";

export const OUTCOME_KINDS: readonly OutcomeKind[] = [
  "replied",
  "interested",
  "bought",
  "not_interested",
];

const DAY_MS = 86_400_000;

/** When a contact is next due after an outcome (or after being claimed). null = no follow-up. */
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

export type QueueItem = { id: string; next_followup_at: string | null; warm: boolean };

/** Today queue: only due contacts, warm first, then oldest due first, then id for stability. */
export function rankQueue<T extends QueueItem>(items: T[], now: Date): T[] {
  const dueAt = (i: T) => (i.next_followup_at === null ? 0 : Date.parse(i.next_followup_at));
  return items
    .filter((i) => i.next_followup_at === null || Date.parse(i.next_followup_at) <= now.getTime())
    .sort((a, b) => {
      if (a.warm !== b.warm) return a.warm ? -1 : 1;
      const d = dueAt(a) - dueAt(b);
      if (d !== 0) return d;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/crm-followup.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/followup.ts tests/crm-followup.test.ts
git commit -m "feat(sales): follow-up rules and today queue ranking"
```

---

### Task 3: Send-limit rules (pure)

**Files:**
- Create: `src/lib/crm/send-limits.ts`
- Test: `tests/crm-send-limits.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact names; Tasks 5-8 import these):
  - `type SafetySettings = { daily_cap; hourly_cap; hourly_warn_at; spacing_min_s; spacing_max_s; burst_size; burst_break_min; quiet_start_hour; quiet_end_hour; warmup_start; warmup_step; freeze_hours: number; timezone: string }`
  - `const DEFAULT_SETTINGS: SafetySettings`
  - `type NumberState = { status: "active" | "frozen"; frozenUntil: Date | null; warmupStartedOn: string; dailyCapOverride: number | null; hourlyCapOverride: number | null }`
  - `type LastSend = { createdAt: Date; nextUnlockAt: Date; burstPos: number }`
  - `type Usage = { newChatsToday: number; newChatsLastHour: number; lastSend: LastSend | null }`
  - `type BlockReason = "frozen" | "quiet_hours" | "daily_cap" | "hourly_cap" | "spacing"`
  - `type SendDecision = { ok: true; isNewChat: boolean; burstPos: number; nextUnlockAt: Date; warnings: string[] } | { ok: false; reason: BlockReason; message: string; retryAt: Date | null }`
  - `localParts(now, timeZone)`, `startOfLocalDay(now, timeZone)`, `isQuietHours(now, settings)`, `effectiveDailyCap(state, settings, now)`, `evaluateSend(input)`, `budgetSummary(input)`, `violationAfterInsert(input)`.

- [ ] **Step 1: Write the failing test**

Create `tests/crm-send-limits.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  budgetSummary,
  effectiveDailyCap,
  evaluateSend,
  isQuietHours,
  localParts,
  startOfLocalDay,
  violationAfterInsert,
  type NumberState,
  type Usage,
} from "@/lib/crm/send-limits";

// Asia/Karachi is UTC+5 with no daylight saving.
const S = DEFAULT_SETTINGS;
const at = (iso: string) => new Date(iso);
const NOON_PKT = at("2026-10-05T07:00:00.000Z"); // 12:00 local
const AFTERNOON = at("2026-10-05T10:00:00.000Z"); // 15:00 local

const oldNumber: NumberState = {
  status: "active",
  frozenUntil: null,
  warmupStartedOn: "2026-01-01",
  dailyCapOverride: null,
  hourlyCapOverride: null,
};
const idle: Usage = { newChatsToday: 0, newChatsLastHour: 0, lastSend: null };

const base = (over: Partial<Parameters<typeof evaluateSend>[0]> = {}) =>
  evaluateSend({
    now: AFTERNOON,
    settings: S,
    state: oldNumber,
    usage: idle,
    isNewChat: true,
    rand: () => 0,
    ...over,
  });

describe("localParts / startOfLocalDay", () => {
  it("reads local clock parts", () => {
    expect(localParts(at("2026-10-05T10:30:15.000Z"), "Asia/Karachi")).toEqual({
      dateKey: "2026-10-05",
      hour: 15,
      minute: 30,
      second: 15,
    });
  });
  it("starts the local day at local midnight, not UTC midnight", () => {
    expect(startOfLocalDay(at("2026-10-05T10:30:15.250Z"), "Asia/Karachi")).toEqual(
      at("2026-10-04T19:00:00.000Z"),
    );
  });
  it("rolls over exactly at local midnight", () => {
    expect(localParts(at("2026-10-05T18:59:59.000Z"), "Asia/Karachi").dateKey).toBe("2026-10-05");
    expect(localParts(at("2026-10-05T19:00:00.000Z"), "Asia/Karachi").dateKey).toBe("2026-10-06");
  });
});

describe("isQuietHours (21:00-09:00 local)", () => {
  it("is quiet from 21:00:00 and not at 20:59:59", () => {
    expect(isQuietHours(at("2026-10-05T15:59:59.000Z"), S)).toBe(false);
    expect(isQuietHours(at("2026-10-05T16:00:00.000Z"), S)).toBe(true);
  });
  it("stays quiet after midnight and ends at 09:00:00", () => {
    expect(isQuietHours(at("2026-10-05T19:30:00.000Z"), S)).toBe(true); // 00:30
    expect(isQuietHours(at("2026-10-06T03:59:59.000Z"), S)).toBe(true); // 08:59:59
    expect(isQuietHours(at("2026-10-06T04:00:00.000Z"), S)).toBe(false); // 09:00:00
  });
  it("supports a non-wrapping window", () => {
    const s = { ...S, quiet_start_hour: 1, quiet_end_hour: 5 };
    expect(isQuietHours(at("2026-10-05T21:00:00.000Z"), s)).toBe(true); // 02:00 local
    expect(isQuietHours(at("2026-10-05T10:00:00.000Z"), s)).toBe(false);
  });
});

describe("effectiveDailyCap (warm-up)", () => {
  const st = (warmupStartedOn: string, dailyCapOverride: number | null = null): NumberState => ({
    ...oldNumber,
    warmupStartedOn,
    dailyCapOverride,
  });
  it("starts at 10 and rises by 10 a day", () => {
    expect(effectiveDailyCap(st("2026-10-05"), S, AFTERNOON)).toBe(10);
    expect(effectiveDailyCap(st("2026-10-04"), S, AFTERNOON)).toBe(20);
    expect(effectiveDailyCap(st("2026-10-03"), S, AFTERNOON)).toBe(30);
  });
  it("reaches the cap on day 5 and never exceeds it", () => {
    expect(effectiveDailyCap(st("2026-09-30"), S, AFTERNOON)).toBe(60);
    expect(effectiveDailyCap(st("2026-01-01"), S, AFTERNOON)).toBe(60);
  });
  it("a per-number override below the ramp wins", () => {
    expect(effectiveDailyCap(st("2026-01-01", 40), S, AFTERNOON)).toBe(40);
  });
  it("a future warm-up start never goes below the starting cap", () => {
    expect(effectiveDailyCap(st("2026-10-10"), S, AFTERNOON)).toBe(10);
  });
});

describe("evaluateSend", () => {
  it("allows a first send and plans the spacing within 90-180 s", () => {
    const lo = base({ rand: () => 0 });
    const hi = base({ rand: () => 0.999999 });
    expect(lo.ok && lo.nextUnlockAt).toEqual(new Date(AFTERNOON.getTime() + 90_000));
    expect(hi.ok && hi.nextUnlockAt).toEqual(new Date(AFTERNOON.getTime() + 180_000));
    expect(lo.ok && lo.burstPos).toBe(1);
    expect(lo.ok && lo.isNewChat).toBe(true);
  });

  it("blocks a frozen number until the freeze ends, allows after", () => {
    const frozen = (frozenUntil: Date | null): NumberState => ({
      ...oldNumber,
      status: "frozen",
      frozenUntil,
    });
    const r = base({ state: frozen(at("2026-10-06T10:00:00.000Z")) });
    expect(r).toMatchObject({ ok: false, reason: "frozen", retryAt: at("2026-10-06T10:00:00.000Z") });
    expect(base({ state: frozen(at("2026-10-05T09:00:00.000Z")) }).ok).toBe(true);
    expect(base({ state: frozen(null) })).toMatchObject({ ok: false, reason: "frozen" });
  });

  it("blocks in quiet hours and says when it ends", () => {
    const r = base({ now: at("2026-10-05T17:00:00.000Z") }); // 22:00 local
    expect(r).toMatchObject({ ok: false, reason: "quiet_hours", retryAt: at("2026-10-06T04:00:00.000Z") });
    const early = base({ now: at("2026-10-05T20:00:00.000Z") }); // 01:00 local
    expect(early).toMatchObject({ ok: false, reason: "quiet_hours", retryAt: at("2026-10-06T04:00:00.000Z") });
  });

  it("enforces spacing, inclusive at the unlock instant", () => {
    const lastSend = (unlockMs: number) => ({
      createdAt: new Date(AFTERNOON.getTime() - 60_000),
      nextUnlockAt: new Date(AFTERNOON.getTime() + unlockMs),
      burstPos: 1,
    });
    const blocked = base({ usage: { ...idle, lastSend: lastSend(30_000) } });
    expect(blocked).toMatchObject({ ok: false, reason: "spacing" });
    expect(base({ usage: { ...idle, lastSend: lastSend(0) } }).ok).toBe(true);
  });

  it("enforces the daily cap for new chats only, retrying at local midnight", () => {
    const full: Usage = { ...idle, newChatsToday: 60 };
    expect(base({ usage: full })).toMatchObject({
      ok: false,
      reason: "daily_cap",
      retryAt: at("2026-10-05T19:00:00.000Z"),
    });
    expect(base({ usage: full, isNewChat: false }).ok).toBe(true);
  });

  it("uses the warm-up cap for a new number", () => {
    const fresh: NumberState = { ...oldNumber, warmupStartedOn: "2026-10-05" };
    expect(base({ state: fresh, usage: { ...idle, newChatsToday: 10 } })).toMatchObject({
      ok: false,
      reason: "daily_cap",
    });
    expect(base({ state: fresh, usage: { ...idle, newChatsToday: 9 } }).ok).toBe(true);
  });

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

  it("locks for the burst break on the 10th send", () => {
    const prev = {
      createdAt: new Date(AFTERNOON.getTime() - 100_000),
      nextUnlockAt: new Date(AFTERNOON.getTime() - 10_000),
      burstPos: 9,
    };
    const r = base({ usage: { ...idle, lastSend: prev } });
    expect(r.ok && r.burstPos).toBe(10);
    expect(r.ok && r.nextUnlockAt).toEqual(new Date(AFTERNOON.getTime() + 10 * 60_000));
  });

  it("restarts the burst after the break was served or a long gap", () => {
    const afterBreak = {
      createdAt: new Date(AFTERNOON.getTime() - 11 * 60_000),
      nextUnlockAt: new Date(AFTERNOON.getTime() - 60_000),
      burstPos: 10,
    };
    expect((base({ usage: { ...idle, lastSend: afterBreak } }) as { burstPos: number }).burstPos).toBe(1);
    const longGap = { ...afterBreak, burstPos: 3 };
    expect((base({ usage: { ...idle, lastSend: longGap } }) as { burstPos: number }).burstPos).toBe(1);
  });

  it("replies obey frozen, quiet hours and spacing but not the caps", () => {
    const capped: Usage = { newChatsToday: 99, newChatsLastHour: 99, lastSend: null };
    expect(base({ usage: capped, isNewChat: false }).ok).toBe(true);
    expect(base({ now: at("2026-10-05T17:00:00.000Z"), isNewChat: false })).toMatchObject({
      ok: false,
      reason: "quiet_hours",
    });
  });
});

describe("budgetSummary", () => {
  it("reports used / cap, hourly warning and the next unlock", () => {
    const b = budgetSummary({
      now: AFTERNOON,
      settings: S,
      state: oldNumber,
      usage: {
        newChatsToday: 12,
        newChatsLastHour: 16,
        lastSend: {
          createdAt: new Date(AFTERNOON.getTime() - 10_000),
          nextUnlockAt: new Date(AFTERNOON.getTime() + 74_000),
          burstPos: 2,
        },
      },
    });
    expect(b).toMatchObject({
      dailyUsed: 12,
      dailyCap: 60,
      hourlyUsed: 16,
      hourlyCap: 20,
      hourlyWarning: true,
      quietHours: false,
      frozenUntil: null,
      nextUnlockAt: new Date(AFTERNOON.getTime() + 74_000),
    });
  });
  it("hides an unlock time that has already passed", () => {
    const b = budgetSummary({
      now: AFTERNOON,
      settings: S,
      state: oldNumber,
      usage: {
        ...idle,
        lastSend: {
          createdAt: new Date(AFTERNOON.getTime() - 200_000),
          nextUnlockAt: new Date(AFTERNOON.getTime() - 20_000),
          burstPos: 1,
        },
      },
    });
    expect(b.nextUnlockAt).toBeNull();
  });
});

describe("violationAfterInsert (race re-check)", () => {
  const args = {
    now: AFTERNOON,
    settings: S,
    state: oldNumber,
    isNewChat: true,
    usageWithOurs: { newChatsToday: 5, newChatsLastHour: 5 },
    previousSend: null as null | { createdAt: Date; nextUnlockAt: Date; burstPos: number },
  };
  it("passes when nothing is broken", () => {
    expect(violationAfterInsert(args)).toBeNull();
  });
  it("flags spacing when an earlier send was still locking the number", () => {
    const previousSend = {
      createdAt: new Date(AFTERNOON.getTime() - 1000),
      nextUnlockAt: new Date(AFTERNOON.getTime() + 60_000),
      burstPos: 1,
    };
    expect(violationAfterInsert({ ...args, previousSend })).toBe("spacing");
  });
  it("flags the daily and hourly caps once our own row is counted", () => {
    expect(violationAfterInsert({ ...args, usageWithOurs: { newChatsToday: 61, newChatsLastHour: 5 } })).toBe("daily_cap");
    expect(violationAfterInsert({ ...args, usageWithOurs: { newChatsToday: 5, newChatsLastHour: 21 } })).toBe("hourly_cap");
  });
  it("ignores the caps for non-new chats", () => {
    expect(
      violationAfterInsert({ ...args, isNewChat: false, usageWithOurs: { newChatsToday: 99, newChatsLastHour: 99 } }),
    ).toBeNull();
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("holds the owner-tuned values", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      daily_cap: 60,
      hourly_cap: 20,
      hourly_warn_at: 15,
      spacing_min_s: 90,
      spacing_max_s: 180,
      burst_size: 10,
      burst_break_min: 10,
      quiet_start_hour: 21,
      quiet_end_hour: 9,
      warmup_start: 10,
      warmup_step: 10,
      freeze_hours: 48,
      timezone: "Asia/Karachi",
    });
  });
});

void NOON_PKT;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/crm-send-limits.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/crm/send-limits.ts`:

```ts
// WhatsApp send limits for the Sales Workspace (spec Section 5). Pure: no I/O,
// `now` and the random source are injected. These numbers are cautious guesses
// at what protects a sending number; WhatsApp does not publish its limits, so
// nothing here (or in copy that uses it) may promise safety.

export type SafetySettings = {
  daily_cap: number;
  hourly_cap: number;
  hourly_warn_at: number;
  spacing_min_s: number;
  spacing_max_s: number;
  burst_size: number;
  burst_break_min: number;
  quiet_start_hour: number;
  quiet_end_hour: number;
  warmup_start: number;
  warmup_step: number;
  freeze_hours: number;
  timezone: string;
};

export const DEFAULT_SETTINGS: SafetySettings = {
  daily_cap: 60,
  hourly_cap: 20,
  hourly_warn_at: 15,
  spacing_min_s: 90,
  spacing_max_s: 180,
  burst_size: 10,
  burst_break_min: 10,
  quiet_start_hour: 21,
  quiet_end_hour: 9,
  warmup_start: 10,
  warmup_step: 10,
  freeze_hours: 48,
  timezone: "Asia/Karachi",
};

export type NumberState = {
  status: "active" | "frozen";
  frozenUntil: Date | null;
  /** Local calendar date (YYYY-MM-DD) the number started warming up. */
  warmupStartedOn: string;
  dailyCapOverride: number | null;
  hourlyCapOverride: number | null;
};

export type LastSend = { createdAt: Date; nextUnlockAt: Date; burstPos: number };

export type Usage = {
  newChatsToday: number;
  newChatsLastHour: number;
  lastSend: LastSend | null;
};

export type BlockReason = "frozen" | "quiet_hours" | "daily_cap" | "hourly_cap" | "spacing";

export type SendDecision =
  | { ok: true; isNewChat: boolean; burstPos: number; nextUnlockAt: Date; warnings: string[] }
  | { ok: false; reason: BlockReason; message: string; retryAt: Date | null };

const DAY_MS = 86_400_000;

export function localParts(now: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(now)) p[part.type] = part.value;
  return {
    dateKey: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** The instant the local calendar day containing `now` began. */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const { hour, minute, second } = localParts(now, timeZone);
  const sinceMidnight = ((hour * 60 + minute) * 60 + second) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnight);
}

export function isQuietHours(now: Date, s: SafetySettings): boolean {
  const { hour } = localParts(now, s.timezone);
  if (s.quiet_start_hour === s.quiet_end_hour) return false;
  return s.quiet_start_hour > s.quiet_end_hour
    ? hour >= s.quiet_start_hour || hour < s.quiet_end_hour
    : hour >= s.quiet_start_hour && hour < s.quiet_end_hour;
}

/** The next moment quiet hours end (only meaningful while quiet). */
function quietEndsAt(now: Date, s: SafetySettings): Date {
  const dayStart = startOfLocalDay(now, s.timezone).getTime();
  const { hour } = localParts(now, s.timezone);
  const endToday = dayStart + s.quiet_end_hour * 3_600_000;
  const wraps = s.quiet_start_hour > s.quiet_end_hour;
  const target = wraps && hour >= s.quiet_start_hour ? endToday + DAY_MS : endToday;
  return new Date(target);
}

function daysBetween(fromKey: string, toKey: string): number {
  const parse = (k: string) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toKey) - parse(fromKey)) / DAY_MS);
}

export function effectiveDailyCap(state: NumberState, s: SafetySettings, now: Date): number {
  const base = state.dailyCapOverride ?? s.daily_cap;
  const days = Math.max(0, daysBetween(state.warmupStartedOn, localParts(now, s.timezone).dateKey));
  return Math.min(base, s.warmup_start + s.warmup_step * days);
}

function effectiveHourlyCap(state: NumberState, s: SafetySettings): number {
  return state.hourlyCapOverride ?? s.hourly_cap;
}

function isFrozen(state: NumberState, now: Date): boolean {
  if (state.status !== "frozen") return false;
  return state.frozenUntil === null || state.frozenUntil.getTime() > now.getTime();
}

export function evaluateSend(input: {
  now: Date;
  settings: SafetySettings;
  state: NumberState;
  usage: Usage;
  isNewChat: boolean;
  rand: () => number;
}): SendDecision {
  const { now, settings: s, state, usage, isNewChat, rand } = input;

  if (isFrozen(state, now)) {
    return {
      ok: false,
      reason: "frozen",
      message: "This number is paused to protect it. Ask your admin when it will be back.",
      retryAt: state.frozenUntil,
    };
  }

  if (isQuietHours(now, s)) {
    return {
      ok: false,
      reason: "quiet_hours",
      message: "Messaging is paused overnight.",
      retryAt: quietEndsAt(now, s),
    };
  }

  const last = usage.lastSend;
  if (last && last.nextUnlockAt.getTime() > now.getTime()) {
    return {
      ok: false,
      reason: "spacing",
      message: "Wait a moment before the next message.",
      retryAt: last.nextUnlockAt,
    };
  }

  if (isNewChat) {
    const dailyCap = effectiveDailyCap(state, s, now);
    if (usage.newChatsToday >= dailyCap) {
      return {
        ok: false,
        reason: "daily_cap",
        message: "You have reached today's limit for new chats on this number.",
        retryAt: new Date(startOfLocalDay(now, s.timezone).getTime() + DAY_MS),
      };
    }
    const hourlyCap = effectiveHourlyCap(state, s);
    if (usage.newChatsLastHour >= hourlyCap) {
      return {
        ok: false,
        reason: "hourly_cap",
        message: "That is the limit for this hour. Take a short break.",
        retryAt: null,
      };
    }
  }

  const breakMs = s.burst_break_min * 60_000;
  const continuesBurst =
    last !== null &&
    last.burstPos < s.burst_size &&
    now.getTime() - last.createdAt.getTime() < breakMs;
  const burstPos = continuesBurst ? last.burstPos + 1 : 1;

  const spread = s.spacing_max_s - s.spacing_min_s + 1;
  const gapSeconds = s.spacing_min_s + Math.floor(rand() * spread);
  const nextUnlockAt =
    burstPos >= s.burst_size
      ? new Date(now.getTime() + breakMs)
      : new Date(now.getTime() + gapSeconds * 1000);

  const warnings: string[] = [];
  if (isNewChat) {
    const hourlyCap = effectiveHourlyCap(state, s);
    const usedAfter = usage.newChatsLastHour + 1;
    if (usedAfter >= s.hourly_warn_at) {
      warnings.push(`${Math.max(0, hourlyCap - usedAfter)} left this hour, slow down`);
    }
  }

  return { ok: true, isNewChat, burstPos, nextUnlockAt, warnings };
}

export type BudgetSummary = {
  dailyUsed: number;
  dailyCap: number;
  hourlyUsed: number;
  hourlyCap: number;
  hourlyWarning: boolean;
  quietHours: boolean;
  quietEndsAt: Date | null;
  frozenUntil: Date | null;
  nextUnlockAt: Date | null;
};

export function budgetSummary(input: {
  now: Date;
  settings: SafetySettings;
  state: NumberState;
  usage: Usage;
}): BudgetSummary {
  const { now, settings: s, state, usage } = input;
  const quiet = isQuietHours(now, s);
  const unlock = usage.lastSend?.nextUnlockAt ?? null;
  return {
    dailyUsed: usage.newChatsToday,
    dailyCap: effectiveDailyCap(state, s, now),
    hourlyUsed: usage.newChatsLastHour,
    hourlyCap: effectiveHourlyCap(state, s),
    hourlyWarning: usage.newChatsLastHour >= s.hourly_warn_at,
    quietHours: quiet,
    quietEndsAt: quiet ? quietEndsAt(now, s) : null,
    frozenUntil: isFrozen(state, now) ? state.frozenUntil : null,
    nextUnlockAt: unlock && unlock.getTime() > now.getTime() ? unlock : null,
  };
}

/**
 * Re-check after our send row was inserted, to catch two taps racing on a
 * shared number. `usageWithOurs` counts include the row we just wrote;
 * `previousSend` is the newest send on the number written before ours.
 * A violation means the caller must delete its row and refuse.
 */
export function violationAfterInsert(input: {
  now: Date;
  settings: SafetySettings;
  state: NumberState;
  isNewChat: boolean;
  usageWithOurs: { newChatsToday: number; newChatsLastHour: number };
  previousSend: LastSend | null;
}): BlockReason | null {
  const { now, settings: s, state, isNewChat, usageWithOurs, previousSend } = input;
  if (previousSend && previousSend.nextUnlockAt.getTime() > now.getTime()) return "spacing";
  if (isNewChat) {
    if (usageWithOurs.newChatsToday > effectiveDailyCap(state, s, now)) return "daily_cap";
    if (usageWithOurs.newChatsLastHour > effectiveHourlyCap(state, s)) return "hourly_cap";
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/crm-send-limits.test.ts`
Expected: PASS. If a `localParts` assertion fails because `Intl` returns hour `24` at midnight on this Node version, keep `hourCycle: "h23"` and normalise `hour === 24` to `0` in `localParts`, then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/send-limits.ts tests/crm-send-limits.test.ts
git commit -m "feat(sales): pure WhatsApp send-limit rules"
```

---

### Task 4: Request validation and HTTP helpers

**Files:**
- Create: `src/lib/validations/sales.ts`
- Create: `src/lib/api/sales-http.ts`
- Test: `tests/sales-validations.test.ts`

**Interfaces:**
- Consumes: `OUTCOME_KINDS` from Task 2.
- Produces:
  - Zod schemas: `outcomeSchema`, `noteSchema`, `sendRequestSchema`, `leadSchema`, `contactsQuerySchema`, `numberCreateSchema`, `numberUpdateSchema`, `settingsUpdateSchema`, `assignSchema`.
  - `sanitizeSearch(q: string): string`
  - `statusForReason(reason: string): number`

- [ ] **Step 1: Write the failing test**

Create `tests/sales-validations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  assignSchema,
  contactsQuerySchema,
  leadSchema,
  noteSchema,
  numberCreateSchema,
  outcomeSchema,
  sanitizeSearch,
  sendRequestSchema,
  settingsUpdateSchema,
} from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("outcomeSchema", () => {
  it("accepts the four outcomes and the stop flag", () => {
    expect(outcomeSchema.safeParse({ kind: "replied" }).success).toBe(true);
    expect(outcomeSchema.safeParse({ kind: "not_interested", askedToStop: true }).success).toBe(true);
  });
  it("rejects unknown kinds and a stop flag on other outcomes", () => {
    expect(outcomeSchema.safeParse({ kind: "sent" }).success).toBe(false);
    expect(outcomeSchema.safeParse({ kind: "replied", askedToStop: true }).success).toBe(false);
  });
});

describe("noteSchema", () => {
  it("trims and requires text", () => {
    expect(noteSchema.parse({ body: "  hello  " }).body).toBe("hello");
    expect(noteSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("sendRequestSchema", () => {
  it("needs a number id and a message", () => {
    expect(sendRequestSchema.safeParse({ numberId: uuid, messageTemplate: "Salam {{first_name}}" }).success).toBe(true);
    expect(sendRequestSchema.safeParse({ numberId: "x", messageTemplate: "hi" }).success).toBe(false);
    expect(sendRequestSchema.safeParse({ numberId: uuid, messageTemplate: " " }).success).toBe(false);
  });
});

describe("leadSchema", () => {
  it("needs a phone; the rest is optional", () => {
    expect(leadSchema.safeParse({ phone: "03001234567" }).success).toBe(true);
    expect(leadSchema.safeParse({ name: "Ayesha" }).success).toBe(false);
    expect(leadSchema.safeParse({ phone: "0300", email: "not-an-email" }).success).toBe(false);
  });
});

describe("contactsQuerySchema", () => {
  it("defaults to the mine tab, page 1", () => {
    expect(contactsQuerySchema.parse({})).toMatchObject({ tab: "mine", page: 1 });
  });
  it("rejects a bad tab and page 0", () => {
    expect(contactsQuerySchema.safeParse({ tab: "everyone" }).success).toBe(false);
    expect(contactsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
  it("coerces the page from a query string", () => {
    expect(contactsQuerySchema.parse({ page: "3" }).page).toBe(3);
  });
});

describe("sanitizeSearch", () => {
  it("removes characters that break PostgREST or() filters", () => {
    expect(sanitizeSearch("a,b(c)%d*e\\f")).toBe("a b c d e f");
  });
  it("collapses whitespace and trims", () => {
    expect(sanitizeSearch("  Aye   sha ")).toBe("Aye sha");
  });
  it("caps the length", () => {
    expect(sanitizeSearch("x".repeat(200))).toHaveLength(80);
  });
});

describe("number and settings schemas", () => {
  it("creates a number with a label", () => {
    expect(numberCreateSchema.safeParse({ label: "DMC campaign number 2", agentIds: [uuid] }).success).toBe(true);
    expect(numberCreateSchema.safeParse({ label: " ", agentIds: [] }).success).toBe(false);
  });
  it("settings must keep spacing max >= min and warn <= hourly cap", () => {
    expect(settingsUpdateSchema.safeParse({ spacing_min_s: 90, spacing_max_s: 60 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ hourly_cap: 10, hourly_warn_at: 15 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ daily_cap: 60 }).success).toBe(true);
    expect(settingsUpdateSchema.safeParse({ daily_cap: 0 }).success).toBe(false);
  });
  it("rejects an unknown timezone", () => {
    expect(settingsUpdateSchema.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ timezone: "Asia/Karachi" }).success).toBe(true);
  });
});

describe("assignSchema", () => {
  it("allows releasing (agentId null) and assigning, 1-500 contacts", () => {
    expect(assignSchema.safeParse({ contactIds: [uuid], agentId: null }).success).toBe(true);
    expect(assignSchema.safeParse({ contactIds: [uuid], agentId: uuid }).success).toBe(true);
    expect(assignSchema.safeParse({ contactIds: [], agentId: uuid }).success).toBe(false);
  });
});

describe("statusForReason", () => {
  it("maps reasons to HTTP statuses", () => {
    expect(statusForReason("not-found")).toBe(404);
    expect(statusForReason("not-owner")).toBe(403);
    expect(statusForReason("not-allowed")).toBe(403);
    expect(statusForReason("number-not-assigned")).toBe(403);
    expect(statusForReason("already-claimed")).toBe(409);
    expect(statusForReason("do-not-contact")).toBe(409);
    expect(statusForReason("daily_cap")).toBe(429);
    expect(statusForReason("spacing")).toBe(429);
    expect(statusForReason("quiet_hours")).toBe(429);
    expect(statusForReason("db-error")).toBe(500);
    expect(statusForReason("something-new")).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-validations.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the schemas**

Create `src/lib/validations/sales.ts`:

```ts
import { z } from "zod";
import { OUTCOME_KINDS } from "@/lib/crm/followup";

const text = (max: number) => z.string().trim().min(1, "Required").max(max);

export const outcomeSchema = z
  .object({
    kind: z.enum(OUTCOME_KINDS as unknown as [string, ...string[]]),
    askedToStop: z.boolean().optional(),
  })
  .refine((v) => !v.askedToStop || v.kind === "not_interested", {
    message: "Only 'Not interested' can be marked as asked to stop",
    path: ["askedToStop"],
  });

export const noteSchema = z.object({ body: text(2000) });

export const sendRequestSchema = z.object({
  numberId: z.string().uuid(),
  messageTemplate: text(1000),
});

export const leadSchema = z.object({
  phone: text(40),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
  profession: z.string().trim().max(120).optional(),
  note: z.string().trim().max(2000).optional(),
});

export const contactsQuerySchema = z.object({
  tab: z.enum(["mine", "unclaimed", "all"]).default("mine"),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

/** PostgREST `or()` filters break on , ( ) and the wildcard characters. */
export function sanitizeSearch(q: string): string {
  return q
    .replace(/[,()%*\\_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

const intIn = (min: number, max: number) => z.number().int().min(min).max(max);

export const numberCreateSchema = z.object({
  label: text(80),
  phoneE164: z.string().trim().max(20).optional(),
  dailyCap: intIn(1, 500).nullable().optional(),
  hourlyCap: intIn(1, 200).nullable().optional(),
  agentIds: z.array(z.string().uuid()).max(50).default([]),
});

export const numberUpdateSchema = z.object({
  label: text(80).optional(),
  phoneE164: z.string().trim().max(20).nullable().optional(),
  dailyCap: intIn(1, 500).nullable().optional(),
  hourlyCap: intIn(1, 200).nullable().optional(),
  agentIds: z.array(z.string().uuid()).max(50).optional(),
  unfreeze: z.literal(true).optional(),
});

function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const settingsUpdateSchema = z
  .object({
    daily_cap: intIn(1, 500),
    hourly_cap: intIn(1, 200),
    hourly_warn_at: intIn(1, 200),
    spacing_min_s: intIn(0, 3600),
    spacing_max_s: intIn(0, 3600),
    burst_size: intIn(1, 100),
    burst_break_min: intIn(0, 240),
    quiet_start_hour: intIn(0, 23),
    quiet_end_hour: intIn(0, 23),
    warmup_start: intIn(1, 500),
    warmup_step: intIn(0, 500),
    freeze_hours: intIn(1, 720),
    timezone: z.string().refine(validTimezone, "Unknown timezone"),
  })
  .partial()
  .refine(
    (v) => v.spacing_min_s === undefined || v.spacing_max_s === undefined || v.spacing_max_s >= v.spacing_min_s,
    { message: "Maximum spacing must be at least the minimum", path: ["spacing_max_s"] },
  )
  .refine(
    (v) => v.hourly_cap === undefined || v.hourly_warn_at === undefined || v.hourly_warn_at <= v.hourly_cap,
    { message: "The warning must come at or before the hourly limit", path: ["hourly_warn_at"] },
  );

export const assignSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(500),
  agentId: z.string().uuid().nullable(),
});
```

- [ ] **Step 4: Implement the HTTP helper**

Create `src/lib/api/sales-http.ts`:

```ts
/** Maps a data-layer failure reason to an HTTP status for /api/sales and /api/admin/sales routes. */
export function statusForReason(reason: string): number {
  switch (reason) {
    case "not-found":
      return 404;
    case "not-owner":
    case "not-allowed":
    case "number-not-assigned":
      return 403;
    case "already-claimed":
    case "do-not-contact":
    case "no-phone":
    case "duplicate":
      return 409;
    case "frozen":
    case "quiet_hours":
    case "daily_cap":
    case "hourly_cap":
    case "spacing":
      return 429;
    case "db-error":
      return 500;
    default:
      return 400;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-validations.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations/sales.ts src/lib/api/sales-http.ts tests/sales-validations.test.ts
git commit -m "feat(sales): request schemas, search sanitiser and status mapping"
```

---

### Task 5: Numbers, settings and budgets data module

**Files:**
- Create: `src/lib/data/sales-numbers.ts`
- Test: `tests/sales-data-exports.test.ts` (created here, extended in Tasks 6 and 7)

**Interfaces:**
- Consumes: Task 1 tables; Task 3 `DEFAULT_SETTINGS`, `budgetSummary`, `startOfLocalDay`, `localParts`, types.
- Produces (exact):
  - `type NumberRow` (the `whatsapp_numbers` Row)
  - `toNumberState(row: NumberRow): NumberState`
  - `getSafetySettings(): Promise<SafetySettings>`
  - `getNumberUsage(numberId: string, now: Date, settings: SafetySettings): Promise<Usage>`
  - `getNumberForAgent(userId: string, isAdmin: boolean, numberId: string): Promise<NumberRow | null>`
  - `getBudgetsForAgent(userId: string, isAdmin: boolean, now?: Date): Promise<{ ok: true; budgets: AgentBudget[] } | { ok: false; reason: "db-error" }>` where `AgentBudget = { number: { id: string; label: string; phone_e164: string | null }; budget: BudgetSummary }`
  - `freezeNumber(userId: string, isAdmin: boolean, numberId: string, now?: Date): Promise<{ ok: true; frozenUntil: Date } | { ok: false; reason: "not-found" | "number-not-assigned" | "db-error" }>`
  - Admin: `listNumbersAdmin()`, `createNumber(input)`, `updateNumber(id, input)`, `updateSafetySettings(patch)`, `listBlockedAttempts(limit?)`, `logBlockedAttempt(row)`.

- [ ] **Step 1: Write the failing test**

Create `tests/sales-data-exports.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import * as numbers from "@/lib/data/sales-numbers";

describe("sales-numbers exports", () => {
  it("exposes the functions the routes and send module rely on", () => {
    for (const name of [
      "toNumberState",
      "getSafetySettings",
      "getNumberUsage",
      "getNumberForAgent",
      "getBudgetsForAgent",
      "freezeNumber",
      "listNumbersAdmin",
      "createNumber",
      "updateNumber",
      "updateSafetySettings",
      "listBlockedAttempts",
      "logBlockedAttempt",
    ]) {
      expect(typeof (numbers as Record<string, unknown>)[name]).toBe("function");
    }
  });

  it("maps a frozen row to a NumberState", () => {
    const state = numbers.toNumberState({
      id: "n1",
      label: "DMC",
      phone_e164: null,
      status: "frozen",
      frozen_until: "2026-10-07T00:00:00.000Z",
      warmup_started_on: "2026-10-01",
      daily_cap: 40,
      hourly_cap: null,
      created_at: "2026-10-01T00:00:00.000Z",
    });
    expect(state).toEqual({
      status: "frozen",
      frozenUntil: new Date("2026-10-07T00:00:00.000Z"),
      warmupStartedOn: "2026-10-01",
      dailyCapOverride: 40,
      hourlyCapOverride: null,
    });
  });

  it("treats any non-frozen status as active", () => {
    const state = numbers.toNumberState({
      id: "n1", label: "x", phone_e164: null, status: "weird", frozen_until: null,
      warmup_started_on: "2026-10-01", daily_cap: null, hourly_cap: null, created_at: "",
    });
    expect(state.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-exports.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/data/sales-numbers.ts`:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  DEFAULT_SETTINGS,
  budgetSummary,
  localParts,
  startOfLocalDay,
  type BudgetSummary,
  type NumberState,
  type SafetySettings,
  type Usage,
} from "@/lib/crm/send-limits";

export type NumberRow = {
  id: string;
  label: string;
  phone_e164: string | null;
  status: string;
  frozen_until: string | null;
  warmup_started_on: string;
  daily_cap: number | null;
  hourly_cap: number | null;
  created_at: string;
};

export type AgentBudget = {
  number: { id: string; label: string; phone_e164: string | null };
  budget: BudgetSummary;
};

export function toNumberState(row: NumberRow): NumberState {
  return {
    status: row.status === "frozen" ? "frozen" : "active",
    frozenUntil: row.frozen_until ? new Date(row.frozen_until) : null,
    warmupStartedOn: row.warmup_started_on,
    dailyCapOverride: row.daily_cap,
    hourlyCapOverride: row.hourly_cap,
  };
}

export async function getSafetySettings(): Promise<SafetySettings> {
  const db = createAdminSupabase();
  const { data, error } = await db
    .from("whatsapp_safety_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[sales-numbers] settings read failed, using defaults", error);
    return DEFAULT_SETTINGS;
  }
  return {
    daily_cap: data.daily_cap,
    hourly_cap: data.hourly_cap,
    hourly_warn_at: data.hourly_warn_at,
    spacing_min_s: data.spacing_min_s,
    spacing_max_s: data.spacing_max_s,
    burst_size: data.burst_size,
    burst_break_min: data.burst_break_min,
    quiet_start_hour: data.quiet_start_hour,
    quiet_end_hour: data.quiet_end_hour,
    warmup_start: data.warmup_start,
    warmup_step: data.warmup_step,
    freeze_hours: data.freeze_hours,
    timezone: data.timezone,
  };
}

async function countNewChats(numberId: string, sinceIso: string): Promise<number> {
  const db = createAdminSupabase();
  const { count, error } = await db
    .from("contact_activities")
    .select("id", { count: "exact", head: true })
    .eq("number_id", numberId)
    .eq("kind", "sent")
    .eq("is_new_chat", true)
    .gte("created_at", sinceIso);
  if (error) throw error;
  return count ?? 0;
}

/** Throws on database errors; callers wrap in try/catch and return db-error. */
export async function getNumberUsage(
  numberId: string,
  now: Date,
  settings: SafetySettings,
): Promise<Usage> {
  const db = createAdminSupabase();
  const dayStart = startOfLocalDay(now, settings.timezone).toISOString();
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const [newChatsToday, newChatsLastHour, lastRes] = await Promise.all([
    countNewChats(numberId, dayStart),
    countNewChats(numberId, hourAgo),
    db
      .from("contact_activities")
      .select("created_at, next_unlock_at, burst_pos")
      .eq("number_id", numberId)
      .eq("kind", "sent")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (lastRes.error) throw lastRes.error;
  const row = lastRes.data?.[0];
  return {
    newChatsToday,
    newChatsLastHour,
    lastSend:
      row && row.next_unlock_at
        ? {
            createdAt: new Date(row.created_at),
            nextUnlockAt: new Date(row.next_unlock_at),
            burstPos: row.burst_pos ?? 1,
          }
        : null,
  };
}

/** The number, if this agent may send from it (admins may use any number). */
export async function getNumberForAgent(
  userId: string,
  isAdmin: boolean,
  numberId: string,
): Promise<NumberRow | null> {
  if (userId === "") return null;
  const db = createAdminSupabase();
  if (!isAdmin) {
    const { data: link } = await db
      .from("whatsapp_number_agents")
      .select("number_id")
      .eq("number_id", numberId)
      .eq("agent_id", userId)
      .maybeSingle();
    if (!link) return null;
  }
  const { data } = await db.from("whatsapp_numbers").select("*").eq("id", numberId).maybeSingle();
  return (data as NumberRow | null) ?? null;
}

async function numbersForAgent(userId: string, isAdmin: boolean): Promise<NumberRow[]> {
  const db = createAdminSupabase();
  if (isAdmin) {
    const { data, error } = await db.from("whatsapp_numbers").select("*").order("label");
    if (error) throw error;
    return (data ?? []) as NumberRow[];
  }
  if (userId === "") return [];
  const { data: links, error: linkErr } = await db
    .from("whatsapp_number_agents")
    .select("number_id")
    .eq("agent_id", userId);
  if (linkErr) throw linkErr;
  const ids = (links ?? []).map((l) => l.number_id);
  if (ids.length === 0) return [];
  const { data, error } = await db.from("whatsapp_numbers").select("*").in("id", ids).order("label");
  if (error) throw error;
  return (data ?? []) as NumberRow[];
}

export async function getBudgetsForAgent(
  userId: string,
  isAdmin: boolean,
  now: Date = new Date(),
): Promise<{ ok: true; budgets: AgentBudget[] } | { ok: false; reason: "db-error" }> {
  try {
    const settings = await getSafetySettings();
    const rows = await numbersForAgent(userId, isAdmin);
    const budgets = await Promise.all(
      rows.map(async (row) => ({
        number: { id: row.id, label: row.label, phone_e164: row.phone_e164 },
        budget: budgetSummary({
          now,
          settings,
          state: toNumberState(row),
          usage: await getNumberUsage(row.id, now, settings),
        }),
      })),
    );
    return { ok: true, budgets };
  } catch (e) {
    console.error("[sales-numbers] getBudgetsForAgent", e);
    return { ok: false, reason: "db-error" };
  }
}

export async function logBlockedAttempt(row: {
  numberId: string | null;
  agentId: string | null;
  contactId: string | null;
  reason: string;
}): Promise<void> {
  const db = createAdminSupabase();
  const { error } = await db.from("whatsapp_blocked_attempts").insert({
    number_id: row.numberId,
    agent_id: row.agentId,
    contact_id: row.contactId,
    reason: row.reason,
  });
  if (error) console.error("[sales-numbers] could not log blocked attempt", error);
}

/** Panic button: the assigned agent (or an admin) freezes a number for the configured hours. */
export async function freezeNumber(
  userId: string,
  isAdmin: boolean,
  numberId: string,
  now: Date = new Date(),
): Promise<
  | { ok: true; frozenUntil: Date }
  | { ok: false; reason: "not-found" | "number-not-assigned" | "db-error" }
> {
  try {
    const db = createAdminSupabase();
    const { data: exists } = await db.from("whatsapp_numbers").select("id").eq("id", numberId).maybeSingle();
    if (!exists) return { ok: false, reason: "not-found" };
    const row = await getNumberForAgent(userId, isAdmin, numberId);
    if (!row) return { ok: false, reason: "number-not-assigned" };
    const settings = await getSafetySettings();
    const frozenUntil = new Date(now.getTime() + settings.freeze_hours * 3_600_000);
    const { error } = await db
      .from("whatsapp_numbers")
      .update({ status: "frozen", frozen_until: frozenUntil.toISOString() })
      .eq("id", numberId);
    if (error) throw error;
    await logBlockedAttempt({ numberId, agentId: userId, contactId: null, reason: "panic_freeze" });
    return { ok: true, frozenUntil };
  } catch (e) {
    console.error("[sales-numbers] freezeNumber", e);
    return { ok: false, reason: "db-error" };
  }
}

// ---------------------------------------------------------------- admin

export type NumberAdminRow = NumberRow & { agents: { id: string; name: string }[] };

async function profileNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const db = createAdminSupabase();
  const { data } = await db.from("profiles").select("id, full_name").in("id", ids);
  for (const p of data ?? []) out.set(p.id, p.full_name ?? "");
  return out;
}

export async function listNumbersAdmin(): Promise<
  { ok: true; numbers: NumberAdminRow[] } | { ok: false; reason: "db-error" }
> {
  try {
    const db = createAdminSupabase();
    const [{ data: nums, error: e1 }, { data: links, error: e2 }] = await Promise.all([
      db.from("whatsapp_numbers").select("*").order("label"),
      db.from("whatsapp_number_agents").select("number_id, agent_id"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const names = await profileNames([...new Set((links ?? []).map((l) => l.agent_id))]);
    const numbers = ((nums ?? []) as NumberRow[]).map((n) => ({
      ...n,
      agents: (links ?? [])
        .filter((l) => l.number_id === n.id)
        .map((l) => ({ id: l.agent_id, name: names.get(l.agent_id) ?? "" })),
    }));
    return { ok: true, numbers };
  } catch (e) {
    console.error("[sales-numbers] listNumbersAdmin", e);
    return { ok: false, reason: "db-error" };
  }
}

async function syncAgents(numberId: string, agentIds: string[]): Promise<void> {
  const db = createAdminSupabase();
  const { data: current, error } = await db
    .from("whatsapp_number_agents")
    .select("agent_id")
    .eq("number_id", numberId);
  if (error) throw error;
  const have = new Set((current ?? []).map((r) => r.agent_id));
  const want = new Set(agentIds);
  const toAdd = [...want].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));
  if (toAdd.length > 0) {
    const { error: addErr } = await db
      .from("whatsapp_number_agents")
      .insert(toAdd.map((agent_id) => ({ number_id: numberId, agent_id })));
    if (addErr) throw addErr;
  }
  if (toRemove.length > 0) {
    const { error: rmErr } = await db
      .from("whatsapp_number_agents")
      .delete()
      .eq("number_id", numberId)
      .in("agent_id", toRemove);
    if (rmErr) throw rmErr;
  }
}

export async function createNumber(input: {
  label: string;
  phoneE164?: string;
  dailyCap?: number | null;
  hourlyCap?: number | null;
  agentIds: string[];
}): Promise<{ ok: true; id: string } | { ok: false; reason: "db-error" }> {
  try {
    const db = createAdminSupabase();
    const settings = await getSafetySettings();
    const { data, error } = await db
      .from("whatsapp_numbers")
      .insert({
        label: input.label,
        phone_e164: input.phoneE164 ?? null,
        daily_cap: input.dailyCap ?? null,
        hourly_cap: input.hourlyCap ?? null,
        warmup_started_on: localParts(new Date(), settings.timezone).dateKey,
      })
      .select("id")
      .single();
    if (error) throw error;
    await syncAgents(data.id, input.agentIds);
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[sales-numbers] createNumber", e);
    return { ok: false, reason: "db-error" };
  }
}

export async function updateNumber(
  id: string,
  input: {
    label?: string;
    phoneE164?: string | null;
    dailyCap?: number | null;
    hourlyCap?: number | null;
    agentIds?: string[];
    unfreeze?: true;
  },
): Promise<{ ok: true } | { ok: false; reason: "not-found" | "db-error" }> {
  try {
    const db = createAdminSupabase();
    const { data: existing } = await db.from("whatsapp_numbers").select("id").eq("id", id).maybeSingle();
    if (!existing) return { ok: false, reason: "not-found" };

    const patch: Record<string, unknown> = {};
    if (input.label !== undefined) patch.label = input.label;
    if (input.phoneE164 !== undefined) patch.phone_e164 = input.phoneE164;
    if (input.dailyCap !== undefined) patch.daily_cap = input.dailyCap;
    if (input.hourlyCap !== undefined) patch.hourly_cap = input.hourlyCap;
    if (input.unfreeze) {
      // A recovered number restarts its warm-up, per the spec.
      const settings = await getSafetySettings();
      patch.status = "active";
      patch.frozen_until = null;
      patch.warmup_started_on = localParts(new Date(), settings.timezone).dateKey;
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("whatsapp_numbers").update(patch).eq("id", id);
      if (error) throw error;
    }
    if (input.agentIds) await syncAgents(id, input.agentIds);
    return { ok: true };
  } catch (e) {
    console.error("[sales-numbers] updateNumber", e);
    return { ok: false, reason: "db-error" };
  }
}

export async function updateSafetySettings(
  patch: Partial<SafetySettings>,
): Promise<{ ok: true; settings: SafetySettings } | { ok: false; reason: "db-error" }> {
  try {
    const db = createAdminSupabase();
    if (Object.keys(patch).length > 0) {
      const { error } = await db
        .from("whatsapp_safety_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
    }
    return { ok: true, settings: await getSafetySettings() };
  } catch (e) {
    console.error("[sales-numbers] updateSafetySettings", e);
    return { ok: false, reason: "db-error" };
  }
}

export type BlockedAttemptRow = {
  id: string;
  reason: string;
  created_at: string;
  number_label: string | null;
  agent_name: string | null;
  contact_name: string | null;
};

export async function listBlockedAttempts(
  limit = 100,
): Promise<{ ok: true; rows: BlockedAttemptRow[] } | { ok: false; reason: "db-error" }> {
  try {
    const db = createAdminSupabase();
    const { data, error } = await db
      .from("whatsapp_blocked_attempts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = data ?? [];
    const agentNames = await profileNames([...new Set(rows.map((r) => r.agent_id).filter((x): x is string => !!x))]);
    const numberIds = [...new Set(rows.map((r) => r.number_id).filter((x): x is string => !!x))];
    const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((x): x is string => !!x))];
    const [{ data: nums }, { data: cons }] = await Promise.all([
      numberIds.length ? db.from("whatsapp_numbers").select("id, label").in("id", numberIds) : Promise.resolve({ data: [] }),
      contactIds.length ? db.from("contacts").select("id, full_name").in("id", contactIds) : Promise.resolve({ data: [] }),
    ]);
    const numLabel = new Map((nums ?? []).map((n) => [n.id, n.label]));
    const conName = new Map((cons ?? []).map((c) => [c.id, c.full_name]));
    return {
      ok: true,
      rows: rows.map((r) => ({
        id: r.id,
        reason: r.reason,
        created_at: r.created_at,
        number_label: r.number_id ? numLabel.get(r.number_id) ?? null : null,
        agent_name: r.agent_id ? agentNames.get(r.agent_id) ?? null : null,
        contact_name: r.contact_id ? conName.get(r.contact_id) ?? null : null,
      })),
    };
  } catch (e) {
    console.error("[sales-numbers] listBlockedAttempts", e);
    return { ok: false, reason: "db-error" };
  }
}
```

- [ ] **Step 4: Run the test and tsc**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-exports.test.ts` then `node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS and tsc clean. If `profiles.full_name` is not a column name, use the real one from `database.types.ts` and report it. Fix typing issues minimally (a local cast is fine); do not edit `database.types.ts` beyond Task 1's entries.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/sales-numbers.ts tests/sales-data-exports.test.ts
git commit -m "feat(sales): WhatsApp numbers, settings, budgets and freeze data module"
```

---

### Task 6: Contacts data module (queue, list, timeline, claim, outcome, note, add lead, assign)

**Files:**
- Create: `src/lib/data/sales-contacts.ts`
- Modify: `tests/sales-data-exports.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 (`nextFollowupFor`, `rankQueue`, `OutcomeKind`), Task 4 (`sanitizeSearch`), `canActOnContact`, `canClaimContact`, `type Actor` from `@/lib/crm/ownership`, `normalizePhone` from `@/lib/crm/phone`, `Role` from `@/lib/roles`.
- Produces (exact; all take `actor: Actor` = `{ id: string; role: Role }`):
  - `getTodayQueue(actor, now?)`: `{ ok: true; items: QueueCard[]; remaining: number } | { ok: false; reason: "db-error" }`
  - `listContacts(actor, query: { tab; q?; page })`: `{ ok: true; rows: ContactRow[]; total: number; pageSize: number } | { ok: false; reason: "db-error" }`
  - `getContactDetail(actor, contactId)`: `{ ok: true; contact; timeline; canAct: boolean } | { ok: false; reason: "not-found" | "not-allowed" | "db-error" }`
  - `claimContact(actor, contactId, now?)`, `logOutcome(actor, contactId, input, now?)`, `addNote(actor, contactId, body)`, `addLead(actor, input, now?)`, `assignContacts(admin, contactIds, agentId | null, now?)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/sales-data-exports.test.ts`:

```ts
import * as contacts from "@/lib/data/sales-contacts";

describe("sales-contacts exports", () => {
  it("exposes the contact actions", () => {
    for (const name of [
      "getTodayQueue",
      "listContacts",
      "getContactDetail",
      "claimContact",
      "logOutcome",
      "addNote",
      "addLead",
      "assignContacts",
    ]) {
      expect(typeof (contacts as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-exports.test.ts`
Expected: FAIL (module not found for `sales-contacts`).

- [ ] **Step 3: Implement**

Create `src/lib/data/sales-contacts.ts`:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { canActOnContact, canClaimContact, type Actor } from "@/lib/crm/ownership";
import { nextFollowupFor, rankQueue, type OutcomeKind } from "@/lib/crm/followup";
import { normalizePhone } from "@/lib/crm/phone";
import { sanitizeSearch } from "@/lib/validations/sales";

const PAGE_SIZE = 30;
const QUEUE_LIMIT = 50;
const DAY_MS = 86_400_000;

export type QueueCard = {
  id: string;
  full_name: string;
  phone_e164: string;
  last_outcome: string | null;
  next_followup_at: string | null;
  last_note: string | null;
  warm: boolean;
  recently_contacted: boolean;
};

export type ContactRow = {
  id: string;
  full_name: string;
  phone_e164: string | null;
  owner_id: string | null;
  owner_name: string | null;
  last_outcome: string | null;
  next_followup_at: string | null;
  do_not_contact_at: string | null;
};

export type TimelineEntry = {
  id: string;
  kind: string;
  body: string | null;
  agent_name: string | null;
  created_at: string;
};

type Fail<R extends string> = { ok: false; reason: R };
const dbError = (tag: string, e: unknown): Fail<"db-error"> => {
  console.error(`[sales-contacts] ${tag}`, e);
  return { ok: false, reason: "db-error" };
};

async function ownerNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await createAdminSupabase().from("profiles").select("id, full_name").in("id", ids);
  for (const p of data ?? []) out.set(p.id, p.full_name ?? "");
  return out;
}

export async function getTodayQueue(
  actor: Actor,
  now: Date = new Date(),
): Promise<{ ok: true; items: QueueCard[]; remaining: number } | Fail<"db-error">> {
  if (actor.id === "") return { ok: true, items: [], remaining: 0 };
  try {
    const db = createAdminSupabase();
    const { data, error } = await db
      .from("contacts")
      .select("id, full_name, phone_e164, last_outcome, next_followup_at")
      .eq("owner_id", actor.id)
      .is("do_not_contact_at", null)
      .is("whatsapp_unsubscribed_at", null)
      .not("phone_e164", "is", null)
      .or(`next_followup_at.is.null,next_followup_at.lte.${now.toISOString()}`)
      .limit(500);
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return { ok: true, items: [], remaining: 0 };
    const ids = rows.map((r) => r.id);

    const [warmRes, recentRes, noteRes] = await Promise.all([
      db.from("contact_activities").select("contact_id").in("contact_id", ids).in("kind", ["replied", "interested", "bought"]),
      db
        .from("contact_activities")
        .select("contact_id")
        .in("contact_id", ids)
        .eq("kind", "sent")
        .gte("created_at", new Date(now.getTime() - DAY_MS).toISOString()),
      db
        .from("contact_activities")
        .select("contact_id, body")
        .in("contact_id", ids)
        .eq("kind", "note")
        .order("created_at", { ascending: false }),
    ]);
    for (const r of [warmRes, recentRes, noteRes]) if (r.error) throw r.error;
    const warm = new Set((warmRes.data ?? []).map((r) => r.contact_id));
    const recent = new Set((recentRes.data ?? []).map((r) => r.contact_id));
    const lastNote = new Map<string, string>();
    for (const n of noteRes.data ?? []) {
      if (!lastNote.has(n.contact_id) && n.body) lastNote.set(n.contact_id, n.body);
    }

    const cards = rows.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      phone_e164: r.phone_e164 as string,
      last_outcome: r.last_outcome,
      next_followup_at: r.next_followup_at,
      last_note: lastNote.get(r.id) ?? null,
      warm: warm.has(r.id),
      recently_contacted: recent.has(r.id),
    }));
    const ranked = rankQueue(cards, now);
    return { ok: true, items: ranked.slice(0, QUEUE_LIMIT), remaining: ranked.length };
  } catch (e) {
    return dbError("getTodayQueue", e);
  }
}

export async function listContacts(
  actor: Actor,
  query: { tab: "mine" | "unclaimed" | "all"; q?: string; page: number },
): Promise<{ ok: true; rows: ContactRow[]; total: number; pageSize: number } | Fail<"db-error">> {
  try {
    const db = createAdminSupabase();
    let q = db
      .from("contacts")
      .select("id, full_name, phone_e164, owner_id, last_outcome, next_followup_at, do_not_contact_at", {
        count: "exact",
      });
    if (query.tab === "mine") q = actor.id === "" ? q.eq("id", "00000000-0000-0000-0000-000000000000") : q.eq("owner_id", actor.id);
    if (query.tab === "unclaimed") q = q.is("owner_id", null);
    const term = query.q ? sanitizeSearch(query.q) : "";
    if (term) q = q.or(`full_name.ilike.%${term}%,phone_e164.ilike.%${term}%`);
    const from = (query.page - 1) * PAGE_SIZE;
    const { data, count, error } = await q
      .order("updated_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    const names = await ownerNames([...new Set(rows.map((r) => r.owner_id).filter((x): x is string => !!x))]);
    return {
      ok: true,
      rows: rows.map((r) => ({ ...r, owner_name: r.owner_id ? names.get(r.owner_id) ?? null : null })),
      total: count ?? 0,
      pageSize: PAGE_SIZE,
    };
  } catch (e) {
    return dbError("listContacts", e);
  }
}

export async function getContactDetail(actor: Actor, contactId: string): Promise<
  | {
      ok: true;
      contact: ContactRow & { email: string | null; profession: string | null };
      timeline: TimelineEntry[];
      canAct: boolean;
    }
  | Fail<"not-found" | "not-allowed" | "db-error">
> {
  if (actor.role !== "sales_agent" && actor.role !== "admin" && actor.role !== "super_admin") {
    return { ok: false, reason: "not-allowed" };
  }
  try {
    const db = createAdminSupabase();
    const { data: c, error } = await db
      .from("contacts")
      .select("id, full_name, phone_e164, email, profession, owner_id, last_outcome, next_followup_at, do_not_contact_at")
      .eq("id", contactId)
      .maybeSingle();
    if (error) throw error;
    if (!c) return { ok: false, reason: "not-found" };
    const { data: acts, error: actErr } = await db
      .from("contact_activities")
      .select("id, kind, body, agent_id, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (actErr) throw actErr;
    const names = await ownerNames([
      ...new Set([c.owner_id, ...(acts ?? []).map((a) => a.agent_id)].filter((x): x is string => !!x)),
    ]);
    return {
      ok: true,
      contact: { ...c, owner_name: c.owner_id ? names.get(c.owner_id) ?? null : null },
      timeline: (acts ?? []).map((a) => ({
        id: a.id,
        kind: a.kind,
        body: a.body,
        agent_name: a.agent_id ? names.get(a.agent_id) ?? null : null,
        created_at: a.created_at,
      })),
      canAct: canActOnContact({ owner_id: c.owner_id }, actor).ok,
    };
  } catch (e) {
    return dbError("getContactDetail", e);
  }
}

export async function claimContact(
  actor: Actor,
  contactId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | Fail<"not-found" | "not-allowed" | "already-claimed" | "db-error">> {
  try {
    const db = createAdminSupabase();
    const { data: c } = await db.from("contacts").select("id, owner_id").eq("id", contactId).maybeSingle();
    if (!c) return { ok: false, reason: "not-found" };
    const check = canClaimContact({ owner_id: c.owner_id }, actor);
    if (!check.ok) return { ok: false, reason: check.reason === "already-claimed" ? "already-claimed" : "not-allowed" };

    // Atomic: only succeeds while the contact is still unclaimed.
    const iso = now.toISOString();
    const { data: won, error } = await db
      .from("contacts")
      .update({ owner_id: actor.id, claimed_at: iso, next_followup_at: nextFollowupFor("claimed", now)!.toISOString() })
      .eq("id", contactId)
      .is("owner_id", null)
      .select("id");
    if (error) throw error;
    if (!won || won.length === 0) return { ok: false, reason: "already-claimed" };
    const { error: actErr } = await db
      .from("contact_activities")
      .insert({ contact_id: contactId, agent_id: actor.id, kind: "claimed", created_at: iso });
    if (actErr) throw actErr;
    return { ok: true };
  } catch (e) {
    return dbError("claimContact", e);
  }
}

async function loadOwned(actor: Actor, contactId: string) {
  const db = createAdminSupabase();
  const { data: c, error } = await db
    .from("contacts")
    .select("id, owner_id")
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw error;
  if (!c) return { ok: false as const, reason: "not-found" as const };
  const check = canActOnContact({ owner_id: c.owner_id }, actor);
  if (!check.ok) return { ok: false as const, reason: "not-owner" as const };
  return { ok: true as const };
}

export async function logOutcome(
  actor: Actor,
  contactId: string,
  input: { kind: OutcomeKind; askedToStop?: boolean },
  now: Date = new Date(),
): Promise<{ ok: true; nextFollowupAt: string | null } | Fail<"not-found" | "not-owner" | "db-error">> {
  try {
    const gate = await loadOwned(actor, contactId);
    if (!gate.ok) return gate;
    const db = createAdminSupabase();
    const iso = now.toISOString();
    const next = input.askedToStop ? null : nextFollowupFor(input.kind, now);
    const { error: actErr } = await db.from("contact_activities").insert({
      contact_id: contactId,
      agent_id: actor.id,
      kind: input.kind,
      body: input.askedToStop ? "Asked me to stop" : null,
      created_at: iso,
    });
    if (actErr) throw actErr;
    const patch: Record<string, unknown> = {
      last_outcome: input.kind,
      next_followup_at: next ? next.toISOString() : null,
    };
    if (input.askedToStop) patch.do_not_contact_at = iso;
    const { error } = await db.from("contacts").update(patch).eq("id", contactId);
    if (error) throw error;
    return { ok: true, nextFollowupAt: next ? next.toISOString() : null };
  } catch (e) {
    return dbError("logOutcome", e);
  }
}

export async function addNote(
  actor: Actor,
  contactId: string,
  body: string,
): Promise<{ ok: true } | Fail<"not-found" | "not-owner" | "db-error">> {
  try {
    const gate = await loadOwned(actor, contactId);
    if (!gate.ok) return gate;
    const { error } = await createAdminSupabase()
      .from("contact_activities")
      .insert({ contact_id: contactId, agent_id: actor.id, kind: "note", body });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return dbError("addNote", e);
  }
}

export async function addLead(
  actor: Actor,
  input: { phone: string; name?: string; email?: string; profession?: string; note?: string },
  now: Date = new Date(),
): Promise<
  | { ok: true; contactId: string }
  | { ok: false; reason: "invalid-phone"; detail: "empty" | "ambiguous" }
  | { ok: false; reason: "duplicate"; contactId: string; ownerName: string | null }
  | Fail<"not-allowed" | "db-error">
> {
  if (actor.role !== "sales_agent" && actor.role !== "admin" && actor.role !== "super_admin") {
    return { ok: false, reason: "not-allowed" };
  }
  if (actor.id === "") return { ok: false, reason: "not-allowed" };
  const phone = normalizePhone(input.phone);
  if (!phone.ok) return { ok: false, reason: "invalid-phone", detail: phone.reason };
  try {
    const db = createAdminSupabase();
    const { data: existing } = await db
      .from("contacts")
      .select("id, owner_id")
      .eq("phone_e164", phone.e164)
      .maybeSingle();
    if (existing) {
      const names = await ownerNames(existing.owner_id ? [existing.owner_id] : []);
      return {
        ok: false,
        reason: "duplicate",
        contactId: existing.id,
        ownerName: existing.owner_id ? names.get(existing.owner_id) ?? null : null,
      };
    }
    const iso = now.toISOString();
    const { data, error } = await db
      .from("contacts")
      .insert({
        full_name: input.name ?? "",
        phone_e164: phone.e164,
        phone_raw: input.phone,
        email: input.email ? input.email.toLowerCase() : null,
        profession: input.profession ?? null,
        consent_basis: "enquiry",
        owner_id: actor.id,
        claimed_at: iso,
        next_followup_at: iso,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { ok: false, reason: "duplicate", contactId: "", ownerName: null };
      throw error;
    }
    const rows = [{ contact_id: data.id, agent_id: actor.id, kind: "claimed", created_at: iso }] as {
      contact_id: string;
      agent_id: string;
      kind: string;
      body?: string;
      created_at: string;
    }[];
    if (input.note) rows.push({ contact_id: data.id, agent_id: actor.id, kind: "note", body: input.note, created_at: iso });
    const { error: actErr } = await db.from("contact_activities").insert(rows);
    if (actErr) throw actErr;
    return { ok: true, contactId: data.id };
  } catch (e) {
    return dbError("addLead", e);
  }
}

/** Admin only: assign contacts to a sales agent, or release them (agentId null). */
export async function assignContacts(
  admin: Actor,
  contactIds: string[],
  agentId: string | null,
  now: Date = new Date(),
): Promise<{ ok: true; count: number } | Fail<"not-allowed" | "invalid-agent" | "db-error">> {
  if (admin.role !== "admin" && admin.role !== "super_admin") return { ok: false, reason: "not-allowed" };
  try {
    const db = createAdminSupabase();
    let agentName = "";
    if (agentId !== null) {
      const { data: p } = await db.from("profiles").select("id, role, full_name").eq("id", agentId).maybeSingle();
      if (!p || p.role !== "sales_agent") return { ok: false, reason: "invalid-agent" };
      agentName = p.full_name ?? "";
    }
    const iso = now.toISOString();
    const { data: updated, error } = await db
      .from("contacts")
      .update({
        owner_id: agentId,
        claimed_at: agentId ? iso : null,
        next_followup_at: agentId ? iso : null,
      })
      .in("id", contactIds)
      .select("id");
    if (error) throw error;
    const done = updated ?? [];
    if (done.length > 0) {
      const { error: actErr } = await db.from("contact_activities").insert(
        done.map((c) => ({
          contact_id: c.id,
          agent_id: admin.id,
          kind: agentId ? "reassigned" : "released",
          body: agentId ? `Assigned to ${agentName}` : "Released to unclaimed",
          created_at: iso,
        })),
      );
      if (actErr) throw actErr;
    }
    return { ok: true, count: done.length };
  } catch (e) {
    return dbError("assignContacts", e);
  }
}
```

- [ ] **Step 4: Run the test and tsc**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-exports.test.ts` then `node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS, tsc clean. Check `normalizePhone`'s failure shape against `src/lib/crm/phone.ts` (`{ ok: false; reason: "empty" | "ambiguous" }`) and adjust only if it differs. Fix typing issues minimally with local casts.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/sales-contacts.ts tests/sales-data-exports.test.ts
git commit -m "feat(sales): contacts data module (queue, list, timeline, claim, outcomes, add lead, assign)"
```

---

### Task 7: Send gate (the only code that produces a WhatsApp link)

**Files:**
- Create: `src/lib/data/sales-send.ts`
- Modify: `tests/sales-data-exports.test.ts` (append)

**Interfaces:**
- Consumes: Task 3 (`evaluateSend`, `violationAfterInsert`, `budgetSummary`, `BlockReason`), Task 5 (`getSafetySettings`, `getNumberForAgent`, `getNumberUsage`, `toNumberState`, `logBlockedAttempt`), `canActOnContact`, `Actor`, `buildWhatsAppLink`, `renderWhatsAppMessage` from `@/lib/crm/whatsapp-link`.
- Produces: `requestSend(args: { actor: Actor; contactId: string; numberId: string; messageTemplate: string; now?: Date; rand?: () => number })` returning
  `{ ok: true; link: string; nextUnlockAt: string; warnings: string[]; isNewChat: boolean; budget: BudgetSummary } | { ok: false; reason: BlockReason | "not-found" | "not-owner" | "do-not-contact" | "no-phone" | "number-not-assigned" | "db-error"; message?: string; retryAt?: string | null }`.

- [ ] **Step 1: Write the failing test**

Append to `tests/sales-data-exports.test.ts`:

```ts
import * as send from "@/lib/data/sales-send";

describe("sales-send exports", () => {
  it("exposes requestSend", () => {
    expect(typeof send.requestSend).toBe("function");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-exports.test.ts`
Expected: FAIL (module not found for `sales-send`).

- [ ] **Step 3: Implement**

Create `src/lib/data/sales-send.ts`:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { canActOnContact, type Actor } from "@/lib/crm/ownership";
import { buildWhatsAppLink, renderWhatsAppMessage } from "@/lib/crm/whatsapp-link";
import {
  budgetSummary,
  evaluateSend,
  violationAfterInsert,
  type BlockReason,
  type BudgetSummary,
} from "@/lib/crm/send-limits";
import {
  getNumberForAgent,
  getNumberUsage,
  getSafetySettings,
  logBlockedAttempt,
  toNumberState,
} from "@/lib/data/sales-numbers";

export type SendResult =
  | {
      ok: true;
      link: string;
      nextUnlockAt: string;
      warnings: string[];
      isNewChat: boolean;
      budget: BudgetSummary;
    }
  | {
      ok: false;
      reason:
        | BlockReason
        | "not-found"
        | "not-owner"
        | "do-not-contact"
        | "no-phone"
        | "number-not-assigned"
        | "db-error";
      message?: string;
      retryAt?: string | null;
    };

/**
 * The one place a WhatsApp link is produced. Counting happens when the link is
 * requested, not when WhatsApp opens (the app cannot see inside WhatsApp), which
 * errs on the cautious side. The checks run before the insert; after it the
 * limits are re-verified and the row is removed if two taps raced.
 */
export async function requestSend(args: {
  actor: Actor;
  contactId: string;
  numberId: string;
  messageTemplate: string;
  now?: Date;
  rand?: () => number;
}): Promise<SendResult> {
  const { actor, contactId, numberId, messageTemplate } = args;
  const now = args.now ?? new Date();
  const rand = args.rand ?? Math.random;
  try {
    const db = createAdminSupabase();

    const { data: contact, error } = await db
      .from("contacts")
      .select("id, full_name, phone_e164, owner_id, do_not_contact_at, whatsapp_unsubscribed_at")
      .eq("id", contactId)
      .maybeSingle();
    if (error) throw error;
    if (!contact) return { ok: false, reason: "not-found" };

    if (!canActOnContact({ owner_id: contact.owner_id }, actor).ok) return { ok: false, reason: "not-owner" };
    if (contact.do_not_contact_at || contact.whatsapp_unsubscribed_at) {
      return { ok: false, reason: "do-not-contact" };
    }
    if (!contact.phone_e164) return { ok: false, reason: "no-phone" };

    const isAdmin = actor.role === "admin" || actor.role === "super_admin";
    const number = await getNumberForAgent(actor.id, isAdmin, numberId);
    if (!number) return { ok: false, reason: "number-not-assigned" };

    const settings = await getSafetySettings();
    const state = toNumberState(number);

    // A "new chat" is a contact with no two-way history yet.
    const { data: twoWay, error: twErr } = await db
      .from("contact_activities")
      .select("id")
      .eq("contact_id", contactId)
      .in("kind", ["replied", "interested", "bought"])
      .limit(1);
    if (twErr) throw twErr;
    const isNewChat = (twoWay ?? []).length === 0;

    const usage = await getNumberUsage(numberId, now, settings);
    const decision = evaluateSend({ now, settings, state, usage, isNewChat, rand });
    if (!decision.ok) {
      await logBlockedAttempt({ numberId, agentId: actor.id, contactId, reason: decision.reason });
      return {
        ok: false,
        reason: decision.reason,
        message: decision.message,
        retryAt: decision.retryAt ? decision.retryAt.toISOString() : null,
      };
    }

    const body = renderWhatsAppMessage(messageTemplate, contact.full_name);
    const createdIso = now.toISOString();
    const { data: row, error: insErr } = await db
      .from("contact_activities")
      .insert({
        contact_id: contactId,
        agent_id: actor.id,
        kind: "sent",
        body,
        number_id: numberId,
        is_new_chat: isNewChat,
        burst_pos: decision.burstPos,
        next_unlock_at: decision.nextUnlockAt.toISOString(),
        created_at: createdIso,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    // Re-verify: catches two taps racing on a shared number.
    const after = await getNumberUsage(numberId, now, settings);
    const { data: prevRows, error: prevErr } = await db
      .from("contact_activities")
      .select("created_at, next_unlock_at, burst_pos")
      .eq("number_id", numberId)
      .eq("kind", "sent")
      .lt("created_at", createdIso)
      .order("created_at", { ascending: false })
      .limit(1);
    if (prevErr) throw prevErr;
    const prev = prevRows?.[0];
    const violation = violationAfterInsert({
      now,
      settings,
      state,
      isNewChat,
      usageWithOurs: { newChatsToday: after.newChatsToday, newChatsLastHour: after.newChatsLastHour },
      previousSend:
        prev && prev.next_unlock_at
          ? {
              createdAt: new Date(prev.created_at),
              nextUnlockAt: new Date(prev.next_unlock_at),
              burstPos: prev.burst_pos ?? 1,
            }
          : null,
    });
    if (violation) {
      await db.from("contact_activities").delete().eq("id", row.id);
      await logBlockedAttempt({ numberId, agentId: actor.id, contactId, reason: violation });
      return {
        ok: false,
        reason: violation,
        message: "Another message was just sent from this number. Try again in a moment.",
        retryAt: null,
      };
    }

    return {
      ok: true,
      link: buildWhatsAppLink(contact.phone_e164, messageTemplate, contact.full_name),
      nextUnlockAt: decision.nextUnlockAt.toISOString(),
      warnings: decision.warnings,
      isNewChat,
      budget: budgetSummary({ now, settings, state, usage: after }),
    };
  } catch (e) {
    console.error("[sales-send] requestSend", e);
    return { ok: false, reason: "db-error" };
  }
}
```

- [ ] **Step 4: Run the test and tsc**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-exports.test.ts` then `node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS, tsc clean. If `buildWhatsAppLink` or `renderWhatsAppMessage` have different parameter order than `(phoneE164, messageTemplate, fullName)` / `(template, fullName)`, follow `src/lib/crm/whatsapp-link.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/sales-send.ts tests/sales-data-exports.test.ts
git commit -m "feat(sales): server-enforced send gate that issues WhatsApp links"
```

---

### Task 8: API routes

**Files (all Create):**
- `src/app/api/sales/today/route.ts` (GET)
- `src/app/api/sales/budget/route.ts` (GET)
- `src/app/api/sales/contacts/route.ts` (GET)
- `src/app/api/sales/contacts/[id]/route.ts` (GET)
- `src/app/api/sales/contacts/[id]/claim/route.ts` (POST)
- `src/app/api/sales/contacts/[id]/outcome/route.ts` (POST)
- `src/app/api/sales/contacts/[id]/note/route.ts` (POST)
- `src/app/api/sales/contacts/[id]/send/route.ts` (POST)
- `src/app/api/sales/numbers/[id]/freeze/route.ts` (POST)
- `src/app/api/sales/leads/route.ts` (POST)
- `src/app/api/admin/sales/numbers/route.ts` (GET, POST)
- `src/app/api/admin/sales/numbers/[id]/route.ts` (PATCH)
- `src/app/api/admin/sales/settings/route.ts` (GET, PUT)
- `src/app/api/admin/sales/blocked-attempts/route.ts` (GET)
- `src/app/api/admin/sales/contacts/assign/route.ts` (POST)

**Interfaces:**
- Consumes: Tasks 4-7. `requireSalesAgent()` returns `{ ok: true; user; role } | { ok: false; response }`; `requireAdmin()` the same shape (see `src/lib/auth/require-admin.ts`).
- Produces: JSON endpoints used by Phase B2 screens. Success bodies: `/today` `{ items, remaining }`; `/budget` `{ budgets }`; `/contacts` `{ rows, total, pageSize }`; `/contacts/[id]` `{ contact, timeline, canAct }`; `/send` `{ link, nextUnlockAt, warnings, isNewChat, budget }`; `/leads` `{ ok: true, contactId }` (201). Failures: `{ error: string, reason: string, retryAt?: string | null }` with `statusForReason(reason)`.

- [ ] **Step 1: Write the failing test**

Create `tests/sales-routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const salesRoot = join(process.cwd(), "src", "app", "api", "sales");
const adminSalesRoot = join(process.cwd(), "src", "app", "api", "admin", "sales");
const rel = (p: string) => p.replace(process.cwd(), "").replaceAll("\\", "/");

describe("sales route files", () => {
  const sales = walk(salesRoot);
  const adminSales = walk(adminSalesRoot);

  it("exist in the expected number", () => {
    expect(sales.map(rel).sort()).toEqual(
      [
        "/src/app/api/sales/budget/route.ts",
        "/src/app/api/sales/contacts/[id]/claim/route.ts",
        "/src/app/api/sales/contacts/[id]/note/route.ts",
        "/src/app/api/sales/contacts/[id]/outcome/route.ts",
        "/src/app/api/sales/contacts/[id]/route.ts",
        "/src/app/api/sales/contacts/[id]/send/route.ts",
        "/src/app/api/sales/contacts/route.ts",
        "/src/app/api/sales/leads/route.ts",
        "/src/app/api/sales/numbers/[id]/freeze/route.ts",
        "/src/app/api/sales/today/route.ts",
      ].sort(),
    );
    expect(adminSales).toHaveLength(5);
  });

  it("every agent route gates with requireSalesAgent and never requireAdmin", () => {
    for (const f of sales) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).toContain("requireSalesAgent(");
      expect(src, rel(f)).not.toContain("requireAdmin(");
    }
  });

  it("every admin route gates with requireAdmin and never requireSalesAgent", () => {
    for (const f of adminSales) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).toContain("requireAdmin(");
      expect(src, rel(f)).not.toContain("requireSalesAgent");
    }
  });

  it("no route builds a WhatsApp link itself; only the send route goes through requestSend", () => {
    for (const f of [...sales, ...adminSales]) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toContain("buildWhatsAppLink");
    }
    const sendRoute = readFileSync(join(salesRoot, "contacts", "[id]", "send", "route.ts"), "utf8");
    expect(sendRoute).toContain("requestSend(");
  });

  it("no route talks to the database client directly", () => {
    for (const f of [...sales, ...adminSales]) {
      const src = readFileSync(f, "utf8");
      expect(src, rel(f)).not.toContain("createAdminSupabase");
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-routes.test.ts`
Expected: FAIL (directories do not exist).

- [ ] **Step 3: Write the agent routes**

First open `src/app/api/admin/crm/whatsapp/batches/[id]/route.ts` and copy its exact `params` typing for dynamic segments (Next 15 passes `params` as a Promise; follow whatever it does). Below, `ctx` stands for that exact signature; replace `{ params }: Ctx` with the repo's form.

`src/app/api/sales/today/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { getTodayQueue } from "@/lib/data/sales-contacts";

export async function GET() {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const result = await getTodayQueue({ id: auth.user.id, role: auth.role });
  if (!result.ok) return NextResponse.json({ error: "Could not load today's list." }, { status: 500 });
  return NextResponse.json({ items: result.items, remaining: result.remaining });
}
```

`src/app/api/sales/budget/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { getBudgetsForAgent } from "@/lib/data/sales-numbers";

export async function GET() {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const isAdmin = auth.role === "admin" || auth.role === "super_admin";
  const result = await getBudgetsForAgent(auth.user.id, isAdmin);
  if (!result.ok) return NextResponse.json({ error: "Could not load your sending budget." }, { status: 500 });
  return NextResponse.json({ budgets: result.budgets });
}
```

`src/app/api/sales/contacts/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { listContacts } from "@/lib/data/sales-contacts";
import { contactsQuerySchema } from "@/lib/validations/sales";

export async function GET(req: NextRequest) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = contactsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await listContacts({ id: auth.user.id, role: auth.role }, parsed.data);
  if (!result.ok) return NextResponse.json({ error: "Could not load contacts." }, { status: 500 });
  return NextResponse.json({ rows: result.rows, total: result.total, pageSize: result.pageSize });
}
```

`src/app/api/sales/contacts/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { getContactDetail } from "@/lib/data/sales-contacts";
import { statusForReason } from "@/lib/api/sales-http";

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await getContactDetail({ id: auth.user.id, role: auth.role }, id);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not open this contact.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ contact: result.contact, timeline: result.timeline, canAct: result.canAct });
}
```

`src/app/api/sales/contacts/[id]/claim/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { claimContact } from "@/lib/data/sales-contacts";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(_req: Request, { params }: Ctx) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await claimContact({ id: auth.user.id, role: auth.role }, id);
  if (!result.ok) {
    const error = result.reason === "already-claimed" ? "Someone else already claimed this contact." : "Could not claim this contact.";
    return NextResponse.json({ error, reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true });
}
```

`src/app/api/sales/contacts/[id]/outcome/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { logOutcome } from "@/lib/data/sales-contacts";
import { outcomeSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";
import type { OutcomeKind } from "@/lib/crm/followup";

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = outcomeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id } = await params;
  const result = await logOutcome({ id: auth.user.id, role: auth.role }, id, {
    kind: parsed.data.kind as OutcomeKind,
    askedToStop: parsed.data.askedToStop,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Could not save that.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true, nextFollowupAt: result.nextFollowupAt });
}
```

`src/app/api/sales/contacts/[id]/note/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { addNote } from "@/lib/data/sales-contacts";
import { noteSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = noteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id } = await params;
  const result = await addNote({ id: auth.user.id, role: auth.role }, id, parsed.data.body);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not save the note.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
```

`src/app/api/sales/contacts/[id]/send/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { requestSend } from "@/lib/data/sales-send";
import { sendRequestSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = sendRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id } = await params;
  const result = await requestSend({
    actor: { id: auth.user.id, role: auth.role },
    contactId: id,
    numberId: parsed.data.numberId,
    messageTemplate: parsed.data.messageTemplate,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message ?? "Could not send this message.", reason: result.reason, retryAt: result.retryAt ?? null },
      { status: statusForReason(result.reason) },
    );
  }
  return NextResponse.json({
    link: result.link,
    nextUnlockAt: result.nextUnlockAt,
    warnings: result.warnings,
    isNewChat: result.isNewChat,
    budget: result.budget,
  });
}
```

`src/app/api/sales/numbers/[id]/freeze/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { freezeNumber } from "@/lib/data/sales-numbers";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(_req: Request, { params }: Ctx) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const isAdmin = auth.role === "admin" || auth.role === "super_admin";
  const result = await freezeNumber(auth.user.id, isAdmin, id);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not pause this number.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true, frozenUntil: result.frozenUntil.toISOString() });
}
```

`src/app/api/sales/leads/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { addLead } from "@/lib/data/sales-contacts";
import { leadSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(req: Request) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = leadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await addLead({ id: auth.user.id, role: auth.role }, parsed.data);
  if (!result.ok) {
    if (result.reason === "invalid-phone") {
      return NextResponse.json({ error: "Enter a valid phone number (e.g. 03001234567).", reason: "invalid-phone" }, { status: 400 });
    }
    if (result.reason === "duplicate") {
      return NextResponse.json(
        { error: "This person is already in the CRM.", reason: "duplicate", contactId: result.contactId, ownerName: result.ownerName },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not save this lead.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true, contactId: result.contactId }, { status: 201 });
}
```

In each file declare, above the handler that uses it, `type Ctx = { params: Promise<{ id: string }> };` (or the repo's own form, copied from the batches route).

- [ ] **Step 4: Write the admin routes**

`src/app/api/admin/sales/numbers/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createNumber, listNumbersAdmin } from "@/lib/data/sales-numbers";
import { numberCreateSchema } from "@/lib/validations/sales";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const result = await listNumbersAdmin();
  if (!result.ok) return NextResponse.json({ error: "Could not load numbers." }, { status: 500 });
  return NextResponse.json({ numbers: result.numbers });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = numberCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await createNumber(parsed.data);
  if (!result.ok) return NextResponse.json({ error: "Could not add this number." }, { status: 500 });
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
```

`src/app/api/admin/sales/numbers/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateNumber } from "@/lib/data/sales-numbers";
import { numberUpdateSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = numberUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id } = await params;
  const result = await updateNumber(id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not update this number.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true });
}
```

`src/app/api/admin/sales/settings/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSafetySettings, updateSafetySettings } from "@/lib/data/sales-numbers";
import { settingsUpdateSchema } from "@/lib/validations/sales";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ settings: await getSafetySettings() });
}

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = settingsUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await updateSafetySettings(parsed.data);
  if (!result.ok) return NextResponse.json({ error: "Could not save the settings." }, { status: 500 });
  return NextResponse.json({ settings: result.settings });
}
```

`src/app/api/admin/sales/blocked-attempts/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listBlockedAttempts } from "@/lib/data/sales-numbers";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const result = await listBlockedAttempts();
  if (!result.ok) return NextResponse.json({ error: "Could not load the log." }, { status: 500 });
  return NextResponse.json({ rows: result.rows });
}
```

`src/app/api/admin/sales/contacts/assign/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { assignContacts } from "@/lib/data/sales-contacts";
import { assignSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = assignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await assignContacts(
    { id: auth.user.id, role: auth.role },
    parsed.data.contactIds,
    parsed.data.agentId,
  );
  if (!result.ok) {
    const error = result.reason === "invalid-agent" ? "That person is not a sales agent." : "Could not assign these contacts.";
    return NextResponse.json({ error, reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true, count: result.count });
}
```

Check `requireAdmin()`'s return value in `src/lib/auth/require-admin.ts`: if it exposes `role` use it as written, otherwise read the role from the same place `requireSalesAgent` does and adjust. `statusForReason` must also map `invalid-agent` to 400 (default already does).

- [ ] **Step 5: Run the tests and tsc**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-routes.test.ts tests/api-role-gates.test.ts` then `node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS and tsc clean. `api-role-gates` already enforces the gates for these new files.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sales src/app/api/admin/sales tests/sales-routes.test.ts
git commit -m "feat(sales): agent and admin API routes for the workspace and send limits"
```

---

### Task 9: Structural guards on the data layer

**Files:**
- Create: `tests/sales-data-guards.test.ts`

**Interfaces:**
- Consumes: Tasks 5-7 source files.
- Produces: tripwires so a later change cannot silently drop the ownership checks or the limit gate.

- [ ] **Step 1: Write the test**

Create `tests/sales-data-guards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name: string) =>
  readFileSync(join(process.cwd(), "src", "lib", "data", name), "utf8");

describe("data layer guards", () => {
  const contacts = read("sales-contacts.ts");
  const send = read("sales-send.ts");
  const numbers = read("sales-numbers.ts");

  it("contact actions go through the ownership helpers", () => {
    expect(contacts).toContain("canActOnContact(");
    expect(contacts).toContain("canClaimContact(");
    expect(send).toContain("canActOnContact(");
  });

  it("the send gate checks limits before and after inserting, and refuses do-not-contact", () => {
    expect(send).toContain("evaluateSend(");
    expect(send).toContain("violationAfterInsert(");
    expect(send).toContain("do_not_contact_at");
    expect(send).toContain("whatsapp_unsubscribed_at");
  });

  it("the Today queue never includes do-not-contact or unsubscribed contacts", () => {
    const queue = contacts.slice(contacts.indexOf("export async function getTodayQueue"), contacts.indexOf("export async function listContacts"));
    expect(queue).toContain('.is("do_not_contact_at", null)');
    expect(queue).toContain('.is("whatsapp_unsubscribed_at", null)');
  });

  it("only the send module produces WhatsApp links", () => {
    expect(contacts).not.toContain("buildWhatsAppLink");
    expect(numbers).not.toContain("buildWhatsAppLink");
    expect(send).toContain("buildWhatsAppLink(");
  });

  it("an empty actor id never matches a number assignment", () => {
    expect(numbers).toContain('userId === ""');
  });

  it("admin assign is admin-only", () => {
    const assign = contacts.slice(contacts.indexOf("export async function assignContacts"));
    expect(assign).toContain('admin.role !== "admin" && admin.role !== "super_admin"');
  });

  it("no log line or message promises safety", () => {
    for (const src of [contacts, send, numbers]) {
      expect(src).not.toMatch(/\bguarantee/i);
      expect(src).not.toMatch(/\b100% safe\b/i);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-data-guards.test.ts`
Expected: PASS. If a string assertion fails because the implementation spelled something differently (for example a different quote style), fix the implementation to match the tripwire only when the behaviour is missing; if the behaviour is present, adjust the assertion string and say so in the report.

- [ ] **Step 3: Run the whole suite and tsc**

Run: `node node_modules/vitest/vitest.mjs run` then `node node_modules/typescript/bin/tsc --noEmit`
Expected: all pass; tsc clean.

- [ ] **Step 4: Commit**

```bash
git add tests/sales-data-guards.test.ts
git commit -m "test(sales): structural guards for ownership, limits and do-not-contact"
```

---

### Task 10: Ship checklist (controller and owner only, not for implementers)

Runs after Tasks 1-9 are reviewed clean. Applying changes the live database, so the owner approves each step. The Supabase MCP write is declined by the harness in this environment: the owner pastes SQL into the Supabase SQL editor (project `whqdasotjlhvrjmgiffk`), then the controller verifies with read-only queries.

- [ ] **Step 1: Owner pastes `supabase/migrations/0063_sales_workspace_core.sql`** into the SQL editor and runs it once. It is idempotent.
- [ ] **Step 2: Verify read-only:** the five tables exist; `select count(*) from public.whatsapp_safety_settings` returns 1 with `daily_cap = 60`; `contacts` has `next_followup_at`, `last_outcome`, `do_not_contact_at`; RLS is on for all five (`select relname, relrowsecurity from pg_class where relname in (...)`).
- [ ] **Step 3: Seed a test number for the click-through** (owner approves the SQL): insert a `whatsapp_numbers` row labelled `TEST number` and assign it to the test sales agent in `whatsapp_number_agents`. Delete both after testing.
- [ ] **Step 4: API smoke test as the test sales agent** (needs the Phase B2 screens or authenticated `fetch` from the browser console): claim an unclaimed contact; `POST /send` returns a link and a countdown; an immediate second `POST /send` returns 429 `spacing`; log an outcome and confirm `next_followup_at`; confirm `/api/admin/sales/numbers` returns 403 for the agent.
- [ ] **Step 5: Final whole-branch review, then `superpowers:finishing-a-development-branch`.** Ask the owner before any merge or push.

---

## Self-Review

- **Spec coverage:**
  - Section 3: `contact_activities` (Task 1), `next_followup_at` / `last_outcome` and follow-up defaults (Tasks 1-2), Today queue ordering with warm contacts first and oldest-due-first (Tasks 2, 6), claiming (Task 6), `created_by` on `whatsapp_batches` already exists (no work), do-not-contact and unsubscribed contacts excluded (Tasks 6-7, guard test), "recently contacted" 24 h warning (queue card flag, Task 6), every action writes a timeline row (Tasks 6-7), admin assign and reassign with timeline (Task 6/8).
  - Section 5: numbers and many-to-many assignment with one shared budget (Tasks 1, 5), per-number daily cap 60, hourly cap 20 with warning from 15, spacing 90-180 s, burst break, warm-up, quiet hours, freeze 48 h, visible budget (Tasks 3, 5, 7), asked-to-stop do-not-contact (Task 6), panic freeze (Task 5, route in Task 8), admin settings, per-number overrides, unfreeze and blocked-attempt log (Tasks 5, 8), server enforcement via `requestSend` (Task 7).
  - Deferred to later plans by design: message-variety rule (item 7) and "reply STOP" template suggestion belong to the Phase C campaign step; the admin in-app alert/banner on a panic freeze is Phase B2 UI (the freeze is already logged in `whatsapp_blocked_attempts` and visible through `/api/admin/sales/blocked-attempts`); the Add-lead chat-paste extraction is client-side in B2 using `src/lib/leads/extract.ts`, and the save endpoint exists here.
  - Spec wording `{name}` maps to the existing `{{first_name}}` tag in `renderWhatsAppMessage`; no new tag syntax is introduced.
- **Placeholders:** none. Every code step is complete code. The only instruction to "follow the repo" is for the dynamic-route `params` typing and `requireAdmin`'s return shape, both named with the file to copy from.
- **Type consistency:** `SafetySettings`, `NumberState`, `Usage`, `LastSend`, `BlockReason`, `SendDecision`, `BudgetSummary`, `OutcomeKind`, `QueueItem`, `Actor` are defined once (Tasks 2, 3, existing `ownership.ts`) and imported with the same names later. Reasons used by `statusForReason` match the `reason` strings returned by the data modules (`not-found`, `not-owner`, `not-allowed`, `already-claimed`, `do-not-contact`, `no-phone`, `number-not-assigned`, `duplicate`, `db-error`, and the five `BlockReason` values).
- **Known, accepted limits (flag to the owner):**
  1. A send is counted when the link is requested, not when WhatsApp opens; an agent who requests a link and never sends still uses budget. Cautious by design.
  2. Two requests with the exact same millisecond timestamp on one number could both pass the post-insert check. Practically unreachable; the 90-180 s spacing makes simultaneous requests a rare accident rather than a pattern.
  3. Agents who message from WhatsApp directly, outside the CRM, are invisible to these limits (the Help screen in B2 must say so).
  4. The limits are guesses at WhatsApp's behaviour, not guarantees. Tune with real results.
- **Review Focus:** each line has a test: quiet-hour boundaries, local-day rollover, warm-up arithmetic, expired and open-ended freeze, inclusive spacing, burst reset and the 10th-send lock, replies vs new chats, race re-check (all in `crm-send-limits.test.ts`); search sanitising (`sales-validations.test.ts`); do-not-contact in queue and send, ownership helpers and empty actor id (`sales-data-guards.test.ts`); route gating (`sales-routes.test.ts`, `api-role-gates.test.ts`).
