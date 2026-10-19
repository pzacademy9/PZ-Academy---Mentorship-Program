import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const h = vi.hoisted(() => ({ page: null as null | Record<string, unknown>, send: vi.fn() }));
vi.mock("@/lib/data/landing-public", () => ({ getRegistrablePageById: async () => h.page }));
vi.mock("@/lib/brevo", () => ({ sendTransactionalEmail: h.send }));

import { finishBatch, emailPortalLinks, getBatchOverview } from "@/lib/data/landing-batch";

const PAGE = "page-1", COURSE = "course-1", ADMIN = "admin-1";
const M1 = "mod-1", M2 = "mod-2", M3 = "mod-3";
const reg = (id: string, o: Record<string, unknown> = {}) => ({
  id, page_id: PAGE, row_type: "individual", lead_registration_id: null, ref_id: `R-${id}`, name: `Name ${id}`, email: `${id}@x.com`,
  option_keys: ["opt"], mode: "live", status: "paid", student_id: `stu-${id}`, is_test: false, ...o,
});

let store: Store;
let tick = 0;
const stamp = () => new Date(Date.UTC(2026, 9, 20, 0, 0, ++tick)).toISOString();

function setup(regs: Record<string, unknown>[], extra: Partial<Store> = {}, courseId: string | null = COURSE) {
  h.page = {
    id: PAGE, courseId, title: "Page title",
    registration: { eventLabel: "PMH Batch", whatsappVerifyNumber: "923001234567", options: [{ key: "opt", moduleIds: [] }, { key: "optM2", moduleIds: [M2] }] },
  };
  store = {
    landing_registrations: regs,
    courses: [{ id: COURSE, slug: "pmh", title: "Pharma Course" }],
    modules: [
      { id: M1, course_id: COURSE, order_index: 1, title: "Module One" },
      { id: M2, course_id: COURSE, order_index: 2, title: "Module Two" },
      { id: M3, course_id: COURSE, order_index: 3, title: "Module Three" },
    ],
    lessons: [{ id: "l1", module_id: M1, order_index: 1 }, { id: "l2", module_id: M2, order_index: 1 }, { id: "l3", module_id: M3, order_index: 1 }],
    landing_pages: [{ id: PAGE, course_id: COURSE }],
    landing_batch_state: [],
    enrollments: [], enrollment_modules: [], enrollment_open_modules: [], lesson_progress: [], landing_email_log: [],
    ...extra,
  };
  const mem = memoryHandler(store);
  db.state.handler = (op: Op) => {
    if (op.op === "insert" || op.op === "upsert") {
      const rows = (Array.isArray(op.payload) ? op.payload : [op.payload]) as Record<string, unknown>[];
      if (op.table === "enrollment_open_modules") return mem({ ...op, payload: rows.map((r) => ({ opened_at: stamp(), ...r })) });
      if (op.table === "landing_batch_state") return mem({ ...op, payload: rows.map((r) => ({ finished_at: stamp(), ...r })) });
      if (op.table === "landing_email_log") return mem({ ...op, payload: rows.map((r) => ({ sent_at: stamp(), ...r })) });
      if (op.table === "lesson_progress" && op.upsertOptions?.ignoreDuplicates) {
        return mem({ ...op, payload: rows.filter((p) => !store.lesson_progress.some((r) => r.student_id === p.student_id && r.lesson_id === p.lesson_id)) });
      }
    }
    return mem(op);
  };
}
const opens = (student: string) => {
  const e = store.enrollments.find((x) => x.student_id === student);
  return e ? store.enrollment_open_modules.filter((o) => o.enrollment_id === e.id).map((o) => o.module_id as string).sort() : [];
};
const logs = () => store.landing_email_log.filter((r) => r.kind === "portal_link");
const sentTo = () => h.send.mock.calls.map((c) => c[0].to as string).sort();
const press = (moduleId: string | null) => finishBatch({ pageId: PAGE, moduleId, adminId: ADMIN });

beforeEach(() => {
  db.reset();
  tick = 0;
  h.send.mockReset();
  h.send.mockResolvedValue({});
});

