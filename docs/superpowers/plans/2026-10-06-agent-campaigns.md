# Agent Campaigns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sales agent can create a "Message my contacts" WhatsApp campaign from their own contacts and work through it one person at a time, using the existing sending limits, with pause/resume, and the admin can see it.

**Architecture:** Reuse `whatsapp_batches` and `whatsapp_batch_recipients`, extended by migration 0066 (owner, number, follow-up hours, status, two new recipient states). A new data module `sales-campaigns.ts` creates campaigns from the agent's own contacts and sends one recipient at a time through the existing `requestSend` (reserve the recipient first, send, revert if refused). Agent screens live under `/dashboard/sales/campaigns/*`; the admin sees agent campaigns in the existing Sales Hub WhatsApp Batches pages, read-only.

**Tech Stack:** Next.js 14 App Router (`params`/`searchParams` are Promises), TypeScript, Supabase service-role client (`createAdminSupabase`), zod, Vitest + Testing Library, Tailwind with `pz-*` tokens.

**Spec:** `docs/superpowers/specs/2026-10-06-agent-campaigns-design.md`

## Global Constraints

- Repo root: `D:\Claude Code Workspace\PZ Academy\PZ Academy LMS & Site\Recovered Files\pz-academy-platform`. Work on branch `agent-campaigns` (off `origin/main` 6b45778). Never push or merge to `main`.
- `npm run` is broken in this path. Type-check: `node node_modules/typescript/bin/tsc --noEmit`. Tests: `node node_modules/vitest/vitest.mjs run tests/<file>`. Never run `next build` while the dev server runs.
- Never regenerate `src/lib/supabase/database.types.ts`; hand-edit only.
- The Supabase MCP declines writes. For migration 0066 the user pastes the SQL into the SQL editor (project `whqdasotjlhvrjmgiffk`); verify read-only afterwards with `execute_sql`.
- `pz-*` tokens only, no raw hex; adaptive text colours are for text only; light mode must not change. Shared `Button` (`src/components/ui/button.tsx`) has `disabled:opacity-50` in its base: add `disabled:opacity-100` where locked text must stay readable. Skeletons carry `role="status"`.
- Never claim WhatsApp limits are safe or guaranteed (guard tests scan source for this).
- Every `/api/sales/*` route calls `requireSalesAgent()` itself (middleware does not cover `/api`).
- Known pre-existing failure: `tests/pz-tokens.test.ts` (SalesTeamPanel.tsx). Ignore it; add no new token violations.
- `git add` explicit paths only. Do not touch the untracked `docs/lead-capture-go-live-guide.md`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Spec rulings: own contacts only; the same text must not go to more than 3 people in a row (a campaign over 3 recipients needs a name tag); "Bring them back in" is chosen once per campaign among 8 hours / 1 day / 2 days / 3 days, default 1 day, passed as `followupInHours` on every send (reuse `FOLLOWUP_CHOICES`, `DEFAULT_FOLLOWUP_HOURS`, `isFollowupHours`, `nextFollowupAfterSend` from `src/lib/crm/followup.ts`); do-not-contact, unsubscribed and phone-less contacts never enter a campaign; agent campaigns are read-only for admins.
- Test accounts: admin `pharmacozymeofficial@gmail.com` (password in user memory), agent `bp2001073hamzaahmed@gmail.com` (password in user memory). Never use the off-limits Test Data emails.

## Review Focus

- Another agent's campaign id must never be readable or actionable (404/not-found, no data) — pinned in Tasks 4 and 5.
- Two taps or two tabs on the same recipient must call `requestSend` once and send once (reserve before send) — pinned in Task 4.
- A refused send (quiet hours, daily cap, frozen, no number) must leave the recipient `pending` and pause the campaign with a reason; nothing is lost — pinned in Task 4.
- A contact that became do-not-contact, lost its phone, or changed owner after the campaign was created must be marked `blocked` at send time with no link issued — pinned in Task 4.
- A name-less message to more than 3 people must be refused by the server, not only the UI — pinned in Tasks 2 and 3.
- Admins must not be able to mark, edit or re-apply recipients of an agent campaign through the old admin batch routes — pinned in Task 10.

---

## File Structure

New:
- `supabase/migrations/0066_agent_campaigns.sql`
- `src/lib/crm/campaign-rules.ts` — pure rules (variety, dropped-count text, today/tomorrow split, refusal classes, default name)
- `src/lib/crm/campaign-ui.ts` — client-safe JSON types and audience filtering helpers (pure)
- `src/lib/data/sales-campaigns.ts` — audience, create, list, get, send recipient, skip, set status (server only)
- `src/app/api/sales/campaigns/route.ts` (GET list, POST create), `.../audience/route.ts`, `.../[id]/route.ts` (GET, PATCH), `.../[id]/send/route.ts`, `.../[id]/skip/route.ts`
- `src/app/dashboard/sales/campaigns/page.tsx`, `loading.tsx`, `new/page.tsx`, `[id]/page.tsx`
- `src/components/sales/CampaignsList.tsx`, `CampaignWizard.tsx`, `CampaignSession.tsx`
- Tests: `tests/migrations-agent-campaigns.test.ts`, `tests/crm-campaign-rules.test.ts`, `tests/crm-campaign-ui.test.ts`, `tests/sales-campaigns-data.test.ts`, `tests/sales-campaigns-send.test.ts`, `tests/sales-campaigns-validations.test.ts`, `tests/sales-campaigns-list.test.tsx`, `tests/sales-campaign-wizard.test.tsx`, `tests/sales-campaign-session.test.tsx`, `tests/admin-agent-campaigns.test.ts`

Modified: `src/lib/supabase/database.types.ts` (hand edit), `src/lib/validations/sales.ts`, `src/lib/api/sales-http.ts`, `src/components/dashboard/nav.ts`, `tests/dashboard-nav.test.ts`, `tests/sales-routes.test.ts`, `tests/sales-data-exports.test.ts`, `src/lib/data/admin-crm-whatsapp.ts`, `src/components/admin/crm/WhatsAppPanel.tsx`, `src/components/admin/crm/WhatsAppBatchDetailClient.tsx`, and the admin whatsapp page(s) under `src/app/dashboard/admin/sales-hub/whatsapp/`.

---

# PHASE 1 — Backend

### Task 1: Migration 0066 and types

**Files:**
- Create: `supabase/migrations/0066_agent_campaigns.sql`
- Modify: `src/lib/supabase/database.types.ts` (`whatsapp_batches` Row/Insert/Update near line 2663; `whatsapp_send_status` enum at line ~2964)
- Test: `tests/migrations-agent-campaigns.test.ts`

**Interfaces:**
- Produces: columns `whatsapp_batches.owner_agent_id uuid null`, `number_id uuid null`, `followup_in_hours integer null`, `status text not null default 'active'` (`draft|active|paused|done`), `paused_reason text null`, `updated_at timestamptz not null default now()`; enum `whatsapp_send_status` gains `skipped`, `blocked`.

- [ ] **Step 1: Failing test** (`tests/migrations-agent-campaigns.test.ts`, mirror `tests/migrations-sales-hub.test.ts`):
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0066_agent_campaigns.sql"), "utf8");
const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

it("adds the campaign columns idempotently", () => {
  for (const col of ["owner_agent_id", "number_id", "followup_in_hours", "status", "paused_reason", "updated_at"]) {
    expect(sql).toMatch(new RegExp(`add column if not exists ${col}\\b`, "i"));
  }
  expect(sql).toMatch(/status\s+text\s+not null default 'active'/i);
  expect(sql).toMatch(/check \(status in \('draft', 'active', 'paused', 'done'\)\)/i);
  expect(sql).toMatch(/followup_in_hours[^,]*check[^,]*8[^,]*24[^,]*48[^,]*72/i);
});

it("adds the two recipient states without touching existing ones", () => {
  expect(sql).toMatch(/alter type public\.whatsapp_send_status add value if not exists 'skipped'/i);
  expect(sql).toMatch(/alter type public\.whatsapp_send_status add value if not exists 'blocked'/i);
  expect(sql).not.toMatch(/drop type/i);
});

it("indexes the owner and creates no policies or tables", () => {
  expect(sql).toMatch(/create index if not exists whatsapp_batches_owner_agent_idx/i);
  expect(sql).not.toMatch(/create policy/i);
  expect(sql).not.toMatch(/create table/i);
});

