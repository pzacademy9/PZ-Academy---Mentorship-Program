# Sales Lead Capture Mini-System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a sales agent, via a no-login token-gated mobile page, paste raw WhatsApp chat text, get key fields auto-extracted as editable suggestions, and save a lead to Supabase in under ~15 seconds — offline-safe, with duplicate-phone detection, a campaign tag, a Supabase keep-alive cron, and two-way Google Sheets sync for status/notes.

**Architecture:** Three new Supabase tables (`agents`, `lead_campaigns`, `leads`) behind service-role-only RLS, matching this repo's established "RLS enabled, zero policies, service-role client behind app-level auth" convention. Three public (no-session) API routes reuse the exact pattern already used by `/api/mentorship/bookings` (no `requireAdmin`, Supabase-table-based rate limiting, Zod validation, `NextResponse.json`). The capture page is a Next.js server component that resolves the token server-side, backed by a client component that owns an offline-safe localStorage queue with a background retry loop. Two-way Sheets sync extends the *existing* single-dispatcher GAS project (`gas/sheets-sync/Code.gs`) with new `registerLeadSheet`/`applyLeadSync` actions and a dedicated `onEditLeads` trigger, rather than standing up a second Apps Script project — this matches the one-dispatcher pattern already serving enrollments, mentorship uploads, and course images.

**Tech Stack:** Next.js 14 (App Router, `src/` layout), Supabase (`@supabase/supabase-js`), Zod v4, Tailwind (no shadcn `Select` in this repo — native `<select>` is the established pattern for admin/CRM dropdowns), `sonner` for toasts, Vitest (jsdom environment) for pure-logic tests, Google Apps Script (clasp-deployed) for Sheets sync.

**Spec:** Provided inline by the user in this session (pasted "PZ Academy — Sales Lead Capture Mini-System" spec, 2026-09-27). No separate spec file exists — this plan is the only written artifact; it embeds every deviation from the literal spec text inline, in "**Deviation from spec:**" notes, so a reviewer can see and challenge each one.

## Global Constraints

