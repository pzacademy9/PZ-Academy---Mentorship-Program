import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { findAccountIdByEmail } from "@/lib/data/mentor-accounts";
import type { Role } from "@/lib/roles";
import { isArea, type Area, type CustomAccess } from "@/lib/team/areas";
import { cleanCustom, decideTeamChange } from "@/lib/team/rules";

/**
 * Team access for admins and managers. Service-role client; every caller is already gated by
 * requireSuperAdmin() at its own route boundary. Mirrors data/sales-agents.ts.
 */

export type TeamMember = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  custom: CustomAccess;
  active: boolean;
  /** For a switched-off person: the role they had, so "Add back" starts from it. */
  previousRole?: "admin" | "manager" | null;
};

export type TeamResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "is-super-admin" | "is-mentor" | "is-sales-agent" | "not-team-member" | "memory-not-saved" | "db-error" };

const areas = (v: unknown): Area[] => (Array.isArray(v) ? v.filter(isArea) : []);

export async function getCustomAccess(userId: string): Promise<CustomAccess | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("team_access").select("extra_areas, removed_areas, active").eq("user_id", userId).maybeSingle();
  // A failed read must never look like "no custom rules": callers (access guards) rely on the throw to deny.
  if (error) throw new Error("Could not read team access");
  if (!data || data.active === false) return null;
  return { extra: areas(data.extra_areas), removed: areas(data.removed_areas) };
}

export async function listTeam(): Promise<TeamMember[]> {
  const admin = createAdminSupabase();
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .in("role", ["admin", "manager", "super_admin"])
    .order("created_at", { ascending: true });
  const { data: off, error: offError } = await admin
    .from("team_access")
    .select("user_id, extra_areas, removed_areas, previous_role")
    .eq("active", false);
  const { data: access, error: accessError } = await admin.from("team_access").select("user_id, extra_areas, removed_areas").eq("active", true);
  // Never show a partial team: a failed read must not look like "no custom areas" (a Save would then wipe them).
  if (profilesError || offError || accessError) throw new Error("Could not read the team");

  const custom = new Map<string, CustomAccess>();
  for (const a of access ?? []) custom.set(a.user_id, { extra: areas(a.extra_areas), removed: areas(a.removed_areas) });

  const rows: TeamMember[] = [];
  for (const p of profiles ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(p.id);
    rows.push({
      id: p.id, fullName: p.full_name, email: u?.user?.email ?? "", role: p.role as Role,
      custom: custom.get(p.id) ?? { extra: [], removed: [] }, active: true,
    });
  }
  for (const o of off ?? []) {
    const { data: p } = await admin.from("profiles").select("id, full_name, role").eq("id", o.user_id).maybeSingle();
    // Only a plain student can be added back: skip anyone now a mentor, sales agent, or already on the team another way.
    if (!p || p.role !== "student") continue;
    const { data: u } = await admin.auth.admin.getUserById(p.id);
    rows.push({
      id: p.id, fullName: p.full_name, email: u?.user?.email ?? "", role: "student",
      custom: { extra: areas(o.extra_areas), removed: areas(o.removed_areas) }, active: false,
      previousRole: o.previous_role === "admin" || o.previous_role === "manager" ? o.previous_role : null,
    });
  }
  return rows;
}

/** Sets a person's role (admin or manager) and custom lists. Also brings back a switched-off person. */
export async function saveTeamMember(input: { userId: string; role: "admin" | "manager"; custom: CustomAccess }): Promise<TeamResult> {
  const admin = createAdminSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", input.userId).maybeSingle();
  const decision = decideTeamChange((profile?.role ?? null) as Role | null);
  if (decision !== "ok") return { ok: false, reason: decision };

  // Guarded on the role we just evaluated, so a concurrent change (for example to super_admin) is never overwritten.
  const { data: updated, error: roleError } = await admin
    .from("profiles").update({ role: input.role }).eq("id", input.userId).eq("role", profile!.role).select("id");
  if (roleError || !updated || updated.length === 0) return { ok: false, reason: "db-error" };

  const c = cleanCustom(input.custom);
  const { error } = await admin.from("team_access").upsert({
    user_id: input.userId, extra_areas: c.extra, removed_areas: c.removed, active: true, previous_role: null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    // Do not leave a granted role without its custom lists: put the role back.
    await admin.from("profiles").update({ role: profile!.role }).eq("id", input.userId).eq("role", input.role);
    return { ok: false, reason: "db-error" };
  }
  return { ok: true };
}

/** Back to a plain student. The custom lists and the old role are kept so adding the person again restores them. */
export async function switchOffTeamMember(userId: string): Promise<TeamResult> {
  const admin = createAdminSupabase();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile) return { ok: false, reason: "not-found" };
  if (profile.role === "super_admin") return { ok: false, reason: "is-super-admin" };
  if (profile.role !== "admin" && profile.role !== "manager") return { ok: false, reason: "not-team-member" };

  const { data: updated, error: roleError } = await admin
    .from("profiles").update({ role: "student" }).eq("id", userId).eq("role", profile.role).select("id");
  if (roleError) return { ok: false, reason: "db-error" };
  if (!updated || updated.length === 0) return { ok: false, reason: "not-team-member" };
  const { error } = await admin.from("team_access").upsert({
    user_id: userId, active: false, previous_role: profile.role, updated_at: new Date().toISOString(),
  });
  // Fail closed: the person stays switched off even if the "Add back" memory could not be saved.
  if (error) return { ok: false, reason: "memory-not-saved" };
  return { ok: true };
}

/** The saved lists and old role of a switched-off person, so the screen can offer "add back". */
export async function getSwitchedOffRole(userId: string): Promise<"admin" | "manager" | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("team_access").select("previous_role, active").eq("user_id", userId).maybeSingle();
  if (!data || data.active !== false) return null;
  return data.previous_role === "admin" || data.previous_role === "manager" ? data.previous_role : null;
}

export type InviteTeamResult =
  | { status: "invited"; email: string; userId: string }
  | { status: "existing"; email: string }
  | { status: "error"; reason: "invite-failed" | "db-error" };

/** Step 1. A new email is invited (and made a plain student until saved). An email with an account is not touched: "existing". */
export async function inviteOrCheckTeamMember(email: string, fullName: string, redirectTo: string): Promise<InviteTeamResult> {
  const admin = createAdminSupabase();
  if (await findAccountIdByEmail(email)) return { status: "existing", email };
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: fullName } });
  if (error || !invited?.user) return { status: "error", reason: "invite-failed" };
  return { status: "invited", email, userId: invited.user.id };
}

export async function findTeamCandidateId(email: string): Promise<string | null> {
  return findAccountIdByEmail(email);
}
