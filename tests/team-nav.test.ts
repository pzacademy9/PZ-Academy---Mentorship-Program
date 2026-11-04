import { describe, expect, it } from "vitest";
import { navForRole } from "@/components/dashboard/nav";
import { effectiveAreas } from "@/lib/team/areas";
import type { Role } from "@/lib/roles";

const labels = (role: Role, custom: { extra: never[]; removed: string[] } | null = null) =>
  navForRole(role, effectiveAreas(role, custom as never)).map((i) => i.label);

describe("navForRole with areas", () => {
  it("shows a plain manager only the program areas", () => {
    const l = labels("manager");
    for (const want of ["Programs", "Landing Pages", "Media Library", "Promo Codes", "Students", "Certificates", "Enrollments", "Feedback", "Mentorship", "Send Notice", "Notifications", "Settings"]) {
      expect(l).toContain(want);
    }
    for (const not of ["Marketing", "Sales Hub", "Agent Leaderboard", "Payment Accounts", "Terms and Conditions", "Sheet Sync", "Team", "Analytics", "Mentors"]) {
      expect(l).not.toContain(not);
    }
  });
  it("adds Marketing when a manager is given that area", () => {
    const m = navForRole("manager", effectiveAreas("manager", { extra: ["marketing"], removed: [] })).map((i) => i.label);
    expect(m).toContain("Marketing");
  });
  it("hides Landing Pages and Promo Codes when an admin has landing pages removed (Media Library stays, it is shared)", () => {
    const l = labels("admin", { extra: [], removed: ["landing_pages"] });
    expect(l).not.toContain("Landing Pages");
    expect(l).not.toContain("Promo Codes");
    expect(l).toContain("Media Library");
  });
  it("hides Media Library when every media area is removed", () => {
    expect(labels("admin", { extra: [], removed: ["landing_pages", "courses", "mentors", "marketing"] })).not.toContain("Media Library");
  });
  it("gives a plain admin everything except the four settings entries and Team", () => {
    const l = labels("admin");
    expect(l).toContain("Analytics");
    expect(l).toContain("Sales Hub");
    for (const not of ["Payment Accounts", "Terms and Conditions", "Sheet Sync", "Team"]) expect(l).not.toContain(not);
  });
  it("gives the super admin everything, including Team", () => {
    const l = labels("super_admin");
    for (const want of ["Team", "Payment Accounts", "Terms and Conditions", "Sheet Sync", "Analytics"]) expect(l).toContain(want);
  });
  it("hides every admin entry from a manager when the areas are not known (fail closed)", () => {
    const l = navForRole("manager").map((i) => i.label);
    expect(l).not.toContain("Programs");
    expect(l).not.toContain("Students");
  });
});

describe("students, mentors and sales agents see exactly what they saw before", () => {
  it("student", () => {
    expect(navForRole("student").map((i) => i.label)).toEqual(
      ["Dashboard", "My Courses", "My Progress", "My Notes", "Sessions", "Messages", "My Application", "Certificates", "Webinars", "Notifications", "Settings"],
    );
  });
  it("mentor", () => {
    expect(navForRole("mentor").map((i) => i.label)).toEqual(
      ["Dashboard", "Sessions", "Messages", "Webinars", "My Students", "Edit Profile", "Availability", "Feedback", "Notifications", "Settings"],
    );
  });
  it("sales agent", () => {
    expect(navForRole("sales_agent").map((i) => i.label)).toEqual(
      ["Today", "My Contacts", "Registrations", "Campaigns", "My Links", "Add a Lead", "Help & Safety", "Notifications", "Settings"],
    );
  });
});
