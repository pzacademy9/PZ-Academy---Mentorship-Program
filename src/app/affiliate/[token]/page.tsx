// src/app/affiliate/[token]/page.tsx
// An affiliate's private page. The secret link is the only key: no login, no search listing, never cached.
import type { Metadata } from "next";
import { affiliatePageCallerAllowed } from "@/lib/pzid/caller-allowed";
import { getAffiliatePageModel } from "@/lib/data/affiliate-page";
import { affiliateSupportWa } from "@/lib/affiliates/contact";
import { AffiliatePage } from "@/components/affiliates/AffiliatePage";
import { AffiliateClosed } from "@/components/affiliates/AffiliateClosed";

export const metadata: Metadata = {
  title: "Your affiliate page · Pharmacozyme",
  robots: { index: false, follow: false },
};
// Reads request headers for the rate limit and a secret from the URL, so every visit runs on the server.
export const dynamic = "force-dynamic";

export default async function AffiliatePrivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Over the limit, a wrong token and a dropped affiliate all get the same answer. A read error is not hidden:
  // it is thrown, so a real affiliate sees an error and not a wrong "no longer active".
  const allowed = await affiliatePageCallerAllowed();
  const model = allowed ? await getAffiliatePageModel(token) : null;
  return (
    <main className="min-h-screen bg-landing-surface px-4 py-8 font-landing-body text-landing-on-surface md:px-6 md:py-12">
      {model ? <AffiliatePage model={model} /> : <AffiliateClosed supportWa={affiliateSupportWa()} />}
    </main>
  );
}
