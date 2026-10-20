// tests/participant-campaigns-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { paging, listCampaigns, listCampaignFilterOptions, resolveCandidates } from "@/lib/data/participant-campaigns";

const reg = (over: Record<string, unknown>) => ({
  page_id: "pg1", row_type: "individual", lead_registration_id: null, ref_id: null, name: "N", email: "n@x.com", whatsapp: "0300",
  option_label: "Live", mode: "live", region: "PK", status: "pending", is_test: false, agent_id: null,
  created_at: "2026-10-01T00:00:00Z", ...over,
});
const seed = (): Store => ({
  landing_pages: [
    { id: "pg1", title: "PPC", status: "published" },
    { id: "pg2", title: "Only Test", status: "draft" },
    { id: "pg3", title: "Other", status: "closed" },
  ],
  landing_registrations: [
    reg({ id: "L", row_type: "lead", name: "Lead", ref_id: "PZA-1", status: "paid", region: "UAE", option_label: "Live Gold", created_at: "2026-10-05T00:00:00Z" }),
    reg({ id: "m1", row_type: "member", lead_registration_id: "L", name: "M One", email: "m1@x.com", whatsapp: "0311", status: "pending" }),
    reg({ id: "m2", row_type: "member", lead_registration_id: "L", name: "M Two", email: "m2@x.com", whatsapp: "0322", status: "pending" }),
    reg({ id: "mt", row_type: "member", lead_registration_id: "L", name: "M Test", is_test: true }),
    reg({ id: "P", row_type: "lead", name: "PendLead", ref_id: "PZA-2", status: "pending", created_at: "2026-10-04T00:00:00Z" }),
    reg({ id: "pm", row_type: "member", lead_registration_id: "P", name: "PendMember", email: "pm@x.com", whatsapp: "0333", status: "pending" }),
    reg({ id: "i", name: "Indiv", ref_id: "PZA-3", status: "paid", region: "", option_label: "", created_at: "2026-10-03T00:00:00Z" }),
    reg({ id: "t", page_id: "pg2", name: "Tester", ref_id: "PZA-9", is_test: true }),
    reg({ id: "o", page_id: "pg3", name: "OtherPage", ref_id: "PZA-8", status: "free", created_at: "2026-10-06T00:00:00Z" }),
  ],
});
let store: Store;
beforeEach(() => {
  paging.pageSize = 1000;
  paging.idChunk = 100;
  db.reset();
  store = seed();
  db.state.handler = memoryHandler(store);
});

describe("listCampaigns", () => {
  it("omits a page whose only head is a test row, counts per status, newest first", async () => {
    const out = await listCampaigns();
    expect(out.map((c) => c.pageId)).toEqual(["pg3", "pg1"]);
    const c = out.find((x) => x.pageId === "pg1")!;
    expect(c).toMatchObject({ title: "PPC", pageStatus: "published", total: 3 });
    expect(c.counts).toEqual({ pending: 1, reserved: 0, underpaid: 0, paid: 2, free: 0 });
  });
});

describe("listCampaignFilterOptions", () => {
  it("returns distinct non-empty regions and option labels of head rows", async () => {
    const out = await listCampaignFilterOptions("pg1");
    expect(out.regions.sort()).toEqual(["PK", "UAE"]);
    expect(out.optionLabels.sort()).toEqual(["Live", "Live Gold"]);
  });
});

