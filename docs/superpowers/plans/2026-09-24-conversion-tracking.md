# Conversion / Drop-off Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin see whether a WhatsApp batch or email campaign converted its recipients (a new purchase of the tagged course within 30 days of being sent), without ever claiming to detect "lost interest" as a real signal.

**Architecture:** Two nullable columns on `whatsapp_batches` and `campaigns` hold a course tag (an existing `courses` row, or a free-text pattern matched against `contact_purchases.product_label` for the ~78% of purchases with no `course_id`). A pure `resolveConversions` function does the actual per-recipient window/match logic; a shared data-layer helper fetches purchases and calls it, reused by both channels. Conversion is computed at read time — no new table, no background job. UI: a required three-way picker at creation, a % badge on each row, a "Converted" column on the WhatsApp batch's existing recipient table, and a new "Conversion" tab that's the only per-recipient drill-down for email (which has no other recipient-level view).

**Tech Stack:** Next.js App Router, Supabase (Postgres + supabase-js), Zod, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-24-conversion-tracking-design.md`

## Global Constraints

- `npm run <script>` is broken in this workspace (the `&` in the path breaks npm's script resolution) — call binaries directly: `node_modules/.bin/tsc`, `node_modules/.bin/vitest`, `node_modules/.bin/eslint`.
- Never run `node_modules/.bin/next build` while the dev server (`next dev -p 3000`) is live.
- `src/lib/supabase/database.types.ts` must never be regenerated wholesale (it reintroduces ~20 unrelated pre-existing tsc errors elsewhere in the codebase) — hand-add the two new columns to the `whatsapp_batches` and `campaigns` entries only, matching the existing style exactly.
- 30-day fixed conversion window (`WINDOW_DAYS = 30` in `src/lib/crm/conversion.ts`) — not configurable per batch/campaign in this slice.
- "Not converted (yet)" is the only copy ever used for a non-converted recipient — never "lost interest" anywhere in code, UI copy, or comments (see spec Decisions).
- Exactly one of `conversion_course_id` / `conversion_label_match` may be set on a row, enforced by a DB check constraint — `{ kind: "none" }` (both null) is the valid "not tracking" state, never a silent default when the admin hasn't chosen.
- Repo has no git remote; commit locally to `master` after each task, never push.

## Review Focus

- A batch/campaign tagged `{ kind: "none" }` must never compute or display a percentage, and must never run a `contact_purchases` query for it — a silent "any purchase counts" default would misrepresent conversion for something the admin explicitly opted out of.
- A purchase exactly at the window boundary (`sentAt + 30 days`, to the millisecond) must count as converted; one second past must not — an off-by-one here either under- or over-credits every batch near the edge.
- `contact_purchases.purchased_at` is nullable (not every historical import captured it) — a purchase with `purchased_at: null` must fall back to `created_at`, not be silently excluded from ever counting as a conversion.
- A recipient who was never actually sent to (a still-`pending` WhatsApp recipient, or a campaign recipient whose `email_queue.sent_at` is still null because the queue hasn't drained yet) must never be treated as a conversion candidate, but must still count in the percentage's denominator — otherwise an in-flight campaign would misleadingly show 100% of a tiny "sent so far" group instead of the true fraction of its full audience.
- Course-label matching must be a case-insensitive substring match, not exact or case-sensitive — an admin typing "advanced mixing" must still match a real `product_label` of "Advanced Mixing Course – Batch 3".

---

### Task 1: Database schema — conversion tag columns

**Files:**
- Create: `supabase/migrations/0057_crm_conversion_tracking.sql`
- Modify: `src/lib/supabase/database.types.ts:2290-2330` (the `whatsapp_batches` entry) and `:319-368` (the `campaigns` entry)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `whatsapp_batches.conversion_course_id`, `whatsapp_batches.conversion_label_match`, `campaigns.conversion_course_id`, `campaigns.conversion_label_match` — every later task's SQL and hand-written types read these exact column names.

- [ ] **Step 1: Write the migration**

```sql
-- 0057_crm_conversion_tracking.sql
--
-- Lets an admin tag a WhatsApp batch or email campaign with the course it
-- was promoting, so conversion (a new matching purchase after sent_at) can
-- be computed at read time. Two mutually exclusive tag forms: an existing
-- courses row, or (since ~78% of contact_purchases.course_id is still null
-- — most product_label strings were never backfilled to a course) a
-- free-text pattern matched against contact_purchases.product_label.
-- Both null means "not tracking conversion" — an explicit admin choice
-- at creation time, never a silent default (see design doc, Decisions).

alter table public.whatsapp_batches
  add column if not exists conversion_course_id uuid references public.courses(id) on delete set null,
  add column if not exists conversion_label_match text;

alter table public.campaigns
  add column if not exists conversion_course_id uuid references public.courses(id) on delete set null,
  add column if not exists conversion_label_match text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'whatsapp_batches_conversion_tag_exclusive'
  ) then
    alter table public.whatsapp_batches
      add constraint whatsapp_batches_conversion_tag_exclusive
      check (conversion_course_id is null or conversion_label_match is null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'campaigns_conversion_tag_exclusive'
  ) then
    alter table public.campaigns
      add constraint campaigns_conversion_tag_exclusive
      check (conversion_course_id is null or conversion_label_match is null);
  end if;
