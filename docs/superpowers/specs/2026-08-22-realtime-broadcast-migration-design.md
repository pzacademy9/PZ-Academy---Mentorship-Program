# Realtime broadcast migration — design

## Problem

Mentor-mentee messaging (`MessageThread.tsx`) relies on Supabase Realtime's
`postgres_changes` mechanism to push new messages to the recipient live. Live
two-tab testing (mentor + student accounts, browser-level websocket
instrumentation) confirmed this has never worked on this project: the
`mentor_messages` table is correctly in the `supabase_realtime` publication,
RLS is correct, the client subscribes and receives a server-confirmed
"Subscribed to PostgreSQL" system message — but no `postgres_changes` INSERT
event is ever delivered, even with a manually-verified correct JWT and a
confirmed-committed row matching the subscription filter.

Cross-checked against this Supabase project's own Realtime server logs over a
full 24-hour window: the Realtime tenant only ever opens a replication
connection for `supabase_realtime_messages_publication` (the `realtime.messages`
table backing Broadcast/Presence). It never opens one for the classic
`supabase_realtime` publication that `postgres_changes` depends on. This is an
infrastructure-tier gap on this project, not an app bug — no amount of
client-code correctness fixes it.

The in-app notification bell/history has the same class of staleness (a new
notification only appears after a navigation/refresh), though it was never
wired to `postgres_changes` at all — it just never had live delivery to begin
with.

## Decision

Migrate to Supabase Realtime **Broadcast** (`realtime.broadcast_changes()` +
private channels + RLS on `realtime.messages`), which — per the same log
evidence — is the pipeline actually running on this project. Build it as a
small reusable pattern (one shared client hook) covering both mentor messaging
and the notification bell/history, rather than a one-off fix scoped to
messaging alone.

Two approaches were considered:

- **A — one generic DB trigger function + branching RLS policy** on
  `realtime.messages`, parameterized per table. Maximizes DB-side reuse but
  introduces the first "framework-y", branching piece of SQL in a codebase
  whose migrations are otherwise uniformly explicit and single-purpose.
- **B (chosen) — small explicit trigger + RLS policy per table, shared
  client-side hook.** Matches the existing migration style (boring, one
  purpose each). The actual reuse lives in the client hook, which is where the
  real complexity (channel lifecycle, cleanup, stale-closure avoidance,
  reconnect recovery) lives — a much higher-value place to deduplicate than
  the DB trigger boilerplate.

## Database layer

Two new forward-only migrations.

**`mentor_messages` broadcast** (topic scoped to the conversation, shared by
both participants):

```sql
create trigger broadcast_mentor_messages
  after insert on public.mentor_messages
  for each row execute function realtime.broadcast_changes(
    'mentor_messages:' || new.conversation_id,
    'INSERT', 'INSERT', 'mentor_messages', 'public', new, null
  );
```

RLS on `realtime.messages`: authorize `select` when
`realtime.topic() like 'mentor_messages:%'` and the caller is a participant in
that `conversation_id` — same membership check already used for
`mentor_messages`'s own SELECT policy (`exists (select 1 from
mentor_conversations c where c.id = ... and (auth.uid() = c.mentor_id or
auth.uid() = c.student_id))`).

**`notifications` broadcast** (topic scoped to one recipient):

```sql
create trigger broadcast_notifications
  after insert on public.notifications
  for each row execute function realtime.broadcast_changes(
    'notifications:' || new.user_id,
    'INSERT', 'INSERT', 'notifications', 'public', new, null
  );
```

RLS on `realtime.messages`: authorize when
`realtime.topic() = 'notifications:' || auth.uid()`.

Channels must be opened with `private: true` client-side — this is what makes
Supabase actually enforce these RLS policies at subscribe time. A public
broadcast channel skips authorization entirely, which would silently
reintroduce a real hole (any authenticated user listening in on any
conversation, or on another user's notifications, just by guessing/knowing a
UUID).

No changes needed to any INSERT call site (the message-send route, the admin
notification-broadcast route, `sheet-sync.ts`,
`feedback-mentorship-sync.ts`) — the trigger fires on every INSERT to these
tables regardless of which client (service-role or session) performed it.
This is a meaningful robustness improvement over the old setup: there was
nothing broken about *how* rows were written before, but a trigger-based
design means there is structurally nothing to forget when a future insert
site is added.

## Client layer

New shared hook, `src/lib/realtime/useBroadcastChannel.ts`:

```ts
"use client";
export function useBroadcastChannel<T>(
  topic: string | null,
  event: string,
  onInsert: (record: T) => void,
) {
  const router = useRouter();
  const onInsertRef = useRef(onInsert);
  useEffect(() => { onInsertRef.current = onInsert; });

  useEffect(() => {
    if (!topic) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event }, (msg) => onInsertRef.current(msg.payload.record as T))
      .subscribe((status) => { if (status !== "SUBSCRIBED") router.refresh(); });
    return () => { supabase.removeChannel(channel); };
  }, [topic, event, router]);
}
```

The `onInsertRef` indirection is load-bearing: it lets each caller pass an
inline closure that closes over its own current state, without the effect
re-subscribing (and churning the channel) on every render that closure
identity changes. Same drop-recovery behavior as the code being replaced —
`router.refresh()` if the subscribe status isn't `SUBSCRIBED`, which lets the
existing prop-reconciliation pattern (already in `MessageThread.tsx`) repair
a stale thread.

**Consumers:**

- `MessageThread.tsx` — replaces its `postgres_changes` effect outright (not
  left dormant) with `useBroadcastChannel(topic, "INSERT", (row) =>
  setMessages(prev => upsertMessage(prev, row)))`. The existing `upsertMessage`
  dedup/sort logic is unchanged; only the subscription mechanism changes.
- `NotificationBell.tsx` / `NotificationHistory.tsx` — new
  `useBroadcastChannel("notifications:" + currentUserId, "INSERT", () =>
  router.refresh())`. These components already work purely off server props
  plus `router.refresh()` (no local optimistic state to reconcile), so a
  broadcast event just needs to trigger that same refresh instead of waiting
  for the user's next navigation.

## Edge cases / non-decisions

- RLS must be confirmed enabled on `realtime.messages` (a Supabase-managed
  system table) before the new policies can take effect — a one-line check
  at migration-write time.
- An `AFTER INSERT` trigger that throws rolls back the insert.
  `realtime.broadcast_changes()` is Supabase's own standard helper function,
  not custom code, so this is a known-safe primitive rather than a new risk
  surface.
- No automated test coverage — matches this repo's existing convention of no
  tests for Supabase-touching data-layer code. Verification is live: the same
  two-browser-context method used to find the original bug (mentor + student
  test accounts), confirming a sent message and a new notification both
  arrive without a reload.

## Out of scope

- Any change to what data is broadcast beyond the inserted row itself (no
  UPDATE/DELETE broadcast — neither table's UI needs it today).
- Extending this pattern to any other table. Two consumers (messaging,
  notifications) is the scope; a third can adopt the same hook later without
  redesign.
