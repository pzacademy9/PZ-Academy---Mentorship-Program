# Phase 0: Google Sheets ↔ Supabase Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a lead submitted through the WordPress→Google Sheet funnel becomes a real (or pending)
enrollment with no manual re-entry, and status edits made in either the sheet or the
`/dashboard/admin/enrollments` panel converge — without a stray sheet edit ever silently
stripping a student's already-granted course access.

**Architecture:** a new, third GAS project (`gas/sheets-sync/Code.gs`) bound to each batch's
Google Sheet reacts to `onEdit` and POSTs new-submission / status-change events to a new Next.js
webhook (`/api/webhooks/sheets-sync`), which upserts `enrollments` rows through the existing
service-role client. Non-downgrade changes apply immediately; downgrades are parked on the
enrollment row (`sheet_pending_status`) until an admin confirms them in the panel. Every applied
change — whichever side triggered it — is pushed back to the sheet through an outbound GAS
`applyStatus` action, closing the loop.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS + service-role
client), Zod, Vitest, Google Apps Script (GAS).

## Global Constraints

- Shared secret travels in the JSON POST body as `token`, never a header — GAS `doPost` cannot
  reliably set custom headers, matching `gas/payment-screenshots/Code.gs`'s existing convention.
- Every outbound call to GAS (`pushStatusToSheet`) must swallow its own errors and only log — a
  dead GAS deployment must never block or roll back an in-app status change, matching
  `sendEnrollmentEmail`'s existing "never throw" contract.
- A sheet-driven status change that would **lower** the enrollment's access rank
  (`rejected/expired=0, pending=1, reserved=2, active=3`) must never auto-apply. It is parked on
  `sheet_pending_status`/`sheet_pending_note` until an admin confirms it in the panel.
- `Underpaid` never becomes its own `enrollment_status` enum value — it stays `pending` with
  `payment_shortfall_pkr` set. Only four real statuses gate course access; this spec adds zero
  new ones.
- The `enrollments` RLS admin-update policy has no `WITH CHECK` (0002), so every write to this
  table from server code must whitelist columns explicitly — never spread an object built from
  request/webhook input directly into `.update()`.
- Run `node_modules/.bin/tsc --noEmit` after every task (the `&` in this repo's path breaks
  `npm run`, see [[pz-academy-build-gotchas]]).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0016_sheet_sync.sql` | New columns + `sheet_leads` table |
| `supabase/migrations/0017_sheet_lead_resolution.sql` | Extends `handle_new_user` to resolve leads on signup |
| `src/lib/validations/sheet-sync.ts` | Webhook payload schema, rank table, downgrade check, row→status mapping (pure, no I/O) |
| `src/lib/gas/sheets-sync-client.ts` | Outbound `pushStatusToSheet()` |
| `src/lib/data/sheet-sync.ts` | `getCourseBySheetId`, `findStudentIdByEmail`, `insertSheetLead`, `notifyAdminsOfSheetDowngrade` |
| `src/lib/data/admin-enrollments.ts` (edit) | New columns on the review types; extracted `applyEnrollmentStatus()` |
| `src/app/api/admin/enrollments/[id]/route.ts` (edit) | Delegates its transition logic to `applyEnrollmentStatus()` |
| `src/app/api/webhooks/sheets-sync/route.ts` | Inbound GAS webhook |
| `src/app/api/admin/enrollments/[id]/sheet-sync/route.ts` | Admin confirm/dismiss for a parked downgrade |
| `src/lib/emails/enrollment.ts` (edit) | Adds `shortfall` and `leadWelcome` email kinds |
| `src/components/admin/SheetPendingBanner.tsx` | Confirm/Dismiss banner |
| `src/components/lms/EnrollmentStatusScreen.tsx` (edit) | Shortfall-aware `pending` copy |
| `gas/sheets-sync/Code.gs` | New GAS project: `onEdit` + `doPost` |
| `tests/sheet-sync.rules.test.ts` | Rank/downgrade/mapping pure-function tests |
| `tests/sheet-sync.schema.test.ts` | Webhook payload schema tests |

---

### Task 1: Migration — new columns and `sheet_leads` table

**Files:**
- Create: `supabase/migrations/0016_sheet_sync.sql`
- Modify: `src/lib/supabase/database.types.ts:312-395` (courses block), `:508-574` (enrollments block)

**Interfaces:**
- Produces: `courses.sheet_id`, `enrollments.payment_shortfall_pkr`,
  `enrollments.sheet_pending_status`, `enrollments.sheet_pending_note`, `public.sheet_leads` table
  — every later task reads/writes these exact column names.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 0016: Sheet sync columns + sheet_leads
-- Run AFTER 0015. SQL Editor → New query → Run
-- ============================================================

alter table public.courses
  add column sheet_id text;

alter table public.enrollments
  add column payment_shortfall_pkr numeric,
  add column sheet_pending_status public.enrollment_status,
  add column sheet_pending_note text;

create table public.sheet_leads (
  id                     uuid primary key default gen_random_uuid(),
  sheet_id               text not null,
  course_id              uuid not null references public.courses(id),
  row_email              text not null,
  row_name               text,
  row_phone              text,
  payment_confirmation   text not null,
  payment_amount_pkr     numeric,
  raw_row                jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  resolved_at            timestamptz,
  resolved_enrollment_id uuid references public.enrollments(id)
);

alter table public.sheet_leads enable row level security;

create policy "sheet_leads: admin reads"
  on public.sheet_leads
  for select
  using (public.get_my_role() in ('admin', 'super_admin'));

create index sheet_leads_email_idx on public.sheet_leads (row_email) where resolved_at is null;
```

- [ ] **Step 2: Apply the migration**

Via the `mcp__claude_ai_Supabase__apply_migration` tool (or paste into the Supabase SQL Editor if
that tool is unavailable): name it `sheet_sync`, run the SQL above.

- [ ] **Step 3: Verify**

Run: `mcp__claude_ai_Supabase__execute_sql` with
`select column_name from information_schema.columns where table_name = 'enrollments' and column_name like 'sheet%' or column_name = 'payment_shortfall_pkr';`
Expected: 3 rows (`payment_shortfall_pkr`, `sheet_pending_status`, `sheet_pending_note`).

- [ ] **Step 4: Update generated types by hand**

In `src/lib/supabase/database.types.ts`, inside the `courses` block (around line 312), add
`sheet_id: string | null` to `Row`, `sheet_id?: string | null` to `Insert` and `Update` — same
pattern as the adjacent `thumbnail_url` field.

Inside the `enrollments` block (around line 508), add to `Row`:
```ts
payment_shortfall_pkr: number | null
sheet_pending_note: string | null
sheet_pending_status: Database["public"]["Enums"]["enrollment_status"] | null
```
and to both `Insert` and `Update`:
```ts
payment_shortfall_pkr?: number | null
sheet_pending_note?: string | null
sheet_pending_status?: Database["public"]["Enums"]["enrollment_status"] | null
```

Add a new top-level table block, alphabetically before `sheet_leads`'s neighbours (check where
tables are ordered — insert near `s`):
```ts
sheet_leads: {
  Row: {
    course_id: string
    created_at: string
    id: string
    payment_amount_pkr: number | null
    payment_confirmation: string
    raw_row: Json
    resolved_at: string | null
    resolved_enrollment_id: string | null
    row_email: string
    row_name: string | null
    row_phone: string | null
    sheet_id: string
  }
  Insert: {
    course_id: string
    created_at?: string
    id?: string
    payment_amount_pkr?: number | null
    payment_confirmation: string
    raw_row?: Json
    resolved_at?: string | null
    resolved_enrollment_id?: string | null
    row_email: string
    row_name?: string | null
    row_phone?: string | null
    sheet_id: string
  }
  Update: {
    course_id?: string
    created_at?: string
    id?: string
    payment_amount_pkr?: number | null
    payment_confirmation?: string
    raw_row?: Json
    resolved_at?: string | null
    resolved_enrollment_id?: string | null
    row_email?: string
    row_name?: string | null
    row_phone?: string | null
    sheet_id?: string
  }
  Relationships: [
    {
      foreignKeyName: "sheet_leads_course_id_fkey"
      columns: ["course_id"]
      isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "sheet_leads_resolved_enrollment_id_fkey"
      columns: ["resolved_enrollment_id"]
      isOneToOne: false
      referencedRelation: "enrollments"
      referencedColumns: ["id"]
    },
  ]
}
```

