import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { previewCloseBatch, closeBatch } from "@/lib/data/landing-close-batch";

const PAGE = "page-1", COURSE = "course-1", ADMIN = "admin-1";
let n = 0;
const reg = (id: string, o: Record<string, unknown> = {}) => ({
  id, page_id: PAGE, row_type: "individual", lead_registration_id: null, name: `N ${id}`, email: `${id}@x.com`,
  whatsapp: "", profession: "", discovery: "", consent: true, status: "paid", expected_amount: 100, currency: "PKR",
  promo_code_text: "", created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, ++n)).toISOString(), status_changed_at: null, is_test: false, ...o,
});

let store: Store;
let rpcCalls: { fn: string; args: Record<string, unknown> }[];
function setup(regs: Record<string, unknown>[], extra: Partial<Store> = {}, courseId: string | null = COURSE) {
  rpcCalls = [];
  store = {
    landing_pages: [{ id: PAGE, title: "PMH Batch 1", course_id: courseId }],
    landing_registrations: regs,
    import_batches: [],
    contact_purchases: [],
    ...extra,
  };
  db.state.handler = memoryHandler(store, (fn, args) => {
    rpcCalls.push({ fn, args: args as Record<string, unknown> });
    return { data: { paid_batch_id: "pb", interested_batch_id: "ib", paid_added: 3, interested_added: 2, contacts_created: 4, contacts_merged: 1 }, error: null };
  });
}
beforeEach(() => { db.reset(); n = 0; });

describe("previewCloseBatch", () => {
  it("counts paid, interested and skipped from the mapper; reads every page of 1000", async () => {
    const regs = Array.from({ length: 1250 }, (_, i) => reg(`r${String(i).padStart(4, "0")}`, i < 1000 ? {} : { status: "pending" }));
    regs.push(reg("t1", { is_test: true }));
    setup(regs);
    const p = await previewCloseBatch(PAGE);
    expect(p).toEqual({ pageTitle: "PMH Batch 1", paid: 1000, interested: 250, skipped: 1, alreadyClosed: false, newPaid: 1000 });
    const reads = db.find("landing_registrations", "select");
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads[0].range).toEqual([0, 999]);
    expect(reads[1].range).toEqual([1000, 1999]);
    expect(reads[0].orders).toEqual([["created_at", true], ["id", true]]);
    expect(rpcCalls).toHaveLength(0);
    expect(db.state.ops.some((o) => ["insert", "update", "delete", "upsert", "rpc"].includes(o.op))).toBe(false);
  });
  it("alreadyClosed and newPaid reflect the existing cohort", async () => {
    setup([reg("a"), reg("b"), reg("c", { status: "pending" })], {
      import_batches: [{ id: "x", sheet_id: `landing:${PAGE}`, kind: "closed_paid" }],
      contact_purchases: [{ source_sheet_id: `landing:${PAGE}`, source_row_ref: "a" }, { source_sheet_id: "landing:other", source_row_ref: "b" }],
    });
    const p = await previewCloseBatch(PAGE);
    expect(p.alreadyClosed).toBe(true);
    expect(p.paid).toBe(2);
    expect(p.newPaid).toBe(1);
  });
  it("throws Page not found", async () => {
    setup([]);
    store.landing_pages = [];
    await expect(previewCloseBatch(PAGE)).rejects.toThrow("Page not found");
  });
  it("throws on a Supabase error", async () => {
    setup([]);
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(previewCloseBatch(PAGE)).rejects.toThrow(/failed/);
  });
});

describe("closeBatch", () => {
  it("sends all mapped rows in ONE rpc call and maps the result", async () => {
    const regs = Array.from({ length: 1250 }, (_, i) => reg(`r${String(i).padStart(4, "0")}`, i % 2 ? { status: "pending" } : {}));
    regs.push(reg("t1", { is_test: true }));
    setup(regs);
    const r = await closeBatch({ pageId: PAGE, adminId: ADMIN });
    expect(r).toEqual({ paidAdded: 3, interestedAdded: 2, contactsCreated: 4, contactsMerged: 1, skipped: 1 });
    expect(rpcCalls).toHaveLength(1);
    const a = rpcCalls[0];
    expect(a.fn).toBe("landing_close_batch");
    expect(a.args).toMatchObject({ p_page_id: PAGE, p_page_title: "PMH Batch 1", p_course_id: COURSE, p_created_by: ADMIN });
    expect((a.args.p_rows as unknown[]).length).toBe(1250);
  });
  it("passes a null course through", async () => {
    setup([reg("a")], {}, null);
    await closeBatch({ pageId: PAGE, adminId: ADMIN });
    expect(rpcCalls[0].args.p_course_id).toBeNull();
  });
  it("throws Page not found and does not call the rpc", async () => {
    setup([reg("a")]);
    store.landing_pages = [];
    await expect(closeBatch({ pageId: PAGE, adminId: ADMIN })).rejects.toThrow("Page not found");
    expect(rpcCalls).toHaveLength(0);
  });
  it("throws when the rpc errors, without personal data in the message", async () => {
    setup([reg("ayesha")]);
    const mem = memoryHandler(store);
    db.state.handler = (op) => (op.op === "rpc" ? { data: null, error: { message: "db down" } } : mem(op));
    await expect(closeBatch({ pageId: PAGE, adminId: ADMIN })).rejects.toThrow("landing_close_batch failed: db down");
  });
});
