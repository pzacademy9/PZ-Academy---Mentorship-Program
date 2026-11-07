import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createSupabaseMock } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
const opened = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: (o?: unknown) => { opened.push(o); return db.client; } }));
const gate = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => gate.result }));

import { getTerms, saveTerms, getAffiliatePolicies, getTermsOrEmpty } from "@/lib/data/site-terms";
import { siteTermsSchema, termsKeySchema } from "@/lib/validations/site-terms";
import { GET, PUT } from "@/app/api/admin/site-terms/route";

type Row = { key: string; body: string; updated_at: string | null };
function rows(r: Row[]) {
  db.state.handler = (op) => {
    const f = op.filters.find((x) => x[0] === "eq" && x[1] === "key");
    if (op.op === "select" && f) return { data: r.find((x) => x.key === f[2]) ?? null, error: null };
    return { data: null, error: null };
  };
}
const T = "2026-11-01T00:00:00.000Z";
const full = (over: Partial<Record<string, string>> = {}): Row[] => [
  { key: "affiliate_terms", body: over.t ?? "Terms text", updated_at: T },
  { key: "affiliate_rules", body: over.r ?? "Rules text", updated_at: "2026-11-02T00:00:00.000Z" },
  { key: "affiliate_privacy", body: over.p ?? "Privacy text", updated_at: "2026-11-03T00:00:00.000Z" },
];

beforeEach(() => {
  opened.length = 0;
  db.reset();
  gate.result = { ok: true, user: { id: "a" } };
});

describe("terms keys", () => {
  it("accepts the four keys and nothing else", () => {
    for (const k of ["general", "affiliate_terms", "affiliate_rules", "affiliate_privacy"]) expect(termsKeySchema.safeParse(k).success).toBe(true);
    for (const k of ["other", "", "GENERAL", null]) expect(termsKeySchema.safeParse(k).success).toBe(false);
  });
  it("still refuses 20,001 characters", () => {
    expect(siteTermsSchema.safeParse({ body: "a".repeat(20001) }).success).toBe(false);
  });
});

describe("getTerms / saveTerms", () => {
  it("returns body and updatedAt, or empty when there is no row", async () => {
    rows(full());
    expect(await getTerms("affiliate_rules")).toEqual({ body: "Rules text", updatedAt: "2026-11-02T00:00:00.000Z" });
    rows([]);
    expect(await getTerms("affiliate_rules")).toEqual({ body: "", updatedAt: null });
  });
  it("saving affiliate_terms writes only that key", async () => {
    await saveTerms("affiliate_terms", "New");
    const ops = db.find("site_terms", "upsert");
    expect(ops.length).toBe(1);
    expect(ops[0].payload).toMatchObject({ key: "affiliate_terms", body: "New" });
  });
  it("getTermsOrEmpty treats a missing table as empty but rethrows other errors", async () => {
    db.state.handler = () => ({ data: null, error: { code: "42P01", message: "x" } });
    expect(await getTermsOrEmpty("affiliate_terms")).toEqual({ body: "", updatedAt: null });
    db.state.handler = () => ({ data: null, error: { code: "57014", message: "x" } });
    await expect(getTermsOrEmpty("affiliate_terms")).rejects.toBeTruthy();
  });
});

describe("fresh reads for the affiliate documents", () => {
  it("affiliate keys are read without the Next data cache, so a saved document shows at once", async () => {
    rows(full());
    await getTerms("affiliate_terms");
    await getAffiliatePolicies();
    expect(opened.every((o) => (o as { noStore?: boolean } | undefined)?.noStore === true)).toBe(true);
  });
  it("the general Terms keep the normal cached client (landing pages rely on it)", async () => {
    rows(full());
    await getTerms("general");
    expect(opened[0]).toBeUndefined();
  });
});

describe("getAffiliatePolicies", () => {
  it("is ready only when all three have text, and joins the three stamps as the version", async () => {
    rows(full());
    const p = await getAffiliatePolicies();
    expect(p.ready).toBe(true);
    expect(p.version).toBe(`${T}|2026-11-02T00:00:00.000Z|2026-11-03T00:00:00.000Z`);
    expect(p.terms.body).toBe("Terms text");
  });
  it.each([["t"], ["r"], ["p"]])("is not ready when %s is empty or blank", async (k) => {
    rows(full({ [k]: "   " }));
    expect((await getAffiliatePolicies()).ready).toBe(false);
  });
  it("is not ready when a document has no row", async () => {
    rows(full().slice(0, 2));
    expect((await getAffiliatePolicies()).ready).toBe(false);
  });
});

const url = (key?: string) => `http://x/api/admin/site-terms${key === undefined ? "" : `?key=${key}`}`;
const putReq = (body: unknown, key?: string) => new Request(url(key), { method: "PUT", body: JSON.stringify(body) }) as never;
const getReq = (key?: string) => new Request(url(key)) as never;

describe("site terms route with ?key=", () => {
  it("rejects an unknown key with 400 on GET and PUT and touches no data", async () => {
    expect((await GET(getReq("bogus"))).status).toBe(400);
    expect((await PUT(putReq({ body: "x" }, "bogus"))).status).toBe(400);
    expect(db.state.ops.length).toBe(0);
  });
  it("PUT saves under the given key", async () => {
    const res = await PUT(putReq({ body: "Rules" }, "affiliate_rules"));
    expect(res.status).toBe(200);
    expect(db.find("site_terms", "upsert")[0].payload).toMatchObject({ key: "affiliate_rules", body: "Rules" });
  });
  it("no key means general (old behaviour)", async () => {
    await PUT(putReq({ body: "G" }));
    expect(db.find("site_terms", "upsert")[0].payload).toMatchObject({ key: "general", body: "G" });
  });
  it("GET reads the given key", async () => {
    rows(full());
    const res = await GET(getReq("affiliate_privacy"));
    expect(await res.json()).toEqual({ body: "Privacy text" });
  });
  it("refuses a non-admin", async () => {
    gate.result = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    expect((await GET(getReq("affiliate_terms"))).status).toBe(403);
    expect((await PUT(putReq({ body: "x" }, "affiliate_terms"))).status).toBe(403);
  });
  it("PUT with 20,001 characters gives 400", async () => {
    expect((await PUT(putReq({ body: "a".repeat(20001) }, "affiliate_terms"))).status).toBe(400);
  });
});
