import { NextRequest } from "next/server";
import { listPaymentAccounts, type PaymentAccount } from "@/lib/data/landing-payment-accounts";
import { loadPublicPage, publicJson } from "@/lib/api/landing-public-http";
import { regionAccountKeys, toPublicRegistration } from "@/lib/landing/registration/public-config";

export const dynamic = "force-dynamic";

const COUNTRY_RE = /^[A-Z]{2}$/;

/** Everything the registration widget needs, read once when the modal opens. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gate = await loadPublicPage(slug);
  if (!gate.ok) return gate.response;
  const { page } = gate;

  let accounts: PaymentAccount[];
  try {
    accounts = await listPaymentAccounts(regionAccountKeys(page.registration));
  } catch {
    return publicJson({ error: "We could not load the payment details. Please try again in a moment." }, 500);
  }

  // Set by the Vercel edge from the visitor IP; only a hint for the default region (the visitor can change it).
  const country = (req.headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  return publicJson({
    pageId: page.id,
    status: page.status,
    registration: toPublicRegistration(page.registration, new Date()),
    accounts,
    country: COUNTRY_RE.test(country) ? country : null,
  });
}
