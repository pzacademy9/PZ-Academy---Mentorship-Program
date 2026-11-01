import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PortalHome, type PortalGroup } from "@/components/progress/portal/PortalHome";
import { listPortalBatches } from "@/lib/data/portal";
import type { ProgressKind } from "@/lib/progress/build";
import { findMyIdByName } from "./actions";

export const metadata: Metadata = {
  title: "Progress Portal | PZ Academy",
  description: "See attendance and quiz results for every PZ Academy batch.",
};

// Always fresh: batch counts change as classes are held.
export const dynamic = "force-dynamic";

const KINDS: ProgressKind[] = ["course", "workshop", "webinar"];

// Server-rendered: only counts and batch titles reach the HTML. No student data.
export default async function ProgressRoute() {
  let groups: PortalGroup[] = [];
  let failed = false;
  try {
    const cards = await listPortalBatches();
    groups = KINDS.map((kind) => ({ kind, batches: cards.filter((c) => c.kind === kind) }));
  } catch {
    failed = true;
  }
  return (
    <main className="min-h-screen overflow-x-hidden bg-pz-surface px-4 pb-10 pt-4 sm:pt-8">
      <div className="mx-auto mb-4 flex w-full min-w-0 max-w-6xl items-center justify-between gap-3">
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
          <span className="flex min-w-0 flex-col">
            <span className="font-headline text-sm font-bold leading-tight tracking-tight text-pz-on-surface">PZ ACADEMY</span>
            <span className="font-label text-sm leading-tight text-pz-secondary">Track your progress</span>
          </span>
        </Link>
      </div>
      <PortalHome groups={groups} findId={findMyIdByName} failed={failed} />
    </main>
  );
}
