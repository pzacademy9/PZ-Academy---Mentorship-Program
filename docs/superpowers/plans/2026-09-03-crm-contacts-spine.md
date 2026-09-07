# CRM Contacts Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate ~3,000 past buyers scattered across 25+ Google Sheets into one deduplicated, addressable contacts store, then send them the first segmented email broadcast.

**Architecture:** Four modules with hard boundaries. `identity` is pure functions (phone/email/name normalization, duplicate scoring, product-label parsing) with zero I/O — it is the highest-risk code and gets full TDD. `sheet-ingest` adds two read actions to the existing GAS relay and drives a dry-run-first import wizard. `contacts` stores people and their purchase history. `campaigns` resolves segments over a pre-aggregating Postgres view and sends by inserting into the existing `email_queue`, which the existing `process-email-queue` edge function already drains and `brevo-webhook-handler` already instruments.

**Tech Stack:** Next.js App Router (server components + route handlers), Supabase Postgres with RLS, Zod v4, Vitest, `@dnd-kit` (not needed here), Brevo via the existing queue, Google Apps Script relay.

**Spec:** `docs/superpowers/specs/2026-09-03-crm-contacts-spine-design.md`

## Deliberate deviation from the spec

The spec specifies segment evaluation as "a single Postgres RPC that accepts the `jsonb` definition". This plan instead uses a **pre-aggregating view** (`crm_contact_segment_source`) filtered by PostgREST predicates, built by a pure function `buildSegmentFilters` (the spec calls it `buildSegmentQuery`).

Reason: the RPC form requires dynamic SQL assembled inside plpgsql from user-supplied JSON — injection-prone and effectively untestable. The view keeps aggregation in Postgres exactly as the spec intends, while making filter construction a unit-tested pure function with no SQL string building anywhere. The mandatory exclusions the spec requires (no email, unsubscribed, suppressed) are folded into the view's `is_sendable` column, so a segment query cannot omit them.

Everything else follows the spec as written.

## Global Constraints

- **`npm run <script>` is broken by the `&` in this workspace's path.** Always call binaries directly: `node_modules/.bin/tsc --noEmit`, `node_modules/.bin/vitest run`, `node_modules/.bin/next lint`.
- **Never run `next build` while a dev server is live** — it corrupts the dev server's route manifests. Kill the port's PID first, then `rm -rf .next`.
- **Migrations are applied by hand** in the Supabase SQL Editor (New query → Run), in numeric order. This repo has no `supabase db push` workflow. Files land in `supabase/migrations/`.
- **Admin data layers use `createAdminSupabase()`** (service role) and return discriminated unions, never throw. Callers are already gated by `requireAdmin()` at the route boundary. Pattern: `src/lib/data/admin-marketing.ts`.
- **Route handlers gate with `requireAdmin()`** and follow `src/app/api/admin/banners/route.ts:1-23` exactly: `const auth = await requireAdmin(); if (!auth.ok) return auth.response;`
- **Admin-only tables get RLS enabled with zero policies** — service-role only, the convention established in migration `0033`.
- **Pure functions live outside `import "server-only"` files** where a client component may import them. `vitest.setup.ts` mocks `server-only`, so tests can import either way, but client components cannot.
- **Fixed-value columns are Postgres enums**, matching `banner_slot`, `enrollment_status`, `mentor_tier`.
- **Test files** live in `tests/`, named `<topic>.test.ts` / `<topic>.rules.test.ts` / `<topic>.schema.test.ts`.
- **Before building any UI, search the Stitch project** (`11811490301995978699`, "PZ Academy website") for an existing screen. If none exists, hand the user a generation prompt rather than improvising a design. `generate_screen_from_text` has repeatedly timed out on this account — do not fight it.
- **Google Drive image URLs** use `/thumbnail?id=<id>&sz=w1600` proxied through `/api/cover`, never `uc?export=view`.
- **Commit after every task.** Local commits only; never push unless explicitly asked.

---

## File Structure

**Phase 1a — get the data in**

| File | Responsibility |
|---|---|
| `supabase/migrations/0047_crm_contacts.sql` | All six tables, enums, indexes, RLS |
| `src/lib/crm/phone.ts` | `normalizePhone` — pure, no I/O |
| `src/lib/crm/identity.ts` | `normalizeEmail`, `normalizeName`, `scoreDuplicate` — pure |
| `src/lib/crm/product-label.ts` | `parseProductLabel` — pure |
| `src/lib/validations/crm.ts` | Zod schemas + shared CRM types |
| `gas/sheets-sync/Code.gs` | **Modify** — add `listSheetTabs`, `readSheetRows` |
| `src/lib/gas/sheets-read-client.ts` | Typed client for the two new GAS actions |
| `src/lib/crm/import-mapping.ts` | `guessColumnMapping`, `parseSheetRows` — pure |
| `src/lib/data/admin-crm-import.ts` | Dry run + transactional commit |
| `src/lib/data/admin-crm-contacts.ts` | Contact list/detail, merge candidates, merge |
| `src/app/api/admin/crm/sheets/route.ts` | List tabs for a sheet id |
| `src/app/api/admin/crm/import/preview/route.ts` | Dry run |
| `src/app/api/admin/crm/import/commit/route.ts` | Commit |
| `src/app/api/admin/crm/contacts/route.ts` | Contact list |
| `src/app/api/admin/crm/merge/[id]/route.ts` | Resolve one merge candidate |
| `src/app/dashboard/admin/crm/page.tsx` | Tab shell |
| `src/components/admin/crm/ImportWizard.tsx` | Import UI |
| `src/components/admin/crm/ContactsPanel.tsx` | Contacts table + detail |
| `src/components/admin/crm/MergeReviewPanel.tsx` | Merge queue UI |
| `src/components/dashboard/Sidebar.tsx` | **Modify** — add CRM link |

**Phase 1b — send to it**

| File | Responsibility |
|---|---|
| `supabase/migrations/0048_crm_segments.sql` | Segment source view + campaign stats view |
| `src/lib/crm/segment.ts` | `buildSegmentFilters` — pure |
| `src/lib/crm/merge-tags.ts` | `renderMergeTags` — pure |
| `src/lib/crm/campaign-email.ts` | Branded HTML shell + unsubscribe footer injection |
| `src/lib/data/admin-crm-segments.ts` | Segment resolution + count |
| `src/lib/data/admin-crm-campaigns.ts` | Draft, snapshot, send, stats |
| `src/lib/data/crm-unsubscribe.ts` | Token lookup + unsubscribe write |
| `src/app/api/admin/crm/segments/preview/route.ts` | Live count |
| `src/app/api/admin/crm/campaigns/route.ts` | Create/list campaigns |
| `src/app/api/admin/crm/campaigns/[id]/send/route.ts` | Snapshot + enqueue |
| `src/app/api/admin/crm/campaigns/[id]/test/route.ts` | Send test to self |
| `src/app/unsubscribe/[token]/page.tsx` | Public unsubscribe |
| `src/components/admin/crm/SegmentBuilder.tsx` | Filter UI + live count |
| `src/components/admin/crm/CampaignsPanel.tsx` | Composer + stats |

---

# Phase 1a — Get the data in

**Phase checkpoint:** all 25 sheets imported, duplicates resolved, purchase history visible per contact. This phase is a standalone deliverable even if 1b slips.

---

### Task 1: Migration 0047 — CRM schema

**Files:**
- Create: `supabase/migrations/0047_crm_contacts.sql`

**Interfaces:**
- Consumes: nothing
- Produces: tables `contacts`, `contact_purchases`, `import_batches`, `merge_candidates`, `campaigns`, `campaign_recipients`; enums `crm_consent_basis`, `crm_discovery_source`, `crm_row_type`, `crm_import_status`, `crm_merge_status`, `crm_campaign_status`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration 0047: CRM contacts spine
-- Run AFTER 0046. SQL Editor → New query → Run
-- ============================================================
-- Consolidates ~3000 past buyers currently scattered across 25+ Google
-- Sheets into one addressable store, with per-purchase history so repeat
-- buyers across cohorts collapse into a single contact.
--
-- Every table here is admin-only: RLS is ENABLED with ZERO policies, the
-- service-role-only convention established in 0033. All reads and writes go
-- through createAdminSupabase() behind requireAdmin(). The one public
-- surface (unsubscribe) is a route handler using the service-role client,
-- not a client-side query, so it needs no policy either.

-- ─── 1. Enums ────────────────────────────────────────────────
-- Guarded with `if not exists` so re-running the migration is harmless.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'crm_consent_basis') then
    create type public.crm_consent_basis as enum ('purchase', 'enquiry');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_discovery_source') then
    create type public.crm_discovery_source as enum ('instagram', 'facebook', 'whatsapp', 'other', 'unknown');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_row_type') then
    create type public.crm_row_type as enum ('individual', 'group_leader', 'group_member');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_import_status') then
    create type public.crm_import_status as enum ('draft', 'previewed', 'committed', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_merge_status') then
    create type public.crm_merge_status as enum ('pending', 'merged', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'crm_campaign_status') then
    create type public.crm_campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'cancelled');
  end if;
end $$;

