import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";
import type { PromoCode } from "@/lib/landing/registration/promo";
import { resolvePromoWith } from "@/lib/landing/registration/promo-resolve";
import { draftToInput, emptyPromoDraft, draftFromPromo } from "@/lib/landing/registration/promo-form";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { getPromoByCode, createPromoCode } from "@/lib/data/landing-promo-codes";

const base = (over: Partial<PromoCode> = {}): PromoCode => ({
  id: "p1", code: "X", type: "percent", value: 0, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
  maxUses: null, usedCount: 0, oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: null, ...over,
});
const affiliateCode = (over: Partial<PromoCode> = {}) =>
  base({ id: "a1", code: "AB321", ownerAffiliateId: "aff-1", isOwnerCode: true, plainPercent: 10, maxPercent: null, ...over });

function deps(codes: PromoCode[], max = 30) {
  return { getByCode: async (c: string) => codes.find((p) => p.code === c) ?? null, getMax: async () => max };
}

describe("an owner code owned by an affiliate behaves like an agent's", () => {
  it("typed plain gives the plain percent", async () => {
    const r = await resolvePromoWith("ab321", deps([affiliateCode()]));
    expect(r.promo).toMatchObject({ id: "a1", value: 10, ownerAffiliateId: "aff-1" });
  });
  it("typed with a percent gives that percent", async () => {
    const r = await resolvePromoWith("AB321-15%", deps([affiliateCode()]));
    expect(r.promo).toMatchObject({ id: "a1", value: 15 });
  });
  it("typed over the ceiling reports the ceiling", async () => {
    expect(await resolvePromoWith("AB321-45%", deps([affiliateCode()]))).toEqual({ promo: null, overMax: 30 });
  });
  it("an owner code with no owner at all is just an ordinary code", async () => {
    const orphan = affiliateCode({ ownerAffiliateId: null, ownerAgentId: null, value: 5 });
    expect(await resolvePromoWith("AB321-15%", deps([orphan]))).toEqual({ promo: null, overMax: null });
    expect((await resolvePromoWith("AB321", deps([orphan]))).promo).toMatchObject({ value: 5 });
  });
});

describe("the form accepts an affiliate-owned code when editing", () => {
  const draft = { ...emptyPromoDraft(), ...draftFromPromo(affiliateCode()) };
  it("without the affiliate flag an owner code with no agent is still refused", () => {
    const r = draftToInput(draft);
    expect(r.ok).toBe(false);
  });
  it("with the affiliate flag it validates and sends no agent owner", () => {
    const r = draftToInput(draft, null, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.input.ownerAgentId).toBeNull();
  });
});

describe("the data layer carries owner_affiliate_id", () => {
  beforeEach(() => db.reset());
  it("reads it", async () => {
    db.state.handler = () => ({
      data: {
        id: "a1", code: "AB321", type: "percent", value: 0, fixed_amounts: {}, max_discount_percent: 0, page_ids: [], option_keys: [],
        max_uses: null, used_count: 0, one_per_email: false, starts_at: null, ends_at: null, active: true,
        owner_agent_id: null, owner_affiliate_id: "aff-1", is_owner_code: true, plain_percent: 10, max_percent: null,
      },
      error: null,
    });
    expect(await getPromoByCode("ab321")).toMatchObject({ ownerAffiliateId: "aff-1", ownerAgentId: null, isOwnerCode: true });
  });
  it("writes it", async () => {
    db.state.handler = () => ({ data: { id: "new" }, error: null });
    await createPromoCode({ ...affiliateCode(), id: undefined, usedCount: undefined } as never);
    const ins = db.find("landing_promo_codes", "insert")[0];
    expect(ins.payload).toMatchObject({ code: "AB321", owner_affiliate_id: "aff-1" });
  });
});
