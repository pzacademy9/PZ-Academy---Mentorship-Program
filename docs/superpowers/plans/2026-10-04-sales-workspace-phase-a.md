# Sales Workspace Phase A (Role and Access) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `sales_agent` role that can reach only an empty Sales Workspace shell, with server-side gates and an ownership rule ready for Phase B, an admin screen to add and remove sales agents, and a fix for a live role self-escalation hole.

**Architecture:** Role plumbing is pure and unit-tested (`roles.ts`, a new `access.ts` path allowlist used by `middleware.ts`, nav items). Server gates mirror `require-mentor.ts`. Ownership rules are a pure module (`crm/ownership.ts`) so Phase B routes can call it. Admin account handling mirrors the existing mentor invite flow (`data/mentor-accounts.ts`). Migrations are committed as files only; applying them to the live database is a separate step the owner approves (Task 7).

**Tech Stack:** Next.js App Router, TypeScript, Tailwind v3, Supabase (Postgres, service-role client in server code), Zod, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-04-sales-agent-workspace-design.md` (Sections 1 and 3 for Phase A; Phases B and C are separate plans).

## Global Constraints

- `npm run` is broken by the `&` in the folder path. Run `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/vitest/vitest.mjs run` (single file: `node node_modules/vitest/vitest.mjs run tests/<file>`).
- Never edit or regenerate `src/lib/supabase/database.types.ts` wholesale. Hand-add only the entries named in Task 2.
- Never `next build` while the dev server runs. Do not start or stop servers in this plan.
- Never push. Stage explicit paths only. Leave the untracked `docs/lead-capture-go-live-guide.md` alone.
- Do not apply migrations to any database in Tasks 1-6. Applying is Task 7 and needs the owner's approval.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Light and dark mode both must work: use existing `pz-*` token classes only (adaptive text, never adaptive text on a constant-light background without a `dark:` pair; `solid-*` for backgrounds and borders of brand colours).
- A `sales_agent` may reach only `/dashboard/sales/**`, `/dashboard/settings/**`, `/dashboard/notifications/**` inside `/dashboard`. Admin and mentor gates are unchanged.
- Admin routes under `/api/admin/*` stay admin-only. Sales routes will live under `/api/sales/*` (Phase B) and use `requireSalesAgent()`.
- Migration file names continue the sequence: `0060`, `0061`, `0062`.

## Review Focus

- A role downgrade or promotion must never touch an `admin`/`super_admin` account: inviting or promoting an email that belongs to an admin must be refused, not demoted (Task 5 tests the pure decision function).
- A mentor email must not be silently converted to a sales agent: the account would lose mentor access (Task 5 decision function).
- Path allowlist edge cases: `/dashboard/salesforce`, `/dashboard/sales/../admin`, `/dashboard/settingsx`, trailing slash, empty path (Task 3 tests).
- Empty-string ids: an actor with an empty `id` must never match a contact with an empty `owner_id` (Task 4 tests).
- Removing a sales agent must release their contacts to unclaimed and must not leave a role that still reaches the workspace (Task 5, data layer order of operations).
- Every `/api/admin/*` route must keep its role gate; one existing exception (`uploads/image` uses `requireMentor`) is pinned so no new exception can slip in (Task 4 structural test).

---

### Task 1: Close the live role self-escalation hole

**Why:** Verified read-only on 2026-10-04 against the live project: `authenticated` holds `UPDATE` on `profiles.role`, the policy `profiles: own row update` only checks `id = auth.uid()`, and the only trigger on `profiles` is `updated_at`. Any signed-in user can therefore set their own role to `admin` with the public anon key. Every existing app flow that changes a role uses the service-role client (`data/mentor-accounts.ts`), so blocking client-side role changes breaks nothing. Security-definer functions run as their owner (`postgres`), so they are unaffected.

**Files:**
- Create: `supabase/migrations/0060_block_profile_role_self_change.sql`
- Test: `tests/migrations-sales-role.test.ts` (created here, extended in Task 2)

**Interfaces:**
- Consumes: nothing.
- Produces: the guarantee that a role change succeeds only from the service role, `postgres` or other privileged roles, never from `authenticated` or `anon`.

- [ ] **Step 1: Write the failing test**

Create `tests/migrations-sales-role.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name: string) =>
  readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");

describe("0060 block profile role self-change", () => {
  const sql = read("0060_block_profile_role_self_change.sql");

  it("defines a trigger function that raises for authenticated and anon role changes", () => {
    expect(sql).toMatch(/create or replace function public\.prevent_role_self_change\(\)/i);
    expect(sql).toMatch(/new\.role is distinct from old\.role/i);
    expect(sql).toMatch(/current_user in \('authenticated', 'anon'\)/i);
    expect(sql).toMatch(/raise exception/i);
  });

  it("attaches it as a BEFORE UPDATE OF role trigger on profiles", () => {
    expect(sql).toMatch(/create trigger profiles_prevent_role_change/i);
    expect(sql).toMatch(/before update of role on public\.profiles/i);
    expect(sql).toMatch(/for each row/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/migrations-sales-role.test.ts`
Expected: FAIL (ENOENT, the migration file does not exist).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0060_block_profile_role_self_change.sql`:

```sql
-- Migration 0060: stop signed-in users from changing profiles.role.
--
-- profiles has the RLS policy "own row update" (id = auth.uid()) and the
-- authenticated role holds UPDATE on every column, so a user could run
--   update profiles set role = 'admin' where id = auth.uid()
-- with the public anon key. All legitimate role changes in this app use the
-- service-role client (current_user is service_role/postgres there), and
-- SECURITY DEFINER functions run as their owner, so only direct client
-- writes are blocked.

create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.role is distinct from old.role and current_user in ('authenticated', 'anon') then
    raise exception 'profiles.role can only be changed by an administrator action'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_change on public.profiles;

create trigger profiles_prevent_role_change
  before update of role on public.profiles
  for each row
  execute function public.prevent_role_self_change();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node node_modules/vitest/vitest.mjs run tests/migrations-sales-role.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Confirm no app code changes a role through a user session**

Run (Grep tool or shell): search `src` for `.update({ role`. Expected: only `src/lib/data/mentor-accounts.ts` (service-role client, lines ~62, ~105, ~149). If any other hit uses `createServerSupabase()` instead of `createAdminSupabase()`, stop and report it; do not continue.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0060_block_profile_role_self_change.sql tests/migrations-sales-role.test.ts
git commit -m "fix(security): block signed-in users from changing profiles.role"
```

---

### Task 2: sales_agent enum value, contact ownership columns, type entries

**Files:**
- Create: `supabase/migrations/0061_sales_agent_role.sql`
- Create: `supabase/migrations/0062_contact_ownership.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-edit, three spots; see Step 4)
- Modify: `tests/migrations-sales-role.test.ts`

**Interfaces:**
- Consumes: Task 1's test file.
- Produces: `Database["public"]["Enums"]["user_role"]` includes `"sales_agent"`; `contacts` rows have `owner_id: string | null` and `claimed_at: string | null`.

- [ ] **Step 1: Extend the failing test**

Append to `tests/migrations-sales-role.test.ts`:

```ts
describe("0061 sales_agent enum value", () => {
  const sql = read("0061_sales_agent_role.sql");

  it("only adds the enum value (a new value cannot be used in the same transaction)", () => {
    expect(sql).toMatch(/alter type public\.user_role add value if not exists 'sales_agent'/i);
    expect(sql).not.toMatch(/\bupdate\b|\binsert\b|create policy/i);
  });
});

describe("0062 contact ownership", () => {
  const sql = read("0062_contact_ownership.sql");

  it("adds owner_id referencing profiles with set null, and claimed_at", () => {
    expect(sql).toMatch(/add column if not exists owner_id uuid references public\.profiles\(id\) on delete set null/i);
    expect(sql).toMatch(/add column if not exists claimed_at timestamptz/i);
  });

  it("indexes owner_id", () => {
    expect(sql).toMatch(/create index if not exists contacts_owner_id_idx on public\.contacts \(owner_id\)/i);
  });
});

describe("database.types.ts hand edits", () => {
  const types = readFileSync(join(process.cwd(), "src", "lib", "supabase", "database.types.ts"), "utf8");

  it("lists sales_agent in the user_role union and the constants array", () => {
    expect(types).toContain('user_role: "student" | "mentor" | "admin" | "super_admin" | "sales_agent"');
    expect(types).toContain('user_role: ["student", "mentor", "admin", "super_admin", "sales_agent"]');
  });

  it("adds owner_id and claimed_at to contacts Row, Insert and Update", () => {
    const contacts = types.slice(types.indexOf("      contacts: {"), types.indexOf("      courses: {"));
    expect(contacts.match(/owner_id\??: string \| null/g)?.length).toBe(3);
    expect(contacts.match(/claimed_at\??: string \| null/g)?.length).toBe(3);
    expect(contacts).toContain('foreignKeyName: "contacts_owner_id_fkey"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/migrations-sales-role.test.ts`
Expected: FAIL (new migration files missing; type strings absent).

- [ ] **Step 3: Write the migrations**

Create `supabase/migrations/0061_sales_agent_role.sql`:

```sql
-- Migration 0061: add the sales_agent role.
-- Kept alone on purpose: a newly added enum value cannot be used in the same
-- transaction that adds it, so nothing else lives in this file.
alter type public.user_role add value if not exists 'sales_agent';
```

Create `supabase/migrations/0062_contact_ownership.sql`:

```sql
-- Migration 0062: contact ownership for the sales workspace.
-- owner_id is the sales agent who has claimed the contact (null = unclaimed).
-- Existing contacts stay unclaimed; no backfill.
alter table public.contacts
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz;

create index if not exists contacts_owner_id_idx on public.contacts (owner_id);
```

- [ ] **Step 4: Hand-edit `src/lib/supabase/database.types.ts`** (never regenerate)

Four edits, using the Edit tool with exact strings:

1. Replace `      user_role: "student" | "mentor" | "admin" | "super_admin"` with `      user_role: "student" | "mentor" | "admin" | "super_admin" | "sales_agent"`.
2. Replace `      user_role: ["student", "mentor", "admin", "super_admin"],` with `      user_role: ["student", "mentor", "admin", "super_admin", "sales_agent"],`.
3. Inside the `contacts` block (between `      contacts: {` and `      courses: {`), add in alphabetical position:
   - In `Row`: add `claimed_at: string | null` immediately before `consent_basis`, and `owner_id: string | null` immediately after `id: string`.
   - In `Insert`: `claimed_at?: string | null` before `consent_basis?`, and `owner_id?: string | null` after `id?: string`.
   - In `Update`: same two optional lines as `Insert`.
4. In the `contacts` `Relationships` array, add after the `contacts_profile_id_fkey` object:

```ts
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
```

Note: edit 3 must be made on the `contacts` table only (the `Row`, `Insert` and `Update` of `contacts`), not on any other table that also has an `id` line. Use enough surrounding context (`consent_basis: Database["public"]["Enums"]["crm_consent_basis"]` followed by `country: string | null` is unique to `contacts` Row) to make each replacement unique.

- [ ] **Step 5: Run the test and tsc**

Run: `node node_modules/vitest/vitest.mjs run tests/migrations-sales-role.test.ts` then `node node_modules/typescript/bin/tsc --noEmit`
Expected: test PASS; tsc has errors only where an exhaustive `Role` or `user_role` mapping now needs `sales_agent`. Task 3 fixes those; if tsc shows errors outside role handling, stop and report.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0061_sales_agent_role.sql supabase/migrations/0062_contact_ownership.sql src/lib/supabase/database.types.ts tests/migrations-sales-role.test.ts
git commit -m "feat(db): sales_agent role and contact ownership columns"
```

---

### Task 3: Role plumbing, path allowlist, middleware, navigation

**Files:**
- Modify: `src/lib/roles.ts`
- Create: `src/lib/access.ts`
- Modify: `src/middleware.ts`
- Modify: `src/components/dashboard/nav.ts`
- Modify: `tests/roles.test.ts`
- Create: `tests/access.test.ts`
- Modify: `tests/dashboard-nav.test.ts`

**Interfaces:**
- Consumes: `Role` including `"sales_agent"` (Task 2 types).
- Produces: `Role` type with `sales_agent`; `isSalesRole(role)`; `salesAgentMayAccess(path: string): boolean`; `salesAgentRedirect(role: Role, path: string): string | null`; nav items for `sales_agent` and an admin "Sales Team" item.

- [ ] **Step 1: Write the failing tests**

Append to `tests/roles.test.ts` (inside the existing file, after the `describe("roleHome"...)`):

```ts
import { isSalesRole } from "@/lib/roles";

describe("sales_agent role", () => {
  it("maps sales_agent to /dashboard/sales", () => {
    expect(roleHome("sales_agent")).toBe("/dashboard/sales");
  });
  it("isSalesRole admits sales_agent, admin and super_admin only", () => {
    expect(isSalesRole("sales_agent")).toBe(true);
    expect(isSalesRole("admin")).toBe(true);
    expect(isSalesRole("super_admin")).toBe(true);
    expect(isSalesRole("mentor")).toBe(false);
    expect(isSalesRole("student")).toBe(false);
    expect(isSalesRole(null)).toBe(false);
    expect(isSalesRole(undefined)).toBe(false);
  });
});
```

(The new `import` line goes with the existing import at the top of the file: change it to `import { roleHome, isSalesRole } from "@/lib/roles";` and remove the duplicate import from the appended block.)

Create `tests/access.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { salesAgentMayAccess, salesAgentRedirect } from "@/lib/access";

describe("salesAgentMayAccess", () => {
  it.each([
    "/dashboard/sales",
    "/dashboard/sales/",
    "/dashboard/sales/contacts",
    "/dashboard/settings",
    "/dashboard/notifications",
  ])("allows %s", (p) => expect(salesAgentMayAccess(p)).toBe(true));

  it.each([
    "/dashboard",
    "/dashboard/admin",
    "/dashboard/admin/crm",
    "/dashboard/mentor",
    "/dashboard/courses",
    "/dashboard/salesforce",
    "/dashboard/settingsx",
    "/dashboard/sales/../admin",
    "",
    "/",
  ])("blocks %s", (p) => expect(salesAgentMayAccess(p)).toBe(false));
});

describe("salesAgentRedirect", () => {
  it("is null for every non sales_agent role", () => {
    for (const role of ["student", "mentor", "admin", "super_admin"] as const) {
      expect(salesAgentRedirect(role, "/dashboard/admin/crm")).toBeNull();
    }
  });
  it("is null for a sales_agent on an allowed path", () => {
    expect(salesAgentRedirect("sales_agent", "/dashboard/sales")).toBeNull();
  });
  it("sends a sales_agent on any other dashboard path to the workspace", () => {
    expect(salesAgentRedirect("sales_agent", "/dashboard")).toBe("/dashboard/sales");
    expect(salesAgentRedirect("sales_agent", "/dashboard/admin/crm")).toBe("/dashboard/sales");
  });
  it("ignores paths outside /dashboard", () => {
    expect(salesAgentRedirect("sales_agent", "/courses")).toBeNull();
  });
});
```

In `tests/dashboard-nav.test.ts`: change `const ROLES: Role[] = ["student", "mentor", "admin", "super_admin"];` to include `"sales_agent"`, and append:

```ts
it("sales_agent sees only the workspace, alerts and settings, nothing under /dashboard/admin", () => {
  const items = navForRole("sales_agent");
  expect(items.map((i) => i.href)).toEqual(["/dashboard/sales", "/dashboard/notifications", "/dashboard/settings"]);
  expect(items.some((i) => i.href.startsWith("/dashboard/admin"))).toBe(false);
});

it("admin sees Sales Team, sales_agent does not see admin items", () => {
  expect(navForRole("admin").map((i) => i.href)).toContain("/dashboard/admin/sales-team");
  expect(navForRole("super_admin").map((i) => i.href)).toContain("/dashboard/admin/sales-team");
  expect(navForRole("mentor").map((i) => i.href)).not.toContain("/dashboard/admin/sales-team");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/roles.test.ts tests/access.test.ts tests/dashboard-nav.test.ts`
Expected: FAIL (`isSalesRole` and `@/lib/access` missing; nav items missing).

- [ ] **Step 3: Implement `roles.ts`**

Replace the whole content of `src/lib/roles.ts` with:

```ts
export type Role = "student" | "mentor" | "admin" | "super_admin" | "sales_agent";

export function roleHome(role: Role): string {
  switch (role) {
    case "mentor":
      return "/dashboard/mentor";
    case "admin":
    case "super_admin":
      return "/dashboard/admin";
    case "sales_agent":
      return "/dashboard/sales";
    case "student":
    default:
      return "/dashboard";
  }
}

const SALES_ROLES: readonly Role[] = ["sales_agent", "admin", "super_admin"];

/** Roles that may use the sales workspace: sales agents, plus admins (who may see everything). */
export function isSalesRole(role: Role | null | undefined): boolean {
  return role != null && SALES_ROLES.includes(role);
}
```

- [ ] **Step 4: Implement `access.ts`**

Create `src/lib/access.ts`:

```ts
import type { Role } from "@/lib/roles";

