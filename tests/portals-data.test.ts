import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const revalidate = vi.hoisted(() => ({ revalidateLandingSlug: vi.fn() }));
vi.mock("@/lib/data/landing-revalidate", () => revalidate);

import { getPortalOverview, previewMove, moveStudents, duplicatePortal, attachPortal, setPortalGroup } from "@/lib/data/portals";
import { PortalError } from "@/lib/data/portal-errors";

const PAGE = "page-1", C1 = "course-1", C2 = "course-2", C3 = "course-3", FAM = "fam-1";

let store: Store;
let rpcCalls: { fn: string; args: Record<string, unknown> }[];
let rpcReply: (fn: string) => { data: unknown; error: { message: string } | null };

beforeEach(() => {
  db.reset();
  revalidate.revalidateLandingSlug.mockReset();
  rpcCalls = [];
  rpcReply = () => ({ data: null, error: null });
  store = {
    course_families: [{ id: FAM, name: "PPC" }],
    courses: [
      { id: C1, title: "PPC Batch 3", slug: "ppc-3", is_published: true, family_id: FAM, batch_label: "Batch 3" },
      { id: C2, title: "PPC Batch 4", slug: "ppc-4", is_published: false, family_id: FAM, batch_label: "Batch 4" },
      { id: C3, title: "Loose", slug: "loose", is_published: true, family_id: null, batch_label: null },
    ],
    landing_pages: [{ id: PAGE, slug: "ppc-3-page", is_main_page: false, course_id: C1 }],
  };
  db.state.handler = memoryHandler(store, (fn, args) => {
    rpcCalls.push({ fn, args: args as Record<string, unknown> });
    return rpcReply(fn);
  });
});

describe("getPortalOverview", () => {
  it("returns null for an unknown page", async () => {
    expect(await getPortalOverview("nope")).toBeNull();
  });
  it("returns the portal, family siblings, families and every course as sources", async () => {
    const o = await getPortalOverview(PAGE);
    expect(o?.portal).toMatchObject({ id: C1, familyId: FAM, familyName: "PPC", batchLabel: "Batch 3" });
    expect(o?.siblings.map((s) => s.id)).toEqual([C2]);
    expect(o?.families).toEqual([{ id: FAM, name: "PPC" }]);
    expect(o?.sources).toHaveLength(3);
  });
  it("uses ungrouped courses as siblings when the portal has no family", async () => {
    store.landing_pages[0].course_id = C3;
    const o = await getPortalOverview(PAGE);
    expect(o?.siblings).toEqual([]);
  });
  it("returns portal null when the page has no course", async () => {
    store.landing_pages[0].course_id = null;
    const o = await getPortalOverview(PAGE);
    expect(o?.portal).toBeNull();
    expect(o?.sources).toHaveLength(3);
  });
});

describe("getPortalOverview before migration 0119", () => {
  const mem = () => db.state.handler;
  const wrap = (breakCourses: boolean, breakFamilies: boolean, breakFallback = false) => {
    const inner = mem();
    db.state.handler = (op) => {
      if (op.table === "courses" && op.op === "select") {
        const newCols = (op.columns ?? "").includes("family_id");
        if (newCols && breakCourses) return { data: null, error: { message: "column courses.family_id does not exist" } };
        if (!newCols && breakFallback) return { data: null, error: { message: "boom" } };
      }
      if (op.table === "course_families" && breakFamilies) return { data: null, error: { message: "relation does not exist" } };
      return inner(op);
    };
  };
  it("returns null family fields when the first select errors and the fallback works", async () => {
    wrap(true, true);
    const o = await getPortalOverview(PAGE);
    expect(o?.portal).toMatchObject({ id: C1, familyId: null, familyName: null, batchLabel: null });
    expect(o?.families).toEqual([]);
    expect(o?.siblings.map((s) => s.id).sort()).toEqual([C2, C3]);
    expect(o?.sources).toHaveLength(3);
  });
  it("throws when the fallback select fails too", async () => {
    wrap(true, true, true);
    await expect(getPortalOverview(PAGE)).rejects.toThrow();
  });
  it("a missing course_families table yields families []", async () => {
    wrap(false, true);
    const o = await getPortalOverview(PAGE);
    expect(o?.families).toEqual([]);
    expect(o?.portal).toMatchObject({ id: C1, familyId: FAM, familyName: null });
  });
});

