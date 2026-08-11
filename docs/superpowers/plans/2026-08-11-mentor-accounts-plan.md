# Subsystem B: Mentor Auth Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin invite (or link an existing account to) a mentor row so that mentor can log in and self-serve a whitelisted slice of their own public profile, using the auth/role/dashboard scaffolding that already exists.

**Architecture:** Two new SECURITY DEFINER Postgres RPCs (`find_user_id_by_email`, `update_own_mentor_profile`) back an admin-facing invite/link/unlink data layer and a mentor-facing self-edit data layer, each exposed through one new API route and wired into one new/rewritten UI surface. No schema, enum, or route-matcher changes — `user_role.mentor`, `/dashboard/mentor`, and its middleware gate already exist.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Auth, `@supabase/ssr`, `@supabase/supabase-js` admin client), Zod, vitest, Tailwind, `sonner` toasts, Radix `Dialog`.

## Global Constraints

- Repo root: `D:\Claude Code Workspace\PZ Academy\PZ Academy LMS & Site\Recovered Files\pz-academy-platform`. The path contains `&` — never use `npm run <script>`; call binaries directly: `node_modules/.bin/tsc`, `node_modules/.bin/vitest`, `node_modules/.bin/eslint`.
- Never run `next build` while `next dev` is live on the same `.next` folder — corrupts the dev server. Kill the dev server first if a build is needed.
- Every new admin-facing function/route must be gated by `requireAdmin()`/`requireAdminPage()` (`src/lib/auth/require-admin.ts`); every mentor-facing one by the new `requireMentor()`/`requireMentorPage()` (Task 5).
- All Supabase writes on the admin side go through `createAdminSupabase()` (`src/lib/supabase/admin.ts`, service-role, RLS-bypassing) — the route's own auth gate is the security boundary, matching `src/lib/data/admin-mentors.ts`'s existing convention.
- The mentor self-edit RPC is called through the caller's own session client (`createServerSupabase()`), never the admin client — the RPC keys off `auth.uid()`, which only resolves on a real user session.
- Migration file header format matches existing migrations exactly: `-- ============================================================`, `-- Migration NNNN: <title>`, `-- Run AFTER <prior>. SQL Editor → New query → Run`, `-- ============================================================`.
- Test/type/lint commands: `node_modules/.bin/tsc --noEmit`, `node_modules/.bin/vitest run`, `node_modules/.bin/eslint <changed files>`. No ad hoc curl/manual DB checks beyond what's specified in Task 11 — this matches the project's established "clean tsc+vitest+lint is sufficient" convention; data-layer functions here are thin Supabase wrappers with no existing mocking harness in this repo, so they are verified via `tsc` + the manual pass in Task 11, not new unit-test infrastructure.
- Spec: `docs/superpowers/specs/2026-08-11-mentor-accounts-design.md`.

---

### Task 1: Migration 0029 — invite/link and self-edit RPCs

**Files:**
- Create: `supabase/migrations/0029_mentor_accounts.sql`

**Interfaces:**
- Produces: `public.find_user_id_by_email(p_email text) returns uuid` (SECURITY DEFINER, `service_role`-only execute).
- Produces: `public.update_own_mentor_profile(p_short_bio text, p_full_bio text[], p_photo_url text, p_availability_text text, p_intro_video_url text, p_linkedin_url text, p_social_links jsonb, p_skills text[], p_credentials jsonb, p_timezone text, p_session_duration_text text) returns boolean` (SECURITY DEFINER, `authenticated`-execute; returns `true` iff a row matching `profile_id = auth.uid()` was updated).

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration 0029: Mentor accounts (subsystem B)
-- Run AFTER 0028. SQL Editor → New query → Run
-- ============================================================
-- Two SECURITY DEFINER RPCs backing subsystem B (see
-- docs/superpowers/specs/2026-08-11-mentor-accounts-design.md):
--   1. find_user_id_by_email — admin-only email→uuid lookup. profiles has
--      no email column (email only lives in auth.users), so the invite/
--      link admin flow needs a way to check "does this email already have
--      an account" without reaching into auth.users directly from the
--      service-role client's PostgREST surface.
--   2. update_own_mentor_profile — the self-service RPC 0028 deliberately
--      deferred when it dropped "mentors: mentor update own". A raw RLS
--      policy can't express a column whitelist (a mentor with row-level
--      write access could self-publish or reprice); this RPC hard-codes
--      the whitelist to content/marketing fields only. Admin-only fields
--      (slug, name, title, domain, expertise, visibility,
--      price_per_session_pkr, packages, order_index, testimonials) are not
--      parameters here at all — there is no way to pass them even by
--      mistake.

-- ─── find_user_id_by_email ────────────────────────────────────
-- service_role only: this is an email-existence oracle, so it must never
-- be reachable by authenticated/anon. Called from the admin invite/link
-- server action, which is itself gated by requireAdmin().
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

grant execute on function public.find_user_id_by_email(text) to service_role;

