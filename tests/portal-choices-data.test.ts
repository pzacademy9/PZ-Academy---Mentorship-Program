import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const jobs = vi.hoisted(() => ({
  enqueueEnrollmentSync: vi.fn(),
  runJobsFor: vi.fn(),
  runJobsDirect: vi.fn(),
}));
vi.mock("@/lib/data/landing-jobs", () => jobs);
const bg = vi.hoisted(() => ({ runInBackground: vi.fn() }));
vi.mock("@/lib/landing/registration/background", () => bg);

import { listChoiceGroups, applyChoice } from "@/lib/data/portal-choices";
import { PortalError } from "@/lib/data/portal-errors";

const PAGE = "page-1";
const OPTIONS = [
  { key: "full", label: "Full Course", kind: "bundle", free: false, waGroupUrl: "", moduleIds: [] },
  { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: "", moduleIds: ["11111111-1111-4111-8111-111111111111"] },
  { key: "m2", label: "Module 2", kind: "module", free: false, waGroupUrl: "", moduleIds: ["22222222-2222-4222-8222-222222222222"] },
];
const content = (options: unknown[]) => ({ registration: { options } });

let store: Store;
const reg = (id: string, over: Record<string, unknown> = {}) => ({
  id, page_id: PAGE, option_label: "Live - Module 1 - Individual", mode: "live", option_keys: [], status: "paid", is_test: false, ...over,
});

beforeEach(() => {
  db.reset();
  for (const f of Object.values(jobs)) f.mockReset();
  bg.runInBackground.mockReset();
  jobs.enqueueEnrollmentSync.mockResolvedValue(true);
  jobs.runJobsFor.mockReturnValue(Promise.resolve());
  jobs.runJobsDirect.mockReturnValue(Promise.resolve());
  store = {
    landing_pages: [{ id: PAGE, draft: content(OPTIONS), published: content(OPTIONS) }],
    landing_registrations: [],
  };
  db.state.handler = memoryHandler(store);
});

describe("listChoiceGroups", () => {
  it("groups unmatched labels by label and mode with counts and paid counts", async () => {
    store.landing_registrations = [
      reg("r1"), reg("r2", { status: "pending" }), reg("r3", { is_test: true }),
      reg("r4", { option_label: "Recorded - Module 1 - Individual", mode: "recorded" }),
      reg("r5", { option_label: "Live - Full Course - Individual" }),
    ];
    const o = await listChoiceGroups(PAGE);
    expect(o.hasOptions).toBe(true);
    expect(o.groups).toHaveLength(3);
    expect(o.groups.find((g) => g.label === "Live - Module 1 - Individual")).toMatchObject({ mode: "live", count: 3, paidCount: 1 });
    expect(o.groups.find((g) => g.label === "Recorded - Module 1 - Individual")).toMatchObject({ mode: "recorded", count: 1, paidCount: 1 });
  });

  it("merges modes under one label and shows Mixed; a single mode stays as it is", async () => {
    store.landing_registrations = [reg("r1"), reg("r2", { mode: "recorded" }), reg("r3", { option_label: "Live - Full Course - Individual" })];
    const o = await listChoiceGroups(PAGE);
    expect(o.groups).toHaveLength(2);
    expect(o.groups.find((g) => g.label === "Live - Module 1 - Individual")).toMatchObject({ mode: "mixed", count: 2 });
    expect(o.groups.find((g) => g.label === "Live - Full Course - Individual")).toMatchObject({ mode: "live", count: 1 });
  });

  it("rows that already have option_keys are not listed", async () => {
    store.landing_registrations = [reg("r1", { option_keys: ["m1"] }), reg("r2")];
    const o = await listChoiceGroups(PAGE);
    expect(o.groups).toHaveLength(1);
    expect(o.groups[0].count).toBe(1);
  });

  it("rows with an empty label are not listed", async () => {
    store.landing_registrations = [reg("r1", { option_label: "" }), reg("r2", { option_label: "   " })];
    expect((await listChoiceGroups(PAGE)).groups).toEqual([]);
  });

  it("rows of other pages are not listed", async () => {
    store.landing_registrations = [reg("r1", { page_id: "other" })];
    expect((await listChoiceGroups(PAGE)).groups).toEqual([]);
  });

  it("suggestions come from suggestOptions against the page options", async () => {
    store.landing_registrations = [reg("r1"), reg("r2", { option_label: "Live - Weird Thing - Individual" })];
    const o = await listChoiceGroups(PAGE);
    expect(o.groups.find((g) => g.label.includes("Module 1"))).toMatchObject({ suggestedKeys: ["m1"], confident: true });
    expect(o.groups.find((g) => g.label.includes("Weird"))).toMatchObject({ suggestedKeys: [], confident: false });
    expect(o.options.map((x) => x.key)).toEqual(["full", "m1", "m2"]);
  });

  it("falls back to the draft options when the page is not published", async () => {
    store.landing_pages = [{ id: PAGE, draft: content(OPTIONS), published: null }];
    store.landing_registrations = [reg("r1")];
    const o = await listChoiceGroups(PAGE);
    expect(o.hasOptions).toBe(true);
    expect(o.groups[0].suggestedKeys).toEqual(["m1"]);
  });

  it("hasOptions is false when the page has no options", async () => {
    store.landing_pages = [{ id: PAGE, draft: content([]), published: content([]) }];
    store.landing_registrations = [reg("r1")];
    const o = await listChoiceGroups(PAGE);
    expect(o.hasOptions).toBe(false);
    expect(o.options).toEqual([]);
  });

  it("unknown page gives a 404 PortalError", async () => {
    await expect(listChoiceGroups("nope")).rejects.toMatchObject({ name: "PortalError", status: 404 });
  });

  it("a database error is thrown, not swallowed", async () => {
    const inner = db.state.handler;
    db.state.handler = (op) => (op.table === "landing_registrations" ? { data: null, error: { message: "boom" } } : inner(op));
    await expect(listChoiceGroups(PAGE)).rejects.toThrow(/boom/);
  });
});

