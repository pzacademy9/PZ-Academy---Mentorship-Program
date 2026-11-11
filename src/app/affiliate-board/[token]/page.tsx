// src/app/affiliate-board/[token]/page.tsx
// The public affiliate leaderboard. The secret link is the only key: no login, no search listing, never cached.
import type { Metadata } from "next";
import { affiliatePageCallerAllowed } from "@/lib/pzid/caller-allowed";
import { getAffiliateBoard, isBoardToken } from "@/lib/data/affiliate-leaderboard";
import { toBoardView } from "@/lib/affiliates/board-view";
import { affiliateSupportWa } from "@/lib/affiliates/contact";
import { AffiliateBoard } from "@/components/affiliates/AffiliateBoard";
import { AffiliateClosed } from "@/components/affiliates/AffiliateClosed";

export const metadata: Metadata = {
  title: "Affiliate leaderboard · Pharmacozyme",
  robots: { index: false, follow: false },
};
// Reads request headers for the rate limit and a secret from the URL, so every visit runs on the server.
export const dynamic = "force-dynamic";

export default async function AffiliateBoardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Over the limit, a wrong token and a rotated token all get the same answer. A read error is thrown, not hidden.
  const allowed = await affiliatePageCallerAllowed();
  const ok = allowed && (await isBoardToken(token));
  const boards = ok ? await Promise.all([getAffiliateBoard("all"), getAffiliateBoard("month")]) : null;
  return (
    <main className="min-h-screen bg-landing-surface px-4 py-8 font-landing-body text-landing-on-surface md:px-6 md:py-12">
      {boards ? (
        <AffiliateBoard boards={{ all: toBoardView(boards[0]), month: toBoardView(boards[1]) }} />
      ) : (
        <AffiliateClosed supportWa={affiliateSupportWa()} />
      )}
    </main>
  );
}