it("database.types.ts knows the columns and enum values", () => {
  const block = types.slice(types.indexOf("whatsapp_batches: {"), types.indexOf("whatsapp_batches: {") + 3500);
  for (const col of ["owner_agent_id", "number_id", "followup_in_hours", "paused_reason", "updated_at"]) {
    expect((block.match(new RegExp(col, "g")) ?? []).length).toBeGreaterThanOrEqual(3);
  }
  expect(types).toMatch(/whatsapp_send_status: "pending" \| "sent" \| "skipped" \| "blocked"/);
});
```

- [ ] **Step 2:** Run `node node_modules/vitest/vitest.mjs run tests/migrations-agent-campaigns.test.ts`. Expected: FAIL (file missing).

- [ ] **Step 3: Write the migration** `supabase/migrations/0066_agent_campaigns.sql`:
```sql
-- 0066_agent_campaigns.sql
-- Agent campaigns: a sales agent's own WhatsApp campaign reuses whatsapp_batches.
-- owner_agent_id is null for admin batches (unchanged). Service-role only, no policies.
alter table public.whatsapp_batches
  add column if not exists owner_agent_id uuid references public.profiles(id) on delete set null,
  add column if not exists number_id uuid references public.whatsapp_numbers(id) on delete set null,
  add column if not exists followup_in_hours integer check (followup_in_hours is null or followup_in_hours in (8, 24, 48, 72)),
  add column if not exists status text not null default 'active',
  add column if not exists paused_reason text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.whatsapp_batches
  drop constraint if exists whatsapp_batches_status_check;
alter table public.whatsapp_batches
  add constraint whatsapp_batches_status_check check (status in ('draft', 'active', 'paused', 'done'));

create index if not exists whatsapp_batches_owner_agent_idx
  on public.whatsapp_batches (owner_agent_id, created_at desc);

alter type public.whatsapp_send_status add value if not exists 'skipped';
alter type public.whatsapp_send_status add value if not exists 'blocked';
```
Hand-edit `database.types.ts`: in `whatsapp_batches` Row add `followup_in_hours: number | null`, `number_id: string | null`, `owner_agent_id: string | null`, `paused_reason: string | null`, `status: string`, `updated_at: string`; in Insert and Update the same names optional (`?`), with `status?: string`. Add Relationships entries for `owner_agent_id` -> profiles and `number_id` -> whatsapp_numbers following the existing `created_by` entry's shape. Change the enum line to `whatsapp_send_status: "pending" | "sent" | "skipped" | "blocked"`.

- [ ] **Step 4:** Run the test (PASS) and `node node_modules/typescript/bin/tsc --noEmit` (clean; fix any existing code that switches exhaustively on the enum — Task 10 widens the admin code, so if `tsc` now errors in `admin-crm-whatsapp.ts`, widen only the status unions needed to compile and note it).

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/0066_agent_campaigns.sql src/lib/supabase/database.types.ts tests/migrations-agent-campaigns.test.ts
git commit -m "feat(campaigns): migration 0066 agent campaign columns and recipient states" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6 (controller, user action):** give the user the SQL to paste into the Supabase SQL editor; after they confirm, verify read-only: `select column_name from information_schema.columns where table_name='whatsapp_batches' and column_name in ('owner_agent_id','number_id','followup_in_hours','status','paused_reason','updated_at');` (6 rows) and `select unnest(enum_range(null::public.whatsapp_send_status));` (4 values). Needed before the Task 11 browser check; code tasks do not need it.

---

### Task 2: Pure campaign rules

**Files:**
- Create: `src/lib/crm/campaign-rules.ts`
- Test: `tests/crm-campaign-rules.test.ts`

**Interfaces:**
- Produces:
```ts
export const MAX_CAMPAIGN_RECIPIENTS = 2000;
export const MAX_SAME_TEXT_RUN = 3;
export const VARIETY_MESSAGE: string;
export type CampaignStatus = "draft" | "active" | "paused" | "done";
export type CampaignRecipientStatus = "pending" | "sent" | "skipped" | "blocked";
export type DroppedCounts = { notOwned: number; doNotContact: number; noPhone: number; duplicates: number };
export function hasNameTag(template: string): boolean;
export function varietyBlocked(template: string, recipientCount: number): boolean;
export function describeDropped(d: DroppedCounts): string[];
export function splitTodayTomorrow(selected: number, remainingToday: number): { today: number; tomorrow: number };
export function defaultCampaignName(now: Date): string;
export type RefusalClass = "block-recipient" | "pause" | "retry";
export function classifyRefusal(reason: string): RefusalClass;
export function pauseReasonText(reason: string, message?: string | null): string;
```

- [ ] **Step 1: Failing test** (`tests/crm-campaign-rules.test.ts`):
```ts
import {
  MAX_CAMPAIGN_RECIPIENTS, hasNameTag, varietyBlocked, describeDropped,
  splitTodayTomorrow, defaultCampaignName, classifyRefusal, pauseReasonText,
} from "@/lib/crm/campaign-rules";

describe("variety", () => {
  it("detects the name tags with stray whitespace", () => {
    expect(hasNameTag("Hi {{first_name}}")).toBe(true);
    expect(hasNameTag("Hi {{ full_name }}")).toBe(true);
    expect(hasNameTag("Hi there")).toBe(false);
    expect(hasNameTag("Hi {{email}}")).toBe(false);
  });
  it("blocks a name-less message only above 3 recipients", () => {
    expect(varietyBlocked("Hello", 3)).toBe(false);
    expect(varietyBlocked("Hello", 4)).toBe(true);
    expect(varietyBlocked("Hello {{first_name}}", 500)).toBe(false);
  });
});

describe("describeDropped", () => {
  it("lists only non-zero reasons in plain words", () => {
    expect(describeDropped({ notOwned: 0, doNotContact: 3, noPhone: 1, duplicates: 0 })).toEqual([
      "3 skipped: asked not to be messaged",
      "1 skipped: no phone number",
    ]);
    expect(describeDropped({ notOwned: 2, doNotContact: 0, noPhone: 0, duplicates: 4 })).toEqual([
      "2 skipped: not your contact",
      "4 skipped: picked twice",
    ]);
    expect(describeDropped({ notOwned: 0, doNotContact: 0, noPhone: 0, duplicates: 0 })).toEqual([]);
  });
});

describe("splitTodayTomorrow", () => {
  it("never goes negative and sums to the selection", () => {
    expect(splitTodayTomorrow(85, 46)).toEqual({ today: 46, tomorrow: 39 });
    expect(splitTodayTomorrow(10, 46)).toEqual({ today: 10, tomorrow: 0 });
    expect(splitTodayTomorrow(10, 0)).toEqual({ today: 0, tomorrow: 10 });
    expect(splitTodayTomorrow(10, -5)).toEqual({ today: 0, tomorrow: 10 });
  });
});

it("defaultCampaignName is stable and readable", () => {
  expect(defaultCampaignName(new Date("2026-10-06T10:00:00Z"))).toBe("Campaign 6 Oct");
});

describe("classifyRefusal", () => {
  it("permanent per-person refusals block the recipient", () => {
    for (const r of ["do-not-contact", "no-phone", "not-owner", "not-found"]) expect(classifyRefusal(r)).toBe("block-recipient");
  });
  it("number or window problems pause the campaign", () => {
    for (const r of ["frozen", "quiet_hours", "daily_cap", "hourly_cap", "number-not-assigned"]) expect(classifyRefusal(r)).toBe("pause");
  });
  it("short waits and errors just retry", () => {
    for (const r of ["spacing", "db-error", "something-new"]) expect(classifyRefusal(r)).toBe("retry");
  });
});

it("pauseReasonText prefers the server message", () => {
  expect(pauseReasonText("quiet_hours", "Messaging opens at 09:00.")).toBe("Messaging opens at 09:00.");
  expect(pauseReasonText("daily_cap")).toBe("Today's new chats are used up.");
  expect(pauseReasonText("frozen")).toBe("This number is paused.");
  expect(pauseReasonText("number-not-assigned")).toBe("No WhatsApp number is assigned to you.");
  expect(pauseReasonText("other")).toBe("Sending is paused.");
});

it("the cap is 2000", () => expect(MAX_CAMPAIGN_RECIPIENTS).toBe(2000));
```

- [ ] **Step 2:** Run it; expect FAIL.

- [ ] **Step 3: Implement** `src/lib/crm/campaign-rules.ts`:
```ts
// Pure rules for agent campaigns. No I/O, safe to import from client components.
export const MAX_CAMPAIGN_RECIPIENTS = 2000;
export const MAX_SAME_TEXT_RUN = 3;
export const VARIETY_MESSAGE =
  "Add {{first_name}} to your message so each person gets their own greeting. WhatsApp looks at identical text sent to many people.";

export type CampaignStatus = "draft" | "active" | "paused" | "done";
export type CampaignRecipientStatus = "pending" | "sent" | "skipped" | "blocked";
export type DroppedCounts = { notOwned: number; doNotContact: number; noPhone: number; duplicates: number };

