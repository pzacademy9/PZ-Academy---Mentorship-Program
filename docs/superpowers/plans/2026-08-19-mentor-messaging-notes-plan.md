# Subsystem D: Mentor-Mentee Messaging + Mentor Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give mentors and students a private 1:1 realtime message thread per mentor-student relationship, and give mentors a private per-session notes field — the two remaining pieces of the 4-subsystem mentorship rebuild (A/B/C already shipped; feedback needs no new work, see spec).

**Architecture:** Two new Postgres tables (`mentor_conversations`, `mentor_messages`) with real RLS — the first tables in this repo whose policies have to authorize a live client-side Supabase Realtime subscription, not just an occasional server-side read. Everything except the realtime subscription itself (listing, sending, marking read) goes through the existing service-role + route-gate pattern. Conversations are created lazily on first send. Mentor notes reuse the existing `sessions.mentor_notes` column (dormant since migration `0001`) via a full-column-replace write, mirroring `update_own_mentor_profile`'s convention.

**Tech Stack:** Next.js App Router, Supabase (`@supabase/ssr` server/browser clients + `@supabase/supabase-js` service-role client, both already in use), Supabase Realtime (`postgres_changes`, new to this repo), Zod, vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-19-mentor-messaging-notes-design.md`

## Global Constraints

- Hand-edit `src/lib/supabase/database.types.ts` — this repo has no codegen script.
- Every new `SECURITY DEFINER`-adjacent grant needs an explicit `revoke` alongside it — not applicable here (no new RPCs in this plan), but any new table's RLS must ship in the *same* migration as the table, never a follow-up fix (the footgun subsystem B hit).
- Data mutations from client components use `fetch` + `useTransition` + `sonner` toast + `router.refresh()` — mirror `UpcomingSessionsList.tsx`, not a new pattern.
- Student-facing routes use the inline `auth.getUser()` check (no role gate, no `requireStudent()` helper — none exists in this repo), matching `/api/sessions/book/route.ts`. Mentor-facing routes use `requireMentor()`/`requireMentorPage()`.
- New UI (Messages pages, `ConversationList`, `MessageThread`) uses the current M3-style token set (`pz-primary`, `pz-on-surface-variant`, `pz-surface-container`, `font-headline`/`font-body`/`font-label`) — the standard the newest sibling pages (`/dashboard/mentor/feedback`) already use. The mentor-notes addition to `UpcomingSessionsList.tsx` instead matches *that file's own* existing older token set (`pz-forest`, `pz-muted`, `pz-border`) — follow the file you're editing, don't reskin it as a side effect.
- `npm run <script>` is broken by the `&` in this workspace's folder path — call binaries directly (`./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit`, `next build`, `next lint`).
- Never run `next build` while `next dev` is running against the same `.next` folder — corrupts the dev server's chunk cache.
- This repo has RLS on plenty of tables already (`0002`, `0025`, `0033`) — the two new tables here aren't a new *mechanism*, just the first to also serve a live Realtime subscription.

---

### Task 1: Migration — schema, RLS, Realtime publication, `database.types.ts`

**Files:**
- Create: `supabase/migrations/0036_mentor_messaging.sql`
- Modify: `src/lib/supabase/database.types.ts:1099` (insert two new table entries between `mentor_applications` and `mentors`)

**Interfaces:**
- Produces: tables `public.mentor_conversations` (`id`, `mentor_id`, `student_id`, `created_at`, `last_message_at`, `mentor_last_read_at`, `student_last_read_at`) and `public.mentor_messages` (`id`, `conversation_id`, `sender_id`, `body`, `created_at`), both RLS-enabled, both in the `supabase_realtime` publication. Matching `Database["public"]["Tables"]["mentor_conversations"]` / `["mentor_messages"]` types for every later task to import.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration 0036: Mentor-mentee messaging (subsystem D)
-- Run AFTER 0035. SQL Editor → New query → Run
-- ============================================================
-- See docs/superpowers/specs/2026-08-19-mentor-messaging-notes-design.md.
-- Two new tables, both with real RLS (this repo already uses RLS
-- consistently -- see 0002/0025/0033 -- but this is the first table whose
-- policies also have to authorize a live client-side Realtime
-- subscription, not just an occasional REST read). Conversations are
-- created lazily by the app on first send, never directly by a client --
-- no INSERT policy on mentor_conversations for that reason.

create table public.mentor_conversations (
  id                    uuid primary key default gen_random_uuid(),
  mentor_id             uuid not null references public.profiles(id) on delete cascade,
  student_id            uuid not null references public.profiles(id) on delete cascade,
  created_at            timestamptz not null default now(),
  last_message_at       timestamptz,
  mentor_last_read_at   timestamptz,
  student_last_read_at  timestamptz,
  unique (mentor_id, student_id)
);

create index mentor_conversations_mentor_id_idx on public.mentor_conversations (mentor_id);
create index mentor_conversations_student_id_idx on public.mentor_conversations (student_id);

create table public.mentor_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.mentor_conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  body             text not null,
  created_at       timestamptz not null default now()
);

create index mentor_messages_conversation_id_created_at_idx
  on public.mentor_messages (conversation_id, created_at);

alter table public.mentor_conversations enable row level security;
alter table public.mentor_messages enable row level security;

create policy "participants can read their conversation"
  on public.mentor_conversations for select
  using (auth.uid() = mentor_id or auth.uid() = student_id);

create policy "participants can update their own read-marker"
  on public.mentor_conversations for update
  using (auth.uid() = mentor_id or auth.uid() = student_id);

create policy "participants can read their messages"
  on public.mentor_messages for select
  using (
    exists (
      select 1 from public.mentor_conversations c
      where c.id = conversation_id
        and (auth.uid() = c.mentor_id or auth.uid() = c.student_id)
    )
  );

create policy "participants can send messages"
  on public.mentor_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.mentor_conversations c
      where c.id = conversation_id
        and (auth.uid() = c.mentor_id or auth.uid() = c.student_id)
    )
  );

-- postgres_changes only fires for tables in this publication -- independent
-- of RLS, and easy to forget silently (everything else about the feature
-- would still work except live delivery).
alter publication supabase_realtime add table public.mentor_messages;
```

