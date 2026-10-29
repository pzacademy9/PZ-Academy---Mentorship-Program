import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const h = vi.hoisted(() => ({ admin: true, programId: vi.fn(), gen: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => (h.admin ? { ok: true, user: { id: "admin-1" } } : { ok: false, response: {} }),
}));
vi.mock("@/lib/data/attendance", () => ({}));
vi.mock("@/lib/data/session-emails", () => ({}));
vi.mock("@/lib/data/participant-sends", () => ({}));
vi.mock("@/lib/data/batch-feedback", () => ({ getBatchProgramId: h.programId }));
vi.mock("@/lib/data/feedback-share", () => ({ generateFeedbackShareToken: h.gen }));

import { openProgramReport } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";

const PAGE = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  h.admin = true;
  h.programId.mockReset();
  h.gen.mockReset();
});

describe("openProgramReport", () => {
  it("refuses a non-admin", async () => {
    h.admin = false;
    expect((await openProgramReport(PAGE)).ok).toBe(false);
    expect(h.gen).not.toHaveBeenCalled();
  });
  it("no program gives ok:false", async () => {
    h.programId.mockResolvedValue(null);
    const r = await openProgramReport(PAGE);
    expect(r).toEqual({ ok: false, message: "This batch has no combined report" });
    expect(h.gen).not.toHaveBeenCalled();
  });
  it("with a program it creates the link and returns the path", async () => {
    h.programId.mockResolvedValue("prog1");
    h.gen.mockResolvedValue({ shareUrl: "/review/tok", token: "tok" });
    expect(await openProgramReport(PAGE)).toEqual({ ok: true, path: "/review/tok" });
    expect(h.gen).toHaveBeenCalledWith("program", "prog1", "admin-1");
  });
});
