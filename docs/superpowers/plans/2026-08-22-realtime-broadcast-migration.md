# Realtime Broadcast Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mentor messaging's non-functional `postgres_changes` live delivery, and the notification bell/history's total lack of live delivery, with Supabase Realtime Broadcast — the pipeline confirmed actually running on this project.

**Architecture:** Two small forward-only migrations add an `AFTER INSERT` trigger (`realtime.broadcast_changes()`) plus a scoped `realtime.messages` RLS policy on `mentor_messages` and `notifications`. One new shared client hook (`useBroadcastChannel`) opens a private, RLS-authorized broadcast channel and hands the inserted row to a caller-supplied callback. `MessageThread.tsx` uses it to upsert into local state (unchanged dedup logic); the notification bell/history use it to trigger `router.refresh()` (unchanged refresh-based architecture).

**Tech Stack:** Next.js App Router, Supabase (Postgres + Realtime Broadcast), `@supabase/supabase-js` 2.110.0, `@supabase/ssr` 0.12.0, TypeScript, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-22-realtime-broadcast-migration-design.md`

## Global Constraints

- Forward-only migrations — never edit an applied one, always a new file. Next migration number is `0042` (last applied: `0041_notifications_own_delete.sql`).
- No automated tests for Supabase-touching data-layer files or React components in this repo (only Zod schemas/pure functions get vitest coverage) — verification here is `tsc`/`next lint` cleanliness plus live manual checks, not fabricated unit tests.
- `npm run <script>` is broken by the `&` in this workspace's folder path — call binaries directly: `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/next lint`, `./node_modules/.bin/vitest run`.
- Production DDL via the Supabase MCP `apply_migration` tool is sometimes blocked by the auto-mode classifier — if so, hand the migration file to the user to run via the SQL Editor.
- Dev server on port 3000; if it's already running and a migration or `.env.local` change needs picking up, restart it (`next build` running concurrently with `next dev` corrupts the chunk cache — never run both at once).

---

### Task 1: Migration — `mentor_messages` broadcast trigger + RLS

**Files:**
- Create: `supabase/migrations/0042_realtime_broadcast_messaging.sql`

**Interfaces:**
- Produces: a broadcast on topic `mentor_messages:<conversation_id>`, event `INSERT`, whenever a row is inserted into `public.mentor_messages`. Payload shape (server-determined by `realtime.broadcast_changes()`): `{ record: <the inserted row as jsonb>, old_record: null, operation: "INSERT", table: "mentor_messages", schema: "public" }`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 0042: Realtime Broadcast for mentor_messages
-- Run AFTER 0041. SQL Editor -> New query -> Run
-- ============================================================
-- postgres_changes never delivers on this project (confirmed via 24h of
-- Realtime server logs -- see docs/superpowers/specs/2026-08-22-realtime-
-- broadcast-migration-design.md). Broadcast is the pipeline actually
-- running here. This trigger fires on every insert regardless of which
-- client (service-role or session) performed it, so every current and
-- future insert call site gets live delivery with no per-site wiring.

create trigger broadcast_mentor_messages
  after insert on public.mentor_messages
  for each row execute function realtime.broadcast_changes(
    'mentor_messages:' || new.conversation_id,
    'INSERT',
    'INSERT',
    'mentor_messages',
    'public',
    new,
    null
  );

-- Private channels only enforce RLS when the caller opts into
-- config.private = true client-side -- this policy is what actually gets
-- checked at subscribe time. Mirrors mentor_messages' own SELECT policy
-- (0036/0039): only the two participants in the conversation may read.
create policy "mentor_messages broadcast: participants only"
  on realtime.messages for select
  to authenticated
  using (
    realtime.topic() like 'mentor_messages:%'
    and exists (
      select 1 from public.mentor_conversations c
      where c.id = (split_part(realtime.topic(), ':', 2))::uuid
        and ((select auth.uid()) = c.mentor_id or (select auth.uid()) = c.student_id)
    )
  );
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `project_id: whqdasotjlhvrjmgiffk`, `name: realtime_broadcast_messaging`, and the SQL above (the `create trigger` and `create policy` statements, not the comment header). If the tool is blocked by the auto-mode classifier, hand the file to the user to run via the SQL Editor and wait for confirmation before continuing.

- [ ] **Step 3: Verify the trigger and policy exist**

Run via the Supabase MCP `execute_sql` tool:
```sql
select tgname from pg_trigger where tgrelid = 'public.mentor_messages'::regclass and tgname = 'broadcast_mentor_messages';
select policyname from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'mentor_messages broadcast: participants only';
select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass;
```
Expected: one row from each of the first two queries; `relrowsecurity = true` from the third (confirmed already true on this project as of 2026-08-22 -- this check just guards against it ever changing, since a policy on a table with RLS disabled enforces nothing).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0042_realtime_broadcast_messaging.sql
git commit -m "feat: broadcast mentor_messages inserts over Realtime Broadcast"
```