- [ ] **Step 5: Confirm the build still compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0016_sheet_sync.sql src/lib/supabase/database.types.ts
git commit -m "feat: add sheet sync columns and sheet_leads table"
```

---

### Task 2: Pure sync rules — rank, downgrade check, row mapping

**Files:**
- Create: `src/lib/validations/sheet-sync.ts`
- Test: `tests/sheet-sync.rules.test.ts`

**Interfaces:**
- Consumes: `Database["public"]["Enums"]["enrollment_status"]` from
  `@/lib/supabase/database.types`.
- Produces: `PAYMENT_CONFIRMATION_VALUES`, `type PaymentConfirmation`,
  `RANK: Record<EnrollmentStatus, number>`, `isDowngrade(current, target): boolean`,
  `mapSheetRow(row: { paymentConfirmation: PaymentConfirmation; amountPkr: number | null }): { status: EnrollmentStatus; paymentAmountPkr: number | null; shortfallPkr: number | null }`
  — every later task that touches status transitions imports these three functions/constants by
  these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/sheet-sync.rules.test.ts
import { describe, it, expect } from "vitest";
import { RANK, isDowngrade, mapSheetRow, PAYMENT_CONFIRMATION_VALUES } from "@/lib/validations/sheet-sync";

describe("RANK", () => {
  it("orders every enrollment_status by access level", () => {
    expect(RANK).toEqual({
      rejected: 0,
      expired: 0,
      pending: 1,
      reserved: 2,
      active: 3,
    });
  });
});

describe("isDowngrade", () => {
  it("is true when the target rank is lower than the current rank", () => {
    expect(isDowngrade("active", "pending")).toBe(true);
    expect(isDowngrade("reserved", "rejected")).toBe(true);
  });

  it("is false when the target rank is equal or higher", () => {
    expect(isDowngrade("pending", "active")).toBe(false);
    expect(isDowngrade("pending", "pending")).toBe(false);
    expect(isDowngrade("rejected", "pending")).toBe(false);
  });

  it("treats expired and rejected as the same rank", () => {
    expect(isDowngrade("rejected", "expired")).toBe(false);
    expect(isDowngrade("expired", "rejected")).toBe(false);
  });
});

describe("mapSheetRow", () => {
  it("maps Paid to active, carrying the amount", () => {
    expect(mapSheetRow({ paymentConfirmation: "Paid", amountPkr: 15000 })).toEqual({
      status: "active",
      paymentAmountPkr: 15000,
      shortfallPkr: null,
    });
  });

  it("maps Pending to pending", () => {
    expect(mapSheetRow({ paymentConfirmation: "Pending", amountPkr: null })).toEqual({
      status: "pending",
      paymentAmountPkr: null,
      shortfallPkr: null,
    });
  });

  it("maps Reserved to reserved", () => {
    expect(mapSheetRow({ paymentConfirmation: "Reserved", amountPkr: 5000 })).toEqual({
      status: "reserved",
      paymentAmountPkr: 5000,
      shortfallPkr: null,
    });
  });

  it("maps Underpaid to pending with the amount moved to shortfallPkr", () => {
    expect(mapSheetRow({ paymentConfirmation: "Underpaid", amountPkr: 2000 })).toEqual({
      status: "pending",
      paymentAmountPkr: null,
      shortfallPkr: 2000,
    });
  });
});

describe("PAYMENT_CONFIRMATION_VALUES", () => {
  it("is exactly the four known sheet dropdown values", () => {
    expect(PAYMENT_CONFIRMATION_VALUES).toEqual(["Paid", "Pending", "Underpaid", "Reserved"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run tests/sheet-sync.rules.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validations/sheet-sync'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/validations/sheet-sync.ts
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

export type EnrollmentStatus = Database["public"]["Enums"]["enrollment_status"];

/**
 * The four values the team's "Payment Confirmation" dropdown currently
 * supports. A 5th value is a follow-up, not handled here.
 */
export const PAYMENT_CONFIRMATION_VALUES = ["Paid", "Pending", "Underpaid", "Reserved"] as const;
export type PaymentConfirmation = (typeof PAYMENT_CONFIRMATION_VALUES)[number];

/**
 * Course-access rank per status. A sheet-driven change is a downgrade if it
 * would lower this number — see isDowngrade. rejected/expired share rank 0:
 * neither grants access, and there is no meaningful "downgrade" between them.
 */
export const RANK: Record<EnrollmentStatus, number> = {
  rejected: 0,
  expired: 0,
  pending: 1,
  reserved: 2,
  active: 3,
};

/**
 * True when applying `target` would lower the student's access below what
 * `current` already grants. Downgrades are never auto-applied from a sheet
 * edit — they're parked on sheet_pending_status until an admin confirms.
 */
export function isDowngrade(current: EnrollmentStatus, target: EnrollmentStatus): boolean {
  return RANK[target] < RANK[current];
}

/**
 * Translates one sheet row into the enrollment fields it implies.
 *
 * `amountPkr` is overloaded by the sheet's single "Amount" column: for every
 * confirmation value except Underpaid it is the amount received, stored on
 * payment_amount_pkr. For Underpaid, the team enters the amount still owed
 * in that same column — it becomes shortfallPkr instead, and
 * payment_amount_pkr is left null (the row doesn't tell us the partial
 * amount actually received, only the gap).
 */
export function mapSheetRow(row: {
  paymentConfirmation: PaymentConfirmation;
  amountPkr: number | null;
}): { status: EnrollmentStatus; paymentAmountPkr: number | null; shortfallPkr: number | null } {
  if (row.paymentConfirmation === "Underpaid") {
    return { status: "pending", paymentAmountPkr: null, shortfallPkr: row.amountPkr };
  }
  const status: EnrollmentStatus =
    row.paymentConfirmation === "Paid"
      ? "active"
      : row.paymentConfirmation === "Reserved"
        ? "reserved"
        : "pending";
  return { status, paymentAmountPkr: row.amountPkr, shortfallPkr: null };
}

const rowSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  paymentConfirmation: z.enum(PAYMENT_CONFIRMATION_VALUES),
  amountPkr: z.number().nonnegative().nullable().optional(),
});

/**
 * Inbound payload from gas/sheets-sync/Code.gs. Both actions carry the same
 * row shape — "newSubmission" is a row GAS has never synced before,
 * "statusChange" is an edit to the Payment Confirmation column on a row
 * GAS has already synced once.
 */
export const sheetSyncWebhookSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("newSubmission"), sheetId: z.string().min(1), row: rowSchema }),
  z.object({ action: z.literal("statusChange"), sheetId: z.string().min(1), row: rowSchema }),
]);

export type SheetSyncWebhookPayload = z.infer<typeof sheetSyncWebhookSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run tests/sheet-sync.rules.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/sheet-sync.ts tests/sheet-sync.rules.test.ts
git commit -m "feat: add sheet sync rank, downgrade, and row-mapping rules"
```

---

### Task 3: Webhook payload schema tests

**Files:**
- Test: `tests/sheet-sync.schema.test.ts`

**Interfaces:**
- Consumes: `sheetSyncWebhookSchema` from Task 2.

- [ ] **Step 1: Write the tests**

