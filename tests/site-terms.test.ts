import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createSupabaseMock } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const gate = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => gate.result }));

import { getGeneralTerms, saveGeneralTerms } from "@/lib/data/site-terms";
import { siteTermsSchema } from "@/lib/validations/site-terms";
import { GET, PUT } from "@/app/api/admin/site-terms/route";

beforeEach(() => {
  db.reset();
  gate.result = { ok: true, user: { id: "a" } };
});

describe("siteTermsSchema", () => {
  it("accepts 20000 characters and rejects 20001 and a non-string", () => {
    expect(siteTermsSchema.safeParse({ body: "a".repeat(20000) }).success).toBe(true);
    expect(siteTermsSchema.safeParse({ body: "a".repeat(20001) }).success).toBe(false);
    expect(siteTermsSchema.safeParse({ body: 5 }).success).toBe(false);
    expect(siteTermsSchema.safeParse({}).success).toBe(false);
  });
});

describe("general terms data", () => {
  it("returns an empty text when there is no row", async () => {
    db.state.handler = () => ({ data: null, error: null });
    await expect(getGeneralTerms()).resolves.toBe("");
  });

  it("returns the stored text", async () => {
    db.state.handler = () => ({ data: { body: "1. Fake rule" }, error: null });
    await expect(getGeneralTerms()).resolves.toBe("1. Fake rule");
  });

  it("throws on a database error so a page never silently drops its Terms", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(getGeneralTerms()).rejects.toBeTruthy();
  });

  it("saving stores the text under the key general", async () => {
    db.state.handler = () => ({ data: null, error: null });
    await saveGeneralTerms("Fake text");
    const op = db.find("site_terms", "upsert")[0];
    expect(op.payload).toMatchObject({ key: "general", body: "Fake text" });
  });
});

const req = (body: unknown, method = "PUT") => new Request("http://x", { method, body: JSON.stringify(body) }) as never;

describe("site terms route", () => {
  it.each([[401, "Not authenticated"], [403, "Forbidden"]])("%s refuses a non-admin on GET and PUT and touches no data", async (code, message) => {
    gate.result = { ok: false, response: NextResponse.json({ error: message }, { status: code }) };
    expect((await GET()).status).toBe(code);
    expect((await PUT(req({ body: "x" }))).status).toBe(code);
    expect(db.state.ops.length).toBe(0);
  });

  it("GET gives the stored text", async () => {
    db.state.handler = () => ({ data: { body: "Stored" }, error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ body: "Stored" });
  });

  it("PUT with a bad body gives 400 and saves nothing", async () => {
    const res = await PUT(req({ body: 12 }));
    expect(res.status).toBe(400);
    expect(db.find("site_terms", "upsert").length).toBe(0);
  });

  it("PUT saves and answers ok", async () => {
    db.state.handler = () => ({ data: null, error: null });
    const res = await PUT(req({ body: "New text" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(db.find("site_terms", "upsert")[0].payload).toMatchObject({ key: "general", body: "New text" });
  });

  it("PUT answers 500 in plain words when saving fails", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    const res = await PUT(req({ body: "x" }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toMatch(/could not save/i);
  });
});
