// src/lib/landing/registration/promo-resolve.ts
// Turns what the customer typed into the promo that applyPromo should judge.
// Exact stored code first (so every existing code behaves as before); only then a trailing "-NN%" on an owner code.
import type { PromoCode } from "./promo";
import { effectiveOwnerPromo, parsePromoSuffix } from "./promo-suffix";

export interface PromoResolveDeps {
  getByCode: (code: string) => Promise<PromoCode | null>;
  getMax: () => Promise<number>;
}

export interface ResolvedPromo {
  promo: PromoCode | null;
  /** The ceiling that blocked the typed percent (promo is null then). */
  overMax: number | null;
}

const NONE: ResolvedPromo = { promo: null, overMax: null };

// An owner code whose owner is gone (agent or affiliate deleted) is just an ordinary code: no suffix, no plain percent.
const isLiveOwnerCode = (p: PromoCode) => p.isOwnerCode === true && (p.ownerAgentId !== null || (p.ownerAffiliateId ?? null) !== null);

export async function resolvePromoWith(raw: string, deps: PromoResolveDeps): Promise<ResolvedPromo> {
  // People type "as47 -10 %": codes never contain spaces, so remove them all.
  const typed = raw.replace(/\s+/g, "").toUpperCase();
  const exact = await deps.getByCode(typed);
  if (exact) {
    if (!isLiveOwnerCode(exact)) return { promo: exact, overMax: null };
    return fromOwner(exact, typed, null, deps);
  }
  const s = parsePromoSuffix(typed);
  if (!s) return NONE;
  const owner = await deps.getByCode(s.base);
  if (!owner || !isLiveOwnerCode(owner)) return NONE;
  return fromOwner(owner, typed, s.percent, deps);
}

async function fromOwner(owner: PromoCode, typed: string, percent: number | null, deps: PromoResolveDeps): Promise<ResolvedPromo> {
  const r = effectiveOwnerPromo({ owner, typed, percent, globalMax: await deps.getMax() });
  return r.ok ? { promo: r.promo, overMax: null } : { promo: null, overMax: r.max };
}