```ts
// tests/sheet-sync.schema.test.ts
import { describe, it, expect } from "vitest";
import { sheetSyncWebhookSchema } from "@/lib/validations/sheet-sync";

const validRow = {
  email: "student@example.com",
  name: "Test Student",
  paymentConfirmation: "Paid" as const,
  amountPkr: 15000,
};

describe("sheetSyncWebhookSchema", () => {
  it("accepts a valid newSubmission payload", () => {
    expect(
      sheetSyncWebhookSchema.safeParse({ action: "newSubmission", sheetId: "abc123", row: validRow })
        .success,
    ).toBe(true);
  });

  it("accepts a valid statusChange payload", () => {
    expect(
      sheetSyncWebhookSchema.safeParse({ action: "statusChange", sheetId: "abc123", row: validRow })
        .success,
    ).toBe(true);
  });

  it("rejects an unknown action", () => {
    expect(
      sheetSyncWebhookSchema.safeParse({ action: "delete", sheetId: "abc123", row: validRow })
        .success,
    ).toBe(false);
  });

  it("rejects a missing sheetId", () => {
    expect(sheetSyncWebhookSchema.safeParse({ action: "newSubmission", row: validRow }).success).toBe(
      false,
    );
  });

  it("rejects an invalid email", () => {
    expect(
      sheetSyncWebhookSchema.safeParse({
        action: "newSubmission",
        sheetId: "abc123",
        row: { ...validRow, email: "not-an-email" },
      }).success,
    ).toBe(false);
  });

  it("rejects a paymentConfirmation outside the known four values", () => {
    expect(
      sheetSyncWebhookSchema.safeParse({
        action: "newSubmission",
        sheetId: "abc123",
        row: { ...validRow, paymentConfirmation: "Refunded" },
      }).success,
    ).toBe(false);
  });

  it("accepts a row with no amountPkr", () => {
    const { amountPkr, ...rest } = validRow;
    expect(
      sheetSyncWebhookSchema.safeParse({ action: "newSubmission", sheetId: "abc123", row: rest })
        .success,
    ).toBe(true);
  });

  it("rejects a non-object body", () => {
    expect(sheetSyncWebhookSchema.safeParse(null).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `node_modules/.bin/vitest run tests/sheet-sync.schema.test.ts`
Expected: PASS (8 tests) — the schema already exists from Task 2, so this task is pure
verification of its edge cases plus a regression guard for future changes.

- [ ] **Step 3: Commit**

```bash
git add tests/sheet-sync.schema.test.ts
git commit -m "test: cover sheetSyncWebhookSchema edge cases"
```

---

### Task 4: Outbound GAS client — `pushStatusToSheet`

**Files:**
- Create: `src/lib/gas/sheets-sync-client.ts`

**Interfaces:**
- Produces: `pushStatusToSheet(params: { email: string; status: EnrollmentStatus; shortfallPkr?: number | null }): Promise<void>`
  — imported by `applyEnrollmentStatus` (Task 5) and the webhook route (Task 7). Never throws.

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/gas/sheets-sync-client.ts
import "server-only";
import type { EnrollmentStatus } from "@/lib/validations/sheet-sync";

/**
 * Pushes a confirmed status back to the team's Google Sheet so it never
 * silently drifts from what the app actually has.
 *
 * Fire-and-forget by design: a dead or misconfigured GAS deployment must
 * never block or roll back an in-app enrollment decision. This mirrors
 * sendEnrollmentEmail's "never throw" contract in src/lib/emails/enrollment.ts.
 */
export async function pushStatusToSheet(params: {
  email: string;
  status: EnrollmentStatus;
  shortfallPkr?: number | null;
}): Promise<void> {
  const url = process.env.GAS_SHEETS_SYNC_URL;
  const token = process.env.SHEETS_SYNC_SECRET;
  if (!url || !token) {
    console.warn("[sheets-sync] push skipped: GAS_SHEETS_SYNC_URL or SHEETS_SYNC_SECRET not set");
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        action: "applyStatus",
        email: params.email,
        status: params.status,
        shortfallPkr: params.shortfallPkr ?? null,
      }),
    });
  } catch (error) {
    console.error(`[sheets-sync] failed to push status for ${params.email}:`, error);
  }
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors. (No dedicated test file — this is a thin fire-and-forget network call,
same as `sendEnrollmentEmail`, which also has no unit test in this codebase; it's exercised by the
manual E2E in the final task.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/gas/sheets-sync-client.ts
git commit -m "feat: add outbound GAS client for pushing enrollment status to sheets"
```

---

### Task 5: Extract `applyEnrollmentStatus()` and wire the existing PATCH route to it

**Files:**
- Modify: `src/lib/data/admin-enrollments.ts`
- Modify: `src/app/api/admin/enrollments/[id]/route.ts`

**Interfaces:**
- Consumes: `sendEnrollmentEmail` from `@/lib/emails/enrollment`, `pushStatusToSheet` from Task 4,
  `EnrollmentStatus` from `@/lib/supabase/database.types`.
- Produces:
  ```ts
  export type ApplyStatusResult =
    | { ok: true; id: string; status: EnrollmentStatus }
    | { ok: false; reason: "not-found" | "already-in-status" | "db-error" };

  export async function applyEnrollmentStatus(params: {
    enrollmentId: string;
    targetStatus: EnrollmentStatus;
    verifiedBy: string | null;
    rejectionReason?: string | null;
    clearShortfall?: boolean;
    emailKind?: "approved" | "reserved" | "rejected" | null;
  }): Promise<ApplyStatusResult>
  ```
  Used by the existing PATCH route (this task), the webhook's auto-apply path (Task 7), and the
  confirm/dismiss route (Task 8).

- [ ] **Step 1: Extend the course select to carry `sheet_id`**

In `src/lib/data/admin-enrollments.ts`, change `LIST_SELECT` (line 42) to also select
`courses.sheet_id`:

```ts
const LIST_SELECT = `
  id, status, enrolled_at, payment_amount_pkr, payment_screenshot_url,
  payment_shortfall_pkr, sheet_pending_status, sheet_pending_note,
  student:profiles!enrollments_student_id_fkey (id, full_name, phone),
  course:courses!enrollments_course_id_fkey (id, title, slug, type, sheet_id)
` as const;
```

Update `RawReviewRow` (line 94) to add:
```ts
payment_shortfall_pkr: number | null;
sheet_pending_status: EnrollmentStatus | null;
sheet_pending_note: string | null;
```
and change its `course` field type to include `sheet_id: string | null`.

Update `EnrollmentReviewRow` (line 19) to add the same three top-level fields, and add
`sheetId: string | null` to its `course` object.

Update `toRow()` (line 110) to map the new fields through:
```ts
paymentShortfallPkr: row.payment_shortfall_pkr,
sheetPendingStatus: row.sheet_pending_status,
sheetPendingNote: row.sheet_pending_note,
```
and in the `course` object add `sheetId: row.course?.sheet_id ?? null`.

- [ ] **Step 2: Verify the build still compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: FAIL — `EnrollmentReviewDetail`'s callers don't reference the new fields yet, but the
type change itself should compile clean. If it doesn't, the error will point at the exact
mismatched field — fix it before continuing.

- [ ] **Step 3: Add `applyEnrollmentStatus()`**

Append to `src/lib/data/admin-enrollments.ts`:

```ts
import { sendEnrollmentEmail } from "@/lib/emails/enrollment";
import { pushStatusToSheet } from "@/lib/gas/sheets-sync-client";

export type ApplyStatusResult =
  | { ok: true; id: string; status: EnrollmentStatus }
  | { ok: false; reason: "not-found" | "already-in-status" | "db-error" };

/**
 * The single place that commits an enrollment status transition. Used by the
 * admin PATCH route (a human decision), the sheets-sync webhook's auto-apply
 * path (a non-downgrade sheet edit), and the sheet-sync confirm route (an
 * admin ratifying a parked downgrade) — one whitelist, one email-firing
 * point, one place that pushes the result back to a linked sheet.
 *
 * Column whitelist is deliberate: the "enrollments: admin update" RLS policy
 * (0002) has no WITH CHECK, so an admin-privileged write can touch ANY
 * column. Nothing below the app layer constrains this — it is constrained
 * here.
 */
export async function applyEnrollmentStatus(params: {
  enrollmentId: string;
  targetStatus: EnrollmentStatus;
  verifiedBy: string | null;
  rejectionReason?: string | null;
  clearShortfall?: boolean;
  emailKind?: "approved" | "reserved" | "rejected" | null;
}): Promise<ApplyStatusResult> {
  const enrollment = await getEnrollmentForReview(params.enrollmentId);
  if (!enrollment) return { ok: false, reason: "not-found" };
  if (enrollment.status === params.targetStatus) {
    return { ok: false, reason: "already-in-status" };
  }

  const patch: Record<string, unknown> = {
    status: params.targetStatus,
    verified_by: params.verifiedBy,
    verified_at: new Date().toISOString(),
    rejection_reason: params.rejectionReason ?? null,
    sheet_pending_status: null,
    sheet_pending_note: null,
  };
  if (params.clearShortfall) patch.payment_shortfall_pkr = null;

  const admin = createAdminSupabase();
  const { data: updated, error } = await admin
    .from("enrollments")
    .update(patch)
    .eq("id", params.enrollmentId)
    .select("id, status")
    .single();

  if (error || !updated) return { ok: false, reason: "db-error" };

  if (params.emailKind) {
    await sendEnrollmentEmail(params.emailKind, enrollment.student.email, {
      fullName: enrollment.student.fullName,
      courseTitle: enrollment.course.title,
      courseSlug: enrollment.course.slug,
      rejectionReason: params.rejectionReason ?? null,
    });
  }

  if (enrollment.course.sheetId && enrollment.student.email) {
    await pushStatusToSheet({ email: enrollment.student.email, status: params.targetStatus });
  }

  return { ok: true, id: updated.id, status: updated.status };
}
```

