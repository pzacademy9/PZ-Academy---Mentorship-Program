// src/lib/landing/registration/credit.ts
// Who gets the credit for a registration. Pure, so every rule is testable on its own.
// An agent link wins, then an affiliate link, then the owner of the promo code that was used. Never both at once.

export type Credit = { agentId: string | null; affiliateId: string | null };

export function pickCredit(a: {
  isTest: boolean;
  agentLink: string | null;
  affiliateLink: string | null;
  /** The promo was applied and either discounted something or is an owner's own code. */
  promoCounts: boolean;
  promoOwnerAgentId: string | null;
  promoOwnerAffiliateId: string | null;
}): Credit {
  if (a.isTest) return { agentId: null, affiliateId: null };
  if (a.agentLink) return { agentId: a.agentLink, affiliateId: null };
  if (a.affiliateLink) return { agentId: null, affiliateId: a.affiliateLink };
  if (a.promoCounts) {
    if (a.promoOwnerAgentId) return { agentId: a.promoOwnerAgentId, affiliateId: null };
    if (a.promoOwnerAffiliateId) return { agentId: null, affiliateId: a.promoOwnerAffiliateId };
  }
  return { agentId: null, affiliateId: null };
}
