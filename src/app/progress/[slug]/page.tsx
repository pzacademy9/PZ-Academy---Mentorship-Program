import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { BatchPortal } from "@/components/progress/portal/BatchPortal";
import { getPortalBatch } from "@/lib/data/portal";
import { portalCallerAllowed } from "@/lib/pzid/caller-allowed";
import type { PortalBatchView } from "@/lib/progress/portal-build";

// Reads request headers for the rate limit, so every visit runs on the server.
export const dynamic = "force-dynamic";

const GENERIC_ERROR = "We could not load this batch right now. Please try again in a minute.";
const RATE_LIMITED = "Too many requests, try again in a few minutes.";

type LoadResult = { status: "ok"; view: PortalBatchView } | { status: "limited" } | { status: "error" } | { status: "missing" };

// cache(): the metadata step and the page share one lookup per request (one rate-limit hit, one read).
const load = cache(async (slug: string): Promise<LoadResult> => {
  try {
    if (!(await portalCallerAllowed())) return { status: "limited" };
    const view = await getPortalBatch(slug);
    return view ? { status: "ok", view } : { status: "missing" };
  } catch {
    // Thrown text stays on the server.
    return { status: "error" };
  }
});

// Batch title only: no student data. Shares the page's single cached lookup, so a limited caller gets the generic title.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await load(slug);
  const title = result.status === "ok" ? `${result.view.title} | PZ Academy` : "Batch progress | PZ Academy";
  return { title, description: "Attendance and quiz results for this PZ Academy batch." };
}

export default async function BatchRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await load(slug);
  if (result.status === "missing") notFound();

  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-pz-web-surface pb-16">
        {result.status === "ok" ? (
          <BatchPortal view={result.view} />
        ) : (
          <>
            <div className="bg-pz-solid-deep px-5 pb-10 pt-[7.5rem] md:pt-[8.5rem]">
              <h1 className="mx-auto max-w-3xl font-montserrat text-[28px] font-extrabold tracking-[-0.02em] text-white md:text-[40px]">Batch progress</h1>
            </div>
            <div className="mx-auto -mt-5 flex w-full min-w-0 max-w-3xl flex-col gap-4 px-5">
              <p role="alert" className="rounded-[20px] bg-pz-surface-container-lowest p-5 font-poppins text-base text-pz-on-surface shadow-[0_8px_30px_rgba(15,61,34,0.08)]">
                {result.status === "limited" ? RATE_LIMITED : GENERIC_ERROR}
              </p>
              <Link
                href="/progress"
                className="inline-flex min-h-12 w-fit items-center rounded-full bg-pz-solid-deep px-6 font-montserrat text-[15px] font-bold text-white hover:bg-pz-solid-forest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-solid-mid"
              >
                Back to all batches
              </Link>
            </div>
          </>
        )}
      </main>
      <MarketingFooter />
    </>
  );
}