/**
 * The only /dashboard areas a sales_agent may open. Settings and notifications
 * are shared account pages; everything else (courses, mentor, admin, ...) is
 * off limits. Kept as a pure function so middleware can use it and tests can
 * pin every edge case without a request object.
 */
const SALES_AGENT_PREFIXES = ["/dashboard/sales", "/dashboard/settings", "/dashboard/notifications"] as const;

export function salesAgentMayAccess(path: string): boolean {
  if (path.includes("..")) return false;
  return SALES_AGENT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Redirect target for a sales_agent who may not view `path`, or null when no redirect applies. */
export function salesAgentRedirect(role: Role, path: string): string | null {
  if (role !== "sales_agent") return null;
  if (!path.startsWith("/dashboard")) return null;
  return salesAgentMayAccess(path) ? null : "/dashboard/sales";
}
```

- [ ] **Step 5: Wire the middleware**

In `src/middleware.ts` add the import `import { salesAgentRedirect } from "@/lib/access";` next to the existing imports, and insert this block immediately after the `STUDENT_ACCESS_LOCKED` redirect block and before the `/dashboard/admin` check:

```ts
    const salesRedirect = salesAgentRedirect(role, path);
    if (salesRedirect) {
      return NextResponse.redirect(new URL(salesRedirect, request.url));
    }
```

Do not change any other line of the middleware.

- [ ] **Step 6: Update the navigation**

In `src/components/dashboard/nav.ts`:
- Add `ClipboardList, UserPlus` to the lucide import list.
- Add this item at the top of `NAV_ITEMS` (before "Dashboard"): `{ label: "Today", href: "/dashboard/sales", icon: ClipboardList, roles: ["sales_agent"] },`
- Add after the `CRM` admin item: `{ label: "Sales Team", href: "/dashboard/admin/sales-team", icon: UserPlus, roles: ["admin", "super_admin"] },`
- Change the `Notifications` item roles to `["student", "mentor", "admin", "super_admin", "sales_agent"]` and the `Settings` item roles to the same list.

Check the `Dashboard` item (`/dashboard`) does not list `sales_agent` (it must not).

- [ ] **Step 7: Run tests and tsc**

Run: `node node_modules/vitest/vitest.mjs run tests/roles.test.ts tests/access.test.ts tests/dashboard-nav.test.ts` then `node node_modules/typescript/bin/tsc --noEmit`
Expected: tests PASS; tsc clean. If tsc reports an exhaustive `Role` mapping elsewhere (for example a label map in `Topbar.tsx`), add a `sales_agent` entry with the label "Sales Agent" in that mapping and re-run; report each such file in the commit body.

- [ ] **Step 8: Commit**

```bash
git add src/lib/roles.ts src/lib/access.ts src/middleware.ts src/components/dashboard/nav.ts tests/roles.test.ts tests/access.test.ts tests/dashboard-nav.test.ts
git commit -m "feat(sales): sales_agent role, path allowlist, middleware and nav"
```
(Add any extra file Step 7 touched to the `git add` line.)

---

### Task 4: Server gates, ownership rule, API gate structure test

**Files:**
- Create: `src/lib/auth/require-sales.ts`
- Create: `src/lib/crm/ownership.ts`
- Create: `tests/crm-ownership.test.ts`
- Create: `tests/api-role-gates.test.ts`

**Interfaces:**
- Consumes: `isSalesRole`, `Role` (Task 3).
- Produces:
  - `requireSalesAgent(): Promise<{ ok: true; user: User; supabase: ServerSupabase; role: Role } | { ok: false; response: NextResponse }>`
  - `requireSalesAgentPage(): Promise<{ user: User; supabase: ServerSupabase; role: Role }>`
  - `canActOnContact(contact: { owner_id: string | null | undefined }, actor: { id: string; role: Role }): OwnershipCheck`
  - `canClaimContact(contact, actor): OwnershipCheck`
  - `type OwnershipCheck = { ok: true } | { ok: false; reason: "not-allowed" | "not-owner" | "already-claimed" }`

- [ ] **Step 1: Write the failing tests**

Create `tests/crm-ownership.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canActOnContact, canClaimContact } from "@/lib/crm/ownership";