---

### Task 2: Migration — `notifications` broadcast trigger + RLS

**Files:**
- Create: `supabase/migrations/0043_realtime_broadcast_notifications.sql`

**Interfaces:**
- Produces: a broadcast on topic `notifications:<user_id>`, event `INSERT`, whenever a row is inserted into `public.notifications`. Same payload shape as Task 1, with the `notifications` row as `record`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 0043: Realtime Broadcast for notifications
-- Run AFTER 0042. SQL Editor -> New query -> Run
-- ============================================================
-- Second consumer of the useBroadcastChannel pattern introduced in 0042 --
-- the bell/history never had live delivery at all before this (only a
-- refresh on navigation). Topic is per-recipient, not per-conversation.

create trigger broadcast_notifications
  after insert on public.notifications
  for each row execute function realtime.broadcast_changes(
    'notifications:' || new.user_id,
    'INSERT',
    'INSERT',
    'notifications',
    'public',
    new,
    null
  );

create policy "notifications broadcast: own only"
  on realtime.messages for select
  to authenticated
  using (
    realtime.topic() = 'notifications:' || (select auth.uid())::text
  );
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with `project_id: whqdasotjlhvrjmgiffk`, `name: realtime_broadcast_notifications`, and the SQL above (the `create trigger` and `create policy` statements). If blocked by the classifier, hand the file to the user and wait for confirmation.

- [ ] **Step 3: Verify the trigger and policy exist**

Run via the Supabase MCP `execute_sql` tool:
```sql
select tgname from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'broadcast_notifications';
select policyname from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'notifications broadcast: own only';
```
Expected: one row from each query.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0043_realtime_broadcast_notifications.sql
git commit -m "feat: broadcast notifications inserts over Realtime Broadcast"
```

---

### Task 3: Shared client hook — `useBroadcastChannel`

**Files:**
- Create: `src/lib/realtime/useBroadcastChannel.ts`

**Interfaces:**
- Consumes: `createBrowserSupabase()` from `@/lib/supabase/client` (no-arg, returns a typed `SupabaseClient`).
- Produces:
  ```ts
  export function useBroadcastChannel<R>(
    topic: string | null,
    event: string,
    onInsert: (record: R) => void,
  ): void
  ```
  Call with `topic: null` to skip subscribing entirely (matches `MessageThread`'s existing "no conversation yet" case). `onInsert` receives the inserted row (`R` = whatever shape Task 1/2's trigger broadcasts — the caller supplies this type).

- [ ] **Step 1: Write the hook**

```ts
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

/** Shape of the payload realtime.broadcast_changes() sends -- see migrations 0042/0043. */
type BroadcastChangePayload<R> = {
  record: R;
  old_record: R | null;
  operation: string;
  table: string;
  schema: string;
};

/**
 * Subscribes to a private Realtime Broadcast channel and hands each INSERT's
 * row to `onInsert`. `onInsertRef` exists so callers can pass an inline
 * closure (fresh every render, closing over current state) without the
 * effect re-subscribing -- and therefore churning the channel -- every time
 * that closure's identity changes. If the subscribe status is ever anything
 * other than SUBSCRIBED (drop, network blip, backgrounded tab), triggers a
 * server refresh so a caller with its own reconciliation effect (like
 * MessageThread) can recover -- otherwise a dropped channel looks quiet with
 * no visible error.
 */
