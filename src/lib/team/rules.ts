import type { Role } from "@/lib/roles";
import { AREAS, type Area, type CustomAccess } from "@/lib/team/areas";

export type TeamDecision = "ok" | "is-super-admin" | "is-mentor" | "is-sales-agent" | "not-found";

/** May this account's team access be changed? Admins, managers and plain students (new or switched-off) may. */
export function decideTeamChange(current: Role | null | undefined): TeamDecision {
  if (current == null) return "not-found";
  if (current === "super_admin") return "is-super-admin";
  if (current === "mentor") return "is-mentor";
  if (current === "sales_agent") return "is-sales-agent";
  return "ok";
}

/** Custom lists as they are stored: only real areas, never `team`, no duplicates, nothing in both lists. */
export function cleanCustom(c: CustomAccess): CustomAccess {
  const removed = AREAS.filter((a) => a !== "team" && c.removed.includes(a));
  const extra = AREAS.filter((a) => a !== "team" && c.extra.includes(a) && !removed.includes(a));
  return { extra: extra as Area[], removed: removed as Area[] };
}