const agent = { id: "agent-1", role: "sales_agent" as const };
const other = { id: "agent-2", role: "sales_agent" as const };
const admin = { id: "admin-1", role: "admin" as const };

describe("canActOnContact", () => {
  it("lets a sales agent act on their own contact", () => {
    expect(canActOnContact({ owner_id: "agent-1" }, agent)).toEqual({ ok: true });
  });
  it("blocks acting on another agent's contact", () => {
    expect(canActOnContact({ owner_id: "agent-1" }, other)).toEqual({ ok: false, reason: "not-owner" });
  });
  it("blocks acting on an unclaimed contact (must claim first)", () => {
    expect(canActOnContact({ owner_id: null }, agent)).toEqual({ ok: false, reason: "not-owner" });
    expect(canActOnContact({ owner_id: undefined }, agent)).toEqual({ ok: false, reason: "not-owner" });
  });
  it("lets admin and super_admin act on any contact", () => {
    expect(canActOnContact({ owner_id: "agent-1" }, admin)).toEqual({ ok: true });
    expect(canActOnContact({ owner_id: null }, { id: "s", role: "super_admin" })).toEqual({ ok: true });
  });
  it("never lets a student or mentor act on a contact", () => {
    expect(canActOnContact({ owner_id: "x" }, { id: "x", role: "student" })).toEqual({ ok: false, reason: "not-allowed" });
    expect(canActOnContact({ owner_id: "x" }, { id: "x", role: "mentor" })).toEqual({ ok: false, reason: "not-allowed" });
  });
  it("an actor with an empty id never matches an empty owner_id", () => {
    expect(canActOnContact({ owner_id: "" }, { id: "", role: "sales_agent" })).toEqual({ ok: false, reason: "not-owner" });
  });
});

