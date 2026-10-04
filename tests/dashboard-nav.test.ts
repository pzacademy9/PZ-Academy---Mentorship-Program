import { NAV_ITEMS, navForRole, activeHrefFor, splitMobileNav } from "@/components/dashboard/nav";
import type { Role } from "@/lib/roles";

const ROLES: Role[] = ["student", "mentor", "admin", "super_admin", "sales_agent"];

describe.each(ROLES)("role %s", (role) => {
  it("every role item appears exactly once across bar and more", () => {
    const items = navForRole(role);
    const { bar, more } = splitMobileNav(items, undefined);
    expect(bar.length).toBeLessThanOrEqual(4);
    const hrefs = [...bar, ...more].map((i) => i.href);
    expect(hrefs.sort()).toEqual(items.map((i) => i.href).sort());
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

it("admin has items past the 4th, all reachable via more", () => {
  const items = navForRole("admin");
  const { more } = splitMobileNav(items, undefined);
  for (const label of ["Feedback", "Sheet Sync", "Send Notice", "Analytics", "Notifications", "Settings"]) {
    expect(more.map((i) => i.label)).toContain(label);
  }
});

it("moreActive when active href is in the sheet", () => {
  const items = navForRole("admin");
  const active = activeHrefFor(items, "/dashboard/admin/feedback");
  expect(active).toBe("/dashboard/admin/feedback");
  expect(splitMobileNav(items, active).moreActive).toBe(true);
  expect(splitMobileNav(items, "/dashboard").moreActive).toBe(false);
});

it("activeHrefFor picks the longest matching href, not ancestors", () => {
  const items = navForRole("admin");
  expect(activeHrefFor(items, "/dashboard/admin/enrollments")).toBe("/dashboard/admin/enrollments");
  expect(activeHrefFor(items, "/dashboard/adminfoo")).toBe("/dashboard");
});

it("NAV_ITEMS is non-empty and every item has at least one role", () => {
  expect(NAV_ITEMS.length).toBeGreaterThan(0);
  for (const i of NAV_ITEMS) expect(i.roles.length).toBeGreaterThan(0);
});

it("sales_agent sees only the workspace, alerts and settings, nothing under /dashboard/admin", () => {
  const items = navForRole("sales_agent");
  expect(items.map((i) => i.href)).toEqual(["/dashboard/sales", "/dashboard/notifications", "/dashboard/settings"]);
  expect(items.some((i) => i.href.startsWith("/dashboard/admin"))).toBe(false);
});

it("admin sees Sales Team, sales_agent does not see admin items", () => {
  expect(navForRole("admin").map((i) => i.href)).toContain("/dashboard/admin/sales-team");
  expect(navForRole("super_admin").map((i) => i.href)).toContain("/dashboard/admin/sales-team");
  expect(navForRole("mentor").map((i) => i.href)).not.toContain("/dashboard/admin/sales-team");
});