describe("resolveCandidates", () => {
  it("filters {status:paid}: lead plus its two members carrying paid status and the lead refId", async () => {
    const out = await resolveCandidates({ pageId: "pg1", filters: { status: "paid" } });
    const lead = out.find((c) => c.registrationId === "L")!;
    expect(lead).toMatchObject({ isMember: false, leadId: "L", refId: "PZA-1", status: "paid" });
    const members = out.filter((c) => c.isMember);
    expect(members.map((m) => m.registrationId).sort()).toEqual(["m1", "m2"]);
    for (const m of members) expect(m).toMatchObject({ leadId: "L", refId: "PZA-1", status: "paid" });
    expect(members.find((m) => m.registrationId === "m1")).toMatchObject({ name: "M One", email: "m1@x.com", phone: "0311" });
    expect(out.map((c) => c.registrationId)).not.toContain("mt");
    expect(out.map((c) => c.registrationId)).toContain("i");
    expect(out.map((c) => c.registrationId)).not.toContain("P");
  });
  it("a pending lead's members come back pending", async () => {
    const out = await resolveCandidates({ pageId: "pg1", ids: ["P"] });
    expect(out.map((c) => c.registrationId).sort()).toEqual(["P", "pm"]);
    expect(out.every((c) => c.status === "pending")).toBe(true);
  });
  it("throws when an id belongs to another page, a member row, or does not exist", async () => {
    await expect(resolveCandidates({ pageId: "pg1", ids: ["o"] })).rejects.toThrow();
    await expect(resolveCandidates({ pageId: "pg1", ids: ["m1"] })).rejects.toThrow();
    await expect(resolveCandidates({ pageId: "pg1", ids: ["L", "zzz"] })).rejects.toThrow();
  });
  it("never returns test heads", async () => {
    await expect(resolveCandidates({ pageId: "pg2", ids: ["t"] })).rejects.toThrow();
    expect(await resolveCandidates({ pageId: "pg2", filters: {} })).toEqual([]);
  });
  it("region and optionLabel filters narrow the heads", async () => {
    const out = await resolveCandidates({ pageId: "pg1", filters: { region: "UAE", optionLabel: "Live Gold" } });
    expect(out.map((c) => c.registrationId).sort()).toEqual(["L", "m1", "m2"]);
  });
});

describe("paging and chunking", () => {
  const bulk = (n: number) => Array.from({ length: n }, (_, k) => reg({ id: `h${k}`, page_id: "pgB", row_type: "lead", name: `H${k}`, ref_id: `R${k}`, status: k % 2 ? "paid" : "pending", created_at: `2026-10-01T00:00:${String(k % 60).padStart(2, "0")}Z` }));
  it("listCampaigns counts every head across several pages", async () => {
    paging.pageSize = 3;
    store.landing_pages.push({ id: "pgB", title: "Bulk", status: "published" });
    store.landing_registrations.push(...bulk(10));
    const c = (await listCampaigns()).find((x) => x.pageId === "pgB")!;
    expect(c.total).toBe(10);
    expect(c.counts).toMatchObject({ pending: 5, paid: 5 });
  });
  it("filters branch returns every head and every member across pages", async () => {
    paging.pageSize = 3;
    paging.idChunk = 4;
    store.landing_registrations.push(...bulk(10));
    for (let k = 0; k < 10; k++) store.landing_registrations.push(reg({ id: `bm${k}`, page_id: "pgB", row_type: "member", lead_registration_id: `h${k}`, name: `BM${k}` }));
    const out = await resolveCandidates({ pageId: "pgB", filters: {} });
    expect(out).toHaveLength(20);
    expect(new Set(out.map((c) => c.registrationId)).size).toBe(20);
  });
  it("more than 100 ids are chunked and all resolved", async () => {
    store.landing_registrations.push(...bulk(250));
    const ids = Array.from({ length: 250 }, (_, k) => `h${k}`);
    const out = await resolveCandidates({ pageId: "pgB", ids });
    expect(out).toHaveLength(250);
    let sawChunked = 0;
    for (const op of db.find("landing_registrations", "select")) {
      for (const [kind, key, v] of op.filters) {
        if (kind === "in" && (key === "id" || key === "lead_registration_id")) { sawChunked++; expect((v as unknown[]).length).toBeLessThanOrEqual(100); }
      }
    }
    expect(sawChunked).toBeGreaterThanOrEqual(6);
  });
  it("a test member under a non-test lead is excluded via the ids path", async () => {
    const out = await resolveCandidates({ pageId: "pg1", ids: ["L"] });
    expect(out.map((c) => c.registrationId).sort()).toEqual(["L", "m1", "m2"]);
  });
  it("q and agentId filters pass through", async () => {
    await resolveCandidates({ pageId: "pg1", filters: { q: "Lead", agentId: "ag1" } });
    const first = db.find("landing_registrations", "select")[0];
    expect(first.filters.some(([k, key, v]) => k === "eq" && key === "agent_id" && v === "ag1")).toBe(true);
    expect(first.filters.some(([k]) => k === "or")).toBe(true);
  });
});