- [ ] **Step 2: Hand-edit `database.types.ts`**

Open `src/lib/supabase/database.types.ts`. Find the `mentor_applications: {` entry (around line 1099) and the `mentors: {` entry that follows it (around line 1179). Insert these two new entries between them, in this exact `Row`/`Insert`/`Update`/`Relationships` shape (mirrors the `sessions` table entry a few hundred lines below):

```ts
      mentor_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          mentor_id: string
          mentor_last_read_at: string | null
          student_id: string
          student_last_read_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          mentor_id: string
          mentor_last_read_at?: string | null
          student_id: string
          student_last_read_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          mentor_id?: string
          mentor_last_read_at?: string | null
          student_id?: string
          student_last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_conversations_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "mentor_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no new errors (this step only adds types, nothing consumes them yet).

- [ ] **Step 4: Apply the migration**

Apply `0036_mentor_messaging.sql` to Supabase project `whqdasotjlhvrjmgiffk` via the `apply_migration` MCP tool. If it's blocked by the auto-mode classifier (known gotcha for DDL in this repo), hand the migration file to the user to run via the SQL Editor instead — do not proceed to Step 5 until it's confirmed applied.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0036_mentor_messaging.sql src/lib/supabase/database.types.ts
git commit -m "feat: add mentor_conversations/mentor_messages schema with RLS"
```

---

### Task 2: Validation schemas

**Files:**
- Create: `src/lib/validations/mentor-messaging.ts`
- Modify: `src/lib/validations/mentorship-sessions.ts` (append)
- Test: `tests/mentor-messaging.schema.test.ts`
- Test: `tests/mentorship-sessions.schema.test.ts` (append)

**Interfaces:**
- Produces: `sendMessageSchema` / `SendMessageInput` (from `@/lib/validations/mentor-messaging`), `updateMentorNotesSchema` / `UpdateMentorNotesInput` (from `@/lib/validations/mentorship-sessions`) — consumed by Task 3's data layer, Task 5's data layer, and Task 6's API routes.

- [ ] **Step 1: Write the failing tests**

Create `tests/mentor-messaging.schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sendMessageSchema } from "@/lib/validations/mentor-messaging";

describe("sendMessageSchema", () => {
  it("accepts a normal message body", () => {
    const r = sendMessageSchema.safeParse({ body: "Hey, quick question about Thursday's session." });
    expect(r.success).toBe(true);
  });

  it("trims and rejects an empty body", () => {
    const r = sendMessageSchema.safeParse({ body: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects a missing body", () => {
    const r = sendMessageSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects a body over 4000 characters", () => {
    const r = sendMessageSchema.safeParse({ body: "a".repeat(4001) });
    expect(r.success).toBe(false);
  });

  it("accepts a body at exactly 4000 characters", () => {
    const r = sendMessageSchema.safeParse({ body: "a".repeat(4000) });
    expect(r.success).toBe(true);
  });
});
```

Append to `tests/mentorship-sessions.schema.test.ts` (add the import to the existing import line, add this new `describe` block at the end of the file):

```ts
import { updateMentorNotesSchema } from "@/lib/validations/mentorship-sessions";

describe("updateMentorNotesSchema", () => {
  it("accepts normal notes text", () => {
    const r = updateMentorNotesSchema.safeParse({ notes: "Struggling with dosage calculations, review next session." });
    expect(r.success).toBe(true);
  });

  it("accepts an empty string, to allow clearing notes", () => {
    const r = updateMentorNotesSchema.safeParse({ notes: "" });
    expect(r.success).toBe(true);
  });

  it("rejects notes over 5000 characters", () => {
    const r = updateMentorNotesSchema.safeParse({ notes: "a".repeat(5001) });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run tests/mentor-messaging.schema.test.ts tests/mentorship-sessions.schema.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Write the schemas**

Create `src/lib/validations/mentor-messaging.ts`:

```ts
import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
```

Append to `src/lib/validations/mentorship-sessions.ts`:

```ts
export const updateMentorNotesSchema = z.object({
  notes: z.string().max(5000),
});
export type UpdateMentorNotesInput = z.infer<typeof updateMentorNotesSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run tests/mentor-messaging.schema.test.ts tests/mentorship-sessions.schema.test.ts`
Expected: PASS, 8 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/mentor-messaging.ts src/lib/validations/mentorship-sessions.ts tests/mentor-messaging.schema.test.ts tests/mentorship-sessions.schema.test.ts
git commit -m "test: add mentor messaging and notes validation schemas"
```

---

### Task 3: Data layer — booking eligibility + send

**Files:**
- Create: `src/lib/data/mentor-messaging.ts`

**Interfaces:**
- Consumes: `createAdminSupabase()` (`@/lib/supabase/admin`).
- Produces: `MessageRow`, `ConversationSummary`, `ConversationThread`, `SendMessageResult` types; `hasBookingBetween(mentorId, studentId): Promise<boolean>`; `resolveMentorForMessaging(slug): Promise<{profileId: string; name: string} | null>`; `resolveStudentDisplay(studentId): Promise<{name: string} | null>`; `sendMentorMessage(params): Promise<SendMessageResult>` — all consumed by Task 4 (same file), Task 6 (API routes), Task 9/10 (pages).

- [ ] **Step 1: Write the file**

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  href: string;
  counterpartName: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: boolean;
}

