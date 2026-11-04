import type { Role } from "@/lib/roles";

/** One key per admin menu entry. `team` is the Team screen itself and belongs to the super admin only. */
export const AREAS = [
  "students", "certificates", "courses", "enrollments", "landing_pages", "classes", "feedback",
  "mentors", "mentorship", "marketing", "crm", "sales_hub", "notifications",
  "payment_accounts", "sheet_sync", "terms", "team",
] as const;
export type Area = (typeof AREAS)[number];

export type CustomAccess = { extra: Area[]; removed: Area[] };

export function isArea(v: unknown): v is Area {
  return typeof v === "string" && (AREAS as readonly string[]).includes(v);
}

const SETTINGS_AREAS: readonly Area[] = ["payment_accounts", "sheet_sync", "terms", "team"];
const MANAGER_AREAS: readonly Area[] = [
  "courses", "landing_pages", "classes", "enrollments", "students", "certificates", "feedback", "mentorship", "notifications",
];

/** The areas a role opens before any custom access. */
export function startingAreas(role: Role): Area[] {
  switch (role) {
    case "super_admin": return [...AREAS];
    case "admin": return AREAS.filter((a) => !SETTINGS_AREAS.includes(a));
    case "manager": return [...MANAGER_AREAS];
    default: return [];
  }
}

/** Starting set, plus extra, minus removed. Super admin is fixed. `team` only ever belongs to a super admin. Roles with no areas stay empty. */
export function effectiveAreas(role: Role, custom: CustomAccess | null): Area[] {
  if (role === "super_admin") return [...AREAS];
  if (role !== "admin" && role !== "manager") return [];
  const set = new Set<Area>(startingAreas(role));
  for (const a of custom?.extra ?? []) set.add(a);
  for (const a of custom?.removed ?? []) set.delete(a);
  set.delete("team");
  return AREAS.filter((a) => set.has(a));
}

export function canAccessArea(role: Role, custom: CustomAccess | null, area: Area): boolean {
  return effectiveAreas(role, custom).includes(area);
}

const MEDIA: Area[] = ["landing_pages", "courses", "mentors", "marketing"];

/**
 * Path rules, most specific first. A route may belong to several areas (access to any one is enough).
 * Both page paths (`/dashboard/admin/...`) and API paths (`/api/admin/...`) are covered.
 */
const RULES: { test: RegExp; areas: Area[] }[] = [
  { test: /^\/dashboard\/admin\/enrollments\/registrations\/campaign\/[^/]+\/sessions(\/|$)/, areas: ["classes"] },
  { test: /^\/(dashboard|api)\/admin\/(landing-media|uploads)(\/|$)/, areas: MEDIA },
  { test: /^\/(dashboard|api)\/admin\/(payment-accounts|payment-countries)(\/|$)/, areas: ["payment_accounts"] },
  { test: /^\/(dashboard|api)\/admin\/(sheet-sync|landing-sheet-sync)(\/|$)/, areas: ["sheet_sync"] },
  { test: /^\/(dashboard|api)\/admin\/(terms|site-terms)(\/|$)/, areas: ["terms"] },
  { test: /^\/(dashboard|api)\/admin\/team(\/|$)/, areas: ["team"] },
  { test: /^\/(dashboard|api)\/admin\/(sales-hub|sales|sales-agents|agent-leaderboard|landing-agent-links)(\/|$)/, areas: ["sales_hub"] },
  { test: /^\/(dashboard|api)\/admin\/(enrollments|registrations|participants)(\/|$)/, areas: ["enrollments"] },
  { test: /^\/(dashboard|api)\/admin\/(landing-pages|landing|landing-promo-codes|landing-whatsapp|landing-mirror)(\/|$)/, areas: ["landing_pages"] },
  { test: /^\/(dashboard|api)\/admin\/(courses|modules|lessons|quiz-questions)(\/|$)/, areas: ["courses"] },
  { test: /^\/(dashboard|api)\/admin\/(marketing|banners|featured-items)(\/|$)/, areas: ["marketing"] },
  { test: /^\/(dashboard|api)\/admin\/crm(\/|$)/, areas: ["crm"] },
  { test: /^\/(dashboard|api)\/admin\/mentors(\/|$)/, areas: ["mentors"] },
  { test: /^\/(dashboard|api)\/admin\/mentorship(\/|$)/, areas: ["mentorship"] },
  { test: /^\/(dashboard|api)\/admin\/feedback(\/|$)/, areas: ["feedback"] },
  { test: /^\/(dashboard|api)\/admin\/notifications(\/|$)/, areas: ["notifications"] },
  { test: /^\/(dashboard|api)\/admin\/(students|people)(\/|$)/, areas: ["students"] },
  { test: /^\/(dashboard|api)\/admin\/certificates(\/|$)/, areas: ["certificates"] },
];

/** Which areas own this path, or null when it is not an admin path we know (null means deny). */
export function areaForPath(path: string): Area[] | null {
  if (path.includes("..")) return null;
  if (path === "/dashboard/admin" || path === "/dashboard/admin/") return [...AREAS];
  return RULES.find((r) => r.test.test(path))?.areas.slice() ?? null;
}

/** May this person open a route that belongs to any one of these areas? Super admin always may. Anything unclear is no. */
export function mayOpen(role: Role, custom: CustomAccess | null, areas: readonly Area[]): boolean {
  if (role === "super_admin") return true;
  const mine = effectiveAreas(role, custom);
  return areas.some((a) => mine.includes(a));
}

/** The Analytics home (`/dashboard/admin` exactly). Open to admin and super admin only; never to a manager. */
export function isAdminHomePath(path: string): boolean {
  return path === "/dashboard/admin" || path === "/dashboard/admin/";
}
