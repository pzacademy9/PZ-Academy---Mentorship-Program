import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { getAgentLinkStats, listPublishedLinkPages } from "@/lib/data/landing-agent-stats";
import { AgentLinkError, getOrCreateAgentLink } from "@/lib/data/landing-agent-links";
import { MyLinks, type MyLinkRow } from "@/components/sales/MyLinks";

export const metadata = { title: "My Links — Sales Workspace" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MyLinksPage() {
  // The agent is always the signed-in user; nothing from the URL decides whose numbers these are.
  const { user } = await requireSalesAgentPage();
  let code: string;
  try {
    ({ code } = await getOrCreateAgentLink(user.id));
  } catch (e) {
    if (e instanceof AgentLinkError && e.reason === "not-sales-agent") {
      return (
        <div className="space-y-2">
          <h1 className="font-headline text-2xl font-bold text-pz-secondary">My links</h1>
          <p className="font-body text-sm text-pz-on-surface-variant">Only sales agents have personal links.</p>
        </div>
      );
    }
    throw e;
  }
  const [pages, stats] = await Promise.all([listPublishedLinkPages(), getAgentLinkStats(user.id)]);

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
