# Subsystem D: mentor↔mentee interaction — design

Status: approved. Final piece of the mentorship system's 4-subsystem rebuild
(A done, B done, C done, D this doc — see memory
`pz-academy-mentorship-subsystem-status`).

## Context / what already exists

- `sessions` (migration `0001`): has had `mentor_notes text` and
  `student_feedback text` columns since the very first schema. `C`
  activated `student_feedback` (see below) but `mentor_notes` has zero
  writer and zero UI anywhere in the app — this subsystem's only job on
  the notes side is to finally give it one.
- **Feedback is already fully wired — no new work needed.** Subsystem C's
  `freezeMentorshipFeedbackSession` (`src/lib/data/feedback-mentorship-sync.ts`)
  auto-creates a `feedback_sessions` row (via the existing native Feedback
  Phase 2 system) the moment a mentorship session transitions to
  `completed`, seeded with the mentorship-default question bank and linked
  via `feedback_sessions.mentorship_session_id`/`mentor_id`. When a student
  submits that feedback, `syncMentorshipFeedbackToSession` writes the
  aggregate rating/comment back onto `sessions.rating`/`student_feedback`.
  The mentor already has a read-only feedback view at
  `/dashboard/mentor/feedback` (list) and `/dashboard/mentor/feedback/[id]`
  (detail), both shipped and live. This spec does not touch any of that.
- Messaging does not exist in any form: no message/conversation table, no
  UI, and — checked directly — **zero Supabase Realtime usage anywhere in
  this codebase**. Every existing data flow is server component / server
  action / service-role, with the browser never querying a table directly.
- **Correction from an earlier draft of this spec:** an initial pass claimed
  no table in this repo has RLS enabled — that was wrong, caught by a
  case-sensitive grep that missed `enable row level security` (lowercase)
  and a directory listing that only checked the last 5 migration files,
  skipping `0002_rls_policies.sql`. RLS is in fact applied broadly and
  consistently every time a table is added that needs direct
  participant-scoped access: migration `0002` (16 original tables,
  including `sessions` and `mentors`), `0025` (`mentorship_bookings`,
  `mentor_applications`), and as recently as `0033` (all seven feedback
  tables). The app's own server-rendered code still mostly reads/writes via
  service-role + route-level gates rather than relying on RLS for its own
  queries (see [[pz-academy-mentorship-subsystem-status]]) — that part of
  the framing was correct — but RLS itself is a well-established backstop
  in this schema, not a new pattern. What *is* still new: no table's RLS
  policies have ever had to serve a **live client-side Realtime
  subscription** before, which is a stricter bar than the existing
  policies were written for (see Security below).
- Mentor-side session views today are two dashboard list widgets only
  (`UpcomingSessionsList`, `MyStudentsList` in `src/components/mentor/`,
  rendered from `/dashboard/mentor/page.tsx`) — there is no per-session
  detail page. `mentor_notes` is per-session, so it attaches to
  `UpcomingSessionsList` rows rather than requiring a new page.

## Front-end source: Stitch (must-rule)

Checked both relevant projects before designing anything. "PZ Academy
Mentorship Portal" (`963183329053087808`) was checked exhaustively — all 16
screen instances are public marketing/booking flow (Homepage, Mentor
Profile, Booking & Payment, Thank You — light/dark/mobile/desktop variants
of the same four pages) and none touch dashboard messaging, notes, or any
authenticated mentor/student interaction surface. "PZ Academy website"
(`11811490301995978699`) is the large generic-scaffolding project (~130
screen instances, mostly course/lesson/homepage content) that subsystem C
already drew its four dashboard screens from — no screen there is labeled
or evidently themed for chat/inbox/messaging either.

**No existing screen covered this subsystem's UI**, so new screens were
generated in a fresh project, `PZ Academy Platform 2`
(`projects/4651274386787527431`), from four prompts covering mentor
inbox, mentor thread, student inbox, student thread. The batch landed in
three different color themes rather than the two originally requested
(desktop and mobile sometimes drifted independently) — reviewed all
variants directly as rendered screenshots and confirmed with the user
that the drift doesn't block extraction, since this codebase's
established convention (used throughout A/B/C) is to implement against
the app's real `pz-*` design tokens, never Stitch's literal hex values.
What's taken from each screen is the layout pattern (inbox row structure,
message bubble shape/alignment, composer bar), not its colors. Canonical
screens:

