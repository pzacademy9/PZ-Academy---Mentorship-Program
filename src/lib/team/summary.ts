import type { Role } from "@/lib/roles";
import { AREAS, effectiveAreas, startingAreas, type Area, type CustomAccess } from "@/lib/team/areas";

const LABELS: Record<Area, string> = {
  students: "Students",
  certificates: "Certificates",
  courses: "Programs",
  enrollments: "Registrations",
  landing_pages: "Landing pages",
  classes: "Classes",
  feedback: "Feedback",
  mentors: "Mentors",
  mentorship: "Mentorship",
  marketing: "Marketing",
  crm: "CRM contacts",
  sales_hub: "Sales Hub",
  notifications: "Send notices",
  payment_accounts: "Payment accounts",
  sheet_sync: "Sheet sync",
  terms: "Terms and Conditions",
  team: "Team",
};

export function areaLabel(a: Area): string {
  return LABELS[a];
}

const ROLE_LABELS: Partial<Record<Role, string>> = { admin: "Admin", manager: "Manager", super_admin: "Super Admin", student: "Switched off" };

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

/** "Manager, plus Marketing, minus Landing pages": the role, then what differs from its starting set. */
export function accessSummary(role: Role, custom: CustomAccess | null): string {
  const start = startingAreas(role);
  const now = effectiveAreas(role, custom);
  const plus = AREAS.filter((a) => now.includes(a) && !start.includes(a)).map(areaLabel);
  const minus = AREAS.filter((a) => start.includes(a) && !now.includes(a)).map(areaLabel);
  return [roleLabel(role), plus.length ? `plus ${plus.join(", ")}` : "", minus.length ? `minus ${minus.join(", ")}` : ""]
    .filter(Boolean)
    .join(", ");
}

/** A ticked list of areas back into plus and minus against the role's starting set. */
export function diffFromStarting(role: Role, ticked: readonly Area[]): CustomAccess {
  const start = startingAreas(role);
  return {
    extra: AREAS.filter((a) => a !== "team" && ticked.includes(a) && !start.includes(a)),
    removed: AREAS.filter((a) => a !== "team" && start.includes(a) && !ticked.includes(a)),
  };
}
