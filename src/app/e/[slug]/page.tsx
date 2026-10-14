// src/app/e/[slug]/page.tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedLandingPage } from "@/lib/data/landing-pages";
import { LandingRenderer } from "@/components/landing/LandingRenderer";

// Static + cached: this route must NOT read the cookie or header APIs, or it becomes dynamic. The
// registration modal fetches the visitor's profile, country and prices client-side after it opens.
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getPublishedLandingPage(slug);
  if (!found) return { title: "Page not found" };
  const { seo } = found.content;
  const title = seo.title || found.page.title;
  return {
    title,
    description: seo.description || undefined,
    openGraph: { title, description: seo.description || undefined, images: seo.ogImage ? [seo.ogImage] : undefined },
  };
}

export default async function LandingPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getPublishedLandingPage(slug);
  if (!found) notFound();
  return <LandingRenderer content={found.content} status={found.page.status} kind={found.page.kind} pageTitle={found.page.title} slug={found.page.slug} />;
}
