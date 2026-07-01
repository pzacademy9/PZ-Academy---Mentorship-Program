export type Role = "student" | "mentor" | "admin" | "super_admin";

export function roleHome(role: Role): string {
  switch (role) {
    case "mentor":
      return "/dashboard/mentor";
    case "admin":
    case "super_admin":
      return "/dashboard/admin";
    case "student":
    default:
      return "/dashboard";
  }
}
