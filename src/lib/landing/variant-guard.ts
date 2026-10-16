// src/lib/landing/variant-guard.ts
// IDOR guard for /landing-pages/[id]/variants/[variantId]/*: the variant must belong to the page in the URL.
import { getVariant, type LandingVariant } from "@/lib/data/landing-variants";
import { isPageId } from "@/lib/validations/landing";

export type OwnedVariant = { ok: true; variant: LandingVariant } | { ok: false; reason: "not-found" | "db-error" };

export async function getOwnedVariant(pageId: string, variantId: string): Promise<OwnedVariant> {
  // Both are uuids; anything else can never match and Postgres would answer 22P02 instead of "no row".
  if (!isPageId(pageId) || !isPageId(variantId)) return { ok: false, reason: "not-found" };
  try {
    const v = await getVariant(variantId);
    // A foreign page's variant is indistinguishable from a missing one.
    return v && v.pageId === pageId ? { ok: true, variant: v } : { ok: false, reason: "not-found" };
  } catch {
    return { ok: false, reason: "db-error" };
  }
}
