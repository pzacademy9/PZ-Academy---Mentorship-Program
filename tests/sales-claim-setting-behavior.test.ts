import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Result = { data: unknown; error: unknown };
let result: Result = { data: null, error: null };
let throwOnFrom = false;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: () => {
      if (throwOnFrom) throw new Error("boom");
      const chain: Record<string, unknown> = new Proxy({}, {
        get: (_t, prop: string) => {
          if (prop === "then") return (res: (v: unknown) => unknown) => res(result);
          if (prop === "maybeSingle") return () => Promise.resolve(result);
          return () => chain;
        },
      });
      return chain;
    },
  }),
}));

import { getAgentsCanClaim, setAgentsCanClaim } from "@/lib/data/sales-assignment";

beforeEach(() => {
  throwOnFrom = false;
  result = { data: null, error: null };
});

describe("getAgentsCanClaim behavior (fails closed)", () => {
  it("returns false when the query errors", async () => {
    result = { data: { agents_can_claim: true }, error: { message: "x" } };
    expect(await getAgentsCanClaim()).toBe(false);
  });
  it("returns false when the query throws", async () => {
    throwOnFrom = true;
    expect(await getAgentsCanClaim()).toBe(false);
  });
  it("returns false when the row is missing", async () => {
    result = { data: null, error: null };
    expect(await getAgentsCanClaim()).toBe(false);
  });
  it("returns false when the flag is false", async () => {
    result = { data: { agents_can_claim: false }, error: null };
    expect(await getAgentsCanClaim()).toBe(false);
  });
  it("returns true only when the flag is true", async () => {
    result = { data: { agents_can_claim: true }, error: null };
    expect(await getAgentsCanClaim()).toBe(true);
  });
});

describe("setAgentsCanClaim behavior", () => {
  it("ok when a row was updated", async () => {
    result = { data: [{ id: true }], error: null };
    expect(await setAgentsCanClaim(true)).toEqual({ ok: true });
  });
  it("not ok when no row was updated (missing singleton)", async () => {
    result = { data: [], error: null };
    expect(await setAgentsCanClaim(true)).toEqual({ ok: false });
  });
  it("not ok on error", async () => {
    result = { data: null, error: { message: "x" } };
    expect(await setAgentsCanClaim(true)).toEqual({ ok: false });
  });
  it("not ok when the client throws", async () => {
    throwOnFrom = true;
    expect(await setAgentsCanClaim(true)).toEqual({ ok: false });
  });
});
