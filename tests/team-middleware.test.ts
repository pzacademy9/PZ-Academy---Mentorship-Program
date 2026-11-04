import { describe, expect, it } from "vitest";
import { mayEnterAdminSpace } from "@/lib/access";
import { roleHome, type Role } from "@/lib/roles";

describe("mayEnterAdminSpace", () => {
  it("lets admin, super admin and manager reach the admin pages (each page then checks its own area)", () => {
    for (const r of ["admin", "super_admin", "manager"] as Role[]) expect(mayEnterAdminSpace(r)).toBe(true);
  });
  it("keeps everyone else out", () => {
    for (const r of ["student", "mentor", "sales_agent"] as Role[]) expect(mayEnterAdminSpace(r)).toBe(false);
  });
});

describe("a manager's landing page", () => {
  it("is an admin page the middleware lets a manager into, so there is no redirect loop", () => {
    expect(roleHome("manager")).toBe("/dashboard/admin/courses");
    expect(roleHome("manager").startsWith("/dashboard/admin")).toBe(true);
    expect(mayEnterAdminSpace("manager")).toBe(true);
  });
});
