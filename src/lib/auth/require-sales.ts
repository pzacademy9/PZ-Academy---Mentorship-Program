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
