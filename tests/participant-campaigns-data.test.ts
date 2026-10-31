// tests/participant-campaigns-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, filterValue, memoryHandler, type Store } from "./helpers/supabase-mock";

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
  it("omits a page whose only row is a test row, counts every non-test row per status, newest first", async () => {
    const out = await listCampaigns();
    expect(out.map((c) => c.pageId)).toEqual(["pg3", "pg1"]);
    const c = out.find((x) => x.pageId === "pg1")!;
    expect(c).toMatchObject({ title: "PPC", pageStatus: "published", total: 6 });
    expect(c.counts).toEqual({ pending: 4, reserved: 0, underpaid: 0, paid: 2, free: 0 });
  });
  it("listCampaigns counts members", async () => {
    store.landing_registrations = [
      reg({ id: "L2", row_type: "lead", name: "Lead2", ref_id: "PZA-20" }),
      reg({ id: "M2", row_type: "member", lead_registration_id: "L2", name: "Mem2" }),
    ];
    const out = await listCampaigns();
    expect(out.find((c) => c.pageId === "pg1")!.total).toBe(2);
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
  it("filters {status:paid} returns only the paid rows, each once", async () => {
    const out = await resolveCandidates({ pageId: "pg1", filters: { status: "paid" } });
    expect(out.map((c) => c.registrationId).sort()).toEqual(["L", "i"]);
    expect(out.find((c) => c.registrationId === "L")).toMatchObject({ isMember: false, leadId: "L", refId: "PZA-1", status: "paid" });
  });
  it("resolveCandidates with ids returns exactly the rows asked for", async () => {
    const lead = await resolveCandidates({ pageId: "pg1", ids: ["L"] });
    expect(lead).toHaveLength(1);
    expect(lead[0]).toMatchObject({ registrationId: "L", leadId: "L", isMember: false, refId: "PZA-1" });
    const member = await resolveCandidates({ pageId: "pg1", ids: ["m1"] });
    expect(member).toHaveLength(1);
    expect(member[0]).toMatchObject({ registrationId: "m1", leadId: "L", isMember: true, refId: "PZA-1", name: "M One", email: "m1@x.com", phone: "0311", status: "pending" });
    const both = await resolveCandidates({ pageId: "pg1", ids: ["L", "m1"] });
    expect(both.map((c) => c.registrationId).sort()).toEqual(["L", "m1"]);
  });
  it("resolveCandidates rejects an id that is not on the campaign", async () => {
    await expect(resolveCandidates({ pageId: "pg1", ids: ["o"] })).rejects.toThrow("A selected registration is not on this campaign");
    await expect(resolveCandidates({ pageId: "pg3", ids: ["m1"] })).rejects.toThrow("A selected registration is not on this campaign");
    await expect(resolveCandidates({ pageId: "pg1", ids: ["L", "zzz"] })).rejects.toThrow();
    await expect(resolveCandidates({ pageId: "pg1", ids: ["mt"] })).rejects.toThrow();
  });
  it("resolveCandidates with filters returns heads and members once each", async () => {
    const out = await resolveCandidates({ pageId: "pg1", filters: {} });
    const ids = out.map((c) => c.registrationId);
    expect(ids.sort()).toEqual(["L", "P", "i", "m1", "m2", "pm"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("resolveCandidates filter q matches the member's own name", async () => {
    // The fake client does not evaluate or(), so assert the search runs against member rows' own columns.
    await resolveCandidates({ pageId: "pg1", filters: { q: "M One" } });
    const reads = db.find("landing_registrations", "select");
    const withQ = reads.filter((op) => op.filters.some(([k]) => k === "or"));
    expect(withQ.length).toBeGreaterThan(0);
    for (const op of withQ) {
      expect(filterValue(op, "in", "row_type")).toEqual(["individual", "lead", "member"]);
      expect(String(filterValue(op, "or", "or"))).toContain("name.ilike.");
    }
  });
  it("never returns test heads", async () => {
    await expect(resolveCandidates({ pageId: "pg2", ids: ["t"] })).rejects.toThrow();
    expect(await resolveCandidates({ pageId: "pg2", filters: {} })).toEqual([]);
  });
  it("region and optionLabel filters narrow the heads", async () => {
    const out = await resolveCandidates({ pageId: "pg1", filters: { region: "UAE", optionLabel: "Live Gold" } });
    expect(out.map((c) => c.registrationId)).toEqual(["L"]);
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
    expect(sawChunked).toBeGreaterThanOrEqual(3);
  });
  it("a test member is excluded from a lead's ids and from filters", async () => {
    const out = await resolveCandidates({ pageId: "pg1", ids: ["L"] });
    expect(out.map((c) => c.registrationId)).toEqual(["L"]);
    const all = await resolveCandidates({ pageId: "pg1", filters: {} });
    expect(all.map((c) => c.registrationId)).not.toContain("mt");
  });
  it("q and agentId filters pass through", async () => {
    await resolveCandidates({ pageId: "pg1", filters: { q: "Lead", agentId: "ag1" } });
    const first = db.find("landing_registrations", "select")[0];
    expect(first.filters.some(([k, key, v]) => k === "eq" && key === "agent_id" && v === "ag1")).toBe(true);
    expect(first.filters.some(([k]) => k === "or")).toBe(true);
  });
});