export interface ConversationThread {
  conversationId: string | null;
  messages: MessageRow[];
  canMessage: boolean;
}

export type SendMessageResult =
  | { ok: true; conversationId: string; message: MessageRow }
  | { ok: false; reason: "no-booking" | "db-error" };

function toMessageRow(row: {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}): MessageRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

/**
 * A conversation between a mentor and student may only exist where a
 * booking (any status) already connects them -- mirrors the spec's
 * eligibility rule exactly. mentorId is the mentor's profiles.id
 * (mentor_conversations.mentor_id), so this resolves the mentor's slug
 * first since mentorship_bookings still keys mentors by slug, not id
 * (unchanged from subsystem A/C).
 */
export async function hasBookingBetween(mentorId: string, studentId: string): Promise<boolean> {
  const admin = createAdminSupabase();

  const { data: mentor } = await admin.from("mentors").select("slug").eq("profile_id", mentorId).maybeSingle();
  if (!mentor) return false;

  const { count } = await admin
    .from("mentorship_bookings")
    .select("id", { count: "exact", head: true })
    .eq("mentor_slug", mentor.slug)
    .eq("student_id", studentId);

  return (count ?? 0) > 0;
}

/** Resolves a mentor's public slug to their messaging identity (linked profiles.id) -- a mentor with no linked account can't be messaged. */
export async function resolveMentorForMessaging(slug: string): Promise<{ profileId: string; name: string } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentors").select("profile_id, name").eq("slug", slug).maybeSingle();
  if (!data || !data.profile_id) return null;
  return { profileId: data.profile_id, name: data.name };
}

/** Student display name for the mentor-side thread header -- a plain profiles lookup, since a mentor has no other path to a student's name outside an existing session/booking relationship. */
export async function resolveStudentDisplay(studentId: string): Promise<{ name: string } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("profiles").select("full_name").eq("id", studentId).maybeSingle();
  if (!data) return null;
  return { name: data.full_name || "Student" };
}

/**
 * Lazy conversation creation: the row is upserted here, on first send, not
 * at booking-confirm time (see the spec's "Conversation creation" section
 * for why). Eligibility is re-checked here even though the UI already
 * gates it, since this is the actual security boundary for the mutation.
 */
