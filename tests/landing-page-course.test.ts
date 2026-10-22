import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => ({ ok: true, user: { id: "admin-user" } }) }));
vi.mock("@/lib/data/landing-payment-countries", () => ({ resolveRegionAccountKeys: vi.fn() }));

import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";
const mock = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => mock.client }));

import { setPageCourse, getLandingPage } from "@/lib/data/landing-pages";
import { POST as courseRoute } from "@/app/api/admin/landing-pages/[id]/course/route";
import { emptyContent, updateRegistration } from "@/lib/landing/content";

const ID = "00000000-0000-4000-8000-000000000001";
const COURSE = "00000000-0000-4000-8000-0000000000c1";
const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never;
const ctx = { params: Promise.resolve({ id: ID }) };

const withModes = (modes: ("live" | "recorded")[]) =>
  updateRegistration(emptyContent("course"), { modes } as never);
const pageRow = (over: Record<string, unknown> = {}) => {
  const c = withModes(["live", "recorded"]);
  return {
    id: ID, slug: "ppc", kind: "course", title: "PPC", status: "published", draft: c, published: c, revision: 1,
    published_at: "2026-01-01T00:00:00Z", created_by: "u", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    course_id: null, is_main_page: false, ...over,
  };
};

let store: Store;
let rpcResult: { data: unknown; error: unknown };
function setup(page: Record<string, unknown> | null, courseExists = true) {
  store = { landing_pages: page ? [page] : [], courses: courseExists ? [{ id: COURSE }] : [] };
  const h = memoryHandler(store);
  mock.state.handler = (op) => (op.op === "rpc" ? rpcResult : h(op));
}
const rpcs = () => mock.state.ops.filter((o) => o.op === "rpc");

beforeEach(() => {
  mock.reset(); revalidatePath.mockReset(); rpcResult = { data: null, error: null };
});

describe("setPageCourse", () => {
  it("isMain without a course returns no-course and makes no RPC call", async () => {
    setup(pageRow());
    expect(await setPageCourse(ID, null, true)).toEqual({ ok: false, reason: "no-course" });
    expect(rpcs()).toHaveLength(0);
  });
  it("a recorded-only page cannot be the main page", async () => {
    const c = withModes(["recorded"]);
    setup(pageRow({ draft: c, published: c }));
    expect(await setPageCourse(ID, COURSE, true)).toEqual({ ok: false, reason: "no-live" });
    expect(rpcs()).toHaveLength(0);
  });
  it("reads the published copy when it exists, else the draft", async () => {
    const live = withModes(["live"]);
    setup(pageRow({ draft: withModes(["recorded"]), published: live }));
    expect(await setPageCourse(ID, COURSE, true)).toEqual({ ok: true });
    setup(pageRow({ draft: live, published: null }));
    expect(await setPageCourse(ID, COURSE, true)).toEqual({ ok: true });
  });
  it("a live page calls landing_set_main_page and revalidates", async () => {
    setup(pageRow());
    expect(await setPageCourse(ID, COURSE, true)).toEqual({ ok: true });
    expect(rpcs().map((o) => [o.table, o.payload])).toEqual([
      ["landing_set_main_page", { p_page_id: ID, p_course_id: COURSE, p_main: true }],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/admin/landing-pages");
  });
  it("isMain false with a course just assigns", async () => {
    const c = withModes(["recorded"]);
    setup(pageRow({ draft: c, published: c }));
    expect(await setPageCourse(ID, COURSE, false)).toEqual({ ok: true });
    expect(rpcs()[0].payload).toEqual({ p_page_id: ID, p_course_id: COURSE, p_main: false });
  });
  it("unassigning (null course, not main) skips the course check", async () => {
    setup(pageRow(), false);
    expect(await setPageCourse(ID, null, false)).toEqual({ ok: true });
    expect(rpcs()[0].payload).toEqual({ p_page_id: ID, p_course_id: null, p_main: false });
  });
  it("a missing course is course-missing", async () => {
    setup(pageRow(), false);
    expect(await setPageCourse(ID, COURSE, false)).toEqual({ ok: false, reason: "course-missing" });
    expect(rpcs()).toHaveLength(0);
  });
  it("a missing page is not-found", async () => {
    setup(null);
    rpcResult = { data: null, error: { message: "page_not_found" } };
    expect(await setPageCourse(ID, COURSE, false)).toEqual({ ok: false, reason: "not-found" });
  });
  it("maps RPC errors: page_not_found, unique violation 23505 and others", async () => {
    setup(pageRow());
    rpcResult = { data: null, error: { message: "page_not_found" } };
    expect(await setPageCourse(ID, COURSE, true)).toEqual({ ok: false, reason: "not-found" });
    rpcResult = { data: null, error: { code: "23505", message: "duplicate key" } };
    expect(await setPageCourse(ID, COURSE, true)).toEqual({ ok: false, reason: "error" });
    rpcResult = { data: null, error: { message: "boom" } };
    expect(await setPageCourse(ID, COURSE, true)).toEqual({ ok: false, reason: "error" });
  });
  it("a failed page read is error, not a throw", async () => {
    mock.state.handler = () => ({ data: null, error: { message: "down" } });
    expect(await setPageCourse(ID, COURSE, true)).toEqual({ ok: false, reason: "error" });
  });
});

describe("page mapping", () => {
  it("getLandingPage exposes courseId and isMainPage", async () => {
    setup(pageRow({ course_id: COURSE, is_main_page: true }));
    const p = await getLandingPage(ID);
    expect(p?.courseId).toBe(COURSE);
    expect(p?.isMainPage).toBe(true);
  });
});

describe("POST /api/admin/landing-pages/[id]/course", () => {
  it("404 on a bad uuid", async () => {
    const res = await courseRoute(req({ courseId: null, isMain: false }), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });
  it("400 on a bad body", async () => {
    setup(pageRow());
    expect((await courseRoute(req({ courseId: "x", isMain: false }), ctx)).status).toBe(400);
  });
  it("422 with plain messages", async () => {
    setup(pageRow());
    let res = await courseRoute(req({ courseId: null, isMain: true }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("Pick a course first");
    const c = withModes(["recorded"]);
    setup(pageRow({ draft: c, published: c }));
    res = await courseRoute(req({ courseId: COURSE, isMain: true }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("This page has no live option, so it cannot be the main page");
    setup(pageRow(), false);
    res = await courseRoute(req({ courseId: COURSE, isMain: false }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("Course not found");
  });
  it("404 when the page is missing, 500 on error", async () => {
    setup(null);
    rpcResult = { data: null, error: { message: "page_not_found" } };
    expect((await courseRoute(req({ courseId: COURSE, isMain: false }), ctx)).status).toBe(404);
    setup(pageRow());
    rpcResult = { data: null, error: { message: "boom" } };
    expect((await courseRoute(req({ courseId: COURSE, isMain: false }), ctx)).status).toBe(500);
  });
  it("200 ok on success", async () => {
    setup(pageRow());
    const res = await courseRoute(req({ courseId: COURSE, isMain: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
