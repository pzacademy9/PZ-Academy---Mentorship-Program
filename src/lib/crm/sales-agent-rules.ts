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
