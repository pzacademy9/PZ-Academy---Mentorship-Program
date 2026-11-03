// src/app/e/[slug]/terms/page.tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedLandingPage } from "@/lib/data/landing-pages";
import { getGeneralTermsOrEmpty } from "@/lib/data/site-terms";
import { resolveTerms } from "@/lib/landing/terms";
import { TermsDocument } from "@/components/landing/TermsDocument";

// Static + cached like the landing page itself: no cookie or header APIs here.
export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getPublishedLandingPage(slug);
  return { title: found ? `Terms and Conditions · ${found.page.title}` : "Page not found" };
}

export default async function LandingTermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getPublishedLandingPage(slug);
  if (!found) notFound();
  const terms = resolveTerms(found.content.settings.terms, await getGeneralTermsOrEmpty());
  if (!terms) notFound();
  return <TermsDocument title={found.page.title} text={terms.text} />;
}
