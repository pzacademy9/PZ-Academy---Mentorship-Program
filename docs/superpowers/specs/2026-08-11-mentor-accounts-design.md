# Subsystem B: Mentor auth accounts — design

Status: approved. Part of the mentorship system's 4-subsystem rebuild (A done,
B this doc, C session lifecycle, D mentor↔mentee interaction — see memory
`pz-academy-mentorship-subsystem-status`).

## Context / what already exists

Investigation before this design turned up more prior art than the original
ask assumed:

- `user_role` enum (migration `0001_enums_and_tables.sql`) already has
  `'mentor'` as a value. No enum change needed.
- `/dashboard/mentor/page.tsx` already exists as a stub — checks
  `role === 'mentor' | 'admin' | 'super_admin'`, redirects otherwise, renders
  hardcoded `0` stat cards and empty-state panels.
- `middleware.ts` already gates `/dashboard/mentor*` to those same roles.
- `roles.ts` already routes `roleHome('mentor')` → `/dashboard/mentor`.

So B is **not** "add a mentor role and a mentor area" — both already ship.
What's actually missing:

1. No way to create or link a real auth account to a `mentors` row (no
   `auth.admin.inviteUserByEmail` usage anywhere in the repo).
2. `mentors` table has no `email` column — the admin UI has nothing to read
   an email from; it must be typed in at invite time.
3. The mentor dashboard stub shows fake zeros, not the mentor's real profile.
4. Migration `0028_mentor_registry.sql` deliberately dropped
   `"mentors: mentor update own"` and left a comment: reintroduce self-service
   via a security-definer RPC with a column whitelist, not a raw RLS policy.
   That RPC doesn't exist yet.

## Architecture / data flow

**Invite / link action** — new server action behind `requireAdmin()`, exposed
as an "Invite Mentor" control on `/dashboard/admin/mentors/[id]`:

1. Admin types an email into the invite form.
2. Server action calls a new RPC, `find_user_id_by_email(email)` — SECURITY
   DEFINER, reads `auth.users` (not reachable from `profiles`, which has no
   email column). The route itself is already admin-gated; the RPC just
   returns a uuid or null, no extra privilege exposed by having it exist.
3. **Found** (email belongs to an existing account, e.g. a student): the
   action returns `{ status: "existing", email }` instead of writing
   anything. The admin UI shows a confirm dialog — "This email already has
   an account (student). Promote it to mentor and link it to this profile?"
   Only on confirm does a second call run the actual update: admin-client
   `update profiles set role='mentor', full_name=coalesce(...)`,
   `update mentors set profile_id=<id>`. No email sent — mentor logs in with
   their existing password next time.
4. **Not found**: call `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: origin + "/reset-password", data: { full_name: mentor.name } })`
   via the admin (service-role) client. On success, same `profiles`/`mentors`
   updates as step 3, using the newly created user's id. Mentor receives
   Supabase's built-in invite email, lands on the **existing**
   `/reset-password` page — confirmed by reading it: it already just calls
   `supabase.auth.updateUser({ password })` against whatever session type
   (recovery or invite) the magic-link landed them in. No new route needed.

**Trigger interaction**: `handle_new_user` (`0003`/`0017`/`0018`) fires on
every `auth.users` insert, including ones created via `inviteUserByEmail`,
and hardcodes `role = 'student'`. This is **not** modified — it's been
patched three times already and touching it is out of scope. Instead, the
`profiles.role = 'mentor'` update in step 3/4 runs in the same server
action, immediately after the insert, before the mentor has ever logged in.
No window where a real request sees the wrong role.

**Unlink**: on `/dashboard/admin/mentors/[id]`, once `profile_id` is set, the
invite form is replaced by a badge (linked email, fetched live via admin
`getUserById` — no schema change) and an "Unlink account" button (confirm
dialog). Unlink clears `mentors.profile_id` **and** reverts
`profiles.role` back to `'student'` — leaving it as `'mentor'` with no
linked mentor row would be an orphaned, confusing state (account could still
reach `/dashboard/mentor` per the existing middleware check, with nothing to
show).

**Self-edit RPC**: `update_own_mentor_profile(...)` — SECURITY DEFINER,
`where profile_id = auth.uid()`. Column whitelist, content/marketing fields
only:

- Editable: `short_bio`, `full_bio`, `photo_url`, `availability_text`,
  `intro_video_url`, `linkedin_url`, `social_links`, `skills`,
  `credentials`, `timezone`, `session_duration_text`.
- Locked (admin-only, via the existing `/dashboard/admin/mentors` CRUD):
  `slug`, `name`, `title`, `domain`, `expertise`, `visibility`,
  `price_per_session_pkr`, `packages`, `order_index`, `testimonials`.

No RLS policy is reintroduced on `mentors` directly — `0028` dropped
`"mentors: mentor update own"` on purpose (row-level RLS can't express a
column whitelist; a mentor with a raw update policy could self-publish or
reprice). Self-service goes through the RPC only, per that migration's own
comment.

**Mentor dashboard** (`/dashboard/mentor/page.tsx` rewrite): query the
caller's own `mentors` row by `profile_id = auth.uid()`. Show real profile
fields (read + an edit form wired to `update_own_mentor_profile` for the
whitelisted columns). Stat cards (sessions this month, earnings, active
students, availability slots) **stay placeholder zeros** — no data source
exists for any of them until subsystem C (session lifecycle) ships. This is
deliberate scope control, not an oversight: pulling booking data into B
would mean building a slice of C's data model early.

## Migration `0029_mentor_accounts.sql`

- `find_user_id_by_email(p_email text) returns uuid` — security definer,
  queries `auth.users` by lowercased email.
- `update_own_mentor_profile(...)` — security definer, explicit parameter
  list matching the whitelist above, `where profile_id = auth.uid()`.
- No table/column/enum changes. No RLS policy changes.

## Testing

- Existing `tsc` + vitest + lint gates (per project convention — no ad hoc
  curl/manual verification beyond that, per prior feedback in this repo).
- Manual pass through the invite flow using the user's own allowlisted test
  account (`hamzaansari4you@gmail.com` — see memory
  `pz-academy-test-accounts`) as the "existing account gets promoted" case;
  a fresh throwaway email for the "brand-new invite" case. Do not use the
  other two Test Data emails — they're real third parties.

## Out of scope for B (explicitly deferred)

- Session/booking data on the mentor dashboard (subsystem C).
- Messaging, notes, feedback between mentor and mentee (subsystem D).
- Any UI for a mentor to change their own email (Supabase auth email change
  flow) — not asked for, not blocking anything downstream.