-- ─── 2. import_batches ───────────────────────────────────────
-- Created before contacts because contact_purchases references it.
create table if not exists public.import_batches (
  id                uuid primary key default gen_random_uuid(),
  sheet_id          text not null,
  sheet_name        text not null default '',
  tab_name          text not null,
  column_mapping    jsonb not null default '{}'::jsonb,
  course_id         uuid references public.courses(id) on delete set null,
  status            public.crm_import_status not null default 'draft',
  rows_total        integer not null default 0,
  rows_imported     integer not null default 0,
  contacts_created  integer not null default 0,
  contacts_merged   integer not null default 0,
  rows_skipped      integer not null default 0,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ─── 3. contacts ─────────────────────────────────────────────
-- email and phone_e164 are BOTH nullable and BOTH unique. Today every sheet
-- row carries both; slice 2's WhatsApp-ad leads will arrive phone-only.
-- Postgres unique indexes treat NULLs as distinct, so multiple rows may have
-- a null email without colliding — exactly the behaviour wanted.
--
-- phone_raw is kept verbatim even when normalization succeeds, so a bad
-- normalization rule can be re-run later against the original value.
create table if not exists public.contacts (
  id                        uuid primary key default gen_random_uuid(),
  email                     text,
  phone_e164                text,
  phone_raw                 text,
  full_name                 text not null default '',
  profession                text,
  country                   text,
  discovery_source          public.crm_discovery_source not null default 'unknown',
  consent_basis             public.crm_consent_basis not null default 'purchase',
  email_unsubscribed_at     timestamptz,
  whatsapp_unsubscribed_at  timestamptz,
  unsubscribe_token         uuid not null default gen_random_uuid(),
  profile_id                uuid references public.profiles(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create unique index if not exists contacts_email_key on public.contacts (email) where email is not null;
create unique index if not exists contacts_phone_e164_key on public.contacts (phone_e164) where phone_e164 is not null;
create unique index if not exists contacts_unsubscribe_token_key on public.contacts (unsubscribe_token);
create index if not exists contacts_profile_id_idx on public.contacts (profile_id);
create index if not exists contacts_discovery_source_idx on public.contacts (discovery_source);

-- ─── 4. contact_purchases ────────────────────────────────────
-- UNIQUE (source_sheet_id, source_row_ref) is what makes re-import
-- idempotent: re-running a sheet after fixing a column mapping produces no
-- duplicates. With 25 sheets and a mapping step that WILL be got wrong at
-- least once, "fixable by re-running" beats "fixable by hand".
--
-- product_label stays raw and course_id stays nullable on purpose: labels
-- are free text and sheet-specific, and most historical cohorts have no
-- courses row at all. Course mapping is enrichment, never a blocker.
create table if not exists public.contact_purchases (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references public.contacts(id) on delete cascade,
  import_batch_id   uuid references public.import_batches(id) on delete set null,
  source_sheet_id   text not null,
  source_row_ref    text not null,
  product_label     text not null default '',
  course_id         uuid references public.courses(id) on delete set null,
  amount            numeric(12,2),
  currency          text,
  is_early_bird     boolean not null default false,
  row_type          public.crm_row_type not null default 'individual',
  promo_code        text,
  purchased_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (source_sheet_id, source_row_ref)
);

create index if not exists contact_purchases_contact_id_idx on public.contact_purchases (contact_id);
create index if not exists contact_purchases_batch_idx on public.contact_purchases (import_batch_id);
create index if not exists contact_purchases_course_idx on public.contact_purchases (course_id);
create index if not exists contact_purchases_row_type_idx on public.contact_purchases (row_type);

-- ─── 5. merge_candidates ─────────────────────────────────────
-- The human review queue for duplicates that are probable but not certain.
-- Certain duplicates (identical email or identical phone) are auto-merged at
-- import time and never reach this table.
create table if not exists public.merge_candidates (
  id             uuid primary key default gen_random_uuid(),
  contact_a_id   uuid not null references public.contacts(id) on delete cascade,
  contact_b_id   uuid not null references public.contacts(id) on delete cascade,
  reason         text not null,
  confidence     numeric(3,2) not null default 0,
  status         public.crm_merge_status not null default 'pending',
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references public.profiles(id) on delete set null,
  check (contact_a_id <> contact_b_id)
);

create index if not exists merge_candidates_status_idx on public.merge_candidates (status);

-- ─── 6. campaigns + campaign_recipients ──────────────────────
-- Defined here rather than in a phase-1b migration so the whole CRM schema
-- applies in one pass. Phase 1b adds only views on top.
create table if not exists public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  subject        text not null default '',
  html_content   text not null default '',
  segment        jsonb not null default '[]'::jsonb,
  status         public.crm_campaign_status not null default 'draft',
  scheduled_at   timestamptz,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- UNIQUE (campaign_id, contact_id) makes double-sending structurally
-- impossible — a retry of a partially-failed send cannot re-enqueue anyone
-- who already has a row.
create table if not exists public.campaign_recipients (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  email_queue_id  uuid references public.email_queue(id) on delete set null,
  status          text not null default 'pending',
  created_at      timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists campaign_recipients_campaign_idx on public.campaign_recipients (campaign_id);

-- ─── 7. updated_at trigger for contacts ──────────────────────
create or replace function public.touch_contacts_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function public.touch_contacts_updated_at();

-- ─── 8. RLS: enabled, zero policies (service-role only) ──────
alter table public.contacts            enable row level security;
alter table public.contact_purchases   enable row level security;
alter table public.import_batches      enable row level security;
alter table public.merge_candidates    enable row level security;
alter table public.campaigns           enable row level security;
alter table public.campaign_recipients enable row level security;
```

- [ ] **Step 2: Apply the migration**

Open the Supabase SQL Editor for project `whqdasotjlhvrjmgiffk` → New query → paste the file → Run.

Expected: `Success. No rows returned`.

- [ ] **Step 3: Verify the schema landed**

Run in the SQL Editor:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('contacts','contact_purchases','import_batches',
                     'merge_candidates','campaigns','campaign_recipients')
order by table_name;
```

Expected: 6 rows.

- [ ] **Step 4: Regenerate database types**

Run:
```bash
node_modules/.bin/supabase gen types typescript --project-id whqdasotjlhvrjmgiffk > src/lib/supabase/database.types.ts
```

If the Supabase CLI is not installed locally, use the MCP tool `generate_typescript_types` and write its output to that path instead.

Expected: `contacts`, `contact_purchases`, and the four other tables now appear in `src/lib/supabase/database.types.ts`, and the `Enums` block gains `crm_consent_basis`, `crm_discovery_source`, `crm_row_type`, `crm_import_status`, `crm_merge_status`, `crm_campaign_status`.

- [ ] **Step 5: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0047_crm_contacts.sql src/lib/supabase/database.types.ts
git commit -m "feat: add CRM contacts schema (migration 0047)"
```

---

### Task 2: `normalizePhone` — pure function

The highest-risk code in the plan. The source `WhatsApp` column contains five distinct formats within fourteen consecutive rows. A wrongly normalized number is an unreachable contact that fails **silently**, and the failure only surfaces after the WhatsApp Business API is purchased. Ambiguous input is therefore flagged, never guessed.

**Files:**
- Create: `src/lib/crm/phone.ts`
- Test: `tests/crm-phone.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `normalizePhone(raw: string | null | undefined): PhoneResult`, where
  `type PhoneResult = { ok: true; e164: string; country: "PK" | "AE" | "SA" } | { ok: false; reason: "empty" | "ambiguous" }`

- [ ] **Step 1: Write the failing test**

Create `tests/crm-phone.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/crm/phone";

describe("normalizePhone", () => {
  // Every literal below is a real value from the MDC3 Master Sheet's
  // WhatsApp column — five formats in fourteen consecutive rows.
  it("prefixes a bare 10-digit Pakistani mobile starting with 3", () => {
    expect(normalizePhone("3234267102")).toEqual({ ok: true, e164: "+923234267102", country: "PK" });
    expect(normalizePhone("3198071841")).toEqual({ ok: true, e164: "+923198071841", country: "PK" });
  });

  it("accepts an already 92-prefixed 12-digit number", () => {
    expect(normalizePhone("923478539155")).toEqual({ ok: true, e164: "+923478539155", country: "PK" });
  });

  it("strips a leading zero from an 11-digit local format", () => {
    expect(normalizePhone("03255965790")).toEqual({ ok: true, e164: "+923255965790", country: "PK" });
  });

  it("ignores spaces and punctuation before deciding", () => {
    expect(normalizePhone("0325 5965790")).toEqual({ ok: true, e164: "+923255965790", country: "PK" });
    expect(normalizePhone("92 370 5109810")).toEqual({ ok: true, e164: "+923705109810", country: "PK" });
    expect(normalizePhone("+92-321-7654321")).toEqual({ ok: true, e164: "+923217654321", country: "PK" });
  });

  it("recognises UAE and Saudi numbers by prefix", () => {
    expect(normalizePhone("971568346151")).toEqual({ ok: true, e164: "+971568346151", country: "AE" });
    expect(normalizePhone("966512345678")).toEqual({ ok: true, e164: "+966512345678", country: "SA" });
  });

  it("drops an international 00 prefix", () => {
    expect(normalizePhone("00923234267102")).toEqual({ ok: true, e164: "+923234267102", country: "PK" });
  });

  it("reports empty input rather than guessing", () => {
    expect(normalizePhone("")).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone("   ")).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone(null)).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhone(undefined)).toEqual({ ok: false, reason: "empty" });
  });

  it("flags two numbers crammed into one cell as ambiguous", () => {
    // Common in these sheets. Guessing which one is reachable is worse than
    // handing the admin a short review list.
    expect(normalizePhone("0300 1234567 / 0321 7654321")).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("flags anything that matches no rule as ambiguous", () => {
    expect(normalizePhone("12345")).toEqual({ ok: false, reason: "ambiguous" });
    expect(normalizePhone("N/A")).toEqual({ ok: false, reason: "ambiguous" });
    expect(normalizePhone("4234567890")).toEqual({ ok: false, reason: "ambiguous" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run tests/crm-phone.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/crm/phone"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/crm/phone.ts`:

```ts
/**
 * Phone normalization for the CRM import. Pure — no I/O, no database.
 *
 * Deliberately conservative: anything that does not match a known rule is
 * reported ambiguous rather than guessed. A wrongly normalized number is an
 * unreachable contact that fails silently, and that failure only becomes
 * visible after the WhatsApp Business API is bought. A short manual review
 * list is far cheaper than silent data loss.
 *
 * Markets served: Pakistan (+92), UAE (+971), Saudi Arabia (+966).
 */

export type PhoneResult =
  | { ok: true; e164: string; country: "PK" | "AE" | "SA" }
  | { ok: false; reason: "empty" | "ambiguous" };

/** Digit counts include the country code. */
const RULES: ReadonlyArray<{ prefix: string; totalDigits: number; country: "PK" | "AE" | "SA" }> = [
  { prefix: "92", totalDigits: 12, country: "PK" },
  { prefix: "971", totalDigits: 12, country: "AE" },
  { prefix: "966", totalDigits: 12, country: "SA" },
];

export function normalizePhone(raw: string | null | undefined): PhoneResult {
  if (raw == null) return { ok: false, reason: "empty" };

  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };

  // Two numbers in one cell: separated by a slash, comma, semicolon, or the
  // word "or". Detected BEFORE stripping punctuation, because stripping
  // would silently concatenate them into one plausible-looking long number.
  if (/[\/,;]|\bor\b/i.test(trimmed)) return { ok: false, reason: "ambiguous" };

  let digits = trimmed.replace(/\D/g, "");
  if (digits === "") return { ok: false, reason: "ambiguous" };

  // International dialling prefix.
  if (digits.startsWith("00")) digits = digits.slice(2);

  for (const rule of RULES) {
    if (digits.startsWith(rule.prefix) && digits.length === rule.totalDigits) {
      return { ok: true, e164: `+${digits}`, country: rule.country };
    }
  }

  // Local Pakistani formats. Mobile numbers always begin with 3 once the
  // trunk prefix is removed, which is what makes these two rules safe.
  if (digits.length === 11 && digits.startsWith("03")) {
    return { ok: true, e164: `+92${digits.slice(1)}`, country: "PK" };
  }
  if (digits.length === 10 && digits.startsWith("3")) {
    return { ok: true, e164: `+92${digits}`, country: "PK" };
  }

  return { ok: false, reason: "ambiguous" };
}

/**
 * Last nine digits of a normalized number, used by duplicate scoring to
 * catch the same human entered under two different formats. Nine rather
 * than ten because that is the subscriber-number length shared by all three
 * supported countries once the country code is removed.
 */
export function phoneTail(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  return digits.slice(-9);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run tests/crm-phone.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/phone.ts tests/crm-phone.test.ts
git commit -m "feat: add conservative phone normalization for CRM import"
```

---

### Task 3: `normalizeEmail`, `normalizeName`, `scoreDuplicate`

**Files:**
- Create: `src/lib/crm/identity.ts`
- Test: `tests/crm-identity.test.ts`

**Interfaces:**
- Consumes: `phoneTail` from `src/lib/crm/phone.ts`
- Produces:
  - `normalizeEmail(raw: string | null | undefined): string | null`
  - `normalizeName(raw: string | null | undefined): string`
  - `scoreDuplicate(a: DuplicateInput, b: DuplicateInput): DuplicateVerdict`
  - `type DuplicateInput = { email: string | null; phoneE164: string | null; fullName: string }`
  - `type DuplicateVerdict = { kind: "same"; reason: string } | { kind: "review"; reason: string; confidence: number } | { kind: "different" }`

- [ ] **Step 1: Write the failing test**

Create `tests/crm-identity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizeName, scoreDuplicate } from "@/lib/crm/identity";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Almas.Raza07@Gmail.COM ")).toBe("almas.raza07@gmail.com");
  });

  it("returns null for blank or malformed input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("missing@domain")).toBeNull();
  });
});

describe("normalizeName", () => {
  it("collapses whitespace and title-cases", () => {
    expect(normalizeName("  sonia   hayat ")).toBe("Sonia Hayat");
  });

  it("strips honorifics so Dr.Awais and Awais compare equal", () => {
    expect(normalizeName("Dr.Awais Ahmed")).toBe("Awais Ahmed");
    expect(normalizeName("Dr Muhammad Sadiq")).toBe("Muhammad Sadiq");
    expect(normalizeName("MR. Said Rahman")).toBe("Said Rahman");
  });

  it("returns empty string for blank input", () => {
    expect(normalizeName(null)).toBe("");
    expect(normalizeName("   ")).toBe("");
  });
});

describe("scoreDuplicate", () => {
  const base = { email: "areeba@gmail.com", phoneE164: "+923345545375", fullName: "Areeba Fatima" };

  it("treats an identical email as the same person", () => {
    const verdict = scoreDuplicate(base, { email: "areeba@gmail.com", phoneE164: null, fullName: "A Fatima" });
    expect(verdict.kind).toBe("same");
  });

  it("treats an identical phone as the same person", () => {
    const verdict = scoreDuplicate(base, { email: null, phoneE164: "+923345545375", fullName: "Different Name" });
    expect(verdict.kind).toBe("same");
  });

  it("flags same name plus same phone tail under different normalization for review", () => {
    // The same human whose number was typed once with and once without a
    // country code, where one of the two failed to normalize identically.
    const verdict = scoreDuplicate(
      { email: "a@x.com", phoneE164: "+923345545375", fullName: "Areeba Fatima" },
      { email: "b@y.com", phoneE164: "+13345545375", fullName: "areeba  fatima" },
    );
    expect(verdict.kind).toBe("review");
  });

  it("flags a typo'd email domain with a matching name for review", () => {
    const verdict = scoreDuplicate(
      { email: "areeba@gmail.com", phoneE164: null, fullName: "Areeba Fatima" },
      { email: "areeba@gmail.con", phoneE164: null, fullName: "Areeba Fatima" },
    );
    expect(verdict.kind).toBe("review");
  });

  it("does not flag two different people who merely share a first name", () => {
    const verdict = scoreDuplicate(
      { email: "amna@x.com", phoneE164: "+923254465477", fullName: "Amna Nasir" },
      { email: "amal@y.com", phoneE164: "+923303046350", fullName: "Amal Hussain Bakhsh" },
    );
    expect(verdict.kind).toBe("different");
  });

  it("does not flag two contacts that share nothing", () => {
    const verdict = scoreDuplicate(base, { email: "zzz@q.com", phoneE164: "+971568346151", fullName: "Ammara Rana" });
    expect(verdict.kind).toBe("different");
  });

  it("never calls two null-email null-phone contacts the same", () => {
    const verdict = scoreDuplicate(
      { email: null, phoneE164: null, fullName: "Aneera" },
      { email: null, phoneE164: null, fullName: "Aneera" },
    );
    expect(verdict.kind).not.toBe("same");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run tests/crm-identity.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/crm/identity"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/crm/identity.ts`:

```ts
import { phoneTail } from "./phone";

/**
 * Identity normalization and duplicate scoring for the CRM import. Pure —
 * no I/O, no database.
 *
 * The split between "same" (auto-merge) and "review" (queue for a human) is
 * deliberate and conservative. Auto-merge requires an exact match on a
 * genuinely unique field. Everything weaker is a suggestion for a person to
 * confirm, because an incorrect auto-merge silently destroys one contact's
 * purchase history and is not detectable after the fact.
 */

export type DuplicateInput = {
  email: string | null;
  phoneE164: string | null;
  fullName: string;
};

export type DuplicateVerdict =
  | { kind: "same"; reason: string }
  | { kind: "review"; reason: string; confidence: number }
  | { kind: "different" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = raw.trim().toLowerCase();
  if (value === "") return null;
  return EMAIL_RE.test(value) ? value : null;
}

// Honorifics are stripped so "Dr.Awais Ahmed" and "Awais Ahmed" — which
// appear as separate rows across these sheets — compare as one person.
const HONORIFICS = new Set(["dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss", "prof", "prof."]);

export function normalizeName(raw: string | null | undefined): string {
  if (raw == null) return "";
  // "Dr.Awais" has no space after the period, so split on periods too, then
  // re-join. Keeps "Dr.Awais Ahmed" from being read as a single token.
  const words = raw
    .replace(/\./g, ". ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w !== "");

  const kept = words.filter((w) => !HONORIFICS.has(w.toLowerCase()));
  return kept
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

function emailLocalPart(email: string): string {
  return email.split("@")[0] ?? "";
}

export function scoreDuplicate(a: DuplicateInput, b: DuplicateInput): DuplicateVerdict {
  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  const nameA = normalizeName(a.fullName);
  const nameB = normalizeName(b.fullName);

  // ─── Auto-merge: exact match on a unique field ───
  if (emailA && emailB && emailA === emailB) {
    return { kind: "same", reason: "identical email" };
  }
  if (a.phoneE164 && b.phoneE164 && a.phoneE164 === b.phoneE164) {
    return { kind: "same", reason: "identical phone" };
  }

  // Below here a name match is required. Without it there is no evidence at
  // all, and two contacts sharing neither email nor phone are two people.
  const namesMatch = nameA !== "" && nameA === nameB;
  if (!namesMatch) return { kind: "different" };

  // ─── Review: same name plus corroborating near-match ───
  if (a.phoneE164 && b.phoneE164 && phoneTail(a.phoneE164) === phoneTail(b.phoneE164)) {
    return { kind: "review", reason: "same name, same phone tail, different normalization", confidence: 0.9 };
  }

  if (emailA && emailB && emailLocalPart(emailA) === emailLocalPart(emailB)) {
    return { kind: "review", reason: "same name, same email local-part, different domain", confidence: 0.8 };
  }

  return { kind: "different" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run tests/crm-identity.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/identity.ts tests/crm-identity.test.ts
git commit -m "feat: add CRM email/name normalization and duplicate scoring"
```

---

### Task 4: `parseProductLabel`

**Files:**
- Create: `src/lib/crm/product-label.ts`
- Test: `tests/crm-product-label.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `parseProductLabel(raw: string | null | undefined): ParsedProduct` where
  `type ParsedProduct = { amount: number | null; currency: "PKR" | "AED" | "SAR" | null; isEarlyBird: boolean; rowTypeHint: "individual" | "group_leader" | "group_member" | null }`

- [ ] **Step 1: Write the failing test**

Create `tests/crm-product-label.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseProductLabel } from "@/lib/crm/product-label";

describe("parseProductLabel", () => {
  // Literals below are verbatim from the MDC3 Master Sheet's
  // "Registration Option" column.
  it("parses a plain individual PKR registration", () => {
    expect(parseProductLabel("Individual — PKR 2,700")).toEqual({
      amount: 2700,
      currency: "PKR",
      isEarlyBird: false,
      rowTypeHint: "individual",
    });
  });

  it("detects the early bird marker", () => {
    expect(parseProductLabel("Individual — PKR 2,700 [Early Bird]")).toEqual({
      amount: 2700,
      currency: "PKR",
      isEarlyBird: true,
      rowTypeHint: "individual",
    });
  });

  it("uses the per-person price for a group registration, not the total", () => {
    // 6,480 is what the group leader paid for three seats. The per-contact
    // value is 2,160 — using the total would triple every group member's
    // recorded spend and corrupt lifetime-value reporting.
    expect(parseProductLabel("Group — PKR 6,480 (3 × PKR 2,160/person) [Early Bird]")).toEqual({
      amount: 2160,
      currency: "PKR",
      isEarlyBird: true,
      rowTypeHint: "group_leader",
    });
  });

  it("parses an AED registration", () => {
    expect(parseProductLabel("Individual — AED 80 [Early Bird]")).toEqual({
      amount: 80,
      currency: "AED",
      isEarlyBird: true,
      rowTypeHint: "individual",
    });
  });

  it("returns nulls rather than guessing on an unrecognised label", () => {
    expect(parseProductLabel("Scholarship")).toEqual({
      amount: null,
      currency: null,
      isEarlyBird: false,
      rowTypeHint: null,
    });
  });

  it("handles blank input", () => {
    expect(parseProductLabel("")).toEqual({ amount: null, currency: null, isEarlyBird: false, rowTypeHint: null });
    expect(parseProductLabel(null)).toEqual({ amount: null, currency: null, isEarlyBird: false, rowTypeHint: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run tests/crm-product-label.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/crm/product-label.ts`:

```ts
/**
 * Best-effort parse of the free-text "Registration Option" column into
 * structured price data. Pure — no I/O.
 *
 * Best-effort is the contract: the raw label is always stored alongside
 * whatever this extracts, so an unparsed label costs nothing and never
 * blocks an import. Returning nulls is always preferable to guessing.
 */

export type ParsedProduct = {
  amount: number | null;
  currency: "PKR" | "AED" | "SAR" | null;
  isEarlyBird: boolean;
  rowTypeHint: "individual" | "group_leader" | "group_member" | null;
};

const EMPTY: ParsedProduct = { amount: null, currency: null, isEarlyBird: false, rowTypeHint: null };

const CURRENCIES = ["PKR", "AED", "SAR"] as const;

function toNumber(raw: string): number | null {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

export function parseProductLabel(raw: string | null | undefined): ParsedProduct {
  if (raw == null) return { ...EMPTY };
  const label = raw.trim();
  if (label === "") return { ...EMPTY };

  const isEarlyBird = /\[early bird\]/i.test(label);

  let rowTypeHint: ParsedProduct["rowTypeHint"] = null;
  if (/^individual\b/i.test(label)) rowTypeHint = "individual";
  else if (/^group\b/i.test(label)) rowTypeHint = "group_leader";

  let currency: ParsedProduct["currency"] = null;
  for (const c of CURRENCIES) {
    if (label.includes(c)) {
      currency = c;
      break;
    }
  }

  let amount: number | null = null;
  if (currency) {
    // A group label carries two prices: the bundle total and the per-person
    // rate. The per-person rate is the one that belongs on a contact, so it
    // is matched first and wins.
    const perPerson = label.match(
      new RegExp(`${currency}\\s*([\\d,]+(?:\\.\\d+)?)\\s*/\\s*person`, "i"),
    );
    if (perPerson?.[1]) {
      amount = toNumber(perPerson[1]);
    } else {
      const first = label.match(new RegExp(`${currency}\\s*([\\d,]+(?:\\.\\d+)?)`, "i"));
      if (first?.[1]) amount = toNumber(first[1]);
    }
  }

  return { amount, currency, isEarlyBird, rowTypeHint };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run tests/crm-product-label.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/product-label.ts tests/crm-product-label.test.ts
git commit -m "feat: parse registration option labels into price and row type"
```

---

### Task 5: GAS actions — `listSheetTabs` and `readSheetRows`

**Files:**
- Modify: `gas/sheets-sync/Code.gs` — add two handlers and two router branches after the `SYNC_SECRET` gate (currently at `gas/sheets-sync/Code.gs:163-176`)

**Interfaces:**
- Consumes: nothing
- Produces: two GAS actions, both authenticated by `body.token === SYNC_SECRET`:
  - `listSheetTabs {token, action, sheetId}` → `{status:"success", tabs:[{name, headers:string[], rowCount:number}]}`
  - `readSheetRows {token, action, sheetId, tabName, offset, limit}` → `{status:"success", rows:string[][], total:number, nextOffset:number|null}`

- [ ] **Step 1: Add the two handler functions**

Append to `gas/sheets-sync/Code.gs`:

```js
/**
 * Lists every tab in a spreadsheet with its header row and data row count,
 * so the app can offer a tab picker and auto-guess a column mapping without
 * downloading the whole sheet first.
 *
 * Headers come from row 1. Sheets whose row 1 is blank return an empty
 * header array rather than failing — the admin can still pick the tab and
 * map columns by index.
 */
function handleListSheetTabs_(body) {
  if (!body.sheetId) {
    return jsonResponse_({ status: "error", message: "Missing sheetId" });
  }

  try {
    var ss = SpreadsheetApp.openById(body.sheetId);
    var tabs = ss.getSheets().map(function (sheet) {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      var headers = [];
      if (lastRow >= 1 && lastCol >= 1) {
        headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
      }
      return {
        name: sheet.getName(),
        headers: headers,
        // Exclude the header row from the count the admin sees.
        rowCount: Math.max(0, lastRow - 1),
      };
    });
    return jsonResponse_({ status: "success", tabs: tabs, sheetName: ss.getName() });
  } catch (err) {
    // Most common cause: the deploying account lacks access to this
    // spreadsheet ID. Share the sheet with that account and retry.
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

/**
 * Reads a page of data rows (header row excluded) from one tab.
 *
 * Paginated deliberately. Apps Script enforces a six-minute execution
 * ceiling and a response size limit, and several of these cohort sheets are
 * large. getDisplayValues() rather than getValues() so numbers, dates, and
 * phone numbers arrive exactly as a human sees them in the sheet — a phone
 * column formatted as a number would otherwise lose its leading zero before
 * normalizePhone ever sees it.
 */
function handleReadSheetRows_(body) {
  if (!body.sheetId || !body.tabName) {
    return jsonResponse_({ status: "error", message: "Missing sheetId or tabName" });
  }

  var offset = Number(body.offset) || 0;
  var limit = Math.min(Number(body.limit) || 500, 500);

  try {
    var ss = SpreadsheetApp.openById(body.sheetId);
    var sheet = ss.getSheetByName(body.tabName);
    if (!sheet) {
      return jsonResponse_({ status: "error", message: "No tab named " + body.tabName });
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var total = Math.max(0, lastRow - 1);

    if (total === 0 || offset >= total || lastCol < 1) {
      return jsonResponse_({ status: "success", rows: [], total: total, nextOffset: null });
    }

    // +2 converts a zero-based data offset into a 1-based sheet row that
    // skips the header: data row 0 lives at sheet row 2.
    var startRow = offset + 2;
    var count = Math.min(limit, total - offset);
    var rows = sheet.getRange(startRow, 1, count, lastCol).getDisplayValues();

    var consumed = offset + count;
    return jsonResponse_({
      status: "success",
      rows: rows,
      total: total,
      nextOffset: consumed < total ? consumed : null,
    });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}
```

- [ ] **Step 2: Wire both actions into the router**

In `gas/sheets-sync/Code.gs`, inside `doPost`, after the existing `applyStatus` branch and before the final `Unknown action` return, add:

```js
  if (body.action === "listSheetTabs") {
    return handleListSheetTabs_(body);
  }

  if (body.action === "readSheetRows") {
    return handleReadSheetRows_(body);
  }
```

These must sit **after** the `SYNC_SECRET` check (`gas/sheets-sync/Code.gs:163-167`), not before it. They are sheet-scoped reads belonging to the same integration as `registerSheet` and `applyStatus`, so they use the same secret. Placing them above the gate would expose the contents of any spreadsheet the deploying account can open to an unauthenticated caller.

- [ ] **Step 3: Deploy the Apps Script**

Open the "PZ Academy Platform" Apps Script project → Deploy → Manage deployments → edit the active deployment → New version → Deploy.

The exec URL must not change; `GAS_SHEETS_SYNC_URL` in `.env.local` points at it.

- [ ] **Step 4: Verify both actions against a real sheet**

Ask the user for the MDC3 Master Sheet id (the `/d/<id>/` segment of its URL) and the value of `SHEETS_SYNC_SECRET` from `.env.local`, then run:

```bash
curl -s -X POST "$GAS_SHEETS_SYNC_URL" \
  -H "Content-Type: application/json" \
  -d '{"token":"<SHEETS_SYNC_SECRET>","action":"listSheetTabs","sheetId":"<SHEET_ID>"}'
```

Expected: `status: "success"` and a `tabs` array including `Form Responses 1` with headers `Name`, `Email`, `WhatsApp`, `Profession`, `Discovery`, `Registration Option`, `Consent`, `Row Type`, `Promo Code`.

Then:

```bash
curl -s -X POST "$GAS_SHEETS_SYNC_URL" \
  -H "Content-Type: application/json" \
  -d '{"token":"<SHEETS_SYNC_SECRET>","action":"readSheetRows","sheetId":"<SHEET_ID>","tabName":"Form Responses 1","offset":0,"limit":5}'
```

Expected: five row arrays, with the `WhatsApp` column preserving its original formatting (leading zeros intact).

- [ ] **Step 5: Commit**

```bash
git add gas/sheets-sync/Code.gs
git commit -m "feat: add listSheetTabs and readSheetRows actions to GAS relay"
```

---

### Task 6: Typed GAS client for sheet reads

**Files:**
- Create: `src/lib/gas/sheets-read-client.ts`

**Interfaces:**
- Consumes: the two GAS actions from Task 5
- Produces:
  - `listSheetTabs(sheetId: string): Promise<SheetTabsResult>`
  - `readSheetRows(sheetId: string, tabName: string, offset: number, limit?: number): Promise<SheetRowsResult>`
  - `readAllSheetRows(sheetId: string, tabName: string): Promise<SheetRowsResult>`
  - `type SheetTab = { name: string; headers: string[]; rowCount: number }`
  - `type SheetTabsResult = { ok: true; sheetName: string; tabs: SheetTab[] } | { ok: false; message: string }`
  - `type SheetRowsResult = { ok: true; rows: string[][]; total: number } | { ok: false; message: string }`

- [ ] **Step 1: Write the implementation**

Create `src/lib/gas/sheets-read-client.ts`:

```ts
import "server-only";

/**
 * Typed client for the two sheet-read actions added to the GAS relay.
 *
 * Unlike pushStatusToSheet (fire-and-forget, swallows its own errors), these
 * calls DO surface failure: an admin importing a spreadsheet needs to know
 * that the read failed, because the alternative is a silently empty import.
 * This mirrors registerSheet's contract in sheets-sync-client.ts.
 */

export type SheetTab = { name: string; headers: string[]; rowCount: number };

export type SheetTabsResult =
  | { ok: true; sheetName: string; tabs: SheetTab[] }
  | { ok: false; message: string };

export type SheetRowsResult =
  | { ok: true; rows: string[][]; total: number }
  | { ok: false; message: string };

const PAGE_SIZE = 500;

async function callGas(payload: Record<string, unknown>): Promise<
  { ok: true; json: Record<string, unknown> } | { ok: false; message: string }
> {
  const url = process.env.GAS_SHEETS_SYNC_URL;
  const token = process.env.SHEETS_SYNC_SECRET;
  if (!url || !token) {
    return { ok: false, message: "Sheet reading is not configured (GAS_SHEETS_SYNC_URL / SHEETS_SYNC_SECRET missing)." };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...payload }),
    });
    if (!res.ok) return { ok: false, message: `Sheet service returned ${res.status}.` };

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) return { ok: false, message: "Sheet service returned an unreadable response." };
    if (json.status !== "success") {
      return { ok: false, message: String(json.message ?? "Sheet service rejected the request.") };
    }
    return { ok: true, json };
  } catch (error) {
    console.error("[sheets-read] request failed:", error);
    return { ok: false, message: "Could not reach the sheet service." };
  }
}

export async function listSheetTabs(sheetId: string): Promise<SheetTabsResult> {
  const result = await callGas({ action: "listSheetTabs", sheetId });
  if (!result.ok) return result;

  const tabs = Array.isArray(result.json.tabs) ? (result.json.tabs as SheetTab[]) : [];
  return { ok: true, sheetName: String(result.json.sheetName ?? ""), tabs };
}

export async function readSheetRows(
  sheetId: string,
  tabName: string,
  offset: number,
  limit: number = PAGE_SIZE,
): Promise<SheetRowsResult> {
  const result = await callGas({ action: "readSheetRows", sheetId, tabName, offset, limit });
  if (!result.ok) return result;

  const rows = Array.isArray(result.json.rows) ? (result.json.rows as string[][]) : [];
  return { ok: true, rows, total: Number(result.json.total ?? rows.length) };
}

/**
 * Pages through an entire tab. Apps Script caps a single response, so a
 * 900-row cohort sheet needs two round trips; this hides that from callers.
 *
 * The page cap doubles as a runaway guard: 40 pages is 20,000 rows, far
 * beyond any real cohort sheet, so hitting it means something is wrong
 * rather than large.
 */
export async function readAllSheetRows(sheetId: string, tabName: string): Promise<SheetRowsResult> {
  const all: string[][] = [];
  let offset = 0;
  let total = 0;

  for (let page = 0; page < 40; page += 1) {
    const result = await readSheetRows(sheetId, tabName, offset, PAGE_SIZE);
    if (!result.ok) return result;

    all.push(...result.rows);
    total = result.total;
    offset += result.rows.length;

    if (result.rows.length === 0 || offset >= total) break;
  }

  return { ok: true, rows: all, total };
}

/** Extracts the spreadsheet id from a full Google Sheets URL, or returns a bare id unchanged. */
export function extractSheetId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match?.[1]) return match[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(trimmed) ? trimmed : null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/gas/sheets-read-client.ts
git commit -m "feat: add typed GAS client for paginated sheet reads"
```

---

### Task 7: Column mapping and row parsing — pure functions

**Files:**
- Create: `src/lib/crm/import-mapping.ts`
- Test: `tests/crm-import-mapping.test.ts`

**Interfaces:**
- Consumes: `normalizePhone` (Task 2), `normalizeEmail`/`normalizeName` (Task 3), `parseProductLabel` (Task 4)
- Produces:
  - `guessColumnMapping(headers: string[]): ColumnMapping`
  - `parseSheetRow(row: string[], mapping: ColumnMapping, rowIndex: number, tabName: string): ParsedRow`
  - `type ColumnMapping = { name: number | null; email: number | null; phone: number | null; profession: number | null; discovery: number | null; product: number | null; rowType: number | null; promoCode: number | null }`
  - `type ParsedRow = { ok: true; rowRef: string; contact: {...}; purchase: {...} } | { ok: false; rowRef: string; reason: "no-identity" }`

- [ ] **Step 1: Write the failing test**

Create `tests/crm-import-mapping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { guessColumnMapping, parseSheetRow } from "@/lib/crm/import-mapping";

// Verbatim header row from the MDC3 Master Sheet, tab "Form Responses 1".
const HEADERS = ["Name", "Email", "WhatsApp", "Profession", "Discovery", "Registration Option", "Consent", "Row Type", "Promo Code"];

describe("guessColumnMapping", () => {
  it("maps every known header by index", () => {
    expect(guessColumnMapping(HEADERS)).toEqual({
      name: 0, email: 1, phone: 2, profession: 3,
      discovery: 4, product: 5, rowType: 7, promoCode: 8,
    });
  });

  it("matches headers case-insensitively and ignores surrounding whitespace", () => {
    const mapping = guessColumnMapping(["  FULL NAME ", "E-mail Address", "Phone Number"]);
    expect(mapping.name).toBe(0);
    expect(mapping.email).toBe(1);
    expect(mapping.phone).toBe(2);
  });

  it("leaves unknown fields null rather than guessing a column", () => {
    const mapping = guessColumnMapping(["Timestamp", "Notes"]);
    expect(mapping.name).toBeNull();
    expect(mapping.email).toBeNull();
    expect(mapping.phone).toBeNull();
  });
});

describe("parseSheetRow", () => {
  const mapping = guessColumnMapping(HEADERS);

  it("parses a complete individual row", () => {
    const row = ["Almas Raza", "almasraza07@gmail.com", "3234267102", "Fresh Graduate", "Instagram", "Individual — PKR 2,700", "Yes — accepted T&C", "Individual", ""];
    const parsed = parseSheetRow(row, mapping, 0, "Form Responses 1");

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rowRef).toBe("Form Responses 1!2");
    expect(parsed.contact).toEqual({
      email: "almasraza07@gmail.com",
      phoneE164: "+923234267102",
      phoneRaw: "3234267102",
      fullName: "Almas Raza",
      profession: "Fresh Graduate",
      country: "PK",
      discoverySource: "instagram",
    });
    expect(parsed.purchase.amount).toBe(2700);
    expect(parsed.purchase.currency).toBe("PKR");
    expect(parsed.purchase.rowType).toBe("individual");
    expect(parsed.purchase.isEarlyBird).toBe(false);
  });

  it("builds a row ref that accounts for the header row", () => {
    // Data row 0 is sheet row 2. This ref is the idempotency key, so an
    // off-by-one here means re-importing silently duplicates everything.
    const row = ["X", "x@y.com", "3234267102", "", "", "", "", "", ""];
    expect(parseSheetRow(row, mapping, 5, "Sheet1").rowRef).toBe("Sheet1!7");
  });

  it("keeps the raw phone and leaves e164 null when normalization is ambiguous", () => {
    const row = ["Bad Phone", "bad@x.com", "N/A", "", "Facebook", "Individual — PKR 2,700", "", "Individual", ""];
    const parsed = parseSheetRow(row, mapping, 0, "S");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.contact.phoneE164).toBeNull();
    expect(parsed.contact.phoneRaw).toBe("N/A");
  });

  it("reads the explicit Row Type column in preference to the label hint", () => {
    // The label says "Group" (leader) but the sheet marks this person a
    // member. The explicit column is authoritative.
    const row = ["Aneera", "aneera188@gmail.com", "92 370 5109810", "PharmD Student", "Instagram", "Group — PKR 6,480 (3 × PKR 2,160/person) [Early Bird]", "Covered by Group Leader", "Group Member", "PZ-AHMED"];
    const parsed = parseSheetRow(row, mapping, 0, "S");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.purchase.rowType).toBe("group_member");
    expect(parsed.purchase.amount).toBe(2160);
    expect(parsed.purchase.promoCode).toBe("PZ-AHMED");
  });

  it("normalizes the discovery source to a known enum value", () => {
    const build = (discovery: string) => {
      const row = ["N", "n@x.com", "3234267102", "", discovery, "", "", "", ""];
      const parsed = parseSheetRow(row, mapping, 0, "S");
      return parsed.ok ? parsed.contact.discoverySource : null;
    };
    expect(build("Instagram")).toBe("instagram");
    expect(build("facebook")).toBe("facebook");
    expect(build("WhatsApp Group")).toBe("whatsapp");
    expect(build("A friend told me")).toBe("other");
    expect(build("")).toBe("unknown");
  });

  it("rejects a row with neither a usable email nor a usable phone", () => {
    // Such a row cannot be deduplicated or contacted, so importing it would
    // create an unreachable orphan that pollutes every future count.
    const row = ["Ghost", "not-an-email", "N/A", "", "", "", "", "", ""];
    const parsed = parseSheetRow(row, mapping, 3, "S");
    expect(parsed).toEqual({ ok: false, rowRef: "S!5", reason: "no-identity" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run tests/crm-import-mapping.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/crm/import-mapping.ts`:

```ts
import { normalizePhone } from "./phone";
import { normalizeEmail, normalizeName } from "./identity";
import { parseProductLabel } from "./product-label";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Column mapping and row parsing for the sheet import. Pure — no I/O.
 *
 * Header names are consistent enough across the 25 cohort sheets that
 * guessing lands most of the time, but the guess is always presented to an
 * admin for confirmation before anything is written. An unrecognised header
 * maps to null rather than to a plausible-looking column: a silently
 * mis-mapped column is far more expensive than an unmapped one.
 */

export type DiscoverySource = Database["public"]["Enums"]["crm_discovery_source"];
export type RowType = Database["public"]["Enums"]["crm_row_type"];

export type ColumnMapping = {
  name: number | null;
  email: number | null;
  phone: number | null;
  profession: number | null;
  discovery: number | null;
  product: number | null;
  rowType: number | null;
  promoCode: number | null;
};

export type ParsedContact = {
  email: string | null;
  phoneE164: string | null;
  phoneRaw: string | null;
  fullName: string;
  profession: string | null;
  country: string | null;
  discoverySource: DiscoverySource;
};

export type ParsedPurchase = {
  productLabel: string;
  amount: number | null;
  currency: string | null;
  isEarlyBird: boolean;
  rowType: RowType;
  promoCode: string | null;
};

export type ParsedRow =
  | { ok: true; rowRef: string; contact: ParsedContact; purchase: ParsedPurchase }
  | { ok: false; rowRef: string; reason: "no-identity" };

/**
 * Header aliases, checked as substrings of the lowercased header. Ordering
 * within each list does not matter; ordering BETWEEN fields does not either,
 * because each field scans all headers independently.
 */
const ALIASES: Record<keyof ColumnMapping, string[]> = {
  name: ["full name", "name"],
  email: ["e-mail", "email"],
  phone: ["whatsapp", "phone", "mobile", "contact number"],
  profession: ["profession", "occupation", "designation"],
  discovery: ["discovery", "how did you", "hear about", "source"],
  product: ["registration option", "registration", "package", "option"],
  rowType: ["row type", "registration type"],
  promoCode: ["promo code", "promo", "referral code", "coupon"],
};

export function guessColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => h.trim().toLowerCase());

  function find(field: keyof ColumnMapping): number | null {
    for (const alias of ALIASES[field]) {
      const index = normalized.findIndex((h) => h.includes(alias));
      if (index !== -1) return index;
    }
    return null;
  }

  return {
    name: find("name"),
    email: find("email"),
    phone: find("phone"),
    profession: find("profession"),
    discovery: find("discovery"),
    product: find("product"),
    rowType: find("rowType"),
    promoCode: find("promoCode"),
  };
}

function cell(row: string[], index: number | null): string {
  if (index == null) return "";
  return (row[index] ?? "").trim();
}

function toDiscoverySource(raw: string): DiscoverySource {
  const value = raw.trim().toLowerCase();
  if (value === "") return "unknown";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("whatsapp")) return "whatsapp";
  return "other";
}

function toRowType(explicit: string, hint: ReturnType<typeof parseProductLabel>["rowTypeHint"]): RowType {
  // The explicit "Row Type" column wins over the label hint: a group member
  // shares the group leader's product label but is not a leader.
  const value = explicit.trim().toLowerCase();
  if (value.includes("leader")) return "group_leader";
  if (value.includes("member")) return "group_member";
  if (value.includes("individual")) return "individual";
  return hint ?? "individual";
}

export function parseSheetRow(
  row: string[],
  mapping: ColumnMapping,
  rowIndex: number,
  tabName: string,
): ParsedRow {
  // Data row 0 is sheet row 2 — row 1 is the header. This ref is the
  // idempotency key stored on contact_purchases, so it must stay stable
  // across re-imports of the same sheet.
  const rowRef = `${tabName}!${rowIndex + 2}`;

  const email = normalizeEmail(cell(row, mapping.email));
  const phoneRawValue = cell(row, mapping.phone);
  const phone = normalizePhone(phoneRawValue);
  const phoneE164 = phone.ok ? phone.e164 : null;

  // A row with no usable identifier can be neither deduplicated nor
  // contacted. Importing it would create an unreachable orphan.
  if (!email && !phoneE164) return { ok: false, rowRef, reason: "no-identity" };

  const productLabel = cell(row, mapping.product);
  const parsedProduct = parseProductLabel(productLabel);

  const currencyCountry = parsedProduct.currency === "AED" ? "AE" : parsedProduct.currency === "SAR" ? "SA" : null;

  return {
    ok: true,
    rowRef,
    contact: {
      email,
      phoneE164,
      phoneRaw: phoneRawValue === "" ? null : phoneRawValue,
      fullName: normalizeName(cell(row, mapping.name)),
      profession: cell(row, mapping.profession) || null,
      country: phone.ok ? phone.country : currencyCountry,
      discoverySource: toDiscoverySource(cell(row, mapping.discovery)),
    },
    purchase: {
      productLabel,
      amount: parsedProduct.amount,
      currency: parsedProduct.currency,
      isEarlyBird: parsedProduct.isEarlyBird,
      rowType: toRowType(cell(row, mapping.rowType), parsedProduct.rowTypeHint),
      promoCode: cell(row, mapping.promoCode) || null,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run tests/crm-import-mapping.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the whole suite to confirm nothing regressed**

Run: `node_modules/.bin/vitest run`
Expected: all previously passing tests still pass (347 before this plan started, plus the new CRM tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/crm/import-mapping.ts tests/crm-import-mapping.test.ts
git commit -m "feat: add column mapping guess and sheet row parsing"
```

---

### Task 8: CRM validation schemas

**Files:**
- Create: `src/lib/validations/crm.ts`
- Test: `tests/crm.schema.test.ts`

**Interfaces:**
- Consumes: `ColumnMapping` shape from Task 7
- Produces: `sheetIdSchema`, `columnMappingSchema`, `importPreviewSchema`, `importCommitSchema`, `mergeResolveSchema`, `contactListQuerySchema`

- [ ] **Step 1: Write the failing test**

Create `tests/crm.schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { importPreviewSchema, importCommitSchema, mergeResolveSchema } from "@/lib/validations/crm";

const MAPPING = { name: 0, email: 1, phone: 2, profession: 3, discovery: 4, product: 5, rowType: 7, promoCode: 8 };

describe("importPreviewSchema", () => {
  it("accepts a sheet id, tab name, and mapping", () => {
    const parsed = importPreviewSchema.safeParse({ sheetId: "1c6P6fNlXkLlmJif1a", tabName: "Form Responses 1", mapping: MAPPING });
    expect(parsed.success).toBe(true);
  });

  it("rejects a mapping with no email and no phone column", () => {
    // Without at least one identity column every row would be rejected as
    // no-identity, so this is caught at the boundary rather than after a
    // full sheet read.
    const parsed = importPreviewSchema.safeParse({
      sheetId: "abc", tabName: "S",
      mapping: { ...MAPPING, email: null, phone: null },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a blank tab name", () => {
    expect(importPreviewSchema.safeParse({ sheetId: "abc", tabName: "", mapping: MAPPING }).success).toBe(false);
  });

  it("rejects a negative column index", () => {
    expect(importPreviewSchema.safeParse({ sheetId: "abc", tabName: "S", mapping: { ...MAPPING, name: -1 } }).success).toBe(false);
  });
});

describe("importCommitSchema", () => {
  it("accepts an optional courseId", () => {
    const parsed = importCommitSchema.safeParse({
      sheetId: "abc", tabName: "S", mapping: MAPPING,
      sheetName: "MDC3 Master Sheet",
      courseId: "3f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a commit with no courseId, since most cohorts have no course row", () => {
    const parsed = importCommitSchema.safeParse({ sheetId: "abc", tabName: "S", mapping: MAPPING, sheetName: "X" });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-uuid courseId", () => {
    expect(importCommitSchema.safeParse({ sheetId: "a", tabName: "S", mapping: MAPPING, sheetName: "X", courseId: "nope" }).success).toBe(false);
  });
});

describe("mergeResolveSchema", () => {
  it("accepts merge and reject decisions", () => {
    expect(mergeResolveSchema.safeParse({ decision: "merge" }).success).toBe(true);
    expect(mergeResolveSchema.safeParse({ decision: "reject" }).success).toBe(true);
  });

  it("rejects any other decision", () => {
    expect(mergeResolveSchema.safeParse({ decision: "delete" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/validations/crm.ts`:

```ts
import { z } from "zod";

/**
 * Zod schemas for the CRM admin surface. Follows the conventions in
 * src/lib/validations/admin-marketing.ts: schemas here, no I/O, safe to
 * import from client components.
 */

const columnIndex = z.number().int().min(0).max(200).nullable();

export const columnMappingSchema = z.object({
  name: columnIndex,
  email: columnIndex,
  phone: columnIndex,
  profession: columnIndex,
  discovery: columnIndex,
  product: columnIndex,
  rowType: columnIndex,
  promoCode: columnIndex,
});

/**
 * At least one identity column is required. Without an email or a phone
 * column every parsed row would be rejected as no-identity, so failing here
 * saves a full sheet read and gives the admin a comprehensible error rather
 * than "0 of 843 rows importable".
 */
const hasIdentityColumn = columnMappingSchema.refine(
  (m) => m.email !== null || m.phone !== null,
  { message: "Map at least an Email or a WhatsApp/Phone column." },
);

export const sheetIdSchema = z.object({
  sheetId: z.string().trim().min(1, "Sheet ID or URL is required").max(200),
});

export const importPreviewSchema = z.object({
  sheetId: z.string().trim().min(1).max(200),
  tabName: z.string().trim().min(1, "Tab name is required").max(200),
  mapping: hasIdentityColumn,
});

export const importCommitSchema = importPreviewSchema.extend({
  sheetName: z.string().trim().max(300).default(""),
  courseId: z.string().uuid().optional(),
});

export const mergeResolveSchema = z.object({
  decision: z.enum(["merge", "reject"]),
});

export const contactListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ColumnMappingInput = z.infer<typeof columnMappingSchema>;
export type ImportPreviewInput = z.infer<typeof importPreviewSchema>;
export type ImportCommitInput = z.infer<typeof importCommitSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/crm.ts tests/crm.schema.test.ts
git commit -m "feat: add CRM validation schemas"
```

---

### Task 9: Migration 0048 — transactional import commit RPC

The commit must be atomic: a sheet either imports fully or not at all. The Supabase JS client cannot span statements in one transaction, so the write path is a single plpgsql function.

**Files:**
- Create: `supabase/migrations/0048_crm_import_commit.sql`

**Interfaces:**
- Consumes: tables from Task 1
- Produces: `public.crm_import_commit(p_sheet_id text, p_sheet_name text, p_tab_name text, p_column_mapping jsonb, p_course_id uuid, p_created_by uuid, p_rows jsonb) returns jsonb` — returns `{batch_id, rows_total, rows_imported, contacts_created, contacts_merged}`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0048_crm_import_commit.sql`:

```sql
-- ============================================================
-- Migration 0048: CRM import commit RPC
-- Run AFTER 0047. SQL Editor → New query → Run
-- ============================================================
-- One function, one transaction. The Supabase JS client cannot span
-- statements transactionally, and a half-imported cohort sheet leaves
-- counts that no longer describe reality. Either the whole sheet lands or
-- none of it does.
--
-- All parsing (phone normalization, product label parsing, duplicate
-- scoring) already happened in TypeScript before this is called — those are
-- pure, vitest-covered functions and belong there, not in SQL. This
-- function only resolves identity against rows already in the database and
-- writes.

create or replace function public.crm_import_commit(
  p_sheet_id        text,
  p_sheet_name      text,
  p_tab_name        text,
  p_column_mapping  jsonb,
  p_course_id       uuid,
  p_created_by      uuid,
  p_rows            jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id          uuid;
  v_row               jsonb;
  v_contact           jsonb;
  v_purchase          jsonb;
  v_email             text;
  v_phone             text;
  v_contact_id        uuid;
  v_rows_total        integer := 0;
  v_rows_imported     integer := 0;
  v_contacts_created  integer := 0;
  v_contacts_merged   integer := 0;
begin
  v_rows_total := coalesce(jsonb_array_length(p_rows), 0);

  insert into public.import_batches (
    sheet_id, sheet_name, tab_name, column_mapping, course_id, status, rows_total, created_by
  )
  values (
    p_sheet_id, coalesce(p_sheet_name, ''), p_tab_name, coalesce(p_column_mapping, '{}'::jsonb),
    p_course_id, 'committed', v_rows_total, p_created_by
  )
  returning id into v_batch_id;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_contact  := v_row -> 'contact';
    v_purchase := v_row -> 'purchase';

    -- jsonb ->> yields SQL NULL for a JSON null, which is what the identity
    -- lookups below rely on: a null email must not match another null email.
    v_email := nullif(v_contact ->> 'email', '');
    v_phone := nullif(v_contact ->> 'phoneE164', '');

    v_contact_id := null;

    -- Identity resolution. Email is checked first because it is the more
    -- reliable key in these sheets; phone is the fallback for rows where the
    -- email was missing or malformed.
    if v_email is not null then
      select id into v_contact_id from public.contacts where email = v_email limit 1;
    end if;

    if v_contact_id is null and v_phone is not null then
      select id into v_contact_id from public.contacts where phone_e164 = v_phone limit 1;
    end if;

    if v_contact_id is null then
      insert into public.contacts (
        email, phone_e164, phone_raw, full_name, profession, country,
        discovery_source, consent_basis
      )
      values (
        v_email,
        v_phone,
        nullif(v_contact ->> 'phoneRaw', ''),
        coalesce(v_contact ->> 'fullName', ''),
        nullif(v_contact ->> 'profession', ''),
        nullif(v_contact ->> 'country', ''),
        coalesce((v_contact ->> 'discoverySource')::public.crm_discovery_source, 'unknown'),
        'purchase'
      )
      returning id into v_contact_id;

      v_contacts_created := v_contacts_created + 1;
    else
      -- Existing contact: fill gaps only. An earlier import's non-null value
      -- is never overwritten by a later sheet, so the oldest known good
      -- value wins and a blank cell in a newer sheet cannot erase data.
      update public.contacts
      set
        email            = coalesce(email, v_email),
        phone_e164       = coalesce(phone_e164, v_phone),
        phone_raw        = coalesce(phone_raw, nullif(v_contact ->> 'phoneRaw', '')),
        full_name        = case when full_name = '' then coalesce(v_contact ->> 'fullName', '') else full_name end,
        profession       = coalesce(profession, nullif(v_contact ->> 'profession', '')),
        country          = coalesce(country, nullif(v_contact ->> 'country', '')),
        discovery_source = case
                             when discovery_source = 'unknown'
                             then coalesce((v_contact ->> 'discoverySource')::public.crm_discovery_source, 'unknown')
                             else discovery_source
                           end
      where id = v_contact_id;

      v_contacts_merged := v_contacts_merged + 1;
    end if;

    -- Idempotent on (source_sheet_id, source_row_ref): re-importing a sheet
    -- after correcting a column mapping updates rows in place instead of
    -- duplicating them.
    insert into public.contact_purchases (
      contact_id, import_batch_id, source_sheet_id, source_row_ref,
      product_label, course_id, amount, currency, is_early_bird, row_type, promo_code
    )
    values (
      v_contact_id, v_batch_id, p_sheet_id, v_row ->> 'rowRef',
      coalesce(v_purchase ->> 'productLabel', ''),
      p_course_id,
      (nullif(v_purchase ->> 'amount', ''))::numeric,
      nullif(v_purchase ->> 'currency', ''),
      coalesce((v_purchase ->> 'isEarlyBird')::boolean, false),
      coalesce((v_purchase ->> 'rowType')::public.crm_row_type, 'individual'),
      nullif(v_purchase ->> 'promoCode', '')
    )
    on conflict (source_sheet_id, source_row_ref) do update
    set
      contact_id      = excluded.contact_id,
      import_batch_id = excluded.import_batch_id,
      product_label   = excluded.product_label,
      course_id       = excluded.course_id,
      amount          = excluded.amount,
      currency        = excluded.currency,
      is_early_bird   = excluded.is_early_bird,
      row_type        = excluded.row_type,
      promo_code      = excluded.promo_code;

    v_rows_imported := v_rows_imported + 1;
  end loop;

  update public.import_batches
  set rows_imported    = v_rows_imported,
      contacts_created = v_contacts_created,
      contacts_merged  = v_contacts_merged,
      rows_skipped     = v_rows_total - v_rows_imported
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id',         v_batch_id,
    'rows_total',       v_rows_total,
    'rows_imported',    v_rows_imported,
    'contacts_created', v_contacts_created,
    'contacts_merged',  v_contacts_merged
  );
end;
$$;

-- Service role only. The anon and authenticated roles must never be able to
-- write contacts, and nothing in the browser calls this.
revoke all on function public.crm_import_commit(text, text, text, jsonb, uuid, uuid, jsonb) from public, anon, authenticated;
```

- [ ] **Step 2: Apply the migration**

Supabase SQL Editor → New query → paste → Run.
Expected: `Success. No rows returned`.

- [ ] **Step 3: Smoke-test the function with two rows**

Run in the SQL Editor:

```sql
select public.crm_import_commit(
  'TEST_SHEET', 'Test Sheet', 'Tab1', '{}'::jsonb, null, null,
  '[
    {"rowRef":"Tab1!2",
     "contact":{"email":"rpctest1@example.com","phoneE164":"+923001111111","phoneRaw":"03001111111","fullName":"Rpc Test One","profession":"PharmD Student","country":"PK","discoverySource":"instagram"},
     "purchase":{"productLabel":"Individual — PKR 2,700","amount":2700,"currency":"PKR","isEarlyBird":false,"rowType":"individual","promoCode":null}},
    {"rowRef":"Tab1!3",
     "contact":{"email":"rpctest1@example.com","phoneE164":null,"phoneRaw":null,"fullName":"Rpc Test One","profession":null,"country":null,"discoverySource":"unknown"},
     "purchase":{"productLabel":"Individual — PKR 3,000","amount":3000,"currency":"PKR","isEarlyBird":false,"rowType":"individual","promoCode":null}}
  ]'::jsonb
);
```

Expected: `contacts_created: 1`, `contacts_merged: 1`, `rows_imported: 2` — the second row matches the first by email, so one contact ends up with two purchases.

- [ ] **Step 4: Verify idempotency by re-running the identical call**

Re-run the exact statement from Step 3, then:

```sql
select count(*) from public.contact_purchases where source_sheet_id = 'TEST_SHEET';
```

Expected: `2`, not `4`. The unique constraint turned the second run into updates.

- [ ] **Step 5: Clean up the test data**

```sql
delete from public.contact_purchases where source_sheet_id = 'TEST_SHEET';
delete from public.contacts where email = 'rpctest1@example.com';
delete from public.import_batches where sheet_id = 'TEST_SHEET';
```

Expected: all three succeed. Confirm with `select count(*) from public.contacts;` → `0`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0048_crm_import_commit.sql
git commit -m "feat: add transactional CRM import commit RPC (migration 0048)"
```

---

### Task 10: Import data layer — dry run and commit

**Files:**
- Create: `src/lib/data/admin-crm-import.ts`

**Interfaces:**
- Consumes: `readAllSheetRows`/`listSheetTabs`/`extractSheetId` (Task 6), `guessColumnMapping`/`parseSheetRow` (Task 7), `crm_import_commit` (Task 9)
- Produces:
  - `getSheetTabs(sheetIdOrUrl: string): Promise<SheetTabsResult>`
  - `previewImport(input: ImportPreviewInput): Promise<PreviewResult>`
  - `commitImport(userId: string, input: ImportCommitInput): Promise<CommitResult>`
  - `type ImportPreview = { rowsTotal, rowsImportable, rowsSkipped, contactsNew, contactsExisting, phoneFailures, productLabels: string[], samples: ParsedRow[] }`

- [ ] **Step 1: Write the implementation**

Create `src/lib/data/admin-crm-import.ts`:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listSheetTabs, readAllSheetRows, extractSheetId, type SheetTabsResult } from "@/lib/gas/sheets-read-client";
import { guessColumnMapping, parseSheetRow, type ColumnMapping, type ParsedRow } from "@/lib/crm/import-mapping";
import type { ImportPreviewInput, ImportCommitInput } from "@/lib/validations/crm";

/**
 * Import data layer. Mirrors admin-marketing.ts: service-role client,
 * discriminated-union results instead of throwing.
 *
 * The dry run and the commit share one parse path deliberately. If preview
 * and commit could diverge, the preview would stop being a guarantee and
 * become a suggestion — which is worse than no preview at all, because it
 * would be trusted.
 */

export type ImportPreview = {
  rowsTotal: number;
  rowsImportable: number;
  rowsSkipped: number;
  contactsNew: number;
  contactsExisting: number;
  phoneFailures: number;
  productLabels: string[];
  samples: Array<{ rowRef: string; name: string; email: string | null; phone: string | null; product: string; rowType: string }>;
};

export type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; message: string };
export type CommitResult =
  | { ok: true; batchId: string; rowsImported: number; contactsCreated: number; contactsMerged: number }
  | { ok: false; message: string };

export async function getSheetTabs(sheetIdOrUrl: string): Promise<SheetTabsResult> {
  const sheetId = extractSheetId(sheetIdOrUrl);
  if (!sheetId) return { ok: false, message: "That does not look like a Google Sheets URL or ID." };
  return listSheetTabs(sheetId);
}

export { guessColumnMapping };

/** Parses every row once, and reports what a commit would do. Writes nothing. */
async function parseAll(
  sheetIdOrUrl: string,
  tabName: string,
  mapping: ColumnMapping,
): Promise<{ ok: true; sheetId: string; parsed: ParsedRow[] } | { ok: false; message: string }> {
  const sheetId = extractSheetId(sheetIdOrUrl);
  if (!sheetId) return { ok: false, message: "That does not look like a Google Sheets URL or ID." };

  const read = await readAllSheetRows(sheetId, tabName);
  if (!read.ok) return { ok: false, message: read.message };

  const parsed = read.rows.map((row, index) => parseSheetRow(row, mapping, index, tabName));
  return { ok: true, sheetId, parsed };
}

export async function previewImport(input: ImportPreviewInput): Promise<PreviewResult> {
  const result = await parseAll(input.sheetId, input.tabName, input.mapping);
  if (!result.ok) return result;

  const importable = result.parsed.filter((r): r is Extract<ParsedRow, { ok: true }> => r.ok);
  const skipped = result.parsed.length - importable.length;

  // Which of these people the database already knows, resolved in two bulk
  // queries rather than one per row — 3,000 round trips would take minutes.
  const emails = importable.map((r) => r.contact.email).filter((e): e is string => e !== null);
  const phones = importable.map((r) => r.contact.phoneE164).filter((p): p is string => p !== null);

  const admin = createAdminSupabase();
  const existingEmails = new Set<string>();
  const existingPhones = new Set<string>();

  if (emails.length > 0) {
    const { data } = await admin.from("contacts").select("email").in("email", emails);
    for (const row of data ?? []) if (row.email) existingEmails.add(row.email);
  }
  if (phones.length > 0) {
    const { data } = await admin.from("contacts").select("phone_e164").in("phone_e164", phones);
    for (const row of data ?? []) if (row.phone_e164) existingPhones.add(row.phone_e164);
  }

  // Deduplicate within the sheet itself as well: the same person appearing
  // twice in one tab must count as one new contact, not two.
  const seen = new Set<string>();
  let contactsNew = 0;
  let contactsExisting = 0;

  for (const row of importable) {
    const key = row.contact.email ?? row.contact.phoneE164 ?? row.rowRef;
    if (seen.has(key)) continue;
    seen.add(key);

    const known =
      (row.contact.email !== null && existingEmails.has(row.contact.email)) ||
      (row.contact.phoneE164 !== null && existingPhones.has(row.contact.phoneE164));

    if (known) contactsExisting += 1;
    else contactsNew += 1;
  }

  const phoneFailures = importable.filter((r) => r.contact.phoneE164 === null).length;
  const productLabels = Array.from(new Set(importable.map((r) => r.purchase.productLabel).filter((l) => l !== ""))).sort();

  return {
    ok: true,
    preview: {
      rowsTotal: result.parsed.length,
      rowsImportable: importable.length,
      rowsSkipped: skipped,
      contactsNew,
      contactsExisting,
      phoneFailures,
      productLabels,
      samples: importable.slice(0, 10).map((r) => ({
        rowRef: r.rowRef,
        name: r.contact.fullName,
        email: r.contact.email,
        phone: r.contact.phoneE164,
        product: r.purchase.productLabel,
        rowType: r.purchase.rowType,
      })),
    },
  };
}

export async function commitImport(userId: string, input: ImportCommitInput): Promise<CommitResult> {
  const result = await parseAll(input.sheetId, input.tabName, input.mapping);
  if (!result.ok) return result;

  const rows = result.parsed
    .filter((r): r is Extract<ParsedRow, { ok: true }> => r.ok)
    .map((r) => ({ rowRef: r.rowRef, contact: r.contact, purchase: r.purchase }));

  if (rows.length === 0) {
    return { ok: false, message: "No importable rows — check the column mapping." };
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("crm_import_commit", {
    p_sheet_id: result.sheetId,
    p_sheet_name: input.sheetName,
    p_tab_name: input.tabName,
    p_column_mapping: input.mapping,
    p_course_id: input.courseId ?? null,
    p_created_by: userId,
    p_rows: rows,
  });

  if (error) {
    console.error("[crm-import] commit failed:", error);
    return { ok: false, message: "The import failed and nothing was saved." };
  }

  const summary = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    batchId: String(summary.batch_id ?? ""),
    rowsImported: Number(summary.rows_imported ?? 0),
    contactsCreated: Number(summary.contacts_created ?? 0),
    contactsMerged: Number(summary.contacts_merged ?? 0),
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/admin-crm-import.ts
git commit -m "feat: add CRM import dry-run and commit data layer"
```

---

### Task 11: Contacts and merge data layer

**Files:**
- Create: `src/lib/data/admin-crm-contacts.ts`

**Interfaces:**
- Consumes: `scoreDuplicate`/`normalizeName` (Task 3), tables from Task 1
- Produces:
  - `listContacts(query): Promise<{ rows: ContactRow[]; total: number }>`
  - `getContactDetail(id: string): Promise<ContactDetail | null>`
  - `rebuildMergeCandidates(): Promise<number>`
  - `listMergeCandidates(): Promise<MergeCandidateRow[]>`
  - `resolveMergeCandidate(id, decision, userId): Promise<MutationResult>`

- [ ] **Step 1: Write the implementation**

Create `src/lib/data/admin-crm-contacts.ts`:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { scoreDuplicate, normalizeName } from "@/lib/crm/identity";

/**
 * Contacts read layer plus the duplicate review queue. Mirrors
 * admin-marketing.ts conventions: service-role client, discriminated-union
 * results, no throwing.
 */

export type MutationResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export type ContactRow = {
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  country: string | null;
  discoverySource: string;
  purchaseCount: number;
  unsubscribed: boolean;
};

export type ContactDetail = ContactRow & {
  profession: string | null;
  phoneRaw: string | null;
  hasPlatformAccount: boolean;
  purchases: Array<{
    id: string;
    productLabel: string;
    amount: number | null;
    currency: string | null;
    isEarlyBird: boolean;
    rowType: string;
    promoCode: string | null;
    sourceRowRef: string;
  }>;
};

export async function listContacts(query: { search?: string; limit: number; offset: number }): Promise<{ rows: ContactRow[]; total: number }> {
  const admin = createAdminSupabase();

  let q = admin
    .from("contacts")
    .select("id, full_name, email, phone_e164, country, discovery_source, email_unsubscribed_at, contact_purchases(count)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);

  if (query.search && query.search.trim() !== "") {
    const term = `%${query.search.trim()}%`;
    q = q.or(`full_name.ilike.${term},email.ilike.${term},phone_e164.ilike.${term}`);
  }

  const { data, count } = await q;

  const rows: ContactRow[] = (data ?? []).map((c) => ({
    id: c.id,
    fullName: c.full_name,
    email: c.email,
    phoneE164: c.phone_e164,
    country: c.country,
    discoverySource: c.discovery_source,
    // PostgREST returns an embedded count as [{count: n}].
    purchaseCount: Array.isArray(c.contact_purchases) ? (c.contact_purchases[0]?.count ?? 0) : 0,
    unsubscribed: c.email_unsubscribed_at !== null,
  }));

  return { rows, total: count ?? rows.length };
}

export async function getContactDetail(id: string): Promise<ContactDetail | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("contacts")
    .select("id, full_name, email, phone_e164, phone_raw, country, profession, discovery_source, email_unsubscribed_at, profile_id, contact_purchases(id, product_label, amount, currency, is_early_bird, row_type, promo_code, source_row_ref)")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const purchases = Array.isArray(data.contact_purchases) ? data.contact_purchases : [];

  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    phoneE164: data.phone_e164,
    phoneRaw: data.phone_raw,
    country: data.country,
    profession: data.profession,
    discoverySource: data.discovery_source,
    unsubscribed: data.email_unsubscribed_at !== null,
    hasPlatformAccount: data.profile_id !== null,
    purchaseCount: purchases.length,
    purchases: purchases.map((p) => ({
      id: p.id,
      productLabel: p.product_label,
      amount: p.amount === null ? null : Number(p.amount),
      currency: p.currency,
      isEarlyBird: p.is_early_bird,
      rowType: p.row_type,
      promoCode: p.promo_code,
      sourceRowRef: p.source_row_ref,
    })),
  };
}

/**
 * Rescans for probable duplicates and refreshes the pending review queue.
 *
 * Comparisons are bucketed by normalized name first. A naive all-pairs scan
 * over 3,000 contacts is 4.5 million comparisons; scoreDuplicate requires a
 * name match for every "review" verdict anyway, so bucketing by name loses
 * no candidates and reduces the work to a few comparisons per bucket.
 *
 * Only pending rows are cleared. A candidate a human already merged or
 * rejected stays resolved and is never resurfaced.
 */
export async function rebuildMergeCandidates(): Promise<number> {
  const admin = createAdminSupabase();

  const { data } = await admin.from("contacts").select("id, email, phone_e164, full_name");
  const contacts = data ?? [];

  const buckets = new Map<string, typeof contacts>();
  for (const c of contacts) {
    const key = normalizeName(c.full_name);
    if (key === "") continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(c);
    else buckets.set(key, [c]);
  }

  const { data: resolved } = await admin
    .from("merge_candidates")
    .select("contact_a_id, contact_b_id")
    .neq("status", "pending");
  const alreadyDecided = new Set((resolved ?? []).map((r) => [r.contact_a_id, r.contact_b_id].sort().join("|")));

  const found: Array<{ contact_a_id: string; contact_b_id: string; reason: string; confidence: number }> = [];

  // Array.from() around the Map iterator: this repo's tsconfig sets no
  // `target`, so a bare `for...of` over a Map/Set iterator fails tsc (TS2802).
  for (const bucket of Array.from(buckets.values())) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i];
        const b = bucket[j];
        const verdict = scoreDuplicate(
          { email: a.email, phoneE164: a.phone_e164, fullName: a.full_name },
          { email: b.email, phoneE164: b.phone_e164, fullName: b.full_name },
        );
        if (verdict.kind !== "review") continue;
        const [x, y] = [a.id, b.id].sort();
        if (alreadyDecided.has(`${x}|${y}`)) continue;
        found.push({ contact_a_id: x, contact_b_id: y, reason: verdict.reason, confidence: verdict.confidence });
      }
    }
  }

  await admin.from("merge_candidates").delete().eq("status", "pending");
  if (found.length > 0) await admin.from("merge_candidates").insert(found);

  return found.length;
}

export type MergeCandidateRow = {
  id: string;
  reason: string;
  confidence: number;
  a: ContactRow;
  b: ContactRow;
};

export async function listMergeCandidates(): Promise<MergeCandidateRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("merge_candidates")
    .select("id, reason, confidence, contact_a_id, contact_b_id")
    .eq("status", "pending")
    .order("confidence", { ascending: false });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = Array.from(new Set(rows.flatMap((r) => [r.contact_a_id, r.contact_b_id])));
  const { data: contacts } = await admin
    .from("contacts")
    .select("id, full_name, email, phone_e164, country, discovery_source, email_unsubscribed_at, contact_purchases(count)")
    .in("id", ids);

  const byId = new Map<string, ContactRow>();
  for (const c of contacts ?? []) {
    byId.set(c.id, {
      id: c.id,
      fullName: c.full_name,
      email: c.email,
      phoneE164: c.phone_e164,
      country: c.country,
      discoverySource: c.discovery_source,
      purchaseCount: Array.isArray(c.contact_purchases) ? (c.contact_purchases[0]?.count ?? 0) : 0,
      unsubscribed: c.email_unsubscribed_at !== null,
    });
  }

  return rows
    .map((r) => {
      const a = byId.get(r.contact_a_id);
      const b = byId.get(r.contact_b_id);
      if (!a || !b) return null;
      return { id: r.id, reason: r.reason, confidence: Number(r.confidence), a, b };
    })
    .filter((r): r is MergeCandidateRow => r !== null);
}

/**
 * Applies or dismisses one review-queue decision.
 *
 * On merge, the OLDER contact is canonical and the newer one's purchases are
 * reattached to it before it is deleted. Oldest-wins keeps the contact whose
 * id other rows are most likely to reference already.
 */
export async function resolveMergeCandidate(
  id: string,
  decision: "merge" | "reject",
  userId: string,
): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: candidate } = await admin
    .from("merge_candidates")
    .select("id, contact_a_id, contact_b_id")
    .eq("id", id)
    .maybeSingle();
  if (!candidate) return { ok: false, reason: "not-found" };

  if (decision === "merge") {
    const { data: pair } = await admin
      .from("contacts")
      .select("id, created_at, email, phone_e164, profession, country, profile_id")
      .in("id", [candidate.contact_a_id, candidate.contact_b_id])
      .order("created_at", { ascending: true });

    if (!pair || pair.length !== 2) return { ok: false, reason: "not-found" };
    const [keep, drop] = pair;

    // Fill the survivor's gaps from the record about to be deleted, so
    // merging never loses a field the duplicate happened to carry.
    const { error: updateError } = await admin
      .from("contacts")
      .update({
        email: keep.email ?? drop.email,
        phone_e164: keep.phone_e164 ?? drop.phone_e164,
        profession: keep.profession ?? drop.profession,
        country: keep.country ?? drop.country,
        profile_id: keep.profile_id ?? drop.profile_id,
      })
      .eq("id", keep.id);
    if (updateError) return { ok: false, reason: "db-error" };

    const { error: moveError } = await admin
      .from("contact_purchases")
      .update({ contact_id: keep.id })
      .eq("contact_id", drop.id);
    if (moveError) return { ok: false, reason: "db-error" };

    const { error: deleteError } = await admin.from("contacts").delete().eq("id", drop.id);
    if (deleteError) return { ok: false, reason: "db-error" };
  }

  const { error } = await admin
    .from("merge_candidates")
    .update({
      status: decision === "merge" ? "merged" : "rejected",
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq("id", id);

  return error ? { ok: false, reason: "db-error" } : { ok: true };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/admin-crm-contacts.ts
git commit -m "feat: add CRM contacts read layer and duplicate merge queue"
```

---

### Task 12: API routes for import, contacts, and merge

**Files:**
- Create: `src/app/api/admin/crm/sheets/route.ts`
- Create: `src/app/api/admin/crm/import/preview/route.ts`
- Create: `src/app/api/admin/crm/import/commit/route.ts`
- Create: `src/app/api/admin/crm/contacts/route.ts`
- Create: `src/app/api/admin/crm/merge/[id]/route.ts`

**Interfaces:**
- Consumes: everything from Tasks 8, 10, 11
- Produces: five admin-gated endpoints

- [ ] **Step 1: Write the sheets route**

Create `src/app/api/admin/crm/sheets/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSheetTabs, guessColumnMapping } from "@/lib/data/admin-crm-import";
import { sheetIdSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = sheetIdSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await getSheetTabs(parsed.data.sheetId);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 502 });

  // The guessed mapping ships with the tab list so the wizard can prefill
  // the mapping step without a second round trip.
  return NextResponse.json({
    sheetName: result.sheetName,
    tabs: result.tabs.map((t) => ({ ...t, guessedMapping: guessColumnMapping(t.headers) })),
  });
}
```

- [ ] **Step 2: Write the preview and commit routes**

Create `src/app/api/admin/crm/import/preview/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { previewImport } from "@/lib/data/admin-crm-import";
import { importPreviewSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = importPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await previewImport(parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 502 });

  return NextResponse.json(result.preview);
}
```

Create `src/app/api/admin/crm/import/commit/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { commitImport } from "@/lib/data/admin-crm-import";
import { rebuildMergeCandidates } from "@/lib/data/admin-crm-contacts";
import { importCommitSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = importCommitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await commitImport(auth.user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 500 });

  // Rescan for probable duplicates now that new rows exist. A failure here
  // must not fail the import — the rows are already committed, and the queue
  // can be rebuilt from the Merge Review tab at any time.
  let mergeCandidates = 0;
  try {
    mergeCandidates = await rebuildMergeCandidates();
  } catch (error) {
    console.error("[crm-import] merge candidate rebuild failed:", error);
  }

  return NextResponse.json({ ...result, mergeCandidates }, { status: 201 });
}
```

- [ ] **Step 3: Write the contacts and merge routes**

Create `src/app/api/admin/crm/contacts/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listContacts } from "@/lib/data/admin-crm-contacts";
import { contactListQuerySchema } from "@/lib/validations/crm";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const parsed = contactListQuerySchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  return NextResponse.json(await listContacts(parsed.data));
}
```

Create `src/app/api/admin/crm/merge/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveMergeCandidate } from "@/lib/data/admin-crm-contacts";
import { mergeResolveSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = mergeResolveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await resolveMergeCandidate(id, parsed.data.decision, auth.user.id);
  if (!result.ok) {
    const status = result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: "Could not resolve this duplicate" }, { status });
  }

  return NextResponse.json({ ok: true });
}
```

Note the `params: Promise<{ id: string }>` signature — this codebase is on an App Router version where dynamic route params are async. Confirm against `src/app/api/admin/banners/[id]/route.ts` and match whatever that file does.

- [ ] **Step 4: Verify it compiles and lints**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean.

Run: `node_modules/.bin/next lint`
Expected: clean except the pre-existing `<img>` warnings in `FeedbackClient.tsx` and `ReviewClient.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/crm
git commit -m "feat: add CRM admin API routes for import, contacts, and merge"
```

---

### Task 13: CRM page shell, tabs, and sidebar link

**Files:**
- Create: `src/app/dashboard/admin/crm/page.tsx`
- Modify: `src/components/dashboard/Sidebar.tsx:39` — add a CRM entry after Marketing

**Interfaces:**
- Consumes: `listContacts`, `listMergeCandidates` (Task 11)
- Produces: `/dashboard/admin/crm?tab=contacts|import|merge`, rendering `ContactsPanel`, `ImportWizard`, `MergeReviewPanel`

- [ ] **Step 1: Check Stitch for an existing screen**

**Required by CLAUDE.md before any UI is written.** Run:

```
mcp__stitch__list_screens with projectId "11811490301995978699"
```

Search the returned titles for a CRM, contacts, or import screen. Known relevant entries: `Admin: Marketing CMS (Clinical Precision)`, `Admin: Marketing CMS (Modern Immersive)`, `Admin: Marketing CMS (Task-Focused Utility)`, `Admin: Student Directory (Modern Academic)`, `Admin: High-Density Dashboard`.

- If a CRM/contacts/import screen exists, fetch its `htmlCode.downloadUrl` and port the layout exhaustively — every section, no simplification.
- If none exists, `Admin: Student Directory (Modern Academic)` is the closest analogue for the contacts table and should be used as the layout reference.
- **If nothing usable exists, stop and hand the user a `generate_screen_from_text` prompt to run themselves.** Do not improvise a design, and do not call `generate_screen_from_text` directly — it has repeatedly timed out on this account.

- [ ] **Step 2: Write the page shell**

Create `src/app/dashboard/admin/crm/page.tsx`, following the tab pattern in `src/app/dashboard/admin/marketing/page.tsx:1-59` exactly:

```tsx
import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listContacts, listMergeCandidates } from "@/lib/data/admin-crm-contacts";
import { ContactsPanel } from "@/components/admin/crm/ContactsPanel";
import { ImportWizard } from "@/components/admin/crm/ImportWizard";
import { MergeReviewPanel } from "@/components/admin/crm/MergeReviewPanel";

export const metadata = { title: "CRM — PZ Academy" };

type Tab = "contacts" | "import" | "merge";

function parseTab(value: string | undefined): Tab {
  if (value === "import") return "import";
  if (value === "merge") return "merge";
  return "contacts";
}

const TAB_CLASS = (active: boolean) =>
  `px-5 py-2 rounded-full font-headline text-sm transition-all ${
    active
      ? "bg-pz-primary-container text-pz-on-primary-container font-semibold"
      : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium"
  }`;

export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminPage();
  const { tab: tabParam } = await searchParams;
  const tab = parseTab(tabParam);

  const [contacts, mergeCandidates] = await Promise.all([
    listContacts({ limit: 50, offset: 0 }),
    listMergeCandidates(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">CRM</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Import past buyers from Google Sheets, resolve duplicates, and see purchase history.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link href="/dashboard/admin/crm?tab=contacts" className={TAB_CLASS(tab === "contacts")}>
          Contacts <span className="ml-2 tabular-nums">{contacts.total}</span>
        </Link>
        <Link href="/dashboard/admin/crm?tab=import" className={TAB_CLASS(tab === "import")}>
          Import
        </Link>
        <Link href="/dashboard/admin/crm?tab=merge" className={TAB_CLASS(tab === "merge")}>
          Merge Review <span className="ml-2 tabular-nums">{mergeCandidates.length}</span>
        </Link>
      </div>

      {tab === "contacts" && <ContactsPanel initialRows={contacts.rows} initialTotal={contacts.total} />}
      {tab === "import" && <ImportWizard />}
      {tab === "merge" && <MergeReviewPanel initialCandidates={mergeCandidates} />}
    </div>
  );
}
```

- [ ] **Step 3: Add the sidebar link**

In `src/components/dashboard/Sidebar.tsx`, add `Contact` to the existing `lucide-react` import, then insert one entry directly after the Marketing line (`src/components/dashboard/Sidebar.tsx:39`):

```tsx
  { label: "CRM", href: "/dashboard/admin/crm", icon: Contact, roles: ["admin", "super_admin"] },
```

- [ ] **Step 4: Verify the page loads**

Check whether a dev server is already running — it does **not** survive across sessions:

```bash
netstat -ano | grep LISTENING | grep :3945
```

If nothing is listening, start one: `node_modules/.bin/next dev -p 3945`

Sign in as `pharmacozymeofficial@gmail.com` / `pzadmin123` (lowercase), then visit `http://localhost:3945/dashboard/admin/crm`.

Expected: the page renders with three tabs, Contacts shows `0`, and "CRM" appears in the sidebar.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/admin/crm/page.tsx src/components/dashboard/Sidebar.tsx
git commit -m "feat: add CRM admin page shell and sidebar link"
```

---

### Task 14: Import wizard UI

**Files:**
- Create: `src/components/admin/crm/ImportWizard.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/crm/sheets`, `/import/preview`, `/import/commit` (Task 12)
- Produces: `<ImportWizard />`

⚠️ **Known trap, learned the hard way in Phase 7:** `router.refresh()` alone does **not** resync a mounted client component's own `useState`. A toast saying "imported" while the list stays stale is the exact bug that shipped in `BannersPanel` and had to be fixed. Every mutation here updates local state directly.

- [ ] **Step 1: Write the component**

Create `src/components/admin/crm/ImportWizard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnMappingInput } from "@/lib/validations/crm";

type Tab = { name: string; headers: string[]; rowCount: number; guessedMapping: ColumnMappingInput };

type Preview = {
  rowsTotal: number;
  rowsImportable: number;
  rowsSkipped: number;
  contactsNew: number;
  contactsExisting: number;
  phoneFailures: number;
  productLabels: string[];
  samples: Array<{ rowRef: string; name: string; email: string | null; phone: string | null; product: string; rowType: string }>;
};

const FIELDS: Array<{ key: keyof ColumnMappingInput; label: string }> = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "WhatsApp / Phone" },
  { key: "profession", label: "Profession" },
  { key: "discovery", label: "Discovery source" },
  { key: "product", label: "Registration option" },
  { key: "rowType", label: "Row type" },
  { key: "promoCode", label: "Promo code" },
];

export function ImportWizard() {
  const router = useRouter();
  const [sheetInput, setSheetInput] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMappingInput | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const activeTab = tabs.find((t) => t.name === selectedTab) ?? null;

  async function loadTabs() {
    setBusy(true);
    setError(null);
    setPreview(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/crm/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: sheetInput }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read that sheet.");
      setTabs(json.tabs);
      setSheetName(json.sheetName ?? "");
      setSelectedTab(null);
      setMapping(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that sheet.");
    } finally {
      setBusy(false);
    }
  }

  function chooseTab(tab: Tab) {
    // Prefill from the server's guess, which the admin can then correct.
    setSelectedTab(tab.name);
    setMapping(tab.guessedMapping);
    setPreview(null);
    setDone(null);
  }

  async function runPreview() {
    if (!mapping || !selectedTab) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: sheetInput, tabName: selectedTab, mapping }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Preview failed.");
      setPreview(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!mapping || !selectedTab) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/crm/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: sheetInput, tabName: selectedTab, mapping, sheetName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed.");
      setDone(
        `Imported ${json.rowsImported} rows — ${json.contactsCreated} new contacts, ${json.contactsMerged} matched existing. ${json.mergeCandidates} possible duplicates queued for review.`,
      );
      setPreview(null);
      // refresh() updates the server-rendered tab counts above this
      // component; the local `done` banner is what tells the admin the
      // import worked, because refresh() cannot reach this component's state.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Step 1 — sheet */}
      <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
        <h2 className="font-headline font-semibold text-pz-secondary">1. Choose a sheet</h2>
        <div className="flex gap-2 flex-wrap">
          <input
            value={sheetInput}
            onChange={(e) => setSheetInput(e.target.value)}
            placeholder="Paste the Google Sheets URL"
            className="flex-1 min-w-[280px] rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
          />
          <button
            onClick={loadTabs}
            disabled={busy || sheetInput.trim() === ""}
            className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Reading…" : "Read sheet"}
          </button>
        </div>
        {sheetName && <p className="font-body text-xs text-pz-on-surface-variant">Opened: {sheetName}</p>}
      </section>

      {/* Step 2 — tab */}
      {tabs.length > 0 && (
        <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
          <h2 className="font-headline font-semibold text-pz-secondary">2. Choose a tab</h2>
          <div className="flex gap-2 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.name}
                onClick={() => chooseTab(tab)}
                className={`px-4 py-2 rounded-full font-body text-sm ${selectedTab === tab.name ? "bg-pz-primary-container text-pz-on-primary-container font-semibold" : "bg-pz-surface-variant text-pz-on-surface-variant"}`}
              >
                {tab.name} <span className="tabular-nums opacity-70">({tab.rowCount})</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 3 — mapping */}
      {activeTab && mapping && (
        <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
          <h2 className="font-headline font-semibold text-pz-secondary">3. Map the columns</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="font-body text-sm">
                <span className="block text-pz-on-surface-variant mb-1">{field.label}</span>
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [field.key]: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-pz-outline-variant px-3 py-2"
                >
                  <option value="">— not mapped —</option>
                  {activeTab.headers.map((header, index) => (
                    <option key={`${header}-${index}`} value={index}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            onClick={runPreview}
            disabled={busy}
            className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Checking…" : "Preview import"}
          </button>
        </section>
      )}

      {/* Step 4 — dry run */}
      {preview && (
        <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-4">
          <h2 className="font-headline font-semibold text-pz-secondary">4. Dry run — nothing has been saved yet</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-body text-sm">
            <Stat label="Rows in tab" value={preview.rowsTotal} />
            <Stat label="Importable" value={preview.rowsImportable} />
            <Stat label="Skipped (no email or phone)" value={preview.rowsSkipped} />
            <Stat label="New contacts" value={preview.contactsNew} />
            <Stat label="Already known" value={preview.contactsExisting} />
            <Stat label="Phone needs review" value={preview.phoneFailures} />
          </div>

          {preview.productLabels.length > 0 && (
            <div>
              <p className="font-body text-xs text-pz-on-surface-variant mb-1">Product labels found:</p>
              <p className="font-body text-sm">{preview.productLabels.join(" · ")}</p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-sm">
              <thead className="text-pz-on-surface-variant text-xs uppercase">
                <tr><th className="py-2">Row</th><th>Name</th><th>Email</th><th>Phone</th><th>Product</th><th>Type</th></tr>
              </thead>
              <tbody>
                {preview.samples.map((s) => (
                  <tr key={s.rowRef} className="border-t border-pz-outline-variant">
                    <td className="py-2 tabular-nums">{s.rowRef}</td>
                    <td>{s.name}</td>
                    <td>{s.email ?? "—"}</td>
                    <td className={s.phone ? "" : "text-pz-danger"}>{s.phone ?? "needs review"}</td>
                    <td>{s.product || "—"}</td>
                    <td>{s.rowType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={commit}
            disabled={busy || preview.rowsImportable === 0}
            className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Importing…" : `Import ${preview.rowsImportable} rows`}
          </button>
        </section>
      )}

      {error && <p className="font-body text-sm text-pz-danger">{error}</p>}
      {done && <p className="font-body text-sm text-pz-primary">{done}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-pz-surface rounded-xl px-3 py-2">
      <p className="text-xs text-pz-on-surface-variant">{label}</p>
      <p className="font-headline font-bold text-lg tabular-nums">{value}</p>
    </div>
  );
}
```

If any `pz-*` token used above does not exist in `tailwind.config.ts`, substitute the nearest one already used by `src/components/admin/marketing/BannersPanel.tsx`. Do not invent new tokens.

- [ ] **Step 2: Verify it compiles and lints**

Run: `node_modules/.bin/tsc --noEmit` → clean
Run: `node_modules/.bin/next lint` → clean except the pre-existing `<img>` warnings

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/crm/ImportWizard.tsx
git commit -m "feat: add CRM sheet import wizard with dry-run preview"
```

---

### Task 15: Contacts panel and merge review panel

**Files:**
- Create: `src/components/admin/crm/ContactsPanel.tsx`
- Create: `src/components/admin/crm/MergeReviewPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/crm/contacts`, `POST /api/admin/crm/merge/[id]` (Task 12); `ContactRow`, `MergeCandidateRow` (Task 11)
- Produces: `<ContactsPanel initialRows initialTotal />`, `<MergeReviewPanel initialCandidates />`

- [ ] **Step 1: Write ContactsPanel**

Create `src/components/admin/crm/ContactsPanel.tsx`:

```tsx
"use client";

import { useState } from "react";

type ContactRow = {
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  country: string | null;
  discoverySource: string;
  purchaseCount: number;
  unsubscribed: boolean;
};

export function ContactsPanel({ initialRows, initialTotal }: { initialRows: ContactRow[]; initialTotal: number }) {
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  async function runSearch() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/crm/contacts?search=${encodeURIComponent(search)}&limit=50&offset=0`);
      if (!res.ok) return;
      const json = await res.json();
      // Local state update, not router.refresh() — refresh() cannot reach a
      // mounted client component's own useState.
      setRows(json.rows);
      setTotal(json.total);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
          placeholder="Search name, email, or phone"
          className="flex-1 min-w-[240px] rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
        />
        <button
          onClick={runSearch}
          disabled={busy}
          className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      <p className="font-body text-xs text-pz-on-surface-variant">
        Showing {rows.length} of {total} contacts
      </p>

      {rows.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">
          No contacts yet. Use the Import tab to bring in a cohort sheet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body text-sm">
            <thead className="text-pz-on-surface-variant text-xs uppercase">
              <tr><th className="py-2">Name</th><th>Email</th><th>Phone</th><th>Country</th><th>Source</th><th>Purchases</th></tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-pz-outline-variant">
                  <td className="py-2">
                    {c.fullName || "—"}
                    {c.unsubscribed && <span className="ml-2 text-xs text-pz-danger">unsubscribed</span>}
                  </td>
                  <td>{c.email ?? "—"}</td>
                  <td className={c.phoneE164 ? "" : "text-pz-danger"}>{c.phoneE164 ?? "needs review"}</td>
                  <td>{c.country ?? "—"}</td>
                  <td>{c.discoverySource}</td>
                  <td className="tabular-nums">{c.purchaseCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write MergeReviewPanel**

Create `src/components/admin/crm/MergeReviewPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ContactRow = {
  id: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  country: string | null;
  discoverySource: string;
  purchaseCount: number;
  unsubscribed: boolean;
};

type Candidate = { id: string; reason: string; confidence: number; a: ContactRow; b: ContactRow };

export function MergeReviewPanel({ initialCandidates }: { initialCandidates: Candidate[] }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState(initialCandidates);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string, decision: "merge" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/crm/merge/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Could not resolve this duplicate.");
      }
      // Drop it from local state immediately. router.refresh() alone would
      // leave the resolved card on screen until a hard navigation.
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve this duplicate.");
    } finally {
      setBusyId(null);
    }
  }

  if (candidates.length === 0) {
    return <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">No duplicates waiting for review.</p>;
  }

  return (
    <div className="space-y-4">
      {error && <p className="font-body text-sm text-pz-danger">{error}</p>}

      {candidates.map((c) => (
        <div key={c.id} className="bg-pz-surface-container-high rounded-2xl p-5 space-y-3">
          <p className="font-body text-xs text-pz-on-surface-variant">
            {c.reason} · confidence {Math.round(c.confidence * 100)}%
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <ContactCard contact={c.a} label="Keeps purchases (older)" />
            <ContactCard contact={c.b} label="Will be removed" />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => resolve(c.id, "merge")}
              disabled={busyId === c.id}
              className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
            >
              {busyId === c.id ? "Merging…" : "Merge"}
            </button>
            <button
              onClick={() => resolve(c.id, "reject")}
              disabled={busyId === c.id}
              className="px-5 py-2 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-sm font-medium disabled:opacity-50"
            >
              Different people
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContactCard({ contact, label }: { contact: ContactRow; label: string }) {
  return (
    <div className="bg-pz-surface rounded-xl p-3 font-body text-sm">
      <p className="text-xs text-pz-on-surface-variant mb-1">{label}</p>
      <p className="font-semibold">{contact.fullName || "—"}</p>
      <p>{contact.email ?? "no email"}</p>
      <p>{contact.phoneE164 ?? "no phone"}</p>
      <p className="text-xs text-pz-on-surface-variant mt-1 tabular-nums">{contact.purchaseCount} purchases</p>
    </div>
  );
}
```

Note: the panel labels contact `a` as the older one because `resolveMergeCandidate` orders the pair by `created_at` ascending and keeps the first. The label and the behaviour must not drift apart — if that ordering ever changes, this label changes with it.

- [ ] **Step 3: Add the contact detail route and wire it into the table**

`getContactDetail` (Task 11) exposes purchase history per contact, which the spec lists as a required surface. Without this step it would be dead code.

Create `src/app/api/admin/crm/contacts/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getContactDetail } from "@/lib/data/admin-crm-contacts";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const detail = await getContactDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(detail);
}
```

Then in `ContactsPanel.tsx`, add expandable detail. Inside the component, add state and a loader:

```tsx
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  async function toggleDetail(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    const res = await fetch(`/api/admin/crm/contacts/${id}`);
    if (res.ok) setDetail(await res.json());
  }
```

Make the name cell a button (`<button onClick={() => toggleDetail(c.id)} className="text-left underline">`), and render a detail row directly after each contact row:

```tsx
{openId === c.id && (
  <tr className="border-t border-pz-outline-variant bg-pz-surface">
    <td colSpan={6} className="p-4">
      {detail === null ? (
        <p className="font-body text-xs text-pz-on-surface-variant">Loading…</p>
      ) : (
        <div className="space-y-1 font-body text-xs">
          <p>Profession: {String(detail.profession ?? "—")} · Raw phone: {String(detail.phoneRaw ?? "—")} · Platform account: {detail.hasPlatformAccount ? "yes" : "no"}</p>
          {(detail.purchases as Array<Record<string, unknown>>).map((p) => (
            <p key={String(p.id)}>
              {String(p.productLabel) || "—"} · {p.amount === null ? "—" : `${String(p.currency ?? "")} ${String(p.amount)}`}
              {p.isEarlyBird ? " · early bird" : ""} · {String(p.rowType)}
              {p.promoCode ? ` · promo ${String(p.promoCode)}` : ""} · {String(p.sourceRowRef)}
            </p>
          ))}
        </div>
      )}
    </td>
  </tr>
)}
```

Wrapping each contact row and its detail row in a `<tbody>` per contact, or returning a fragment keyed by contact id, both work — pick whichever keeps React's key warnings quiet.

- [ ] **Step 4: Verify it compiles and lints**

Run: `node_modules/.bin/tsc --noEmit` → clean
Run: `node_modules/.bin/next lint` → clean except pre-existing `<img>` warnings
Run: `node_modules/.bin/vitest run` → all pass

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/crm/ContactsPanel.tsx src/components/admin/crm/MergeReviewPanel.tsx src/app/api/admin/crm/contacts
git commit -m "feat: add CRM contacts table, detail view, and merge review UI"
```

---

### Task 16: Phase 1a checkpoint — import the real sheets

Not a coding task. This is where the phase is proven, and it is not optional: Phase 7 shipped with clean `tsc`, `lint`, and `vitest` and still contained three real bugs that only clicking through revealed.

**Files:** none

- [ ] **Step 1: Start a clean dev server**

```bash
netstat -ano | grep LISTENING | grep :3945
```

If a PID is listening, kill that specific PID. Then:

```bash
rm -rf .next
node_modules/.bin/next dev -p 3945
```

Never run `next build` while this is up.

- [ ] **Step 2: Import one sheet end to end**

Sign in as `pharmacozymeofficial@gmail.com` / `pzadmin123` at `http://localhost:3945/dashboard/admin/crm?tab=import`.

Paste the MDC3 Master Sheet URL → Read sheet → pick `Form Responses 1` → confirm the guessed mapping → Preview.

Verify against the sheet by eye:
- `Rows in tab` matches the sheet's actual row count
- The sample table shows real names, and phone numbers appear in `+92…` form
- `Phone needs review` is a small number, not most of the sheet

Then Import, and confirm the success banner reports sensible counts.

- [ ] **Step 3: Cross-check against Postgres directly, not just the UI**

Using the Supabase MCP `execute_sql` against project `whqdasotjlhvrjmgiffk`:

```sql
select count(*) as contacts from public.contacts;
select count(*) as purchases from public.contact_purchases;
select phone_e164, phone_raw, full_name from public.contacts where phone_e164 is null limit 20;
select row_type, count(*) from public.contact_purchases group by row_type;
```

Expected: counts match the import banner; the null-phone rows are genuinely ambiguous values (`N/A`, two numbers in a cell), not numbers the rules should have handled. **If a format appears that `normalizePhone` should have caught, stop and add it as a test case in Task 2 before importing further sheets** — fixing the rule after 25 imports means re-importing all of them.

- [ ] **Step 4: Verify re-import is idempotent**

Import the exact same sheet and tab again. Then:

```sql
select count(*) from public.contact_purchases;
```

Expected: unchanged. The success banner should report `contactsCreated: 0` and every row as merged.

- [ ] **Step 5: Import the remaining sheets**

Repeat Step 2 for each of the ~25 cohort sheets. Where a sheet corresponds to a real `courses` row, set the course dropdown; otherwise leave it unset.

After each import, note the "possible duplicates queued" number.

- [ ] **Step 6: Work the merge review queue**

Go to `?tab=merge`. For each candidate, decide merge or "different people". Repeat until empty.

- [ ] **Step 7: Confirm the consolidated result**

```sql
select count(*) from public.contacts;
select count(*) from public.contacts where phone_e164 is not null;
select count(*) from public.contacts where email is not null;

-- Repeat buyers: the whole point of consolidating across sheets.
select c.full_name, count(p.id) as purchases
from public.contacts c
join public.contact_purchases p on p.contact_id = c.id
group by c.id, c.full_name
having count(p.id) > 1
order by purchases desc
limit 20;

-- Group leaders: the highest-value segment, already labelled in the sheets.
select count(distinct contact_id) from public.contact_purchases where row_type = 'group_leader';
```

Expected: total contacts is meaningfully below the sum of all sheet rows (that difference *is* the repeat-buyer population), and the repeat-buyer query returns real people.

- [ ] **Step 8: Report the checkpoint to the user**

State plainly: sheets imported, contacts created, duplicates merged, phone numbers still unresolved, repeat buyers found, group leaders found. Phase 1a is a standalone deliverable — confirm the user wants to continue to 1b before starting it.

---

# Phase 1b — Send to it

**Phase checkpoint:** one real segmented broadcast delivered to a warm-up wave, with opens and clicks visible. Depends on Phase 1a's data; do not start until Task 16 is signed off.

---

### Task 17: Migration 0049 — segment source and campaign stats views

Segment evaluation reads one pre-aggregated view rather than joining at query time. Aggregation happens in Postgres (the precedent set by the mentor review stats fix), and filtering becomes plain PostgREST predicates driven by a pure, unit-tested function — no dynamic SQL anywhere.

**Files:**
- Create: `supabase/migrations/0049_crm_segments.sql`

**Interfaces:**
- Consumes: tables from Task 1
- Produces: views `crm_contact_segment_source`, `crm_campaign_stats`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0049_crm_segments.sql`:

```sql
-- ============================================================
-- Migration 0049: CRM segment source + campaign stats
-- Run AFTER 0048. SQL Editor → New query → Run
-- ============================================================
-- Two views. No dynamic SQL: segment filters are applied by PostgREST over
-- crm_contact_segment_source, built by a pure TypeScript function that is
-- unit-tested. A jsonb-driven plpgsql query builder would be injection-prone
-- and effectively untestable, and buys nothing at 3,000 rows.

-- ─── 1. Segment source ───────────────────────────────────────
-- One row per contact, with purchase history flattened into arrays that
-- PostgREST can filter with `overlaps` / `contains`, plus a concatenated
-- product label string for substring matching.
--
-- is_sendable folds the three hard exclusions into one column so a segment
-- query cannot forget any of them: no email, unsubscribed, or a Brevo
-- suppression event on that address.
create or replace view public.crm_contact_segment_source
with (security_invoker = true)
as
select
  c.id,
  c.full_name,
  c.email,
  c.phone_e164,
  c.country,
  c.profession,
  c.discovery_source,
  c.consent_basis,
  c.unsubscribe_token,
  c.created_at,
  c.profile_id is not null                          as has_platform_account,
  coalesce(p.purchase_count, 0)                     as purchase_count,
  p.first_purchase_at,
  p.last_purchase_at,
  coalesce(p.product_labels, array[]::text[])       as product_labels,
  coalesce(p.product_labels_text, '')               as product_labels_text,
  coalesce(p.row_types, array[]::text[])            as row_types,
  coalesce(p.course_ids, array[]::uuid[])           as course_ids,
  coalesce(p.import_batch_ids, array[]::uuid[])     as import_batch_ids,
  coalesce(p.promo_codes, array[]::text[])          as promo_codes,
  coalesce(p.total_pkr, 0)                          as total_pkr,
  (
    c.email is not null
    and c.email_unsubscribed_at is null
    -- Every slice-1 contact is 'purchase'. Slice 2's capture surfaces will
    -- introduce 'enquiry' contacts, and the spec requires those never
    -- receive a campaign BY DEFAULT. Guarding here rather than later means
    -- the safe behaviour is the one already in place when those rows first
    -- appear; slice 2 relaxes it deliberately or not at all.
    and c.consent_basis = 'purchase'
    and not exists (
      select 1 from public.email_metrics m
      where m.user_email = c.email
        -- Brevo's raw event strings, stored verbatim by
        -- supabase/functions/brevo-webhook-handler. Verify these against
        -- `select distinct event_type from email_metrics` on first run —
        -- a value mismatch here silently disables suppression.
        and m.event_type in ('hard_bounce', 'blocked', 'spam', 'invalid_email', 'unsubscribed')
    )
  ) as is_sendable
from public.contacts c
left join lateral (
  select
    count(*)                                              as purchase_count,
    min(cp.purchased_at)                                  as first_purchase_at,
    max(coalesce(cp.purchased_at, cp.created_at))         as last_purchase_at,
    array_agg(distinct cp.product_label)
      filter (where cp.product_label <> '')               as product_labels,
    string_agg(distinct cp.product_label, ' | ')
      filter (where cp.product_label <> '')               as product_labels_text,
    array_agg(distinct cp.row_type::text)                 as row_types,
    array_agg(distinct cp.course_id)
      filter (where cp.course_id is not null)             as course_ids,
    array_agg(distinct cp.import_batch_id)
      filter (where cp.import_batch_id is not null)       as import_batch_ids,
    array_agg(distinct cp.promo_code)
      filter (where cp.promo_code is not null)            as promo_codes,
    -- Lifetime value in PKR only. AED and SAR rows are deliberately excluded
    -- rather than converted at a hardcoded rate that would silently rot.
    sum(cp.amount) filter (where cp.currency = 'PKR')     as total_pkr
  from public.contact_purchases cp
  where cp.contact_id = c.id
) p on true;

-- ─── 2. Campaign stats ───────────────────────────────────────
-- Per-campaign delivery funnel, joined out of tables that already exist.
-- This is the payoff for reusing email_queue instead of writing a second
-- sender: opens and clicks come free.
create or replace view public.crm_campaign_stats
with (security_invoker = true)
as
select
  ca.id                                                          as campaign_id,
  ca.name,
  ca.status,
  ca.created_at,
  ca.completed_at,
  count(cr.id)                                                   as recipients,
  count(cr.id) filter (where q.status = 'sent')                  as sent,
  count(cr.id) filter (where q.status = 'failed')                as failed,
  count(distinct m.user_email) filter (where m.event_type = 'delivered')                          as delivered,
  count(distinct m.user_email) filter (where m.event_type in ('opened', 'unique_opened'))         as opened,
  count(distinct m.user_email) filter (where m.event_type = 'click')                              as clicked,
  count(distinct m.user_email) filter (where m.event_type in ('hard_bounce', 'soft_bounce'))      as bounced
from public.campaigns ca
left join public.campaign_recipients cr on cr.campaign_id = ca.id
left join public.email_queue q          on q.id = cr.email_queue_id
left join public.email_metrics m        on m.email_queue_id = cr.email_queue_id
group by ca.id, ca.name, ca.status, ca.created_at, ca.completed_at;

-- Views inherit RLS from their base tables under security_invoker, and every
-- CRM base table is service-role only. Revoked explicitly so a future policy
-- change on contacts cannot accidentally expose these.
revoke all on public.crm_contact_segment_source from anon, authenticated;
revoke all on public.crm_campaign_stats          from anon, authenticated;
```

- [ ] **Step 2: Apply the migration**

Supabase SQL Editor → New query → paste → Run.
Expected: `Success. No rows returned`.

- [ ] **Step 3: Verify the views return sensible data**

```sql
select count(*) from public.crm_contact_segment_source;
select count(*) from public.crm_contact_segment_source where is_sendable;
select id, full_name, purchase_count, row_types, product_labels_text
from public.crm_contact_segment_source
where purchase_count > 1
limit 5;
```

Expected: the first count equals `select count(*) from contacts`; the repeat-buyer rows show more than one product label.

- [ ] **Step 4: Confirm the Brevo event vocabulary matches**

```sql
select distinct event_type from public.email_metrics;
```

Compare against the suppression list in the view (`hard_bounce`, `blocked`, `spam`, `invalid_email`, `unsubscribed`). **If the real values differ** (for example `hardBounce` in camelCase), edit the view's `in (...)` list to match and re-run the migration. A silent mismatch here means suppression never fires and the sending domain takes the damage.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0049_crm_segments.sql
git commit -m "feat: add CRM segment source and campaign stats views (migration 0049)"
```

---

### Task 18: `buildSegmentFilters` — pure function

**Files:**
- Create: `src/lib/crm/segment.ts`
- Test: `tests/crm-segment.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `buildSegmentFilters(filters: SegmentFilter[]): QueryOp[]`, plus the `SegmentFilter` and `QueryOp` types and `SEGMENT_FIELDS`

- [ ] **Step 1: Write the failing test**

Create `tests/crm-segment.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSegmentFilters, type SegmentFilter } from "@/lib/crm/segment";

const SENDABLE_GUARD = { kind: "eq", column: "is_sendable", value: true };

describe("buildSegmentFilters", () => {
  it("always appends the sendable guard, even for an empty segment", () => {
    // The single most important behaviour here. An admin must not be able to
    // construct a segment that includes unsubscribed or bounced addresses.
    expect(buildSegmentFilters([])).toEqual([SENDABLE_GUARD]);
  });

  it("keeps the sendable guard when other filters are present", () => {
    const ops = buildSegmentFilters([{ field: "country", op: "in", values: ["PK"] }]);
    expect(ops).toContainEqual(SENDABLE_GUARD);
  });

  it("maps row_type to an array containment check", () => {
    // row_types is an aggregated array on the view, so "is a group leader"
    // is containment, not equality.
    expect(buildSegmentFilters([{ field: "row_type", op: "eq", value: "group_leader" }])).toEqual([
      { kind: "contains", column: "row_types", values: ["group_leader"] },
      SENDABLE_GUARD,
    ]);
  });

  it("maps import_batch_id to an array overlap check", () => {
    expect(buildSegmentFilters([{ field: "import_batch_id", op: "in", values: ["b1", "b2"] }])).toEqual([
      { kind: "overlaps", column: "import_batch_ids", values: ["b1", "b2"] },
      SENDABLE_GUARD,
    ]);
  });

  it("maps product_label to a case-insensitive substring match", () => {
    expect(buildSegmentFilters([{ field: "product_label", op: "contains", value: "Early Bird" }])).toEqual([
      { kind: "ilike", column: "product_labels_text", pattern: "%Early Bird%" },
      SENDABLE_GUARD,
    ]);
  });

  it("maps scalar contact fields directly", () => {
    expect(buildSegmentFilters([{ field: "discovery_source", op: "in", values: ["instagram", "facebook"] }])).toEqual([
      { kind: "in", column: "discovery_source", values: ["instagram", "facebook"] },
      SENDABLE_GUARD,
    ]);
    expect(buildSegmentFilters([{ field: "has_platform_account", op: "eq", value: false }])).toEqual([
      { kind: "eq", column: "has_platform_account", value: false },
      SENDABLE_GUARD,
    ]);
  });

  it("maps purchase_count comparisons", () => {
    expect(buildSegmentFilters([{ field: "purchase_count", op: "gte", value: 2 }])).toEqual([
      { kind: "gte", column: "purchase_count", value: 2 },
      SENDABLE_GUARD,
    ]);
  });

  it("maps last_purchase_at before/after to lt/gt", () => {
    expect(buildSegmentFilters([{ field: "last_purchase_at", op: "before", value: "2026-03-01" }])).toEqual([
      { kind: "lt", column: "last_purchase_at", value: "2026-03-01" },
      SENDABLE_GUARD,
    ]);
    expect(buildSegmentFilters([{ field: "last_purchase_at", op: "after", value: "2026-03-01" }])).toEqual([
      { kind: "gt", column: "last_purchase_at", value: "2026-03-01" },
      SENDABLE_GUARD,
    ]);
  });

  it("combines several filters and still guards once", () => {
    const filters: SegmentFilter[] = [
      { field: "row_type", op: "eq", value: "group_leader" },
      { field: "purchase_count", op: "gte", value: 2 },
      { field: "country", op: "in", values: ["PK"] },
    ];
    const ops = buildSegmentFilters(filters);
    expect(ops).toHaveLength(4);
    expect(ops.filter((o) => o.column === "is_sendable")).toHaveLength(1);
  });

  it("drops an empty values list rather than producing a match-nothing query", () => {
    // An unfinished filter in the builder UI must not silently empty the
    // whole segment.
    expect(buildSegmentFilters([{ field: "country", op: "in", values: [] }])).toEqual([SENDABLE_GUARD]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run tests/crm-segment.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/crm/segment.ts`:

```ts
/**
 * Segment definition and its translation into PostgREST predicates over
 * crm_contact_segment_source. Pure — no I/O, no database, safe to import
 * from client components.
 *
 * Filters combine with AND only. Nested boolean logic is deliberately
 * excluded: it is what turns a segment builder into its own project, and
 * nothing in the first campaigns needs it.
 */

export type SegmentFilter =
  | { field: "import_batch_id"; op: "in"; values: string[] }
  | { field: "course_id"; op: "in"; values: string[] }
  | { field: "row_type"; op: "eq"; value: string }
  | { field: "product_label"; op: "contains"; value: string }
  | { field: "promo_code"; op: "eq"; value: string }
  | { field: "discovery_source"; op: "in"; values: string[] }
  | { field: "country"; op: "in"; values: string[] }
  | { field: "profession"; op: "contains"; value: string }
  | { field: "purchase_count"; op: "gte" | "lte"; value: number }
  | { field: "last_purchase_at"; op: "before" | "after"; value: string }
  | { field: "has_platform_account"; op: "eq"; value: boolean };

export type QueryOp =
  | { kind: "overlaps"; column: string; values: string[] }
  | { kind: "contains"; column: string; values: string[] }
  | { kind: "in"; column: string; values: string[] }
  | { kind: "ilike"; column: string; pattern: string }
  | { kind: "eq" | "gte" | "lte" | "lt" | "gt"; column: string; value: string | number | boolean };

/** Field metadata for the builder UI. Keeping it beside the type prevents drift. */
export const SEGMENT_FIELDS: ReadonlyArray<{ field: SegmentFilter["field"]; label: string; hint: string }> = [
  { field: "row_type", label: "Row type", hint: "group_leader finds people who recruited other buyers" },
  { field: "purchase_count", label: "Number of purchases", hint: "2 or more finds proven repeat buyers" },
  { field: "last_purchase_at", label: "Last purchase", hint: "before a date finds win-back candidates" },
  { field: "has_platform_account", label: "Has platform account", hint: "false finds buyers still only in a spreadsheet" },
  { field: "discovery_source", label: "Discovery source", hint: "match creative to the channel that acquired them" },
  { field: "country", label: "Country", hint: "PK, AE, SA" },
  { field: "product_label", label: "Product label contains", hint: "substring of the registration option" },
  { field: "import_batch_id", label: "Import batch", hint: "one cohort sheet — also how warm-up waves are cut" },
  { field: "course_id", label: "Course", hint: "only set where a batch was mapped to a course" },
  { field: "promo_code", label: "Promo code", hint: "exact match" },
  { field: "profession", label: "Profession contains", hint: "substring" },
];

/**
 * Never optional and never removable: excludes contacts with no email,
 * contacts who unsubscribed, and addresses Brevo has suppressed. Folded into
 * is_sendable by the view so one predicate covers all three.
 */
const SENDABLE_GUARD: QueryOp = { kind: "eq", column: "is_sendable", value: true };

export function buildSegmentFilters(filters: SegmentFilter[]): QueryOp[] {
  const ops: QueryOp[] = [];

  for (const filter of filters) {
    switch (filter.field) {
      case "import_batch_id":
        if (filter.values.length > 0) ops.push({ kind: "overlaps", column: "import_batch_ids", values: filter.values });
        break;
      case "course_id":
        if (filter.values.length > 0) ops.push({ kind: "overlaps", column: "course_ids", values: filter.values });
        break;
      case "promo_code":
        if (filter.value !== "") ops.push({ kind: "contains", column: "promo_codes", values: [filter.value] });
        break;
      case "row_type":
        // row_types is an aggregated array: "is a group leader" means the
        // array contains that value, not that a scalar equals it.
        if (filter.value !== "") ops.push({ kind: "contains", column: "row_types", values: [filter.value] });
        break;
      case "product_label":
        if (filter.value !== "") ops.push({ kind: "ilike", column: "product_labels_text", pattern: `%${filter.value}%` });
        break;
      case "profession":
        if (filter.value !== "") ops.push({ kind: "ilike", column: "profession", pattern: `%${filter.value}%` });
        break;
      case "discovery_source":
        if (filter.values.length > 0) ops.push({ kind: "in", column: "discovery_source", values: filter.values });
        break;
      case "country":
        if (filter.values.length > 0) ops.push({ kind: "in", column: "country", values: filter.values });
        break;
      case "purchase_count":
        ops.push({ kind: filter.op, column: "purchase_count", value: filter.value });
        break;
      case "last_purchase_at":
        ops.push({ kind: filter.op === "before" ? "lt" : "gt", column: "last_purchase_at", value: filter.value });
        break;
      case "has_platform_account":
        ops.push({ kind: "eq", column: "has_platform_account", value: filter.value });
        break;
    }
  }

  ops.push(SENDABLE_GUARD);
  return ops;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run tests/crm-segment.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/segment.ts tests/crm-segment.test.ts
git commit -m "feat: add pure segment filter builder with mandatory sendable guard"
```

---

### Task 19: Merge tags and the campaign email shell

**Files:**
- Create: `src/lib/crm/merge-tags.ts`
- Create: `src/lib/crm/campaign-email.ts`
- Test: `tests/crm-merge-tags.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `renderMergeTags(template: string, contact: { fullName: string; email: string | null }): string`
  - `buildCampaignHtml(opts: { bodyHtml: string; unsubscribeUrl: string }): string`

- [ ] **Step 1: Write the failing test**

Create `tests/crm-merge-tags.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderMergeTags } from "@/lib/crm/merge-tags";
import { buildCampaignHtml } from "@/lib/crm/campaign-email";

describe("renderMergeTags", () => {
  it("substitutes first_name from the first word of the full name", () => {
    expect(renderMergeTags("Hi {{first_name}},", { fullName: "Areeba Fatima", email: "a@x.com" })).toBe("Hi Areeba,");
  });

  it("substitutes full_name and email", () => {
    expect(renderMergeTags("{{full_name}} <{{email}}>", { fullName: "Areeba Fatima", email: "a@x.com" }))
      .toBe("Areeba Fatima <a@x.com>");
  });

  it("falls back to a neutral greeting when the name is missing", () => {
    // "Hi ," in three thousand emails is exactly the kind of defect that only
    // shows up in production, so the fallback is tested, not assumed.
    expect(renderMergeTags("Hi {{first_name}},", { fullName: "", email: "a@x.com" })).toBe("Hi there,");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderMergeTags("Hi {{ first_name }}!", { fullName: "Amna Nasir", email: null })).toBe("Hi Amna!");
  });

  it("leaves an unknown tag untouched rather than blanking it", () => {
    expect(renderMergeTags("{{course_name}}", { fullName: "X Y", email: null })).toBe("{{course_name}}");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(renderMergeTags("{{first_name}} {{first_name}}", { fullName: "Amna Nasir", email: null })).toBe("Amna Amna");
  });

  it("escapes HTML in substituted values", () => {
    // Names come from spreadsheets typed by hand. An unescaped angle bracket
    // would break the email layout at best.
    expect(renderMergeTags("Hi {{first_name}}", { fullName: "<script>x</script>", email: null }))
      .toBe("Hi &lt;script&gt;x&lt;/script&gt;");
  });
});

describe("buildCampaignHtml", () => {
  it("always embeds the unsubscribe URL", () => {
    const html = buildCampaignHtml({ bodyHtml: "<p>Hello</p>", unsubscribeUrl: "https://pz.test/unsubscribe/abc" });
    expect(html).toContain("https://pz.test/unsubscribe/abc");
    expect(html).toContain("Unsubscribe");
  });

  it("embeds the body", () => {
    const html = buildCampaignHtml({ bodyHtml: "<p>Hello</p>", unsubscribeUrl: "https://pz.test/u/1" });
    expect(html).toContain("<p>Hello</p>");
  });

  it("produces a complete HTML document", () => {
    const html = buildCampaignHtml({ bodyHtml: "x", unsubscribeUrl: "https://pz.test/u/1" });
    expect(html.trim().startsWith("<!DOCTYPE html>")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run tests/crm-merge-tags.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write both implementations**

Create `src/lib/crm/merge-tags.ts`:

```ts
/**
 * Merge tag rendering for campaign bodies. Pure — no I/O.
 *
 * Unknown tags are left verbatim rather than blanked, so a typo is visible
 * in the test send instead of silently producing a gap in three thousand
 * emails.
 */

type MergeContext = { fullName: string; email: string | null };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMergeTags(template: string, contact: MergeContext): string {
  const firstName = contact.fullName.trim().split(/\s+/)[0] ?? "";

  const values: Record<string, string> = {
    // "there" keeps a greeting grammatical when the sheet had no name.
    first_name: firstName === "" ? "there" : firstName,
    full_name: contact.fullName.trim() === "" ? "there" : contact.fullName.trim(),
    email: contact.email ?? "",
  };

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : escapeHtml(value);
  });
}
```

Create `src/lib/crm/campaign-email.ts`:

```ts
/**
 * Branded HTML shell for campaign emails, reusing the palette already used
 * by welcomeEmailHtml in src/lib/brevo.ts.
 *
 * The unsubscribe footer is injected HERE, by the sender, rather than being
 * written into each campaign body. An admin cannot omit it, which is the
 * point: a bulk send without a working unsubscribe link damages the sending
 * domain's reputation and is not recoverable quickly.
 */

export function buildCampaignHtml(opts: { bodyHtml: string; unsubscribeUrl: string }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Inter,sans-serif;background:#f2faf5;margin:0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(13,51,32,.10);">
    <div style="background:#0d3320;padding:32px;text-align:center;">
      <h1 style="color:#3ecf70;font-size:24px;margin:0;">PZ Academy</h1>
      <p style="color:#b0f5cc;margin:8px 0 0;">by Pharmacozyme</p>
    </div>
    <div style="padding:32px;color:#527a60;line-height:1.6;font-size:15px;">
      ${opts.bodyHtml}
    </div>
    <div style="padding:0 32px 28px;">
      <hr style="border:none;border-top:1px solid #d6ead9;margin:8px 0 16px;">
      <p style="color:#8aa596;font-size:12px;line-height:1.6;margin:0;">
        You are receiving this because you registered for a PZ Academy program.
        <br>
        <a href="${opts.unsubscribeUrl}" style="color:#527a60;text-decoration:underline;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run tests/crm-merge-tags.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/merge-tags.ts src/lib/crm/campaign-email.ts tests/crm-merge-tags.test.ts
git commit -m "feat: add campaign merge tags and branded email shell"
```

---

### Task 20: Segments and campaigns data layer

**Files:**
- Create: `src/lib/data/admin-crm-segments.ts`
- Create: `src/lib/data/admin-crm-campaigns.ts`

**Interfaces:**
- Consumes: `buildSegmentFilters` (Task 18), `renderMergeTags`/`buildCampaignHtml` (Task 19), views from Task 17
- Produces:
  - `resolveSegment(filters, opts?): Promise<{ contacts: SegmentContact[]; total: number }>`
  - `countSegment(filters): Promise<number>`
  - `listCampaigns()`, `createCampaign()`, `getCampaign()`, `sendCampaign()`, `sendTestEmail()`

- [ ] **Step 1: Write the segments data layer**

Create `src/lib/data/admin-crm-segments.ts`:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildSegmentFilters, type SegmentFilter, type QueryOp } from "@/lib/crm/segment";

export type SegmentContact = {
  id: string;
  fullName: string;
  email: string;
  unsubscribeToken: string;
};

type Query = ReturnType<ReturnType<typeof createAdminSupabase>["from"]>["select"] extends (...a: never[]) => infer R ? R : never;

/** Applies one QueryOp to a PostgREST query builder. */
function applyOp<T extends { eq: unknown }>(query: T, op: QueryOp): T {
  // The `as never` casts keep this generic over PostgREST's chained builder
  // types, which do not expose a single shared interface.
  const q = query as unknown as Record<string, (...args: never[]) => T>;
  switch (op.kind) {
    case "overlaps":
      return q.overlaps(op.column as never, op.values as never);
    case "contains":
      return q.contains(op.column as never, op.values as never);
    case "in":
      return q.in(op.column as never, op.values as never);
    case "ilike":
      return q.ilike(op.column as never, op.pattern as never);
    default:
      return q[op.kind](op.column as never, op.value as never);
  }
}

/**
 * Resolves a segment to the contacts it matches.
 *
 * `limit` exists so the builder UI can show a sample without pulling the
 * whole list; the send path calls this with no limit and snapshots whatever
 * comes back.
 */
export async function resolveSegment(
  filters: SegmentFilter[],
  opts?: { limit?: number },
): Promise<{ contacts: SegmentContact[]; total: number }> {
  const admin = createAdminSupabase();
  const ops = buildSegmentFilters(filters);

  let query = admin
    .from("crm_contact_segment_source")
    .select("id, full_name, email, unsubscribe_token", { count: "exact" });

  for (const op of ops) query = applyOp(query, op);
  if (opts?.limit) query = query.limit(opts.limit);

  const { data, count, error } = await query;
  if (error) {
    console.error("[crm-segments] resolve failed:", error);
    return { contacts: [], total: 0 };
  }

  const contacts: SegmentContact[] = (data ?? [])
    // is_sendable already guarantees a non-null email; this narrows the type.
    .filter((r): r is typeof r & { email: string } => r.email !== null)
    .map((r) => ({
      id: r.id,
      fullName: r.full_name ?? "",
      email: r.email,
      unsubscribeToken: r.unsubscribe_token,
    }));

  return { contacts, total: count ?? contacts.length };
}

export async function countSegment(filters: SegmentFilter[]): Promise<number> {
  const { total } = await resolveSegment(filters, { limit: 1 });
  return total;
}
```

- [ ] **Step 2: Write the campaigns data layer**

Create `src/lib/data/admin-crm-campaigns.ts`:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { resolveSegment } from "@/lib/data/admin-crm-segments";
import { renderMergeTags } from "@/lib/crm/merge-tags";
import { buildCampaignHtml } from "@/lib/crm/campaign-email";
import { sendTransactionalEmail } from "@/lib/brevo";
import type { SegmentFilter } from "@/lib/crm/segment";

/**
 * Campaign drafting and sending. Mirrors admin-marketing.ts conventions.
 *
 * Sending inserts rows into the EXISTING email_queue and lets the existing
 * process-email-queue edge function drain them. No second sender exists to
 * diverge from the first, and brevo-webhook-handler already writes opens,
 * clicks, and bounces into email_metrics — which is where crm_campaign_stats
 * reads them from.
 */

export type MutationResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-found" | "db-error" | "empty-segment" | "already-sent" };

export type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  status: string;
  createdAt: string;
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

export async function listCampaigns(): Promise<CampaignRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("crm_campaign_stats")
    .select("campaign_id, name, status, created_at, recipients, sent, delivered, opened, clicked, bounced")
    .order("created_at", { ascending: false });

  const { data: subjects } = await admin.from("campaigns").select("id, subject");
  const subjectById = new Map((subjects ?? []).map((c) => [c.id, c.subject]));

  return (data ?? []).map((c) => ({
    id: c.campaign_id,
    name: c.name,
    subject: subjectById.get(c.campaign_id) ?? "",
    status: c.status,
    createdAt: c.created_at,
    recipients: Number(c.recipients ?? 0),
    sent: Number(c.sent ?? 0),
    delivered: Number(c.delivered ?? 0),
    opened: Number(c.opened ?? 0),
    clicked: Number(c.clicked ?? 0),
    bounced: Number(c.bounced ?? 0),
  }));
}

export async function createCampaign(
  userId: string,
  input: { name: string; subject: string; bodyHtml: string; segment: SegmentFilter[] },
): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      name: input.name,
      subject: input.subject,
      html_content: input.bodyHtml,
      segment: input.segment,
      status: "draft",
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[crm-campaigns] create failed:", error);
    return { ok: false, reason: "db-error" };
  }
  if (!data) return { ok: false, reason: "db-error" };
  return { ok: true, id: data.id };
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3945";
}

/** Sends one rendered copy directly, bypassing the queue — used only for test sends. */
export async function sendTestEmail(campaignId: string, toEmail: string): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, subject, html_content")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, reason: "not-found" };

  const context = { fullName: "Test Person", email: toEmail };
  const html = buildCampaignHtml({
    bodyHtml: renderMergeTags(campaign.html_content, context),
    unsubscribeUrl: `${appUrl()}/unsubscribe/preview`,
  });

  try {
    await sendTransactionalEmail({
      to: toEmail,
      subject: `[TEST] ${renderMergeTags(campaign.subject, context)}`,
      htmlContent: html,
    });
    return { ok: true, id: campaign.id };
  } catch (error) {
    console.error("[crm-campaigns] test send failed:", error);
    return { ok: false, reason: "db-error" };
  }
}

const ENQUEUE_CHUNK = 200;

/**
 * Snapshots the segment, renders one email per contact, and enqueues them.
 *
 * The recipient list is snapshotted rather than re-resolved at drain time so
 * it cannot shift underneath a send that takes hours. UNIQUE (campaign_id,
 * contact_id) makes a retry safe: anyone already enqueued is skipped by the
 * conflict clause rather than emailed twice.
 */
export async function sendCampaign(campaignId: string): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, subject, html_content, segment, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, reason: "not-found" };
  if (campaign.status === "sent" || campaign.status === "sending") return { ok: false, reason: "already-sent" };

  const filters = (Array.isArray(campaign.segment) ? campaign.segment : []) as SegmentFilter[];
  const { contacts } = await resolveSegment(filters);
  if (contacts.length === 0) return { ok: false, reason: "empty-segment" };

  await admin.from("campaigns").update({ status: "sending", started_at: new Date().toISOString() }).eq("id", campaignId);

  const nowMinute = new Date().toISOString().slice(0, 16);

  for (let i = 0; i < contacts.length; i += ENQUEUE_CHUNK) {
    const chunk = contacts.slice(i, i + ENQUEUE_CHUNK);

    const queueRows = chunk.map((contact) => ({
      event_type: "campaign",
      user_email: contact.email,
      subject: renderMergeTags(campaign.subject, contact),
      html_content: buildCampaignHtml({
        bodyHtml: renderMergeTags(campaign.html_content, contact),
        unsubscribeUrl: `${appUrl()}/unsubscribe/${contact.unsubscribeToken}`,
      }),
      status: "pending",
      created_minute: nowMinute,
    }));

    const { data: queued, error: queueError } = await admin.from("email_queue").insert(queueRows).select("id, user_email");
    if (queueError) {
      console.error("[crm-campaigns] enqueue failed:", queueError);
      await admin.from("campaigns").update({ status: "draft" }).eq("id", campaignId);
      return { ok: false, reason: "db-error" };
    }

    const queueIdByEmail = new Map((queued ?? []).map((q) => [q.user_email, q.id]));
    const recipientRows = chunk.map((contact) => ({
      campaign_id: campaignId,
      contact_id: contact.id,
      email_queue_id: queueIdByEmail.get(contact.email) ?? null,
      status: "queued",
    }));

    // onConflict ignore: a retried send never double-enqueues a contact.
    const { error: recipientError } = await admin
      .from("campaign_recipients")
      .upsert(recipientRows, { onConflict: "campaign_id,contact_id", ignoreDuplicates: true });
    if (recipientError) console.error("[crm-campaigns] recipient link failed:", recipientError);
  }

  await admin
    .from("campaigns")
    .update({ status: "sent", completed_at: new Date().toISOString() })
    .eq("id", campaignId);

  return { ok: true, id: campaignId };
}
```

- [ ] **Step 3: Verify it compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean. If the `applyOp` generic in `admin-crm-segments.ts` fights the PostgREST builder types, simplify it to a `switch` that rebuilds `query` inline per case rather than through a helper — correctness over elegance here.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/admin-crm-segments.ts src/lib/data/admin-crm-campaigns.ts
git commit -m "feat: add CRM segment resolution and campaign send over email_queue"
```

---

### Task 21: Public unsubscribe page

**Files:**
- Create: `src/lib/data/crm-unsubscribe.ts`
- Create: `src/app/unsubscribe/[token]/page.tsx`

**Interfaces:**
- Consumes: `contacts.unsubscribe_token` (Task 1)
- Produces: `unsubscribeByToken(token: string): Promise<"ok" | "already" | "not-found">`; public route `/unsubscribe/[token]`

- [ ] **Step 1: Write the data layer**

Create `src/lib/data/crm-unsubscribe.ts`:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Unsubscribe by opaque token. No authentication: the recipient of a bulk
 * email has no account and must not need one to opt out. The token is a
 * random uuid per contact and grants nothing except the ability to
 * unsubscribe that one contact.
 */
export async function unsubscribeByToken(token: string): Promise<"ok" | "already" | "not-found"> {
  const admin = createAdminSupabase();

  const { data } = await admin
    .from("contacts")
    .select("id, email_unsubscribed_at")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (!data) return "not-found";
  if (data.email_unsubscribed_at !== null) return "already";

  const { error } = await admin
    .from("contacts")
    .update({ email_unsubscribed_at: new Date().toISOString() })
    .eq("id", data.id);

  return error ? "not-found" : "ok";
}
```

- [ ] **Step 2: Write the page**

Create `src/app/unsubscribe/[token]/page.tsx`:

```tsx
import { unsubscribeByToken } from "@/lib/data/crm-unsubscribe";

export const metadata = { title: "Unsubscribe — PZ Academy" };

// Never cached: this route mutates, and a cached response would show a stale
// outcome to the next person who opens the same link.
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = token === "preview" ? "preview" : await unsubscribeByToken(token);

  const message =
    result === "ok"
      ? "You have been unsubscribed. You will not receive any more marketing emails from PZ Academy."
      : result === "already"
        ? "You were already unsubscribed. No further marketing emails will be sent to you."
        : result === "preview"
          ? "This is a preview link from a test email. No changes were made."
          : "This unsubscribe link is not valid. It may have already been used or the address may have been removed.";

  return (
    <main className="min-h-screen flex items-center justify-center bg-pz-offwhite px-6">
      <div className="max-w-md text-center bg-white rounded-2xl shadow-sm p-8">
        <h1 className="font-montserrat font-extrabold text-2xl text-pz-deep mb-3">PZ Academy</h1>
        <p className="font-poppins text-pz-muted leading-relaxed">{message}</p>
      </div>
    </main>
  );
}
```

The `preview` token is what `sendTestEmail` embeds, so clicking the footer link in a test send cannot unsubscribe a real contact.

- [ ] **Step 3: Verify the route renders**

With the dev server up, visit `http://localhost:3945/unsubscribe/preview`.
Expected: the preview message, no error.

Then take a real token:

```sql
select unsubscribe_token from public.contacts limit 1;
```

Visit `/unsubscribe/<that token>` → success message. Reload → "already unsubscribed". Then undo it:

```sql
update public.contacts set email_unsubscribed_at = null where unsubscribe_token = '<that token>';
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/crm-unsubscribe.ts src/app/unsubscribe
git commit -m "feat: add public unsubscribe route with opaque per-contact token"
```

---

### Task 22: Campaign validation schemas and API routes

**Files:**
- Modify: `src/lib/validations/crm.ts` — add campaign schemas
- Create: `src/app/api/admin/crm/segments/preview/route.ts`
- Create: `src/app/api/admin/crm/campaigns/route.ts`
- Create: `src/app/api/admin/crm/campaigns/[id]/send/route.ts`
- Create: `src/app/api/admin/crm/campaigns/[id]/test/route.ts`
- Test: `tests/crm.schema.test.ts` — extend

**Interfaces:**
- Consumes: `SegmentFilter` (Task 18), campaign data layer (Task 20)
- Produces: `segmentFilterSchema`, `campaignCreateSchema`, `campaignTestSchema`; four endpoints

- [ ] **Step 1: Write the failing schema tests**

Append to `tests/crm.schema.test.ts`:

```ts
import { segmentFilterSchema, campaignCreateSchema } from "@/lib/validations/crm";

describe("segmentFilterSchema", () => {
  it("accepts a row_type filter", () => {
    expect(segmentFilterSchema.safeParse({ field: "row_type", op: "eq", value: "group_leader" }).success).toBe(true);
  });

  it("accepts a purchase_count comparison", () => {
    expect(segmentFilterSchema.safeParse({ field: "purchase_count", op: "gte", value: 2 }).success).toBe(true);
  });

  it("rejects an unknown field", () => {
    expect(segmentFilterSchema.safeParse({ field: "salary", op: "gte", value: 2 }).success).toBe(false);
  });

  it("rejects an operator that does not belong to the field", () => {
    expect(segmentFilterSchema.safeParse({ field: "purchase_count", op: "contains", value: 2 }).success).toBe(false);
  });
});

describe("campaignCreateSchema", () => {
  it("accepts a complete draft", () => {
    const parsed = campaignCreateSchema.safeParse({
      name: "Win-back March",
      subject: "Hi {{first_name}}, your next step",
      bodyHtml: "<p>Hello</p>",
      segment: [{ field: "purchase_count", op: "gte", value: 2 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty segment, which means every sendable contact", () => {
    const parsed = campaignCreateSchema.safeParse({ name: "All", subject: "S", bodyHtml: "<p>x</p>", segment: [] });
    expect(parsed.success).toBe(true);
  });

  it("rejects a blank name, subject, or body", () => {
    expect(campaignCreateSchema.safeParse({ name: "", subject: "S", bodyHtml: "<p>x</p>", segment: [] }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ name: "N", subject: "", bodyHtml: "<p>x</p>", segment: [] }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ name: "N", subject: "S", bodyHtml: "", segment: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: FAIL — `segmentFilterSchema` is not exported.

- [ ] **Step 3: Add the schemas**

Append to `src/lib/validations/crm.ts`:

```ts
/**
 * One discriminated variant per segment field, so an operator can never be
 * paired with a field it does not apply to. A single loose
 * {field, op, value} object would type-check and then fail at query time.
 */
export const segmentFilterSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("import_batch_id"), op: z.literal("in"), values: z.array(z.string().uuid()) }),
  z.object({ field: z.literal("course_id"), op: z.literal("in"), values: z.array(z.string().uuid()) }),
  z.object({ field: z.literal("row_type"), op: z.literal("eq"), value: z.enum(["individual", "group_leader", "group_member"]) }),
  z.object({ field: z.literal("product_label"), op: z.literal("contains"), value: z.string().trim().max(200) }),
  z.object({ field: z.literal("promo_code"), op: z.literal("eq"), value: z.string().trim().max(100) }),
  z.object({ field: z.literal("discovery_source"), op: z.literal("in"), values: z.array(z.enum(["instagram", "facebook", "whatsapp", "other", "unknown"])) }),
  z.object({ field: z.literal("country"), op: z.literal("in"), values: z.array(z.string().trim().max(4)) }),
  z.object({ field: z.literal("profession"), op: z.literal("contains"), value: z.string().trim().max(200) }),
  z.object({ field: z.literal("purchase_count"), op: z.enum(["gte", "lte"]), value: z.number().int().min(0).max(1000) }),
  z.object({ field: z.literal("last_purchase_at"), op: z.enum(["before", "after"]), value: z.string().trim().min(4).max(40) }),
  z.object({ field: z.literal("has_platform_account"), op: z.literal("eq"), value: z.boolean() }),
]);

export const segmentPreviewSchema = z.object({
  segment: z.array(segmentFilterSchema).max(20),
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  bodyHtml: z.string().trim().min(1, "Body is required").max(100_000),
  segment: z.array(segmentFilterSchema).max(20),
});

export const campaignTestSchema = z.object({
  email: z.string().trim().email(),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Write the four routes**

Create `src/app/api/admin/crm/segments/preview/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveSegment } from "@/lib/data/admin-crm-segments";
import { segmentPreviewSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = segmentPreviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid segment" }, { status: 400 });

  const { contacts, total } = await resolveSegment(parsed.data.segment, { limit: 10 });
  return NextResponse.json({
    total,
    samples: contacts.map((c) => ({ fullName: c.fullName, email: c.email })),
  });
}
```

Create `src/app/api/admin/crm/campaigns/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listCampaigns, createCampaign } from "@/lib/data/admin-crm-campaigns";
import { campaignCreateSchema } from "@/lib/validations/crm";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ campaigns: await listCampaigns() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = campaignCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await createCampaign(auth.user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: "Could not create campaign" }, { status: 500 });

  return NextResponse.json({ id: result.id }, { status: 201 });
}
```

Create `src/app/api/admin/crm/campaigns/[id]/send/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendCampaign } from "@/lib/data/admin-crm-campaigns";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await sendCampaign(id);

  if (!result.ok) {
    const message =
      result.reason === "empty-segment"
        ? "That segment matches nobody who can be emailed."
        : result.reason === "already-sent"
          ? "This campaign has already been sent."
          : result.reason === "not-found"
            ? "Campaign not found."
            : "Could not send this campaign.";
    const status = result.reason === "not-found" ? 404 : result.reason === "db-error" ? 500 : 409;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true });
}
```

Create `src/app/api/admin/crm/campaigns/[id]/test/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendTestEmail } from "@/lib/data/admin-crm-campaigns";
import { campaignTestSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = campaignTestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

  const result = await sendTestEmail(id, parsed.data.email);
  if (!result.ok) return NextResponse.json({ error: "Could not send the test email" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Verify and commit**

Run: `node_modules/.bin/tsc --noEmit` → clean
Run: `node_modules/.bin/vitest run` → all pass

```bash
git add src/lib/validations/crm.ts tests/crm.schema.test.ts src/app/api/admin/crm
git commit -m "feat: add CRM segment preview and campaign API routes"
```

---

### Task 23: Segment builder and campaigns UI

**Files:**
- Create: `src/components/admin/crm/SegmentBuilder.tsx`
- Create: `src/components/admin/crm/CampaignsPanel.tsx`
- Modify: `src/app/dashboard/admin/crm/page.tsx` — add a `campaigns` tab

**Interfaces:**
- Consumes: segment/campaign routes (Task 22), `SEGMENT_FIELDS` (Task 18)
- Produces: `<SegmentBuilder value onChange />`, `<CampaignsPanel initialCampaigns />`

- [ ] **Step 1: Check Stitch before writing UI**

Per CLAUDE.md, run `mcp__stitch__list_screens` on project `11811490301995978699` and look for a campaign composer or segment builder screen. `Admin: Marketing CMS (Task-Focused Utility)` is the closest existing analogue. If nothing covers it, hand the user a generation prompt rather than improvising.

- [ ] **Step 2: Write SegmentBuilder**

Create `src/components/admin/crm/SegmentBuilder.tsx`:

```tsx
"use client";

import { useState } from "react";
import { SEGMENT_FIELDS, type SegmentFilter } from "@/lib/crm/segment";

/**
 * Filters combine with AND. The live count is the whole point of this
 * component: an admin should never discover a segment's size at send time.
 */
export function SegmentBuilder({
  value,
  onChange,
}: {
  value: SegmentFilter[];
  onChange: (next: SegmentFilter[]) => void;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [samples, setSamples] = useState<Array<{ fullName: string; email: string }>>([]);
  const [busy, setBusy] = useState(false);

  async function refreshCount(filters: SegmentFilter[]) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/crm/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment: filters }),
      });
      if (!res.ok) { setCount(null); return; }
      const json = await res.json();
      setCount(json.total);
      setSamples(json.samples ?? []);
    } finally {
      setBusy(false);
    }
  }

  function update(next: SegmentFilter[]) {
    onChange(next);
    setCount(null);
  }

  function addFilter(field: SegmentFilter["field"]) {
    // Each field has exactly one valid default operator; picking it here
    // means the builder can never emit a field/operator pair the schema
    // rejects.
    const defaults: Record<SegmentFilter["field"], SegmentFilter> = {
      import_batch_id: { field: "import_batch_id", op: "in", values: [] },
      course_id: { field: "course_id", op: "in", values: [] },
      row_type: { field: "row_type", op: "eq", value: "group_leader" },
      product_label: { field: "product_label", op: "contains", value: "" },
      promo_code: { field: "promo_code", op: "eq", value: "" },
      discovery_source: { field: "discovery_source", op: "in", values: [] },
      country: { field: "country", op: "in", values: [] },
      profession: { field: "profession", op: "contains", value: "" },
      purchase_count: { field: "purchase_count", op: "gte", value: 2 },
      last_purchase_at: { field: "last_purchase_at", op: "before", value: "" },
      has_platform_account: { field: "has_platform_account", op: "eq", value: false },
    };
    update([...value, defaults[field]]);
  }

  function patch(index: number, next: SegmentFilter) {
    update(value.map((f, i) => (i === index ? next : f)));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <select
          value=""
          onChange={(e) => { if (e.target.value) addFilter(e.target.value as SegmentFilter["field"]); }}
          className="rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm"
        >
          <option value="">+ Add a filter…</option>
          {SEGMENT_FIELDS.map((f) => (
            <option key={f.field} value={f.field}>{f.label}</option>
          ))}
        </select>

        <button
          onClick={() => refreshCount(value)}
          disabled={busy}
          className="px-5 py-2 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Counting…" : "Count matches"}
        </button>

        {count !== null && (
          <span className="px-4 py-2 font-body text-sm">
            <strong className="tabular-nums">{count}</strong> contacts match
          </span>
        )}
      </div>

      {value.length === 0 && (
        <p className="font-body text-xs text-pz-on-surface-variant">
          No filters — this matches every contact who has an email, has not unsubscribed, and has not bounced.
        </p>
      )}

      {value.map((filter, index) => (
        <div key={index} className="flex gap-2 items-center flex-wrap bg-pz-surface-container-high rounded-xl px-3 py-2">
          <span className="font-body text-sm font-medium">
            {SEGMENT_FIELDS.find((f) => f.field === filter.field)?.label ?? filter.field}
          </span>

          {"values" in filter ? (
            <input
              value={filter.values.join(", ")}
              onChange={(e) =>
                patch(index, { ...filter, values: e.target.value.split(",").map((v) => v.trim()).filter((v) => v !== "") } as SegmentFilter)
              }
              placeholder="comma separated"
              className="flex-1 min-w-[180px] rounded-lg border border-pz-outline-variant px-3 py-1 font-body text-sm"
            />
          ) : typeof filter.value === "boolean" ? (
            <select
              value={String(filter.value)}
              onChange={(e) => patch(index, { ...filter, value: e.target.value === "true" } as SegmentFilter)}
              className="rounded-lg border border-pz-outline-variant px-3 py-1 font-body text-sm"
            >
              <option value="true">yes</option>
              <option value="false">no</option>
            </select>
          ) : (
            <input
              value={String(filter.value)}
              onChange={(e) =>
                patch(index, {
                  ...filter,
                  value: typeof filter.value === "number" ? Number(e.target.value) || 0 : e.target.value,
                } as SegmentFilter)
              }
              className="flex-1 min-w-[140px] rounded-lg border border-pz-outline-variant px-3 py-1 font-body text-sm"
            />
          )}

          <button
            onClick={() => update(value.filter((_, i) => i !== index))}
            className="text-pz-danger font-body text-sm"
          >
            remove
          </button>
        </div>
      ))}

      {samples.length > 0 && (
        <p className="font-body text-xs text-pz-on-surface-variant">
          e.g. {samples.map((s) => s.fullName || s.email).join(", ")}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write CampaignsPanel**

Create `src/components/admin/crm/CampaignsPanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SegmentBuilder } from "./SegmentBuilder";
import type { SegmentFilter } from "@/lib/crm/segment";

type Campaign = {
  id: string; name: string; subject: string; status: string; createdAt: string;
  recipients: number; sent: number; delivered: number; opened: number; clicked: number; bounced: number;
};

export function CampaignsPanel({ initialCampaigns }: { initialCampaigns: Campaign[] }) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p>Hi {{first_name}},</p>\n<p></p>");
  const [segment, setSegment] = useState<SegmentFilter[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/admin/crm/campaigns");
    if (!res.ok) return;
    const json = await res.json();
    // Local state, not router.refresh() — refresh() cannot resync this
    // component's own useState.
    setCampaigns(json.campaigns);
  }

  async function saveDraft() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, subject, bodyHtml, segment }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save the draft.");
      setDraftId(json.id);
      setNotice("Draft saved. Send a test to yourself before sending to the segment.");
      await reload();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the draft.");
    } finally { setBusy(false); }
  }

  async function sendTest() {
    if (!draftId) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${draftId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail }),
      });
      if (!res.ok) throw new Error("Could not send the test email.");
      setNotice(`Test sent to ${testEmail}. Check the rendering and the unsubscribe link before the real send.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the test email.");
    } finally { setBusy(false); }
  }

  async function sendReal() {
    if (!draftId) return;
    // Irreversible and outward-facing: once enqueued, these emails cannot be
    // recalled. Explicit confirmation is required.
    if (!window.confirm("This sends real emails to everyone in the segment and cannot be undone. Continue?")) return;

    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/crm/campaigns/${draftId}/send`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not send the campaign.");
      setNotice("Queued. Delivery happens in the background — watch the stats below.");
      setDraftId(null);
      await reload();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the campaign.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="bg-pz-surface-container-high rounded-2xl p-5 space-y-4">
        <h2 className="font-headline font-semibold text-pz-secondary">New campaign</h2>

        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Internal name"
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject — {{first_name}} works here too"
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm" />
        <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={8}
          className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-mono text-xs" />
        <p className="font-body text-xs text-pz-on-surface-variant">
          Tags: <code>{"{{first_name}}"}</code>, <code>{"{{full_name}}"}</code>, <code>{"{{email}}"}</code>.
          The PZ Academy header and the unsubscribe footer are added automatically.
        </p>

        <div>
          <h3 className="font-headline text-sm font-semibold mb-2">Who receives it</h3>
          <SegmentBuilder value={segment} onChange={setSegment} />
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <button onClick={saveDraft} disabled={busy}
            className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50">
            {busy ? "Saving…" : "Save draft"}
          </button>

          {draftId && (
            <>
              <input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="your@email.com"
                className="rounded-xl border border-pz-outline-variant px-3 py-2 font-body text-sm" />
              <button onClick={sendTest} disabled={busy || testEmail === ""}
                className="px-5 py-2 rounded-full bg-pz-surface-variant text-pz-on-surface-variant font-headline text-sm font-medium disabled:opacity-50">
                Send test
              </button>
              <button onClick={sendReal} disabled={busy}
                className="px-5 py-2 rounded-full bg-pz-danger text-white font-headline text-sm font-semibold disabled:opacity-50">
                Send to segment
              </button>
            </>
          )}
        </div>

        {error && <p className="font-body text-sm text-pz-danger">{error}</p>}
        {notice && <p className="font-body text-sm text-pz-primary">{notice}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-headline font-semibold text-pz-secondary">Sent campaigns</h2>
        {campaigns.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant">No campaigns yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-sm">
              <thead className="text-pz-on-surface-variant text-xs uppercase">
                <tr><th className="py-2">Name</th><th>Status</th><th>Recipients</th><th>Sent</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Bounced</th></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-pz-outline-variant">
                    <td className="py-2">{c.name}</td>
                    <td>{c.status}</td>
                    <td className="tabular-nums">{c.recipients}</td>
                    <td className="tabular-nums">{c.sent}</td>
                    <td className="tabular-nums">{c.delivered}</td>
                    <td className="tabular-nums">{c.opened}</td>
                    <td className="tabular-nums">{c.clicked}</td>
                    <td className={`tabular-nums ${c.bounced > 0 ? "text-pz-danger" : ""}`}>{c.bounced}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add the campaigns tab to the page**

In `src/app/dashboard/admin/crm/page.tsx`: import `listCampaigns` from `@/lib/data/admin-crm-campaigns` and `CampaignsPanel`; extend `Tab` to `"contacts" | "import" | "merge" | "campaigns"`; add `if (value === "campaigns") return "campaigns";` to `parseTab`; add `listCampaigns()` to the `Promise.all`; add a fourth `<Link href="/dashboard/admin/crm?tab=campaigns">Campaigns</Link>` using `TAB_CLASS`; and render `{tab === "campaigns" && <CampaignsPanel initialCampaigns={campaigns} />}`.

- [ ] **Step 5: Verify and commit**

Run: `node_modules/.bin/tsc --noEmit` → clean
Run: `node_modules/.bin/next lint` → clean except the pre-existing `<img>` warnings
Run: `node_modules/.bin/vitest run` → all pass

```bash
git add src/components/admin/crm src/app/dashboard/admin/crm/page.tsx
git commit -m "feat: add CRM segment builder and campaign composer UI"
```

---

### Task 24: Phase 1b checkpoint — the first real broadcast

Not a coding task. This is where the phase is proven, and it is the step with real-world consequences: emails sent cannot be recalled, and a bad first send damages the sending domain's reputation in a way that is slow to reverse.

**Files:** none

- [ ] **Step 1: Confirm the queue drain rate before sending anything**

`process-email-queue` uses `BATCH_SIZE = 10`. Its cron cadence lives in the Supabase dashboard, not in migrations. Check it: Supabase → Database → Cron Jobs (or Integrations → Cron), and find the schedule invoking `process-email-queue`.

Compute the real throughput. At one run per minute, 10 per run is 600/hour — a 3,000-recipient send takes five hours.

Report the number to the user and let them decide whether to raise `BATCH_SIZE` before sending. Do not change it unilaterally; it is shared with transactional auth email, and starving those is worse than a slow campaign.

- [ ] **Step 2: Verify suppression data is real**

```sql
select distinct event_type, count(*) from public.email_metrics group by event_type;
select count(*) from public.crm_contact_segment_source where not is_sendable;
```

Confirm the `is_sendable` exclusions match the actual Brevo vocabulary in this project (Task 17, Step 4). If `not is_sendable` is `0` across 3,000 contacts imported from years-old sheets, treat that as suspicious rather than clean and re-check the event-type strings.

- [ ] **Step 3: Build the warm-up wave segment**

Go to `/dashboard/admin/crm?tab=campaigns`. Compose a real message. For the segment, add an **Import batch** filter naming only the **newest** cohort's batch id:

```sql
select id, sheet_name, tab_name, contacts_created, created_at
from public.import_batches order by created_at desc;
```

Click **Count matches**. Expected: a few hundred, not three thousand. This is the warm-up wave.

- [ ] **Step 4: Save the draft and send a test to yourself**

Save draft → enter `pharmacozymeofficial@gmail.com` → Send test.

In the received email verify: the PZ Academy header renders; `{{first_name}}` resolved (to `Test Person`); no literal `{{` remains anywhere; the unsubscribe link is present and lands on the preview page without unsubscribing anyone.

- [ ] **Step 5: Send the warm-up wave**

Click **Send to segment** and confirm the dialog.

Then verify the queue actually filled:

```sql
select status, count(*) from public.email_queue where event_type = 'campaign' group by status;
select count(*) from public.campaign_recipients;
```

Expected: recipient count matches the segment count, and queue rows begin as `pending` and move to `sent`.

- [ ] **Step 6: Watch the bounce rate before sending anything else**

Wait for the wave to drain, then:

```sql
select * from public.crm_campaign_stats order by created_at desc limit 1;
```

Compute `bounced / recipients`. **Above roughly 5%, stop.** Do not send the next wave. A bounce spike on a cold domain invites throttling or suspension by Brevo, and these addresses were collected over several years. Report the rate to the user and let them decide.

Below that threshold, proceed wave by wave — one `import_batch_id` at a time, newest first, checking the rate between each.

- [ ] **Step 7: Verify unsubscribe works from a real campaign email**

Click the unsubscribe link in an email that actually went out, then:

```sql
select email, email_unsubscribed_at from public.contacts where email_unsubscribed_at is not null;
select count(*) from public.crm_contact_segment_source where is_sendable;
```

Expected: the address is stamped, and the sendable count drops by one. This proves suppression closes the loop rather than merely recording an intention.

- [ ] **Step 8: Report the checkpoint**

State plainly: waves sent, recipients, delivered, opened, clicked, bounced, unsubscribes. Note anything that did not work. Slice 1 is complete when a real segmented broadcast has been delivered and its opens are visible.

---

## What slice 1 deliberately does not include

Capture surfaces (lead magnets, abandoned enrollment, WhatsApp-ad landing), lifecycle automation (drip, win-back, post-certificate upsell), WhatsApp sending, and funnel analytics dashboards. Those are slices 2 through 5, each getting its own spec and plan.

The WhatsApp groundwork is already laid: phone is a normalized first-class identity key, and the send path splits segment resolution from channel dispatch. Adding WhatsApp means adding a `dispatchWhatsApp` function and a `channel` column on `campaigns` — not touching segment or campaign logic.
