import { notFound } from "next/navigation";
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { getMyCampaign } from "@/lib/data/sales-campaigns";
import { CampaignSession } from "@/components/sales/CampaignSession";

export const metadata = { title: "Campaign — Sales Workspace" };

export default async function SalesCampaignSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, role } = await requireSalesAgentPage();
  const { id } = await params;
  // Another agent's campaign comes back as not-found, so it 404s like a missing one.
  const res = await getMyCampaign({ id: user.id, role }, id);
  if (!res.ok) notFound();
  return <CampaignSession initial={res.campaign} />;
}