-- ─── update_own_mentor_profile ────────────────────────────────
create or replace function public.update_own_mentor_profile(
  p_short_bio             text,
  p_full_bio              text[],
  p_photo_url             text,
  p_availability_text     text,
  p_intro_video_url       text,
  p_linkedin_url          text,
  p_social_links          jsonb,
  p_skills                text[],
  p_credentials           jsonb,
  p_timezone              text,
  p_session_duration_text text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.mentors
  set
    short_bio              = p_short_bio,
    full_bio                = coalesce(p_full_bio, '{}'),
    photo_url                = p_photo_url,
    availability_text        = p_availability_text,
    intro_video_url           = p_intro_video_url,
    linkedin_url               = p_linkedin_url,
    social_links                = coalesce(p_social_links, '[]'::jsonb),
    skills                        = coalesce(p_skills, '{}'),
    credentials                    = coalesce(p_credentials, '[]'::jsonb),
    timezone                        = p_timezone,
    session_duration_text            = p_session_duration_text
  where profile_id = auth.uid();

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

grant execute on function public.update_own_mentor_profile(
  text, text[], text, text, text, text, jsonb, text[], jsonb, text, text
) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Use the `mcp__claude_ai_Supabase__apply_migration` tool (project ref `whqdasotjlhvrjmgiffk`, per memory `pz-academy-build-gotchas`) with the file contents above, name `0029_mentor_accounts`. Confirm it returns success.

- [ ] **Step 3: Verify with advisors**

Call `mcp__claude_ai_Supabase__get_advisors` (type `security`) and confirm no new warnings reference `find_user_id_by_email` or `update_own_mentor_profile`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0029_mentor_accounts.sql
git commit -m "feat(db): add mentor account lookup and self-edit RPCs"
```

---

### Task 2: Admin invite/link email validation schema

**Files:**
- Create: `src/lib/validations/mentor-account.ts`
- Test: `tests/mentor-account.schema.test.ts`

**Interfaces:**
- Produces: `mentorInviteEmailSchema: ZodObject<{ email: ZodString }>`, `type MentorInviteEmailInput = { email: string }`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { mentorInviteEmailSchema } from "@/lib/validations/mentor-account";

describe("mentorInviteEmailSchema", () => {
  it("accepts a valid email", () => {
    const result = mentorInviteEmailSchema.safeParse({ email: "mentor@example.com" });
    expect(result.success).toBe(true);
  });

  it("lowercases and trims the email", () => {
    const result = mentorInviteEmailSchema.safeParse({ email: "  Mentor@Example.com  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("mentor@example.com");
  });

  it("rejects an invalid email", () => {
    const result = mentorInviteEmailSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty email", () => {
    const result = mentorInviteEmailSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run tests/mentor-account.schema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validations/mentor-account'`.

- [ ] **Step 3: Write the schema**

```typescript
import { z } from "zod";

export const mentorInviteEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(255),
});

export type MentorInviteEmailInput = z.infer<typeof mentorInviteEmailSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run tests/mentor-account.schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/mentor-account.ts tests/mentor-account.schema.test.ts
git commit -m "feat: add mentor invite email validation schema"
```

---

### Task 3: Admin data layer — invite, link, unlink, lookup

**Files:**
- Create: `src/lib/data/mentor-accounts.ts`

**Interfaces:**
- Consumes: `createAdminSupabase()` from `@/lib/supabase/admin`.
- Produces:
  - `findAccountIdByEmail(email: string): Promise<string | null>`
  - `type InviteOrCheckResult = { status: "invited"; email: string } | { status: "existing"; email: string } | { status: "error"; reason: "mentor-not-found" | "invite-failed" | "db-error" }`
  - `inviteOrCheckMentorAccount(mentorId: string, email: string, redirectTo: string): Promise<InviteOrCheckResult>`
  - `type ConfirmLinkResult = { ok: true } | { ok: false; reason: "mentor-not-found" | "account-not-found" | "db-error" }`
  - `confirmLinkExistingAccount(mentorId: string, email: string): Promise<ConfirmLinkResult>`
  - `type UnlinkResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" }`
  - `unlinkMentorAccount(mentorId: string): Promise<UnlinkResult>`
  - `getLinkedAccountEmail(profileId: string | null): Promise<string | null>`

- [ ] **Step 1: Write the data layer**

```typescript
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Admin-facing mentor account linking (subsystem B). Mirrors the
 * conventions in src/lib/data/admin-mentors.ts: service-role client, every
 * caller already gated by requireAdmin() at its own route boundary.
 * Separate file from admin-mentors.ts because this is a distinct
 * responsibility (auth account linking) from registry CRUD.
 */

export async function findAccountIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("find_user_id_by_email", { p_email: email });
  if (error) return null;
  return data ?? null;
}

export type InviteOrCheckResult =
  | { status: "invited"; email: string }
  | { status: "existing"; email: string }
  | { status: "error"; reason: "mentor-not-found" | "invite-failed" | "db-error" };

/**
 * Step 1 of the invite flow. If the email already has an account, this
 * does NOT write anything — it returns "existing" so the admin UI can show
 * a confirm dialog before confirmLinkExistingAccount() actually promotes
 * that account. Only a genuinely new email triggers an invite here.
 */
export async function inviteOrCheckMentorAccount(
  mentorId: string,
  email: string,
  redirectTo: string,
): Promise<InviteOrCheckResult> {
  const admin = createAdminSupabase();

  const { data: mentor } = await admin.from("mentors").select("id, name").eq("id", mentorId).maybeSingle();
  if (!mentor) return { status: "error", reason: "mentor-not-found" };

  const existingId = await findAccountIdByEmail(email);
  if (existingId) {
    return { status: "existing", email };
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: mentor.name },
  });
  if (inviteError || !invited?.user) {
    return { status: "error", reason: "invite-failed" };
  }

  // handle_new_user (0003/0017/0018) already inserted a profiles row with
  // role='student' and full_name from raw_user_meta_data.full_name (set
  // above) by the time inviteUserByEmail resolves. Only role needs fixing
  // here — full_name is already correct, and re-setting it would be
  // redundant, not wrong, but role must change before this mentor ever
  // logs in.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "mentor" })
    .eq("id", invited.user.id);
  if (profileError) return { status: "error", reason: "db-error" };

  const { error: mentorError } = await admin
    .from("mentors")
    .update({ profile_id: invited.user.id })
    .eq("id", mentorId);
  if (mentorError) return { status: "error", reason: "db-error" };

  return { status: "invited", email };
}

export type ConfirmLinkResult =
  | { ok: true }
  | { ok: false; reason: "mentor-not-found" | "account-not-found" | "db-error" };

/**
 * Step 2 of the invite flow, only reached after the admin confirms the
 * "this email already has an account" dialog. Promotes that account to
 * role='mentor' and links it. Deliberately does NOT touch full_name — this
 * is an existing account (e.g. a student) with its own real name already
 * set; overwriting it with the mentor registry's marketing name would be
 * wrong.
 */
export async function confirmLinkExistingAccount(mentorId: string, email: string): Promise<ConfirmLinkResult> {
  const admin = createAdminSupabase();

  const { data: mentor } = await admin.from("mentors").select("id").eq("id", mentorId).maybeSingle();
  if (!mentor) return { ok: false, reason: "mentor-not-found" };

  const accountId = await findAccountIdByEmail(email);
  if (!accountId) return { ok: false, reason: "account-not-found" };

  const { error: profileError } = await admin.from("profiles").update({ role: "mentor" }).eq("id", accountId);
  if (profileError) return { ok: false, reason: "db-error" };

  const { error: mentorError } = await admin.from("mentors").update({ profile_id: accountId }).eq("id", mentorId);
  if (mentorError) return { ok: false, reason: "db-error" };

  return { ok: true };
}

export type UnlinkResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

/**
 * Clears mentors.profile_id AND reverts profiles.role back to 'student' —
 * leaving it as 'mentor' with no linked mentor row would be an orphaned
 * account that can still reach /dashboard/mentor (per middleware.ts) with
 * nothing to show.
 */
export async function unlinkMentorAccount(mentorId: string): Promise<UnlinkResult> {
  const admin = createAdminSupabase();

  const { data: mentor } = await admin.from("mentors").select("profile_id").eq("id", mentorId).maybeSingle();
  if (!mentor) return { ok: false, reason: "not-found" };

  const { error: mentorError } = await admin.from("mentors").update({ profile_id: null }).eq("id", mentorId);
  if (mentorError) return { ok: false, reason: "db-error" };

  if (mentor.profile_id) {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ role: "student" })
      .eq("id", mentor.profile_id);
    if (profileError) return { ok: false, reason: "db-error" };
  }

  return { ok: true };
}

/** For display on the admin mentor detail page — no email column on mentors, so this is fetched live via the admin auth API rather than stored. */
export async function getLinkedAccountEmail(profileId: string | null): Promise<string | null> {
  if (!profileId) return null;
  const admin = createAdminSupabase();
  const { data, error } = await admin.auth.admin.getUserById(profileId);
  if (error || !data?.user) return null;
  return data.user.email ?? null;
}
```

- [ ] **Step 2: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors referencing `mentor-accounts.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/mentor-accounts.ts
git commit -m "feat: add admin data layer for mentor account invite/link/unlink"
```

---

### Task 4: Admin API route — `/api/admin/mentors/[id]/account`

**Files:**
- Create: `src/app/api/admin/mentors/[id]/account/route.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`@/lib/auth/require-admin`), `mentorInviteEmailSchema` (Task 2), `inviteOrCheckMentorAccount`/`confirmLinkExistingAccount`/`unlinkMentorAccount` (Task 3).
- Produces: `POST` (invite-or-check), `PUT` (confirm link), `DELETE` (unlink) handlers returning JSON matching the data-layer result shapes.

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { mentorInviteEmailSchema } from "@/lib/validations/mentor-account";
import {
  inviteOrCheckMentorAccount,
  confirmLinkExistingAccount,
  unlinkMentorAccount,
} from "@/lib/data/mentor-accounts";

/** Step 1 of invite: new email -> sends the invite. Already-registered email -> returns "existing" without writing (see PUT). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = mentorInviteEmailSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const result = await inviteOrCheckMentorAccount(id, parsed.data.email, `${req.nextUrl.origin}/reset-password`);
  if (result.status === "error") {
    if (result.reason === "mentor-not-found") {
      return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
    }
    if (result.reason === "invite-failed") {
      return NextResponse.json({ error: "Could not send invite — check the email address." }, { status: 422 });
    }
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }

  return NextResponse.json(result);
}

/** Step 2 of invite: admin confirmed the "this email already has an account" dialog — actually promote + link. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = mentorInviteEmailSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const result = await confirmLinkExistingAccount(id, parsed.data.email);
  if (!result.ok) {
    if (result.reason === "mentor-not-found") {
      return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
    }
    if (result.reason === "account-not-found") {
      return NextResponse.json({ error: "That account no longer exists" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not link account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Clears the link and reverts the account to role='student' — see unlinkMentorAccount's comment. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await unlinkMentorAccount(id);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not unlink account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors referencing `api/admin/mentors/[id]/account/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/admin/mentors/[id]/account/route.ts"
git commit -m "feat: add admin API route for mentor account invite/link/unlink"
```

---

### Task 5: Mentor auth gate — `require-mentor.ts`

**Files:**
- Create: `src/lib/auth/require-mentor.ts`

**Interfaces:**
- Consumes: `createServerSupabase` (`@/lib/supabase/server`), `type Role` (`@/lib/roles`).
- Produces: `isMentorRole(role: Role | null | undefined): boolean`, `requireMentor(): Promise<{ ok: true; user: User; supabase: ServerSupabase } | { ok: false; response: NextResponse }>`, `requireMentorPage(): Promise<{ user: User; supabase: ServerSupabase }>`.

- [ ] **Step 1: Write the module**

```typescript
import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

const MENTOR_ROLES: readonly Role[] = ["mentor", "admin", "super_admin"];

export function isMentorRole(role: Role | null | undefined): boolean {
  return role != null && MENTOR_ROLES.includes(role);
}

/**
 * Mentor gate for ROUTE HANDLERS. Mirrors requireAdmin() in
 * require-admin.ts exactly, including why it's needed: middleware.ts only
 * applies its role check under /dashboard, so /api/mentor/* gets no
 * enforcement from it.
 */
export async function requireMentor(): Promise<
  { ok: true; user: User; supabase: ServerSupabase } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!isMentorRole(profile?.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user, supabase };
}

