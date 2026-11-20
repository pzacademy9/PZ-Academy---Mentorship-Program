import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ admin: vi.fn(), view: vi.fn(), page: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: h.admin }));
vi.mock("@/lib/data/portal", () => ({ getPortalBatch: h.view }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.page }) }) }) }),
}));

import { getPodiumMessage } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/podium-message-action";

const PAGE = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const row = (name: string, score: number, rank: number) => ({ name, pzId: "x", mode: "live" as const, score, rank });
const view = (rows: ReturnType<typeof row>[]) => ({ title: "Batch", slug: "b1", sessions: [{ id: SESSION, number: 4 }], overall: [], perClass: { [SESSION]: rows } });

beforeEach(() => {
  h.admin.mockReset().mockResolvedValue({ ok: true });
  h.view.mockReset();
  h.page.mockReset().mockResolvedValue({ data: { slug: "b1", title: "PPC Batch 3" }, error: null });
});

describe("getPodiumMessage", () => {
  it("refuses a non-admin and reads nothing", async () => {
    h.admin.mockResolvedValue({ ok: false });
    const r = await getPodiumMessage(PAGE, SESSION);
    expect(r).toEqual({ ok: false, message: "You do not have permission to do this." });
    expect(h.page).not.toHaveBeenCalled();
    expect(h.view).not.toHaveBeenCalled();
  });
  it("refuses bad ids", async () => {
    expect((await getPodiumMessage("nope", SESSION)).ok).toBe(false);
    expect((await getPodiumMessage(PAGE, "nope")).ok).toBe(false);
  });
  it("builds the message from three ranked rows", async () => {
    h.view.mockResolvedValue(view([row("Ayesha Khan", 154372, 1), row("Bilal", 150000, 2), row("Sara", 140000, 3), row("Zed", 1, 4)]));
    const r = await getPodiumMessage(PAGE, SESSION);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("1st Position – Ayesha Khan");
      expect(r.text).toContain("154,372");
      expect(r.text).toContain("Class 4");
      expect(r.text).toContain("PPC Batch 3");
      expect(r.text).toContain("/progress/b1");
      expect(r.text).not.toContain("Zed");
    }
  });
  it("fails on an empty board", async () => {
    h.view.mockResolvedValue(view([]));
    expect(await getPodiumMessage(PAGE, SESSION)).toEqual({ ok: false, message: "No ranked students yet." });
  });
  it("fails on an unknown batch", async () => {
    h.page.mockResolvedValue({ data: null, error: null });
    expect((await getPodiumMessage(PAGE, SESSION)).ok).toBe(false);
  });
});
