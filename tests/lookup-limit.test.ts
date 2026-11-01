// tests/lookup-limit.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const mem = vi.hoisted(() => ({ allowRequest: vi.fn() }));
vi.mock("@/lib/pzid/rate-limit", () => ({ allowRequest: mem.allowRequest }));

import { allowLookup } from "@/lib/pzid/lookup-limit";

beforeEach(() => {
  db.reset();
  mem.allowRequest.mockReset();
});

describe("allowLookup", () => {
  it("returns true when the database allows it", async () => {
    db.state.handler = () => ({ data: true, error: null });
    expect(await allowLookup("203.0.113.9")).toBe(true);
    const op = db.find("public_lookup_allow", "rpc")[0];
    expect(op.payload).toMatchObject({ p_limit: 30, p_window_secs: 600 });
    expect(mem.allowRequest).not.toHaveBeenCalled();
  });

  it("returns false when the database denies it", async () => {
    db.state.handler = () => ({ data: false, error: null });
    expect(await allowLookup("203.0.113.9")).toBe(false);
    expect(mem.allowRequest).not.toHaveBeenCalled();
  });

  it("falls back to the in-memory limiter on a database error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "down" } });
    mem.allowRequest.mockReturnValue(false);
    expect(await allowLookup("203.0.113.9")).toBe(false);
    expect(mem.allowRequest).toHaveBeenCalledTimes(1);
  });

  it("falls back when the call throws or returns a non-boolean", async () => {
    mem.allowRequest.mockReturnValue(true);
    db.state.handler = () => { throw new Error("boom"); };
    expect(await allowLookup("203.0.113.9")).toBe(true);
    db.state.handler = () => ({ data: null, error: null });
    expect(await allowLookup("203.0.113.9")).toBe(true);
    expect(mem.allowRequest).toHaveBeenCalledTimes(2);
  });

  it("never sends the raw IP to the database", async () => {
    db.state.handler = () => ({ data: true, error: null });
    await allowLookup("203.0.113.9");
    const op = db.find("public_lookup_allow", "rpc")[0];
    const key = (op.payload as { p_key: string }).p_key;
    expect(JSON.stringify(op.payload)).not.toContain("203.0.113.9");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    db.state.handler = () => ({ data: true, error: null });
    await allowLookup("203.0.113.10");
    const key2 = (db.find("public_lookup_allow", "rpc")[1].payload as { p_key: string }).p_key;
    expect(key2).not.toBe(key);
  });
});