- Every new API route follows the existing public-route convention (see `src/app/api/mentorship/bookings/route.ts`): no `requireAdmin`, `createAdminSupabase()` for all writes, Zod `safeParse` on the request body, errors as `NextResponse.json({ error }, { status })`.
- The service role key (`SUPABASE_SERVICE_ROLE_KEY`) is only ever read inside `src/lib/supabase/admin.ts`'s `createAdminSupabase()` — no new route or component reads it directly.
- No new env vars beyond what already exists (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GAS_SHEETS_SYNC_URL`, `SHEETS_SYNC_SECRET`), except one new optional `CRON_SECRET` (Task 11) and, in the GAS script, new *script properties* (not env vars) documented in Task 12.
- `database.types.ts` is hand-maintained — never run a wholesale regeneration. Task 2 hand-adds three table entries matching the file's existing `Row`/`Insert`/`Update`/`Relationships` style.
- **Deviation from spec — table naming:** the spec's SQL names a `campaigns` table. `public.campaigns` already exists (migration `0047_crm_contacts.sql`, email-campaign CRM). This plan uses `lead_campaigns` for the new table to avoid a silent collision. All API/UI text still says "Campaign" to the agent; only the DB table and FK column (`lead_campaign_id`) are renamed.
- **Deviation from spec — route count:** the spec describes duplicate-phone detection ("check leads for existing row... offer Update vs Add as new") as part of one Save action, but does not list a fourth API route for it. This plan implements it as a two-phase protocol *inside* `POST /api/leads/create` (no `resolution` field → check-only response; `resolution: 'insert'|'update'` → write) rather than adding a fourth route, keeping exactly the three routes the spec names.
- **Deviation from spec — offline vs. interactive duplicate check:** the spec asks for both "immediately write to localStorage, never block on network" AND an interactive "Update this lead vs Add as new" choice, which are in tension (the choice needs a network round-trip). Resolution used here: the duplicate check is a short (≤3s timeout) foreground call made only while `navigator.onLine`; if it succeeds and finds nothing, or if the device is offline, or if the check itself fails/times out, the save proceeds immediately into the offline-safe local queue with `resolution: 'insert'` and is never blocked. The interactive choice only appears when the duplicate check succeeds AND finds a match. Task 10 implements this exactly; flag it in review if this trade-off is wrong.
- **Deviation from spec — keep-alive query:** the spec says `select 1`. `@supabase/supabase-js` has no raw-SQL escape hatch without an RPC function; Task 11 uses a `head: true, count: "exact"` read against the tiny `agents` table instead, which touches the database identically for the anti-pause purpose.
- **Deviation from spec — "Supabase database webhook":** Supabase Database Webhooks are dashboard-managed (Database → Webhooks) in this project's Supabase version, not something a SQL migration can create. Task 14 builds the receiving route and documents the one-time dashboard step as a manual note, not a migration.
- No admin UI for creating `agents` or `lead_campaigns` rows is in scope — the spec never asked for one. Seeding those two tables is a manual `insert` via the Supabase SQL editor, documented at the end of Task 1.

## Review Focus

- **Duplicate-phone race:** two agents paste the same customer's chat within seconds of each other, both offline at save time. Both entries queue with `resolution: 'insert'`, and the background flush can send both `POST /api/leads/create` calls before either lands — the duplicate check only runs when there is no `resolution` yet, and an offline-queued entry always carries `resolution: 'insert'` set at enqueue time, so it skips the check entirely. No automated test covers this (it is a timing race, not a pure-function case); it is an accepted, documented trade-off (two rows, no crash) per the "Deviation from spec — offline vs. interactive duplicate check" note, not a bug to fix in this plan. Flag in review only if this acceptance itself is wrong.
- **Ambiguous/malformed phone input:** an agent pastes a number `normalizePhone` reports as `"ambiguous"` (e.g. two numbers separated by a slash) into the required phone field. Covered by an actual automated test: Task 4's `"rejects an ambiguous phone (two numbers in one field)"` case in `tests/leads-validations.test.ts`.
- **Inactive or unknown token reused mid-session:** an agent's link is deactivated (`agents.active = false`) while they still have the page open from earlier. This is satisfied by construction rather than by a dedicated test: there is no session or token cache anywhere in this design, so `getAgentByToken` re-queries `agents` fresh on every single request (page load, `/api/agents/lookup`, `/api/campaigns`, `/api/leads/create`) — a deactivation takes effect on the very next request automatically. Verify this holds in Task 15 by deactivating the seeded test agent mid-session and confirming the next Save attempt 403s.
- **GAS sync loop / stale write:** the Sheet-side `onEdit` echo of the app's own outbound `applyLeadSync` write must never re-trigger `/api/sync/from-sheets`, and a `from-sheets` payload older than the lead's current `updated_at` must be dropped, not overwrite a newer app-side edit. No automated test (GAS has no test harness in this repo, matching existing convention for `Code.gs`). Covered by the AppSyncValue check in `onEditLeads` (Task 12) and the `updatedAt` comparison in the route (Task 13), and by an explicit manual verification step added to Task 15 (Step 6) — flag this section in review if that manual step is skipped rather than actually run once a real test Sheet exists.
- **Rate limit boundary and message:** an agent hits exactly the 30th and 31st submission within the hour — the 31st must 429, and the offline queue must treat any non-2xx response as "keep retrying later," never "drop this lead forever." The route's 429 itself is untested (no automated test on `/api/leads/create`, per Task 8's stated convention), but the queue-side half of this contract IS covered by an automated test: Task 9's `"keeps a failed entry queued and bumps its attempt count"` case, which asserts on exactly a non-`ok` response.

---

## File Structure

New files:
- `supabase/migrations/0058_lead_capture.sql` — schema
- `src/lib/leads/extract.ts` + `tests/leads-extract.test.ts` — pure extraction heuristics
- `src/lib/validations/leads.ts` + `tests/leads-validations.test.ts` — Zod schemas
- `src/lib/data/leads.ts` — Supabase data-access layer (agents, lead_campaigns, leads)
- `src/lib/leads/offline-queue.ts` + `tests/leads-offline-queue.test.ts` — client localStorage queue + retry
- `src/app/api/agents/lookup/route.ts`
- `src/app/api/campaigns/route.ts`
- `src/app/api/leads/create/route.ts`
- `src/app/api/keep-alive/route.ts`
- `src/app/api/sync/from-sheets/route.ts`
- `src/app/api/sync/to-sheets/route.ts`
- `src/app/leads/add/[token]/page.tsx`
- `src/components/leads/LeadCaptureForm.tsx`
- `vercel.json` — first cron config in the repo

Modified files:
- `src/lib/supabase/database.types.ts` — hand-add `agents`, `lead_campaigns`, `leads`
- `gas/sheets-sync/Code.gs` — add `registerLeadSheet`/`applyLeadSync` actions, `onEditLeads` trigger
- `src/lib/gas/sheets-sync-client.ts` — add `registerLeadSheet()`, `applyLeadSync()`

---

### Task 1: Database schema

**Files:**
- Create: `supabase/migrations/0058_lead_capture.sql`

**Interfaces:**
- Produces: tables `public.agents(id, name, token, active, created_at)`, `public.lead_campaigns(id, name, active, created_at)`, `public.leads(id, name, email, phone, profession, lead_campaign_id, agent_id, status, notes, created_at, updated_at)`. Every later task's data layer assumes exactly these column names.

- [ ] **Step 1: Write the migration**

```sql
-- 0058_lead_capture.sql
--
-- Sales Lead Capture Mini-System: a no-login, token-gated mobile page lets
-- an agent paste WhatsApp chat text and save a lead in ~15 seconds. Every
-- table here is service-role-only (RLS enabled, zero policies — the
-- convention established in 0033/0047): all reads and writes go through
-- createAdminSupabase() behind the per-agent token check in application
-- code, never through a client-side Supabase query.
--
-- "campaigns" is already taken by the email-campaign CRM (0047) — this
-- system's lead-source tagging uses lead_campaigns instead so the two never
-- collide.

-- ─── 1. agents ───────────────────────────────────────────────
create table if not exists public.agents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  token       text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.agents enable row level security;

-- ─── 2. lead_campaigns ───────────────────────────────────────
create table if not exists public.lead_campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.lead_campaigns enable row level security;

-- ─── 3. leads ────────────────────────────────────────────────
-- phone is required and stored normalized (E.164 via lib/crm/phone.ts) —
-- it is the one field the app never trusts extraction for, since a
-- WhatsApp chat's phone number is the chat's own number, not something
-- typed in the message text.
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  name               text,
  email              text,
  phone              text not null,
  profession         text,
  lead_campaign_id   uuid references public.lead_campaigns(id) on delete set null,
  agent_id           uuid references public.agents(id) on delete set null,
  status             text not null default 'new',
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists leads_agent_id_idx on public.leads (agent_id);

alter table public.leads enable row level security;

-- Reuses public.set_updated_at() from 0003 — no need to redefine it.
drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP tool (`mcp__claude_ai_Supabase__apply_migration`) or the Supabase SQL editor — this project has no local Supabase stack running. Confirm no errors.

- [ ] **Step 3: Seed one test agent and one test campaign (manual, via SQL editor)**

```sql
insert into public.agents (name, token) values ('Test Agent', 'test-agent-token-001');
insert into public.lead_campaigns (name) values ('PPC Outreach (Test)');
```

This row is what Task 10's manual browser verification will use. Note for the user: production agent/campaign rows must be added the same way (no admin UI exists for this) — one `insert` per real agent, using a randomly generated token (e.g. `openssl rand -hex 16`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0058_lead_capture.sql
git commit -m "feat: add agents, lead_campaigns, leads tables for lead capture"
```

---

### Task 2: Hand-add database.types.ts entries

**Files:**
- Modify: `src/lib/supabase/database.types.ts` (currently 2714 lines; `campaigns:` entry starts at line 319 — confirmed)

**Interfaces:**
- Consumes: table/column names from Task 1.
- Produces: `Database["public"]["Tables"]["agents"|"lead_campaigns"|"leads"]` types, used by every data-layer function in Task 5.

- [ ] **Step 1: Insert the `agents` entry immediately before the existing `campaigns:` entry** (i.e. right before line 319 in the current file — `agents` sorts alphabetically before `campaigns`):

```ts
      agents: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          token: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          token: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
```

- [ ] **Step 2: Insert the `lead_campaigns` and `leads` entries in alphabetical order among the existing Tables** (search the file for the nearest neighboring table names starting with `le`/`li`/`ma` etc. to find the exact spot — the file is fully alphabetical by table name):

```ts
      lead_campaigns: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          agent_id: string | null
          created_at: string
          email: string | null
          id: string
          lead_campaign_id: string | null
          name: string | null
          notes: string | null
          phone: string
          profession: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_campaign_id?: string | null
          name?: string | null
          notes?: string | null
          phone: string
          profession?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_campaign_id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string
          profession?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_lead_campaign_id_fkey"
            columns: ["lead_campaign_id"]
            isOneToOne: false
            referencedRelation: "lead_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 3: Verify with tsc**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no NEW errors introduced by this file (any pre-existing unrelated errors are out of scope — do not fix them here).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/database.types.ts
git commit -m "feat: hand-add agents/lead_campaigns/leads types"
```

---

### Task 3: Extraction heuristics (TDD)

**Files:**
- Create: `src/lib/leads/extract.ts`
- Test: `tests/leads-extract.test.ts`

**Interfaces:**
- Consumes: `normalizePhone` from `@/lib/crm/phone` (existing).
- Produces: `extractEmail(text: string): string | null`, `extractPhone(text: string): string | null`, `extractName(text: string): string | null`, `extractProfession(text: string): string | null` — consumed by Task 10's form component.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { extractEmail, extractPhone, extractName, extractProfession } from "@/lib/leads/extract";

describe("extractEmail", () => {
  it("finds an email inside pasted chat text", () => {
    expect(extractEmail("Hi, you can reach me at ali.khan@example.com anytime")).toBe("ali.khan@example.com");
  });

  it("returns null when no email is present", () => {
    expect(extractEmail("Hey I'm interested in the pharmacology course")).toBeNull();
  });
});

describe("extractPhone", () => {
  it("normalizes an inline Pakistani mobile number to E.164", () => {
    expect(extractPhone("call me on 03234267102 after 6pm")).toBe("+923234267102");
  });

  it("returns null when no plausible phone number is present", () => {
    expect(extractPhone("I'm a pharmacist looking to join the diabetes course")).toBeNull();
  });

  it("skips a run of digits that normalizePhone can't parse", () => {
    expect(extractPhone("order number 12345")).toBeNull();
  });
});

describe("extractName", () => {
  it("matches 'my name is'", () => {
    expect(extractName("Hello, my name is Ayesha Malik and I want to enroll")).toBe("Ayesha Malik");
  });

  it("matches \"i'm\" case-insensitively", () => {
    expect(extractName("hi i'm Bilal, saw your ad on facebook")).toBe("Bilal");
  });

  it("matches 'this is'", () => {
    expect(extractName("This is Sana, following up on the DPC course")).toBe("Sana");
  });

  it("returns null when no name pattern matches", () => {
    expect(extractName("interested in the course, please share details")).toBeNull();
  });
});

describe("extractProfession", () => {
  it("matches \"i'm a <profession>\"", () => {
    expect(extractProfession("Hi I'm a pharmacist working in a hospital")).toBe("pharmacist working in a hospital");
  });

  it("matches 'i am an <profession>' and stops at punctuation", () => {
    expect(extractProfession("I am an intern doctor. Want to know the fee")).toBe("intern doctor");
  });

  it("matches 'i work as a <profession>'", () => {
    expect(extractProfession("i work as a clinical pharmacist, currently in Lahore")).toBe("clinical pharmacist");
  });

  it("returns null when no profession pattern matches", () => {
    expect(extractProfession("just want to know the course fee")).toBeNull();
  });
});

describe("full realistic paste", () => {
  it("extracts every field from one combined message", () => {
    const text = `Hi, my name is Ayesha Malik. I'm a pharmacist at a private hospital. My email is ayesha.malik@example.com. Interested in the diabetes course, can you share the fee? My number is 03234267102 in case whatsapp doesn't show it.`;
    expect(extractName(text)).toBe("Ayesha Malik");
    expect(extractProfession(text)).toBe("pharmacist at a private hospital");
    expect(extractEmail(text)).toBe("ayesha.malik@example.com");
    expect(extractPhone(text)).toBe("+923234267102");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node_modules/.bin/vitest run tests/leads-extract.test.ts`
Expected: FAIL — `Cannot find module '@/lib/leads/extract'`

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Heuristic extraction from raw WhatsApp chat text pasted by a sales agent.
 * Every result here is a suggestion for the editable preview form, never
 * written to the database directly — phone in particular is never trusted
 * from extraction: a WhatsApp chat's phone number is the chat's own number
 * (shown by WhatsApp's UI), not something the customer typed in the
 * message text, so this is a best-effort pre-fill only.
 */
import { normalizePhone } from "@/lib/crm/phone";

export function extractEmail(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

export function extractPhone(text: string): string | null {
  const candidates = text.match(/\+?\d[\d\s-]{7,}\d/g) ?? [];
  for (const candidate of candidates) {
    const result = normalizePhone(candidate);
    if (result.ok) return result.e164;
  }
  return null;
}

const NAME_PATTERNS = [
  /\b(?:my\s+name\s+is|[Ii]\s*'?\s*m|[Ii]\s+am|this\s+is)\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2})/,
];

export function extractName(text: string): string | null {
  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

const PROFESSION_PATTERNS = [
  /\bi\s*'?\s*m\s+an?\s+([a-z][a-z\s'-]{2,60}?)(?=[.,!\n]|$)/i,
  /\bi\s+am\s+an?\s+([a-z][a-z\s'-]{2,60}?)(?=[.,!\n]|$)/i,
  /\bi\s+work\s+as\s+an?\s+([a-z][a-z\s'-]{2,60}?)(?=[.,!\n]|$)/i,
];

export function extractProfession(text: string): string | null {
  for (const pattern of PROFESSION_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node_modules/.bin/vitest run tests/leads-extract.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/extract.ts tests/leads-extract.test.ts
git commit -m "feat: add WhatsApp chat field extraction heuristics"
```

---

### Task 4: Validation schemas (TDD)

**Files:**
- Create: `src/lib/validations/leads.ts`
- Test: `tests/leads-validations.test.ts`

**Interfaces:**
- Consumes: `normalizePhone` from `@/lib/crm/phone`.
- Produces: `leadCreateSchema`, `leadSheetSyncSchema`, and inferred types `LeadCreateInput`, `LeadSheetSyncInput` — consumed by Task 8 (`/api/leads/create`) and Task 13 (`/api/sync/from-sheets`).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { leadCreateSchema, leadSheetSyncSchema } from "@/lib/validations/leads";

describe("leadCreateSchema", () => {
  const base = { token: "abc", phone: "03234267102" };

  it("accepts a minimal valid submission and normalizes the phone", () => {
    const result = leadCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+923234267102");
  });

  it("rejects a missing phone", () => {
    const result = leadCreateSchema.safeParse({ token: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects an ambiguous phone (two numbers in one field)", () => {
    const result = leadCreateSchema.safeParse({ ...base, phone: "0323/0324" });
    expect(result.success).toBe(false);
  });

  it("rejects resolution: 'update' without existingLeadId", () => {
    const result = leadCreateSchema.safeParse({ ...base, resolution: "update" });
    expect(result.success).toBe(false);
  });

  it("accepts resolution: 'update' with existingLeadId", () => {
    const result = leadCreateSchema.safeParse({
      ...base,
      resolution: "update",
      existingLeadId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("treats an empty-string email as absent", () => {
    const result = leadCreateSchema.safeParse({ ...base, email: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeUndefined();
  });
});

describe("leadSheetSyncSchema", () => {
  it("accepts a valid GAS payload", () => {
    const result = leadSheetSyncSchema.safeParse({
      token: "secret",
      id: "11111111-1111-4111-8111-111111111111",
      status: "contacted",
      notes: "called, no answer",
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    const result = leadSheetSyncSchema.safeParse({
      token: "secret",
      id: "not-a-uuid",
      status: "contacted",
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node_modules/.bin/vitest run tests/leads-validations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import { z } from "zod";
import { normalizePhone } from "@/lib/crm/phone";

const leadPhoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform((val, ctx) => {
    const result = normalizePhone(val);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid phone number (e.g. 03001234567).",
      });
      return z.NEVER;
    }
    return result.e164;
  });

const optionalEmail = z
  .union([z.string().trim().toLowerCase().email(), z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));

export const leadCreateSchema = z
  .object({
    token: z.string().trim().min(1),
    name: z.string().trim().max(200).optional(),
    email: optionalEmail,
    phone: leadPhoneSchema,
    profession: z.string().trim().max(200).optional(),
    leadCampaignId: z.string().uuid().optional(),
    resolution: z.enum(["insert", "update"]).optional(),
    existingLeadId: z.string().uuid().optional(),
  })
  .refine((v) => v.resolution !== "update" || !!v.existingLeadId, {
    message: "existingLeadId is required when resolution is 'update'",
    path: ["existingLeadId"],
  });

export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

export const leadSheetSyncSchema = z.object({
  token: z.string().trim().min(1),
  id: z.string().uuid(),
  status: z.string().trim().min(1).max(100),
  notes: z
    .union([z.string().trim().max(5000), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  updatedAt: z.string().datetime(),
});

export type LeadSheetSyncInput = z.infer<typeof leadSheetSyncSchema>;
```

- [ ] **Step 4: Run to verify pass**

Run: `node_modules/.bin/vitest run tests/leads-validations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/leads.ts tests/leads-validations.test.ts
git commit -m "feat: add lead create + sheet-sync validation schemas"
```

---

### Task 5: Data-access layer

No automated test for this task — it is a thin wrapper around `@supabase/supabase-js` calls, and this codebase's convention (see `src/lib/data/admin-crm-whatsapp.ts`, `src/lib/data/sheet-sync.ts`) is to test the *pure* logic layers (Tasks 3, 4, 9) and leave direct-I/O data-layer functions covered by the routes' manual/live verification instead. This is a deliberate, not accidental, gap — flag it in review if a DB-backed integration test harness exists elsewhere that this task missed.

**Files:**
- Create: `src/lib/data/leads.ts`

**Interfaces:**
- Consumes: `createAdminSupabase` from `@/lib/supabase/admin`; `LeadSyncRow` type from Task 12's `src/lib/gas/sheets-sync-client.ts` (forward reference — `getLeadSyncRow` is added in this task but its return type is defined in Task 12; if executing tasks out of order, stub the type locally and align later).
- Produces: `getAgentByToken`, `listActiveLeadCampaigns`, `findLeadByPhone`, `countRecentLeadsByAgent`, `insertLead`, `updateLeadFields`, `getLeadById`, `applyStatusAndNotesFromSheet`, `getLeadSyncRow` — consumed by Tasks 6, 7, 8, 13, 14.

- [ ] **Step 1: Write the file**

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type Agent = { id: string; name: string; active: boolean };

export async function getAgentByToken(token: string): Promise<Agent | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("agents")
    .select("id, name, active")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.active) return null;
  return data;
}

export type LeadCampaign = { id: string; name: string };

export async function listActiveLeadCampaigns(): Promise<LeadCampaign[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("lead_campaigns")
    .select("id, name")
    .eq("active", true)
    .order("name", { ascending: true });
  return data ?? [];
}

export type ExistingLead = { id: string; status: string; leadCampaignName: string | null };

export async function findLeadByPhone(phone: string): Promise<ExistingLead | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("leads")
    .select("id, status, lead_campaigns(name)")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    leadCampaignName: (data.lead_campaigns as { name: string } | null)?.name ?? null,
  };
}

export async function countRecentLeadsByAgent(agentId: string, sinceIso: string): Promise<number> {
  const admin = createAdminSupabase();
  const { count } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gte("created_at", sinceIso);
  return count ?? 0;
}

export type LeadFields = {
  name: string | null;
  email: string | null;
  phone: string;
  profession: string | null;
  leadCampaignId: string | null;
  agentId: string;
};

export async function insertLead(fields: LeadFields): Promise<string> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("leads")
    .insert({
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      profession: fields.profession,
      lead_campaign_id: fields.leadCampaignId,
      agent_id: fields.agentId,
      status: "new",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insert failed");
  return data.id;
}

export async function updateLeadFields(leadId: string, fields: LeadFields): Promise<void> {
  const admin = createAdminSupabase();
  await admin
    .from("leads")
    .update({
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      profession: fields.profession,
      lead_campaign_id: fields.leadCampaignId,
      agent_id: fields.agentId,
    })
    .eq("id", leadId);
}

export async function getLeadById(leadId: string): Promise<{ id: string; updatedAt: string } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("leads").select("id, updated_at").eq("id", leadId).maybeSingle();
  if (!data) return null;
  return { id: data.id, updatedAt: data.updated_at };
}

export async function applyStatusAndNotesFromSheet(
  leadId: string,
  status: string,
  notes: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  await admin.from("leads").update({ status, notes }).eq("id", leadId);
}

export type LeadSyncRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string;
  profession: string | null;
  campaignName: string | null;
  agentName: string | null;
  status: string;
  notes: string | null;
};

/**
 * Full row for pushing to the Sheet — resolves lead_campaign_id/agent_id
 * into readable names rather than trusting the inbound webhook payload's
 * own copy of those fields (a webhook retry could carry a stale record).
 */
export async function getLeadSyncRow(leadId: string): Promise<LeadSyncRow | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("leads")
    .select("id, name, email, phone, profession, status, notes, lead_campaigns(name), agents(name)")
    .eq("id", leadId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    profession: data.profession,
    campaignName: (data.lead_campaigns as { name: string } | null)?.name ?? null,
    agentName: (data.agents as { name: string } | null)?.name ?? null,
    status: data.status,
    notes: data.notes,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors in this file (the embedded-select typings depend on Task 2's `Relationships` entries being correct).

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/leads.ts
git commit -m "feat: add leads data-access layer"
```

---

### Task 6: `GET /api/agents/lookup`

No automated test — matches the convention of leaving thin route handlers to manual/live verification (same as `/api/mentorship/bookings`). Covered by Task 15's live verification pass.

**Files:**
- Create: `src/app/api/agents/lookup/route.ts`

**Interfaces:**
- Consumes: `getAgentByToken` from `@/lib/data/leads`.
- Produces: `GET ?token=...` → `{ name: string }` (200) or `{ error: string }` (403).

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAgentByToken } from "@/lib/data/leads";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 403 });
  }

  const agent = await getAgentByToken(token);
  if (!agent) {
    return NextResponse.json({ error: "Invalid or inactive agent link" }, { status: 403 });
  }

  return NextResponse.json({ name: agent.name });
}
```

- [ ] **Step 2: Type-check**

Run: `node_modules/.bin/tsc --noEmit` — expect no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agents/lookup/route.ts
git commit -m "feat: add agent token lookup route"
```

---

### Task 7: `GET /api/campaigns`

No automated test — same rationale as Task 6.

**Files:**
- Create: `src/app/api/campaigns/route.ts`

**Interfaces:**
- Consumes: `getAgentByToken`, `listActiveLeadCampaigns` from `@/lib/data/leads`.
- Produces: `GET ?token=...` → `{ campaigns: {id, name}[] }` (200) or `{ error }` (403).

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getAgentByToken, listActiveLeadCampaigns } from "@/lib/data/leads";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const agent = token ? await getAgentByToken(token) : null;
  if (!agent) {
    return NextResponse.json({ error: "Invalid or inactive agent link" }, { status: 403 });
  }

  const campaigns = await listActiveLeadCampaigns();
  return NextResponse.json({ campaigns });
}
```

- [ ] **Step 2: Type-check and commit**

```bash
node_modules/.bin/tsc --noEmit
git add src/app/api/campaigns/route.ts
git commit -m "feat: add active lead campaigns lookup route"
```

---

### Task 8: `POST /api/leads/create`

No automated test for the route handler itself (same convention as Tasks 6–7); the logic it depends on (phone normalization, refine rule) is already covered by Task 4's tests. Manual verification is in Task 15.

**Files:**
- Create: `src/app/api/leads/create/route.ts`

**Interfaces:**
- Consumes: `leadCreateSchema` from `@/lib/validations/leads`; `getAgentByToken`, `countRecentLeadsByAgent`, `findLeadByPhone`, `insertLead`, `updateLeadFields` from `@/lib/data/leads`.
- Produces: `POST` body `{ token, name?, email?, phone, profession?, leadCampaignId?, resolution?, existingLeadId? }` → one of:
  - `{ duplicate: true, existingLead: { id, status, leadCampaignName } }` (200, no write) when `resolution` is absent and a phone match exists
  - `{ ok: true, id }` (200) on insert or update
  - `{ error }` (400 invalid input, 403 bad token, 429 rate-limited)

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { leadCreateSchema } from "@/lib/validations/leads";
import {
  getAgentByToken,
  countRecentLeadsByAgent,
  findLeadByPhone,
  insertLead,
  updateLeadFields,
} from "@/lib/data/leads";

const RATE_LIMIT_PER_HOUR = 30;

export async function POST(req: NextRequest) {
  const parsed = leadCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  const agent = await getAgentByToken(input.token);
  if (!agent) {
    return NextResponse.json({ error: "Invalid or inactive agent link" }, { status: 403 });
  }

  // Rate limit: the leads table itself is the store, same reasoning as
  // /api/mentorship/bookings — no shared in-memory state across serverless
  // invocations, and no existing Redis/Upstash dependency to add one for.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentCount = await countRecentLeadsByAgent(agent.id, oneHourAgo);
  if (recentCount >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many leads submitted recently. Please wait a bit and try again." },
      { status: 429 },
    );
  }

  const fields = {
    name: input.name ?? null,
    email: input.email ?? null,
    phone: input.phone,
    profession: input.profession ?? null,
    leadCampaignId: input.leadCampaignId ?? null,
    agentId: agent.id,
  };

  // Two-phase protocol: no resolution yet means "check before writing." A
  // duplicate phone is returned to the client to decide, rather than
  // silently creating a second row for the same person. See the plan's
  // "Deviation from spec — route count" note.
  if (!input.resolution) {
    const existing = await findLeadByPhone(input.phone);
    if (existing) {
      return NextResponse.json({ duplicate: true, existingLead: existing });
    }
    const id = await insertLead(fields);
    return NextResponse.json({ ok: true, id });
  }

  if (input.resolution === "update") {
    await updateLeadFields(input.existingLeadId!, fields);
    return NextResponse.json({ ok: true, id: input.existingLeadId });
  }

  const id = await insertLead(fields);
  return NextResponse.json({ ok: true, id });
}
```

- [ ] **Step 2: Type-check and commit**

```bash
node_modules/.bin/tsc --noEmit
git add src/app/api/leads/create/route.ts
git commit -m "feat: add lead create route with duplicate-phone and rate-limit handling"
```

---

### Task 9: Offline queue (TDD)

**Files:**
- Create: `src/lib/leads/offline-queue.ts`
- Test: `tests/leads-offline-queue.test.ts`

**Interfaces:**
- Consumes: browser `localStorage`, `fetch`, `crypto.randomUUID` (all provided by the jsdom test environment already configured in `vitest.config.ts`).
- Produces: `enqueueLead`, `readQueue`, `removeFromQueue`, `flushQueue` — consumed by Task 10's `LeadCaptureForm`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueueLead, readQueue, removeFromQueue, flushQueue } from "@/lib/leads/offline-queue";

const draft = {
  name: "Ayesha Malik",
  email: null,
  phone: "+923234267102",
  profession: null,
  leadCampaignId: null,
  resolution: "insert" as const,
};

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("enqueueLead / readQueue / removeFromQueue", () => {
  it("enqueues an entry with a unique localId", () => {
    const entry = enqueueLead("token-1", draft);
    expect(readQueue()).toHaveLength(1);
    expect(readQueue()[0].localId).toBe(entry.localId);
    expect(readQueue()[0].draft.phone).toBe("+923234267102");
  });

  it("removes an entry by localId", () => {
    const entry = enqueueLead("token-1", draft);
    removeFromQueue(entry.localId);
    expect(readQueue()).toHaveLength(0);
  });

  it("keeps unrelated entries when removing one", () => {
    const first = enqueueLead("token-1", draft);
    enqueueLead("token-1", { ...draft, phone: "+923198071841" });
    removeFromQueue(first.localId);
    expect(readQueue()).toHaveLength(1);
    expect(readQueue()[0].draft.phone).toBe("+923198071841");
  });
});

describe("flushQueue", () => {
  it("removes an entry from the queue on a successful send", async () => {
    enqueueLead("token-1", draft);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));

    await flushQueue();

    expect(readQueue()).toHaveLength(0);
  });

  it("keeps a failed entry queued and bumps its attempt count", async () => {
    enqueueLead("token-1", draft);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "rate limited" }) }));

    await flushQueue();

    expect(readQueue()).toHaveLength(1);
    expect(readQueue()[0].attempts).toBe(1);
  });

  it("keeps a queued entry when the network call itself throws", async () => {
    enqueueLead("token-1", draft);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await flushQueue();

    expect(readQueue()).toHaveLength(1);
    expect(readQueue()[0].attempts).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node_modules/.bin/vitest run tests/leads-offline-queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
"use client";

export type LeadDraft = {
  name: string | null;
  email: string | null;
  phone: string;
  profession: string | null;
  leadCampaignId: string | null;
  resolution: "insert" | "update";
  existingLeadId?: string;
};

export type QueueEntry = {
  localId: string;
  token: string;
  draft: LeadDraft;
  attempts: number;
};

const STORAGE_KEY = "pz-leads-offline-queue";

export function readQueue(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(entries: QueueEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable — the optimistic UI already showed
    // success, so losing the retry-queue entry is the acceptable fallback
    // here, not a blocked save.
  }
}

export function enqueueLead(token: string, draft: LeadDraft): QueueEntry {
  const entry: QueueEntry = { localId: crypto.randomUUID(), token, draft, attempts: 0 };
  writeQueue([...readQueue(), entry]);
  return entry;
}

export function removeFromQueue(localId: string): void {
  writeQueue(readQueue().filter((e) => e.localId !== localId));
}

function bumpAttempts(localId: string): void {
  writeQueue(readQueue().map((e) => (e.localId === localId ? { ...e, attempts: e.attempts + 1 } : e)));
}

/**
 * Sends every queued entry, oldest first. A failed send must never throw
 * out of this function — it runs unattended on an interval and on the
 * browser's 'online' event, and a thrown error there would end the retry
 * loop for every future flush, not just this one.
 */
export async function flushQueue(): Promise<void> {
  for (const entry of readQueue()) {
    try {
      const res = await fetch("/api/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: entry.token, ...entry.draft }),
      });
      if (res.ok) {
        removeFromQueue(entry.localId);
      } else {
        bumpAttempts(entry.localId);
      }
    } catch {
      bumpAttempts(entry.localId);
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node_modules/.bin/vitest run tests/leads-offline-queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads/offline-queue.ts tests/leads-offline-queue.test.ts
git commit -m "feat: add offline-safe localStorage queue for lead saves"
```

---

### Task 10: Capture page + form

No automated test — this is a client UI component; verified live in Task 15 via `chrome-devtools-mcp` against the running dev server, using the test agent token seeded in Task 1.

**Files:**
- Create: `src/app/leads/add/[token]/page.tsx`
- Create: `src/components/leads/LeadCaptureForm.tsx`

**Interfaces:**
- Consumes: `getAgentByToken` (Task 5), `extractEmail`/`extractPhone`/`extractName`/`extractProfession` (Task 3), `enqueueLead`/`flushQueue` (Task 9), `@/components/ui/button`, `@/components/ui/input`, `@/components/ui/label` (existing shadcn components), `sonner`'s `toast` (existing).
- Produces: the public page at `/leads/add/[token]`.

- [ ] **Step 1: Write the server page**

```tsx
import { getAgentByToken } from "@/lib/data/leads";
import { LeadCaptureForm } from "@/components/leads/LeadCaptureForm";

export default async function LeadCapturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const agent = await getAgentByToken(token);

  if (!agent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center dark:bg-[#101412]">
        <div>
          <h1 className="font-fredoka text-xl text-pz-ink dark:text-[#e0e3df]">Link not recognized</h1>
          <p className="mt-2 font-body text-sm text-pz-ink/70 dark:text-[#e0e3df]/70">
            This lead-capture link is invalid or has been disabled. Ask your team lead for a fresh link.
          </p>
        </div>
      </main>
    );
  }

  return <LeadCaptureForm token={token} agentName={agent.name} />;
}
```

- [ ] **Step 2: Write the client form**

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractEmail, extractPhone, extractName, extractProfession } from "@/lib/leads/extract";
import { enqueueLead, flushQueue } from "@/lib/leads/offline-queue";

type LeadCampaign = { id: string; name: string };
type DuplicateInfo = { id: string; status: string; leadCampaignName: string | null };

export function LeadCaptureForm({ token, agentName }: { token: string; agentName: string }) {
  const [raw, setRaw] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profession, setProfession] = useState("");
  const [leadCampaignId, setLeadCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<LeadCampaign[]>([]);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    fetch(`/api/campaigns?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((data) => setCampaigns(data.campaigns ?? []))
      .catch(() => setCampaigns([]));
  }, [token]);

  useEffect(() => {
    flushQueue();
    const interval = setInterval(flushQueue, 15000);
    window.addEventListener("online", flushQueue);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", flushQueue);
    };
  }, []);

  function handleExtract() {
    const foundEmail = extractEmail(raw);
    const foundPhone = extractPhone(raw);
    const foundName = extractName(raw);
    const foundProfession = extractProfession(raw);
    if (foundEmail) setEmail(foundEmail);
    if (foundPhone) setPhone(foundPhone);
    if (foundName) setName(foundName);
    if (foundProfession) setProfession(foundProfession);
  }

  function resetForm() {
    setRaw("");
    setName("");
    setEmail("");
    setPhone("");
    setProfession("");
    setDuplicate(null);
  }

  function saveOptimistically(resolution: "insert" | "update", existingLeadId?: string) {
    enqueueLead(token, {
      name: name.trim() || null,
      email: email.trim() || null,
      phone,
      profession: profession.trim() || null,
      leadCampaignId: leadCampaignId || null,
      resolution,
      existingLeadId,
    });
    setSavedCount((c) => c + 1);
    toast.success("Lead saved");
    resetForm();
    flushQueue();
  }

  async function handleSave() {
    if (!phone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    if (!navigator.onLine) {
      saveOptimistically("insert");
      return;
    }

    setChecking(true);
    try {
      const res = await fetch("/api/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          phone,
          profession: profession.trim() || undefined,
          leadCampaignId: leadCampaignId || undefined,
        }),
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.duplicate) {
        setDuplicate(data.existingLead);
        return;
      }
      if (res.ok && data?.ok) {
        setSavedCount((c) => c + 1);
        toast.success("Lead saved");
        resetForm();
        return;
      }
      // A real error from the server (bad token, rate limit, etc.) — still
      // queue it locally rather than losing the agent's work.
      saveOptimistically("insert");
    } catch {
      // Network hiccup mid-check — fall back to the offline path.
      saveOptimistically("insert");
    } finally {
      setChecking(false);
    }
  }

  if (duplicate) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-10">
        <h2 className="font-fredoka text-lg">Existing lead found</h2>
        <p className="font-body text-sm text-pz-ink/70">
          A lead with this phone already exists — status &ldquo;{duplicate.status}&rdquo;
          {duplicate.leadCampaignName ? `, campaign "${duplicate.leadCampaignName}"` : ""}.
        </p>
        <Button onClick={() => saveOptimistically("update", duplicate.id)}>Update this lead</Button>
        <Button variant="outline" onClick={() => saveOptimistically("insert")}>
          Add as new
        </Button>
        <Button variant="ghost" onClick={() => setDuplicate(null)}>
          Cancel
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="font-fredoka text-lg">Hi, {agentName}</h1>
      {savedCount > 0 && (
        <p className="font-body text-xs text-pz-ink/60">{savedCount} lead(s) saved this session.</p>
      )}

      <div>
        <Label htmlFor="raw">Paste the WhatsApp chat</Label>
        <textarea
          id="raw"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={handleExtract}
          rows={6}
          className="mt-1 w-full rounded-xl border border-pz-outline-variant px-4 py-3 font-body text-sm"
          placeholder="Paste the customer's messages here..."
        />
        <Button type="button" variant="outline" className="mt-2 w-full" onClick={handleExtract}>
          Extract fields
        </Button>
      </div>

      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-12" />
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-12" />
      </div>

      <div>
        <Label htmlFor="phone">Phone (required)</Label>
        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-12" />
      </div>

      <div>
        <Label htmlFor="profession">Profession</Label>
        <Input
          id="profession"
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          className="mt-1 h-12"
        />
      </div>

      <div>
        <Label htmlFor="campaign">Campaign</Label>
        <select
          id="campaign"
          value={leadCampaignId}
          onChange={(e) => setLeadCampaignId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-pz-outline-variant px-4 py-3 font-body text-sm"
        >
          <option value="">— none —</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Button className="h-14 text-base" disabled={checking} onClick={handleSave}>
        {checking ? "Checking..." : "Save lead"}
      </Button>
    </main>
  );
}
```

- [ ] **Step 3: Type-check and commit**

```bash
node_modules/.bin/tsc --noEmit
git add src/app/leads/add/[token]/page.tsx src/components/leads/LeadCaptureForm.tsx
git commit -m "feat: add lead capture page and form"
```

---

### Task 11: Keep-alive route + Vercel cron

**Files:**
- Create: `src/app/api/keep-alive/route.ts`
- Create: `vercel.json` (repo has none yet)

**Interfaces:**
- Consumes: `createAdminSupabase` from `@/lib/supabase/admin`.
- Produces: `GET /api/keep-alive` → `{ ok: true }` (200) or `{ ok: false, error }` (500); a Vercel Cron entry that calls it every 3 days.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Vercel Cron target — a trivial read keeps the free-tier Supabase project
 * from auto-pausing after ~7 days of total inactivity. Reads `agents`
 * (tiny, always exists after migration 0058) with head:true so it costs
 * nothing beyond touching the database, standing in for a raw `select 1`
 * that supabase-js has no direct escape hatch for without an RPC function.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminSupabase();
  const { error } = await admin.from("agents").select("id", { count: "exact", head: true }).limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/keep-alive",
      "schedule": "0 0 */3 * *"
    }
  ]
}
```

Note: `*/3` on the day-of-month field fires on days 3, 6, 9, ... 30 — not an exact "every 72 hours," but comfortably inside the spec's "every 2–3 days" and well under Supabase's ~7-day pause window. If `CRON_SECRET` is set in the Vercel project's env vars, Vercel automatically sends it as `Authorization: Bearer <value>` on cron-triggered requests — set it there if this route should reject non-cron callers; leave it unset for local/manual testing.

- [ ] **Step 3: Type-check and commit**

```bash
node_modules/.bin/tsc --noEmit
git add src/app/api/keep-alive/route.ts vercel.json
git commit -m "feat: add Supabase keep-alive cron route"
```

---

### Task 12: Extend the GAS sheets-sync dispatcher

**Files:**
- Modify: `gas/sheets-sync/Code.gs`
- Modify: `src/lib/gas/sheets-sync-client.ts`

No automated test — Apps Script has no unit test harness in this repo (matches existing convention: `Code.gs` has none today either). Verified manually in Task 15 against a real throwaway Google Sheet.

**Interfaces:**
- Produces (Next.js side): `registerLeadSheet(sheetId: string): Promise<{ok, message}>`, `applyLeadSync(row: LeadSyncRow): Promise<void>` — consumed by Task 14's `/api/sync/to-sheets` route, and `registerLeadSheet` by whichever manual script/step wires up the real Sheet (no admin UI in scope; call it once via a scratch script or `curl` against the deployed Next.js app during setup).
- Produces (GAS side): actions `registerLeadSheet`, `applyLeadSync` in `doPost`; installable trigger function `onEditLeads`.

- [ ] **Step 1: Add the two new action branches to `doPost`**, inside the `SYNC_SECRET`-gated section, alongside the existing `registerSheet`/`applyStatus`/`listSheetTabs`/`readSheetRows` checks (insert right after the `readSheetRows` check, before the final `return jsonResponse_({status: "error", ...})`):

```js
  if (body.action === "registerLeadSheet") {
    return handleRegisterLeadSheet_(body);
  }

  if (body.action === "applyLeadSync") {
    return handleApplyLeadSync_(body);
  }
```

- [ ] **Step 2: Add the handler functions**, after `handleReadSheetRows_` at the end of the file:

```js
/**
 * Installs the leads-specific onEdit watcher on the ONE leads sheet, and
 * remembers its ID in a script property so handleApplyLeadSync_ knows which
 * spreadsheet to write into without the app passing sheetId on every call.
 * A separate handler function (onEditLeads, not onEdit) means this sheet's
 * column layout (id/status/notes) never shares script properties with the
 * unrelated enrollment sheets' COL_EMAIL/COL_PAYMENT_CONFIRMATION config.
 *
 * One-time script properties this action's project needs, set once in
 * Project Settings -> Script Properties (in addition to the existing
 * SYNC_SECRET/WEBHOOK_URL/COL_* ones already documented at the top of this
 * file):
 *   WEBHOOK_URL_LEADS = https://<your-domain>/api/sync/from-sheets
 *   LEADS_COL_ID         = <exact header text of the id column>
 *   LEADS_COL_STATUS     = <exact header text of the status column>
 *   LEADS_COL_NOTES      = <exact header text of the notes column>
 *   LEADS_COL_NAME       = <exact header text of the name column>        (optional)
 *   LEADS_COL_EMAIL      = <exact header text of the email column>       (optional)
 *   LEADS_COL_PHONE      = <exact header text of the phone column>       (optional)
 *   LEADS_COL_PROFESSION = <exact header text of the profession column>  (optional)
 *   LEADS_COL_CAMPAIGN   = <exact header text of the campaign column>    (optional)
 *   LEADS_COL_AGENT      = <exact header text of the agent column>       (optional)
 * LEADS_SHEET_ID is set automatically by this action — do not set it by hand.
 */
function handleRegisterLeadSheet_(body) {
  if (!body.sheetId) {
    return jsonResponse_({ status: "error", message: "Missing sheetId" });
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const alreadyRegistered = ScriptApp.getProjectTriggers().some(
      (t) => t.getHandlerFunction() === "onEditLeads" && t.getTriggerSourceId() === body.sheetId,
    );
    if (!alreadyRegistered) {
      ScriptApp.newTrigger("onEditLeads").forSpreadsheet(body.sheetId).onEdit().create();
    }
    props.setProperty("LEADS_SHEET_ID", body.sheetId);
    return jsonResponse_({ status: "success", message: "Lead sheet registered" });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

/**
 * Writes one lead's full row into the registered leads sheet, matched by
 * the id column. Appends a fresh row the first time a given lead syncs
 * (leads are created in Supabase first, so the first sync for any lead has
 * no existing sheet row yet); every later sync updates that row in place.
 * Sets AppSyncValue so onEditLeads can tell its own echo apart from a real
 * ops-team edit, exactly like handleApplyStatus_ does for enrollments.
 */
function handleApplyLeadSync_(body) {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty("LEADS_SHEET_ID");
  if (!sheetId) {
    return jsonResponse_({ status: "error", message: "No lead sheet registered yet" });
  }
  if (!body.row || !body.row.id) {
    return jsonResponse_({ status: "error", message: "Missing row.id" });
  }

  try {
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    ensureTrackingColumns_(sheet, headerRow, props);

    const idCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_ID"));
    const statusCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_STATUS"));
    const notesCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_NOTES"));
    const appSyncValueCol = headerIndex_(headerRow, "AppSyncValue");
    const syncedAtCol = headerIndex_(headerRow, "SyncedAt");
    if (idCol === -1 || statusCol === -1 || notesCol === -1) {
      return jsonResponse_({ status: "error", message: "Lead sheet is missing id/status/notes columns" });
    }

    const ids =
      sheet.getLastRow() > 1 ? sheet.getRange(2, idCol + 1, sheet.getLastRow() - 1, 1).getValues() : [];
    const existingRowIndex = ids.findIndex((r) => String(r[0]).trim() === String(body.row.id).trim());
    const targetRow = existingRowIndex === -1 ? sheet.getLastRow() + 1 : existingRowIndex + 2;

    const nameCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_NAME"));
    const emailCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_EMAIL"));
    const phoneCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_PHONE"));
    const professionCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_PROFESSION"));
    const campaignCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_CAMPAIGN"));
    const agentCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_AGENT"));

    sheet.getRange(targetRow, idCol + 1).setValue(body.row.id);
    if (nameCol !== -1) sheet.getRange(targetRow, nameCol + 1).setValue(body.row.name || "");
    if (emailCol !== -1) sheet.getRange(targetRow, emailCol + 1).setValue(body.row.email || "");
    if (phoneCol !== -1) sheet.getRange(targetRow, phoneCol + 1).setValue(body.row.phone || "");
    if (professionCol !== -1) sheet.getRange(targetRow, professionCol + 1).setValue(body.row.profession || "");
    if (campaignCol !== -1) sheet.getRange(targetRow, campaignCol + 1).setValue(body.row.campaignName || "");
    if (agentCol !== -1) sheet.getRange(targetRow, agentCol + 1).setValue(body.row.agentName || "");
    sheet.getRange(targetRow, statusCol + 1).setValue(body.row.status || "");
    sheet.getRange(targetRow, notesCol + 1).setValue(body.row.notes || "");

    const syncValue = String(body.row.status || "") + "|" + String(body.row.notes || "");
    if (appSyncValueCol !== -1) sheet.getRange(targetRow, appSyncValueCol + 1).setValue(syncValue);
    if (syncedAtCol !== -1) sheet.getRange(targetRow, syncedAtCol + 1).setValue(new Date());

    return jsonResponse_({ status: "success", message: "Lead sheet updated" });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

/**
 * Installable trigger for the ONE leads sheet, registered by
 * handleRegisterLeadSheet_. Separate from onEdit (which serves enrollment
 * sheets) because it reads a completely different column layout. Only
 * status/notes edits are ever forwarded — every other cell is app-owned.
 */
function onEditLeads(e) {
  try {
    const sheet = e.range.getSheet();
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const props = PropertiesService.getScriptProperties();
    ensureTrackingColumns_(sheet, headerRow, props);

    const editedRow = e.range.getRow();
    if (editedRow === 1) return;

    const idCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_ID"));
    const statusCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_STATUS"));
    const notesCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_NOTES"));
    const appSyncValueCol = headerIndex_(headerRow, "AppSyncValue");
    if (idCol === -1 || statusCol === -1 || notesCol === -1) return;

    const editedCol = e.range.getColumn();
    if (editedCol !== statusCol + 1 && editedCol !== notesCol + 1) return;

    const id = sheet.getRange(editedRow, idCol + 1).getValue();
    if (!id) return; // a row not yet synced from the app — nothing to report back on

    const status = sheet.getRange(editedRow, statusCol + 1).getValue();
    const notes = sheet.getRange(editedRow, notesCol + 1).getValue();

    // Loop guard: this exact combination is what the app itself last wrote —
    // this edit is that write echoing back, not a real ops-team edit.
    const lastAppValue = appSyncValueCol !== -1 ? sheet.getRange(editedRow, appSyncValueCol + 1).getValue() : "";
    const currentValue = String(status || "") + "|" + String(notes || "");
    if (currentValue === lastAppValue) return;

    UrlFetchApp.fetch(props.getProperty("WEBHOOK_URL_LEADS"), {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        token: props.getProperty("SYNC_SECRET"),
        id: String(id),
        status: String(status || ""),
        notes: String(notes || ""),
        updatedAt: new Date().toISOString(),
      }),
      muteHttpExceptions: true,
    });
  } catch (err) {
    console.error(String(err));
  }
}
```

- [ ] **Step 3: Add the Next.js-side client functions to `src/lib/gas/sheets-sync-client.ts`**, appended after the existing `registerSheet` function:

```ts
export async function registerLeadSheet(sheetId: string): Promise<{ ok: boolean; message: string }> {
  const url = process.env.GAS_SHEETS_SYNC_URL;
  const token = process.env.SHEETS_SYNC_SECRET;
  if (!url || !token) {
    return { ok: false, message: "GAS_SHEETS_SYNC_URL or SHEETS_SYNC_SECRET is not configured." };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "registerLeadSheet", sheetId }),
    });
    const data = (await res.json().catch(() => null)) as { status?: string; message?: string } | null;

    if (!data || data.status !== "success") {
      return { ok: false, message: data?.message ?? "GAS did not confirm registration." };
    }
    return { ok: true, message: data.message ?? "Lead sheet registered." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Request failed." };
  }
}

export type LeadSyncRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string;
  profession: string | null;
  campaignName: string | null;
  agentName: string | null;
  status: string;
  notes: string | null;
};

/**
 * Fire-and-forget, mirroring pushStatusToSheet's "never block the caller"
 * contract — a dead or misconfigured GAS deployment must never turn a
 * lead insert/update into a failed request.
 */
export async function applyLeadSync(row: LeadSyncRow): Promise<void> {
  const url = process.env.GAS_SHEETS_SYNC_URL;
  const token = process.env.SHEETS_SYNC_SECRET;
  if (!url || !token) {
    console.warn("[sheets-sync] applyLeadSync skipped: GAS_SHEETS_SYNC_URL or SHEETS_SYNC_SECRET not set");
    return;
  }

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "applyLeadSync", row }),
    });
  } catch (error) {
    console.error(`[sheets-sync] failed to push lead ${row.id}:`, error);
  }
}
```

- [ ] **Step 4: Deploy via clasp** (per project convention — never redeploy via the web editor's "New version," which silently keeps stale code):

```bash
cd gas/clasp-project && clasp push && clasp deploy
```

- [ ] **Step 5: Type-check the Next.js side and commit**

```bash
node_modules/.bin/tsc --noEmit
git add gas/sheets-sync/Code.gs src/lib/gas/sheets-sync-client.ts
git commit -m "feat: extend GAS sheets-sync dispatcher with leads actions"
```

---

### Task 13: `POST /api/sync/from-sheets`

No automated test for the route handler; the loop-guard comparison logic is a single `Date` comparison directly inlined below and is simple enough that a unit test would just re-assert `Date.parse` semantics. Covered by Task 15's live verification with a real Sheet edit.

**Files:**
- Create: `src/app/api/sync/from-sheets/route.ts`

**Interfaces:**
- Consumes: `leadSheetSyncSchema` (Task 4), `getLeadById`, `applyStatusAndNotesFromSheet` (Task 5).
- Produces: `POST { token, id, status, notes?, updatedAt }` → `{ status: "success"|"error", message }`.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { leadSheetSyncSchema } from "@/lib/validations/leads";
import { getLeadById, applyStatusAndNotesFromSheet } from "@/lib/data/leads";

/**
 * Receives status/notes edits from gas/sheets-sync/Code.gs's onEditLeads
 * trigger. Token check happens before any DB access, mirroring
 * /api/webhooks/sheets-sync's ordering — an unauthenticated caller must
 * never cause a read or write.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !process.env.SHEETS_SYNC_SECRET || body.token !== process.env.SHEETS_SYNC_SECRET) {
    return NextResponse.json({ status: "error", message: "Wrong password." });
  }

  const parsed = leadSheetSyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid input" });
  }
  const { id, status, notes, updatedAt } = parsed.data;

  const lead = await getLeadById(id);
  if (!lead) {
    return NextResponse.json({ status: "error", message: `No lead with id ${id}` });
  }

  // Loop guard: an edit whose own timestamp is not strictly newer than the
  // lead's current updated_at is this row's own last outbound write echoing
  // back, not a genuine ops-team edit — ignore it rather than re-applying it.
  if (new Date(updatedAt).getTime() <= new Date(lead.updatedAt).getTime()) {
    return NextResponse.json({ status: "success", message: "Stale update ignored" });
  }

  await applyStatusAndNotesFromSheet(id, status, notes ?? null);
  return NextResponse.json({ status: "success", message: "Lead updated" });
}
```

