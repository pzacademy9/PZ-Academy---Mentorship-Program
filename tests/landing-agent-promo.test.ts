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

const NONE: AgentPromoDeps = { findForAgent: async () => null, create: async () => ({ ok: true, id: "new-id" }) };

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
    const findForAgent = vi.fn();
    const r = await createAgentPromoWith("agent-1", "A", { findForAgent, create });
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect(create).not.toHaveBeenCalled();
    expect(findForAgent).not.toHaveBeenCalled();
  });
  it("one code per agent: refuses when the agent already has one", async () => {
    const create = vi.fn();
    const r = await createAgentPromoWith("agent-1", "ahm", { findForAgent: async () => "PZ-OLD", create });
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
});