- [ ] **Step 4: Rewrite the PATCH route to delegate**

Replace `src/app/api/admin/enrollments/[id]/route.ts` in full:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { applyEnrollmentStatus } from "@/lib/data/admin-enrollments";
import {
  reviewActionSchema,
  ACTION_TARGET_STATUS,
  composeRejectionReason,
  type ReviewActionName,
} from "@/lib/validations/admin-enrollment";

/** Which enrollment email each action triggers. 'expire' notifies nobody. */
const ACTION_EMAIL = {
  approve: "approved",
  reserve: "reserved",
  reject: "rejected",
  expire: null,
} as const satisfies Record<ReviewActionName, "approved" | "reserved" | "rejected" | null>;

/**
 * Approve / reserve / reject / expire a single enrollment.
 *
 * middleware.ts only role-checks under /dashboard, so this route does its own
 * admin gate — see requireAdmin. The actual transition, email, and sheet push
 * all happen inside applyEnrollmentStatus (src/lib/data/admin-enrollments.ts)
 * — this route's only job is turning a review action into that call's params.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = reviewActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const action = parsed.data;
  const target = ACTION_TARGET_STATUS[action.action];

  const result = await applyEnrollmentStatus({
    enrollmentId: id,
    targetStatus: target,
    verifiedBy: auth.user.id,
    rejectionReason: action.action === "reject" ? composeRejectionReason(action.reason, action.note) : null,
    clearShortfall: true,
    emailKind: ACTION_EMAIL[action.action],
  });

  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
    }
    if (result.reason === "already-in-status") {
      return NextResponse.json({ error: `Enrollment is already ${target}.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update enrollment" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id, status: result.status });
}
```

- [ ] **Step 5: Run the existing schema tests and typecheck**

Run: `node_modules/.bin/vitest run tests/admin-enrollment.schema.test.ts && node_modules/.bin/tsc --noEmit`
Expected: PASS, no type errors. (This route has no existing integration test — verified manually
in the final task, same as it was before this refactor.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/admin-enrollments.ts src/app/api/admin/enrollments/[id]/route.ts
git commit -m "refactor: extract applyEnrollmentStatus for reuse by sheet sync"
```

---

### Task 6: Sheet-sync data functions

**Files:**
- Create: `src/lib/data/sheet-sync.ts`

**Interfaces:**
- Consumes: `createAdminSupabase` from `@/lib/supabase/admin`, `createServerSupabase` from
  `@/lib/supabase/server`.
- Produces:
  ```ts
  export async function getCourseBySheetId(sheetId: string): Promise<{ id: string; slug: string; title: string } | null>
  export async function findStudentIdByEmail(email: string): Promise<string | null>
  export async function insertSheetLead(input: { sheetId: string; courseId: string; email: string; name?: string | null; phone?: string | null; paymentConfirmation: string; amountPkr: number | null; rawRow: unknown }): Promise<void>
  export async function notifyAdminsOfSheetDowngrade(input: { enrollmentId: string; studentName: string; courseTitle: string; from: string; to: string }): Promise<void>
  ```
  Used by the webhook route (Task 7).

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/data/sheet-sync.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Resolves which course a sheet feeds. Null when no course has claimed this sheet_id. */
export async function getCourseBySheetId(
  sheetId: string,
): Promise<{ id: string; slug: string; title: string } | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("courses")
    .select("id, slug, title")
    .eq("sheet_id", sheetId)
    .maybeSingle();
  return data;
}

/**
 * Finds the auth.users id for an email, or null if no account exists yet.
 *
 * auth.admin has no "find by email" call, only paginated listUsers, so this
 * sweeps pages and exits early on a match — the same approach and the same
 * caveat as resolveEmails() in admin-enrollments.ts: replace with a
 * security-definer SQL function if the user table grows past a few thousand.
 */
export async function findStudentIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const target = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;

    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * Stages a submission whose email doesn't match any account yet. Resolved
 * automatically the moment that email signs up — see migration 0017.
 */
export async function insertSheetLead(input: {
  sheetId: string;
  courseId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  paymentConfirmation: string;
  amountPkr: number | null;
  rawRow: unknown;
}): Promise<void> {
  const admin = createAdminSupabase();
  await admin.from("sheet_leads").insert({
    sheet_id: input.sheetId,
    course_id: input.courseId,
    row_email: input.email,
    row_name: input.name ?? null,
    row_phone: input.phone ?? null,
    payment_confirmation: input.paymentConfirmation,
    payment_amount_pkr: input.amountPkr,
    raw_row: input.rawRow as never,
  });
}

/**
 * Notifies every admin/super_admin that a sheet edit requested a downgrade
 * that needs human confirmation. Reuses the existing notifications table —
 * no new notification infrastructure, same insert pattern as the admin
 * broadcast route in src/app/api/admin/notifications/route.ts.
 */
export async function notifyAdminsOfSheetDowngrade(input: {
  enrollmentId: string;
  studentName: string;
  courseTitle: string;
  from: string;
  to: string;
}): Promise<void> {
  const admin = createAdminSupabase();
  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .in("role", ["admin", "super_admin"]);

  const recipientIds = (admins ?? []).map((row) => row.id);
  if (recipientIds.length === 0) return;

  const rows = recipientIds.map((userId) => ({
    user_id: userId,
    type: "sheet_sync_pending",
    title: "Sheet requests a downgrade",
    body: `${input.studentName} — ${input.courseTitle}: sheet requests ${input.from} → ${input.to}. Review before it takes effect.`,
    link: `/dashboard/admin/enrollments/${input.enrollmentId}`,
  }));

  await admin.from("notifications").insert(rows);
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/sheet-sync.ts
git commit -m "feat: add sheet-sync data functions for course/student lookup and lead staging"
```

---

### Task 7: Add `shortfall` and `leadWelcome` email kinds

**Files:**
- Modify: `src/lib/emails/enrollment.ts`

**Interfaces:**
- Produces: `sendEnrollmentEmail("shortfall" | "leadWelcome", to, ctx)` — `ctx` gains one optional
  field `shortfallPkr?: number | null`, read only by the `shortfall` kind.

- [ ] **Step 1: Extend the context type and kind union**

In `src/lib/emails/enrollment.ts`, change:
```ts
export interface EnrollmentEmailContext {
  fullName: string;
  courseTitle: string;
  courseSlug: string;
  /** Only read by the "rejected" email. */
  rejectionReason?: string | null;
  /** Only read by the "shortfall" email. */
  shortfallPkr?: number | null;
}

type EnrollmentEmailKind = "received" | "approved" | "reserved" | "rejected" | "shortfall" | "leadWelcome";
```

- [ ] **Step 2: Add the two new cases to `buildEmail`**

Add before the closing brace of the `switch` in `buildEmail` (after the `"rejected"` case):

```ts
    case "shortfall":
      return {
        subject: `Additional payment needed — ${ctx.courseTitle}`,
        html: shell({
          title: "Additional payment needed",
          heading: "A Balance Is Still Due",
          accent: COLORS.gold,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`We received a partial payment for ${course}.`) +
            p(
              `<strong>Rs. ${(ctx.shortfallPkr ?? 0).toLocaleString("en-GB")}</strong> is still due to complete your enrollment.`,
            ) +
            p("Your seat is held, but course content unlocks once the remaining amount is confirmed."),
          cta: { label: "Complete Payment", href: `${APP_URL}/enroll/${ctx.courseSlug}` },
        }),
      };

    case "leadWelcome":
      return {
        subject: `Create your account to access ${ctx.courseTitle}`,
        html: shell({
          title: "Create your account",
          heading: "Almost There",
          accent: COLORS.deepGreen,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`We received your submission for ${course}.`) +
            p(
              "To access the course, create your PZ Academy account with this same email address.",
            ) +
            p(
              "Already have an account under a different email? Reply to this email or message us on WhatsApp and we'll link it up.",
            ),
          cta: { label: "Create Your Account", href: `${APP_URL}/register` },
        }),
      };