describe("applyChoice", () => {
  const label = "Live - Module 1 - Individual";

  it("sets option_keys only on rows of this page with that exact label and empty keys", async () => {
    store.landing_registrations = [
      reg("r1"),
      reg("r2", { option_keys: ["m2"] }),
      reg("r3", { page_id: "other" }),
      reg("r4", { option_label: "Live - Module 2 - Individual" }),
    ];
    const res = await applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] });
    expect(res.updated).toBe(1);
    const byId = Object.fromEntries(store.landing_registrations.map((r) => [r.id as string, r.option_keys]));
    expect(byId).toEqual({ r1: ["m1"], r2: ["m2"], r3: [], r4: [] });
  });

  it("rejects a key that is not one of the page's options (409 PortalError) and writes nothing", async () => {
    store.landing_registrations = [reg("r1")];
    const err = await applyChoice({ pageId: PAGE, label, optionKeys: ["nope"] }).catch((e) => e);
    expect(err).toBeInstanceOf(PortalError);
    expect(err.status).toBe(409);
    expect(db.find("landing_registrations", "update")).toHaveLength(0);
    expect(jobs.enqueueEnrollmentSync).not.toHaveBeenCalled();
  });

  it("refuses a module option with no module ticked (409) and writes nothing", async () => {
    const bad = [...OPTIONS.slice(0, 1), { ...OPTIONS[1], moduleIds: [] }, OPTIONS[2]];
    store.landing_pages = [{ id: PAGE, draft: content(bad), published: content(bad) }];
    store.landing_registrations = [reg("r1")];
    const err = await applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] }).catch((e) => e);
    expect(err).toBeInstanceOf(PortalError);
    expect(err.status).toBe(409);
    expect(err.message).toBe("That option has no module ticked. Tick its module in Registration setup first.");
    expect(db.find("landing_registrations", "update")).toHaveLength(0);
  });

  it("rejects an empty key list", async () => {
    const err = await applyChoice({ pageId: PAGE, label, optionKeys: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(PortalError);
    expect(db.find("landing_registrations", "update")).toHaveLength(0);
  });

  it("rejects when the page has no options", async () => {
    store.landing_pages = [{ id: PAGE, draft: content([]), published: content([]) }];
    const err = await applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] }).catch((e) => e);
    expect(err).toBeInstanceOf(PortalError);
    expect(err.status).toBe(409);
    expect(db.find("landing_registrations", "update")).toHaveLength(0);
  });

  it("an unknown page gives a 404 PortalError before any write", async () => {
    const err = await applyChoice({ pageId: "nope", label, optionKeys: ["m1"] }).catch((e) => e);
    expect(err).toBeInstanceOf(PortalError);
    expect(err.status).toBe(404);
    expect(db.find("landing_registrations", "update")).toHaveLength(0);
  });

  it("a label with leading or trailing spaces round-trips and updates", async () => {
    const odd = " Live - Module 1 - Individual ";
    store.landing_registrations = [reg("r1", { option_label: odd })];
    const o = await listChoiceGroups(PAGE);
    expect(o.groups[0].label).toBe(odd);
    expect(await applyChoice({ pageId: PAGE, label: o.groups[0].label, optionKeys: ["m1"] })).toEqual({ updated: 1, queued: 1 });
    expect(store.landing_registrations[0].option_keys).toEqual(["m1"]);
  });

  it("a second applyChoice updates 0 and re-queues only Paid rows holding the applied keys", async () => {
    store.landing_registrations = [
      reg("r1"), reg("r2"),
      reg("pending1", { status: "pending" }),
      reg("test1", { is_test: true }),
      reg("other-keys", { option_keys: ["m2"] }),
      reg("other-label", { option_label: "Live - Module 2 - Individual" }),
    ];
    expect(await applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] })).toEqual({ updated: 4, queued: 2 });
    jobs.enqueueEnrollmentSync.mockClear();
    expect(await applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] })).toEqual({ updated: 0, queued: 2 });
    expect(jobs.enqueueEnrollmentSync.mock.calls.map((c) => c[0]).sort()).toEqual(["r1", "r2"]);
    const byId = Object.fromEntries(store.landing_registrations.map((r) => [r.id as string, r.option_keys]));
    expect(byId["other-keys"]).toEqual(["m2"]);
    expect(byId["other-label"]).toEqual([]);
  });

  it("a throw while queuing one row does not stop the others and the count stays honest", async () => {
    store.landing_registrations = [reg("r1"), reg("r2"), reg("r3")];
    jobs.enqueueEnrollmentSync.mockImplementation(async (id: string) => {
      if (id === "r2") throw new Error("queue down");
      return true;
    });
    const res = await applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] });
    expect(res).toEqual({ updated: 3, queued: 2 });
    expect(jobs.enqueueEnrollmentSync).toHaveBeenCalledTimes(3);
  });

  it("applyChoice queues enrollment_sync only for Paid rows holding the applied keys", async () => {
    store.landing_registrations = [
      reg("paid1"),
      reg("pending1", { status: "pending" }),
      reg("test1", { is_test: true }),
      reg("done", { option_keys: ["m1"] }),
      reg("other-label", { option_label: "Live - Module 2 - Individual" }),
    ];
    const res = await applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] });
    expect(res).toEqual({ updated: 3, queued: 2 });
    expect(jobs.enqueueEnrollmentSync.mock.calls.map((c) => c[0]).sort()).toEqual(["done", "paid1"]);
    expect(bg.runInBackground).toHaveBeenCalledTimes(2);
    expect(jobs.runJobsFor).not.toHaveBeenCalled();
  });

  it("runs only the enrollment_sync job for each row, never the full job runner", async () => {
    store.landing_registrations = [reg("r1"), reg("r2")];
    await applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] });
    expect(jobs.runJobsFor).not.toHaveBeenCalled();
    expect(jobs.runJobsDirect.mock.calls.map((c) => [c[0], c[1]]).sort()).toEqual([["r1", ["enrollment_sync"]], ["r2", ["enrollment_sync"]]]);
  });

  it("logs a queue failure with the registration id and message only", async () => {
    store.landing_registrations = [reg("r1")];
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    jobs.enqueueEnrollmentSync.mockRejectedValue(new Error("queue down"));
    await applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] });
    expect(spy.mock.calls.flat().join(" ")).toContain("r1");
    expect(spy.mock.calls.flat().join(" ")).toContain("queue down");
    spy.mockRestore();
  });

  it("falls back to a direct run when the queue cannot be written", async () => {
    store.landing_registrations = [reg("r1")];
    jobs.enqueueEnrollmentSync.mockResolvedValue(false);
    const res = await applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] });
    expect(res).toEqual({ updated: 1, queued: 0 });
    expect(jobs.runJobsDirect).toHaveBeenCalledWith("r1", ["enrollment_sync"]);
  });

  it("a database error is thrown, not swallowed", async () => {
    store.landing_registrations = [reg("r1")];
    const inner = db.state.handler;
    db.state.handler = (op) => (op.table === "landing_registrations" && op.op === "update" ? { data: null, error: { message: "boom" } } : inner(op));
    await expect(applyChoice({ pageId: PAGE, label, optionKeys: ["m1"] })).rejects.toThrow(/boom/);
    expect(jobs.enqueueEnrollmentSync).not.toHaveBeenCalled();
  });
});
