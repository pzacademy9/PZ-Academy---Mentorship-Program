import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PortalHome, type PortalGroup } from "@/components/progress/portal/PortalHome";
import { listPortalBatches } from "@/lib/data/portal";
import type { ProgressKind } from "@/lib/progress/build";
import { checkMyProgress, findMyIdByName } from "./actions";

export const metadata: Metadata = {
  title: "Progress Portal | PZ Academy",
  description: "Check your attendance, quiz points and batch rank with your PZ ID, and see every PZ Academy batch leaderboard.",
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
    <>
      <MarketingNav />
      <main className="min-h-screen bg-pz-web-surface">
        <PortalHome groups={groups} findId={findMyIdByName} checkId={checkMyProgress} failed={failed} />
      </main>
      <MarketingFooter />
    </>
  );
}