/** Mentor gate for SERVER COMPONENT PAGES. Mirrors requireAdminPage(). */
export async function requireMentorPage(): Promise<{ user: User; supabase: ServerSupabase }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!isMentorRole(profile?.role)) redirect("/dashboard");

  return { user, supabase };
}
```

- [ ] **Step 2: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors referencing `require-mentor.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/require-mentor.ts
git commit -m "feat: add mentor role auth gate mirroring require-admin.ts"
```

---

### Task 6: Admin UI — `MentorAccountCard` + wire into the mentor detail page

**Files:**
- Create: `src/components/admin/mentors/MentorAccountCard.tsx`
- Modify: `src/app/dashboard/admin/mentors/[id]/page.tsx`
- Modify: `src/lib/data/admin-mentors.ts:86-102` (`getMentorConfig` — add `profileId` to `MentorConfigDetail`)

**Interfaces:**
- Consumes: `getLinkedAccountEmail` (Task 3), `Dialog`/`DialogContent`/`DialogHeader`/`DialogFooter`/`DialogTitle`/`DialogDescription` (`@/components/ui/dialog`), `toast` (`sonner`).
- Produces: `MentorAccountCard({ mentorId, linkedEmail }: { mentorId: string; linkedEmail: string | null }): JSX.Element`.

- [ ] **Step 1: Add `profileId` to `MentorConfigDetail` and thread it through**

In `src/lib/data/admin-mentors.ts`, extend the interface and the return value:

```typescript
export interface MentorConfigDetail extends Mentor {
  visibility: MentorVisibility;
  orderIndex: number;
  bookingCount: number;
  profileId: string | null;
}
```

Update `ADMIN_SELECT` and `getMentorConfig`'s return to include it:

```typescript
const ADMIN_SELECT = `${MENTOR_SELECT}, visibility, order_index, profile_id`;
```

```typescript
  return {
    ...mapMentorRow(data),
    visibility: data.visibility,
    orderIndex: data.order_index,
    bookingCount: count ?? 0,
    profileId: data.profile_id,
  };