end $$;
```

- [ ] **Step 2: Apply the migration via the Supabase MCP tool**

Use the `mcp__claude_ai_Supabase__apply_migration` tool against project id `whqdasotjlhvrjmgiffk`, with `name` "crm_conversion_tracking" and the SQL body above (do not run this through `psql`/CLI — this project's workflow applies migrations through the MCP tool, which also records them in Supabase's migration history).

- [ ] **Step 3: Verify the columns exist**

Run via `mcp__claude_ai_Supabase__execute_sql` against the same project:

```sql
select column_name, data_type from information_schema.columns
where table_name in ('whatsapp_batches', 'campaigns') and column_name like 'conversion_%'
order by table_name, column_name;
```

Expected: 4 rows — `campaigns.conversion_course_id` (uuid), `campaigns.conversion_label_match` (text), `whatsapp_batches.conversion_course_id` (uuid), `whatsapp_batches.conversion_label_match` (text).

- [ ] **Step 4: Hand-add the new columns to `database.types.ts`**

In the `whatsapp_batches` entry (currently at `src/lib/supabase/database.types.ts:2290-2330`), add `conversion_course_id: string | null` and `conversion_label_match: string | null` to all three of `Row`, `Insert`, and `Update` (as `?:` optional in `Insert`/`Update`, matching every other nullable column's existing style in that same block), and add a `Relationships` entry for the new FK:

```ts
      whatsapp_batches: {
        Row: {
          conversion_course_id: string | null
          conversion_label_match: string | null
          created_at: string
          created_by: string | null
          id: string
          message_template: string
          name: string
          recipient_count: number
          segment: Json
          sent_count: number
        }
        Insert: {
          conversion_course_id?: string | null
          conversion_label_match?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message_template: string
          name: string
          recipient_count?: number
          segment?: Json
          sent_count?: number
        }
        Update: {
          conversion_course_id?: string | null
          conversion_label_match?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message_template?: string
          name?: string
          recipient_count?: number
          segment?: Json
          sent_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_batches_conversion_course_id_fkey"
            columns: ["conversion_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
```

Do the equivalent edit on the `campaigns` entry (currently at `:319-368`):

```ts
      campaigns: {
        Row: {
          completed_at: string | null
          conversion_course_id: string | null
          conversion_label_match: string | null
          created_at: string
          created_by: string | null
          html_content: string
          id: string
          name: string
          scheduled_at: string | null
          segment: Json
          started_at: string | null
          status: Database["public"]["Enums"]["crm_campaign_status"]
          subject: string
        }
        Insert: {
          completed_at?: string | null
          conversion_course_id?: string | null
          conversion_label_match?: string | null
          created_at?: string
          created_by?: string | null
          html_content?: string
          id?: string
          name: string
          scheduled_at?: string | null
          segment?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["crm_campaign_status"]
          subject?: string
        }
        Update: {
          completed_at?: string | null
          conversion_course_id?: string | null
          conversion_label_match?: string | null
          created_at?: string
          created_by?: string | null
          html_content?: string
          id?: string
          name?: string
          scheduled_at?: string | null
          segment?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["crm_campaign_status"]
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_conversion_course_id_fkey"
            columns: ["conversion_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 5: Confirm the codebase still compiles**

Run: `node_modules/.bin/tsc --noEmit -p .`
Expected: no new errors (the codebase's existing unrelated errors, if any, are unaffected — nothing yet references the new columns).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0057_crm_conversion_tracking.sql src/lib/supabase/database.types.ts
git commit -m "feat(crm): add conversion tag columns to whatsapp_batches and campaigns"
```

---

### Task 2: Pure `resolveConversions` function (TDD)

**Files:**
- Create: `src/lib/crm/conversion.ts`
- Test: `tests/crm-conversion.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no I/O).
- Produces: `ConversionRecipient`, `ConversionPurchase`, `ConversionTag`, `ConversionResult` types and `resolveConversions(recipients, purchases, tag)` — every later task (data layer, validation schema, both panel components) imports `ConversionTag` from this file, and the data layer imports `resolveConversions` directly.

- [ ] **Step 1: Write the failing tests**

Create `tests/crm-conversion.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveConversions, type ConversionPurchase, type ConversionRecipient } from "@/lib/crm/conversion";

const SENT_AT = "2026-01-01T00:00:00.000Z";
const RECIPIENT: ConversionRecipient = { contactId: "contact-1", sentAt: SENT_AT };

function purchase(overrides: Partial<ConversionPurchase>): ConversionPurchase {
  return {
    contactId: "contact-1",
    purchasedAt: null,
    createdAt: SENT_AT,
    courseId: null,
    productLabel: "",
    ...overrides,
  };
}

describe("resolveConversions", () => {
  it("returns null convertedAt for every recipient when the tag is 'none', without needing purchases", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-05T00:00:00.000Z", courseId: "course-1" })],
      { kind: "none" },
    );
    expect(results).toEqual([{ contactId: "contact-1", convertedAt: null }]);
  });

  it("matches a course-tagged purchase by course_id", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-05T00:00:00.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("does not match a purchase of a different course", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-05T00:00:00.000Z", courseId: "course-2" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBeNull();
  });

  it("matches a label-tagged purchase by case-insensitive substring", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-05T00:00:00.000Z", productLabel: "Advanced Mixing Course – Batch 3" })],
      { kind: "label", pattern: "advanced mixing" },
    );
    expect(results[0].convertedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("does not match a label pattern that isn't present in product_label", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-05T00:00:00.000Z", productLabel: "Beginner Course" })],
      { kind: "label", pattern: "advanced mixing" },
    );
    expect(results[0].convertedAt).toBeNull();
  });

  it("counts a purchase exactly at the window boundary (sentAt + 30 days) as converted", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-31T00:00:00.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBe("2026-01-31T00:00:00.000Z");
  });

  it("does not count a purchase one second past the window boundary", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2026-01-31T00:00:01.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBeNull();
  });

  it("does not count a purchase before sentAt", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: "2025-12-31T23:59:59.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBeNull();
  });

  it("falls back to created_at when purchased_at is null", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ purchasedAt: null, createdAt: "2026-01-05T00:00:00.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("resolves to the earliest qualifying purchase when a contact has more than one", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [
        purchase({ purchasedAt: "2026-01-10T00:00:00.000Z", courseId: "course-1" }),
        purchase({ purchasedAt: "2026-01-03T00:00:00.000Z", courseId: "course-1" }),
      ],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("does not cross-match a purchase belonging to a different contact", () => {
    const results = resolveConversions(
      [RECIPIENT],
      [purchase({ contactId: "contact-2", purchasedAt: "2026-01-05T00:00:00.000Z", courseId: "course-1" })],
      { kind: "course", courseId: "course-1" },
    );
    expect(results[0].convertedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run tests/crm-conversion.test.ts`
Expected: FAIL — `Cannot find module '@/lib/crm/conversion'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/crm/conversion.ts`:

```ts
/**
 * Pure conversion resolution — no I/O. The caller (the shared data-layer
 * helper in admin-crm-conversions.ts) fetches recipients and purchases and
 * calls this; this just decides which recipients converted and when.
 *
 * `recipients` must already be filtered to ones that were actually sent
 * (a real sentAt) — this function trusts that and does not defend against
 * a recipient who was never messaged; the caller owns that filter (see the
 * design doc's Review Focus item on this).
 */

export type ConversionRecipient = { contactId: string; sentAt: string };

export type ConversionPurchase = {
  contactId: string;
  purchasedAt: string | null; // falls back to createdAt when null
  createdAt: string;
  courseId: string | null;
  productLabel: string;
};

export type ConversionTag =
  | { kind: "course"; courseId: string }
  | { kind: "label"; pattern: string } // case-insensitive substring match against productLabel
  | { kind: "none" };

export type ConversionResult = { contactId: string; convertedAt: string | null };

const WINDOW_DAYS = 30;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

function matchesTag(purchase: ConversionPurchase, tag: Exclude<ConversionTag, { kind: "none" }>): boolean {
  if (tag.kind === "course") return purchase.courseId === tag.courseId;
  return purchase.productLabel.toLowerCase().includes(tag.pattern.toLowerCase());
}

export function resolveConversions(
  recipients: ConversionRecipient[],
  purchases: ConversionPurchase[],
  tag: ConversionTag,
): ConversionResult[] {
  if (tag.kind === "none") {
    return recipients.map((r) => ({ contactId: r.contactId, convertedAt: null }));
  }

  const purchasesByContact = new Map<string, ConversionPurchase[]>();
  for (const p of purchases) {
    const list = purchasesByContact.get(p.contactId);
    if (list) list.push(p);
    else purchasesByContact.set(p.contactId, [p]);
  }

  return recipients.map((r) => {
    const sentAtMs = new Date(r.sentAt).getTime();
    const windowEndMs = sentAtMs + WINDOW_MS;

    const qualifying = (purchasesByContact.get(r.contactId) ?? [])
      .filter((p) => matchesTag(p, tag))
      .map((p) => new Date(p.purchasedAt ?? p.createdAt).getTime())
      .filter((ts) => ts >= sentAtMs && ts <= windowEndMs)
      .sort((a, b) => a - b);

    return {
      contactId: r.contactId,
      convertedAt: qualifying.length > 0 ? new Date(qualifying[0]).toISOString() : null,
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run tests/crm-conversion.test.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crm/conversion.ts tests/crm-conversion.test.ts
git commit -m "feat(crm): add pure resolveConversions function"
```

---

### Task 3: `conversionTagSchema` and wiring into existing schemas

**Files:**
- Modify: `src/lib/validations/crm.ts`
- Modify: `tests/crm.schema.test.ts`

**Interfaces:**
- Consumes: `ConversionTag` type shape from Task 2 (mirrored as a Zod schema, not imported — this file has no I/O and stays independent of `src/lib/crm/conversion.ts`, matching how `segmentFilterSchema` independently mirrors `SegmentFilter` rather than importing it).
- Produces: `conversionTagSchema`, and `conversionTag` as a **required** field on `whatsappBatchCreateSchema` / `campaignCreateSchema`, an **optional** field on `whatsappBatchUpdateSchema` (added to its "at least one field" refine). `campaignUpdateSchema` picks this up automatically since it's a bare alias of `campaignCreateSchema`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/crm.schema.test.ts` (append after the `templateCreateSchema` describe block, and add `conversionTagSchema` to the import list at the top):

```ts
describe("conversionTagSchema", () => {
  it("accepts a course tag", () => {
    const parsed = conversionTagSchema.safeParse({ kind: "course", courseId: "3f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f" });
    expect(parsed.success).toBe(true);
  });

  it("accepts a label tag", () => {
    const parsed = conversionTagSchema.safeParse({ kind: "label", pattern: "Advanced Mixing" });
    expect(parsed.success).toBe(true);
  });

  it("accepts a none tag with no other fields", () => {
    expect(conversionTagSchema.safeParse({ kind: "none" }).success).toBe(true);
  });

  it("rejects a course tag with a non-uuid courseId", () => {
    expect(conversionTagSchema.safeParse({ kind: "course", courseId: "nope" }).success).toBe(false);
  });

  it("rejects a label tag with a blank pattern", () => {
    expect(conversionTagSchema.safeParse({ kind: "label", pattern: "  " }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(conversionTagSchema.safeParse({ kind: "product" }).success).toBe(false);
  });
});

describe("whatsappBatchCreateSchema with conversionTag", () => {
  it("requires a conversionTag", () => {
    const parsed = whatsappBatchCreateSchema.safeParse({ name: "N", messageTemplate: "Hi", segment: [] });
    expect(parsed.success).toBe(false);
  });

  it("accepts a complete batch with a none conversionTag", () => {
    const parsed = whatsappBatchCreateSchema.safeParse({
      name: "N", messageTemplate: "Hi", segment: [], conversionTag: { kind: "none" },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("whatsappBatchUpdateSchema with conversionTag", () => {
  it("accepts conversionTag as the only field", () => {
    const parsed = whatsappBatchUpdateSchema.safeParse({ conversionTag: { kind: "none" } });
    expect(parsed.success).toBe(true);
  });
});

describe("campaignCreateSchema with conversionTag", () => {
  it("requires a conversionTag", () => {
    const parsed = campaignCreateSchema.safeParse({ name: "N", subject: "S", bodyHtml: "<p>x</p>", segment: [] });
    expect(parsed.success).toBe(false);
  });

  it("accepts a complete draft with a label conversionTag", () => {
    const parsed = campaignCreateSchema.safeParse({
      name: "N", subject: "S", bodyHtml: "<p>x</p>", segment: [],
      conversionTag: { kind: "label", pattern: "Advanced Mixing" },
    });
    expect(parsed.success).toBe(true);
  });
});
```

Update the import block at the top of `tests/crm.schema.test.ts` to add `conversionTagSchema` alongside the existing named imports.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: FAIL — `conversionTagSchema` is not exported, and the two "requires a conversionTag" tests fail because the field doesn't exist yet to reject its absence.

- [ ] **Step 3: Write the implementation**

In `src/lib/validations/crm.ts`, add after `templateCreateSchema` (before `whatsappRecipientStatusSchema`):

```ts
export const conversionTagSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), courseId: z.string().uuid() }),
  z.object({ kind: z.literal("label"), pattern: z.string().trim().min(1, "Pattern is required").max(200) }),
  z.object({ kind: z.literal("none") }),
]);
```

Then edit the existing schemas:

```ts
export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  bodyHtml: z.string().trim().min(1, "Body is required").max(100_000),
  segment: z.array(segmentFilterSchema).max(20),
  conversionTag: conversionTagSchema,
});
```

```ts
export const whatsappBatchCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  messageTemplate: z.string().trim().min(1, "Message is required").max(4096),
  segment: z.array(segmentFilterSchema).max(20),
  conversionTag: conversionTagSchema,
});

export const whatsappBatchUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(150).optional(),
    messageTemplate: z.string().trim().min(1, "Message is required").max(4096).optional(),
    segment: z.array(segmentFilterSchema).max(20).optional(),
    conversionTag: conversionTagSchema.optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined || v.messageTemplate !== undefined || v.segment !== undefined || v.conversionTag !== undefined,
    { message: "At least one field is required" },
  );
```

(`campaignUpdateSchema = campaignCreateSchema` is unchanged as a line — it picks up the new required field automatically, matching the file's existing comment that editing a draft "never changes what fields exist.")

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: PASS — all tests green, including the pre-existing ones (the old `campaignCreateSchema`/`whatsappBatchCreateSchema` tests in this file that don't pass a `conversionTag` will now fail unless updated — see Step 5).

- [ ] **Step 5: Fix the now-broken pre-existing tests**

The existing `describe("campaignCreateSchema", ...)` and `describe("whatsappBatchCreateSchema", ...)` blocks in this same file construct payloads without `conversionTag`; their "accepts a complete X" tests will now fail. Add `conversionTag: { kind: "none" }` to every payload in those two existing describe blocks that expects `success: true` (the ones expecting `false` — blank name/subject/body — stay as-is; they're already invalid for a different reason).

- [ ] **Step 6: Re-run the full schema test file**

Run: `node_modules/.bin/vitest run tests/crm.schema.test.ts`
Expected: PASS — every test in the file green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validations/crm.ts tests/crm.schema.test.ts
git commit -m "feat(crm): add conversionTagSchema, require it on batch/campaign create"
```

---

### Task 4: Shared conversion data-layer helper

**Files:**
- Create: `src/lib/data/admin-crm-conversions.ts`

**Interfaces:**
- Consumes: `resolveConversions`, `ConversionTag`, `ConversionPurchase`, `ConversionRecipient` from `src/lib/crm/conversion.ts` (Task 2); `createAdminSupabase` from `@/lib/supabase/admin`.
- Produces: `toConversionTag(courseId, labelMatch): ConversionTag`, `fromConversionTag(tag): { conversion_course_id: string | null; conversion_label_match: string | null }`, `ConversionSummary = { converted: number; total: number }`, `ConversionRecipientRow = { contactId: string; fullName: string; sentAt: string; convertedAt: string | null }`, and `computeConversions(sentRecipients, totalAudience, tag): Promise<{ summary: ConversionSummary; recipients: ConversionRecipientRow[] }>` — Tasks 5 and 6 both import all of these.

No test file for this task — it's a thin Supabase-querying wrapper around the already-tested pure function (same convention as `admin-crm-whatsapp.ts` itself, which has no direct unit tests; its logic is exercised through `whatsapp-batch-reconcile.test.ts`'s pure half and this session's live-verification step for the I/O half).

- [ ] **Step 1: Write the file**

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  resolveConversions,
  type ConversionPurchase,
  type ConversionRecipient,
  type ConversionTag,
} from "@/lib/crm/conversion";

/**
 * Shared by both channels' data layers. A batch/campaign row stores its tag
 * as two nullable columns (see migration 0057) rather than the ConversionTag
 * union directly — these two functions are the single place that translates
 * between the two shapes, so nothing else needs to know the column-pair
 * convention.
 */
export function toConversionTag(courseId: string | null, labelMatch: string | null): ConversionTag {
  if (courseId !== null) return { kind: "course", courseId };
  if (labelMatch !== null) return { kind: "label", pattern: labelMatch };
  return { kind: "none" };
}

export function fromConversionTag(tag: ConversionTag): {
  conversion_course_id: string | null;
  conversion_label_match: string | null;
} {
  if (tag.kind === "course") return { conversion_course_id: tag.courseId, conversion_label_match: null };
  if (tag.kind === "label") return { conversion_course_id: null, conversion_label_match: tag.pattern };
  return { conversion_course_id: null, conversion_label_match: null };
}

export type ConversionSummary = { converted: number; total: number };
export type ConversionRecipientRow = { contactId: string; fullName: string; sentAt: string; convertedAt: string | null };

/**
 * Fetches contact_purchases for the given recipients' contacts and resolves
 * conversion. `sentRecipients` must already be filtered by the caller to
 * ones with a real sentAt (see conversion.ts's docstring) — a recipient who
 * was never actually sent to cannot be a conversion candidate, but their
 * exclusion from this list must not affect `totalAudience`, which the
 * caller passes as the full batch/campaign recipient count so the
 * percentage's denominator includes still-pending/not-yet-sent recipients.
 *
 * Caller must have already confirmed `tag.kind !== "none"` — this always
 * queries and always returns a non-null summary.
 */
export async function computeConversions(
  sentRecipients: { contactId: string; fullName: string; sentAt: string }[],
  totalAudience: number,
  tag: Exclude<ConversionTag, { kind: "none" }>,
): Promise<{ summary: ConversionSummary; recipients: ConversionRecipientRow[] }> {
  const contactIds = [...new Set(sentRecipients.map((r) => r.contactId))];

  let purchases: ConversionPurchase[] = [];
  if (contactIds.length > 0) {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("contact_purchases")
      .select("contact_id, purchased_at, created_at, course_id, product_label")
      .in("contact_id", contactIds);
    purchases = (data ?? []).map((p) => ({
      contactId: p.contact_id,
      purchasedAt: p.purchased_at,
      createdAt: p.created_at,
      courseId: p.course_id,
      productLabel: p.product_label,
    }));
  }

  const forResolve: ConversionRecipient[] = sentRecipients.map((r) => ({ contactId: r.contactId, sentAt: r.sentAt }));
  const results = resolveConversions(forResolve, purchases, tag);
  const convertedAtByContact = new Map(results.map((r) => [r.contactId, r.convertedAt]));

  const recipients: ConversionRecipientRow[] = sentRecipients.map((r) => ({
    contactId: r.contactId,
    fullName: r.fullName,
    sentAt: r.sentAt,
    convertedAt: convertedAtByContact.get(r.contactId) ?? null,
  }));

  const converted = recipients.filter((r) => r.convertedAt !== null).length;
  return { summary: { converted, total: totalAudience }, recipients };
}
```

- [ ] **Step 2: Confirm it compiles**

Run: `node_modules/.bin/tsc --noEmit -p .`
Expected: no new errors (this file isn't imported by anything yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/admin-crm-conversions.ts
git commit -m "feat(crm): add shared conversion computation data-layer helper"
```

---

### Task 5: WhatsApp data layer — persist and compute conversion

**Files:**
- Modify: `src/lib/data/admin-crm-whatsapp.ts`

**Interfaces:**
- Consumes: `toConversionTag`, `fromConversionTag`, `computeConversions` from Task 4 (`@/lib/data/admin-crm-conversions`); `ConversionTag` type from Task 2.
- Produces: `WhatsAppBatchListRow` gains `conversionTag: ConversionTag`, `conversionCourseTitle: string | null`, `conversion: { converted: number; total: number } | null`. `WhatsAppRecipientRow` gains `convertedAt: string | null`. `createWhatsAppBatch`'s input gains a required `conversionTag: ConversionTag`. `updateWhatsAppBatch`'s `updates` gains an optional `conversionTag?: ConversionTag`. Task 7 (WhatsAppPanel UI) and Task 9 (ConversionPanel/page.tsx) consume these exact field names.

- [ ] **Step 1: Add the import**

At the top of `src/lib/data/admin-crm-whatsapp.ts`, add:

```ts
import { toConversionTag, fromConversionTag, computeConversions } from "./admin-crm-conversions";
import type { ConversionTag } from "@/lib/crm/conversion";
```

- [ ] **Step 2: Add the shared per-batch conversion fetcher**

Add this function after the `updateRecipientStatus` function (end of file), before nothing else follows it:

```ts
/**
 * Fetches this batch's recipients and resolves conversion. Returns `null`
 * summary/empty map when the batch isn't tracked — callers branch on
 * `tag.kind` before calling this, this is just the shared fetch+resolve
 * step reused by both listWhatsAppBatches (summary only) and
 * getWhatsAppBatchDetail (summary + per-recipient detail).
 */
async function fetchBatchConversion(
  batchId: string,
  recipientCount: number,
  tag: ConversionTag,
): Promise<{ summary: { converted: number; total: number } | null; convertedAtByRecipientId: Map<string, string | null> }> {
  if (tag.kind === "none") return { summary: null, convertedAtByRecipientId: new Map() };

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("whatsapp_batch_recipients")
    .select("id, contact_id, full_name, sent_at, status")
    .eq("batch_id", batchId);

  const sent = (data ?? [])
    .filter(
      (r): r is typeof r & { contact_id: string; sent_at: string } =>
        r.status === "sent" && r.contact_id !== null && r.sent_at !== null,
    )
    .map((r) => ({ recipientId: r.id, contactId: r.contact_id, fullName: r.full_name, sentAt: r.sent_at }));

  const { summary, recipients } = await computeConversions(sent, recipientCount, tag);
  const convertedAtByContact = new Map(recipients.map((r) => [r.contactId, r.convertedAt]));
  const convertedAtByRecipientId = new Map(sent.map((r) => [r.recipientId, convertedAtByContact.get(r.contactId) ?? null]));

  return { summary, convertedAtByRecipientId };
}
```

- [ ] **Step 3: Extend `WhatsAppBatchListRow` and `listWhatsAppBatches`**

Replace the existing `WhatsAppBatchListRow` type and `listWhatsAppBatches` function with:

```ts
export type WhatsAppBatchListRow = {
  id: string;
  name: string;
  messageTemplate: string;
  recipientCount: number;
  sentCount: number;
  createdAt: string;
  conversionTag: ConversionTag;
  conversionCourseTitle: string | null;
  conversion: { converted: number; total: number } | null;
};

export async function listWhatsAppBatches(): Promise<WhatsAppBatchListRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("whatsapp_batches")
    .select(
      "id, name, message_template, recipient_count, sent_count, created_at, conversion_course_id, conversion_label_match, courses(title)",
    )
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const conversions = await Promise.all(
    rows.map((b) =>
      fetchBatchConversion(b.id, b.recipient_count, toConversionTag(b.conversion_course_id, b.conversion_label_match)),
    ),
  );

  return rows.map((b, i) => ({
    id: b.id,
    name: b.name,
    messageTemplate: b.message_template,
    recipientCount: b.recipient_count,
    sentCount: b.sent_count,
    createdAt: b.created_at,
    conversionTag: toConversionTag(b.conversion_course_id, b.conversion_label_match),
    conversionCourseTitle: (b.courses as { title: string } | null)?.title ?? null,
    conversion: conversions[i].summary,
  }));
}
```

- [ ] **Step 4: Wire `conversionTag` into `createWhatsAppBatch`**

Change the input type and the insert call:

```ts
export async function createWhatsAppBatch(
  userId: string,
  input: { name: string; messageTemplate: string; segment: SegmentFilter[]; conversionTag: ConversionTag },
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
      ...fromConversionTag(input.conversionTag),
    })
    .select("id")
    .single();
```

(The rest of `createWhatsAppBatch` is unchanged.)

- [ ] **Step 5: Wire `conversionTag` into `updateWhatsAppBatch`**

Add `conversionTag?: ConversionTag` to the `updates` parameter type, and spread `fromConversionTag` into both update calls inside the function body:

```ts
export async function updateWhatsAppBatch(
  batchId: string,
  updates: { name?: string; messageTemplate?: string; segment?: SegmentFilter[]; conversionTag?: ConversionTag },
): Promise<UpdateWhatsAppBatchResult> {
```

In the `updates.segment !== undefined` branch, the `.update({...})` call becomes:

```ts
      .update({
        segment: updates.segment,
        recipient_count: count ?? 0,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.messageTemplate !== undefined ? { message_template: updates.messageTemplate } : {}),
        ...(updates.conversionTag !== undefined ? fromConversionTag(updates.conversionTag) : {}),
      })
```

And the final plain-branch `.update({...})` call becomes:

```ts
    .update({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.messageTemplate !== undefined ? { message_template: updates.messageTemplate } : {}),
      ...(updates.conversionTag !== undefined ? fromConversionTag(updates.conversionTag) : {}),
    })
```

- [ ] **Step 6: Extend `WhatsAppRecipientRow`, `WhatsAppBatchDetail`, and `getWhatsAppBatchDetail`**

Replace the existing `WhatsAppRecipientRow` type, `WhatsAppBatchDetail` type, and `getWhatsAppBatchDetail` function with:

```ts
export type WhatsAppRecipientRow = {
  id: string;
  fullName: string;
  phoneE164: string;
  status: "pending" | "sent";
  sentAt: string | null;
  convertedAt: string | null;
};

export type WhatsAppBatchDetail = WhatsAppBatchListRow & {
  segment: SegmentFilter[];
  recipients: WhatsAppRecipientRow[];
};

export async function getWhatsAppBatchDetail(id: string): Promise<WhatsAppBatchDetail | null> {
  const admin = createAdminSupabase();
  const { data: batch } = await admin
    .from("whatsapp_batches")
    .select(
      "id, name, message_template, segment, recipient_count, sent_count, created_at, conversion_course_id, conversion_label_match, courses(title)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!batch) return null;

  const { data: recipients } = await admin
    .from("whatsapp_batch_recipients")
    .select("id, full_name, phone_e164, status, sent_at")
    .eq("batch_id", id)
    .order("full_name", { ascending: true });

  const tag = toConversionTag(batch.conversion_course_id, batch.conversion_label_match);
  const { summary, convertedAtByRecipientId } = await fetchBatchConversion(id, batch.recipient_count, tag);
  const rows = recipients ?? [];

  return {
    id: batch.id,
    name: batch.name,
    messageTemplate: batch.message_template,
    segment: (batch.segment ?? []) as SegmentFilter[],
    recipientCount: batch.recipient_count,
    sentCount: batch.sent_count,
    createdAt: batch.created_at,
    conversionTag: tag,
    conversionCourseTitle: (batch.courses as { title: string } | null)?.title ?? null,
    conversion: summary,
    recipients: rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      phoneE164: r.phone_e164,
      status: r.status,
      sentAt: r.sent_at,
      convertedAt: convertedAtByRecipientId.get(r.id) ?? null,
    })),
  };
}
```

- [ ] **Step 7: Confirm it compiles**

Run: `node_modules/.bin/tsc --noEmit -p .`
Expected: new errors will surface in `src/app/api/admin/crm/whatsapp/batches/route.ts`'s caller if the schema/data-layer shapes mismatch — there should be none, since `whatsappBatchCreateSchema`'s `conversionTag` (Task 3) already matches `createWhatsAppBatch`'s new required field. If tsc reports an error here, stop and reconcile the two shapes before continuing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/admin-crm-whatsapp.ts
git commit -m "feat(crm): persist and compute WhatsApp batch conversion"
```

---

### Task 6: Campaign data layer — persist and compute conversion, plus the conversions detail route

**Files:**
- Modify: `src/lib/data/admin-crm-campaigns.ts`
- Create: `src/app/api/admin/crm/campaigns/[id]/conversions/route.ts`

**Interfaces:**
- Consumes: `toConversionTag`, `fromConversionTag`, `computeConversions` (Task 4); `ConversionTag` (Task 2); `requireAdmin` from `@/lib/auth/require-admin`.
- Produces: `CampaignRow` gains `conversionTag`, `conversionCourseTitle`, `conversion` (same shape as WhatsApp's, Task 5). `CampaignDetail` gains `conversionTag`. `createCampaign`'s input and `updateCampaign`'s input both gain a required `conversionTag: ConversionTag`. New exported `getCampaignConversionDetail(campaignId): Promise<{ converted: number; total: number; recipients: ConversionRecipientRow[] } | null>`, served by the new route at `GET /api/admin/crm/campaigns/[id]/conversions`. Task 8 (CampaignsPanel UI) and Task 9 (ConversionPanel) consume these.

- [ ] **Step 1: Add the import**

At the top of `src/lib/data/admin-crm-campaigns.ts`, add:

```ts
import { toConversionTag, fromConversionTag, computeConversions } from "./admin-crm-conversions";
import type { ConversionTag } from "@/lib/crm/conversion";
```

- [ ] **Step 2: Add the shared per-campaign conversion fetcher**

Add after the imports, before `CampaignRow`:

```ts
/**
 * Fetches this campaign's sent recipients (via campaign_recipients →
 * email_queue for the real send timestamp, and → contacts for the display
 * name campaign_recipients doesn't itself snapshot) and resolves
 * conversion. Mirrors fetchBatchConversion in admin-crm-whatsapp.ts, but
 * campaigns have no denormalized recipient_count column, so callers pass
 * the audience size they already have (from crm_campaign_stats, or a
 * direct count for the standalone conversions endpoint).
 */
async function fetchCampaignConversion(
  campaignId: string,
  totalAudience: number,
  tag: ConversionTag,
): Promise<{ summary: { converted: number; total: number } | null; recipients: { contactId: string; fullName: string; sentAt: string; convertedAt: string | null }[] }> {
  if (tag.kind === "none") return { summary: null, recipients: [] };

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("campaign_recipients")
    .select("contact_id, email_queue(sent_at), contacts(full_name)")
    .eq("campaign_id", campaignId);

  const sent = (data ?? [])
    .map((r) => ({
      contactId: r.contact_id,
      fullName: (r.contacts as { full_name: string } | null)?.full_name ?? "",
      sentAt: (r.email_queue as { sent_at: string | null } | null)?.sent_at ?? null,
    }))
    .filter((r): r is { contactId: string; fullName: string; sentAt: string } => r.sentAt !== null);

  const { summary, recipients } = await computeConversions(sent, totalAudience, tag);
  return { summary, recipients };
}
```

- [ ] **Step 3: Extend `CampaignRow` and `listCampaigns`**

Replace the existing `CampaignRow` type and `listCampaigns` function with:

```ts
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
  conversionTag: ConversionTag;
  conversionCourseTitle: string | null;
  conversion: { converted: number; total: number } | null;
};

export async function listCampaigns(): Promise<CampaignRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("crm_campaign_stats")
    .select("campaign_id, name, status, created_at, recipients, sent, delivered, opened, clicked, bounced")
    .order("created_at", { ascending: false });

  const filtered = (data ?? []).filter((c): c is typeof c & { campaign_id: string } => c.campaign_id !== null);

  // Replaces the old bare "subjects" lookup — same trip now also carries
  // each campaign's conversion tag, since crm_campaign_stats (a view built
  // for the pre-conversion slice) doesn't expose it.
  const { data: extra } = await admin
    .from("campaigns")
    .select("id, subject, conversion_course_id, conversion_label_match, courses(title)");
  const extraById = new Map((extra ?? []).map((c) => [c.id, c]));

  const conversions = await Promise.all(
    filtered.map((c) => {
      const row = extraById.get(c.campaign_id);
      const tag = toConversionTag(row?.conversion_course_id ?? null, row?.conversion_label_match ?? null);
      return fetchCampaignConversion(c.campaign_id, Number(c.recipients ?? 0), tag);
    }),
  );

  return filtered.map((c, i) => {
    const row = extraById.get(c.campaign_id);
    return {
      id: c.campaign_id,
      name: c.name ?? "",
      subject: row?.subject ?? "",
      status: c.status ?? "draft",
      createdAt: c.created_at ?? "",
      recipients: Number(c.recipients ?? 0),
      sent: Number(c.sent ?? 0),
      delivered: Number(c.delivered ?? 0),
      opened: Number(c.opened ?? 0),
      clicked: Number(c.clicked ?? 0),
      bounced: Number(c.bounced ?? 0),
      conversionTag: toConversionTag(row?.conversion_course_id ?? null, row?.conversion_label_match ?? null),
      conversionCourseTitle: (row?.courses as { title: string } | null)?.title ?? null,
      conversion: conversions[i].summary,
    };
  });
}
```

- [ ] **Step 4: Extend `CampaignDetail` and `getCampaign`**

```ts
export type CampaignDetail = {
  name: string;
  subject: string;
  bodyHtml: string;
  segment: SegmentFilter[];
  conversionTag: ConversionTag;
};

/** Backs "Duplicate" and "Edit" on a past campaign — loads it back into the composer. */
export async function getCampaign(id: string): Promise<CampaignDetail | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("campaigns")
    .select("name, subject, html_content, segment, conversion_course_id, conversion_label_match")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  return {
    name: data.name,
    subject: data.subject,
    bodyHtml: data.html_content,
    segment: (Array.isArray(data.segment) ? data.segment : []) as SegmentFilter[],
    conversionTag: toConversionTag(data.conversion_course_id, data.conversion_label_match),
  };
}
```

- [ ] **Step 5: Wire `conversionTag` into `createCampaign` and `updateCampaign`**

```ts
export async function createCampaign(
  userId: string,
  input: { name: string; subject: string; bodyHtml: string; segment: SegmentFilter[]; conversionTag: ConversionTag },
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
      ...fromConversionTag(input.conversionTag),
    })
    .select("id")
    .single();
```

```ts
export async function updateCampaign(
  id: string,
  input: { name: string; subject: string; bodyHtml: string; segment: SegmentFilter[]; conversionTag: ConversionTag },
): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: existing } = await admin.from("campaigns").select("status").eq("id", id).maybeSingle();
  if (!existing) return { ok: false, reason: "not-found" };
  if (existing.status !== "draft") return { ok: false, reason: "already-sent" };

  const { error } = await admin
    .from("campaigns")
    .update({
      name: input.name,
      subject: input.subject,
      html_content: input.bodyHtml,
      segment: input.segment,
      ...fromConversionTag(input.conversionTag),
    })
    .eq("id", id);
```

(The rest of both functions is unchanged.)

- [ ] **Step 6: Add `getCampaignConversionDetail`**

Add after `sendCampaign` (end of file):

```ts
export type CampaignConversionDetail = {
  converted: number;
  total: number;
  recipients: { contactId: string; fullName: string; sentAt: string; convertedAt: string | null }[];
} | null;

/**
 * Standalone per-campaign conversion detail — unlike WhatsApp (whose batch
 * detail endpoint already carries recipients+convertedAt), campaigns have
 * no other recipient-level view, so this is the sole endpoint the
 * Conversion tab drill-down calls for the email side. Returns null both
 * when the campaign isn't tracked and when it doesn't exist — the route
 * distinguishes those by checking existence separately.
 */
export async function getCampaignConversionDetail(campaignId: string): Promise<CampaignConversionDetail> {
  const admin = createAdminSupabase();
  const { data: campaign } = await admin
    .from("campaigns")
    .select("conversion_course_id, conversion_label_match")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return null;

  const tag = toConversionTag(campaign.conversion_course_id, campaign.conversion_label_match);
  if (tag.kind === "none") return null;

  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  const { summary, recipients } = await fetchCampaignConversion(campaignId, count ?? 0, tag);
  if (!summary) return null;
  return { converted: summary.converted, total: summary.total, recipients };
}
```

- [ ] **Step 7: Create the new route**

Create `src/app/api/admin/crm/campaigns/[id]/conversions/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCampaignConversionDetail } from "@/lib/data/admin-crm-campaigns";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const detail = await getCampaignConversionDetail(id);
  if (!detail) return NextResponse.json({ error: "Not tracked" }, { status: 404 });

  return NextResponse.json(detail);
}
```

- [ ] **Step 8: Confirm it compiles**

Run: `node_modules/.bin/tsc --noEmit -p .`
Expected: no new errors. `campaignCreateSchema`'s now-required `conversionTag` (Task 3) matches `createCampaign`'s new required field, and `campaignUpdateSchema` (= `campaignCreateSchema`) matches `updateCampaign`'s.

- [ ] **Step 9: Commit**

```bash
git add src/lib/data/admin-crm-campaigns.ts "src/app/api/admin/crm/campaigns/[id]/conversions/route.ts"
git commit -m "feat(crm): persist and compute campaign conversion, add conversions detail route"
```

---

### Task 7: WhatsAppPanel UI — course tag picker, row badge, Converted column

**Files:**
- Modify: `src/components/admin/crm/WhatsAppPanel.tsx`

**Interfaces:**
- Consumes: `ConversionTag` type (Task 2); `WhatsAppBatchListRow`/`WhatsAppBatchDetail`/`WhatsAppRecipientRow` shape (Task 5, via the existing `initialBatches` prop and the existing detail-fetch `fetch` calls — no new fetch needed, the existing `GET` routes now return the richer shape); `GET /api/admin/crm/courses` (pre-existing route, returns `{ courses: { id: string; title: string; type: string }[] }`).
- Produces: nothing new consumed elsewhere — this is a leaf UI task.

- [ ] **Step 1: Add the import and extend the local types**

Add near the top imports:

```ts
import type { ConversionTag } from "@/lib/crm/conversion";
```

Replace `BatchListRow`, `Recipient`, and `BatchDetail`:

```ts
type BatchListRow = {
  id: string;
  name: string;
  messageTemplate: string;
  recipientCount: number;
  sentCount: number;
  createdAt: string;
  conversionTag: ConversionTag;
  conversionCourseTitle: string | null;
  conversion: { converted: number; total: number } | null;
};

type Recipient = { id: string; fullName: string; phoneE164: string; status: "pending" | "sent"; sentAt: string | null; convertedAt: string | null };
type BatchDetail = BatchListRow & { segment: SegmentFilter[]; recipients: Recipient[] };
```

- [ ] **Step 2: Add course-tag picker state**

Add alongside the existing `useState` declarations near the top of the component:

```ts
const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
const [conversionMode, setConversionMode] = useState<"course" | "label" | "none" | "">("");
const [conversionCourseId, setConversionCourseId] = useState("");
const [conversionLabel, setConversionLabel] = useState("");
```

Add a mount effect (alongside the existing sessionStorage-pickup effect):

```ts
useEffect(() => {
  fetch("/api/admin/crm/courses")
    .then((r) => r.json())
    .then((j: { courses?: { id: string; title: string }[] }) => setCourses(j.courses ?? []))
    .catch(() => {});
}, []);
```

Add a helper function near `insertTag`:

```ts
function buildConversionTag(): ConversionTag | null {
  if (conversionMode === "course") return conversionCourseId ? { kind: "course", courseId: conversionCourseId } : null;
  if (conversionMode === "label") return conversionLabel.trim() ? { kind: "label", pattern: conversionLabel.trim() } : null;
  if (conversionMode === "none") return { kind: "none" };
  return null;
}
```

- [ ] **Step 3: Wire `conversionTag` into `createBatch`**

Modify the `createBatch` function's body and reset logic:

```ts
async function createBatch() {
  setCreating(true);
  setCreateError(null);
  const conversionTag = buildConversionTag();
  if (!conversionTag) { setCreating(false); return; }
  try {
    const res = await fetch("/api/admin/crm/whatsapp/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, messageTemplate: message, segment, conversionTag }),
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
    setConversionMode("");
    setConversionCourseId("");
    setConversionLabel("");
    const list = await fetch("/api/admin/crm/whatsapp/batches");
    if (list.ok) setBatches((await list.json()).batches);
  } finally {
    setCreating(false);
  }
}
```

- [ ] **Step 4: Add the picker JSX to the compose form**

In the "New batch" section, after the `<SegmentBuilder .../>` line and before the `{createError && ...}` line, add:

```tsx
<div className="space-y-2">
  <h3 className="font-headline text-sm font-semibold">Track conversion</h3>
  <div className="flex gap-3 flex-wrap">
    <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
      <input type="radio" name="whatsappConversionMode" checked={conversionMode === "course"} onChange={() => setConversionMode("course")} />
      Existing course
    </label>
    <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
      <input type="radio" name="whatsappConversionMode" checked={conversionMode === "label"} onChange={() => setConversionMode("label")} />
      Other course (type to match)
    </label>
    <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
      <input type="radio" name="whatsappConversionMode" checked={conversionMode === "none"} onChange={() => setConversionMode("none")} />
      Not tracking conversion
    </label>
  </div>
  {conversionMode === "course" && (
    <select
      value={conversionCourseId}
      onChange={(e) => setConversionCourseId(e.target.value)}
      className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
    >
      <option value="">Select a course…</option>
      {courses.map((c) => (
        <option key={c.id} value={c.id}>{c.title}</option>
      ))}
    </select>
  )}
  {conversionMode === "label" && (
    <input
      value={conversionLabel}
      onChange={(e) => setConversionLabel(e.target.value)}
      placeholder="Text to match in the purchase's product label, e.g. Advanced Mixing"
      className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
    />
  )}
</div>
```

- [ ] **Step 5: Gate "Create batch" on a chosen conversion tag**

Change the button's `disabled`:

```tsx
<button
  onClick={createBatch}
  disabled={creating || name.trim() === "" || message.trim() === "" || buildConversionTag() === null}
  className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50"
>
```

- [ ] **Step 6: Add the row badge**

In the batch list row, change the sent-count `<span>` to also show conversion when present:

```tsx
<span className="font-body text-xs text-pz-on-surface-variant tabular-nums">
  {b.sentCount} / {b.recipientCount} sent
  {b.conversion && (
    <>
      {" · "}
      {b.recipientCount > 0 ? Math.round((b.conversion.converted / b.recipientCount) * 100) : 0}% converted (
      {b.conversion.converted}/{b.recipientCount}) · Not converted (yet): {b.recipientCount - b.conversion.converted}
    </>
  )}
</span>
```

- [ ] **Step 7: Add the Converted column to the recipient table**

In the non-queue-mode `<table>`, change the header row and add a cell:

```tsx
<thead className="text-pz-on-surface-variant text-xs uppercase">
  <tr><th className="py-1">Name</th><th>Phone</th><th></th><th></th><th>Converted</th></tr>
</thead>
```

And inside the `<tbody>`'s `.map`, add a new `<td>` after the existing "sent" checkbox `<td>`:

```tsx
<td className="text-xs">
  {detail.conversion
    ? r.convertedAt
      ? new Date(r.convertedAt).toLocaleDateString()
      : "Not converted (yet)"
    : "—"}
</td>
```

- [ ] **Step 8: Confirm it compiles and lints**

Run: `node_modules/.bin/tsc --noEmit -p .`
Run: `node_modules/.bin/eslint src/components/admin/crm/WhatsAppPanel.tsx`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/crm/WhatsAppPanel.tsx
git commit -m "feat(crm): add conversion tag picker, badge, and column to WhatsAppPanel"
```

---

### Task 8: CampaignsPanel UI — course tag picker, Converted column

**Files:**
- Modify: `src/components/admin/crm/CampaignsPanel.tsx`

**Interfaces:**
- Consumes: `ConversionTag` type (Task 2); `CampaignRow`/`CampaignDetail` shape (Task 6, via existing `initialCampaigns` prop and existing `getCampaign`-backed fetch in `editCampaign`/`duplicateCampaign`); `GET /api/admin/crm/courses`.
- Produces: nothing new consumed elsewhere — leaf UI task.

- [ ] **Step 1: Add the import and extend the local `Campaign` type**

Add near the top imports:

```ts
import type { ConversionTag } from "@/lib/crm/conversion";
```

Replace the `Campaign` type:

```ts
type Campaign = {
  id: string; name: string; subject: string; status: string; createdAt: string;
  recipients: number; sent: number; delivered: number; opened: number; clicked: number; bounced: number;
  conversionTag: ConversionTag;
  conversionCourseTitle: string | null;
  conversion: { converted: number; total: number } | null;
};
```

- [ ] **Step 2: Add course-tag picker state and helpers**

Add alongside the existing `useState` declarations:

```ts
const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
const [conversionMode, setConversionMode] = useState<"course" | "label" | "none" | "">("");
const [conversionCourseId, setConversionCourseId] = useState("");
const [conversionLabel, setConversionLabel] = useState("");
```

Add a mount effect:

```ts
useEffect(() => {
  fetch("/api/admin/crm/courses")
    .then((r) => r.json())
    .then((j: { courses?: { id: string; title: string }[] }) => setCourses(j.courses ?? []))
    .catch(() => {});
}, []);
```

Add helpers near `invalidateDraft`:

```ts
function buildConversionTag(): ConversionTag | null {
  if (conversionMode === "course") return conversionCourseId ? { kind: "course", courseId: conversionCourseId } : null;
  if (conversionMode === "label") return conversionLabel.trim() ? { kind: "label", pattern: conversionLabel.trim() } : null;
  if (conversionMode === "none") return { kind: "none" };
  return null;
}

function loadConversionTag(tag: ConversionTag) {
  if (tag.kind === "course") { setConversionMode("course"); setConversionCourseId(tag.courseId); setConversionLabel(""); }
  else if (tag.kind === "label") { setConversionMode("label"); setConversionLabel(tag.pattern); setConversionCourseId(""); }
  else { setConversionMode("none"); setConversionCourseId(""); setConversionLabel(""); }
}

const editConversionMode = (v: typeof conversionMode) => { setConversionMode(v); invalidateDraft(); };
const editConversionCourseId = (v: string) => { setConversionCourseId(v); invalidateDraft(); };
const editConversionLabel = (v: string) => { setConversionLabel(v); invalidateDraft(); };
```

- [ ] **Step 3: Reset/reload conversion state in `newCampaign`, `editCampaign`, `duplicateCampaign`**

In `newCampaign`, add before the closing brace:

```ts
setConversionMode("");
setConversionCourseId("");
setConversionLabel("");
```

In `duplicateCampaign`, the `json` type and body change:

```ts
async function duplicateCampaign(id: string) {
  setError(null);
  try {
    const res = await fetch(`/api/admin/crm/campaigns/${id}`);
    if (!res.ok) throw new Error();
    const json = (await res.json()) as { name: string; subject: string; bodyHtml: string; segment: SegmentFilter[]; conversionTag: ConversionTag };
    setName(`${json.name} (copy)`);
    setSubject(json.subject);
    setBodyHtml(json.bodyHtml);
    setSegment(json.segment);
    loadConversionTag(json.conversionTag);
    setBoundId(null);
    invalidateDraft();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    setError("Could not load that campaign.");
  }
}
```

Apply the identical `json` type change and add `loadConversionTag(json.conversionTag);` (after `setSegment(json.segment);`) in `editCampaign`.

- [ ] **Step 4: Wire `conversionTag` into `saveDraft`**

```ts
async function saveDraft() {
  const conversionTag = buildConversionTag();
  if (!conversionTag) return;
  setBusy(true); setError(null);
  try {
    const url = boundId ? `/api/admin/crm/campaigns/${boundId}` : "/api/admin/crm/campaigns";
    const res = await fetch(url, {
      method: boundId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, subject, bodyHtml, segment, conversionTag }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Could not save the draft.");
    setBoundId(json.id);
    setDraftId(json.id);
    setNotice("Draft saved. Send a test to yourself before sending to the segment.");
    await reload();
    router.refresh();
  } catch (e) {
    setError(e instanceof Error ? e.message : "Could not save the draft.");
  } finally { setBusy(false); }
}
```

- [ ] **Step 5: Add the picker JSX and gate "Save draft"**

After the `<SegmentBuilder value={segment} onChange={editSegment} />` block, add:

```tsx
<div className="space-y-2">
  <h3 className="font-headline text-sm font-semibold">Track conversion</h3>
  <div className="flex gap-3 flex-wrap">
    <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
      <input type="radio" name="campaignConversionMode" checked={conversionMode === "course"} onChange={() => editConversionMode("course")} />
      Existing course
    </label>
    <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
      <input type="radio" name="campaignConversionMode" checked={conversionMode === "label"} onChange={() => editConversionMode("label")} />
      Other course (type to match)
    </label>
    <label className="flex items-center gap-1.5 text-sm font-body cursor-pointer">
      <input type="radio" name="campaignConversionMode" checked={conversionMode === "none"} onChange={() => editConversionMode("none")} />
      Not tracking conversion
    </label>
  </div>
  {conversionMode === "course" && (
    <select
      value={conversionCourseId}
      onChange={(e) => editConversionCourseId(e.target.value)}
      className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
    >
      <option value="">Select a course…</option>
      {courses.map((c) => (
        <option key={c.id} value={c.id}>{c.title}</option>
      ))}
    </select>
  )}
  {conversionMode === "label" && (
    <input
      value={conversionLabel}
      onChange={(e) => editConversionLabel(e.target.value)}
      placeholder="Text to match in the purchase's product label, e.g. Advanced Mixing"
      className="w-full rounded-xl border border-pz-outline-variant px-4 py-2 font-body text-sm"
    />
  )}
</div>
```

Change the "Save draft" button's `disabled`:

```tsx
<button onClick={saveDraft} disabled={busy || buildConversionTag() === null}
  className="px-5 py-2 rounded-full bg-pz-primary text-pz-on-primary font-headline text-sm font-semibold disabled:opacity-50">
  {busy ? "Saving…" : "Save draft"}
</button>
```

- [ ] **Step 6: Add the Converted column to the "Sent campaigns" table**

Change the header row:

```tsx
<tr><th className="py-2">Name</th><th>Status</th><th>Recipients</th><th>Sent</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Bounced</th><th>Converted</th><th></th></tr>
```

Add a cell after the `Bounced` `<td>` and before the actions `<td>`:

```tsx
<td className="tabular-nums">
  {c.conversion
    ? `${c.conversion.total > 0 ? Math.round((c.conversion.converted / c.conversion.total) * 100) : 0}% (${c.conversion.converted}/${c.conversion.total})`
    : "—"}
</td>
```

- [ ] **Step 7: Confirm it compiles and lints**

Run: `node_modules/.bin/tsc --noEmit -p .`
Run: `node_modules/.bin/eslint src/components/admin/crm/CampaignsPanel.tsx`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/crm/CampaignsPanel.tsx
git commit -m "feat(crm): add conversion tag picker and column to CampaignsPanel"
```

---

### Task 9: Conversion tab — new panel and page wiring

**Files:**
- Create: `src/components/admin/crm/ConversionPanel.tsx`
- Modify: `src/app/dashboard/admin/crm/page.tsx`

**Interfaces:**
- Consumes: `WhatsAppBatchListRow` shape from `listWhatsAppBatches()` (Task 5) and `CampaignRow` shape from `listCampaigns()` (Task 6), both already fetched by `page.tsx`; existing `GET /api/admin/crm/whatsapp/batches/[id]` (Task 5, now returns `recipients[].convertedAt`); new `GET /api/admin/crm/campaigns/[id]/conversions` (Task 6).
- Produces: `ConversionTrackedItem` type and `ConversionPanel` component — nothing downstream of this task.

- [ ] **Step 1: Write `ConversionPanel.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { ConversionTag } from "@/lib/crm/conversion";

export type ConversionTrackedItem = {
  kind: "whatsapp" | "campaign";
  id: string;
  name: string;
  conversionTag: ConversionTag;
  conversionCourseTitle: string | null;
  conversion: { converted: number; total: number };
};

type ExpandedRow = { id: string; fullName: string; convertedAt: string | null };

/**
 * The only per-recipient drill-down for email conversion — CampaignsPanel
 * has no other recipient-level view (see design doc). WhatsApp rows expand
 * the same way here for consistency, even though their batch detail view
 * (WhatsAppPanel) already has its own Converted column.
 */
export function ConversionPanel({ items }: { items: ConversionTrackedItem[] }) {
  const sorted = [...items].sort((a, b) => {
    const pctA = a.conversion.total > 0 ? a.conversion.converted / a.conversion.total : 0;
    const pctB = b.conversion.total > 0 ? b.conversion.converted / b.conversion.total : 0;
    return pctB - pctA;
  });

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [rows, setRows] = useState<ExpandedRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle(item: ConversionTrackedItem) {
    const key = `${item.kind}:${item.id}`;
    if (openKey === key) {
      setOpenKey(null);
      setRows(null);
      return;
    }
    setOpenKey(key);
    setRows(null);
    setLoading(true);
    try {
      if (item.kind === "whatsapp") {
        const res = await fetch(`/api/admin/crm/whatsapp/batches/${item.id}`);
        const json = await res.json();
        const recipients = (json.recipients ?? []) as { id: string; fullName: string; status: string; convertedAt: string | null }[];
        setRows(
          recipients
            .filter((r) => r.status === "sent")
            .map((r) => ({ id: r.id, fullName: r.fullName, convertedAt: r.convertedAt })),
        );
      } else {
        const res = await fetch(`/api/admin/crm/campaigns/${item.id}/conversions`);
        const json = await res.json();
        const recipients = (json.recipients ?? []) as { contactId: string; fullName: string; convertedAt: string | null }[];
        setRows(recipients.map((r) => ({ id: r.contactId, fullName: r.fullName, convertedAt: r.convertedAt })));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-headline font-bold text-lg">Conversion</h2>
        <p className="font-body text-xs text-pz-on-surface-variant mt-1 max-w-2xl">
          A recipient counts as converted if they bought the tagged course within 30 days of being sent this
          batch or campaign. Everyone else is &quot;Not converted (yet)&quot; — an absence, not a claim that
          they lost interest.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant py-8 text-center">
          No tracked batches or campaigns yet. Tag one with a course when you create it.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const pct = item.conversion.total > 0 ? Math.round((item.conversion.converted / item.conversion.total) * 100) : 0;
            const courseLabel =
              item.conversionTag.kind === "course"
                ? item.conversionCourseTitle ?? "—"
                : item.conversionTag.kind === "label"
                  ? `"${item.conversionTag.pattern}"`
                  : "";
            return (
              <div key={key} className="bg-pz-surface-container-high rounded-2xl p-4">
                <button onClick={() => toggle(item)} className="w-full flex items-center justify-between text-left gap-3">
                  <span className="font-body font-semibold text-sm flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-pz-surface-variant text-pz-on-surface-variant text-[10px] font-bold uppercase shrink-0">
                      {item.kind === "whatsapp" ? "WhatsApp" : "Email"}
                    </span>
                    {item.name}
                    <span className="font-normal text-pz-on-surface-variant text-xs">{courseLabel}</span>
                  </span>
                  <span className="font-body text-xs text-pz-on-surface-variant tabular-nums shrink-0">
                    {pct}% converted ({item.conversion.converted}/{item.conversion.total})
                  </span>
                </button>
                {openKey === key && (
                  <div className="mt-3 overflow-x-auto">
                    {loading ? (
                      <p className="font-body text-xs text-pz-on-surface-variant">Loading…</p>
                    ) : (
                      <table className="w-full text-left font-body text-sm">
                        <thead className="text-pz-on-surface-variant text-xs uppercase">
                          <tr><th className="py-1">Name</th><th>Converted</th></tr>
                        </thead>
                        <tbody>
                          {(rows ?? []).map((r) => (
                            <tr key={r.id} className="border-t border-pz-outline-variant">
                              <td className="py-1">{r.fullName || "—"}</td>
                              <td>{r.convertedAt ? new Date(r.convertedAt).toLocaleDateString() : "Not converted (yet)"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
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

- [ ] **Step 2: Wire the tab into `page.tsx`**

Add the import:

```ts
import { ConversionPanel, type ConversionTrackedItem } from "@/components/admin/crm/ConversionPanel";
```

Extend the `Tab` type and `parseTab`:

```ts
type Tab = "contacts" | "import" | "merge" | "campaigns" | "cohorts" | "whatsapp" | "conversion";

function parseTab(value: string | undefined): Tab {
  if (value === "import") return "import";
  if (value === "merge") return "merge";
  if (value === "campaigns") return "campaigns";
  if (value === "cohorts") return "cohorts";
  if (value === "whatsapp") return "whatsapp";
  if (value === "conversion") return "conversion";
  return "contacts";
}
```

After the `Promise.all` destructure that fetches `whatsappBatches`, build the tracked-items list:

```ts
const conversionItems: ConversionTrackedItem[] = [
  ...whatsappBatches
    .filter((b) => b.conversionTag.kind !== "none" && b.conversion !== null)
    .map((b) => ({
      kind: "whatsapp" as const,
      id: b.id,
      name: b.name,
      conversionTag: b.conversionTag,
      conversionCourseTitle: b.conversionCourseTitle,
      conversion: b.conversion!,
    })),
  ...campaigns
    .filter((c) => c.conversionTag.kind !== "none" && c.conversion !== null)
    .map((c) => ({
      kind: "campaign" as const,
      id: c.id,
      name: c.name,
      conversionTag: c.conversionTag,
      conversionCourseTitle: c.conversionCourseTitle,
      conversion: c.conversion!,
    })),
];
```

Add the nav link after the WhatsApp `<Link>`:

```tsx
<Link href="/dashboard/admin/crm?tab=conversion" className={TAB_CLASS(tab === "conversion")}>
  Conversion
</Link>
```

Add the tab render after the WhatsApp panel render:

```tsx
{tab === "conversion" && <ConversionPanel items={conversionItems} />}
```

- [ ] **Step 3: Confirm it compiles and lints**

Run: `node_modules/.bin/tsc --noEmit -p .`
Run: `node_modules/.bin/eslint src/components/admin/crm/ConversionPanel.tsx src/app/dashboard/admin/crm/page.tsx`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/crm/ConversionPanel.tsx src/app/dashboard/admin/crm/page.tsx
git commit -m "feat(crm): add Conversion tab aggregating WhatsApp and email"
```

---

### Task 10: Full regression and live verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: nothing — this is the plan's final gate before the feature is considered done.

- [ ] **Step 1: Full TypeScript check**

Run: `node_modules/.bin/tsc --noEmit -p .`
Expected: clean (no errors introduced by this feature — pre-existing unrelated errors, if any, are unaffected and out of scope).

- [ ] **Step 2: Full test suite**

Run: `node_modules/.bin/vitest run`
Expected: all tests pass, including the new `tests/crm-conversion.test.ts` and the extended `tests/crm.schema.test.ts`.

- [ ] **Step 3: Full lint on touched files**

Run: `node_modules/.bin/eslint src/lib/crm/conversion.ts src/lib/data/admin-crm-conversions.ts src/lib/data/admin-crm-whatsapp.ts src/lib/data/admin-crm-campaigns.ts src/lib/validations/crm.ts src/components/admin/crm/WhatsAppPanel.tsx src/components/admin/crm/CampaignsPanel.tsx src/components/admin/crm/ConversionPanel.tsx src/app/dashboard/admin/crm/page.tsx "src/app/api/admin/crm/campaigns/[id]/conversions/route.ts"`
Expected: clean.

- [ ] **Step 4: Confirm the dev server is up**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`. If not, start it: `cd` into the repo and launch `node_modules/.bin/next dev -p 3000` in the background, then poll the same curl until it returns `200`. Do not run `next build` while this is live.

- [ ] **Step 5: Snapshot production data before touching anything**

Via `mcp__claude_ai_Supabase__execute_sql` (project `whqdasotjlhvrjmgiffk`):

```sql
select name, sent_count, recipient_count from whatsapp_batches order by created_at desc;
select id, name, status, subject from campaigns where status != 'draft' order by created_at desc;
```

Record the exact counts returned — they must be unchanged in Step 9.

- [ ] **Step 6: Live-verify the WhatsApp side**

Using `chrome-devtools-mcp` against `http://localhost:3000/dashboard/admin/crm?tab=whatsapp`, logged in as the admin test account:

1. Create a throwaway batch against the "PPC B3" import-batch cohort (4 contacts, per this project's standing test-data convention), tagging it with a real course from the "Existing course" picker. Confirm "Create batch" was disabled until a tag was chosen.
2. Mark all 4 recipients "sent" via the table's checkboxes.
3. Via `mcp__claude_ai_Supabase__execute_sql`, insert one synthetic `contact_purchases` row for one of the 4 contacts, `purchased_at` set a few days after `now()` minus a few days (i.e., within the last 30 days) and `course_id` matching the tagged course; get the contact id from `whatsapp_batch_recipients` for this test batch first.
4. Reload the WhatsApp tab. Confirm the row badge shows `25% converted (1/4)` (or the equivalent for whichever fraction the test data produces) and the recipient table's Converted column shows a date for that one contact and "Not converted (yet)" for the other three.
5. Open the Conversion tab, confirm the test batch appears with the same percentage, expand it, confirm the same per-recipient breakdown.

- [ ] **Step 7: Live-verify the campaign side**

Still in the browser session:

1. In the Campaigns tab, save a draft campaign tagged with the same course via "Existing course", name it something like "Conversion test — delete me" (per this project's standing convention for template-picker testing artifacts with no clean delete path — campaigns have no delete UI for non-draft rows, and this stays a draft).
2. Confirm "Save draft" was disabled until a tag was chosen.
3. Confirm the "Converted" column reads "—" for every existing untagged campaign, and reads a percentage for the new draft (0%/0 total, since a draft has no sent recipients yet — this exercises the "still-pending recipient counts toward zero, not an error" path).
4. Confirm the Conversion tab does NOT list this draft (its `conversion` is `{converted: 0, total: 0}`, which is still non-null — re-check against the design: the tab should still show it at 0%, which is correct per spec; a draft that will never send stays visible until deleted, which is expected here since no delete path exists for it).

- [ ] **Step 8: Clean up test artifacts**

Via `mcp__claude_ai_Supabase__execute_sql`:

```sql
delete from whatsapp_batches where name like 'Dup-test PPC B3%' or name like '%PPC B3%conversion%';
```

(Adjust the `like` pattern to match whatever name was actually used in Step 6.) Leave the draft campaign from Step 7 in place (no delete UI exists for campaigns; it's a harmless draft, consistent with this project's established convention for template-picker test artifacts).

- [ ] **Step 9: Re-confirm production data untouched**

Re-run the two queries from Step 5. Expected: identical results to the pre-test snapshot.

- [ ] **Step 10: Final commit if any cleanup edits were needed**

If Steps 1–3 required any fixes, commit them now with a message describing what regression they fixed. If everything was already clean, no commit is needed for this task.
