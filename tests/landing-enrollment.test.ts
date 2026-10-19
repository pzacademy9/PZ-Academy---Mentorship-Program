import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const pageState = vi.hoisted(() => ({ page: null as null | { id: string; courseId: string | null; registration: { options: { key: string; moduleIds: string[] }[] } } }));
vi.mock("@/lib/data/landing-public", () => ({ getRegistrablePageById: async () => pageState.page }));

import { isBatchFinished, resolveAccess, syncEnrollmentForRegistration } from "@/lib/data/landing-enrollment";

const PAGE = "page-1";
const COURSE = "course-1";
const store = (state: Record<string, unknown>[], modules: string[] = []): Store => ({
  landing_batch_state: state,
  modules: modules.map((id) => ({ id, course_id: COURSE })),
});
const use = (s: Store) => { db.state.handler = memoryHandler(s); };
const row = (module_id: string | null, page_id = PAGE) => ({ page_id, module_id, finished_at: "2026-10-19T00:00:00Z", finished_by: null });

beforeEach(() => db.reset());

describe("isBatchFinished", () => {
  it("is false with no rows", async () => {
    use(store([], ["a", "b"]));
    expect(await isBatchFinished(PAGE, COURSE, [])).toBe(false);
    expect(await isBatchFinished(PAGE, COURSE, ["a"])).toBe(false);
  });
  it("is true when a whole-course row exists", async () => {
    use(store([row(null)], ["a"]));
    expect(await isBatchFinished(PAGE, COURSE, [])).toBe(true);
    expect(await isBatchFinished(PAGE, COURSE, ["a"])).toBe(true);
  });
  it("ignores rows of other pages", async () => {
    use(store([row(null, "other")], ["a"]));
    expect(await isBatchFinished(PAGE, COURSE, ["a"])).toBe(false);
  });
  it("module buyer: true only when every bought module has a row", async () => {
    use(store([row("a"), row("b")], ["a", "b", "c"]));
    expect(await isBatchFinished(PAGE, COURSE, ["a", "b"])).toBe(true);
    expect(await isBatchFinished(PAGE, COURSE, ["a", "c"])).toBe(false);
  });
  it("whole-course buyer without a course row: true only when every module of the course has a row", async () => {
    use(store([row("a"), row("b")], ["a", "b"]));
    expect(await isBatchFinished(PAGE, COURSE, [])).toBe(true);
    use(store([row("a")], ["a", "b"]));
    expect(await isBatchFinished(PAGE, COURSE, [])).toBe(false);
  });
  it("whole-course buyer, course with no modules: false", async () => {
    use(store([row("a")], []));
    expect(await isBatchFinished(PAGE, COURSE, [])).toBe(false);
  });
  it("throws on a query error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(isBatchFinished(PAGE, COURSE, [])).rejects.toThrow(/boom/);
  });
});

// ---------------------------------------------------------------------------
// resolveAccess / syncEnrollmentForRegistration
// ---------------------------------------------------------------------------
const STUDENT = "stu-1";
const M1 = "mod-1", M2 = "mod-2", M3 = "mod-3";
const reg = (o: Record<string, unknown> = {}) => ({
  id: "reg-1", page_id: PAGE, row_type: "individual", lead_registration_id: null, ref_id: "R1", name: "A", email: "a@x.com",
  option_keys: ["opt"], mode: "recorded", status: "paid", student_id: STUDENT, is_test: false, ...o,
});
const setPage = (opts: { key: string; moduleIds: string[] }[] = [{ key: "opt", moduleIds: [] }], courseId: string | null = COURSE) => {
  pageState.page = { id: PAGE, courseId, registration: { options: opts } };
};
interface World { regs?: Record<string, unknown>[]; enrollments?: Record<string, unknown>[]; em?: Record<string, unknown>[]; batch?: Record<string, unknown>[]; progress?: Record<string, unknown>[] }
const world = (w: World = {}): Store => {
  const s: Store = {
    landing_registrations: w.regs ?? [reg()],
    courses: [{ id: COURSE, slug: "pmh" }],
    modules: [{ id: M1, course_id: COURSE, order_index: 1 }, { id: M2, course_id: COURSE, order_index: 2 }, { id: M3, course_id: COURSE, order_index: 3 }],
    lessons: [
      { id: "l1b", module_id: M1, order_index: 2 }, { id: "l1a", module_id: M1, order_index: 1 },
      { id: "l2a", module_id: M2, order_index: 1 }, { id: "l3a", module_id: M3, order_index: 1 },
    ],
    landing_batch_state: w.batch ?? [],
    enrollments: w.enrollments ?? [],
    enrollment_modules: w.em ?? [],
    lesson_progress: w.progress ?? [],
  };
  use(s);
  return s;
};
const enr = (o: Record<string, unknown> = {}) => ({ id: "enr-1", student_id: STUDENT, course_id: COURSE, status: "pending", portal_open: true, access_level: null, landing_registration_id: null, ...o });
const writes = (table: string) => db.state.ops.filter((o) => o.table === table && o.op !== "select");
const allWrites = () => db.state.ops.filter((o) => o.op !== "select");

