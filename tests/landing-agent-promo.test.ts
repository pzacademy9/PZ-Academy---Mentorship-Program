import { describe, expect, it, vi } from "vitest";
import { createAgentPromoWith, parseAgentCodeInput, type AgentPromoDeps } from "@/lib/landing/registration/agent-promo";

describe("parseAgentCodeInput", () => {
  it("adds the PZ- prefix and uppercases", () => {
    expect(parseAgentCodeInput("ahm")).toEqual({ ok: true, code: "PZ-AHM" });
    expect(parseAgentCodeInput("Ayesha1")).toEqual({ ok: true, code: "PZ-AYESHA1" });
  });
  it("removes spaces and a typed PZ- prefix", () => {
    expect(parseAgentCodeInput(" a h m ")).toEqual({ ok: true, code: "PZ-AHM" });
    expect(parseAgentCodeInput("pz-ahm")).toEqual({ ok: true, code: "PZ-AHM" });
    expect(parseAgentCodeInput("PZ AHM")).toEqual({ ok: true, code: "PZ-AHM" });
    // A real name that merely starts with PZ keeps it.
    expect(parseAgentCodeInput("PZAB")).toEqual({ ok: true, code: "PZ-PZAB" });
  });
  it("needs at least one letter, so PZ-50 can never look like a percent", () => {
    for (const bad of ["30", "50", "100", "12345"]) expect(parseAgentCodeInput(bad).ok, bad).toBe(false);
    expect(parseAgentCodeInput("A5").ok).toBe(true);
  });
  it("accepts 2 to 8 letters or numbers only", () => {
    expect(parseAgentCodeInput("AB").ok).toBe(true);
    expect(parseAgentCodeInput("ABCDEFGH").ok).toBe(true);
    for (const bad of ["A", "ABCDEFGHI", "", "A-B", "AH_M", "AH%", "عائشہ"]) {
      const r = parseAgentCodeInput(bad);
      expect(r.ok, bad).toBe(false);
    }
  });
  it("refuses reserved names", () => {
    for (const bad of ["admin", "FREE", "test", "pz", "staff"]) {
      const r = parseAgentCodeInput(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/cannot be used/i);
    }
  });
});

const NONE: AgentPromoDeps = { listForAgent: async () => [], create: async () => ({ ok: true, id: "new-id" }), remove: async () => {} };

describe("createAgentPromoWith", () => {
  it("creates an owner code owned by the agent, 10% plain, live, no limits", async () => {
    const create = vi.fn().mockResolvedValue({ ok: true, id: "new-id" });
    const r = await createAgentPromoWith("agent-1", "ahm", { ...NONE, create });
    expect(r).toEqual({ ok: true, code: "PZ-AHM" });
    expect(create).toHaveBeenCalledWith({
      code: "PZ-AHM", type: "percent", value: 0, fixedAmounts: {}, maxDiscountPercent: 0,
      pageIds: [], optionKeys: [], maxUses: null, oneperEmail: false, startsAt: null, endsAt: null,
      active: true, ownerAgentId: "agent-1", isOwnerCode: true, plainPercent: 10, maxPercent: null,
    });
  });
  it("refuses a bad name without touching the database", async () => {
    const create = vi.fn();
    const listForAgent = vi.fn();
    const r = await createAgentPromoWith("agent-1", "A", { ...NONE, listForAgent, create });
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect(create).not.toHaveBeenCalled();
    expect(listForAgent).not.toHaveBeenCalled();
  });
  it("one code per agent: refuses when the agent already has one", async () => {
    const create = vi.fn();
    const r = await createAgentPromoWith("agent-1", "ahm", { ...NONE, listForAgent: async () => [{ id: "old", code: "PZ-OLD" }], create });
    expect(r).toMatchObject({ ok: false, reason: "exists" });
    expect(create).not.toHaveBeenCalled();
  });
  it("says taken when the code already exists for anyone", async () => {
    const r = await createAgentPromoWith("agent-1", "ahm", { ...NONE, create: async () => ({ ok: false, reason: "duplicate" }) });
    expect(r).toMatchObject({ ok: false, reason: "taken" });
  });
  it("passes a database failure through", async () => {
    const r = await createAgentPromoWith("agent-1", "ahm", { ...NONE, create: async () => ({ ok: false, reason: "db-error" }) });
    expect(r).toMatchObject({ ok: false, reason: "db-error" });
  });
  it("two creates at once: the newer one is removed and the agent keeps only the oldest", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    // After our insert, the agent has an older code made a moment earlier in another tab.
    const listForAgent = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "other", code: "PZ-AYESHA" }, { id: "new-id", code: "PZ-AHM" }]);
    const r = await createAgentPromoWith("agent-1", "ahm", { listForAgent, create: async () => ({ ok: true, id: "new-id" }), remove });
    expect(r).toMatchObject({ ok: false, reason: "exists" });
    expect(remove).toHaveBeenCalledWith("new-id");
  });
  it("two creates at once: the oldest one keeps its code and nothing is removed", async () => {
    const remove = vi.fn();
    const listForAgent = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "new-id", code: "PZ-AHM" }, { id: "later", code: "PZ-AYESHA" }]);
    const r = await createAgentPromoWith("agent-1", "ahm", { listForAgent, create: async () => ({ ok: true, id: "new-id" }), remove });
    expect(r).toEqual({ ok: true, code: "PZ-AHM" });
    expect(remove).not.toHaveBeenCalled();
  });
});
