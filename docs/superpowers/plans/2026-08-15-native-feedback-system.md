# Native Feedback System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the GAS+Sheets feedback backend with a native Supabase/Next.js system — sessions, programs, question bank, responses, CSV export, share-token review pages, an admin CRUD dashboard, a mentor-scoped read-only view, and the subsystem-D mentorship tie-in — without touching or disturbing the old GAS system, which keeps serving every link already issued.

**Architecture:** Normalized Postgres schema behind a service-role data layer (`src/lib/data/feedback-*.ts`), consumed by route-handler-gated admin/mentor UI and by the **existing, already-built** public wizard (`FeedbackClient.tsx`) and review page (`ReviewClient.tsx`) — both stay unmodified, only their data source grows a native-first branch ahead of the existing GAS fallback. A new, separate Apps Script project proxies Drive uploads (video answers, cover images); the old Feedback System's GAS project is never edited.

**Tech Stack:** Next.js App Router, Supabase (Postgres + service-role client), Zod, Vitest, a new standalone Google Apps Script web app (Drive proxy only).

**Spec:** `docs/superpowers/specs/2026-08-15-native-feedback-system-design.md`

## Global Constraints

- Service-role data layer (`createAdminSupabase()`) + route-level auth gate (`requireAdmin()` / `requireMentor()`) is the default security boundary — no `SECURITY DEFINER` RPC is used anywhere in this plan.
- Every new table gets `alter table ... enable row level security;` with **zero** policies (matches `mentorship_bookings`/`sessions` convention for service-role-only tables — PostgREST denies all direct anon/authenticated access by default once RLS is enabled with no policies; every real read/write goes through a route handler using the admin client).
- `database.types.ts` is hand-edited — no codegen script exists in this repo.
- Migrations start at `0033` (last is `0032_mentorship_sessions_fixes.sql`).
- The old GAS Feedback System (`PZ Academy Feedback System/` directory, its Sheets, its deployment) is **never modified**. The new Drive-upload proxy is a brand-new, separate Apps Script project.
- `profiles` has **no `email` column** — a user's email comes from `supabase.auth.getUser().data.user.email`, never from a `profiles` query.
- Existing `PublicSession`, `ShareView`/`ShareSession`/`SharePerQuestion`/`ShareResponse` types (`src/lib/mentorship/gas.ts`) are the wire contract `FeedbackClient.tsx`/`ReviewClient.tsx` already consume — every native lookup function in this plan returns data in those exact shapes so neither client component needs a single line changed.
- Test files live under top-level `tests/`, one file per module, mirroring `tests/notes.test.ts`'s style (pure-function tests, no Supabase-client mocking — this repo doesn't mock the DB client in unit tests; DB-touching code is verified via live click-through instead).
- `tsc`, `vitest`, and `eslint` must stay clean after every task. No ad hoc curl/manual verification beyond that until the final live click-through (per prior feedback in this repo).

---

## File Structure

**Schema & types**
- `supabase/migrations/0033_feedback_system.sql` — new
- `src/lib/supabase/database.types.ts` — modified (Tables/Enums blocks)

**Pure logic**
- `src/lib/validations/feedback.ts` — new (sanitization, slug, star clamping, CSV cell quoting)

**Data layer** (service-role, one file per entity, mirrors `src/lib/data/mentorship-bookings.ts`)
- `src/lib/data/feedback-audit.ts` — new
- `src/lib/data/feedback-question-bank.ts` — new
- `src/lib/data/feedback-sessions.ts` — new
- `src/lib/data/feedback-programs.ts` — new
- `src/lib/data/feedback-responses.ts` — new
- `src/lib/data/feedback-share.ts` — new
- `src/lib/data/feedback-mentorship-sync.ts` — new

**Drive upload proxy**
- `gas/feedback-uploads/Code.gs` — new, standalone GAS project
- `src/lib/gas/feedback-upload-client.ts` — new

**Public flow (native-first + GAS fallback; existing client components untouched)**
- `src/app/feedback/[id]/page.tsx` — modified
- `src/app/api/feedback/route.ts` — modified
- `src/app/api/upload-video/route.ts` — modified
- `src/app/review/[token]/page.tsx` — modified

**Admin UI** (new)
- `src/app/api/admin/feedback/sessions/route.ts`, `.../[id]/route.ts`, `.../[id]/export/route.ts`, `.../[id]/cover/route.ts`, `.../[id]/share-token/route.ts`
- `src/app/api/admin/feedback/programs/route.ts`, `.../[id]/route.ts`
- `src/app/api/admin/feedback/question-bank/route.ts`
- `src/app/dashboard/admin/feedback/page.tsx`, `NewSessionModal.tsx`
- `src/app/dashboard/admin/feedback/[id]/page.tsx`, `SessionDetailClient.tsx`
- `src/app/dashboard/admin/feedback/question-bank/page.tsx`

**Mentor UI** (new)
- `src/app/api/mentor/feedback/sessions/route.ts`, `.../[id]/route.ts`
- `src/app/dashboard/mentor/feedback/page.tsx`
- `src/app/dashboard/mentor/feedback/[id]/page.tsx`

**Mentorship tie-in**
- `src/lib/data/mentorship-sessions.ts` — modified (`setSessionStatus`)

**Tests**
- `tests/feedback-validations.test.ts`
- `tests/feedback-aggregation.test.ts`

---

### Task 1: Schema migration + hand-edited types

**Files:**
- Create: `supabase/migrations/0033_feedback_system.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: tables `feedback_sessions`, `feedback_questions`, `feedback_question_bank`, `feedback_responses`, `feedback_answers`, `feedback_programs`, `feedback_audit_log`; enums `feedback_session_status` (`'active'|'closed'`), `feedback_question_type` (`'stars'|'video'`), `feedback_program_type` (`'workshop'|'course'`).

- [ ] **Step 1: Write the migration**

```sql
-- Migration 0033: Native feedback system
-- Sessions, programs, question bank, responses, answers, audit log.
-- Service-role-only tables: RLS enabled, no policies (see plan's Global
-- Constraints) — every read/write goes through an admin-client route handler.

create type public.feedback_session_status as enum ('active', 'closed');
create type public.feedback_question_type as enum ('stars', 'video');
create type public.feedback_program_type as enum ('workshop', 'course');

create table public.feedback_programs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         public.feedback_program_type not null,
  cover_url    text,
  share_token  text unique,
  created_at   timestamptz not null default now()
);

