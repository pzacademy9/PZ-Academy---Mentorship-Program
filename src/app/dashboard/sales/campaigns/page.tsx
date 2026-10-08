import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { CampaignsList } from "@/components/sales/CampaignsList";

export const metadata = { title: "Campaigns — Sales Workspace" };

export default async function SalesCampaignsPage() {
  await requireSalesAgentPage();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-headline font-black text-pz-on-surface tracking-tight">Campaigns</h1>
        <p className="mt-1 text-sm text-pz-on-surface-variant">Message your own contacts, one person at a time.</p>
      </div>
      <CampaignsList />
    </div>
  );
}
