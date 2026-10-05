import { describe, it, expect } from "vitest";
import { salesAgentMayAccess, salesAgentRedirect } from "@/lib/access";

describe("salesAgentMayAccess", () => {
  it.each([
    "/dashboard/sales",
    "/dashboard/sales/",
    "/dashboard/sales/contacts",
    "/dashboard/settings",
    "/dashboard/notifications",
  ])("allows %s", (p) => expect(salesAgentMayAccess(p)).toBe(true));

  it.each([
    "/dashboard",
    "/dashboard/admin",
    "/dashboard/admin/crm",
    "/dashboard/mentor",
    "/dashboard/courses",
    "/dashboard/salesforce",
    "/dashboard/settingsx",
    "/dashboard/sales/../admin",
    "",
    "/",
  ])("blocks %s", (p) => expect(salesAgentMayAccess(p)).toBe(false));
});

describe("salesAgentRedirect", () => {
  it("is null for every non sales_agent role", () => {
    for (const role of ["student", "mentor", "admin", "super_admin"] as const) {
      expect(salesAgentRedirect(role, "/dashboard/admin/crm")).toBeNull();
    }
  });
  it("is null for a sales_agent on an allowed path", () => {
    expect(salesAgentRedirect("sales_agent", "/dashboard/sales")).toBeNull();
  });
  it("sends a sales_agent on any other dashboard path to the workspace", () => {
    expect(salesAgentRedirect("sales_agent", "/dashboard")).toBe("/dashboard/sales");
    expect(salesAgentRedirect("sales_agent", "/dashboard/admin/crm")).toBe("/dashboard/sales");
  });
  it("ignores paths outside /dashboard", () => {
    expect(salesAgentRedirect("sales_agent", "/courses")).toBeNull();
  });
});
