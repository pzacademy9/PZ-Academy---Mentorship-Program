import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ updates: [] as Record<string, unknown>[], row: null as Record<string, unknown> | null }));

function chain() {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq"]) c[k] = () => c;
  c.update = (p: Record<string, unknown>) => { h.updates.push(p); return c; };
  c.maybeSingle = async () => ({ data: h.row });
  c.single = async () => ({ data: { id: "enr-1", status: h.updates.at(-1)?.status }, error: null });
  return c;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: () => chain(),
    auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/emails/enrollment", () => ({ sendEnrollmentEmail: vi.fn() }));
vi.mock("@/lib/gas/sheets-sync-client", () => ({ pushStatusToSheet: vi.fn() }));

import { applyEnrollmentStatus } from "@/lib/data/admin-enrollments";

beforeEach(() => {
  h.updates.length = 0;
  h.row = {
    id: "enr-1", status: "pending", enrolled_at: "2026-10-01T00:00:00Z", payment_amount_pkr: null, payment_screenshot_url: null,
    payment_shortfall_pkr: null, sheet_pending_status: null, sheet_pending_note: null, rejection_reason: null, verified_at: null,
    verifier: null, student: { id: "stu-1", full_name: "A", phone: null },
    course: { id: "c-1", title: "C", slug: "c", type: "recorded", sheet_id: null },
  };
});

describe("applyEnrollmentStatus portal_open", () => {
  it("approving (active) opens the portal", async () => {
    const r = await applyEnrollmentStatus({ enrollmentId: "enr-1", targetStatus: "active", verifiedBy: "adm" });
    expect(r.ok).toBe(true);
    expect(h.updates[0]).toMatchObject({ status: "active", portal_open: true });
  });
  it.each(["reserved", "rejected", "expired"] as const)("%s does not touch portal_open", async (s) => {
    await applyEnrollmentStatus({ enrollmentId: "enr-1", targetStatus: s, verifiedBy: "adm" });
    expect(h.updates[0]).not.toHaveProperty("portal_open");
  });
});
