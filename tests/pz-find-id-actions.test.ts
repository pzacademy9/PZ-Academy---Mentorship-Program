import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }) }));
const searchBatchIds = vi.fn();
vi.mock("@/lib/data/pz-people", () => ({ searchBatchIds: (...a: unknown[]) => searchBatchIds(...a) }));
vi.mock("@/lib/pzid/rate-limit", () => ({ allowRequest: () => true }));

import { findMyId } from "@/app/ids/[slug]/actions";

beforeEach(() => {
  searchBatchIds.mockReset();
});

describe("findMyId error handling", () => {
  it("never forwards an unknown error message to the browser", async () => {
    searchBatchIds.mockImplementation(async () => { throw new Error('relation "pz_people" does not exist'); });
    const res = await findMyId("batch-1", "Ali");
    expect(res).toEqual({ status: "error", message: "Something went wrong. Please try again in a minute." });
  });

  it("passes through the known plain error from searchBatchIds", async () => {
    searchBatchIds.mockImplementation(async () => { throw new Error("Could not search IDs. Please try again."); });
    const res = await findMyId("batch-1", "Ali");
    expect(res).toEqual({ status: "error", message: "Could not search IDs. Please try again." });
  });
});