describe("canClaimContact", () => {
  it("lets a sales agent claim an unclaimed contact", () => {
    expect(canClaimContact({ owner_id: null }, agent)).toEqual({ ok: true });
    expect(canClaimContact({ owner_id: undefined }, agent)).toEqual({ ok: true });
  });
  it("blocks claiming a contact that already has an owner, including your own", () => {
    expect(canClaimContact({ owner_id: "agent-2" }, agent)).toEqual({ ok: false, reason: "already-claimed" });
    expect(canClaimContact({ owner_id: "agent-1" }, agent)).toEqual({ ok: false, reason: "already-claimed" });
  });
  it("blocks students and mentors from claiming", () => {
    expect(canClaimContact({ owner_id: null }, { id: "x", role: "student" })).toEqual({ ok: false, reason: "not-allowed" });
    expect(canClaimContact({ owner_id: null }, { id: "x", role: "mentor" })).toEqual({ ok: false, reason: "not-allowed" });
  });
});
```

Create `tests/api-role-gates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

const API = join(process.cwd(), "src", "app", "api");
const rel = (f: string) => relative(API, f).replace(/\\/g, "/");

describe("API role gates", () => {
  it("every /api/admin route calls requireAdmin, except the pinned uploads/image route that calls requireMentor", () => {
    const files = routeFiles(join(API, "admin"));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      if (rel(f) === "admin/uploads/image/route.ts") return !src.includes("requireMentor(");
      return !src.includes("requireAdmin(");
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no /api/admin route admits sales agents", () => {
    for (const f of routeFiles(join(API, "admin"))) {
      expect(readFileSync(f, "utf8")).not.toContain("requireSalesAgent");
    }
  });

  it("every /api/sales route (if any exist yet) calls requireSalesAgent", () => {
    let files: string[] = [];
    try {
      files = routeFiles(join(API, "sales"));
    } catch {
      files = [];
    }
    const offenders = files.filter((f) => !readFileSync(f, "utf8").includes("requireSalesAgent("));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("requireMentor does not admit sales agents", () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "auth", "require-mentor.ts"), "utf8");
    expect(src).toContain('const MENTOR_ROLES: readonly Role[] = ["mentor", "admin", "super_admin"];');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run tests/crm-ownership.test.ts tests/api-role-gates.test.ts`
Expected: ownership test FAILS (module missing); the API gate test PASSES or FAILS only on real gate problems (if `offenders` is non-empty for an existing route, stop and report it: that is a real finding, do not edit that route).

- [ ] **Step 3: Implement ownership**

Create `src/lib/crm/ownership.ts`:

```ts
import type { Role } from "@/lib/roles";

export type Actor = { id: string; role: Role };
export type ContactOwnership = { owner_id: string | null | undefined };
export type OwnershipCheck =
  | { ok: true }
  | { ok: false; reason: "not-allowed" | "not-owner" | "already-claimed" };

const isAdmin = (role: Role) => role === "admin" || role === "super_admin";

/**
 * May `actor` act on (log outcomes, message, edit notes for) this contact?
 * Sales agents: only their own. Admins: any. Everyone else: never.
 * Every sales route must call this before touching a contact, because the
 * service-role client bypasses row-level security.
 */
export function canActOnContact(contact: ContactOwnership, actor: Actor): OwnershipCheck {
  if (isAdmin(actor.role)) return { ok: true };
  if (actor.role !== "sales_agent") return { ok: false, reason: "not-allowed" };
  if (actor.id !== "" && contact.owner_id === actor.id) return { ok: true };
  return { ok: false, reason: "not-owner" };
}

/** May `actor` claim this contact? Only unclaimed contacts, only by sales agents or admins. */
export function canClaimContact(contact: ContactOwnership, actor: Actor): OwnershipCheck {
  if (!isAdmin(actor.role) && actor.role !== "sales_agent") return { ok: false, reason: "not-allowed" };
  if (contact.owner_id != null) return { ok: false, reason: "already-claimed" };
  return { ok: true };
}
```

- [ ] **Step 4: Implement the gates**

Create `src/lib/auth/require-sales.ts`:

```ts
import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSalesRole, type Role } from "@/lib/roles";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * Sales gate for ROUTE HANDLERS under /api/sales/*. Mirrors requireMentor()
 * in require-mentor.ts: middleware does not cover /api, so every sales route
 * must call this itself. Admins pass too (they may see everything).
 */
export async function requireSalesAgent(): Promise<
  { ok: true; user: User; supabase: ServerSupabase; role: Role } | { ok: false; response: NextResponse }
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
  const role = (profile?.role ?? "student") as Role;

  if (!isSalesRole(role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user, supabase, role };
}

/** Sales gate for SERVER COMPONENT PAGES. Mirrors requireMentorPage(). */
export async function requireSalesAgentPage(): Promise<{ user: User; supabase: ServerSupabase; role: Role }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (profile?.role ?? "student") as Role;

  if (!isSalesRole(role)) redirect("/dashboard");

  return { user, supabase, role };
}
```

- [ ] **Step 5: Run tests and tsc**

Run: `node node_modules/vitest/vitest.mjs run tests/crm-ownership.test.ts tests/api-role-gates.test.ts` then `node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS and clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/require-sales.ts src/lib/crm/ownership.ts tests/crm-ownership.test.ts tests/api-role-gates.test.ts
git commit -m "feat(sales): requireSalesAgent gate, contact ownership rules, API gate test"
```

---

### Task 5: Admin "Sales Team" (invite, promote, remove)

**Files:**
- Create: `src/lib/validations/sales-agent.ts`
- Create: `src/lib/crm/sales-agent-rules.ts`
- Create: `src/lib/data/sales-agents.ts`
- Create: `src/app/api/admin/sales-agents/route.ts`
- Create: `src/app/api/admin/sales-agents/[id]/route.ts`
- Create: `src/app/dashboard/admin/sales-team/page.tsx`
- Create: `src/app/dashboard/admin/sales-team/loading.tsx`
- Create: `src/components/admin/sales/SalesTeamPanel.tsx`
- Test: `tests/sales-agent.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `requireAdminPage` (`@/lib/auth/require-admin`), `createAdminSupabase` (`@/lib/supabase/admin`), `findAccountIdByEmail` (`@/lib/data/mentor-accounts`), `contacts.owner_id`/`claimed_at` (Task 2), `useAsyncAction` (`@/hooks/useAsyncAction`), `useConfirm` (`@/components/ui/confirm-dialog`), `Button` (`@/components/ui/button`), `EmptyState`.
- Produces:
  - `salesAgentInviteSchema` (zod) with `{ email: string; fullName: string }`
  - `decidePromotion(currentRole: Role | null | undefined): "promote" | "already-sales-agent" | "refuse-admin" | "refuse-mentor"` (pure, in `sales-agent-rules.ts`)
  - `inviteOrCheckSalesAgent`, `confirmPromoteToSalesAgent`, `removeSalesAgent`, `listSalesAgents` in `data/sales-agents.ts`
  - `SalesAgentRow = { id: string; fullName: string; email: string; createdAt: string; contactCount: number }`

- [ ] **Step 1: Write the failing tests**

Create `tests/sales-agent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { salesAgentInviteSchema } from "@/lib/validations/sales-agent";
import { decidePromotion } from "@/lib/crm/sales-agent-rules";

describe("salesAgentInviteSchema", () => {
  it("accepts a valid invite and normalises the email", () => {
    const parsed = salesAgentInviteSchema.parse({ email: "  Agent@Example.COM ", fullName: "  Sara Khan " });
    expect(parsed).toEqual({ email: "agent@example.com", fullName: "Sara Khan" });
  });
  it("rejects a bad email, an empty name, and an over-long name", () => {
    expect(salesAgentInviteSchema.safeParse({ email: "nope", fullName: "Sara" }).success).toBe(false);
    expect(salesAgentInviteSchema.safeParse({ email: "a@b.co", fullName: "   " }).success).toBe(false);
    expect(salesAgentInviteSchema.safeParse({ email: "a@b.co", fullName: "x".repeat(121) }).success).toBe(false);
  });
});

describe("decidePromotion", () => {
  it("promotes a plain student", () => {
    expect(decidePromotion("student")).toBe("promote");
  });
  it("treats a missing profile like a student", () => {
    expect(decidePromotion(null)).toBe("promote");
    expect(decidePromotion(undefined)).toBe("promote");
  });
  it("is a no-op for an existing sales agent", () => {
    expect(decidePromotion("sales_agent")).toBe("already-sales-agent");
  });
  it("never demotes an admin or super_admin", () => {
    expect(decidePromotion("admin")).toBe("refuse-admin");
    expect(decidePromotion("super_admin")).toBe("refuse-admin");
  });
  it("never converts a mentor, who would lose mentor access", () => {
    expect(decidePromotion("mentor")).toBe("refuse-mentor");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-agent.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement validation and rules**

Create `src/lib/validations/sales-agent.ts`:

```ts
import { z } from "zod";

export const salesAgentInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address").max(255),
  fullName: z.string().trim().min(1, "Name is required").max(120),
});

