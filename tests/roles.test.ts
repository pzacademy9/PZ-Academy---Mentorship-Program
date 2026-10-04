import { describe, it, expect } from "vitest";
import { roleHome, isSalesRole } from "@/lib/roles";

describe("roleHome", () => {
  it("maps student to /dashboard", () => {
    expect(roleHome("student")).toBe("/dashboard");
  });
  it("maps mentor to /dashboard/mentor", () => {
    expect(roleHome("mentor")).toBe("/dashboard/mentor");
  });
  it("maps admin to /dashboard/admin", () => {
    expect(roleHome("admin")).toBe("/dashboard/admin");
  });
  it("maps super_admin to /dashboard/admin", () => {
    expect(roleHome("super_admin")).toBe("/dashboard/admin");
  });
});

describe("sales_agent role", () => {
  it("maps sales_agent to /dashboard/sales", () => {
    expect(roleHome("sales_agent")).toBe("/dashboard/sales");
  });
  it("isSalesRole admits sales_agent, admin and super_admin only", () => {
    expect(isSalesRole("sales_agent")).toBe(true);
    expect(isSalesRole("admin")).toBe(true);
    expect(isSalesRole("super_admin")).toBe(true);
    expect(isSalesRole("mentor")).toBe(false);
    expect(isSalesRole("student")).toBe(false);
    expect(isSalesRole(null)).toBe(false);
    expect(isSalesRole(undefined)).toBe(false);
  });
});