export function hasNameTag(template: string): boolean {
  return /\{\{\s*(first_name|full_name)\s*\}\}/.test(template);
}

export function varietyBlocked(template: string, recipientCount: number): boolean {
  return recipientCount > MAX_SAME_TEXT_RUN && !hasNameTag(template);
}

export function describeDropped(d: DroppedCounts): string[] {
  const out: string[] = [];
  if (d.notOwned > 0) out.push(`${d.notOwned} skipped: not your contact`);
  if (d.doNotContact > 0) out.push(`${d.doNotContact} skipped: asked not to be messaged`);
  if (d.noPhone > 0) out.push(`${d.noPhone} skipped: no phone number`);
  if (d.duplicates > 0) out.push(`${d.duplicates} skipped: picked twice`);
  return out;
}

export function splitTodayTomorrow(selected: number, remainingToday: number): { today: number; tomorrow: number } {
  const today = Math.max(0, Math.min(selected, remainingToday));
  return { today, tomorrow: selected - today };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function defaultCampaignName(now: Date): string {
  return `Campaign ${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]}`;
}

export type RefusalClass = "block-recipient" | "pause" | "retry";
const BLOCK = new Set(["do-not-contact", "no-phone", "not-owner", "not-found"]);
const PAUSE = new Set(["frozen", "quiet_hours", "daily_cap", "hourly_cap", "number-not-assigned"]);
export function classifyRefusal(reason: string): RefusalClass {
  if (BLOCK.has(reason)) return "block-recipient";
  if (PAUSE.has(reason)) return "pause";
  return "retry";
}

const PAUSE_TEXT: Record<string, string> = {
  frozen: "This number is paused.",
  quiet_hours: "Messaging is paused overnight.",
  daily_cap: "Today's new chats are used up.",
  hourly_cap: "This hour's new chats are used up.",
  "number-not-assigned": "No WhatsApp number is assigned to you.",
};
export function pauseReasonText(reason: string, message?: string | null): string {
  if (message && message.trim() !== "") return message;
  return PAUSE_TEXT[reason] ?? "Sending is paused.";
}
```

- [ ] **Step 4:** Run the test (PASS) and `tsc`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/crm/campaign-rules.ts tests/crm-campaign-rules.test.ts
git commit -m "feat(campaigns): pure campaign rules" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Campaign JSON types, audience and create (data layer, part 1)

**Files:**
- Create: `src/lib/crm/campaign-ui.ts`, `src/lib/data/sales-campaigns.ts`
- Test: `tests/crm-campaign-ui.test.ts`, `tests/sales-campaigns-data.test.ts`; extend `tests/sales-data-exports.test.ts`

**Interfaces:**
- Consumes: Task 2 exports; `Actor` from `@/lib/crm/ownership`; `getNumberForAgent(userId, isAdmin, numberId)` from `@/lib/data/sales-numbers`; `courseNameFromLabel` from `@/lib/crm/product-label`; `createAdminSupabase`; `chunk` from `@/lib/crm/assignment`; the idioms (`Fail`, `dbError`) in `src/lib/data/sales-contacts.ts`.
- Produces (`campaign-ui.ts`, client-safe):
```ts
import type { CampaignStatus, CampaignRecipientStatus } from "@/lib/crm/campaign-rules";
export type AudienceRowJson = { id: string; fullName: string; phone: string; lastOutcome: string | null; courses: string[] };
export type CampaignListItemJson = {
  id: string; name: string; status: CampaignStatus; recipientCount: number; sentCount: number;
  pendingCount: number; pausedReason: string | null; createdAt: string;
};
export type CampaignRecipientJson = { id: string; contactId: string | null; fullName: string; phone: string; status: CampaignRecipientStatus };
export type CampaignDetailJson = CampaignListItemJson & {
  messageTemplate: string; numberId: string | null; followupInHours: number; recipients: CampaignRecipientJson[];
};
export type AudienceFilter = { q: string; outcome: string; course: string }; // "" = no filter; outcome "new" = no outcome yet
export function filterAudience(rows: AudienceRowJson[], f: AudienceFilter): AudienceRowJson[];
export function courseOptions(rows: AudienceRowJson[]): string[];
export function outcomeOptions(rows: AudienceRowJson[]): { value: string; label: string }[];
```
- Produces (`sales-campaigns.ts`):
```ts
export async function loadCampaignAudience(actor: Actor): Promise<{ ok: true; rows: AudienceRowJson[]; truncated: boolean } | Fail<"not-allowed" | "db-error">>;
export async function createCampaign(actor: Actor, input: { name?: string; messageTemplate: string; contactIds: string[]; numberId: string; followupInHours: number }, now?: Date):
  Promise<{ ok: true; campaignId: string; recipientCount: number; dropped: DroppedCounts } | Fail<"not-allowed" | "too-many" | "variety" | "number-not-assigned" | "empty-audience" | "db-error">>;
export async function listMyCampaigns(actor: Actor): Promise<{ ok: true; campaigns: CampaignListItemJson[] } | Fail<"not-allowed" | "db-error">>;
export async function getMyCampaign(actor: Actor, id: string): Promise<{ ok: true; campaign: CampaignDetailJson } | Fail<"not-allowed" | "not-found" | "db-error">>;
```

- [ ] **Step 1: Failing tests.** `tests/crm-campaign-ui.test.ts`:
```ts
import { filterAudience, courseOptions, outcomeOptions, type AudienceRowJson } from "@/lib/crm/campaign-ui";

const row = (id: string, fullName: string, over: Partial<AudienceRowJson> = {}): AudienceRowJson => ({
  id, fullName, phone: "+923001234567", lastOutcome: null, courses: [], ...over,
});
const rows = [
  row("1", "Ayesha Khan", { courses: ["PPC"], lastOutcome: "interested", phone: "+923001111111" }),
  row("2", "Bilal Ahmed", { courses: ["MDC"], phone: "+923002222222" }),
  row("3", "Sara Ali", { courses: ["PPC", "MDC"], lastOutcome: "replied", phone: "+923003333333" }),
];

it("searches name and phone digits", () => {
  expect(filterAudience(rows, { q: "ayesha", outcome: "", course: "" }).map((r) => r.id)).toEqual(["1"]);
  expect(filterAudience(rows, { q: "0300 222", outcome: "", course: "" }).map((r) => r.id)).toEqual(["2"]);
});
it("filters by outcome, with 'new' meaning no outcome yet", () => {
  expect(filterAudience(rows, { q: "", outcome: "new", course: "" }).map((r) => r.id)).toEqual(["2"]);
  expect(filterAudience(rows, { q: "", outcome: "replied", course: "" }).map((r) => r.id)).toEqual(["3"]);
});
it("filters by course and combines filters", () => {
  expect(filterAudience(rows, { q: "", outcome: "", course: "PPC" }).map((r) => r.id)).toEqual(["1", "3"]);
  expect(filterAudience(rows, { q: "sara", outcome: "", course: "MDC" }).map((r) => r.id)).toEqual(["3"]);
});
it("builds sorted unique course options and outcome options present in the data", () => {
  expect(courseOptions(rows)).toEqual(["MDC", "PPC"]);
  expect(outcomeOptions(rows).map((o) => o.value)).toEqual(["new", "interested", "replied"]);
});
```
`tests/sales-campaigns-data.test.ts`: copy the fake-Supabase approach from `tests/sales-assignment-partial.test.ts` / `tests/sales-assignment-behavior.test.ts` (read them first: they `vi.mock("@/lib/supabase/admin")` and `vi.mock("@/lib/data/sales-numbers")`). Cases (write each fully against that fake):
  1. `createCampaign` with 5 contact ids where one is owned by another agent, one has `do_not_contact_at`, one has `whatsapp_unsubscribed_at`, one has no phone, and one is duplicated in the input list -> inserts a batch with `owner_agent_id` = actor id, `created_by` = actor id, `status: "active"`, `number_id`, `followup_in_hours`; inserts recipients only for the clean contact; result `dropped` equals `{ notOwned: 1, doNotContact: 2, noPhone: 1, duplicates: 1 }`.
  2. Name-less template with 4 clean contacts -> `{ ok:false, reason:"variety" }` and NO batch insert; with `{{first_name}}` -> ok.
  3. `getNumberForAgent` returns null -> `number-not-assigned`, no insert.
  4. More than `MAX_CAMPAIGN_RECIPIENTS` ids -> `too-many`; zero clean contacts -> `empty-audience` with no batch insert.
  5. Recipient insert fails -> the batch row is deleted and `db-error` returned.
  6. `getMyCampaign` for a campaign whose `owner_agent_id` is another user -> `{ ok:false, reason:"not-found" }` (never `not-allowed`, so ids cannot be probed); own campaign returns recipients ordered by name with `pendingCount` correct.
  7. `listMyCampaigns` only selects rows `.eq("owner_agent_id", actor.id)` (assert the filter on the fake).
  8. `loadCampaignAudience`: selects only `.eq("owner_id", actor.id)`; drops do-not-contact/unsubscribed/phone-less rows; attaches `courses` from the segment view via `courseNameFromLabel`.
Add `createCampaign`, `listMyCampaigns`, `getMyCampaign`, `loadCampaignAudience` to the expectation list in `tests/sales-data-exports.test.ts` following its pattern (the later send functions are added in Task 4).

- [ ] **Step 2:** Run both new test files; expect FAIL.

- [ ] **Step 3: Implement** `campaign-ui.ts`:
```ts
import type { CampaignStatus, CampaignRecipientStatus } from "@/lib/crm/campaign-rules";
// (types exactly as listed under Interfaces)

export function filterAudience(rows: AudienceRowJson[], f: AudienceFilter): AudienceRowJson[] {
  const q = f.q.trim().toLowerCase();
  const qDigits = f.q.replace(/\D/g, "").replace(/^0+/, "");
  return rows.filter((r) => {
    if (q !== "") {
      const nameHit = r.fullName.toLowerCase().includes(q);
      const phoneHit = qDigits !== "" && r.phone.replace(/\D/g, "").includes(qDigits);
      if (!nameHit && !phoneHit) return false;
    }
    if (f.outcome !== "") {
      if (f.outcome === "new" ? r.lastOutcome !== null : r.lastOutcome !== f.outcome) return false;
    }
    if (f.course !== "" && !r.courses.includes(f.course)) return false;
    return true;
  });
}
export function courseOptions(rows: AudienceRowJson[]): string[] {
  return Array.from(new Set(rows.flatMap((r) => r.courses))).sort((a, b) => a.localeCompare(b));
}
import { outcomeLabel } from "@/lib/crm/sales-ui";
export function outcomeOptions(rows: AudienceRowJson[]): { value: string; label: string }[] {
  const seen = new Set(rows.map((r) => r.lastOutcome ?? "new"));
  const order = ["new", "interested", "replied", "bought", "not_interested"];
  return order.filter((v) => seen.has(v)).map((v) => ({ value: v, label: v === "new" ? "New" : outcomeLabel(v) }));
}
```
`sales-campaigns.ts` begins `import "server-only";`, defines `type Fail<R extends string> = { ok: false; reason: R }`, a local `dbError(tag, e)` that logs `[sales-campaigns] <tag>` and returns `{ ok:false, reason:"db-error" }`, `const canUse = (a: Actor) => a.role === "sales_agent" || a.role === "admin" || a.role === "super_admin"`, `ID_CHUNK = 200`, `MAX_AUDIENCE = 3000`.

`loadCampaignAudience`: if `!canUse(actor) || actor.id === ""` return `not-allowed`. Page the agent's contacts 1000 at a time with `.from("contacts").select("id, full_name, phone_e164, last_outcome, do_not_contact_at, whatsapp_unsubscribed_at").eq("owner_id", actor.id).order("updated_at", { ascending: false }).range(from, from + 999)` until fewer than 1000 rows or `MAX_AUDIENCE` reached (`truncated = true` when more existed). Keep rows with a phone and no do-not-contact/unsubscribe. Then for each `chunk(ids, ID_CHUNK)` query `crm_contact_segment_source` `select("id, product_labels").in("id", slice)` and set `courses = unique(product_labels.map(courseNameFromLabel).filter(Boolean))`.

`createCampaign` (sequence): reject when `!canUse` -> `not-allowed`; unique the ids (`duplicates = input.length - unique.length`); `unique.length > MAX_CAMPAIGN_RECIPIENTS` -> `too-many`; `getNumberForAgent(actor.id, isAdminRole, input.numberId)` null -> `number-not-assigned`; load contacts in chunks (`select("id, full_name, phone_e164, owner_id, do_not_contact_at, whatsapp_unsubscribed_at").in("id", slice)`); classify each requested id: missing or `owner_id !== actor.id` -> `notOwned`; do-not-contact or unsubscribed -> `doNotContact`; no phone -> `noPhone`; else keep. `clean.length === 0` -> `empty-audience`; `varietyBlocked(template, clean.length)` -> `variety` (checked AFTER number and BEFORE any insert). Insert the batch `{ name: input.name?.trim() || defaultCampaignName(now), message_template, segment: [], recipient_count: clean.length, created_by: actor.id, owner_agent_id: actor.id, number_id, followup_in_hours, status: "active" }` `.select("id").single()`; insert recipients in chunks of 500 `{ batch_id, contact_id, full_name, phone_e164 }`; on any failure delete the batch row and return `db-error`.

`getMyCampaign`: select the batch `.eq("id", id).maybeSingle()`; missing or `owner_agent_id !== actor.id` -> `not-found`. Select recipients `.eq("batch_id", id).order("full_name", { ascending: true }).order("id", { ascending: true })`. `pendingCount` = recipients with `status === "pending"`. Map to `CampaignDetailJson`. `listMyCampaigns`: select batches `.eq("owner_agent_id", actor.id).order("created_at", { ascending: false })`, then one grouped count of pending per batch (`select("batch_id, status").in("batch_id", ids).eq("status","pending")` and count in TS).

- [ ] **Step 4:** Run the new tests plus `tests/sales-data-exports.test.ts` and `tsc`; PASS/clean.

- [ ] **Step 5: Commit**
```bash
git add src/lib/crm/campaign-ui.ts src/lib/data/sales-campaigns.ts tests/crm-campaign-ui.test.ts tests/sales-campaigns-data.test.ts tests/sales-data-exports.test.ts
git commit -m "feat(campaigns): campaign audience, create, list and get" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Send, skip and pause/resume (data layer, part 2)

**Files:**
- Modify: `src/lib/data/sales-campaigns.ts`
- Test: `tests/sales-campaigns-send.test.ts`; extend `tests/sales-data-exports.test.ts`

**Interfaces:**
- Consumes: `requestSend` and `SendResult` from `@/lib/data/sales-send`; `classifyRefusal`, `pauseReasonText` (Task 2).
- Produces:
```ts
export type SendCampaignResult =
  | { ok: true; link: string; nextUnlockAt: string; warnings: string[]; budget: BudgetSummary; sentCount: number; pendingCount: number; done: boolean }
  | { ok: false; reason: string; message?: string; retryAt?: string | null; paused?: boolean; recipientBlocked?: boolean; pendingCount?: number };
export async function sendCampaignRecipient(actor: Actor, campaignId: string, recipientId: string, now?: Date): Promise<SendCampaignResult | Fail<"not-found" | "not-allowed" | "already-handled" | "campaign-done" | "db-error">>;
export async function skipCampaignRecipient(actor: Actor, campaignId: string, recipientId: string): Promise<{ ok: true; pendingCount: number; done: boolean } | Fail<"not-found" | "not-allowed" | "already-handled" | "db-error">>;
export async function setCampaignStatus(actor: Actor, campaignId: string, status: "active" | "paused"): Promise<{ ok: true; status: CampaignStatus } | Fail<"not-found" | "not-allowed" | "campaign-done" | "db-error">>;
```
(`BudgetSummary` is imported as a type from `@/lib/crm/send-limits`. Unlike `Fail`, `SendCampaignResult`'s failure branch carries extra fields; the API route in Task 5 reads them.)

**Behaviour (implement exactly):**
`sendCampaignRecipient`:
1. `!canUse(actor)` -> `not-allowed`. Load campaign; missing or `owner_agent_id !== actor.id` -> `not-found`. `status === "done"` -> `campaign-done`. Missing `number_id` -> pause reason `number-not-assigned` path (below).
2. **Reserve first:** `update whatsapp_batch_recipients set status='sent', sent_at=<now>, sent_by=<actor.id> where id=recipientId and batch_id=campaignId and status='pending'` with `.select("id, contact_id")`. Zero rows -> if the recipient does not exist in this campaign `not-found`, else `already-handled`. (This is what makes a double tap or second tab send once.)
3. No `contact_id` (contact was deleted) -> mark the recipient `blocked` (guarded `eq status sent`, `sent_by` actor), return `{ ok:false, reason:"not-found", recipientBlocked:true, pendingCount }`.
4. Call `requestSend({ actor, contactId, numberId: campaign.number_id, messageTemplate: campaign.message_template, followupInHours: campaign.followup_in_hours ?? DEFAULT_FOLLOWUP_HOURS, now })`.
5. On success: recount (`refreshCounts`), set the campaign `status` to `done` when no pending remain else leave `active` (resuming a `paused` campaign to `active` on a successful send, clearing `paused_reason`), and return `{ ok:true, link, nextUnlockAt, warnings, budget, sentCount, pendingCount, done }`.
6. On refusal, branch on `classifyRefusal(result.reason)`:
   - `block-recipient`: set the recipient to `blocked` (clear `sent_at`/`sent_by`; guard `status = 'sent' and sent_by = actor.id`), recount, return `{ ok:false, reason, message, recipientBlocked:true, pendingCount }`. Do not pause the campaign.
   - `pause`: revert the recipient to `pending` (clear `sent_at`/`sent_by`, same guard), set the campaign `status='paused'`, `paused_reason = pauseReasonText(reason, message)`, return `{ ok:false, reason, message, retryAt, paused:true, pendingCount }`.
   - `retry`: revert to `pending`, no campaign change, return `{ ok:false, reason, message, retryAt, pendingCount }`.
   If a revert or recount itself errors, log `[sales-campaigns]` and return `db-error` (never throw).
7. Wrap everything in try/catch -> `dbError`.

`skipCampaignRecipient`: owner check as above (`not-found` for another agent's campaign); guarded `update ... set status='skipped' where id and batch_id and status='pending'` `.select("id")`; zero rows -> `already-handled`; recount; `done` when none pending.

`setCampaignStatus`: owner check; `status === "done"` -> `campaign-done`; `update ... set status = <new>, paused_reason = null|"Paused by you", updated_at = now`.

`refreshCounts(db, campaignId)` (module-private): count recipients `status='sent'` and `status='pending'`, write `sent_count` and `updated_at`, and when pending is 0 and `recipient_count > 0` set `status='done'`; return `{ sentCount, pendingCount, done }`.

- [ ] **Step 1: Failing tests** `tests/sales-campaigns-send.test.ts` (same fake-client approach as Task 3, plus `vi.mock("@/lib/data/sales-send")` with `requestSend` as a `vi.fn()` so each case controls the result). Write all of these fully:
  1. success: recipient reserved `pending -> sent` before `requestSend` is called (assert order via call log), result `ok:true`, `sent_count` recounted, link returned.
  2. **double tap:** first call reserves; a second call for the same recipient gets `already-handled`; `requestSend` was called exactly once.
  3. refusal `quiet_hours` (pause): recipient back to `pending` (`sent_at`/`sent_by` null), campaign `paused` with `paused_reason` from the message, result `{ ok:false, paused:true }`.
  4. refusal `daily_cap`: same as 3, and a later `setCampaignStatus(..., "active")` followed by a successful send clears `paused_reason` and sends the SAME recipient (no one lost, no one repeated).
  5. refusal `spacing` (retry): recipient back to `pending`, campaign status unchanged, `retryAt` passed through.
  6. refusal `do-not-contact` (contact became do-not-contact after creation) and `not-owner` (contact reassigned): recipient `blocked`, `recipientBlocked:true`, campaign not paused, no link.
  7. the last pending recipient sent -> campaign `done`, `done:true`; a further send call -> `campaign-done`.
  8. another agent's campaign id for send, skip and set-status -> `not-found`, no writes.
  9. `skipCampaignRecipient` marks `skipped`, never touches an already `sent` recipient (`already-handled`), and `done` flips when it was the last pending.
  10. `requestSend` is given the campaign's `number_id`, `message_template` and `followup_in_hours` (and `DEFAULT_FOLLOWUP_HOURS` when null).
  11. revert failure -> returns `db-error` (not a thrown error).
Extend `tests/sales-data-exports.test.ts` with `sendCampaignRecipient`, `skipCampaignRecipient`, `setCampaignStatus`. Add a source-scan guard in this file: `fnBody(src, "sendCampaignRecipient")` contains `.eq("status", "pending")` before `requestSend(` (use `indexOf` ordering), and contains `classifyRefusal(`.

- [ ] **Step 2:** Run it; expect FAIL (functions missing).

- [ ] **Step 3: Implement** the three functions and `refreshCounts` as specified above, in `src/lib/data/sales-campaigns.ts`.

- [ ] **Step 4:** Run `tests/sales-campaigns-send.test.ts tests/sales-campaigns-data.test.ts tests/sales-data-exports.test.ts` and `tsc`; PASS/clean. Run the full suite once.

- [ ] **Step 5: Commit**
```bash
git add src/lib/data/sales-campaigns.ts tests/sales-campaigns-send.test.ts tests/sales-data-exports.test.ts
git commit -m "feat(campaigns): send, skip and pause/resume through the existing send limits" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API routes and validation

**Files:**
- Create: `src/app/api/sales/campaigns/route.ts`, `src/app/api/sales/campaigns/audience/route.ts`, `src/app/api/sales/campaigns/[id]/route.ts`, `src/app/api/sales/campaigns/[id]/send/route.ts`, `src/app/api/sales/campaigns/[id]/skip/route.ts`
- Modify: `src/lib/validations/sales.ts`, `src/lib/api/sales-http.ts`, `tests/sales-routes.test.ts`
- Test: `tests/sales-campaigns-validations.test.ts`

**Interfaces:**
- Consumes: Task 3-4 data functions; `requireSalesAgent` (returns `{ user, role }`); `statusForReason` from `@/lib/api/sales-http`.
- Produces: `campaignCreateSchema`, `campaignRecipientSchema`, `campaignStatusSchema`; endpoints:
  - `GET /api/sales/campaigns/audience` -> `{ rows: AudienceRowJson[], truncated }`
  - `GET /api/sales/campaigns` -> `{ campaigns }`; `POST` body `{ name?, messageTemplate, contactIds, numberId, followupInHours }` -> `201 { campaignId, recipientCount, dropped, droppedText: string[] }`
  - `GET /api/sales/campaigns/[id]` -> `{ campaign }`; `PATCH` body `{ status: "active" | "paused" }` -> `{ status }`
  - `POST /api/sales/campaigns/[id]/send` body `{ recipientId }` -> `{ link, nextUnlockAt, warnings, budget, sentCount, pendingCount, done }` or an error JSON `{ error, reason, retryAt, paused, recipientBlocked, pendingCount }`
  - `POST /api/sales/campaigns/[id]/skip` body `{ recipientId }` -> `{ pendingCount, done }`

- [ ] **Step 1: Failing tests** `tests/sales-campaigns-validations.test.ts`:
```ts
import { campaignCreateSchema, campaignRecipientSchema, campaignStatusSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

const id = "11111111-1111-4111-8111-111111111111";
it("accepts a valid create body and defaults follow-up to 24 hours", () => {
  const r = campaignCreateSchema.parse({ messageTemplate: "Hi {{first_name}}", contactIds: [id], numberId: id });
  expect(r.followupInHours).toBe(24);
});
it("rejects bad follow-up hours, empty or oversize selections and blank messages", () => {
  const base = { messageTemplate: "Hi", contactIds: [id], numberId: id };
  expect(campaignCreateSchema.safeParse({ ...base, followupInHours: 5 }).success).toBe(false);
  expect(campaignCreateSchema.safeParse({ ...base, contactIds: [] }).success).toBe(false);
  expect(campaignCreateSchema.safeParse({ ...base, contactIds: Array(2001).fill(id) }).success).toBe(false);
  expect(campaignCreateSchema.safeParse({ ...base, messageTemplate: "  " }).success).toBe(false);
});
it("recipient and status bodies", () => {
  expect(campaignRecipientSchema.safeParse({ recipientId: id }).success).toBe(true);
  expect(campaignRecipientSchema.safeParse({ recipientId: "x" }).success).toBe(false);
  expect(campaignStatusSchema.safeParse({ status: "paused" }).success).toBe(true);
  expect(campaignStatusSchema.safeParse({ status: "done" }).success).toBe(false);
});
it("maps new reasons to HTTP statuses", () => {
  expect(statusForReason("already-handled")).toBe(409);
  expect(statusForReason("campaign-done")).toBe(409);
  expect(statusForReason("variety")).toBe(400);
  expect(statusForReason("empty-audience")).toBe(400);
  expect(statusForReason("too-many")).toBe(400);
  expect(statusForReason("not-found")).toBe(404);
});
```
In `tests/sales-routes.test.ts`, update the pinned sales route list/count for the five new route files (read how it pins them first; add the new paths in sorted position).

- [ ] **Step 2:** Run; FAIL.

- [ ] **Step 3: Implement.** In `validations/sales.ts` (it already imports `text`, `isFollowupHours`, `DEFAULT_FOLLOWUP_HOURS`, and `z`):
```ts
import { MAX_CAMPAIGN_RECIPIENTS } from "@/lib/crm/campaign-rules";

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  messageTemplate: text(1000),
  contactIds: z.array(z.string().uuid()).min(1).max(MAX_CAMPAIGN_RECIPIENTS),
  numberId: z.string().uuid(),
  followupInHours: z
    .number()
    .int()
    .refine((h) => isFollowupHours(h), "Pick 8 hours, 1 day, 2 days or 3 days.")
    .default(DEFAULT_FOLLOWUP_HOURS),
});
export const campaignRecipientSchema = z.object({ recipientId: z.string().uuid() });
export const campaignStatusSchema = z.object({ status: z.enum(["active", "paused"]) });
```
In `sales-http.ts` add `case "already-handled": case "campaign-done":` to the 409 group (do not change the 400 default). Routes follow `src/app/api/sales/contacts/[id]/send/route.ts` exactly: `requireSalesAgent()`, `schema.safeParse(await req.json().catch(() => null))` -> 400 `{ error: issue message }`, actor `{ id: auth.user.id, role: auth.role }`, `const { id } = await params;`. Error mapping in `POST /campaigns`: `variety` -> 400 with `error: VARIETY_MESSAGE`; `number-not-assigned` -> 403 "No WhatsApp number is assigned to you yet. Ask your admin."; `empty-audience` -> 400 "None of the selected people can be messaged."; `too-many` -> 400 "Pick 2000 people or fewer."; otherwise "Could not create this campaign." with `statusForReason`. The send route returns, on failure, `NextResponse.json({ error: result.message ?? "Could not send this message.", reason: result.reason, retryAt: result.retryAt ?? null, paused: result.paused ?? false, recipientBlocked: result.recipientBlocked ?? false, pendingCount: result.pendingCount ?? null }, { status: statusForReason(result.reason) })`; for a `recipientBlocked` result use status 200? No: return the same non-2xx status via `statusForReason` (the client reads the body). `GET /campaigns/[id]` returns `not-found` as 404 for another agent's id.

- [ ] **Step 4:** Run the new test, `tests/sales-routes.test.ts`, `tests/api-role-gates.test.ts`, `tsc`, then the full suite. PASS/clean.

- [ ] **Step 5: Commit**
```bash
git add src/app/api/sales/campaigns src/lib/validations/sales.ts src/lib/api/sales-http.ts tests/sales-campaigns-validations.test.ts tests/sales-routes.test.ts
git commit -m "feat(campaigns): campaign API routes and validation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

**Phase 1 checkpoint:** full suite and `tsc` clean; controller asks the user to apply migration 0066 (Task 1 step 6) before the browser check.

---

# PHASE 2 — Wizard

### Task 6: Navigation and My campaigns list

**Files:**
- Create: `src/app/dashboard/sales/campaigns/page.tsx`, `src/app/dashboard/sales/campaigns/loading.tsx`, `src/components/sales/CampaignsList.tsx`
- Modify: `src/components/dashboard/nav.ts`, `tests/dashboard-nav.test.ts`
- Test: `tests/sales-campaigns-list.test.tsx`

**Interfaces:**
- Consumes: `GET /api/sales/campaigns` (Task 5), `CampaignListItemJson` (Task 3), `requireSalesAgentPage`.
- Produces: nav item `{ label: "Campaigns", href: "/dashboard/sales/campaigns", icon: Megaphone, roles: ["sales_agent"] }` placed right after My Contacts; `CampaignsList` client component.

- [ ] **Step 1: Failing tests.**
  - `tests/dashboard-nav.test.ts`: update the sales_agent expectation to `["/dashboard/sales", "/dashboard/sales/contacts", "/dashboard/sales/campaigns", "/dashboard/sales/add-lead", "/dashboard/sales/help", "/dashboard/notifications", "/dashboard/settings"]` and the mobile bar labels to `["Today", "Contacts", "Campaigns", "Add lead"]`; assert Help is under More; assert `/dashboard/sales/campaigns/abc` highlights the Campaigns item (`activeHrefFor`). Other roles do not get the item.
  - `tests/sales-campaigns-list.test.tsx` (model on `tests/sales-today.test.tsx`: stub `fetch`, wrap in `ConfirmProvider`): shows a loading `role="status"`; renders each campaign with name, `"{sentCount} of {recipientCount} sent"`, a status chip text (`Active`, `Paused`, `Done`); a non-done campaign has a **Resume** link to `/dashboard/sales/campaigns/<id>` and a done one has **View**; a paused campaign shows its `pausedReason`; empty state "No campaigns yet." with a "New campaign" action linking to `/dashboard/sales/campaigns/new`; a "New campaign" button in the header always links to `/new`; a failed load shows an error line and a Retry button.

- [ ] **Step 2:** Run; FAIL.

- [ ] **Step 3: Implement.** `nav.ts`: add `Megaphone` is already imported there (used by admin Send Notice); insert the new item after the "My Contacts" line. `CampaignsList`: client component, fetches `/api/sales/campaigns` on mount (`cache: "no-store"`), uses `EmptyState` (from `@/components/ui/empty-state`, with `action={{ label: "New campaign", href: "/dashboard/sales/campaigns/new" }}`), cards in the style of `QueueCard` (rounded `bg-pz-surface-container-lowest`, `font-headline` names), a thin progress bar (`bg-pz-primary` on `bg-pz-surface-container-high`) from `sentCount/recipientCount`, the status chip, and a primary `Link` styled like the Today "Select" button. `page.tsx`: `await requireSalesAgentPage();` renders `<CampaignsList />` under an `<h1>` "Campaigns" with the line "Message your own contacts, one person at a time." `loading.tsx` reuses the sales `loading.tsx` skeleton pattern (`role="status"`).

- [ ] **Step 4:** Run `tests/dashboard-nav.test.ts tests/sales-campaigns-list.test.tsx tests/sales-shell.test.ts tests/sales-shell-components.test.tsx` and `tsc`; fix any test that pinned the old agent nav. Full suite once. PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/dashboard/nav.ts src/components/sales/CampaignsList.tsx src/app/dashboard/sales/campaigns/page.tsx src/app/dashboard/sales/campaigns/loading.tsx tests/dashboard-nav.test.ts tests/sales-campaigns-list.test.tsx
git commit -m "feat(campaigns): Campaigns nav item and My campaigns list" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wizard shell and step 1 (Who)

**Files:**
- Create: `src/components/sales/CampaignWizard.tsx`, `src/app/dashboard/sales/campaigns/new/page.tsx`
- Test: `tests/sales-campaign-wizard.test.tsx`

**Interfaces:**
- Consumes: `GET /api/sales/campaigns/audience`, `filterAudience`, `courseOptions`, `outcomeOptions`, `AudienceRowJson` (Task 3), `useSalesBudget` (`budgets`, `selected`), `splitTodayTomorrow` (Task 2), `MAX_CAMPAIGN_RECIPIENTS`.
- Produces: `CampaignWizard()` (no props) — a client component holding all wizard state: `step: 1 | 2 | 3`, `selected: Set<string>`, `filter: AudienceFilter`, `message: string`, `templateId: string`, `followupHours: FollowupHours`. Steps 2 and 3 are added in Task 8; this task renders a placeholder "Next" that moves to step 2 and ships step 1 fully.

- [ ] **Step 1: Failing tests** (`tests/sales-campaign-wizard.test.tsx`; wrap in `ConfirmProvider` and `SalesBudgetContext.Provider` like `tests/sales-today.test.tsx`; stub `fetch` for `/api/sales/campaigns/audience`, `/api/sales/templates`). Cases for step 1:
  - a stepper shows "1 Choose who", "2 Write message", "3 Check and send" with step 1 current (`aria-current="step"`);
  - loading is announced (`role="status"`); rows render with name and phone; a search box narrows rows; the course and outcome selects narrow rows (options come from the data);
  - checking rows updates "N selected"; **Select all N shown** selects every row matching the current filters (not rows hidden by filters); **Clear** empties;
  - the budget line reads "You can send {remaining} more today; the rest wait for tomorrow" computed from the selected number's `dailyCap - dailyUsed`, hidden when no budget is loaded; with no number shows "No WhatsApp number yet. Ask your admin to give you one before you can start.";
  - **Next** is disabled at 0 selected and when more than 2000 selected (message "Pick 2000 people or fewer."); enabled otherwise and moves to step 2 (`aria-current` moves);
  - an empty audience shows an empty state "You don't own any contacts yet. Ask your admin to assign a list, or add a lead." with links to `/dashboard/sales/add-lead`;
  - `truncated: true` shows a note "Showing your 3000 most recent contacts."

- [ ] **Step 2:** Run; FAIL.

- [ ] **Step 3: Implement.** `CampaignWizard` follows the Stitch "Campaign Wizard - Step 1: Choose Who" screens (desktop and mobile): a stepper header, a filter row (search input with `type="search"`, course select "All courses", outcome select "Anyone"), a count row, a list of selectable rows (checkbox + name + phone + small outcome chip) using `ResponsiveList`'s `selection` support as `ContactsPanel` does, and a sticky bottom action bar on phones (`fixed bottom-16` above the tab bar, `lg:static`) with the selected count and **Next**. Inputs and buttons get `max-md:min-h-11`; `pz-*` tokens only. Audience is fetched once (`useEffect`, `cache: "no-store"`); filtering is client-side via `filterAudience`. `page.tsx`: `await requireSalesAgentPage();` then `<CampaignWizard />` under an `<h1>` "New campaign" and a "Back to Campaigns" link.

- [ ] **Step 4:** Run the wizard test and `tsc`; PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/sales/CampaignWizard.tsx src/app/dashboard/sales/campaigns/new/page.tsx tests/sales-campaign-wizard.test.tsx
git commit -m "feat(campaigns): wizard shell and step 1 (choose who)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wizard steps 2 and 3, and starting a campaign

**Files:**
- Modify: `src/components/sales/CampaignWizard.tsx`
- Test: extend `tests/sales-campaign-wizard.test.tsx`

**Interfaces:**
- Consumes: `POST /api/sales/campaigns` (Task 5), `GET /api/sales/templates` (existing; returns `{ templates: { id, name, body }[] }`), `renderWhatsAppMessage`, `DEFAULT_MESSAGE`, `MAX_MESSAGE_LENGTH`, `TemplateJson` (`@/lib/crm/sales-ui`), `FOLLOWUP_CHOICES`, `DEFAULT_FOLLOWUP_HOURS`, `followupLabel`, `FollowupHours` (`@/lib/crm/followup`), `varietyBlocked`, `VARIETY_MESSAGE`, `splitTodayTomorrow`, `describeDropped`, `useRouter` from `next/navigation`, `useSalesBudget` (`selected`, `budgets`), `DEFAULT_SETTINGS` from `@/lib/crm/send-limits`.
- Produces: finished three-step wizard; on success navigates to `/dashboard/sales/campaigns/<campaignId>`.

- [ ] **Step 1: Failing tests** (extend the wizard test file; use `next/navigation` mock `useRouter: () => ({ push })`):
  - **Step 2:** the message box starts with `DEFAULT_MESSAGE`; the saved-message picker (`aria-label` "Saved message") lists templates and sets the box; tag chips "First name" and "Course"? (Only `{{first_name}}` and `{{full_name}}` are valid tags — render chips "First name" and "Full name" that insert `{{first_name}}` / `{{full_name}}` at the end of the box); the live preview ("What they will see") renders the first selected person's name via `renderWhatsAppMessage`; the calm note reads "Messages go out one at a time from your own WhatsApp, with pauses." and the file contains no "safe" or "guarantee" words; a name-less message with more than 3 selected disables Next and shows `VARIETY_MESSAGE`; a message over `MAX_MESSAGE_LENGTH` is blocked by `maxLength`; Back returns to step 1 keeping the selection.
  - **Step 3:** summary shows "{N} people", today/tomorrow counts from `splitTodayTomorrow(N, dailyCap - dailyUsed)`, the number label (`selected.number.label`) with a select when the agent has several numbers (calls `select(id)`), "Bring them back in" with the four `FOLLOWUP_CHOICES` (default pressed = 1 day, `aria-pressed`), a warm-up line "This number is warming up: {dailyCap} new chats a day." only when `dailyCap < DEFAULT_SETTINGS.daily_cap`, and a **Start sending** button.
  - **Start sending:** disabled with no number ("No WhatsApp number yet. Ask your admin to give you one before you can start."), while budgets are loading ("Checking your limits…"), and while pending; clicking POSTs `/api/sales/campaigns` with exactly `{ messageTemplate, contactIds: [...selected], numberId, followupInHours }`; on 201 it shows a toast for each `droppedText` line and pushes `/dashboard/sales/campaigns/<id>`; on 400 it shows the server `error` as a toast and stays on step 3; double click sends once.

- [ ] **Step 2:** Run; FAIL.

- [ ] **Step 3: Implement** steps 2 and 3 in `CampaignWizard` following the Stitch "Step 2: Write Message" and "Step 3: Check and Send" screens (desktop two-column with the preview on the right; mobile stacked with the sticky action bar). Use `useAsyncAction` for the POST (it guards double submit), `toast` from `sonner`, `disabled:opacity-100` on the Start button with a readable disabled style like `SendPanel`'s primary button. Do not add the word "safe" or "guarantee" anywhere in the copy.

- [ ] **Step 4:** Run the wizard test, `tests/sales-ui-guards.test.ts` (scans sales UI source for banned patterns), `tsc`, then the full suite once. PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/sales/CampaignWizard.tsx tests/sales-campaign-wizard.test.tsx
git commit -m "feat(campaigns): wizard steps 2 and 3 and starting a campaign" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

# PHASE 3 — Sending session and admin view

### Task 9: Sending session screen

**Files:**
- Create: `src/components/sales/CampaignSession.tsx`, `src/app/dashboard/sales/campaigns/[id]/page.tsx`, `src/app/dashboard/sales/campaigns/[id]/loading.tsx`
- Test: `tests/sales-campaign-session.test.tsx`

**Interfaces:**
- Consumes: `getMyCampaign` (server page), `CampaignDetailJson`, `CampaignRecipientJson` (Task 3); `POST /api/sales/campaigns/[id]/send`, `.../skip`, `PATCH /api/sales/campaigns/[id]`, `GET /api/sales/campaigns/[id]` (Task 5); `useSalesBudget` (`budgets`, `selected`, `select`, `refresh`, `applyBudget`), `sendLock`, `lockCopy`, `openWhatsAppLink`, `explainSendError`, `useNow`, `PanicButton`, `useMediaQuery`, `useAsyncAction`, `useConfirm`.
- Produces: `CampaignSession({ initial }: { initial: CampaignDetailJson })`.

- [ ] **Step 1: Failing tests** (`tests/sales-campaign-session.test.tsx`; mock `sonner`, stub `fetch`, wrap in `ConfirmProvider` and a `SalesBudgetContext.Provider` whose `selected` is the campaign's number; pass `openLink` as a prop `openLink?: (url: string) => void` defaulting to `openWhatsAppLink` so tests can assert it):
  - shows the campaign name, "{sent} of {total} sent", the current (first pending) contact's name and phone, and a large **Open WhatsApp** button (`min-h-14`);
  - **Open WhatsApp** POSTs `/api/sales/campaigns/<id>/send` with `{ recipientId: <current id> }`, calls `openLink(link)`, marks that person sent locally, advances to the next pending person, calls `applyBudget`, shows `warnings` as toasts;
  - while the lock is not ready (`sendLock` wait/quiet/daily-cap/frozen) the button is disabled and shows `lockCopy(...).button` with its `detail` line; a **no number** lock explains it;
  - response `recipientBlocked: true` -> that person is marked skipped locally with a toast `Skipped {name}: {explainSendError text}` and the next person shows; response `paused: true` -> the screen shows a "Paused" card with the reason and the retry time (`formatDateTime(retryAt)`) and a **Resume** button; **Resume** PATCHes `{ status: "active" }` then lets the person try again; response 409 `already-handled` -> refetches `GET /api/sales/campaigns/<id>` and re-renders from it;
  - **Skip** POSTs `/skip` with the current id and advances; **Pause** PATCHes `{ status: "paused" }` and shows the Resume state; the red panic button (existing `PanicButton`) is rendered;
  - done state: when no pending remain, shows "All done" with counts "Sent {n}, skipped {n}" and a **Back to Campaigns** link; a campaign that is already `done` on load shows the same;
  - the session selects the campaign's number on mount (`select(initial.numberId)`) when it is in `budgets`;
  - a countdown line updates via `useNow` ("Next message unlocks in 42s") using the existing lock copy;
  - the file contains no "safe"/"guarantee" claims.

- [ ] **Step 2:** Run; FAIL.

- [ ] **Step 3: Implement** following the Stitch "Campaign Sending Session - Live Dispatch" screens (desktop: current-contact card left, queue list right; mobile: stacked, big button reachable by thumb, queue collapsed under a "Show who is next" toggle). Hold `detail` in `useState(initial)`; derive `current = detail.recipients.find((r) => r.status === "pending")`, `sentCount`, `skippedCount`. Use `renderWhatsAppMessage(detail.messageTemplate, current.fullName)` for a preview of the message above the button. Use `useAsyncAction` for send/skip/pause so double taps are ignored. Desktop uses `target="_blank"` via the shared `openWhatsAppLink`. `page.tsx`: `const { user, role } = await requireSalesAgentPage(); const res = await getMyCampaign({ id: user.id, role }, id); if (!res.ok) notFound();` render `<CampaignSession initial={res.campaign} />`; `loading.tsx` with `role="status"`. The layout's `SalesBudgetProvider` already wraps it.

- [ ] **Step 4:** Run the session test, `tests/sales-ui-guards.test.ts`, `tsc`, full suite once. PASS.

- [ ] **Step 5: Commit**
```bash
git add src/components/sales/CampaignSession.tsx src/app/dashboard/sales/campaigns/[id] tests/sales-campaign-session.test.tsx
git commit -m "feat(campaigns): sending session screen" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Admin view of agent campaigns

**Files:**
- Modify: `src/lib/data/admin-crm-whatsapp.ts`, `src/components/admin/crm/WhatsAppPanel.tsx`, `src/components/admin/crm/WhatsAppBatchDetailClient.tsx`, the admin batch API routes that call `updateRecipientStatus` / `updateWhatsAppBatch` (find with Grep under `src/app/api/admin/crm/whatsapp`), and the admin sales-hub whatsapp pages if they construct the row types
- Test: `tests/admin-agent-campaigns.test.ts`

**Interfaces:**
- Consumes: new `whatsapp_batches` columns (Task 1).
- Produces:
  - `WhatsAppBatchListRow` gains `ownerAgentId: string | null; ownerAgentName: string | null; status: string`.
  - `WhatsAppRecipientRow.status` widens to `"pending" | "sent" | "skipped" | "blocked"`.
  - `getWhatsAppBatchDetail` returns the same new fields plus `pausedReason: string | null`.
  - `updateRecipientStatus` and `updateWhatsAppBatch` refuse agent campaigns with a new reason `"agent-campaign"` (admins view them read-only); the routes map it to 409 "This campaign belongs to a sales agent. You can watch its progress but not change it."

- [ ] **Step 1: Failing tests** (`tests/admin-agent-campaigns.test.ts`, fake-client approach as before):
  - `listWhatsAppBatches` returns `ownerAgentName` from the owner's profile for an agent campaign and `null` for an admin batch; admin batches' existing fields are unchanged (regression assertion on a batch row without the new columns set).
  - `updateRecipientStatus` on a recipient of a batch with `owner_agent_id` set -> `{ ok:false, reason:"agent-campaign" }` and no update issued; for an admin batch it still works exactly as before (reuse the existing success path assertion).
  - `updateWhatsAppBatch` on an agent campaign -> `agent-campaign` and no update/recipient changes.
  - Component tests (extend an existing admin whatsapp component test if one exists, else add to this file with Testing Library): `WhatsAppPanel` shows "by {agent name}" and a status chip for an agent campaign and neither for an admin batch; `WhatsAppBatchDetailClient` for an agent campaign shows the banner "Run by {agent}. You can watch progress here; sending happens in their workspace.", renders NO `whatsapp://` links and NO sent checkboxes or edit controls, and still shows the progress and the recipient list with statuses (`pending`, `sent`, `skipped`, `blocked` as words).

- [ ] **Step 2:** Run; FAIL.

- [ ] **Step 3: Implement.** In `listWhatsAppBatches` and `getWhatsAppBatchDetail` add `owner_agent_id, status, paused_reason` to the selects and resolve owner names with one `profiles` lookup (`select("id, full_name").in("id", ownerIds)`), skipping when there are none. In `updateRecipientStatus` fetch the batch's `owner_agent_id` first and return `agent-campaign` when set; same guard at the top of `updateWhatsAppBatch`. Update the routes' reason mapping. In the panel and detail client, branch on `ownerAgentId !== null`: show owner and status chip in the list; in the detail view hide the "current recipient" send card, the per-row WhatsApp links and checkboxes and the edit/re-apply controls, and show the banner. Admin batches render exactly as before. `pz-*` tokens only.

- [ ] **Step 4:** Run the new test, the existing whatsapp tests (`tests/crm-whatsapp-link.test.ts`, `tests/crm-whatsapp-reconcile.test.ts`, `tests/crm-conversion.test.ts`), `tsc`, and the full suite. PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/data/admin-crm-whatsapp.ts src/components/admin/crm/WhatsAppPanel.tsx src/components/admin/crm/WhatsAppBatchDetailClient.tsx src/app/api/admin/crm/whatsapp tests/admin-agent-campaigns.test.ts
git commit -m "feat(campaigns): admin sees agent campaigns read-only in WhatsApp Batches" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(`git add` only files you changed; check `git status` first.)

---

### Task 11: Browser click-through, cleanup and wrap-up

Controller task, not a subagent. Needs: migration 0066 applied (Task 1 step 6), dev server running.

- [ ] **Step 1:** Ask the user to start the dev server (or start it with `node node_modules/next/dist/bin/next dev` in the background). Confirm 0066 with the read-only check.
- [ ] **Step 2: Setup.** As admin (`pharmacozymeofficial@gmail.com`) assign a small cohort (PPC B3, 4 contacts) to the test agent through Sales Hub, Assign Lists. Check the agent has a WhatsApp number assigned (Sales Hub, WhatsApp Safety); if none, ask the user to assign one or create a "Test number" through the admin UI.
- [ ] **Step 3: Agent flow (Playwright, 1440 and 390 wide).** Log in as the test agent. Check: the Campaigns item shows in the sidebar and in the phone bar's third slot; New campaign, step 1 lists the 4 contacts, search and select all work, the budget line shows; step 2 preview uses the first name, a name-less message to 4 people blocks Next; step 3 shows the number, follow-up choices, Start sending; the session shows contact 1, Open WhatsApp issues a link (do not complete the send in WhatsApp; the opened tab can be closed) and the next person appears with a countdown; Skip, Pause, Resume work; the panic button is present (do not press it); leave and return via the Campaigns list Resume. Finish the campaign to see the done state. Verify in the DB (read-only) the recipient statuses and `sent_count`.
- [ ] **Step 4: Isolation.** As the agent, `fetch` `/api/sales/campaigns/<some other uuid>` -> 404. As admin, open Sales Hub, WhatsApp Batches: the campaign shows "by Test" with status; the detail view is read-only with no WhatsApp links.
- [ ] **Step 5: Clean up.** Release the 4 contacts back to unassigned (the agent's Hand back, or the assign API with `agentId: null` through the admin UI), delete the test campaign (admin delete on the batch), remove test `contact_activities` rows created in the last 3 hours by giving the user the SQL, and verify read-only that no contact is owned and no test batch remains.
- [ ] **Step 6:** Full suite and `tsc`; update the Sales Hub/Sales Workspace memory notes; final whole-branch review by a fresh reviewer on the most capable model; then give the user the compare URL and PR body (copy with `Set-Clipboard`). Do not push to `main`.

---

## Self-review notes

- Spec coverage: data and rules (Tasks 1-4), variety rule (Tasks 2-3, 8), reserve-before-send and resume without repeats (Task 4), visibility isolation (Tasks 3-5, 11), nav and list (Task 6), wizard steps 1-3 including budget line, templates picker, preview, number picker, follow-up choice, warm-up notice (Tasks 7-8), session including countdown, pause, skip, panic, blocked states and done summary (Task 9), admin read-only view (Task 10), browser check and cleanup (Task 11).
- Choice made in the plan: audience is loaded once and filtered in the browser (capped at 3000 contacts, `truncated` flag) instead of adding server-side filter endpoints; this keeps select-all and counts instant and avoids a second code path. Course filter uses `courseNameFromLabel` on each contact's product labels.
- Choice made: the session's send button uses `warm: false` in `sendLock`, so a daily-cap lock also blocks recipients who already have a two-way history, although the server would allow them. This is the conservative direction; the server remains the authority.
- Type names used across tasks: `CampaignStatus`, `CampaignRecipientStatus`, `DroppedCounts`, `AudienceRowJson`, `CampaignListItemJson`, `CampaignRecipientJson`, `CampaignDetailJson`, `AudienceFilter`, `SendCampaignResult`, `MAX_CAMPAIGN_RECIPIENTS`, `VARIETY_MESSAGE`, `classifyRefusal`, `pauseReasonText`, `sendCampaignRecipient`, `skipCampaignRecipient`, `setCampaignStatus`, `getMyCampaign`, `listMyCampaigns`, `createCampaign`, `loadCampaignAudience`.
