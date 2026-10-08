import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSalesAgentPage } from "@/lib/auth/require-sales";
import { CampaignWizard } from "@/components/sales/CampaignWizard";

export const metadata = { title: "New campaign — Sales Workspace" };

export default async function NewSalesCampaignPage() {
  await requireSalesAgentPage();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/sales/campaigns"
          className="inline-flex items-center gap-1.5 self-start max-md:min-h-11 text-sm font-headline font-bold text-pz-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Campaigns
        </Link>
        <h1 className="text-2xl lg:text-3xl font-headline font-black text-pz-on-surface tracking-tight">New campaign</h1>
      </div>
      <CampaignWizard />
    </div>
  );
}