export async function sendMentorMessage(params: {
  mentorId: string;
  studentId: string;
  senderId: string;
  body: string;
}): Promise<SendMessageResult> {
  const eligible = await hasBookingBetween(params.mentorId, params.studentId);
  if (!eligible) return { ok: false, reason: "no-booking" };

  const admin = createAdminSupabase();

  const { data: conversation, error: upsertError } = await admin
    .from("mentor_conversations")
    .upsert(
      { mentor_id: params.mentorId, student_id: params.studentId },
      { onConflict: "mentor_id,student_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (upsertError || !conversation) return { ok: false, reason: "db-error" };

  const { data: message, error: insertError } = await admin
    .from("mentor_messages")
    .insert({ conversation_id: conversation.id, sender_id: params.senderId, body: params.body })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();

  if (insertError || !message) return { ok: false, reason: "db-error" };

  await admin.from("mentor_conversations").update({ last_message_at: message.created_at }).eq("id", conversation.id);

  return { ok: true, conversationId: conversation.id, message: toMessageRow(message) };
}
```

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/mentor-messaging.ts
git commit -m "feat: add booking-eligibility and message-send data layer"
```

---

### Task 4: Data layer — list, thread, mark-read

**Files:**
- Modify: `src/lib/data/mentor-messaging.ts` (append)

**Interfaces:**
- Consumes: `MessageRow`, `ConversationSummary`, `ConversationThread`, `hasBookingBetween` (all from Task 3, same file).
- Produces: `listConversationsForMentor(mentorId): Promise<ConversationSummary[]>`; `listConversationsForStudent(studentId): Promise<ConversationSummary[]>`; `getConversationForMentor(mentorId, studentId): Promise<ConversationThread>`; `getConversationForStudent(studentId, mentorId): Promise<ConversationThread>`; `markConversationRead(conversationId, viewerRole): Promise<void>` — consumed by Task 9/10 pages.

- [ ] **Step 1: Append to the file**

```ts
/** Mentor's own inbox -- conversations where mentor_id is the caller. */
export async function listConversationsForMentor(mentorId: string): Promise<ConversationSummary[]> {
  const admin = createAdminSupabase();

  const { data: conversations } = await admin
    .from("mentor_conversations")
    .select("id, student_id, last_message_at, mentor_last_read_at, profiles!mentor_conversations_student_id_fkey(full_name)")
    .eq("mentor_id", mentorId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (!conversations || conversations.length === 0) return [];

  const previews = await latestMessagePreviewsByConversation(conversations.map((c) => c.id));

  return conversations.map((c) => ({
    id: c.id,
    href: `/dashboard/mentor/messages/${c.student_id}`,
    counterpartName: (c.profiles as unknown as { full_name: string } | null)?.full_name ?? "Student",
    lastMessageAt: c.last_message_at,
    lastMessagePreview: previews.get(c.id) ?? null,
    unread: c.last_message_at != null && (c.mentor_last_read_at == null || c.last_message_at > c.mentor_last_read_at),
  }));
}

/** Student's own inbox -- conversations where student_id is the caller. Each row also resolves the mentor's public slug for routing, since mentorship pages are keyed by slug everywhere else in the app. */
export async function listConversationsForStudent(studentId: string): Promise<ConversationSummary[]> {
  const admin = createAdminSupabase();

  const { data: conversations } = await admin
    .from("mentor_conversations")
    .select("id, mentor_id, last_message_at, student_last_read_at")
    .eq("student_id", studentId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (!conversations || conversations.length === 0) return [];

  const mentorIds = Array.from(new Set(conversations.map((c) => c.mentor_id)));
  const { data: mentorRows } = await admin.from("mentors").select("profile_id, slug, name").in("profile_id", mentorIds);
  const mentorByProfileId = new Map((mentorRows ?? []).map((m) => [m.profile_id as string, m]));

  const previews = await latestMessagePreviewsByConversation(conversations.map((c) => c.id));

  return conversations.map((c) => {
    const mentor = mentorByProfileId.get(c.mentor_id);
    return {
      id: c.id,
      href: `/dashboard/messages/${mentor?.slug ?? ""}`,
      counterpartName: mentor?.name ?? "Mentor",
      lastMessageAt: c.last_message_at,
      lastMessagePreview: previews.get(c.id) ?? null,
      unread: c.last_message_at != null && (c.student_last_read_at == null || c.last_message_at > c.student_last_read_at),
    };
  });
}

/** Most recent message body per conversation, for inbox row previews -- one bounded query plus a JS reduction, mirroring listUpcomingSessionsForMentor's join style rather than an N+1 query per row. */
async function latestMessagePreviewsByConversation(conversationIds: string[]): Promise<Map<string, string>> {
  if (conversationIds.length === 0) return new Map();
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("mentor_messages")
    .select("conversation_id, body, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (!map.has(row.conversation_id)) map.set(row.conversation_id, row.body);
  }
  return map;
}

/** A single thread's full message history plus whether messaging is even allowed -- conversationId is null when nobody has sent a message yet (lazy creation), which is a normal, expected state, not an error. */
export async function getConversationForMentor(mentorId: string, studentId: string): Promise<ConversationThread> {
  return getConversationThread({ mentorId, studentId });
}

export async function getConversationForStudent(studentId: string, mentorId: string): Promise<ConversationThread> {
  return getConversationThread({ mentorId, studentId });
}

async function getConversationThread(params: { mentorId: string; studentId: string }): Promise<ConversationThread> {
  const admin = createAdminSupabase();

  const [{ data: conversation }, canMessage] = await Promise.all([
    admin
      .from("mentor_conversations")
      .select("id")
      .eq("mentor_id", params.mentorId)
      .eq("student_id", params.studentId)
      .maybeSingle(),
    hasBookingBetween(params.mentorId, params.studentId),
  ]);

  if (!conversation) return { conversationId: null, messages: [], canMessage };

  const { data: messages } = await admin
    .from("mentor_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  return { conversationId: conversation.id, messages: (messages ?? []).map(toMessageRow), canMessage };
}

/** Bumps the viewer's own read-marker -- service-role, called from the thread page itself right after loading, not from a client action. */
export async function markConversationRead(conversationId: string, viewerRole: "mentor" | "student"): Promise<void> {
  const admin = createAdminSupabase();
  const column = viewerRole === "mentor" ? "mentor_last_read_at" : "student_last_read_at";
  await admin.from("mentor_conversations").update({ [column]: new Date().toISOString() }).eq("id", conversationId);
}
```

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/mentor-messaging.ts
git commit -m "feat: add conversation list, thread fetch, and read-marker functions"
```

---

### Task 5: Mentor notes — data layer + API route

**Files:**
- Modify: `src/lib/data/mentorship-sessions.ts` (add `updateSessionMentorNotes`; extend `listUpcomingSessionsForMentor`'s select and the `UpcomingSession` interface with `mentorNotes`)
- Create: `src/app/api/mentor/sessions/[id]/notes/route.ts`

**Interfaces:**
- Consumes: `updateMentorNotesSchema` (Task 2), `requireMentor` (`@/lib/auth/require-mentor`).
- Produces: `UpdateMentorNotesResult`, `updateSessionMentorNotes(sessionId, mentorId, notes): Promise<UpdateMentorNotesResult>`; `UpcomingSession.mentorNotes: string | null` — consumed by Task 12's `UpcomingSessionsList.tsx`.

- [ ] **Step 1: Extend `UpcomingSession` and its query**

In `src/lib/data/mentorship-sessions.ts`, find the `UpcomingSession` interface (around line 136-144) and add a field:

```ts
export interface UpcomingSession {
  id: string;
  studentId: string;
  studentName: string;
  scheduledAt: string;
  sessionNumber: number;
  sessionsTotal: number;
  packageName: string;
  mentorNotes: string | null;
}
```

Find `listUpcomingSessionsForMentor`'s `baseQuery` (around line 162-168) and add `mentor_notes` to the select:

```ts
  const baseQuery = () =>
    admin
      .from("sessions")
      .select("id, student_id, scheduled_at, booking_id, mentor_notes, profiles!sessions_student_id_fkey(full_name)")
      .eq("mentor_id", mentorProfileId)
      .eq("status", "confirmed")
      .not("scheduled_at", "is", null);
```

Find the `results.push({...})` inside that function (around line 192-200) and add the field:

```ts
    results.push({
      id: row.id,
      studentId: row.student_id,
      studentName: (row.profiles as unknown as { full_name: string } | null)?.full_name ?? "Student",
      scheduledAt: row.scheduled_at as string,
      sessionNumber,
      sessionsTotal: booking?.sessions_total ?? 1,
      packageName: booking?.package_name ?? "",
      mentorNotes: row.mentor_notes,
    });
```

- [ ] **Step 2: Add `updateSessionMentorNotes`**

In the same file, right after `setSessionStatus` (around line 134), add:

```ts
export type UpdateMentorNotesResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

/** Full-column-replace, not a merge -- same convention as update_own_mentor_profile/update_own_mentor_availability. Mentor-private: no student-facing surface ever reads sessions.mentor_notes. */
export async function updateSessionMentorNotes(
  sessionId: string,
  mentorId: string,
  notes: string,
): Promise<UpdateMentorNotesResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("sessions")
    .update({ mentor_notes: notes })
    .eq("id", sessionId)
    .eq("mentor_id", mentorId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}
```

- [ ] **Step 3: Write the API route**

Create `src/app/api/mentor/sessions/[id]/notes/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { updateMentorNotesSchema } from "@/lib/validations/mentorship-sessions";
import { updateSessionMentorNotes } from "@/lib/data/mentorship-sessions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = updateMentorNotesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateSessionMentorNotes(id, auth.user.id, parsed.data.notes);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason === "not-found" ? "Session not found" : "Could not save notes" }, {
      status: result.reason === "not-found" ? 404 : 500,
    });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/mentorship-sessions.ts src/app/api/mentor/sessions/[id]/notes/route.ts
