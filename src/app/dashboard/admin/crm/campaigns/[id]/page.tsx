import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listCampaigns, getCampaignConversionDetail } from "@/lib/data/admin-crm-campaigns";
import { listContactIdsWithManualConversion } from "@/lib/data/admin-crm-manual-conversions";
import { CampaignDetailClient } from "@/components/admin/crm/CampaignDetailClient";

export const metadata = { title: "Campaign — PZ Academy CRM" };

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const [campaigns, conversionDetail] = await Promise.all([listCampaigns(), getCampaignConversionDetail(id)]);
  const campaign = campaigns.find((c) => c.id === id);
  if (!campaign) notFound();

  const contactIds = (conversionDetail?.recipients ?? []).map((r) => r.contactId);
  const manualConvertedContactIds = await listContactIdsWithManualConversion(contactIds);

  return <CampaignDetailClient campaign={campaign} conversionDetail={conversionDetail} manualConvertedContactIds={Array.from(manualConvertedContactIds)} />;
}
