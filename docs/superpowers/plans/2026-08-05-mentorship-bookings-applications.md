# Mentorship Bookings & Applications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dual-write both mentorship forms (booking, mentor recruitment) into Supabase alongside the existing Google Sheets, add a dedicated Sheet↔Supabase sync bridge, an admin review screen, and student-facing status views — without touching how the two existing Sheets work today or exposing the platform to real students.

**Architecture:** Two new Supabase tables (`mentorship_bookings`, `mentor_applications`) written by two new public API routes that sit in front of the existing GAS Web Apps (form → platform route → Supabase insert + GAS forward, so the Sheet still gets every row exactly as before). A brand-new, dedicated GAS project (`gas/mentorship-sync`) mirrors two fixed Sheets' Status columns back into Supabase on hand-edit, and a matching TS client pushes admin-driven status changes back out to the Sheets. DB triggers produce in-app notifications; a new email module sends the matching transactional emails. An admin review page and two student dashboard pages complete the loop.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS + `SECURITY DEFINER` triggers), Zod, Google Apps Script, Vitest.

## Global Constraints

- Source of truth: `docs/superpowers/specs/2026-08-05-mentorship-bookings-applications-design.md` — every task below implements a section of it; do not deviate without flagging it.
- **Never touch the standalone Mentorship Portal repo or its live deployment.** This plan only modifies `pz-academy-platform`.
- **Sheets stay the team's system of record.** Every write lands in Supabase *and* is still forwarded to the existing GAS Web Apps exactly as today — never Supabase-only.
- **No changes to `src/lib/mentorship/mentors.ts`.** Approving a mentor application never auto-publishes to the live `/mentorship` list — that file stays the static, hand-edited source it is today.
- **No changes to existing tables/enums** (`enrollments`, `courses`, `sheet_leads`, etc.) — this plan only adds new schema objects.
- Migrations are applied via the `mcp__claude_ai_Supabase__apply_migration` tool (or pasted into the Supabase SQL Editor if that tool is unavailable) — the same convention used for migrations 0007–0024. `src/lib/supabase/database.types.ts` is then hand-edited to match (this codebase does not regenerate the whole file — see the `sheet_id`/`payment_shortfall_pkr` precedent in `docs/superpowers/plans/2026-07-30-gas-sheets-sync.md`).
- Verification model: `npx tsc --noEmit` clean and `npm test` (Vitest) green after every task. Per the earlier project-wide ruling (Spec 1), reviewers do not flag missing tests beyond what each task explicitly writes — the spec names exactly two things as unit-testable (the Zod schemas and the Sheet-status↔enum mapping functions); everything else (API routes, GAS scripts, React components, DB triggers) is manually verified in Task 8, matching how `admin-enrollments.ts`, `webhooks/sheets-sync/route.ts`, and `gas/sheets-sync/Code.gs` have no test files today.
- Reuse existing patterns exactly, do not reinvent: `src/lib/data/admin-enrollments.ts` → the shape of the new data-access modules; `EnrollmentStatusBadge`/`EnrollmentReviewActions` → the new mentorship equivalents; `src/lib/gas/sheets-sync-client.ts` → `mentorship-sync-client.ts`; `src/lib/emails/enrollment.ts` → `src/lib/emails/mentorship.ts`.
- New env vars this plan introduces: `MENTORSHIP_SYNC_SECRET`, `MENTORSHIP_SYNC_URL`. Existing vars it reuses as-is: `GAS_WEBAPP_URL`, `GAS_SHARED_SECRET`, `NEXT_PUBLIC_BOOKING_SCRIPT_URL`, `NEXT_PUBLIC_MENTOR_SCRIPT_URL`.
- A pre-existing `public.sessions` table (migration 0001, `session_status`/`session_type` enums) is **not** reused here — it FKs `mentor_id` to `profiles(id)`, which cannot represent the marketplace mentors in `mentors.ts` (they are not platform accounts). Nothing in `src/` reads or writes that table today; it is dead schema, out of scope for this plan to clean up.

---

### Task 1: Database schema — tables, RLS, notification triggers

**Files:**
- Create: `supabase/migrations/0025_mentorship_bookings_and_applications.sql`
- Create: `supabase/migrations/0026_mentorship_notification_triggers.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: tables `public.mentorship_bookings`, `public.mentor_applications`; enums `mentorship_booking_status` (`'pending' | 'confirmed' | 'cancelled'`), `mentor_application_status` (`'pending' | 'approved' | 'rejected'`); `Database["public"]["Enums"]["mentorship_booking_status"]` and `Database["public"]["Enums"]["mentor_application_status"]` as TypeScript types every later task imports.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0025_mentorship_bookings_and_applications.sql`:

```sql
create type mentorship_booking_status as enum ('pending', 'confirmed', 'cancelled');
create type mentor_application_status as enum ('pending', 'approved', 'rejected');

create table public.mentorship_bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id),
  full_name text not null,
  email text not null,
  phone text not null,
  mentor_slug text not null,
  mentor_name text not null,
  package_name text not null,
  goals text,
  payment_screenshot_url text,
  status mentorship_booking_status not null default 'pending',
  cancellation_reason text,
  status_changed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.mentor_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references public.profiles(id),
  full_name text not null,
  email text not null,
  phone text not null,
  country text,
  profession text,
  position text,
  expertise text,
  organization text,
  years_experience text,
  linkedin_url text,
  roles text,
  why_join text,
  value_provide text,
  cv_url text,
  photo_urls text[] not null default '{}',
  status mentor_application_status not null default 'pending',
  rejection_reason text,
  status_changed_at timestamptz,
  created_at timestamptz not null default now()
);

create index mentorship_bookings_student_idx on public.mentorship_bookings(student_id);
create index mentorship_bookings_email_idx on public.mentorship_bookings(email);
create index mentor_applications_applicant_idx on public.mentor_applications(applicant_id);
create index mentor_applications_email_idx on public.mentor_applications(email);

alter table public.mentorship_bookings enable row level security;
alter table public.mentor_applications enable row level security;

create policy "own bookings" on public.mentorship_bookings
  for select using (auth.uid() = student_id);
create policy "own applications" on public.mentor_applications
  for select using (auth.uid() = applicant_id);
```

- [ ] **Step 2: Write the notification trigger migration**

Create `supabase/migrations/0026_mentorship_notification_triggers.sql`:

```sql
-- ============================================================
-- Migration 0026: Mentorship booking/application notification triggers
-- Run AFTER 0025.
-- ============================================================
-- Mirrors migration 0015's pattern for enrollments: a status change on
-- mentorship_bookings or mentor_applications produces an in-app notification
-- via the existing public.create_notification() helper. No notification is
-- possible for a submission that was never matched to an account.

create or replace function public.notify_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type  text;
  v_title text;
  v_body  text;
begin
  if new.status = old.status then
    return new;
  end if;
  if new.student_id is null then
    return new;
  end if;

  if new.status = 'confirmed' then
    v_type  := 'booking_confirmed';
    v_title := 'Booking confirmed';
    v_body  := 'Your session with ' || new.mentor_name || ' is confirmed.';
  elsif new.status = 'cancelled' then
    v_type  := 'booking_cancelled';
    v_title := 'Booking cancelled';
    v_body  := coalesce(new.cancellation_reason, 'Your session request could not be confirmed.');
  else
    return new;
  end if;

  perform public.create_notification(new.student_id, v_type, v_title, v_body, '/dashboard/sessions');
  return new;
end;
$$;

drop trigger if exists on_booking_status_notify on public.mentorship_bookings;

create trigger on_booking_status_notify
  after update on public.mentorship_bookings
  for each row
  execute function public.notify_booking_status_change();

create or replace function public.notify_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type  text;
  v_title text;
  v_body  text;
begin
  if new.status = old.status then
    return new;
  end if;
  if new.applicant_id is null then
    return new;
  end if;

  if new.status = 'approved' then
    v_type  := 'application_approved';
    v_title := 'Mentor application approved';
    v_body  := 'Your application to become a PZ Academy mentor has been approved.';
  elsif new.status = 'rejected' then
    v_type  := 'application_rejected';
    v_title := 'Mentor application update';
    v_body  := coalesce(new.rejection_reason, 'Your mentor application was not approved this time.');
  else
    return new;
  end if;

  perform public.create_notification(new.applicant_id, v_type, v_title, v_body, '/dashboard/mentor-application');
  return new;
end;
$$;

drop trigger if exists on_application_status_notify on public.mentor_applications;

create trigger on_application_status_notify
  after update on public.mentor_applications
  for each row
  execute function public.notify_application_status_change();
```

- [ ] **Step 3: Apply both migrations**

Via `mcp__claude_ai_Supabase__apply_migration`: name the first `mentorship_bookings_and_applications`, the second `mentorship_notification_triggers`. Run them in order (0026 references `create_notification`, which already exists from migration 0015, but nothing in 0025 depends on 0026).

- [ ] **Step 4: Verify with a read-only query**

Via `mcp__claude_ai_Supabase__execute_sql`:

```sql
select table_name from information_schema.tables
where table_name in ('mentorship_bookings', 'mentor_applications');

select trigger_name from information_schema.triggers
where event_object_table in ('mentorship_bookings', 'mentor_applications');
```

Expected: both table names returned by the first query; `on_booking_status_notify` and `on_application_status_notify` returned by the second.

- [ ] **Step 5: Hand-edit `database.types.ts` — enums**

In the `Enums` block (search for `featured_item_type: ["course", "webinar"]` — no wait, search for the line `featured_item_type: "course" | "webinar"` inside the `Enums: {` object), insert two new lines immediately before the `progress_status:` line:

```ts
      mentor_application_status: "pending" | "approved" | "rejected"
      mentorship_booking_status: "pending" | "confirmed" | "cancelled"
```

- [ ] **Step 6: Hand-edit `database.types.ts` — Constants**

In the `export const Constants = { public: { Enums: {` block, find the line `lesson_content_type: ["video", "text", "pdf"],` and insert immediately after it (before `progress_status: [...]`):

```ts
      mentor_application_status: ["pending", "approved", "rejected"],
      mentorship_booking_status: ["pending", "confirmed", "cancelled"],
```

- [ ] **Step 7: Hand-edit `database.types.ts` — `mentor_applications` table**

Find the `mentors: {` table block (its `Row`/`Insert`/`Update`/`Relationships`). Insert this new table block immediately **before** it (alphabetically `mentor_applications` sorts before `mentors`):