export function useBroadcastChannel<R>(
  topic: string | null,
  event: string,
  onInsert: (record: R) => void,
) {
  const router = useRouter();
  const onInsertRef = useRef(onInsert);
  useEffect(() => {
    onInsertRef.current = onInsert;
  });

  useEffect(() => {
    if (!topic) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(topic, { config: { private: true } })
      .on(
        "broadcast",
        { event },
        (msg: { payload: BroadcastChangePayload<R> }) => {
          onInsertRef.current(msg.payload.record);
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") router.refresh();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic, event, router]);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "D:\Claude Code Workspace\PZ Academy\PZ Academy LMS & Site\Recovered Files\pz-academy-platform" && ./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/realtime/useBroadcastChannel.ts
git commit -m "feat: add useBroadcastChannel hook for Realtime Broadcast subscriptions"
```

---

### Task 4: Wire `MessageThread.tsx` to the new hook

**Files:**
- Modify: `src/components/messaging/MessageThread.tsx:1-92`

**Interfaces:**
- Consumes: `useBroadcastChannel<R>(topic, event, onInsert)` from Task 3; `upsertMessage` (existing, unchanged, defined in this same file at lines 12-15); `MessageRow` type from `@/lib/data/mentor-messaging` (existing).

- [ ] **Step 1: Replace the `postgres_changes` effect with `useBroadcastChannel`**

Replace the import block (lines 1-9). `createBrowserSupabase` drops out entirely here -- its only use in this file was inside the effect being replaced (verified: no other reference to it exists in `MessageThread.tsx`):
```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { useBroadcastChannel } from "@/lib/realtime/useBroadcastChannel";
import { formatTime } from "@/lib/format";
import type { MessageRow } from "@/lib/data/mentor-messaging";
```

Add this type at module scope, alongside `upsertMessage` (after its closing brace, before `export function MessageThread`):
```tsx
/** Shape of the row broadcast by migration 0042's trigger on mentor_messages. */
type BroadcastMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};
```

Replace the subscription effect (old lines 48-92, the `useEffect` block starting with the comment `// The only client-side Supabase Realtime subscription...` down through its closing `}, [conversationId, router]);`) with:
```tsx
  // The only client-side Supabase Realtime subscription in this codebase --
  // every other data flow goes through a server route. Only subscribes once
  // a real conversationId exists; a brand-new thread (nobody has sent a
  // message yet) has nothing to subscribe to until the first send, at which
  // point router.refresh() re-renders this component with the real id and
  // the hook picks up the new topic. Broadcast, not postgres_changes -- see
  // docs/superpowers/specs/2026-08-22-realtime-broadcast-migration-design.md
  // for why postgres_changes never delivers on this project.
  useBroadcastChannel<BroadcastMessageRow>(
    conversationId ? `mentor_messages:${conversationId}` : null,
    "INSERT",
    (row) => {
      setMessages((prev) =>
        upsertMessage(prev, {
          id: row.id,
          conversationId: row.conversation_id,
          senderId: row.sender_id,
          body: row.body,
          createdAt: row.created_at,
        }),
      );
    },
  );
```

- [ ] **Step 2: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `./node_modules/.bin/next lint`
Expected: no new warnings/errors in `MessageThread.tsx` (pre-existing `<img>` warnings in unrelated files are fine).

- [ ] **Step 4: Commit**

```bash
git add src/components/messaging/MessageThread.tsx
git commit -m "fix: migrate MessageThread from postgres_changes to Realtime Broadcast"
```

---

### Task 5: Thread `currentUserId` through to `NotificationBell` and wire the hook

**Files:**
- Modify: `src/components/dashboard/NotificationBell.tsx:1-24`
- Modify: `src/components/dashboard/Topbar.tsx:19-27,50`
- Modify: `src/app/dashboard/layout.tsx:28-33`
- Modify: `src/app/portal/[slug]/layout.tsx:51`

**Interfaces:**
- Consumes: `useBroadcastChannel<R>(topic, event, onInsert)` from Task 3.
- Produces: `NotificationBell` now requires a `currentUserId: string` prop; `Topbar` now requires a `currentUserId: string` prop and forwards it.

- [ ] **Step 1: Add the hook call and `currentUserId` prop to `NotificationBell`**

In `src/components/dashboard/NotificationBell.tsx`, change the import block (lines 1-16):
```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { resolveNotificationStyle } from "./notification-style";
import { useBroadcastChannel } from "@/lib/realtime/useBroadcastChannel";
import type { AppNotification } from "@/lib/data/notifications";
```

Change the component signature and add the hook call (lines 18-26):
```tsx
export function NotificationBell({
  currentUserId,
  items = [],
  unreadCount = 0,
}: {
  currentUserId: string;
  items?: AppNotification[];
  unreadCount?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // A new notification (from any source: enrollment triggers, admin
  // broadcast, mentorship feedback, sheet-sync) refreshes this component's
  // server props so the bell updates without waiting for the user's next
  // navigation. No local upsert needed -- items/unreadCount already flow
  // purely from server props plus router.refresh(), same as handleMarkAll.
  useBroadcastChannel<unknown>(`notifications:${currentUserId}`, "INSERT", () => {
    router.refresh();
  });
```

- [ ] **Step 2: Thread `currentUserId` through `Topbar`**

In `src/components/dashboard/Topbar.tsx`, change the props interface and destructuring (lines 19-27):
```tsx
interface TopbarProps {
  fullName: string;
  role: string;
  currentUserId: string;
  /** Server-rendered by the dashboard layout; see getNotificationSummary. */
  notifications?: AppNotification[];
  unreadCount?: number;
}

export function Topbar({ fullName, role, currentUserId, notifications = [], unreadCount = 0 }: TopbarProps) {
```

Change the `NotificationBell` usage (line 50):
```tsx
        <NotificationBell currentUserId={currentUserId} items={notifications} unreadCount={unreadCount} />
```

- [ ] **Step 3: Pass `user.id` down from `src/app/dashboard/layout.tsx`**

Change the `<Topbar>` invocation (lines 28-33):
```tsx
        <Topbar
          fullName={fullName}
          role={role}
          currentUserId={user.id}
          notifications={items}
          unreadCount={unreadCount}
        />
```

- [ ] **Step 4: Pass `user.id` down from `src/app/portal/[slug]/layout.tsx`**

Change the `<NotificationBell>` usage (line 51):
```tsx
            <NotificationBell currentUserId={user.id} items={items} unreadCount={unreadCount} />
```

- [ ] **Step 5: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `./node_modules/.bin/next lint`
Expected: no new warnings/errors in the four touched files.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/NotificationBell.tsx src/components/dashboard/Topbar.tsx src/app/dashboard/layout.tsx src/app/portal/[slug]/layout.tsx
git commit -m "feat: live-refresh the notification bell via Realtime Broadcast"
```

---

### Task 6: Thread `currentUserId` through to `NotificationHistory` and wire the hook

**Files:**
- Modify: `src/components/dashboard/NotificationHistory.tsx:1-23`
- Modify: `src/app/dashboard/notifications/page.tsx:42`

**Interfaces:**
- Consumes: `useBroadcastChannel<R>(topic, event, onInsert)` from Task 3.
- Produces: `NotificationHistory` now requires a `currentUserId: string` prop.

- [ ] **Step 1: Add the hook call and `currentUserId` prop to `NotificationHistory`**

In `src/components/dashboard/NotificationHistory.tsx`, change the import block (lines 1-10):
```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, relativeTime } from "@/lib/format";
import { resolveNotificationStyle } from "./notification-style";
import { useBroadcastChannel } from "@/lib/realtime/useBroadcastChannel";
import type { AppNotification } from "@/lib/data/notifications";
```

Change the component signature and add the hook call (lines 17-25):
```tsx
export function NotificationHistory({
  currentUserId,
  notifications,
  unreadCount,
}: {
  currentUserId: string;
  notifications: AppNotification[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Same live-refresh as NotificationBell -- see its useBroadcastChannel call
  // for why no local upsert is needed here either.
  useBroadcastChannel<unknown>(`notifications:${currentUserId}`, "INSERT", () => {
    router.refresh();
  });
```

- [ ] **Step 2: Pass `user.id` down from `src/app/dashboard/notifications/page.tsx`**

Change the `<NotificationHistory>` usage (line 42):
```tsx
        <NotificationHistory currentUserId={user.id} notifications={notifications} unreadCount={unreadCount} />
```

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `./node_modules/.bin/next lint`
Expected: no new warnings/errors in the two touched files.

- [ ] **Step 5: Run the full vitest suite**

Run: `./node_modules/.bin/vitest run`
Expected: all existing tests still pass (this plan touches no Zod schemas or pure functions, so this is a regression check, not new coverage).

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/NotificationHistory.tsx src/app/dashboard/notifications/page.tsx
git commit -m "feat: live-refresh the notification history page via Realtime Broadcast"
```

---

### Task 7: Live end-to-end verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Restart the dev server**

The `.env.local`/schema changes and new files need a fresh server. If one is already running on port 3000, find and kill whatever process is bound to it (`netstat -ano | grep :3000` then `taskkill //PID <pid> //F` on Windows), then start a fresh one: `cd "D:\Claude Code Workspace\PZ Academy\PZ Academy LMS & Site\Recovered Files\pz-academy-platform" && ./node_modules/.bin/next dev -p 3000` (run in background). Confirm it's up with a `GET / 200` in its log output.

- [ ] **Step 2: Verify mentor messaging live delivery**

Using two browser contexts (or two separate browser profiles/windows) — one logged in as the mentor test account (`hamzaansari4you@gmail.com` / `@PZ2001009HA`), one as the student test account (`hamzaansarilm10@gmail.com` / `@PZ2001009HA`) — open the same conversation thread in both (mentor side: `/dashboard/mentor/messages/<studentId>`; student side: `/dashboard/messages/dr-hamza-ansari`). Send a message from one side. Expected: the message appears in the other tab within a couple seconds, with no reload or navigation.

- [ ] **Step 3: Verify notification live delivery**

While both tabs from Step 2 are open, trigger a notification insert for one of the two accounts — e.g. as an admin, send a manual notification via `/dashboard/admin/notifications` targeted at the student test account, or submit mentee feedback for a completed mentorship session (this already inserts a `mentorship_feedback_received` notification for the mentor, per the earlier feedback-arrival-notification feature). Expected: the bell's unread badge and dropdown update, and (if the notifications history page is open in a tab) the history list updates, without the recipient navigating or refreshing manually.

- [ ] **Step 4: Confirm no regression in existing notification actions**

In the same session, mark a notification read, delete one, and (as admin) run the notification purge — all from the delete/purge feature shipped earlier in this session. Expected: all three still work exactly as before; this task only added a new inbound live-update path, it didn't touch the existing read/delete/purge routes.