export type SalesAgentInviteInput = z.infer<typeof salesAgentInviteSchema>;
```

Create `src/lib/crm/sales-agent-rules.ts`:

```ts
import type { Role } from "@/lib/roles";

export type PromotionDecision = "promote" | "already-sales-agent" | "refuse-admin" | "refuse-mentor";

/**
 * What to do when an admin tries to make an existing account a sales agent.
 * Roles are single-valued, so promoting a mentor would silently remove their
 * mentor access, and touching an admin could strand them out of /dashboard/admin
 * with no in-app way back (the same reasons data/mentor-accounts.ts protects admins).
 */
export function decidePromotion(currentRole: Role | null | undefined): PromotionDecision {
  if (currentRole === "admin" || currentRole === "super_admin") return "refuse-admin";
  if (currentRole === "mentor") return "refuse-mentor";
  if (currentRole === "sales_agent") return "already-sales-agent";
  return "promote";
}
```

- [ ] **Step 4: Run to verify tests pass**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-agent.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Implement the data layer**

Create `src/lib/data/sales-agents.ts`:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { findAccountIdByEmail } from "@/lib/data/mentor-accounts";
import { decidePromotion } from "@/lib/crm/sales-agent-rules";
import type { Role } from "@/lib/roles";

/**
 * Admin-facing sales agent account management. Service-role client; every
 * caller is already gated by requireAdmin() at its own route boundary.
 * Mirrors data/mentor-accounts.ts.
 */

export type SalesAgentRow = {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
  contactCount: number;
};

export async function listSalesAgents(): Promise<SalesAgentRow[]> {
  const admin = createAdminSupabase();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, created_at")
    .eq("role", "sales_agent")
    .order("created_at", { ascending: true });

  const rows: SalesAgentRow[] = [];
  for (const p of profiles ?? []) {
    const { data: authUser } = await admin.auth.admin.getUserById(p.id);
    const { count } = await admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", p.id);
    rows.push({
      id: p.id,
      fullName: p.full_name,
      email: authUser?.user?.email ?? "",
      createdAt: p.created_at,
      contactCount: count ?? 0,
    });
  }
  return rows;
}

export type InviteSalesAgentResult =
  | { status: "invited"; email: string }
  | { status: "existing"; email: string }
  | { status: "error"; reason: "invite-failed" | "db-error" };

/**
 * Step 1. A brand-new email is invited and set to sales_agent. An email that
 * already has an account is NOT touched: the caller gets "existing" so the
 * admin UI can ask for confirmation first (step 2).
 */
export async function inviteOrCheckSalesAgent(
  email: string,
  fullName: string,
  redirectTo: string,
): Promise<InviteSalesAgentResult> {
  const admin = createAdminSupabase();

  const existingId = await findAccountIdByEmail(email);
  if (existingId) return { status: "existing", email };

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName },
  });
  if (inviteError || !invited?.user) return { status: "error", reason: "invite-failed" };

  // handle_new_user already created the profiles row as 'student'; fix the role
  // before this person can ever log in.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "sales_agent" })
    .eq("id", invited.user.id);
  if (profileError) return { status: "error", reason: "db-error" };

  return { status: "invited", email };
}

export type PromoteResult =
  | { ok: true }
  | {
      ok: false;
      reason: "account-not-found" | "already-sales-agent" | "is-admin" | "is-mentor" | "db-error";
    };

/** Step 2, after the admin confirmed the "this email already has an account" dialog. */
export async function confirmPromoteToSalesAgent(email: string): Promise<PromoteResult> {
  const admin = createAdminSupabase();

  const accountId = await findAccountIdByEmail(email);
  if (!accountId) return { ok: false, reason: "account-not-found" };

  const { data: account } = await admin.from("profiles").select("role").eq("id", accountId).maybeSingle();
  const decision = decidePromotion((account?.role ?? null) as Role | null);

  if (decision === "refuse-admin") return { ok: false, reason: "is-admin" };
  if (decision === "refuse-mentor") return { ok: false, reason: "is-mentor" };
  if (decision === "already-sales-agent") return { ok: false, reason: "already-sales-agent" };

  const { error } = await admin.from("profiles").update({ role: "sales_agent" }).eq("id", accountId);
  if (error) return { ok: false, reason: "db-error" };
  return { ok: true };
}

export type RemoveResult = { ok: true; released: number } | { ok: false; reason: "not-found" | "db-error" };

/**
 * Removes sales access: releases every contact the agent owned back to
 * unclaimed FIRST (so nobody is left holding contacts nobody can work),
 * then reverts the role to 'student'. Only acts on an account whose role is
 * exactly 'sales_agent', so it can never demote an admin or mentor.
 */
export async function removeSalesAgent(profileId: string): Promise<RemoveResult> {
  const admin = createAdminSupabase();

  const { data: profile } = await admin.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (!profile || profile.role !== "sales_agent") return { ok: false, reason: "not-found" };

  const { data: released, error: releaseError } = await admin
    .from("contacts")
    .update({ owner_id: null, claimed_at: null })
    .eq("owner_id", profileId)
    .select("id");
  if (releaseError) return { ok: false, reason: "db-error" };

  const { error: roleError } = await admin.from("profiles").update({ role: "student" }).eq("id", profileId);
  if (roleError) return { ok: false, reason: "db-error" };

  return { ok: true, released: released?.length ?? 0 };
}
```