```ts
      mentor_applications: {
        Row: {
          applicant_id: string | null
          country: string | null
          created_at: string
          cv_url: string | null
          email: string
          expertise: string | null
          full_name: string
          id: string
          linkedin_url: string | null
          organization: string | null
          phone: string
          photo_urls: string[]
          position: string | null
          profession: string | null
          rejection_reason: string | null
          roles: string | null
          status: Database["public"]["Enums"]["mentor_application_status"]
          status_changed_at: string | null
          value_provide: string | null
          why_join: string | null
          years_experience: string | null
        }
        Insert: {
          applicant_id?: string | null
          country?: string | null
          created_at?: string
          cv_url?: string | null
          email: string
          expertise?: string | null
          full_name: string
          id?: string
          linkedin_url?: string | null
          organization?: string | null
          phone: string
          photo_urls?: string[]
          position?: string | null
          profession?: string | null
          rejection_reason?: string | null
          roles?: string | null
          status?: Database["public"]["Enums"]["mentor_application_status"]
          status_changed_at?: string | null
          value_provide?: string | null
          why_join?: string | null
          years_experience?: string | null
        }
        Update: {
          applicant_id?: string | null
          country?: string | null
          created_at?: string
          cv_url?: string | null
          email?: string
          expertise?: string | null
          full_name?: string
          id?: string
          linkedin_url?: string | null
          organization?: string | null
          phone?: string
          photo_urls?: string[]
          position?: string | null
          profession?: string | null
          rejection_reason?: string | null
          roles?: string | null
          status?: Database["public"]["Enums"]["mentor_application_status"]
          status_changed_at?: string | null
          value_provide?: string | null
          why_join?: string | null
          years_experience?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 8: Hand-edit `database.types.ts` — `mentorship_bookings` table**

Find where the `mentors: {` table block ends (its closing `}` immediately before `modules: {`). Insert this new table block immediately **after** the `mentors` block ends and **before** `modules: {`:

```ts
      mentorship_bookings: {
        Row: {
          cancellation_reason: string | null
          created_at: string
          email: string
          full_name: string
          goals: string | null
          id: string
          mentor_name: string
          mentor_slug: string
          package_name: string
          payment_screenshot_url: string | null
          phone: string
          status: Database["public"]["Enums"]["mentorship_booking_status"]
          status_changed_at: string | null
          student_id: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          created_at?: string
          email: string
          full_name: string
          goals?: string | null
          id?: string
          mentor_name: string
          mentor_slug: string
          package_name: string
          payment_screenshot_url?: string | null
          phone: string
          status?: Database["public"]["Enums"]["mentorship_booking_status"]
          status_changed_at?: string | null
          student_id?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          created_at?: string
          email?: string
          full_name?: string
          goals?: string | null
          id?: string
          mentor_name?: string
          mentor_slug?: string
          package_name?: string
          payment_screenshot_url?: string | null
          phone?: string
          status?: Database["public"]["Enums"]["mentorship_booking_status"]
          status_changed_at?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentorship_bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0025_mentorship_bookings_and_applications.sql supabase/migrations/0026_mentorship_notification_triggers.sql src/lib/supabase/database.types.ts
git commit -m "feat: add mentorship bookings/applications schema and notification triggers"
```

---

### Task 2: Validation schemas + Sheet-status mapping (unit-tested)

**Files:**
- Create: `src/lib/validations/mentorship-booking.ts`
- Create: `src/lib/validations/mentorship-application.ts`
- Create: `src/lib/validations/mentorship-sync.ts`
- Test: `tests/mentorship-booking.schema.test.ts`
- Test: `tests/mentorship-application.schema.test.ts`
- Test: `tests/mentorship-sync.rules.test.ts`

**Interfaces:**
- Consumes: `Database["public"]["Enums"]["mentorship_booking_status"]`, `Database["public"]["Enums"]["mentor_application_status"]` from Task 1.
- Produces: `mentorshipBookingSchema`, `type MentorshipBookingInput`; `mentorshipApplicationSchema`, `type MentorshipApplicationInput`; `mentorshipSyncWebhookSchema`, `type MentorshipSyncWebhookPayload`, `mapBookingSheetStatus(value: string): MentorshipBookingStatus | null`, `mapApplicationSheetStatus(value: string): MentorApplicationStatus | null`, `type MentorshipBookingStatus`, `type MentorApplicationStatus` — every later task imports these exact names.

- [ ] **Step 1: Write the failing tests for the booking schema**

Create `tests/mentorship-booking.schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mentorshipBookingSchema } from "@/lib/validations/mentorship-booking";

const valid = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "+92 300 0000000",
  mentorSlug: "dr-roha",
  mentorName: "Dr. Roha",
  packageName: "Single Session",
};

describe("mentorshipBookingSchema", () => {
  it("accepts a valid booking with no screenshot", () => {
    expect(mentorshipBookingSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid booking with a full screenshot triple", () => {
    const result = mentorshipBookingSchema.safeParse({
      ...valid,
      screenshotBase64: "abc123",
      screenshotName: "receipt.png",
      screenshotMimeType: "image/png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a screenshot with a missing filename", () => {
    const result = mentorshipBookingSchema.safeParse({
      ...valid,
      screenshotBase64: "abc123",
      screenshotMimeType: "image/png",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = mentorshipBookingSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing mentorSlug", () => {
    const { mentorSlug, ...rest } = valid;
    expect(mentorshipBookingSchema.safeParse(rest).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/mentorship-booking.schema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validations/mentorship-booking'`.

- [ ] **Step 3: Implement the booking schema**

Create `src/lib/validations/mentorship-booking.ts`:

```ts
import { z } from "zod";

export const mentorshipBookingSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required").max(200),
    email: z.string().trim().email(),
    phone: z.string().trim().min(1, "Phone is required").max(40),
    mentorSlug: z.string().trim().min(1),
    mentorName: z.string().trim().min(1),
    packageName: z.string().trim().min(1),
    goals: z.string().trim().max(2000).optional(),
    screenshotBase64: z.string().optional(),
    screenshotName: z.string().optional(),
    screenshotMimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]).optional(),
  })
  .refine(
    (data) => !data.screenshotBase64 || (data.screenshotName && data.screenshotMimeType),
    {
      message: "screenshotName and screenshotMimeType are required when screenshotBase64 is provided",
      path: ["screenshotBase64"],
    },
  );

export type MentorshipBookingInput = z.infer<typeof mentorshipBookingSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/mentorship-booking.schema.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing tests for the application schema**

Create `tests/mentorship-application.schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mentorshipApplicationSchema } from "@/lib/validations/mentorship-application";

const valid = {
  fullName: "Dr. Jane Smith",
  email: "jane@example.com",
  phone: "+92 300 0000000",
  cvBase64: "abc123",
  cvFileName: "cv.pdf",
  photos: [{ name: "photo.jpg", base64: "xyz789" }],
};

describe("mentorshipApplicationSchema", () => {
  it("accepts a valid application", () => {
    expect(mentorshipApplicationSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional fields when present", () => {
    const result = mentorshipApplicationSchema.safeParse({
      ...valid,
      country: "Pakistan",
      profession: "Pharmacist",
      roles: "mentor, instructor",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing cvBase64", () => {
    const { cvBase64, ...rest } = valid;
    expect(mentorshipApplicationSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty photos array", () => {
    const result = mentorshipApplicationSchema.safeParse({ ...valid, photos: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = mentorshipApplicationSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/mentorship-application.schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the application schema**

Create `src/lib/validations/mentorship-application.ts`:

```ts
import { z } from "zod";

const photoSchema = z.object({
  name: z.string().min(1),
  base64: z.string().min(1),
});

export const mentorshipApplicationSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1, "Phone is required").max(40),
  country: z.string().trim().max(100).optional(),
  profession: z.string().trim().max(200).optional(),
  position: z.string().trim().max(200).optional(),
  expertise: z.string().trim().max(300).optional(),
  organization: z.string().trim().max(200).optional(),
  years: z.string().trim().max(50).optional(),
  linkedin: z.string().trim().max(300).optional(),
  roles: z.string().trim().max(200).optional(),
  whyJoin: z.string().trim().max(2000).optional(),
  valueProvide: z.string().trim().max(2000).optional(),
  cvBase64: z.string().min(1, "CV is required"),
  cvFileName: z.string().min(1, "CV filename is required"),
  photos: z.array(photoSchema).min(1, "At least one photo is required"),
});

export type MentorshipApplicationInput = z.infer<typeof mentorshipApplicationSchema>;
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/mentorship-application.schema.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Write the failing tests for the sync mapping + webhook schema**

Create `tests/mentorship-sync.rules.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  mapBookingSheetStatus,
  mapApplicationSheetStatus,
  mentorshipSyncWebhookSchema,
} from "@/lib/validations/mentorship-sync";

describe("mapBookingSheetStatus", () => {
  it("maps the three known sheet values", () => {
    expect(mapBookingSheetStatus("Pending")).toBe("pending");
    expect(mapBookingSheetStatus("Confirmed")).toBe("confirmed");
    expect(mapBookingSheetStatus("Cancelled")).toBe("cancelled");
  });

  it("returns null for an unknown value", () => {
    expect(mapBookingSheetStatus("Something Else")).toBeNull();
  });
});

describe("mapApplicationSheetStatus", () => {
  it("maps the three known sheet values", () => {
    expect(mapApplicationSheetStatus("Pending")).toBe("pending");
    expect(mapApplicationSheetStatus("Approved")).toBe("approved");
    expect(mapApplicationSheetStatus("Rejected")).toBe("rejected");
  });

  it("returns null for an unknown value", () => {
    expect(mapApplicationSheetStatus("Maybe")).toBeNull();
  });
});

describe("mentorshipSyncWebhookSchema", () => {
  it("accepts a valid statusChange payload", () => {
    const result = mentorshipSyncWebhookSchema.safeParse({
      action: "statusChange",
      sheetKind: "booking",
      row: { email: "jane@example.com", status: "Confirmed" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid newSubmission payload", () => {
    const result = mentorshipSyncWebhookSchema.safeParse({
      action: "newSubmission",
      sheetKind: "application",
      row: { email: "jane@example.com", status: "Pending" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown sheetKind", () => {
    const result = mentorshipSyncWebhookSchema.safeParse({
      action: "statusChange",
      sheetKind: "course",
      row: { email: "jane@example.com", status: "Confirmed" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown action", () => {
    const result = mentorshipSyncWebhookSchema.safeParse({
      action: "somethingElse",
      sheetKind: "booking",
      row: { email: "jane@example.com", status: "Confirmed" },
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `npx vitest run tests/mentorship-sync.rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 11: Implement the sync mapping + webhook schema**

Create `src/lib/validations/mentorship-sync.ts`:

```ts
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

export type MentorshipBookingStatus = Database["public"]["Enums"]["mentorship_booking_status"];
export type MentorApplicationStatus = Database["public"]["Enums"]["mentor_application_status"];

/**
 * These are the only Sheet Status-column dropdown values gas/mentorship-sync/Code.gs
 * and this webhook agree on — both sheets are new columns added for this
 * integration, so the wording was chosen to match the enum 1:1 rather than
 * needing an arbitrary translation layer like the enrollment sheet's legacy
 * "Paid"/"Underpaid" wording (see src/lib/validations/sheet-sync.ts).
 */
export const BOOKING_SHEET_STATUS_VALUES = ["Pending", "Confirmed", "Cancelled"] as const;
export const APPLICATION_SHEET_STATUS_VALUES = ["Pending", "Approved", "Rejected"] as const;

export function mapBookingSheetStatus(value: string): MentorshipBookingStatus | null {
  switch (value.trim()) {
    case "Confirmed":
      return "confirmed";
    case "Cancelled":
      return "cancelled";
    case "Pending":
      return "pending";
    default:
      return null;
  }
}

export function mapApplicationSheetStatus(value: string): MentorApplicationStatus | null {
  switch (value.trim()) {
    case "Approved":
      return "approved";
    case "Rejected":
      return "rejected";
    case "Pending":
      return "pending";
    default:
      return null;
  }
}

const rowSchema = z.object({
  email: z.string().trim().email(),
  status: z.string().trim().min(1),
});

/** Inbound payload from gas/mentorship-sync/Code.gs. */
export const mentorshipSyncWebhookSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("newSubmission"),
    sheetKind: z.enum(["booking", "application"]),
    row: rowSchema,
  }),
  z.object({
    action: z.literal("statusChange"),
    sheetKind: z.enum(["booking", "application"]),
    row: rowSchema,
  }),
]);

export type MentorshipSyncWebhookPayload = z.infer<typeof mentorshipSyncWebhookSchema>;
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run tests/mentorship-sync.rules.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 13: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green, no new errors.

- [ ] **Step 14: Commit**

```bash
git add src/lib/validations/mentorship-booking.ts src/lib/validations/mentorship-application.ts src/lib/validations/mentorship-sync.ts tests/mentorship-booking.schema.test.ts tests/mentorship-application.schema.test.ts tests/mentorship-sync.rules.test.ts
git commit -m "feat: add mentorship booking/application validation schemas and sheet-status mapping"
```

---

### Task 3: Emails + data access + push-to-sheet client

**Files:**
- Create: `src/lib/emails/mentorship.ts`
- Create: `src/lib/gas/mentorship-sync-client.ts`
- Create: `src/lib/data/mentorship-bookings.ts`
- Create: `src/lib/data/mentorship-applications.ts`

**Interfaces:**
- Consumes: `MentorshipBookingStatus`, `MentorApplicationStatus` from Task 2 (`@/lib/validations/mentorship-sync`); `findStudentIdByEmail` from `@/lib/data/sheet-sync` (existing, reused as-is — no duplicate lookup helper).
- Produces:
  - `sendMentorshipEmail(kind: MentorshipEmailKind, to: string | null | undefined, ctx: MentorshipEmailContext): Promise<boolean>` where `MentorshipEmailKind = "bookingReceived" | "bookingConfirmed" | "bookingCancelled" | "applicationReceived" | "applicationApproved" | "applicationRejected"` and `MentorshipEmailContext = { fullName: string; mentorName?: string; cancellationReason?: string | null; rejectionReason?: string | null }`.
  - `pushMentorshipStatusToSheet(params: { sheetKind: "booking" | "application"; email: string; status: MentorshipBookingStatus | MentorApplicationStatus }): Promise<void>`.
  - From `mentorship-bookings.ts`: `MentorshipBookingRow`, `listBookingsForReview(): Promise<MentorshipBookingRow[]>`, `listMyBookings(studentId: string): Promise<MentorshipBookingRow[]>`, `countMyBookings(studentId: string): Promise<number>`, `InsertBookingInput`, `insertBooking(input: InsertBookingInput): Promise<{ id: string }>`, `ApplyBookingStatusResult`, `applyBookingStatus(params: { bookingId: string; targetStatus: MentorshipBookingStatus; cancellationReason?: string | null; emailKind?: "bookingConfirmed" | "bookingCancelled" | null }): Promise<ApplyBookingStatusResult>`.
  - From `mentorship-applications.ts`: `MentorApplicationRow`, `listApplicationsForReview(): Promise<MentorApplicationRow[]>`, `getMyApplication(applicantId: string): Promise<MentorApplicationRow | null>`, `InsertApplicationInput`, `insertApplication(input: InsertApplicationInput): Promise<{ id: string }>`, `ApplyApplicationStatusResult`, `applyApplicationStatus(params: { applicationId: string; targetStatus: MentorApplicationStatus; rejectionReason?: string | null; emailKind?: "applicationApproved" | "applicationRejected" | null }): Promise<ApplyApplicationStatusResult>`.

- [ ] **Step 1: Create the email module**

Create `src/lib/emails/mentorship.ts`:

```ts
import "server-only";
import { sendTransactionalEmail } from "@/lib/brevo";

/**
 * Transactional emails for the mentorship booking/application lifecycle.
 * Structurally parallel to src/lib/emails/enrollment.ts but kept as its own
 * module — the context shape genuinely differs (no courseTitle/courseSlug).
 */

const COLORS = {
  deepGreen: "#0f3d22",
  brightGreen: "#7ed957",
  paleGreen: "#c8f0a0",
  gold: "#c9960a",
  danger: "#ef4444",
  darkGray: "#333333",
  lightGray: "#666666",
  border: "#e0e0e0",
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmacozyme.com";
const WHATSAPP = "https://wa.me/923700199429";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(opts: {
  title: string;
  heading: string;
  accent: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
}): string {
  const cta = opts.cta
    ? `
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${opts.cta.href}" style="background-color: ${COLORS.brightGreen}; color: ${COLORS.deepGreen}; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 40px; border-radius: 6px; display: inline-block;">
                      ${esc(opts.cta.label)}
                    </a>
                  </td>
                </tr>
              </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(opts.title)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: ${COLORS.darkGray}; line-height: 1.6; background-color: #f9faf8;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <tr>
            <td style="background-color: ${COLORS.deepGreen}; padding: 40px 30px; text-align: center;">
              <h1 style="font-family: 'Montserrat', sans-serif; font-weight: 600; margin: 0; font-size: 28px; color: ${COLORS.brightGreen};">PZ Academy</h1>
              <p style="margin: 8px 0 0; color: ${COLORS.paleGreen}; font-size: 14px;">by Pharmacozyme</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="font-family: 'Montserrat', sans-serif; font-weight: 600; color: ${opts.accent}; font-size: 22px; margin: 0 0 20px;">${esc(opts.heading)}</h2>
              ${opts.bodyHtml}
              ${cta}
              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid ${COLORS.border}; color: ${COLORS.lightGray}; font-size: 13px;">
                Questions? WhatsApp us at <a href="${WHATSAPP}" style="color: ${COLORS.deepGreen};">+92 370 019 9429</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const p = (html: string) => `<p style="margin: 0 0 20px; color: ${COLORS.lightGray};">${html}</p>`;

export interface MentorshipEmailContext {
  fullName: string;
  /** Only read by booking emails. */
  mentorName?: string;
  /** Only read by the "bookingCancelled" email. */
  cancellationReason?: string | null;
  /** Only read by the "applicationRejected" email. */
  rejectionReason?: string | null;
}

export type MentorshipEmailKind =
  | "bookingReceived"
  | "bookingConfirmed"
  | "bookingCancelled"
  | "applicationReceived"
  | "applicationApproved"
  | "applicationRejected";

function buildEmail(kind: MentorshipEmailKind, ctx: MentorshipEmailContext): { subject: string; html: string } {
  const name = esc(ctx.fullName.trim() || "there");
  const mentor = ctx.mentorName ? `<strong>${esc(ctx.mentorName)}</strong>` : "your mentor";

  switch (kind) {
    case "bookingReceived":
      return {
        subject: "We received your mentorship booking",
        html: shell({
          title: "Booking received",
          heading: "Booking Received",
          accent: COLORS.gold,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`Thanks — we've received your session booking with ${mentor}.`) +
            p("Our team verifies payment and confirms sessions within 24 hours. You'll get an email the moment it's confirmed."),
        }),
      };

    case "bookingConfirmed":
      return {
        subject: "Your mentorship session is confirmed",
        html: shell({
          title: "Booking confirmed",
          heading: "Your Session Is Confirmed",
          accent: COLORS.deepGreen,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`Your session with ${mentor} is confirmed. They'll be in touch to schedule a time.`),
          cta: { label: "View My Bookings", href: `${APP_URL}/dashboard/sessions` },
        }),
      };

    case "bookingCancelled":
      return {
        subject: "Your mentorship booking was cancelled",
        html: shell({
          title: "Booking cancelled",
          heading: "Booking Cancelled",
          accent: COLORS.danger,
          bodyHtml:
            p(`Hi ${name},`) +
            p(`Your session booking with ${mentor} could not be confirmed.`) +
            (ctx.cancellationReason
              ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 20px;">
                <tr><td style="background-color: #fff5f5; border-left: 4px solid ${COLORS.danger}; padding: 14px 18px; border-radius: 4px;">
                  <p style="margin: 0; color: ${COLORS.darkGray}; font-size: 14px;"><strong>Reason:</strong> ${esc(ctx.cancellationReason)}</p>
                </td></tr>
              </table>`
              : "") +
            p("Reply to this email or message us on WhatsApp if you'd like to rebook."),
        }),
      };

    case "applicationReceived":
      return {
        subject: "We received your mentor application",
        html: shell({
          title: "Application received",
          heading: "Application Received",
          accent: COLORS.gold,
          bodyHtml:
            p(`Hi ${name},`) +
            p("Thanks for applying to become a PZ Academy mentor.") +
            p("Our team reviews every application carefully and will reach out within 48 hours."),
        }),
      };

    case "applicationApproved":
      return {
        subject: "You're approved as a PZ Academy mentor",
        html: shell({
          title: "Application approved",
          heading: "Welcome to the Mentor Network",
          accent: COLORS.deepGreen,
          bodyHtml:
            p(`Hi ${name},`) +
            p("Your mentor application has been approved. Our team will be in touch with next steps."),
        }),
      };

    case "applicationRejected":
      return {
        subject: "Update on your mentor application",
        html: shell({
          title: "Application not approved",
          heading: "Your Application Wasn't Approved This Time",
          accent: COLORS.danger,
          bodyHtml:
            p(`Hi ${name},`) +
            p("We appreciate your interest in joining the PZ Academy mentor network.") +
            (ctx.rejectionReason
              ? `<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 0 0 20px;">
                <tr><td style="background-color: #fff5f5; border-left: 4px solid ${COLORS.danger}; padding: 14px 18px; border-radius: 4px;">
                  <p style="margin: 0; color: ${COLORS.darkGray}; font-size: 14px;"><strong>Note:</strong> ${esc(ctx.rejectionReason)}</p>
                </td></tr>
              </table>`
              : "") +
            p("You're welcome to reapply in the future as your experience grows."),
        }),
      };
  }
}

export async function sendMentorshipEmail(
  kind: MentorshipEmailKind,
  to: string | null | undefined,
  ctx: MentorshipEmailContext,
): Promise<boolean> {
  if (!to) {
    console.warn(`[mentorship-email] skipped "${kind}": no recipient address`);
    return false;
  }

  try {
    const { subject, html } = buildEmail(kind, ctx);
    await sendTransactionalEmail({ to, toName: ctx.fullName || undefined, subject, htmlContent: html });
    return true;
  } catch (error) {
    console.error(`[mentorship-email] failed to send "${kind}" to ${to}:`, error);
    return false;
  }
}
```

- [ ] **Step 2: Create the push-to-sheet client**

Create `src/lib/gas/mentorship-sync-client.ts`:

```ts
import "server-only";
import type { MentorshipBookingStatus, MentorApplicationStatus } from "@/lib/validations/mentorship-sync";

/**
 * Pushes a confirmed booking/application status back to the team's Sheet.
 * Structurally identical to pushStatusToSheet (src/lib/gas/sheets-sync-client.ts):
 * fire-and-forget, never throws — a dead GAS deployment must never block an
 * admin's in-app decision.
 */
export async function pushMentorshipStatusToSheet(params: {
  sheetKind: "booking" | "application";
  email: string;
  status: MentorshipBookingStatus | MentorApplicationStatus;
}): Promise<void> {
  const url = process.env.MENTORSHIP_SYNC_URL;
  const secret = process.env.MENTORSHIP_SYNC_SECRET;
  if (!url || !secret) {
    console.warn("[mentorship-sync] push skipped: MENTORSHIP_SYNC_URL or MENTORSHIP_SYNC_SECRET not set");
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        action: "applyStatus",
        sheetKind: params.sheetKind,
        email: params.email,
        status: params.status,
      }),
    });
  } catch (error) {
    console.error(`[mentorship-sync] failed to push status for ${params.email}:`, error);
  }
}
```

- [ ] **Step 3: Create the bookings data-access module**

Create `src/lib/data/mentorship-bookings.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { sendMentorshipEmail } from "@/lib/emails/mentorship";
import { pushMentorshipStatusToSheet } from "@/lib/gas/mentorship-sync-client";

export type MentorshipBookingStatus = Database["public"]["Enums"]["mentorship_booking_status"];

export interface MentorshipBookingRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  mentorSlug: string;
  mentorName: string;
  packageName: string;
  goals: string | null;
  hasScreenshot: boolean;
  status: MentorshipBookingStatus;
  cancellationReason: string | null;
  createdAt: string;
}

interface RawBookingRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  mentor_slug: string;
  mentor_name: string;
  package_name: string;
  goals: string | null;
  payment_screenshot_url: string | null;
  status: MentorshipBookingStatus;
  cancellation_reason: string | null;
  created_at: string;
}

function toRow(row: RawBookingRow): MentorshipBookingRow {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    mentorSlug: row.mentor_slug,
    mentorName: row.mentor_name,
    packageName: row.package_name,
    goals: row.goals,
    hasScreenshot: Boolean(row.payment_screenshot_url),
    status: row.status,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
  };
}

const SELECT =
  "id, full_name, email, phone, mentor_slug, mentor_name, package_name, goals, payment_screenshot_url, status, cancellation_reason, created_at";

/** The admin review list — reads via the admin client, mirroring listEnrollmentsForReview's role. */
export async function listBookingsForReview(): Promise<MentorshipBookingRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentorship_bookings").select(SELECT).order("created_at", { ascending: false });
  return (data ?? []).map((row) => toRow(row as RawBookingRow));
}

/** A logged-in student's own bookings, for /dashboard/sessions. RLS scopes this to auth.uid(). */
export async function listMyBookings(studentId: string): Promise<MentorshipBookingRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("mentorship_bookings")
    .select(SELECT)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => toRow(row as RawBookingRow));
}

export async function countMyBookings(studentId: string): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("mentorship_bookings")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  return count ?? 0;
}

export interface InsertBookingInput {
  studentId: string | null;
  fullName: string;
  email: string;
  phone: string;
  mentorSlug: string;
  mentorName: string;
  packageName: string;
  goals?: string | null;
  paymentScreenshotUrl?: string | null;
}

export async function insertBooking(input: InsertBookingInput): Promise<{ id: string }> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("mentorship_bookings")
    .insert({
      student_id: input.studentId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      mentor_slug: input.mentorSlug,
      mentor_name: input.mentorName,
      package_name: input.packageName,
      goals: input.goals ?? null,
      payment_screenshot_url: input.paymentScreenshotUrl ?? null,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not insert booking");
  return { id: data.id };
}

export type ApplyBookingStatusResult =
  | { ok: true; id: string; status: MentorshipBookingStatus }
  | { ok: false; reason: "not-found" | "already-in-status" | "db-error" };

/**
 * The single place that commits a booking status transition — the admin
 * PATCH route and the mentorship-sync webhook's status-change path both call
 * this, mirroring applyEnrollmentStatus in src/lib/data/admin-enrollments.ts.
 */
export async function applyBookingStatus(params: {
  bookingId: string;
  targetStatus: MentorshipBookingStatus;
  cancellationReason?: string | null;
  emailKind?: "bookingConfirmed" | "bookingCancelled" | null;
}): Promise<ApplyBookingStatusResult> {
  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("mentorship_bookings")
    .select("id, status, full_name, email, mentor_name")
    .eq("id", params.bookingId)
    .maybeSingle();

  if (!existing) return { ok: false, reason: "not-found" };
  if (existing.status === params.targetStatus) return { ok: false, reason: "already-in-status" };

  const { data: updated, error } = await admin
    .from("mentorship_bookings")
    .update({
      status: params.targetStatus,
      cancellation_reason: params.targetStatus === "cancelled" ? (params.cancellationReason ?? null) : null,
      status_changed_at: new Date().toISOString(),
    })
    .eq("id", params.bookingId)
    .select("id, status")
    .single();

  if (error || !updated) return { ok: false, reason: "db-error" };

  if (params.emailKind) {
    await sendMentorshipEmail(params.emailKind, existing.email, {
      fullName: existing.full_name,
      mentorName: existing.mentor_name,
      cancellationReason: params.cancellationReason ?? null,
    });
  }

  await pushMentorshipStatusToSheet({ sheetKind: "booking", email: existing.email, status: updated.status });

  return { ok: true, id: updated.id, status: updated.status };
}
```

- [ ] **Step 4: Create the applications data-access module**

Create `src/lib/data/mentorship-applications.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { sendMentorshipEmail } from "@/lib/emails/mentorship";
import { pushMentorshipStatusToSheet } from "@/lib/gas/mentorship-sync-client";

export type MentorApplicationStatus = Database["public"]["Enums"]["mentor_application_status"];

export interface MentorApplicationRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  country: string | null;
  profession: string | null;
  position: string | null;
  expertise: string | null;
  organization: string | null;
  yearsExperience: string | null;
  linkedinUrl: string | null;
  roles: string | null;
  whyJoin: string | null;
  valueProvide: string | null;
  cvUrl: string | null;
  photoUrls: string[];
  status: MentorApplicationStatus;
  rejectionReason: string | null;
  createdAt: string;
}

interface RawApplicationRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  country: string | null;
  profession: string | null;
  position: string | null;
  expertise: string | null;
  organization: string | null;
  years_experience: string | null;
  linkedin_url: string | null;
  roles: string | null;
  why_join: string | null;
  value_provide: string | null;
  cv_url: string | null;
  photo_urls: string[];
  status: MentorApplicationStatus;
  rejection_reason: string | null;
  created_at: string;
}

function toRow(row: RawApplicationRow): MentorApplicationRow {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    profession: row.profession,
    position: row.position,
    expertise: row.expertise,
    organization: row.organization,
    yearsExperience: row.years_experience,
    linkedinUrl: row.linkedin_url,
    roles: row.roles,
    whyJoin: row.why_join,
    valueProvide: row.value_provide,
    cvUrl: row.cv_url,
    photoUrls: row.photo_urls,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  };
}

const SELECT =
  "id, full_name, email, phone, country, profession, position, expertise, organization, years_experience, linkedin_url, roles, why_join, value_provide, cv_url, photo_urls, status, rejection_reason, created_at";

export async function listApplicationsForReview(): Promise<MentorApplicationRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentor_applications").select(SELECT).order("created_at", { ascending: false });
  return (data ?? []).map((row) => toRow(row as RawApplicationRow));
}

/** The logged-in user's own most recent application, for /dashboard/mentor-application. */
export async function getMyApplication(applicantId: string): Promise<MentorApplicationRow | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("mentor_applications")
    .select(SELECT)
    .eq("applicant_id", applicantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRow(data as RawApplicationRow) : null;
}

export interface InsertApplicationInput {
  applicantId: string | null;
  fullName: string;
  email: string;
  phone: string;
  country?: string | null;
  profession?: string | null;
  position?: string | null;
  expertise?: string | null;
  organization?: string | null;
  yearsExperience?: string | null;
  linkedinUrl?: string | null;
  roles?: string | null;
  whyJoin?: string | null;
  valueProvide?: string | null;
  cvUrl?: string | null;
  photoUrls?: string[];
}

export async function insertApplication(input: InsertApplicationInput): Promise<{ id: string }> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("mentor_applications")
    .insert({
      applicant_id: input.applicantId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      country: input.country ?? null,
      profession: input.profession ?? null,
      position: input.position ?? null,
      expertise: input.expertise ?? null,
      organization: input.organization ?? null,
      years_experience: input.yearsExperience ?? null,
      linkedin_url: input.linkedinUrl ?? null,
      roles: input.roles ?? null,
      why_join: input.whyJoin ?? null,
      value_provide: input.valueProvide ?? null,
      cv_url: input.cvUrl ?? null,
      photo_urls: input.photoUrls ?? [],
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not insert application");
  return { id: data.id };
}

export type ApplyApplicationStatusResult =
  | { ok: true; id: string; status: MentorApplicationStatus }
  | { ok: false; reason: "not-found" | "already-in-status" | "db-error" };

export async function applyApplicationStatus(params: {
  applicationId: string;
  targetStatus: MentorApplicationStatus;
  rejectionReason?: string | null;
  emailKind?: "applicationApproved" | "applicationRejected" | null;
}): Promise<ApplyApplicationStatusResult> {
  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("mentor_applications")
    .select("id, status, full_name, email")
    .eq("id", params.applicationId)
    .maybeSingle();

  if (!existing) return { ok: false, reason: "not-found" };
  if (existing.status === params.targetStatus) return { ok: false, reason: "already-in-status" };

  const { data: updated, error } = await admin
    .from("mentor_applications")
    .update({
      status: params.targetStatus,
      rejection_reason: params.targetStatus === "rejected" ? (params.rejectionReason ?? null) : null,
      status_changed_at: new Date().toISOString(),
    })
    .eq("id", params.applicationId)
    .select("id, status")
    .single();

  if (error || !updated) return { ok: false, reason: "db-error" };

  if (params.emailKind) {
    await sendMentorshipEmail(params.emailKind, existing.email, {
      fullName: existing.full_name,
      rejectionReason: params.rejectionReason ?? null,
    });
  }

  await pushMentorshipStatusToSheet({ sheetKind: "application", email: existing.email, status: updated.status });

  return { ok: true, id: updated.id, status: updated.status };
}
```

- [ ] **Step 5: Verify TypeScript compiles and existing tests still pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new errors, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/emails/mentorship.ts src/lib/gas/mentorship-sync-client.ts src/lib/data/mentorship-bookings.ts src/lib/data/mentorship-applications.ts
git commit -m "feat: add mentorship email templates, sheet-push client, and data access layer"
```

---

### Task 4: GAS scripts — dedicated sync bridge + shared upload handler

**Files:**
- Create: `gas/mentorship-sync/Code.gs`
- Modify: `gas/payment-screenshots/Code.gs`
- Modify: `gas/sheets-sync/Code.gs`

**Interfaces:**
- Produces: `uploadMentorshipFile` action on the platform's existing shared GAS Web App (dispatched from `gas/sheets-sync/Code.gs`'s `doPost`, handled in `gas/payment-screenshots/Code.gs`), returning `{ ok: true, url: string } | { ok: false, error: string }`. A brand-new, separately-deployed GAS Web App (`gas/mentorship-sync/Code.gs`) accepting `{ secret, action: "applyStatus", sheetKind: "booking" | "application", email, status }` and POSTing `{ secret, action: "statusChange" | "newSubmission", sheetKind, row: { email, status } }` to `MENTORSHIP_SYNC_URL`'s configured webhook.

- [ ] **Step 1: Add the mentorship file-upload handler to the shared GAS project**

Modify `gas/payment-screenshots/Code.gs` — add a new constant near the top (after `const LESSON_DOCUMENTS_FOLDER_NAME = "Lesson Documents";`):

```javascript
const MENTORSHIP_UPLOADS_FOLDER_NAME = "Mentorship Uploads";
```

Add this new function anywhere after `handleUploadPrivateDocument_` (before `handleFetchPrivateDocument_`):

```javascript
/**
 * Uploads a mentorship booking/application file (payment screenshot, CV,
 * applicant photo) to Drive. `folder` is "Bookings" or "Applications" — the
 * caller picks it, this handler doesn't infer it from mimeType. Public,
 * shareable link, same sharing level as payment screenshots and course
 * images — these are review artifacts an admin needs to view via a link, not
 * protected student content.
 */
function handleUploadMentorshipFile_(body) {
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonResponse_({ ok: false, error: "Unauthorized" });
  }

  const { folder, mimeType, base64, filename } = body;
  if (!folder || !mimeType || !base64 || !filename) {
    return jsonResponse_({ ok: false, error: "Missing required fields" });
  }
  if (folder !== "Bookings" && folder !== "Applications") {
    return jsonResponse_({ ok: false, error: "Invalid folder" });
  }

  try {
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, filename);

    const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const uploadsRoot = getOrCreateFolder_(root, MENTORSHIP_UPLOADS_FOLDER_NAME);
    const targetFolder = getOrCreateFolder_(uploadsRoot, folder);

    const file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonResponse_({ ok: true, url: file.getUrl() });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}
```

- [ ] **Step 2: Dispatch the new action from the shared project's doPost**

Modify `gas/sheets-sync/Code.gs` — in `doPost(e)`, add this branch immediately after the existing `uploadPaymentScreenshot` check:

```javascript
  if (body.action === "uploadMentorshipFile") {
    return handleUploadMentorshipFile_(body);
  }
```

- [ ] **Step 3: Write the dedicated mentorship-sync GAS project**

Create `gas/mentorship-sync/Code.gs`:

```javascript
/**
 * PZ Academy — Mentorship Sync bridge.
 *
 * Dedicated bridge for the two mentorship Sheets (bookings, applications) —
 * kept separate from gas/sheets-sync/Code.gs on purpose: that script is
 * conceptually built around "a sheet belongs to a course," and this
 * integration has exactly two fixed sheets, so it doesn't need a self-service
 * registerSheet flow. See
 * docs/superpowers/specs/2026-08-05-mentorship-bookings-applications-design.md,
 * "Decisions already made".
 *
 * One-time setup:
 *   1. script.google.com -> New project, paste this file in.
 *   2. Project Settings -> Script Properties, add:
 *        MENTORSHIP_SYNC_SECRET = <same value as MENTORSHIP_SYNC_SECRET in .env.local>
 *        WEBHOOK_URL            = https://<your-domain>/api/webhooks/mentorship-sync
 *        BOOKING_SHEET_ID       = <the booking Sheet's spreadsheet ID>
 *        APPLICATION_SHEET_ID   = <the application Sheet's spreadsheet ID>
 *        COL_EMAIL              = <exact header text of the email column, both sheets>
 *        COL_STATUS             = <exact header text of the Status column, both sheets>
 *      Both sheets need a "Status" column added by hand if they don't already
 *      have one, with values Pending / Confirmed / Cancelled (booking sheet)
 *      or Pending / Approved / Rejected (application sheet) — exact wording
 *      matters, see displayValueForBookingStatus_/displayValueForApplicationStatus_
 *      and src/lib/validations/mentorship-sync.ts's mapBookingSheetStatus/
 *      mapApplicationSheetStatus on the Next.js side.
 *   3. Deploy -> New deployment -> Web app -> Execute as "Me", access "Anyone"
 *      -> copy the /exec URL into .env.local as MENTORSHIP_SYNC_URL.
 *   4. Run installTriggers() once from the Apps Script editor (select it in
 *      the function dropdown, click Run, authorize when prompted). Installs
 *      the onEdit watcher on both fixed sheets. Re-running is a harmless
 *      no-op.
 *
 * This script auto-creates a "SyncedAt" tracking column at the end of row 1
 * of each sheet the first time it reacts to an edit there — do not delete it,
 * it is how the script tells a fresh row apart from a hand-edit to Status.
 */

function installTriggers() {
  const props = PropertiesService.getScriptProperties();
  installTriggerFor_(props.getProperty("BOOKING_SHEET_ID"));
  installTriggerFor_(props.getProperty("APPLICATION_SHEET_ID"));
}

function installTriggerFor_(sheetId) {
  if (!sheetId) return;
  const already = ScriptApp.getProjectTriggers().some(
    (t) => t.getHandlerFunction() === "onEdit" && t.getTriggerSourceId() === sheetId,
  );
  if (already) return;
  ScriptApp.newTrigger("onEdit").forSpreadsheet(sheetId).onEdit().create();
}

function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    const sheetId = sheet.getParent().getId();
    const props = PropertiesService.getScriptProperties();

    const sheetKind = sheetKindForId_(sheetId, props);
    if (!sheetKind) return; // an edit on a sheet this script doesn't watch

    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    ensureTrackingColumn_(sheet, headerRow);

    const editedRow = e.range.getRow();
    if (editedRow === 1) return; // header row

    const statusCol = headerIndex_(headerRow, props.getProperty("COL_STATUS"));
    const emailCol = headerIndex_(headerRow, props.getProperty("COL_EMAIL"));
    const syncedAtCol = headerIndex_(headerRow, "SyncedAt");
    if (statusCol === -1 || emailCol === -1) return;

    const editedCol = e.range.getColumn();
    const syncedAt = sheet.getRange(editedRow, syncedAtCol + 1).getValue();
    const isNewRow = !syncedAt;
    if (!isNewRow && editedCol !== statusCol + 1) return;

    const statusValue = String(sheet.getRange(editedRow, statusCol + 1).getValue()).trim();
    const emailValue = String(sheet.getRange(editedRow, emailCol + 1).getValue()).trim();
    if (!statusValue || !emailValue) return;

    const payload = {
      secret: props.getProperty("MENTORSHIP_SYNC_SECRET"),
      action: isNewRow ? "newSubmission" : "statusChange",
      sheetKind: sheetKind,
      row: { email: emailValue, status: statusValue },
    };

    UrlFetchApp.fetch(props.getProperty("WEBHOOK_URL"), {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    sheet.getRange(editedRow, syncedAtCol + 1).setValue(new Date());
  } catch (err) {
    console.error(String(err));
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ status: "error", message: "Invalid JSON body" });
  }

  const props = PropertiesService.getScriptProperties();
  if (!body || body.secret !== props.getProperty("MENTORSHIP_SYNC_SECRET")) {
    return jsonResponse_({ status: "error", message: "Wrong password." });
  }

  if (body.action === "applyStatus") {
    return handleApplyStatus_(body, props);
  }

  return jsonResponse_({ status: "error", message: "Unknown action: " + body.action });
}

/** Writes a confirmed status back into whichever sheet the booking/application belongs to. */
function handleApplyStatus_(body, props) {
  if (!body.sheetKind || !body.email || !body.status) {
    return jsonResponse_({ status: "error", message: "Missing sheetKind, email, or status" });
  }

  try {
    const sheetId =
      body.sheetKind === "booking"
        ? props.getProperty("BOOKING_SHEET_ID")
        : props.getProperty("APPLICATION_SHEET_ID");
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const emailCol = headerIndex_(headerRow, props.getProperty("COL_EMAIL"));
    const statusCol = headerIndex_(headerRow, props.getProperty("COL_STATUS"));

    const emails = sheet.getRange(2, emailCol + 1, sheet.getLastRow() - 1, 1).getValues();
    const targetRow = emails.findIndex(
      (r) => String(r[0]).trim().toLowerCase() === String(body.email).trim().toLowerCase(),
    );
    if (targetRow === -1) {
      return jsonResponse_({ status: "error", message: "No row found for that email" });
    }

    const sheetRow = targetRow + 2;
    const display =
      body.sheetKind === "booking"
        ? displayValueForBookingStatus_(body.status)
        : displayValueForApplicationStatus_(body.status);
    sheet.getRange(sheetRow, statusCol + 1).setValue(display);

    return jsonResponse_({ status: "success", message: "Sheet updated" });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

function displayValueForBookingStatus_(status) {
  if (status === "confirmed") return "Confirmed";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

function displayValueForApplicationStatus_(status) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function sheetKindForId_(sheetId, props) {
  if (sheetId === props.getProperty("BOOKING_SHEET_ID")) return "booking";
  if (sheetId === props.getProperty("APPLICATION_SHEET_ID")) return "application";
  return null;
}

function headerIndex_(headerRow, headerText) {
  if (!headerText) return -1;
  return headerRow.indexOf(headerText);
}

function ensureTrackingColumn_(sheet, headerRow) {
  if (headerRow.indexOf("SyncedAt") !== -1) return;
  const lastCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, lastCol).setValue("SyncedAt");
  headerRow.push("SyncedAt");
  SpreadsheetApp.flush();
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 4: Commit**

```bash
git add gas/mentorship-sync/Code.gs gas/payment-screenshots/Code.gs gas/sheets-sync/Code.gs
git commit -m "feat: add mentorship-sync GAS project and shared upload handler"
```

Manual deployment of these two GAS changes (redeploying the shared project, creating and deploying the new project, running `installTriggers()`) is a Task 8 step — it requires live Google account access this plan cannot script.

---

### Task 5: Public write-path + Sheet webhook API routes + form wiring

**Files:**
- Create: `src/app/api/mentorship/bookings/route.ts`
- Create: `src/app/api/mentorship/applications/route.ts`
- Create: `src/app/api/webhooks/mentorship-sync/route.ts`
- Modify: `src/components/mentorship/BookingClient.tsx`
- Modify: `src/components/mentorship/RecruitmentForm.tsx`

**Interfaces:**
- Consumes: `mentorshipBookingSchema`/`mentorshipApplicationSchema`/`mentorshipSyncWebhookSchema`/`mapBookingSheetStatus`/`mapApplicationSheetStatus` (Task 2); `findStudentIdByEmail` from `@/lib/data/sheet-sync` (existing); `insertBooking`/`applyBookingStatus`, `insertApplication`/`applyApplicationStatus`, `sendMentorshipEmail` (Task 3); the `uploadMentorshipFile` GAS action (Task 4).
- Produces: `POST /api/mentorship/bookings`, `POST /api/mentorship/applications` — both public, both return `{ ok: true, id: string }` on success or `{ error: string }` with a 400 on invalid input. `POST /api/webhooks/mentorship-sync` — validated by `MENTORSHIP_SYNC_SECRET`, returns `{ status: "success" | "error", message: string }`.

- [ ] **Step 1: Create the booking write-path route**

Create `src/app/api/mentorship/bookings/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { mentorshipBookingSchema } from "@/lib/validations/mentorship-booking";
import { findStudentIdByEmail } from "@/lib/data/sheet-sync";
import { insertBooking } from "@/lib/data/mentorship-bookings";
import { sendMentorshipEmail } from "@/lib/emails/mentorship";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";
const BOOKING_SCRIPT_URL = process.env.NEXT_PUBLIC_BOOKING_SCRIPT_URL ?? "";

/**
 * Public — no auth, matching the booking form's own public nature (same
 * reasoning as /api/upload-video). Inserts into Supabase, uploads the
 * screenshot via the shared GAS dispatcher, then forwards the original
 * payload to the team's existing Sheet exactly as before this feature.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = mentorshipBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  let screenshotUrl: string | null = null;
  if (input.screenshotBase64 && GAS_URL) {
    try {
      const gasRes = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "uploadMentorshipFile",
          secret: GAS_SHARED_SECRET,
          folder: "Bookings",
          mimeType: input.screenshotMimeType,
          base64: input.screenshotBase64,
          filename: input.screenshotName,
        }),
      });
      const json: { ok: boolean; url?: string } = await gasRes.json();
      if (json.ok && json.url) screenshotUrl = json.url;
    } catch (error) {
      console.error("[mentorship-bookings] screenshot upload failed:", error);
    }
  }

  const studentId = await findStudentIdByEmail(input.email);

  const { id } = await insertBooking({
    studentId,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    mentorSlug: input.mentorSlug,
    mentorName: input.mentorName,
    packageName: input.packageName,
    goals: input.goals ?? null,
    paymentScreenshotUrl: screenshotUrl,
  });

  if (BOOKING_SCRIPT_URL) {
    try {
      await fetch(BOOKING_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          name: input.fullName,
          email: input.email,
          phone: input.phone,
          mentorName: input.mentorName,
          packageName: input.packageName,
          goals: input.goals ?? "",
          paymentRef: input.screenshotName ?? "",
          screenshotBase64: input.screenshotBase64 ?? "",
          screenshotName: input.screenshotName ?? "",
        }),
      });
    } catch (error) {
      // Soft-fail: the Supabase row already exists, so the booking is not
      // lost even if the team's Sheet doesn't get this row.
      console.error("[mentorship-bookings] GAS forward failed:", error);
    }
  }

  await sendMentorshipEmail("bookingReceived", input.email, { fullName: input.fullName, mentorName: input.mentorName });

  return NextResponse.json({ ok: true, id });
}
```

- [ ] **Step 2: Create the application write-path route**

Create `src/app/api/mentorship/applications/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { mentorshipApplicationSchema } from "@/lib/validations/mentorship-application";
import { findStudentIdByEmail } from "@/lib/data/sheet-sync";
import { insertApplication } from "@/lib/data/mentorship-applications";
import { sendMentorshipEmail } from "@/lib/emails/mentorship";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";
const MENTOR_SCRIPT_URL = process.env.NEXT_PUBLIC_MENTOR_SCRIPT_URL ?? "";

async function uploadMentorshipFile(mimeType: string, base64: string, filename: string): Promise<string | null> {
  if (!GAS_URL) return null;
  try {
    const gasRes = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadMentorshipFile",
        secret: GAS_SHARED_SECRET,
        folder: "Applications",
        mimeType,
        base64,
        filename,
      }),
    });
    const json: { ok: boolean; url?: string } = await gasRes.json();
    return json.ok && json.url ? json.url : null;
  } catch (error) {
    console.error("[mentorship-applications] file upload failed:", error);
    return null;
  }
}

/**
 * Public — no auth, matching the recruitment form's own public nature.
 * Inserts into Supabase, uploads the CV and photos via the shared GAS
 * dispatcher, then forwards the original payload to the team's existing
 * Sheet exactly as before this feature.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = mentorshipApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  const cvUrl = await uploadMentorshipFile("application/octet-stream", input.cvBase64, input.cvFileName);
  const photoUrls: string[] = [];
  for (const photo of input.photos) {
    const url = await uploadMentorshipFile("image/jpeg", photo.base64, photo.name);
    if (url) photoUrls.push(url);
  }

  const applicantId = await findStudentIdByEmail(input.email);

  const { id } = await insertApplication({
    applicantId,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    country: input.country ?? null,
    profession: input.profession ?? null,
    position: input.position ?? null,
    expertise: input.expertise ?? null,
    organization: input.organization ?? null,
    yearsExperience: input.years ?? null,
    linkedinUrl: input.linkedin ?? null,
    roles: input.roles ?? null,
    whyJoin: input.whyJoin ?? null,
    valueProvide: input.valueProvide ?? null,
    cvUrl,
    photoUrls,
  });

  if (MENTOR_SCRIPT_URL) {
    try {
      await fetch(MENTOR_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          country: input.country ?? "",
          profession: input.profession ?? "",
          position: input.position ?? "",
          expertise: input.expertise ?? "",
          organization: input.organization ?? "",
          years: input.years ?? "",
          linkedin: input.linkedin ?? "",
          roles: input.roles ?? "",
          whyJoin: input.whyJoin ?? "",
          valueProvide: input.valueProvide ?? "",
          cvBase64: input.cvBase64,
          cvFileName: input.cvFileName,
          photos: input.photos,
        }),
      });
    } catch (error) {
      console.error("[mentorship-applications] GAS forward failed:", error);
    }
  }

  await sendMentorshipEmail("applicationReceived", input.email, { fullName: input.fullName });

  return NextResponse.json({ ok: true, id });
}
```

- [ ] **Step 3: Create the Sheet-sync webhook route**

Create `src/app/api/webhooks/mentorship-sync/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  mentorshipSyncWebhookSchema,
  mapBookingSheetStatus,
  mapApplicationSheetStatus,
} from "@/lib/validations/mentorship-sync";
import { applyBookingStatus } from "@/lib/data/mentorship-bookings";
import { applyApplicationStatus } from "@/lib/data/mentorship-applications";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Receives status-change events from gas/mentorship-sync/Code.gs.
 *
 * "newSubmission" is a no-op here: unlike the course-enrollment Sheets (fed
 * directly by a separate WordPress form), the mentorship Sheets are only
 * ever written to by this platform's own write-path routes
 * (/api/mentorship/bookings, /api/mentorship/applications), which already
 * insert the Supabase row before forwarding to GAS — so by the time GAS's
 * onEdit fires for a brand-new row, the row already exists. Only a later
 * hand-edit to the Status column ("statusChange") needs this webhook to do
 * anything.
 */
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    return NextResponse.json({ status: "error", message: String(err) });
  }
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !process.env.MENTORSHIP_SYNC_SECRET || body.secret !== process.env.MENTORSHIP_SYNC_SECRET) {
    return NextResponse.json({ status: "error", message: "Wrong password." });
  }

  const parsed = mentorshipSyncWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid input" });
  }
  const { action, sheetKind, row } = parsed.data;

  if (action === "newSubmission") {
    return NextResponse.json({ status: "success", message: "Acknowledged" });
  }

  const admin = createAdminSupabase();

  if (sheetKind === "booking") {
    const status = mapBookingSheetStatus(row.status);
    if (!status) {
      return NextResponse.json({ status: "error", message: `Unknown booking status: ${row.status}` });
    }
    const { data: existing } = await admin
      .from("mentorship_bookings")
      .select("id")
      .eq("email", row.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ status: "error", message: `No booking found for ${row.email}` });
    }
    const result = await applyBookingStatus({
      bookingId: existing.id,
      targetStatus: status,
      emailKind: status === "confirmed" ? "bookingConfirmed" : status === "cancelled" ? "bookingCancelled" : null,
    });
    if (!result.ok && result.reason !== "already-in-status") {
      return NextResponse.json({ status: "success", message: `No change (${result.reason})` });
    }
    return NextResponse.json({ status: "success", message: "Booking updated" });
  }

  const status = mapApplicationSheetStatus(row.status);
  if (!status) {
    return NextResponse.json({ status: "error", message: `Unknown application status: ${row.status}` });
  }
  const { data: existing } = await admin
    .from("mentor_applications")
    .select("id")
    .eq("email", row.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ status: "error", message: `No application found for ${row.email}` });
  }
  const result = await applyApplicationStatus({
    applicationId: existing.id,
    targetStatus: status,
    emailKind: status === "approved" ? "applicationApproved" : status === "rejected" ? "applicationRejected" : null,
  });
  if (!result.ok && result.reason !== "already-in-status") {
    return NextResponse.json({ status: "success", message: `No change (${result.reason})` });
  }
  return NextResponse.json({ status: "success", message: "Application updated" });
}
```

- [ ] **Step 4: Wire `BookingClient.tsx` to the new route**

Modify `src/components/mentorship/BookingClient.tsx`. Replace lines 1–6:

```tsx
"use client";

// Paste your deployed Apps Script URL here after following AppScript_BookingForm.js guide
const BOOKING_SCRIPT_URL = process.env.NEXT_PUBLIC_BOOKING_SCRIPT_URL;

import { useState, useRef } from "react";
```

with:

```tsx
"use client";

import { useState, useRef } from "react";
```

Then replace the entire `handleSubmit` function body (currently lines ~101–152, starting `async function handleSubmit(e: React.FormEvent) {` and ending at its closing `}`) with:

```tsx
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Rate limiting: prevent submissions within 30 seconds
    const now = Date.now();
    if (now - lastSubmitRef.current < 30_000) {
      alert("Please wait a moment before submitting again.");
      return;
    }

    setLoading(true);

    try {
      let screenshotBase64 = "";
      let screenshotName = "";
      let screenshotMimeType = "";
      if (form.screenshot) {
        screenshotName = form.screenshot.name;
        screenshotMimeType = form.screenshot.type;
        screenshotBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1] ?? "");
          };
          reader.readAsDataURL(form.screenshot!);
        });
      }

      await fetch("/api/mentorship/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          mentorSlug: mentor.slug,
          mentorName: mentor.name,
          packageName: form.package,
          goals: form.notes,
          screenshotBase64: screenshotBase64 || undefined,
          screenshotName: screenshotName || undefined,
          screenshotMimeType: screenshotMimeType || undefined,
        }),
      });
    } catch {
      // Still redirect — don't block user on network error
    }

    setLoading(false);
    // Update submission timestamp
    lastSubmitRef.current = Date.now();
    router.push("/mentorship/thank-you");
  }
```

- [ ] **Step 5: Wire `RecruitmentForm.tsx` to the new route**

Modify `src/components/mentorship/RecruitmentForm.tsx`. Delete the line:

```tsx
const MENTOR_SCRIPT_URL = process.env.NEXT_PUBLIC_MENTOR_SCRIPT_URL;
```

Then replace the entire `handleSubmit` function body with:

```tsx
  async function handleSubmit() {
    // Rate limiting: prevent submissions within 30 seconds
    const now = Date.now();
    if (now - lastSubmitRef.current < 30_000) {
      setError("Please wait before submitting again.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const cvBase64 = cvFile ? await toBase64(cvFile) : "";
      const encodedPhotos = await Promise.all(
        photos.map(async p => ({ name: p.name, base64: await toBase64(p) }))
      );
      await fetch("/api/mentorship/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          country: form.country,
          profession: form.profession,
          position: form.position,
          expertise: form.expertise,
          organization: form.organization,
          years: form.years,
          linkedin: form.linkedin,
          roles: form.roles.join(", "),
          whyJoin: form.whyJoin,
          valueProvide: form.valueProvide,
          cvBase64,
          cvFileName: cvFile?.name ?? "",
          photos: encodedPhotos,
        }),
      });
      setSubmitted(true);
      // Record submission timestamp
      lastSubmitRef.current = Date.now();
    } catch {
      setError("Something went wrong. Please try again or reach out via WhatsApp.");
    } finally {
      setLoading(false);
    }
  }
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/mentorship/bookings/route.ts src/app/api/mentorship/applications/route.ts src/app/api/webhooks/mentorship-sync/route.ts src/components/mentorship/BookingClient.tsx src/components/mentorship/RecruitmentForm.tsx
git commit -m "feat: route mentorship forms through platform API for dual-write, add sheet-sync webhook"
```

---

### Task 6: Admin review UI

**Files:**
- Create: `src/components/admin/mentorship/MentorshipStatusBadge.tsx`
- Create: `src/components/admin/mentorship/MentorshipReviewActions.tsx`
- Create: `src/app/api/admin/mentorship/bookings/[id]/route.ts`
- Create: `src/app/api/admin/mentorship/applications/[id]/route.ts`
- Create: `src/app/dashboard/admin/mentorship/page.tsx`
- Modify: `src/components/dashboard/Sidebar.tsx`

**Interfaces:**
- Consumes: `listBookingsForReview`, `listApplicationsForReview`, `applyBookingStatus`, `applyApplicationStatus` (Task 3); `requireAdmin`/`requireAdminPage` (existing, `@/lib/auth/require-admin`); `formatDate`, `relativeTime`, `initials` (existing, `@/lib/format`).
- Produces: `MentorshipStatusBadge({ kind: "booking", status } | { kind: "application", status })`; `MentorshipReviewActions({ kind: "booking" | "application", id, status, name })`; `PATCH /api/admin/mentorship/bookings/[id]` and `PATCH /api/admin/mentorship/applications/[id]`, both admin-gated.

- [ ] **Step 1: Create the status badge**

Create `src/components/admin/mentorship/MentorshipStatusBadge.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type BookingStatus = Database["public"]["Enums"]["mentorship_booking_status"];
type ApplicationStatus = Database["public"]["Enums"]["mentor_application_status"];

const BOOKING_STYLES: Record<BookingStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-pz-secondary-container/40 text-pz-on-secondary-container" },
  confirmed: { label: "Confirmed", className: "bg-pz-primary-container/30 text-pz-on-primary-container" },
  cancelled: { label: "Cancelled", className: "bg-pz-error-container text-pz-on-error-container" },
};

const APPLICATION_STYLES: Record<ApplicationStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-pz-secondary-container/40 text-pz-on-secondary-container" },
  approved: { label: "Approved", className: "bg-pz-primary-container/30 text-pz-on-primary-container" },
  rejected: { label: "Rejected", className: "bg-pz-error-container text-pz-on-error-container" },
};

type MentorshipStatusBadgeProps =
  | { kind: "booking"; status: BookingStatus; className?: string }
  | { kind: "application"; status: ApplicationStatus; className?: string };

export function MentorshipStatusBadge(props: MentorshipStatusBadgeProps) {
  const { label, className: tone } =
    props.kind === "booking" ? BOOKING_STYLES[props.status] : APPLICATION_STYLES[props.status];
  return (
    <span
      className={cn(
        "inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap font-headline",
        tone,
        props.className,
      )}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Create the review actions component**

Create `src/components/admin/mentorship/MentorshipReviewActions.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Action = "primary" | "secondary";

interface ActionConfig {
  label: string;
  icon: typeof CheckCircle2;
  button: string;
  confirmTitle: string;
  confirmBody: string;
}

const BOOKING_ACTIONS: Record<Action, ActionConfig> = {
  primary: {
    label: "Confirm",
    icon: CheckCircle2,
    button: "bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container",
    confirmTitle: "Confirm this booking?",
    confirmBody: "The student is emailed a confirmation.",
  },
  secondary: {
    label: "Cancel",
    icon: XCircle,
    button: "border border-pz-danger/40 text-pz-danger hover:bg-pz-danger/10",
    confirmTitle: "Cancel this booking?",
    confirmBody: "The student is emailed the reason below.",
  },
};

const APPLICATION_ACTIONS: Record<Action, ActionConfig> = {
  primary: {
    label: "Approve",
    icon: CheckCircle2,
    button: "bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container",
    confirmTitle: "Approve this application?",
    confirmBody: "The applicant is emailed a confirmation.",
  },
  secondary: {
    label: "Reject",
    icon: XCircle,
    button: "border border-pz-danger/40 text-pz-danger hover:bg-pz-danger/10",
    confirmTitle: "Reject this application?",
    confirmBody: "The applicant is emailed the reason below.",
  },
};

export function MentorshipReviewActions({
  kind,
  id,
  status,
  name,
}: {
  kind: "booking" | "application";
  id: string;
  status: string;
  name: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState<Action | null>(null);
  const [reason, setReason] = useState("");

  const actions = kind === "booking" ? BOOKING_ACTIONS : APPLICATION_ACTIONS;
  const targetStatus: Record<Action, string> =
    kind === "booking" ? { primary: "confirmed", secondary: "cancelled" } : { primary: "approved", secondary: "rejected" };

  const config = open ? actions[open] : null;
  const isAvailable = (action: Action) => targetStatus[action] !== status;

  function submit() {
    if (!open) return;
    const action = open;

    startTransition(async () => {
      const res = await fetch(`/api/admin/mentorship/${kind === "booking" ? "bookings" : "applications"}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus[action],
          reason: action === "secondary" ? reason.trim() || undefined : undefined,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not update this record.");
        return;
      }

      setOpen(null);
      setReason("");
      toast.success(`${name} — ${actions[action].label.toLowerCase()} applied.`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {(["primary", "secondary"] as Action[]).filter(isAvailable).map((action) => {
          const { label, icon: Icon, button } = actions[action];
          return (
            <button
              key={action}
              type="button"
              onClick={() => {
                setReason("");
                setOpen(action);
              }}
              disabled={isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-headline font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                button,
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          {config && (
            <>
              <DialogHeader>
                <DialogTitle className="font-headline text-pz-on-surface">{config.confirmTitle}</DialogTitle>
                <DialogDescription className="font-body text-pz-on-surface-variant">{name}</DialogDescription>
              </DialogHeader>

              <p className="font-body text-sm text-pz-on-surface-variant">{config.confirmBody}</p>

              {open === "secondary" && (
                <div className="space-y-1.5">
                  <label htmlFor="mentorship-reason" className="font-headline text-sm font-semibold text-pz-on-surface">
                    Reason <span className="font-body font-normal text-pz-on-surface-variant">(optional)</span>
                  </label>
                  <textarea
                    id="mentorship-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Included in the email…"
                    className="w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm font-body text-pz-on-surface placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary resize-none"
                  />
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Working…" : config.label}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Create the admin booking PATCH route**

Create `src/app/api/admin/mentorship/bookings/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { applyBookingStatus } from "@/lib/data/mentorship-bookings";

const bodySchema = z.object({
  status: z.enum(["confirmed", "cancelled"]),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await applyBookingStatus({
    bookingId: id,
    targetStatus: parsed.data.status,
    cancellationReason: parsed.data.reason ?? null,
    emailKind: parsed.data.status === "confirmed" ? "bookingConfirmed" : "bookingCancelled",
  });

  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (result.reason === "already-in-status") {
      return NextResponse.json({ error: `Booking is already ${parsed.data.status}.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update booking" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id, status: result.status });
}
```

- [ ] **Step 4: Create the admin application PATCH route**

Create `src/app/api/admin/mentorship/applications/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { applyApplicationStatus } from "@/lib/data/mentorship-applications";

const bodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await applyApplicationStatus({
    applicationId: id,
    targetStatus: parsed.data.status,
    rejectionReason: parsed.data.reason ?? null,
    emailKind: parsed.data.status === "approved" ? "applicationApproved" : "applicationRejected",
  });

  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Application not found" }, { status: 404 });
    if (result.reason === "already-in-status") {
      return NextResponse.json({ error: `Application is already ${parsed.data.status}.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not update application" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id, status: result.status });
}
```

- [ ] **Step 5: Create the admin review page**

Create `src/app/dashboard/admin/mentorship/page.tsx`:

```tsx
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listBookingsForReview } from "@/lib/data/mentorship-bookings";
import { listApplicationsForReview } from "@/lib/data/mentorship-applications";
import { MentorshipStatusBadge } from "@/components/admin/mentorship/MentorshipStatusBadge";
import { MentorshipReviewActions } from "@/components/admin/mentorship/MentorshipReviewActions";
import { formatDate, relativeTime, initials } from "@/lib/format";

export const metadata = { title: "Mentorship Review — PZ Academy" };

function parseTab(value: string | undefined): "bookings" | "applications" {
  return value === "applications" ? "applications" : "bookings";
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
      <Inbox className="w-10 h-10 text-pz-outline-variant mb-3" />
      <p className="font-body text-pz-on-surface-variant text-sm">{label}</p>
    </div>
  );
}

export default async function AdminMentorshipPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminPage();
  const { tab: tabParam } = await searchParams;
  const tab = parseTab(tabParam);

  const [bookings, applications] = await Promise.all([listBookingsForReview(), listApplicationsForReview()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Mentorship Review</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Manage session bookings and mentor applications.
        </p>
      </div>

      <div className="flex gap-2">
        <Link
          href="/dashboard/admin/mentorship?tab=bookings"
          className={`px-5 py-2 rounded-full font-headline text-sm transition-all ${tab === "bookings" ? "bg-pz-primary-container text-pz-on-primary-container font-semibold" : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium"}`}
        >
          Bookings <span className="ml-2 tabular-nums">{bookings.length}</span>
        </Link>
        <Link
          href="/dashboard/admin/mentorship?tab=applications"
          className={`px-5 py-2 rounded-full font-headline text-sm transition-all ${tab === "applications" ? "bg-pz-primary-container text-pz-on-primary-container font-semibold" : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium"}`}
        >
          Applications <span className="ml-2 tabular-nums">{applications.length}</span>
        </Link>
      </div>

      {tab === "bookings" ? (
        bookings.length === 0 ? (
          <EmptyState label="No bookings yet." />
        ) : (
          <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[48rem]">
                <thead>
                  <tr className="border-b border-pz-outline-variant/40 text-pz-on-surface text-left">
                    <th className="py-4 px-6 font-headline font-semibold">Student</th>
                    <th className="py-4 px-6 font-headline font-semibold">Mentor</th>
                    <th className="py-4 px-6 font-headline font-semibold">Package</th>
                    <th className="py-4 px-6 font-headline font-semibold">Submitted</th>
                    <th className="py-4 px-6 font-headline font-semibold">Status</th>
                    <th className="py-4 px-6 font-headline font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pz-outline-variant/30 text-pz-on-surface">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-pz-surface-container/40 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-xs">
                            {initials(b.fullName)}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-body font-medium truncate">{b.fullName}</span>
                            <span className="block font-body text-xs text-pz-on-surface-variant truncate">{b.email}</span>
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-body">{b.mentorName}</td>
                      <td className="py-4 px-6 font-body">{b.packageName}</td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className="block font-body">{formatDate(b.createdAt)}</span>
                        <span className="block font-body text-[11px] font-semibold text-pz-on-surface-variant">{relativeTime(b.createdAt)}</span>
                      </td>
                      <td className="py-4 px-6">
                        <MentorshipStatusBadge kind="booking" status={b.status} />
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex justify-end">
                          <MentorshipReviewActions kind="booking" id={b.id} status={b.status} name={b.fullName} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : applications.length === 0 ? (
        <EmptyState label="No applications yet." />
      ) : (
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[48rem]">
              <thead>
                <tr className="border-b border-pz-outline-variant/40 text-pz-on-surface text-left">
                  <th className="py-4 px-6 font-headline font-semibold">Applicant</th>
                  <th className="py-4 px-6 font-headline font-semibold">Profession</th>
                  <th className="py-4 px-6 font-headline font-semibold">Experience</th>
                  <th className="py-4 px-6 font-headline font-semibold">Submitted</th>
                  <th className="py-4 px-6 font-headline font-semibold">Status</th>
                  <th className="py-4 px-6 font-headline font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pz-outline-variant/30 text-pz-on-surface">
                {applications.map((a) => (
                  <tr key={a.id} className="hover:bg-pz-surface-container/40 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-xs">
                          {initials(a.fullName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-body font-medium truncate">{a.fullName}</span>
                          <span className="block font-body text-xs text-pz-on-surface-variant truncate">{a.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-body">{a.profession ?? "—"}</td>
                    <td className="py-4 px-6 font-body">{a.yearsExperience ?? "—"}</td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <span className="block font-body">{formatDate(a.createdAt)}</span>
                      <span className="block font-body text-[11px] font-semibold text-pz-on-surface-variant">{relativeTime(a.createdAt)}</span>
                    </td>
                    <td className="py-4 px-6">
                      <MentorshipStatusBadge kind="application" status={a.status} />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex justify-end">
                        <MentorshipReviewActions kind="application" id={a.id} status={a.status} name={a.fullName} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Add the Sidebar entry**

Modify `src/components/dashboard/Sidebar.tsx`. Change the lucide-react import line:

```tsx
import {
  LayoutDashboard, BookOpen, Calendar, Award, Users, Settings,
  GraduationCap, BarChart3, CreditCard, Video, NotebookPen, Bell, Megaphone, Link2,
} from "lucide-react";
```

to:

```tsx
import {
  LayoutDashboard, BookOpen, Calendar, Award, Users, Settings,
  GraduationCap, BarChart3, CreditCard, Video, NotebookPen, Bell, Megaphone, Link2,
  Handshake,
} from "lucide-react";
```

Then insert this line into `NAV_ITEMS`, immediately after the `"Enrollments"` entry:

```tsx
  { label: "Mentorship", href: "/dashboard/admin/mentorship", icon: Handshake, roles: ["admin", "super_admin"] },
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/mentorship/MentorshipStatusBadge.tsx src/components/admin/mentorship/MentorshipReviewActions.tsx src/app/api/admin/mentorship/bookings/[id]/route.ts src/app/api/admin/mentorship/applications/[id]/route.ts src/app/dashboard/admin/mentorship/page.tsx src/components/dashboard/Sidebar.tsx
git commit -m "feat: add mentorship admin review screen"
```

---

### Task 7: Student-facing UI

**Files:**
- Create: `src/app/dashboard/sessions/page.tsx`
- Create: `src/app/dashboard/mentor-application/page.tsx`
- Modify: `src/components/dashboard/Sidebar.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `listMyBookings`, `countMyBookings` (`@/lib/data/mentorship-bookings`), `getMyApplication` (`@/lib/data/mentorship-applications`), `MentorshipStatusBadge` (Task 6), `formatDate` (existing).

- [ ] **Step 1: Build the student sessions page**

Create `src/app/dashboard/sessions/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Calendar } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { listMyBookings } from "@/lib/data/mentorship-bookings";
import { MentorshipStatusBadge } from "@/components/admin/mentorship/MentorshipStatusBadge";
import { formatDate } from "@/lib/format";

export const metadata = { title: "My Sessions — PZ Academy" };

export default async function MySessionsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const bookings = await listMyBookings(user.id);

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
          {bookings.map((b) => (
            <div
              key={b.id}
              className="p-5 rounded-xl bg-pz-surface-container border border-pz-outline-variant/10 flex items-center justify-between gap-4"
            >
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
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build the student mentor-application page**

Create `src/app/dashboard/mentor-application/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getMyApplication } from "@/lib/data/mentorship-applications";
import { MentorshipStatusBadge } from "@/components/admin/mentorship/MentorshipStatusBadge";
import { formatDate } from "@/lib/format";

export const metadata = { title: "My Application — PZ Academy" };

export default async function MyMentorApplicationPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const application = await getMyApplication(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">My Application</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Track your mentor application status.
        </p>
      </div>

      {!application ? (
        <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
          <UserCheck className="w-10 h-10 text-pz-outline-variant mb-3" />
          <p className="font-body text-pz-on-surface-variant text-sm">You haven&apos;t applied to become a mentor yet.</p>
          <a href="/mentorship#apply" className="mt-3 font-label text-pz-primary text-sm font-bold hover:underline">
            Apply now →
          </a>
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-pz-surface-container border border-pz-outline-variant/10 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-headline font-bold text-pz-on-surface">{application.profession ?? "Mentor application"}</p>
            <MentorshipStatusBadge kind="application" status={application.status} />
          </div>
          <p className="font-body text-sm text-pz-on-surface-variant">Submitted {formatDate(application.createdAt)}</p>
          {application.status === "rejected" && application.rejectionReason && (
            <p className="font-body text-sm text-pz-danger">{application.rejectionReason}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the student Sidebar entry**

Modify `src/components/dashboard/Sidebar.tsx`. Change the lucide-react import line (already edited in Task 6 to add `Handshake`) to also add `UserCheck`:

```tsx
import {
  LayoutDashboard, BookOpen, Calendar, Award, Users, Settings,
  GraduationCap, BarChart3, CreditCard, Video, NotebookPen, Bell, Megaphone, Link2,
  Handshake, UserCheck,
} from "lucide-react";
```

Then insert this line into `NAV_ITEMS`, immediately after the `"Sessions"` entry:

```tsx
  { label: "My Application", href: "/dashboard/mentor-application", icon: UserCheck, roles: ["student"] },
```

- [ ] **Step 4: Wire the dashboard stat card to a real count**

Modify `src/app/dashboard/page.tsx`. Change the import line:

```tsx
import { getEnrolledCourses } from "@/lib/data/lms";
```

to:

```tsx
import { getEnrolledCourses } from "@/lib/data/lms";
import { countMyBookings } from "@/lib/data/mentorship-bookings";
```

Change:

```tsx
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const courses = await getEnrolledCourses(user.id);
```

to:

```tsx
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const courses = await getEnrolledCourses(user.id);
  const sessionsBooked = await countMyBookings(user.id);
```

Change:

```tsx
        <StatCard label="Sessions Booked" value={0} icon={Calendar} />
```

to:

```tsx
        <StatCard label="Sessions Booked" value={sessionsBooked} icon={Calendar} />
```

- [ ] **Step 5: Verify TypeScript compiles and the full test suite passes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no new errors, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/sessions/page.tsx src/app/dashboard/mentor-application/page.tsx src/components/dashboard/Sidebar.tsx src/app/dashboard/page.tsx
git commit -m "feat: add student-facing mentorship booking/application status views"
```

---

### Task 8: Manual deployment + end-to-end verification

This task has no code changes — it wires up the two live GAS deployments this plan cannot script, and walks through the full flow once by hand. Do not skip it: Tasks 4–7 depend on infrastructure only a human with Google account access can create.

- [ ] **Step 1: Redeploy the shared GAS project**

Open the existing Apps Script project backing `GAS_WEBAPP_URL` (the one containing `gas/sheets-sync/Code.gs` and `gas/payment-screenshots/Code.gs`). Paste in the updated content of both files from Tasks 4. Deploy → Manage deployments → edit the existing deployment → New version → Deploy. The `/exec` URL does not change, so no env var update is needed for this part.

- [ ] **Step 2: Create and deploy the new mentorship-sync GAS project**

Create a new Apps Script project, paste in `gas/mentorship-sync/Code.gs`. Follow the setup steps in that file's header comment: set the five Script Properties (`MENTORSHIP_SYNC_SECRET`, `WEBHOOK_URL`, `BOOKING_SHEET_ID`, `APPLICATION_SHEET_ID`, `COL_EMAIL`, `COL_STATUS`), deploy as a Web App (Execute as "Me", access "Anyone"), and copy the `/exec` URL.

- [ ] **Step 3: Add a Status column to both mentorship Sheets**

In the booking Sheet, add a column with the header matching whatever value was set for `COL_STATUS`, with a data-validation dropdown offering exactly `Pending`, `Confirmed`, `Cancelled`. In the application Sheet, same column, dropdown offering exactly `Pending`, `Approved`, `Rejected`. Wording must match exactly — see `mapBookingSheetStatus`/`mapApplicationSheetStatus` in `src/lib/validations/mentorship-sync.ts`.

- [ ] **Step 4: Install the onEdit triggers**

In the new Apps Script project's editor, select `installTriggers` from the function dropdown and click Run. Authorize when prompted. Confirm via Triggers (clock icon in the left sidebar) that two `onEdit` triggers now exist, one per sheet.

- [ ] **Step 5: Add the new env vars**

In `.env.local`, add:
```
MENTORSHIP_SYNC_SECRET=<the same value set as the Script Property in Step 2>
MENTORSHIP_SYNC_URL=<the /exec URL copied in Step 2>
```
Confirm `GAS_WEBAPP_URL`, `GAS_SHARED_SECRET`, `NEXT_PUBLIC_BOOKING_SCRIPT_URL`, `NEXT_PUBLIC_MENTOR_SCRIPT_URL` are already set (they are reused as-is, no new values needed).

- [ ] **Step 6: Start the dev server**

Run: `npm run dev`
Expected: clean start, no compile errors.

- [ ] **Step 7: Submit a test booking**

As the allow-listed test student account, go to `/mentorship`, pick a mentor, submit a booking with a screenshot. Confirm:
- The booking Sheet gets a new row (existing behavior, unchanged).
- A new row appears in the `mentorship_bookings` table (via `mcp__claude_ai_Supabase__execute_sql`, `select * from mentorship_bookings order by created_at desc limit 1;`), with `student_id` set to the test account's id and `payment_screenshot_url` populated.
- A "booking received" email arrives.

- [ ] **Step 8: Submit a test application**

Go to `/mentorship#apply`, fill out and submit the recruitment form with a CV and one photo. Confirm the application Sheet gets a new row, a new row appears in `mentor_applications` with `cv_url`/`photo_urls` populated, and an "application received" email arrives.

- [ ] **Step 9: Confirm the admin review screen**

As an admin account, go to `/dashboard/admin/mentorship`. Confirm both the test booking and test application appear. Click Confirm on the booking: confirm the `mentorship_bookings` row's status becomes `confirmed`, the booking Sheet's Status column updates to `Confirmed`, a "booking confirmed" email arrives, and a notification appears in the bell (`/dashboard/notifications`). Repeat for Approve on the application.

- [ ] **Step 10: Confirm the Sheet → Supabase direction**

Manually edit the Status column in the booking Sheet for a different row (or the same row back to `Cancelled`, then re-confirm it). Confirm the `mentorship_bookings` row's status updates within a few seconds and the corresponding email/notification fires — this exercises `gas/mentorship-sync/Code.gs`'s `onEdit` → `/api/webhooks/mentorship-sync` path end to end.

- [ ] **Step 11: Confirm the student-facing views**

As the test student, visit `/dashboard/sessions` and confirm the booking and its current status appear. Visit `/dashboard/mentor-application` and confirm the application and its current status appear. Visit `/dashboard` and confirm the "Sessions Booked" stat card shows a real count, not 0.

- [ ] **Step 12: Confirm the standalone Mentorship Portal is untouched**

Visit the live standalone Mentorship Portal deployment (not this platform) and confirm it still works exactly as before — this plan never modified that repo or its deployment.
