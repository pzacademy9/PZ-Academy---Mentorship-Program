import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }) }));

const allowLookup = vi.fn();
const getProgressByPzId = vi.fn();
const findIdsByName = vi.fn();
vi.mock("@/lib/pzid/lookup-limit", () => ({ allowLookup: (ip: string) => allowLookup(ip) }));
vi.mock("@/lib/data/progress", () => ({ getProgressByPzId: (...a: unknown[]) => getProgressByPzId(...a) }));
vi.mock("@/lib/data/pz-people", () => ({ findIdsByName: (...a: unknown[]) => findIdsByName(...a) }));

import { findMyIdByName, getMyProgress } from "@/app/progress/actions";

const GENERIC = "Something went wrong. Please try again in a minute.";

beforeEach(() => {
  allowLookup.mockReset().mockResolvedValue(true);
  getProgressByPzId.mockReset();
  findIdsByName.mockReset();
});

describe("rate limit", () => {
  it("checks the first forwarded IP and stops before any lookup", async () => {
    allowLookup.mockResolvedValue(false);
    expect(await findMyIdByName("sample")).toEqual({ status: "rate_limited" });
    expect(await getMyProgress("Sample-0001")).toEqual({ status: "rate_limited" });
    expect(allowLookup).toHaveBeenCalledWith("1.2.3.4");
    expect(findIdsByName).not.toHaveBeenCalled();
    expect(getProgressByPzId).not.toHaveBeenCalled();
  });
});

describe("getMyProgress", () => {
  it("gives the identical not_found for a bad format and an unknown ID", async () => {
    getProgressByPzId.mockResolvedValue(null);
    const bad = await getMyProgress("!!");
    const unknown = await getMyProgress("Nobody-9999");
    expect(bad).toEqual({ status: "not_found" });
    expect(unknown).toEqual(bad);
  });

  it("treats a non-string input as not_found", async () => {
    getProgressByPzId.mockResolvedValue(null);
    expect(await getMyProgress(undefined as unknown as string)).toEqual({ status: "not_found" });
  });

  it("returns only the builder output on success", async () => {
    const progress = { firstName: "Sample", pzId: "Sample-0001", groups: [] };
    getProgressByPzId.mockResolvedValue(progress);
    expect(await getMyProgress("Sample-0001")).toEqual({ status: "ok", progress });
  });

  it("hides thrown database text behind one generic message", async () => {
    getProgressByPzId.mockRejectedValue(new Error('relation "landing_registrations" secret failure'));
    const res = await getMyProgress("Sample-0001");
    expect(res).toEqual({ status: "error", message: GENERIC });
    expect(JSON.stringify(res)).not.toContain("secret");
  });
});

describe("findMyIdByName", () => {
  it("is too_short under 3 letters without searching", async () => {
    expect(await findMyIdByName("sa")).toEqual({ status: "too_short" });
    expect(await findMyIdByName("*s*")).toEqual({ status: "too_short" });
    expect(findIdsByName).not.toHaveBeenCalled();
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
    expect(JSON.stringify(res)).not.toMatch(/@|email|surname/i);
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