```

- [ ] **Step 3: Verify the build compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors — the `switch` in `buildEmail` is over `EnrollmentEmailKind`, so a missing
case would have been a type error given the function's declared return type covers every branch.

- [ ] **Step 4: Commit**

```bash
git add src/lib/emails/enrollment.ts
git commit -m "feat: add shortfall and lead-welcome enrollment emails"
```

---

### Task 8: Inbound webhook — `POST /api/webhooks/sheets-sync`

**Files:**
- Create: `src/app/api/webhooks/sheets-sync/route.ts`

**Interfaces:**
- Consumes: `sheetSyncWebhookSchema`, `mapSheetRow`, `isDowngrade` (Task 2);
  `getCourseBySheetId`, `findStudentIdByEmail`, `insertSheetLead`,
  `notifyAdminsOfSheetDowngrade` (Task 6); `applyEnrollmentStatus` (Task 5);
  `sendEnrollmentEmail` (Task 7); `pushStatusToSheet` (Task 4).
- Produces: the route itself — no other task imports from it.

- [ ] **Step 1: Write the implementation**

```ts
// src/app/api/webhooks/sheets-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sheetSyncWebhookSchema, mapSheetRow, isDowngrade } from "@/lib/validations/sheet-sync";
import {
  getCourseBySheetId,
  findStudentIdByEmail,
  insertSheetLead,
  notifyAdminsOfSheetDowngrade,
} from "@/lib/data/sheet-sync";
import { applyEnrollmentStatus } from "@/lib/data/admin-enrollments";
import { sendEnrollmentEmail } from "@/lib/emails/enrollment";
import { pushStatusToSheet } from "@/lib/gas/sheets-sync-client";