- [ ] **Step 6: Implement the API routes**

Create `src/app/api/admin/sales-agents/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { salesAgentInviteSchema } from "@/lib/validations/sales-agent";
import { inviteOrCheckSalesAgent, confirmPromoteToSalesAgent } from "@/lib/data/sales-agents";

/** Step 1: new email -> sends the invite. Already-registered email -> returns "existing" without writing (see PUT). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = salesAgentInviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a name and a valid email." }, { status: 400 });
  }

  const result = await inviteOrCheckSalesAgent(
    parsed.data.email,
    parsed.data.fullName,
    `${req.nextUrl.origin}/reset-password`,
  );
  if (result.status === "error") {
    if (result.reason === "invite-failed") {
      return NextResponse.json({ error: "Could not send invite. Check the email address." }, { status: 422 });
    }
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }
  return NextResponse.json(result);
}

/** Step 2: the admin confirmed the "already has an account" dialog. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = salesAgentInviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a name and a valid email." }, { status: 400 });
  }

  const result = await confirmPromoteToSalesAgent(parsed.data.email);
  if (!result.ok) {
    const messages: Record<typeof result.reason, [string, number]> = {
      "account-not-found": ["That account no longer exists", 404],
      "already-sales-agent": ["That account is already a sales agent", 409],
      "is-admin": ["That account is an admin and cannot be made a sales agent", 409],
      "is-mentor": ["That account is a mentor. A mentor cannot also be a sales agent", 409],
      "db-error": ["Could not save changes", 500],
    };
    const [error, status] = messages[result.reason];
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json({ ok: true });
}
```

