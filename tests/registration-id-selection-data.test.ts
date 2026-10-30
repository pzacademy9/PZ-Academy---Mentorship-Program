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

const cand = (id: string, name: string) => ({ registrationId: id, name, email: `${id}@x.com`, phone: "123" });

beforeEach(() => {
  auth.requireAdmin.mockReset().mockResolvedValue({ ok: true });
  camp.resolveCandidates.mockReset();
  sends.pzIdsFor.mockReset();
  people.listBatchIdsForAdmin.mockReset();
});

describe("getSelectionIdList", () => {
  it("for ticked ids returns only people with an ID, and no email or phone key", async () => {
    camp.resolveCandidates.mockResolvedValue([cand("a", "Ann"), cand("b", "Bob"), cand("c", "Cy")]);
    sends.pzIdsFor.mockResolvedValue(new Map([["a", "Ann-1111"], ["c", "Cy-3333"]]));
    const out = await getSelectionIdList("pg1", { mode: "ids", ids: ["a", "b", "c"] });
    expect(camp.resolveCandidates).toHaveBeenCalledWith({ pageId: "pg1", ids: ["a", "b", "c"] });
    expect(out).toEqual([{ name: "Ann", pzId: "Ann-1111" }, { name: "Cy", pzId: "Cy-3333" }]);
    expect(Object.keys(out[0]).sort()).toEqual(["name", "pzId"]);
  });
  it("for a filter selection resolves with the filters", async () => {
    const filters = { pageId: "pg1", mode: "live" as const };
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
    await expect(getSelectionIdList("pg1", { mode: "ids", ids: ["a"] })).rejects.toThrow();
    expect(camp.resolveCandidates).not.toHaveBeenCalled();
  });
});