git commit -m "feat: add mentor notes data layer and PATCH route"
```

---

### Task 6: Messaging API routes

**Files:**
- Create: `src/app/api/mentor/messages/[studentId]/route.ts`
- Create: `src/app/api/messages/[mentorSlug]/route.ts`

**Interfaces:**
- Consumes: `sendMessageSchema` (Task 2), `sendMentorMessage`, `resolveMentorForMessaging` (Task 3), `requireMentor` (`@/lib/auth/require-mentor`), `createServerSupabase` (`@/lib/supabase/server`).
- Produces: `POST /api/mentor/messages/[studentId]` and `POST /api/messages/[mentorSlug]`, both returning `{ ok: true, conversationId: string }` or `{ error: string }` — consumed by Task 8's `MessageThread` component via its `sendUrl` prop.

- [ ] **Step 1: Write the mentor-side route**

Create `src/app/api/mentor/messages/[studentId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { sendMessageSchema } from "@/lib/validations/mentor-messaging";
import { sendMentorMessage } from "@/lib/data/mentor-messaging";

export async function POST(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const { studentId } = await params;
  const parsed = sendMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await sendMentorMessage({
    mentorId: auth.user.id,
    studentId,
    senderId: auth.user.id,
    body: parsed.data.body,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "no-booking" ? "No booking exists with this student yet" : "Could not send message" },
      { status: result.reason === "no-booking" ? 403 : 500 },
    );
  }

  return NextResponse.json({ ok: true, conversationId: result.conversationId });
}
```

- [ ] **Step 2: Write the student-side route**

Create `src/app/api/messages/[mentorSlug]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendMessageSchema } from "@/lib/validations/mentor-messaging";
import { sendMentorMessage, resolveMentorForMessaging } from "@/lib/data/mentor-messaging";