```

- [ ] **Step 2: Write `MentorAccountCard`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Unlink, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

export function MentorAccountCard({ mentorId, linkedEmail }: { mentorId: string; linkedEmail: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [unlinkOpen, setUnlinkOpen] = useState(false);

  function sendInvite() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/mentors/${mentorId}/account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { status?: string; email?: string; error?: string }
        | null;

      if (!res.ok) {
        toast.error(payload?.error ?? "Could not process this invite.");
        return;
      }
      if (payload?.status === "existing" && payload.email) {
        setExistingEmail(payload.email);
        return;
      }
      toast.success(`Invite sent to ${payload?.email}.`);
      router.refresh();
    });
  }

  function confirmLink() {
    if (!existingEmail) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/mentors/${mentorId}/account`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: existingEmail }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not link this account.");
        setExistingEmail(null);
        return;
      }
      toast.success(`Linked existing account (${existingEmail}) as this mentor.`);
      setExistingEmail(null);
      router.refresh();
    });
  }

  function confirmUnlink() {
    startTransition(async () => {
      const res = await fetch(`/api/admin/mentors/${mentorId}/account`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not unlink this account.");
        setUnlinkOpen(false);
        return;
      }
      toast.success("Account unlinked.");
      setUnlinkOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="bg-pz-surface-container-lowest p-6 sm:p-8 rounded-xl border border-pz-outline-variant space-y-4">
      <h3 className="font-headline text-lg font-bold text-pz-on-surface border-b border-pz-outline-variant pb-4 flex items-center gap-2">
        <Mail className="w-5 h-5 text-pz-primary" />
        Mentor Account
      </h3>

      {linkedEmail ? (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-body text-sm text-pz-on-surface">
              Linked to <span className="font-bold">{linkedEmail}</span>
            </p>
            <p className="font-body text-xs text-pz-on-surface-variant mt-0.5">
              This account can log in at /dashboard/mentor with role &ldquo;mentor&rdquo;.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUnlinkOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-pz-danger text-pz-danger font-headline font-bold text-sm rounded-lg hover:bg-pz-danger/10 transition-colors"
          >
            <Unlink className="w-4 h-4" />
            Unlink account
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className={labelClass}>Mentor&apos;s email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mentor@example.com"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={sendInvite}
            disabled={isPending || email.trim().length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 self-end bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {isPending ? "Working…" : "Invite Mentor"}
          </button>
        </div>
      )}

      <Dialog open={existingEmail !== null} onOpenChange={(open) => !open && setExistingEmail(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Link existing account?</DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant">
              {existingEmail} already has an account. Promote it to mentor and link it to this profile?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setExistingEmail(null)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmLink}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-primary-container text-pz-on-primary-container hover:shadow-md transition-all disabled:opacity-50"
            >
              {isPending ? "Linking…" : "Link account"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Unlink this account?</DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant">
              The account itself isn&apos;t deleted, but it loses mentor access and reverts to a regular student
              account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setUnlinkOpen(false)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmUnlink}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-danger text-white hover:bg-pz-danger/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Unlinking…" : "Unlink"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
```

- [ ] **Step 3: Wire it into the mentor detail page**

`src/app/dashboard/admin/mentors/[id]/page.tsx` currently renders only `<MentorConfigForm mentor={mentor} />`. Add the account card below it:

```typescript
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getMentorConfig } from "@/lib/data/admin-mentors";
import { getLinkedAccountEmail } from "@/lib/data/mentor-accounts";
import { MentorConfigForm } from "@/components/admin/mentors/MentorConfigForm";
import { MentorAccountCard } from "@/components/admin/mentors/MentorAccountCard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mentor = await getMentorConfig(id);
  return { title: mentor ? `${mentor.name} — PZ Academy Admin` : "Mentor — PZ Academy" };
}

export default async function MentorConfigPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const mentor = await getMentorConfig(id);
  if (!mentor) notFound();

  const linkedEmail = await getLinkedAccountEmail(mentor.profileId);

  return (
    <div className="max-w-4xl space-y-6">
      <MentorAccountCard mentorId={mentor.id} linkedEmail={linkedEmail} />
      <MentorConfigForm mentor={mentor} />
    </div>
  );
}
```

- [ ] **Step 4: Type-check and lint**

Run: `node_modules/.bin/tsc --noEmit`
Run: `node_modules/.bin/eslint src/components/admin/mentors/MentorAccountCard.tsx "src/app/dashboard/admin/mentors/[id]/page.tsx" src/lib/data/admin-mentors.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/mentors/MentorAccountCard.tsx "src/app/dashboard/admin/mentors/[id]/page.tsx" src/lib/data/admin-mentors.ts
git commit -m "feat: add mentor account invite/link/unlink UI to admin mentor detail page"
```

---

### Task 7: Mentor self-edit validation schema

**Files:**
- Modify: `src/lib/validations/admin-mentor.ts:61-67` (export the existing private `photoUrl` const)
- Create: `src/lib/validations/mentor-self.ts`
- Test: `tests/mentor-self.schema.test.ts`

**Interfaces:**
- Consumes: `url` (`@/lib/validations/admin-lms`), `photoUrl` (exported from `@/lib/validations/admin-mentor`), `mentorSocialLinkSchema`/`mentorCredentialSchema`/`MENTOR_TIMEZONES` (`@/lib/validations/admin-mentor`).
- Produces: `mentorSelfEditSchema: ZodObject<...>`, `type MentorSelfEditInput`.

- [ ] **Step 1: Export `photoUrl` from `admin-mentor.ts`**

Change `const photoUrl = z` (line 61) to `export const photoUrl = z` — no other change to that block.

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { mentorSelfEditSchema } from "@/lib/validations/mentor-self";

const valid = {
  shortBio: "Updated bio.",
  fullBio: ["Paragraph one."],
  photoUrl: "/mentor-dr-roha.png",
  availabilityText: "Mon, Wed",
  introVideoUrl: "https://youtube.com/watch?v=abc",
  linkedinUrl: "https://linkedin.com/in/example",
  socialLinks: [{ label: "Twitter", url: "https://twitter.com/example" }],
  skills: ["Clinical Knowledge"],
  credentials: [{ title: "MBBS", institution: "Pakistan", icon: "GraduationCap" }],
  timezone: "Asia/Karachi",
  sessionDurationText: "60 min",
};

describe("mentorSelfEditSchema", () => {
  it("accepts a full payload", () => {
    expect(mentorSelfEditSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an empty payload — every field is optional", () => {
    expect(mentorSelfEditSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an invalid introVideoUrl", () => {
    const result = mentorSelfEditSchema.safeParse({ ...valid, introVideoUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("has no pricing, visibility, or identity fields", () => {
    const shape = mentorSelfEditSchema.shape;
    expect(shape).not.toHaveProperty("pricePerSessionPkr");
    expect(shape).not.toHaveProperty("visibility");
    expect(shape).not.toHaveProperty("name");
    expect(shape).not.toHaveProperty("slug");
    expect(shape).not.toHaveProperty("packages");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node_modules/.bin/vitest run tests/mentor-self.schema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validations/mentor-self'`.

- [ ] **Step 4: Write the schema**

```typescript
import { z } from "zod";
import { url } from "@/lib/validations/admin-lms";
import { photoUrl, mentorSocialLinkSchema, mentorCredentialSchema, MENTOR_TIMEZONES } from "@/lib/validations/admin-mentor";

/**
 * The self-service whitelist from migration 0029's update_own_mentor_profile
 * RPC, mirrored here for form validation. Content/marketing fields only —
 * no slug, name, title, domain, expertise, visibility,
 * price_per_session_pkr, packages, order_index, or testimonials. Every
 * field is optional so a mentor can save a partial edit.
 */
export const mentorSelfEditSchema = z.object({
  shortBio: z.string().trim().max(500).optional(),
  fullBio: z.array(z.string().trim().min(1)).max(20).optional(),
  photoUrl,
  availabilityText: z.string().trim().max(200).optional(),
  introVideoUrl: url,
  linkedinUrl: url,
  socialLinks: z.array(mentorSocialLinkSchema).max(10).optional(),
  skills: z.array(z.string().trim().min(1)).max(20).optional(),
  credentials: z.array(mentorCredentialSchema).max(20).optional(),
  timezone: z.enum(MENTOR_TIMEZONES).optional(),
  sessionDurationText: z.string().trim().max(50).optional(),
});

export type MentorSelfEditInput = z.infer<typeof mentorSelfEditSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node_modules/.bin/vitest run tests/mentor-self.schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite to check nothing else broke from exporting `photoUrl`**

Run: `node_modules/.bin/vitest run`
Expected: all tests still pass (in particular `tests/admin-mentor.schema.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/validations/admin-mentor.ts src/lib/validations/mentor-self.ts tests/mentor-self.schema.test.ts
git commit -m "feat: add mentor self-edit validation schema"
```

---

### Task 8: Mentor-facing data layer — read + RPC-backed write

**Files:**
- Create: `src/lib/data/mentor-self.ts`

**Interfaces:**
- Consumes: `createAdminSupabase` (`@/lib/supabase/admin`), `mapMentorRow`/`MENTOR_SELECT`/`type Mentor` (`@/lib/data/mentors`), `createServerSupabase` (`@/lib/supabase/server`), `type MentorSelfEditInput` (Task 7).
- Produces: `getOwnMentorProfile(profileId: string): Promise<Mentor | null>`, `type UpdateOwnProfileResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" }`, `updateOwnMentorProfile(supabase: Awaited<ReturnType<typeof createServerSupabase>>, input: MentorSelfEditInput): Promise<UpdateOwnProfileResult>`.

- [ ] **Step 1: Write the data layer**

```typescript
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { mapMentorRow, MENTOR_SELECT, type Mentor } from "@/lib/data/mentors";
import type { MentorSelfEditInput } from "@/lib/validations/mentor-self";

/**
 * Mentor-facing self-service data layer (subsystem B). The read goes
 * through the service-role client — the caller is already gated by
 * requireMentor()/requireMentorPage() at its own route boundary, same
 * convention as admin-mentors.ts. The write does NOT: it must go through
 * the caller's own session client so update_own_mentor_profile's
 * `where profile_id = auth.uid()` resolves to the real caller, not the
 * service role (which has no matching auth.uid()).
 */

export async function getOwnMentorProfile(profileId: string): Promise<Mentor | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentors").select(MENTOR_SELECT).eq("profile_id", profileId).maybeSingle();
  if (!data) return null;
  return mapMentorRow(data);
}

export type UpdateOwnProfileResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export async function updateOwnMentorProfile(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  input: MentorSelfEditInput,
): Promise<UpdateOwnProfileResult> {
  const { data, error } = await supabase.rpc("update_own_mentor_profile", {
    p_short_bio: input.shortBio ?? null,
    p_full_bio: input.fullBio ?? [],
    p_photo_url: input.photoUrl ?? null,
    p_availability_text: input.availabilityText ?? null,
    p_intro_video_url: input.introVideoUrl ?? null,
    p_linkedin_url: input.linkedinUrl ?? null,
    p_social_links: input.socialLinks ?? [],
    p_skills: input.skills ?? [],
    p_credentials: input.credentials ?? [],
    p_timezone: input.timezone ?? null,
    p_session_duration_text: input.sessionDurationText ?? null,
  });

  if (error) return { ok: false, reason: "db-error" };
  if (data !== true) return { ok: false, reason: "not-found" };
  return { ok: true };
}
```

- [ ] **Step 2: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors referencing `mentor-self.ts`. If the generated `Database` type doesn't yet know about `update_own_mentor_profile`'s RPC signature (this repo hand-edits `database.types.ts`, no codegen script — see memory `pz-academy-mentorship-subsystem-status`), add the `Functions` entry by hand in `src/lib/supabase/database.types.ts`'s `public` schema block:

```typescript
      find_user_id_by_email: {
        Args: { p_email: string }
        Returns: string
      }
      update_own_mentor_profile: {
        Args: {
          p_short_bio: string | null
          p_full_bio: string[] | null
          p_photo_url: string | null
          p_availability_text: string | null
          p_intro_video_url: string | null
          p_linkedin_url: string | null
          p_social_links: Json | null
          p_skills: string[] | null
          p_credentials: Json | null
          p_timezone: string | null
          p_session_duration_text: string | null
        }
        Returns: boolean
      }
```

Place both inside the existing `Functions: { ... }` block alongside `get_my_role`, `complete_lesson`, etc. Re-run `node_modules/.bin/tsc --noEmit` after adding these.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/mentor-self.ts src/lib/supabase/database.types.ts
git commit -m "feat: add mentor self-service data layer for own-profile read/write"
```

---

### Task 9: Mentor-facing API route — `/api/mentor/profile`

**Files:**
- Create: `src/app/api/mentor/profile/route.ts`

**Interfaces:**
- Consumes: `requireMentor` (Task 5), `mentorSelfEditSchema` (Task 7), `updateOwnMentorProfile` (Task 8).
- Produces: `PATCH` handler returning `{ ok: true }` or `{ error: string }`.

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { mentorSelfEditSchema } from "@/lib/validations/mentor-self";
import { updateOwnMentorProfile } from "@/lib/data/mentor-self";

/** Saves the mentor's own profile edit form. Whitelisted columns only — see mentorSelfEditSchema and migration 0029's update_own_mentor_profile. */
export async function PATCH(req: NextRequest) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const parsed = mentorSelfEditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateOwnMentorProfile(auth.supabase, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "No mentor profile is linked to your account." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors referencing `api/mentor/profile/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mentor/profile/route.ts
git commit -m "feat: add mentor-facing API route for self-service profile edits"
```

---

### Task 10: Rewrite the mentor dashboard stub with real profile data

**Files:**
- Modify: `src/app/dashboard/mentor/page.tsx` (full rewrite)
- Create: `src/components/mentor/MentorSelfProfileForm.tsx`

**Interfaces:**
- Consumes: `requireMentorPage` (Task 5), `getOwnMentorProfile` (Task 8), `StatCard` (`@/components/dashboard/StatCard`, unchanged), `StringListRepeater`/`SocialLinkRepeater`/`CredentialRepeater` (`@/components/admin/mentors/*`, reused as-is), `MENTOR_TIMEZONES` (`@/lib/validations/admin-mentor`), `ImageUploadField` (`@/components/admin/program/ImageUploadField`).
- Produces: `MentorSelfProfileForm({ mentor }: { mentor: Mentor }): JSX.Element`.

- [ ] **Step 1: Write `MentorSelfProfileForm`**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { ImageUploadField } from "@/components/admin/program/ImageUploadField";
import { StringListRepeater } from "@/components/admin/mentors/StringListRepeater";
import { SocialLinkRepeater } from "@/components/admin/mentors/SocialLinkRepeater";
import { CredentialRepeater } from "@/components/admin/mentors/CredentialRepeater";
import { MENTOR_TIMEZONES } from "@/lib/validations/admin-mentor";
import type { Mentor, MentorCredential, MentorSocialLink } from "@/lib/data/mentors";

type FormState = {
  shortBio: string;
  fullBio: string[];
  photoUrl: string;
  availabilityText: string;
  introVideoUrl: string;
  linkedinUrl: string;
  socialLinks: MentorSocialLink[];
  skills: string[];
  credentials: MentorCredential[];
  timezone: string;
  sessionDurationText: string;
};

function toFormState(mentor: Mentor): FormState {
  return {
    shortBio: mentor.shortBio,
    fullBio: mentor.fullBio,
    photoUrl: mentor.photo,
    availabilityText: mentor.availability,
    introVideoUrl: mentor.introVideoUrl,
    linkedinUrl: mentor.linkedinUrl,
    socialLinks: mentor.socialLinks,
    skills: mentor.skills,
    credentials: mentor.credentials,
    timezone: mentor.timezone,
    sessionDurationText: mentor.sessionDurationText,
  };
}

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

export function MentorSelfProfileForm({ mentor }: { mentor: Mentor }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() => toFormState(mentor));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const res = await fetch("/api/mentor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shortBio: form.shortBio.trim() || undefined,
          fullBio: form.fullBio.filter((p) => p.trim().length > 0),
          photoUrl: form.photoUrl.trim() || undefined,
          availabilityText: form.availabilityText.trim() || undefined,
          introVideoUrl: form.introVideoUrl.trim() || undefined,
          linkedinUrl: form.linkedinUrl.trim() || undefined,
          socialLinks: form.socialLinks.filter((l) => l.label.trim().length > 0 && l.url.trim().length > 0),
          skills: form.skills.filter((s) => s.trim().length > 0),
          credentials: form.credentials.filter((c) => c.title.trim().length > 0),
          timezone: form.timezone || undefined,
          sessionDurationText: form.sessionDurationText.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not save changes.");
        return;
      }
      toast.success("Profile updated.");
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl shadow-card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-montserrat font-bold text-pz-forest text-base">My Profile</h2>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-pz-lime text-pz-forest font-semibold text-sm rounded-lg hover:bg-pz-mint transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isPending ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div>
        <label className={labelClass}>Short Bio</label>
        <textarea value={form.shortBio} onChange={(e) => set("shortBio", e.target.value)} rows={2} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Full Bio (one paragraph per row)</label>
        <StringListRepeater
          value={form.fullBio}
          onChange={(v) => set("fullBio", v)}
          multiline
          placeholder="Paragraph…"
          addLabel="Add Paragraph"
        />
      </div>

      <div>
        <label className={labelClass}>Photo</label>
        <ImageUploadField
          value={form.photoUrl}
          onChange={(url) => set("photoUrl", url)}
          courseSlug={mentor.slug}
          kind="mentor-photo"
          inputClassName={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>Availability Blurb</label>
          <input
            type="text"
            value={form.availabilityText}
            onChange={(e) => set("availabilityText", e.target.value)}
            placeholder="e.g. Mon, Tue, Fri (Full Day)"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Session Duration Display Override</label>
          <input
            type="text"
            value={form.sessionDurationText}
            onChange={(e) => set("sessionDurationText", e.target.value)}
            placeholder="e.g. 60–90 min"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Intro Video URL</label>
          <input
            type="text"
            value={form.introVideoUrl}
            onChange={(e) => set("introVideoUrl", e.target.value)}
            placeholder="https://youtube.com/..."
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>LinkedIn URL</label>
          <input
            type="text"
            value={form.linkedinUrl}
            onChange={(e) => set("linkedinUrl", e.target.value)}
            placeholder="https://linkedin.com/in/..."
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Timezone</label>
          <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className={inputClass}>
            <option value="">—</option>
            {MENTOR_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Other Social Links</label>
        <SocialLinkRepeater value={form.socialLinks} onChange={(v) => set("socialLinks", v)} />
      </div>

      <div>
        <label className={labelClass}>Skills</label>
        <StringListRepeater value={form.skills} onChange={(v) => set("skills", v)} placeholder="Skill…" addLabel="Add Skill" />
      </div>

      <div>
        <label className={labelClass}>Credentials</label>
        <CredentialRepeater value={form.credentials} onChange={(v) => set("credentials", v)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the mentor dashboard page**

```typescript
import { requireMentorPage } from "@/lib/auth/require-mentor";
import { getOwnMentorProfile } from "@/lib/data/mentor-self";
import { StatCard } from "@/components/dashboard/StatCard";
import { MentorSelfProfileForm } from "@/components/mentor/MentorSelfProfileForm";
import { GraduationCap, Calendar, DollarSign, Clock } from "lucide-react";

export const metadata = { title: "Mentor Dashboard — PZ Academy" };

export default async function MentorDashboard() {
  const { user, supabase } = await requireMentorPage();

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const firstName = profile?.full_name?.split(" ")[0] ?? "Mentor";

  const mentor = await getOwnMentorProfile(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-montserrat font-bold text-2xl text-pz-forest">Welcome back, {firstName}</h1>
        <p className="text-pz-muted text-sm mt-1">Manage your students and sessions from here.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Active Students" value={0} icon={GraduationCap} />
        <StatCard label="Sessions This Month" value={0} icon={Calendar} iconBg="bg-pz-pine/10" />
        <StatCard label="Earnings (PKR)" value="—" icon={DollarSign} iconBg="bg-pz-lime/20" />
        <StatCard label="Availability Slots" value={0} icon={Clock} iconBg="bg-pz-frost" />
      </div>

      {mentor ? (
        <MentorSelfProfileForm mentor={mentor} />
      ) : (
        <div className="bg-white rounded-xl shadow-card p-6">
          <p className="text-pz-muted text-sm">
            No mentor profile is linked to your account yet. Contact an admin to get set up.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-card p-6">
          <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">Upcoming Sessions</h2>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Calendar className="w-10 h-10 text-pz-border mb-3" />
            <p className="text-pz-muted text-sm">No sessions scheduled.</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-card p-6">
          <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">My Students</h2>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <GraduationCap className="w-10 h-10 text-pz-border mb-3" />
            <p className="text-pz-muted text-sm">No active students yet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check and lint**

Run: `node_modules/.bin/tsc --noEmit`
Run: `node_modules/.bin/eslint src/components/mentor/MentorSelfProfileForm.tsx src/app/dashboard/mentor/page.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/mentor/page.tsx src/components/mentor/MentorSelfProfileForm.tsx
git commit -m "feat: wire real mentor profile data into the mentor dashboard"
```

---

### Task 11: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Full test suite**

Run: `node_modules/.bin/vitest run`
Expected: all tests pass, including the new `tests/mentor-account.schema.test.ts` and `tests/mentor-self.schema.test.ts`.

- [ ] **Step 3: Lint**

Run: `node_modules/.bin/eslint src`
Expected: 0 errors (warnings acceptable only if the existing baseline already has them).

- [ ] **Step 4: Confirm the dev server is running cleanly**

Per the project's build gotcha: never run `next build` while `next dev` is live. If `next dev` isn't already running, start it with `node_modules/.bin/next dev -p 3945` (or whatever port this repo's `.env`/README specifies) — do not run a `next build` alongside it.

- [ ] **Step 5: Manual click-through — brand-new invite**

Using the running dev server and the admin's own session:
1. Go to `/dashboard/admin/mentors`, open any mentor's detail page.
2. In the new "Mentor Account" card, enter a fresh throwaway email (not one of the two off-limits Test Data emails — see memory `pz-academy-test-accounts`) and click "Invite Mentor".
3. Confirm the toast says "Invite sent to …" and the card now shows "Linked to …".
4. Confirm in Supabase (`mcp__claude_ai_Supabase__execute_sql`, read-only `select id, role from profiles where id = '<the new user id>'`) that `role = 'mentor'`.

- [ ] **Step 6: Manual click-through — link an existing account**

1. On a different mentor's detail page, enter `hamzaansari4you@gmail.com` (the user's own allowlisted test-student account — see memory `pz-academy-test-accounts`) and click "Invite Mentor".
2. Confirm the "Link existing account?" dialog appears (not a fresh invite).
3. Confirm, then confirm the card shows "Linked to hamzaansari4you@gmail.com" and a toast confirms the link.
4. Log in as that account, confirm `/dashboard/mentor` now shows the linked mentor's real profile fields (not the old hardcoded zeros/placeholders) and the profile edit form.
5. Edit one whitelisted field (e.g. Short Bio), save, confirm the toast says "Profile updated." and the change persists on reload.
6. As that same mentor session, confirm there is no way in the UI to change price, packages, visibility, name, or slug (the form has no such fields).

- [ ] **Step 7: Manual click-through — unlink**

1. Back on the admin side, on the mentor detail page linked to `hamzaansari4you@gmail.com`, click "Unlink account", confirm.
2. Confirm the card reverts to the empty invite form.
3. Confirm via SQL that this account's `profiles.role` is back to `'student'`.
4. Confirm that account can no longer reach `/dashboard/mentor` (redirects to `/dashboard`, per `requireMentorPage`/middleware).

- [ ] **Step 8: Final commit if any fixes were needed during verification**

If Steps 1-7 required any code fixes, commit them individually with a message describing what was fixed, following this repo's convention of one commit per fix rather than folding fixes into earlier task commits.

---

## Self-Review Notes

- **Spec coverage:** every section of the spec (invite/link/unlink flow, existing-account confirm step, self-edit RPC + whitelist, dashboard rewrite, migration 0029, testing, out-of-scope items) maps to a task above (Tasks 1-11).
- **Placeholder scan:** no TBD/TODO; every step has real, complete code.
- **Type consistency:** `MentorConfigDetail.profileId`, `getLinkedAccountEmail(profileId)`, `MentorAccountCard({ mentorId, linkedEmail })`, `getOwnMentorProfile(profileId)`, `updateOwnMentorProfile(supabase, input)`, and the RPC param names (`p_short_bio`, etc.) are used identically across Tasks 3, 6, 8, 9, and the migration in Task 1 — checked for drift while writing.
- **Fixed during self-review:** the initial `inviteOrCheckMentorAccount`/`confirmLinkExistingAccount` draft overwrote `profiles.full_name` on the link-existing-account path, which would have clobbered a real student's name with the mentor registry's marketing name — corrected to only touch `role` there (Task 3's code already reflects the fix).
