import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { pickCredit } from "@/lib/landing/registration/credit";
import { resolveAffiliateCode, creditRegistration } from "@/lib/data/affiliate-credit";

const none = { isTest: false, agentLink: null, affiliateLink: null, promoCounts: false, promoOwnerAgentId: null, promoOwnerAffiliateId: null };

describe("pickCredit", () => {
  it("test rows get no credit at all", () => {
    expect(pickCredit({ ...none, isTest: true, agentLink: "a1", affiliateLink: "f1", promoCounts: true, promoOwnerAffiliateId: "f2" })).toEqual({ agentId: null, affiliateId: null });
  });
  it("an agent link beats an affiliate link", () => {
    expect(pickCredit({ ...none, agentLink: "a1", affiliateLink: "f1" })).toEqual({ agentId: "a1", affiliateId: null });
  });
  it("an affiliate link beats the promo code owner", () => {
    expect(pickCredit({ ...none, affiliateLink: "f1", promoCounts: true, promoOwnerAgentId: "a2" })).toEqual({ agentId: null, affiliateId: "f1" });
  });
  it("an agent link beats an affiliate promo code", () => {
    expect(pickCredit({ ...none, agentLink: "a1", promoCounts: true, promoOwnerAffiliateId: "f2" })).toEqual({ agentId: "a1", affiliateId: null });
  });
  it("the promo owner gets credit when the code counts: agent or affiliate", () => {
    expect(pickCredit({ ...none, promoCounts: true, promoOwnerAgentId: "a2" })).toEqual({ agentId: "a2", affiliateId: null });
    expect(pickCredit({ ...none, promoCounts: true, promoOwnerAffiliateId: "f2" })).toEqual({ agentId: null, affiliateId: "f2" });
  });
  it("a promo that does not count credits nobody", () => {
    expect(pickCredit({ ...none, promoCounts: false, promoOwnerAffiliateId: "f2" })).toEqual({ agentId: null, affiliateId: null });
  });
  it("nothing set gives nothing and never both at once", () => {
    expect(pickCredit(none)).toEqual({ agentId: null, affiliateId: null });
    const r = pickCredit({ ...none, promoCounts: true, promoOwnerAgentId: "a2", promoOwnerAffiliateId: "f2" });
    expect(r.agentId !== null && r.affiliateId !== null).toBe(false);
  });
});

describe("resolveAffiliateCode", () => {
  beforeEach(() => db.reset());
  const answer = (code: string, status: string, id: string) => {
    db.state.handler = (op) => {
      const c = op.filters.find((f) => f[0] === "eq" && f[1] === "code");
      const s = op.filters.find((f) => f[0] === "eq" && f[1] === "status");
      return op.table === "affiliates" && c?.[2] === code && s?.[2] === status ? { data: { id }, error: null } : { data: null, error: null };
    };
  };
  it("finds an accepted affiliate whatever the capitals or spaces", async () => {
    answer("AS47", "accepted", "aff-1");
    expect(await resolveAffiliateCode(" as47 ")).toEqual({ affiliateId: "aff-1" });
  });
  it("only ever asks for accepted affiliates (a dropped one finds nothing)", async () => {
    answer("AS47", "accepted", "aff-1");
    await resolveAffiliateCode("AS47");
    const op = db.state.ops[0];
    expect(op.filters.some((f) => f[0] === "eq" && f[1] === "status" && f[2] === "accepted")).toBe(true);
  });
  it("gives null for nothing, for an unknown code and on a database error", async () => {
    answer("AS47", "accepted", "aff-1");
    expect(await resolveAffiliateCode("")).toBeNull();
    expect(await resolveAffiliateCode("ZZ99")).toBeNull();
    db.state.handler = () => ({ data: null, error: { code: "57014", message: "x" } });
    expect(await resolveAffiliateCode("AS47")).toBeNull();
  });
  it("never reads a code that cannot be an affiliate code", async () => {
    await resolveAffiliateCode("not a code!!");
    await resolveAffiliateCode("a".repeat(500));
    expect(db.state.ops.length).toBe(0);
  });
});

describe("creditRegistration", () => {
  beforeEach(() => db.reset());
  it("sets the affiliate only where no agent already has the credit", async () => {
    await creditRegistration("reg-1", "aff-1");
    const ops = db.find("landing_registrations", "update");
    expect(ops.length).toBe(1);
    expect(ops[0].payload).toEqual({ affiliate_id: "aff-1" });
    expect(ops[0].filters.some((f) => f[0] === "eq" && f[1] === "id" && f[2] === "reg-1")).toBe(true);
    expect(ops[0].filters.some((f) => f[0] === "is" && f[1] === "agent_id" && f[2] === null)).toBe(true);
  });
  it("never throws, even when the write fails", async () => {
    db.state.handler = () => ({ data: null, error: { code: "XX000", message: "boom" } });
    await expect(creditRegistration("reg-1", "aff-1")).resolves.toBeUndefined();
  });
});