Create `src/app/api/admin/sales-agents/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { removeSalesAgent } from "@/lib/data/sales-agents";

/** Removes sales access (role back to student) and releases the agent's contacts. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await removeSalesAgent(id);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Sales agent not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not remove this sales agent" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, released: result.released });
}
```

- [ ] **Step 7: Implement the page, loading state and panel**

Create `src/app/dashboard/admin/sales-team/loading.tsx`:

```tsx
import { TableSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return <TableSkeleton cols={4} />;
}
```

Create `src/app/dashboard/admin/sales-team/page.tsx`:

```tsx
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listSalesAgents } from "@/lib/data/sales-agents";
import { SalesTeamPanel } from "@/components/admin/sales/SalesTeamPanel";

export const metadata = { title: "Sales Team — PZ Academy" };

export default async function AdminSalesTeamPage() {
  await requireAdminPage();
  const agents = await listSalesAgents();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Sales Team</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Add the people who work contacts in the Sales Workspace. They see only that workspace, nothing else.
        </p>
      </div>
      <SalesTeamPanel agents={agents} />
    </div>
  );
}
```

Create `src/components/admin/sales/SalesTeamPanel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { SalesAgentRow } from "@/lib/data/sales-agents";

const inputClass =
  "w-full border border-pz-outline-variant rounded-lg px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const labelClass = "block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant mb-1.5";

export function SalesTeamPanel({ agents }: { agents: SalesAgentRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isRefreshing, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const { run: sendInvite, pending: inviting } = useAsyncAction(async () => {
    try {
      const res = await fetch("/api/admin/sales-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { status?: string; email?: string; error?: string }
        | null;

      if (!res.ok) {
        toast.error(payload?.error ?? "Could not process this invite.");
        return;
      }
      if (payload?.status === "existing" && payload.email) {
        const ok = await confirm({
          title: "Use existing account?",
          description: `${payload.email} already has an account. Make it a sales agent? A student account becomes a sales agent. Admin and mentor accounts are refused.`,
          confirmLabel: "Make sales agent",
        });
        if (!ok) return;
        const put = await fetch("/api/admin/sales-agents", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: payload.email, fullName: fullName.trim() }),
        });
        if (!put.ok) {
          const err = (await put.json().catch(() => null)) as { error?: string } | null;
          toast.error(err?.error ?? "Could not update this account.");
          return;
        }
        toast.success(`${payload.email} is now a sales agent.`);
      } else {
        toast.success(`Invite sent to ${payload?.email}.`);
      }
      setFullName("");
      setEmail("");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not process this invite.");
    }
  });

  const { run: removeAgent, pending: removing } = useAsyncAction(async (agent: SalesAgentRow) => {
    const ok = await confirm({
      title: `Remove ${agent.fullName || agent.email}?`,
      description:
        "They lose access to the Sales Workspace and become a regular student account. Their contacts go back to unclaimed.",
      confirmLabel: "Remove access",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/sales-agents/${agent.id}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => null)) as { error?: string; released?: number } | null;
      if (!res.ok) {
        toast.error(payload?.error ?? "Could not remove this sales agent.");
        return;
      }
      toast.success(`Removed. ${payload?.released ?? 0} contacts are unclaimed again.`);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not remove this sales agent.");
    }
  });

  return (
    <div className="space-y-6">
      <section className="bg-pz-surface-container-lowest p-4 sm:p-6 rounded-xl border border-pz-outline-variant space-y-4">
        <h2 className="font-headline text-lg font-bold text-pz-on-surface flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-pz-primary" />
          Add a sales agent
        </h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className={labelClass}>Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Sara Khan"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sara@example.com"
              className={inputClass}
            />
          </div>
          <Button
            type="button"
            variant="bare"
            size="bare"
            loading={inviting || isRefreshing}
            disabled={email.trim().length === 0 || fullName.trim().length === 0}
            onClick={() => sendInvite()}
            className="gap-2 px-4 py-2.5 max-md:min-h-11 sm:self-end bg-pz-primary-container text-pz-on-primary-container font-headline font-bold text-sm rounded-lg hover:shadow-md transition-all"
          >
            <Send className="w-4 h-4" />
            {inviting || isRefreshing ? "Working…" : "Send invite"}
          </Button>
        </div>
        <p className="font-body text-xs text-pz-on-surface-variant">
          They get an email to set a password, then land straight in the Sales Workspace.
        </p>
      </section>

      <section className="bg-pz-surface-container-lowest rounded-xl border border-pz-outline-variant">
        {agents.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No sales agents yet"
            description="Add your first agent above. They will only see the Sales Workspace."
          />
        ) : (
          <ul className="divide-y divide-pz-outline-variant">
            {agents.map((agent) => (
              <li key={agent.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-headline font-bold text-pz-on-surface truncate">{agent.fullName || "(no name)"}</p>
                  <p className="font-body text-sm text-pz-on-surface-variant truncate">{agent.email}</p>
                  <p className="font-body text-xs text-pz-on-surface-variant mt-0.5">
                    {agent.contactCount} {agent.contactCount === 1 ? "contact" : "contacts"} claimed
                  </p>
                </div>
                <Button
                  type="button"
                  variant="bare"
                  size="bare"
                  disabled={removing || isRefreshing}
                  onClick={() => removeAgent(agent)}
                  className="gap-2 px-4 py-2 max-md:min-h-11 border border-pz-solid-danger text-pz-danger font-headline font-bold text-sm rounded-lg hover:bg-pz-solid-danger/10 transition-colors"
                >
                  <UserMinus className="w-4 h-4" />
                  Remove access
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 8: Run tests and tsc**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-agent.test.ts tests/api-role-gates.test.ts` then `node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS and clean. (`api-role-gates` now also covers the two new admin routes and proves they call `requireAdmin(`.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/validations/sales-agent.ts src/lib/crm/sales-agent-rules.ts src/lib/data/sales-agents.ts "src/app/api/admin/sales-agents/route.ts" "src/app/api/admin/sales-agents/[id]/route.ts" src/app/dashboard/admin/sales-team/page.tsx src/app/dashboard/admin/sales-team/loading.tsx src/components/admin/sales/SalesTeamPanel.tsx tests/sales-agent.test.ts
git commit -m "feat(admin): sales team screen to invite, promote and remove sales agents"
```

---

### Task 6: Empty Sales Workspace shell

**Files:**
- Create: `src/app/dashboard/sales/page.tsx`
- Create: `src/app/dashboard/sales/loading.tsx`
- Test: `tests/sales-shell.test.ts`

**Interfaces:**
- Consumes: `requireSalesAgentPage` (Task 4), `EmptyState`.
- Produces: the `/dashboard/sales` route that `roleHome("sales_agent")` points to.

- [ ] **Step 1: Write the failing test**

Create `tests/sales-shell.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const page = join(process.cwd(), "src", "app", "dashboard", "sales", "page.tsx");

describe("sales workspace shell", () => {
  it("exists and is gated by requireSalesAgentPage", () => {
    expect(existsSync(page)).toBe(true);
    expect(readFileSync(page, "utf8")).toContain("requireSalesAgentPage()");
  });
  it("has a loading state", () => {
    expect(existsSync(join(process.cwd(), "src", "app", "dashboard", "sales", "loading.tsx"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-shell.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/app/dashboard/sales/loading.tsx`:

```tsx
import { TableSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return <TableSkeleton cols={3} />;
}
```

Create `src/app/dashboard/sales/page.tsx`:

```tsx
import { ClipboardList } from "lucide-react";
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Sales Workspace — PZ Academy" };

export default async function SalesWorkspacePage() {
  await requireSalesAgentPage();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Today</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Your daily workspace for messaging contacts.</p>
      </div>
      <EmptyState
        icon={ClipboardList}
        title="Your workspace is being set up"
        description="Your contacts and tools will appear here soon. Nothing is needed from you yet."
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test, tsc, and the full suite**

Run: `node node_modules/vitest/vitest.mjs run tests/sales-shell.test.ts`, then `node node_modules/typescript/bin/tsc --noEmit`, then the full suite `node node_modules/vitest/vitest.mjs run`.
Expected: all PASS, tsc clean. Report the full-suite total.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/sales/page.tsx src/app/dashboard/sales/loading.tsx tests/sales-shell.test.ts
git commit -m "feat(sales): empty sales workspace shell"
```

---

### Task 7: Ship checklist (controller and owner only, not for implementers)

This task runs only after Tasks 1-6 are reviewed clean and the owner approves each step, because it changes the live database.

- [ ] **Step 1: Owner approval to apply migrations 0060, 0061, 0062** to the live project `PZ Academy Platform` (`whqdasotjlhvrjmgiffk`). Apply them in order as three separate migrations (0061 must commit before anything uses `sales_agent`).
- [ ] **Step 2: Verify the escalation fix on the live database** with a rolled-back transaction (expected: an error with code 42501, then no change):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where role = 'mentor' limit 1), 'role', 'authenticated')::text, true);
update public.profiles set role = 'admin' where id = (select id from public.profiles where role = 'mentor' limit 1);
rollback;
```

- [ ] **Step 3: Verify the enum and columns exist:** `select unnest(enum_range(null::public.user_role));` includes `sales_agent`; `select column_name from information_schema.columns where table_name='contacts' and column_name in ('owner_id','claimed_at');` returns both.
- [ ] **Step 4: Browser click-through** (signed in as the admin): `/dashboard/admin/sales-team` renders; invite a test sales agent with an address the owner controls; sign in as that agent; confirm they land on `/dashboard/sales`, every other `/dashboard/*` URL redirects back, `/api/admin/crm/contacts` returns 403 for them, and the nav shows only Today, Alerts and Settings on phone and desktop in light and dark. Then remove the test agent from the Sales Team screen.
- [ ] **Step 5: Final whole-branch review, then `superpowers:finishing-a-development-branch`.** Ask the owner before any merge or push.

---

## Self-Review

- **Spec coverage:** Section 1 (new role, `Role`, `roleHome`, middleware allowlist, `requireSalesAgent`, `/api/sales/*` convention, `assertCanActOn` as `canActOnContact`/`canClaimContact`, admin-only list, admin invites a sales agent, `agents` table untouched) maps to Tasks 2-6. Section 3 migration items `owner_id` and `claimed_at` map to Task 2; `contact_activities`, `next_followup_at`, `last_outcome`, `whatsapp_batches.created_by` and the WhatsApp safety tables are Phase B, by the spec's phase split. The role self-escalation fix (Task 1) is not in the spec: it is required for the isolation promise to hold and was found while planning.
- **Placeholders:** none. Every code step is complete code.
- **Type consistency:** `Role` includes `sales_agent` from Task 3 on; `isSalesRole`, `salesAgentRedirect`, `canActOnContact`, `canClaimContact`, `decidePromotion`, `SalesAgentRow` and `removeSalesAgent` are defined once and used with the same names and signatures later.
- **Review Focus:** each line has a test: admin and mentor refusal (`decidePromotion` tests), path edge cases (`access.test.ts`), empty-id ownership (`crm-ownership.test.ts`), release-then-demote order (documented in `removeSalesAgent`, covered by the Task 7 click-through since it needs a database), and the API gate structure (`api-role-gates.test.ts`).
