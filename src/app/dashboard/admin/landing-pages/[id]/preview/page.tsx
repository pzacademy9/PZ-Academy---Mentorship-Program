import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getLandingPage } from "@/lib/data/landing-pages";
import { listVariants } from "@/lib/data/landing-variants";
import { resolveVariant } from "@/lib/landing/resolve-variant";
import { emptyOverrides, parseVariantPath } from "@/lib/landing/variants";
import { isPageId } from "@/lib/validations/landing";
import { PreviewTarget } from "@/components/admin/landing/PreviewTarget";

// Same body face as the public /e/* pages (see src/app/e/layout.tsx) so the preview matches.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = { title: "Page preview — PZ Academy", robots: { index: false, follow: false } };

export default async function LandingPreviewPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams?: Promise<{ v?: string | string[] }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!isPageId(id)) notFound();
  const page = await getLandingPage(id);
  if (!page) notFound();
  // ?v=uae/module-2: that link's DRAFT, i.e. main's draft with the link's draft edits applied.
  const { v } = (await searchParams) ?? {};
  const ref = typeof v === "string" && v !== "" ? parseVariantPath(v.split("/"), page.draft) : null;
  if (typeof v === "string" && v !== "" && !ref) notFound();
  let content = page.draft;
  if (ref) {
    const variant = (await listVariants(id)).find((x) => x.ref.regionKey === ref.regionKey && x.ref.moduleKey === ref.moduleKey);
    content = resolveVariant(page.draft, ref, variant?.draft ?? emptyOverrides());
  }
  return (
    // The dashboard layout wraps every admin route in its sidebar and top bar; this full-window layer
    // sits over them so the editor's preview frame shows only the landing page.
    <div className={`${inter.variable} fixed inset-0 z-[100] overflow-y-auto bg-landing-surface`}>
      <PreviewTarget initialContent={content} status={page.status} kind={page.kind} title={page.title} />
    </div>
  );
}