describe("previewMove and moveStudents", () => {
  it("previewMove maps the RPC keys and passes p_dry_run true", async () => {
    rpcReply = () => ({ data: { to_move: 5, already_there: 2, unmatched_modules: 1, moved: 0 }, error: null });
    expect(await previewMove(PAGE, C2)).toEqual({ toMove: 5, alreadyThere: 2, unmatchedModules: 1 });
    expect(rpcCalls[0]).toEqual({ fn: "move_batch_students", args: { p_page: PAGE, p_to_course: C2, p_dry_run: true } });
  });
  it("moveStudents calls the RPC with p_dry_run false and returns moved", async () => {
    rpcReply = () => ({ data: { to_move: 5, already_there: 0, unmatched_modules: 0, moved: 5 }, error: null });
    expect(await moveStudents(PAGE, C2)).toEqual({ moved: 5 });
    expect(rpcCalls[0].args.p_dry_run).toBe(false);
  });
  it("previewMove throws when the RPC errors", async () => {
    rpcReply = () => ({ data: null, error: { message: "connection reset" } });
    await expect(previewMove(PAGE, C2)).rejects.toThrow();
  });
  it("turns known raised messages into a calm PortalError", async () => {
    rpcReply = () => ({ data: null, error: { message: "The new portal has no modules yet" } });
    const e2 = await moveStudents(PAGE, C2).catch((x) => x);
    expect(e2).toBeInstanceOf(PortalError);
    expect(e2.status).toBe(409);
    expect(e2.message).toBe("That portal has no modules yet.");
  });
  it("maps the main-page refusal and the modules-mismatch refusal to 409, for preview and move", async () => {
    rpcReply = () => ({ data: null, error: { message: "This batch is the website's main page for its course. Untick Main page first." } });
    for (const run of [() => previewMove(PAGE, C2), () => moveStudents(PAGE, C2)]) {
      const e = await run().catch((x) => x);
      expect(e).toBeInstanceOf(PortalError);
      expect(e.status).toBe(409);
      expect(e.message).toBe("This batch is the website's main page for its course. Untick Main page first.");
    }
    rpcReply = () => ({ data: null, error: { message: "Some students chose modules the new portal does not have. Make the modules match first." } });
    const e = await previewMove(PAGE, C2).catch((x) => x);
    expect(e).toBeInstanceOf(PortalError);
    expect(e.status).toBe(409);
    expect(e.message).toBe("Some students chose modules the new portal does not have. Make the modules match first.");
  });
  it("a function-not-found error (migration not pasted) becomes a calm 409 for preview, move and duplicate", async () => {
    const calm = "The database change has not been pasted yet.";
    rpcReply = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.move_batch_students" } as never });
    for (const run of [() => previewMove(PAGE, C2), () => moveStudents(PAGE, C2)]) {
      const e = await run().catch((x) => x);
      expect(e).toBeInstanceOf(PortalError);
      expect(e.status).toBe(409);
      expect(e.message).toBe(calm);
    }
    rpcReply = () => ({ data: null, error: { message: "Could not find the function public.duplicate_course(p_source) in the schema cache" } });
    const d = await duplicatePortal({ pageId: PAGE, sourceCourseId: C1, title: "X", familyId: null, newFamilyName: null, batchLabel: null }).catch((x) => x);
    expect(d).toBeInstanceOf(PortalError);
    expect(d.message).toBe(calm);
  });
});

