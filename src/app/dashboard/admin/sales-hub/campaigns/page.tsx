import { requireAdminPage } from "@/lib/auth/require-admin";
import { listCampaigns } from "@/lib/data/admin-crm-campaigns";
import { CampaignsPanel } from "@/components/admin/crm/CampaignsPanel";

export const metadata = { title: "Campaigns — Sales Hub — PZ Academy" };

export default async function SalesHubCampaignsPage() {
  await requireAdminPage();
  const campaigns = await listCampaigns();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Campaigns</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Email campaigns to your contacts.</p>
      </div>
      <CampaignsPanel initialCampaigns={campaigns} />
    </div>
  );
}
