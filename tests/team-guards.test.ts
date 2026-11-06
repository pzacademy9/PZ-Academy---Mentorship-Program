import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

let role: string | null = "manager";
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: role === "signed-out" ? null : { id: "me" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));

let custom: { extra: string[]; removed: string[] } | null = null;
let customFails = false;
vi.mock("@/lib/data/team-access", () => ({
  getCustomAccess: async () => { if (customFails) throw new Error("read failed"); return custom; },
}));

import { AREAS, mayOpen, isAdminHomePath } from "@/lib/team/areas";
import { requireAdmin, requireAdminPage, requireAdminHomePage, requireImageUploader } from "@/lib/auth/require-admin";

const status = (g: { ok: boolean; response?: unknown }) => (g.ok ? 200 : (g.response as NextResponse).status);

beforeEach(() => { role = "manager"; custom = null; customFails = false; });

describe("mayOpen", () => {
  it("lets a plain manager open program areas and not settings", () => {
    expect(mayOpen("manager", null, ["courses"])).toBe(true);
    expect(mayOpen("manager", null, ["payment_accounts"])).toBe(false);
  });
  it("respects a removed area for an admin", () => {
    expect(mayOpen("admin", { extra: [], removed: ["landing_pages"] }, ["landing_pages"])).toBe(false);
  });
  it("lets the super admin through, even with no areas listed", () => {
    expect(mayOpen("super_admin", null, [])).toBe(true);
  });
  it("refuses roles that are not staff, and an empty list for staff", () => {
    for (const r of ["sales_agent", "mentor", "student"] as const) expect(mayOpen(r, null, ["students"])).toBe(false);
    expect(mayOpen("admin", null, [])).toBe(false);
  });
  it("needs only one of several areas (shared routes)", () => {
    expect(mayOpen("admin", null, ["courses", "payment_accounts"])).toBe(true);
    expect(mayOpen("manager", null, ["marketing", "payment_accounts"])).toBe(false);
  });
  it("gives a plain admin every area except the four settings areas", () => {
    const denied = AREAS.filter((a) => !mayOpen("admin", null, [a]));
    expect([...denied].sort()).toEqual(["payment_accounts", "sheet_sync", "team", "terms"]);
  });
});

describe("isAdminHomePath", () => {
  it("is true only for the admin home", () => {
    expect(isAdminHomePath("/dashboard/admin")).toBe(true);
    expect(isAdminHomePath("/dashboard/admin/")).toBe(true);
    expect(isAdminHomePath("/dashboard/admin/courses")).toBe(false);
  });
});

describe("requireAdmin(area)", () => {
  it("lets a plain manager into courses", async () => {
    expect(status(await requireAdmin("courses"))).toBe(200);
  });
  it("refuses a manager with courses removed, with 403", async () => {
    custom = { extra: [], removed: ["courses"] };
    expect(status(await requireAdmin("courses"))).toBe(403);
  });
  it("refuses a manager on a settings area", async () => {
    expect(status(await requireAdmin("payment_accounts"))).toBe(403);
  });
  it("lets an admin with extra payment accounts in", async () => {
    role = "admin"; custom = { extra: ["payment_accounts"], removed: [] };
    expect(status(await requireAdmin("payment_accounts"))).toBe(200);
  });
  it("refuses a student with 403 and a signed-out person with 401", async () => {
    role = "student";
    expect(status(await requireAdmin("courses"))).toBe(403);
    role = "signed-out";
    expect(status(await requireAdmin("courses"))).toBe(401);
  });
  it("fails closed when the custom access cannot be read", async () => {
    customFails = true;
    expect(status(await requireAdmin("courses"))).toBe(403);
  });
  it("lets the super admin into anything", async () => {
    role = "super_admin";
    expect(status(await requireAdmin("team"))).toBe(200);
  });
  it("accepts a list of areas", async () => {
    expect(status(await requireAdmin(["marketing", "courses"]))).toBe(200);
  });
});

describe("requireAdminPage(area)", () => {
  it("sends a denied manager to the first admin page they can still open (never one they cannot)", async () => {
    custom = { extra: [], removed: ["courses"] };
    await expect(requireAdminPage("courses")).rejects.toThrow(/^redirect:\/dashboard\/admin\/landing-pages$/);
  });
  it("sends a signed-out person to login", async () => {
    role = "signed-out";
    await expect(requireAdminPage("courses")).rejects.toThrow("redirect:/login");
  });
  it("lets a plain manager in", async () => {
    await expect(requireAdminPage("courses")).resolves.toMatchObject({ user: { id: "me" } });
  });
});

describe("requireAdminHomePage()", () => {
  it("allows admin and super admin", async () => {
    for (const r of ["admin", "super_admin"]) { role = r; await expect(requireAdminHomePage()).resolves.toBeTruthy(); }
  });
  it("redirects a manager to the normal dashboard", async () => {
    await expect(requireAdminHomePage()).rejects.toThrow("redirect:/dashboard");
  });
});

describe("requireImageUploader() (mentors upload their photo, staff upload through their media areas)", () => {
  it("lets a mentor in", async () => {
    role = "mentor";
    expect(status(await requireImageUploader())).toBe(200);
  });
  it("lets a plain manager in (courses and landing pages are media areas)", async () => {
    expect(status(await requireImageUploader())).toBe(200);
  });
  it("refuses an admin who has every media area removed", async () => {
    role = "admin"; custom = { extra: [], removed: ["landing_pages", "courses", "mentors", "marketing"] };
    expect(status(await requireImageUploader())).toBe(403);
  });
  it("refuses sales agents and students, and signed-out people with 401", async () => {
    for (const r of ["sales_agent", "student"]) { role = r; expect(status(await requireImageUploader())).toBe(403); }
    role = "signed-out";
    expect(status(await requireImageUploader())).toBe(401);
  });
  it("fails closed when custom access cannot be read", async () => {
    role = "admin"; customFails = true;
    expect(status(await requireImageUploader())).toBe(403);
  });
});
