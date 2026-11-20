import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Role } from "@/lib/roles";
import { effectiveAreas, type Area } from "@/lib/team/areas";
import { getCustomAccess } from "@/lib/data/team-access";

/**
 * Which admin areas this person may use. Super admin and everyone outside admin/manager get undefined.
 * If their custom access cannot be read they get no areas, never extra ones.
 */
export async function areasForRole(role: Role, userId: string): Promise<Area[] | undefined> {
  if (role !== "admin" && role !== "manager") return undefined;
  try {
    return effectiveAreas(role, await getCustomAccess(userId));
  } catch {
    return [];
  }
}

/** The signed-in person's role (default student) and areas, for pages that show admin entries. */
export async function getViewerRoleAndAreas(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
): Promise<{ role: Role; areas: Area[] | undefined }> {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  const role = (profile?.role ?? "student") as Role;
  return { role, areas: await areasForRole(role, userId) };
}
