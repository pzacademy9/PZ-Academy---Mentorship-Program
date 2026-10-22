import { NextRequest } from "next/server";
import { listPaymentAccounts, type PaymentAccount } from "@/lib/data/landing-payment-accounts";
import { loadPublicPage, publicJson, variantParam } from "@/lib/api/landing-public-http";
import { resolveAccountKeysSafe } from "@/lib/data/landing-payment-countries";
import { regionAccountKeys, toPublicRegistration } from "@/lib/landing/registration/public-config";

export const dynamic = "force-dynamic";

const COUNTRY_RE = /^[A-Z]{2}$/;

/** Everything the registration widget needs, read once when the modal opens. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gate = await loadPublicPage(slug, { registration: true, variant: variantParam(req) });
  if (!gate.ok) return gate.response;
  const { page } = gate;

  // Each region gets the central list of its country (else its own old list); the client needs no change.
  const resolved = await resolveAccountKeysSafe(page.registration.regions);
  const registration = {
    ...page.registration,
    regions: page.registration.regions.map((r) => ({ ...r, accountKeys: resolved[r.key] ?? [] })),
  };

  let accounts: PaymentAccount[];
  try {
    accounts = await listPaymentAccounts(regionAccountKeys(registration));
  } catch {
    return publicJson({ error: "We could not load the payment details. Please try again in a moment." }, 500);
  }

  // Set by the Vercel edge from the visitor IP; only a hint for the default region (the visitor can change it).
  const country = (req.headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  return publicJson({
    pageId: page.id,
    status: page.status,
    registration: toPublicRegistration(registration, new Date()),
    accounts,
    country: COUNTRY_RE.test(country) ? country : null,
  });
}