| Surface | Screen | Note |
|---|---|---|
| Mentor: Messages inbox (desktop) | `projects/4651274386787527431/screens/e78da2d2b7f04f2588c74bb2e30db8f1` | "PZ Academy" theme — primary reference |
| Mentor: Messages inbox (mobile) | `projects/4651274386787527431/screens/89e1e6deda38465bb27e13b410bf6e29` | "PZ Academy" theme — primary reference |
| Mentor: Message thread (desktop) | `projects/4651274386787527431/screens/d0311c6cb8b149a28e528a5a8847918f` | "PZ Academy" theme — primary reference |
| Mentor: Message thread (mobile) | `projects/4651274386787527431/screens/9de113e8d5bc4acdb3ab0744c615d183` | Color drifted to the "PharmaZyme" theme — layout-only reference |
| Student: Messages inbox (desktop) | `projects/4651274386787527431/screens/70046659533e4c34826754dce7f8d50f` | "Clinical Excellence" theme — primary reference (hidden in Stitch UI, still valid) |
| Student: Messages inbox (mobile) | `projects/4651274386787527431/screens/4a332fefb54940cfbdd9fc74d3d9589b` | "Clinical Excellence" theme — primary reference |
| Student: Message thread (desktop) | `projects/4651274386787527431/screens/6a34ce2dca7d4592be4b332c1a386377` | "Clinical Excellence" theme — primary reference (hidden in Stitch UI, still valid) |
| Student: Message thread (mobile) | `projects/4651274386787527431/screens/a8bb4f76cfdb4d9e8c3cb642387fb7e5` | Color drifted to the "PharmaZyme" theme — layout-only reference |

Two extra screens generated in the same batch
(`0240019547764f2fb042cab321e28cb5`, `5f0be79696644cb59aac42c3deccf017`,
and their `(v2)` variant `34ada3569fa943ebad34598049d1eadc` — all titled
"Student Conversation - Alex Johnson") are a duplicate mentor-thread
attempt in the "PharmaZyme" theme, fully superseded by the canonical rows
above. Not used.

## Data model

New migration (next number after the feedback-system migrations, `0036_mentor_messaging.sql` — `0033`-`0035` landed after subsystem C, for the native Feedback Phase 2 system):

```sql
create table public.mentor_conversations (
  id                 uuid primary key default gen_random_uuid(),
  mentor_id          uuid not null references public.profiles(id) on delete cascade,
  student_id         uuid not null references public.profiles(id) on delete cascade,
  created_at         timestamptz not null default now(),
  last_message_at    timestamptz,
  mentor_last_read_at   timestamptz,
  student_last_read_at  timestamptz,
  unique (mentor_id, student_id)
);

create table public.mentor_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.mentor_conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  body             text not null,
  created_at       timestamptz not null default now()
);
```

`mentor_id`/`student_id` are `profiles.id` directly (mirroring
`sessions.mentor_id`/`student_id`, not a `mentors.id` FK) — the same
identity convention B and C already established for anything that needs
`auth.uid()` to resolve directly against a participant column.

## Security: RLS sized for a live Realtime subscription, not just a REST fallback

Realtime chat requires the browser to subscribe to `postgres_changes`
directly using the user's own session — this is the one surface in the
whole app where the client talks to a table without a server route in
between. Supabase Realtime authorizes `postgres_changes` subscriptions via
each table's RLS policies, same as it authorizes any other direct client
read — so this isn't a new *mechanism* for this repo, just a new
*consumer* of one: every existing RLS policy here only ever had to hold up
against an occasional direct REST call, never a subscription a client
keeps open and expects to keep receiving correctly-scoped rows from.

**Both new tables get `ENABLE ROW LEVEL SECURITY`**, following the exact
pattern `0002`/`0025`/`0033` already established (participant columns
checked against `auth.uid()`). Policies:

