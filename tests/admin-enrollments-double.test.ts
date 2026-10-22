// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));

const admin = createSupabaseMock();
const server = createSupabaseMock();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    ...admin.client,
    auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => server.client }));
vi.mock("@/lib/emails/enrollment", () => ({ sendEnrollmentEmail: vi.fn() }));
vi.mock("@/lib/gas/sheets-sync-client", () => ({ pushStatusToSheet: vi.fn() }));

import { listEnrollmentsForReview } from "@/lib/data/admin-enrollments";

function enrollment(id: string, studentId: string, courseId: string, screenshot: string | null) {
  return {
    id, status: "pending", enrolled_at: "2026-10-01T00:00:00Z", payment_amount_pkr: null,
    payment_screenshot_url: screenshot, payment_shortfall_pkr: null,
    sheet_pending_status: null, sheet_pending_note: null,
    student: { id: studentId, full_name: "S", phone: null },
    course: { id: courseId, title: "C", slug: "c", type: "recorded", sheet_id: null },
  };
}

function reg(over: Record<string, unknown>) {
  return { id: `r-${Math.random()}`, page_id: "p-1", student_id: "stu-1", status: "paid", is_test: false, ...over };
}

let store: Store;

async function flag(enr: ReturnType<typeof enrollment>, regs: Record<string, unknown>[]) {
  store = {
    landing_pages: [{ id: "p-1", course_id: "c-1" }, { id: "p-2", course_id: "c-2" }],
    landing_registrations: regs,
  };
  admin.state.handler = memoryHandler(store);
  server.state.handler = () => ({ data: [enr], error: null });
  const rows = await listEnrollmentsForReview("all");
  return rows[0].alsoPaidViaLanding;
}

beforeEach(() => {
  admin.reset();
  server.reset();
});

describe("listEnrollmentsForReview alsoPaidViaLanding", () => {
  it("is true for a website screenshot plus a paid landing registration on the same course", async () => {
    expect(await flag(enrollment("e1", "stu-1", "c-1", "u/shot.png"), [reg({})])).toBe(true);
  });
  it("is true for a free landing registration", async () => {
    expect(await flag(enrollment("e1", "stu-1", "c-1", "u/shot.png"), [reg({ status: "free" })])).toBe(true);
  });
  it("is false when the landing row is pending", async () => {
    expect(await flag(enrollment("e1", "stu-1", "c-1", "u/shot.png"), [reg({ status: "pending" })])).toBe(false);
  });
  it("is false when the landing row is a test", async () => {
    expect(await flag(enrollment("e1", "stu-1", "c-1", "u/shot.png"), [reg({ is_test: true })])).toBe(false);
  });
  it("is false when the landing page is for a different course", async () => {
    expect(await flag(enrollment("e1", "stu-1", "c-1", "u/shot.png"), [reg({ page_id: "p-2" })])).toBe(false);
  });
  it("is false for a different student", async () => {
    expect(await flag(enrollment("e1", "stu-1", "c-1", "u/shot.png"), [reg({ student_id: "stu-9" })])).toBe(false);
  });
  it("is false when the enrollment has no screenshot", async () => {
    expect(await flag(enrollment("e1", "stu-1", "c-1", null), [reg({})])).toBe(false);
    expect(await flag(enrollment("e1", "stu-1", "c-1", ""), [reg({})])).toBe(false);
  });
  it("logs a failed landing read and still returns the list with the flag off", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    store = { landing_pages: [], landing_registrations: [] };
    const base = memoryHandler(store);
    admin.state.handler = (op) => (op.table === "landing_registrations" ? { data: null, error: { message: "boom" } } : base(op));
    server.state.handler = () => ({ data: [enrollment("e1", "stu-1", "c-1", "u/shot.png")], error: null });
    const rows = await listEnrollmentsForReview("all");
    expect(rows[0].alsoPaidViaLanding).toBe(false);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("landing registrations read failed"), "boom");
    spy.mockRestore();
  });
  it("uses one batched registrations query and one pages query regardless of row count", async () => {
    store = {
      landing_pages: [{ id: "p-1", course_id: "c-1" }],
      landing_registrations: [reg({})],
    };
    admin.state.handler = memoryHandler(store);
    server.state.handler = () => ({
      data: [enrollment("e1", "stu-1", "c-1", "x"), enrollment("e2", "stu-2", "c-1", "x"), enrollment("e3", "stu-3", "c-1", "x")],
      error: null,
    });
    const rows = await listEnrollmentsForReview("all");
    expect(rows.map((r) => r.alsoPaidViaLanding)).toEqual([true, false, false]);
    expect(admin.find("landing_registrations", "select")).toHaveLength(1);
    expect(admin.find("landing_pages", "select")).toHaveLength(1);
  });
});
