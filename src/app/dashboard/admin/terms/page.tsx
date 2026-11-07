import { requireAdminPage } from "@/lib/auth/require-admin";
import { getTerms } from "@/lib/data/site-terms";
import { TermsTabs } from "@/components/admin/terms/TermsTabs";

export const metadata = { title: "Terms and Conditions — PZ Academy" };
export const dynamic = "force-dynamic";

export default async function AdminTermsPage() {
  await requireAdminPage("terms");
  const [general, affiliateTerms, affiliateRules, affiliatePrivacy] = await Promise.all([
    getTerms("general"),
    getTerms("affiliate_terms"),
    getTerms("affiliate_rules"),
    getTerms("affiliate_privacy"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Terms and Conditions</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          The general Terms for your landing pages, and the three affiliate documents. Each landing page can also have its own Terms in its Page settings.
        </p>
      </div>
      <TermsTabs
        initial={{ general: general.body, affiliate_terms: affiliateTerms.body, affiliate_rules: affiliateRules.body, affiliate_privacy: affiliatePrivacy.body }}
      />
    </div>
  );
}
