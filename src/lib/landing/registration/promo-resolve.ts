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

export async function resolvePromoWith(typed: string, deps: PromoResolveDeps): Promise<ResolvedPromo> {
  const exact = await deps.getByCode(typed);
  if (exact) {
    if (!exact.isOwnerCode) return { promo: exact, overMax: null };
    return fromOwner(exact, typed, null, deps);
  }
  const s = parsePromoSuffix(typed);
  if (!s) return NONE;
  const owner = await deps.getByCode(s.base);
  if (!owner || !owner.isOwnerCode) return NONE;
  return fromOwner(owner, typed, s.percent, deps);
}

async function fromOwner(owner: PromoCode, typed: string, percent: number | null, deps: PromoResolveDeps): Promise<ResolvedPromo> {
  const r = effectiveOwnerPromo({ owner, typed, percent, globalMax: await deps.getMax() });
  return r.ok ? { promo: r.promo, overMax: null } : { promo: null, overMax: r.max };
}