create table public.feedback_sessions (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  speaker_name           text not null,
  session_date           text,
  status                 public.feedback_session_status not null default 'active',
  slug                   text not null unique,
  program_id             uuid references public.feedback_programs(id) on delete set null,
  program_order          integer,
  cover_url              text,
  share_token            text unique,
  mentorship_session_id  uuid references public.sessions(id) on delete set null,
  mentor_id              uuid references public.mentors(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index feedback_sessions_program_id_idx on public.feedback_sessions(program_id);
create index feedback_sessions_mentorship_session_id_idx on public.feedback_sessions(mentorship_session_id);
create index feedback_sessions_mentor_id_idx on public.feedback_sessions(mentor_id);

create table public.feedback_questions (
  id                 uuid primary key default gen_random_uuid(),
  feedback_session_id uuid not null references public.feedback_sessions(id) on delete cascade,
  text               text not null,
  type               public.feedback_question_type not null default 'stars',
  question_order     integer not null
);
create index feedback_questions_session_id_idx on public.feedback_questions(feedback_session_id);

create table public.feedback_question_bank (
  id             uuid primary key default gen_random_uuid(),
  text           text not null,
  type           public.feedback_question_type not null default 'stars',
  default_order  integer not null,
  is_mentorship_default boolean not null default false
);

create table public.feedback_responses (
  id                     uuid primary key default gen_random_uuid(),
  feedback_session_id    uuid not null references public.feedback_sessions(id) on delete cascade,
  participant_name       text not null default '',
  participant_email      text,
  participant_profile_id uuid references public.profiles(id) on delete set null,
  comments               text not null default '',
  submitted_at           timestamptz not null default now()
);
create index feedback_responses_session_id_idx on public.feedback_responses(feedback_session_id);
create index feedback_responses_session_email_idx on public.feedback_responses(feedback_session_id, participant_email);

create table public.feedback_answers (
  id           uuid primary key default gen_random_uuid(),
  response_id  uuid not null references public.feedback_responses(id) on delete cascade,
  question_id  uuid not null references public.feedback_questions(id) on delete cascade,
  star_value   integer check (star_value >= 1 and star_value <= 5),
  video_url    text,
  constraint feedback_answers_one_value check (
    (star_value is not null and video_url is null) or
    (star_value is null and video_url is not null) or
    (star_value is null and video_url is null)
  )
);
create index feedback_answers_response_id_idx on public.feedback_answers(response_id);

create table public.feedback_audit_log (
  id               uuid primary key default gen_random_uuid(),
  action           text not null,
  detail           text not null default '',
  actor_profile_id uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

alter table public.feedback_programs      enable row level security;
alter table public.feedback_sessions      enable row level security;
alter table public.feedback_questions     enable row level security;
alter table public.feedback_question_bank enable row level security;
alter table public.feedback_responses     enable row level security;
alter table public.feedback_answers       enable row level security;
alter table public.feedback_audit_log     enable row level security;

-- Seed the default question bank (ports Config.gs's DEFAULT_QUESTIONS).
insert into public.feedback_question_bank (text, type, default_order, is_mentorship_default) values
  ('How would you rate this session overall?', 'stars', 1, true),
  ('How would you rate the speaker?', 'stars', 2, true),
  ('How relevant was the content to your work/studies?', 'stars', 3, true),
  ('How was the session organization/logistics (timing, platform, audio/video)?', 'stars', 4, false),
  ('Anything you''d like us to improve or add next time?', 'stars', 5, false);
```

- [ ] **Step 2: Apply the migration**

Run: `mcp__claude_ai_Supabase__apply_migration` (or the project's standard migration-apply flow) against project `whqdasotjlhvrjmgiffk`, name `feedback_system`, with the SQL above.
Expected: applies cleanly; `mcp__claude_ai_Supabase__list_tables` shows all seven new tables.

- [ ] **Step 3: Hand-edit `database.types.ts`**

Add `feedback_session_status`, `feedback_question_type`, `feedback_program_type` to the `Enums` block, and `feedback_programs`, `feedback_sessions`, `feedback_questions`, `feedback_question_bank`, `feedback_responses`, `feedback_answers`, `feedback_audit_log` to the `Tables` block, each with `Row`/`Insert`/`Update` shapes matching the columns above exactly (nullable columns get `| null` on `Row`, optional on `Insert`).

- [ ] **Step 4: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run advisors**

Run: `mcp__claude_ai_Supabase__get_advisors` (type `security`) against the project.
Expected: no new findings for the seven tables (RLS enabled, no public grants beyond Postgres defaults already covered by RLS).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0033_feedback_system.sql src/lib/supabase/database.types.ts
git commit -m "feat(feedback): add native feedback system schema"
```

---

### Task 2: Sanitization/validation pure module

**Files:**
- Create: `src/lib/validations/feedback.ts`
- Test: `tests/feedback-validations.test.ts`

**Interfaces:**
- Produces: `cleanText(s: string, maxLen: number): string`, `isValidEmail(s: string): boolean`, `clampStar(n: unknown): number | null`, `isHttpUrl(s: string): boolean`, `sanitizeAnswer(a: unknown): number | string`, `slugify(s: string): string`, `uniqueSlug(base: string, taken: { id: string; slug: string }[], exceptId: string | null): string`, `csvCell(v: unknown): string`, `MAX_NAME_LEN`, `MAX_EMAIL_LEN`, `MAX_COMMENTS_LEN`, `MAX_QUESTION_LEN` (all `= 120/200/2000/300` matching the old system's `Config.gs`).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  cleanText, isValidEmail, clampStar, sanitizeAnswer, slugify, uniqueSlug, csvCell,
} from "@/lib/validations/feedback";

describe("cleanText", () => {
  it("trims and caps length", () => {
    expect(cleanText("  hi  ", 10)).toBe("hi");
    expect(cleanText("a".repeat(20), 5)).toBe("aaaaa");
  });
  it("strips control characters but keeps newlines", () => {
    expect(cleanText("a\x00b\nc", 10)).toBe("ab\nc");
  });
});

describe("isValidEmail", () => {
  it("accepts a plausible email", () => expect(isValidEmail("a@b.com")).toBe(true));
  it("rejects a string with no @", () => expect(isValidEmail("nope")).toBe(false));
  it("rejects an over-length email", () => expect(isValidEmail("a@" + "b".repeat(300) + ".com")).toBe(false));
});

describe("clampStar", () => {
  it("accepts 1..5", () => expect(clampStar("3")).toBe(3));
  it("rejects 0 and 6", () => {
    expect(clampStar(0)).toBeNull();
    expect(clampStar(6)).toBeNull();
  });
  it("rejects non-numeric", () => expect(clampStar("abc")).toBeNull());
});

describe("sanitizeAnswer", () => {
  it("keeps an http url as-is (capped)", () => expect(sanitizeAnswer("https://x.com/v")).toBe("https://x.com/v"));
  it("converts a valid star string to a number", () => expect(sanitizeAnswer("4")).toBe(4));
  it("returns empty string for garbage", () => expect(sanitizeAnswer("banana")).toBe(""));
});

describe("slugify / uniqueSlug", () => {
  it("lowercases and hyphenates", () => expect(slugify("AMS Batch 1: Day 2!")).toBe("ams-batch-1-day-2"));
  it("falls back to base when free", () => expect(uniqueSlug("Day 1", [], null)).toBe("day-1"));
  it("appends -2 on collision", () => {
    expect(uniqueSlug("Day 1", [{ id: "x", slug: "day-1" }], null)).toBe("day-1-2");
  });
  it("ignores the row's own id when renaming", () => {
    expect(uniqueSlug("Day 1", [{ id: "self", slug: "day-1" }], "self")).toBe("day-1");
  });
});

describe("csvCell", () => {
  it("quotes a value containing a comma", () => expect(csvCell("a,b")).toBe('"a,b"'));
  it("escapes embedded quotes", () => expect(csvCell('say "hi"')).toBe('"say ""hi"""'));
  it("leaves a plain value unquoted", () => expect(csvCell("plain")).toBe("plain"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest run tests/feedback-validations.test.ts`
Expected: FAIL — `src/lib/validations/feedback.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

```typescript
export const MAX_NAME_LEN = 120;
export const MAX_EMAIL_LEN = 200;
export const MAX_COMMENTS_LEN = 2000;
export const MAX_QUESTION_LEN = 300;

/** Trim, strip control chars (keep tab/newline/CR), and cap length. */
export function cleanText(s: string, maxLen: number = MAX_COMMENTS_LEN): string {
  let out = String(s ?? "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  if (out.length > maxLen) out = out.slice(0, maxLen);
  return out;
}

export function isValidEmail(s: string): boolean {
  const v = String(s ?? "").trim();
  if (!v || v.length > MAX_EMAIL_LEN) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Coerce to an integer star 1..5, or null if out of range/non-numeric. */
export function clampStar(n: unknown): number | null {
  const v = Number(n);
  if (!isFinite(v)) return null;
  const rounded = Math.round(v);
  return rounded >= 1 && rounded <= 5 ? rounded : null;
}

export function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(String(s ?? "").trim());
}

const MAX_ANSWER_URL_LEN = 500;

/** Stars become a 1..5 number; video answers stay a capped http(s) URL; anything else is "". */
export function sanitizeAnswer(a: unknown): number | string {
  const s = String(a ?? "").trim();
  if (isHttpUrl(s)) return s.slice(0, MAX_ANSWER_URL_LEN);
  const star = clampStar(s);
  return star ?? "";
}

export function slugify(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function uniqueSlug(
  base: string,
  taken: { id: string; slug: string }[],
  exceptId: string | null,
): string {
  const root = slugify(base) || "session";
  const used = new Set(
    taken.filter((t) => t.id !== exceptId).map((t) => t.slug.trim().toLowerCase()).filter(Boolean),
  );
  if (!used.has(root)) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run tests/feedback-validations.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/feedback.ts tests/feedback-validations.test.ts
git commit -m "feat(feedback): add sanitization and slug utilities"
```

---

### Task 3: Aggregation pure module

**Files:**
- Create: add to `src/lib/validations/feedback.ts` (same file — this is more pure logic, not a new concern boundary)
- Test: `tests/feedback-aggregation.test.ts`

**Interfaces:**
- Consumes: nothing beyond plain data.
- Produces: `average(values: number[]): number | null` (rounds to 1 decimal, matches the old system's `Math.round(x * 10) / 10`), `withinRateLimit(recentCount: number, max: number): boolean`, `isDuplicateSubmission(lastSubmittedAt: string | null, windowMs: number, now?: number): boolean`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { average, withinRateLimit, isDuplicateSubmission } from "@/lib/validations/feedback";

describe("average", () => {
  it("returns null for an empty array", () => expect(average([])).toBeNull());
  it("rounds to one decimal", () => expect(average([4, 5, 5])).toBe(4.7));
  it("handles a single value", () => expect(average([3])).toBe(3));
});

describe("withinRateLimit", () => {
  it("allows under the max", () => expect(withinRateLimit(2, 3)).toBe(true));
  it("blocks at the max", () => expect(withinRateLimit(3, 3)).toBe(false));
});

describe("isDuplicateSubmission", () => {
  it("is false when there is no prior submission", () => {
    expect(isDuplicateSubmission(null, 300_000, Date.now())).toBe(false);
  });
  it("is true inside the window", () => {
    const now = Date.now();
    expect(isDuplicateSubmission(new Date(now - 60_000).toISOString(), 300_000, now)).toBe(true);
  });
  it("is false outside the window", () => {
    const now = Date.now();
    expect(isDuplicateSubmission(new Date(now - 600_000).toISOString(), 300_000, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node_modules/.bin/vitest run tests/feedback-aggregation.test.ts`
Expected: FAIL — functions don't exist yet.

- [ ] **Step 3: Implement (append to `src/lib/validations/feedback.ts`)**

```typescript
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

export function withinRateLimit(recentCount: number, max: number): boolean {
  return recentCount < max;
}

export function isDuplicateSubmission(
  lastSubmittedAt: string | null,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  if (!lastSubmittedAt) return false;
  return now - new Date(lastSubmittedAt).getTime() < windowMs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node_modules/.bin/vitest run tests/feedback-aggregation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/feedback.ts tests/feedback-aggregation.test.ts
git commit -m "feat(feedback): add aggregation and rate-limit helpers"
```

---

### Task 4: Audit log + question bank data layer

**Files:**
- Create: `src/lib/data/feedback-audit.ts`
- Create: `src/lib/data/feedback-question-bank.ts`

**Interfaces:**
- Consumes: `createAdminSupabase` from `@/lib/supabase/admin`.
- Produces: `logFeedbackAudit(params: { action: string; detail: string; actorProfileId: string | null }): Promise<void>`; `QuestionBankEntry { id: string; text: string; type: "stars" | "video"; order: number; isMentorshipDefault: boolean }`, `getQuestionBank(): Promise<QuestionBankEntry[]>`, `getMentorshipDefaultQuestions(): Promise<QuestionBankEntry[]>`, `saveQuestionBank(entries: { text: string; type: "stars" | "video"; order: number; isMentorshipDefault: boolean }[]): Promise<void>`.

- [ ] **Step 1: Implement the audit helper**

```typescript
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Best-effort: never throws into the caller — an audit-log failure must never block a real mutation. */
export async function logFeedbackAudit(params: {
  action: string;
  detail: string;
  actorProfileId: string | null;
}): Promise<void> {
  try {
    const admin = createAdminSupabase();
    await admin.from("feedback_audit_log").insert({
      action: params.action,
      detail: params.detail,
      actor_profile_id: params.actorProfileId,
    });
  } catch (error) {
    console.error("[feedback-audit] failed to log:", error);
  }
}
```

- [ ] **Step 2: Implement the question bank data layer**

```typescript
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";
import { cleanText, MAX_QUESTION_LEN } from "@/lib/validations/feedback";

export type FeedbackQuestionType = Database["public"]["Enums"]["feedback_question_type"];

export interface QuestionBankEntry {
  id: string;
  text: string;
  type: FeedbackQuestionType;
  order: number;
  isMentorshipDefault: boolean;
}

function toEntry(row: {
  id: string;
  text: string;
  type: FeedbackQuestionType;
  default_order: number;
  is_mentorship_default: boolean;
}): QuestionBankEntry {
  return { id: row.id, text: row.text, type: row.type, order: row.default_order, isMentorshipDefault: row.is_mentorship_default };
}

export async function getQuestionBank(): Promise<QuestionBankEntry[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_question_bank")
    .select("id, text, type, default_order, is_mentorship_default")
    .order("default_order", { ascending: true });
  return (data ?? []).map(toEntry);
}

/** The default question set cloned onto a 1:1 mentorship session's auto-created feedback_sessions row. */
export async function getMentorshipDefaultQuestions(): Promise<QuestionBankEntry[]> {
  const all = await getQuestionBank();
  return all.filter((q) => q.isMentorshipDefault);
}

/** Full-replace: clears the bank and re-inserts. Matches the old system's saveQuestionBank semantics. */
export async function saveQuestionBank(
  entries: { text: string; type: FeedbackQuestionType; order: number; isMentorshipDefault: boolean }[],
  actorProfileId: string,
): Promise<void> {
  const admin = createAdminSupabase();
  const clean = entries
    .map((e) => ({
      text: cleanText(e.text, MAX_QUESTION_LEN),
      type: e.type,
      default_order: e.order,
      is_mentorship_default: e.isMentorshipDefault,
    }))
    .filter((e) => e.text.length > 0);

  await admin.from("feedback_question_bank").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (clean.length > 0) {
    await admin.from("feedback_question_bank").insert(clean);
  }
  await logFeedbackAudit({ action: "saveQuestionBank", detail: `${clean.length} questions`, actorProfileId });
}
```

- [ ] **Step 3: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/feedback-audit.ts src/lib/data/feedback-question-bank.ts
git commit -m "feat(feedback): add audit log and question bank data layer"
```

---

### Task 5: Sessions data layer

**Files:**
- Create: `src/lib/data/feedback-sessions.ts`

**Interfaces:**
- Consumes: `createAdminSupabase`, `logFeedbackAudit`, `uniqueSlug`/`cleanText`/`MAX_NAME_LEN` from Task 2/4, `QuestionBankEntry`/`getQuestionBank` from Task 4, `PublicSession`/`Question` types from `@/lib/mentorship/gas` (matched exactly, not re-declared).
- Produces: `FeedbackSessionRow { id, name, speakerName, sessionDate, status, slug, programId, programOrder, coverUrl, shareToken, mentorshipSessionId, mentorId, questions: {id,text,type,order}[], responseCount, avgRating }`, `listFeedbackSessions(): Promise<FeedbackSessionRow[]>`, `getFeedbackSessionBySlug(slugOrId: string): Promise<FeedbackSessionRow | null>`, `getNativePublicSession(slugOrId: string): Promise<PublicSession | null>` (the function Task 11's page swaps in ahead of GAS), `createFeedbackSession(input): Promise<{ id: string; slug: string }>`, `updateFeedbackSession(id, input): Promise<void>`, `setFeedbackSessionStatus(id, status): Promise<void>`, `deleteFeedbackSession(id): Promise<void>`, `setFeedbackSessionCover(id, coverUrl): Promise<void>`.

- [ ] **Step 1: Implement**

```typescript
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";
import { cleanText, MAX_NAME_LEN, uniqueSlug } from "@/lib/validations/feedback";
import { average } from "@/lib/validations/feedback";
import type { PublicSession } from "@/lib/mentorship/gas";

export type FeedbackSessionStatus = Database["public"]["Enums"]["feedback_session_status"];
export type FeedbackQuestionType = Database["public"]["Enums"]["feedback_question_type"];

export interface FeedbackSessionQuestion {
  id: string;
  text: string;
  type: FeedbackQuestionType;
  order: number;
}

export interface FeedbackSessionRow {
  id: string;
  name: string;
  speakerName: string;
  sessionDate: string | null;
  status: FeedbackSessionStatus;
  slug: string;
  programId: string | null;
  programOrder: number | null;
  coverUrl: string | null;
  shareToken: string | null;
  mentorshipSessionId: string | null;
  mentorId: string | null;
  questions: FeedbackSessionQuestion[];
  responseCount: number;
  avgRating: number | null;
}

const SESSION_SELECT =
  "id, name, speaker_name, session_date, status, slug, program_id, program_order, cover_url, share_token, mentorship_session_id, mentor_id, feedback_questions(id, text, type, question_order)";

async function hydrateStats(admin: ReturnType<typeof createAdminSupabase>, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, { count: number; avg: number | null }>();
  const { data: responses } = await admin
    .from("feedback_responses")
    .select("id, feedback_session_id")
    .in("feedback_session_id", sessionIds);
  const { data: answers } = await admin
    .from("feedback_answers")
    .select("star_value, response_id, feedback_responses!inner(feedback_session_id)")
    .in("feedback_responses.feedback_session_id", sessionIds)
    .not("star_value", "is", null);

  const countBySession = new Map<string, number>();
  for (const r of responses ?? []) {
    countBySession.set(r.feedback_session_id, (countBySession.get(r.feedback_session_id) ?? 0) + 1);
  }
  const starsBySession = new Map<string, number[]>();
  for (const a of answers ?? []) {
    const sid = (a.feedback_responses as unknown as { feedback_session_id: string }).feedback_session_id;
    const list = starsBySession.get(sid) ?? [];
    list.push(a.star_value as number);
    starsBySession.set(sid, list);
  }

  const result = new Map<string, { count: number; avg: number | null }>();
  for (const id of sessionIds) {
    result.set(id, { count: countBySession.get(id) ?? 0, avg: average(starsBySession.get(id) ?? []) });
  }
  return result;
}

function toRow(
  s: {
    id: string; name: string; speaker_name: string; session_date: string | null; status: FeedbackSessionStatus;
    slug: string; program_id: string | null; program_order: number | null; cover_url: string | null;
    share_token: string | null; mentorship_session_id: string | null; mentor_id: string | null;
    feedback_questions: { id: string; text: string; type: FeedbackQuestionType; question_order: number }[] | null;
  },
  stats: { count: number; avg: number | null },
): FeedbackSessionRow {
  return {
    id: s.id,
    name: s.name,
    speakerName: s.speaker_name,
    sessionDate: s.session_date,
    status: s.status,
    slug: s.slug,
    programId: s.program_id,
    programOrder: s.program_order,
    coverUrl: s.cover_url,
    shareToken: s.share_token,
    mentorshipSessionId: s.mentorship_session_id,
    mentorId: s.mentor_id,
    questions: (s.feedback_questions ?? [])
      .map((q) => ({ id: q.id, text: q.text, type: q.type, order: q.question_order }))
      .sort((a, b) => a.order - b.order),
    responseCount: stats.count,
    avgRating: stats.avg,
  };
}

export async function listFeedbackSessions(): Promise<FeedbackSessionRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("feedback_sessions").select(SESSION_SELECT).order("created_at", { ascending: false });
  const rows = data ?? [];
  const stats = await hydrateStats(admin, rows.map((r) => r.id));
  return rows.map((r) => toRow(r, stats.get(r.id) ?? { count: 0, avg: null }));
}

/** Resolves either the raw id or the custom slug — mirrors the old getSessionById_'s dual lookup. */
export async function getFeedbackSessionBySlug(slugOrId: string): Promise<FeedbackSessionRow | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_sessions")
    .select(SESSION_SELECT)
    .or(`slug.eq.${slugOrId},id.eq.${slugOrId}`)
    .maybeSingle();
  if (!data) return null;
  const stats = await hydrateStats(admin, [data.id]);
  return toRow(data, stats.get(data.id) ?? { count: 0, avg: null });
}

/** Shapes a native row into the exact PublicSession contract FeedbackClient.tsx already consumes. */
export async function getNativePublicSession(slugOrId: string): Promise<PublicSession | null> {
  const row = await getFeedbackSessionBySlug(slugOrId);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    speaker: row.speakerName,
    date: row.sessionDate ?? "",
    status: row.status === "closed" ? "Closed" : "Active",
    questions: row.questions.map((q) => ({ text: q.text, type: q.type })),
    coverUrl: row.coverUrl ?? undefined,
  };
}

export interface CreateFeedbackSessionInput {
  name: string;
  speakerName: string;
  sessionDate?: string | null;
  questions: { text: string; type: FeedbackQuestionType }[];
  programId?: string | null;
  programOrder?: number | null;
  mentorshipSessionId?: string | null;
  mentorId?: string | null;
}

export async function createFeedbackSession(
  input: CreateFeedbackSessionInput,
  actorProfileId: string | null,
): Promise<{ id: string; slug: string }> {
  const admin = createAdminSupabase();
  const name = cleanText(input.name, MAX_NAME_LEN);
  const speakerName = cleanText(input.speakerName, MAX_NAME_LEN);
  if (!name) throw new Error("Session name is required.");
  if (!speakerName) throw new Error("Speaker name is required.");
  const questions = input.questions.slice(0, 5);
  if (questions.length < 3) throw new Error("Pick at least 3 questions.");

  const { data: existing } = await admin.from("feedback_sessions").select("id, slug");
  const slug = uniqueSlug(name, existing ?? [], null);

  const { data: session, error } = await admin
    .from("feedback_sessions")
    .insert({
      name,
      speaker_name: speakerName,
      session_date: input.sessionDate ?? null,
      slug,
      program_id: input.programId ?? null,
      program_order: input.programOrder ?? null,
      mentorship_session_id: input.mentorshipSessionId ?? null,
      mentor_id: input.mentorId ?? null,
    })
    .select("id")
    .single();
  if (error || !session) throw new Error(error?.message ?? "Could not create session.");

  await admin.from("feedback_questions").insert(
    questions.map((q, i) => ({
      feedback_session_id: session.id,
      text: cleanText(q.text, 300),
      type: q.type,
      question_order: i + 1,
    })),
  );

  await logFeedbackAudit({ action: "createFeedbackSession", detail: `${session.id} · ${name}`, actorProfileId });
  return { id: session.id, slug };
}

export async function setFeedbackSessionStatus(
  id: string,
  status: FeedbackSessionStatus,
  actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_sessions").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "setFeedbackSessionStatus", detail: `${id} -> ${status}`, actorProfileId });
}

export async function setFeedbackSessionCover(id: string, coverUrl: string | null, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_sessions").update({ cover_url: coverUrl }).eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: coverUrl ? "setCoverImage" : "removeCoverImage", detail: id, actorProfileId });
}

export async function deleteFeedbackSession(id: string, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "deleteFeedbackSession", detail: id, actorProfileId });
}
```

- [ ] **Step 2: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors. `.or()` filter string interpolation is safe here because both operands are UUIDs/slugs already validated upstream by route handlers (Task 15) — flag in review if a call site ever passes unvalidated user input directly.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/feedback-sessions.ts
git commit -m "feat(feedback): add feedback sessions data layer"
```

---

### Task 6: Programs data layer

**Files:**
- Create: `src/lib/data/feedback-programs.ts`

**Interfaces:**
- Consumes: `createFeedbackSession` from Task 5, `logFeedbackAudit`, `cleanText`/`uniqueSlug` from Task 2.
- Produces: `FeedbackProgramRow { id, name, type, coverUrl, shareToken, sessionCount }`, `listFeedbackPrograms(): Promise<FeedbackProgramRow[]>`, `createFeedbackProgram(input): Promise<{ id: string; sessions: { id: string; slug: string }[] }>`, `deleteFeedbackProgram(id): Promise<void>`.

- [ ] **Step 1: Implement**

```typescript
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";
import { cleanText, MAX_NAME_LEN } from "@/lib/validations/feedback";
import { createFeedbackSession, type FeedbackQuestionType } from "@/lib/data/feedback-sessions";

export type FeedbackProgramType = Database["public"]["Enums"]["feedback_program_type"];

export interface FeedbackProgramRow {
  id: string;
  name: string;
  type: FeedbackProgramType;
  coverUrl: string | null;
  sessionCount: number;
}

export async function listFeedbackPrograms(): Promise<FeedbackProgramRow[]> {
  const admin = createAdminSupabase();
  const { data: programs } = await admin
    .from("feedback_programs")
    .select("id, name, type, cover_url")
    .order("created_at", { ascending: false });
  const { data: sessions } = await admin.from("feedback_sessions").select("program_id");
  const countByProgram = new Map<string, number>();
  for (const s of sessions ?? []) {
    if (s.program_id) countByProgram.set(s.program_id, (countByProgram.get(s.program_id) ?? 0) + 1);
  }
  return (programs ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    coverUrl: p.cover_url,
    sessionCount: countByProgram.get(p.id) ?? 0,
  }));
}

const PROGRAM_COURSE_MIN = 5;

export interface CreateFeedbackProgramInput {
  name: string;
  type?: FeedbackProgramType;
  questions: { text: string; type: FeedbackQuestionType }[];
  sessions: { title: string; speaker: string; date?: string | null }[];
}

/** Creates the program row, then its member sessions via createFeedbackSession — same question set, sequential program_order. */
export async function createFeedbackProgram(
  input: CreateFeedbackProgramInput,
  actorProfileId: string | null,
): Promise<{ id: string; sessions: { id: string; slug: string }[] }> {
  const admin = createAdminSupabase();
  const name = cleanText(input.name, MAX_NAME_LEN);
  if (!name) throw new Error("Program name is required.");
  const sessions = input.sessions.filter((s) => cleanText(s.title, MAX_NAME_LEN).length > 0);
  if (sessions.length < 2) throw new Error("A program needs at least 2 sessions.");

  const type: FeedbackProgramType = input.type ?? (sessions.length >= PROGRAM_COURSE_MIN ? "course" : "workshop");

  const { data: program, error } = await admin
    .from("feedback_programs")
    .insert({ name, type })
    .select("id")
    .single();
  if (error || !program) throw new Error(error?.message ?? "Could not create program.");

  const created: { id: string; slug: string }[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const result = await createFeedbackSession(
      {
        name: `${name} — ${s.title}`,
        speakerName: s.speaker,
        sessionDate: s.date ?? null,
        questions: input.questions,
        programId: program.id,
        programOrder: i + 1,
      },
      actorProfileId,
    );
    created.push(result);
  }

  await logFeedbackAudit({ action: "createFeedbackProgram", detail: `${program.id} · ${name} · ${sessions.length} sessions`, actorProfileId });
  return { id: program.id, sessions: created };
}

/** Deletes the program row; member sessions cascade-delete via feedback_sessions.program_id ON DELETE SET NULL — sessions survive as standalone, matching "deleting a booking never destroys history" convention. Explicit delete-with-sessions is a future admin action, not this task's scope. */
export async function deleteFeedbackProgram(id: string, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_programs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "deleteFeedbackProgram", detail: id, actorProfileId });
}
```

- [ ] **Step 2: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/feedback-programs.ts
git commit -m "feat(feedback): add feedback programs data layer"
```

---

### Task 7: Response submission (public write path)

**Files:**
- Create: `src/lib/data/feedback-responses.ts`

**Interfaces:**
- Consumes: `getFeedbackSessionBySlug` (Task 5), `cleanText`/`isValidEmail`/`sanitizeAnswer`/`withinRateLimit`/`isDuplicateSubmission` (Task 2/3).
- Produces: `SubmitFeedbackInput { sessionId: string; name: string; email: string; website: string; comments: string; answers: { question: string; answer: string | number }[]; participantProfileId: string | null }`, `SubmitFeedbackResult = { ok: true } | { ok: false; message: string }`, `submitFeedbackResponse(input): Promise<SubmitFeedbackResult>`.

- [ ] **Step 1: Implement**

```typescript
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFeedbackSessionBySlug } from "@/lib/data/feedback-sessions";
import {
  cleanText, isValidEmail, sanitizeAnswer, isHttpUrl,
  MAX_NAME_LEN, MAX_EMAIL_LEN, MAX_COMMENTS_LEN,
  withinRateLimit, isDuplicateSubmission,
} from "@/lib/validations/feedback";

const RATE_MAX_SUBMITS = 3;
const RATE_WINDOW_MS = 60_000;
const DUPLICATE_WINDOW_MS = 5 * 60_000;

export interface SubmitFeedbackInput {
  sessionId: string;
  name: string;
  email: string;
  website: string; // honeypot
  comments: string;
  answers: { question: string; answer: string | number }[];
  participantProfileId: string | null;
}

export type SubmitFeedbackResult = { ok: true } | { ok: false; message: string };

export async function submitFeedbackResponse(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
  if (input.website) return { ok: true }; // honeypot — silently drop bots

  const session = await getFeedbackSessionBySlug(input.sessionId);
  if (!session) return { ok: false, message: "This feedback link is not valid." };
  if (session.status === "closed") return { ok: false, message: "This session is closed for feedback." };

  const name = cleanText(input.name, MAX_NAME_LEN);
  const email = cleanText(input.email, MAX_EMAIL_LEN);
  const comments = cleanText(input.comments, MAX_COMMENTS_LEN);
  if (email && !isValidEmail(email)) return { ok: false, message: "Please enter a valid email address." };

  const cleanAnswers = input.answers.slice(0, 5).map((a) => ({
    question: cleanText(a.question, 300),
    answer: sanitizeAnswer(a.answer),
  }));
  if (!cleanAnswers.some((a) => a.answer !== "")) return { ok: false, message: "Please rate at least one question." };

  const admin = createAdminSupabase();

  if (email) {
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await admin
      .from("feedback_responses")
      .select("id", { count: "exact", head: true })
      .eq("feedback_session_id", session.id)
      .eq("participant_email", email)
      .gte("submitted_at", since);
    if (!withinRateLimit(count ?? 0, RATE_MAX_SUBMITS)) {
      return { ok: false, message: "Too many submissions. Please wait a moment and try again." };
    }

    const { data: last } = await admin
      .from("feedback_responses")
      .select("submitted_at")
      .eq("feedback_session_id", session.id)
      .eq("participant_email", email)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isDuplicateSubmission(last?.submitted_at ?? null, DUPLICATE_WINDOW_MS)) {
      return { ok: false, message: "Looks like this feedback was already submitted. Thank you!" };
    }
  }

  const { data: response, error } = await admin
    .from("feedback_responses")
    .insert({
      feedback_session_id: session.id,
      participant_name: name,
      participant_email: email || null,
      participant_profile_id: input.participantProfileId,
      comments,
    })
    .select("id")
    .single();
  if (error || !response) return { ok: false, message: "Could not submit feedback. Please try again." };

  const answerRows = session.questions
    .map((q, i) => {
      const a = cleanAnswers[i];
      if (!a || a.answer === "") return null;
      const isVideo = typeof a.answer === "string" && isHttpUrl(a.answer);
      return {
        response_id: response.id,
        question_id: q.id,
        star_value: isVideo ? null : (a.answer as number),
        video_url: isVideo ? (a.answer as string) : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (answerRows.length > 0) {
    await admin.from("feedback_answers").insert(answerRows);
  }

  return { ok: true };
}
```

- [ ] **Step 2: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/feedback-responses.ts
git commit -m "feat(feedback): add public feedback submission path"
```

---

### Task 8: Response detail, CSV export, delete-response

**Files:**
- Modify: `src/lib/data/feedback-responses.ts` (append)

**Interfaces:**
- Consumes: `average` (Task 3), `csvCell` (Task 2), `getFeedbackSessionBySlug` (Task 5).
- Produces: `PerQuestionStat { question: string; type: "stars"|"video"; avg: number | null; count: number }`, `ResponseDetail { id: string; submittedAt: string; name: string; email: string; stars: number[]; videos: string[]; comments: string }`, `getFeedbackSessionDetail(id): Promise<{ session: FeedbackSessionRow; perQuestion: PerQuestionStat[]; responses: ResponseDetail[] } | null>`, `deleteFeedbackResponse(responseId, sessionId, actorProfileId): Promise<void>`, `exportFeedbackSessionCsv(id): Promise<{ filename: string; csv: string } | null>`.

- [ ] **Step 1: Implement (append to `src/lib/data/feedback-responses.ts`)**

```typescript
import { getFeedbackSessionBySlug, type FeedbackSessionRow } from "@/lib/data/feedback-sessions";
import { average, csvCell } from "@/lib/validations/feedback";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";

export interface PerQuestionStat {
  question: string;
  type: "stars" | "video";
  avg: number | null;
  count: number;
}

export interface ResponseDetail {
  id: string;
  submittedAt: string;
  name: string;
  email: string;
  stars: number[];
  videos: string[];
  comments: string;
}

interface RawAnswer {
  question_id: string;
  star_value: number | null;
  video_url: string | null;
}
interface RawResponse {
  id: string;
  submitted_at: string;
  participant_name: string;
  participant_email: string | null;
  comments: string;
  feedback_answers: RawAnswer[];
}

async function loadResponses(sessionId: string): Promise<RawResponse[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_responses")
    .select("id, submitted_at, participant_name, participant_email, comments, feedback_answers(question_id, star_value, video_url)")
    .eq("feedback_session_id", sessionId)
    .order("submitted_at", { ascending: false });
  return data ?? [];
}

export async function getFeedbackSessionDetail(
  id: string,
): Promise<{ session: FeedbackSessionRow; perQuestion: PerQuestionStat[]; responses: ResponseDetail[] } | null> {
  const session = await getFeedbackSessionBySlug(id);
  if (!session) return null;
  const rawResponses = await loadResponses(session.id);

  const perQuestion: PerQuestionStat[] = session.questions.map((q) => {
    const values = rawResponses
      .flatMap((r) => r.feedback_answers)
      .filter((a) => a.question_id === q.id);
    if (q.type === "video") {
      return { question: q.text, type: "video", avg: null, count: values.filter((v) => v.video_url).length };
    }
    const stars = values.map((v) => v.star_value).filter((v): v is number => v !== null);
    return { question: q.text, type: "stars", avg: average(stars), count: stars.length };
  });

  const responses: ResponseDetail[] = rawResponses.map((r) => {
    const stars: number[] = [];
    const videos: string[] = [];
    for (const q of session.questions) {
      const a = r.feedback_answers.find((x) => x.question_id === q.id);
      if (!a) continue;
      if (q.type === "video" && a.video_url) videos.push(a.video_url);
      else if (a.star_value !== null) stars.push(a.star_value);
    }
    return {
      id: r.id,
      submittedAt: r.submitted_at,
      name: r.participant_name || "—",
      email: r.participant_email ?? "",
      stars,
      videos,
      comments: r.comments,
    };
  });

  return { session, perQuestion, responses };
}

export async function deleteFeedbackResponse(responseId: string, sessionId: string, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_responses").delete().eq("id", responseId).eq("feedback_session_id", sessionId);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "deleteResponse", detail: `${sessionId} · ${responseId}`, actorProfileId });
}

export async function exportFeedbackSessionCsv(id: string): Promise<{ filename: string; csv: string } | null> {
  const detail = await getFeedbackSessionDetail(id);
  if (!detail) return null;
  const { session, responses } = detail;

  const header = ["Submitted On", "Participant Name", "Email", ...session.questions.map((q) => q.text + (q.type === "video" ? " (video)" : "")), "Comments"];
  const rows = [header];
  for (const r of responses) {
    const line = [r.submittedAt, r.name, r.email];
    let starIdx = 0;
    let videoIdx = 0;
    for (const q of session.questions) {
      if (q.type === "video") line.push(r.videos[videoIdx++] ?? "");
      else line.push(String(r.stars[starIdx++] ?? ""));
    }
    line.push(r.comments);
    rows.push(line);
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const safeName = (session.name || "session").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "session";
  return { filename: `${safeName}.csv`, csv };
}
```

- [ ] **Step 2: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/feedback-responses.ts
git commit -m "feat(feedback): add session detail, CSV export, response delete"
```

---

### Task 9: Share tokens + native share view

**Files:**
- Create: `src/lib/data/feedback-share.ts`

**Interfaces:**
- Consumes: `getFeedbackSessionDetail` (Task 8), `average` (Task 3), `logFeedbackAudit`.
- Produces: `generateFeedbackShareToken(type: "session"|"program", id: string, actorProfileId): Promise<{ shareUrl: string; token: string }>`, `getNativeShareView(token: string): Promise<ShareView | null>` (exact `ShareView`/`ShareSession`/`SharePerQuestion`/`ShareResponse` shape from `@/lib/mentorship/gas`).

- [ ] **Step 1: Implement**

```typescript
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFeedbackSessionDetail } from "@/lib/data/feedback-responses";
import { average } from "@/lib/validations/feedback";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";
import type { ShareView, ShareSession, ShareResponse } from "@/lib/mentorship/gas";

function randomToken(): string {
  return "sh_" + crypto.randomUUID().replace(/-/g, "");
}

export async function generateFeedbackShareToken(
  type: "session" | "program",
  id: string,
  actorProfileId: string | null,
): Promise<{ shareUrl: string; token: string }> {
  const admin = createAdminSupabase();
  const table = type === "session" ? "feedback_sessions" : "feedback_programs";
  const { data: row } = await admin.from(table).select("id, share_token").eq("id", id).maybeSingle();
  if (!row) throw new Error(`${type} not found: ${id}`);

  const token = row.share_token || randomToken();
  if (!row.share_token) {
    await admin.from(table).update({ share_token: token }).eq("id", id);
    await logFeedbackAudit({ action: "generateShareToken", detail: `${type}:${id} -> ${token}`, actorProfileId });
  }
  return { shareUrl: `/review/${token}`, token };
}

function toShareSession(session: Awaited<ReturnType<typeof getFeedbackSessionDetail>>): ShareSession {
  if (!session) throw new Error("unreachable");
  const { perQuestion, responses } = session;
  const starAvgs = perQuestion.filter((q) => q.type !== "video" && q.avg != null).map((q) => q.avg as number);
  return {
    id: session.session.id,
    name: session.session.name,
    speaker: session.session.speakerName,
    date: session.session.sessionDate ?? "",
    coverUrl: session.session.coverUrl ?? "",
    responseCount: responses.length,
    avgRating: average(starAvgs),
    perQuestion: perQuestion.map((q) => ({ question: q.question, type: q.type, avg: q.avg, count: q.count })),
    responses: responses.map(
      (r): ShareResponse => ({
        submittedOn: r.submittedAt,
        name: r.name === "—" ? "" : r.name,
        stars: r.stars,
        videos: r.videos,
        comments: r.comments,
      }),
    ),
  };
}

export async function getNativeShareView(token: string): Promise<ShareView | null> {
  const admin = createAdminSupabase();

  const { data: session } = await admin.from("feedback_sessions").select("id").eq("share_token", token).maybeSingle();
  if (session) {
    const detail = await getFeedbackSessionDetail(session.id);
    if (!detail) return null;
    return { type: "session", session: toShareSession(detail) };
  }

  const { data: program } = await admin.from("feedback_programs").select("id, name, type, cover_url").eq("share_token", token).maybeSingle();
  if (program) {
    const { data: members } = await admin
      .from("feedback_sessions")
      .select("id")
      .eq("program_id", program.id)
      .order("program_order", { ascending: true });
    const sessions: ShareSession[] = [];
    for (const m of members ?? []) {
      const detail = await getFeedbackSessionDetail(m.id);
      if (detail) sessions.push(toShareSession(detail));
    }
    return {
      type: "program",
      program: { id: program.id, name: program.name, type: program.type, coverUrl: program.cover_url ?? "" },
      sessions,
    };
  }

  return null;
}
```

- [ ] **Step 2: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/feedback-share.ts
git commit -m "feat(feedback): add share tokens and native share view"
```

---

### Task 10: Drive upload proxy (new, separate GAS project) + Next.js client

**Files:**
- Create: `gas/feedback-uploads/Code.gs`
- Create: `src/lib/gas/feedback-upload-client.ts`

**Interfaces:**
- Produces (GAS): `doPost(e)` dispatching `action: "uploadVideo" | "uploadCover"`.
- Produces (Next.js): `uploadFeedbackVideo(params): Promise<{ ok: true; url: string } | { ok: false; error: string }>`, `uploadFeedbackCover(params): Promise<{ ok: true; url: string } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the GAS project**

```javascript
/**
 * PZ Academy — Native Feedback System Drive upload proxy.
 *
 * Brand-new, standalone Apps Script project — deliberately separate from the
 * old "PZ Academy Feedback System" GAS project so that one is never touched
 * by this build. Same shared-secret pattern as gas/payment-screenshots.
 *
 * Setup after pasting into script.google.com:
 *   1. Project Settings -> Script Properties -> SHARED_SECRET = <long random string>
 *   2. Deploy -> New deployment -> Web app -> Execute as "Me", access "Anyone"
 *   3. Copy the /exec URL into .env.local as FEEDBACK_UPLOAD_GAS_URL
 *   4. Same random string into .env.local as FEEDBACK_UPLOAD_GAS_SECRET
 *   5. Run authorizeDrive() once from the editor, signed in as the deploying account
 */

const ROOT_FOLDER_NAME = "PZ Academy Feedback (Native)";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonResponse_({ ok: false, error: "Unauthorized" });
  }
  try {
    if (body.action === "uploadVideo") return jsonResponse_(uploadVideo_(body));
    if (body.action === "uploadCover") return jsonResponse_(uploadCover_(body));
    return jsonResponse_({ ok: false, error: "Unknown action" });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function uploadVideo_(body) {
  const { sessionId, sessionName, mimeType, base64, filename } = body;
  if (!base64) throw new Error("No video data received.");
  if (base64.length > 28 * 1024 * 1024) throw new Error("Video is too large. Please keep it under 20 MB.");
  if (!/^video\//i.test(mimeType || "")) throw new Error("Unsupported file type.");

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, filename || `feedback_${Date.now()}.webm`);

  const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  const sessionFolder = getOrCreateFolder_(root, sanitizeFolderName_(sessionName || sessionId));
  const file = sessionFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { ok: true, url: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1600" };
}

function uploadCover_(body) {
  const { sessionId, mimeType, base64, filename } = body;
  if (!base64) throw new Error("No image data received.");

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, filename || `cover_${Date.now()}.jpg`);

  const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  const coversFolder = getOrCreateFolder_(root, "Covers");
  const file = coversFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return { ok: true, url: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1600" };
}

function getOrCreateFolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parent.createFolder(name);
}

function sanitizeFolderName_(name) {
  const cleaned = String(name || "").replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  return cleaned || "uncategorized";
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor, signed in as the deploying account, to grant the Drive scope. */
function authorizeDrive() {
  const f = DriveApp.createFile(Utilities.newBlob("ok", "text/plain", "auth-check.txt"));
  f.setTrashed(true);
}
```

- [ ] **Step 2: Write the Next.js client**

```typescript
import "server-only";

const GAS_URL = process.env.FEEDBACK_UPLOAD_GAS_URL ?? "";
const GAS_SECRET = process.env.FEEDBACK_UPLOAD_GAS_SECRET ?? "";

type UploadResult = { ok: true; url: string } | { ok: false; error: string };

async function post(action: "uploadVideo" | "uploadCover", body: Record<string, string>): Promise<UploadResult> {
  if (!GAS_URL || !GAS_SECRET) return { ok: false, error: "Feedback upload proxy not configured." };
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: GAS_SECRET, action, ...body }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}

export function uploadFeedbackVideo(params: {
  sessionId: string;
  sessionName: string;
  mimeType: string;
  base64: string;
  filename: string;
}): Promise<UploadResult> {
  return post("uploadVideo", params);
}

export function uploadFeedbackCover(params: {
  sessionId: string;
  mimeType: string;
  base64: string;
  filename: string;
}): Promise<UploadResult> {
  return post("uploadCover", params);
}
```

- [ ] **Step 3: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors. (The `.gs` file is not part of the TS build.)

- [ ] **Step 4: Commit**

```bash
git add gas/feedback-uploads/Code.gs src/lib/gas/feedback-upload-client.ts
git commit -m "feat(feedback): add standalone Drive upload proxy for the native feedback system"
```

**Note for the executor (not a step — a deployment action outside this repo):** paste `Code.gs` into a new script.google.com project, deploy per the header comment, and add `FEEDBACK_UPLOAD_GAS_URL`/`FEEDBACK_UPLOAD_GAS_SECRET` to `.env.local` before Task 13's live testing.

---

### Task 11: Native-first public session lookup

**Files:**
- Modify: `src/app/feedback/[id]/page.tsx`

**Interfaces:**
- Consumes: `getNativePublicSession` (Task 5), `getPublicSession` (existing, `@/lib/mentorship/gas`, unchanged).
- `FeedbackClient.tsx` — **zero changes**, it only ever sees a `PublicSession`.

- [ ] **Step 1: Add the native-first lookup**

```typescript
import type { Metadata } from "next";
import { getPublicSession, type PublicSession } from "@/lib/mentorship/gas";
import { getNativePublicSession } from "@/lib/data/feedback-sessions";
import FeedbackClient from "./FeedbackClient";
import { Lock, CheckCircle2, AlertCircle } from "lucide-react";

async function resolveSession(id: string): Promise<PublicSession | null> {
  const native = await getNativePublicSession(id);
  if (native) return native;
  return getPublicSession(id);
}
```

Replace the existing `const session = await getPublicSession(params.id);` line in `FeedbackPage` with `const session = await resolveSession(params.id);`. Everything else in the file (the closed-state check, `ErrorState`, `ClosedState`, the styles) stays exactly as-is.

- [ ] **Step 2: Verify build**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/feedback/[id]/page.tsx
git commit -m "feat(feedback): try native session lookup before the GAS fallback"
```

---

### Task 12: Submission route — native/GAS branching

**Files:**
- Modify: `src/app/api/feedback/route.ts`

**Interfaces:**
- Consumes: `getNativePublicSession` (Task 5), `submitFeedbackResponse` (Task 7), `requireAdmin`-style pattern not needed here (public route) — instead reads the caller's own session via `createServerSupabase()` to resolve `participantProfileId`.

- [ ] **Step 1: Rewrite the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getNativePublicSession } from "@/lib/data/feedback-sessions";
import { submitFeedbackResponse } from "@/lib/data/feedback-responses";
import { createServerSupabase } from "@/lib/supabase/server";

const GAS_URL = process.env.MENTORSHIP_GAS_WEBAPP_URL ?? "";

interface SubmitBody {
  id: string;
  name: string;
  email: string;
  website: string;
  answers: { question: string; answer: string | number }[];
  comments: string;
}

export async function POST(req: NextRequest) {
  const body: SubmitBody = await req.json();

  const native = await getNativePublicSession(body.id);
  if (native) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const result = await submitFeedbackResponse({
      sessionId: body.id,
      name: body.name,
      email: user?.email ?? body.email,
      website: body.website,
      comments: body.comments,
      answers: body.answers,
      participantProfileId: user?.id ?? null,
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.message });
    return NextResponse.json({ ok: true });
  }

  // Legacy session — unchanged pass-through to GAS.
  if (!GAS_URL) {
    return NextResponse.json({ ok: false, error: "MENTORSHIP_GAS_WEBAPP_URL not configured." }, { status: 500 });
  }
  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Network error." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/feedback/route.ts
git commit -m "feat(feedback): branch submission route between native and legacy GAS sessions"
```

---

### Task 13: Video upload route — native/GAS branching

**Files:**
- Modify: `src/app/api/upload-video/route.ts`

**Interfaces:**
- Consumes: `getNativePublicSession` (Task 5), `uploadFeedbackVideo` (Task 10).

- [ ] **Step 1: Rewrite the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getNativePublicSession } from "@/lib/data/feedback-sessions";
import { uploadFeedbackVideo } from "@/lib/gas/feedback-upload-client";

const GAS_URL = process.env.MENTORSHIP_GAS_WEBAPP_URL ?? "";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("video") as File | null;
  const sessionId = String(form.get("sessionId") ?? "");
  const sessionName = String(form.get("sessionName") ?? "");

  if (!file || file.size === 0) {
    return NextResponse.json({ ok: false, error: "No video file received." }, { status: 400 });
  }
  const MAX_BYTES = 20 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Video is too large. Please keep it under 20 MB." }, { status: 413 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const ext = file.type.includes("mp4") ? "mp4" : "webm";
  const filename = `${sessionId}_${Date.now()}.${ext}`;

  const native = await getNativePublicSession(sessionId);
  if (native) {
    const result = await uploadFeedbackVideo({ sessionId, sessionName, mimeType: file.type || "video/webm", base64, filename });
    return NextResponse.json(result.ok ? { ok: true, data: { url: result.url } } : { ok: false, error: result.error });
  }

  // Legacy session — unchanged pass-through to the old GAS Feedback System.
  if (!GAS_URL) {
    return NextResponse.json({ ok: false, error: "MENTORSHIP_GAS_WEBAPP_URL not configured." }, { status: 500 });
  }
  try {
    const participantName = String(form.get("participantName") ?? "");
    const gasRes = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "uploadVideo", sessionId, sessionName, participantName, mimeType: file.type || "video/webm", base64, filename }),
    });
    const json = await gasRes.json();
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/upload-video/route.ts
git commit -m "feat(feedback): branch video upload route between native and legacy GAS sessions"
```

---

### Task 14: Native-first share-token review

**Files:**
- Modify: `src/app/review/[token]/page.tsx`

**Interfaces:**
- Consumes: `getNativeShareView` (Task 9), `getShareView` (existing, unchanged). `ReviewClient.tsx` — **zero changes**.

- [ ] **Step 1: Add the native-first lookup**

```typescript
import { getShareView } from '@/lib/mentorship/gas';
import type { ShareView } from '@/lib/mentorship/gas';
import { getNativeShareView } from '@/lib/data/feedback-share';
import ReviewClient from './ReviewClient';
import type { Metadata } from 'next';
import { cache } from 'react';

async function resolveView(token: string): Promise<ShareView | null> {
  const native = await getNativeShareView(token);
  if (native) return native;
  return getShareView(token);
}
```

Replace `const getView = cache(getShareView);` with `const getView = cache(resolveView);`. Everything else (`coverProxyUrl`, `rewriteCoverUrls`, `generateMetadata`, the not-found JSX) stays exactly as-is — `coverProxyUrl` already works off any Drive `fileId` regardless of which upload proxy produced it, since both proxies emit the same `thumbnail?id=<fileId>&sz=...` shape.

- [ ] **Step 2: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/review/[token]/page.tsx
git commit -m "feat(feedback): try native share view before the GAS fallback"
```

---

### Task 15: Admin API routes

**Files:**
- Create: `src/app/api/admin/feedback/sessions/route.ts` (GET list, POST create)
- Create: `src/app/api/admin/feedback/sessions/[id]/route.ts` (PATCH status/name/date, DELETE)
- Create: `src/app/api/admin/feedback/sessions/[id]/export/route.ts` (GET CSV)
- Create: `src/app/api/admin/feedback/sessions/[id]/cover/route.ts` (POST upload, DELETE clear)
- Create: `src/app/api/admin/feedback/sessions/[id]/share-token/route.ts` (POST generate)
- Create: `src/app/api/admin/feedback/sessions/[id]/responses/[responseId]/route.ts` (DELETE)
- Create: `src/app/api/admin/feedback/programs/route.ts` (GET list, POST create)
- Create: `src/app/api/admin/feedback/programs/[id]/route.ts` (DELETE)
- Create: `src/app/api/admin/feedback/question-bank/route.ts` (GET, PUT)

**Interfaces:**
- Consumes: `requireAdmin` (existing), every `feedback-*` data-layer function from Tasks 4–10, `zod`.

- [ ] **Step 1: Sessions list + create**

```typescript
// src/app/api/admin/feedback/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listFeedbackSessions, createFeedbackSession } from "@/lib/data/feedback-sessions";

const createSchema = z.object({
  name: z.string().min(1),
  speakerName: z.string().min(1),
  sessionDate: z.string().nullable().optional(),
  questions: z.array(z.object({ text: z.string().min(1), type: z.enum(["stars", "video"]) })).min(3).max(5),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ sessions: await listFeedbackSessions() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const result = await createFeedbackSession(parsed.data, auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create session." }, { status: 400 });
  }
}
```

- [ ] **Step 2: Session update/delete**

```typescript
// src/app/api/admin/feedback/sessions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setFeedbackSessionStatus, deleteFeedbackSession } from "@/lib/data/feedback-sessions";

const patchSchema = z.object({ status: z.enum(["active", "closed"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await setFeedbackSessionStatus(id, parsed.data.status, auth.user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await deleteFeedbackSession(id, auth.user.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: CSV export, cover, share-token, response-delete, programs, question-bank**

Same shape as Step 1/2, each thin route delegating straight to its Task 4–10 data-layer function behind `requireAdmin()`:

```typescript
// src/app/api/admin/feedback/sessions/[id]/export/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { exportFeedbackSessionCsv } from "@/lib/data/feedback-responses";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await exportFeedbackSessionCsv(id);
  if (!result) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return new NextResponse(result.csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${result.filename}"` },
  });
}
```

```typescript
// src/app/api/admin/feedback/sessions/[id]/cover/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setFeedbackSessionCover } from "@/lib/data/feedback-sessions";
import { uploadFeedbackCover } from "@/lib/gas/feedback-upload-client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("cover") as File | null;
  if (!file) return NextResponse.json({ error: "No file received" }, { status: 400 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await uploadFeedbackCover({ sessionId: id, mimeType: file.type || "image/jpeg", base64, filename: file.name });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  await setFeedbackSessionCover(id, result.url, auth.user.id);
  return NextResponse.json({ coverUrl: result.url });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await setFeedbackSessionCover(id, null, auth.user.id);
  return NextResponse.json({ ok: true });
}
```

```typescript
// src/app/api/admin/feedback/sessions/[id]/share-token/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { generateFeedbackShareToken } from "@/lib/data/feedback-share";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await generateFeedbackShareToken("session", id, auth.user.id);
  return NextResponse.json(result);
}
```

```typescript
// src/app/api/admin/feedback/sessions/[id]/responses/[responseId]/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteFeedbackResponse } from "@/lib/data/feedback-responses";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; responseId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, responseId } = await params;
  await deleteFeedbackResponse(responseId, id, auth.user.id);
  return NextResponse.json({ ok: true });
}
```

```typescript
// src/app/api/admin/feedback/programs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listFeedbackPrograms, createFeedbackProgram } from "@/lib/data/feedback-programs";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["workshop", "course"]).optional(),
  questions: z.array(z.object({ text: z.string().min(1), type: z.enum(["stars", "video"]) })).min(3).max(5),
  sessions: z.array(z.object({ title: z.string().min(1), speaker: z.string().min(1), date: z.string().nullable().optional() })).min(2),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ programs: await listFeedbackPrograms() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const result = await createFeedbackProgram(parsed.data, auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not create program." }, { status: 400 });
  }
}
```

```typescript
// src/app/api/admin/feedback/programs/[id]/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteFeedbackProgram } from "@/lib/data/feedback-programs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await deleteFeedbackProgram(id, auth.user.id);
  return NextResponse.json({ ok: true });
}
```

```typescript
// src/app/api/admin/feedback/question-bank/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getQuestionBank, saveQuestionBank } from "@/lib/data/feedback-question-bank";

const saveSchema = z.array(z.object({
  text: z.string().min(1),
  type: z.enum(["stars", "video"]),
  order: z.number().int(),
  isMentorshipDefault: z.boolean(),
}));

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ questions: await getQuestionBank() });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await saveQuestionBank(parsed.data, auth.user.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/feedback
git commit -m "feat(feedback): add admin API routes for sessions, programs, question bank"
```

---

### Task 16: Admin session list + new-session flow

**Files:**
- Create: `src/app/dashboard/admin/feedback/page.tsx`
- Create: `src/app/dashboard/admin/feedback/NewSessionModal.tsx`

**Interfaces:**
- Consumes: `requireAdminPage` (existing), `GET/POST /api/admin/feedback/sessions`, `GET /api/admin/feedback/question-bank`.

- [ ] **Step 1: Build the list page**

Server component, gated by `requireAdminPage()`, calling `listFeedbackSessions()` and `listFeedbackPrograms()` directly (server components can call the data layer without going through the API routes — same pattern as `src/app/dashboard/admin/mentorship/page.tsx`). Markup extracted from Stitch screen **Admin | Session List** (`projects/8093496535280885471/screens/4e2174dc282e4388b445840fce726dd4`, design system `PZ Academy System`): a table/card grid of sessions showing name, speaker, response count, avg rating, status badge, and a row action menu (Edit, Close/Reopen, Share link, Export CSV, Delete) that call the Task 15 routes. A "New Session" button opens `NewSessionModal`.

- [ ] **Step 2: Build the new-session modal**

Client component. Markup extracted from Stitch screen **Admin | New Session Modal** (`projects/8093496535280885471/screens/4eda5147badf46a9a2a1d9a646ad0fd1`): name/speaker/date fields, a question picker (checkbox list sourced from `GET /api/admin/feedback/question-bank`, 3–5 selectable, each togglable stars/video), submit posts to `POST /api/admin/feedback/sessions`. On success, shows the confirmation state from Stitch screen **Admin | Session Created Confirmation** (`projects/8093496535280885471/screens/c287f960fc5746bdbf9fb1976aa7c647`) with the copyable `/feedback/{slug}` link, then closes and refreshes the list (`router.refresh()`).

- [ ] **Step 3: Manual verification**

Run: `node_modules/.bin/next dev -p 3945` (per build-gotchas: never run `next build` against a live dev server), log in as the admin test account, visit `/dashboard/admin/feedback`, create a session with 3 star questions, confirm it appears in the list.
Expected: session created, visible in list with 0 responses / no rating yet.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/admin/feedback/page.tsx src/app/dashboard/admin/feedback/NewSessionModal.tsx
git commit -m "feat(feedback): add admin session list and new-session flow"
```

---

### Task 17: Admin session detail

**Files:**
- Create: `src/app/dashboard/admin/feedback/[id]/page.tsx`
- Create: `src/app/dashboard/admin/feedback/[id]/SessionDetailClient.tsx`

**Interfaces:**
- Consumes: `getFeedbackSessionDetail` (server-side, direct data-layer call), `DELETE/POST` routes from Task 15.

- [ ] **Step 1: Build the page**

Server component calling `getFeedbackSessionDetail(id)` directly, `notFound()` if null, passes the result into `SessionDetailClient`.

- [ ] **Step 2: Build the client component**

Markup extracted from Stitch screen **Admin | Session Detail** (`projects/8093496535280885471/screens/f7a8d193eac34a56b3ded14042cad361`): header (name/speaker/date/status, cover upload via `POST .../cover`), per-question average bars (from `perQuestion`), a response list where each card can be expanded (stars breakdown, video embeds, comments) and deleted (`DELETE .../responses/[responseId]`), a CSV export button linking to `GET .../export`, and a "Generate share link" button (`POST .../share-token`) that shows the resulting `/review/{token}` URL.

- [ ] **Step 3: Manual verification**

Submit a test feedback response through `/feedback/{slug}` (from Task 16's session), then confirm it appears on this detail page with the correct star average and CSV export downloads a matching row.
Expected: response visible, average matches, CSV has the response's data.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/admin/feedback/[id]"
git commit -m "feat(feedback): add admin session detail view"
```

---

### Task 18: Admin question bank + program pages

**Files:**
- Create: `src/app/dashboard/admin/feedback/question-bank/page.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/admin/feedback/question-bank`, `GET/POST /api/admin/feedback/programs`, `DELETE /api/admin/feedback/programs/[id]`.

- [ ] **Step 1: Build the question bank editor**

Client component: editable list of `{text, type, order, isMentorshipDefault}` rows (add/remove/reorder), saved as a full-replace `PUT` to `/api/admin/feedback/question-bank` — matches the old system's whole-bank-replace semantics, documented inline as a comment so a future editor doesn't assume merge behavior.

- [ ] **Step 2: Add program creation into the New Session flow**

Extend `NewSessionModal` (Task 16) with a "Make this a program" toggle that, when on, switches to a multi-session form (title/speaker/date per session, 2+ required) and posts to `POST /api/admin/feedback/programs` instead of the single-session endpoint. Program list/delete lives as a second tab on the Task 16 list page, calling `GET`/`DELETE /api/admin/feedback/programs`.

- [ ] **Step 3: Manual verification**

Create a 2-session program, confirm both sessions appear on the main session list with the program name prefixed, delete the program, confirm the sessions survive as standalone (per `deleteFeedbackProgram`'s `ON DELETE SET NULL` behavior).
Expected: matches.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/admin/feedback/question-bank src/app/dashboard/admin/feedback/NewSessionModal.tsx src/app/dashboard/admin/feedback/page.tsx
git commit -m "feat(feedback): add question bank editor and program creation"
```

---

### Task 19: Mentor read-only feedback view

**Files:**
- Create: `src/app/api/mentor/feedback/sessions/route.ts`
- Create: `src/app/api/mentor/feedback/sessions/[id]/route.ts`
- Create: `src/app/dashboard/mentor/feedback/page.tsx`
- Create: `src/app/dashboard/mentor/feedback/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireMentor`/`requireMentorPage` (existing), `listFeedbackSessions`/`getFeedbackSessionDetail` filtered to the caller's own `mentor_id`.

- [ ] **Step 1: Resolve the caller's mentor row and scope the list route**

```typescript
// src/app/api/mentor/feedback/sessions/route.ts
import { NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listFeedbackSessions } from "@/lib/data/feedback-sessions";

export async function GET() {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabase();
  const { data: mentor } = await admin.from("mentors").select("id").eq("profile_id", auth.user.id).maybeSingle();
  if (!mentor) return NextResponse.json({ sessions: [] });

  const all = await listFeedbackSessions();
  return NextResponse.json({ sessions: all.filter((s) => s.mentorId === mentor.id) });
}
```

- [ ] **Step 2: Scope the detail route the same way**

```typescript
// src/app/api/mentor/feedback/sessions/[id]/route.ts
import { NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFeedbackSessionDetail } from "@/lib/data/feedback-responses";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminSupabase();
  const { data: mentor } = await admin.from("mentors").select("id").eq("profile_id", auth.user.id).maybeSingle();
  if (!mentor) return NextResponse.json({ error: "Not a mentor" }, { status: 403 });

  const detail = await getFeedbackSessionDetail(id);
  if (!detail || detail.session.mentorId !== mentor.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
```

- [ ] **Step 3: Build the pages**

Server components gated by `requireMentorPage()`, calling the same scoped filtering logic as Steps 1–2 directly (server components skip the API round-trip, same as Task 17). Markup extracted from Stitch screens **Viewer | Session List** (`projects/8093496535280885471/screens/b38cbad1af2e4e5badbd61eb1f99211b`) and **Viewer | Session Detail dashboard** (`projects/8093496535280885471/screens/ac135e24d547439a9d16d7a9a2a29c3c`) — read-only: no CSV export, no delete, no audit log, no cross-mentor visibility. Add a "Feedback" nav entry to the mentor dashboard shell pointing at `/dashboard/mentor/feedback`.

- [ ] **Step 4: Manual verification**

Log in as the allowlisted mentor test account (`hamzaansari4you@gmail.com`), confirm `/dashboard/mentor/feedback` shows only sessions where `mentor_id` matches that account's linked mentor row, and that a session belonging to a different (or no) mentor never appears.
Expected: scoping holds.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mentor/feedback "src/app/dashboard/mentor/feedback"
git commit -m "feat(feedback): add mentor-scoped read-only feedback view"
```

---

### Task 20: Mentorship 1:1 tie-in

**Files:**
- Create: (append to) `src/lib/data/feedback-mentorship-sync.ts`
- Modify: `src/lib/data/mentorship-sessions.ts`

**Interfaces:**
- Consumes: `createFeedbackSession` (Task 5), `getMentorshipDefaultQuestions` (Task 4), `getFeedbackSessionDetail`/`average` (Task 8/3).
- Produces: `freezeMentorshipFeedbackSession(sessionId: string): Promise<void>`, `syncMentorshipFeedbackToSession(feedbackSessionId: string): Promise<void>` — called from `setSessionStatus` at the same commit as the `completed` transition, per the plan's freeze-at-commit-point constraint.

- [ ] **Step 1: Implement the freeze + sync helpers**

```typescript
// src/lib/data/feedback-mentorship-sync.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createFeedbackSession } from "@/lib/data/feedback-sessions";
import { getMentorshipDefaultQuestions } from "@/lib/data/feedback-question-bank";
import { getFeedbackSessionDetail } from "@/lib/data/feedback-responses";
import { average } from "@/lib/validations/feedback";

/**
 * Called at the same commit as a mentorship session's transition to
 * 'completed' — freezing this here, not lazily when the student later opens
 * a feedback link, mirrors the sessions_total lesson from subsystem C:
 * anything a later UI needs to read must be written at the state-transition
 * commit point.
 */
export async function freezeMentorshipFeedbackSession(mentorshipSessionId: string): Promise<void> {
  const admin = createAdminSupabase();

  const { data: existing } = await admin
    .from("feedback_sessions")
    .select("id")
    .eq("mentorship_session_id", mentorshipSessionId)
    .maybeSingle();
  if (existing) return; // idempotent — a session can only complete once in practice, but never double-freeze

  const { data: session } = await admin
    .from("sessions")
    .select("id, mentor_id, scheduled_at")
    .eq("id", mentorshipSessionId)
    .maybeSingle();
  if (!session) return;

  const { data: mentorRow } = await admin.from("mentors").select("id, name").eq("profile_id", session.mentor_id).maybeSingle();
  if (!mentorRow) return; // no linked mentors row — nothing to attribute the feedback session to

  const questions = await getMentorshipDefaultQuestions();
  if (questions.length < 3) return; // bank not seeded with enough mentorship defaults yet — surfaced by the seed migration normally

  await createFeedbackSession(
    {
      name: `Mentorship session — ${session.scheduled_at ?? mentorshipSessionId}`,
      speakerName: mentorRow.name,
      sessionDate: session.scheduled_at,
      questions: questions.map((q) => ({ text: q.text, type: q.type })),
      mentorshipSessionId: session.id,
      mentorId: mentorRow.id,
    },
    null,
  );
}

/** Writes the aggregate rating/comments back onto sessions.rating/student_feedback after a mentorship feedback response comes in. mentor_notes is untouched — that's the deferred mentor-notes feature. */
export async function syncMentorshipFeedbackToSession(feedbackSessionId: string): Promise<void> {
  const admin = createAdminSupabase();
  const { data: fs } = await admin
    .from("feedback_sessions")
    .select("id, mentorship_session_id")
    .eq("id", feedbackSessionId)
    .maybeSingle();
  if (!fs?.mentorship_session_id) return;

  const detail = await getFeedbackSessionDetail(fs.id);
  if (!detail) return;
  const starAvgs = detail.perQuestion.filter((q) => q.type !== "video" && q.avg != null).map((q) => q.avg as number);
  const overall = average(starAvgs);
  const latestComment = detail.responses[0]?.comments ?? null;

  await admin
    .from("sessions")
    .update({ rating: overall != null ? Math.round(overall) : null, student_feedback: latestComment })
    .eq("id", fs.mentorship_session_id);
}
```

- [ ] **Step 2: Hook the freeze into the completed transition**

In `src/lib/data/mentorship-sessions.ts`, modify `setSessionStatus`:

```typescript
import { freezeMentorshipFeedbackSession } from "@/lib/data/feedback-mentorship-sync";

export async function setSessionStatus(
  sessionId: string,
  status: "completed" | "cancelled",
  scopeToMentorId?: string,
): Promise<SetSessionStatusResult> {
  const admin = createAdminSupabase();
  let query = admin.from("sessions").update({ status }).eq("id", sessionId);
  if (scopeToMentorId !== undefined) {
    query = query.eq("mentor_id", scopeToMentorId);
  }
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };

  if (status === "completed") {
    await freezeMentorshipFeedbackSession(sessionId);
  }

  return { ok: true };
}
```

- [ ] **Step 3: Wire the sync call into response submission**

In `src/lib/data/feedback-responses.ts`'s `submitFeedbackResponse`, after the successful `feedback_answers` insert, add:

```typescript
  const { syncMentorshipFeedbackToSession } = await import("@/lib/data/feedback-mentorship-sync");
  await syncMentorshipFeedbackToSession(session.id);

  return { ok: true };
```

(Dynamic import here avoids a circular import: `feedback-mentorship-sync.ts` already imports from `feedback-responses.ts`.)

- [ ] **Step 4: Verify types compile**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Live click-through**

Using the allowlisted mentor test account: complete a mentorship session (mark it `completed` via the existing admin/mentor flow from subsystem C), confirm a `feedback_sessions` row was frozen with the right mentor/questions, submit feedback through its `/feedback/{slug}` link, confirm `sessions.rating`/`sessions.student_feedback` updated on the original mentorship session and the mentor's own scoped view (Task 19) shows the response.
Expected: full loop closes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/feedback-mentorship-sync.ts src/lib/data/mentorship-sessions.ts src/lib/data/feedback-responses.ts
git commit -m "feat(feedback): freeze and sync 1:1 mentorship session feedback"
```

---

## Final verification (after all tasks)

- [ ] `node_modules/.bin/tsc --noEmit` — clean
- [ ] `node_modules/.bin/vitest run` — all green
- [ ] `node_modules/.bin/eslint .` — clean
- [ ] Live click-through per the spec's Testing section: create a session, submit feedback anonymously, submit while logged in, admin views detail + exports CSV, mentor sees only their own session, share-token page renders with no email, and the full mentorship-completion → feedback → `sessions.rating` sync loop (Task 20 Step 5).
- [ ] Confirm zero files under `PZ Academy Feedback System/` were touched, and an old `/feedback/[legacy-id]`-style link (if one exists in the live Sheet) still resolves via the GAS fallback.