/**
 * Public route, login-only (no role gate) -- same inline auth.getUser()
 * pattern as /api/sessions/book/route.ts, since no requireStudent()
 * helper exists in this repo and the real security boundary is
 * sendMentorMessage's own booking-eligibility check, not this route.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ mentorSlug: string }> }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { mentorSlug } = await params;
  const mentor = await resolveMentorForMessaging(mentorSlug);
  if (!mentor) {
    return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
  }

  const parsed = sendMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await sendMentorMessage({
    mentorId: mentor.profileId,
    studentId: user.id,
    senderId: user.id,
    body: parsed.data.body,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "no-booking" ? "You need a booking with this mentor first" : "Could not send message" },
      { status: result.reason === "no-booking" ? 403 : 500 },
    );
  }

  return NextResponse.json({ ok: true, conversationId: result.conversationId });
}
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/mentor/messages/[studentId]/route.ts" "src/app/api/messages/[mentorSlug]/route.ts"
git commit -m "feat: add mentor and student message-send API routes"
```

---

### Task 7: `ConversationList` component

**Files:**
- Create: `src/components/messaging/ConversationList.tsx`

**Interfaces:**
- Consumes: `ConversationSummary` (Task 3), `relativeTime` (`@/lib/format`).
- Produces: `ConversationList` component — consumed by Task 9/10 inbox pages.

- [ ] **Step 1: Write the component**

```tsx
import Link from "next/link";
import { Inbox } from "lucide-react";
import { relativeTime } from "@/lib/format";
import type { ConversationSummary } from "@/lib/data/mentor-messaging";

export function ConversationList({
  conversations,
  emptyMessage,
}: {
  conversations: ConversationSummary[];
  emptyMessage: string;
}) {
  if (conversations.length === 0) {
    return (
      <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
        <Inbox className="w-10 h-10 text-pz-outline-variant mb-3" />
        <p className="font-body text-pz-on-surface-variant text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {conversations.map((c) => (
        <Link
          key={c.id}
          href={c.href}
          className="flex items-center justify-between gap-4 bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 hover:border-pz-primary/40 hover:shadow-card transition-all p-5"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {c.unread && <span className="w-2 h-2 rounded-full bg-pz-primary shrink-0" />}
              <p className="font-headline font-bold text-pz-on-surface truncate">{c.counterpartName}</p>
            </div>
            {c.lastMessagePreview && (
              <p className="font-body text-sm text-pz-on-surface-variant truncate mt-1">{c.lastMessagePreview}</p>
            )}
          </div>
          {c.lastMessageAt && (
            <span className="font-body text-xs text-pz-on-surface-variant shrink-0">{relativeTime(c.lastMessageAt)}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/messaging/ConversationList.tsx
git commit -m "feat: add shared ConversationList component"
```

---

### Task 8: `MessageThread` component (realtime)

**Files:**
- Modify: `src/lib/format.ts` (add `formatTime`)
- Create: `src/components/messaging/MessageThread.tsx`

**Interfaces:**
- Consumes: `MessageRow` (Task 3), `createBrowserSupabase` (`@/lib/supabase/client`), `formatTime` (this task).
- Produces: `MessageThread` component (props: `conversationId: string | null`, `initialMessages: MessageRow[]`, `currentUserId: string`, `counterpartName: string`, `canMessage: boolean`, `sendUrl: string`) — consumed by Task 9/10 thread pages. This is the only client component in the codebase holding a live Supabase Realtime subscription — verify with a live two-account browser test, not just `tsc`/`next build`.

- [ ] **Step 1: Add `formatTime`**

Append to `src/lib/format.ts`:

```ts
/** Bubble timestamps in a message thread -- HH:MM only, same en-GB pin as the rest of this file. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
```

- [ ] **Step 2: Write the component**

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";
import type { MessageRow } from "@/lib/data/mentor-messaging";

export function MessageThread({
  conversationId,
  initialMessages,
  currentUserId,
  counterpartName,
  canMessage,
  sendUrl,
}: {
  conversationId: string | null;
  initialMessages: MessageRow[];
  currentUserId: string;
  counterpartName: string;
  canMessage: boolean;
  sendUrl: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // The only client-side Supabase Realtime subscription in this codebase --
  // every other data flow goes through a server route. Only subscribes once
  // a real conversationId exists; a brand-new thread (nobody has sent a
  // message yet) has nothing to subscribe to until the first send, at which
  // point router.refresh() below re-renders this component with the real id.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`mentor_messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mentor_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            body: string;
            created_at: string;
          };
          setMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [
                  ...prev,
                  { id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at },
                ],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        toast.error("Could not send that message.");
        return;
      }
      setDraft("");
      // Picks up the real conversationId when this was the first message in
      // a brand-new thread; otherwise a harmless no-op re-render, since the
      // message itself already arrived via the realtime subscription above.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col h-[70vh] bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
      <div className="px-5 py-4 border-b border-pz-outline-variant/40">
        <p className="font-headline font-bold text-pz-on-surface">{counterpartName}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant text-center mt-8">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    mine
                      ? "max-w-[75%] rounded-2xl rounded-br-sm bg-pz-primary text-pz-on-primary px-4 py-2"
                      : "max-w-[75%] rounded-2xl rounded-bl-sm bg-pz-surface-container px-4 py-2 text-pz-on-surface"
                  }
                >
                  <p className="font-body text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={
                      mine
                        ? "font-label text-[10px] mt-1 text-pz-on-primary/70"
                        : "font-label text-[10px] mt-1 text-pz-on-surface-variant"
                    }
                  >
                    {formatTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-5 py-4 border-t border-pz-outline-variant/40">
        {canMessage ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Type a message…"
              disabled={isPending}
              className="flex-1 rounded-full border border-pz-outline-variant/50 px-4 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/40 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={send}
              disabled={isPending || draft.trim().length === 0}
              className="shrink-0 w-10 h-10 rounded-full bg-pz-primary text-pz-on-primary grid place-items-center disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <p className="font-body text-sm text-pz-on-surface-variant text-center">
            You need a booking with this mentor before you can message them.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/format.ts src/components/messaging/MessageThread.tsx
git commit -m "feat: add MessageThread component with realtime subscription"
```

---

### Task 9: Mentor pages

**Files:**
- Create: `src/app/dashboard/mentor/messages/page.tsx`
- Create: `src/app/dashboard/mentor/messages/[studentId]/page.tsx`

**Interfaces:**
- Consumes: `requireMentorPage` (`@/lib/auth/require-mentor`), `listConversationsForMentor`, `getConversationForMentor`, `markConversationRead`, `resolveStudentDisplay` (Task 3/4), `ConversationList` (Task 7), `MessageThread` (Task 8).

- [ ] **Step 1: Write the inbox page**

```tsx
import { requireMentorPage } from "@/lib/auth/require-mentor";
import { listConversationsForMentor } from "@/lib/data/mentor-messaging";
import { ConversationList } from "@/components/messaging/ConversationList";

export const metadata = { title: "Messages — PZ Academy" };

export default async function MentorMessagesPage() {
  const { user } = await requireMentorPage();
  const conversations = await listConversationsForMentor(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Messages</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Conversations with your students.</p>
      </div>
      <ConversationList conversations={conversations} emptyMessage="No conversations yet." />
    </div>
  );
}
```

- [ ] **Step 2: Write the thread page**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/require-mentor";
import { resolveStudentDisplay, getConversationForMentor, markConversationRead } from "@/lib/data/mentor-messaging";
import { MessageThread } from "@/components/messaging/MessageThread";

export const metadata = { title: "Conversation — PZ Academy" };

export default async function MentorMessageThreadPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { user } = await requireMentorPage();
  const { studentId } = await params;

  const student = await resolveStudentDisplay(studentId);
  if (!student) notFound();

  const thread = await getConversationForMentor(user.id, studentId);
  if (thread.conversationId) {
    await markConversationRead(thread.conversationId, "mentor");
  }

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/mentor/messages"
        className="inline-flex items-center gap-1.5 font-label text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Messages
      </Link>
      <MessageThread
        conversationId={thread.conversationId}
        initialMessages={thread.messages}
        currentUserId={user.id}
        counterpartName={student.name}
        canMessage={thread.canMessage}
        sendUrl={`/api/mentor/messages/${studentId}`}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/mentor/messages/page.tsx" "src/app/dashboard/mentor/messages/[studentId]/page.tsx"
git commit -m "feat: add mentor messages inbox and thread pages"
```

---

### Task 10: Student pages

**Files:**
- Create: `src/app/dashboard/messages/page.tsx`
- Create: `src/app/dashboard/messages/[mentorSlug]/page.tsx`

**Interfaces:**
- Consumes: `createServerSupabase` (`@/lib/supabase/server`), `listConversationsForStudent`, `getConversationForStudent`, `markConversationRead`, `resolveMentorForMessaging` (Task 3/4), `ConversationList` (Task 7), `MessageThread` (Task 8).

- [ ] **Step 1: Write the inbox page**

```tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { listConversationsForStudent } from "@/lib/data/mentor-messaging";
import { ConversationList } from "@/components/messaging/ConversationList";

export const metadata = { title: "Messages — PZ Academy" };

export default async function StudentMessagesPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const conversations = await listConversationsForStudent(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Messages</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Your conversations with mentors.</p>
      </div>
      <ConversationList
        conversations={conversations}
        emptyMessage="No conversations yet — book a session with a mentor to start chatting."
      />
    </div>
  );
}
```

- [ ] **Step 2: Write the thread page**

```tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveMentorForMessaging, getConversationForStudent, markConversationRead } from "@/lib/data/mentor-messaging";
import { MessageThread } from "@/components/messaging/MessageThread";

export const metadata = { title: "Conversation — PZ Academy" };

export default async function StudentMessageThreadPage({ params }: { params: Promise<{ mentorSlug: string }> }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { mentorSlug } = await params;
  const mentor = await resolveMentorForMessaging(mentorSlug);
  if (!mentor) notFound();

  const thread = await getConversationForStudent(user.id, mentor.profileId);
  if (thread.conversationId) {
    await markConversationRead(thread.conversationId, "student");
  }

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/messages"
        className="inline-flex items-center gap-1.5 font-label text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Messages
      </Link>
      <MessageThread
        conversationId={thread.conversationId}
        initialMessages={thread.messages}
        currentUserId={user.id}
        counterpartName={mentor.name}
        canMessage={thread.canMessage}
        sendUrl={`/api/messages/${mentorSlug}`}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/messages/page.tsx" "src/app/dashboard/messages/[mentorSlug]/page.tsx"
git commit -m "feat: add student messages inbox and thread pages"
```

---

### Task 11: Entry points + nav wiring

**Files:**
- Modify: `src/components/dashboard/Sidebar.tsx`
- Modify: `src/components/mentor/MyStudentsList.tsx`
- Modify: `src/app/dashboard/sessions/page.tsx`

**Interfaces:**
- Consumes: routes from Task 9/10 (`/dashboard/mentor/messages/[studentId]`, `/dashboard/messages/[mentorSlug]`), `MentorStudent.studentId` (already exists), `MyBookingWithScheduling.mentorSlug` (already exists).

- [ ] **Step 1: Add `Messages` nav entries and bump the mobile slice bound**

In `src/components/dashboard/Sidebar.tsx`, add `MessageCircle` to the lucide-react import:

```ts
import {
  LayoutDashboard, BookOpen, Calendar, Award, Users, Settings, Clock,
  GraduationCap, BarChart3, CreditCard, Video, NotebookPen, Bell, Megaphone, Link2,
  Handshake, UserCheck, Star, MessageCircle,
} from "lucide-react";
```

Insert two new entries into `NAV_ITEMS` right after the `Sessions` entry:

```ts
  { label: "Sessions", href: "/dashboard/sessions", icon: Calendar, roles: ["student", "mentor"] },
  { label: "Messages", href: "/dashboard/messages", icon: MessageCircle, roles: ["student"] },
  { label: "Messages", href: "/dashboard/mentor/messages", icon: MessageCircle, roles: ["mentor"] },
  { label: "My Application", href: "/dashboard/mentor-application", icon: UserCheck, roles: ["student"] },
```

Replace the mobile slice logic and its comment (the block currently reading `const mobileItems = items.slice(0, 6);` with its preceding comment) with:

```ts
  /*
   * 7, not 6 -- adding "Messages" to both the student and mentor filtered
   * lists shifted every item after Sessions down by one. At the old
   * slice(0, 6), mentor's list would have dropped "Feedback" off the
   * mobile bottom nav again (the exact regression the previous 5->6 bump
   * fixed) and student's list would have excluded the new "Messages" item
   * itself. Bumping to 7 restores both roles to the same *set* of items
   * they had reachable before this change, now including Messages:
   * mentor = Dashboard, Sessions, Messages, Webinars, My Students,
   * Availability, Feedback (7); student = Dashboard, My Courses, My
   * Notes, Sessions, Messages, My Application, Certificates (7, Webinars
   * still excluded -- it already was at the old bound too). Purely
   * additive for every role, same as the previous bump.
   */
  const mobileItems = items.slice(0, 7);
