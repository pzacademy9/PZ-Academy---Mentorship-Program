// tests/lookup-limit.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const mem = vi.hoisted(() => ({ allowRequest: vi.fn() }));
vi.mock("@/lib/pzid/rate-limit", () => ({ allowRequest: mem.allowRequest }));

import { allowLookup, allowPortalView, rateKeyForIp, LIMIT, PORTAL_LIMIT, WINDOW_SECS } from "@/lib/pzid/lookup-limit";

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

describe("allowPortalView", () => {
  it("has its own, higher limit; Find my ID keeps 30", async () => {
    expect([LIMIT, PORTAL_LIMIT, WINDOW_SECS]).toEqual([30, 300, 600]);
    db.state.handler = () => ({ data: true, error: null });
    await allowPortalView("203.0.113.9");
    await allowLookup("203.0.113.9");
    const ops = db.find("public_lookup_allow", "rpc");
    expect(ops[0].payload).toMatchObject({ p_limit: 300, p_window_secs: 600 });
    expect(ops[1].payload).toMatchObject({ p_limit: 30, p_window_secs: 600 });
  });

  it("counts under a different key than Find my ID for the same IP", async () => {
    db.state.handler = () => ({ data: true, error: null });
    await allowPortalView("203.0.113.9");
    await allowLookup("203.0.113.9");
    const ops = db.find("public_lookup_allow", "rpc");
    const k1 = (ops[0].payload as { p_key: string }).p_key;
    const k2 = (ops[1].payload as { p_key: string }).p_key;
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
    expect(k1).not.toBe(k2);
  });

  it("falls back to the in-memory limiter on a database error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "down" } });
    mem.allowRequest.mockReturnValue(true);
    expect(await allowPortalView("203.0.113.9")).toBe(true);
    expect(mem.allowRequest).toHaveBeenCalledTimes(1);
  });
});

describe("rateKeyForIp", () => {
  it("leaves IPv4 and unknown alone", () => {
    expect(rateKeyForIp("203.0.113.9")).toBe("203.0.113.9");
    expect(rateKeyForIp("unknown")).toBe("unknown");
  });

  it("buckets full and compressed IPv6 by the first four groups", () => {
    expect(rateKeyForIp("2001:0db8:85a3:0042:1111:2222:3333:4444")).toBe("v6:2001:db8:85a3:42");
    expect(rateKeyForIp("2001:db8:1:2::9")).toBe("v6:2001:db8:1:2");
    expect(rateKeyForIp("2001:db8::1")).toBe("v6:2001:db8:0:0");
    expect(rateKeyForIp("::1")).toBe("v6:0:0:0:0");
    expect(rateKeyForIp("2001:DB8:1:2:0:0:0:5")).toBe("v6:2001:db8:1:2");
    expect(rateKeyForIp("[2001:db8:1:2::9]")).toBe("v6:2001:db8:1:2");
  });

  it("treats an IPv4-mapped address as that IPv4", () => {
    expect(rateKeyForIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(rateKeyForIp("::FFFF:cb00:7109")).toBe("203.0.113.9");
  });

  it("same /64 gives the same key, a different /64 differs", () => {
    expect(rateKeyForIp("2001:db8:1:2::1")).toBe(rateKeyForIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd"));
    expect(rateKeyForIp("2001:db8:1:2::1")).not.toBe(rateKeyForIp("2001:db8:1:3::1"));
  });

  it("does not throw on garbage", () => {
    for (const bad of ["", ":::", "1:2:3", "zz::1", "1::2::3", "::ffff:999.1.1.1", "1:2:3:4:5:6:7:8:9", null, undefined, 42]) {
      expect(() => rateKeyForIp(bad as unknown as string)).not.toThrow();
    }
  });

  it("allowLookup counts two addresses of one /64 under one hashed key, and never sends the address", async () => {
    db.state.handler = () => ({ data: true, error: null });
    await allowLookup("2001:db8:1:2::1");
    await allowLookup("2001:db8:1:2::2");
    const ops = db.find("public_lookup_allow", "rpc");
    const k = (ops[0].payload as { p_key: string }).p_key;
    expect((ops[1].payload as { p_key: string }).p_key).toBe(k);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});
