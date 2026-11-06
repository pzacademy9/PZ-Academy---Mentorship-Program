import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
import { effectiveAreas, firstOpenPath, mayOpen, MEDIA_AREAS, type Area } from "@/lib/team/areas";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

const ADMIN_ROLES: readonly Role[] = ["admin", "super_admin"];

export function isAdminRole(role: Role | null | undefined): boolean {
  return role != null && ADMIN_ROLES.includes(role);
}

type AreaArg = Area | readonly Area[];
const toList = (a: AreaArg): readonly Area[] => (typeof a === "string" ? [a] : a);

/**
 * Does this role, with this person's custom access, open a route in these areas?
 * Reading the custom access can fail: that is a "no", never a "yes".
 */
export async function mayAccess(role: Role | null | undefined, userId: string, areas: AreaArg): Promise<boolean> {
  if (role == null) return false;
  if (role === "super_admin") return true;
  if (role !== "admin" && role !== "manager") return false;
  try {
    const { getCustomAccess } = await import("@/lib/data/team-access");
    return mayOpen(role, await getCustomAccess(userId), toList(areas));
  } catch {
    return false;
  }
}

/**
 * Admin gate for ROUTE HANDLERS. Name the area the route belongs to (or a list, when
 * a shared route serves several areas: any one is enough).
 *
 * middleware.ts only applies its role check under /dashboard, so an
 * /api/admin/* route gets no enforcement from it — every admin route must
 * call this itself. Returns a discriminated union rather than throwing so
 * callers stay in the codebase's existing "return NextResponse.json(...)"
 * idiom:
 *
 *   const auth = await requireAdmin("courses");
 *   if (!auth.ok) return auth.response;
 */
export async function requireAdmin(area: AreaArg): Promise<
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

  if (!(await mayAccess(profile?.role as Role | undefined, user.id, area))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user, supabase };
}

/**
 * Admin gate for SERVER COMPONENT PAGES and server actions.
 *
 * Redirects instead of returning a status code. A person who is signed in but may not
 * open this area goes to /dashboard (a page that never sends them back), so there is no
 * redirect loop. This duplicates the middleware check on purpose — the codebase's
 * defence-in-depth convention, so a middleware matcher change can never silently
 * expose a page.
 */
export async function requireAdminPage(area: AreaArg): Promise<{ user: User; supabase: ServerSupabase }> {
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

  const role = profile?.role as Role | undefined;
  if (!(await mayAccess(role, user.id, area))) redirect(await deniedLanding(role, user.id));

  return { user, supabase };
}

/**
 * Where a denied person goes. A manager goes to the first admin page their areas open (that page's own
 * guard lets them in, so there is no loop); anyone else, or a manager with nothing left, goes to /dashboard.
 */
async function deniedLanding(role: Role | undefined, userId: string): Promise<string> {
  if (role !== "manager") return "/dashboard";
  try {
    const { getCustomAccess } = await import("@/lib/data/team-access");
    return firstOpenPath(effectiveAreas(role, await getCustomAccess(userId))) ?? "/dashboard";
  } catch {
    return "/dashboard";
  }
}

/** For pages that show or hide a part by area: may the signed-in person open this area? False when signed out or the read fails. */
export async function currentUserMayAccess(area: AreaArg): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return mayAccess(profile?.role as Role | undefined, user.id, area);
}

/** The Analytics home page: admin and super admin only. A manager never sees it, whatever areas they have. */
export async function requireAdminHomePage(): Promise<{ user: User; supabase: ServerSupabase }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdminRole(profile?.role as Role | undefined)) redirect("/dashboard");
  return { user, supabase };
}

/** Super admin gate for ROUTE HANDLERS (the Team screen's API). Same shape as requireAdmin. */
export async function requireSuperAdmin(): Promise<
  { ok: true; user: User; supabase: ServerSupabase } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "super_admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, user, supabase };
}

/** Super admin gate for SERVER COMPONENT PAGES. Redirects anyone else. */
export async function requireSuperAdminPage(): Promise<{ user: User; supabase: ServerSupabase }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "super_admin") redirect("/dashboard");
  return { user, supabase };
}

/**
 * Gate for the shared image upload route. Mentors upload their own photo; staff upload through the
 * media areas (landing pages, programs, mentors, marketing). Anyone else, or anything unclear, is refused.
 */
export async function requireImageUploader(): Promise<
  { ok: true; user: User; supabase: ServerSupabase } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role as Role | undefined;
  if (role === "mentor" || (await mayAccess(role, user.id, MEDIA_AREAS))) return { ok: true, user, supabase };
  return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}
