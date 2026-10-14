import { NextRequest } from "next/server";
import { emailUsedPromo, getPromoByCode } from "@/lib/data/landing-promo-codes";
import { loadPublicPage, publicJson } from "@/lib/api/landing-public-http";
import { computeQuote } from "@/lib/landing/registration/pricing";
import { applyPromo } from "@/lib/landing/registration/promo";
import { isEmail, quoteRequestSchema } from "@/lib/validations/landing-public";

export const dynamic = "force-dynamic";

/**
 * Live price for the widget order summary. The register route repeats this exact calculation
 * on submit; nothing the browser computes is ever stored. A failed quote is data (200), not an error.
 * Closed pages still quote: it is read-only, and an admin may run a test registration on them.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gate = await loadPublicPage(slug);
  if (!gate.ok) return gate.response;
  const { page } = gate;

  const parsed = quoteRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return publicJson({ error: "Invalid input" }, 400);
  const b = parsed.data;

  const now = new Date();
  const quote = computeQuote({
    config: page.registration, regionKey: b.regionKey, mode: b.mode, optionKeys: b.optionKeys, tierKey: b.tierKey, groupSize: b.groupSize, now,
  });
  if (!quote.ok || quote.isFree || !b.promoCode) return publicJson({ quote });

  try {
    const promoCode = await getPromoByCode(b.promoCode);
    const emailAlreadyUsed = promoCode !== null && promoCode.oneperEmail && isEmail(b.email)
      ? await emailUsedPromo(promoCode.id, b.email)
      : false;
    const promo = applyPromo({
      promo: promoCode, pageId: page.id, optionKeys: quote.optionKeys, currency: quote.currency, total: quote.total, now, emailAlreadyUsed,
    });
    return publicJson({ quote, promo });
  } catch {
    return publicJson({ error: "We could not check that promo code. Please try again." }, 500);
  }
}