/**
 * Receives new-submission and status-change events from gas/sheets-sync/Code.gs.
 *
 * Token check happens before any DB access, mirroring the ordering already
 * used by gas/payment-screenshots/Code.gs's inbound counterpart — an
 * unauthenticated caller must never cause a read or write.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || body.token !== process.env.SHEETS_SYNC_SECRET) {
    return NextResponse.json({ status: "error", message: "Wrong password." });
  }

  const parsed = sheetSyncWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid input" });
  }
  const { action, sheetId, row } = parsed.data;

  const course = await getCourseBySheetId(sheetId);
  if (!course) {
    return NextResponse.json({ status: "error", message: `No course maps to sheet ${sheetId}` });
  }

  const mapped = mapSheetRow({ paymentConfirmation: row.paymentConfirmation, amountPkr: row.amountPkr ?? null });
  const studentId = await findStudentIdByEmail(row.email);

  if (!studentId) {
    // No account yet — stage the row and invite them to sign up. This is the
    // only path for a genuinely new lead; existing enrollments always have a
    // matching account already, since the direct-enrollment pipeline
    // requires being signed in.
    await insertSheetLead({
      sheetId,
      courseId: course.id,
      email: row.email,
      name: row.name ?? null,
      phone: row.phone ?? null,
      paymentConfirmation: row.paymentConfirmation,
      amountPkr: row.amountPkr ?? null,
      rawRow: row,
    });
    await sendEnrollmentEmail("leadWelcome", row.email, {
      fullName: row.name ?? "",
      courseTitle: course.title,
      courseSlug: course.slug,
    });
    return NextResponse.json({ status: "success", message: "Staged as a lead" });
  }

  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("enrollments")
    .select("id, status")
    .eq("student_id", studentId)
    .eq("course_id", course.id)
    .maybeSingle();

  if (!existing) {
    // Brand-new (student, course) pair — insert directly. There is no prior
    // status to compare against, so the downgrade rule doesn't apply here.
    const { data: created, error } = await admin
      .from("enrollments")
      .insert({
        student_id: studentId,
        course_id: course.id,
        status: mapped.status,
        payment_amount_pkr: mapped.paymentAmountPkr,
        payment_shortfall_pkr: mapped.shortfallPkr,
        verified_at: mapped.status !== "pending" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error || !created) {
      return NextResponse.json({ status: "error", message: "Could not create enrollment" });
    }

    const emailKind =
      mapped.status === "active" ? "approved" : mapped.status === "reserved" ? "reserved" : null;
    if (emailKind) {
      await sendEnrollmentEmail(emailKind, row.email, {
        fullName: row.name ?? "",
        courseTitle: course.title,
        courseSlug: course.slug,
      });
    } else if (mapped.shortfallPkr != null) {
      await sendEnrollmentEmail("shortfall", row.email, {
        fullName: row.name ?? "",
        courseTitle: course.title,
        courseSlug: course.slug,
        shortfallPkr: mapped.shortfallPkr,
      });
    }

    await pushStatusToSheet({ email: row.email, status: mapped.status, shortfallPkr: mapped.shortfallPkr });
    return NextResponse.json({ status: "success", message: "Enrollment created" });
  }

  // An enrollment already exists for this (student, course) pair — this is
  // effectively a status-change event regardless of which `action` GAS sent,
  // so the same downgrade rule always applies.
  if (isDowngrade(existing.status, mapped.status)) {
    await admin
      .from("enrollments")
      .update({
        sheet_pending_status: mapped.status,
        sheet_pending_note: `Sheet requested: ${existing.status} → ${mapped.status}`,
      })
      .eq("id", existing.id)
      .neq("sheet_pending_status", mapped.status); // don't re-notify for the same pending request

    await notifyAdminsOfSheetDowngrade({
      enrollmentId: existing.id,
      studentName: row.name || row.email,
      courseTitle: course.title,
      from: existing.status,
      to: mapped.status,
    });
    return NextResponse.json({ status: "success", message: "Downgrade parked for admin confirmation" });
  }

  const emailKind =
    mapped.status === "active" ? "approved" : mapped.status === "reserved" ? "reserved" : null;

  const result = await applyEnrollmentStatus({
    enrollmentId: existing.id,
    targetStatus: mapped.status,
    verifiedBy: null,
    clearShortfall: mapped.shortfallPkr == null,
    emailKind,
  });

  if (!result.ok) {
    return NextResponse.json({ status: "success", message: `No change (${result.reason})` });
  }

  if (mapped.shortfallPkr != null) {
    await admin
      .from("enrollments")
      .update({ payment_shortfall_pkr: mapped.shortfallPkr })
      .eq("id", existing.id);
    await sendEnrollmentEmail("shortfall", row.email, {
      fullName: row.name ?? "",
      courseTitle: course.title,
      courseSlug: course.slug,
      shortfallPkr: mapped.shortfallPkr,
    });
  }

  return NextResponse.json({ status: "success", message: "Enrollment updated" });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/sheets-sync/route.ts
git commit -m "feat: add inbound sheets-sync webhook"
```

---

### Task 9: Admin confirm/dismiss route for a parked downgrade

**Files:**
- Create: `src/app/api/admin/enrollments/[id]/sheet-sync/route.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/auth/require-admin`; `applyEnrollmentStatus`,
  `getEnrollmentForReview` from `@/lib/data/admin-enrollments`; `pushStatusToSheet` from Task 4.

- [ ] **Step 1: Write the implementation**

```ts
// src/app/api/admin/enrollments/[id]/sheet-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { applyEnrollmentStatus, getEnrollmentForReview } from "@/lib/data/admin-enrollments";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { pushStatusToSheet } from "@/lib/gas/sheets-sync-client";

const bodySchema = z.object({ decision: z.enum(["confirm", "dismiss"]) });

/**
 * Resolves a sheet-requested downgrade parked on sheet_pending_status.
 *
 * confirm: applies the requested status for real, through the same
 * applyEnrollmentStatus() every other transition in this codebase uses.
 * dismiss: clears the parked fields without changing status, then pushes
 * the enrollment's UNCHANGED current status back to the sheet — correcting
 * the stray cell rather than leaving it visibly wrong.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const enrollment = await getEnrollmentForReview(id);
  if (!enrollment) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }
  if (!enrollment.sheetPendingStatus) {
    return NextResponse.json({ error: "No pending sheet request on this enrollment" }, { status: 409 });
  }

  if (parsed.data.decision === "dismiss") {
    const admin = createAdminSupabase();
    await admin
      .from("enrollments")
      .update({ sheet_pending_status: null, sheet_pending_note: null })
      .eq("id", id);

    if (enrollment.course.sheetId && enrollment.student.email) {
      await pushStatusToSheet({ email: enrollment.student.email, status: enrollment.status });
    }
    return NextResponse.json({ id, status: enrollment.status });
  }

  const result = await applyEnrollmentStatus({
    enrollmentId: id,
    targetStatus: enrollment.sheetPendingStatus,
    verifiedBy: auth.user.id,
    clearShortfall: true,
    emailKind: null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Could not apply the sheet-requested status" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id, status: result.status });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/enrollments/[id]/sheet-sync/route.ts
git commit -m "feat: add admin confirm/dismiss route for parked sheet downgrades"
```

---

### Task 10: `SheetPendingBanner` + wiring into the admin enrollment pages

**Files:**
- Create: `src/components/admin/SheetPendingBanner.tsx`
- Modify: `src/app/dashboard/admin/enrollments/[id]/page.tsx`
- Modify: `src/app/dashboard/admin/enrollments/page.tsx`

**Interfaces:**
- Consumes: `EnrollmentReviewRow`/`EnrollmentReviewDetail`'s new `sheetPendingStatus`,
  `sheetPendingNote`, `paymentShortfallPkr` fields (Task 5).
- Produces: `<SheetPendingBanner enrollmentId status pendingStatus note />` — a client component,
  no other task imports it.

- [ ] **Step 1: Write the component**

```tsx
// src/components/admin/SheetPendingBanner.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

export function SheetPendingBanner({
  enrollmentId,
  note,
}: {
  enrollmentId: string;
  note: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function decide(decision: "confirm" | "dismiss") {
    startTransition(async () => {
      const res = await fetch(`/api/admin/enrollments/${enrollmentId}/sheet-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not apply this decision.");
        return;
      }
      toast.success(decision === "confirm" ? "Sheet request applied." : "Sheet request dismissed.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pz-gold/40 bg-pz-gold/10 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4.5 h-4.5 text-pz-gold shrink-0 mt-0.5" />
        <p className="font-body text-sm text-pz-on-surface">{note}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={isPending}
          onClick={() => decide("dismiss")}
          className="px-3 py-1.5 rounded-lg font-headline text-xs font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => decide("confirm")}
          className="px-3 py-1.5 rounded-lg font-headline text-xs font-semibold bg-pz-gold text-white hover:bg-pz-gold/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Working…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount it on the detail page**

In `src/app/dashboard/admin/enrollments/[id]/page.tsx`, add the import:
```ts
import { SheetPendingBanner } from "@/components/admin/SheetPendingBanner";
```
and render it right after the header block (after the closing `</div>` that contains the
`<h1>`/badge/course line, before the `grid grid-cols-1 lg:grid-cols-5` div):
```tsx
{enrollment.sheetPendingStatus && (
  <SheetPendingBanner
    enrollmentId={enrollment.id}
    note={enrollment.sheetPendingNote ?? "The sheet requests a status change."}
  />
)}
```

- [ ] **Step 3: Add a shortfall badge to the list row**

In `src/app/dashboard/admin/enrollments/page.tsx`, inside the "Status" `<td>` (the one rendering
`<EnrollmentStatusBadge status={enrollment.status} />`), add directly after it:
```tsx
{enrollment.paymentShortfallPkr != null && (
  <span className="block mt-1 font-body text-[11px] font-semibold text-pz-gold">
    Rs. {enrollment.paymentShortfallPkr.toLocaleString("en-GB")} short
  </span>
)}
{enrollment.sheetPendingStatus && (
  <span className="block mt-1 font-body text-[11px] font-semibold text-pz-danger">
    Sheet: → {enrollment.sheetPendingStatus}
  </span>
)}
```

- [ ] **Step 4: Verify the build compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/SheetPendingBanner.tsx src/app/dashboard/admin/enrollments/page.tsx src/app/dashboard/admin/enrollments/[id]/page.tsx
git commit -m "feat: surface parked sheet downgrades and shortfalls in the admin panel"
```

---

### Task 11: Shortfall-aware pending copy on `EnrollmentStatusScreen`

**Files:**
- Modify: `src/components/lms/EnrollmentStatusScreen.tsx`
- Modify: `src/app/portal/[slug]/page.tsx`
- Modify: `src/app/portal/[slug]/lessons/[lessonId]/page.tsx`

**Interfaces:**
- Produces: `<EnrollmentStatusScreen variant courseTitle shortfallPkr? />` — `shortfallPkr` is a
  new optional prop, backward compatible with every existing call site.

- [ ] **Step 1: Thread an optional `shortfallPkr` through the component**

In `src/components/lms/EnrollmentStatusScreen.tsx`, change the `pending` variant's `body` to
accept a second argument, and the config type/props to carry it:

```ts
interface VariantConfig {
  icon: LucideIcon;
  iconWrap: string;
  iconColor: string;
  title: string;
  body: (courseTitle: React.ReactNode, shortfallPkr?: number | null) => React.ReactNode;
}
```

Replace the `pending` entry's `body`:
```ts
  pending: {
    icon: Clock,
    iconWrap: "bg-pz-warning/15",
    iconColor: "text-pz-warning",
    title: "Awaiting Verification",
    body: (course, shortfallPkr) =>
      shortfallPkr ? (
        <>
          We received a partial payment for {course} — Rs. {shortfallPkr.toLocaleString("en-GB")}{" "}
          is still due. Course content unlocks once the balance is confirmed.
        </>
      ) : (
        <>
          Your enrollment in {course} is being reviewed. You&apos;ll get an email once your payment
          is verified (usually within 24–48 hours), and the course content will unlock here.
        </>
      ),
  },
```

Update every other variant's `body` signature to accept the unused second parameter (TypeScript
requires matching arity only if you call it positionally with two args everywhere, which the
render call below does) — actually, since `Record<Variant, VariantConfig>` requires every entry
to satisfy the same `body` type, add `_shortfallPkr?: number | null` as an ignored second
parameter to the other four variants' arrow functions (`reserved`, `rejected`, `expired`) — e.g.
`body: (course) => (...)` stays valid in JS/TS since extra call-site arguments to a function
expecting fewer parameters are allowed; **no change needed** for the other three variants.

Update the component's props and render call:
```ts
interface EnrollmentStatusScreenProps {
  variant: Variant;
  courseTitle: string;
  shortfallPkr?: number | null;
}

export function EnrollmentStatusScreen({ variant, courseTitle, shortfallPkr }: EnrollmentStatusScreenProps) {
  const { icon: Icon, iconWrap, iconColor, title, body } = VARIANTS[variant];
  const course = (
    <span className="font-semibold text-pz-ink dark:text-[#e0e3df]">{courseTitle}</span>
  );
  // ...
  <p className="text-pz-muted dark:text-[#c1c6d5] text-sm mt-2">{body(course, shortfallPkr)}</p>
  // ...
}
```

- [ ] **Step 2: Pass the enrollment's shortfall through from the portal pages**

In `src/app/portal/[slug]/page.tsx` and `src/app/portal/[slug]/lessons/[lessonId]/page.tsx`, find
the `if (status !== "active") return <EnrollmentStatusScreen variant={status} ... />` line and add
`shortfallPkr={enrollment.paymentShortfallPkr}` to the JSX — check the exact prop name the
enrollment object already exposes at that call site (it comes from whatever data function loads
the enrollment for these pages; if that function doesn't currently select
`payment_shortfall_pkr`, add it to its select list and mapped return object, following the same
snake_case→camelCase convention as every other data module in `src/lib/data/`).

- [ ] **Step 3: Verify the build compiles**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/lms/EnrollmentStatusScreen.tsx src/app/portal/[slug]/page.tsx "src/app/portal/[slug]/lessons/[lessonId]/page.tsx"
git commit -m "feat: show the payment shortfall on the pending enrollment screen"
```

---

### Task 12: Auto-resolve a `sheet_leads` row when its email signs up

**Files:**
- Create: `supabase/migrations/0017_sheet_lead_resolution.sql`

**Interfaces:**
- Produces: extends the existing `handle_new_user()` trigger function. No TypeScript consumes
  this — it's pure database behavior, verified manually in Task 14.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 0017: Auto-resolve sheet_leads on signup
-- Run AFTER 0016. SQL Editor → New query → Run
-- ============================================================
-- Extends handle_new_user (0003) so a lead staged by the sheets-sync webhook
-- (no matching account at submission time) becomes a real enrollment the
-- instant that email creates an account — no manual admin step.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead sheet_leads%rowtype;
  v_status enrollment_status;
begin
  insert into public.profiles (id, role, full_name, phone, profession, city)
  values (
    new.id,
    'student',
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'profession',
    new.raw_user_meta_data->>'city'
  );

  for v_lead in
    select * from public.sheet_leads
    where lower(row_email) = lower(new.email) and resolved_at is null
  loop
    v_status := case v_lead.payment_confirmation
      when 'Paid' then 'active'
      when 'Reserved' then 'reserved'
      else 'pending'
    end;

    insert into public.enrollments (student_id, course_id, status, payment_amount_pkr, payment_shortfall_pkr, verified_at)
    values (
      new.id,
      v_lead.course_id,
      v_status,
      case when v_lead.payment_confirmation <> 'Underpaid' then v_lead.payment_amount_pkr else null end,
      case when v_lead.payment_confirmation = 'Underpaid' then v_lead.payment_amount_pkr else null end,
      case when v_status <> 'pending' then now() else null end
    )
    on conflict (student_id, course_id) do nothing
    returning id into v_lead.resolved_enrollment_id;

    update public.sheet_leads
    set resolved_at = now(), resolved_enrollment_id = v_lead.resolved_enrollment_id
    where id = v_lead.id;
  end loop;

  return new;
end;
$$;
```

Note this reuses the existing `on_auth_user_created` trigger (0003) unchanged — only the function
body it calls is replaced, so no `create trigger` statement is needed here.

- [ ] **Step 2: Apply the migration**

Via `mcp__claude_ai_Supabase__apply_migration`, name `sheet_lead_resolution`.

- [ ] **Step 3: Verify with a disposable account**

Run via `mcp__claude_ai_Supabase__execute_sql`:
```sql
insert into public.sheet_leads (sheet_id, course_id, row_email, payment_confirmation, payment_amount_pkr)
values ('test-sheet', (select id from public.courses limit 1), 'lead-test@pharmacozyme.test', 'Paid', 15000);
```
Then create a disposable auth user with that same email via the Admin API
(`supabase.auth.admin.createUser({ email: "lead-test@pharmacozyme.test", email_confirm: true })`),
then query:
```sql
select resolved_at, resolved_enrollment_id from public.sheet_leads where row_email = 'lead-test@pharmacozyme.test';
select status from public.enrollments where student_id = '<the new user id>';
```
Expected: `resolved_at` is set, `status` is `active`. Delete the disposable user and the
`sheet_leads`/`enrollments` rows afterward.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0017_sheet_lead_resolution.sql
git commit -m "feat: auto-resolve staged sheet leads when their email signs up"
```

---

### Task 13: GAS script — `gas/sheets-sync/Code.gs`

**Files:**
- Create: `gas/sheets-sync/Code.gs`

**Interfaces:**
- Produces: the deployed GAS web app that Tasks 8/9's routes exchange payloads with. Nothing in
  the Next.js app imports this file directly — it's deployed independently.

- [ ] **Step 1: Write the script**

```js
/**
 * PZ Academy — Sheets Sync bridge.
 *
 * Bound to a single batch's Google Sheet (Extensions -> Apps Script from
 * within that sheet). Reacts to edits and keeps Supabase in sync in both
 * directions.
 *
 * One-time setup per sheet:
 *   1. Extensions -> Apps Script, paste this file in.
 *   2. Project Settings -> Script Properties, add:
 *        SYNC_SECRET            = <same value as SHEETS_SYNC_SECRET in .env.local>
 *        WEBHOOK_URL             = https://<your-domain>/api/webhooks/sheets-sync
 *        SHEET_ID                = <this sheet's spreadsheet ID>
 *        COL_EMAIL               = <exact header text of the email column>
 *        COL_NAME                = <exact header text of the name column>       (optional)
 *        COL_PHONE               = <exact header text of the phone column>      (optional)
 *        COL_PAYMENT_CONFIRMATION = <exact header text of the dropdown column>
 *        COL_AMOUNT              = <exact header text of the amount column>
 *   3. Triggers (clock icon in the left sidebar) -> Add Trigger -> onEdit ->
 *      From spreadsheet -> On edit -> Save. This MUST be an installable
 *      trigger, not the automatic simple trigger — UrlFetchApp calls are not
 *      allowed from simple triggers.
 *   4. Deploy -> New deployment -> Web app -> Execute as "Me", access
 *      "Anyone" -> copy the /exec URL into .env.local as GAS_SHEETS_SYNC_URL.
 *   5. This script auto-creates two tracking columns ("SyncedAt",
 *      "AppSyncValue") at the end of row 1 the first time it runs, if they
 *      don't already exist. Do not delete them — they are how the script
 *      tells "a fresh submission" apart from "our own outbound write landing
 *      back as an edit" (which must NOT re-fire the webhook).
 */

