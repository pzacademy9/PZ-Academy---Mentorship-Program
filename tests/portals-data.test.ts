import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { getPortalOverview, previewMove, moveStudents, duplicatePortal, attachPortal, setPortalGroup } from "@/lib/data/portals";
import { PortalError } from "@/lib/data/portal-errors";

const PAGE = "page-1", C1 = "course-1", C2 = "course-2", C3 = "course-3", FAM = "fam-1";

let store: Store;
let rpcCalls: { fn: string; args: Record<string, unknown> }[];
let rpcReply: (fn: string) => { data: unknown; error: { message: string } | null };

beforeEach(() => {
  db.reset();
  rpcCalls = [];
  rpcReply = () => ({ data: null, error: null });
  store = {
    course_families: [{ id: FAM, name: "PPC" }],
    courses: [
      { id: C1, title: "PPC Batch 3", slug: "ppc-3", is_published: true, family_id: FAM, batch_label: "Batch 3" },
      { id: C2, title: "PPC Batch 4", slug: "ppc-4", is_published: false, family_id: FAM, batch_label: "Batch 4" },
      { id: C3, title: "Loose", slug: "loose", is_published: true, family_id: null, batch_label: null },
    ],
    landing_pages: [{ id: PAGE, course_id: C1 }],
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
    rpcReply = () => ({ data: null, error: { message: "This registration already uses that portal" } });
    const e = await previewMove(PAGE, C1).catch((x) => x);
    expect(e).toBeInstanceOf(PortalError);
    expect(e.status).toBe(409);
    expect(e.message).toBe("This batch already uses that portal.");
    rpcReply = () => ({ data: null, error: { message: "The new portal has no modules yet" } });
    const e2 = await moveStudents(PAGE, C2).catch((x) => x);
    expect(e2).toBeInstanceOf(PortalError);
    expect(e2.message).toBe("That portal has no modules yet.");
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
