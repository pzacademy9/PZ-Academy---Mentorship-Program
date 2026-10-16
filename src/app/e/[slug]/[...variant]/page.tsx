// src/app/e/[slug]/[...variant]/page.tsx
// Country / module links: /e/<slug>/<region>, /e/<slug>/<module>, /e/<slug>/<region>/<module>.
// The static `status` sibling folder keeps winning over this catch-all.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedVariantPage } from "@/lib/data/landing-variants";
import { LandingRenderer } from "@/components/landing/LandingRenderer";
import type { PageKind } from "@/lib/landing/content";
import { variantPath } from "@/lib/landing/variants";

// Static + cached, exactly like /e/[slug]: this route must NOT read the cookie or header APIs.
export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ slug: string; variant: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, variant } = await params;
  const found = await getPublishedVariantPage(slug, variant);
  if (!found) return { title: "Page not found" };
  const { seo } = found.content;
  const title = seo.title || found.page.title;
  return {
    title,
    description: seo.description || undefined,
    openGraph: { title, description: seo.description || undefined, images: seo.ogImage ? [seo.ogImage] : undefined },
  };
}

export default async function LandingVariantPage({ params }: Params) {
  const { slug, variant } = await params;
  const found = await getPublishedVariantPage(slug, variant);
  if (!found) notFound();
  return (
    <LandingRenderer
      content={found.content}
      status={found.status}
      kind={found.page.kind as PageKind}
      pageTitle={found.page.title}
      slug={found.page.slug}
      variant={variantPath(found.ref)}
    />
  );
}
