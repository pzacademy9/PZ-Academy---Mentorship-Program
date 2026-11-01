import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
let hdrs: Record<string, string> = { "x-forwarded-for": "1.2.3.4, 5.6.7.8" };
vi.mock("next/headers", () => ({ headers: async () => new Headers(hdrs) }));

const allowLookup = vi.fn();
const findIdsByName = vi.fn();
vi.mock("@/lib/pzid/lookup-limit", () => ({ allowLookup: (ip: string) => allowLookup(ip) }));
vi.mock("@/lib/data/pz-people", async (orig) => ({
  ...(await orig<typeof import("@/lib/data/pz-people")>()),
  findIdsByName: (...a: unknown[]) => findIdsByName(...a),
}));

import { findMyIdByName } from "@/app/progress/actions";

const GENERIC = "Something went wrong. Please try again in a minute.";

beforeEach(() => {
  hdrs = { "x-forwarded-for": "1.2.3.4, 5.6.7.8" };
  allowLookup.mockReset().mockResolvedValue(true);
  findIdsByName.mockReset();
});

describe("rate limit", () => {
  it("checks the first forwarded IP and stops before any lookup", async () => {
    allowLookup.mockResolvedValue(false);
    expect(await findMyIdByName("sample")).toEqual({ status: "rate_limited" });
    expect(allowLookup).toHaveBeenCalledWith("1.2.3.4");
    expect(findIdsByName).not.toHaveBeenCalled();
  });
});

describe("rate limit address", () => {
  it("prefers x-real-ip over x-forwarded-for", async () => {
    hdrs = { "x-real-ip": " 9.9.9.9 ", "x-forwarded-for": "1.2.3.4" };
    findIdsByName.mockResolvedValue([]);
    await findMyIdByName("sample");
    expect(allowLookup).toHaveBeenCalledWith("9.9.9.9");
  });
  it("falls back to unknown", async () => {
    hdrs = {};
    findIdsByName.mockResolvedValue([]);
    await findMyIdByName("sample");
    expect(allowLookup).toHaveBeenCalledWith("unknown");
  });
});

describe("findMyIdByName", () => {
  it("is too_short under 3 letters without searching", async () => {
    expect(await findMyIdByName("sa")).toEqual({ status: "too_short" });
    expect(await findMyIdByName("*s*")).toEqual({ status: "too_short" });
    for (const q of ["a b", "...", "  a   b  "]) expect(await findMyIdByName(q)).toEqual({ status: "too_short" });
    expect(await findMyIdByName(undefined as unknown as string)).toEqual({ status: "too_short" });
    expect(findIdsByName).not.toHaveBeenCalled();
  });

  it("is too_long (a distinct status) over 60 characters, without searching", async () => {
    findIdsByName.mockResolvedValue([]);
    expect(await findMyIdByName("x".repeat(61))).toEqual({ status: "too_long" });
    expect(findIdsByName).not.toHaveBeenCalled();
    expect(await findMyIdByName("x".repeat(60))).toEqual({ status: "not_found" });
  });

  it("is not_found when nothing matches", async () => {
    findIdsByName.mockResolvedValue([]);
    expect(await findMyIdByName("zzzz")).toEqual({ status: "not_found" });
  });

  it("returns the rows, capped at 5, with no surname or email", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      firstName: "Sample", pzId: `Name-000${i}`, batchTitle: "Batch One",
    }));
    findIdsByName.mockResolvedValue(rows);
    const res = await findMyIdByName("sample");
    expect(res.status).toBe("ok");
    if (res.status !== "ok") throw new Error("unreachable");
    expect(res.rows).toHaveLength(5);
    expect(res.more).toBe(true);
    expect(JSON.stringify(res)).not.toMatch(/@|email|surname/i);
  });

  it("says more is false with 5 rows or fewer, and true with a 6th", async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ firstName: "Sample", pzId: `Name-000${i}`, batchTitle: "B" }));
    findIdsByName.mockResolvedValue(mk(5));
    expect(await findMyIdByName("sample")).toMatchObject({ status: "ok", more: false });
    findIdsByName.mockResolvedValue(mk(6));
    const res = await findMyIdByName("sample");
    expect(res).toMatchObject({ status: "ok", more: true });
    if (res.status === "ok") expect(res.rows).toHaveLength(5);
  });

  it("hides thrown database text behind one generic message", async () => {
    findIdsByName.mockRejectedValue(new Error("password authentication failed for user x"));
    const res = await findMyIdByName("sample");
    expect(res).toEqual({ status: "error", message: GENERIC });
    expect(JSON.stringify(res)).not.toContain("password");
  });

  it("keeps the generic message even when the limiter itself throws", async () => {
    allowLookup.mockRejectedValue(new Error("limiter blew up"));
    expect(await findMyIdByName("sample")).toEqual({ status: "error", message: GENERIC });
  });
});
