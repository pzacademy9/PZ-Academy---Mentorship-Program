import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedLandingPage } from "@/lib/data/landing-pages";
import { normalizeContent } from "@/lib/landing/content";
import { StatusLookup } from "@/components/landing/registration/StatusLookup";

// Static + cached like /e/[slug]: this route must not read request cookies or headers. The lookup itself
// runs in the browser against GET /api/landing/[slug]/status, so nothing personal is ever cached.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Check your registration",
  robots: { index: false, follow: false },
};

export default async function RegistrationStatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getPublishedLandingPage(slug);
  if (!found) notFound();
  // No `enabled` check: like the status API, lookups keep working after the form is switched off.
  const reg = normalizeContent(found.content).registration;
  const name = reg.eventLabel || found.page.title;
  return (
    <main className="min-h-screen bg-landing-surface font-landing-body text-landing-on-surface" style={{ colorScheme: "light" }}>
      <div className="mx-auto max-w-xl px-4 py-8 md:py-12">
        <a href={`/e/${found.page.slug}`} className="inline-flex min-h-11 items-center gap-1 text-base font-semibold text-landing-primary underline-offset-2 hover:underline">
          <span aria-hidden="true">←</span> {`Back to ${name}`}
        </a>
        <h1 className="mt-4 font-headline text-3xl font-black text-landing-deep">Check your registration</h1>
        <p className="mt-2 text-base">{`Enter the reference number from your confirmation and the email you used to register for ${name}.`}</p>
        <div className="mt-6">
          <StatusLookup slug={found.page.slug} whatsappNumber={reg.whatsappVerifyNumber} />
        </div>
      </div>
    </main>
  );
}
