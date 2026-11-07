// src/app/affiliate-apply/page.tsx
import type { Metadata } from "next";
import { getAffiliatePolicies } from "@/lib/data/site-terms";
import { ApplyForm } from "@/components/affiliates/ApplyForm";

// Hidden page: not in the menu or the sitemap, and search engines are told to skip it.
export const metadata: Metadata = {
  title: "Affiliate Programme · Pharmacozyme",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AffiliateApplyPage() {
  let open = false;
  try {
    open = (await getAffiliatePolicies()).ready;
  } catch {
    open = false;
  }
  return (
    <main className="min-h-screen bg-landing-surface px-4 py-10 font-landing-body text-landing-on-surface md:px-6 md:py-16">
      <div className="mx-auto max-w-3xl">
        <p className="mb-6 font-headline text-lg font-extrabold text-landing-deep">Pharmacozyme</p>
        {open ? (
          <ApplyForm />
        ) : (
          <div className="rounded-2xl border border-landing-border bg-white p-8 text-center">
            <h1 className="font-headline text-2xl font-extrabold text-landing-deep">Applications are not open yet</h1>
            <p className="mt-3 text-base">Please check back soon.</p>
          </div>
        )}
      </div>
    </main>
  );
}
