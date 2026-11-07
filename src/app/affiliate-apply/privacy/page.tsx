// src/app/affiliate-apply/privacy/page.tsx
import type { Metadata } from "next";
import { getTermsOrEmpty } from "@/lib/data/site-terms";
import { PolicyDocument } from "@/components/affiliates/PolicyDocument";

export const metadata: Metadata = { title: "Privacy Policy", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const doc = await getTermsOrEmpty("affiliate_privacy");
  return <PolicyDocument title="Privacy Policy" text={doc.body} />;
}
