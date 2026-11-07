// src/app/affiliate-apply/terms/page.tsx
import type { Metadata } from "next";
import { getTermsOrEmpty } from "@/lib/data/site-terms";
import { PolicyDocument } from "@/components/affiliates/PolicyDocument";

export const metadata: Metadata = { title: "Affiliate Terms", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const doc = await getTermsOrEmpty("affiliate_terms");
  return <PolicyDocument title="Affiliate Terms" text={doc.body} />;
}
