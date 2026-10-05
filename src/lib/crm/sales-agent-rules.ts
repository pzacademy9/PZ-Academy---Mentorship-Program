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

export type RemovalDecision = "demote-and-release" | "release-only" | "not-found";

/**
 * What removeSalesAgent should do. A current sales agent is fully removed. A
 * plain student who still owns contacts is the leftover of an interrupted
 * removal (role already reverted, release failed), so only the release is
 * re-run. Admins, mentors and anyone else are never touched.
 */
export function decideRemoval(role: Role | null | undefined, ownedContacts: number): RemovalDecision {
  if (role === "sales_agent") return "demote-and-release";
  if ((role === "student" || role == null) && ownedContacts > 0) return "release-only";
  return "not-found";
}
