# WhatsApp Click-to-Chat Outreach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin compose a WhatsApp message, pick an audience with the same segment builder email campaigns use, and generate a batch of pre-filled `wa.me` click-to-chat links they work through manually — with progress ("112/183 sent") persisted so a large cohort can be sent over several sittings.

**Architecture:** Two new tables (`whatsapp_batches`, `whatsapp_batch_recipients` — the recipient list is snapshotted at creation, not live-joined). `buildSegmentFilters` gains a `guard` parameter so the existing filter-building logic serves both the email `is_sendable` rule and a new WhatsApp phone-reachability rule. A new, separate `resolveWhatsAppSegment` function (parallel to the existing `resolveSegment`, not a modification of it) resolves a segment against the WhatsApp guard — kept separate rather than overloading `resolveSegment` because the two channels return contacts with genuinely different required fields (email requires non-null `email`/`unsubscribeToken`; WhatsApp requires non-null `phoneE164` and tolerates no email at all). New CRM tab reusing `SegmentBuilder` (given a `channel="whatsapp"` prop) for audience picking and a compose form + inline recipient table (mirroring the existing Campaigns/Contacts tab patterns) for the rest.

**Tech Stack:** Next.js App Router, Supabase (Postgres + supabase-js), Zod, Vitest, Tailwind (project's `pz-*` design tokens), `sonner` for toasts. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-23-whatsapp-click-to-chat-design.md`

## Global Constraints

- Every new table gets RLS enabled with **zero policies** (service-role only) — the established convention in this codebase (migration 0047's comment: "RLS is ENABLED with ZERO policies... All reads and writes go through `createAdminSupabase()` behind `requireAdmin()`"). Every new API route starts with `const auth = await requireAdmin(); if (!auth.ok) return auth.response;`.
- This codebase does **not** unit-test its Supabase-backed data-layer functions (`admin-crm-*.ts` files) or API routes with mocks — verify those against the **live** Supabase project (`whqdasotjlhvrjmgiffk`) and the running dev server instead. Only pure, I/O-free functions (`src/lib/crm/*.ts`, Zod schemas) get Vitest unit tests, matching `tests/crm-segment.test.ts` and `tests/crm.schema.test.ts`.
- Run `node_modules/.bin/tsc --noEmit`, the relevant `node_modules/.bin/vitest run <file>`, and `node_modules/.bin/eslint <touched files>` at the end of every task — the project's `npm run` is broken by the `&` in the workspace path, so binaries are always called directly.
- Never run `next build` while the dev server (port 3000) is live.
- The recipient list is a **snapshot** at batch-creation time (`full_name`/`phone_e164` copied into `whatsapp_batch_recipients`), not a live join against `contacts`. Nothing in this plan should re-derive a recipient's name/phone from `contacts` after creation.
- `sent_count` on `whatsapp_batches` is **recomputed** (a `COUNT` query) on every recipient status change, never incremented/decremented in place — safe against any future bulk-status operation and immune to drift.

## Review Focus

1. **Batch creation against a segment with zero phone-reachable matches.** A reasonable admin expects a clear 400 ("no one matches"), not a batch silently created with 0 recipients that then sits in the list looking broken. Tested in Task 9.
2. **An empty filter list (no filters at all) for a WhatsApp batch.** Should match "everyone phone-reachable," the same way an empty email segment already means "everyone sendable" — not zero, not an error. Tested in Task 9.
3. **A contact whose full name has no space** (a single word, e.g. "Somaan" — real data in this CRM, confirmed live). `{{first_name}}` extraction must not crash or produce garbage. Tested in Task 7.
4. **A message template with no merge tags at all.** Someone will write a plain-text broadcast with no personalization; the link must still generate correctly rather than assuming a tag is always present. Tested in Task 7.
5. **Marking a recipient sent/pending using a recipient id that belongs to a *different* batch than the one in the URL.** The PATCH route takes both a batch id and a recipient id from the URL; a bug here would let one batch's PATCH silently corrupt another batch's recipient and `sent_count`. Tested in Task 9.

---

## File structure

**Create:**
- `supabase/migrations/0054_whatsapp_batches.sql` — new tables, enum, view update
- `src/lib/crm/whatsapp-link.ts` — pure link/merge-tag helpers
- `tests/crm-whatsapp-link.test.ts`
- `src/lib/data/admin-crm-whatsapp.ts` — batch/recipient data layer
- `src/app/api/admin/crm/whatsapp/batches/route.ts` — GET (list), POST (create)
- `src/app/api/admin/crm/whatsapp/batches/[id]/route.ts` — GET (detail)
- `src/app/api/admin/crm/whatsapp/batches/[id]/recipients/[recipientId]/route.ts` — PATCH (status)
- `src/components/admin/crm/WhatsAppPanel.tsx` — the tab's UI

**Modify:**
- `src/lib/crm/segment.ts` — `QueryOp` gains `not-null`/`is-null`; `SENDABLE_GUARD` becomes exported `EMAIL_SENDABLE_GUARD`/`WHATSAPP_REACHABLE_GUARD` arrays; `buildSegmentFilters` takes a `guard` parameter
- `tests/crm-segment.test.ts` — updated + new guard tests
- `src/lib/data/admin-crm-segments.ts` — `applyOp` gains the two new kinds; new `resolveWhatsAppSegment` function (parallel to `resolveSegment`, which is untouched)
- `src/lib/validations/crm.ts` — new schemas; `segmentPreviewSchema` gains `channel`
- `tests/crm.schema.test.ts` — new schema tests
- `src/app/api/admin/crm/segments/preview/route.ts` — channel-aware
- `src/components/admin/crm/SegmentBuilder.tsx` — `channel` prop
- `src/app/dashboard/admin/crm/page.tsx` — new "WhatsApp" tab

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0054_whatsapp_batches.sql`

**Interfaces:**
- Produces: table `public.whatsapp_batches` (`id`, `name`, `message_template`, `segment` jsonb, `recipient_count`, `sent_count`, `created_by`, `created_at`); table `public.whatsapp_batch_recipients` (`id`, `batch_id`, `contact_id`, `full_name`, `phone_e164`, `status` — enum `whatsapp_send_status` `'pending'|'sent'` —, `sent_at`, `sent_by`, `created_at`, unique `(batch_id, contact_id)`); view `public.crm_contact_segment_source` now also selects `whatsapp_unsubscribed_at`.

- [ ] **Step 1: Write the migration file**

```sql
-- 0054_whatsapp_batches.sql
--
-- WhatsApp click-to-chat outreach. See
-- docs/superpowers/specs/2026-09-23-whatsapp-click-to-chat-design.md.
--
-- Recipient lists are snapshotted at batch creation (full_name, phone_e164
-- copied in), not live-joined against contacts — a resumable batch worked
-- over several sittings should not reshuffle if a contact's phone is
-- corrected mid-batch. contact_id is ON DELETE SET NULL rather than CASCADE
-- for the same reason: the snapshot already carries what's needed to act on
-- the row, so a later contact deletion shouldn't make a historical send
-- record disappear.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'whatsapp_send_status') then
    create type public.whatsapp_send_status as enum ('pending', 'sent');
  end if;
end $$;

create table if not exists public.whatsapp_batches (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  message_template  text not null,
  segment           jsonb not null default '[]'::jsonb,
  recipient_count   integer not null default 0,
  sent_count        integer not null default 0,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table if not exists public.whatsapp_batch_recipients (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.whatsapp_batches(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  full_name     text not null,
  phone_e164    text not null,
  status        public.whatsapp_send_status not null default 'pending',
  sent_at       timestamptz,
  sent_by       uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (batch_id, contact_id)
);

create index if not exists whatsapp_batch_recipients_batch_idx
  on public.whatsapp_batch_recipients (batch_id);

alter table public.whatsapp_batches           enable row level security;
alter table public.whatsapp_batch_recipients  enable row level security;
-- Zero policies: service-role only, same convention as every other CRM
-- table (0047). All reads/writes go through createAdminSupabase() behind
-- requireAdmin().

-- crm_contact_segment_source did not expose whatsapp_unsubscribed_at (it
-- was built for the email-only CRM slice 1). Adding it here, appended after
-- phone_e164, so the WhatsApp reachability guard (phone_e164 is not null AND
-- whatsapp_unsubscribed_at is null) has a column to read. Every consumer of
-- this view selects columns by name, never `select *`, so appending a
-- column cannot break anything that already reads it.
create or replace view public.crm_contact_segment_source as
select
  c.id,
  c.full_name,
  c.email,
  c.phone_e164,
  c.whatsapp_unsubscribed_at,
  c.country,
  c.profession,
  c.discovery_source,
  c.consent_basis,
  c.unsubscribe_token,
  c.created_at,
  c.profile_id is not null as has_platform_account,
  coalesce(p.purchase_count, 0::bigint) as purchase_count,
  p.first_purchase_at,
  p.last_purchase_at,
  coalesce(p.product_labels, array[]::text[]) as product_labels,
  coalesce(p.product_labels_text, ''::text) as product_labels_text,
  coalesce(p.row_types, array[]::text[]) as row_types,
  coalesce(p.course_ids, array[]::uuid[]) as course_ids,
  coalesce(p.import_batch_ids, array[]::uuid[]) as import_batch_ids,
  coalesce(p.promo_codes, array[]::text[]) as promo_codes,
  coalesce(p.total_pkr, 0::numeric) as total_pkr,
  c.email is not null
    and c.email_unsubscribed_at is null
    and c.consent_basis = 'purchase'::crm_consent_basis
    and not (exists (
      select 1 from email_metrics m
      where lower(m.user_email) = c.email
        and m.event_type = any (array['hard_bounce', 'blocked', 'spam', 'invalid_email', 'unsubscribed'])
    )) as is_sendable
from contacts c
left join lateral (
  select
    count(*) as purchase_count,
    min(cp.purchased_at) as first_purchase_at,
    max(coalesce(cp.purchased_at, cp.created_at)) as last_purchase_at,
    array_agg(distinct cp.product_label) filter (where cp.product_label <> '') as product_labels,
    string_agg(distinct cp.product_label, ' | ') filter (where cp.product_label <> '') as product_labels_text,
    array_agg(distinct cp.row_type::text) as row_types,
    array_agg(distinct cp.course_id) filter (where cp.course_id is not null) as course_ids,
    array_agg(distinct cp.import_batch_id) filter (where cp.import_batch_id is not null) as import_batch_ids,
    array_agg(distinct cp.promo_code) filter (where cp.promo_code is not null) as promo_codes,
    sum(cp.amount) filter (where cp.currency = 'PKR') as total_pkr
  from contact_purchases cp
  where cp.contact_id = c.id
) p on true;
```

- [ ] **Step 2: Apply the migration to the live project**

Use the Supabase MCP `apply_migration` tool with `project_id: "whqdasotjlhvrjmgiffk"`, `name: "whatsapp_batches"`, and the SQL from Step 1 as `query`. This project applies migrations directly against the live project (see how `0053` was applied earlier this session) rather than through a local Supabase CLI workflow.

- [ ] **Step 3: Verify live**

Run via the Supabase MCP `execute_sql` tool against the same project:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'whatsapp_batches' order by ordinal_position;

select column_name, data_type from information_schema.columns
where table_name = 'whatsapp_batch_recipients' order by ordinal_position;

select column_name from information_schema.columns
where table_name = 'crm_contact_segment_source' and column_name = 'whatsapp_unsubscribed_at';
```

Expected: both tables' columns match Step 1 exactly; the third query returns one row (`whatsapp_unsubscribed_at`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0054_whatsapp_batches.sql
git commit -m "feat: whatsapp_batches schema and segment view update for WhatsApp outreach"
```

---

### Task 2: Generalize `buildSegmentFilters` for a second channel

**Files:**
- Modify: `src/lib/crm/segment.ts`
- Test: `tests/crm-segment.test.ts`

**Interfaces:**
- Consumes: nothing new (pure module).
- Produces: `QueryOp` union gains `{ kind: "not-null"; column: string }` and `{ kind: "is-null"; column: string }`. Exported `EMAIL_SENDABLE_GUARD: QueryOp[]` and `WHATSAPP_REACHABLE_GUARD: QueryOp[]`. `buildSegmentFilters(filters: SegmentFilter[], guard: QueryOp[] = EMAIL_SENDABLE_GUARD): QueryOp[]`.

- [ ] **Step 1: Write the failing tests**

In `tests/crm-segment.test.ts`, replace the local `SENDABLE_GUARD` constant and its two usages, and add two new tests. The full new file:

```ts
import { describe, it, expect } from "vitest";
import { buildSegmentFilters, EMAIL_SENDABLE_GUARD, WHATSAPP_REACHABLE_GUARD, type SegmentFilter } from "@/lib/crm/segment";

describe("buildSegmentFilters", () => {
  it("always appends the email guard by default, even for an empty segment", () => {
    // The single most important behaviour here. An admin must not be able to
    // construct a segment that includes unsubscribed or bounced addresses.
    expect(buildSegmentFilters([])).toEqual(EMAIL_SENDABLE_GUARD);
  });

  it("keeps the guard when other filters are present", () => {
    const ops = buildSegmentFilters([{ field: "country", op: "in", values: ["PK"] }]);
    for (const guardOp of EMAIL_SENDABLE_GUARD) expect(ops).toContainEqual(guardOp);
  });

  it("maps row_type to an array containment check", () => {
    // row_types is an aggregated array on the view, so "is a group leader"
    // is containment, not equality.
    expect(buildSegmentFilters([{ field: "row_type", op: "eq", value: "group_leader" }])).toEqual([
      { kind: "contains", column: "row_types", values: ["group_leader"] },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps contact_id to a scalar id membership check", () => {
    // Unlike the other list filters (import_batch_id, course_id), contact_id
    // targets the row's own id column directly, not an aggregated array.
    expect(buildSegmentFilters([{ field: "contact_id", op: "in", values: ["c1", "c2"] }])).toEqual([
      { kind: "in", column: "id", values: ["c1", "c2"] },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps import_batch_id to an array overlap check", () => {
    expect(buildSegmentFilters([{ field: "import_batch_id", op: "in", values: ["b1", "b2"] }])).toEqual([
      { kind: "overlaps", column: "import_batch_ids", values: ["b1", "b2"] },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps course_id to an array overlap check", () => {
    expect(buildSegmentFilters([{ field: "course_id", op: "in", values: ["c1", "c2"] }])).toEqual([
      { kind: "overlaps", column: "course_ids", values: ["c1", "c2"] },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps product_label to a case-insensitive substring match", () => {
    expect(buildSegmentFilters([{ field: "product_label", op: "contains", value: "Early Bird" }])).toEqual([
      { kind: "ilike", column: "product_labels_text", pattern: "%Early Bird%" },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps scalar contact fields directly", () => {
    expect(buildSegmentFilters([{ field: "discovery_source", op: "in", values: ["instagram", "facebook"] }])).toEqual([
      { kind: "in", column: "discovery_source", values: ["instagram", "facebook"] },
      ...EMAIL_SENDABLE_GUARD,
    ]);
    expect(buildSegmentFilters([{ field: "has_platform_account", op: "eq", value: false }])).toEqual([
      { kind: "eq", column: "has_platform_account", value: false },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps purchase_count comparisons", () => {
    expect(buildSegmentFilters([{ field: "purchase_count", op: "gte", value: 2 }])).toEqual([
      { kind: "gte", column: "purchase_count", value: 2 },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("maps last_purchase_at before/after to lt/gt", () => {
    expect(buildSegmentFilters([{ field: "last_purchase_at", op: "before", value: "2026-03-01" }])).toEqual([
      { kind: "lt", column: "last_purchase_at", value: "2026-03-01" },
      ...EMAIL_SENDABLE_GUARD,
    ]);
    expect(buildSegmentFilters([{ field: "last_purchase_at", op: "after", value: "2026-03-01" }])).toEqual([
      { kind: "gt", column: "last_purchase_at", value: "2026-03-01" },
      ...EMAIL_SENDABLE_GUARD,
    ]);
  });

  it("combines several filters and still guards once", () => {
    const filters: SegmentFilter[] = [
      { field: "row_type", op: "eq", value: "group_leader" },
      { field: "purchase_count", op: "gte", value: 2 },
      { field: "country", op: "in", values: ["PK"] },
    ];
    const ops = buildSegmentFilters(filters);
    expect(ops).toHaveLength(3 + EMAIL_SENDABLE_GUARD.length);
    expect(ops.filter((o) => o.column === "is_sendable")).toHaveLength(1);
  });

  it("drops an empty values list rather than producing a match-nothing query", () => {
    // An unfinished filter in the builder UI must not silently empty the
    // whole segment.
    expect(buildSegmentFilters([{ field: "country", op: "in", values: [] }])).toEqual(EMAIL_SENDABLE_GUARD);
  });

  it("appends the WhatsApp guard instead when given one explicitly", () => {
    expect(buildSegmentFilters([], WHATSAPP_REACHABLE_GUARD)).toEqual(WHATSAPP_REACHABLE_GUARD);
    expect(WHATSAPP_REACHABLE_GUARD).toEqual([
      { kind: "not-null", column: "phone_e164" },
      { kind: "is-null", column: "whatsapp_unsubscribed_at" },
    ]);
  });

  it("combines filters with the WhatsApp guard the same way it does the email guard", () => {
    const ops = buildSegmentFilters([{ field: "country", op: "in", values: ["PK"] }], WHATSAPP_REACHABLE_GUARD);
    expect(ops).toEqual([
      { kind: "in", column: "country", values: ["PK"] },
      { kind: "not-null", column: "phone_e164" },
      { kind: "is-null", column: "whatsapp_unsubscribed_at" },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run tests/crm-segment.test.ts`
Expected: FAIL — `EMAIL_SENDABLE_GUARD`/`WHATSAPP_REACHABLE_GUARD` are not exported yet, and `buildSegmentFilters` doesn't accept a second argument.

- [ ] **Step 3: Update `src/lib/crm/segment.ts`**

Change the `QueryOp` union (currently ends with the `eq`/`gte`/etc. variant) to add the two new kinds:

```ts
export type QueryOp =
  | { kind: "overlaps"; column: string; values: string[] }
  | { kind: "contains"; column: string; values: string[] }
  | { kind: "in"; column: string; values: string[] }
  | { kind: "ilike"; column: string; pattern: string }
  | { kind: "not-null"; column: string }
  | { kind: "is-null"; column: string }
  | { kind: "eq" | "gte" | "lte" | "lt" | "gt"; column: string; value: string | number | boolean };
```

Replace the existing:

```ts
/**
 * Never optional and never removable: excludes contacts with no email,
 * contacts who unsubscribed, and addresses Brevo has suppressed. Folded into
 * is_sendable by the view so one predicate covers all three.
 */
const SENDABLE_GUARD: QueryOp = { kind: "eq", column: "is_sendable", value: true };

export function buildSegmentFilters(filters: SegmentFilter[]): QueryOp[] {
  const ops: QueryOp[] = [];
  // ... existing switch ...
  ops.push(SENDABLE_GUARD);
  return ops;
}
```

with:

```ts
/**
 * Never optional and never removable for its channel: excludes contacts
 * with no email, contacts who unsubscribed, and addresses Brevo has
 * suppressed (folded into is_sendable by the view). WHATSAPP_REACHABLE_GUARD
 * is the same idea for the other channel — a valid phone number that hasn't
 * opted out of WhatsApp specifically (separate from email unsubscribe;
 * they're independent channels).
 */
export const EMAIL_SENDABLE_GUARD: QueryOp[] = [{ kind: "eq", column: "is_sendable", value: true }];
export const WHATSAPP_REACHABLE_GUARD: QueryOp[] = [
  { kind: "not-null", column: "phone_e164" },
  { kind: "is-null", column: "whatsapp_unsubscribed_at" },
];

export function buildSegmentFilters(filters: SegmentFilter[], guard: QueryOp[] = EMAIL_SENDABLE_GUARD): QueryOp[] {
  const ops: QueryOp[] = [];
  // ... existing switch (unchanged) ...
  ops.push(...guard);
  return ops;
}
```

Only the guard declaration and the final `ops.push(...)` line change — the `switch` body in between (every `case` for `contact_id` through `has_platform_account`) is untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run tests/crm-segment.test.ts`
Expected: PASS, all 16 tests.

- [ ] **Step 5: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors. (This will surface every call site of `buildSegmentFilters`/`SENDABLE_GUARD` that needs updating — there should be none yet outside `admin-crm-segments.ts`, which Task 3 updates next.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/crm/segment.ts tests/crm-segment.test.ts
git commit -m "feat: generalize buildSegmentFilters guard for a second channel"
```

---

### Task 3: `resolveWhatsAppSegment` and the new `applyOp` kinds

**Files:**
- Modify: `src/lib/data/admin-crm-segments.ts`

**Interfaces:**
- Consumes: `buildSegmentFilters`, `EMAIL_SENDABLE_GUARD`, `WHATSAPP_REACHABLE_GUARD`, `QueryOp`, `SegmentFilter` from `@/lib/crm/segment` (Task 2).
- Produces: `WhatsAppSegmentContact = { id: string; fullName: string; phoneE164: string }`; `WhatsAppSegmentResult = { ok: true; contacts: WhatsAppSegmentContact[]; total: number } | { ok: false }`; `resolveWhatsAppSegment(filters: SegmentFilter[], opts?: { limit?: number }): Promise<WhatsAppSegmentResult>`. `resolveSegment` and `SegmentContact` are **unchanged** — campaigns keep working exactly as before.

- [ ] **Step 1: Add the two new `applyOp` cases**

In `applyOp`, add before the `default:` branch:

```ts
    case "is-null":
      return q.is(op.column as never, null as never);
    case "not-null":
      return q.not(op.column as never, "is" as never, null as never);
```

- [ ] **Step 2: Add `resolveWhatsAppSegment`**

Add after `resolveSegment` (do not modify `resolveSegment` itself):

```ts
export type WhatsAppSegmentContact = {
  id: string;
  fullName: string;
  phoneE164: string;
};

export type WhatsAppSegmentResult =
  | { ok: true; contacts: WhatsAppSegmentContact[]; total: number }
  | { ok: false };

type WhatsAppRawRow = {
  id: string | null;
  full_name: string | null;
  phone_e164: string | null;
};

/**
 * The WhatsApp equivalent of resolveSegment. Kept as a separate function
 * rather than a channel branch inside resolveSegment: the two channels
 * genuinely need different required fields (email needs a non-null email +
 * unsubscribe_token; WhatsApp needs a non-null phone and tolerates no email
 * at all), so a shared SegmentContact type would have to make every field
 * optional and push the "which fields are actually guaranteed" question
 * onto every caller instead of onto this one function.
 */
export async function resolveWhatsAppSegment(
  filters: SegmentFilter[],
  opts?: { limit?: number },
): Promise<WhatsAppSegmentResult> {
  const admin = createAdminSupabase();
  const ops = buildSegmentFilters(filters, WHATSAPP_REACHABLE_GUARD);

  const build = () => {
    let query = admin
      .from("crm_contact_segment_source")
      .select("id, full_name, phone_e164", { count: "exact" });
    for (const op of ops) query = applyOp(query, op);
    return query.order("id", { ascending: true });
  };

  const rawRows: WhatsAppRawRow[] = [];
  let total = 0;

  if (opts?.limit) {
    const { data, count, error } = await build().limit(opts.limit);
    if (error) {
      console.error("[crm-segments] whatsapp resolve failed:", error);
      return { ok: false };
    }
    rawRows.push(...((data ?? []) as WhatsAppRawRow[]));
    total = count ?? rawRows.length;
  } else {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE;
      const { data, count, error } = await build().range(offset, offset + PAGE - 1);
      if (error) {
        console.error("[crm-segments] whatsapp resolve failed:", error);
        return { ok: false };
      }
      const rows = (data ?? []) as WhatsAppRawRow[];
      rawRows.push(...rows);
      if (count != null) total = count;
      if (rows.length < PAGE || offset + rows.length >= total) break;
    }
  }

  const contacts: WhatsAppSegmentContact[] = rawRows
    .filter((r): r is WhatsAppRawRow & { id: string; phone_e164: string } => r.id !== null && r.phone_e164 !== null)
    .map((r) => ({ id: r.id, fullName: r.full_name ?? "", phoneE164: r.phone_e164 }));

  return { ok: true, contacts, total };
}
```

- [ ] **Step 3: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Live verification**

With the dev server running, use the Supabase MCP `execute_sql` tool to sanity-check the guard directly (this is the query `resolveWhatsAppSegment` with an empty filter list is equivalent to):

```sql
select count(*) from public.crm_contact_segment_source
where phone_e164 is not null and whatsapp_unsubscribed_at is null;
```

Note the returned number — Task 9's live verification compares this against what the new `/segments/preview` endpoint (with `channel: "whatsapp"`) reports for an empty segment, which must match exactly (Review Focus item 2).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/admin-crm-segments.ts
git commit -m "feat: add resolveWhatsAppSegment and not-null/is-null query ops"
```

---

### Task 4: Validation schemas

**Files:**
- Modify: `src/lib/validations/crm.ts`
- Test: `tests/crm.schema.test.ts`

**Interfaces:**
- Consumes: `segmentFilterSchema` (existing).
- Produces: `whatsappBatchCreateSchema`, `whatsappRecipientStatusSchema`; `segmentPreviewSchema` gains an optional `channel` field (`"email" | "whatsapp"`, default `"email"`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/crm.schema.test.ts` (add the import too — change the existing import line to include the new schemas):

```ts
import {
  importPreviewSchema,
  importCommitSchema,
  mergeResolveSchema,
  segmentFilterSchema,
  segmentPreviewSchema,
  campaignCreateSchema,
  whatsappBatchCreateSchema,
  whatsappRecipientStatusSchema,
} from "@/lib/validations/crm";
```

and at the end of the file:

```ts
describe("segmentPreviewSchema", () => {
  it("defaults channel to email when omitted", () => {
    const parsed = segmentPreviewSchema.safeParse({ segment: [] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.channel).toBe("email");
  });

  it("accepts an explicit whatsapp channel", () => {
    const parsed = segmentPreviewSchema.safeParse({ segment: [], channel: "whatsapp" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.channel).toBe("whatsapp");
  });

  it("rejects an unknown channel", () => {
    expect(segmentPreviewSchema.safeParse({ segment: [], channel: "sms" }).success).toBe(false);
  });
});

describe("whatsappBatchCreateSchema", () => {
  it("accepts a complete batch", () => {
    const parsed = whatsappBatchCreateSchema.safeParse({
      name: "W20 WhatsApp follow-up",
      messageTemplate: "Hi {{first_name}}, ...",
      segment: [{ field: "country", op: "in", values: ["PK"] }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty segment, which means everyone phone-reachable", () => {
    const parsed = whatsappBatchCreateSchema.safeParse({ name: "All", messageTemplate: "Hi", segment: [] });
    expect(parsed.success).toBe(true);
  });

  it("rejects a blank name or message", () => {
    expect(whatsappBatchCreateSchema.safeParse({ name: "", messageTemplate: "Hi", segment: [] }).success).toBe(false);
    expect(whatsappBatchCreateSchema.safeParse({ name: "N", messageTemplate: "", segment: [] }).success).toBe(false);
  });
});

describe("whatsappRecipientStatusSchema", () => {
  it("accepts pending and sent", () => {
    expect(whatsappRecipientStatusSchema.safeParse({ status: "pending" }).success).toBe(true);
    expect(whatsappRecipientStatusSchema.safeParse({ status: "sent" }).success).toBe(true);
  });

  it("rejects any other status", () => {
    expect(whatsappRecipientStatusSchema.safeParse({ status: "delivered" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: FAIL — the new schemas and the `channel` field don't exist yet.

- [ ] **Step 3: Update `src/lib/validations/crm.ts`**

Change:

```ts
export const segmentPreviewSchema = z.object({
  segment: z.array(segmentFilterSchema).max(20),
});
```

to:

```ts
export const segmentPreviewSchema = z.object({
  segment: z.array(segmentFilterSchema).max(20),
  channel: z.enum(["email", "whatsapp"]).default("email"),
});
```

Add near the end of the file, after `campaignTestSchema`:

```ts
export const whatsappBatchCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  messageTemplate: z.string().trim().min(1, "Message is required").max(4096),
  segment: z.array(segmentFilterSchema).max(20),
});

export const whatsappRecipientStatusSchema = z.object({
  status: z.enum(["pending", "sent"]),
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: PASS, all tests including the new ones.

- [ ] **Step 5: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations/crm.ts tests/crm.schema.test.ts
git commit -m "feat: add WhatsApp batch/recipient schemas, channel on segment preview"
```

---

### Task 5: `whatsapp-link.ts` — pure link and merge-tag helpers

**Files:**
- Create: `src/lib/crm/whatsapp-link.ts`
- Test: `tests/crm-whatsapp-link.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `firstNameOf(fullName: string): string`; `buildWhatsAppLink(phoneE164: string, messageTemplate: string, fullName: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/crm-whatsapp-link.test.ts
import { describe, it, expect } from "vitest";
import { buildWhatsAppLink, firstNameOf } from "@/lib/crm/whatsapp-link";

describe("firstNameOf", () => {
  it("returns the first token of a multi-word name", () => {
    expect(firstNameOf("Ayesha Khan")).toBe("Ayesha");
  });

  it("returns the whole name when there is no space", () => {
    // Real data in this CRM — e.g. contact "Somaan" has no surname on file.
    expect(firstNameOf("Somaan")).toBe("Somaan");
  });

  it("returns an empty string for a blank name", () => {
    expect(firstNameOf("   ")).toBe("");
  });

  it("collapses repeated internal whitespace", () => {
    expect(firstNameOf("  Ayesha   Khan ")).toBe("Ayesha");
  });
});

describe("buildWhatsAppLink", () => {
  it("strips the leading plus and encodes the message", () => {
    const link = buildWhatsAppLink("+923001234567", "Hi {{first_name}}!", "Ayesha Khan");
    expect(link).toBe("https://wa.me/923001234567?text=Hi%20Ayesha!");
  });

  it("substitutes both merge tags", () => {
    const link = buildWhatsAppLink("+923001234567", "{{full_name}} ({{first_name}})", "Ayesha Khan");
    expect(decodeURIComponent(link.split("?text=")[1])).toBe("Ayesha Khan (Ayesha)");
  });

  it("leaves a message with no merge tags untouched", () => {
    const link = buildWhatsAppLink("+923001234567", "Hello there, no personalization here.", "Ayesha Khan");
    expect(decodeURIComponent(link.split("?text=")[1])).toBe("Hello there, no personalization here.");
  });

  it("does not crash on a single-word name", () => {
    const link = buildWhatsAppLink("+923001234567", "Hi {{first_name}}, {{full_name}}", "Somaan");
    expect(decodeURIComponent(link.split("?text=")[1])).toBe("Hi Somaan, Somaan");
  });

  it("strips any non-digit characters from the phone, not just the leading plus", () => {
    const link = buildWhatsAppLink("+92 300 1234567", "Hi", "A");
    expect(link.startsWith("https://wa.me/923001234567?")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run tests/crm-whatsapp-link.test.ts`
Expected: FAIL with "Cannot find module '@/lib/crm/whatsapp-link'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/crm/whatsapp-link.ts
/**
 * wa.me click-to-chat link generation for the WhatsApp outreach feature.
 * Pure — no I/O, no database, safe to import from client components (the
 * recipient table builds these links directly in the browser).
 */

const MERGE_TAGS: ReadonlyArray<{ tag: string; resolve: (fullName: string) => string }> = [
  { tag: "{{first_name}}", resolve: firstNameOf },
  { tag: "{{full_name}}", resolve: (fullName) => fullName },
];

/** First whitespace-separated token of a full name; the whole name if there is no space. */
export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (trimmed === "") return "";
  return trimmed.split(/\s+/)[0];
}

function renderMessage(template: string, fullName: string): string {
  let out = template;
  for (const { tag, resolve } of MERGE_TAGS) out = out.split(tag).join(resolve(fullName));
  return out;
}

/**
 * wa.me requires digits only in the URL — no leading "+", no spaces or
 * dashes. phoneE164 is always "+<country><number>" by construction
 * (src/lib/crm/phone.ts's normalizePhone), so stripping every non-digit
 * character is a defensive superset of "just remove the +".
 */
export function buildWhatsAppLink(phoneE164: string, messageTemplate: string, fullName: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  const message = renderMessage(messageTemplate, fullName);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
```

Note: `firstNameOf` is referenced in `MERGE_TAGS` before its declaration in the file — this works in TypeScript/JS because function declarations (not arrow functions) are hoisted, and `firstNameOf` is declared with `export function`, so this is safe as written.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run tests/crm-whatsapp-link.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Type-check and lint**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint src/lib/crm/whatsapp-link.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/crm/whatsapp-link.ts tests/crm-whatsapp-link.test.ts
git commit -m "feat: add wa.me link generation and merge-tag substitution"
```

---

### Task 6: `admin-crm-whatsapp.ts` data layer

**Files:**
- Create: `src/lib/data/admin-crm-whatsapp.ts`

**Interfaces:**
- Consumes: `resolveWhatsAppSegment` from `./admin-crm-segments` (Task 3); `createAdminSupabase` from `@/lib/supabase/admin`; `SegmentFilter` from `@/lib/crm/segment`.
- Produces: `WhatsAppBatchListRow`, `WhatsAppRecipientRow`, `WhatsAppBatchDetail` types; `listWhatsAppBatches(): Promise<WhatsAppBatchListRow[]>`; `CreateWhatsAppBatchResult` and `createWhatsAppBatch(userId: string, input: { name: string; messageTemplate: string; segment: SegmentFilter[] }): Promise<CreateWhatsAppBatchResult>`; `getWhatsAppBatchDetail(id: string): Promise<WhatsAppBatchDetail | null>`; `UpdateRecipientStatusResult` and `updateRecipientStatus(batchId: string, recipientId: string, status: "pending" | "sent", userId: string): Promise<UpdateRecipientStatusResult>`.

- [ ] **Step 1: Write the file**

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { resolveWhatsAppSegment } from "./admin-crm-segments";
import type { SegmentFilter } from "@/lib/crm/segment";

/**
 * WhatsApp batch data layer. Mirrors admin-crm-import.ts / admin-crm-
 * contacts.ts conventions: service-role client, discriminated-union
 * results, no throwing.
 */

export type WhatsAppBatchListRow = {
  id: string;
  name: string;
  messageTemplate: string;
  recipientCount: number;
  sentCount: number;
  createdAt: string;
};

export async function listWhatsAppBatches(): Promise<WhatsAppBatchListRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("whatsapp_batches")
    .select("id, name, message_template, recipient_count, sent_count, created_at")
    .order("created_at", { ascending: false });

  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    messageTemplate: b.message_template,
    recipientCount: b.recipient_count,
    sentCount: b.sent_count,
    createdAt: b.created_at,
  }));
}

export type CreateWhatsAppBatchResult =
  | { ok: true; batchId: string; recipientCount: number }
  | { ok: false; reason: "empty-audience" | "db-error" };

/**
 * Resolves the segment against the WhatsApp reachability guard and
 * snapshots the result into whatsapp_batch_recipients. If the recipient
 * insert fails after the batch row was created, the batch row is deleted
 * rather than left behind — a batch with 0 recipients and no way to add
 * more (see spec: batches aren't editable after creation) would otherwise
 * sit in the list looking permanently broken.
 */
export async function createWhatsAppBatch(
  userId: string,
  input: { name: string; messageTemplate: string; segment: SegmentFilter[] },
): Promise<CreateWhatsAppBatchResult> {
  const resolved = await resolveWhatsAppSegment(input.segment);
  if (!resolved.ok) return { ok: false, reason: "db-error" };
  if (resolved.contacts.length === 0) return { ok: false, reason: "empty-audience" };

  const admin = createAdminSupabase();

  const { data: batch, error: batchError } = await admin
    .from("whatsapp_batches")
    .insert({
      name: input.name,
      message_template: input.messageTemplate,
      segment: input.segment,
      recipient_count: resolved.contacts.length,
      created_by: userId,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    console.error("[crm-whatsapp] batch insert failed:", batchError);
    return { ok: false, reason: "db-error" };
  }

  const { error: recipientsError } = await admin.from("whatsapp_batch_recipients").insert(
    resolved.contacts.map((c) => ({
      batch_id: batch.id,
      contact_id: c.id,
      full_name: c.fullName,
      phone_e164: c.phoneE164,
    })),
  );

  if (recipientsError) {
    console.error("[crm-whatsapp] recipient insert failed:", recipientsError);
    await admin.from("whatsapp_batches").delete().eq("id", batch.id);
    return { ok: false, reason: "db-error" };
  }

  return { ok: true, batchId: batch.id, recipientCount: resolved.contacts.length };
}

export type WhatsAppRecipientRow = {
  id: string;
  fullName: string;
  phoneE164: string;
  status: "pending" | "sent";
  sentAt: string | null;
};

export type WhatsAppBatchDetail = WhatsAppBatchListRow & { recipients: WhatsAppRecipientRow[] };

export async function getWhatsAppBatchDetail(id: string): Promise<WhatsAppBatchDetail | null> {
  const admin = createAdminSupabase();
  const { data: batch } = await admin
    .from("whatsapp_batches")
    .select("id, name, message_template, recipient_count, sent_count, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!batch) return null;

  const { data: recipients } = await admin
    .from("whatsapp_batch_recipients")
    .select("id, full_name, phone_e164, status, sent_at")
    .eq("batch_id", id)
    .order("full_name", { ascending: true });

  return {
    id: batch.id,
    name: batch.name,
    messageTemplate: batch.message_template,
    recipientCount: batch.recipient_count,
    sentCount: batch.sent_count,
    createdAt: batch.created_at,
    recipients: (recipients ?? []).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      phoneE164: r.phone_e164,
      status: r.status,
      sentAt: r.sent_at,
    })),
  };
}

export type UpdateRecipientStatusResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

/**
 * Scoped by BOTH batchId and recipientId — a recipient id that's real but
 * belongs to a different batch must 404, not silently update the wrong
 * batch's recipient and sent_count (Review Focus item 5).
 *
 * sent_count is recomputed with a COUNT query after the update rather than
 * incremented/decremented in place, so it can never drift even if this is
 * ever called concurrently or from a future bulk-status path.
 */
export async function updateRecipientStatus(
  batchId: string,
  recipientId: string,
  status: "pending" | "sent",
  userId: string,
): Promise<UpdateRecipientStatusResult> {
  const admin = createAdminSupabase();

  const { data: recipient, error: fetchError } = await admin
    .from("whatsapp_batch_recipients")
    .select("id, status")
    .eq("id", recipientId)
    .eq("batch_id", batchId)
    .maybeSingle();

  if (fetchError) {
    console.error("[crm-whatsapp] recipient lookup failed:", fetchError);
    return { ok: false, reason: "db-error" };
  }
  if (!recipient) return { ok: false, reason: "not-found" };

  if (recipient.status !== status) {
    const { error: updateError } = await admin
      .from("whatsapp_batch_recipients")
      .update({
        status,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        sent_by: status === "sent" ? userId : null,
      })
      .eq("id", recipientId);

    if (updateError) {
      console.error("[crm-whatsapp] recipient update failed:", updateError);
      return { ok: false, reason: "db-error" };
    }

    const { count } = await admin
      .from("whatsapp_batch_recipients")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId)
      .eq("status", "sent");

    await admin.from("whatsapp_batches").update({ sent_count: count ?? 0 }).eq("id", batchId);
  }

  return { ok: true };
}
```

- [ ] **Step 2: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/eslint src/lib/data/admin-crm-whatsapp.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/admin-crm-whatsapp.ts
git commit -m "feat: add WhatsApp batch data layer"
```

(Live verification of this file happens in Task 8, once the API routes that call it exist — there's nothing to exercise it from yet.)

---

### Task 7: `/segments/preview` becomes channel-aware; `SegmentBuilder` gets a `channel` prop

**Files:**
- Modify: `src/app/api/admin/crm/segments/preview/route.ts`
- Modify: `src/components/admin/crm/SegmentBuilder.tsx`

**Interfaces:**
- Consumes: `resolveSegment`, `resolveWhatsAppSegment` from `@/lib/data/admin-crm-segments`; `segmentPreviewSchema` (now with `channel`) from `@/lib/validations/crm`.
- Produces: `SegmentBuilder` accepts an optional `channel?: "email" | "whatsapp"` prop (default `"email"`); no change to its exported name or `value`/`onChange` props, so `CampaignsPanel`'s existing usage (no `channel` passed) is unaffected.

- [ ] **Step 1: Update the preview route**

Replace the whole file:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveSegment, resolveWhatsAppSegment } from "@/lib/data/admin-crm-segments";
import { segmentPreviewSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = segmentPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    console.error("[crm-segments-preview] invalid segment:", JSON.stringify(parsed.error.issues));
    const first = parsed.error.issues[0];
    const where = first?.path.length ? ` (at ${first.path.join(".")})` : "";
    return NextResponse.json({ error: `Invalid segment${where}: ${first?.message ?? "unknown"}` }, { status: 400 });
  }

  if (parsed.data.channel === "whatsapp") {
    const result = await resolveWhatsAppSegment(parsed.data.segment, { limit: 10 });
    if (!result.ok) return NextResponse.json({ error: "Could not resolve that segment" }, { status: 500 });
    return NextResponse.json({
      total: result.total,
      samples: result.contacts.map((c) => ({ fullName: c.fullName, phoneE164: c.phoneE164 })),
    });
  }

  const result = await resolveSegment(parsed.data.segment, { limit: 10 });
  if (!result.ok) return NextResponse.json({ error: "Could not resolve that segment" }, { status: 500 });

  return NextResponse.json({
    total: result.total,
    samples: result.contacts.map((c) => ({ fullName: c.fullName, email: c.email })),
  });
}
```

- [ ] **Step 2: Update `SegmentBuilder`**

In `src/components/admin/crm/SegmentBuilder.tsx`:

Change the component signature from:

```ts
export function SegmentBuilder({
  value,
  onChange,
}: {
  value: SegmentFilter[];
  onChange: (next: SegmentFilter[]) => void;
}) {
```

to:

```ts
export function SegmentBuilder({
  value,
  onChange,
  channel = "email",
}: {
  value: SegmentFilter[];
  onChange: (next: SegmentFilter[]) => void;
  channel?: "email" | "whatsapp";
}) {
```

Change the `samples` state type from `useState<Array<{ fullName: string; email: string }>>([])` to:

```ts
const [samples, setSamples] = useState<Array<{ fullName: string; email?: string; phoneE164?: string }>>([]);
```

In `refreshCount`, change the request body from `JSON.stringify({ segment: filters })` to:

```ts
body: JSON.stringify({ segment: filters, channel }),
```

Change the empty-state copy from:

```tsx
{value.length === 0 && (
  <p className="font-body text-xs text-pz-on-surface-variant">
    No filters — this matches every contact who has an email, has not unsubscribed, and has not bounced.
  </p>
)}
```

to:

```tsx
{value.length === 0 && (
  <p className="font-body text-xs text-pz-on-surface-variant">
    {channel === "whatsapp"
      ? "No filters — this matches every contact with a valid WhatsApp number who hasn't opted out."
      : "No filters — this matches every contact who has an email, has not unsubscribed, and has not bounced."}
  </p>
)}
```

Change the samples line at the bottom from:

```tsx
{samples.length > 0 && (
  <p className="font-body text-xs text-pz-on-surface-variant">
    e.g. {samples.map((s) => s.fullName || s.email).join(", ")}
  </p>
)}
```

to:

```tsx
{samples.length > 0 && (
  <p className="font-body text-xs text-pz-on-surface-variant">
    e.g. {samples.map((s) => s.fullName || s.email || s.phoneE164).join(", ")}
  </p>
)}
```

- [ ] **Step 3: Type-check and lint**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint src/app/api/admin/crm/segments/preview/route.ts src/components/admin/crm/SegmentBuilder.tsx`
Expected: no errors.

- [ ] **Step 4: Run the existing CRM vitest suites (regression check)**

Run: `node_modules/.bin/vitest run tests/crm-segment.test.ts tests/crm.schema.test.ts tests/crm-whatsapp-link.test.ts`
Expected: PASS — this task touches no pure-logic files, so this just confirms nothing broke.

- [ ] **Step 5: Live verification**

With the dev server running, open `/dashboard/admin/crm?tab=campaigns` in a browser and confirm the existing email segment builder still works exactly as before (Count matches on an empty segment shows the full sendable count — compare against the number shown before this task, e.g. via `select count(*) from crm_contact_segment_source where is_sendable`). This confirms the default `channel="email"` path is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/crm/segments/preview/route.ts src/components/admin/crm/SegmentBuilder.tsx
git commit -m "feat: channel-aware segment preview (email/whatsapp)"
```

---

### Task 8: WhatsApp batch API routes

**Files:**
- Create: `src/app/api/admin/crm/whatsapp/batches/route.ts`
- Create: `src/app/api/admin/crm/whatsapp/batches/[id]/route.ts`
- Create: `src/app/api/admin/crm/whatsapp/batches/[id]/recipients/[recipientId]/route.ts`

**Interfaces:**
- Consumes: `listWhatsAppBatches`, `createWhatsAppBatch`, `getWhatsAppBatchDetail`, `updateRecipientStatus` from `@/lib/data/admin-crm-whatsapp` (Task 6); `whatsappBatchCreateSchema`, `whatsappRecipientStatusSchema` from `@/lib/validations/crm` (Task 4); `requireAdmin` from `@/lib/auth/require-admin`.
- Produces: `GET /api/admin/crm/whatsapp/batches` → `{ batches: WhatsAppBatchListRow[] }`. `POST` same path, body `{ name, messageTemplate, segment }` → `201 { batchId, recipientCount }` or `400`/`500`. `GET /api/admin/crm/whatsapp/batches/[id]` → `WhatsAppBatchDetail` or `404`. `PATCH .../recipients/[recipientId]`, body `{ status }` → `200 { ok: true }` or `404`/`500`.

- [ ] **Step 1: Write `route.ts` (list + create)**

```ts
// src/app/api/admin/crm/whatsapp/batches/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listWhatsAppBatches, createWhatsAppBatch } from "@/lib/data/admin-crm-whatsapp";
import { whatsappBatchCreateSchema } from "@/lib/validations/crm";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ batches: await listWhatsAppBatches() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = whatsappBatchCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await createWhatsAppBatch(auth.user.id, parsed.data);
  if (!result.ok) {
    if (result.reason === "empty-audience") {
      return NextResponse.json({ error: "No phone-reachable contacts match this segment." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not create this batch." }, { status: 500 });
  }

  return NextResponse.json({ batchId: result.batchId, recipientCount: result.recipientCount }, { status: 201 });
}
```

- [ ] **Step 2: Write `[id]/route.ts` (detail)**

```ts
// src/app/api/admin/crm/whatsapp/batches/[id]/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getWhatsAppBatchDetail } from "@/lib/data/admin-crm-whatsapp";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const detail = await getWhatsAppBatchDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(detail);
}
```

- [ ] **Step 3: Write `recipients/[recipientId]/route.ts` (status update)**

```ts
// src/app/api/admin/crm/whatsapp/batches/[id]/recipients/[recipientId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateRecipientStatus } from "@/lib/data/admin-crm-whatsapp";
import { whatsappRecipientStatusSchema } from "@/lib/validations/crm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; recipientId: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id, recipientId } = await params;
  const parsed = whatsappRecipientStatusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await updateRecipientStatus(id, recipientId, parsed.data.status, auth.user.id);
  if (!result.ok) {
    const status = result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: "Could not update this recipient." }, { status });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Type-check and lint**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint src/app/api/admin/crm/whatsapp`
Expected: no errors.

- [ ] **Step 5: Live verification — Review Focus items 1, 2, and 5**

With the dev server running and logged in as the admin (`pharmacozymeofficial@gmail.com`), use the browser's `evaluate_script` (via `fetch`, same-origin so the session cookie is sent automatically) or equivalent:

**Item 1 — empty audience is rejected:**
```js
await fetch("/api/admin/crm/whatsapp/batches", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Test — no match", messageTemplate: "Hi", segment: [{ field: "country", op: "in", values: ["ZZ"] }] }),
}).then(r => r.status)
```
Expected: `400` (no country "ZZ" exists in the data). Confirm via Supabase `execute_sql` that no row was inserted into `whatsapp_batches` with that name.

**Item 2 — empty segment matches everyone reachable:**
```js
await fetch("/api/admin/crm/segments/preview", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ segment: [], channel: "whatsapp" }),
}).then(r => r.json())
```
Expected: `total` equals the count from Task 3 Step 4's SQL query exactly.

**Item 5 — cross-batch recipient PATCH is rejected:**
Create two small real batches (e.g. both against `{ field: "country", op: "in", values: ["PK"] }` with `limit`-friendly test names), fetch each batch's detail to get a real `recipientId` from batch A, then:
```js
await fetch(`/api/admin/crm/whatsapp/batches/${batchB_id}/recipients/${batchA_recipientId}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "sent" }),
}).then(r => r.status)
```
Expected: `404`. Confirm via `execute_sql` that batch A's recipient status is still `pending` and batch A's `sent_count` is unchanged.

Clean up any test batches created during this verification (`delete from whatsapp_batches where name like 'Test%'` — cascades to their recipients).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/crm/whatsapp
git commit -m "feat: add WhatsApp batch API routes"
```

---

### Task 9: `WhatsAppPanel` UI and CRM tab wiring

**Files:**
- Create: `src/components/admin/crm/WhatsAppPanel.tsx`
- Modify: `src/app/dashboard/admin/crm/page.tsx`

**Interfaces:**
- Consumes: `SegmentBuilder` (Task 7, with `channel="whatsapp"`); `buildWhatsAppLink` from `@/lib/crm/whatsapp-link` (Task 5); the three API routes from Task 8; `listWhatsAppBatches` from `@/lib/data/admin-crm-whatsapp` (Task 6, called server-side in `page.tsx`).
- Produces: `WhatsAppPanel({ initialBatches }: { initialBatches: WhatsAppBatchListRow[] })` — no other file depends on this component's internals.

- [ ] **Step 1: Write `WhatsAppPanel.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { SegmentBuilder } from "./SegmentBuilder";
import { buildWhatsAppLink } from "@/lib/crm/whatsapp-link";
import type { SegmentFilter } from "@/lib/crm/segment";

type BatchListRow = {
  id: string;
  name: string;
  messageTemplate: string;
  recipientCount: number;
  sentCount: number;
  createdAt: string;
};

type Recipient = { id: string; fullName: string; phoneE164: string; status: "pending" | "sent"; sentAt: string | null };
type BatchDetail = BatchListRow & { recipients: Recipient[] };

const MERGE_TAGS = [
  { label: "First name", tag: "{{first_name}}" },
  { label: "Full name", tag: "{{full_name}}" },
] as const;

const DEFAULT_MESSAGE = "Hi {{first_name}},\n\n";

export function WhatsAppPanel({ initialBatches }: { initialBatches: BatchListRow[] }) {
  const [batches, setBatches] = useState(initialBatches);
  const [name, setName] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [segment, setSegment] = useState<SegmentFilter[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [busyRecipientId, setBusyRecipientId] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  async function createBatch() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/crm/whatsapp/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, messageTemplate: message, segment }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(json.error ?? "Could not create this batch.");
        return;
      }
      toast.success(`Batch created — ${json.recipientCount} contacts.`);
      setName("");
      setMessage(DEFAULT_MESSAGE);
      setSegment([]);
      const list = await fetch("/api/admin/crm/whatsapp/batches");
      if (list.ok) setBatches((await list.json()).batches);
    } finally {
      setCreating(false);
    }
  }

  // Inserts at the cursor rather than always at the end — matches the
  // merge-tag insert pattern already used by CampaignsPanel's body editor.
  function insertTag(tag: string) {
    const el = messageRef.current;
    if (!el) { setMessage((m) => m + tag); return; }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    setMessage(message.slice(0, start) + tag + message.slice(end));
  }

  async function toggleDetail(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    const res = await fetch(`/api/admin/crm/whatsapp/batches/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  async function toggleSent(recipient: Recipient) {
    if (!detail) return;
    const nextStatus: "pending" | "sent" = recipient.status === "sent" ? "pending" : "sent";
    setBusyRecipientId(recipient.id);
    try {
      const res = await fetch(`/api/admin/crm/whatsapp/batches/${detail.id}/recipients/${recipient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? "Could not update this recipient.");
        return;
      }
      const currentDetailId = detail.id;
      setDetail((prev) => {
        if (!prev) return prev;
        const recipients = prev.recipients.map((r) => (r.id === recipient.id ? { ...r, status: nextStatus } : r));
        return { ...prev, recipients, sentCount: recipients.filter((r) => r.status === "sent").length };
      });
      setBatches((prev) =>
        prev.map((b) =>
          b.id === currentDetailId ? { ...b, sentCount: b.sentCount + (nextStatus === "sent" ? 1 : -1) } : b,
        ),
      );
    } finally {
      setBusyRecipientId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
        <h2 className="font-headline font-bold text-lg">New batch</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Batch name, e.g. W20 WhatsApp follow-up"
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
        />
        <div className="flex gap-2">
          {MERGE_TAGS.map((t) => (
            <button
              key={t.tag}
              onClick={() => insertTag(t.tag)}
              className="px-3 py-1 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-body text-xs font-medium"
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          ref={messageRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
        />
        <SegmentBuilder value={segment} onChange={setSegment} channel="whatsapp" />
        {createError && <p className="font-body text-sm text-pz-danger">{createError}</p>}
        <button
          onClick={createBatch}
          disabled={creating || name.trim() === "" || message.trim() === ""}
          className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create batch"}
        </button>
      </div>

      <div>
        <h2 className="font-headline font-bold text-lg mb-3">Batches</h2>
        {batches.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No WhatsApp batches yet.</p>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <div key={b.id} className="bg-pz-surface-container-high rounded-2xl p-4">
                <button onClick={() => toggleDetail(b.id)} className="w-full flex items-center justify-between text-left">
                  <span className="font-body font-semibold text-sm">{b.name}</span>
                  <span className="font-body text-xs text-pz-on-surface-variant tabular-nums">
                    {b.sentCount} / {b.recipientCount} sent
                  </span>
                </button>

                {openId === b.id && (
                  <div className="mt-4 overflow-x-auto">
                    {detail === null ? (
                      <p className="font-body text-xs text-pz-on-surface-variant">Loading…</p>
                    ) : (
                      <table className="w-full text-left font-body text-sm">
                        <thead className="text-pz-on-surface-variant text-xs uppercase">
                          <tr><th className="py-1">Name</th><th>Phone</th><th></th><th></th></tr>
                        </thead>
                        <tbody>
                          {detail.recipients.map((r) => (
                            <tr key={r.id} className="border-t border-pz-outline-variant">
                              <td className="py-1">{r.fullName || "—"}</td>
                              <td>{r.phoneE164}</td>
                              <td>
                                <a
                                  href={buildWhatsAppLink(r.phoneE164, detail.messageTemplate, r.fullName)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-pz-primary underline text-xs font-semibold"
                                >
                                  Open chat
                                </a>
                              </td>
                              <td>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={r.status === "sent"}
                                    disabled={busyRecipientId === r.id}
                                    onChange={() => toggleSent(r)}
                                  />
                                  sent
                                </label>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab into `page.tsx`**

In `src/app/dashboard/admin/crm/page.tsx`:

Add to the imports:

```ts
import { listWhatsAppBatches } from "@/lib/data/admin-crm-whatsapp";
import { WhatsAppPanel } from "@/components/admin/crm/WhatsAppPanel";
```

Change the `Tab` type and `parseTab`:

```ts
type Tab = "contacts" | "import" | "merge" | "campaigns" | "cohorts" | "whatsapp";

function parseTab(value: string | undefined): Tab {
  if (value === "import") return "import";
  if (value === "merge") return "merge";
  if (value === "campaigns") return "campaigns";
  if (value === "cohorts") return "cohorts";
  if (value === "whatsapp") return "whatsapp";
  return "contacts";
}
```

Add `listWhatsAppBatches()` to the `Promise.all` that already fetches `contacts`, `mergeCandidates`, `campaigns`, `cohorts`:

```ts
const [contacts, mergeCandidates, campaigns, cohorts, whatsappBatches] = await Promise.all([
  listContacts({ limit: 50, offset: 0 }),
  listMergeCandidates(),
  listCampaigns(),
  listCohorts(),
  listWhatsAppBatches(),
]);
```

Add the tab link, after the Cohorts link:

```tsx
<Link href="/dashboard/admin/crm?tab=whatsapp" className={TAB_CLASS(tab === "whatsapp")}>
  WhatsApp <span className="ml-2 tabular-nums">{whatsappBatches.length}</span>
</Link>
```

Add the panel render, after the Cohorts panel:

```tsx
{tab === "whatsapp" && <WhatsAppPanel initialBatches={whatsappBatches} />}
```

- [ ] **Step 3: Type-check and lint**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint src/components/admin/crm/WhatsAppPanel.tsx src/app/dashboard/admin/crm/page.tsx`
Expected: no errors.

- [ ] **Step 4: Live verification — Review Focus items 3 and 4 in real UI**

With the dev server running, navigate to `/dashboard/admin/crm?tab=whatsapp`:

1. Check console for errors (none expected — this session's earlier work hit a hydration mismatch from an unpinned date formatter; confirm this new panel introduces no date formatting at all, or if it does, that it uses the existing `formatDate` helper from `@/lib/format` the way `CohortsPanel` does).
2. Create a real small batch: name it, leave the message as the default `Hi {{first_name}},` template (exercises the merge-tag path), pick a narrow real segment (e.g. one country or one cohort) so the recipient list is small enough to read.
3. Confirm the batch appears in the list with the correct `0 / N sent` count.
4. Expand it, confirm each recipient row shows a real name and phone, and click one "Open chat" link — confirm it opens `wa.me` in a new tab with the phone number and a correctly personalized, URL-decoded message (this exercises Review Focus item 3 for real if any recipient's name happens to be a single word — otherwise note that Task 5's unit test already covers it directly).
5. Toggle a recipient's "sent" checkbox on, confirm the row updates and the header count becomes `1 / N sent`. Toggle it back off, confirm it returns to `0 / N sent`.
6. Reload the page entirely (full navigation, not just a re-render) and re-expand the same batch — confirm the sent/pending state persisted (this is the "resumable across sittings" requirement from the spec's Decisions).

- [ ] **Step 5: Full regression pass**

Run:
```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run tests/crm-segment.test.ts tests/crm.schema.test.ts tests/crm-whatsapp-link.test.ts
node_modules/.bin/eslint src/components/admin/crm src/app/api/admin/crm src/lib/data/admin-crm-whatsapp.ts src/lib/data/admin-crm-segments.ts src/lib/crm/segment.ts src/lib/crm/whatsapp-link.ts src/lib/validations/crm.ts src/app/dashboard/admin/crm/page.tsx
```
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/crm/WhatsAppPanel.tsx src/app/dashboard/admin/crm/page.tsx
git commit -m "feat: add WhatsApp tab UI (compose, batch list, recipient click-to-chat)"
```

---

## Self-review notes (for the plan author, not a task)

- **Spec coverage:** Data model (Task 1) ✓. Guard generalization (Task 2) ✓. Segment resolution for WhatsApp (Task 3) — implemented as a parallel `resolveWhatsAppSegment` rather than modifying `resolveSegment` in place, a refinement over the spec's more abstract phrasing but consistent with every Decision in it (guard columns, channel param on `SegmentBuilder`/preview endpoint, phone-only + `whatsapp_unsubscribed_at` reachability). API surface (Task 8) matches the spec's four endpoints exactly. UI (Task 9) matches the spec's batch list / compose / recipient table description. Error handling (empty audience, cross-batch PATCH) — Task 8/9. Out-of-scope items (automated send, delivery receipts, unsubscribe UI, editable recipient lists) — none are built by any task.
- **Placeholder scan:** none — every step has complete code.
- **Type consistency:** `WhatsAppBatchListRow` (Task 6) matches the type `WhatsAppPanel` (Task 9) expects for `initialBatches` field-for-field (`id`, `name`, `messageTemplate`, `recipientCount`, `sentCount`, `createdAt`). `WhatsAppRecipientRow`/`BatchDetail` in Task 9 matches `WhatsAppBatchDetail`/`WhatsAppRecipientRow` from Task 6 field-for-field. `buildWhatsAppLink`'s signature (Task 5) matches its one call site in Task 9 exactly (`phoneE164, messageTemplate, fullName` order).
- **Review Focus:** all five items have an owning task and an explicit test (items 1, 2, 5 in Task 8's live verification; items 3, 4 in Task 5's unit tests, with item 3 additionally spot-checked live in Task 9).