const TRACKING_COLUMNS = ["SyncedAt", "AppSyncValue"];

function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const props = PropertiesService.getScriptProperties();

    ensureTrackingColumns_(sheet, headerRow, props);

    const editedRow = e.range.getRow();
    if (editedRow === 1) return; // header row

    const confirmationCol = headerIndex_(headerRow, props.getProperty("COL_PAYMENT_CONFIRMATION"));
    const syncedAtCol = headerIndex_(headerRow, "SyncedAt");
    const appSyncValueCol = headerIndex_(headerRow, "AppSyncValue");
    if (confirmationCol === -1) return;

    const editedCol = e.range.getColumn();
    // Only react to an edit that touches the Payment Confirmation column, or
    // a brand-new row that has never been synced at all.
    const syncedAt = sheet.getRange(editedRow, syncedAtCol + 1).getValue();
    const isNewRow = !syncedAt;
    if (!isNewRow && editedCol !== confirmationCol + 1) return;

    const confirmationValue = sheet.getRange(editedRow, confirmationCol + 1).getValue();
    if (!confirmationValue) return;

    // Loop guard: if this exact value is what the app itself last pushed,
    // this edit IS our own outbound write echoing back — skip it.
    const lastAppValue = sheet.getRange(editedRow, appSyncValueCol + 1).getValue();
    if (!isNewRow && confirmationValue === lastAppValue) return;

    const row = readRow_(sheet, editedRow, headerRow, props);
    const payload = {
      token: props.getProperty("SYNC_SECRET"),
      action: isNewRow ? "newSubmission" : "statusChange",
      sheetId: props.getProperty("SHEET_ID"),
      row: row,
    };

    UrlFetchApp.fetch(props.getProperty("WEBHOOK_URL"), {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    sheet.getRange(editedRow, syncedAtCol + 1).setValue(new Date());
  } catch (err) {
    // onEdit errors are otherwise silent to the user — log so they show up
    // in the Apps Script executions dashboard.
    console.error(String(err));
  }
}