```sql
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
```

No `INSERT` policy on `mentor_conversations` — conversation rows are only
ever created server-side (service-role, after the booking-eligibility
check below), never directly by a client.

## Conversation creation: lazy, not eager

A conversation row is created the first time either party sends a
message, not at booking-confirm time. This deliberately diverges from C's
"freeze derived state at the commit point" pattern — that pattern applies
to a *value* a later UI must read before it's computed (e.g.
`sessions_total`); conversation existence isn't a derived value, it's an
optional relationship, and eagerly creating one row per booking would
litter empty conversations nobody ever opens.

Server action `sendMentorMessage` (service-role, `src/lib/data/mentor-messaging.ts`):
1. Resolve the caller's own `profiles.id` (route-level auth gate, same as
   every other self-serve action in this codebase).
2. Check a `mentorship_bookings` row exists with this exact
   `(mentor_slug → mentor.profile_id, student_id)` pair, any status. No
   match → reject with a clear "no booking with this mentor yet" reason,
   not a silent no-op.
3. Upsert `mentor_conversations` on `(mentor_id, student_id)`.
4. Insert the message row, bump `last_message_at`.

## Realtime wiring

Initial message list for a thread loads via server component (fast first
paint, same as everywhere else in the app). On mount, the client opens a
`postgres_changes` subscription filtered to `conversation_id=eq.<id>`
using the browser's own authenticated Supabase client (not service-role)
and appends new rows as they arrive — this is the only place in the
codebase a client component holds a live Supabase subscription.

`postgres_changes` only fires for tables added to the `supabase_realtime`
publication — a step independent of RLS and easy to forget silently (the
feature would compile, build, and even pass a cursory click-through where
you refresh the page, while simply never delivering a live update). The
migration must explicitly run
`alter publication supabase_realtime add table public.mentor_messages;`.

## UI

- Student: `/dashboard/messages` (conversation list) +
  `/dashboard/messages/[mentorId]` (thread). Entry point added to the
  mentor profile page and `/dashboard/sessions`.
- Mentor: `/dashboard/mentor/messages` mirroring the same shape. Entry
  point added to each row in the existing `MyStudentsList`
  (`src/components/mentor/MyStudentsList.tsx`).
- Unread indicator: compare `last_message_at` against the viewer's own
  `*_last_read_at` column (bumped via the update policy above when a
  thread is opened) — no separate per-message read-receipt table.

## Mentor notes

Small addition to the existing `UpcomingSessionsList`
(`src/components/mentor/UpcomingSessionsList.tsx`): each row gets an
expandable notes field. New server action `updateSessionMentorNotes`
(service-role, ownership-checked: the caller's linked `mentors.profile_id`
must equal the target session's `mentor_id`) writes `sessions.mentor_notes`
as a full-value overwrite (not append) — same self-edit convention as
`update_own_mentor_profile`/`update_own_mentor_availability`. Mentor-private:
no student-facing surface reads this column, and no RLS is needed for it
since it's read/written exclusively through the existing service-role +
route-gate path, not a client subscription.

## Explicitly out of scope

- Message editing or deletion.
- Attachments/images in messages.
- Typing indicators, read receipts beyond the coarse last-read timestamp.
- Email/push notification on new message — no delivery mechanism exists
  in this codebase for *any* domain yet (the same gap is already tracked
  separately for feedback-arrival notification; not solved here).
- Group threads — one mentor, one student, one thread.
- Making `mentor_notes` visible to the student.

## Testing

Follows the repo's established pattern: `tsc`, vitest for the pure
booking-eligibility/upsert logic in `mentor-messaging.ts`, `next build`
for the RSC/client boundary (the realtime subscription lives in a client
component — this is exactly the class of bug that broke the audit-log
build; only a live browser load actually proves the subscription
authorizes correctly against the new RLS policies, so live click-through
with two real accounts, dev server never running while `next build`
alongside it, is required before calling this done). Supabase advisors
must be clean on the two new tables' policies before merge.