describe("duplicatePortal", () => {
  const base = { pageId: PAGE, sourceCourseId: C1, title: "PPC Batch 5", familyId: FAM, newFamilyName: null, batchLabel: "Batch 5" };
  beforeEach(() => { rpcReply = () => ({ data: "new-course", error: null }); });

  it("creates a family only when newFamilyName is given", async () => {
    await duplicatePortal(base);
    expect(store.course_families).toHaveLength(1);
    const r = await duplicatePortal({ ...base, familyId: null, newFamilyName: "  Pharma  " });
    expect(r).toEqual({ courseId: "new-course" });
    expect(store.course_families.map((f) => f.name)).toEqual(["PPC", "Pharma"]);
    const newFam = store.course_families[1].id;
    expect(rpcCalls[1]).toEqual({ fn: "duplicate_course", args: { p_source: C1, p_title: "PPC Batch 5", p_family: newFam, p_batch_label: "Batch 5" } });
  });
  it("points the page at the copy", async () => {
    await duplicatePortal(base);
    expect(store.landing_pages[0].course_id).toBe("new-course");
  });
  it("rejects an unknown page before any RPC call", async () => {
    await expect(duplicatePortal({ ...base, pageId: "ghost" })).rejects.toBeInstanceOf(PortalError);
    expect(rpcCalls).toHaveLength(0);
    expect(store.course_families).toHaveLength(1);
  });
  it("refuses a main page before creating the copy or touching anything", async () => {
    store.landing_pages[0].is_main_page = true;
    const e = await duplicatePortal(base).catch((x) => x);
    expect(e).toBeInstanceOf(PortalError);
    expect(e.status).toBe(409);
    expect(e.message).toBe("This batch is the website's main page for its course. Untick Main page first.");
    expect(rpcCalls).toHaveLength(0);
    expect(store.landing_pages[0].course_id).toBe(C1);
    expect(store.landing_pages[0].is_main_page).toBe(true);
    expect(store.course_families).toHaveLength(1);
  });
  it("refreshes the public page cache after pointing the page at the copy", async () => {
    await duplicatePortal(base);
    expect(revalidate.revalidateLandingSlug).toHaveBeenCalledWith("ppc-3-page");
  });
  it("rejects a blank title before any database call", async () => {
    await expect(duplicatePortal({ ...base, title: "   " })).rejects.toBeInstanceOf(PortalError);
    expect(db.state.ops).toHaveLength(0);
  });
});

describe("attachPortal and setPortalGroup", () => {
  it("attachPortal points the page at an existing course", async () => {
    await attachPortal(PAGE, C2);
    expect(store.landing_pages[0].course_id).toBe(C2);
  });
  it("attachPortal refuses a main page and leaves it alone", async () => {
    store.landing_pages[0].is_main_page = true;
    const e = await attachPortal(PAGE, C2).catch((x) => x);
    expect(e).toBeInstanceOf(PortalError);
    expect(e.status).toBe(409);
    expect(e.message).toBe("This batch is the website's main page for its course. Untick Main page first.");
    expect(store.landing_pages[0].course_id).toBe(C1);
    expect(store.landing_pages[0].is_main_page).toBe(true);
    expect(revalidate.revalidateLandingSlug).not.toHaveBeenCalled();
  });
  it("attachPortal refreshes the public page cache", async () => {
    await attachPortal(PAGE, C2);
    expect(revalidate.revalidateLandingSlug).toHaveBeenCalledWith("ppc-3-page");
  });
  it("setPortalGroup returns the family id used, or null", async () => {
    expect(await setPortalGroup({ courseId: C3, familyId: null, newFamilyName: "Fresh", batchLabel: null })).toBe(store.course_families[1].id);
    expect(await setPortalGroup({ courseId: C3, familyId: FAM, newFamilyName: null, batchLabel: null })).toBe(FAM);
    expect(await setPortalGroup({ courseId: C3, familyId: null, newFamilyName: null, batchLabel: null })).toBeNull();
  });
  it("attachPortal rejects an unknown page and leaves pages alone", async () => {
    await expect(attachPortal("ghost", C2)).rejects.toBeInstanceOf(PortalError);
    expect(store.landing_pages[0].course_id).toBe(C1);
  });
  it("setPortalGroup rejects an unknown course", async () => {
    await expect(setPortalGroup({ courseId: "ghost", familyId: null, newFamilyName: "Fresh", batchLabel: null })).rejects.toBeInstanceOf(PortalError);
    expect(store.course_families).toHaveLength(1);
  });
  it("attachPortal throws a PortalError for an unknown course", async () => {
    await expect(attachPortal(PAGE, "ghost")).rejects.toBeInstanceOf(PortalError);
  });
  it("setPortalGroup updates family and label, creating a family when named", async () => {
    await setPortalGroup({ courseId: C3, familyId: null, newFamilyName: "Fresh", batchLabel: " Batch 1 " });
    expect(store.courses[2].batch_label).toBe("Batch 1");
    expect(store.courses[2].family_id).toBe(store.course_families[1].id);
    await setPortalGroup({ courseId: C3, familyId: null, newFamilyName: null, batchLabel: null });
    expect(store.courses[2].family_id).toBeNull();
    expect(store.courses[2].batch_label).toBeNull();
  });
});
