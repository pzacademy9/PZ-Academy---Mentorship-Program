import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

let role: string = "admin";
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));

let custom: { extra: string[]; removed: string[] } | null = null;
let customFails = false;
vi.mock("@/lib/data/team-access", () => ({
  getCustomAccess: async () => { if (customFails) throw new Error("read failed"); return custom; },
}));

import { areaForPath, mayOpen, firstOpenPath, effectiveAreas } from "@/lib/team/areas";
import type { Area, CustomAccess } from "@/lib/team/areas";
import { requireSalesAgent, requireSalesAgentPage } from "@/lib/auth/require-sales";
import { requireAdminPage, currentUserMayAccess } from "@/lib/auth/require-admin";
import { requireMentor, requireMentorPage } from "@/lib/auth/require-mentor";

const status = (g: { ok: boolean; response?: unknown }) => (g.ok ? 200 : (g.response as NextResponse).status);

beforeEach(() => { role = "admin"; custom = null; customFails = false; });

describe("sheet and batch routes used by the Registrations pages", () => {
  const paths = [
    "/api/admin/landing-sheet-sync/scan",
    "/api/admin/landing-sheet-sync/approve",
    "/api/admin/landing-mirror/sync",
    "/api/admin/landing/batch",
    "/api/admin/landing/close-batch",
    "/api/admin/landing/portal-links",
    "/api/admin/landing-pages/abc/sheet",
  ];
  it.each(paths)("%s is open to anyone who has Registrations", (p) => {
    expect(areaForPath(p)).toContain("enrollments");
    expect(mayOpen("admin", null, areaForPath(p) as Area[])).toBe(true);
  });
  it("an admin with Registrations removed loses them, unless another listed area is kept", () => {
    expect(mayOpen("admin", { extra: [], removed: ["enrollments", "landing_pages", "sheet_sync"] }, areaForPath("/api/admin/landing-mirror/sync") as Area[])).toBe(false);
  });
  it("connect-sheet belongs to Sheet Sync only", () => {
    expect(areaForPath("/api/admin/courses/abc/connect-sheet")).toEqual(["sheet_sync"]);
    expect(mayOpen("admin", null, ["sheet_sync"])).toBe(false);
  });
  it("CRM routes are open with Sales Hub or CRM", () => {
    expect(areaForPath("/api/admin/crm/contacts")).toEqual(expect.arrayContaining(["sales_hub", "crm"]));
  });
});

describe("sales workspace follows areas", () => {
  it("sales agent and super admin pass", async () => {
    role = "sales_agent"; expect(status(await requireSalesAgent())).toBe(200);
    role = "super_admin"; expect(status(await requireSalesAgent())).toBe(200);
  });
  it("plain admin passes; admin with Sales Hub removed is refused", async () => {
    expect(status(await requireSalesAgent())).toBe(200);
    custom = { extra: [], removed: ["sales_hub"] };
    expect(status(await requireSalesAgent())).toBe(403);
    await expect(requireSalesAgentPage()).rejects.toThrow("redirect:/dashboard");
  });
  it("plain manager is refused; manager given Sales Hub passes", async () => {
    role = "manager";
    expect(status(await requireSalesAgent())).toBe(403);
    custom = { extra: ["sales_hub"], removed: [] };
    expect(status(await requireSalesAgent())).toBe(200);
  });
  it("a failed custom-access read refuses an admin", async () => {
    customFails = true;
    expect(status(await requireSalesAgent())).toBe(403);
    await expect(requireSalesAgentPage()).rejects.toThrow("redirect:/dashboard");
  });
  it("students are refused", async () => {
    role = "student";
    expect(status(await requireSalesAgent())).toBe(403);
  });
});

describe("mentor routes follow the Mentorship area", () => {
  it("mentor, super admin and a plain admin pass", async () => {
    for (const r of ["mentor", "super_admin", "admin"]) { role = r; expect(status(await requireMentor())).toBe(200); }
  });
  it("an admin with Mentorship removed is refused (route 403, page redirect)", async () => {
    custom = { extra: [], removed: ["mentorship"] };
    expect(status(await requireMentor())).toBe(403);
    await expect(requireMentorPage()).rejects.toThrow(/^redirect:\/dashboard$/);
  });
  it("a failed custom-access read refuses an admin but never a mentor", async () => {
    customFails = true;
    expect(status(await requireMentor())).toBe(403);
    role = "mentor";
    expect(status(await requireMentor())).toBe(200);
  });
  it("managers and students stay out", async () => {
    for (const r of ["manager", "student", "sales_agent"]) { role = r; expect(status(await requireMentor())).toBe(403); }
  });
});

describe("currentUserMayAccess", () => {
  it("is true for a plain admin on Sales Hub, false once removed", async () => {
    expect(await currentUserMayAccess("sales_hub")).toBe(true);
    custom = { extra: [], removed: ["sales_hub"] };
    expect(await currentUserMayAccess("sales_hub")).toBe(false);
  });
  it("is false for a plain manager, true when Sales Hub is added, false when the read fails", async () => {
    role = "manager";
    expect(await currentUserMayAccess("sales_hub")).toBe(false);
    custom = { extra: ["sales_hub"], removed: [] };
    expect(await currentUserMayAccess("sales_hub")).toBe(true);
    customFails = true;
    expect(await currentUserMayAccess("sales_hub")).toBe(false);
  });
});

describe("a denied manager lands on a page they can open", () => {
  it("firstOpenPath picks the first area with a page, and null when none", () => {
    expect(firstOpenPath(["courses", "landing_pages"])).toBe("/dashboard/admin/courses");
    expect(firstOpenPath(["landing_pages", "students"])).toBe("/dashboard/admin/landing-pages");
    expect(firstOpenPath([])).toBeNull();
  });
  it("Courses removed: goes to the next open page, which that page's own guard lets in", async () => {
    role = "manager";
    custom = { extra: [], removed: ["courses"] };
    const target = firstOpenPath(effectiveAreas("manager", custom as CustomAccess | null));
    expect(target).toBe("/dashboard/admin/landing-pages");
    await expect(requireAdminPage("courses")).rejects.toThrow(`redirect:${target}`);
    await expect(requireAdminPage("landing_pages")).resolves.toBeTruthy();
  });
  it("nothing left to open: goes to /dashboard; an admin always goes to /dashboard", async () => {
    role = "manager";
    custom = { extra: [], removed: ["courses", "landing_pages", "enrollments", "students", "certificates", "feedback", "mentorship", "notifications", "classes"] };
    await expect(requireAdminPage("courses")).rejects.toThrow(/^redirect:\/dashboard$/);
    role = "admin"; custom = { extra: [], removed: ["courses"] };
    await expect(requireAdminPage("courses")).rejects.toThrow(/^redirect:\/dashboard$/);
  });
  it("a failed read still goes to /dashboard", async () => {
    role = "manager"; customFails = true;
    await expect(requireAdminPage("courses")).rejects.toThrow(/^redirect:\/dashboard$/);
  });
});