```

- [ ] **Step 2: Add the entry point to `MyStudentsList`**

Replace the full contents of `src/components/mentor/MyStudentsList.tsx`:

```tsx
import Link from "next/link";
import { GraduationCap, MessageCircle } from "lucide-react";
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
          <Link
            href={`/dashboard/mentor/messages/${s.studentId}`}
            className="shrink-0 w-8 h-8 rounded-full grid place-items-center text-pz-forest hover:bg-pz-surface-container-low transition-colors"
            title={`Message ${s.studentName}`}
          >
            <MessageCircle className="w-4 h-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add the entry point to `/dashboard/sessions`**

In `src/app/dashboard/sessions/page.tsx`, add the import:

```tsx
import { MessageCircle } from "lucide-react";
```

Find the booking header block:

```tsx
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
```

Replace it with:

```tsx
                <div className="p-5 rounded-xl bg-pz-surface-container border border-pz-outline-variant/10 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-headline font-bold text-pz-on-surface">{b.mentorName}</p>
                    <p className="font-body text-sm text-pz-on-surface-variant">{b.packageName}</p>
                    <p className="font-body text-xs text-pz-on-surface-variant mt-1">Booked {formatDate(b.createdAt)}</p>
                    {b.status === "cancelled" && b.cancellationReason && (
                      <p className="font-body text-xs text-pz-danger mt-1">{b.cancellationReason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <a
                      href={`/dashboard/messages/${b.mentorSlug}`}
                      className="inline-flex items-center gap-1.5 font-label text-xs font-bold text-pz-primary hover:underline"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Message
                    </a>
                    <MentorshipStatusBadge kind="booking" status={b.status} />
                  </div>
                </div>
```

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/Sidebar.tsx src/components/mentor/MyStudentsList.tsx src/app/dashboard/sessions/page.tsx
git commit -m "feat: wire up messaging entry points and nav"
```

---

### Task 12: Mentor notes UI

**Files:**
- Modify: `src/components/mentor/UpcomingSessionsList.tsx`

**Interfaces:**
- Consumes: `UpcomingSession.mentorNotes` (Task 5), `PATCH /api/mentor/sessions/[id]/notes` (Task 5).

- [ ] **Step 1: Replace the component**

Replace the full contents of `src/components/mentor/UpcomingSessionsList.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, CheckCircle2, NotebookPen, ChevronDown, ChevronUp } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { UpcomingSession } from "@/lib/data/mentorship-sessions";

