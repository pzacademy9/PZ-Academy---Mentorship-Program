// src/app/affiliate-apply/rules/page.tsx
import type { Metadata } from "next";
import { getTermsOrEmpty } from "@/lib/data/site-terms";
import { PolicyDocument } from "@/components/affiliates/PolicyDocument";

export const metadata: Metadata = { title: "Affiliate Rules", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const doc = await getTermsOrEmpty("affiliate_rules");
  return <PolicyDocument title="Affiliate Rules" text={doc.body} />;
}
