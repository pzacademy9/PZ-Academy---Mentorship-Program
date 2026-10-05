export type Role = "student" | "mentor" | "admin" | "super_admin" | "sales_agent";

export function roleHome(role: Role): string {
  switch (role) {
    case "mentor":
      return "/dashboard/mentor";
    case "admin":
    case "super_admin":
      return "/dashboard/admin";
    case "sales_agent":
      return "/dashboard/sales";
    case "student":
    default:
      return "/dashboard";
  }
}

const SALES_ROLES: readonly Role[] = ["sales_agent", "admin", "super_admin"];

/** Roles that may use the sales workspace: sales agents, plus admins (who may see everything). */
export function isSalesRole(role: Role | null | undefined): boolean {
  return role != null && SALES_ROLES.includes(role);
}
