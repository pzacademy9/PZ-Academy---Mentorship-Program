import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchPortal } from "@/components/progress/portal/BatchPortal";
import { getPortalBatch } from "@/lib/data/portal";
import { callerAllowed } from "@/lib/pzid/caller-allowed";
import type { PortalBatchView } from "@/lib/progress/portal-build";

// Reads request headers for the rate limit, so every visit runs on the server.
export const dynamic = "force-dynamic";

const GENERIC_ERROR = "We could not load this batch right now. Please try again in a minute.";
const RATE_LIMITED = "Too many requests, try again in a few minutes.";

type LoadResult = { status: "ok"; view: PortalBatchView } | { status: "limited" } | { status: "error" } | { status: "missing" };

// cache(): the metadata step and the page share one lookup per request (one rate-limit hit, one read).
const load = cache(async (slug: string): Promise<LoadResult> => {
  try {
    if (!(await callerAllowed())) return { status: "limited" };
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
    <main className="min-h-screen overflow-x-hidden bg-pz-surface px-4 pb-10 pt-4 sm:pt-8">
      <div className="mx-auto mb-4 flex w-full min-w-0 max-w-3xl items-center justify-between gap-3">
        <Link
          href="/"
          className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary"
        >
          <Image
            src="https://pharmacozyme.com/wp-content/uploads/2026/04/PZ-Academy-logo.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 object-contain"
            priority
            unoptimized
          />
          <span className="font-headline text-sm font-bold leading-tight tracking-tight text-pz-on-surface">PZ ACADEMY</span>
        </Link>
      </div>
      {result.status === "ok" ? (
        <BatchPortal view={result.view} />
      ) : (
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4">
          <h1 className="font-headline text-2xl font-black text-pz-on-surface">Batch progress</h1>
          <p role="alert" className="rounded-xl bg-pz-error-container p-4 text-base text-pz-on-error-container">
            {result.status === "limited" ? RATE_LIMITED : GENERIC_ERROR}
          </p>
          <Link href="/progress" className="flex min-h-11 w-fit items-center font-headline text-base font-bold text-pz-primary">
            Back to all batches
          </Link>
        </div>
      )}
    </main>
  );
}
