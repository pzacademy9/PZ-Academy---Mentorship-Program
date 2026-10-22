// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { isBatchOpen, getOpenLiveBatches, getOpenLiveBatch } from "@/lib/data/landing-website";

const ok = { status: "published", hasPublished: true, enabled: true, modes: ["live"], capacity: 0, taken: 0, finished: false };

describe("isBatchOpen", () => {
  it("is true for the happy case", () => expect(isBatchOpen(ok)).toBe(true));
  it.each([
    ["draft", { status: "draft" }],
    ["closed", { status: "closed" }],
    ["no published copy", { hasPublished: false }],
    ["registration disabled", { enabled: false }],
    ["recorded only", { modes: ["recorded"] }],
    ["full", { capacity: 10, taken: 10 }],
    ["finished", { finished: true }],
  ])("is false when %s", (_n, patch) => expect(isBatchOpen({ ...ok, ...patch })).toBe(false));
  it("is true for unlimited capacity", () => expect(isBatchOpen({ ...ok, capacity: 0, taken: 500 })).toBe(true));
});

const content = (over: Record<string, unknown> = {}, startsOn = "2026-11-01T00:00:00Z") => ({
  settings: { batchStartsOn: startsOn },
  registration: { enabled: true, modes: ["live"], capacity: 0, ...over },
});
const page = (id: string, extra: Record<string, unknown> = {}) => ({
  id, course_id: "c1", is_main_page: true, status: "published", slug: `slug-${id}`, title: `Title ${id}`, published: content(), ...extra,
});

let store: Store;
beforeEach(() => {
  store = { landing_pages: [], landing_registrations: [], landing_batch_state: [], modules: [] };
  db.reset();
  db.state.handler = memoryHandler(store);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getOpenLiveBatches", () => {
  it("returns an entry for a qualifying main page", async () => {
    store.landing_pages.push(page("p1"));
    const m = await getOpenLiveBatches();
    expect(m.size).toBe(1);
    expect(m.get("c1")).toEqual({ courseId: "c1", slug: "slug-p1", title: "Title p1", startsOn: "1 November 2026", href: "/e/slug-p1?src=website" });
  });
  it("leaves startsOn empty when unset", async () => {
    store.landing_pages.push(page("p1", { published: content({}, "") }));
    expect((await getOpenLiveBatches()).get("c1")?.startsOn).toBe("");
  });
  it("ignores a non-main page of the same course", async () => {
    store.landing_pages.push(page("p1", { is_main_page: false }));
    expect((await getOpenLiveBatches()).size).toBe(0);
  });
  it("ignores a page with a whole-course finished row", async () => {
    store.landing_pages.push(page("p1"));
    store.landing_batch_state.push({ page_id: "p1", module_id: null });
    expect((await getOpenLiveBatches()).size).toBe(0);
  });
  it("a finished row on another page does not count", async () => {
    store.landing_pages.push(page("p1"));
    store.landing_batch_state.push({ page_id: "other", module_id: null });
    expect((await getOpenLiveBatches()).size).toBe(1);
  });
  it("treats every module finished as finished", async () => {
    store.landing_pages.push(page("p1"));
    store.modules.push({ id: "m1", course_id: "c1" }, { id: "m2", course_id: "c1" });
    store.landing_batch_state.push({ page_id: "p1", module_id: "m1" }, { page_id: "p1", module_id: "m2" });
    expect((await getOpenLiveBatches()).size).toBe(0);
  });
  it("stays open when only some modules are finished", async () => {
    store.landing_pages.push(page("p1"));
    store.modules.push({ id: "m1", course_id: "c1" }, { id: "m2", course_id: "c1" });
    store.landing_batch_state.push({ page_id: "p1", module_id: "m1" });
    expect((await getOpenLiveBatches()).size).toBe(1);
  });
  it("excludes is_test registrations from taken", async () => {
    store.landing_pages.push(page("p1", { published: content({ capacity: 2 }) }));
    store.landing_registrations.push(
      { page_id: "p1", is_test: false }, { page_id: "p1", is_test: true }, { page_id: "p1", is_test: true },
    );
    expect((await getOpenLiveBatches()).size).toBe(1);
    store.landing_registrations.push({ page_id: "p1", is_test: false });
    expect((await getOpenLiveBatches()).size).toBe(0);
  });
  it("skips a never-published page", async () => {
    store.landing_pages.push(page("p1", { published: null }));
    expect((await getOpenLiveBatches()).size).toBe(0);
  });
  it("does three reads for several courses", async () => {
    store.landing_pages.push(page("p1"), page("p2", { course_id: "c2" }));
    await getOpenLiveBatches();
    expect(db.state.ops.length).toBeLessThanOrEqual(4);
  });
  it("never throws", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    expect((await getOpenLiveBatches()).size).toBe(0);
    expect(await getOpenLiveBatch("c1")).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("getOpenLiveBatch", () => {
  it("returns the entry for a course or null", async () => {
    store.landing_pages.push(page("p1"));
    expect((await getOpenLiveBatch("c1"))?.slug).toBe("slug-p1");
    expect(await getOpenLiveBatch("zzz")).toBeNull();
  });
});