export function UpcomingSessionsList({ sessions }: { sessions: UpcomingSession[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

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

  function saveNotes(sessionId: string) {
    const notes = draftNotes[sessionId] ?? "";
    startTransition(async () => {
      const res = await fetch(`/api/mentor/sessions/${sessionId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        toast.error("Could not save your notes.");
        return;
      }
      toast.success("Notes saved.");
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
        const isExpanded = expandedId === s.id;
        return (
          <div key={s.id} className="rounded-lg border border-pz-outline-variant/30 overflow-hidden">
            <div className="flex items-center justify-between gap-4 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-label text-xs px-2 py-0.5 bg-pz-surface-container rounded text-pz-on-surface-variant">
                    Session {s.sessionNumber} of {s.sessionsTotal}
                  </span>
                </div>
                <p className="font-headline font-bold text-pz-forest truncate">{s.studentName}</p>
                <p className="font-body text-xs text-pz-muted">{formatDateTime(s.scheduledAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : s.id);
                    setDraftNotes((prev) => (s.id in prev ? prev : { ...prev, [s.id]: s.mentorNotes ?? "" }));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-pz-outline-variant text-pz-forest font-headline text-xs font-bold hover:bg-pz-surface-container-low transition-colors"
                >
                  <NotebookPen className="w-3.5 h-3.5" />
                  Notes
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {isPast && (
                  <button
                    type="button"
                    onClick={() => markCompleted(s.id)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-pz-outline-variant text-pz-forest font-headline text-xs font-bold hover:bg-pz-surface-container-low transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Completed
                  </button>
                )}
              </div>
            </div>
            {isExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-pz-outline-variant/20 bg-pz-surface-container-low/50">
                <textarea
                  value={draftNotes[s.id] ?? ""}
                  onChange={(e) => setDraftNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  placeholder="Private notes about this student/session — only you can see this."
                  rows={3}
                  disabled={isPending}
                  className="w-full mt-2 rounded-lg border border-pz-outline-variant/40 p-2.5 text-sm font-body text-pz-forest disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => saveNotes(s.id)}
                  disabled={isPending}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-pz-forest text-white font-headline text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Save Notes
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/mentor/UpcomingSessionsList.tsx
git commit -m "feat: add expandable mentor notes to UpcomingSessionsList"
```

---

### Task 13: Final verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full typecheck and unit tests**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: clean.

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass, including the 8 new ones from Task 2.

- [ ] **Step 2: Production build**

Confirm `next dev` is NOT running (kill it if it is — `next build` alongside a live `next dev` corrupts the chunk cache). Then:

Run: `next build`
Expected: clean build. This is the step that would have caught the audit-log build's server/client boundary bug — `MessageThread.tsx` imports `createBrowserSupabase` and holds a live subscription, so confirm there's no accidental server-only import crossing into it.

Restart `next dev` fresh afterward (`rm -rf .next` first if anything looks stale).

- [ ] **Step 3: Supabase advisors**

Run the `get_advisors` MCP tool (security category) against project `whqdasotjlhvrjmgiffk`. Expected: clean on `mentor_conversations` and `mentor_messages` — no "RLS enabled, no policies" or "policy allows public access" warnings.

- [ ] **Step 4: Live click-through with two real accounts**

Using `pharmacozymeofficial@gmail.com` (admin — can also exercise the mentor side if linked, otherwise use it as the student) and `hamzaansari4you@gmail.com` (mentor, slug `dr-hamza-ansari`), in two separate browser sessions:

1. As the student, open `/dashboard/messages` — confirm the empty state if no conversation exists yet, or the existing list if one does.
2. Navigate to a mentor with an existing booking and send a message. Confirm it appears immediately in your own thread.
3. As the mentor (second browser/session), open `/dashboard/mentor/messages` and confirm the new conversation appears with an unread indicator and the correct preview text.
4. Open the thread and confirm the message renders correctly (left-aligned, other party's bubble), then reply.
5. Back in the student's browser (already on the thread page, not refreshed), confirm the mentor's reply appears **without a manual page reload** — this is the actual proof the Realtime subscription and its RLS policy are both correctly wired; nothing else in this plan proves that.
6. As the mentor, open a student's session on `/dashboard/mentor`, expand "Notes," save a note, refresh, and confirm it persisted. Confirm the student-facing side of the app never surfaces this text anywhere.
7. Attempt to open `/dashboard/messages/<some-mentor-slug-with-no-booking>` as the student and confirm the composer is disabled with the "you need a booking" message rather than silently allowing a send.

- [ ] **Step 5: Update memory**

Once verified, update the `pz-academy-mentorship-subsystem-status` memory file to mark subsystem D done, following the same format B and C used, and note the RLS-claim correction as a durable lesson (grep case-sensitivity + `ls | tail -N` are not reliable ways to establish "zero occurrences of X" claims — always grep case-insensitively and list full directories before asserting an architectural fact).
