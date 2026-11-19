import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const gate = vi.hoisted(() => ({ mode: "ok" as "ok" | "401" | "403", calls: [] as unknown[], denyOn: null as string | null }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async (area: unknown) => {
    gate.calls.push(area);
    return gate.mode === "ok" && gate.denyOn !== area
      ? { ok: true, user: { id: "admin-1" } }
      : { ok: false, response: new Response(JSON.stringify({ error: "x" }), { status: gate.mode === "401" ? 401 : 403 }) };
  },
}));
const m = vi.hoisted(() => ({
  getPortalOverview: vi.fn(), duplicatePortal: vi.fn(), attachPortal: vi.fn(),
  setPortalGroup: vi.fn(), previewMove: vi.fn(), moveStudents: vi.fn(),
}));
vi.mock("@/lib/data/portals", () => m);

import { GET as overviewGet } from "@/app/api/admin/landing/portal/route";
import { POST as dupPost } from "@/app/api/admin/landing/portal/duplicate/route";
import { GET as moveGet, POST as movePost } from "@/app/api/admin/landing/portal/move/route";
import { POST as attachPost } from "@/app/api/admin/landing/portal/attach/route";
import { POST as groupPost } from "@/app/api/admin/landing/portal/group/route";
import { PortalError } from "@/lib/data/portal-errors";

const PAGE = "00000000-0000-4000-8000-000000000001";
const COURSE = "00000000-0000-4000-8000-000000000002";
const post = (body: unknown) => new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never;
const get = (qs: string) => new Request(`http://x/api${qs}`) as never;
const GENERIC = { error: "Something went wrong. Please try again." };

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  gate.mode = "ok";
  gate.calls = [];
  gate.denyOn = null;
  for (const f of Object.values(m)) f.mockReset();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe("admin gate", () => {
  it("each route returns 401 or 403 for a non-admin and never reaches the data layer", async () => {
    for (const mode of ["401", "403"] as const) {
      gate.mode = mode;
      const s = Number(mode);
      expect((await overviewGet(get(`?pageId=${PAGE}`))).status).toBe(s);
      expect((await dupPost(post({}))).status).toBe(s);
      expect((await moveGet(get(`?pageId=${PAGE}&toCourseId=${COURSE}`))).status).toBe(s);
      expect((await movePost(post({}))).status).toBe(s);
      expect((await attachPost(post({}))).status).toBe(s);
      expect((await groupPost(post({}))).status).toBe(s);
    }
    for (const f of Object.values(m)) expect(f).not.toHaveBeenCalled();
  });
});

describe("area per route", () => {
  it("each route asks for its own area", async () => {
    const run = async (fn: () => Promise<Response>) => { gate.calls = []; await fn(); return gate.calls[0]; };
    expect(await run(() => overviewGet(get(`?pageId=${PAGE}`)))).toEqual(["enrollments", "landing_pages", "courses"]);
    expect(await run(() => dupPost(post({})))).toBe("courses");
    expect(await run(() => groupPost(post({})))).toBe("courses");
    expect(await run(() => moveGet(get("?")))).toBe("enrollments");
    expect(await run(() => movePost(post({})))).toBe("enrollments");
    expect(await run(() => attachPost(post({})))).toBe("landing_pages");
  });
});

describe("duplicate needs both areas", () => {
  const body = { pageId: PAGE, sourceCourseId: COURSE, title: "X" };
  it("checks courses and landing_pages", async () => {
    m.duplicatePortal.mockResolvedValue({ courseId: "new" });
    expect((await dupPost(post(body))).status).toBe(200);
    expect(gate.calls).toEqual(["courses", "landing_pages"]);
  });
  it("a 403 from either area stops before duplicatePortal", async () => {
    for (const area of ["courses", "landing_pages"]) {
      gate.denyOn = area;
      expect((await dupPost(post(body))).status).toBe(403);
    }
    expect(m.duplicatePortal).not.toHaveBeenCalled();
  });
});

describe("GET overview", () => {
  it("returns the overview, 404 for an unknown page, 400 for a bad id", async () => {
    m.getPortalOverview.mockResolvedValue({ portal: null, siblings: [], families: [], sources: [] });
    expect((await overviewGet(get(`?pageId=${PAGE}`))).status).toBe(200);
    m.getPortalOverview.mockResolvedValue(null);
    expect((await overviewGet(get(`?pageId=${PAGE}`))).status).toBe(404);
    expect((await overviewGet(get("?pageId=nope"))).status).toBe(400);
  });
});

describe("POST duplicate", () => {
  it("returns 400 for a missing sourceCourseId", async () => {
    const res = await dupPost(post({ pageId: PAGE, title: "X" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid input" });
    expect(m.duplicatePortal).not.toHaveBeenCalled();
  });
  it("400 for a blank title or an over-long label", async () => {
    expect((await dupPost(post({ pageId: PAGE, sourceCourseId: COURSE, title: "  " }))).status).toBe(400);
    expect((await dupPost(post({ pageId: PAGE, sourceCourseId: COURSE, title: "X", batchLabel: "a".repeat(61) }))).status).toBe(400);
  });
  it("passes cleaned values and returns the new course id", async () => {
    m.duplicatePortal.mockResolvedValue({ courseId: "new" });
    const res = await dupPost(post({ pageId: PAGE, sourceCourseId: COURSE, title: " PPC 5 " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ courseId: "new" });
    expect(m.duplicatePortal).toHaveBeenCalledWith({ pageId: PAGE, sourceCourseId: COURSE, title: "PPC 5", familyId: null, newFamilyName: null, batchLabel: null });
  });
});

describe("move", () => {
  it("GET returns the preview", async () => {
    m.previewMove.mockResolvedValue({ toMove: 1, alreadyThere: 0, unmatchedModules: 0 });
    const res = await moveGet(get(`?pageId=${PAGE}&toCourseId=${COURSE}`));
    expect(await res.json()).toEqual({ toMove: 1, alreadyThere: 0, unmatchedModules: 0 });
    expect(m.previewMove).toHaveBeenCalledWith(PAGE, COURSE);
  });
  it("POST returns 500 with the plain message on an RPC error", async () => {
    m.moveStudents.mockRejectedValue(new Error("secret db detail"));
    const res = await movePost(post({ pageId: PAGE, toCourseId: COURSE }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(GENERIC);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("secret");
  });
  it("POST maps a PortalError to its status and calm message", async () => {
    m.moveStudents.mockRejectedValue(new PortalError("This batch already uses that portal.", 409));
    const res = await movePost(post({ pageId: PAGE, toCourseId: COURSE }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This batch already uses that portal." });
  });
  it("POST 400 for bad input", async () => {
    expect((await movePost(post({ pageId: PAGE }))).status).toBe(400);
  });
});

describe("attach and group", () => {
  it("attach calls the helper", async () => {
    m.attachPortal.mockResolvedValue(undefined);
    expect((await attachPost(post({ pageId: PAGE, courseId: COURSE }))).status).toBe(200);
    expect(m.attachPortal).toHaveBeenCalledWith(PAGE, COURSE);
    expect((await attachPost(post({ pageId: PAGE }))).status).toBe(400);
  });
  it("group calls the helper with nulls for missing optionals", async () => {
    m.setPortalGroup.mockResolvedValue(undefined);
    expect((await groupPost(post({ courseId: COURSE, batchLabel: "Batch 2" }))).status).toBe(200);
    expect(m.setPortalGroup).toHaveBeenCalledWith({ courseId: COURSE, familyId: null, newFamilyName: null, batchLabel: "Batch 2" });
    expect((await groupPost(post({ courseId: "bad" }))).status).toBe(400);
  });
});
