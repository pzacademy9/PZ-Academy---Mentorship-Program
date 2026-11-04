import { describe, expect, it } from "vitest";
import {
  AREAS, canAccessArea, effectiveAreas, isArea, startingAreas, areaForPath, type Area,
} from "@/lib/team/areas";

const none = { extra: [], removed: [] };

describe("startingAreas", () => {
  it("gives admin everything except the settings areas", () => {
    const missing = AREAS.filter((a) => !startingAreas("admin").includes(a));
    expect([...missing].sort()).toEqual(["payment_accounts", "sheet_sync", "team", "terms"]);
  });
  it("gives manager exactly the nine program areas", () => {
    expect([...startingAreas("manager")].sort()).toEqual(
      ["certificates", "classes", "courses", "enrollments", "feedback", "landing_pages", "mentorship", "notifications", "students"],
    );
  });
  it("gives sales agents, mentors and students none of these areas", () => {
    expect(startingAreas("sales_agent")).toEqual([]);
    expect(startingAreas("mentor")).toEqual([]);
    expect(startingAreas("student")).toEqual([]);
  });
  it("gives super admin all 17", () => {
    expect(startingAreas("super_admin")).toHaveLength(17);
    expect(AREAS).toHaveLength(17);
  });
});

describe("effectiveAreas", () => {
  it("never lets an admin get the team area from custom access", () => {
    expect(effectiveAreas("admin", { extra: ["team"], removed: [] })).not.toContain("team");
  });
  it("adds extra and removes removed areas for a manager", () => {
    const a = effectiveAreas("manager", { extra: ["marketing"], removed: ["landing_pages"] });
    expect(a).toContain("marketing");
    expect(a).not.toContain("landing_pages");
  });
  it("ignores custom access for a super admin", () => {
    expect(effectiveAreas("super_admin", { extra: [], removed: ["courses"] })).toHaveLength(17);
  });
  it("ignores custom access for roles that have no areas", () => {
    expect(effectiveAreas("sales_agent", { extra: ["students"], removed: [] })).toEqual([]);
  });
});

describe("canAccessArea", () => {
  it("is false for a sales agent even with extra areas", () => {
    expect(canAccessArea("sales_agent", { extra: ["students"], removed: [] }, "students")).toBe(false);
  });
  it("is true for a manager on courses and false on payment accounts", () => {
    expect(canAccessArea("manager", none, "courses")).toBe(true);
    expect(canAccessArea("manager", none, "payment_accounts")).toBe(false);
  });
  it("treats missing custom access as none", () => {
    expect(canAccessArea("admin", null, "students")).toBe(true);
  });
});

describe("isArea", () => {
  it("accepts real areas and rejects anything else", () => {
    expect(isArea("team")).toBe(true);
    expect(isArea("hax")).toBe(false);
    expect(isArea(3)).toBe(false);
  });
});

describe("areaForPath", () => {
  const a = (p: string): Area[] | null => areaForPath(p);
  it("maps shared media routes to every area that uses them", () => {
    for (const p of ["/dashboard/admin/landing-media", "/api/admin/landing-media/x"]) {
      expect(a(p)).toEqual(expect.arrayContaining(["landing_pages", "courses", "mentors", "marketing"]));
    }
  });
  it("maps settings pages to their own area", () => {
    expect(a("/dashboard/admin/payment-accounts")).toEqual(["payment_accounts"]);
    expect(a("/api/admin/payment-countries/1")).toEqual(["payment_accounts"]);
    expect(a("/dashboard/admin/sheet-sync")).toEqual(["sheet_sync"]);
    expect(a("/dashboard/admin/terms")).toEqual(["terms"]);
    expect(a("/dashboard/admin/team")).toEqual(["team"]);
  });
  it("maps class screens under a campaign to classes, other registration screens to enrollments", () => {
    expect(a("/dashboard/admin/enrollments/registrations/campaign/abc/sessions/setup")).toEqual(["classes"]);
    expect(a("/dashboard/admin/enrollments/registrations/campaign/abc/sessions/s1/quiz")).toEqual(["classes"]);
    expect(a("/dashboard/admin/enrollments/registrations/all")).toEqual(["enrollments"]);
    expect(a("/api/admin/registrations/5/details")).toEqual(["enrollments"]);
  });
  it("maps sales routes to sales_hub", () => {
    expect(a("/dashboard/admin/sales-hub/contacts")).toEqual(["sales_hub"]);
    expect(a("/api/admin/sales-agents/1")).toEqual(["sales_hub"]);
    expect(a("/dashboard/admin/agent-leaderboard")).toEqual(["sales_hub"]);
  });
  it("lets every staff area open the admin home", () => {
    expect(a("/dashboard/admin")).toEqual([...AREAS]);
  });
  it("returns null for unknown or tricky paths", () => {
    expect(a("/dashboard/admin/nope")).toBeNull();
    expect(a("/dashboard/admin/../x")).toBeNull();
    expect(a("/dashboard/adminx")).toBeNull();
    expect(a("/dashboard/students")).toBeNull();
  });
});
