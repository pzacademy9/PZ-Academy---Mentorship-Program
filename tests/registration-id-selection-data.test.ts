// tests/registration-id-selection-data.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const camp = vi.hoisted(() => ({ resolveCandidates: vi.fn() }));
const sends = vi.hoisted(() => ({ pzIdsFor: vi.fn() }));
const people = vi.hoisted(() => ({ listBatchIdsForAdmin: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: auth.requireAdmin }));
vi.mock("@/lib/data/participant-campaigns", () => ({ resolveCandidates: camp.resolveCandidates }));
vi.mock("@/lib/data/participant-sends", () => ({ pzIdsFor: sends.pzIdsFor }));
vi.mock("@/lib/data/pz-people", () => ({ listBatchIdsForAdmin: people.listBatchIdsForAdmin }));

import { getSelectionIdList } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/id-actions";

const cand = (id: string, name: string, status = "paid") => ({ registrationId: id, name, email: `${id}@x.com`, phone: "123", status });
const UA = "00000000-0000-4000-8000-00000000000a";
const UB = "00000000-0000-4000-8000-00000000000b";
const UC = "00000000-0000-4000-8000-00000000000c";

beforeEach(() => {
  auth.requireAdmin.mockReset().mockResolvedValue({ ok: true });
  camp.resolveCandidates.mockReset();
  sends.pzIdsFor.mockReset();
  people.listBatchIdsForAdmin.mockReset();
});

describe("getSelectionIdList", () => {
  it("for ticked ids returns only people with an ID, and no email or phone key", async () => {
    camp.resolveCandidates.mockResolvedValue([cand(UA, "Ann"), cand(UB, "Bob"), cand(UC, "Cy")]);
    sends.pzIdsFor.mockResolvedValue(new Map([[UA, "Ann-1111"], [UC, "Cy-3333"]]));
    const out = await getSelectionIdList("pg1", { mode: "ids", ids: [UA, UB, UC] });
    expect(camp.resolveCandidates).toHaveBeenCalledWith({ pageId: "pg1", ids: [UA, UB, UC] });
    expect(out).toEqual([{ name: "Ann", pzId: "Ann-1111" }, { name: "Cy", pzId: "Cy-3333" }]);
    expect(Object.keys(out[0]).sort()).toEqual(["name", "pzId"]);
  });
  it("for a filter selection resolves with the filters", async () => {
    const filters = { pageId: "00000000-0000-4000-8000-0000000000f1", mode: "live" as const };
    camp.resolveCandidates.mockResolvedValue([cand("a", "Ann")]);
    sends.pzIdsFor.mockResolvedValue(new Map([["a", "Ann-1111"]]));
    expect(await getSelectionIdList("pg1", { mode: "filter", filters })).toEqual([{ name: "Ann", pzId: "Ann-1111" }]);
    expect(camp.resolveCandidates).toHaveBeenCalledWith({ pageId: "pg1", filters });
  });
  it("for null returns the whole batch the existing way", async () => {
    people.listBatchIdsForAdmin.mockResolvedValue([{ name: "Hamid", email: "h@x.com", pzId: "Hamid-4821" }]);
    expect(await getSelectionIdList("pg1", null)).toEqual([{ name: "Hamid", pzId: "Hamid-4821" }]);
    expect(camp.resolveCandidates).not.toHaveBeenCalled();
  });
  it("refuses a caller who is not an admin", async () => {
    auth.requireAdmin.mockResolvedValue({ ok: false });
    await expect(getSelectionIdList("pg1", null)).rejects.toThrow();
    await expect(getSelectionIdList("pg1", { mode: "ids", ids: [UA] })).rejects.toThrow();
    expect(camp.resolveCandidates).not.toHaveBeenCalled();
  });
  it("rejects a bad uuid, too many ids, or bad filters before reading anything", async () => {
    await expect(getSelectionIdList("pg1", { mode: "ids", ids: ["not-a-uuid"] })).rejects.toThrow(/not valid/);
    await expect(getSelectionIdList("pg1", { mode: "ids", ids: Array.from({ length: 1001 }, () => UA) })).rejects.toThrow(/not valid/);
    await expect(getSelectionIdList("pg1", { mode: "filter", filters: { mode: "weird" } as never })).rejects.toThrow(/not valid/);
    expect(camp.resolveCandidates).not.toHaveBeenCalled();
    expect(sends.pzIdsFor).not.toHaveBeenCalled();
  });
  it("does not return a pending person even if they already have an ID", async () => {
    camp.resolveCandidates.mockResolvedValue([cand(UA, "Ann"), cand(UB, "Pen", "pending"), cand(UC, "Fred", "free")]);
    sends.pzIdsFor.mockResolvedValue(new Map([[UA, "Ann-1111"], [UB, "Pen-2222"], [UC, "Fred-3333"]]));
    expect(await getSelectionIdList("pg1", { mode: "ids", ids: [UA, UB, UC] })).toEqual([
      { name: "Ann", pzId: "Ann-1111" }, { name: "Fred", pzId: "Fred-3333" },
    ]);
  });
  it("collapses duplicates so each person appears once", async () => {
    camp.resolveCandidates.mockResolvedValue([cand(UA, "Ann"), cand(UB, "Ann again"), cand(UC, "Cy")]);
    sends.pzIdsFor.mockResolvedValue(new Map([[UA, "Ann-1111"], [UB, "Ann-1111"], [UC, "Cy-3333"]]));
    expect(await getSelectionIdList("pg1", { mode: "ids", ids: [UA, UB, UC] })).toEqual([
      { name: "Ann", pzId: "Ann-1111" }, { name: "Cy", pzId: "Cy-3333" },
    ]);
  });
});
