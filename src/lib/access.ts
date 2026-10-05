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