describe("resolveAccess", () => {
  it("null when the registration or page is missing", async () => {
    setPage(); world({ regs: [] });
    expect(await resolveAccess("reg-1")).toBeNull();
    pageState.page = null; world();
    expect(await resolveAccess("reg-1")).toBeNull();
  });
  it("recorded paid with account: grant, open, slug loaded", async () => {
    setPage(); world();
    const r = await resolveAccess("reg-1");
    expect(r).toMatchObject({ pageId: PAGE, courseId: COURSE, courseSlug: "pmh", hasAccount: true });
    expect(r!.desired).toMatchObject({ action: "grant", portalOpen: true, status: "active" });
  });
  it("guest: hasAccount false", async () => {
    setPage(); world({ regs: [reg({ student_id: null })] });
    expect((await resolveAccess("reg-1"))!.hasAccount).toBe(false);
  });
  it("no course: courseId null, skip", async () => {
    setPage(undefined, null); world();
    const r = await resolveAccess("reg-1");
    expect(r!.courseId).toBeNull();
    expect(r!.courseSlug).toBeNull();
    expect(r!.desired.action).toBe("skip");
  });
  it("member: own status, lead's options and mode, union of module ids", async () => {
    setPage([{ key: "a", moduleIds: [M1] }, { key: "b", moduleIds: [M1, M2] }, { key: "c", moduleIds: [M3] }]);
    world({ regs: [
      reg({ id: "lead", row_type: "lead", status: "paid", mode: "live", option_keys: ["a", "b"] }),
      reg({ id: "mem", row_type: "member", lead_registration_id: "lead", status: "pending", mode: "recorded", option_keys: ["c"], student_id: "stu-2" }),
    ] });
    const r = await resolveAccess("mem");
    expect(r!.lead.id).toBe("lead");
    expect([...r!.desired.moduleIds].sort()).toEqual([M1, M2]);
    expect(r!.desired).toMatchObject({ action: "revert", accessLevel: "live" });
  });
});

