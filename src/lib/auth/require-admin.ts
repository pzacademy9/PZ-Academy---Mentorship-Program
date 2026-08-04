import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

const ADMIN_ROLES: readonly Role[] = ["admin", "super_admin"];

export function isAdminRole(role: Role | null | undefined): boolean {
  return role != null && ADMIN_ROLES.includes(role);
}

/**
 * Admin gate for ROUTE HANDLERS.
 *
 * middleware.ts only applies its role check under /dashboard, so an
 * /api/admin/* route gets no enforcement from it — every admin route must
 * call this itself. Returns a discriminated union rather than throwing so
 * callers stay in the codebase's existing "return NextResponse.json(...)"
 * idiom:
 *
 *   const auth = await requireAdmin();
 *   if (!auth.ok) return auth.response;
 */
export async function requireAdmin(): Promise<
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!isAdminRole(profile?.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user, supabase };
}

/**
 * Admin gate for SERVER COMPONENT PAGES.
 *
 * Redirects instead of returning a status code, matching what the admin and
 * mentor pages already do by hand. This duplicates the middleware check on
 * purpose — the codebase's defence-in-depth convention, so a middleware
 * matcher change can never silently expose a page.
 */
export async function requireAdminPage(): Promise<{ user: User; supabase: ServerSupabase }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!isAdminRole(profile?.role)) redirect("/dashboard");

  return { user, supabase };
}