/** Inbound: the Next.js app pushing a confirmed status back to this sheet. */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ status: "error", message: "Invalid JSON body" });
  }

  const props = PropertiesService.getScriptProperties();
  if (!body || body.token !== props.getProperty("SYNC_SECRET")) {
    return jsonResponse_({ status: "error", message: "Wrong password." });
  }

  if (body.action !== "applyStatus") {
    return jsonResponse_({ status: "error", message: "Unknown action: " + body.action });
  }

  try {
    const sheet = SpreadsheetApp.openById(props.getProperty("SHEET_ID")).getSheets()[0];
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const emailCol = headerIndex_(headerRow, props.getProperty("COL_EMAIL"));
    const confirmationCol = headerIndex_(headerRow, props.getProperty("COL_PAYMENT_CONFIRMATION"));
    const appSyncValueCol = headerIndex_(headerRow, "AppSyncValue");

    const emails = sheet.getRange(2, emailCol + 1, sheet.getLastRow() - 1, 1).getValues();
    const targetRow = emails.findIndex(
      (r) => String(r[0]).trim().toLowerCase() === String(body.email).trim().toLowerCase(),
    );
    if (targetRow === -1) {
      return jsonResponse_({ status: "error", message: "No row found for that email" });
    }

    const sheetRow = targetRow + 2; // +1 for header, +1 for 0-index
    const display = displayValueForStatus_(body.status);
    sheet.getRange(sheetRow, confirmationCol + 1).setValue(display);
    sheet.getRange(sheetRow, appSyncValueCol + 1).setValue(display);

    return jsonResponse_({ status: "success", message: "Sheet updated" });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

/** Maps our enrollment_status back to the sheet's own dropdown wording. */
function displayValueForStatus_(status) {
  if (status === "active") return "Paid";
  if (status === "reserved") return "Reserved";
  return "Pending"; // pending, rejected, expired all read as Pending on the sheet
}

function headerIndex_(headerRow, headerText) {
  if (!headerText) return -1;
  return headerRow.indexOf(headerText);
}

function readRow_(sheet, rowNum, headerRow, props) {
  const emailCol = headerIndex_(headerRow, props.getProperty("COL_EMAIL"));
  const nameCol = headerIndex_(headerRow, props.getProperty("COL_NAME"));
  const phoneCol = headerIndex_(headerRow, props.getProperty("COL_PHONE"));
  const confirmationCol = headerIndex_(headerRow, props.getProperty("COL_PAYMENT_CONFIRMATION"));
  const amountCol = headerIndex_(headerRow, props.getProperty("COL_AMOUNT"));

  const rowValues = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
  return {
    email: emailCol !== -1 ? String(rowValues[emailCol]).trim() : "",
    name: nameCol !== -1 ? String(rowValues[nameCol]).trim() : undefined,
    phone: phoneCol !== -1 ? String(rowValues[phoneCol]).trim() : undefined,
    paymentConfirmation: confirmationCol !== -1 ? String(rowValues[confirmationCol]).trim() : "",
    amountPkr: amountCol !== -1 && rowValues[amountCol] !== "" ? Number(rowValues[amountCol]) : null,
  };
}

/** Appends the two tracking columns if this sheet doesn't already have them. */
function ensureTrackingColumns_(sheet, headerRow, props) {
  let lastCol = sheet.getLastColumn();
  let changed = false;
  for (const name of TRACKING_COLUMNS) {
    if (headerRow.indexOf(name) === -1) {
      lastCol += 1;
      sheet.getRange(1, lastCol).setValue(name);
      headerRow.push(name);
      changed = true;
    }
  }
  if (changed) SpreadsheetApp.flush();
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 2: Commit**

```bash
git add gas/sheets-sync/Code.gs
git commit -m "feat: add sheets-sync GAS script"
```

---

### Task 14: Env vars and end-to-end verification

**Files:**
- Modify: `.env.local` (values, not committed — this repo's `.env.local` is gitignored)

**Interfaces:** none — this task wires deployed values together and verifies the whole chain.

- [ ] **Step 1: Set env vars**

Add to `.env.local`:
```
SHEETS_SYNC_SECRET=<same long random string used as SYNC_SECRET in the GAS script properties>
GAS_SHEETS_SYNC_URL=<the /exec URL from Task 13's deployment>
```

- [ ] **Step 2: Point a course at the sheet**

Via `mcp__claude_ai_Supabase__execute_sql`:
```sql
update public.courses set sheet_id = '1OEl4BIi53bsecA562n7fci659r6I6umBj2cG-t4Bc' where slug = '<the PPC B3 course slug>';
```

- [ ] **Step 3: Manual E2E against a disposable row on the real sheet**

**This is a real, shared, in-use team sheet — label the test row clearly and delete it
immediately after.**

1. Add a new row with a disposable email (e.g. a `*@pharmacozyme.test` address you also register
   a Supabase account for) and Payment Confirmation left as `Pending`.
2. Confirm: an `enrollments` row appears with `status = 'pending'`.
3. Flip the dropdown to `Paid`. Confirm: the enrollment flips to `active`, the approval email
   sends (check via Brevo's `GET /v3/smtp/statistics/events?email=...`), and lesson 1 unlocks.
4. Flip the dropdown back to `Pending` (a downgrade). Confirm: the enrollment's `status` stays
   `active`, `sheet_pending_status` is now `pending`, an admin notification appears, and the
   detail page at `/dashboard/admin/enrollments/<id>` shows the `SheetPendingBanner`.
5. Click **Dismiss**. Confirm: the banner disappears, `status` is still `active`, and the sheet's
   Payment Confirmation cell flips back to `Paid` on its own (the corrective push).
6. Repeat steps 3-4 but click **Confirm** instead. Confirm: `status` becomes `pending` for real.
7. Flip the dropdown to `Underpaid` with an amount in the Amount column. Confirm:
   `payment_shortfall_pkr` is set, the shortfall email sends, and the admin list shows the "Rs. X
   short" badge.
8. Delete the disposable row from the sheet and the corresponding Supabase rows
   (`enrollments`, `sheet_leads` if any, `auth.users`).

- [ ] **Step 4: Full test suite and build**

Run: `node_modules/.bin/vitest run && node_modules/.bin/tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit** (only if any fixes were needed during verification)

```bash
git add -A
git commit -m "fix: address issues found during sheets-sync E2E verification"
```

---

## Self-Review

**Spec coverage:**
- Architecture diagram → Tasks 4, 7, 8, 13 (webhook, GAS script, outbound client).
- Data model (columns + `sheet_leads`) → Task 1.
- Status mapping table → `mapSheetRow` in Task 2.
- Downgrade rule → `isDowngrade` (Task 2) + webhook branch (Task 8) + confirm/dismiss route
  (Task 9) + `SheetPendingBanner` (Task 10).
- Identity resolution (email match, lead staging, no-account email) → Tasks 6, 8.
- Auto-resolving a lead on signup → Task 12.
- GAS script (onEdit, doPost applyStatus, loop breaker) → Task 13.
- Underpaid/shortfall handling → Tasks 2, 7, 8, 10, 11.
- Testing section → Tasks 2, 3 (automated), Task 12 step 3 and Task 14 step 3 (manual, since this
  spans a real external Google Sheet no test harness can simulate).
- Rollout steps → Task 14 (env vars, course mapping); the B2→B3 content copy and disabling any
  legacy sheet automation remain manual/out-of-code exactly as the spec's Non-goals state.

**Placeholder scan:** no TBD/TODO; every step has literal code or an exact SQL/CLI command.

**Type consistency check:** `EnrollmentStatus` (Task 2) matches
`Database["public"]["Enums"]["enrollment_status"]` used throughout; `applyEnrollmentStatus`'s
signature in Task 5 is used identically in Tasks 8 and 9; `mapSheetRow`'s return shape
(`status`/`paymentAmountPkr`/`shortfallPkr`) is consumed the same way in Task 8's both branches;
`pushStatusToSheet`'s params match its Task 4 definition everywhere it's called (Tasks 5, 8, 9).
