// src/lib/data/affiliate-promo.ts
// An affiliate's own discount code. Typed plain it gives 10%; typed CODE-NN% it gives NN% up to the ceiling
// (the owner-code engine, PR #109). Made when they are accepted, switched off when they are dropped or leave.
// Nothing here throws: the accept must never fail because of the discount code.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createPromoCode } from "@/lib/data/landing-promo-codes";

/** Makes the code if there is none, or switches an old one back on. Safe to run twice. */
export async function ensureAffiliatePromo(a: { id: string; code: string }): Promise<"ok" | "failed"> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("landing_promo_codes")
      .select("id, active")
      .eq("owner_affiliate_id", a.id)
      .eq("is_owner_code", true)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) return "failed";
    const found = data?.[0];
    if (found) {
      if (found.active) return "ok";
      const up = await admin
        .from("landing_promo_codes")
        .update({ active: true, updated_at: new Date().toISOString() })
        .eq("id", found.id);
      return up.error ? "failed" : "ok";
    }
    const r = await createPromoCode({
      code: a.code,
      type: "percent",
      value: 0,
      fixedAmounts: {},
      maxDiscountPercent: 0,
      pageIds: [],
      optionKeys: [],
      maxUses: null,
      oneperEmail: false,
      startsAt: null,
      endsAt: null,
      active: true,
      ownerAgentId: null,
      ownerAffiliateId: a.id,
      isOwnerCode: true,
      plainPercent: 10,
      maxPercent: null,
    });
    return r.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

/** The affiliate's code stops giving discount and credit. Old commission is untouched. */
export async function deactivateAffiliatePromo(affiliateId: string): Promise<void> {
  try {
    const { error } = await createAdminSupabase()
      .from("landing_promo_codes")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("owner_affiliate_id", affiliateId);
    if (error) console.warn("[affiliate-promo] could not switch the code off:", error.code);
  } catch {
    console.warn("[affiliate-promo] switching the code off crashed");
  }
}
