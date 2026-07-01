import { describe, it, expect } from "vitest";
import { roleHome } from "@/lib/roles";

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