describe("finishBatch", () => {
  it("whole course: a row per module plus the marker, opens every module, emails each person once", async () => {
    setup([reg("a"), reg("b")]);
    const r = await press(null);
    expect(r).toEqual({ modulesFinished: 3, opened: 2, emailed: 2, alreadyOpen: 0, waitingForAccount: 0, failed: 0 });
    expect(store.landing_batch_state.map((x) => x.module_id).sort((x, y) => String(x).localeCompare(String(y)))).toEqual([M1, M2, M3, null]);
    expect(store.landing_batch_state.every((x) => x.finished_by === ADMIN && x.page_id === PAGE)).toBe(true);
    expect(opens("stu-a")).toEqual([M1, M2, M3]);
    expect(opens("stu-b")).toEqual([M1, M2, M3]);
    expect(sentTo()).toEqual(["a@x.com", "b@x.com"]);
    expect(h.send.mock.calls[0][0].htmlContent).toContain("https://pharmacozyme.com/portal/pmh");
    expect(logs()).toHaveLength(2);
  });

  it("single module: only that module row and only that module opens (whole-course buyer included)", async () => {
    setup([reg("a"), reg("b", { option_keys: ["optM2"] })]);
    const r = await press(M1);
    expect(r).toMatchObject({ modulesFinished: 1, opened: 1, emailed: 1, alreadyOpen: 0, failed: 0 });
    expect(store.landing_batch_state.map((x) => x.module_id)).toEqual([M1]);
    expect(opens("stu-a")).toEqual([M1]);
    expect(sentTo()).toEqual(["a@x.com"]);
    expect(h.send.mock.calls[0][0].htmlContent).toContain("Module One");
    expect(h.send.mock.calls[0][0].htmlContent).not.toContain("Module Two");
  });

  it("a repeat press sends nobody", async () => {
    setup([reg("a"), reg("b")]);
    await press(null);
    h.send.mockClear();
    const r = await press(null);
    expect(r).toEqual({ modulesFinished: 3, opened: 0, emailed: 0, alreadyOpen: 2, waitingForAccount: 0, failed: 0 });
    expect(h.send).not.toHaveBeenCalled();
    expect(store.landing_batch_state).toHaveLength(4);
    expect(logs()).toHaveLength(2);
  });

  it("a later press that opens more emails again", async () => {
    setup([reg("a")]);
    await press(M1);
    const r = await press(null);
    expect(r).toMatchObject({ opened: 1, emailed: 1 });
    expect(opens("stu-a")).toEqual([M1, M2, M3]);
    expect(logs()).toHaveLength(2);
  });

  it("a member with no account is waiting; the lead is still handled", async () => {
    setup([reg("lead", { row_type: "lead" }), reg("mem", { row_type: "member", lead_registration_id: "lead", student_id: null })]);
    const r = await press(null);
    expect(r).toMatchObject({ opened: 1, emailed: 1, waitingForAccount: 1, failed: 0 });
    expect(sentTo()).toEqual(["lead@x.com"]);
  });

  it("skips test rows, recorded buyers and rows that are not paid", async () => {
    setup([
      reg("t", { is_test: true }), reg("rec", { mode: "recorded" }), reg("pend", { status: "pending" }), reg("ok"),
      { ...reg("other"), page_id: "page-9" },
    ]);
    const r = await press(null);
    expect(r).toMatchObject({ opened: 1, emailed: 1 });
    expect(sentTo()).toEqual(["ok@x.com"]);
    expect(opens("stu-t")).toEqual([]);
    expect(opens("stu-rec")).toEqual([]);
  });

  it("module buyer for another module is not touched by a different module press", async () => {
    setup([reg("b", { option_keys: ["optM2"] })]);
    const r = await press(M1);
    expect(r).toMatchObject({ opened: 0, emailed: 0, alreadyOpen: 0 });
    expect(h.send).not.toHaveBeenCalled();
  });

  it("one failing send is reported, the others go out, and a re-press emails only that person", async () => {
    setup([reg("a"), reg("b"), reg("c")]);
    h.send.mockImplementation(async (o: { to: string }) => { if (o.to === "b@x.com") throw new Error("Brevo 502"); return {}; });
    const r = await press(null);
    expect(r).toEqual({ modulesFinished: 3, opened: 3, emailed: 2, alreadyOpen: 0, waitingForAccount: 0, failed: 1 });
    expect(logs()).toHaveLength(2);
    h.send.mockReset();
    h.send.mockResolvedValue({});
    const again = await press(null);
    expect(again).toEqual({ modulesFinished: 3, opened: 0, emailed: 1, alreadyOpen: 2, waitingForAccount: 0, failed: 0 });
    expect(sentTo()).toEqual(["b@x.com"]);
    expect(logs()).toHaveLength(3);
  });

  it("a page with no course returns zeros and writes nothing", async () => {
    setup([reg("a")], {}, null);
    const r = await press(null);
    expect(r).toEqual({ modulesFinished: 0, opened: 0, emailed: 0, alreadyOpen: 0, waitingForAccount: 0, failed: 0 });
    expect(db.state.ops.filter((o) => o.op !== "select")).toHaveLength(0);
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("emailPortalLinks", () => {
  const people = () => [
    reg("open"),                                                  // whole course, live, account: open
    reg("closed", { option_keys: ["optM2"] }),                    // module 2 only: M1 finished, so closed
    reg("noacct", { student_id: null }),                          // live, open, no account
    reg("recd", { mode: "recorded" }),                            // recorded: always open
  ];
  const finishedM1 = [{ page_id: PAGE, module_id: M1, finished_at: "2026-10-19T00:00:00Z", finished_by: null }];

  it("live: sends to open Live buyers, counts closed and no-account", async () => {
    setup(people(), { landing_batch_state: finishedM1 });
    const r = await emailPortalLinks({ pageId: PAGE, audience: "live", adminId: ADMIN });
    expect(r).toEqual({ sent: 1, notOpenYet: 1, waitingForAccount: 1, failed: 0 });
    expect(sentTo()).toEqual(["open@x.com"]);
    expect(h.send.mock.calls[0][0].htmlContent).toContain("Module One");
    expect(logs().map((l) => l.registration_id)).toEqual(["open"]);
  });

  it("recorded: sends to recorded buyers only", async () => {
    setup(people(), { landing_batch_state: finishedM1 });
    const r = await emailPortalLinks({ pageId: PAGE, audience: "recorded", adminId: ADMIN });
    expect(r).toEqual({ sent: 1, notOpenYet: 0, waitingForAccount: 0, failed: 0 });
    expect(sentTo()).toEqual(["recd@x.com"]);
    expect(logs().map((l) => l.registration_id)).toEqual(["recd"]);
  });

  it("both: Live and Recorded together, each send logged", async () => {
    setup(people(), { landing_batch_state: finishedM1 });
    const r = await emailPortalLinks({ pageId: PAGE, audience: "both", adminId: ADMIN });
    expect(r).toEqual({ sent: 2, notOpenYet: 1, waitingForAccount: 1, failed: 0 });
    expect(sentTo()).toEqual(["open@x.com", "recd@x.com"]);
    expect(logs()).toHaveLength(2);
  });

  it("a failed send is counted and not logged; the rest go out", async () => {
    setup(people(), { landing_batch_state: finishedM1 });
    h.send.mockImplementation(async (o: { to: string }) => { if (o.to === "open@x.com") throw new Error("boom"); return {}; });
    const r = await emailPortalLinks({ pageId: PAGE, audience: "both", adminId: ADMIN });
    expect(r).toMatchObject({ sent: 1, failed: 1 });
    expect(logs().map((l) => l.registration_id)).toEqual(["recd"]);
  });

  it("no course: zeros", async () => {
    setup(people(), {}, null);
    expect(await emailPortalLinks({ pageId: PAGE, audience: "both", adminId: ADMIN })).toEqual({ sent: 0, notOpenYet: 0, waitingForAccount: 0, failed: 0 });
  });
});

describe("getBatchOverview", () => {
  it("course title, per-module finished date, Live counts and recorded count", async () => {
    setup([reg("a"), reg("b", { option_keys: ["optM2"] }), reg("rec", { mode: "recorded" }), reg("t", { is_test: true })]);
    await press(M2);
    const o = await getBatchOverview(PAGE);
    expect(o.courseTitle).toBe("Pharma Course");
    expect(o.recordedPaid).toBe(1);
    expect(o.modules.map((m) => [m.title, m.paidLive, m.opened, m.finishedAt !== null])).toEqual([
      ["Module One", 1, 0, false],
      ["Module Two", 2, 2, true],
      ["Module Three", 1, 0, false],
    ]);
  });
  it("no course: empty overview", async () => {
    setup([reg("a")], {}, null);
    expect(await getBatchOverview(PAGE)).toEqual({ courseTitle: null, modules: [], recordedPaid: 0 });
  });
});
