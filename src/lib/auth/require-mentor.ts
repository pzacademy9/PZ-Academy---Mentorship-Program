import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
import { mayAccess } from "@/lib/auth/require-admin";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

const MENTOR_ROLES: readonly Role[] = ["mentor", "admin", "super_admin"];

export function isMentorRole(role: Role | null | undefined): boolean {
  return role != null && MENTOR_ROLES.includes(role);
}

/** A mentor passes on role alone. An admin also needs the Mentorship area (a failed read denies). */
async function mayUseMentorTools(role: Role | null | undefined, userId: string): Promise<boolean> {
  if (!isMentorRole(role)) return false;
  return role === "mentor" || mayAccess(role, userId, "mentorship");
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

  if (!(await mayUseMentorTools(profile?.role as Role | undefined, user.id))) {
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

  if (!(await mayUseMentorTools(profile?.role as Role | undefined, user.id))) redirect("/dashboard");

  return { user, supabase };
}