- [ ] **Step 2: Type-check and commit**

```bash
node_modules/.bin/tsc --noEmit
git add src/app/api/sync/from-sheets/route.ts
git commit -m "feat: add from-sheets lead status/notes sync route"
```

---

### Task 14: `POST /api/sync/to-sheets`

No automated test — same rationale as Task 13. Covered by Task 15's live verification.

**Files:**
- Create: `src/app/api/sync/to-sheets/route.ts`

**Interfaces:**
- Consumes: `getLeadSyncRow` (Task 5), `applyLeadSync` (Task 12).
- Produces: `POST` (Supabase Database Webhook payload, `{ record: { id } }` at minimum) → `{ ok: true }` always (fire-and-forget toward GAS; never surfaces a GAS failure back to Supabase's webhook delivery system, to avoid a retry storm).

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getLeadSyncRow } from "@/lib/data/leads";
import { applyLeadSync } from "@/lib/gas/sheets-sync-client";

/**
 * Receiver for a Supabase Database Webhook on insert/update to `leads`.
 * Database Webhooks are dashboard-managed in this project's Supabase
 * version (Database -> Webhooks), not something a migration can create —
 * see this plan's "Deviation from spec" note. One-time manual setup:
 *
 *   1. Supabase Dashboard -> Database -> Webhooks -> Create a new hook
 *   2. Table: leads. Events: Insert, Update.
 *   3. Type: HTTP Request. Method: POST.
 *      URL: https://<your-domain>/api/sync/to-sheets
 *   4. Add HTTP header: x-sync-secret = <same value as SHEETS_SYNC_SECRET>
 *
 * Fire-and-forget toward GAS, mirroring pushStatusToSheet's "never block
 * the caller" contract — a dead GAS deployment must never turn into a
 * retry storm from Supabase's own webhook delivery system.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-sync-secret");
  if (!process.env.SHEETS_SYNC_SECRET || secret !== process.env.SHEETS_SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { record?: { id?: string } } | null;
  const leadId = body?.record?.id;
  if (!leadId) {
    return NextResponse.json({ error: "Missing record.id" }, { status: 400 });
  }

  const row = await getLeadSyncRow(leadId);
  if (row) {
    await applyLeadSync(row);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check and commit**

```bash
node_modules/.bin/tsc --noEmit
git add src/app/api/sync/to-sheets/route.ts
git commit -m "feat: add to-sheets lead sync webhook receiver"
```

---

### Task 15: Full regression + live verification

**Files:** none (verification only)

- [ ] **Step 1: Full regression**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/eslint src/lib/leads src/lib/data/leads.ts src/lib/validations/leads.ts src/lib/gas/sheets-sync-client.ts src/app/api/agents src/app/api/campaigns src/app/api/leads src/app/api/keep-alive src/app/api/sync src/app/leads src/components/leads gas/sheets-sync/Code.gs
```

Expected: tsc clean, all vitest tests pass (existing 498 + this plan's new tests), eslint clean on every touched file. (`Code.gs` will not lint under the project's JS/TS config — eslint it only if the project's config already covers `.gs` files; otherwise skip it and note the skip.)

- [ ] **Step 2: Live verification — capture page happy path**

Using the dev server and the test agent token seeded in Task 1 (`test-agent-token-001`):
1. Navigate to `/leads/add/test-agent-token-001`.
2. Confirm the "Hi, Test Agent" greeting renders (proves `getAgentByToken` + page wiring).
3. Paste a realistic message, e.g. `Hi, my name is Ayesha Malik. I'm a pharmacist. My email is ayesha@example.com. Interested in the diabetes course. My number is 03234267102.` — confirm Name/Email/Profession auto-fill after blurring the textarea.
4. Manually set Phone if not already filled, pick the seeded "PPC Outreach (Test)" campaign, tap Save.
5. Confirm a success toast and the form clears.
6. Query `select * from leads order by created_at desc limit 1;` via Supabase MCP — confirm the row exists with the expected phone (normalized E.164), name, email, profession, `lead_campaign_id`, `agent_id`, `status = 'new'`.

- [ ] **Step 3: Live verification — duplicate detection**

Repeat step 2's paste with the SAME phone number. Confirm the "Existing lead found" screen appears showing `status: "new"` and the campaign name; tap "Update this lead" and confirm no second row was created (still exactly one row for that phone in the query from Step 2).

- [ ] **Step 4: Live verification — invalid/inactive token**

Navigate to `/leads/add/does-not-exist` — confirm the "Link not recognized" page renders, not a crash or blank page.

- [ ] **Step 5: Live verification — keep-alive**

`curl http://localhost:3000/api/keep-alive` — confirm `{"ok":true}`.

- [ ] **Step 6: Live verification — Sheets sync loop guard (requires a real throwaway Google Sheet + GAS deployment from Task 12; skip only if the user has not yet set up a real leads Sheet, and say so explicitly rather than silently skipping)**

1. Create a throwaway Sheet with header row `id, name, email, phone, profession, campaign, agent, status, notes`, set the matching `LEADS_COL_*` script properties, call `registerLeadSheet` once (e.g. via a scratch `curl` to the deployed GAS `/exec` URL with the sheet's ID) to install `onEditLeads`.
2. Set up a Supabase Database Webhook per the setup note in `src/app/api/sync/to-sheets/route.ts`, pointed at a `localtunnel`/`ngrok`-exposed local dev server, or test against a Vercel preview deployment if easier.
3. Create a lead via the capture page (Step 2 above) — confirm a new row appears in the Sheet with matching id/status/notes (proves `to-sheets` → `applyLeadSync` → sheet append).
4. In the Sheet, manually edit that row's `status` cell — confirm the `leads.status` column in Supabase updates to match within a few seconds (proves `onEditLeads` → `/api/sync/from-sheets`).
5. Confirm editing any OTHER cell in that row (e.g. `name`) does NOT trigger a sync call (check GAS Executions log — `onEditLeads` should return early without a `UrlFetchApp.fetch` call).
6. Immediately after step 4, check the GAS Executions log for a second, unwanted `onEditLeads` firing caused by the app's own echo — there should be none, or if one fires, confirm it exits via the AppSyncValue check without calling `UrlFetchApp.fetch` again.

- [ ] **Step 7: Clean up test data**

```sql
delete from leads where agent_id = (select id from agents where token = 'test-agent-token-001');
```

Leave the `agents`/`lead_campaigns` test rows in place for future re-testing, or delete them too if the user prefers a clean slate — confirm with the user before deleting seed rows, since they're cheap to keep.

- [ ] **Step 8: Commit any fixes found during verification**

If Steps 2–5 surface a bug, fix it, re-run the affected regression command, and commit with a message describing the bug, not just the fix (e.g. "fix: duplicate check used unnormalized phone, never matched").

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-27-lead-capture.md`. Please review the plan, especially the five **Deviation from spec** notes under Global Constraints (table renamed to `lead_campaigns`, duplicate-check folded into the create route instead of a 4th route, the offline-vs-interactive duplicate-check trade-off, the keep-alive query substitution, and Database Webhooks being a manual dashboard step). Which execution approach would you prefer?

- **Subagent-driven** — a fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** — I implement every task myself in this session, then one fresh reviewer on the most capable model checks the whole branch at the end. Cheapest and fastest; no independent per-task review.

For this plan I recommend **subagent-driven**, because several tasks touch shared interfaces across files written by different "hands" (the data layer in Task 5 is consumed by six later tasks; the GAS script in Task 12 is consumed by two Next.js routes) — a mistake in an early task's exported function signature would silently propagate through the rest of the branch if not caught before the next task starts, exactly the class of bug this project's own history flagged in the conversion-tracking build (a cross-task UI gap only caught by the whole-branch review). Does the plan capture what you want, and which approach should we use?

