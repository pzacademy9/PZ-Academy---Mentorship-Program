import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { getAgentLinkStats, listPublishedLinkPages } from "@/lib/data/landing-agent-stats";
import { getOrCreateAgentLink } from "@/lib/data/landing-agent-links";
import { MyLinks, type MyLinkRow } from "@/components/sales/MyLinks";

export const metadata = { title: "My Links — Sales Workspace" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MyLinksPage() {
  // The agent is always the signed-in user; nothing from the URL decides whose numbers these are.
  const { user } = await requireSalesAgentPage();
  const [{ code }, pages, stats] = await Promise.all([
    getOrCreateAgentLink(user.id),
    listPublishedLinkPages(),
    getAgentLinkStats(user.id),
  ]);

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://pharmacozyme.com").replace(/\/+$/, "");
  const byPage = new Map(stats.map((s) => [s.pageId, s]));
  const rows: MyLinkRow[] = pages.map((p) => {
    const s = byPage.get(p.id);
    return {
      id: p.id,
      title: p.title,
      link: `${base}/e/${p.slug}?ref=${code}`,
      views: s?.views ?? 0,
      registered: s?.registered ?? 0,
      paid: s?.paid ?? 0,
    };
  });

  return <MyLinks code={code} rows={rows} />;
}