describe("syncEnrollmentForRegistration", () => {
  it("recorded paid: pending insert, modules before activation, active+open", async () => {
    setPage([{ key: "opt", moduleIds: [M1, M2] }]);
    const s = world();
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("granted");
    const kinds = allWrites().filter((o) => ["enrollments", "enrollment_modules"].includes(o.table)).map((o) => `${o.table}:${o.op}`);
    expect(kinds).toEqual(["enrollments:insert", "enrollment_modules:insert", "enrollments:update"]);
    const ins = writes("enrollments")[0].payload as Record<string, unknown>;
    expect(ins).toMatchObject({ student_id: STUDENT, course_id: COURSE, status: "pending", access_level: "recorded", portal_open: false, landing_registration_id: "reg-1" });
    expect(typeof ins.verified_at).toBe("string");
    expect(writes("enrollments")[1].payload).toEqual({ status: "active", portal_open: true });
    expect(s.enrollment_modules.map((r) => r.module_id)).toEqual([M1, M2]);
  });
  it("no module rows for a whole-course option (empty moduleIds)", async () => {
    setPage(); const s = world();
    await syncEnrollmentForRegistration("reg-1");
    expect(s.enrollment_modules).toHaveLength(0);
  });
  it("live paid, batch not finished: active but closed", async () => {
    setPage(); world({ regs: [reg({ mode: "live" })] });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("granted");
    expect(writes("enrollments")[1].payload).toEqual({ status: "active", portal_open: false });
  });
  it("live paid, batch finished: open", async () => {
    setPage(); world({ regs: [reg({ mode: "live" })], batch: [row(null)] });
    await syncEnrollmentForRegistration("reg-1");
    expect(writes("enrollments")[1].payload).toEqual({ status: "active", portal_open: true });
  });
  it("guest: no-account, nothing written", async () => {
    setPage(); world({ regs: [reg({ student_id: null })] });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("no-account");
    expect(allWrites()).toHaveLength(0);
  });
  it("test row, no course, missing registration: skipped", async () => {
    setPage(); world({ regs: [reg({ is_test: true })] });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("skipped");
    setPage(undefined, null); world();
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("skipped");
    world({ regs: [] });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("skipped");
    expect(allWrites()).toHaveLength(0);
  });
  it("existing foreign active enrollment: Paid widens only", async () => {
    setPage();
    const s = world({ regs: [reg({ mode: "live" })], enrollments: [enr({ status: "active", portal_open: true, access_level: "live" })] });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("granted"); // landing_registration_id filled
    expect(s.enrollments[0]).toMatchObject({ status: "active", portal_open: true, access_level: "live", landing_registration_id: "reg-1" });
    expect(s.enrollments).toHaveLength(1);
  });
  it("(a) existing pending with default open takes d.portalOpen", async () => {
    setPage(); const s = world({ regs: [reg({ mode: "live" })], enrollments: [enr({ status: "pending", portal_open: true })] });
    await syncEnrollmentForRegistration("reg-1");
    expect(s.enrollments[0]).toMatchObject({ status: "active", portal_open: false });
  });
  it("(a) existing active+open stays open when d closed", async () => {
    setPage(); const s = world({ regs: [reg({ mode: "live" })], enrollments: [enr({ status: "active", portal_open: true, landing_registration_id: "other" })] });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("no-change");
    expect(s.enrollments[0]).toMatchObject({ portal_open: true, landing_registration_id: "other" });
  });
  it("never downgrades live to recorded", async () => {
    setPage(); const s = world({ enrollments: [enr({ status: "active", access_level: "live", landing_registration_id: "reg-1" })] });
    await syncEnrollmentForRegistration("reg-1");
    expect(s.enrollments[0].access_level).toBe("live");
  });
  it("existing whole-course (no rows) stays untouched", async () => {
    setPage([{ key: "opt", moduleIds: [M1] }]);
    const s = world({ enrollments: [enr({ status: "active", landing_registration_id: "reg-1" })] });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("no-change");
    expect(s.enrollment_modules).toHaveLength(0);
  });
  it("existing module rows + whole-course purchase: rows deleted", async () => {
    setPage();
    const s = world({ enrollments: [enr({ status: "active", landing_registration_id: "reg-1" })], em: [{ enrollment_id: "enr-1", module_id: M1 }] });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("granted");
    expect(s.enrollment_modules).toHaveLength(0);
  });
  it("(b) adds missing modules to active+open enrollment and unlocks their first lessons, never downgrading", async () => {
    setPage([{ key: "opt", moduleIds: [M1, M2, M3] }]);
    const s = world({
      enrollments: [enr({ status: "active", portal_open: true, landing_registration_id: "reg-1" })],
      em: [{ enrollment_id: "enr-1", module_id: M1 }],
      progress: [{ student_id: STUDENT, lesson_id: "l2a", status: "completed" }],
    });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("granted");
    expect(s.enrollment_modules.map((r) => r.module_id).sort()).toEqual([M1, M2, M3]);
    const byLesson = Object.fromEntries(s.lesson_progress.map((p) => [p.lesson_id, p.status]));
    expect(byLesson).toEqual({ l2a: "completed", l3a: "unlocked" });
  });
  it("(b) a locked first lesson is updated to unlocked", async () => {
    setPage([{ key: "opt", moduleIds: [M1, M2] }]);
    const s = world({
      enrollments: [enr({ status: "active", portal_open: true, landing_registration_id: "reg-1" })],
      em: [{ enrollment_id: "enr-1", module_id: M1 }],
      progress: [{ student_id: STUDENT, lesson_id: "l2a", status: "locked" }],
    });
    await syncEnrollmentForRegistration("reg-1");
    expect(s.lesson_progress[0].status).toBe("unlocked");
  });
  it("(b) no manual unlock when the enrollment was not open (trigger handles it)", async () => {
    setPage([{ key: "opt", moduleIds: [M1, M2] }]);
    const s = world({
      enrollments: [enr({ status: "pending", portal_open: true })],
      em: [{ enrollment_id: "enr-1", module_id: M1 }],
    });
    await syncEnrollmentForRegistration("reg-1");
    expect(s.lesson_progress).toHaveLength(0);
  });
  it("reversal of an owned enrollment: pending + closed", async () => {
    setPage(); const s = world({ regs: [reg({ status: "pending" })], enrollments: [enr({ status: "active", portal_open: true, landing_registration_id: "reg-1" })] });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("reverted");
    expect(s.enrollments[0]).toMatchObject({ status: "pending", portal_open: false });
  });
  it("reversal to reserved keeps reserved", async () => {
    setPage(); const s = world({ regs: [reg({ status: "reserved" })], enrollments: [enr({ status: "active", landing_registration_id: "reg-1" })] });
    await syncEnrollmentForRegistration("reg-1");
    expect(s.enrollments[0].status).toBe("reserved");
  });
  it("reversal does not touch an enrollment owned by someone else", async () => {
    setPage(); const s = world({ regs: [reg({ status: "pending" })], enrollments: [enr({ status: "active", portal_open: true, landing_registration_id: "other" })] });
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("no-change");
    expect(s.enrollments[0]).toMatchObject({ status: "active", portal_open: true });
    expect(writes("enrollments")).toHaveLength(0);
  });
  it("idempotent: second identical call writes nothing", async () => {
    setPage([{ key: "opt", moduleIds: [M1] }]); world();
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("granted");
    db.state.ops = [];
    expect(await syncEnrollmentForRegistration("reg-1")).toBe("no-change");
    expect(allWrites()).toHaveLength(0);
  });
  it("throws on a DB error", async () => {
    setPage(); db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(syncEnrollmentForRegistration("reg-1")).rejects.toThrow(/boom/);
  });
});
