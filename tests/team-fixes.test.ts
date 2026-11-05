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

import { areaForPath, mayOpen } from "@/lib/team/areas";
import type { Area } from "@/lib/team/areas";
import { requireSalesAgent, requireSalesAgentPage } from "@/lib/auth/require-sales";

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
